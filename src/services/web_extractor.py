"""
Web link extraction using trafilatura (readability-style).
"""
from __future__ import annotations

import logging
from typing import Dict, Optional
from urllib.parse import urlparse

import trafilatura

from src.config import settings

logger = logging.getLogger(__name__)


def extract_web_content(url: str) -> Optional[Dict[str, str]]:
    if not url:
        return None

    try:
        downloaded = trafilatura.fetch_url(url, timeout=settings.web_extraction_timeout)
        if not downloaded:
            logger.warning(f"Failed to fetch URL content: {url}")
            return None

        text = trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=True,
            include_formatting=True,
            output_format="markdown"
        )
        if not text or not text.strip():
            text = trafilatura.extract(downloaded, output_format="txt")

        title = trafilatura.extract_metadata(downloaded).title if downloaded else None
        if not title:
            parsed = urlparse(url)
            title = parsed.netloc or "Web Source"

        return {
            "title": title,
            "content": text or "",
            "source_url": url
        }
    except Exception as e:
        logger.error(f"Web extraction failed for {url}: {e}")
        return None
