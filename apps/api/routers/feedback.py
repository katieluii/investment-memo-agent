from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/deals", tags=["feedback"])


@router.post("/{deal_id}/feedback", response_model=schemas.AgentFeedbackOut)
def save_feedback(deal_id: int, body: schemas.AgentFeedbackCreate, db: Session = Depends(get_db)):
    if not db.query(models.Deal).filter(models.Deal.id == deal_id).first():
        raise HTTPException(status_code=404, detail="Deal not found")
    entry = models.AgentFeedback(
        deal_id=deal_id,
        agent_name=body.agent_name,
        feedback_text=body.feedback_text,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/{deal_id}/feedback", response_model=list[schemas.AgentFeedbackOut])
def get_feedback(deal_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.AgentFeedback)
        .filter(models.AgentFeedback.deal_id == deal_id)
        .order_by(models.AgentFeedback.created_at.desc())
        .all()
    )
