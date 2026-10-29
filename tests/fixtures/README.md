# Test fixtures

## hr-attrition.csv

- **Source:** IBM HR Analytics Employee Attrition sample dataset, via
  https://www.kaggle.com/datasets/pavansubhasht/ibm-hr-analytics-attrition-dataset
- **Licence:** Open Data Commons Database Contents License (DbCL) v1.0,
  http://opendatacommons.org/licenses/dbcl/1.0/
- **Use:** only as a test fixture for the golden numeric tests.

## hr-attrition.golden.json

Expected engine results for `hr-attrition.csv`, computed independently with pandas by
`scripts/golden/generate_hr_golden.py` (conventions are documented at the top of that
script). Checked by `src/shared/services/__tests__/golden.hrAttrition.test.ts`.

It is committed so CI does not need Python. Do not hand-edit it to make a test pass.
Regenerate it only when the oracle changes:

```sh
pip install -r scripts/golden/requirements.txt
npm run golden:regen
```

## messy/ — dirty real-world CSV subsets

Small subsets of public messy datasets, used by
`src/shared/services/__tests__/golden.messy.test.ts`. Each file is the source's header row
plus the listed data rows, copied byte-for-byte (original quoting, embedded newlines and
line endings kept; `.gitattributes` marks them `-text` so Git never rewrites CRLF). Row
numbers are **1-based data rows** (header excluded). The row lists come from the
2026-10-28 messy-data audit (`docs/AUDIT-MESSY-DATA-2026-10-28.md`, section C), which says
what each row covers.

| File | Source | Licence | Rows |
|---|---|---|---|
| `messy/cafe.csv` | Kaggle `ahmedmohamed2003/cafe-sales-dirty-data-for-cleaning-training`, https://www.kaggle.com/datasets/ahmedmohamed2003/cafe-sales-dirty-data-for-cleaning-training (`dirty_cafe_sales.csv`) | CC BY-SA 4.0. This subset is an adaptation and stays under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ | 81 |
| `messy/playstore.csv` | Kaggle `lava18/google-play-store-apps`, https://www.kaggle.com/datasets/lava18/google-play-store-apps (`googleplaystore.csv`) | The dataset page says CC BY-SA 4.0; the bundled `license.txt` says CC BY 3.0. We follow the stricter CC BY-SA 4.0, so this subset is CC BY-SA 4.0 | 80 |
| `messy/netflix.csv` | Kaggle `shivamb/netflix-shows`, https://www.kaggle.com/datasets/shivamb/netflix-shows (`netflix_titles.csv`) | CC0 1.0 (public domain) | 66 |
| `messy/glassdoor.csv` | Kaggle `rashikrahmanpritom/data-science-job-posting-on-glassdoor`, https://www.kaggle.com/datasets/rashikrahmanpritom/data-science-job-posting-on-glassdoor (`Uncleaned_DS_jobs.csv`) | CC0 1.0 (public domain) | 31 |

Row selection:

- **cafe.csv:** 1–12, 14, 15, 17, 19, 21, 24, 26, 29–32, 34, 36, 37, 40, 43, 50, 52, 53, 56–58, 62, 66–70, 73, 74, 78, 86, 89, 95–97, 104, 105, 116, 118, 119, 121, 141, 144, 146–148, 154, 161–163, 172, 176, 178, 190, 197, 206, 213, 214, 225, 237, 254, 260, 275, 281, 301, 342, 377, 413.
- **playstore.csv:** 1–7, 10, 16, 24, 37, 38, 43, 46, 53, 59, 60, 63, 68, 86, 89, 90, 114, 124, 127, 140, 153, 165, 193, 194, 205, 210, 235–237, 240, 266, 269, 291–293, 330, 336, 337, 339, 385, 419, 451, 479, 480, 613, 616, 622, 624, 626, 634, 883, 1453, 2034, 2112, 2545, 4096, 4128, 4198, 4242, 4363, 4368, 4454, 4466, 4491, 5152, 5308, 5352, 5487, 5946, 5979, 7028, 7141, 9149, 10473 (10473 is the malformed, shifted row).
- **netflix.csv:** data row N = `show_id` sN: s1–s8, s11, s13, s15, s30, s39, s58, s59, s86, s141, s622, s859, s1114, s1193, s1196, s1447–s1450, s1471–s1474, s2042, s2225, s2444, s2639, s2640, s2752, s2799, s4154, s4251, s4654, s4915, s5023, s5542, s5795, s5814, s5926, s5958, s5990, s6067, s6080, s6175, s6178, s6214, s6274, s6280, s6439, s6530, s6612, s6705, s6796, s6807, s6828, s7313, s7538, s8202, s8420.
- **glassdoor.csv:** 1, 2, 3, 5, 6, 7, 10, 33, 43, 44, 52, 70, 113, 114, 119, 155, 159, 169, 190, 194, 231, 259, 262, 283, 304, 305, 306, 307, 352, 358, 366 (the file's `index` column = data row − 1).

The audit's Lab file (`messy_cancer_lab_dataset.csv`) is deliberately not included: its
licence is unknown.

## messy/messy.golden.json

Per-file row count, header names and, for every column with at least one valid number,
count/sum/mean/min/max/sample std under the app's one numeric rule, computed independently
with pandas by `scripts/golden/generate_messy_golden.py` (the rule is restated at the top
of that script). Same policy as the HR file: committed, never hand-edited. Regenerate with:

```sh
pip install -r scripts/golden/requirements.txt
npm run golden:regen-messy
```
