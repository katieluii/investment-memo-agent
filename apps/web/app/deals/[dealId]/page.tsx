"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Comment,
  Deal,
  DealCreate,
  addComment,
  getDeal,
  getComments,
  getDocuments,
  getAgentRunStatus,
  getMemo,
  getMemoExportUrl,
  updateDeal,
} from "../../../lib/api";
import { dealDisplayId, StatusBadge } from "../../../lib/dealUtils";

// ── Status options ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "live",           label: "Live" },
  { value: "under-review",   label: "Under review" },
  { value: "to-follow-up",   label: "To follow-up" },
  { value: "dormant",        label: "Dormant" },
  { value: "lost",           label: "Lost" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}B`;
  return `$${n.toFixed(1)}M`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Round helpers ─────────────────────────────────────────────────────────────

const ROUND_OPTIONS = ["Pre-Seed", "Seed", "A", "B", "C", "D"];

function parseRounds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((r) => r.replace(/^Series\s+/i, "").trim()).filter(Boolean);
}

function encodeRounds(selected: string[]): string {
  return selected.join(",");
}

function displayRound(raw: string | undefined): string {
  if (!raw) return "—";
  return raw.split(",").map((r) => r.replace(/^Series\s+/i, "").trim()).join(" / ");
}

// ── Therapeutic area options ──────────────────────────────────────────────────

const TX_AREA_OPTIONS = [
  "Oncology",
  "Neurology / CNS",
  "Cardiovascular",
  "Immunology / Inflammation",
  "Infectious Disease",
  "Rare Disease / Orphan",
  "Metabolic / Endocrinology",
  "Ophthalmology",
  "Respiratory",
  "Dermatology",
  "Musculoskeletal",
  "Haematology",
  "Gastroenterology",
  "Renal / Nephrology",
  "Women's Health",
  "Gene Therapy",
  "Cell Therapy",
  "Vaccines",
  "Digital Health",
  "Other",
];

// ── Text fields rendered in edit form ─────────────────────────────────────────

const TEXT_FIELDS: Array<{ key: keyof DealCreate; label: string; multiline?: boolean }> = [
  { key: "company_name", label: "Company" },
  { key: "asset_name",   label: "Asset" },
  { key: "indication",   label: "Indication" },
  { key: "stage",        label: "Stage" },
  { key: "geography",    label: "Geography" },
  { key: "fund_thesis",  label: "Fund Thesis", multiline: true },
];

// ── Analysis summary ──────────────────────────────────────────────────────────

interface AnalysisSummaryProps {
  deal: Deal;
  dealId: number;
  docCount: number | null;
  ddRan: boolean | null;
  memoGenerated: boolean;
  memoId: number | null;
}

function AnalysisSummary({ deal, dealId, docCount, ddRan, memoGenerated, memoId }: AnalysisSummaryProps) {
  const rows: Array<{ label: string; value: React.ReactNode; href: string }> = [
    {
      label: "Documents",
      value: docCount == null
        ? "Loading…"
        : docCount === 0
          ? <span style={{ color: "#aaa" }}>None uploaded</span>
          : <span>{docCount} doc{docCount !== 1 ? "s" : ""} uploaded</span>,
      href: `/deals/${dealId}/documents`,
    },
    {
      label: "Market Sizing",
      value: deal.peak_revenue_m != null
        ? (
          <span>
            SOM: <strong>{fmtM(deal.peak_revenue_m)}</strong>
            {deal.market_sizing_submitted_at && (
              <span style={{ color: "#aaa", fontSize: "0.82em", marginLeft: "0.5rem" }}>
                as of {fmtDate(deal.market_sizing_submitted_at)}
              </span>
            )}
          </span>
        )
        : <span style={{ color: "#aaa" }}>Not submitted</span>,
      href: `/deals/${dealId}/market-sizing`,
    },
    {
      label: "Cap Table / Returns",
      value: deal.moic != null
        ? (
          <span>
            MOIC: <strong>{deal.moic.toFixed(2)}×</strong>
            {deal.irr != null && <span> · IRR: <strong>{(deal.irr * 100).toFixed(1)}%</strong></span>}
            {deal.moic_submitted_at && (
              <span style={{ color: "#aaa", fontSize: "0.82em", marginLeft: "0.5rem" }}>
                as of {fmtDatetime(deal.moic_submitted_at)}
              </span>
            )}
          </span>
        )
        : <span style={{ color: "#aaa" }}>Not submitted</span>,
      href: `/deals/${dealId}/cap-table`,
    },
    {
      label: "Exit Scenarios",
      value: deal.exit_base_moic != null
        ? (
          <span>
            Base MOIC: <strong>{deal.exit_base_moic.toFixed(2)}×</strong>
            {deal.exit_base_irr != null && <span> · IRR: <strong>{(deal.exit_base_irr * 100).toFixed(1)}%</strong></span>}
            {deal.exit_submitted_at && (
              <span style={{ color: "#aaa", fontSize: "0.82em", marginLeft: "0.5rem" }}>
                as of {fmtDatetime(deal.exit_submitted_at)}
              </span>
            )}
          </span>
        )
        : <span style={{ color: "#aaa" }}>Not submitted</span>,
      href: `/deals/${dealId}/exit-scenarios`,
    },
    {
      label: "DD Agents",
      value: ddRan == null
        ? "Loading…"
        : ddRan
          ? <span style={{ color: "#166534" }}>✓ Run</span>
          : <span style={{ color: "#aaa" }}>Not run</span>,
      href: `/deals/${dealId}/review`,
    },
    {
      label: "Investment Memo",
      value: memoGenerated
        ? (
          <span>
            Generated ·{" "}
            <a href={getMemoExportUrl(dealId)} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
              Export DOCX
            </a>
            {" · "}
            <Link href={`/deals/${dealId}/memo`} style={{ color: "#2563eb" }}>View</Link>
          </span>
        )
        : <span style={{ color: "#aaa" }}>Not generated</span>,
      href: `/deals/${dealId}/memo`,
    },
  ];

  const tdLabel: React.CSSProperties = {
    padding: "0.4rem 1rem 0.4rem 0",
    fontWeight: "bold",
    whiteSpace: "nowrap",
    color: "#555",
    fontSize: "0.85em",
    verticalAlign: "top",
    paddingTop: "0.55rem",
  };
  const tdValue: React.CSSProperties = { padding: "0.4rem 1rem 0.4rem 0", fontSize: "0.9em", verticalAlign: "top" };
  const tdLink: React.CSSProperties = { padding: "0.4rem 0", fontSize: "0.8em", whiteSpace: "nowrap", verticalAlign: "top", paddingTop: "0.55rem" };

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "0.78em", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "2px solid #111", paddingBottom: "0.4rem", marginBottom: "1rem" }}>
        Analysis Summary
      </h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(({ label, value, href }) => (
            <tr key={label} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={tdLabel}>{label}</td>
              <td style={tdValue}>{value}</td>
              <td style={tdLink}>
                <Link href={href} style={{ color: "#999" }}>→</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Comments section ──────────────────────────────────────────────────────────

function CommentsSection({ dealId }: { dealId: number }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getComments(dealId).then(setComments).catch(() => {});
  }, [dealId]);

  async function handleSubmit() {
    if (!authorName.trim() || !body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const c = await addComment(dealId, authorName.trim(), body.trim());
      setComments((prev) => [c, ...prev]);
      setBody("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "0.78em", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "2px solid #111", paddingBottom: "0.4rem", marginBottom: "1rem" }}>
        Remarks
      </h2>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: "4px", padding: "0.75rem", marginBottom: "1.25rem", background: "#fafafa" }}>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Your name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            style={{ fontFamily: "monospace", width: "160px", padding: "0.3rem 0.5rem", border: "1px solid #ddd" }}
          />
        </div>
        <textarea
          placeholder="Add a remark…"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: "100%", fontFamily: "monospace", fontSize: "0.88em", padding: "0.4rem 0.5rem", border: "1px solid #ddd", resize: "vertical", boxSizing: "border-box" }}
        />
        {error && <p style={{ color: "red", fontSize: "0.82em", marginTop: "0.25rem" }}>{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={submitting || !authorName.trim() || !body.trim()}
          style={{ marginTop: "0.4rem", fontFamily: "monospace", padding: "0.3rem 0.9rem", cursor: "pointer" }}
        >
          {submitting ? "Posting…" : "Post remark"}
        </button>
      </div>

      {comments.length === 0 ? (
        <p style={{ color: "#aaa", fontSize: "0.85em" }}>No remarks yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ borderLeft: "3px solid #e5e7eb", paddingLeft: "0.75rem" }}>
              <div style={{ fontSize: "0.78em", color: "#6b7280", marginBottom: "0.2rem" }}>
                <strong style={{ color: "#111" }}>{c.author_name}</strong>
                {" · "}
                {fmtDatetime(c.created_at)}
              </div>
              <div style={{ fontSize: "0.88em", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DealCreate>({ company_name: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Analysis summary data
  const [docCount, setDocCount] = useState<number | null>(null);
  const [ddRan, setDdRan] = useState<boolean | null>(null);
  const [memoGenerated, setMemoGenerated] = useState(false);
  const [memoId, setMemoId] = useState<number | null>(null);

  useEffect(() => {
    getDeal(id)
      .then((d) => { setDeal(d); setForm(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    getDocuments(id).then((docs) => setDocCount(docs.length)).catch(() => setDocCount(0));

    getAgentRunStatus(id)
      .then((run) => setDdRan(run.status === "completed"))
      .catch(() => setDdRan(false));

    getMemo(id)
      .then((m) => { setMemoGenerated(true); setMemoId(m.id); })
      .catch(() => { setMemoGenerated(false); setMemoId(null); });
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateDeal(id, form);
      setDeal(updated);
      setForm(updated);
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(deal!);
    setEditing(false);
    setSaveError("");
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!deal) return null;

  const inputStyle: React.CSSProperties = { width: "100%", fontFamily: "monospace", padding: "0.25rem 0.4rem" };

  return (
    <div>
      <p><Link href="/deals">← All deals</Link></p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.1rem" }}>{deal.company_name}</h1>
          <span style={{ fontFamily: "monospace", fontSize: "0.78em", color: "#9ca3af" }}>
            {dealDisplayId(deal)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.4rem" }}>
          <StatusBadge status={deal.status} />
          {!editing && (
            <button onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ maxWidth: 600, marginTop: "1rem" }}>
          {/* Status dropdown */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "bold" }}>Status</label>
            <select
              value={form.status ?? deal.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              style={{ fontFamily: "monospace", padding: "0.25rem 0.4rem", width: "100%" }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Investment amount */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "bold" }}>Investment Amount ($M)</label>
            <input
              type="number"
              step={0.5}
              min={0}
              style={inputStyle}
              value={form.investment_amount ?? ""}
              placeholder="e.g. 10"
              onChange={(e) => setForm((p) => ({ ...p, investment_amount: e.target.value === "" ? undefined : Number(e.target.value) }))}
            />
          </div>

          {/* Round multi-select */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "bold" }}>Round</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: "0.9em", color: "#555", marginRight: "0.2rem" }}>Series</span>
              {ROUND_OPTIONS.map((opt) => {
                const selected = parseRounds(form.round_type).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const current = parseRounds(form.round_type);
                      const next = selected ? current.filter((r) => r !== opt) : [...current, opt];
                      setForm((p) => ({ ...p, round_type: encodeRounds(next) }));
                    }}
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.85em",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "4px",
                      border: "1px solid",
                      borderColor: selected ? "#111" : "#ccc",
                      background: selected ? "#111" : "#fff",
                      color: selected ? "#fff" : "#555",
                      cursor: "pointer",
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {form.round_type && (
              <div style={{ fontSize: "0.75em", color: "#888", marginTop: "0.3rem" }}>
                Selected: {displayRound(form.round_type)}
              </div>
            )}
          </div>

          {/* Therapeutic area dropdown */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "bold" }}>Therapeutic Area</label>
            <select
              value={form.therapeutic_area ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, therapeutic_area: e.target.value || undefined }))}
              style={{ fontFamily: "monospace", padding: "0.25rem 0.4rem", width: "100%" }}
            >
              <option value="">— Select —</option>
              {TX_AREA_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Text fields */}
          {TEXT_FIELDS.map(({ key, label, multiline }) => (
            <div key={key} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "bold" }}>{label}</label>
              {multiline ? (
                <textarea
                  rows={4}
                  style={inputStyle}
                  value={(form[key] as string) || ""}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              ) : (
                <input
                  type="text"
                  style={inputStyle}
                  value={(form[key] as string) || ""}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          {saveError && <p style={{ color: "red" }}>{saveError}</p>}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={handleCancel} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", marginTop: "1rem", marginBottom: "1.5rem" }}>
            <tbody>
              {[
                ["Company",            deal.company_name],
                ["Asset",              deal.asset_name || "—"],
                ["Indication",         deal.indication || "—"],
                ["Therapeutic Area",   deal.therapeutic_area || "—"],
                ["Stage",              deal.stage || "—"],
                ["Round",              displayRound(deal.round_type)],
                ["Geography",          deal.geography || "—"],
                ["Investment Amount",  deal.investment_amount != null ? fmtM(deal.investment_amount) : "—"],
                ["Created",            fmtDate(deal.created_at)],
                ["Last edited",        fmtDate(deal.updated_at)],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: "0.3rem 1rem 0.3rem 0", fontWeight: "bold", whiteSpace: "nowrap", color: "#555" }}>
                    {label}
                  </td>
                  <td style={{ padding: "0.3rem 0" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {deal.fund_thesis && (
            <div style={{ marginBottom: "1.5rem" }}>
              <strong>Fund Thesis</strong>
              <p style={{ marginTop: "0.25rem" }}>{deal.fund_thesis}</p>
            </div>
          )}

          {/* Analysis summary */}
          <AnalysisSummary
            deal={deal}
            dealId={id}
            docCount={docCount}
            ddRan={ddRan}
            memoGenerated={memoGenerated}
            memoId={memoId}
          />

          {/* Workflow navigation */}
          <div style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "0.78em", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "2px solid #111", paddingBottom: "0.4rem", marginBottom: "0.75rem" }}>
              Workflow
            </h2>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: "max-content" }}>
                {[
                  { label: "Documents",       href: `/deals/${id}/documents` },
                  { label: "Market Sizing",   href: `/deals/${id}/market-sizing` },
                  { label: "Cap Table",       href: `/deals/${id}/cap-table` },
                  { label: "Exit Scenarios",  href: `/deals/${id}/exit-scenarios` },
                  { label: "Team Assessment", href: `/deals/${id}/founder-insights` },
                  { label: "DD Agents",       href: `/deals/${id}/review` },
                  { label: "Memo",            href: `/deals/${id}/memo` },
                ].map((step) => (
                  <Link key={step.label} href={step.href}>
                    <button style={{ whiteSpace: "nowrap" }}>{step.label} →</button>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Comments */}
          <CommentsSection dealId={id} />
        </>
      )}
    </div>
  );
}
