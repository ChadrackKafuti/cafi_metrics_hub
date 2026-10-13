"""Collects data-quality findings; written to quality.json and shown on the dashboard."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

SEVERITIES = ("error", "warning", "info")


@dataclass
class Check:
    id: str
    severity: str
    title: str
    description: str
    items: list[dict] = field(default_factory=list)


@dataclass
class QualityReport:
    checks: list[Check] = field(default_factory=list)

    def add(self, severity: str, id: str, title: str, description: str, items=None) -> None:
        assert severity in SEVERITIES
        for c in self.checks:  # merge repeated findings of the same check
            if c.id == id:
                c.items.extend(items or [])
                return
        self.checks.append(Check(id, severity, title, description, list(items or [])))

    def error(self, *a, **k):
        self.add("error", *a, **k)

    def warning(self, *a, **k):
        self.add("warning", *a, **k)

    def info(self, *a, **k):
        self.add("info", *a, **k)

    @property
    def has_errors(self) -> bool:
        return any(c.severity == "error" for c in self.checks)

    def count(self, severity: str) -> int:
        return sum(1 for c in self.checks if c.severity == severity)

    def to_json(self, source: str) -> dict:
        order = {s: i for i, s in enumerate(SEVERITIES)}
        return {
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": source,
            "summary": {s: self.count(s) for s in SEVERITIES},
            "checks": [
                {"id": c.id, "severity": c.severity, "title": c.title,
                 "description": c.description, "count": len(c.items), "items": c.items}
                for c in sorted(self.checks, key=lambda c: order[c.severity])
            ],
        }

    def summary_text(self) -> str:
        lines = [f"Data quality: {self.count('error')} error(s), {self.count('warning')} warning(s), "
                 f"{self.count('info')} note(s)"]
        for c in self.checks:
            lines.append(f"  [{c.severity:7}] {c.title} ({len(c.items)})")
        return "\n".join(lines)
