
import os
import shutil
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import UploadFile
from src.database.connections import postgres_conn
from src.models.schemas import DocumentMetadata

logger = logging.getLogger(__name__)

class DocumentStore:
    """Manages document storage and metadata."""
    
    STORAGE_DIR = "data/documents"
    
    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = storage_dir or self.STORAGE_DIR
        os.makedirs(self.storage_dir, exist_ok=True)
        self.db = postgres_conn
        
    def save_document(self, file: UploadFile) -> DocumentMetadata:
        """Save an uploaded file and create a metadata record."""
        try:
            # unique filename to prevent overwrites could be handled here, 
            # but for now we'll trust the filename or append timestamp if needed.
            # actually, using the ID as prefix is safer but we don't have ID yet.
            # Let's insert first to get ID.
            
            insert_query = """
                INSERT INTO documents (filename, title, status)
                VALUES (%s, %s, 'pending')
                RETURNING id, upload_date
            """
            result = self.db.execute_query(insert_query, (file.filename, file.filename))
            doc_id = result[0]['id']
            upload_date = result[0]['upload_date']
            
            # Save file
            safe_filename = f"{doc_id}_{file.filename}"
            file_path = os.path.join(self.storage_dir, safe_filename)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
                
            # Update record with path
            update_query = "UPDATE documents SET file_path = %s WHERE id = %s"
            self.db.execute_query(update_query, (file_path, doc_id))
            
            logger.info(f"Saved document {doc_id}: {file.filename}")
            return DocumentMetadata(
                id=doc_id,
                filename=file.filename,
                upload_date=upload_date,
                status='pending',
                file_path=file_path
            )
        except Exception as e:
            logger.error(f"Failed to save document: {e}")
            raise e
            
    def save_transcript(self, video_id: str, transcript: str) -> DocumentMetadata:
        """Save a fetched YouTube transcript as a virtual document and create metadata."""
        try:
            filename = f"youtube_{video_id}.md"
            
            # Check for existing record
            check_query = "SELECT id, upload_date FROM documents WHERE filename = %s"
            existing = self.db.execute_query(check_query, (filename,))
            
            if existing:
                doc_id = existing[0]['id']
                upload_date = existing[0]['upload_date']
                # Reset status to pending
                self.db.execute_query("UPDATE documents SET status = 'pending' WHERE id = %s", (doc_id,))
                logger.info(f"Reusing existing record {doc_id} for YouTube video {video_id}")
            else:
                insert_query = """
                    INSERT INTO documents (filename, title, status)
                    VALUES (%s, %s, 'pending')
                    RETURNING id, upload_date
                """
                result = self.db.execute_query(insert_query, (filename, f"YouTube: {video_id}"))
                doc_id = result[0]['id']
                upload_date = result[0]['upload_date']
            
            # Save file
            safe_filename = f"{doc_id}_{filename}"
            file_path = os.path.join(self.storage_dir, safe_filename)
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"# YouTube Video: {video_id}\n\n")
                f.write(transcript)
                
            # Update record with path
            update_query = "UPDATE documents SET file_path = %s WHERE id = %s"
            self.db.execute_query(update_query, (file_path, doc_id))
            
            logger.info(f"Saved YouTube transcript {doc_id}: {video_id}")
            
            return DocumentMetadata(
                id=doc_id,
                filename=filename,
                upload_date=upload_date,
                status='pending',
                file_path=file_path
            )
            
        except Exception as e:
            logger.error(f"Failed to save transcript: {e}")
            raise e

    def get_document(self, doc_id: int) -> Optional[DocumentMetadata]:
        """Retrieve document metadata by ID."""
        query = "SELECT * FROM documents WHERE id = %s"
        result = self.db.execute_query(query, (doc_id,))
        if not result:
            return None
        return DocumentMetadata(**result[0])

    def list_documents(self) -> List[DocumentMetadata]:
        """List all documents."""
        query = "SELECT * FROM documents ORDER BY upload_date DESC"
        results = self.db.execute_query(query)
        return [DocumentMetadata(**row) for row in results]

    def update_status(self, doc_id: int, status: str):
        """Update document processing status."""
        query = "UPDATE documents SET status = %s WHERE id = %s"
        self.db.execute_query(query, (status, doc_id))

    def delete_document(self, doc_id: int):
        """Delete document and its associated data in all stores."""
        doc = self.get_document(doc_id)
        if not doc:
            raise ValueError(f"Document {doc_id} not found")
            
        # 1. Delete from Knowledge Graph (Neo4j)
        try:
            from src.database.graph_storage import graph_storage
            graph_storage.remove_document_provenance(doc_id)
        except Exception as e:
            logger.error(f"Failed to cleanup graph for document {doc_id}: {e}")
            
        # 2. Delete from Vector Storage (Postgres pgvector)
        try:
            from src.ingestion.vector_storage import VectorStorage
            vector_storage = VectorStorage()
            vector_storage.delete_document_chunks(doc_id)
        except Exception as e:
            logger.error(f"Failed to cleanup vector chunks for document {doc_id}: {e}")
            
        # 3. Delete from DB (Cascade will remove PostgreSQL metadata leftovers if any)
        self.db.execute_query("DELETE FROM documents WHERE id = %s", (doc_id,))
        
        # 4. Delete physical file
        if doc.file_path and os.path.exists(doc.file_path):
            os.remove(doc.file_path)
            
        logger.info(f"Deleted document {doc_id} and synchronized all stores")
