"""
Creates a demo deal with AI-generated agent outputs and memo on first startup.
Skips silently if deals already exist or ANTHROPIC_API_KEY is not set.
"""

import json
import os
import re

import anthropic
from sqlalchemy.orm import Session

import models
from database import SessionLocal

_MODEL = "claude-haiku-4-5-20251001"

_DEMO_DEAL = {
    "company_name": "Axon Therapeutics",
    "asset_name": "AXN-247",
    "indication": "HR+/HER2- advanced breast cancer",
    "stage": "Phase 2b",
    "round_type": "Series B",
    "geography": "USA",
    "fund_thesis": (
        "AXN-247 is a next-generation CDK4/6 inhibitor with a differentiated "
        "selectivity profile designed to address the primary resistance mechanism "
        "seen with first-generation CDK4/6 inhibitors. The Phase 2b SUMMIT trial "
        "is enrolling patients who have progressed on palbociclib, ribociclib, or "
        "abemaciclib, with a primary endpoint of PFS."
    ),
}

_DEMO_CHUNKS = [
    {
        "filename": "SUMMIT_trial_synopsis.txt",
        "text": (
            "SUMMIT Phase 2b Trial Synopsis\n"
            "Primary endpoint: Progression-free survival (PFS) in CDK4/6i-pretreated "
            "HR+/HER2- advanced breast cancer patients. 148 patients enrolled across "
            "12 sites (US/EU). Interim analysis at 6 months: median PFS 7.4 months "
            "(95% CI 5.8–9.1) vs historical control 3.8 months on chemotherapy. "
            "ORR 28%. Grade 3/4 AEs: neutropenia 12%, fatigue 6%, nausea 4%. "
            "No treatment-related discontinuations in first 24 weeks."
        ),
    },
    {
        "filename": "data_room_overview.txt",
        "text": (
            "Series B Financing Overview\n"
            "Target raise: $95M. Lead investor: Novo Holdings. Co-investors: Versant "
            "Ventures, Atlas Venture. Use of proceeds: Fund SUMMIT Phase 2b to "
            "primary completion (Q4 2026), initiate Phase 3 design, expand IP estate, "
            "and build out commercial readiness team. Post-money valuation: $380M. "
            "Key milestones funded: topline Phase 2b data (Q3 2026), IND filing for "
            "AXN-247 combination arm (Q2 2026), patent grant for selective CDK4 "
            "binding conformation (expected Q1 2026)."
        ),
    },
    {
        "filename": "competitive_landscape.txt",
        "text": (
            "CDK4/6 Inhibitor Competitive Landscape\n"
            "Approved: palbociclib (Pfizer, ~$5B peak sales), ribociclib (Novartis), "
            "abemaciclib (Lilly). Key resistance mechanisms: RB1 loss, CCND1 "
            "amplification, CDK6 upregulation. AXN-247 differentiation: selective "
            "CDK4 inhibition (>50x selectivity over CDK6) preserves T-cell function "
            "enabling combination with immunotherapy; shown to retain activity in "
            "CCND1-amplified cell lines. Emerging competition: Relay Therapeutics "
            "RLY-9966 (Phase 1), G1 Therapeutics trilaciclib (differentiated MoA). "
            "Market opportunity: ~180,000 US patients annually progress on first-line "
            "CDK4/6i; no approved targeted option in this setting."
        ),
    },
]


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        return {}


def _run_agent(client: anthropic.Anthropic, deal: models.Deal, agent_name: str, chunks_text: str) -> dict:
    if agent_name == "diligence_agent":
        prompt = f"""You are a biopharma investment analyst. Analyse this deal and return a JSON object.

Deal: {deal.company_name} | {deal.asset_name} | {deal.indication} | {deal.stage}
Fund thesis: {deal.fund_thesis}

Document excerpts:
{chunks_text}

Return ONLY valid JSON (no markdown fences):
{{
  "mechanism_of_action": "one concise sentence",
  "clinical_data_summary": "summary of key trial results",
  "competitive_landscape": "key competitors and differentiation",
  "unmet_need": "assessment of unmet medical need"
}}"""
        max_tokens = 700
    elif agent_name == "financing_agent":
        prompt = f"""You are a biopharma investment analyst. Analyse this deal and return a JSON object.

Deal: {deal.company_name} | {deal.round_type} | {deal.geography} | {deal.stage}
Fund thesis: {deal.fund_thesis}

Document excerpts:
{chunks_text}

Return ONLY valid JSON (no markdown fences):
{{
  "estimated_raise": "amount and currency",
  "use_of_proceeds": "brief description",
  "comparable_financings": "2-3 comparable recent financings",
  "valuation_considerations": "implied valuation or key drivers"
}}"""
        max_tokens = 600
    else:  # risk_agent
        prompt = f"""You are a biopharma investment analyst. Analyse this deal and return a JSON object.

Deal: {deal.company_name} | {deal.asset_name} | {deal.indication} | {deal.stage}

Document excerpts:
{chunks_text}

Return ONLY valid JSON (no markdown fences):
{{
  "clinical_risks": ["risk 1", "risk 2", "risk 3"],
  "regulatory_risks": ["risk 1", "risk 2"],
  "competitive_risks": ["risk 1", "risk 2"],
  "financial_risks": ["risk 1", "risk 2"],
  "diligence_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}}"""
        max_tokens = 800

    msg = client.messages.create(
        model=_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse_json(msg.content[0].text)


def _build_memo_prose(client: anthropic.Anthropic, deal: models.Deal, outputs: dict) -> dict:
    agent_summary = json.dumps(
        {k: {ik: iv for ik, iv in v.items() if ik != "citations"} for k, v in outputs.items()},
        indent=2,
    )
    prompt = f"""You are a senior biopharma investment analyst.

Deal: {deal.company_name} | {deal.asset_name} | {deal.indication} | {deal.stage} | {deal.round_type}
Fund thesis: {deal.fund_thesis}

Agent analysis:
{agent_summary}

Return ONLY valid JSON (no markdown fences):
{{
  "executive_summary": "2-3 sentence executive summary of the investment opportunity",
  "recommendation": "2-3 sentence investment recommendation with rationale and caveats"
}}"""

    msg = client.messages.create(
        model=_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse_json(msg.content[0].text)


def run(db: Session) -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return

    if db.query(models.Deal).first():
        return

    client = anthropic.Anthropic(api_key=api_key)

    deal = models.Deal(**_DEMO_DEAL)
    db.add(deal)
    db.flush()

    chunks_text = "\n\n---\n\n".join(
        f"[{c['filename']}]\n{c['text']}" for c in _DEMO_CHUNKS
    )

    for idx, chunk_data in enumerate(_DEMO_CHUNKS):
        doc = models.Document(
            deal_id=deal.id,
            filename=chunk_data["filename"],
            file_path=f"/demo/{chunk_data['filename']}",
            status="indexed",
        )
        db.add(doc)
        db.flush()
        db.add(
            models.DocumentChunk(
                deal_id=deal.id,
                document_id=doc.id,
                chunk_index=0,
                chunk_text=chunk_data["text"],
            )
        )

    agent_outputs: dict = {}
    for agent_name in ("diligence_agent", "financing_agent", "risk_agent"):
        parsed = _run_agent(client, deal, agent_name, chunks_text)
        if agent_name == "diligence_agent":
            output = {
                "asset": deal.asset_name or "N/A",
                "indication": deal.indication or "N/A",
                "stage": deal.stage or "N/A",
                **parsed,
                "citations": [{"filename": c["filename"], "chunk_index": 0, "quote": c["text"][:120]} for c in _DEMO_CHUNKS[:3]],
            }
        elif agent_name == "financing_agent":
            output = {
                "round_type": deal.round_type or "N/A",
                "geography": deal.geography or "N/A",
                **parsed,
                "citations": [{"filename": c["filename"], "chunk_index": 0, "quote": c["text"][:120]} for c in _DEMO_CHUNKS[:2]],
            }
        else:
            output = {
                **parsed,
                "citations": [{"filename": c["filename"], "chunk_index": 0, "quote": c["text"][:120]} for c in _DEMO_CHUNKS[:2]],
            }
        agent_outputs[agent_name] = output
        db.add(models.AgentOutput(deal_id=deal.id, agent_name=agent_name, output_json=json.dumps(output, indent=2)))

    prose = _build_memo_prose(client, deal, agent_outputs)
    d = agent_outputs.get("diligence_agent", {})
    f = agent_outputs.get("financing_agent", {})
    r = agent_outputs.get("risk_agent", {})

    def bullet_list(items):
        return "\n".join(f"- {item}" for item in items) if items else "- N/A"

    markdown = f"""# Investment Memo: {deal.company_name}

---

## Executive Summary

{prose.get("executive_summary", deal.fund_thesis)}

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

{prose.get("recommendation", "N/A")}

---

## Source Notes

- [SUMMIT_trial_synopsis.txt · chunk 0] "{_DEMO_CHUNKS[0]["text"][:120]}..."
- [data_room_overview.txt · chunk 0] "{_DEMO_CHUNKS[1]["text"][:120]}..."
- [competitive_landscape.txt · chunk 0] "{_DEMO_CHUNKS[2]["text"][:120]}..."
""".strip()

    db.add(models.Memo(deal_id=deal.id, markdown=markdown))
    db.commit()
