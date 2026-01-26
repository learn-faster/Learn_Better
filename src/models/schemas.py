"""Pydantic models for LearnFast Core Engine data structures."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class PrerequisiteLink(BaseModel):
    """Represents a prerequisite relationship between concepts."""
    
    source_concept: str = Field(..., description="The fundamental concept")
    target_concept: str = Field(..., description="The advanced concept")
    weight: float = Field(..., ge=0.0, le=1.0, description="Dependency strength")
    reasoning: str = Field(..., description="Why source is needed for target")


class GraphSchema(BaseModel):
    """Schema for extracted knowledge graph structure."""
    
    concepts: List[str] = Field(..., description="List of extracted concepts")
    prerequisites: List[PrerequisiteLink] = Field(..., description="Concept dependencies")


class UserState(BaseModel):
    """Represents current user progress and available options."""
    
    user_id: str
    completed_concepts: List[str]
    in_progress_concepts: List[str]
    available_concepts: List[str]


class ConceptNode(BaseModel):
    """Represents a concept node in the knowledge graph."""
    
    name: str = Field(..., description="Unique concept name (lowercase)")
    description: Optional[str] = Field(None, description="Concept description")
    depth_level: Optional[int] = Field(None, description="Depth in prerequisite hierarchy")


class UserNode(BaseModel):
    """Represents a user node in the knowledge graph."""
    
    uid: str = Field(..., description="Unique user identifier")
    name: str = Field(..., description="User display name")


class LearningChunk(BaseModel):
    """Represents a content chunk stored in the vector database."""
    
    id: Optional[int] = Field(None, description="Database ID")
    doc_source: str = Field(..., description="Source filename or URL")
    content: str = Field(..., description="Markdown text chunk")
    concept_tag: str = Field(..., description="Associated concept name")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")


class LearningPath(BaseModel):
    """Represents a resolved learning path with time estimates."""
    
    concepts: List[str] = Field(..., description="Ordered list of concepts to learn")
    estimated_time_minutes: int = Field(..., description="Total estimated learning time")
    target_concept: str = Field(..., description="Final concept to reach")
    pruned: bool = Field(False, description="Whether path was pruned due to time constraints")