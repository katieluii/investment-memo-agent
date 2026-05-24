import { CoreInputFields } from "./computeMarketEstimate";

export type CoreInputKey = keyof CoreInputFields;

export type PresetKey =
  | "general"
  | "broad_chronic"
  | "specialty_chronic"
  | "rare"
  | "oncology"
  | "neurology"
  | "genetic"
  | "acute";

export const PRESET_LABELS: Record<PresetKey, string> = {
  general:           "General / unspecified",
  broad_chronic:     "Broad chronic disease",
  specialty_chronic: "Specialty chronic disease",
  rare:              "Rare disease",
  oncology:          "Oncology",
  neurology:         "Neurology / neurodegenerative",
  genetic:           "Genetic / precision medicine",
  acute:             "Acute / episodic",
};

export const PRESETS: Record<PresetKey, CoreInputFields> = {
  general:          { population: 15_000_000, diagnosedRate: 55, eligibleRate: 60, accessTreatedRate: 50, peakShare:  5, grossPricePerPatient:  80_000, persistence: 70 },
  broad_chronic:    { population: 30_000_000, diagnosedRate: 70, eligibleRate: 65, accessTreatedRate: 55, peakShare:  5, grossPricePerPatient:  15_000, persistence: 75 },
  specialty_chronic:{ population:  3_000_000, diagnosedRate: 65, eligibleRate: 60, accessTreatedRate: 50, peakShare: 10, grossPricePerPatient:  50_000, persistence: 72 },
  rare:             { population:     50_000, diagnosedRate: 40, eligibleRate: 70, accessTreatedRate: 65, peakShare: 25, grossPricePerPatient: 350_000, persistence: 80 },
  oncology:         { population:    500_000, diagnosedRate: 85, eligibleRate: 40, accessTreatedRate: 70, peakShare: 15, grossPricePerPatient: 150_000, persistence: 60 },
  neurology:        { population:  5_000_000, diagnosedRate: 35, eligibleRate: 50, accessTreatedRate: 40, peakShare:  5, grossPricePerPatient:  40_000, persistence: 55 },
  genetic:          { population:    200_000, diagnosedRate: 45, eligibleRate: 75, accessTreatedRate: 60, peakShare: 30, grossPricePerPatient: 500_000, persistence: 85 },
  acute:            { population:  2_000_000, diagnosedRate: 60, eligibleRate: 55, accessTreatedRate: 50, peakShare:  8, grossPricePerPatient:   5_000, persistence:100 },
};

type FieldHelpers = { general: string } & { [K in PresetKey]?: string };

export const HELPER_TEXT: Record<CoreInputKey, FieldHelpers> = {
  population: {
    general:       "Total patients with the indication in the selected geography",
    rare:          "Consider global prevalence; the US alone may be very small — verify epidemiology sources",
    genetic:       "Derived from mutation prevalence × genotyping rate in the relevant population",
    broad_chronic: "Use epidemiological estimates; include both diagnosed and undiagnosed burden",
  },
  diagnosedRate: {
    general:   "Share of patients formally diagnosed or identified",
    neurology: "Includes biomarker-confirmed and specialist-confirmed diagnosis; often a major bottleneck",
    oncology:  "Diagnosis is typically high; consider biomarker testing rate for targeted therapies",
    rare:      "Diagnostic odyssey often limits identification; genetic testing penetration matters",
    genetic:   "Driven by genetic testing rate and mutation prevalence in the tested pool",
  },
  eligibleRate: {
    general:   "Share of diagnosed patients meeting label / clinical criteria",
    oncology:  "Consider biomarker positivity rate, prior therapy requirements, and ECOG status",
    rare:      "Often high once correctly diagnosed; driven by genotype / phenotype match",
    genetic:   "Driven by mutation type and severity; variant classification matters",
    neurology: "Staging criteria and comorbidity exclusions can significantly limit the eligible pool",
  },
  accessTreatedRate: {
    general:   "Share of eligible patients with payer / site access who initiate therapy",
    rare:      "Payer coverage often requires prior auth and reimbursement negotiation; access can be low initially",
    oncology:  "Consider NCCN guideline category; Category 1 drives faster formulary access",
    genetic:   "Site-of-care infrastructure (e.g. gene therapy centres) can be rate-limiting",
    neurology: "Specialist capacity and referral pathways are key access constraints",
  },
  peakShare: {
    general:       "Realistic peak capture of the accessed treated pool",
    rare:          "Higher peak shares achievable in smaller markets with clear differentiation",
    oncology:      "Highly competitive; consider line of therapy and biomarker-selected sub-population",
    genetic:       "First-mover advantage can be significant; dominant share possible with strong efficacy data",
    broad_chronic: "Mature markets are crowded; pricing and formulary position drive share more than efficacy",
  },
  grossPricePerPatient: {
    general:       "Gross annual list price before payer rebates and GTN discounts",
    rare:          "Orphan pricing; gross list can exceed $400K — enable GTN adjustment below to model net",
    oncology:      "Set gross WAC; enable gross-to-net to apply typical 20–35% rebate level",
    broad_chronic: "Mature, competitive market — significant GTN pressure; enable adjustment to model net",
    genetic:       "One-time treatment; enter total course price. Enable GTN to apply outcomes-based discounts",
  },
  persistence: {
    general:   "Annualised persistence, accounting for discontinuation and progression",
    oncology:  "Reflects duration of response; include progression and tolerability-driven discontinuation",
    neurology: "Discontinuation often driven by tolerability; monitoring programmes can improve rates",
    rare:      "Often high given lack of alternatives; life-sustaining therapies approach 90%+",
    genetic:   "One-time treatments = 100% (single event); chronic gene therapy depends on durability data",
    acute:     "Each acute episode is a discrete treated event; set to 100%",
  },
};

export function getHelper(field: CoreInputKey, preset: PresetKey): string {
  const h = HELPER_TEXT[field];
  return h[preset] ?? h.general;
}
