# 16 给 Gemini CLI：成本和速度报表（11/14 17:30）

评分里「推理成本低」占 25%，表单和 PPT 要用实测数字。只新建 scripts/cost_report.py、tests/test_cost_report.py；更新 TASKS.md。不读 .env。不 push。

## 要做
`python scripts/cost_report.py --base <API 地址> --per-source 20 --seed 1`
- 只用标准库。从 GET /questions?source=X&limit=500 里，每个来源（swiss_dwellings、ifc_models、cubicasa5k）按 seed 随机抽 N 道题
- 每道题 POST /ask?fresh=true（不用缓存），记录：来源、是否答对（和题库答案比；面积题误差 2% 内算对；用 evidence 里 answer_from_engine 的 value，没有就从 answer_text 里取第一个数）、`llm_used`、token（usage.input+output+thinking）、cost_usd、耗时、summary.source
- 输出 docs/cost-report.md：
  - 总表：题数、正确率、不调 LLM 的比例、平均 token、平均和中位耗时、每 1000 题的成本（美元）
  - 按来源分的同样一张表
  - 按 summary.source（geometry / detector / prior / vision）分的一张表
  - 最慢的 5 题、答错的题（最多 10 道）
  - 顶部写明：测的是哪个网址、什么时间、抽了多少题
- `--dry-run`：不发请求，只打印会问哪些题

## 测试
tests/test_cost_report.py：用 FastAPI TestClient + 打桩的 agent.ask（不调真实模型），检查报表的统计计算正确

## 验收
- pytest 全部通过
- commit 信息：`cost and latency report script`
- 先别对线上跑，等 Claude 说可以再跑
