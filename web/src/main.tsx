import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./lib/state";
import type { Metrics, Quality } from "./lib/types";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

async function boot() {
  try {
    const [m, q] = await Promise.all([
      fetch("./data/metrics.json", { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`metrics.json: HTTP ${r.status}`);
        return r.json() as Promise<Metrics>;
      }),
      fetch("./data/quality.json", { cache: "no-cache" }).then((r) => (r.ok ? (r.json() as Promise<Quality>) : null)).catch(() => null),
    ]);
    root.render(
      <StrictMode>
        <AppProvider m={m} q={q}>
          <App />
        </AppProvider>
      </StrictMode>,
    );
  } catch (e) {
    root.render(
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Data not available</h1>
        <p>Run <code>python -m pipeline.build</code> from the repository root to generate <code>web/public/data/metrics.json</code>.</p>
        <pre>{String(e)}</pre>
      </div>,
    );
  }
}

boot();
