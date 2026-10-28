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
