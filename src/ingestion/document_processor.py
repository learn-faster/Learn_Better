"""Document processing module for converting various formats to markdown and chunking content."""

from pathlib import Path
from typing import List, Tuple, Dict, Any
from markitdown import MarkItDown


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
    
    def convert_to_markdown(self, file_path: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Convert a document to clean Markdown and extract image metadata.
        
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

        # High-fidelity PDF parsing with MinerU
        if path.suffix.lower() == '.pdf':
            try:
                print(f"DEBUG: MinerU (magic-pdf) converting: {path}")
                return self._convert_pdf_multimodal(file_path)
            except Exception as e:
                print(f"DEBUG: MinerU failure, falling back to MarkItDown: {str(e)}")
        
        # Standard conversion for other formats or fallback
        try:
            print(f"DEBUG: MarkItDown converting: {path}")
            result = self._converter.convert(str(path))
            text = result.text_content or ""
            # PostgreSQL does not allow NUL (\x00) characters in string literals
            return text.replace('\x00', ''), []
        except Exception as e:
            print(f"DEBUG: MarkItDown failure: {str(e)}")
            raise RuntimeError(f"MarkItDown failed to convert {path.name}: {str(e)}") from e

    def _convert_pdf_multimodal(self, file_path: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Use magic-pdf CLI to extract high-quality markdown and layout meta.
        """
        import subprocess
        import tempfile
        import json
        
        # Persistent images dir for the application
        storage_dir = Path("data/extracted_images") / Path(file_path).stem
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                # Run magic-pdf extraction
                # -p path, -o output_dir, -m method (json/txt/md)
                cmd = ["uv", "run", "magic-pdf", "-p", file_path, "-o", temp_dir, "-m", "md"]
                subprocess.run(cmd, capture_output=True, text=True, check=True)
                
                base_name = Path(file_path).stem
                output_folder = Path(temp_dir) / base_name
                
                # 1. Read Markdown
                md_files = list(output_folder.glob("*.md"))
                text = ""
                if md_files:
                    with open(md_files[0], 'r', encoding='utf-8') as f:
                        text = f.read().replace('\x00', '')
                
                # 2. Extract Image Metadata from MinerU output
                # MinerU typically creates an 'images' folder in its output
                images_dir = output_folder / "images"
                image_metadata = []
                
                if images_dir.exists():
                    for img_path in images_dir.glob("*"):
                        if img_path.suffix.lower() in {'.png', '.jpg', '.jpeg'}:
                            # Copy to persistent storage
                            dest_path = storage_dir / img_path.name
                            shutil.copy(img_path, dest_path)
                            
                            image_metadata.append({
                                "path": str(dest_path),
                                "name": img_path.name,
                                "type": "image"
                            })
                
                return text, image_metadata
                
            except subprocess.CalledProcessError as e:
                raise RuntimeError(f"magic-pdf execution failed: {e.stderr}") from e


    
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
