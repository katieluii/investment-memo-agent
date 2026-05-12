import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db

router = APIRouter(prefix="/deals", tags=["agents"])


def _preview(text: str, max_chars: int = 120) -> str:
    return text[:max_chars].replace("\n", " ").strip() + ("..." if len(text) > max_chars else "")


def _citations(chunks: list, n: int = 3) -> list:
    return [
        {
            "filename": chunk.document.filename if chunk.document else "unknown",
            "chunk_index": chunk.chunk_index,
            "quote": _preview(chunk.chunk_text),
        }
        for chunk in chunks[:n]
    ]


def _diligence_agent(deal: models.Deal, chunks: list) -> dict:
    # TODO: replace with real LLM call — pass deal fields + chunk texts as context
    return {
        "asset": deal.asset_name or "N/A",
        "indication": deal.indication or "N/A",
        "stage": deal.stage or "N/A",
        "mechanism_of_action": "[TODO: extract from uploaded documents]",
        "clinical_data_summary": "[TODO: summarise trial results from documents]",
        "competitive_landscape": "[TODO: identify key competitors and differentiation]",
        "unmet_need": "[TODO: assess unmet medical need from documents]",
        "citations": _citations(chunks, 3),
    }


def _financing_agent(deal: models.Deal, chunks: list) -> dict:
    # TODO: replace with real LLM call
    return {
        "round_type": deal.round_type or "N/A",
        "geography": deal.geography or "N/A",
        "estimated_raise": "[TODO: extract raise amount from documents]",
        "use_of_proceeds": "[TODO: extract use of proceeds from documents]",
        "comparable_financings": "[TODO: identify comparable recent financings]",
        "valuation_considerations": "[TODO: derive implied valuation from documents]",
        "citations": _citations(chunks, 2),
    }


def _risk_agent(deal: models.Deal, chunks: list) -> dict:
    # TODO: replace with real LLM call
    return {
        "clinical_risks": ["[TODO: identify from documents]"],
        "regulatory_risks": ["[TODO: identify from documents]"],
        "competitive_risks": ["[TODO: identify from documents]"],
        "financial_risks": ["[TODO: identify from documents]"],
        "diligence_questions": [
            "[TODO: generate targeted diligence questions from documents]",
            "[TODO: generate targeted diligence questions from documents]",
        ],
        "citations": _citations(chunks, 2),
    }


_AGENTS = {
    "diligence_agent": _diligence_agent,
    "financing_agent": _financing_agent,
    "risk_agent": _risk_agent,
}


@router.post("/{deal_id}/run-agents")
def run_agents(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    chunks = (
        db.query(models.DocumentChunk)
        .options(joinedload(models.DocumentChunk.document))
        .filter(models.DocumentChunk.deal_id == deal_id)
        .order_by(models.DocumentChunk.chunk_index)
        .limit(5)
        .all()
    )

    for name, fn in _AGENTS.items():
        output = fn(deal, chunks)
        db.add(
            models.AgentOutput(
                deal_id=deal_id,
                agent_name=name,
                output_json=json.dumps(output, indent=2),
            )
        )

    db.commit()
    return {"message": f"Ran agents: {', '.join(_AGENTS)}"}


@router.get("/{deal_id}/agent-outputs", response_model=list[schemas.AgentOutputOut])
def get_agent_outputs(deal_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.AgentOutput)
        .filter(models.AgentOutput.deal_id == deal_id)
        .order_by(models.AgentOutput.created_at.desc())
        .all()
    )
