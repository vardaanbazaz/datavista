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

Current rule, not the "correct" answer: Glassdoor's -1 sentinels and Play Store's shifted
row 10473 are kept. The Vitest suite does not compare those three columns (Glassdoor
Rating/Founded, Play Store Rating) with this file yet; later batches fix them (it.todo).

Dates (DATE_COLUMNS below) are parsed with an explicit strptime format per column via
pd.to_datetime(format=..., errors="coerce") after ASCII trimming; nothing about the app's
format detection is mirrored. "Missing" uses the app's ingest null rule (cleanValue: "",
"null", "undefined", "n/a", case-insensitive); every other value that doesn't match the
format (or isn't a real calendar date) is "invalid". Per column: valid/invalid/missing
counts, min, max (YYYY-MM-DD) and per-year counts of valid dates.

Run:  npm run golden:regen-messy   (needs: pip install -r scripts/golden/requirements.txt)
"""

from __future__ import annotations

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

NULL_TOKENS = {"", "n/a", "na", "nan", "null", "none", "#n/a", "-", "undefined"}
NUMBER = re.compile(r"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")
ASCII_WS = " \t\n\v\f\r"


def to_number(cell: str) -> float | None:
    s = cell.strip(ASCII_WS)
    if s.lower() in NULL_TOKENS or not NUMBER.match(s):
        return None
    v = float(s)
    return v if math.isfinite(v) else None


def column_stats(values: pd.Series) -> dict | None:
    nums = pd.Series([v for v in (to_number(c) for c in values) if v is not None], dtype=float)
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
        cols = {}
        for col in df.columns:
            stats = column_stats(df[col])
            if stats is not None:
                cols[col] = stats
        golden[name] = {
            "rowCount": int(len(df)),
            "columns": list(df.columns),
            "numericStats": cols,
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
