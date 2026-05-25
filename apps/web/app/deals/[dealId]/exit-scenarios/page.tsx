"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { getDeal, submitExit, Deal } from "../../../../lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PrefType = "common" | "non-part" | "part-capped" | "part-uncapped" | "pari-passu";
type ExitType = "M&A" | "IPO" | "Secondary";

interface ShareClass {
  id: string;
  name: string;
  shares: number;
  entryPrice: number;   // £ per share
  prefType: PrefType;
  prefMultiple: number;
  partCap: number;      // total return cap multiple (for part-capped only)
  isUs: boolean;
}

interface ClassResult {
  id: string;
  name: string;
  shares: number;
  investM: number;
  prefAmountM: number;
  tookPref: boolean;
  prefPayoffM: number;
  proRataM: number;
  totalM: number;
  pctOfExit: number;
  moic: number;
  irr: number;
  isUs: boolean;
  isFounder: boolean;
}

interface WaterfallOut {
  classes: ClassResult[];
  fundM: number;
  founderM: number;
  fundMOIC: number;
  fundIRR: number;
  fundProRataM: number;
  prefStackM: number;
  insufficient: boolean;
  sumOk: boolean;
}

// ─── Format helpers ────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtM(n: number, d = 1): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(d)}B`;
  if (abs >= 0.1)  return `${sign}£${abs.toFixed(d)}M`;
  return `${sign}£${(abs * 1000).toFixed(0)}K`;
}
function fmtMOIC(n: number): string { return (isFinite(n) && n >= 0) ? `${n.toFixed(2)}×` : "—"; }
function fmtIRR(n: number):  string { return isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—"; }
function fmtPct(n: number):  string { return `${n.toFixed(1)}%`; }
function fmtShares(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString();
}

function moicColor(m: number): string {
  if (m >= 3) return "#2a7a2a";
  if (m >= 2) return "#3a6a1a";
  if (m >= 1) return "#888800";
  return "#c00";
}

// ─── Waterfall engine ──────────────────────────────────────────────────────────

function calcIRR(moic: number, years: number): number {
  if (years <= 0 || moic <= 0 || !isFinite(moic)) return 0;
  return Math.pow(moic, 1 / years) - 1;
}

function runWaterfall(exitM: number, classes: ShareClass[], holdYears: number): WaterfallOut {
  const totalShares = classes.reduce((s, c) => s + c.shares, 0);
  const investM = (c: ShareClass) => (c.shares * c.entryPrice) / 1_000_000;
  const prefM   = (c: ShareClass) => investM(c) * c.prefMultiple;

  const partClasses    = classes.filter(c => c.prefType === "part-uncapped" || c.prefType === "part-capped");
  const nonPartClasses = classes.filter(c => c.prefType === "non-part");

  const partPrefTotal = partClasses.reduce((s, c) => s + prefM(c), 0);
  const allPrefTotal  = partPrefTotal + nonPartClasses.reduce((s, c) => s + prefM(c), 0);
  const insufficient  = exitM <= partPrefTotal;

  const prefPayoff = new Map<string, number>(classes.map(c => [c.id, 0]));
  const proRata    = new Map<string, number>(classes.map(c => [c.id, 0]));
  const tookPref   = new Map<string, boolean>(classes.map(c => [c.id, false]));

  if (insufficient) {
    // Distribute pro-rata among all preferred by pref amounts
    for (const c of [...partClasses, ...nonPartClasses]) {
      prefPayoff.set(c.id, allPrefTotal > 0 ? (prefM(c) / allPrefTotal) * exitM : 0);
      tookPref.set(c.id, true);
    }
  } else {
    // Step 1: participating preferred take preferences first
    let remaining = exitM;
    for (const c of partClasses) {
      prefPayoff.set(c.id, prefM(c));
      remaining -= prefM(c);
    }

    // Step 2: non-participating — convert vs. preference?
    // Conversion value = pro-rata of remaining pool (after participating prefs)
    const converted = new Set<string>();
    for (const c of nonPartClasses) {
      const convVal = (c.shares / totalShares) * remaining;
      if (convVal >= prefM(c)) {
        converted.add(c.id);
      } else {
        prefPayoff.set(c.id, prefM(c));
        tookPref.set(c.id, true);
        remaining -= prefM(c);
      }
    }

    // Step 3: pro-rata pool = common + pari-passu + participating + non-part that converted
    const pool = classes.filter(c =>
      c.prefType === "common" ||
      c.prefType === "pari-passu" ||
      c.prefType === "part-uncapped" ||
      c.prefType === "part-capped" ||
      (c.prefType === "non-part" && converted.has(c.id))
    );
    const poolShares = pool.reduce((s, c) => s + c.shares, 0);

    if (poolShares > 0 && remaining > 0) {
      let cappedSurplus = 0;
      for (const c of pool) {
        const raw = (c.shares / poolShares) * remaining;
        if (c.prefType === "part-capped") {
          const cap      = investM(c) * c.partCap;
          const headroom = Math.max(0, cap - prefPayoff.get(c.id)!);
          const actual   = Math.min(raw, headroom);
          proRata.set(c.id, actual);
          cappedSurplus += raw - actual;
        } else {
          proRata.set(c.id, raw);
        }
      }
      // Redistribute capped surplus to uncapped pool members
      if (cappedSurplus > 0) {
        const uncapped = pool.filter(c => c.prefType !== "part-capped");
        const ucShares = uncapped.reduce((s, c) => s + c.shares, 0);
        if (ucShares > 0) {
          for (const c of uncapped) {
            proRata.set(c.id, proRata.get(c.id)! + (c.shares / ucShares) * cappedSurplus);
          }
        }
      }
    }
  }

  // Assemble results
  const results: ClassResult[] = classes.map(c => {
    const inv   = investM(c);
    const pref  = prefPayoff.get(c.id) ?? 0;
    const pr    = proRata.get(c.id) ?? 0;
    const total = pref + pr;
    const moic  = inv > 0 ? total / inv : 0;
    return {
      id: c.id, name: c.name, shares: c.shares,
      investM: inv, prefAmountM: prefM(c),
      tookPref: tookPref.get(c.id) ?? false,
      prefPayoffM: pref, proRataM: pr, totalM: total,
      pctOfExit: exitM > 0 ? (total / exitM) * 100 : 0,
      moic, irr: calcIRR(moic, holdYears),
      isUs: c.isUs,
      isFounder: c.prefType === "common" && c.name.toLowerCase().includes("found"),
    };
  });

  const fundResults = results.filter(r => r.isUs);
  const fundM       = fundResults.reduce((s, r) => s + r.totalM, 0);
  const fundInv     = fundResults.reduce((s, r) => s + r.investM, 0);
  const fundMOIC    = fundInv > 0 ? fundM / fundInv : 0;
  const fundIRR     = calcIRR(fundMOIC, holdYears);
  const founderM    = results.filter(r => r.isFounder).reduce((s, r) => s + r.totalM, 0);
  const fundShares  = classes.filter(c => c.isUs).reduce((s, c) => s + c.shares, 0);
  const fundProRataM = totalShares > 0 ? (fundShares / totalShares) * exitM : 0;
  const sumCheck    = results.reduce((s, r) => s + r.totalM, 0);

  return {
    classes: results, fundM, fundMOIC, fundIRR,
    founderM, fundProRataM,
    prefStackM: allPrefTotal,
    insufficient,
    sumOk: Math.abs(sumCheck - exitM) < 0.01,
  };
}

// ─── Preference flip analysis for non-participating classes ───────────────────

function flipPoint(c: ShareClass, partPrefTotal: number, totalShares: number): number | null {
  if (c.prefType !== "non-part" || c.shares <= 0) return null;
  const inv    = (c.shares * c.entryPrice) / 1_000_000;
  const pref   = inv * c.prefMultiple;
  // (c.shares / totalShares) * (exit - partPrefTotal) = pref
  // exit = pref * totalShares / c.shares + partPrefTotal
  return pref * totalShares / c.shares + partPrefTotal;
}

// ─── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_CLASSES: ShareClass[] = [
  { id: uid(), name: "Founders",            shares: 3_000_000, entryPrice:   0.03, prefType: "common",       prefMultiple: 1,   partCap: 3, isUs: false },
  { id: uid(), name: "Round A",             shares:   900_000, entryPrice:   1.80, prefType: "non-part",     prefMultiple: 1,   partCap: 3, isUs: false },
  { id: uid(), name: "Round B",             shares: 2_750_000, entryPrice:   4.00, prefType: "part-uncapped", prefMultiple: 1,  partCap: 3, isUs: false },
  { id: uid(), name: "Round C",             shares: 2_500_000, entryPrice:   9.00, prefType: "part-uncapped", prefMultiple: 2,  partCap: 3, isUs: false },
  { id: uid(), name: "Round D",             shares: 1_800_000, entryPrice:  45.00, prefType: "part-uncapped", prefMultiple: 1.5, partCap: 3, isUs: false },
  { id: uid(), name: "Round E (Our Firm)",  shares: 1_200_000, entryPrice: 110.00, prefType: "part-uncapped", prefMultiple: 1,  partCap: 3, isUs: true  },
];

const PREF_LABELS: Record<PrefType, string> = {
  "common":        "Common",
  "pari-passu":    "Pari Passu",
  "non-part":      "Non-participating",
  "part-uncapped": "Participating (uncapped)",
  "part-capped":   "Participating (capped)",
};

// ─── Shared input component ────────────────────────────────────────────────────

function NInput({
  value, onChange, prefix, suffix, step = 1, min = 0, max, width = 100,
}: {
  value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number; max?: number; width?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      {prefix && <span style={{ color: "#555" }}>{prefix}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
        style={{ fontFamily: "monospace", width: `${width}px` }}
      />
      {suffix && <span style={{ color: "#555" }}>{suffix}</span>}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: "0.8em", textTransform: "uppercase", letterSpacing: "0.1em",
      borderBottom: "2px solid #111", paddingBottom: "0.4rem",
      marginBottom: "1rem", marginTop: "2rem",
    }}>
      {children}
    </h2>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ExitScenariosPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [exSubmitting, setExSubmitting] = useState(false);
  const [exSubmitDone, setExSubmitDone] = useState(false);

  useEffect(() => {
    getDeal(id).then(setDeal).catch(() => {});
  }, [id]);

  async function handleExitSubmit(baseMoic: number, baseIrr: number) {
    setExSubmitting(true);
    setExSubmitDone(false);
    try {
      const updated = await submitExit(id, baseMoic, baseIrr);
      setDeal(updated);
      setExSubmitDone(true);
    } finally {
      setExSubmitting(false);
    }
  }

  // ── State ───────────────────────────────────────────────────────────────────
  const [classes,   setClasses]   = useState<ShareClass[]>(DEFAULT_CLASSES);
  const [bearM,     setBearM]     = useState(250);
  const [baseM,     setBaseM]     = useState(800);
  const [bullM,     setBullM]     = useState(2_000);
  const [holdYears, setHoldYears] = useState(5);
  const [exitType,  setExitType]  = useState<ExitType>("M&A");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMemo,     setShowMemo]     = useState(false);
  const [copied,       setCopied]       = useState(false);

  // ── Waterfall calculations ──────────────────────────────────────────────────
  const bear = useMemo(() => runWaterfall(bearM, classes, holdYears), [bearM, classes, holdYears]);
  const base = useMemo(() => runWaterfall(baseM, classes, holdYears), [baseM, classes, holdYears]);
  const bull = useMemo(() => runWaterfall(bullM, classes, holdYears), [bullM, classes, holdYears]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  function addClass() {
    setClasses(cs => [...cs, {
      id: uid(), name: "", shares: 0, entryPrice: 0,
      prefType: "part-uncapped", prefMultiple: 1, partCap: 3, isUs: false,
    }]);
  }
  function removeClass(id: string) { setClasses(cs => cs.filter(c => c.id !== id)); }
  function upd<K extends keyof ShareClass>(id: string, field: K, val: ShareClass[K]) {
    setClasses(cs => cs.map(c => c.id === id ? { ...c, [field]: val } : c));
  }
  function toggleUs(id: string) {
    setClasses(cs => cs.map(c => ({ ...c, isUs: c.id === id ? !c.isUs : c.isUs })));
  }

  // ── Memo generation ──────────────────────────────────────────────────────────
  function buildMemo(): string {
    const fundClass = classes.find(c => c.isUs);
    const totalShares = classes.reduce((s, c) => s + c.shares, 0);
    const entryOwn = fundClass ? (fundClass.shares / totalShares * 100).toFixed(1) : "—";
    const prefImpact = base.fundProRataM - base.fundM;
    const founderPct = baseM > 0 ? (base.founderM / baseM) * 100 : 0;
    const alignFlag = founderPct >= 15 ? "STRONG" : founderPct >= 5 ? "MODERATE" : "WEAK";
    const flags: string[] = [];
    if (bear.fundMOIC < 1) flags.push(`Loss scenario at bear exit (${fmtM(bearM)}) — fund MOIC ${fmtMOIC(bear.fundMOIC)}`);
    if (base.fundMOIC < 1.5) flags.push(`Thin returns at base exit — MOIC ${fmtMOIC(base.fundMOIC)} below 1.5× threshold`);
    if (bear.insufficient) flags.push(`Bear exit (${fmtM(bearM)}) insufficient to cover participating preference stack`);
    if (prefImpact > base.fundM * 0.3) flags.push(`Preference stack materially reduces fund proceeds — ${fmtM(prefImpact)} reduction vs pro-rata at base exit`);
    if (flags.length === 0) flags.push("No material flags");

    return `## FINANCING & EXIT SUMMARY — FOR AGENT USE

**Fund Entry:**
- Round: ${fundClass?.name ?? "—"}
- Investment: ${fmtM(base.classes.find(r => r.isUs)?.investM ?? 0)}
- Entry price: £${fundClass?.entryPrice?.toFixed(2) ?? "—"}/share
- Ownership (entry / exit-adjusted): ${entryOwn}% / ${entryOwn}%
- Liquidation preference: ${fundClass ? PREF_LABELS[fundClass.prefType] : "—"} ${fundClass?.prefMultiple ?? 1}×

**Exit Scenarios:**

| Scenario | Valuation | Fund Proceeds | MOIC | IRR | Hold |
|---|---|---|---|---|---|
| Bear | ${fmtM(bearM)} | ${fmtM(bear.fundM)} | ${fmtMOIC(bear.fundMOIC)} | ${fmtIRR(bear.fundIRR)} | ${holdYears} yrs |
| Base | ${fmtM(baseM)} | ${fmtM(base.fundM)} | ${fmtMOIC(base.fundMOIC)} | ${fmtIRR(base.fundIRR)} | ${holdYears} yrs |
| Bull | ${fmtM(bullM)} | ${fmtM(bull.fundM)} | ${fmtMOIC(bull.fundMOIC)} | ${fmtIRR(bull.fundIRR)} | ${holdYears} yrs |

**Preference Stack Impact (Base Scenario):**
- Total preference claims: ${fmtM(base.prefStackM)}
- Fund proceeds under waterfall: ${fmtM(base.fundM)}
- Fund proceeds if converted pro-rata: ${fmtM(base.fundProRataM)}
- Preference stack reduction vs pro-rata: ${fmtM(Math.max(0, prefImpact))}

**Founder Alignment:**
- Founder take-home at base exit: ${fmtM(base.founderM)} (${fmtPct(founderPct)} of exit)
- Founder take-home at bear exit: ${fmtM(bear.founderM)}
- Alignment flag: ${alignFlag}

**Flags for Agent:**
${flags.map(f => `- ${f}`).join("\n")}`;
  }

  async function copyMemo() {
    await navigator.clipboard.writeText(buildMemo());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Style helpers ────────────────────────────────────────────────────────────
  const th: React.CSSProperties  = { padding: "0.4rem 0.75rem", textAlign: "left",  borderBottom: "2px solid #ddd", whiteSpace: "nowrap", fontSize: "0.85em" };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties  = { padding: "0.35rem 0.75rem", borderBottom: "1px solid #eee", fontSize: "0.85em" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "monospace" };
  const smallBtn: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.85em", padding: "0.2rem 0.5rem", cursor: "pointer" };
  const linkBtn: React.CSSProperties  = { fontFamily: "monospace", fontSize: "0.82em", background: "none", border: "none", cursor: "pointer", color: "#555", padding: 0, textDecoration: "underline", textUnderlineOffset: "2px" };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const scenarios = [
    { key: "bear" as const, label: "Bear", result: bear, exitM: bearM },
    { key: "base" as const, label: "Base", result: base, exitM: baseM },
    { key: "bull" as const, label: "Bull", result: bull, exitM: bullM },
  ];

  const partPrefTotal = useMemo(() =>
    classes.filter(c => c.prefType === "part-uncapped" || c.prefType === "part-capped")
      .reduce((s, c) => s + (c.shares * c.entryPrice / 1_000_000) * c.prefMultiple, 0),
    [classes]);
  const totalShares = useMemo(() => classes.reduce((s, c) => s + c.shares, 0), [classes]);

  const prefImpactBase = base.fundProRataM - base.fundM;

  const insightLine = base.classes.some(r => r.isUs)
    ? `At base exit (${fmtM(baseM)}), the fund returns ${fmtMOIC(base.fundMOIC)} / ${fmtIRR(base.fundIRR)} IRR; the preference stack ${prefImpactBase > 0.01 ? `reduces fund proceeds by ${fmtM(prefImpactBase)} vs. pro-rata conversion` : "does not reduce fund proceeds vs. pro-rata"}.`
    : "";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <p><Link href={`/deals/${id}`}>← Back to deal</Link></p>
      <h1 style={{ marginBottom: "0.25rem" }}>Exit Scenarios</h1>
      <p style={{ color: "#666", marginTop: "0", marginBottom: "0.5rem", maxWidth: "640px", fontSize: "0.88em" }}>
        Full liquidation waterfall across three exit scenarios. Non-participating preferred choose
        between liquidation preference and pro-rata conversion. Participating preferred take preference
        then share in remaining proceeds. Common shareholders receive the residual.
      </p>

      {/* ══ Section 1: Preference Stack ════════════════════════════════════════ */}
      <SectionHeader>1. Share Classes &amp; Liquidation Preferences</SectionHeader>

      <p style={{ fontSize: "0.8em", color: "#999", marginBottom: "0.75rem" }}>
        Enter all share classes as they will be at exit. Check ★ for the class(es) held by your fund.
        Defaults show a worked example — edit freely.
      </p>

      <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
          <thead>
            <tr>
              <th style={th}>Class name</th>
              <th style={thR}>Shares</th>
              <th style={thR}>Entry £/sh</th>
              <th style={thR}>Invested</th>
              <th style={th}>Preference type</th>
              <th style={thR}>Mult</th>
              <th style={{ ...th, textAlign: "center" }}>★ Us</th>
              <th style={{ ...th, width: "2rem" }} />
            </tr>
          </thead>
          <tbody>
            {classes.map(c => {
              const inv = (c.shares * c.entryPrice) / 1_000_000;
              return (
                <tr key={c.id} style={{ background: c.isUs ? "#fffbe6" : "transparent" }}>
                  <td style={td}>
                    <input
                      value={c.name}
                      onChange={e => upd(c.id, "name", e.target.value)}
                      placeholder="Class name"
                      style={{ fontFamily: "monospace", width: "160px", border: "none", background: "transparent", outline: "none" }}
                    />
                  </td>
                  <td style={tdR}>
                    <NInput value={c.shares} onChange={v => upd(c.id, "shares", v)} step={100_000} width={100} />
                  </td>
                  <td style={tdR}>
                    <NInput value={c.entryPrice} onChange={v => upd(c.id, "entryPrice", v)} prefix="£" step={0.01} width={80} />
                  </td>
                  <td style={{ ...tdR, color: "#666" }}>
                    {inv < 0.1 ? `£${(inv * 1000).toFixed(0)}K` : fmtM(inv)}
                  </td>
                  <td style={td}>
                    <select
                      value={c.prefType}
                      onChange={e => upd(c.id, "prefType", e.target.value as PrefType)}
                      style={{ fontFamily: "monospace", fontSize: "0.9em" }}
                    >
                      {(Object.entries(PREF_LABELS) as [PrefType, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdR}>
                    {(c.prefType !== "common" && c.prefType !== "pari-passu") ? (
                      <NInput value={c.prefMultiple} onChange={v => upd(c.id, "prefMultiple", v)} step={0.25} min={1} width={60} />
                    ) : (
                      <span style={{ color: "#ccc" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={c.isUs}
                      onChange={() => toggleUs(c.id)}
                      style={{ cursor: "pointer" }}
                      title="Mark as our firm"
                    />
                  </td>
                  <td style={td}>
                    <button onClick={() => removeClass(c.id)} style={{ ...smallBtn, color: "#999", border: "none", background: "none" }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #ddd" }}>
              <td style={{ ...td, color: "#888", fontStyle: "italic" }} colSpan={2}>
                <button style={smallBtn} onClick={addClass}>+ Add class</button>
              </td>
              <td style={{ ...td, fontWeight: "bold", textAlign: "right", paddingRight: "0.75rem" }}>Total invested:</td>
              <td style={{ ...tdR, fontWeight: "bold" }}>
                {fmtM(classes.reduce((s, c) => s + (c.shares * c.entryPrice) / 1_000_000, 0))}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ══ Section 2: Exit Assumptions ════════════════════════════════════════ */}
      <SectionHeader>2. Exit Assumptions</SectionHeader>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, auto))", gap: "2rem", alignItems: "start", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.3rem" }}>Bear exit</label>
          <NInput value={bearM} onChange={setBearM} prefix="£" suffix="M" step={50} width={80} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.3rem" }}>Base exit</label>
          <NInput value={baseM} onChange={setBaseM} prefix="£" suffix="M" step={50} width={80} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.3rem" }}>Bull exit</label>
          <NInput value={bullM} onChange={setBullM} prefix="£" suffix="M" step={100} width={80} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.3rem" }}>Hold period</label>
          <NInput value={holdYears} onChange={setHoldYears} suffix="yr" step={1} min={1} max={15} width={60} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.3rem" }}>Exit type</label>
          <select
            value={exitType}
            onChange={e => setExitType(e.target.value as ExitType)}
            style={{ fontFamily: "monospace" }}
          >
            {(["M&A", "IPO", "Secondary"] as ExitType[]).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ══ Section 3: Fund Returns Summary ════════════════════════════════════ */}
      <SectionHeader>3. Fund Returns — Three Scenarios</SectionHeader>

      <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "480px" }}>
          <thead>
            <tr>
              <th style={th}></th>
              <th style={{ ...thR, color: "#c55" }}>Bear</th>
              <th style={{ ...thR, fontWeight: "bold" }}>Base</th>
              <th style={{ ...thR, color: "#585" }}>Bull</th>
            </tr>
          </thead>
          <tbody>
            {[
              { row: "Exit valuation",    vals: scenarios.map(s => fmtM(s.exitM)) },
              { row: "Exit type",         vals: scenarios.map(() => exitType) },
              { row: "Fund proceeds",     vals: scenarios.map(s => fmtM(s.result.fundM)), bold: true },
              { row: "MOIC",              vals: scenarios.map(s => fmtMOIC(s.result.fundMOIC)), colors: scenarios.map(s => moicColor(s.result.fundMOIC)), bold: true },
              { row: "IRR",               vals: scenarios.map(s => fmtIRR(s.result.fundIRR)) },
              { row: "Hold period",       vals: scenarios.map(() => `${holdYears} yrs`) },
              { row: "Founder take-home", vals: scenarios.map(s => s.result.founderM > 0 ? fmtM(s.result.founderM) : "—") },
            ].map(({ row, vals, bold, colors }) => (
              <tr key={row}>
                <td style={{ ...td, color: "#555" }}>{row}</td>
                {vals.map((v, i) => (
                  <td key={i} style={{ ...tdR, fontWeight: bold ? "bold" : "normal", color: colors?.[i] ?? (bold ? "#111" : "#555") }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid #ddd" }}>
              <td style={{ ...td, color: "#555" }}>Return flag</td>
              {scenarios.map(s => {
                const m = s.result.fundMOIC;
                const flag  = m < 1 ? "⚠ Loss" : m < 1.5 ? "▲ Thin" : "✓";
                const color = m < 1 ? "#c00" : m < 1.5 ? "#888800" : "#2a7a2a";
                return <td key={s.key} style={{ ...tdR, color, fontWeight: "bold" }}>{flag}</td>;
              })}
            </tr>
            {scenarios.some(s => s.result.insufficient) && (
              <tr>
                <td colSpan={4} style={{ ...td, color: "#c00", fontSize: "0.8em" }}>
                  ⚠ One or more scenarios: exit proceeds insufficient to cover participating preference stack — common shareholders receive nothing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {insightLine && (
        <p style={{ fontStyle: "italic", color: "#555", fontSize: "0.85em", maxWidth: "640px", marginBottom: "0.5rem", lineHeight: 1.5 }}>
          {insightLine}
        </p>
      )}

      {scenarios.some(s => !s.result.sumOk) && (
        <p style={{ color: "#c00", fontSize: "0.8em" }}>
          ⚠ Waterfall check failed — proceeds do not sum to exit value. Review preference inputs.
        </p>
      )}

      {/* ══ Section 4: Full Waterfall (advanced toggle) ════════════════════════ */}
      <SectionHeader>4. Full Waterfall by Share Class</SectionHeader>

      <button style={linkBtn} onClick={() => setShowAdvanced(v => !v)}>
        {showAdvanced ? "▲ Hide waterfall tables" : "▼ Show full waterfall by share class"}
      </button>

      {showAdvanced && scenarios.map(s => (
        <div key={s.key} style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #ddd", background: "#fafafa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "0.9em" }}>
              {s.label} — {fmtM(s.exitM)} {exitType}
            </h3>
            {s.result.insufficient && (
              <span style={{ fontSize: "0.8em", color: "#c00", fontWeight: "bold" }}>
                Preference stack exceeds exit proceeds
              </span>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "680px", fontSize: "0.82em" }}>
              <thead>
                <tr>
                  <th style={th}>Shareholder</th>
                  <th style={thR}>Shares</th>
                  <th style={th}>Preference type</th>
                  <th style={thR}>Pref claim</th>
                  <th style={thR}>Pref payoff</th>
                  <th style={thR}>Pro-rata</th>
                  <th style={thR}>Total payoff</th>
                  <th style={thR}>% of exit</th>
                  <th style={thR}>MOIC</th>
                </tr>
              </thead>
              <tbody>
                {s.result.classes.map((r, i) => {
                  const cls = classes[i];
                  return (
                    <tr key={r.id} style={{ background: r.isUs ? "#fffbe6" : "transparent" }}>
                      <td style={{ ...td, fontWeight: r.isUs ? "bold" : "normal" }}>
                        {r.isUs ? "★ " : ""}{r.name}
                      </td>
                      <td style={tdR}>{fmtShares(r.shares)}</td>
                      <td style={td}>{cls ? PREF_LABELS[cls.prefType] : "—"}</td>
                      <td style={tdR}>{r.prefAmountM > 0 ? fmtM(r.prefAmountM) : "—"}</td>
                      <td style={{ ...tdR, color: r.tookPref ? "#337" : undefined }}>
                        {r.prefPayoffM > 0
                          ? `${fmtM(r.prefPayoffM)}${!r.tookPref && r.prefAmountM > 0 ? "" : ""}`
                          : r.prefAmountM > 0
                            ? <span style={{ color: "#999" }}>→ converts</span>
                            : "—"}
                      </td>
                      <td style={tdR}>{r.proRataM > 0.001 ? fmtM(r.proRataM) : "—"}</td>
                      <td style={{ ...tdR, fontWeight: "bold", color: r.isUs ? "#b87700" : undefined }}>
                        {fmtM(r.totalM)}
                      </td>
                      <td style={tdR}>{fmtPct(r.pctOfExit)}</td>
                      <td style={{ ...tdR, fontWeight: "bold", color: r.investM > 0 ? moicColor(r.moic) : undefined }}>
                        {r.investM > 0 ? fmtMOIC(r.moic) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid #bbb", fontWeight: "bold" }}>
                  <td style={td} colSpan={6}>Total</td>
                  <td style={{ ...tdR, fontWeight: "bold" }}>{fmtM(s.exitM)}</td>
                  <td style={tdR}>100%</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Preference flip analysis */}
          {classes.some(c => c.prefType === "non-part") && (
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #eee" }}>
              <div style={{ fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", marginBottom: "0.4rem" }}>
                Preference flip analysis
              </div>
              {classes.filter(c => c.prefType === "non-part").map(c => {
                const result = s.result.classes.find(r => r.id === c.id);
                const flip = flipPoint(c, partPrefTotal, totalShares);
                const elected = result?.tookPref ? "takes preference" : "elects conversion";
                return (
                  <p key={c.id} style={{ fontSize: "0.82em", color: "#555", margin: "0.2rem 0" }}>
                    {c.name}: {elected} at {fmtM(s.exitM)} exit
                    {flip !== null ? ` — preference flips to conversion above ${fmtM(flip)}` : ""}.
                  </p>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* ══ Section 5: Structured Output for Agent ══════════════════════════════ */}
      <SectionHeader>5. Generate Structured Output — Financing &amp; Valuation Agent</SectionHeader>

      <p style={{ fontSize: "0.82em", color: "#888", maxWidth: "600px", marginBottom: "0.75rem" }}>
        Copy this block into the Agent 4 (Financing &amp; Valuation) prompt context before generating the investment memo.
        The agent will synthesise it into a narrative covering return expectations, downside protection,
        founder alignment, and exit pathway recommendation.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <button
          style={smallBtn}
          onClick={() => setShowMemo(v => !v)}
        >
          {showMemo ? "▲ Hide preview" : "▼ Preview structured output"}
        </button>
        <button
          style={{ ...smallBtn, background: copied ? "#eee" : "#111", color: copied ? "#555" : "#fff", border: "1px solid #111" }}
          onClick={copyMemo}
        >
          {copied ? "✓ Copied!" : "Copy to clipboard"}
        </button>
      </div>

      {showMemo && (
        <pre style={{
          background: "#111", color: "#e8e8e8", padding: "1rem",
          fontSize: "0.78em", fontFamily: "monospace", lineHeight: 1.6,
          overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: "420px", overflowY: "auto",
        }}>
          {buildMemo()}
        </pre>
      )}

      {/* ══ Submit to Deal Page ════════════════════════════════════════════════ */}
      <SectionHeader>6. Submit to Deal Page</SectionHeader>

      <div style={{ border: "1px solid #d4b800", background: "#fffce6", borderRadius: "4px", padding: "1rem", maxWidth: 480 }}>
        <p style={{ fontSize: "0.82em", color: "#78350f", marginTop: 0, marginBottom: "0.75rem" }}>
          Confirm the base scenario return figures to surface on the deal summary page.
        </p>

        <div style={{ display: "flex", gap: "2rem", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.7em", textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e" }}>Base MOIC</div>
            <div style={{ fontFamily: "monospace", fontSize: "1.2em", fontWeight: "bold" }}>{fmtMOIC(base.fundMOIC)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.7em", textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e" }}>Base IRR ({holdYears}yr)</div>
            <div style={{ fontFamily: "monospace", fontSize: "1.2em", fontWeight: "bold" }}>{fmtIRR(base.fundIRR)}</div>
          </div>
        </div>

        {deal?.exit_submitted_at && !exSubmitDone && (
          <div style={{ fontSize: "0.75em", color: "#92400e", marginBottom: "0.4rem" }}>
            Last submitted: {new Date(deal.exit_submitted_at).toLocaleString()}
          </div>
        )}
        {exSubmitDone && deal?.exit_submitted_at && (
          <div style={{ fontSize: "0.75em", color: "#166534", marginBottom: "0.4rem" }}>
            ✓ Submitted at {new Date(deal.exit_submitted_at).toLocaleString()}
          </div>
        )}
        {!base.classes.some((r) => r.isUs) && (
          <p style={{ fontSize: "0.78em", color: "#aaa", margin: "0 0 0.5rem" }}>
            Mark your firm (★) in section 1 to enable submission.
          </p>
        )}
        <button
          onClick={() => handleExitSubmit(base.fundMOIC, base.fundIRR)}
          disabled={exSubmitting || !base.classes.some((r) => r.isUs)}
          style={{
            fontFamily: "monospace", fontSize: "0.85em",
            padding: "0.3rem 0.85rem", cursor: "pointer",
            background: "#111", color: "#fff", border: "none",
          }}
        >
          {exSubmitting ? "Submitting…" : "Confirm & submit to deal page"}
        </button>
      </div>

      {/* Navigation */}
      <div style={{ marginTop: "2.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href={`/deals/${id}/market-sizing`}>
          <button style={smallBtn}>← Market Sizing</button>
        </Link>
        <Link href={`/deals/${id}/cap-table`}>
          <button style={smallBtn}>Cap Table &amp; Returns →</button>
        </Link>
      </div>
    </div>
  );
}
