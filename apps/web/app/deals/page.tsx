"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Deal, getDeals } from "../../lib/api";
import { dealDisplayId, StatusBadge } from "../../lib/dealUtils";

// ── Round helpers ─────────────────────────────────────────────────────────────

const ROUND_ORDER = ["D", "C", "B", "A", "Seed", "Pre-Seed"];

function stripSeries(r: string): string {
  return r.replace(/^Series\s+/i, "").trim();
}

function displayRound(raw: string | undefined): string {
  if (!raw) return "—";
  return raw.split(",").map((r) => stripSeries(r.trim())).join(" / ");
}

function roundSortKey(raw: string | undefined): number {
  if (!raw) return 999;
  const parts = raw.split(",").map((r) => stripSeries(r.trim()));
  const keys = parts.map((r) => {
    const i = ROUND_ORDER.indexOf(r);
    return i === -1 ? 999 : i;
  });
  return Math.min(...keys);
}

function fmtM(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}B`;
  return `$${n.toFixed(1)}M`;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortKey = "id" | "company" | "status" | "round" | "investment" | "moic" | "tx_area";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  live: 0, "under-review": 1, "to-follow-up": 2, dormant: 3, lost: 4, active: 0,
};

function sortDeals(deals: Deal[], key: SortKey, dir: SortDir): Deal[] {
  const copy = [...deals];
  const flip = dir === "asc" ? 1 : -1;

  copy.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "id":
        cmp = a.id - b.id;
        break;
      case "company":
        cmp = a.company_name.localeCompare(b.company_name);
        break;
      case "status":
        cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        break;
      case "round":
        cmp = roundSortKey(a.round_type) - roundSortKey(b.round_type);
        break;
      case "investment": {
        const av = a.investment_amount ?? -Infinity;
        const bv = b.investment_amount ?? -Infinity;
        cmp = bv - av;
        break;
      }
      case "moic": {
        const av = a.moic ?? a.exit_base_moic ?? -Infinity;
        const bv = b.moic ?? b.exit_base_moic ?? -Infinity;
        cmp = bv - av;
        break;
      }
      case "tx_area":
        cmp = (a.therapeutic_area ?? "").localeCompare(b.therapeutic_area ?? "");
        break;
    }
    return cmp * flip;
  });

  return copy;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    getDeals()
      .then(setDeals)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "id" || key === "company" || key === "tx_area" ? "asc" : "desc");
    }
  }

  const sorted = sortDeals(deals, sortKey, sortDir);

  const thBase: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    textAlign: "left",
    borderBottom: "2px solid #ddd",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = { padding: "0.45rem 0.75rem", borderBottom: "1px solid #eee" };

  function SortTh({
    col, label, align = "left",
  }: { col: SortKey; label: string; align?: "left" | "right" }) {
    const active = sortKey === col;
    const arrow = active ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕";
    return (
      <th
        style={{
          ...thBase,
          textAlign: align,
          cursor: "pointer",
          userSelect: "none",
          color: active ? "#111" : "#555",
        }}
        onClick={() => handleSort(col)}
      >
        {label}
        <span style={{ fontSize: "0.75em", opacity: active ? 1 : 0.3 }}>{arrow}</span>
      </th>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Deals</h1>
        <Link href="/deals/new">
          <button>+ New Deal</button>
        </Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {!loading && !error && deals.length === 0 && <p>No deals yet. Create one to get started.</p>}

      {sorted.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr>
                <SortTh col="id" label="Deal ID" />
                <SortTh col="company" label="Company" />
                <th style={thBase}>Asset</th>
                <th style={thBase}>Indication</th>
                <SortTh col="tx_area" label="Tx Area" />
                <th style={thBase}>Stage</th>
                <SortTh col="round" label="Round" />
                <SortTh col="investment" label="Investment" align="right" />
                <SortTh col="moic" label="MOIC" align="right" />
                <SortTh col="status" label="Status" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const moicVal = d.moic ?? d.exit_base_moic;
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "0.82em", color: "#888" }}>
                      {dealDisplayId(d)}
                    </td>
                    <td style={td}>
                      <Link href={`/deals/${d.id}`}>{d.company_name}</Link>
                    </td>
                    <td style={td}>{d.asset_name || "—"}</td>
                    <td style={td}>{d.indication || "—"}</td>
                    <td style={td}>{d.therapeutic_area || "—"}</td>
                    <td style={td}>{d.stage || "—"}</td>
                    <td style={td}>{displayRound(d.round_type)}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>
                      {d.investment_amount != null ? fmtM(d.investment_amount) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>
                      {moicVal != null ? `${moicVal.toFixed(2)}×` : "—"}
                    </td>
                    <td style={td}><StatusBadge status={d.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
