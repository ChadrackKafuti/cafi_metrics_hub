import { useEffect, useState } from "react";
import type { ECharts } from "echarts/core";
import { echarts, esc, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "./Chart";
import { t } from "../lib/i18n";

let loaded: Promise<Map<string, string>> | null = null;

/** Registers a Central-Africa map (Natural Earth 1:110m via world-atlas). Returns ISO numeric → map name. */
function loadMap(): Promise<Map<string, string>> {
  loaded ??= Promise.all([import("topojson-client"), import("world-atlas/countries-110m.json")]).then(([topo, world]) => {
    const w = (world as { default?: unknown }).default ?? world;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = topo.feature(w as any, (w as any).objects.countries) as unknown as GeoJSON.FeatureCollection;
    const inRegion = (f: GeoJSON.Feature) => {
      const pts: number[][] = [];
      const walk = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
        else if (Array.isArray(c)) c.forEach(walk);
      };
      walk((f.geometry as GeoJSON.Polygon).coordinates);
      const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return lon > 3 && lon < 36 && lat > -19 && lat < 16;
    };
    const features = fc.features.filter(inRegion);
    echarts.registerMap("central-africa", { type: "FeatureCollection", features } as never);
    return new Map(features.map((f) => [String(f.id), String(f.properties?.name)]));
  });
  return loaded;
}

export interface MapDatum { iso: string; label: string; value: number; display: string; extra?: string }

export function AfricaMap({ data, metricLabel, height, onSelect, selected, chartRef }: {
  data: MapDatum[];
  metricLabel: string;
  height: number;
  onSelect: (iso: string) => void;
  selected: string[];
  chartRef: (c: ECharts | null) => void;
}) {
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => { loadMap().then(setNames); }, []);
  if (!names) return <div className="empty" style={{ height }}>…</div>;

  const byName = new Map(data.map((d) => [names.get(d.iso) ?? d.label, d]));
  const max = Math.max(1, ...data.map((d) => d.value));
  const selNames = new Set(selected.map((iso) => names.get(iso)));
  // Small coastal countries (Gabon, Congo, Eq. Guinea) sit too close together for labels.
  const crowded = new Set(["266", "178", "226"]);

  return (
    <Chart height={height} label={`${t("Where programmes work")}: ${metricLabel}`} chartRef={chartRef}
      deps={[data, metricLabel, selected.join()]}
      onClick={(p) => {
        const d = byName.get(p.name);
        if (d) onSelect(d.iso);
      }}
      option={(tk) => ({
        tooltip: {
          ...tooltipBase(tk),
          trigger: "item",
          formatter: (p: { name: string }) => {
            const d = byName.get(p.name);
            if (!d) return `${tipTitle(p.name)}<span style="opacity:.7">${esc(t("No data for the current filters"))}</span>`;
            return tipTitle(d.label) + tipRow(tk.map[4], d.display, metricLabel, "rect") +
              (d.extra ? `<div style="opacity:.7;margin-top:4px">${esc(d.extra)}</div>` : "");
          },
        },
        visualMap: {
          show: false, min: 0, max, seriesIndex: 0,
          inRange: { color: tk.map.slice(1) },
          outOfRange: { color: tk.map[0] },
        },
        series: [{
          type: "map", map: "central-africa", roam: false, selectedMode: false,
          layoutCenter: ["50%", "52%"], layoutSize: "140%",
          itemStyle: { areaColor: tk.map[0], borderColor: tk.surface, borderWidth: 1.2 },
          emphasis: { label: { show: true, color: tk.ink, fontWeight: 600 }, itemStyle: { areaColor: undefined, borderColor: tk.ink, borderWidth: 1.5 } },
          label: {
            show: true, fontSize: 11, color: tk.ink, fontFamily: tk.font,
            textBorderColor: tk.surface, textBorderWidth: 3,
            // Label only countries large enough to hold one; the rest live in the tooltip and table.
            formatter: (p: { name: string }) => {
              const d = byName.get(p.name);
              return d && !crowded.has(d.iso) ? `{b|${d.label}}\n${d.display}` : "";
            },
            rich: { b: { fontWeight: 650, fontSize: 12, color: tk.ink, textBorderColor: tk.surface, textBorderWidth: 3 } },
          },
          data: [
            ...[...names.values()].map((n) => {
              const d = byName.get(n);
              return {
                name: n,
                value: d ? d.value : null,
                itemStyle: selNames.has(n) ? { borderColor: tk.ink, borderWidth: 2 } : undefined,
              };
            }),
          ],
        }],
      })}
    />
  );
}

export function MapLegend({ min, max, label }: { min: string; max: string; label: string }) {
  return (
    <div className="map-legend">
      <span>{label}</span>
      <span>{min}</span>
      <span className="ramp">{[1, 2, 3, 4, 5].map((i) => <i key={i} style={{ background: `var(--map-${i})` }} />)}</span>
      <span>{max}</span>
      <span className="ramp" style={{ marginLeft: 10 }}><i style={{ background: "var(--map-0)" }} /></span>
      <span>{t("No programme")}</span>
    </div>
  );
}
