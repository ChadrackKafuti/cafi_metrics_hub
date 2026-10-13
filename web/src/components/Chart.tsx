import { useEffect, useRef } from "react";
import type { EChartsCoreOption, ECharts } from "echarts/core";
import { echarts, readTokens, reducedMotion, type Tokens } from "../lib/echarts";
import { useApp } from "../lib/state";

interface Props {
  option: (t: Tokens) => EChartsCoreOption;
  height: number;
  label: string; // accessible description
  onClick?: (params: { name: string; data: unknown; seriesName?: string; dataIndex: number }) => void;
  chartRef?: (c: ECharts | null) => void;
  deps: unknown[];
}

/** ECharts wrapper: themed from CSS tokens, resizes with its container, re-themes on toggle. */
export function Chart({ option, height, label, onClick, chartRef, deps }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const { theme, lang } = useApp();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: "canvas" });
    chart.current = c;
    chartRef?.(c);
    c.on("click", (p) => clickRef.current?.(p as never));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      chartRef?.(null);
      c.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = readTokens();
    const o = option(t) as Record<string, unknown>;
    chart.current?.setOption(
      {
        animation: !reducedMotion(),
        animationDuration: 600,
        animationDurationUpdate: 500,
        animationEasingUpdate: "cubicOut",
        textStyle: { fontFamily: t.font },
        ...o,
      },
      { notMerge: true, lazyUpdate: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, lang, ...deps]);

  return <div ref={el} className="chart" style={{ height }} role="img" aria-label={label} />;
}
