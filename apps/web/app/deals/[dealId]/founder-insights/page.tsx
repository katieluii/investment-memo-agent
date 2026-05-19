"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FounderInsightsCreate, getFounderInsights, saveFounderInsights } from "../../../../lib/api";

// ── Rating dimensions ─────────────────────────────────────────────────────────

const RATINGS = [
  {
    key: "conviction",
    label: "Conviction & Commitment",
    description: "How clearly does the leadership team articulate their long-term commitment to solving this problem?",
  },
  {
    key: "expertise",
    label: "Scientific / Domain Expertise",
    description: "How deep is the team's expertise in the relevant scientific, clinical, or technical domain?",
  },
  {
    key: "execution",
    label: "Execution Track Record",
    description: "Does the team have a demonstrated ability to execute in comparable environments?",
  },
  {
    key: "vision",
    label: "Strategic Clarity",
    description: "How compelling and clearly articulated is the team's strategic vision and path to market?",
  },
  {
    key: "team",
    label: "Team Cohesion",
    description: "Does the team demonstrate strong complementarity, trust, and shared direction?",
  },
  {
    key: "coachability",
    label: "Openness to Input",
    description: "Is the team receptive to external perspectives, constructive challenge, and investor input?",
  },
];

const SCORE_LABELS: Record<number, string> = {
  1: "Unclear",
  2: "Developing",
  3: "Adequate",
  4: "Strong",
  5: "Exceptional",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface RatingEntry {
  score: number | null;
  notes: string;
}

type RatingsMap = Record<string, RatingEntry>;

// ── Components ────────────────────────────────────────────────────────────────

function ScoreButton({ value, selected, onClick }: { value: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "2.5rem",
        height: "2.5rem",
        borderRadius: "50%",
        border: selected ? "2px solid #1d4ed8" : "1px solid #d1d5db",
        background: selected ? "#1d4ed8" : "#fff",
        color: selected ? "#fff" : "#374151",
        fontWeight: selected ? "bold" : "normal",
        cursor: "pointer",
        fontSize: "0.9rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title={SCORE_LABELS[value]}
    >
      {value}
    </button>
  );
}

function RatingRow({
  rating,
  entry,
  onChange,
}: {
  rating: typeof RATINGS[0];
  entry: RatingEntry;
  onChange: (updated: RatingEntry) => void;
}) {
  return (
    <div style={{ borderBottom: "1px solid #f0f0f0", paddingBottom: "1.25rem", marginBottom: "1.25rem" }}>
      <p style={{ fontWeight: "bold", margin: "0 0 0.2rem", fontSize: "0.95rem" }}>{rating.label}</p>
      <p style={{ color: "#6b7280", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>{rating.description}</p>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.6rem" }}>
        {[1, 2, 3, 4, 5].map((v) => (
          <ScoreButton
            key={v}
            value={v}
            selected={entry.score === v}
            onClick={() => onChange({ ...entry, score: entry.score === v ? null : v })}
          />
        ))}
        {entry.score && (
          <span style={{ fontSize: "0.82rem", color: "#6b7280", marginLeft: "0.5rem" }}>
            {SCORE_LABELS[entry.score]}
          </span>
        )}
      </div>
      <textarea
        rows={2}
        placeholder="Optional notes..."
        style={{
          width: "100%",
          fontSize: "0.88rem",
          padding: "0.4rem 0.6rem",
          border: "1px solid #e5e7eb",
          borderRadius: "4px",
          fontFamily: "inherit",
          boxSizing: "border-box",
          color: "#374151",
          resize: "vertical",
        }}
        value={entry.notes}
        onChange={(e) => onChange({ ...entry, notes: e.target.value })}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DEFAULT_RATINGS: RatingsMap = Object.fromEntries(
  RATINGS.map((r) => [r.key, { score: null, notes: "" }])
);

export default function FounderInsightsPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [ratings, setRatings] = useState<RatingsMap>(DEFAULT_RATINGS);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [keyImpressions, setKeyImpressions] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getFounderInsights(id)
      .then((fi) => {
        if (fi.meeting_notes) setMeetingNotes(fi.meeting_notes);
        if (fi.key_impressions) setKeyImpressions(fi.key_impressions);
        if (fi.ratings_json) {
          try {
            const parsed = JSON.parse(fi.ratings_json);
            setRatings((prev) => {
              const merged = { ...prev };
              for (const key of Object.keys(parsed)) {
                merged[key] = { score: parsed[key].score ?? null, notes: parsed[key].notes ?? "" };
              }
              return merged;
            });
          } catch {}
        }
      })
      .catch(() => {}); // 404 = no insights yet, that's fine
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: FounderInsightsCreate = {
        meeting_notes: meetingNotes,
        key_impressions: keyImpressions,
        ratings_json: JSON.stringify(ratings),
      };
      await saveFounderInsights(id, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <p><Link href={`/deals/${id}`}>← Back to deal</Link></p>
      <h1 style={{ marginBottom: "0.25rem" }}>Founding Team Assessment</h1>
      <p style={{ color: "#6b7280", fontSize: "0.9rem", marginTop: 0, marginBottom: "2rem" }}>
        Capture qualitative signals from management interactions. All fields are optional.
        This information is incorporated when generating the investment memo.
      </p>

      {/* Team assessment ratings */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.5rem", background: "#fff" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151", margin: "0 0 1.25rem" }}>
          Team Assessment
        </h2>
        <p style={{ fontSize: "0.82rem", color: "#9ca3af", margin: "-0.75rem 0 1.25rem" }}>
          1 = Unclear · 2 = Developing · 3 = Adequate · 4 = Strong · 5 = Exceptional
        </p>
        {RATINGS.map((r) => (
          <RatingRow
            key={r.key}
            rating={r}
            entry={ratings[r.key] || { score: null, notes: "" }}
            onChange={(updated) => setRatings((prev) => ({ ...prev, [r.key]: updated }))}
          />
        ))}
      </div>

      {/* Key impressions */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.5rem", background: "#fff" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151", margin: "0 0 0.5rem" }}>
          Key Impressions
        </h2>
        <p style={{ fontSize: "0.82rem", color: "#9ca3af", margin: "0 0 0.75rem" }}>
          Standout observations from your interaction with the team — what distinguished them, positively or negatively.
        </p>
        <textarea
          rows={4}
          placeholder="e.g. The CEO demonstrated unusually deep clinical intuition for an operator background. CFO was notably sharp on capital efficiency..."
          style={{ width: "100%", fontSize: "0.9rem", padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: "4px", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
          value={keyImpressions}
          onChange={(e) => setKeyImpressions(e.target.value)}
        />
      </div>

      {/* Meeting notes */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.5rem", background: "#fff" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151", margin: "0 0 0.5rem" }}>
          Meeting Notes
        </h2>
        <p style={{ fontSize: "0.82rem", color: "#9ca3af", margin: "0 0 0.75rem" }}>
          Notes from coffee chats, calls, or site visits. These are private and will appear in your memo's internal notes section.
        </p>
        <textarea
          rows={6}
          placeholder="e.g. Met with CEO and CSO at their Cambridge office. CEO previously built and sold a Phase 2 oncology asset to Roche. CSO has 15 years at GSK in the relevant TA. They mentioned Phase 3 timelines are contingent on FDA feedback expected Q3..."
          style={{ width: "100%", fontSize: "0.9rem", padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: "4px", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
          value={meetingNotes}
          onChange={(e) => setMeetingNotes(e.target.value)}
        />
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ padding: "0.6rem 1.5rem", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.95rem", fontWeight: "bold" }}
      >
        {saving ? "Saving..." : saved ? "✓ Saved" : "Save Assessment"}
      </button>
    </div>
  );
}
