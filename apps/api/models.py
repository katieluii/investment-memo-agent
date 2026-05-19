from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    asset_name = Column(String)
    indication = Column(String)
    stage = Column(String)
    round_type = Column(String)
    geography = Column(String)
    fund_thesis = Column(Text)
    memo_format = Column(String)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("Document", back_populates="deal", cascade="all, delete-orphan")
    chunks = relationship("DocumentChunk", back_populates="deal", cascade="all, delete-orphan")
    agent_outputs = relationship("AgentOutput", back_populates="deal", cascade="all, delete-orphan")
    memos = relationship("Memo", back_populates="deal", cascade="all, delete-orphan")
    feedback = relationship("AgentFeedback", back_populates="deal", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(String, default="uploaded")
    created_at = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    chunk_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", back_populates="chunks")
    document = relationship("Document", back_populates="chunks")


class AgentOutput(Base):
    __tablename__ = "agent_outputs"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    agent_name = Column(String, nullable=False)
    output_json = Column(Text, nullable=False)
    status = Column(String, default="completed")
    created_at = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", back_populates="agent_outputs")


class Memo(Base):
    __tablename__ = "memos"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    markdown = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", back_populates="memos")


class AgentFeedback(Base):
    __tablename__ = "agent_feedback"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    agent_name = Column(String, nullable=False)
    feedback_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", back_populates="feedback")
