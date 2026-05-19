"""
Seeds a demo deal with static pre-written content on first startup.
Runs whenever the DB is empty, regardless of ANTHROPIC_API_KEY.
"""

import json

from sqlalchemy.orm import Session

import models

_DEMO_DEAL = {
    "company_name": "Axon Therapeutics",
    "asset_name": "AXN-247",
    "indication": "HR+/HER2- advanced breast cancer",
    "stage": "Phase 2b",
    "round_type": "Series B",
    "geography": "USA",
    "fund_thesis": (
        "AXN-247 is a next-generation CDK4/6 inhibitor with a differentiated selectivity "
        "profile designed to address the primary resistance mechanism seen with first-generation "
        "CDK4/6 inhibitors. The Phase 2b SUMMIT trial is enrolling patients who have progressed "
        "on palbociclib, ribociclib, or abemaciclib, with a primary endpoint of PFS."
    ),
}

_DEMO_CHUNKS = [
    {
        "filename": "SUMMIT_trial_synopsis.txt",
        "text": (
            "SUMMIT Phase 2b Trial Synopsis. Primary endpoint: Progression-free survival (PFS) "
            "in CDK4/6i-pretreated HR+/HER2- advanced breast cancer patients. 148 patients "
            "enrolled across 12 sites (US/EU). Interim analysis at 6 months: median PFS "
            "7.4 months (95% CI 5.8-9.1) vs historical control 3.8 months on chemotherapy. "
            "ORR 28%. Grade 3/4 AEs: neutropenia 12%, fatigue 6%, nausea 4%. No "
            "treatment-related discontinuations in first 24 weeks."
        ),
    },
    {
        "filename": "data_room_overview.txt",
        "text": (
            "Series B Financing Overview. Target raise: $95M. Lead investor: Novo Holdings. "
            "Co-investors: Versant Ventures, Atlas Venture. Use of proceeds: Fund SUMMIT Phase 2b "
            "to primary completion (Q4 2026), initiate Phase 3 design, expand IP estate, and "
            "build out commercial readiness team. Post-money valuation: $380M."
        ),
    },
    {
        "filename": "competitive_landscape.txt",
        "text": (
            "CDK4/6 Inhibitor Competitive Landscape. Approved agents: palbociclib (Pfizer), "
            "ribociclib (Novartis), abemaciclib (Lilly). AXN-247 differentiation: selective "
            "CDK4 inhibition (>50x selectivity over CDK6) preserves T-cell function. Retains "
            "activity in CCND1-amplified cell lines. ~180,000 US patients annually progress "
            "on first-line CDK4/6i with no approved targeted option in this setting."
        ),
    },
]

_DILIGENCE_OUTPUT = {
    "asset": "AXN-247",
    "indication": "HR+/HER2- advanced breast cancer",
    "stage": "Phase 2b",
    "mechanism_of_action": "Selective CDK4 inhibitor (>50x selectivity over CDK6) that blocks cell cycle progression while preserving T-cell function, enabling combination with immunotherapy and activity in CDK4/6i-resistant tumours.",
    "clinical_data_summary": "SUMMIT Phase 2b interim (n=148): median PFS 7.4 months vs 3.8-month historical control on chemotherapy; ORR 28%; Grade 3/4 AEs neutropenia 12%, fatigue 6%, nausea 4%; no treatment-related discontinuations in first 24 weeks.",
    "competitive_landscape": "Approved CDK4/6i (palbociclib, ribociclib, abemaciclib) all lose activity post-progression; AXN-247 differentiates via CDK4 selectivity and CCND1-amplification activity. No approved targeted agent in this post-CDK4/6i setting.",
    "unmet_need": "~180,000 US patients/year progress on first-line CDK4/6i with no approved targeted therapy; current standard is chemotherapy with poor outcomes, representing a high-value unmet need.",
    "citations": [
        {"filename": "SUMMIT_trial_synopsis.txt", "chunk_index": 0, "quote": "Interim analysis at 6 months: median PFS 7.4 months (95% CI 5.8-9.1) vs historical control 3.8 months..."},
        {"filename": "competitive_landscape.txt", "chunk_index": 0, "quote": "~180,000 US patients annually progress on first-line CDK4/6i with no approved targeted option..."},
    ],
}

_FINANCING_OUTPUT = {
    "round_type": "Series B",
    "geography": "USA",
    "estimated_raise": "$95M",
    "use_of_proceeds": "Fund SUMMIT Phase 2b to primary completion (Q4 2026), initiate Phase 3 design, expand IP estate, and build out commercial readiness team.",
    "comparable_financings": "Relay Therapeutics Series C $150M (2021, precision oncology Phase 1); Blueprint Medicines Series C $100M (2017, pre-Phase 2 data package); Olema Pharmaceuticals $116M Series B (2020, ER+ breast cancer CDK4/6i combination).",
    "valuation_considerations": "Post-money $380M implied by $95M raise. Supported by Phase 2b interim PFS data exceeding historical control, validated mechanism (CDK4/6i class $10B+ market), and lead investor Novo Holdings. Key value inflection: SUMMIT primary endpoint readout Q4 2026.",
    "citations": [
        {"filename": "data_room_overview.txt", "chunk_index": 0, "quote": "Target raise: $95M. Lead investor: Novo Holdings. Co-investors: Versant Ventures, Atlas Venture..."},
    ],
}

_RISK_OUTPUT = {
    "clinical_risks": [
        "SUMMIT primary endpoint may not reach statistical significance if interim PFS benefit is not maintained at final analysis.",
        "CDK4/6i-resistant patient population is heterogeneous; biomarker stratification may be needed to identify responders.",
        "Neutropenia rate (12% G3/4) could limit dose intensity and complicate combination strategies.",
    ],
    "regulatory_risks": [
        "FDA may require a randomised Phase 3 vs. chemotherapy for accelerated approval given single-arm Phase 2b design.",
        "IP landscape for CDK4/6 inhibitors is dense; freedom-to-operate review needed before NDA filing.",
    ],
    "competitive_risks": [
        "Relay Therapeutics RLY-9966 (Phase 1 CDK4-selective inhibitor) could reach Phase 2 readout on a similar timeline.",
        "Large pharma CDK4/6i franchises (Pfizer, Lilly) may pursue combination strategies that erode the post-progression market.",
    ],
    "financial_risks": [
        "$95M Series B funds through Phase 2b completion but not Phase 3; a $200M+ Series C will be required before commercialisation.",
        "Phase 3 design and scale-up costs are not yet modelled; cost overruns could compress runway.",
    ],
    "diligence_questions": [
        "What is the planned Phase 3 design — randomised vs. chemotherapy, or combination arm with immunotherapy?",
        "What biomarker strategy is in place to identify patients most likely to respond to AXN-247 post-CDK4/6i?",
        "What is the manufacturing process for AXN-247, and has CMC work been completed to support Phase 3 scale?",
        "Has a Freedom-to-Operate analysis been completed against palbociclib, ribociclib, and abemaciclib IP estates?",
        "What are the terms of the Novo Holdings lead investment — is there a board seat, pro-rata rights, or follow-on commitment?",
    ],
    "citations": [
        {"filename": "SUMMIT_trial_synopsis.txt", "chunk_index": 0, "quote": "Grade 3/4 AEs: neutropenia 12%, fatigue 6%, nausea 4%..."},
        {"filename": "competitive_landscape.txt", "chunk_index": 0, "quote": "AXN-247 differentiation: selective CDK4 inhibition (>50x selectivity over CDK6)..."},
    ],
}

_MEMO_MARKDOWN = """# Investment Memo: Axon Therapeutics

---

## Executive Summary

Axon Therapeutics is raising a $95M Series B to advance AXN-247, a selective CDK4 inhibitor, through its Phase 2b SUMMIT trial in CDK4/6i-pretreated HR+/HER2- advanced breast cancer — a ~180,000 patient/year US market with no approved targeted option. Interim data show a median PFS of 7.4 months versus a 3.8-month historical control on chemotherapy, supporting a differentiated clinical profile. The key investment thesis rests on SUMMIT primary endpoint readout (Q4 2026) as the primary value inflection, with the post-money valuation of $380M reflecting both early clinical promise and the capital intensity ahead of a Phase 3 programme.

---

## Company Overview

| Field | Value |
|---|---|
| Company | Axon Therapeutics |
| Geography | USA |
| Stage | Phase 2b |
| Round | Series B |

---

## Asset Overview

| Field | Value |
|---|---|
| Asset | AXN-247 |
| Indication | HR+/HER2- advanced breast cancer |
| Mechanism of Action | Selective CDK4 inhibitor (>50x selectivity over CDK6) that blocks cell cycle progression while preserving T-cell function, enabling combination with immunotherapy and activity in CDK4/6i-resistant tumours. |
| Unmet Need | ~180,000 US patients/year progress on first-line CDK4/6i with no approved targeted therapy; current standard is chemotherapy with poor outcomes. |

---

## Diligence Summary

**Clinical Data**
SUMMIT Phase 2b interim (n=148): median PFS 7.4 months vs 3.8-month historical control on chemotherapy; ORR 28%; Grade 3/4 AEs neutropenia 12%, fatigue 6%, nausea 4%; no treatment-related discontinuations in first 24 weeks.

**Competitive Landscape**
Approved CDK4/6i (palbociclib, ribociclib, abemaciclib) all lose activity post-progression; AXN-247 differentiates via CDK4 selectivity and CCND1-amplification activity. No approved targeted agent in this post-CDK4/6i setting.

---

## Financing Considerations

| Field | Value |
|---|---|
| Estimated Raise | $95M |
| Use of Proceeds | Fund SUMMIT Phase 2b to primary completion (Q4 2026), initiate Phase 3 design, expand IP estate, and build out commercial readiness team. |
| Comparable Financings | Relay Therapeutics Series C $150M (2021); Blueprint Medicines Series C $100M (2017); Olema Pharmaceuticals $116M Series B (2020, ER+ breast cancer). |
| Valuation | Post-money $380M. Key inflection: SUMMIT primary endpoint readout Q4 2026. |

---

## Key Risks

**Clinical Risks**
- SUMMIT primary endpoint may not reach statistical significance if interim PFS benefit is not maintained at final analysis.
- CDK4/6i-resistant patient population is heterogeneous; biomarker stratification may be needed to identify responders.
- Neutropenia rate (12% G3/4) could limit dose intensity and complicate combination strategies.

**Regulatory Risks**
- FDA may require a randomised Phase 3 vs. chemotherapy for accelerated approval given single-arm Phase 2b design.
- IP landscape for CDK4/6 inhibitors is dense; freedom-to-operate review needed before NDA filing.

**Competitive Risks**
- Relay Therapeutics RLY-9966 (Phase 1 CDK4-selective inhibitor) could reach Phase 2 readout on a similar timeline.
- Large pharma CDK4/6i franchises (Pfizer, Lilly) may pursue combination strategies that erode the post-progression market.

**Financial Risks**
- $95M Series B funds through Phase 2b completion but not Phase 3; a $200M+ Series C will be required before commercialisation.
- Phase 3 design and scale-up costs are not yet modelled; cost overruns could compress runway.

---

## Diligence Questions

- What is the planned Phase 3 design — randomised vs. chemotherapy, or combination arm with immunotherapy?
- What biomarker strategy is in place to identify patients most likely to respond to AXN-247 post-CDK4/6i?
- What is the manufacturing process for AXN-247, and has CMC work been completed to support Phase 3 scale?
- Has a Freedom-to-Operate analysis been completed against palbociclib, ribociclib, and abemaciclib IP estates?
- What are the terms of the Novo Holdings lead investment — board seat, pro-rata rights, or follow-on commitment?

---

## Recommendation

AXN-247 presents a compelling opportunity in a validated mechanism with a differentiated clinical profile in a high-unmet-need post-CDK4/6i setting. We recommend progressing to full diligence, contingent on review of the complete SUMMIT data package, CMC status, and Phase 3 design plans; the $380M post-money valuation is reasonable but leaves limited margin if the primary endpoint is borderline.

---

## Source Notes

- [SUMMIT_trial_synopsis.txt · chunk 0] "Interim analysis at 6 months: median PFS 7.4 months (95% CI 5.8-9.1) vs historical control 3.8 months..."
- [data_room_overview.txt · chunk 0] "Target raise: $95M. Lead investor: Novo Holdings. Co-investors: Versant Ventures, Atlas Venture..."
- [competitive_landscape.txt · chunk 0] "~180,000 US patients annually progress on first-line CDK4/6i with no approved targeted option..."
""".strip()


def run(db: Session) -> None:
    if db.query(models.Deal).first():
        return

    deal = models.Deal(**_DEMO_DEAL)
    db.add(deal)
    db.flush()

    for chunk_data in _DEMO_CHUNKS:
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

    for name, output in [
        ("diligence_agent", _DILIGENCE_OUTPUT),
        ("financing_agent", _FINANCING_OUTPUT),
        ("risk_agent", _RISK_OUTPUT),
    ]:
        db.add(models.AgentOutput(deal_id=deal.id, agent_name=name, output_json=json.dumps(output, indent=2)))

    db.add(models.Memo(deal_id=deal.id, markdown=_MEMO_MARKDOWN))
    db.commit()
