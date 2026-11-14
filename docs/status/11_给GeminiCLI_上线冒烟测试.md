# 11 给 Gemini CLI：上线冒烟测试脚本（11/14 16:35）

只新建 scripts/smoke.py 和 tests/test_smoke.py；更新 TASKS.md。不碰其他文件。不读 .env。不 push。

## 要做
`python scripts/smoke.py --base https://xxx.run.app/api`（本地：`--base http://localhost:8000`）
只用标准库（urllib），按顺序跑，每步打印 ✓/✗ + 耗时（毫秒），最后打印汇总表，有 ✗ 时退出码 1：

1. GET /health：ok 为 true，data_found 为 true
2. POST /ask 三道题（role 留空）：
   - swiss：从 GET /questions?source=swiss_dwellings&limit=50 里挑第一道计数题
   - ifc_models：同上
   - cubicasa5k：同上
   检查：answer_text 非空；summary.source 存在；把题库给的标准答案和 evidence 里 answer_from_engine 的 value 对比，打印是否一致
   打印 summary 里的 source、engine_ms、llm_tokens、cost_usd
3. GET /plan/rooms?path=<上面 swiss 题的 path>：rooms 数量 > 0
4. 共享场景：POST /scene/placement 放一个 Demo 物品 → GET /scene 能看到 → DELETE 删掉
5. 资料库：POST /docs 上传一个内存里生成的小 PDF（文件名 smoke_test_revA.pdf）→ GET /docs?q=smoke 能搜到
6. GET / （去掉 base 末尾的 /api）返回 HTML（部署版才有，本地 8000 跳过）

`--skip-llm`：跳过第 2 步（不花 token）。

## 测试
tests/test_smoke.py 用 FastAPI TestClient 起 agent.app，把 smoke 的 HTTP 调用指向它（可以把请求函数做成可注入），跑 `--skip-llm` 那几步，全部通过。

## 验收
- pytest 全部通过
- commit 信息：`smoke test script for deployed app`
