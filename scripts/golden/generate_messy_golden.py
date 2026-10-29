#!/usr/bin/env python3
"""Generate tests/fixtures/messy/messy.golden.json from the messy CSV subsets.

Independent pandas oracle for the "one numeric rule" (src/shared/utils/numeric.ts). It does
not import or mirror the app's TypeScript; it re-implements the written rule:

* A cell is a number only if, after trimming ASCII whitespace (space, \\t, \\n, \\v, \\f, \\r;
  NOT non-breaking or other Unicode spaces), it matches
  ^[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?$ and is finite.
  ([0-9], not \\d: Python's \\d also matches non-ASCII digits.)
* Everything else is null and EXCLUDED: blanks, the null tokens below (case-insensitive),
  junk ("ERROR", "UNKNOWN"), hex, "Infinity", "$1.99", "1,000", "3.0M".
* count = number of valid numbers; std = SAMPLE std (ddof=1).

Files are read with dtype=str and keep_default_na=False, so pandas' own NA list (which
differs: no "-", case-sensitive) and its number parsing ("Infinity", " 1 ") play no part.

`numericStats` is what a plain import gives: the rule above plus the import's automatic
fixes (AUTO_FIXES: a currency column has its mark stripped), so Glassdoor's -1 sentinels and
Play Store's shifted row are still in it. `fixedStats` is after the fixes a user approves
(USER_FIXES): -1 → missing (sentinel), "Convert to number…" ("10,000+" → 10000, k/M/G), and
rows with the wrong field count excluded. Short/long rows are found here independently, by
counting fields with the csv module.

Dates (DATE_COLUMNS below) are parsed with an explicit strptime format per column via
pd.to_datetime(format=..., errors="coerce") after ASCII trimming; nothing about the app's
format detection is mirrored. "Missing" uses the app's ingest null rule (cleanValue: "",
"null", "undefined", "n/a", case-insensitive); every other value that doesn't match the
format (or isn't a real calendar date) is "invalid". Per column: valid/invalid/missing
counts, min, max (YYYY-MM-DD) and per-year counts of valid dates.

Run:  npm run golden:regen-messy   (needs: pip install -r scripts/golden/requirements.txt)
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "tests" / "fixtures" / "messy"
OUT = DIR / "messy.golden.json"
FILES = ["cafe.csv", "playstore.csv", "netflix.csv", "glassdoor.csv"]
DATE_COLUMNS = {
    "netflix.csv": {"date_added": "%B %d, %Y"},
    "playstore.csv": {"Last Updated": "%B %d, %Y"},
    "cafe.csv": {"Transaction Date": "%Y-%m-%d"},
}
INGEST_NULLS = {"", "null", "undefined", "n/a"}

# Applied by every import (the column is converted automatically).
AUTO_FIXES = {
    "playstore.csv": {"Price": "currency"},
}
# Applied when the user says yes. "_exclude" = drop rows whose field count != header's.
USER_FIXES = {
    "glassdoor.csv": {"Rating": ("sentinel", -1.0), "Founded": ("sentinel", -1.0)},
    "playstore.csv": {"_exclude": True, "Installs": ("numberSuffix", None)},
}
CURRENCY = re.compile(r"^\$\s?(.+)$")
SUFFIX = re.compile(r"^((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?)\s?([kKmMgG])?(\+)?$")

NULL_TOKENS = {"", "n/a", "na", "nan", "null", "none", "#n/a", "-", "undefined"}
NUMBER = re.compile(r"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")
ASCII_WS = " \t\n\v\f\r"


def to_number(cell: str) -> float | None:
    s = cell.strip(ASCII_WS)
    if s.lower() in NULL_TOKENS or not NUMBER.match(s):
        return None
    v = float(s)
    return v if math.isfinite(v) else None


def strip_currency(cell: str) -> str:
    m = CURRENCY.match(cell.strip(ASCII_WS))
    return m.group(1) if m else cell


def suffix_number(cell: str) -> float | None:
    m = SUFFIX.match(cell.strip(ASCII_WS))
    if not m:
        return None
    return float(m.group(1).replace(",", "")) * {"": 1, "k": 1e3, "m": 1e6, "g": 1e9}[(m.group(2) or "").lower()]


def short_rows(path: Path) -> set[int]:
    """0-based data rows whose field count differs from the header's."""
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.reader(io.StringIO(f.read())))
    width = len(rows[0])
    return {i for i, r in enumerate(rows[1:]) if r and len(r) != width}


def numbers(values: pd.Series, fix=None) -> list[float]:
    out = []
    for c in values:
        if fix and fix[0] == "numberSuffix":
            v = to_number(c) if to_number(c) is not None else suffix_number(c)
        else:
            v = to_number(c)
            if fix and fix[0] == "sentinel" and v == fix[1]:
                v = None
        if v is not None:
            out.append(v)
    return out


def column_stats(values: pd.Series, fix=None) -> dict | None:
    nums = pd.Series(numbers(values, fix), dtype=float)
    if nums.empty:
        return None
    return {
        "count": int(nums.count()),
        "sum": float(nums.sum()),
        "mean": float(nums.mean()),
        "min": float(nums.min()),
        "max": float(nums.max()),
        # n < 2: sample std is undefined; the app reports 0 there
        "std": float(nums.std(ddof=1)) if len(nums) > 1 else 0.0,
    }


def date_stats(values: pd.Series, fmt: str) -> dict:
    trimmed = values.map(lambda c: c.strip(ASCII_WS))
    missing = trimmed.map(lambda c: c.lower() in INGEST_NULLS)
    present = trimmed[~missing]
    parsed = pd.to_datetime(present, format=fmt, errors="coerce")
    valid = parsed.dropna()
    years = valid.dt.year.value_counts().sort_index()
    return {
        "format": fmt,
        "validCount": int(valid.count()),
        "invalidCount": int(parsed.isna().sum()),
        "missingCount": int(missing.sum()),
        "min": valid.min().strftime("%Y-%m-%d") if len(valid) else None,
        "max": valid.max().strftime("%Y-%m-%d") if len(valid) else None,
        "yearCounts": {str(int(y)): int(n) for y, n in years.items()},
    }


def main() -> int:
    golden: dict = {
        "_meta": {
            "generator": "scripts/golden/generate_messy_golden.py",
            "pandas": pd.__version__,
            "rule": "ASCII trim; null tokens " + ", ".join(sorted(NULL_TOKENS)) + "; strict decimal; sample std",
        }
    }
    for name in FILES:
        df = pd.read_csv(DIR / name, dtype=str, keep_default_na=False, encoding="utf-8")
        for col, kind in AUTO_FIXES.get(name, {}).items():
            if kind == "currency":
                df[col] = df[col].map(strip_currency)
        cols = {}
        for col in df.columns:
            stats = column_stats(df[col])
            if stats is not None:
                cols[col] = stats
        dupes = int(df.duplicated(keep="first").sum())
        golden[name] = {
            "rowCount": int(len(df)),
            "columns": list(df.columns),
            "duplicateRows": dupes,
            "numericStats": cols,
        }
        user = USER_FIXES.get(name)
        if user:
            fixed = df
            if user.get("_exclude"):
                bad = short_rows(DIR / name)
                fixed = df[[i not in bad for i in range(len(df))]]
                golden[name]["excludedRows"] = sorted(bad)
            golden[name]["fixedStats"] = {
                col: column_stats(fixed[col], user.get(col))
                for col in fixed.columns
                if column_stats(fixed[col], user.get(col)) is not None
            }
        if name in DATE_COLUMNS:
            golden[name]["dateStats"] = {
                col: date_stats(df[col], fmt) for col, fmt in DATE_COLUMNS[name].items()
            }
    OUT.write_text(json.dumps(golden, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
