# 06 给 Codex：推理面板对接后端新字段 + B2/B3/B5（11/14 15:00）

只改 web/。不读 .env。不 push。每完成一项单独 commit。

## 1. How I got this 对接后端新字段（P0，先做）
后端 commit ba4c21c 起，/ask 返回新增：
- `summary`：{source, source_label, method, interpreted, evidence_count, boxes, engine_ms, llm_s, total_s, engine_tokens, llm_tokens, cost_usd, badge, warnings}
- evidence 里 answer_from_engine 的结果有：`source`（geometry / detector / prior / vision / needs_vision）、`source_label`、`engine_ms`、`evidence_count`、`badge`
- trace 的 tool 步骤有：source、source_label、engine_ms、evidence_count、badge、tokens（engine 为 0）
- `badge`：{color: grey|green|yellow, text, other_count?}
  - grey「exact from geometry」/ green「2 independent methods agree」/ yellow「methods disagree - check boxes」+ 显示另一模型的数
- `usage.cost_usd`：后端算好的费用（价格与 pricing.ts 一致）

要改：
- HowIGotThis.tsx 第 13–17 行现在把所有 `engine:` 都当 Geometry，**错了**：YOLO 检测结果也是 engine:。改为优先用 `summary.source` / `evidence.source`，没有时才回退到现在的猜测。
  显示名：geometry→Geometry，detector→Detector (YOLO)，prior→Prior，vision→Vision LLM，needs_vision→不显示
- 顶部显示 badge（三种颜色）
- 显示 `engine_ms`（引擎耗时，毫秒）和 LLM 耗时分开
- 费用优先用 `usage.cost_usd`
- 有 `summary.interpreted` 时显示「Interpreted as: …」
- 黄色徽章时答案仍是引擎的值，不要换成另一个数

## 2. B2：自由提问为主（P0）
- 输入框放最显眼位置，预设题收进可折叠的「Examples」

## 3. B3：Community 改 Project 页（P1）
三个区：共享 3D 模型（房间可点）、沟通区（现有聊天）、文件区（接口由 Gemini CLI 做，见 docs/status/06_给GeminiCLI_文件区.md；先占位）

## 4. B5：点房间展开（P1）
点房间（如 A21）→ 侧栏显示该房间的备注 + 照片/视频 + 作者 + 时间。
接口（已完成，T-30）：
- GET /collab/media?space_id=A21 → 列表，新的在前，字段 {id, space_id, author, role, note, file, kind, created_at}
- GET /collab/media/file?id=<id> → 文件
- POST /collab/media?space_id=&author=&role=&note=&filename=  请求体为文件原始字节
