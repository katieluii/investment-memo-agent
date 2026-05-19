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
_SONNET = "claude-sonnet-4-6"
_SEARCH_TOOL = [{"type": "web_search_20250305", "name": "web_search"}]


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


def _call_claude(prompt: str, max_tokens: int = 2000, use_search: bool = True) -> str:
    """Call Claude with optional web search. Falls back to no-search on error."""
    kwargs = dict(
        model=_SONNET,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    if use_search:
        kwargs["tools"] = _SEARCH_TOOL
    try:
        response = _client.messages.create(**kwargs)
        return "".join(b.text for b in response.content if hasattr(b, "text") and b.type == "text")
    except Exception:
        if use_search:
            return _call_claude(prompt, max_tokens, use_search=False)
        raise


def _scientific_diligence(deal: models.Deal, chunks: list) -> dict:
    context = _chunk_context(chunks)
    prompt = f"""You are a scientific diligence analyst at a biotech VC fund. Assess the scientific and clinical merit of this deal.

Search the web for:
- Recent clinical trial results and publications for {deal.asset_name or deal.company_name} in {deal.indication or "this indication"}
- ClinicalTrials.gov data for this compound or mechanism
- Key scientific debates around this mechanism of action

Deal:
- Company: {deal.company_name}
- Asset: {deal.asset_name or "Not specified"}
- Indication: {deal.indication or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Fund thesis: {deal.fund_thesis or "Not specified"}

Proprietary document context:
{context if context else "No documents uploaded — use your research knowledge."}

Return ONLY valid JSON (no markdown fences). Keep each list item to one concise sentence.
{{
  "mechanism_of_action": "one sentence describing how the asset works",
  "clinical_evidence": "summary of available clinical or preclinical data and what it shows",
  "scientific_opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "scientific_risks": ["risk 1", "risk 2", "risk 3"],
  "diligence_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}}"""

    raw = _call_claude(prompt, max_tokens=2000)
    parsed = _parse_json(raw)
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
    prompt = f"""You are a competitive intelligence analyst at a biotech VC fund. Map the competitive landscape for this deal.

Search the web for:
- All drugs in development or approved for {deal.indication or "this indication"}
- Recent clinical readouts, approvals, or failures in this space
- Market size estimates and patient population data for {deal.indication or "this indication"}

Deal:
- Company: {deal.company_name}
- Asset: {deal.asset_name or "Not specified"}
- Indication: {deal.indication or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Fund thesis: {deal.fund_thesis or "Not specified"}

Proprietary document context:
{context if context else "No documents uploaded — use your research knowledge."}

Return ONLY valid JSON (no markdown fences). Keep each list item to one concise sentence.
{{
  "market_overview": "2-3 sentences on market size, patient population, and current standard of care",
  "differentiation": "how this asset differentiates from existing and emerging competitors",
  "competitive_opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "competitive_risks": ["risk 1", "risk 2", "risk 3"],
  "diligence_questions": ["question 1", "question 2", "question 3"]
}}"""

    raw = _call_claude(prompt, max_tokens=2000)
    parsed = _parse_json(raw)
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

Search the web for:
- FDA and EMA regulatory precedent for approvals in {deal.indication or "this indication"}
- Recent FDA advisory committee meetings, complete response letters, or breakthrough therapy designations in this space
- Recommended clinical endpoints and trial designs for {deal.indication or "this indication"}

Deal:
- Company: {deal.company_name}
- Asset: {deal.asset_name or "Not specified"}
- Indication: {deal.indication or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Fund thesis: {deal.fund_thesis or "Not specified"}

Proprietary document context:
{context if context else "No documents uploaded — use your research knowledge."}

Return ONLY valid JSON (no markdown fences). Keep each list item to one concise sentence.
{{
  "regulatory_pathway": "recommended regulatory strategy and likely path to approval",
  "precedent": "relevant recent approvals or rejections that inform this asset's regulatory risk",
  "regulatory_opportunities": ["opportunity 1", "opportunity 2"],
  "regulatory_risks": ["risk 1", "risk 2", "risk 3"],
  "diligence_questions": ["question 1", "question 2", "question 3"]
}}"""

    raw = _call_claude(prompt, max_tokens=2000)
    parsed = _parse_json(raw)
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

Search the web for:
- Recent Series A/B/C financings for {deal.stage or "similar stage"} biotechs in {deal.indication or "this indication"} over the past 2 years
- Comparable M&A transactions or licensing deals in this therapeutic area
- Public company valuations in this space for benchmarking

Deal:
- Company: {deal.company_name}
- Round type: {deal.round_type or "Not specified"}
- Geography: N/A
- Stage: {deal.stage or "Not specified"}
- Fund thesis: {deal.fund_thesis or "Not specified"}

Proprietary document context:
{context if context else "No documents uploaded — use your research knowledge."}

Return ONLY valid JSON (no markdown fences). Keep each list item to one concise sentence.
{{
  "comparable_financings": "3-4 specific comparable recent financings with amounts and context",
  "valuation_considerations": "key valuation drivers, implied range if estimable, and key assumptions",
  "financing_opportunities": ["opportunity 1", "opportunity 2"],
  "financing_risks": ["risk 1", "risk 2"],
  "diligence_questions": ["question 1", "question 2", "question 3"]
}}"""

    raw = _call_claude(prompt, max_tokens=2000)
    parsed = _parse_json(raw)
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
