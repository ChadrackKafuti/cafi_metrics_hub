// App state: route + filters live in the URL hash so every view is shareable,
// e.g.  #/outcome/forestry?year=2024&country=DRC,Gabon
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Filters } from "./model";
import { Index } from "./model";
import type { Metrics, Quality } from "./types";
import { setLang, type Lang } from "./i18n";
import { setLocale } from "./format";

export interface Route {
  page: string; // "" | "outcome" | "programmes" | "programme" | "climate" | "quality" | "methodology"
  id?: string;
}

interface Ctx {
  m: Metrics;
  q: Quality | null;
  ix: Index;
  route: Route;
  filters: Filters;
  lang: Lang;
  theme: "light" | "dark";
  navigate: (route: Route) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setLangPref: (l: Lang) => void;
  toggleTheme: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

function parseHash(m: Metrics): { route: Route; filters: Filters } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [page = "", id] = path.split("/").map(decodeURIComponent);
  const params = new URLSearchParams(query);
  const list = (k: string) => (params.get(k) ? params.get(k)!.split(",").filter(Boolean) : []);
  const y = Number(params.get("year"));
  return {
    route: { page, id },
    filters: {
      year: m.meta.years.includes(y) ? y : m.meta.defaultYear,
      countries: list("country"),
      partners: list("partner"),
      programmes: list("programme"),
    },
  };
}

function toHash(route: Route, f: Filters, m: Metrics): string {
  const path = [route.page, route.id].filter((x): x is string => !!x).map((x) => encodeURIComponent(x)).join("/");
  const p = new URLSearchParams();
  if (f.year !== m.meta.defaultYear) p.set("year", String(f.year));
  if (f.countries.length) p.set("country", f.countries.join(","));
  if (f.partners.length) p.set("partner", f.partners.join(","));
  if (f.programmes.length) p.set("programme", f.programmes.join(","));
  const qs = p.toString().replace(/%2C/g, ",");
  return `#/${path}${qs ? `?${qs}` : ""}`;
}

function readPref<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable — preference just isn't remembered */
  }
}

function systemTheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppProvider({ m, q, children }: { m: Metrics; q: Quality | null; children: ReactNode }) {
  const ix = useMemo(() => new Index(m), [m]);
  const [{ route, filters }, setState] = useState(() => parseHash(m));
  const [lang, setLangState] = useState<Lang>(() => {
    const l = readPref<Lang>("cafi-lang", ["en", "fr"], navigator.language?.startsWith("fr") ? "fr" : "en");
    setLang(l);
    setLocale(l);
    return l;
  });
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    readPref<"light" | "dark">("cafi-theme", ["light", "dark"], systemTheme()),
  );

  useEffect(() => {
    const onHash = () => setState(parseHash(m));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [m]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const commit = useCallback(
    (r: Route, f: Filters, push: boolean) => {
      const hash = toHash(r, f, m);
      if (push) window.history.pushState(null, "", hash);
      else window.history.replaceState(null, "", hash);
      setState({ route: r, filters: f });
    },
    [m],
  );

  const value: Ctx = {
    m, q, ix, route, filters, lang, theme,
    navigate: (r) => {
      commit(r, filters, true);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    },
    setFilters: (patch) => commit(route, { ...filters, ...patch }, false),
    setLangPref: (l) => {
      setLang(l);
      setLocale(l);
      writePref("cafi-lang", l);
      setLangState(l);
    },
    toggleTheme: () => {
      const next = theme === "dark" ? "light" : "dark";
      writePref("cafi-theme", next);
      setTheme(next);
    },
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** href for anchors so links work with middle-click / copy link. */
export function hrefFor(route: Route, f: Filters, m: Metrics): string {
  return toHash(route, f, m);
}
