import json
from pathlib import Path

import pandas as pd
import pytest

from pipeline.build import ROOT, Config, build, carry_forward, co2_for

CONFIG = ROOT / "config"
HEADER = ["Pays", "Programme", "Implementing org.", "Outcome", "Indicator", "Indicator synonym",
          "Unité", "Start year", "End year", "Final target", "2023", "2024", "2025"]


def row(**over):
    base = dict(zip(HEADER, ["DRC", "Prog A", "GIZ", "Agriculture", "01. Subsistance agriculture (ha)",
                             "Cultures vivrières (ha)", "Hectare", 2022, 2026, 100, 10, 20, 40]))
    base.update(over)
    return base


def run(tmp_path: Path, rows: list[dict]):
    xlsx = tmp_path / "in.xlsx"
    pd.DataFrame(rows, columns=HEADER).to_excel(xlsx, sheet_name="CumulResults", index=False)
    out = tmp_path / "out"
    code = build(xlsx, out, CONFIG)
    quality = json.loads((out / "quality.json").read_text())
    metrics = json.loads((out / "metrics.json").read_text()) if (out / "metrics.json").exists() else None
    return code, metrics, {c["id"]: c for c in quality["checks"]}


def test_real_workbook_builds():
    out = ROOT / "web" / "public" / "data"
    assert build(ROOT / "data" / "ProjectData.xlsx", out, CONFIG) == 0
    # Structural checks only: the workbook changes with every reporting round.
    m = json.loads((out / "metrics.json").read_text())
    assert m["records"] and m["programmes"]
    assert m["meta"]["defaultYear"] in m["meta"]["years"]
    assert all(len(r["values"]) == len(m["meta"]["years"]) for r in m["records"])
    names = [p["name"].casefold() for p in m["partners"]]
    assert len(names) == len(set(names))  # spelling variants (KfW / KFW) are merged


def test_whitespace_and_case_are_normalised(tmp_path):
    code, m, checks = run(tmp_path, [
        row(Indicator="07. Number of local land use plans ", Outcome="Land Management",
            **{"Indicator synonym": "PLAT", "Unité": "Nombre"}),
        row(Indicator="07. Number of local land use plans", Outcome="Land management",
            Programme="Prog B", **{"Indicator synonym": "PLAT", "Unité": "Nombre"}),
    ])
    assert code == 0
    assert {r["indicator"] for r in m["records"]} == {"07"}
    assert "whitespace" in checks and "outcome-case" in checks


def test_unknown_indicator_blocks_build(tmp_path):
    code, m, checks = run(tmp_path, [row(Indicator="99. Something new")])
    assert code == 1 and m is None
    assert checks["indicator-unknown"]["severity"] == "error"


def test_negative_and_text_values_block_build(tmp_path):
    code, _, checks = run(tmp_path, [row(**{"2024": -5}), row(Programme="B", **{"2025": "about 40"})])
    assert code == 1
    assert {"negative", "not-a-number"} <= checks.keys()


def test_cumulative_drop_is_flagged(tmp_path):
    code, _, checks = run(tmp_path, [row(**{"2024": 50, "2025": 0})])
    assert code == 0
    assert checks["cumulative-drop"]["count"] == 1


def test_carry_forward():
    assert carry_forward([None, 1, None, 3, None]) == [None, 1, 1, 3, 3]


@pytest.mark.parametrize("code,results,expected_absorbed,expected_avoided", [
    # Expressions copied from the Power BI calculated columns Absorbed_Res1 / Avoided_Res1.
    ("01", 100, 0.8 * 3.667 * 100 * 10, 0.8 * 3.667 * (100 / 2) * 10),
    ("02", 100, (5.09 + 1.22) * 3.667 * 100 * 10, (5.09 + 1.22) * 3.667 * (100 / 2) * 10),
    ("03", 100, (5.09 + 1.22) * 3.667 * 100 * 10, (5.09 + 1.22) * 3.667 * (100 / 2) * 10),
    ("04", 100, (0.62 + (19 * 0.25 / 100)) * 3.667 * 100 * 15,
     (0.62 + (19 * 0.25 / 100)) * 3.667 * (100 * (0.5 / 100)) * 15),
])
def test_co2_matches_power_bi_formulas(code, results, expected_absorbed, expected_avoided):
    factors = Config.load(CONFIG).factors
    out = co2_for(code, [results], None, factors)
    assert out["absorbed"][0] == pytest.approx(expected_absorbed, abs=0.1)
    assert out["avoided"][0] == pytest.approx(expected_avoided, abs=0.1)


def test_clean_cooking_total_matches_power_bi():
    # Power BI booked it as absorbed: (5.5*(2533/1000)*R)*0.75*0.35*10; here it is avoided.
    out = co2_for("05", [1000], None, Config.load(CONFIG).factors)
    assert out["absorbed"][0] + out["avoided"][0] == pytest.approx(5.5 * 2.533 * 1000 * 0.75 * 0.35 * 10, abs=0.1)


def test_realised_co2_accrues_yearly():
    factors = {"01": [{"component": "absorbed", "rate": 2.0, "horizon": 10}]}
    out = co2_for("01", [None, 10, 20], 50, factors)
    assert out["realised"] == [None, 20.0, 60.0]
    assert out["targetAbsorbed"] == 1000.0
