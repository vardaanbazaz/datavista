#!/usr/bin/env python3
"""Generate tests/fixtures/hr-attrition.golden.json from tests/fixtures/hr-attrition.csv.

This is an independent oracle for DataVista's engines: it uses pandas/numpy only and
never imports or mirrors the app's TypeScript code. The Vitest suite
(src/shared/services/__tests__/golden.hrAttrition.test.ts) loads the same CSV through the
app's real parsing path and compares every engine against this file.

Run:  npm run golden:regen   (needs: pip install -r scripts/golden/requirements.txt)

Conventions (chosen to match the app's documented/implemented behaviour; where the app's
choice is non-standard that is called out, not hidden):

* Variance / standard deviation: SAMPLE (ddof=1, divide by N - 1), pandas' and Excel
  STDEV.S's default. Changed 2026-10-28 from population (ddof=0): the app now uses sample
  std everywhere (stats/descriptive.ts, queryEngine, charts, z-score outliers) and labels it
  "Std. deviation (sample)" / "Variance (sample)". Skewness/kurtosis are not checked here.
* Quantiles: linear interpolation between closest ranks (numpy/pandas default "linear",
  Hyndman-Fan type 7): idx = (n - 1) * p.
* Median: middle value, mean of the two middle values for even n.
* IQR outliers: Tukey fences, value < Q1 - 1.5*IQR or value > Q3 + 1.5*IQR (strict).
* Z-score outliers: |(x - mean) / sample_std| > 3 (strict).
* Pearson r: pairwise complete observations, population/sample choice cancels out.
* Window functions (PARTITION BY Department ORDER BY MonthlyIncome DESC):
  - ROW_NUMBER: ties broken by original CSV row order. The app's sort is stable; that rule
    is recorded only in docs/INVESTIGATION-item3-window-pivot-zeroing-2026-09-14.md, not in
    user-facing docs, so it is pinned here explicitly.
  - RANK: SQL RANK (gaps after ties) == pandas rank(method="min").
  - DENSE_RANK: SQL DENSE_RANK == pandas rank(method="dense").
  - Running total of MonthlyIncome with no explicit frame: SQL default
    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, i.e. peer-inclusive: every row tied
    on MonthlyIncome gets the total through the end of its peer group. Computed here
    without sorting: sum of the department's MonthlyIncome values >= the current row's.
* Group keys are serialised with str() of the integer/string value, matching how a
  grouped result is keyed ("35", "Sales").
* Attrition rate = count(Attrition == "Yes") / count(rows) per group.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "tests" / "fixtures" / "hr-attrition.csv"
OUT = ROOT / "tests" / "fixtures" / "hr-attrition.golden.json"

STATS_COLUMNS = ["MonthlyIncome", "Age", "TotalWorkingYears"]
CORR_COLUMNS = ["Age", "MonthlyIncome", "TotalWorkingYears", "YearsAtCompany"]


def num(v) -> float | int:
    """numpy scalar -> plain Python number (json can't serialise numpy types)."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return float(v)
    if isinstance(v, int):
        return v
    raise TypeError(f"unexpected value {v!r} ({type(v)})")


def quantile_linear(s: pd.Series, q: float) -> float:
    return float(np.quantile(s.to_numpy(dtype=float), q, method="linear"))


def describe(s: pd.Series) -> dict:
    s = s.astype(float)
    mean = s.mean()
    std = s.std(ddof=1)
    q1 = quantile_linear(s, 0.25)
    q3 = quantile_linear(s, 0.75)
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    z = (s - mean) / std
    return {
        "count": int(s.count()),
        "mean": float(mean),
        "median": float(s.median()),
        "variance": float(s.var(ddof=1)),
        "stdDev": float(std),
        "min": float(s.min()),
        "max": float(s.max()),
        "q1": q1,
        "q3": q3,
        "iqrOutlierCount": int(((s < lo) | (s > hi)).sum()),
        "zscoreOutlierCount": int((z.abs() > 3).sum()),
    }


def group_stats(df: pd.DataFrame, by: str, cols: list[str]) -> dict:
    out: dict = {}
    for key, g in df.groupby(by, sort=True):
        entry = {}
        for c in cols:
            v = g[c].astype(float)
            entry[c] = {
                "sum": float(v.sum()),
                "avg": float(v.mean()),
                "count": int(v.count()),
                "min": float(v.min()),
                "max": float(v.max()),
            }
        out[str(key)] = entry
    return out


def dim_summary(g: pd.DataFrame) -> dict:
    yes = int((g["Attrition"] == "Yes").sum())
    return {
        "count": int(len(g)),
        "avgMonthlyIncome": float(g["MonthlyIncome"].astype(float).mean()),
        "attritionYesCount": yes,
        "attritionYesRate": yes / len(g),
    }


def main() -> int:
    # utf-8-sig strips the BOM on the first header ("﻿Age" -> "Age"), as PapaParse does.
    df = pd.read_csv(CSV, encoding="utf-8-sig")
    if df.columns[0] != "Age":
        print(f"unexpected first column {df.columns[0]!r}", file=sys.stderr)
        return 1
    df["_order"] = np.arange(len(df))

    golden: dict = {
        "_meta": {
            "source": "tests/fixtures/hr-attrition.csv",
            "generator": "scripts/golden/generate_hr_golden.py",
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "rowCount": int(len(df)),
            "conventions": {
                "variance": "sample (ddof=1)",
                "quantile": "linear interpolation, idx=(n-1)*p (numpy 'linear', type 7)",
                "iqrOutliers": "strictly outside Q1-1.5*IQR .. Q3+1.5*IQR",
                "zscoreOutliers": "|z|>3 with sample std",
                "rowNumberTies": "original CSV row order",
                "rank": "SQL RANK (min), DENSE_RANK (dense)",
                "runningTotal": "RANGE UNBOUNDED PRECEDING..CURRENT ROW (peer-inclusive)",
            },
        }
    }

    # 1. group-by Age
    golden["groupByAge"] = group_stats(df, "Age", ["Education", "MonthlyIncome"])

    # 2. group-by Department, JobRole (each alone) and Department > JobRole (nested)
    golden["groupByDepartment"] = {str(k): dim_summary(g) for k, g in df.groupby("Department")}
    golden["groupByJobRole"] = {str(k): dim_summary(g) for k, g in df.groupby("JobRole")}
    golden["groupByDepartmentJobRole"] = {
        f"{d}\u0000{r}": dim_summary(g) for (d, r), g in df.groupby(["Department", "JobRole"])
    }

    # 3. pivot Department x Gender: count and sum MonthlyIncome with totals
    count = pd.crosstab(df["Department"], df["Gender"], margins=True, margins_name="__total__")
    total = pd.crosstab(
        df["Department"], df["Gender"], values=df["MonthlyIncome"], aggfunc="sum",
        margins=True, margins_name="__total__",
    )
    pivot: dict = {}
    for d in count.index:
        for gname in count.columns:
            pivot[f"{d}|{gname}"] = {
                "count": int(count.loc[d, gname]),
                "sumMonthlyIncome": float(total.loc[d, gname]),
            }
    golden["pivotDepartmentGender"] = pivot

    # 4. descriptive stats + outlier counts
    golden["stats"] = {c: describe(df[c]) for c in STATS_COLUMNS}

    # 5. Pearson correlation matrix
    corr = df[CORR_COLUMNS].astype(float).corr(method="pearson")
    golden["correlation"] = {
        a: {b: float(corr.loc[a, b]) for b in CORR_COLUMNS} for a in CORR_COLUMNS
    }

    # 6. window functions, PARTITION BY Department ORDER BY MonthlyIncome DESC
    w = df[["EmployeeNumber", "Department", "MonthlyIncome", "_order"]].copy()
    w = w.sort_values(["Department", "MonthlyIncome", "_order"], ascending=[True, False, True])
    w["rowNumber"] = w.groupby("Department").cumcount() + 1
    grp = w.groupby("Department")["MonthlyIncome"]
    w["rank"] = grp.rank(method="min", ascending=False).astype(int)
    w["denseRank"] = grp.rank(method="dense", ascending=False).astype(int)
    w["runningTotal"] = [
        float(df.loc[(df["Department"] == d) & (df["MonthlyIncome"] >= m), "MonthlyIncome"].sum())
        for d, m in zip(w["Department"], w["MonthlyIncome"])
    ]

    # Sample: per department the top 3 earners, the median-position row and the last row,
    # plus every row in the first few within-department MonthlyIncome ties (so tie handling
    # of ROW_NUMBER / RANK / DENSE_RANK / running total is actually exercised).
    sample_ids: set[int] = set()
    for _, part in w.groupby("Department"):
        n = len(part)
        for pos in {0, 1, 2, n // 2, n - 1}:
            sample_ids.add(int(part.iloc[pos]["EmployeeNumber"]))
        tied = part[part.duplicated("MonthlyIncome", keep=False)]
        for _, tie in list(tied.groupby("MonthlyIncome", sort=False))[:3]:
            sample_ids.update(int(e) for e in tie["EmployeeNumber"])
    if not (w[w["EmployeeNumber"].isin(sample_ids)].duplicated(["Department", "MonthlyIncome"], keep=False)).any():
        print("window sample has no within-department ties; tie semantics untested", file=sys.stderr)
        return 1

    window = {}
    for _, r in w[w["EmployeeNumber"].isin(sample_ids)].iterrows():
        window[str(int(r["EmployeeNumber"]))] = {
            "department": r["Department"],
            "monthlyIncome": num(r["MonthlyIncome"]),
            "rowNumber": int(r["rowNumber"]),
            "rank": int(r["rank"]),
            "denseRank": int(r["denseRank"]),
            "runningTotal": float(r["runningTotal"]),
        }
    golden["windowByDepartmentIncomeDesc"] = window

    OUT.write_text(json.dumps(golden, indent=2, sort_keys=True, allow_nan=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(window)} window sample rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
