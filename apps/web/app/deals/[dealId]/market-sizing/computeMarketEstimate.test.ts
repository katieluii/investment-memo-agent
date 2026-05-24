// Run with: npx vitest  or  npx jest
// Install first: npm i -D vitest  or  npm i -D jest @types/jest ts-jest

import { computeMarketEstimate, MarketInputs } from "./computeMarketEstimate";

const BASE: MarketInputs = {
  population: 1_000_000,
  diagnosedRate: 50,
  eligibleRate: 50,
  accessTreatedRate: 50,
  peakShare: 10,
  netRevPerPatient: 100_000,
  persistence: 80,
};

describe("computeMarketEstimate", () => {
  it("TAM = population × netRevPerPatient", () => {
    const { tam } = computeMarketEstimate(BASE);
    expect(tam).toBe(1_000_000 * 100_000);
  });

  it("SAM = population × d × e × a × netRevPerPatient", () => {
    const { sam } = computeMarketEstimate(BASE);
    expect(sam).toBeCloseTo(1_000_000 * 0.5 * 0.5 * 0.5 * 100_000);
  });

  it("SOM = SAM × peakShare × persistence", () => {
    const { som } = computeMarketEstimate(BASE);
    const sam = 1_000_000 * 0.5 * 0.5 * 0.5 * 100_000;
    expect(som).toBeCloseTo(sam * 0.1 * 0.8);
  });

  it("capturedPatients = population × d × e × a × peakShare", () => {
    const { capturedPatients } = computeMarketEstimate(BASE);
    expect(capturedPatients).toBeCloseTo(1_000_000 * 0.5 * 0.5 * 0.5 * 0.1);
  });

  it("zero SOM when peakShare = 0", () => {
    expect(computeMarketEstimate({ ...BASE, peakShare: 0 }).som).toBe(0);
  });

  it("zero SOM when persistence = 0", () => {
    expect(computeMarketEstimate({ ...BASE, persistence: 0 }).som).toBe(0);
  });

  it("TAM >= SAM >= SOM always holds for valid inputs", () => {
    const { tam, sam, som } = computeMarketEstimate(BASE);
    expect(tam).toBeGreaterThanOrEqual(sam);
    expect(sam).toBeGreaterThanOrEqual(som);
  });

  it("rare disease preset produces defensible numbers", () => {
    const rare: MarketInputs = {
      population: 50_000,
      diagnosedRate: 40,
      eligibleRate: 70,
      accessTreatedRate: 65,
      peakShare: 25,
      netRevPerPatient: 350_000,
      persistence: 80,
    };
    const { tam, som, capturedPatients } = computeMarketEstimate(rare);
    expect(tam).toBe(50_000 * 350_000);       // $17.5B theoretical ceiling
    expect(capturedPatients).toBeGreaterThan(0);
    expect(som).toBeGreaterThan(0);
    expect(som).toBeLessThan(tam);
  });

  it("handles 100% persistence correctly (one-time gene therapy)", () => {
    const { som, sam } = computeMarketEstimate({ ...BASE, persistence: 100 });
    expect(som).toBeCloseTo(sam * 0.1);
  });
});
