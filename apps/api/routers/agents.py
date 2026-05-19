import json
import os
import re
from datetime import datetime

import anthropic
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import SessionLocal, get_db

router = APIRouter(prefix="/deals", tags=["agents"])

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
_MODEL = "claude-haiku-4-5-20251001"
_FALLBACK = "claude-sonnet-4-6"
# Limit to 2 searches per agent — reduces cost and latency significantly
_SEARCH_TOOL = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 2}]


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
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                return {}
        return {}


def _call_claude(prompt: str, max_tokens: int = 1500) -> str:
    """Try Haiku with web search, fall back to Sonnet without search on failure."""
    try:
        response = _client.messages.create(
            model=_MODEL,
            max_tokens=max_tokens,
            tools=_SEARCH_TOOL,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in response.content if hasattr(b, "text") and b.type == "text")
    except Exception:
        # Fall back to Sonnet without web search
        response = _client.messages.create(
            model=_FALLBACK,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in response.content if hasattr(b, "text"))


def _scientific_diligence(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a scientific diligence analyst at a biotech VC fund. Assess the scientific and clinical merit of this deal.

Search for: recent clinical results for {deal.asset_name or deal.company_name} in {deal.indication or "this indication"}, key scientific debates around this mechanism.

Deal: {deal.company_name} | {deal.asset_name or "N/A"} | {deal.indication or "N/A"} | {deal.stage or "N/A"}
Fund thesis: {deal.fund_thesis or "Not specified"}

Documents:
{context if context else "No documents uploaded."}

Return ONLY valid JSON (no markdown fences), one short sentence per list item:
{{
  "mechanism_of_action": "one sentence",
  "clinical_evidence": "summary of available data",
  "scientific_opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "scientific_risks": ["risk 1", "risk 2", "risk 3"],
  "diligence_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}}"""

    parsed = _parse_json(_call_claude(prompt))
    return {
        "mechanism_of_action": parsed.get("mechanism_of_action", "N/A"),
        "clinical_evidence": parsed.get("clinical_evidence", "N/A"),
        "scientific_opportunities": parsed.get("scientific_opportunities", ["N/A"]),
        "scientific_risks": parsed.get("scientific_risks", ["N/A"]),
        "diligence_questions": parsed.get("diligence_questions", ["N/A"]),
        "citations": _citations(chunks, 3),
    }


def _competitive_intelligence(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a competitive intelligence analyst at a biotech VC fund.

Search for: all drugs approved or in development for {deal.indication or "this indication"}, recent approvals and market size data.

Deal: {deal.company_name} | {deal.asset_name or "N/A"} | {deal.indication or "N/A"} | {deal.stage or "N/A"}
Fund thesis: {deal.fund_thesis or "Not specified"}

Documents:
{context if context else "No documents uploaded."}

Return ONLY valid JSON (no markdown fences), one short sentence per list item:
{{
  "market_overview": "2-3 sentences on market size, patient population, standard of care",
  "differentiation": "how this asset differentiates from competitors",
  "competitive_opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "competitive_risks": ["risk 1", "risk 2", "risk 3"],
  "diligence_questions": ["question 1", "question 2", "question 3"]
}}"""

    parsed = _parse_json(_call_claude(prompt))
    return {
        "market_overview": parsed.get("market_overview", "N/A"),
        "differentiation": parsed.get("differentiation", "N/A"),
        "competitive_opportunities": parsed.get("competitive_opportunities", ["N/A"]),
        "competitive_risks": parsed.get("competitive_risks", ["N/A"]),
        "diligence_questions": parsed.get("diligence_questions", ["N/A"]),
        "citations": _citations(chunks, 2),
    }


def _clinical_regulatory(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a clinical and regulatory strategy analyst at a biotech VC fund.

Search for: FDA/EMA regulatory precedent for {deal.indication or "this indication"}, recent approvals, breakthrough designations, or CRLs in this space.

Deal: {deal.company_name} | {deal.asset_name or "N/A"} | {deal.indication or "N/A"} | {deal.stage or "N/A"}
Fund thesis: {deal.fund_thesis or "Not specified"}

Documents:
{context if context else "No documents uploaded."}

Return ONLY valid JSON (no markdown fences), one short sentence per list item:
{{
  "regulatory_pathway": "recommended strategy and likely path to approval",
  "precedent": "relevant recent approvals or rejections that inform risk",
  "regulatory_opportunities": ["opportunity 1", "opportunity 2"],
  "regulatory_risks": ["risk 1", "risk 2", "risk 3"],
  "diligence_questions": ["question 1", "question 2", "question 3"]
}}"""

    parsed = _parse_json(_call_claude(prompt))
    return {
        "regulatory_pathway": parsed.get("regulatory_pathway", "N/A"),
        "precedent": parsed.get("precedent", "N/A"),
        "regulatory_opportunities": parsed.get("regulatory_opportunities", ["N/A"]),
        "regulatory_risks": parsed.get("regulatory_risks", ["N/A"]),
        "diligence_questions": parsed.get("diligence_questions", ["N/A"]),
        "citations": _citations(chunks, 2),
    }


def _financing_valuation(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a financing and valuation analyst at a biotech VC fund.

Search for: recent {deal.stage or "similar stage"} biotech financings in {deal.indication or "this indication"}, comparable M&A transactions.

Deal: {deal.company_name} | {deal.round_type or "N/A"} | {deal.stage or "N/A"}
Fund thesis: {deal.fund_thesis or "Not specified"}

Documents:
{context if context else "No documents uploaded."}

Return ONLY valid JSON (no markdown fences), one short sentence per list item:
{{
  "comparable_financings": "3-4 specific comparable recent financings with amounts",
  "valuation_considerations": "key valuation drivers and implied range if estimable",
  "financing_opportunities": ["opportunity 1", "opportunity 2"],
  "financing_risks": ["risk 1", "risk 2"],
  "diligence_questions": ["question 1", "question 2", "question 3"]
}}"""

    parsed = _parse_json(_call_claude(prompt))
    return {
        "round_type": deal.round_type or "N/A",
        "comparable_financings": parsed.get("comparable_financings", "N/A"),
        "valuation_considerations": parsed.get("valuation_considerations", "N/A"),
        "financing_opportunities": parsed.get("financing_opportunities", ["N/A"]),
        "financing_risks": parsed.get("financing_risks", ["N/A"]),
        "diligence_questions": parsed.get("diligence_questions", ["N/A"]),
        "citations": _citations(chunks, 2),
    }


_AGENTS = {
    "scientific_diligence": _scientific_diligence,
    "competitive_intelligence": _competitive_intelligence,
    "clinical_regulatory": _clinical_regulatory,
    "financing_valuation": _financing_valuation,
}


def _run_agents_task(deal_id: int, run_id: int) -> None:
    """Background task — runs agents and updates status when done."""
    db = SessionLocal()
    try:
        deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
        if not deal:
            raise ValueError(f"Deal {deal_id} not found")

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

        run = db.query(models.AgentRun).filter(models.AgentRun.id == run_id).first()
        if run:
            run.status = "completed"
            run.completed_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        db.rollback()
        run = db.query(models.AgentRun).filter(models.AgentRun.id == run_id).first()
        if run:
            run.status = "failed"
            run.error = str(e)
            run.completed_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()


@router.post("/{deal_id}/run-agents", response_model=schemas.AgentRunOut)
def run_agents(deal_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not db.query(models.Deal).filter(models.Deal.id == deal_id).first():
        raise HTTPException(status_code=404, detail="Deal not found")

    run = models.AgentRun(deal_id=deal_id, status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(_run_agents_task, deal_id, run.id)
    return run


@router.get("/{deal_id}/agent-run-status", response_model=schemas.AgentRunOut)
def get_run_status(deal_id: int, db: Session = Depends(get_db)):
    run = (
        db.query(models.AgentRun)
        .filter(models.AgentRun.deal_id == deal_id)
        .order_by(models.AgentRun.started_at.desc())
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="No agent run found")
    return run


@router.get("/{deal_id}/agent-outputs", response_model=list[schemas.AgentOutputOut])
def get_agent_outputs(deal_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.AgentOutput)
        .filter(models.AgentOutput.deal_id == deal_id)
        .order_by(models.AgentOutput.created_at.desc())
        .all()
    )
