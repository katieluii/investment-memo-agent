import json
import os
import re

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/deals", tags=["memo"])

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
_MODEL = "claude-haiku-4-5-20251001"


def _latest_outputs_by_agent(agent_outputs: list) -> dict:
    seen: dict = {}
    for ao in sorted(agent_outputs, key=lambda x: x.created_at, reverse=True):
        if ao.agent_name not in seen:
            seen[ao.agent_name] = json.loads(ao.output_json)
    return seen


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        return {}


def _build_memo(deal: models.Deal, agent_outputs: list) -> str:
    by_agent = _latest_outputs_by_agent(agent_outputs)

    d = by_agent.get("diligence_agent", {})
    f = by_agent.get("financing_agent", {})
    r = by_agent.get("risk_agent", {})

    def bullet_list(items: list) -> str:
        return "\n".join(f"- {item}" for item in items) if items else "- N/A"

    all_citations = d.get("citations", []) + f.get("citations", []) + r.get("citations", [])
    source_notes = "\n".join(
        f"- [{c.get('filename', '?')} · chunk {c.get('chunk_index', '?')}] \"{c.get('quote', '')}\""
        for c in all_citations
    ) or "No sources indexed."

    agent_summary = json.dumps(
        {
            "diligence": {k: v for k, v in d.items() if k != "citations"},
            "financing": {k: v for k, v in f.items() if k != "citations"},
            "risks": {k: v for k, v in r.items() if k != "citations"},
        },
        indent=2,
    )

    prompt = f"""You are a senior biopharma investment analyst writing an investment memo.

Deal:
- Company: {deal.company_name}
- Asset: {deal.asset_name or "Not specified"}
- Indication: {deal.indication or "Not specified"}
- Stage: {deal.stage or "Not specified"}
- Round: {deal.round_type or "Not specified"}
- Fund thesis: {deal.fund_thesis or "Not specified"}

Agent analysis:
{agent_summary}

Return ONLY valid JSON (no markdown fences) with exactly these two keys:
{{
  "executive_summary": "2-3 sentence executive summary of the investment opportunity",
  "recommendation": "2-3 sentence investment recommendation with key supporting rationale and caveats"
}}"""

    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    prose = _parse_json(msg.content[0].text)

    exec_summary = prose.get("executive_summary") or deal.fund_thesis or "N/A"
    recommendation = prose.get("recommendation") or "N/A"

    memo = f"""# Investment Memo: {deal.company_name}

---

## Executive Summary

{exec_summary}

---

## Company Overview

| Field | Value |
|---|---|
| Company | {deal.company_name} |
| Geography | {deal.geography or "N/A"} |
| Stage | {deal.stage or "N/A"} |
| Round | {deal.round_type or "N/A"} |

---

## Asset Overview

| Field | Value |
|---|---|
| Asset | {d.get("asset", "N/A")} |
| Indication | {d.get("indication", "N/A")} |
| Mechanism of Action | {d.get("mechanism_of_action", "N/A")} |
| Unmet Need | {d.get("unmet_need", "N/A")} |

---

## Diligence Summary

**Clinical Data**
{d.get("clinical_data_summary", "N/A")}

**Competitive Landscape**
{d.get("competitive_landscape", "N/A")}

---

## Financing Considerations

| Field | Value |
|---|---|
| Estimated Raise | {f.get("estimated_raise", "N/A")} |
| Use of Proceeds | {f.get("use_of_proceeds", "N/A")} |
| Comparable Financings | {f.get("comparable_financings", "N/A")} |
| Valuation | {f.get("valuation_considerations", "N/A")} |

---

## Key Risks

**Clinical Risks**
{bullet_list(r.get("clinical_risks", []))}

**Regulatory Risks**
{bullet_list(r.get("regulatory_risks", []))}

**Competitive Risks**
{bullet_list(r.get("competitive_risks", []))}

**Financial Risks**
{bullet_list(r.get("financial_risks", []))}

---

## Diligence Questions

{bullet_list(r.get("diligence_questions", []))}

---

## Recommendation

{recommendation}

---

## Source Notes

{source_notes}
"""
    return memo.strip()


@router.post("/{deal_id}/generate-memo", response_model=schemas.MemoOut)
def generate_memo(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    agent_outputs = (
        db.query(models.AgentOutput)
        .filter(models.AgentOutput.deal_id == deal_id)
        .order_by(models.AgentOutput.created_at.desc())
        .all()
    )
    if not agent_outputs:
        raise HTTPException(status_code=400, detail="Run agents first before generating a memo")

    markdown = _build_memo(deal, agent_outputs)
    memo = models.Memo(deal_id=deal_id, markdown=markdown)
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return memo


@router.get("/{deal_id}/memo", response_model=schemas.MemoOut)
def get_memo(deal_id: int, db: Session = Depends(get_db)):
    memo = (
        db.query(models.Memo)
        .filter(models.Memo.deal_id == deal_id)
        .order_by(models.Memo.created_at.desc())
        .first()
    )
    if not memo:
        raise HTTPException(status_code=404, detail="No memo generated yet")
    return memo
