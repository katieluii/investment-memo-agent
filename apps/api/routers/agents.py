import json
import os
import re

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db

router = APIRouter(prefix="/deals", tags=["agents"])

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
_MODEL = "claude-haiku-4-5-20251001"


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


def _chunk_context(chunks: list) -> str:
    parts = []
    for c in chunks:
        filename = c.document.filename if c.document else "unknown"
        parts.append(f"[{filename} · chunk {c.chunk_index}]\n{c.chunk_text}")
    return "\n\n---\n\n".join(parts)


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        return {}


def _diligence_agent(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a biopharma investment analyst. Analyse this deal and the document excerpts below, then return a JSON object.

Deal:
- Company: {deal.company_name}
- Asset: {deal.asset_name or "Not specified"}
- Indication: {deal.indication or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Investment thesis: {deal.fund_thesis or "Not specified"}

Document excerpts:
{context if context else "No documents uploaded — base your analysis on the deal fields above."}

Return ONLY valid JSON (no markdown fences) with this exact structure:
{{
  "mechanism_of_action": "one concise sentence describing how the asset works",
  "clinical_data_summary": "summary of key trial results and efficacy/safety data points",
  "competitive_landscape": "key competitors and how this asset differentiates",
  "unmet_need": "assessment of unmet medical need in this indication"
}}"""

    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )
    parsed = _parse_json(msg.content[0].text)

    return {
        "asset": deal.asset_name or "N/A",
        "indication": deal.indication or "N/A",
        "stage": deal.stage or "N/A",
        "mechanism_of_action": parsed.get("mechanism_of_action", "N/A"),
        "clinical_data_summary": parsed.get("clinical_data_summary", "N/A"),
        "competitive_landscape": parsed.get("competitive_landscape", "N/A"),
        "unmet_need": parsed.get("unmet_need", "N/A"),
        "citations": _citations(chunks, 3),
    }


def _financing_agent(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a biopharma investment analyst. Analyse this deal and document excerpts below, then return a JSON object.

Deal:
- Company: {deal.company_name}
- Round type: {deal.round_type or "Not specified"}
- Geography: {deal.geography or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Investment thesis: {deal.fund_thesis or "Not specified"}

Document excerpts:
{context if context else "No documents uploaded — base your analysis on the deal fields above."}

Return ONLY valid JSON (no markdown fences) with this exact structure:
{{
  "estimated_raise": "amount and currency if discernible, else 'Not disclosed'",
  "use_of_proceeds": "brief description of intended use of funds",
  "comparable_financings": "2-3 comparable recent biopharma financings at this stage/indication",
  "valuation_considerations": "implied valuation or key valuation drivers"
}}"""

    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    parsed = _parse_json(msg.content[0].text)

    return {
        "round_type": deal.round_type or "N/A",
        "geography": deal.geography or "N/A",
        "estimated_raise": parsed.get("estimated_raise", "N/A"),
        "use_of_proceeds": parsed.get("use_of_proceeds", "N/A"),
        "comparable_financings": parsed.get("comparable_financings", "N/A"),
        "valuation_considerations": parsed.get("valuation_considerations", "N/A"),
        "citations": _citations(chunks, 2),
    }


def _risk_agent(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a biopharma investment analyst. Analyse this deal and document excerpts below, then return a JSON object.

Deal:
- Company: {deal.company_name}
- Asset: {deal.asset_name or "Not specified"}
- Indication: {deal.indication or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Round: {deal.round_type or "Not specified"}

Document excerpts:
{context if context else "No documents uploaded — base your analysis on the deal fields above."}

Return ONLY valid JSON (no markdown fences). Keep each item to one short sentence.
{{
  "clinical_risks": ["risk 1", "risk 2", "risk 3"],
  "regulatory_risks": ["risk 1", "risk 2"],
  "competitive_risks": ["risk 1", "risk 2"],
  "financial_risks": ["risk 1", "risk 2"],
  "diligence_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}}"""

    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    parsed = _parse_json(msg.content[0].text)

    return {
        "clinical_risks": parsed.get("clinical_risks", ["N/A"]),
        "regulatory_risks": parsed.get("regulatory_risks", ["N/A"]),
        "competitive_risks": parsed.get("competitive_risks", ["N/A"]),
        "financial_risks": parsed.get("financial_risks", ["N/A"]),
        "diligence_questions": parsed.get("diligence_questions", ["N/A"]),
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
        .limit(10)
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
