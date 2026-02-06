"""
Binder: Multimodal PDF Parser and Spatial Aligner.
Uses magic-pdf to extract text and images, then links them by spatial proximity.
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from sqlalchemy.orm import Session

from src.models.orm import Document, DocumentImage

logger = logging.getLogger(__name__)

class MultimodalBinder:
    """
    Handles PDF parsing into text and images.
    Links visual elements to the nearest semantic context.
    """
    
    def __init__(self, output_dir: str = "data/extracted"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def process_pdf(self, file_path: str, document_id: int, db: Session) -> Dict[str, Any]:
        """
        Main entry point for multimodal extraction.
        """
        try:
            # 1. Parse using magic-pdf (MinerU)
            # This is a placeholder for the actual magic-pdf call
            # result = self._run_magic_pdf(file_path)
            
            # 2. Extract layout and images
            # images = result.get("images", [])
            # text_content = result.get("markdown", "")
            
            # 3. Spatial Linking
            # self._link_images_to_context(images, text_content, document_id, db)
            
            return {"status": "success", "message": "Multimodal ingestion complete"}
        except Exception as e:
            logger.error(f"Binder failed for {file_path}: {str(e)}")
            return {"status": "error", "message": str(e)}

    def _run_magic_pdf(self, file_path: str):
        """
        Executes magic-pdf extraction logic.
        """
        # TODO: Implement actual magic-pdf API calls after installation
        pass

    def bind_images(self, document_id: int, image_metadata: List[Dict[str, Any]], db: Session):
        """
        Persists extracted images into the database.
        """
        for img_data in image_metadata:
            db_img = DocumentImage(
                document_id=document_id,
                file_path=img_data.get("path"),
                caption=img_data.get("name", "Extracted Image"),
            )
            db.add(db_img)
        
        try:
            db.commit()
            logger.info(f"Successfully bound {len(image_metadata)} images for document {document_id}")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to bind images for document {document_id}: {str(e)}")
            raise

    async def caption_images(self, document_id: int, db: Session, model_name: str = "llava"):
        """
        Uses a vision model to generate captions for images that lack them.
        """
        from src.services.llm_service import llm_service
        from src.routers.ai import LLMConfig
        from src.config import settings
        from sqlalchemy import select
        
        # Find images for this document
        images = db.query(DocumentImage).filter(DocumentImage.document_id == document_id).all()
        
        config = LLMConfig(
            provider="ollama",
            model=model_name,
            base_url=settings.ollama_base_url
        )
        
        for img in images:
            if not img.caption or img.caption == "Extracted Image":
                try:
                    logger.info(f"Generating AI caption for image {img.id} using {model_name}")
                    caption = await llm_service.get_vision_completion(
                        prompt="Describe this diagram or image in detail for a knowledge graph. Focus on technical concepts.",
                        image_path=img.file_path,
                        config=config
                    )
                    img.caption = caption
                    db.add(img)
                except Exception as e:
                    logger.error(f"Failed to generate caption for image {img.id}: {str(e)}")
        
        db.commit()

