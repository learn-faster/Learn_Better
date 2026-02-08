"""
OCR service for scanned documents and images.
Supports local OCR (pytesseract) with optional cloud vision fallback.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from src.config import settings
from src.services.llm_service import llm_service
from src.models.schemas import LLMConfig

logger = logging.getLogger(__name__)


class OCRService:
    def _ocr_image_local(self, image) -> str:
        try:
            import pytesseract
            return pytesseract.image_to_string(image, lang=settings.ocr_language)
        except Exception as e:
            logger.error(f"Local OCR failed: {e}")
            return ""

    async def _ocr_image_cloud(self, image_path: str, config: Optional[LLMConfig]) -> str:
        try:
            prompt = "Extract all readable text from this image. Return only the text."
            return await llm_service.get_vision_completion(prompt, image_path, config=config)
        except Exception as e:
            logger.error(f"Cloud OCR failed: {e}")
            return ""

    async def ocr_pdf(
        self,
        file_path: str,
        max_pages: Optional[int] = None,
        mode: Optional[str] = None,
        llm_config: Optional[LLMConfig] = None
    ) -> str:
        mode = (mode or settings.ocr_mode).lower()
        if mode == "disabled":
            return ""

        max_pages = max_pages or settings.ocr_max_pages
        text_parts: List[str] = []

        try:
            from pdf2image import convert_from_path
            pages = convert_from_path(file_path, first_page=1, last_page=max_pages)
        except Exception as e:
            logger.error(f"Failed to convert PDF to images for OCR: {e}")
            return ""

        for idx, page in enumerate(pages):
            if mode == "local":
                text_parts.append(self._ocr_image_local(page))
            elif mode == "cloud":
                # Save temp image
                temp_path = f"{file_path}_ocr_{idx}.png"
                page.save(temp_path, "PNG")
                text_parts.append(await self._ocr_image_cloud(temp_path, llm_config))
                try:
                    import os
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception:
                    pass
            else:
                text_parts.append(self._ocr_image_local(page))

        return "\n".join([t for t in text_parts if t and t.strip()])


ocr_service = OCRService()
