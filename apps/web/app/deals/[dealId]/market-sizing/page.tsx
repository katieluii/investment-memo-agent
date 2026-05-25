"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { getDeal, submitMarketSizing, Deal } from "../../../../lib/api";
import { PRESETS, PRESET_LABELS, getHelper, PresetKey, CoreInputKey } from "./marketSizingConfig";
import {
  computeMarketEstimate,
  CoreInputFields,
  AdvancedInputs,
  MarketEstimate,
  DEFAULT_ADVANCED,
  flexCoreInputs,
} from "./computeMarketEstimate";
import {
  INDICATIONS,
  INDICATION_CATEGORIES,
  PRESET_CATEGORY_FILTER,
  getGeoPopulation,
  GeoKey,
  IndicationCategory,
  computePatientPopulation,
} from "./marketSizingData";

// ─── Format helpers ────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

// ─── Static config ─────────────────────────────────────────────────────────────

const CORE_LABELS: Record<CoreInputKey, string> = {
  population:           "Relevant patient population",
  diagnosedRate:        "Diagnosed / identified rate",
  eligibleRate:         "Clinically eligible rate",
  accessTreatedRate:    "Access-adjusted treatment rate",
  peakShare:            "Peak market share",
  grossPricePerPatient: "Gross annual price per patient",
  persistence:          "Persistence / duration adjustment",
};

const CORE_FIELD_ORDER: CoreInputKey[] = [
  "population", "diagnosedRate", "eligibleRate",
  "accessTreatedRate", "peakShare", "grossPricePerPatient", "persistence",
];

const PCT_FIELDS = new Set<CoreInputKey>([
  "diagnosedRate", "eligibleRate", "accessTreatedRate", "peakShare", "persistence",
]);

function fieldUnit(f: CoreInputKey): "%" | "$" | undefined {
  if (PCT_FIELDS.has(f)) return "%";
  if (f === "grossPricePerPatient") return "$";
  return undefined;
}

function fieldStep(f: CoreInputKey): number {
  if (f === "population")           return 10_000;
  if (f === "grossPricePerPatient") return 5_000;
  return 1;
}

const GEOGRAPHIES: GeoKey[] = ["US", "EU5", "Japan", "China", "Rest of World"];
const EROSION_LEVELS = ["low", "medium", "high"] as const;

// ─── Sub-components ────────────────────────────────────────────────────────────

function CoreField({
  label, helper, value, onChange, unit, step, dirty, netPrice,
}: {
  label: string; helper: string; value: number; onChange: (v: number) => void;
  unit?: "%" | "$"; step?: number; dirty: boolean; netPrice?: number;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.1rem" }}>
        <label style={{ fontWeight: "bold" }}>{label}</label>
        {dirty && <span style={{ fontSize: "0.7em", color: "#aaa", fontStyle: "italic" }}>modified</span>}
      </div>
      <div style={{ fontSize: "0.78em", color: "#888", marginBottom: "0.25rem", lineHeight: 1.4 }}>{helper}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        {unit === "$" && <span style={{ color: "#555" }}>$</span>}
        <input
          type="number"
          value={value}
          min={0}
          max={unit === "%" ? 100 : undefined}
          step={step}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{ fontFamily: "monospace", width: "140px" }}
        />
        {unit === "%" && <span style={{ color: "#555" }}>%</span>}
      </div>
      {netPrice !== undefined && netPrice !== value && (
        <div style={{ fontSize: "0.78em", color: "#666", marginTop: "0.2rem" }}>
          Net after GTN: <strong>{fmt$(netPrice)}</strong>/yr
        </div>
      )}
    </div>
  );
}

function SimpleField({
  label, note, value, onChange, prefix, suffix, step = 1, min = 0,
}: {
  label: string; note?: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.15rem" }}>{label}</label>
      {note && <div style={{ fontSize: "0.8em", color: "#888", marginBottom: "0.2rem" }}>{note}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        {prefix && <span>{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
          style={{ fontFamily: "monospace", width: "140px" }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </div>
  );
}

function Bar({ label, sublabel, value, maxValue }: {
  label: string; sublabel: string; value: number; maxValue: number;
}) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <span>
          <strong>{label}</strong>
          &nbsp;&nbsp;
          <span style={{ color: "#888", fontSize: "0.85em" }}>{sublabel}</span>
        </span>
        <strong>{fmt$(value)}</strong>
      </div>
      <div style={{ height: "8px", background: "#e5e5e5", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: "#333",
          borderRadius: "3px", transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

function WorkingsPanel({ inputs, advanced, result }: {
  inputs: CoreInputFields; advanced: AdvancedInputs; result: MarketEstimate;
}) {
  const netPrice = advanced.gtnEnabled
    ? inputs.grossPricePerPatient * (1 - advanced.grossToNet / 100)
    : inputs.grossPricePerPatient;

  const accessSteps: Array<{ label: string; pct: number }> = [
    { label: "access-adjusted treatment rate", pct: inputs.accessTreatedRate },
  ];
  if (advanced.confirmTestingEnabled) accessSteps.push({ label: "confirmatory testing", pct: advanced.confirmTestingAvail });
  if (advanced.specialistEnabled)     accessSteps.push({ label: "specialist-managed rate", pct: advanced.specialistRate });
  if (advanced.payerEnabled)          accessSteps.push({ label: "payer approval rate", pct: advanced.payerApprovalRate });

  const effectiveAccessPct = accessSteps.reduce((acc, s) => acc * s.pct / 100, 100);

  const erosionFactor = advanced.erosionEnabled
    ? ({ low: 1.0, medium: 0.90, high: 0.75 } as const)[advanced.competitiveErosion]
    : 1.0;

  const fmtPct = (n: number) => `${parseFloat(n.toFixed(2))}%`;

  const row: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.88em", marginBottom: "0.15rem" };
  const dim: React.CSSProperties = { color: "#999" };
  const val: React.CSSProperties = { color: "#333" };

  return (
    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #eee", fontSize: "0.82em" }}>

      {/* TAM */}
      <div style={{ marginBottom: "0.9rem" }}>
        <div style={{ fontWeight: "bold", color: "#333", marginBottom: "0.3rem", fontSize: "0.95em" }}>TAM</div>
        <div style={{ ...row, ...dim }}>population × gross price per patient</div>
        <div style={{ ...row, ...val }}>
          = {fmtPt(inputs.population)} × {fmt$(inputs.grossPricePerPatient)} = <strong>{fmt$(result.tam)}</strong>
        </div>
      </div>

      {/* SAM */}
      <div style={{ marginBottom: "0.9rem" }}>
        <div style={{ fontWeight: "bold", color: "#333", marginBottom: "0.3rem", fontSize: "0.95em" }}>SAM</div>
        <div style={{ ...row, ...dim }}>
          population × diagnosed% × eligible% × {accessSteps.length > 1 ? "effective access%" : "access%"} × {advanced.gtnEnabled ? "net price" : "price"}
        </div>
        {accessSteps.length > 1 && (
          <div style={{ ...row, color: "#aaa", paddingLeft: "0.5rem" }}>
            effective access = {accessSteps.map(s => fmtPct(s.pct)).join(" × ")} = {fmtPct(effectiveAccessPct)}
          </div>
        )}
        <div style={{ ...row, ...val }}>
          = {fmtPt(inputs.population)} × {fmtPct(inputs.diagnosedRate)} × {fmtPct(inputs.eligibleRate)} × {fmtPct(effectiveAccessPct)} × {fmt$(netPrice)} = <strong>{fmt$(result.sam)}</strong>
        </div>
      </div>

      {/* SOM */}
      <div>
        <div style={{ fontWeight: "bold", color: "#333", marginBottom: "0.3rem", fontSize: "0.95em" }}>SOM</div>
        <div style={{ ...row, ...dim }}>
          SAM × peak share%{advanced.erosionEnabled ? " × erosion factor" : ""} × persistence%
        </div>
        {advanced.erosionEnabled && (
          <div style={{ ...row, color: "#aaa", paddingLeft: "0.5rem" }}>
            erosion factor = {advanced.competitiveErosion} → ×{erosionFactor.toFixed(2)}
          </div>
        )}
        <div style={{ ...row, ...val }}>
          = {fmt$(result.sam)} × {fmtPct(inputs.peakShare)}{advanced.erosionEnabled ? ` × ${erosionFactor.toFixed(2)}` : ""} × {fmtPct(inputs.persistence)} = <strong>{fmt$(result.som)}</strong>
        </div>
      </div>
    </div>
  );
}

function TornadoChart({ inputs, advanced, baseline }: {
  inputs: CoreInputFields; advanced: AdvancedInputs; baseline: number;
}) {
  const flex = flexCoreInputs();
  const rows = CORE_FIELD_ORDER.map(field => {
    const key = field as keyof CoreInputFields;
    const range = flex[key];
    const capHi = PCT_FIELDS.has(field) ? 100 : Infinity;
    const hiVal = Math.min(capHi, inputs[key] * range.hi);
    const loVal = Math.max(0, inputs[key] * range.lo);
    const high = computeMarketEstimate({ ...inputs, [key]: hiVal, ...advanced }).som;
    const low  = computeMarketEstimate({ ...inputs, [key]: loVal, ...advanced }).som;
    return { field, label: CORE_LABELS[field], high, low, impact: high - low };
  }).sort((a, b) => b.impact - a.impact);

  const maxDev = Math.max(...rows.flatMap(r => [r.high - baseline, baseline - r.low]), 1);
  const flex2 = flexCoreInputs();

  return (
    <div style={{ marginTop: "1rem" }}>
      {rows.map(row => {
        const highW = Math.max(0, ((row.high - baseline) / maxDev) * 100);
        const lowW  = Math.max(0, ((baseline - row.low)  / maxDev) * 100);
        const key = row.field as keyof CoreInputFields;
        const range = flex2[key];
        const loPct = Math.round((1 - range.lo) * 100);
        const hiPct = Math.round((range.hi - 1) * 100);
        return (
          <div key={row.field} style={{ display: "flex", alignItems: "center", marginBottom: "0.4rem", gap: "0.5rem", fontSize: "0.8em" }}>
            <span style={{ width: "170px", flexShrink: 0, color: "#555", fontSize: "0.9em" }}>
              {row.label}
              <span style={{ color: "#bbb", fontSize: "0.85em" }}> (±{loPct}/{hiPct}%)</span>
            </span>
            <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: `${lowW}%`, height: "12px", background: "#c55", borderRadius: "2px 0 0 2px" }} />
              </div>
              <div style={{ width: "2px", height: "18px", background: "#333", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: `${highW}%`, height: "12px", background: "#585", borderRadius: "0 2px 2px 0" }} />
              </div>
            </div>
            <span style={{ width: "65px", textAlign: "right", color: "#888" }}>{fmt$(row.impact)}</span>
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.6rem", fontSize: "0.78em", color: "#777" }}>
        <span style={{ display: "inline-block", width: "24px", height: "8px", background: "#c55", borderRadius: "2px" }} />Bear
        <span style={{ display: "inline-block", width: "24px", height: "8px", background: "#585", borderRadius: "2px", marginLeft: "0.5rem" }} />Bull
        <span style={{ marginLeft: "0.5rem", color: "#bbb" }}>impact = SOM swing per input</span>
      </div>
    </div>
  );
}

function WebSearchModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{ background: "#fff", padding: "2rem", maxWidth: "440px", width: "100%", borderRadius: "4px" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1em" }}>Search for an indication</h2>
        <p style={{ fontSize: "0.85em", color: "#666" }}>
          Live epidemiology search is coming soon. For now, enter the patient population
          manually using published sources (GlobalData, EvaluatePharma, NIH SEER, etc.).
        </p>
        <button
          onClick={onClose}
          style={{ fontFamily: "monospace", padding: "0.35rem 1rem", cursor: "pointer", marginTop: "1rem" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MarketSizingPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  useEffect(() => {
    getDeal(id).then(setDeal).catch(() => {});
  }, [id]);

  async function handleSubmitSom(somValue: number) {
    setSubmitting(true);
    setSubmitDone(false);
    try {
      const updated = await submitMarketSizing(id, somValue / 1_000_000);
      setDeal(updated);
      setSubmitDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  const [mode, setMode] = useState<"bottom-up" | "top-down">("bottom-up");

  // ── Market definition ──────────────────────────────────────────────────────
  const [showMarketDef, setShowMarketDef]           = useState(true);
  const [geography, setGeography]                   = useState<GeoKey[]>(["US"]);
  const [preset, setPreset]                         = useState<PresetKey>("general");
  const [indication, setIndication]                 = useState("");
  const [peakYear, setPeakYear]                     = useState(new Date().getFullYear() + 5);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [showSearchModal, setShowSearchModal]       = useState(false);

  // ── Core funnel inputs ─────────────────────────────────────────────────────
  const [inputs, setInputs] = useState<CoreInputFields>(PRESETS.general);
  const [dirty,  setDirty]  = useState<Set<CoreInputKey>>(new Set());

  function updateInput(field: CoreInputKey, value: number) {
    setInputs(prev => ({ ...prev, [field]: value }));
    setDirty(prev => { const s = new Set(prev); s.add(field); return s; });
  }

  // Apply preset funnel rates (never population) to non-dirty fields
  function applyPresetRates(newPreset: PresetKey) {
    const defaults = PRESETS[newPreset];
    setInputs(prev => {
      const next = { ...prev };
      for (const f of CORE_FIELD_ORDER) {
        if (f === "population") continue; // never overwrite from preset
        if (!dirty.has(f))
          (next as unknown as Record<string, number>)[f] =
            (defaults as unknown as Record<string, number>)[f];
      }
      return next;
    });
  }

  function handlePresetChange(newPreset: PresetKey) {
    setPreset(newPreset);
    applyPresetRates(newPreset);
    // If the current indication doesn't belong to the new TA, clear it
    if (indication) {
      const allowed = PRESET_CATEGORY_FILTER[newPreset];
      if (allowed) {
        const ind = INDICATIONS[indication];
        if (ind && !allowed.includes(ind.category)) {
          setIndication("");
          setSuggestionDismissed(false);
        }
      }
    }
  }

  function handleIndicationChange(key: string) {
    setIndication(key);
    setSuggestionDismissed(false);
    const ind = INDICATIONS[key];
    if (ind) {
      // Auto-set TA preset from indication, apply rates
      setPreset(ind.presetHint);
      applyPresetRates(ind.presetHint);
    }
  }

  // Filtered indication list for the selected TA preset
  const filteredIndications = useMemo(() => {
    const allowed = PRESET_CATEGORY_FILTER[preset]; // undefined = show all
    const groups: Partial<Record<IndicationCategory, Array<{ key: string; label: string }>>> = {};
    for (const [key, meta] of Object.entries(INDICATIONS)) {
      if (allowed && !allowed.includes(meta.category)) continue;
      if (!groups[meta.category]) groups[meta.category] = [];
      groups[meta.category]!.push({ key, label: meta.label });
    }
    return groups;
  }, [preset]);

  // Patient population suggestion from indication × geography × peak year
  const patientSuggestion = useMemo(() => {
    if (!indication || suggestionDismissed) return null;
    const ind = INDICATIONS[indication];
    if (!ind) return null;
    return computePatientPopulation(indication, geography, peakYear);
  }, [indication, geography, peakYear, suggestionDismissed]);

  function applyPatientSuggestion() {
    if (patientSuggestion == null) return;
    updateInput("population", Math.round(patientSuggestion));
    setSuggestionDismissed(true);
  }

  // ── Advanced assumptions ───────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced]         = useState<AdvancedInputs>(DEFAULT_ADVANCED);

  function setAdv<K extends keyof AdvancedInputs>(key: K, value: AdvancedInputs[K]) {
    setAdvanced(prev => ({ ...prev, [key]: value }));
  }

  // ── Sensitivity / workings ─────────────────────────────────────────────────
  const [showWorkings,    setShowWorkings]    = useState(false);
  const [showSensitivity, setShowSensitivity] = useState(false);

  // ── Top-down state ─────────────────────────────────────────────────────────
  const [tamM,   setTamM]   = useState(5_000);
  const [samPct, setSamPct] = useState(45);
  const [somPct, setSomPct] = useState(15);

  // ── Computed ───────────────────────────────────────────────────────────────
  const fullInputs = useMemo(() => ({ ...inputs, ...advanced }), [inputs, advanced]);
  const result     = useMemo(() => computeMarketEstimate(fullInputs), [fullInputs]);

  const flex = useMemo(() => flexCoreInputs(), []);

  const bearResult = useMemo(() => {
    const core: CoreInputFields = { ...inputs };
    for (const f of CORE_FIELD_ORDER) {
      const key = f as keyof CoreInputFields;
      const raw = inputs[key] * flex[key].lo;
      (core as unknown as Record<string, number>)[key] = PCT_FIELDS.has(f)
        ? Math.min(100, Math.max(0, raw)) : Math.max(0, raw);
    }
    return computeMarketEstimate({ ...core, ...advanced });
  }, [inputs, advanced, flex]);

  const bullResult = useMemo(() => {
    const core: CoreInputFields = { ...inputs };
    for (const f of CORE_FIELD_ORDER) {
      const key = f as keyof CoreInputFields;
      const raw = inputs[key] * flex[key].hi;
      (core as unknown as Record<string, number>)[key] = PCT_FIELDS.has(f)
        ? Math.min(100, Math.max(0, raw)) : Math.max(0, raw);
    }
    return computeMarketEstimate({ ...core, ...advanced });
  }, [inputs, advanced, flex]);

  const tdTam = tamM * 1_000_000;
  const tdSam = tdTam * (samPct / 100);
  const tdSom = tdSam * (somPct / 100);

  // Values shown in the right column (adapts to mode)
  const displayTam = mode === "bottom-up" ? result.tam : tdTam;
  const displaySam = mode === "bottom-up" ? result.sam : tdSam;
  const displaySom = mode === "bottom-up" ? result.som : tdSom;

  // ── Style helpers ──────────────────────────────────────────────────────────
  const modeBtn = (m: "bottom-up" | "top-down"): React.CSSProperties => ({
    fontFamily: "monospace",
    padding: "0.3rem 1rem",
    background: mode === m ? "#111" : "#fff",
    color: mode === m ? "#fff" : "#111",
    border: "1px solid #111",
    cursor: "pointer",
  });

  const linkBtn: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: "0.82em",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#666",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  };

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {showSearchModal && <WebSearchModal onClose={() => setShowSearchModal(false)} />}

      <p><Link href={`/deals/${id}`}>← Back to deal</Link></p>
      <h1 style={{ marginBottom: "0.25rem" }}>Market Sizing</h1>
      <p style={{ fontSize: "0.82em", color: "#888", marginTop: 0, marginBottom: "1.5rem", maxWidth: "620px" }}>
        SOM represents peak captured annual revenue — a useful input for exit valuation
        (typically 3–5× peak revenue), not a revenue forecast. The peak year is used to
        size geography populations at that point in time, compensating for the sigmoidal
        ramp-up to peak uptake that this model does not explicitly model.
      </p>

      {/* Mode toggle */}
      <div style={{ display: "flex", marginBottom: "2rem" }}>
        <button style={modeBtn("bottom-up")} onClick={() => setMode("bottom-up")}>Bottom-Up</button>
        <button style={modeBtn("top-down")}  onClick={() => setMode("top-down")}>Top-Down</button>
      </div>

      {/* Always-two-column layout — right column stays in place between tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", alignItems: "start" }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div>
          {mode === "bottom-up" ? (
            <>
              {/* ── Market definition ───────────────────────────────────────── */}
              <div style={{ border: "1px solid #ddd", background: "#fafafa", padding: "0.75rem 1rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showMarketDef ? "0.75rem" : 0 }}>
                  <span style={{ fontSize: "0.78em", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
                    Market Definition
                  </span>
                  <button style={linkBtn} onClick={() => setShowMarketDef(v => !v)}>
                    {showMarketDef ? "▲ collapse" : "▼ expand"}
                  </button>
                </div>

                {showMarketDef && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.85em" }}>

                    {/* Row 1: TA preset then Indication (linked) */}
                    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: "bold", marginBottom: "0.3rem", color: "#444" }}>Therapeutic area</div>
                        <select
                          value={preset}
                          onChange={e => handlePresetChange(e.target.value as PresetKey)}
                          style={{ fontFamily: "monospace" }}
                        >
                          {(Object.keys(PRESET_LABELS) as PresetKey[]).map(k => (
                            <option key={k} value={k}>{PRESET_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ fontWeight: "bold", marginBottom: "0.3rem", color: "#444" }}>
                          Indication
                          <span style={{ fontWeight: "normal", color: "#aaa", marginLeft: "0.4rem", fontSize: "0.88em" }}>
                            (filtered by TA)
                          </span>
                        </div>
                        <select
                          value={indication}
                          onChange={e => handleIndicationChange(e.target.value)}
                          style={{ fontFamily: "monospace", maxWidth: "220px" }}
                        >
                          <option value="">— select —</option>
                          {(Object.entries(filteredIndications) as [IndicationCategory, Array<{ key: string; label: string }>][])
                            .map(([cat, items]) => (
                              <optgroup key={cat} label={INDICATION_CATEGORIES[cat]}>
                                {items.map(({ key, label }) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </optgroup>
                            ))}
                        </select>
                        <div style={{ marginTop: "0.25rem" }}>
                          <button style={{ ...linkBtn, fontSize: "0.78em" }} onClick={() => setShowSearchModal(true)}>
                            Indication not listed →
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Geography + patient basis + peak year */}
                    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: "bold", marginBottom: "0.3rem", color: "#444" }}>Geography</div>
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                          {GEOGRAPHIES.map(geo => (
                            <label key={geo} style={{ display: "flex", alignItems: "center", gap: "0.2rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                              <input
                                type="checkbox"
                                checked={geography.includes(geo)}
                                onChange={e => {
                                  setGeography(g => e.target.checked ? [...g, geo] : g.filter(x => x !== geo));
                                  setSuggestionDismissed(false);
                                }}
                              />
                              {geo}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: "bold", marginBottom: "0.3rem", color: "#444" }}>
                          Peak year
                          <span style={{ fontWeight: "normal", color: "#aaa", marginLeft: "0.4rem", fontSize: "0.88em" }}>
                            (sizes populations at that year)
                          </span>
                        </div>
                        <input
                          type="number"
                          value={peakYear}
                          min={2025}
                          max={2045}
                          onChange={e => {
                            setPeakYear(Number(e.target.value));
                            setSuggestionDismissed(false);
                          }}
                          style={{ fontFamily: "monospace", width: "80px" }}
                        />
                      </div>
                    </div>

                    {/* Patient population suggestion banner */}
                    {patientSuggestion != null && !suggestionDismissed && (
                      <div style={{
                        border: "1px solid #b8d4f0", background: "#f0f7ff",
                        padding: "0.6rem 0.75rem", fontSize: "0.85em",
                      }}>
                        <div style={{ marginBottom: "0.4rem" }}>
                          <strong>{INDICATIONS[indication]?.label}</strong> in{" "}
                          <strong>{geography.join(", ")}</strong> ({peakYear}):{" "}
                          ~<strong>{fmtPt(patientSuggestion)} patients</strong>
                        </div>
                        <div style={{ fontSize: "0.88em", color: "#667", marginBottom: "0.5rem" }}>
                          {geography.map(g => {
                            const pop = getGeoPopulation(g, peakYear);
                            const rate = INDICATIONS[indication]?.per100k[g];
                            if (!pop || !rate) return null;
                            const n = Math.round((pop / 100_000) * rate);
                            return (
                              <span key={g} style={{ marginRight: "0.75rem" }}>
                                {g}: {fmtPt(n)}
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            onClick={applyPatientSuggestion}
                            style={{ fontFamily: "monospace", padding: "0.2rem 0.75rem", cursor: "pointer", background: "#111", color: "#fff", border: "none", fontSize: "0.9em" }}
                          >
                            Use this estimate
                          </button>
                          <button
                            onClick={() => setSuggestionDismissed(true)}
                            style={{ fontFamily: "monospace", padding: "0.2rem 0.75rem", cursor: "pointer", fontSize: "0.9em" }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <h2 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "0.9em", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Core Funnel Inputs
              </h2>

              {CORE_FIELD_ORDER.map(field => (
                <CoreField
                  key={field}
                  label={CORE_LABELS[field]}
                  helper={getHelper(field, preset)}
                  value={inputs[field as keyof CoreInputFields]}
                  onChange={v => updateInput(field, v)}
                  unit={fieldUnit(field)}
                  step={fieldStep(field)}
                  dirty={dirty.has(field)}
                  netPrice={
                    field === "grossPricePerPatient" && advanced.gtnEnabled
                      ? inputs.grossPricePerPatient * (1 - advanced.grossToNet / 100)
                      : undefined
                  }
                />
              ))}

              {/* ── Advanced assumptions drawer ──────────────────────────────── */}
              <div style={{ borderTop: "1px solid #ddd", paddingTop: "0.75rem", marginTop: "1.25rem" }}>
                <button style={linkBtn} onClick={() => setShowAdvanced(v => !v)}>
                  {showAdvanced ? "▲ Hide advanced assumptions" : "▼ Advanced assumptions"}
                </button>

                {showAdvanced && (
                  <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#fafafa", border: "1px solid #eee" }}>
                    <p style={{ fontSize: "0.75em", color: "#888", margin: "0 0 0.75rem" }}>
                      Enable each toggle to wire it into the calculation. Disabled rows are for reference only.
                    </p>

                    <AdvRow label="Gross-to-net discount" enabled={advanced.gtnEnabled} onToggle={v => setAdv("gtnEnabled", v)}>
                      <input type="number" value={advanced.grossToNet} min={0} max={80}
                        onChange={e => setAdv("grossToNet", Number(e.target.value) || 0)}
                        style={{ fontFamily: "monospace", width: "60px" }} />
                      <span style={{ color: "#888" }}>%</span>
                    </AdvRow>

                    <AdvRow label="Confirmatory testing availability" enabled={advanced.confirmTestingEnabled} onToggle={v => setAdv("confirmTestingEnabled", v)}>
                      <input type="number" value={advanced.confirmTestingAvail} min={0} max={100}
                        onChange={e => setAdv("confirmTestingAvail", Number(e.target.value) || 0)}
                        style={{ fontFamily: "monospace", width: "60px" }} />
                      <span style={{ color: "#888" }}>%</span>
                    </AdvRow>

                    <AdvRow label="Specialist-managed rate" enabled={advanced.specialistEnabled} onToggle={v => setAdv("specialistEnabled", v)}>
                      <input type="number" value={advanced.specialistRate} min={0} max={100}
                        onChange={e => setAdv("specialistRate", Number(e.target.value) || 0)}
                        style={{ fontFamily: "monospace", width: "60px" }} />
                      <span style={{ color: "#888" }}>%</span>
                    </AdvRow>

                    <AdvRow label="Payer approval rate" enabled={advanced.payerEnabled} onToggle={v => setAdv("payerEnabled", v)}>
                      <input type="number" value={advanced.payerApprovalRate} min={0} max={100}
                        onChange={e => setAdv("payerApprovalRate", Number(e.target.value) || 0)}
                        style={{ fontFamily: "monospace", width: "60px" }} />
                      <span style={{ color: "#888" }}>%</span>
                    </AdvRow>

                    <AdvRow label="Competitive erosion haircut" enabled={advanced.erosionEnabled} onToggle={v => setAdv("erosionEnabled", v)}>
                      <select value={advanced.competitiveErosion}
                        onChange={e => setAdv("competitiveErosion", e.target.value as AdvancedInputs["competitiveErosion"])}
                        style={{ fontFamily: "monospace" }}>
                        {EROSION_LEVELS.map(v => (
                          <option key={v} value={v}>
                            {v} ({v === "low" ? "no haircut" : v === "medium" ? "−10%" : "−25%"})
                          </option>
                        ))}
                      </select>
                    </AdvRow>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Top-down inputs */
            <>
              <h2 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "0.9em", textTransform: "uppercase", letterSpacing: "0.08em" }}>Inputs</h2>
              <SimpleField label="Total market — analyst estimate" note="Published market research figure"
                value={tamM} onChange={setTamM} prefix="$" suffix="M" step={100} />
              <SimpleField label="Serviceable segment" note="Geography, indication subset, line of therapy, etc."
                value={samPct} onChange={setSamPct} suffix="%" />
              <SimpleField label="Realistic market share" note="Peak share based on competitive dynamics"
                value={somPct} onChange={setSomPct} suffix="%" />
            </>
          )}
        </div>

        {/* ── Right column: always in the same position ────────────────────── */}
        <div>
          <h2 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "0.9em", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Market Estimate
          </h2>

          <Bar label="TAM" sublabel="Gross theoretical pool"      value={displayTam} maxValue={displayTam} />
          <Bar label="SAM" sublabel="Eligible accessible"          value={displaySam} maxValue={displayTam} />
          <Bar label="SOM" sublabel="Capturable peak revenue"      value={displaySom} maxValue={displayTam} />

          {/* Workings toggle — bottom-up only */}
          {mode === "bottom-up" && (
            <div style={{ marginBottom: "0.5rem" }}>
              <button style={linkBtn} onClick={() => setShowWorkings(v => !v)}>
                {showWorkings ? "▲ Hide workings" : "▼ Show workings"}
              </button>
              {showWorkings && <WorkingsPanel inputs={inputs} advanced={advanced} result={result} />}
            </div>
          )}

          <div style={{ marginTop: "1.5rem", padding: "1rem", border: "2px solid #111", background: "#f7f7f7" }}>
            <div style={{ fontSize: "0.7em", textTransform: "uppercase", letterSpacing: "0.12em", color: "#666", marginBottom: "0.4rem" }}>
              Peak Annual Revenue (SOM)
            </div>
            <div style={{ fontSize: "2.2em", fontWeight: "bold" }}>{fmt$(displaySom)}</div>
            {mode === "bottom-up" && (
              <div style={{ fontSize: "0.8em", color: "#666", marginTop: "0.35rem" }}>
                {fmtPt(result.capturedPatients)} patients
                {advanced.gtnEnabled
                  ? ` · ${fmt$(result.netPricePerPatient)}/yr net (${fmt$(inputs.grossPricePerPatient)} gross)`
                  : ` · ${fmt$(inputs.grossPricePerPatient)}/yr`}
                {" · "}{inputs.persistence}% persistence
              </div>
            )}
            {mode === "top-down" && (
              <div style={{ fontSize: "0.8em", color: "#666", marginTop: "0.35rem" }}>
                {samPct}% of TAM × {somPct}% capture
              </div>
            )}
          </div>

          {/* Sensitivity — bottom-up only */}
          {mode === "bottom-up" && (
            <div style={{ marginTop: "1rem" }}>
              <button style={linkBtn} onClick={() => setShowSensitivity(v => !v)}>
                {showSensitivity ? "▲ Hide sensitivity" : "▼ Show sensitivity analysis"}
              </button>
              {showSensitivity && (
                <TornadoChart inputs={inputs} advanced={advanced} baseline={result.som} />
              )}
            </div>
          )}

          {/* Bear / Base / Bull — bottom-up only */}
          {mode === "bottom-up" && (
            <div style={{ marginTop: "1.75rem" }}>
              <div style={{ fontSize: "0.78em", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555", marginBottom: "0.6rem" }}>
                Bear / Base / Bull
              </div>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85em" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.3rem 0.5rem", borderBottom: "1px solid #ddd", color: "#777", fontWeight: "normal" }}></th>
                    <th style={{ textAlign: "right", padding: "0.3rem 0.5rem", borderBottom: "1px solid #ddd", color: "#c55" }}>Bear</th>
                    <th style={{ textAlign: "right", padding: "0.3rem 0.5rem", borderBottom: "1px solid #ddd", color: "#333" }}>Base</th>
                    <th style={{ textAlign: "right", padding: "0.3rem 0.5rem", borderBottom: "1px solid #ddd", color: "#585" }}>Bull</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "0.35rem 0.5rem", color: "#555" }}>SOM (peak annual)</td>
                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontFamily: "monospace" }}>{fmt$(bearResult.som)}</td>
                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontFamily: "monospace", fontWeight: "bold" }}>{fmt$(result.som)}</td>
                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontFamily: "monospace" }}>{fmt$(bullResult.som)}</td>
                  </tr>
                  <tr style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "0.35rem 0.5rem", color: "#555" }}>
                      3× exit value
                      <span style={{ fontSize: "0.82em", color: "#bbb", marginLeft: "0.3rem" }}>(illustrative)</span>
                    </td>
                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontFamily: "monospace" }}>{fmt$(bearResult.som * 3)}</td>
                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontFamily: "monospace", fontWeight: "bold" }}>{fmt$(result.som * 3)}</td>
                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontFamily: "monospace" }}>{fmt$(bullResult.som * 3)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: "0.72em", color: "#bbb", marginTop: "0.4rem" }}>
                Bear/bull ranges apply per-input flex assumptions. 3× multiple is illustrative.
              </p>
            </div>
          )}

          {/* Exit scenarios CTA */}
          <div style={{ marginTop: "1.25rem" }}>
            <Link href={`/deals/${id}/exit-scenarios`}>
              <button style={{
                fontFamily: "monospace", padding: "0.35rem 1rem",
                background: "#fff", border: "1px solid #aaa",
                cursor: "pointer", fontSize: "0.85em",
              }}>
                Model exit scenarios in detail →
              </button>
            </Link>
          </div>

          {/* Submit to deal page */}
          <div style={{ marginTop: "1.5rem", border: "1px solid #d4b800", background: "#fffce6", borderRadius: "4px", padding: "0.85rem 1rem" }}>
            <div style={{ fontSize: "0.72em", textTransform: "uppercase", letterSpacing: "0.08em", color: "#92400e", fontWeight: "bold", marginBottom: "0.4rem" }}>
              Submit to Deal Page
            </div>
            <div style={{ fontSize: "0.88em", marginBottom: "0.5rem" }}>
              Peak SOM: <strong>{fmt$(displaySom)}</strong>
            </div>
            {deal?.market_sizing_submitted_at && !submitDone && (
              <div style={{ fontSize: "0.75em", color: "#92400e", marginBottom: "0.4rem" }}>
                Last submitted: {new Date(deal.market_sizing_submitted_at).toLocaleString()}
              </div>
            )}
            {submitDone && deal?.market_sizing_submitted_at && (
              <div style={{ fontSize: "0.75em", color: "#166534", marginBottom: "0.4rem" }}>
                ✓ Submitted at {new Date(deal.market_sizing_submitted_at).toLocaleString()}
              </div>
            )}
            <button
              onClick={() => handleSubmitSom(displaySom)}
              disabled={submitting || displaySom <= 0}
              style={{
                fontFamily: "monospace", fontSize: "0.85em",
                padding: "0.25rem 0.75rem", cursor: "pointer",
                background: "#111", color: "#fff", border: "none",
              }}
            >
              {submitting ? "Submitting…" : "Confirm & submit"}
            </button>
          </div>

          <p style={{ fontSize: "0.75em", color: "#aaa", marginTop: "1rem" }}>
            All figures are estimates. Fields marked "modified" diverge from preset defaults.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Helper: advanced row with enable toggle ───────────────────────────────────

function AdvRow({
  label, enabled, onToggle, children,
}: {
  label: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.5rem",
      marginBottom: "0.5rem", fontSize: "0.85em",
      opacity: enabled ? 1 : 0.55,
    }}>
      <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} style={{ cursor: "pointer", flexShrink: 0 }} />
      <span style={{ width: "220px", color: "#555", flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}
