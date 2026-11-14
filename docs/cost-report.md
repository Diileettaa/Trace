# Inference Cost and Latency Report

- **Target URL**: `https://trace-115937963309.europe-north1.run.app/api`
- **Evaluated At**: `2026-11-14 19:26:08 UTC`
- **Sampling**: `20` questions sampled per source (Random Seed = `1`)
- **Total Questions Evaluated**: `57`

## Overall Summary

| Questions | Accuracy | Zero-LLM Ratio | Avg Tokens | Avg Latency | Median Latency | Cost / 1k Queries |
| ---: | :---: | :---: | ---: | ---: | ---: | ---: |
| 57 | **82.5%** | **98.2%** | 80.0 | 7771.6 ms | 5689.0 ms | **$0.0787** |

## Breakdown by Dataset Source

| Source | Questions | Accuracy | Zero-LLM Ratio | Avg Tokens | Avg Latency | Median Latency | Cost / 1k Queries |
| --- | ---: | :---: | :---: | ---: | ---: | ---: | ---: |
| `cubicasa5k` | 17 | 47.1% | 94.1% | 268.2 | 13161.4 ms | 18232.5 ms | $0.2640 |
| `ifc_models` | 20 | 100.0% | 100.0% | 0.0 | 4359.9 ms | 4671.8 ms | $0.0000 |
| `swiss_dwellings` | 20 | 95.0% | 100.0% | 0.0 | 6601.9 ms | 4825.9 ms | $0.0000 |

## Breakdown by Method (summary.source)

| Engine / Method | Questions | Accuracy | Avg Tokens | Avg Latency | Cost / 1k Queries |
| --- | ---: | :---: | ---: | ---: | ---: |
| `detector` | 6 | 83.3% | 0.0 | 7389.7 ms | $0.0000 |
| `error` | 9 | 0.0% | 0.0 | 20114.6 ms | $0.0000 |
| `geometry` | 39 | 100.0% | 0.0 | 5107.3 ms | $0.0000 |
| `prior` | 2 | 100.0% | 0.0 | 97.2 ms | $0.0000 |
| `vision` | 1 | 100.0% | 4560.0 | 18232.5 ms | $4.4880 |

## Top 5 Slowest Queries

| # | Latency | Source | Method | Status | Question | Path |
| ---: | ---: | --- | --- | :---: | --- | --- |
| 1 | 20444.6 ms | `cubicasa5k` | `error` | ✗ | Kuinka monta ovea pohjapiirustuksessa on? Laske oviaukot, joissa on ovi; pelkkiä oviaukkoja ilman ovilehteä ei lasketa. | `data/cubicasa5k/high_quality-1097.png` |
| 2 | 20126.9 ms | `cubicasa5k` | `error` | ✗ | Kuinka monta makuuhuonetta (MH) pohjapiirustuksessa on? | `data/cubicasa5k/high_quality-12239.png` |
| 3 | 20098.0 ms | `cubicasa5k` | `error` | ✗ | How many saunas are on this floor plan? | `data/cubicasa5k/high_quality-12761.png` |
| 4 | 20096.0 ms | `cubicasa5k` | `error` | ✗ | Kuinka monta WC-istuinta pohjapiirustukseen on piirretty? | `data/cubicasa5k/colorful-7513.png` |
| 5 | 20088.7 ms | `cubicasa5k` | `error` | ✗ | Kuinka monta WC-istuinta pohjapiirustukseen on piirretty? | `data/cubicasa5k/colorful-11400.png` |

## Failed Queries (Showing up to 10, total 10)

| # | Source | Method | Expected | Actual | Question | Path |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `swiss_dwellings` | `error` | `420.05` | `None` | Qual è la superficie netta totale in m² di tutti i locali interni numerati di questo piano (esclusi balconi, logge, terrazze e altri spazi esterni, cavedi e vuoti)? | `data/swiss_dwellings/site644_bldg1390_floor6077.pdf` |
| 2 | `cubicasa5k` | `error` | `2` | `None` | Kuinka monta WC-istuinta pohjapiirustukseen on piirretty? | `data/cubicasa5k/colorful-11400.png` |
| 3 | `cubicasa5k` | `error` | `1` | `None` | How many bathrooms or washrooms (e.g. KH, KPH, PH, PESUH, SH) are on this floor plan, not counting separate WC rooms? | `data/cubicasa5k/high_quality-11384.png` |
| 4 | `cubicasa5k` | `error` | `8` | `None` | Kuinka monta ovea pohjapiirustuksessa on? Laske oviaukot, joissa on ovi; pelkkiä oviaukkoja ilman ovilehteä ei lasketa. | `data/cubicasa5k/high_quality-1097.png` |
| 5 | `cubicasa5k` | `error` | `0` | `None` | How many saunas are on this floor plan? | `data/cubicasa5k/high_quality-12761.png` |
| 6 | `cubicasa5k` | `error` | `3` | `None` | Kuinka monta makuuhuonetta (MH) pohjapiirustuksessa on? | `data/cubicasa5k/high_quality-12239.png` |
| 7 | `cubicasa5k` | `error` | `1` | `None` | Kuinka monta WC-istuinta pohjapiirustukseen on piirretty? | `data/cubicasa5k/colorful-7513.png` |
| 8 | `cubicasa5k` | `error` | `2` | `None` | Kuinka monta makuuhuonetta (MH) pohjapiirustuksessa on? | `data/cubicasa5k/high_quality-11459.png` |
| 9 | `cubicasa5k` | `error` | `2` | `None` | How many toilet bowls (WC seats) are drawn on this floor plan? | `data/cubicasa5k/high_quality-13029.png` |
| 10 | `cubicasa5k` | `detector` | `2` | `3` | How many sinks and wash basins (kitchen and bathroom combined; a double-bowl sink counts as one) are drawn on this floor plan? | `data/cubicasa5k/high_quality-108.png` |
