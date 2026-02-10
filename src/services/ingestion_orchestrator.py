import asyncio
from typing import Awaitable, Optional

from src.config import settings
from src.utils.logger import logger


_local_extraction_semaphore = asyncio.Semaphore(max(1, int(getattr(settings, "local_extraction_concurrency", 2))))
_local_ingestion_semaphore = asyncio.Semaphore(max(1, int(getattr(settings, "local_ingestion_concurrency", 1))))


async def _run_with_semaphore(semaphore: asyncio.Semaphore, label: str, coro: Awaitable[None]) -> None:
    async with semaphore:
        try:
            await coro
        except Exception as exc:
            logger.error(f"{label} task failed: {exc}")
            raise


def _schedule_with_loop(semaphore: asyncio.Semaphore, label: str, coro: Awaitable[None]):
    """Run coroutine on an active loop, or fall back to a new loop in worker threads."""
    try:
        loop = asyncio.get_running_loop()
        return loop.create_task(_run_with_semaphore(semaphore, label, coro))
    except RuntimeError:
        # No running loop (e.g., Starlette BackgroundTask thread)
        logger.warning(f"{label} scheduled without running loop; executing in a new event loop.")
        asyncio.run(_run_with_semaphore(semaphore, label, coro))
        return None


def schedule_extraction(coro: Awaitable[None]):
    """Schedule extraction with local concurrency guard."""
    return _schedule_with_loop(_local_extraction_semaphore, "Extraction", coro)


def schedule_ingestion(coro: Awaitable[None]):
    """Schedule ingestion with local concurrency guard."""
    return _schedule_with_loop(_local_ingestion_semaphore, "Ingestion", coro)
