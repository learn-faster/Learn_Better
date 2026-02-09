import logging
from typing import Optional

from redis import Redis
from rq import Queue, Retry, Worker

from src.config import settings

logger = logging.getLogger(__name__)


def get_redis() -> Optional[Redis]:
    if not settings.redis_url:
        return None
    try:
        redis = Redis.from_url(settings.redis_url)
        # Ensure the connection is live to avoid enqueueing into a dead queue.
        redis.ping()
        return redis
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        return None


def get_queue() -> Optional[Queue]:
    if not settings.rq_enabled:
        return None
    redis = get_redis()
    if not redis:
        return None
    return Queue(
        settings.redis_queue_name,
        connection=redis,
        default_timeout=settings.redis_job_timeout
    )

def _get_worker_count(redis: Redis) -> int:
    try:
        workers = Worker.all(connection=redis)
        if not workers:
            return 0
        queue_name = settings.redis_queue_name
        count = 0
        for worker in workers:
            try:
                if any(q.name == queue_name for q in worker.queues):
                    count += 1
            except Exception:
                continue
        return count
    except Exception as e:
        logger.error(f"Failed to inspect RQ workers: {e}")
        return 0

def get_queue_health() -> dict:
    if not settings.rq_enabled:
        return {"status": "disabled", "workers": 0}
    redis = get_redis()
    if not redis:
        return {"status": "disconnected", "workers": 0}
    worker_count = _get_worker_count(redis)
    if worker_count <= 0:
        return {"status": "no_workers", "workers": 0}
    return {"status": "connected", "workers": worker_count}


def enqueue_extraction(doc_id: int, file_path: str, file_type_value: str) -> Optional[str]:
    queue = get_queue()
    if not queue:
        return None
    worker_count = _get_worker_count(queue.connection)
    if worker_count <= 0:
        logger.warning("RQ workers not detected; running extraction locally.")
        return None
    job = queue.enqueue(
        "src.tasks.ingestion_tasks.run_extraction_task",
        doc_id,
        file_path,
        file_type_value,
        retry=Retry(max=3, interval=[10, 30, 60])
    )
    logger.info(f"Enqueued extraction job {job.id} for doc {doc_id}")
    return job.id


def enqueue_ingestion(doc_id: int, file_path: str, user_id: str = "default_user") -> Optional[str]:
    queue = get_queue()
    if not queue:
        return None
    worker_count = _get_worker_count(queue.connection)
    if worker_count <= 0:
        logger.warning("RQ workers not detected; running ingestion locally.")
        return None
    job = queue.enqueue(
        "src.tasks.ingestion_tasks.run_ingestion_task",
        doc_id,
        file_path,
        user_id,
        retry=Retry(max=3, interval=[30, 120, 300])
    )
    logger.info(f"Enqueued ingestion job {job.id} for doc {doc_id}")
    return job.id
