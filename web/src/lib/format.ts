import type { Unit } from "./types";

let locale = "en";
export function setLocale(l: string) {
  locale = l === "fr" ? "fr-FR" : "en-GB";
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
}

/** 1 284 / 12.9K / 4.2M — compact for tiles and axes. */
export function compact(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: Math.abs(v) < 1000 ? 0 : digits }).format(v);
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(v);
}

export function unitLabel(u: Unit, lang: string): string {
  if (u === "ha") return "ha";
  if (u === "km") return "km";
  return lang === "fr" ? "nombre" : "count";
}

export function withUnit(v: number | null | undefined, u: Unit, lang: string, compactForm = false): string {
  const n = compactForm ? compact(v) : num(v);
  return u === "count" ? n : `${n} ${unitLabel(u, lang)}`;
}

export function tco2(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return `${compact(v, 2)} tCO₂e`;
}

export function signed(v: number, fmt: (x: number) => string = num): string {
  if (v === 0) return "±0";
  return (v > 0 ? "+" : "−") + fmt(Math.abs(v));
}
