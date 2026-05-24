export interface CoreInputFields {
  population: number;            // absolute count
  diagnosedRate: number;         // 0–100 %
  eligibleRate: number;          // 0–100 %
  accessTreatedRate: number;     // 0–100 %
  peakShare: number;             // 0–100 %
  grossPricePerPatient: number;  // $ gross annual list price
  persistence: number;           // 0–100 % annualised persistence
}

export interface AdvancedInputs {
  gtnEnabled: boolean;
  grossToNet: number;            // % discount off gross list
  confirmTestingEnabled: boolean;
  confirmTestingAvail: number;   // % of eligible patients who can access confirmatory testing
  specialistEnabled: boolean;
  specialistRate: number;        // % managed by a specialist
  payerEnabled: boolean;
  payerApprovalRate: number;     // % who obtain payer approval
  erosionEnabled: boolean;
  competitiveErosion: "low" | "medium" | "high";
  timeToPeak: number;            // years — display reference only
}

export type MarketInputs = CoreInputFields & AdvancedInputs;

export interface MarketEstimate {
  tam: number;
  sam: number;
  som: number;
  capturedPatients: number;
  netPricePerPatient: number;    // after GtN if enabled
}

export const DEFAULT_ADVANCED: AdvancedInputs = {
  gtnEnabled: false,
  grossToNet: 30,
  confirmTestingEnabled: false,
  confirmTestingAvail: 75,
  specialistEnabled: false,
  specialistRate: 70,
  payerEnabled: false,
  payerApprovalRate: 75,
  erosionEnabled: false,
  competitiveErosion: "medium",
  timeToPeak: 5,
};

const EROSION_FACTORS: Record<AdvancedInputs["competitiveErosion"], number> = {
  low: 1.0, medium: 0.90, high: 0.75,
};

// Per-input flex ranges used by sensitivity tornado and Bear/Base/Bull
export function flexCoreInputs(): Record<keyof CoreInputFields, { lo: number; hi: number }> {
  return {
    population:           { lo: 0.70, hi: 1.30 },
    diagnosedRate:        { lo: 0.85, hi: 1.15 },
    eligibleRate:         { lo: 0.80, hi: 1.20 },
    accessTreatedRate:    { lo: 0.75, hi: 1.25 },
    peakShare:            { lo: 0.65, hi: 1.35 },
    grossPricePerPatient: { lo: 0.80, hi: 1.20 },
    persistence:          { lo: 0.85, hi: 1.15 },
  };
}

export function computeMarketEstimate(inputs: MarketInputs): MarketEstimate {
  const {
    population, diagnosedRate, eligibleRate, accessTreatedRate,
    peakShare, grossPricePerPatient, persistence,
    gtnEnabled, grossToNet,
    confirmTestingEnabled, confirmTestingAvail,
    specialistEnabled, specialistRate,
    payerEnabled, payerApprovalRate,
    erosionEnabled, competitiveErosion,
  } = inputs;

  const netPrice = gtnEnabled
    ? grossPricePerPatient * (1 - grossToNet / 100)
    : grossPricePerPatient;

  const d = diagnosedRate / 100;
  const e = eligibleRate / 100;
  let a = accessTreatedRate / 100;
  if (confirmTestingEnabled) a *= confirmTestingAvail / 100;
  if (specialistEnabled)     a *= specialistRate    / 100;
  if (payerEnabled)          a *= payerApprovalRate / 100;

  const s = peakShare / 100;
  const p = persistence / 100;
  const erosion = erosionEnabled ? EROSION_FACTORS[competitiveErosion] : 1.0;

  const capturedPatients = population * d * e * a * s * erosion;
  const tam = population * grossPricePerPatient;
  const sam = population * d * e * a * netPrice;
  const som = sam * s * erosion * p;

  return { tam, sam, som, capturedPatients, netPricePerPatient: netPrice };
}
