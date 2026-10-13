import type { Metrics } from "./types";
import type { Tokens } from "./echarts";

/** Outcome colour = its fixed slot (position in config/indicators.yml), never its rank. */
export function outcomeSlot(m: Metrics, outcomeId: string): number {
  const i = m.outcomes.findIndex((o) => o.id === outcomeId);
  return i === -1 ? 0 : i % 6;
}

export function outcomeVar(m: Metrics, outcomeId: string): string {
  return `var(--s${outcomeSlot(m, outcomeId) + 1})`;
}

export function outcomeHex(m: Metrics, t: Tokens, outcomeId: string): string {
  return t.series[outcomeSlot(m, outcomeId)];
}

/** Ink or white for a label set inside a coloured fill, by the fill's luminance. */
export function textOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#0b0b0b";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.22 ? "#0b0b0b" : "#ffffff";
}
