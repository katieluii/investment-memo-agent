"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { getDeal, submitCapTable, Deal } from "../../../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type HolderType = "Founder" | "Investor" | "Option Pool" | "Employee" | "Other";

interface Holder {
  id: string;
  name: string;
  pct: number;
  type: HolderType;
}

interface Participant {
  id: string;
  name: string;
  amountM: number;
  isUs: boolean;
}

interface FutureRound {
  id: string;
  name: string;
  preMoneyM: number;
  raiseM: number;
  optionTopUpPct: number;
}

interface StageRow {
  name: string;
  type: string;
  pct: number;
  amountInvestedM?: number;
  isUs?: boolean;
}

type Stage = StageRow[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }
function fmtM(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}B`;
  return `$${n.toFixed(1)}M`;
}
function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }
function fmtMOIC(n: number): string { return `${n.toFixed(2)}×`; }
function fmtIRR(n: number): string { return `${(n * 100).toFixed(1)}%`; }

function applyRound(
  stage: Stage,
  preM: number,
  raiseM: number,
  optionTopUpPct: number,
  newInvestors: { name: string; amountM: number; isUs?: boolean }[],
): Stage {
  if (preM <= 0 || raiseM <= 0) return stage;
  const postM = preM + raiseM;
  const newInvPct = (raiseM / postM) * 100;
  const dilFactor = (100 - newInvPct - optionTopUpPct) / 100;

  const result: Stage = stage.map(h => ({
    ...h,
    pct: h.type === "Option Pool"
      ? h.pct * dilFactor + optionTopUpPct
      : h.pct * dilFactor,
  }));

  if (optionTopUpPct > 0 && !stage.some(h => h.type === "Option Pool")) {
    result.push({ name: "Option Pool", type: "Option Pool", pct: optionTopUpPct });
  }

  for (const inv of newInvestors) {
    result.push({
      name: inv.name,
      type: "Investor",
      pct: (inv.amountM / postM) * 100,
      amountInvestedM: inv.amountM,
      isUs: inv.isUs ?? false,
    });
  }
  return result;
}

function parseCsv(text: string): Holder[] {
  const lines = text.trim().split(/\r?\n/);
  return lines.slice(1).flatMap(line => {
    const cols = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
    const name = cols[0];
    const pct = parseFloat(cols[1]);
    if (!name || isNaN(pct)) return [];
    return [{ id: uid(), name, pct, type: "Investor" as HolderType }];
  });
}

// ─── Color system ─────────────────────────────────────────────────────────────

const OUR_COLOR = "#e8961a";
const POOL_COLOR = "#9ca3af";
const PALETTE = ["#4a90d9", "#7c5cbf", "#e74c3c", "#2ecc71", "#1abc9c", "#e91e63", "#00bcd4", "#8bc34a", "#ff5722", "#607d8b"];

function buildColorMap(allNames: string[], stages: Stage[]): Record<string, string> {
  const map: Record<string, string> = {};
  let pi = 0;
  for (const name of allNames) {
    const isUs = stages.some(s => s.find(h => h.name === name)?.isUs);
    const isPool = stages.some(s => s.find(h => h.name === name && h.type === "Option Pool"));
    map[name] = isUs ? OUR_COLOR : isPool ? POOL_COLOR : PALETTE[pi++ % PALETTE.length];
  }
  return map;
}

// ─── SVG utilities ────────────────────────────────────────────────────────────

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function piePath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 359.9) {
    const a = polarXY(cx, cy, r, 0);
    const b = polarXY(cx, cy, r, 180);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y} A ${r} ${r} 0 1 1 ${a.x} ${a.y} Z`;
  }
  const s = polarXY(cx, cy, r, start);
  const e = polarXY(cx, cy, r, end);
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${e.x} ${e.y} Z`;
}

// ─── PieChart component ────────────────────────────────────────────────────────

interface PieSlice { name: string; pct: number; isUs?: boolean; }
interface PieChartProps {
  data: PieSlice[];
  colorMap: Record<string, string>;
  size?: number;
  label: string;
  valM?: number;
}

function PieChart({ data, colorMap, size = 150, label, valM }: PieChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hov, setHov] = useState<{ name: string; pct: number; x: number; y: number } | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const slices = data.filter(d => d.pct > 0);
  const total = slices.reduce((s, d) => s + d.pct, 0);
  const ourPct = data.filter(d => d.isUs).reduce((s, d) => s + d.pct, 0);

  let cursor = 0;
  const sectors = slices.map(d => {
    const sweep = total > 0 ? (d.pct / total) * 360 : 0;
    const start = cursor;
    cursor += sweep;
    return { ...d, start, end: cursor };
  });

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // hit-test by angle from center
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > r) { setHov(null); return; }
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const hit = sectors.find(s => deg >= s.start && deg < s.end) ?? null;
    setHov(hit ? { name: hit.name, pct: hit.pct, x, y } : null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: size }}>
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          width={size}
          height={size}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHov(null)}
          style={{ cursor: "crosshair", display: "block" }}
        >
          {slices.length === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="#eee" />
          ) : (
            sectors.map(s => (
              <path
                key={s.name}
                d={piePath(cx, cy, r, s.start, s.end)}
                fill={colorMap[s.name] ?? "#ccc"}
                stroke="#fff"
                strokeWidth={1}
                opacity={hov && hov.name !== s.name ? 0.65 : 1}
                style={{ transition: "d 0.35s ease, opacity 0.2s" }}
              />
            ))
          )}
        </svg>
        {hov && (
          <div style={{
            position: "absolute",
            left: hov.x,
            top: hov.y,
            transform: "translate(-50%, -115%)",
            background: "#111",
            color: "#fff",
            padding: "0.25rem 0.5rem",
            borderRadius: 4,
            fontSize: "0.78em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}>
            {hov.name}: {fmtPct(hov.pct)}
          </div>
        )}
      </div>
      <div style={{ fontSize: "0.75em", color: "#555", marginTop: "0.3rem", textAlign: "center", maxWidth: size }}>
        {valM !== undefined && <div style={{ color: "#333", fontWeight: "bold" }}>{fmtM(valM)}</div>}
        <div>{label}</div>
        {ourPct > 0.01 && (
          <div style={{ color: OUR_COLOR, marginTop: "0.15rem" }}>
            ★ {fmtPct(ourPct)}{valM !== undefined ? ` · ${fmtM((ourPct / 100) * valM)}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StackedAreaChart component ───────────────────────────────────────────────

interface StackedAreaChartProps {
  stages: Stage[];
  labels: string[];
  allNames: string[];
  colorMap: Record<string, string>;
}

function StackedAreaChart({ stages, labels, allNames, colorMap }: StackedAreaChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovSt, setHovSt] = useState<number | null>(null);

  const VW = 560;
  const VH = 220;
  const lm = 38; const rm = 12; const tm = 12; const bm = 30;
  const cw = VW - lm - rm;
  const ch = VH - tm - bm;
  const N = stages.length;

  function xAt(i: number): number {
    if (N <= 1) return lm + cw / 2;
    return lm + (i / (N - 1)) * cw;
  }
  function yAt(pct: number): number {
    return tm + ch * (1 - pct / 100);
  }

  // Compute tops[si][ni] and bots[si][ni] — cumulative stacked pcts
  const tops: number[][] = [];
  const bots: number[][] = [];
  for (let si = 0; si < N; si++) {
    const stageArr: number[] = [];
    for (const name of allNames) {
      const row = stages[si].find(h => h.name === name);
      stageArr.push(row ? row.pct : 0);
    }
    const topRow: number[] = [];
    const botRow: number[] = [];
    let acc = 0;
    for (let ni = 0; ni < allNames.length; ni++) {
      botRow.push(acc);
      acc += stageArr[ni];
      topRow.push(acc);
    }
    tops.push(topRow);
    bots.push(botRow);
  }

  function areaD(ni: number): string {
    // top boundary left to right
    const topPts = stages.map((_, si) => `${xAt(si)},${yAt(tops[si][ni])}`).join(" L ");
    // bottom boundary right to left
    const botPts = stages.map((_, si) => si).reverse().map(si => `${xAt(si)},${yAt(bots[si][ni])}`).join(" L ");
    return `M ${topPts} L ${botPts} Z`;
  }

  // Our firm band — find any name that is "us" and trace tops of the band they occupy
  const ourNames = allNames.filter(name => stages.some(s => s.find(h => h.name === name)?.isUs));
  let ourBandTopPts: string | null = null;
  if (ourNames.length > 0) {
    // Sum of all "our" pcts per stage
    const ourTops = stages.map((stage, si) => {
      const ourSum = ourNames.reduce((acc, name) => {
        const ni = allNames.indexOf(name);
        return acc + (tops[si][ni] - bots[si][ni]);
      }, 0);
      // The top of our combined band = max top among our names
      const maxTop = ourNames.reduce((acc, name) => {
        const ni = allNames.indexOf(name);
        return Math.max(acc, tops[si][ni]);
      }, 0);
      return maxTop;
    });
    ourBandTopPts = stages.map((_, si) => `${si === 0 ? "M" : "L"} ${xAt(si)} ${yAt(ourTops[si])}`).join(" ");
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * VW;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(mx - xAt(i));
      if (d < minDist) { minDist = d; closest = i; }
    }
    setHovSt(closest);
  }

  const gridPcts = [0, 25, 50, 75, 100];

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovSt(null)}
        style={{ display: "block" }}
      >
        {/* Grid lines */}
        {gridPcts.map(p => (
          <g key={p}>
            <line x1={lm} y1={yAt(p)} x2={lm + cw} y2={yAt(p)} stroke="#ddd" strokeWidth={0.5} />
            <text x={lm - 4} y={yAt(p) + 4} textAnchor="end" fontSize={9} fill="#999">{p}%</text>
          </g>
        ))}

        {/* Area bands */}
        {allNames.map((name, ni) => (
          <path key={name} d={areaD(ni)} fill={colorMap[name] ?? "#ccc"} opacity={0.85} style={{ transition: "d 0.4s ease" }} />
        ))}

        {/* Our firm emphasis band */}
        {ourBandTopPts && (
          <path
            d={ourBandTopPts}
            fill="none"
            stroke="#222"
            strokeWidth={1.5}
            opacity={0.5}
            style={{ transition: "d 0.4s ease" }}
          />
        )}

        {/* Hover vertical line */}
        {hovSt !== null && (
          <line
            x1={xAt(hovSt)} y1={tm}
            x2={xAt(hovSt)} y2={tm + ch}
            stroke="#333"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
        )}

        {/* X-axis labels */}
        {labels.map((lbl, i) => {
          const txt = lbl.length > 13 ? lbl.slice(0, 13) + "…" : lbl;
          return (
            <text key={i} x={xAt(i)} y={VH - bm + 14} textAnchor="middle" fontSize={9} fill="#555">
              {txt}
            </text>
          );
        })}

        {/* X axis line */}
        <line x1={lm} y1={tm + ch} x2={lm + cw} y2={tm + ch} stroke="#ccc" strokeWidth={0.5} />
      </svg>

      {/* Hover tooltip */}
      {hovSt !== null && (
        <div style={{
          position: "absolute",
          left: `${(xAt(hovSt) / VW) * 100}%`,
          top: "8px",
          transform: "translateX(-50%)",
          background: "#fff",
          border: "1px solid #ddd",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          borderRadius: 6,
          padding: "0.4rem 0.6rem",
          fontSize: "0.75em",
          pointerEvents: "none",
          zIndex: 10,
          minWidth: 120,
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "0.25rem", borderBottom: "1px solid #eee", paddingBottom: "0.2rem" }}>
            {labels[hovSt]?.length > 18 ? labels[hovSt].slice(0, 18) + "…" : labels[hovSt]}
          </div>
          {allNames.map(name => {
            const row = stages[hovSt].find(h => h.name === name);
            if (!row || row.pct < 0.05) return null;
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.1rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: colorMap[name] ?? "#ccc", display: "inline-block", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{name}</span>
                <span style={{ fontFamily: "monospace", marginLeft: "0.5rem" }}>{fmtPct(row.pct)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── FirmFocusChart component ─────────────────────────────────────────────────

interface FirmFocusChartProps {
  stages: Stage[];
  labels: string[];
  valuations: number[];
  ourInvested: number;
}

function FirmFocusChart({ stages, labels, valuations, ourInvested }: FirmFocusChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovSt, setHovSt] = useState<number | null>(null);

  const VW = 560;
  const VH = 180;
  const lm = 48; const rm = 60; const tm = 14; const bm = 28;
  const cw = VW - lm - rm;
  const ch = VH - tm - bm;
  const N = stages.length;

  const ourPcts = stages.map(stage =>
    stage.filter(h => h.isUs).reduce((s, h) => s + h.pct, 0)
  );
  const ourVals = ourPcts.map((pct, i) => (pct / 100) * (valuations[i] ?? 0));

  const maxPct = Math.max(10, ...ourPcts) * 1.15;
  const maxVal = Math.max(1, ...ourVals) * 1.15;

  const entryPct = ourPcts.length > 1 ? ourPcts[1] : ourPcts[0] ?? 0;
  const entryInvested = ourInvested;
  const exitPct = ourPcts[N - 1] ?? 0;
  const exitVal = ourVals[N - 1] ?? 0;
  const moic = ourInvested > 0 ? exitVal / ourInvested : 0;
  const moicStr = ourInvested === 0 ? "—" : fmtMOIC(moic);
  const moicColor = ourInvested === 0 ? "#999" : moic >= 3 ? "green" : moic >= 1 ? "#333" : "red";

  function xAt(i: number): number {
    if (N <= 1) return lm + cw / 2;
    return lm + (i / (N - 1)) * cw;
  }
  function yPct(p: number): number { return tm + ch * (1 - p / maxPct); }
  function yVal(v: number): number { return tm + ch * (1 - v / maxVal); }

  const valD = ourVals.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yVal(v)}`).join(" ");
  const pctD = ourPcts.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yPct(p)}`).join(" ");

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * VW;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(mx - xAt(i));
      if (d < minDist) { minDist = d; closest = i; }
    }
    setHovSt(closest);
  }

  const pctGridMax = Math.ceil(maxPct / 25) * 25;
  const pctGridLines = [0, pctGridMax * 0.25, pctGridMax * 0.5, pctGridMax * 0.75, pctGridMax];

  return (
    <div>
      {/* Stat tiles */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120, background: "#f9f9f9", border: "1px solid #eee", borderRadius: 6, padding: "0.5rem 0.75rem" }}>
          <div style={{ fontSize: "0.7em", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>Entry ownership</div>
          <div style={{ fontSize: "1.1em", fontFamily: "monospace", fontWeight: "bold", color: OUR_COLOR }}>
            {fmtPct(entryPct)}
          </div>
          <div style={{ fontSize: "0.78em", color: "#666" }}>{fmtM(entryInvested)} in</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: "#f9f9f9", border: "1px solid #eee", borderRadius: 6, padding: "0.5rem 0.75rem" }}>
          <div style={{ fontSize: "0.7em", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>Exit ownership</div>
          <div style={{ fontSize: "1.1em", fontFamily: "monospace", fontWeight: "bold", color: OUR_COLOR }}>
            {fmtPct(exitPct)}
          </div>
          <div style={{ fontSize: "0.78em", color: "#666" }}>{fmtM(exitVal)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: "#f9f9f9", border: "1px solid #eee", borderRadius: 6, padding: "0.5rem 0.75rem" }}>
          <div style={{ fontSize: "0.7em", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>MOIC</div>
          <div style={{ fontSize: "1.1em", fontFamily: "monospace", fontWeight: "bold", color: moicColor }}>
            {moicStr}
          </div>
          {ourInvested === 0 && (
            <div style={{ fontSize: "0.7em", color: "#aaa" }}>Set exit valuation above to compute MOIC</div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHovSt(null)}
          style={{ display: "block" }}
        >
          {/* Grid lines (left axis / pct) */}
          {pctGridLines.map((p, i) => (
            <g key={i}>
              <line x1={lm} y1={yPct(p)} x2={lm + cw} y2={yPct(p)} stroke="#eee" strokeWidth={0.8} />
              <text x={lm - 4} y={yPct(p) + 4} textAnchor="end" fontSize={9} fill="#999">
                {p.toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Right axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => (
            <text key={i} x={lm + cw + 4} y={yVal(maxVal * frac) + 4} textAnchor="start" fontSize={9} fill={OUR_COLOR}>
              {fmtM(maxVal * frac)}
            </text>
          ))}

          {/* Left axis label */}
          <text
            x={10} y={tm + ch / 2}
            textAnchor="middle"
            fontSize={9}
            fill="#555"
            transform={`rotate(-90, 10, ${tm + ch / 2})`}
          >
            Ownership %
          </text>

          {/* Right axis label */}
          <text
            x={VW - 8} y={tm + ch / 2}
            textAnchor="middle"
            fontSize={9}
            fill={OUR_COLOR}
            transform={`rotate(90, ${VW - 8}, ${tm + ch / 2})`}
          >
            $ value
          </text>

          {/* $ value line */}
          <path d={valD} fill="none" stroke={OUR_COLOR} strokeWidth={2} style={{ transition: "d 0.4s ease" }} />
          {ourVals.map((v, i) => (
            <circle
              key={i}
              cx={xAt(i)}
              cy={yVal(v)}
              r={hovSt === i ? 5 : 3.5}
              fill={OUR_COLOR}
              style={{ transition: "cx 0.4s ease, cy 0.4s ease, r 0.2s ease" }}
            />
          ))}

          {/* % ownership line (dashed) */}
          <path d={pctD} fill="none" stroke="#333" strokeWidth={1.5} strokeDasharray="4,3" style={{ transition: "d 0.4s ease" }} />
          {ourPcts.map((p, i) => (
            <circle
              key={i}
              cx={xAt(i)}
              cy={yPct(p)}
              r={hovSt === i ? 4.5 : 3}
              fill="white"
              stroke="#333"
              strokeWidth={1.2}
              style={{ transition: "cx 0.4s ease, cy 0.4s ease, r 0.2s ease" }}
            />
          ))}

          {/* Hover vertical line */}
          {hovSt !== null && (
            <line
              x1={xAt(hovSt)} y1={tm}
              x2={xAt(hovSt)} y2={tm + ch}
              stroke="#aaa"
              strokeWidth={1}
              strokeDasharray="4,3"
            />
          )}

          {/* X-axis labels */}
          {labels.map((lbl, i) => {
            const txt = lbl.length > 13 ? lbl.slice(0, 13) + "…" : lbl;
            return (
              <text key={i} x={xAt(i)} y={VH - bm + 14} textAnchor="middle" fontSize={9} fill="#555">
                {txt}
              </text>
            );
          })}

          {/* Axes */}
          <line x1={lm} y1={tm} x2={lm} y2={tm + ch} stroke="#ddd" strokeWidth={0.8} />
          <line x1={lm} y1={tm + ch} x2={lm + cw} y2={tm + ch} stroke="#ddd" strokeWidth={0.8} />
          <line x1={lm + cw} y1={tm} x2={lm + cw} y2={tm + ch} stroke="#ddd" strokeWidth={0.8} />
        </svg>

        {/* Hover tooltip */}
        {hovSt !== null && (
          <div style={{
            position: "absolute",
            left: `${(xAt(hovSt) / VW) * 100}%`,
            top: "8px",
            transform: "translateX(-50%)",
            background: "#fff",
            border: "1px solid #ddd",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            borderRadius: 6,
            padding: "0.4rem 0.6rem",
            fontSize: "0.75em",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 130,
          }}>
            <div style={{ fontWeight: "bold", marginBottom: "0.25rem", borderBottom: "1px solid #eee", paddingBottom: "0.2rem" }}>
              {labels[hovSt]?.length > 18 ? labels[hovSt].slice(0, 18) + "…" : labels[hovSt]}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ width: 8, height: 2, background: OUR_COLOR, display: "inline-block" }} />
              <span style={{ flex: 1 }}>Value</span>
              <span style={{ fontFamily: "monospace", color: OUR_COLOR }}>{fmtM(ourVals[hovSt] ?? 0)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
              <span style={{ width: 8, height: 2, background: "#333", display: "inline-block", borderTop: "1.5px dashed #333" }} />
              <span style={{ flex: 1 }}>Ownership</span>
              <span style={{ fontFamily: "monospace" }}>{fmtPct(ourPcts[hovSt] ?? 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.78em", color: "#555", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <svg width={24} height={10}><line x1={0} y1={5} x2={24} y2={5} stroke={OUR_COLOR} strokeWidth={2} /></svg>
          $ value (right axis)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <svg width={24} height={10}><line x1={0} y1={5} x2={24} y2={5} stroke="#333" strokeWidth={1.5} strokeDasharray="4,3" /></svg>
          Ownership % (left axis)
        </div>
      </div>
    </div>
  );
}

// ─── Small shared components ───────────────────────────────────────────────────

function NInput({
  value, onChange, prefix, suffix, step = 1, min = 0, max, width = 110,
}: {
  value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number; max?: number; width?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      {prefix && <span>{prefix}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
        style={{ fontFamily: "monospace", width: `${width}px` }}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: "0.8em", textTransform: "uppercase", letterSpacing: "0.1em",
      borderBottom: "2px solid #111", paddingBottom: "0.4rem", marginBottom: "1rem", marginTop: "2rem",
    }}>
      {children}
    </h2>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CapTablePage() {
  const { dealId } = useParams<{ dealId: string }>();
  const id = Number(dealId);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Deal data for auto-populate & submit ───────────────────────────────────

  const [deal, setDeal] = useState<Deal | null>(null);
  const [investmentLoaded, setInvestmentLoaded] = useState(false);
  const [ctSubmitting, setCtSubmitting] = useState(false);
  const [ctSubmitDone, setCtSubmitDone] = useState(false);
  const [yearsToExit, setYearsToExit] = useState(5);

  useEffect(() => {
    getDeal(id).then((d) => {
      setDeal(d);
      if (d.investment_amount != null && !investmentLoaded) {
        setParticipants((prev) =>
          prev.map((p) => p.isUs ? { ...p, amountM: d.investment_amount! } : p)
        );
        setInvestmentLoaded(true);
      }
    }).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── State ──────────────────────────────────────────────────────────────────

  const [holders, setHolders] = useState<Holder[]>([
    { id: uid(), name: "Founders", pct: 65, type: "Founder" },
    { id: uid(), name: "Seed Investors", pct: 25, type: "Investor" },
    { id: uid(), name: "Option Pool", pct: 10, type: "Option Pool" },
  ]);

  const [preMoneyM, setPreMoneyM] = useState(50);
  const [raiseM, setRaiseM] = useState(15);
  const [optionTopUp, setOptionTopUp] = useState(5);
  const [participants, setParticipants] = useState<Participant[]>([
    { id: uid(), name: "Our Firm", amountM: 10, isUs: true },
  ]);

  const [futureRounds, setFutureRounds] = useState<FutureRound[]>([]);

  const [exitValuationM, setExitValuationM] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [vizTab, setVizTab] = useState<"pies" | "area" | "firm">("pies");

  // ── Computed stages ────────────────────────────────────────────────────────

  const postMoneyM = preMoneyM + raiseM;

  const stage0: Stage = holders.map(h => ({ name: h.name, type: h.type, pct: h.pct }));

  const stage1: Stage = applyRound(
    stage0, preMoneyM, raiseM, optionTopUp,
    participants.map(p => ({ name: p.name, amountM: p.amountM, isUs: p.isUs })),
  );

  const stages: Stage[] = [stage0, stage1];
  let latestStage = stage1;

  for (const fr of futureRounds) {
    latestStage = applyRound(
      latestStage, fr.preMoneyM, fr.raiseM, fr.optionTopUpPct,
      [{ name: `${fr.name} Investors`, amountM: fr.raiseM }],
    );
    stages.push(latestStage);
  }

  const allNames: string[] = [];
  const seen = new Set<string>();
  for (const stage of stages) {
    for (const h of stage) {
      if (!seen.has(h.name)) { seen.add(h.name); allNames.push(h.name); }
    }
  }

  const ourInvested = participants.filter(p => p.isUs).reduce((s, p) => s + p.amountM, 0);

  // ── Viz computation ────────────────────────────────────────────────────────

  const effectiveExitVal = exitValuationM ?? postMoneyM * 5;
  const lastStage = stages[stages.length - 1];

  const vizStages = useMemo(() => [...stages, lastStage], [stages, lastStage]);
  const vizLabels = useMemo(() => [
    "Current",
    `Post-round (${fmtM(postMoneyM)})`,
    ...futureRounds.map(fr => `${fr.name} (${fmtM(fr.preMoneyM + fr.raiseM)})`),
    exitValuationM != null
      ? `At exit (${fmtM(exitValuationM)})`
      : `At exit (est. ${fmtM(effectiveExitVal)})`,
  ], [postMoneyM, futureRounds, exitValuationM, effectiveExitVal]);

  const vizValuations = useMemo(() => [
    preMoneyM,
    postMoneyM,
    ...futureRounds.map(fr => fr.preMoneyM + fr.raiseM),
    effectiveExitVal,
  ], [preMoneyM, postMoneyM, futureRounds, effectiveExitVal]);

  const colorMap = useMemo(() => buildColorMap(allNames, stages), [allNames, stages]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function addHolder() {
    setHolders(h => [...h, { id: uid(), name: "", pct: 0, type: "Other" }]);
  }
  function removeHolder(id: string) { setHolders(h => h.filter(x => x.id !== id)); }
  function updateHolder(id: string, field: keyof Holder, value: string | number) {
    setHolders(h => h.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  function addParticipant() {
    setParticipants(p => [...p, { id: uid(), name: "", amountM: 0, isUs: false }]);
  }
  function removeParticipant(id: string) { setParticipants(p => p.filter(x => x.id !== id)); }
  function updateParticipant(id: string, field: keyof Participant, value: string | number | boolean) {
    setParticipants(p => p.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  function addFutureRound() {
    const idx = futureRounds.length;
    const names = ["Series A", "Series B", "Series C", "Series D"];
    setFutureRounds(r => [...r, {
      id: uid(),
      name: names[idx] ?? `Round ${idx + 1}`,
      preMoneyM: Math.round(postMoneyM * (3 + idx * 2)),
      raiseM: 30,
      optionTopUpPct: 5,
    }]);
  }
  function removeFutureRound(id: string) { setFutureRounds(r => r.filter(x => x.id !== id)); }
  function updateFutureRound(id: string, field: keyof FutureRound, value: string | number) {
    setFutureRounds(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCsv(ev.target?.result as string);
      if (parsed.length > 0) setHolders(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── IRR & submit ──────────────────────────────────────────────────────────

  const exitValForIrr = exitValuationM ?? postMoneyM * 5;
  const exitValForFirm = exitValForIrr;
  const ourExitValue = (lastStage.filter(h => h.isUs).reduce((s, h) => s + h.pct, 0) / 100) * exitValForFirm;
  const moicForSubmit = ourInvested > 0 ? ourExitValue / ourInvested : 0;
  const irrForSubmit = yearsToExit > 0 && moicForSubmit > 0 ? Math.pow(moicForSubmit, 1 / yearsToExit) - 1 : 0;

  async function handleCapTableSubmit() {
    setCtSubmitting(true);
    setCtSubmitDone(false);
    try {
      const updated = await submitCapTable(id, moicForSubmit, irrForSubmit);
      setDeal(updated);
      setCtSubmitDone(true);
    } finally {
      setCtSubmitting(false);
    }
  }

  // ── Derived checks ─────────────────────────────────────────────────────────

  const totalPct = holders.reduce((s, h) => s + h.pct, 0);
  const totalRoundAmt = participants.reduce((s, p) => s + p.amountM, 0);
  const roundImbalance = Math.abs(totalRoundAmt - raiseM) > 0.1;

  const vizTotalPct = vizStages[0]?.reduce((s, h) => s + h.pct, 0) ?? 0;
  const vizPctWarning = Math.abs(vizTotalPct - 100) > 0.5;

  // ── Style snippets ─────────────────────────────────────────────────────────

  const th: React.CSSProperties = { padding: "0.4rem 0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "0.35rem 0.75rem", borderBottom: "1px solid #eee" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right" };
  const smallBtn: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.85em", padding: "0.2rem 0.5rem", cursor: "pointer" };

  function tabBtnStyle(active: boolean): React.CSSProperties {
    return {
      background: active ? "#111" : "#fff",
      color: active ? "#fff" : "#111",
      border: "1px solid #111",
      padding: "0.3rem 1rem",
      fontFamily: "monospace",
      cursor: "pointer",
    };
  }

  // ── All viz stage labels for the summary table ─────────────────────────────
  const summaryLabels = [
    "Current",
    `Post-round`,
    ...futureRounds.map(fr => fr.name),
    "At exit",
  ];

  const hasUsHolders = stages.some(s => s.some(h => h.isUs));

  return (
    <div>
      <p><Link href={`/deals/${id}`}>← Back to deal</Link></p>
      <h1>Cap Table &amp; Returns</h1>
      <p style={{ fontSize: "0.82em", color: "#888", marginTop: "-0.5rem", marginBottom: "1rem" }}>
        Once you&apos;ve modelled this round, use the exit scenarios page to run a full waterfall across bear / base / bull exits.{" "}
        <Link href={`/deals/${id}/exit-scenarios`} style={{ color: "#555" }}>→ Go to Exit Scenarios</Link>
      </p>
      <p style={{ color: "#666", marginTop: "-0.5rem" }}>
        Enter the current cap table, model this round and co-investors, project dilution across future rounds, and see ownership over time.
      </p>

      {/* ══ Section 1: Current Cap Table ═════════════════════════════════════ */}
      <SectionHeader>1. Current Cap Table</SectionHeader>

      <div style={{ marginBottom: "0.75rem" }}>
        <button style={smallBtn} onClick={() => fileRef.current?.click()}>
          Import CSV
        </button>
        <span style={{ fontSize: "0.8em", color: "#aaa", marginLeft: "0.75rem" }}>
          Format: Name, Ownership % (with header row)
        </span>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvUpload} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0.75rem" }}>
        <thead>
          <tr>
            <th style={th}>Shareholder</th>
            <th style={th}>Type</th>
            <th style={{ ...th, textAlign: "right" }}>Ownership %</th>
            <th style={{ ...th, width: "2rem" }} />
          </tr>
        </thead>
        <tbody>
          {holders.map(h => (
            <tr key={h.id}>
              <td style={td}>
                <input
                  value={h.name}
                  onChange={e => updateHolder(h.id, "name", e.target.value)}
                  placeholder="Shareholder name"
                  style={{ fontFamily: "monospace", width: "200px", border: "none", background: "transparent", outline: "none" }}
                />
              </td>
              <td style={td}>
                <select
                  value={h.type}
                  onChange={e => updateHolder(h.id, "type", e.target.value)}
                  style={{ fontFamily: "monospace", border: "none", background: "transparent", cursor: "pointer" }}
                >
                  {(["Founder", "Investor", "Option Pool", "Employee", "Other"] as HolderType[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td style={tdR}>
                <NInput value={h.pct} onChange={v => updateHolder(h.id, "pct", v)} suffix="%" step={0.5} width={70} />
              </td>
              <td style={td}>
                <button onClick={() => removeHolder(h.id)} style={{ ...smallBtn, color: "#999", border: "none", background: "none" }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <button style={smallBtn} onClick={addHolder}>+ Add row</button>
        <span style={{ color: Math.abs(totalPct - 100) < 0.5 ? "green" : "#cc7700", fontSize: "0.85em" }}>
          Total: {fmtPct(totalPct)}{Math.abs(totalPct - 100) < 0.5 ? " ✓" : " — should sum to 100%"}
        </span>
      </div>

      {/* ══ Section 2: This Round ══════════════════════════════════════════════ */}
      <SectionHeader>2. This Round</SectionHeader>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "2rem", marginBottom: "1.5rem", alignItems: "start" }}>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.25rem" }}>Pre-money</label>
          <NInput value={preMoneyM} onChange={setPreMoneyM} prefix="$" suffix="M" step={5} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.25rem" }}>Round size</label>
          <NInput value={raiseM} onChange={setRaiseM} prefix="$" suffix="M" step={1} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.25rem" }}>Post-money</label>
          <span style={{ fontFamily: "monospace", color: "#444" }}>{fmtM(postMoneyM)}</span>
        </div>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.25rem" }}>Option pool top-up</label>
          <NInput value={optionTopUp} onChange={setOptionTopUp} suffix="%" step={0.5} min={0} max={20} />
        </div>
      </div>

      <p style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>Investors in this round</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0.75rem" }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
            <th style={{ ...th, textAlign: "center" }}>Our firm?</th>
            <th style={{ ...th, width: "2rem" }} />
          </tr>
        </thead>
        <tbody>
          {participants.map(p => (
            <tr key={p.id}>
              <td style={td}>
                <input
                  value={p.name}
                  onChange={e => updateParticipant(p.id, "name", e.target.value)}
                  placeholder="Investor name"
                  style={{ fontFamily: "monospace", width: "200px", border: "none", background: "transparent", outline: "none" }}
                />
              </td>
              <td style={tdR}>
                <NInput value={p.amountM} onChange={v => updateParticipant(p.id, "amountM", v)} prefix="$" suffix="M" step={1} width={70} />
              </td>
              <td style={{ ...td, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={p.isUs}
                  onChange={e => updateParticipant(p.id, "isUs", e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
              </td>
              <td style={td}>
                <button onClick={() => removeParticipant(p.id)} style={{ ...smallBtn, color: "#999", border: "none", background: "none" }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <button style={smallBtn} onClick={addParticipant}>+ Add investor</button>
        {roundImbalance && (
          <span style={{ color: "#cc7700", fontSize: "0.85em" }}>
            Investor amounts ({fmtM(totalRoundAmt)}) ≠ round size ({fmtM(raiseM)})
          </span>
        )}
      </div>

      {/* ══ Section 3: Future Rounds ══════════════════════════════════════════ */}
      <SectionHeader>3. Future Rounds</SectionHeader>

      {futureRounds.length === 0 ? (
        <p style={{ color: "#888" }}>No future rounds modelled yet.</p>
      ) : (
        futureRounds.map(fr => (
          <div key={fr.id} style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "0.75rem", background: "#fafafa" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <input
                value={fr.name}
                onChange={e => updateFutureRound(fr.id, "name", e.target.value)}
                style={{ fontFamily: "monospace", fontWeight: "bold", fontSize: "1em", border: "none", background: "transparent", outline: "none" }}
              />
              <button onClick={() => removeFutureRound(fr.id)} style={{ ...smallBtn, color: "#999", border: "none", background: "none" }}>× Remove</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "2rem", alignItems: "start" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8em", color: "#666", marginBottom: "0.2rem" }}>Pre-money</label>
                <NInput value={fr.preMoneyM} onChange={v => updateFutureRound(fr.id, "preMoneyM", v)} prefix="$" suffix="M" step={10} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8em", color: "#666", marginBottom: "0.2rem" }}>Raise</label>
                <NInput value={fr.raiseM} onChange={v => updateFutureRound(fr.id, "raiseM", v)} prefix="$" suffix="M" step={5} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8em", color: "#666", marginBottom: "0.2rem" }}>Post-money</label>
                <span style={{ fontFamily: "monospace", color: "#444" }}>{fmtM(fr.preMoneyM + fr.raiseM)}</span>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8em", color: "#666", marginBottom: "0.2rem" }}>Option pool top-up</label>
                <NInput value={fr.optionTopUpPct} onChange={v => updateFutureRound(fr.id, "optionTopUpPct", v)} suffix="%" step={0.5} min={0} max={20} />
              </div>
            </div>
          </div>
        ))
      )}
      {futureRounds.length < 4 && (
        <button style={smallBtn} onClick={addFutureRound}>+ Add round</button>
      )}

      {/* ══ Section 4: Exit Assumptions ═══════════════════════════════════════ */}
      <SectionHeader>4. Exit Assumptions</SectionHeader>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem", alignItems: "flex-start" }}>
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.25rem" }}>
            Assumed exit valuation
          </label>
          <NInput
            value={exitValuationM ?? postMoneyM * 5}
            onChange={v => setExitValuationM(v)}
            prefix="$"
            suffix="M"
            step={50}
          />
          <div style={{ fontSize: "0.78em", color: "#888", marginTop: "0.25rem" }}>
            Used to compute $ value of stakes. Default: 5× post-money of this round.
          </div>
          {exitValuationM === null && (
            <div style={{ fontSize: "0.75em", color: "#aaa", marginTop: "0.15rem" }}>
              (using default 5× post-money)
            </div>
          )}
        </div>
      </div>

      {/* ══ Section 5: Visualizations ═════════════════════════════════════════ */}
      <SectionHeader>5. Visualizations</SectionHeader>

      {vizPctWarning && (
        <div style={{
          background: "#fff8e1",
          border: "1px solid #f0c040",
          borderRadius: 4,
          padding: "0.5rem 0.75rem",
          fontSize: "0.85em",
          color: "#7a5c00",
          marginBottom: "1rem",
        }}>
          Cap table sums to {fmtPct(vizTotalPct)}. Visualizations may be inaccurate.
        </div>
      )}

      {/* Tab buttons */}
      <div style={{ display: "flex", gap: 0, marginBottom: "1.25rem" }}>
        <button style={tabBtnStyle(vizTab === "pies")} onClick={() => setVizTab("pies")}>
          Ownership at each stage
        </button>
        <button style={{ ...tabBtnStyle(vizTab === "area"), marginLeft: "-1px" }} onClick={() => setVizTab("area")}>
          Dilution over time
        </button>
        <button style={{ ...tabBtnStyle(vizTab === "firm"), marginLeft: "-1px" }} onClick={() => setVizTab("firm")}>
          Our Firm
        </button>
      </div>

      {/* Pie strip tab */}
      {vizTab === "pies" && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: "1.5rem", padding: "0.5rem 0", minWidth: "max-content" }}>
            {vizStages.map((stage, i) => (
              <PieChart
                key={i}
                data={stage.map(h => ({ name: h.name, pct: h.pct, isUs: h.isUs }))}
                colorMap={colorMap}
                size={150}
                label={vizLabels[i] ?? ""}
                valM={vizValuations[i]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Area chart tab */}
      {vizTab === "area" && (
        <StackedAreaChart
          stages={vizStages}
          labels={vizLabels}
          allNames={allNames}
          colorMap={colorMap}
        />
      )}

      {/* Firm focus tab */}
      {vizTab === "firm" && (
        ourInvested === 0 && !hasUsHolders ? (
          <div style={{ color: "#888", padding: "1rem 0" }}>
            Mark your firm (★) in section 2 to see firm-level ownership and return projections.
          </div>
        ) : (
          <FirmFocusChart
            stages={vizStages}
            labels={vizLabels}
            valuations={vizValuations}
            ourInvested={ourInvested}
          />
        )
      )}

      {/* ══ Section 6: Ownership Summary ══════════════════════════════════════ */}
      <SectionHeader>6. Ownership Summary</SectionHeader>

      <button
        style={{ ...smallBtn, marginBottom: "1rem" }}
        onClick={() => setShowSummary(v => !v)}
      >
        {showSummary ? "▲ Hide numbers" : "▼ Show numbers"}
      </button>

      {showSummary && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Holder</th>
                {summaryLabels.map((l, i) => (
                  <th key={i} style={{ ...th, textAlign: "right" }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allNames.map(name => {
                const isUs = vizStages.some(s => s.find(h => h.name === name)?.isUs);
                return (
                  <tr key={name} style={{ background: isUs ? "#fffbe6" : "transparent" }}>
                    <td style={{ ...td, fontWeight: isUs ? "bold" : "normal" }}>
                      {isUs ? "★ " : ""}{name}
                    </td>
                    {vizStages.map((stage, si) => {
                      const row = stage.find(r => r.name === name);
                      return (
                        <td key={si} style={{ ...tdR, fontWeight: isUs ? "bold" : "normal" }}>
                          {row ? fmtPct(row.pct) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid #bbb" }}>
                <td style={{ ...td, fontWeight: "bold", color: "#666" }}>Total</td>
                {vizStages.map((stage, si) => (
                  <td key={si} style={{ ...tdR, fontWeight: "bold", color: "#666" }}>
                    {fmtPct(stage.reduce((s, h) => s + h.pct, 0))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ══ Submit to Deal Page ═══════════════════════════════════════════════ */}
      <SectionHeader>7. Submit to Deal Page</SectionHeader>

      <div style={{ border: "1px solid #d4b800", background: "#fffce6", borderRadius: "4px", padding: "1rem", maxWidth: 480 }}>
        <p style={{ fontSize: "0.82em", color: "#78350f", marginTop: 0, marginBottom: "0.75rem" }}>
          Confirm the key return figures to surface on the deal summary page.
          {deal?.investment_amount != null && (
            <span> (Investment amount auto-populated from deal: {fmtM(deal.investment_amount)})</span>
          )}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "1.5rem", marginBottom: "0.75rem", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: "0.7em", textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e" }}>MOIC</div>
            <div style={{ fontFamily: "monospace", fontSize: "1.2em", fontWeight: "bold" }}>
              {ourInvested > 0 ? fmtMOIC(moicForSubmit) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7em", textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e" }}>
              Years to exit
            </div>
            <input
              type="number"
              value={yearsToExit}
              min={1}
              max={15}
              step={1}
              onChange={(e) => setYearsToExit(Math.max(1, Number(e.target.value) || 1))}
              style={{ fontFamily: "monospace", width: "60px", fontSize: "1em" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.7em", textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e" }}>IRR</div>
            <div style={{ fontFamily: "monospace", fontSize: "1.2em", fontWeight: "bold" }}>
              {ourInvested > 0 ? fmtIRR(irrForSubmit) : "—"}
            </div>
          </div>
        </div>

        {deal?.moic_submitted_at && !ctSubmitDone && (
          <div style={{ fontSize: "0.75em", color: "#92400e", marginBottom: "0.4rem" }}>
            Last submitted: {new Date(deal.moic_submitted_at).toLocaleString()}
          </div>
        )}
        {ctSubmitDone && deal?.moic_submitted_at && (
          <div style={{ fontSize: "0.75em", color: "#166534", marginBottom: "0.4rem" }}>
            ✓ Submitted at {new Date(deal.moic_submitted_at).toLocaleString()}
          </div>
        )}
        {ourInvested === 0 && (
          <p style={{ fontSize: "0.78em", color: "#aaa", margin: "0 0 0.5rem" }}>
            Mark your firm (★) in section 2 to enable submission.
          </p>
        )}
        <button
          onClick={handleCapTableSubmit}
          disabled={ctSubmitting || ourInvested === 0}
          style={{
            fontFamily: "monospace", fontSize: "0.85em",
            padding: "0.3rem 0.85rem", cursor: ourInvested === 0 ? "not-allowed" : "pointer",
            background: "#111", color: "#fff", border: "none",
          }}
        >
          {ctSubmitting ? "Submitting…" : "Confirm & submit to deal page"}
        </button>
      </div>

      <div style={{ marginTop: "2.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href={`/deals/${id}/market-sizing`}><button style={{ fontFamily: "monospace", cursor: "pointer" }}>← Market Sizing</button></Link>
        <Link href={`/deals/${id}/exit-scenarios`}><button style={{ fontFamily: "monospace", cursor: "pointer" }}>Exit Scenarios →</button></Link>
      </div>
    </div>
  );
}
