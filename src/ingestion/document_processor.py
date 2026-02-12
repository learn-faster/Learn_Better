"""Document processing module for converting various formats to markdown and chunking content."""

from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
import base64
from markitdown import MarkItDown
from src.utils.logger import logger


class DocumentProcessor:
    """Handles document conversion and content chunking for the ingestion pipeline."""
    
    SUPPORTED_FORMATS = {'.pdf', '.docx', '.html', '.htm', '.md', '.txt'}
    DEFAULT_CHUNK_SIZE = 1000  # characters per chunk
    
    def __init__(self, chunk_size: int = DEFAULT_CHUNK_SIZE):
        """
        Initialize the document processor.
        
        Args:
            chunk_size: Number of characters per content chunk (default: 1000)
        """
        self.chunk_size = chunk_size
        self._converter = MarkItDown()
    
    def convert_to_markdown(
        self,
        file_path: str,
        page_start: Optional[int] = None,
        page_end: Optional[int] = None,
        include_images: bool = False,
        image_mode: str = "base64",
        max_image_kb: int = 5120
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Convert a document to clean Markdown and extract image metadata.
        
        Uses MarkItDown as primary converter, with pypdf fallback for PDFs
        when MarkItDown returns empty text.
        For PDFs, optionally extracts page-range text and embeds images.
        
        Returns:
            Tuple of (Markdown text, List of image metadata dicts)
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if path.suffix.lower() not in self.SUPPORTED_FORMATS:
            raise ValueError(
                f"Unsupported file format: {path.suffix}. "
                f"Supported formats: {', '.join(self.SUPPORTED_FORMATS)}"
            )

        text = ""
        
        # Try MarkItDown first
        try:
            logger.debug(f"MarkItDown converting: {path}")
            result = self._converter.convert(str(path))
            text = result.text_content or ""
        except Exception as e:
            logger.debug(f"MarkItDown failure: {str(e)}")
        
        # Fallback: If MarkItDown returned empty and this is a PDF, use pypdf
        if path.suffix.lower() == '.pdf' and (page_start or page_end):
            text = self._extract_pdf_page_range(path, page_start, page_end)
        elif not text.strip() and path.suffix.lower() == '.pdf':
            logger.debug("MarkItDown returned empty, trying pypdf fallback...")
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(path))
                pages_text = []
                for i, page in enumerate(reader.pages):
                    page_text = page.extract_text() or ""
                    if page_text.strip():
                        pages_text.append(f"## Page {i+1}\n\n{page_text}")
                text = "\n\n".join(pages_text)
                logger.debug(f"pypdf extracted {len(text)} characters from {len(reader.pages)} pages")
            except Exception as e:
                logger.error(f"pypdf fallback also failed: {str(e)}")
        
        # If still empty, this might be a scanned/image-based PDF
        if not text.strip():
            logger.warning(f"Could not extract text from {path.name}. Document may be scanned/image-based.")
            # Return a placeholder message instead of empty
            text = f"[Text extraction failed for {path.name}. This may be a scanned or image-based document that requires OCR processing.]"

        image_metadata: List[Dict[str, Any]] = []
        if include_images and path.suffix.lower() == ".pdf":
            try:
                text, image_metadata = self._inject_pdf_images(
                    path=path,
                    markdown=text,
                    page_start=page_start,
                    page_end=page_end,
                    image_mode=image_mode,
                    max_image_kb=max_image_kb
                )
            except Exception as e:
                logger.warning(f"PDF image extraction failed: {e}")

        # PostgreSQL does not allow NUL (\x00) characters in string literals
        return text.replace('\x00', ''), image_metadata

    def _extract_pdf_page_range(self, path: Path, page_start: Optional[int], page_end: Optional[int]) -> str:
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            total_pages = len(reader.pages)
            start = max(1, page_start or 1)
            end = min(total_pages, page_end or total_pages)
            if start > end:
                return ""
            pages_text = []
            for i in range(start - 1, end):
                page_text = reader.pages[i].extract_text() or ""
                if page_text.strip():
                    pages_text.append(f"## Page {i+1}\n\n{page_text}")
            return "\n\n".join(pages_text)
        except Exception as e:
            logger.error(f"PDF page range extraction failed: {e}")
            return ""

    def _inject_pdf_images(
        self,
        path: Path,
        markdown: str,
        page_start: Optional[int],
        page_end: Optional[int],
        image_mode: str,
        max_image_kb: int
    ) -> Tuple[str, List[Dict[str, Any]]]:
        try:
            import pdfplumber
        except Exception:
            logger.warning("pdfplumber not available for image extraction")
            return markdown, []

        image_mode = (image_mode or "base64").lower()
        max_bytes = max(64, int(max_image_kb)) * 1024
        image_metadata: List[Dict[str, Any]] = []
        page_blocks = {}

        with pdfplumber.open(str(path)) as pdf:
            total_pages = len(pdf.pages)
            start = max(1, page_start or 1)
            end = min(total_pages, page_end or total_pages)
            for idx in range(start - 1, end):
                page = pdf.pages[idx]
                images = page.images or []
                if not images:
                    continue
                inserts = []
                for image_idx, img in enumerate(images):
                    try:
                        bbox = (img.get("x0", 0), img.get("top", 0), img.get("x1", 0), img.get("bottom", 0))
                        cropped = page.crop(bbox)
                        pil_img = cropped.to_image(resolution=150).original
                        if pil_img is None:
                            continue
                        from io import BytesIO
                        buf = BytesIO()
                        pil_img.save(buf, format="PNG")
                        data = buf.getvalue()
                        if len(data) > max_bytes:
                            image_metadata.append({
                                "page": idx + 1,
                                "image_index": image_idx,
                                "status": "skipped_large",
                                "size_bytes": len(data)
                            })
                            continue
                        if image_mode == "base64":
                            b64 = base64.b64encode(data).decode("utf-8")
                            inserts.append(f"![page-{idx+1}-image-{image_idx+1}](data:image/png;base64,{b64})")
                            image_metadata.append({
                                "page": idx + 1,
                                "image_index": image_idx,
                                "status": "embedded",
                                "size_bytes": len(data)
                            })
                    except Exception as e:
                        image_metadata.append({
                            "page": idx + 1,
                            "image_index": image_idx,
                            "status": "error",
                            "error": str(e)
                        })
                if inserts:
                    page_blocks[idx + 1] = "\n\n".join(inserts)

        if not page_blocks:
            return markdown, image_metadata

        lines = markdown.splitlines()
        output = []
        current_page = None
        for line in lines:
            if line.strip().lower().startswith("## page"):
                if current_page is not None and current_page in page_blocks:
                    output.append("")
                    output.append(page_blocks[current_page])
                try:
                    current_page = int(line.strip().split()[-1])
                except Exception:
                    current_page = None
            output.append(line)
        if current_page is not None and current_page in page_blocks:
            output.append("")
            output.append(page_blocks[current_page])

        return "\n".join(output), image_metadata


    
    def chunk_content(self, markdown: str, concept_tag: str = "") -> List[Tuple[str, str]]:
        """
        Split markdown content into chunks with concept tags.
        
        Chunks are created by splitting on paragraph boundaries (double newlines)
        while respecting the maximum chunk size. Each chunk is tagged with the
        parent concept name for later retrieval.
        
        Args:
            markdown: Markdown text to chunk
            concept_tag: Parent concept name to tag chunks with
            
        Returns:
            List of (chunk_content, concept_tag) tuples
        """
        if not markdown or not markdown.strip():
            return []
        
        # Split on paragraph boundaries
        paragraphs = markdown.split('\n\n')
        chunks = []
        current_chunk = []
        current_size = 0
        
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            
            para_size = len(paragraph)
            
            # If single paragraph exceeds chunk size, split it
            if para_size > self.chunk_size:
                # Save current chunk if it has content
                if current_chunk:
                    chunks.append(('\n\n'.join(current_chunk), concept_tag))
                    current_chunk = []
                    current_size = 0
                
                # Split large paragraph into sentences
                sentences = paragraph.replace('. ', '.\n').split('\n')
                temp_chunk = []
                temp_size = 0
                
                for sentence in sentences:
                    sentence = sentence.strip()
                    if not sentence:
                        continue
                    
                    sent_size = len(sentence)
                    
                    # If a single sentence is too large, force split it
                    if sent_size > self.chunk_size:
                        # Save current temp chunk
                        if temp_chunk:
                            chunks.append((' '.join(temp_chunk), concept_tag))
                            temp_chunk = []
                            temp_size = 0
                        
                        # Force split the large sentence into chunk-sized pieces
                        for i in range(0, sent_size, self.chunk_size):
                            chunk_piece = sentence[i:i + self.chunk_size]
                            chunks.append((chunk_piece, concept_tag))
                    elif temp_size + sent_size > self.chunk_size and temp_chunk:
                        chunks.append((' '.join(temp_chunk), concept_tag))
                        temp_chunk = [sentence]
                        temp_size = sent_size
                    else:
                        temp_chunk.append(sentence)
                        temp_size += sent_size + 1  # +1 for space
                
                if temp_chunk:
                    chunks.append((' '.join(temp_chunk), concept_tag))
            
            # Normal case: add paragraph to current chunk
            elif current_size + para_size > self.chunk_size and current_chunk:
                chunks.append(('\n\n'.join(current_chunk), concept_tag))
                current_chunk = [paragraph]
                current_size = para_size
            else:
                current_chunk.append(paragraph)
                current_size += para_size + 2  # +2 for \n\n
        
        # Add remaining content
        if current_chunk:
            chunks.append(('\n\n'.join(current_chunk), concept_tag))
        
        return chunks
