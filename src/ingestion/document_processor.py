"""Document processing module for converting various formats to markdown and chunking content."""

from pathlib import Path
from typing import List, Tuple
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
    
    def convert_to_markdown(self, file_path: str) -> str:
        """
        Convert a document to clean Markdown format.
        
        Supports PDF, DOCX, and HTML formats using markitdown library.
        
        Args:
            file_path: Path to the document file
            
        Returns:
            Clean markdown text
            
        Raises:
            ValueError: If file format is not supported
            FileNotFoundError: If file does not exist
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if path.suffix.lower() not in self.SUPPORTED_FORMATS:
            raise ValueError(
                f"Unsupported file format: {path.suffix}. "
                f"Supported formats: {', '.join(self.SUPPORTED_FORMATS)}"
            )
        
        try:
            result = self._converter.convert(str(path))
            text = result.text_content
            # PostgreSQL does not allow NUL (\x00) characters in string literals
            return text.replace('\x00', '') if text else ""
        except Exception as e:
            raise RuntimeError(f"Failed to convert document: {str(e)}") from e
    
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
