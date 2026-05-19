"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AgentFeedback,
  AgentOutput,
  AgentRun,
  generateMemo,
  getAgentOutputs,
  getAgentRunStatus,
  getFeedback,
  runAgents,
  saveFeedback,
} from "../../../../lib/api";

// ── Types for parsed agent outputs ───────────────────────────────────────────

interface ScientificDiligence {
  mechanism_of_action?: string;
  clinical_evidence?: string;
  scientific_opportunities?: string[];
  scientific_risks?: string[];
  diligence_questions?: string[];
}

interface CompetitiveIntelligence {
  market_overview?: string;
  differentiation?: string;
  competitive_opportunities?: string[];
  competitive_risks?: string[];
  diligence_questions?: string[];
}

interface ClinicalRegulatory {
  regulatory_pathway?: string;
  precedent?: string;
  regulatory_opportunities?: string[];
  regulatory_risks?: string[];
  diligence_questions?: string[];
}

interface FinancingValuation {
  round_type?: string;
  comparable_financings?: string;
  valuation_considerations?: string;
  financing_opportunities?: string[];
  financing_risks?: string[];
  diligence_questions?: string[];
}

// ── Shared UI components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <p style={{ fontWeight: "bold", color: "#555", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.25rem" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  if (!items || items.length === 0 || items[0] === "N/A") return <p style={{ color: "#999", fontSize: "0.9rem" }}>None identified.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
      {items.map((item, i) => (
        <li key={i} style={{ color, fontSize: "0.9rem", marginBottom: "0.2rem" }}>{item}</li>
      ))}
    </ul>
  );
}

function QuestionList({ items }: { items: string[] }) {
  if (!items || items.length === 0 || items[0] === "N/A") return <p style={{ color: "#999", fontSize: "0.9rem" }}>None generated.</p>;
  return (
    <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
      {items.map((q, i) => (
        <li key={i} style={{ fontSize: "0.9rem", marginBottom: "0.3rem", color: "#1e3a5f" }}>{q}</li>
      ))}
    </ol>
  );
}

// ── Feedback box per agent ────────────────────────────────────────────────────

function FeedbackBox({
  dealId,
  agentName,
  existing,
  onSaved,
}: {
  dealId: number;
  agentName: string;
  existing: string;
  onSaved: (text: string) => void;
}) {
  const [text, setText] = useState(existing);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setText(existing); }, [existing]);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await saveFeedback(dealId, agentName, text.trim());
      onSaved(text.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: "1rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
      <p style={{ fontWeight: "bold", color: "#555", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.4rem" }}>
        📝 Your Notes
      </p>
      <p style={{ fontSize: "0.8rem", color: "#888", margin: "0 0 0.4rem" }}>
        Add context, corrections, or intelligence from your network — this will be incorporated when you regenerate the memo.
      </p>
      <textarea
        rows={3}
        style={{ width: "100%", fontFamily: "inherit", fontSize: "0.9rem", padding: "0.5rem", border: "1px solid #ddd", borderRadius: "4px", boxSizing: "border-box" }}
        value={text}
        placeholder="e.g. Our network indicates the FDA pre-IND meeting went well. Management confirmed Phase 3 start in Q1 2027..."
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={handleSave}
        disabled={saving || !text.trim()}
        style={{ marginTop: "0.4rem", padding: "0.4rem 1rem", fontSize: "0.85rem", cursor: "pointer" }}
      >
        {saving ? "Saving..." : saved ? "✓ Saved" : "Save Notes"}
      </button>
    </div>
  );
}

// ── Agent cards ───────────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: "8px",
  padding: "1.25rem",
  marginBottom: "1.25rem",
  background: "#fff",
};

const HEADER_STYLE: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "1rem",
  fontWeight: "bold",
};

function ScientificCard({ data, dealId, feedback, onFeedbackSaved }: {
  data: ScientificDiligence;
  dealId: number;
  feedback: string;
  onFeedbackSaved: (t: string) => void;
}) {
  return (
    <div style={CARD_STYLE}>
      <h3 style={HEADER_STYLE}>🔬 Scientific Diligence</h3>
      <Section title="Mechanism of Action">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.mechanism_of_action || "N/A"}</p>
      </Section>
      <Section title="Clinical Evidence">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.clinical_evidence || "N/A"}</p>
      </Section>
      <Section title="✅ Opportunities">
        <BulletList items={data.scientific_opportunities || []} color="#15803d" />
      </Section>
      <Section title="⚠️ Risks">
        <BulletList items={data.scientific_risks || []} color="#b45309" />
      </Section>
      <Section title="❓ Diligence Questions">
        <QuestionList items={data.diligence_questions || []} />
      </Section>
      <FeedbackBox dealId={dealId} agentName="scientific_diligence" existing={feedback} onSaved={onFeedbackSaved} />
    </div>
  );
}

function CompetitiveCard({ data, dealId, feedback, onFeedbackSaved }: {
  data: CompetitiveIntelligence;
  dealId: number;
  feedback: string;
  onFeedbackSaved: (t: string) => void;
}) {
  return (
    <div style={CARD_STYLE}>
      <h3 style={HEADER_STYLE}>🏁 Competitive Intelligence</h3>
      <Section title="Market Overview">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.market_overview || "N/A"}</p>
      </Section>
      <Section title="Differentiation">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.differentiation || "N/A"}</p>
      </Section>
      <Section title="✅ Opportunities">
        <BulletList items={data.competitive_opportunities || []} color="#15803d" />
      </Section>
      <Section title="⚠️ Risks">
        <BulletList items={data.competitive_risks || []} color="#b45309" />
      </Section>
      <Section title="❓ Diligence Questions">
        <QuestionList items={data.diligence_questions || []} />
      </Section>
      <FeedbackBox dealId={dealId} agentName="competitive_intelligence" existing={feedback} onSaved={onFeedbackSaved} />
    </div>
  );
}

function ClinicalRegulatoryCard({ data, dealId, feedback, onFeedbackSaved }: {
  data: ClinicalRegulatory;
  dealId: number;
  feedback: string;
  onFeedbackSaved: (t: string) => void;
}) {
  return (
    <div style={CARD_STYLE}>
      <h3 style={HEADER_STYLE}>⚖️ Clinical & Regulatory</h3>
      <Section title="Regulatory Pathway">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.regulatory_pathway || "N/A"}</p>
      </Section>
      <Section title="Regulatory Precedent">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.precedent || "N/A"}</p>
      </Section>
      <Section title="✅ Opportunities">
        <BulletList items={data.regulatory_opportunities || []} color="#15803d" />
      </Section>
      <Section title="⚠️ Risks">
        <BulletList items={data.regulatory_risks || []} color="#b45309" />
      </Section>
      <Section title="❓ Diligence Questions">
        <QuestionList items={data.diligence_questions || []} />
      </Section>
      <FeedbackBox dealId={dealId} agentName="clinical_regulatory" existing={feedback} onSaved={onFeedbackSaved} />
    </div>
  );
}

function FinancingCard({ data, dealId, feedback, onFeedbackSaved }: {
  data: FinancingValuation;
  dealId: number;
  feedback: string;
  onFeedbackSaved: (t: string) => void;
}) {
  return (
    <div style={CARD_STYLE}>
      <h3 style={HEADER_STYLE}>💰 Financing & Valuation</h3>
      <Section title="Comparable Financings">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.comparable_financings || "N/A"}</p>
      </Section>
      <Section title="Valuation Considerations">
        <p style={{ fontSize: "0.9rem", margin: 0 }}>{data.valuation_considerations || "N/A"}</p>
      </Section>
      <Section title="✅ Opportunities">
        <BulletList items={data.financing_opportunities || []} color="#15803d" />
      </Section>
      <Section title="⚠️ Risks">
        <BulletList items={data.financing_risks || []} color="#b45309" />
      </Section>
      <Section title="❓ Diligence Questions">
        <QuestionList items={data.diligence_questions || []} />
      </Section>
      <FeedbackBox dealId={dealId} agentName="financing_valuation" existing={feedback} onSaved={onFeedbackSaved} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);
  const router = useRouter();

  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [runStatus, setRunStatus] = useState<AgentRun | null>(null);
  const [generatingMemo, setGeneratingMemo] = useState(false);
  const [error, setError] = useState("");
  const [runError, setRunError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOutputs = () =>
    getAgentOutputs(id).then(setOutputs).catch(() => {});

  const loadFeedback = () =>
    getFeedback(id).then((entries) => {
      const map: Record<string, string> = {};
      for (const e of entries) {
        if (!map[e.agent_name]) map[e.agent_name] = e.feedback_text;
      }
      setFeedbackMap(map);
    }).catch(() => {});

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await getAgentRunStatus(id);
        setRunStatus(status);
        if (status.status === "completed") {
          stopPolling();
          await loadOutputs();
        } else if (status.status === "failed") {
          stopPolling();
          setRunError(status.error || "Agent run failed");
        }
      } catch {}
    }, 3000);
  };

  useEffect(() => {
    loadOutputs();
    loadFeedback();
    // Check if a run is already in progress
    getAgentRunStatus(id).then((s) => {
      setRunStatus(s);
      if (s.status === "running") startPolling();
    }).catch(() => {});
    return () => stopPolling();
  }, [id]);

  const handleRun = async () => {
    setRunError("");
    try {
      const run = await runAgents(id);
      setRunStatus(run);
      startPolling();
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : "Failed to start agents");
    }
  };

  const running = runStatus?.status === "running";

  const handleGenerateMemo = async () => {
    setGeneratingMemo(true);
    setError("");
    try {
      await generateMemo(id);
      router.push(`/deals/${id}/memo`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate memo");
      setGeneratingMemo(false);
    }
  };

  const latestByAgent = outputs.reduce<Record<string, AgentOutput>>((acc, o) => {
    if (!acc[o.agent_name]) acc[o.agent_name] = o;
    return acc;
  }, {});

  const parsed = (key: string) => {
    const o = latestByAgent[key];
    if (!o) return null;
    try { return JSON.parse(o.output_json); } catch { return null; }
  };

  const sd = parsed("scientific_diligence") as ScientificDiligence | null;
  const ci = parsed("competitive_intelligence") as CompetitiveIntelligence | null;
  const cr = parsed("clinical_regulatory") as ClinicalRegulatory | null;
  const fv = parsed("financing_valuation") as FinancingValuation | null;

  const hasOutputs = sd || ci || cr || fv;

  return (
    <div>
      <p><Link href={`/deals/${id}`}>← Back to deal</Link></p>
      <h1>Agent Review</h1>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button onClick={handleRun} disabled={running}>
          {running ? "Agents running — checking every 3 seconds..." : hasOutputs ? "Re-run Agents" : "Run Agents"}
        </button>
        {hasOutputs && (
          <button
            onClick={handleGenerateMemo}
            disabled={generatingMemo}
            style={{ background: "#1d4ed8", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer" }}
          >
            {generatingMemo ? "Generating memo..." : "Generate Investment Memo →"}
          </button>
        )}
      </div>

      {runError && <p style={{ color: "red" }}>{runError}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!hasOutputs && !running && (
        <p style={{ color: "#888" }}>No analysis yet. Click "Run Agents" to analyse this deal using web search and your uploaded documents.</p>
      )}

      {sd && (
        <ScientificCard
          data={sd}
          dealId={id}
          feedback={feedbackMap["scientific_diligence"] || ""}
          onFeedbackSaved={(t) => setFeedbackMap((m) => ({ ...m, scientific_diligence: t }))}
        />
      )}
      {ci && (
        <CompetitiveCard
          data={ci}
          dealId={id}
          feedback={feedbackMap["competitive_intelligence"] || ""}
          onFeedbackSaved={(t) => setFeedbackMap((m) => ({ ...m, competitive_intelligence: t }))}
        />
      )}
      {cr && (
        <ClinicalRegulatoryCard
          data={cr}
          dealId={id}
          feedback={feedbackMap["clinical_regulatory"] || ""}
          onFeedbackSaved={(t) => setFeedbackMap((m) => ({ ...m, clinical_regulatory: t }))}
        />
      )}
      {fv && (
        <FinancingCard
          data={fv}
          dealId={id}
          feedback={feedbackMap["financing_valuation"] || ""}
          onFeedbackSaved={(t) => setFeedbackMap((m) => ({ ...m, financing_valuation: t }))}
        />
      )}
    </div>
  );
}
