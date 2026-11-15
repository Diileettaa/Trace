# W4: CubiCasa5K official model vs our detector (40 plans, official val/test plans)

| class | model | answer correct | recall | precision |
|---|---|---|---|---|
| toilet | ours | 36/40 | 97% | 97% |
| toilet | cubicasa5k | 29/40 | 79% | 94% |
| sink | ours | 29/40 | 88% | 96% |
| sink | cubicasa5k | 22/40 | 74% | 92% |
| door | ours | 22/29 | 94% | 98% |
| door | cubicasa5k | 14/29 | 1% | 1% |
| window | ours | 20/40 | 88% | 91% |
| window | cubicasa5k | 11/40 | 79% | 79% |

Decision: our fused CubiCasa detector stays the fixture source on raster plans; it wins every class on these 40 plans.
The official model's door boxes do not match the annotation's door boxes (1 % recall), so its door counts are not used.
Its icons (toilet / sink / bathtub) are used only as a fallback where our detector is not installed, and its room
classes name the rooms we trace on residential plans. On the Stoa school / dorm sheets (commercial, not Finnish
residential) it finds almost nothing (6 / 0 rooms): there the rule-based tracing (engine/scan_plan.py) is used.
