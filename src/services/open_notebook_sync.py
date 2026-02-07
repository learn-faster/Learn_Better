import os
import shutil
import logging
from pathlib import Path
from datetime import datetime
from src.config import settings

logger = logging.getLogger(__name__)

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
    if not settings.open_notebook_dir:
        logger.warning("Open Notebook directory not configured. Skipping sync.")
        return

    try:
        notebook_dir = Path(settings.open_notebook_dir)
        if not notebook_dir.exists():
            logger.warning(f"Open Notebook directory does not exist: {notebook_dir}")
            return

        # Sanitize title for filename
        safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).rstrip()
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
original_file: {os.path.basename(file_path)}
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
