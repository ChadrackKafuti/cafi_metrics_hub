"""Build the dashboard dataset from ProjectData.xlsx.

    python -m pipeline.build [--input data/ProjectData.xlsx] [--out web/public/data]

Steps: read the CumulResults sheet -> normalise text -> run quality checks ->
derive CO2 from config/co2_factors.yml -> write metrics.json and quality.json.
Exits with status 1 when a blocking (error-level) check fails, so CI never
publishes a broken dataset.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
import yaml

from pipeline.quality import QualityReport

ROOT = Path(__file__).resolve().parent.parent
SHEET = "CumulResults"

# Source column -> internal name. Headers are matched case- and space-insensitively.
COLUMNS = {
    "pays": "country",
    "programme": "programme",
    "implementing org.": "partner",
    "outcome": "outcome",
    "indicator": "indicator",
    "indicator synonym": "label",
    "unité": "unit",
    "start year": "start",
    "end year": "end",
    "final target": "target",
}
UNIT_ALIASES = {"hectare": "ha", "nombre": "count", "km": "km"}


@dataclass
class Config:
    outcomes: list[dict]
    indicators: dict[str, dict]
    countries: dict[str, dict]
    factors: dict[str, list[dict]]
    headline: dict

    @classmethod
    def load(cls, config_dir: Path) -> "Config":
        ind = yaml.safe_load((config_dir / "indicators.yml").read_text(encoding="utf-8"))
        co2 = yaml.safe_load((config_dir / "co2_factors.yml").read_text(encoding="utf-8"))
        headline = yaml.safe_load((config_dir / "headline.yml").read_text(encoding="utf-8"))
        return cls(
            outcomes=ind["outcomes"],
            indicators={str(k): v for k, v in ind["indicators"].items()},
            countries=ind["countries"],
            factors={str(k): v for k, v in (co2.get("factors") or {}).items()},
            headline=headline,
        )


@dataclass
class Dataset:
    years: list[int]
    frame: pd.DataFrame
    report: QualityReport = field(default_factory=QualityReport)


def clean_text(value) -> str:
    """Trim, normalise unicode and collapse internal whitespace."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = unicodedata.normalize("NFC", str(value))
    return re.sub(r"\s+", " ", text).strip()


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def year_of(header) -> int | None:
    text = clean_text(header)
    if re.fullmatch(r"(19|20)\d\d(\.0)?", text):
        return int(float(text))
    return None


def read_workbook(path: Path, config: Config) -> Dataset:
    raw = pd.read_excel(path, sheet_name=SHEET, dtype=object)
    report = QualityReport()

    rename, years = {}, []
    for col in raw.columns:
        key = clean_text(col).lower()
        if key in COLUMNS:
            rename[col] = COLUMNS[key]
        elif (y := year_of(col)) is not None:
            rename[col] = y
            years.append(y)
    missing = sorted(set(COLUMNS.values()) - set(rename.values()))
    if missing:
        report.error("schema", "Required columns missing",
                     f"Sheet '{SHEET}' is missing: {', '.join(missing)}.")
        return Dataset(years=[], frame=pd.DataFrame(), report=report)
    if not years:
        report.error("schema", "No year columns", "Expected columns named like 2020, 2021, …")
        return Dataset(years=[], frame=pd.DataFrame(), report=report)

    df = raw.rename(columns=rename)[list(COLUMNS.values()) + sorted(years)].copy()
    df = df.dropna(how="all", subset=["programme", "indicator"])
    df.insert(0, "row", df.index + 2)  # Excel row number (header is row 1)
    return Dataset(years=sorted(years), frame=df.reset_index(drop=True), report=report)


def normalise(ds: Dataset, config: Config) -> Dataset:
    df, rep = ds.frame, ds.report
    text_cols = ["country", "programme", "partner", "outcome", "indicator", "label", "unit"]

    padded = []
    for col in text_cols:
        before = df[col].map(lambda v: "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v))
        after = df[col].map(clean_text)
        for i in df.index[before != after]:
            padded.append({"row": int(df.at[i, "row"]), "field": col, "value": before[i]})
        df[col] = after
    if padded:
        rep.warning("whitespace", "Extra spaces in text",
                    "Leading, trailing or double spaces make identical labels count as different "
                    "items. They were removed automatically.",
                    padded)

    # Partner spelling: group case-insensitively, keep the most frequent spelling.
    canon = {}
    for _, grp in df.groupby(df["partner"].str.casefold()):
        spellings = grp["partner"].value_counts()
        if len(spellings) > 1:
            rep.warning("partner-spelling", "Inconsistent partner spelling",
                        "The same implementing organisation is written in more than one way.",
                        [{"value": " / ".join(spellings.index), "field": "partner"}])
        for s in spellings.index:
            canon[s] = spellings.index[0]
    df["partner"] = df["partner"].map(canon)

    # Indicator code is the leading number of the Indicator column.
    df["code"] = df["indicator"].str.extract(r"^(\d{1,2})")[0].str.zfill(2)
    unknown = df[df["code"].isna() | ~df["code"].isin(config.indicators)]
    if len(unknown):
        rep.error("indicator-unknown", "Indicator not in catalogue",
                  "Add the indicator to config/indicators.yml before publishing.",
                  [{"row": int(r.row), "programme": r.programme, "indicator": r.indicator}
                   for r in unknown.itertuples()])

    outcome_ids = {o["id"]: o for o in config.outcomes}
    mism = []
    for r in df.itertuples():
        meta = config.indicators.get(r.code)
        if not meta:
            continue
        expected = outcome_ids[meta["outcome"]]["name"]
        if slugify(r.outcome).rstrip("s") != slugify(expected).rstrip("s"):
            mism.append({"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
                         "detail": f"Sheet says '{r.outcome}', catalogue says '{expected}'"})
    if mism:
        rep.warning("outcome-mismatch", "Outcome differs from catalogue",
                    "The catalogue (config/indicators.yml) decides the outcome shown on the dashboard.",
                    mism)
    case_variants = df.groupby(df["outcome"].str.casefold())["outcome"].nunique()
    for key in case_variants[case_variants > 1].index:
        variants = sorted(df.loc[df["outcome"].str.casefold() == key, "outcome"].unique())
        rep.warning("outcome-case", "Outcome written in different cases",
                    "In Power BI these appear as separate outcomes and rows get dropped.",
                    [{"value": " / ".join(variants), "field": "outcome"}])

    unk_country = sorted(set(df["country"]) - set(config.countries))
    if unk_country:
        rep.error("country-unknown", "Country not in catalogue",
                  "Add the country to config/indicators.yml (countries).",
                  [{"value": c, "field": "country"} for c in unk_country])

    # Numbers.
    bad_num = []
    for col in ["start", "end", "target", *ds.years]:
        num = pd.to_numeric(df[col], errors="coerce")
        bad = df[col].notna() & num.isna()
        for i in df.index[bad]:
            bad_num.append({"row": int(df.at[i, "row"]), "field": str(col), "value": str(df.at[i, col])})
        df[col] = num
    if bad_num:
        rep.error("not-a-number", "Text in a numeric column",
                  "These cells must contain numbers.", bad_num)

    negatives = []
    for col in ["target", *ds.years]:
        for i in df.index[df[col] < 0]:
            negatives.append({"row": int(df.at[i, "row"]), "programme": df.at[i, "programme"],
                              "field": str(col), "value": str(df.at[i, col])})
    if negatives:
        rep.error("negative", "Negative values", "Results and targets cannot be negative.", negatives)

    df["unit_norm"] = df["unit"].str.casefold().map(UNIT_ALIASES)
    unit_mism = [
        {"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
         "detail": f"Sheet unit '{r.unit}', catalogue unit '{config.indicators[r.code]['unit']}'"}
        for r in df.itertuples()
        if r.code in config.indicators and r.unit_norm != config.indicators[r.code]["unit"]
    ]
    if unit_mism:
        rep.warning("unit-mismatch", "Unit differs from catalogue",
                    "The catalogue unit is used on the dashboard.", unit_mism)
    return ds


def quality_checks(ds: Dataset, config: Config) -> None:
    df, rep, years = ds.frame, ds.report, ds.years

    dup = df[df.duplicated(["programme", "partner", "code", "label"], keep=False)]
    if len(dup):
        rep.warning("duplicate", "Duplicate rows",
                    "Same programme, partner, indicator and sub-indicator appear more than once; "
                    "both are kept and added together.",
                    [{"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
                      "detail": r.label} for r in dup.itertuples()])

    no_target = df[(df["target"].fillna(0) == 0)]
    if len(no_target):
        rep.info("no-target", "No final target",
                 "Rows with a target of 0 or blank are excluded from achievement rates.",
                 [{"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
                   "detail": r.label} for r in no_target.itertuples()])

    drops = []
    for i in df.index:
        prev = None
        for y in years:
            v = df.at[i, y]
            if pd.isna(v):
                continue
            if prev is not None and v < prev[1]:
                drops.append({"row": int(df.at[i, "row"]), "programme": df.at[i, "programme"],
                              "indicator": df.at[i, "indicator"],
                              "detail": f"{prev[0]}: {prev[1]:,.0f} → {y}: {v:,.0f}"})
            prev = (y, v)
    if drops:
        rep.warning("cumulative-drop", "Cumulative value goes down",
                    "Results are cumulative, so a decrease usually means a data-entry error.", drops)

    over = []
    for i in df.index:
        t = df.at[i, "target"]
        last = df.loc[i, years].dropna()
        if t and t > 0 and len(last) and last.iloc[-1] > 2 * t:
            over.append({"row": int(df.at[i, "row"]), "programme": df.at[i, "programme"],
                         "indicator": df.at[i, "indicator"],
                         "detail": f"{last.iloc[-1]:,.0f} vs target {t:,.0f} ({last.iloc[-1] / t:.0%})"})
    if over:
        rep.info("over-target", "More than double the target",
                 "Not necessarily wrong, but worth checking the target or the unit.", over)

    bad_dates = df[df["end"] < df["start"]]
    if len(bad_dates):
        rep.warning("dates", "End year before start year", "",
                    [{"row": int(r.row), "programme": r.programme,
                      "detail": f"{r.start:.0f} – {r.end:.0f}"} for r in bad_dates.itertuples()])


def default_year(df: pd.DataFrame, years: list[int]) -> int:
    """Latest year that at least half of the rows report on."""
    complete = [y for y in years if df[y].notna().mean() >= 0.5]
    return complete[-1] if complete else years[-1]


def carry_forward(values: list[float | None]) -> list[float | None]:
    out, last = [], None
    for v in values:
        last = v if v is not None else last
        out.append(last)
    return out


def co2_for(code: str, filled: list[float | None], target: float | None, factors: dict) -> dict | None:
    comps = factors.get(code)
    if not comps:
        return None
    absorbed_rate = sum(c["rate"] * c["horizon"] for c in comps if c["component"] == "absorbed")
    avoided_rate = sum(c["rate"] * c["horizon"] for c in comps if c["component"] == "avoided")
    annual = sum(c["rate"] for c in comps)

    def r(x):
        return None if x is None else round(x, 1)

    # Each year, the cumulative area/items in place accrue one year of benefit.
    realised, acc = [], 0.0
    for v in filled:
        if v is None:
            realised.append(None)
            continue
        acc += v * annual
        realised.append(r(acc))
    return {
        "absorbed": [r(None if v is None else v * absorbed_rate) for v in filled],
        "avoided": [r(None if v is None else v * avoided_rate) for v in filled],
        "realised": realised,
        "targetAbsorbed": r((target or 0) * absorbed_rate),
        "targetAvoided": r((target or 0) * avoided_rate),
    }


def to_payload(ds: Dataset, config: Config, source_name: str) -> dict:
    df, years = ds.frame, ds.years
    df = df[df["code"].isin(config.indicators)]
    dyear = default_year(df, years)

    partners = sorted(df["partner"].unique(), key=str.casefold)
    partner_id = {p: slugify(p) or f"partner-{i}" for i, p in enumerate(partners)}

    programmes = []
    for name, grp in df.groupby("programme", sort=False):
        programmes.append({
            "id": slugify(name),
            "name": name,
            "country": grp["country"].mode().iloc[0],
            "partners": sorted({partner_id[p] for p in grp["partner"]}),
            "start": int(grp["start"].min()) if grp["start"].notna().any() else None,
            "end": int(grp["end"].max()) if grp["end"].notna().any() else None,
        })
    prog_id = {p["name"]: p["id"] for p in programmes}

    records = []
    for i, r in enumerate(df.itertuples(index=False)):
        row = df.iloc[i]
        values = [None if pd.isna(row[y]) else float(row[y]) for y in years]
        target = None if pd.isna(row["target"]) else float(row["target"])
        records.append({
            "id": i,
            "row": int(row["row"]),
            "programme": prog_id[row["programme"]],
            "partner": partner_id[row["partner"]],
            "indicator": row["code"],
            "label": row["label"],
            "target": target,
            "values": values,
            "co2": co2_for(row["code"], carry_forward(values), target, config.factors),
        })

    country_ids = sorted(set(df["country"]))
    return {
        "meta": {
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": source_name,
            "years": years,
            "defaultYear": dyear,
            "partialYears": [y for y in years if y > dyear and df[y].notna().any()],
            "recordCount": len(records),
        },
        "outcomes": [{"id": o["id"], "name": o["name"], "nameFr": o["name_fr"]} for o in config.outcomes],
        "indicators": [
            {"code": k, "name": v["name"], "nameFr": v["name_fr"], "outcome": v["outcome"],
             "unit": v["unit"], "hasCo2": k in config.factors}
            for k, v in sorted(config.indicators.items())
        ],
        "countries": [
            {"id": c, "iso": config.countries[c]["iso"], "name": config.countries[c]["name"],
             "nameFr": config.countries[c]["name_fr"]}
            for c in country_ids
        ],
        "partners": [{"id": partner_id[p], "name": p} for p in partners],
        "programmes": programmes,
        "records": records,
        "co2Factors": [
            {"indicator": code, **{k: c[k] for k in ("component", "rate", "horizon", "formula")}}
            for code, comps in sorted(config.factors.items()) for c in comps
        ],
        "headline": {
            "beneficiaries": config.headline["beneficiaries"],
            "anticipatedCo2": config.headline["anticipated_co2"],
        },
    }


def build(input_path: Path, out_dir: Path, config_dir: Path) -> int:
    config = Config.load(config_dir)
    ds = read_workbook(input_path, config)
    if not ds.report.has_errors:
        normalise(ds, config)
    if not ds.report.has_errors:
        quality_checks(ds, config)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "quality.json").write_text(
        json.dumps(ds.report.to_json(source=input_path.name), ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(ds.report.summary_text())
    if ds.report.has_errors:
        print("Build stopped: fix the errors above in the workbook or config.", file=sys.stderr)
        return 1

    payload = to_payload(ds, config, input_path.name)
    (out_dir / "metrics.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(payload['records'])} records for {len(payload['programmes'])} programmes "
          f"→ {out_dir / 'metrics.json'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=ROOT / "data" / "ProjectData.xlsx")
    ap.add_argument("--out", type=Path, default=ROOT / "web" / "public" / "data")
    ap.add_argument("--config", type=Path, default=ROOT / "config")
    args = ap.parse_args(argv)
    return build(args.input, args.out, args.config)


if __name__ == "__main__":
    sys.exit(main())
