from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DealCreate(BaseModel):
    company_name: str
    asset_name: Optional[str] = None
    indication: Optional[str] = None
    stage: Optional[str] = None
    round_type: Optional[str] = None
    geography: Optional[str] = None
    fund_thesis: Optional[str] = None
    memo_format: Optional[str] = None


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    asset_name: Optional[str]
    indication: Optional[str]
    stage: Optional[str]
    round_type: Optional[str]
    geography: Optional[str]
    fund_thesis: Optional[str]
    memo_format: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deal_id: int
    filename: str
    file_path: str
    status: str
    created_at: datetime


class AgentOutputOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deal_id: int
    agent_name: str
    output_json: str
    status: str
    created_at: datetime


class MemoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deal_id: int
    markdown: str
    created_at: datetime


class FounderInsightsCreate(BaseModel):
    meeting_notes: Optional[str] = None
    key_impressions: Optional[str] = None
    ratings_json: Optional[str] = None


class FounderInsightsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deal_id: int
    meeting_notes: Optional[str]
    key_impressions: Optional[str]
    ratings_json: Optional[str]
    created_at: datetime
    updated_at: datetime


class AgentFeedbackCreate(BaseModel):
    agent_name: str
    feedback_text: str


class AgentFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deal_id: int
    agent_name: str
    feedback_text: str
    created_at: datetime
