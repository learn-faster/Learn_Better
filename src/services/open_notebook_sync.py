import os
import shutil
import logging
from pathlib import Path
from datetime import datetime
from src.config import settings

logger = logging.getLogger(__name__)

async def _upsert_surreal_source(
    doc_id: int,
    title: str,
    content: str,
    source_type: str,
    original_name: str
):
    try:
        from on_api.router_main import db as surreal_db
        from on_api.db_utils import first_record
    except Exception as exc:
        logger.warning(f"Open Notebook DB not available for sync: {exc}")
        return

    notebook_id = str(doc_id)
    external_id = f"document:{doc_id}"
    payload = {
        "title": title,
        "content": content,
        "notebook_id": notebook_id,
        "source_type": source_type,
        "external_id": external_id,
        "original_file": original_name,
        "updated": "type::datetime(now())",
    }

    try:
        result = await surreal_db.query(
            "SELECT * FROM source WHERE notebook_id = $notebook_id AND external_id = $external_id LIMIT 1",
            {"notebook_id": notebook_id, "external_id": external_id},
        )
        existing = first_record(result)
        if existing and existing.get("id"):
            await surreal_db.query(
                f"UPDATE {existing.get('id')} MERGE $data RETURN AFTER",
                {"data": payload},
            )
            return

        payload["created_at"] = "type::datetime(now())"
        await surreal_db.create("source", payload)
    except Exception as exc:
        logger.warning(f"Failed to sync source to Open Notebook DB: {exc}")

async def sync_document_to_notebook(
    doc_id: int, 
    title: str, 
    content: str, 
    file_path: str, 
    source_type: str
):
    """
    Syncs a document to the Open Notebook folder as a markdown file.
    
    Args:
        doc_id: The ID of the document.
        title: The title of the document.
        content: The extracted text content.
        file_path: The original file path.
        source_type: The type of the source (e.g., pdf, youtube).
    """
    should_write_file = False
    notebook_dir = None

    if not settings.open_notebook_dir:
        logger.warning("Open Notebook directory not configured. Skipping file sync.")
    else:
        notebook_dir = Path(settings.open_notebook_dir)
        if not notebook_dir.exists():
            logger.warning(f"Open Notebook directory does not exist: {notebook_dir}")
        else:
            should_write_file = True

    original_name = os.path.basename(file_path) if file_path else ""

    if should_write_file:
        try:
            # Sanitize title for filename
            safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
            if not safe_title:
                safe_title = f"doc_{doc_id}"
            if len(safe_title) > 120:
                safe_title = safe_title[:120].rstrip()
            filename = f"{safe_title}.md"
            target_path = notebook_dir / "sources" / filename

            # Ensure sources directory exists
            (notebook_dir / "sources").mkdir(parents=True, exist_ok=True)

            # Create frontmatter
            frontmatter = f"""---
id: {doc_id}
title: "{title}"
type: source
source_type: {source_type}
created: {datetime.now().isoformat()}
original_file: {original_name}
---

"""

            # Write content
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(frontmatter)
                f.write(content)

            logger.info(f"Synced document {doc_id} to Open Notebook: {target_path}")
        except Exception as e:
            logger.error(f"Failed to sync document to Open Notebook: {e}")
            # Don't raise, just log error so main process continues

    try:
        await _upsert_surreal_source(
            doc_id=doc_id,
            title=title,
            content=content,
            source_type=source_type,
            original_name=original_name
        )
    except Exception as e:
        logger.error(f"Failed to sync document to Open Notebook DB: {e}")
