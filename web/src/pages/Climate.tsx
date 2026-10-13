import { useMemo } from "react";
import { useApp } from "../lib/state";
import { useFiltered } from "../lib/hooks";
import { nameOf, t } from "../lib/i18n";
import { byKey, co2Aggregate } from "../lib/model";
import { compact, num, pct, tco2 } from "../lib/format";
import { axisBase, esc, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "../components/Chart";
import { ChartCard, CountUp, DataTable, Legend, Meter, type Column } from "../components/ui";
import type { Co2Factor } from "../lib/types";

export function Climate() {
  const { m, ix } = useApp();
  const { records, yi, year, years } = useFiltered();
  const co2Recs = useMemo(() => records.filter((r) => r.co2), [records]);
  const total = co2Aggregate(co2Recs, yi);
  const anticipated = m.headline.anticipatedCo2.value;

  const byInd = m.indicators.filter((i) => i.hasCo2).map((i) => {
    const a = co2Aggregate(co2Recs.filter((r) => r.indicator === i.code), yi);
    return { i, ...a };
  }).filter((x) => x.committed > 0 || x.target > 0).sort((a, b) => b.committed - a.committed);

  const byCountry = [...byKey(co2Recs, (r) => ix.countryOf(r)).entries()].map(([c, rs]) => ({
    c: nameOf(ix.countries.get(c)!), ...co2Aggregate(rs, yi),
  })).filter((x) => x.committed > 0).sort((a, b) => b.committed - a.committed);

  const realisedSeries = years.map((_, i) => co2Aggregate(co2Recs, i));

  // Absorbed = slot 3 (aqua), avoided = slot 1 (blue): both in the all-pairs-validated first three.
  const ABS = 2, AVO = 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Climate impact")} · {t("As of")} {year}</div>
          <h1>{t("Climate impact")}</h1>
          <p>{t("Emission reductions committed")}: <b>{tco2(total.committed)}</b> · {pct(total.committed / anticipated, 1)} {t("of anticipated portfolio total")} ({compact(anticipated)} tCO₂e).</p>
        </div>
      </div>

      <div className="grid g-4">
        <div className="card tile">
          <div className="l">{t("Committed (full cycle)")}</div>
          <div className="v"><CountUp value={total.committed} format={(v) => compact(v, 2)} /><small>tCO₂e</small></div>
          <Meter value={total.target ? total.committed / total.target : null} color="var(--s3)"
            left={<>{pct(total.target ? total.committed / total.target : null)} {t("of target")}</>} right={<>{compact(total.target)}</>} />
        </div>
        <div className="card tile">
          <div className="l">{t("Realised to date")}</div>
          <div className="v"><CountUp value={total.realised} format={(v) => compact(v, 2)} /><small>tCO₂e</small></div>
          <div className="d">{pct(total.committed ? total.realised / total.committed : null)} {t("Committed (full cycle)").toLowerCase()}</div>
        </div>
        <div className="card tile">
          <div className="l">{t("Absorbed")}</div>
          <div className="v">{compact(total.absorbed, 2)}<small>tCO₂e</small></div>
          <div className="d">{pct(total.committed ? total.absorbed / total.committed : null)}</div>
        </div>
        <div className="card tile">
          <div className="l">{t("Avoided")}</div>
          <div className="v">{compact(total.avoided, 2)}<small>tCO₂e</small></div>
          <div className="d">{pct(total.committed ? total.avoided / total.committed : null)}</div>
        </div>
      </div>

      <section className="section grid g-12">
        <ChartCard className="span-7" title={t("CO₂ by indicator")} sub={t("Absorbed and avoided emissions, full cycle")}
          table={{
            cols: [
              { key: "i", label: t("Indicator"), value: (r: (typeof byInd)[number]) => nameOf(r.i) },
              { key: "ab", label: t("Absorbed"), numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.absorbed) },
              { key: "av", label: t("Avoided"), numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.avoided) },
              { key: "t", label: t("Target (full cycle)"), numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.target) },
            ],
            rows: byInd,
          }}>
          {(ref) => (
            <>
              <Legend items={[{ label: t("Absorbed"), color: "var(--s3)" }, { label: t("Avoided"), color: "var(--s1)" }, { label: t("Target (full cycle)"), color: "var(--ink)" }]} />
              <Chart height={Math.max(220, byInd.length * 46 + 30)} label="CO2 by indicator" chartRef={ref} deps={[byInd]}
                option={(tk) => ({
                  grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
                  tooltip: {
                    ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                    formatter: (ps: { dataIndex: number }[]) => {
                      const r = byInd[ps[0].dataIndex];
                      return tipTitle(nameOf(r.i)) + tipRow(tk.series[ABS], tco2(r.absorbed), t("Absorbed"), "rect") +
                        tipRow(tk.series[AVO], tco2(r.avoided), t("Avoided"), "rect") + tipRow(tk.ink, tco2(r.target), t("Target (full cycle)")) +
                        `<div style="margin-top:6px;opacity:.85">${esc(pct(r.target ? r.committed / r.target : null))} ${esc(t("of target"))}</div>`;
                    },
                  },
                  xAxis: { type: "value", ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
                  yAxis: { type: "category", inverse: true, data: byInd.map((r) => nameOf(r.i)), ...axisBase(tk), splitLine: { show: false },
                    axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2, width: 170, overflow: "truncate" } },
                  series: [
                    { name: t("Absorbed"), type: "bar", stack: "c", barMaxWidth: 18, data: byInd.map((r) => r.absorbed),
                      itemStyle: { color: tk.series[ABS], borderColor: tk.surface, borderWidth: 1 } },
                    { name: t("Avoided"), type: "bar", stack: "c", barMaxWidth: 18, data: byInd.map((r) => r.avoided),
                      itemStyle: { color: tk.series[AVO], borderColor: tk.surface, borderWidth: 1, borderRadius: [0, 4, 4, 0] },
                      label: { show: true, position: "right", color: tk.ink2, fontSize: 12, formatter: (p: { dataIndex: number }) => compact(byInd[p.dataIndex].committed) } },
                    { name: t("Target (full cycle)"), type: "line", symbol: "rect", symbolSize: [2, 22], lineStyle: { opacity: 0 }, silent: true, z: 5,
                      itemStyle: { color: tk.ink }, data: byInd.map((r) => [r.target || "-", nameOf(r.i)]) },
                  ],
                })} />
            </>
          )}
        </ChartCard>

        <ChartCard className="span-5" title={t("CO₂ realised over time")} sub={t("Benefit accrued each year by what is in place")}
          table={{
            cols: [
              { key: "y", label: "Year", value: (r: { y: number; i: number }) => r.y },
              { key: "r", label: t("Realised to date"), numeric: true, value: (r: { y: number; i: number }) => Math.round(realisedSeries[r.i].realised) },
              { key: "c", label: t("Committed (full cycle)"), numeric: true, value: (r: { y: number; i: number }) => Math.round(realisedSeries[r.i].committed) },
            ] as Column<{ y: number; i: number }>[],
            rows: years.map((y, i) => ({ y, i })),
          }}>
          {(ref) => (
            <>
              <Legend kind="line" items={[{ label: t("Realised to date"), color: "var(--s3)" }, { label: t("Committed (full cycle)"), color: "var(--s1)" }]} />
              <Chart height={300} label="CO2 realised and committed over time" chartRef={ref} deps={[realisedSeries, year]}
                option={(tk) => ({
                  grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
                  tooltip: {
                    ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "line", lineStyle: { color: tk.ink2, width: 1 } },
                    formatter: (ps: { dataIndex: number }[]) => {
                      const i = ps[0].dataIndex;
                      return tipTitle(String(years[i])) + tipRow(tk.series[ABS], tco2(realisedSeries[i].realised), t("Realised to date")) +
                        tipRow(tk.series[AVO], tco2(realisedSeries[i].committed), t("Committed (full cycle)"));
                    },
                  },
                  xAxis: { type: "category", boundaryGap: false, data: years.map(String), ...axisBase(tk), splitLine: { show: false } },
                  yAxis: { type: "value", ...axisBase(tk), axisLine: { show: false }, axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
                  series: [
                    { name: t("Realised to date"), type: "line", smooth: 0.2, symbolSize: 8, data: realisedSeries.map((x) => x.realised),
                      lineStyle: { width: 2, color: tk.series[ABS] }, itemStyle: { color: tk.series[ABS], borderColor: tk.surface, borderWidth: 2 },
                      areaStyle: { color: tk.series[ABS], opacity: 0.12 },
                      markLine: { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: tk.ink2, width: 1, type: "solid" }, data: [{ xAxis: String(year) }] } },
                    { name: t("Committed (full cycle)"), type: "line", smooth: 0.2, symbolSize: 8, data: realisedSeries.map((x) => x.committed),
                      lineStyle: { width: 2, color: tk.series[AVO] }, itemStyle: { color: tk.series[AVO], borderColor: tk.surface, borderWidth: 2 } },
                  ],
                })} />
            </>
          )}
        </ChartCard>
      </section>

      <section className="section grid g-12">
        <ChartCard className="span-5" title={t("CO₂ by country")} sub={t("Committed (full cycle)")}
          table={{
            cols: [
              { key: "c", label: t("Country"), value: (r: (typeof byCountry)[number]) => r.c },
              { key: "v", label: "tCO₂e", numeric: true, value: (r: (typeof byCountry)[number]) => Math.round(r.committed) },
            ],
            rows: byCountry,
          }}>
          {(ref) => (
            <Chart height={Math.max(160, byCountry.length * 40 + 20)} label="CO2 by country" chartRef={ref} deps={[byCountry]}
              option={(tk) => ({
                grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
                tooltip: {
                  ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                  formatter: (ps: { dataIndex: number }[]) => {
                    const r = byCountry[ps[0].dataIndex];
                    return tipTitle(r.c) + tipRow(tk.map[3], tco2(r.committed), t("Committed (full cycle)"), "rect") +
                      tipRow(tk.map[3], tco2(r.realised), t("Realised to date"), "rect");
                  },
                },
                xAxis: { type: "value", ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
                yAxis: { type: "category", inverse: true, data: byCountry.map((r) => r.c), ...axisBase(tk), splitLine: { show: false },
                  axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2 } },
                series: [{
                  type: "bar", barMaxWidth: 18, data: byCountry.map((r) => r.committed), itemStyle: { color: tk.map[3], borderRadius: [0, 4, 4, 0] },
                  label: { show: true, position: "right", color: tk.ink2, fontSize: 12, formatter: (p: { value: number }) => compact(p.value) },
                }],
              })} />
          )}
        </ChartCard>
        <section className="card span-7" aria-label={t("Emission factors")}>
          <div className="card-head"><div><h3>{t("Emission factors")}</h3><div className="sub">config/co2_factors.yml</div></div></div>
          <DataTable rows={m.co2Factors} cols={[
            { key: "i", label: t("Indicator"), value: (f) => `#${f.indicator} ${nameOf(ix.indicators.get(f.indicator)!)}` },
            { key: "c", label: "", value: (f) => t(f.component === "absorbed" ? "Absorbed" : "Avoided") },
            { key: "r", label: t("Rate (tCO₂e / unit / yr)"), numeric: true, value: (f) => f.rate, render: (f) => num(f.rate, 4) },
            { key: "h", label: t("Horizon (years)"), numeric: true, value: (f) => f.horizon },
            { key: "f", label: t("Derivation"), value: (f) => f.formula },
          ] as Column<Co2Factor>[]} />
        </section>
      </section>
    </>
  );
}
