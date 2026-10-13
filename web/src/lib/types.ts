// Shape of public/data/metrics.json and quality.json (written by pipeline/build.py).

export type Unit = "ha" | "count" | "km";

export interface Outcome {
  id: string;
  name: string;
  nameFr: string;
}

export interface Indicator {
  code: string;
  name: string;
  nameFr: string;
  outcome: string;
  unit: Unit;
  hasCo2: boolean;
}

export interface Country {
  id: string;
  iso: string | null;
  name: string;
  nameFr: string;
}

export interface Partner {
  id: string;
  name: string;
}

export interface Programme {
  id: string;
  name: string;
  country: string;
  partners: string[];
  start: number | null;
  end: number | null;
}

export interface Co2Series {
  absorbed: (number | null)[];
  avoided: (number | null)[];
  realised: (number | null)[];
  targetAbsorbed: number;
  targetAvoided: number;
}

export interface DataRecord {
  id: number;
  row: number;
  programme: string;
  partner: string;
  indicator: string;
  label: string;
  target: number | null;
  values: (number | null)[];
  co2: Co2Series | null;
}

export interface Co2Factor {
  indicator: string;
  component: "absorbed" | "avoided";
  rate: number;
  horizon: number;
  formula: string;
}

export interface HeadlineFigure {
  value: number;
  label: string;
  label_fr: string;
  source: string;
  unit?: string;
}

export interface Metrics {
  meta: {
    generatedAt: string;
    source: string;
    years: number[];
    defaultYear: number;
    partialYears: number[];
    recordCount: number;
  };
  outcomes: Outcome[];
  indicators: Indicator[];
  countries: Country[];
  partners: Partner[];
  programmes: Programme[];
  records: DataRecord[];
  co2Factors: Co2Factor[];
  headline: { beneficiaries: HeadlineFigure; anticipatedCo2: HeadlineFigure };
}

export interface QualityItem {
  row?: number;
  programme?: string;
  indicator?: string;
  field?: string;
  value?: string;
  detail?: string;
}

export interface QualityCheck {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  items: QualityItem[];
}

export interface Quality {
  generatedAt: string;
  source: string;
  summary: { error: number; warning: number; info: number };
  checks: QualityCheck[];
}
