import type { PresetKey } from "./marketSizingConfig";

export type GeoKey = "US" | "EU5" | "Japan" | "China" | "Rest of World";

// ─── Year-keyed population keyframes (millions of people) ─────────────────────
// Linear interpolation is used between keyframes; values clamp outside range.
// Sources: UN World Population Prospects 2022 medium variant.
export const GEO_POPULATION_KEYFRAMES: Record<GeoKey, Record<number, number>> = {
  "US":            { 2020: 331_000_000, 2025: 335_000_000, 2030: 340_000_000, 2035: 345_000_000, 2040: 350_000_000 },
  "EU5":           { 2020: 277_000_000, 2025: 279_000_000, 2030: 280_000_000, 2035: 281_000_000, 2040: 281_000_000 },
  "Japan":         { 2020: 125_800_000, 2025: 123_000_000, 2030: 119_000_000, 2035: 115_000_000, 2040: 111_000_000 },
  "China":         { 2020: 1_411_000_000, 2025: 1_410_000_000, 2030: 1_400_000_000, 2035: 1_380_000_000, 2040: 1_360_000_000 },
  "Rest of World": { 2020: 5_250_000_000, 2025: 5_500_000_000, 2030: 5_750_000_000, 2035: 6_000_000_000, 2040: 6_250_000_000 },
};

export function getGeoPopulation(geo: GeoKey, year: number): number {
  const frames = GEO_POPULATION_KEYFRAMES[geo];
  const years = Object.keys(frames).map(Number).sort((a, b) => a - b);
  if (year <= years[0]) return frames[years[0]];
  if (year >= years[years.length - 1]) return frames[years[years.length - 1]];
  for (let i = 0; i < years.length - 1; i++) {
    const y0 = years[i], y1 = years[i + 1];
    if (year >= y0 && year <= y1) {
      const t = (year - y0) / (y1 - y0);
      return Math.round(frames[y0] + t * (frames[y1] - frames[y0]));
    }
  }
  return frames[years[years.length - 1]];
}

export type IndicationCategory =
  | "oncology"
  | "neurology"
  | "rare"
  | "immunology"
  | "cardiometabolic"
  | "ophthalmology";

export interface IndicationMeta {
  label: string;
  category: IndicationCategory;
  patientBasis: "Prevalent" | "Incident";
  per100k: Record<GeoKey, number>;
  presetHint: PresetKey;
}

export const INDICATIONS: Record<string, IndicationMeta> = {
  // ── Oncology (incidence per 100k/yr) ──────────────────────────────────────
  nsclc: {
    label: "NSCLC (Non-small cell lung cancer)", category: "oncology",
    patientBasis: "Incident", presetHint: "oncology",
    per100k: { "US": 55, "EU5": 42, "Japan": 38, "China": 58, "Rest of World": 35 },
  },
  crc: {
    label: "Colorectal cancer", category: "oncology",
    patientBasis: "Incident", presetHint: "oncology",
    per100k: { "US": 35, "EU5": 30, "Japan": 38, "China": 38, "Rest of World": 22 },
  },
  breast_cancer: {
    label: "Breast cancer", category: "oncology",
    patientBasis: "Incident", presetHint: "oncology",
    per100k: { "US": 130, "EU5": 95, "Japan": 65, "China": 42, "Rest of World": 48 },
  },
  prostate_cancer: {
    label: "Prostate cancer", category: "oncology",
    patientBasis: "Incident", presetHint: "oncology",
    per100k: { "US": 110, "EU5": 65, "Japan": 22, "China": 10, "Rest of World": 28 },
  },
  aml: {
    label: "AML (Acute myeloid leukemia)", category: "oncology",
    patientBasis: "Incident", presetHint: "oncology",
    per100k: { "US": 4.3, "EU5": 3.6, "Japan": 3.2, "China": 3.0, "Rest of World": 2.5 },
  },
  multiple_myeloma: {
    label: "Multiple myeloma", category: "oncology",
    patientBasis: "Incident", presetHint: "oncology",
    per100k: { "US": 7.1, "EU5": 5.4, "Japan": 3.5, "China": 3.8, "Rest of World": 3.0 },
  },
  // ── Neurology (prevalent per 100k) ────────────────────────────────────────
  alzheimers: {
    label: "Alzheimer's disease / dementia", category: "neurology",
    patientBasis: "Prevalent", presetHint: "neurology",
    per100k: { "US": 1_500, "EU5": 1_400, "Japan": 2_300, "China": 800, "Rest of World": 700 },
  },
  parkinsons: {
    label: "Parkinson's disease", category: "neurology",
    patientBasis: "Prevalent", presetHint: "neurology",
    per100k: { "US": 200, "EU5": 180, "Japan": 150, "China": 100, "Rest of World": 90 },
  },
  ms: {
    label: "Multiple sclerosis (MS)", category: "neurology",
    patientBasis: "Prevalent", presetHint: "neurology",
    per100k: { "US": 300, "EU5": 200, "Japan": 10, "China": 5, "Rest of World": 50 },
  },
  epilepsy: {
    label: "Epilepsy", category: "neurology",
    patientBasis: "Prevalent", presetHint: "neurology",
    per100k: { "US": 700, "EU5": 600, "Japan": 400, "China": 500, "Rest of World": 750 },
  },
  // ── Rare disease (prevalent per 100k) ─────────────────────────────────────
  duchenne_md: {
    label: "Duchenne muscular dystrophy (DMD)", category: "rare",
    patientBasis: "Prevalent", presetHint: "rare",
    per100k: { "US": 2.0, "EU5": 1.9, "Japan": 1.8, "China": 1.5, "Rest of World": 1.5 },
  },
  sma: {
    label: "Spinal muscular atrophy (SMA)", category: "rare",
    patientBasis: "Prevalent", presetHint: "genetic",
    per100k: { "US": 1.0, "EU5": 0.9, "Japan": 0.8, "China": 0.6, "Rest of World": 0.6 },
  },
  hemophilia_a: {
    label: "Hemophilia A", category: "rare",
    patientBasis: "Prevalent", presetHint: "rare",
    per100k: { "US": 14, "EU5": 12, "Japan": 10, "China": 8, "Rest of World": 7 },
  },
  fabry: {
    label: "Fabry disease", category: "rare",
    patientBasis: "Prevalent", presetHint: "genetic",
    per100k: { "US": 1.6, "EU5": 1.5, "Japan": 1.2, "China": 0.8, "Rest of World": 0.8 },
  },
  // ── Immunology (prevalent per 100k) ───────────────────────────────────────
  ra: {
    label: "Rheumatoid arthritis (RA)", category: "immunology",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 860, "EU5": 550, "Japan": 400, "China": 300, "Rest of World": 350 },
  },
  crohns: {
    label: "Crohn's disease", category: "immunology",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 200, "EU5": 150, "Japan": 30, "China": 20, "Rest of World": 30 },
  },
  uc: {
    label: "Ulcerative colitis (UC)", category: "immunology",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 240, "EU5": 170, "Japan": 70, "China": 40, "Rest of World": 45 },
  },
  psoriasis: {
    label: "Moderate-to-severe psoriasis", category: "immunology",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 3_200, "EU5": 2_800, "Japan": 1_500, "China": 900, "Rest of World": 1_200 },
  },
  atopic_derm: {
    label: "Moderate-to-severe atopic dermatitis", category: "immunology",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 3_000, "EU5": 2_500, "Japan": 2_000, "China": 1_500, "Rest of World": 1_800 },
  },
  // ── Cardiometabolic (prevalent per 100k) ──────────────────────────────────
  heart_failure: {
    label: "Heart failure", category: "cardiometabolic",
    patientBasis: "Prevalent", presetHint: "broad_chronic",
    per100k: { "US": 2_000, "EU5": 2_200, "Japan": 1_500, "China": 1_200, "Rest of World": 1_100 },
  },
  t2d: {
    label: "Type 2 diabetes (T2D)", category: "cardiometabolic",
    patientBasis: "Prevalent", presetHint: "broad_chronic",
    per100k: { "US": 12_000, "EU5": 9_000, "Japan": 5_000, "China": 11_000, "Rest of World": 8_500 },
  },
  nash: {
    label: "NASH / MASH", category: "cardiometabolic",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 5_000, "EU5": 3_000, "Japan": 2_000, "China": 3_000, "Rest of World": 2_500 },
  },
  // ── Ophthalmology (prevalent per 100k) ────────────────────────────────────
  wet_amd: {
    label: "Wet AMD (neovascular)", category: "ophthalmology",
    patientBasis: "Prevalent", presetHint: "specialty_chronic",
    per100k: { "US": 200, "EU5": 180, "Japan": 150, "China": 100, "Rest of World": 80 },
  },
};

export const INDICATION_CATEGORIES: Record<IndicationCategory, string> = {
  oncology:        "Oncology",
  neurology:       "CNS / Neurology",
  rare:            "Rare disease",
  immunology:      "Immunology / inflammation",
  cardiometabolic: "Cardiometabolic",
  ophthalmology:   "Ophthalmology",
};

// Which indication categories are shown for each TA preset.
// undefined = show all (general / acute have no precise subcategory filter).
export const PRESET_CATEGORY_FILTER: Partial<Record<PresetKey, IndicationCategory[]>> = {
  oncology:          ["oncology"],
  neurology:         ["neurology"],
  rare:              ["rare"],
  genetic:           ["rare"],
  broad_chronic:     ["cardiometabolic"],
  specialty_chronic: ["immunology", "cardiometabolic", "ophthalmology"],
};

export function computePatientPopulation(
  indicationKey: string,
  geos: GeoKey[],
  year = 2026,
): number {
  const ind = INDICATIONS[indicationKey];
  if (!ind) return 0;
  return geos.reduce((sum, geo) => {
    const pop = getGeoPopulation(geo, year);
    const rate = ind.per100k[geo] ?? 0;
    return sum + (pop / 100_000) * rate;
  }, 0);
}
