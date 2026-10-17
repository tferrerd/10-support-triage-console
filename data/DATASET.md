# Committed dataset

**Source dataset:** PolyAI BANKING77

**Selection:** Complete published train.csv and test.csv intent-classification tables, preserving text/category fields and split membership.

**Data license:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This applies to the data, independently of the project code.

## Sources

- https://github.com/PolyAI-LDN/task-specific-datasets/tree/master/banking_data
- https://huggingface.co/datasets/PolyAI/banking77

## CSV files

| File | Rows | Bytes |
|---|---:|---:|
| [banking77_train.csv](raw/banking77_train.csv) | 10,003 | 829,069 |
| [banking77_test.csv](raw/banking77_test.csv) | 3,080 | 236,880 |

Attribution: Iñigo Casanueva, Tadas Temčinas, Daniela Gerz, Matthew Henderson, Ivan Vulić / PolyAI, Efficient Intent Detection with Dual Sentence Encoders (2020). Uses the published banking-intent benchmark instead of the unavailable CFPB API snapshot. Categories provide direct routing/intent targets, not resolution outcomes. There are no timestamps; use the official test split rather than claiming chronological evaluation.

The CSV files contain published observations or their documented format conversion; no training records were invented. Source formats and raw CSV exports are distinguished by the manifest. File checksums and schemas are recorded in [csv-manifest.json](csv-manifest.json).
