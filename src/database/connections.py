"""Database connection utilities for Neo4j and PostgreSQL."""

import os
import subprocess
import socket
import time
import logging
from typing import Optional, List, Tuple
from functools import lru_cache
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from neo4j import GraphDatabase, Driver
from neo4j.exceptions import ServiceUnavailable
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


class ConnectionCache:
    """Cache for working connection endpoints to avoid repeated detection."""

    _neo4j_uri: Optional[str] = None
    _postgres_host: Optional[str] = None
    _initialized: bool = False

    @classmethod
    def get_neo4j_uri(cls) -> Optional[str]:
        return cls._neo4j_uri

    @classmethod
    def set_neo4j_uri(cls, uri: str):
        cls._neo4j_uri = uri
        logger.info(f"Cached working Neo4j URI: {uri}")

    @classmethod
    def get_postgres_host(cls) -> Optional[str]:
        return cls._postgres_host

    @classmethod
    def set_postgres_host(cls, host: str):
        cls._postgres_host = host
        logger.info(f"Cached working PostgreSQL host: {host}")

    @classmethod
    def clear(cls):
        cls._neo4j_uri = None
        cls._postgres_host = None


def _get_wsl_ip_from_windows() -> Optional[str]:
    """
    Get WSL2 IP from Windows side using wsl command.
    This is the most reliable method when running on Windows with Docker in WSL.
    """
    try:
        result = subprocess.run(
            ["wsl", "hostname", "-I"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Get first IP (usually the main WSL eth0 IP)
            ips = result.stdout.strip().split()
            if ips:
                return ips[0]
        return None
    except Exception as e:
        logger.debug(f"Failed to get WSL IP from Windows: {e}")
        return None


def _get_wsl_ip_from_route() -> Optional[str]:
    """
    Get the WSL2 virtual IP address from inside WSL.
    Returns None if not running in WSL or if detection fails.
    """
    try:
        # Check if we're in WSL
        wsl_distro = os.environ.get("WSL_DISTRO_NAME")
        if not wsl_distro:
            # Check via /proc/version for WSL indicator
            with open("/proc/version", "r") as f:
                if "microsoft" not in f.read().lower():
                    return None

        # Get WSL IP by querying the gateway
        result = subprocess.run(
            ["ip", "route", "show", "default"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Parse the gateway IP from the default route
            lines = result.stdout.strip().split("\n")
            for line in lines:
                if "default via" in line:
                    parts = line.split()
                    gateway_idx = parts.index("via") + 1
                    if gateway_idx < len(parts):
                        return parts[gateway_idx]
        return None
    except Exception as e:
        logger.debug(f"Failed to get WSL IP from route: {e}")
        return None


def _get_docker_desktop_ip() -> Optional[str]:
    """
    Get Docker Desktop's internal IP if using Docker Desktop.
    This is often 192.168.x.x or accessible via host.docker.internal.
    """
    try:
        # Try to resolve host.docker.internal from Windows
        result = subprocess.run(
            ["nslookup", "host.docker.internal"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Parse the IP from nslookup output
            for line in result.stdout.split("\n"):
                if "Address:" in line and "host.docker.internal" not in line:
                    ip = line.split(":")[-1].strip()
                    if ip and ip != "::1":
                        return ip
        return None
    except Exception as e:
        logger.debug(f"Failed to get Docker Desktop IP: {e}")
        return None


def _test_tcp_connection(host: str, port: int, timeout: float = 2.0) -> bool:
    """Test if a TCP connection can be established."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _test_neo4j_connection(uri: str, user: str, password: str, timeout: float = 5.0) -> bool:
    """Test if Neo4j connection works."""
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password), connection_timeout=timeout)
        with driver.session() as session:
            session.run("RETURN 1")
        driver.close()
        return True
    except Exception as e:
        logger.debug(f"Neo4j connection test failed for {uri}: {e}")
        return False


def _test_postgres_connection(host: str, port: int, database: str, user: str, password: str, timeout: float = 3.0) -> bool:
    """Test if PostgreSQL connection works."""
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            connect_timeout=int(timeout)
        )
        conn.close()
        return True
    except Exception as e:
        logger.debug(f"PostgreSQL connection test failed for {host}:{port}: {e}")
        return False




def _build_neo4j_uri(host: str, port: int, scheme: str = "bolt") -> str:
    return f"{scheme}://{host}:{port}"


def get_neo4j_connection_endpoints(port: int = 7688) -> List[Tuple[str, str]]:
    """
    Get a list of potential Neo4j connection endpoints to try.
    Returns list of (name, uri) tuples ordered by likelihood of success.
    """
    endpoints = []

    # 1. Check for explicit override (highest priority)
    explicit_uri = os.getenv("NEO4J_URI")
    if explicit_uri:
        endpoints.append(("env_override", explicit_uri))

    # 2. Try localhost first (fastest when WSL port forwarding works)
    endpoints.append(("localhost", _build_neo4j_uri("localhost", port)))

    # 3. Try 127.0.0.1 explicitly
    endpoints.append(("loopback", _build_neo4j_uri("127.0.0.1", port)))

    # 4. Try WSL IP from Windows side
    wsl_ip = _get_wsl_ip_from_windows()
    if wsl_ip:
        endpoints.append(("wsl_windows", _build_neo4j_uri(wsl_ip, port)))

    # 5. Try WSL IP from route detection
    wsl_route_ip = _get_wsl_ip_from_route()
    if wsl_route_ip and wsl_route_ip != wsl_ip:
        endpoints.append(("wsl_route", _build_neo4j_uri(wsl_route_ip, port)))

    # 6. Try Docker Desktop internal IP
    docker_ip = _get_docker_desktop_ip()
    if docker_ip:
        endpoints.append(("docker_desktop", _build_neo4j_uri(docker_ip, port)))

    # 7. Try host.docker.internal
    endpoints.append(("docker_internal", _build_neo4j_uri("host.docker.internal", port)))

    return endpoints


def get_postgres_connection_endpoints(port: int = 5433) -> List[Tuple[str, str]]:
    """
    Get a list of potential PostgreSQL connection endpoints to try.
    Returns list of (name, host) tuples ordered by likelihood of success.
    """
    endpoints = []

    # 1. Check for explicit override
    explicit_host = os.getenv("POSTGRES_HOST")
    if explicit_host and explicit_host != "localhost":
        endpoints.append(("env_override", explicit_host))

    # 2. Try localhost first
    endpoints.append(("localhost", "localhost"))

    # 3. Try 127.0.0.1 explicitly
    endpoints.append(("loopback", "127.0.0.1"))

    # 4. Try WSL IP from Windows side
    wsl_ip = _get_wsl_ip_from_windows()
    if wsl_ip:
        endpoints.append(("wsl_windows", wsl_ip))

    # 5. Try WSL IP from route detection
    wsl_route_ip = _get_wsl_ip_from_route()
    if wsl_route_ip and wsl_route_ip != wsl_ip:
        endpoints.append(("wsl_route", wsl_route_ip))

    # 6. Try Docker Desktop internal IP
    docker_ip = _get_docker_desktop_ip()
    if docker_ip:
        endpoints.append(("docker_desktop", docker_ip))

    return endpoints


def find_working_neo4j_uri(user: str, password: str, port: int = 7688, max_retries: int = 2) -> str:
    """
    Find a working Neo4j URI by testing multiple endpoints.
    Caches the result for subsequent calls.
    """
    # Check cache first
    cached = ConnectionCache.get_neo4j_uri()
    if cached:
        # Verify cached connection still works
        if _test_neo4j_connection(cached, user, password, timeout=2.0):
            return cached
        else:
            logger.warning("Cached Neo4j connection no longer works, re-detecting...")
            ConnectionCache.clear()

    endpoints = get_neo4j_connection_endpoints(port)

    for attempt in range(max_retries):
        for name, uri in endpoints:
            logger.debug(f"Trying Neo4j connection: {name} ({uri})")
            if _test_neo4j_connection(uri, user, password):
                ConnectionCache.set_neo4j_uri(uri)
                logger.info(f"Found working Neo4j connection: {name} ({uri})")
                return uri

        if attempt < max_retries - 1:
            logger.warning(f"Neo4j connection attempt {attempt + 1} failed, retrying in 1s...")
            time.sleep(1)

    # If nothing works, return localhost as default (will fail with proper error)
    logger.error("Could not find working Neo4j connection, returning default")
    return _build_neo4j_uri("localhost", port)


def find_working_postgres_host(port: int = 5433, database: str = "learnfast",
                                user: str = "learnfast", password: str = "password",
                                max_retries: int = 2) -> str:
    """
    Find a working PostgreSQL host by testing multiple endpoints.
    Caches the result for subsequent calls.
    """
    # Check cache first
    cached = ConnectionCache.get_postgres_host()
    if cached:
        if _test_postgres_connection(cached, port, database, user, password, timeout=2.0):
            return cached
        else:
            logger.warning("Cached PostgreSQL connection no longer works, re-detecting...")
            ConnectionCache.clear()

    endpoints = get_postgres_connection_endpoints(port)

    for attempt in range(max_retries):
        for name, host in endpoints:
            logger.debug(f"Trying PostgreSQL connection: {name} ({host}:{port})")
            if _test_postgres_connection(host, port, database, user, password):
                ConnectionCache.set_postgres_host(host)
                logger.info(f"Found working PostgreSQL connection: {name} ({host}:{port})")
                return host

        if attempt < max_retries - 1:
            logger.warning(f"PostgreSQL connection attempt {attempt + 1} failed, retrying in 1s...")
            time.sleep(1)

    logger.error("Could not find working PostgreSQL connection, returning default")
    return "localhost"


class Neo4jConnection:
    """Neo4j database connection manager with auto-detection."""

    def __init__(self, uri: Optional[str] = None, user: Optional[str] = None, password: Optional[str] = None):
        self._explicit_uri = uri
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD", "password")
        self._port = int(os.getenv("NEO4J_PORT", "7688"))
        self._driver: Optional[Driver] = None
        self._verified_uri: Optional[str] = None

    def _get_uri(self) -> str:
        """Get the working URI, using explicit, cached, env var, or auto-detected."""
        if self._explicit_uri:
            return self._explicit_uri

        # Check environment variable (if set and not empty)
        env_uri = os.getenv("NEO4J_URI")
        if env_uri:
            return env_uri

        if self._verified_uri:
            return self._verified_uri

        # Use auto-detection
        uri = find_working_neo4j_uri(self.user, self.password, self._port)
        self._verified_uri = uri
        return uri

    def connect(self, verify: bool = False) -> Driver:
        """Establish connection to Neo4j database."""
        if self._driver is None or verify:
            uri = self._get_uri()
            try:
                self._driver = GraphDatabase.driver(uri, auth=(self.user, self.password))
                # Verify connection works
                with self._driver.session() as session:
                    session.run("RETURN 1")
            except ServiceUnavailable as e:
                # If connection fails, clear cache and try auto-detection again
                logger.warning(f"Neo4j connection failed with {uri}, re-detecting...")
                ConnectionCache.clear()
                self._verified_uri = None
                uri = find_working_neo4j_uri(self.user, self.password, self._port)
                self._driver = GraphDatabase.driver(uri, auth=(self.user, self.password))

        return self._driver

    def close(self):
        """Close the Neo4j connection."""
        if self._driver:
            self._driver.close()
            self._driver = None

    def execute_query(self, query: str, parameters: Optional[dict] = None):
        """Execute a Cypher query and return results."""
        driver = self.connect()
        with driver.session() as session:
            result = session.run(query, parameters or {})
            return [record for record in result]

    def execute_write_query(self, query: str, parameters: Optional[dict] = None):
        """Execute a write Cypher query."""
        driver = self.connect()
        with driver.session() as session:
            return session.run(query, parameters or {})


class PostgreSQLConnection:
    """PostgreSQL database connection manager with connection pooling and auto-detection."""

    _pool: Optional[SimpleConnectionPool] = None
    _current_host: Optional[str] = None

    def __init__(self, host: Optional[str] = None, port: Optional[int] = None,
                 database: Optional[str] = None, user: Optional[str] = None,
                 password: Optional[str] = None):
        self._explicit_host = host
        self.port = port or int(os.getenv("POSTGRES_PORT", "5433"))
        self.database = database or os.getenv("POSTGRES_DB", "learnfast")
        self.user = user or os.getenv("POSTGRES_USER", "learnfast")
        self.password = password or os.getenv("POSTGRES_PASSWORD", "password")
        self._connection = None
        self._verified_host: Optional[str] = None

    def _get_host(self) -> str:
        """Get the working host, using explicit, cached, env var, or auto-detected."""
        if self._explicit_host:
            return self._explicit_host

        # Check environment variable (if set and not empty)
        env_host = os.getenv("POSTGRES_HOST")
        if env_host:
            return env_host

        if self._verified_host:
            return self._verified_host
        if ConnectionCache.get_postgres_host():
            return ConnectionCache.get_postgres_host()

        # Use auto-detection
        host = find_working_postgres_host(
            self.port, self.database, self.user, self.password
        )
        self._verified_host = host
        return host

    def _get_pool(self) -> SimpleConnectionPool:
        """Get or create a connection pool with the working host."""
        host = self._get_host()

        # If host changed or pool doesn't exist, create new pool
        if PostgreSQLConnection._pool is None or PostgreSQLConnection._current_host != host:
            if PostgreSQLConnection._pool:
                try:
                    PostgreSQLConnection._pool.closeall()
                except Exception:
                    pass

            PostgreSQLConnection._current_host = host
            PostgreSQLConnection._pool = SimpleConnectionPool(
                minconn=2,
                maxconn=20,
                host=host,
                port=self.port,
                database=self.database,
                user=self.user,
                password=self.password
            )

        return PostgreSQLConnection._pool

    def connect(self):
        """Get a connection from the pool."""
        try:
            pool = self._get_pool()
            return pool.getconn()
        except psycopg2.OperationalError as e:
            # If connection fails, clear cache and retry
            logger.warning(f"PostgreSQL connection failed, re-detecting host...")
            ConnectionCache.clear()
            self._verified_host = None
            PostgreSQLConnection._current_host = None
            if PostgreSQLConnection._pool:
                try:
                    PostgreSQLConnection._pool.closeall()
                except Exception:
                    pass
                PostgreSQLConnection._pool = None
            # Retry with new detection
            pool = self._get_pool()
            return pool.getconn()

    def close(self, conn):
        """Return a connection to the pool."""
        if PostgreSQLConnection._pool:
            PostgreSQLConnection._pool.putconn(conn)

    def close_all(self):
        """Close all pooled connections."""
        if PostgreSQLConnection._pool:
            PostgreSQLConnection._pool.closeall()
            PostgreSQLConnection._pool = None
            PostgreSQLConnection._current_host = None

    def execute_query(self, query: str, parameters: Optional[dict] = None):
        """Execute a query and return results. Auto-commits for INSERT/UPDATE/DELETE."""
        conn = self.connect()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, parameters or {})
                # Check if the query returns rows (SELECT) or not (UPDATE/INSERT/DELETE)
                try:
                    result = cursor.fetchall()
                    # Auto-commit for non-SELECT queries
                    if query.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')):
                        conn.commit()
                    return result
                except psycopg2.ProgrammingError:
                    # No results to fetch (e.g., UPDATE/DELETE without RETURNING)
                    # Still commit for these queries
                    if query.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')):
                        conn.commit()
                    return []
        finally:
            self.close(conn)

    def execute_write(self, query: str, parameters: Optional[dict] = None):
        """Execute a write query."""
        conn = self.connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, parameters or {})
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self.close(conn)


# Module-level instances for convenience
postgres_conn = PostgreSQLConnection()
neo4j_conn = Neo4jConnection()
