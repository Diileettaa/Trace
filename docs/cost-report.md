# Inference Cost and Latency Report

- **Target URL**: `https://trace-115937963309.europe-north1.run.app/api`
- **Evaluated At**: `2026-11-14 15:55:39 UTC`
- **Sampling**: `10` questions sampled per source (Random Seed = `1`)
- **Total Questions Evaluated**: `30`

## Overall Summary

| Questions | Accuracy | Zero-LLM Ratio | Avg Tokens | Avg Latency | Median Latency | Cost / 1k Queries |
| ---: | :---: | :---: | ---: | ---: | ---: | ---: |
| 30 | **100.0%** | **90.0%** | 418.9 | 3560.9 ms | 209.3 ms | **$0.3979** |

## Breakdown by Dataset Source

| Source | Questions | Accuracy | Zero-LLM Ratio | Avg Tokens | Avg Latency | Median Latency | Cost / 1k Queries |
| --- | ---: | :---: | :---: | ---: | ---: | ---: | ---: |
| `cubicasa5k` | 10 | 100.0% | 70.0% | 1256.8 | 10136.0 ms | 7865.4 ms | $1.1937 |
| `ifc_models` | 10 | 100.0% | 100.0% | 0.0 | 335.7 ms | 76.5 ms | $0.0000 |
| `swiss_dwellings` | 10 | 100.0% | 100.0% | 0.0 | 211.1 ms | 209.3 ms | $0.0000 |

## Breakdown by Method (summary.source)

| Engine / Method | Questions | Accuracy | Avg Tokens | Avg Latency | Cost / 1k Queries |
| --- | ---: | :---: | ---: | ---: | ---: |
| `detector` | 6 | 100.0% | 0.0 | 5372.4 ms | $0.0000 |
| `geometry` | 20 | 100.0% | 0.0 | 273.4 ms | $0.0000 |
| `prior` | 1 | 100.0% | 0.0 | 82.2 ms | $0.0000 |
| `vision` | 3 | 100.0% | 4189.3 | 23014.4 ms | $3.9790 |

## Top 5 Slowest Queries

| # | Latency | Source | Method | Status | Question | Path |
| ---: | ---: | --- | --- | :---: | --- | --- |
| 1 | 29608.8 ms | `cubicasa5k` | `vision` | ✓ | Kuinka monta erillistä WC-tilaa pohjapiirustuksessa on? | `data/cubicasa5k/high_quality-11377.png` |
| 2 | 24172.9 ms | `cubicasa5k` | `vision` | ✓ | How many bathrooms or washrooms (e.g. KH, KPH, PH, PESUH, SH) are on this floor plan, not counting separate WC rooms? | `data/cubicasa5k/high_quality-1212.png` |
| 3 | 15261.5 ms | `cubicasa5k` | `vision` | ✓ | How many balconies (parveke, including glazed balconies) are on this floor plan? | `data/cubicasa5k/high_quality-11459.png` |
| 4 | 7973.6 ms | `cubicasa5k` | `detector` | ✓ | Kuinka monta suihkua ja kylpyammetta pohjapiirustukseen on piirretty yhteensä? | `data/cubicasa5k/high_quality-12126.png` |
| 5 | 7905.8 ms | `cubicasa5k` | `detector` | ✓ | Kuinka monta ikkunaa pohjapiirustuksessa on? | `data/cubicasa5k/colorful-11397.png` |

## Failed Queries (Showing up to 10, total 0)

| # | Source | Method | Expected | Actual | Question | Path |
| ---: | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | *(None - all queries matched)* | - |
