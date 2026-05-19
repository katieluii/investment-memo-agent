from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/deals", tags=["founder-insights"])


@router.put("/{deal_id}/founder-insights", response_model=schemas.FounderInsightsOut)
def save_founder_insights(deal_id: int, body: schemas.FounderInsightsCreate, db: Session = Depends(get_db)):
    if not db.query(models.Deal).filter(models.Deal.id == deal_id).first():
        raise HTTPException(status_code=404, detail="Deal not found")

    existing = db.query(models.FounderInsights).filter(models.FounderInsights.deal_id == deal_id).first()
    if existing:
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    entry = models.FounderInsights(deal_id=deal_id, **body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/{deal_id}/founder-insights", response_model=schemas.FounderInsightsOut)
def get_founder_insights(deal_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.FounderInsights).filter(models.FounderInsights.deal_id == deal_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="No founder insights recorded yet")
    return entry
