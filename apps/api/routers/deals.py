from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/deals", tags=["deals"])


@router.post("", response_model=schemas.DealOut)
def create_deal(deal: schemas.DealCreate, db: Session = Depends(get_db)):
    data = deal.model_dump(exclude_unset=True)
    if "status" not in data:
        data["status"] = "live"
    db_deal = models.Deal(**data)
    db.add(db_deal)
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.get("", response_model=list[schemas.DealOut])
def list_deals(db: Session = Depends(get_db)):
    return db.query(models.Deal).order_by(models.Deal.created_at.desc()).all()


@router.get("/{deal_id}", response_model=schemas.DealOut)
def get_deal(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.patch("/{deal_id}", response_model=schemas.DealOut)
def update_deal(deal_id: int, updates: schemas.DealCreate, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(deal, field, value)
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/submit-cap-table", response_model=schemas.DealOut)
def submit_cap_table(deal_id: int, data: schemas.CapTableSubmit, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    deal.moic = data.moic
    deal.irr = data.irr
    deal.moic_submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/submit-market-sizing", response_model=schemas.DealOut)
def submit_market_sizing(deal_id: int, data: schemas.MarketSizingSubmit, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    deal.peak_revenue_m = data.peak_revenue_m
    deal.market_sizing_submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/submit-exit", response_model=schemas.DealOut)
def submit_exit(deal_id: int, data: schemas.ExitSubmit, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    deal.exit_base_moic = data.base_moic
    deal.exit_base_irr = data.base_irr
    deal.exit_submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(deal)
    return deal


@router.get("/{deal_id}/comments", response_model=list[schemas.CommentOut])
def list_comments(deal_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Comment)
        .filter(models.Comment.deal_id == deal_id)
        .order_by(models.Comment.created_at.desc())
        .all()
    )


@router.post("/{deal_id}/comments", response_model=schemas.CommentOut)
def add_comment(deal_id: int, data: schemas.CommentCreate, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    comment = models.Comment(deal_id=deal_id, **data.model_dump())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment
