# 32 给 Xinran：现状交接 + 请你接的部分（11/14 22:00）

Diletta 转交。我是 Claude（指挥 + 后端）。下面是 B 侧（网站/后端）现在的全部情况，以及希望你接的部分。

## 0. 一句话
你的引擎已合并到 11/14 21:15 的 `2a89eca`（矢量图纸、扫描图分块识别、复核 API、round-2 检测器、swiss 99.88%）。现在**所有问答数字都来自你的引擎**，我们只做包装和界面。网站正在把 Ask 页整页换成 Gigi 设计的工作台。最缺的是「一个项目多张图」的流程，这正好是你想做的「流程」。

## 1. 已完成（线上 https://trace-115937963309.europe-north1.run.app）
- 引擎合并：`52678eb`（6120cd9 及之前）、`c940eb6`（2a89eca）。pytest 155/155
- 路由：来源是 geometry/detector/prior 的题直接用引擎结果（0 token，约 1 s）
- **新（f80cbc2，22:00 部署后生效）**：上传的扫描图和 PDF → `engine.answer.answer_sheet()`（你的 sheet/docqa/scanqa）。method 分三类来源：
  - `sheet`：sheet:count_* / rooms / expr / lookup
  - `schedule`：docqa:*
  - `scan`：scan:* / sheet:scanned / sheet:vision
  
  这三类都直接给答案，不再让我们的 Gemini 二次猜。`box_norm1000` 和 `box`（PDF 点）都已转成图上的框。之前：Stoa 学校图问门数，我们自己的整图视觉答 3，73 s
- 依赖已加 pdfplumber、pypdfium2、Pillow（`d5e3da3`）
- IFC 房间索引改到子进程计算 + 启动预热（以前一道 IFC 浴室题能把整个服务卡死几分钟）
- Nemotron 第二意见最多等 4 s，不再拖慢答案
- 项目卡片自动生成、上传文件成为项目、数据集体检脚本（Gemini 27 号）
- 3D：Whole Building / Interior、触控板缩放、Walk、深度精度（Codex 26 号）

## 2. 正在做
| 谁 | 任务 | 说明 |
|---|---|---|
| Codex | 30 号：Ask 页 = Gigi 工作台（Tailwind 原样搬） | 三栏：History / 图纸 + 三张卡 + 证据框 / 聊天。真实数据经 `web/src/gigi/adapters.ts` |
| Gemini CLI | 31 号：工作台后端 | `/verify/item`、`/element/info`（已交）、/ask 补房间字段、Demo 照片、**按 path 的复核接口**（包装你的 engine/review.py：`/review` `/answer` `/calibrate` `/measure`，不改 engine）、按房间多边形算到墙距离 |
| Claude | 测 Stoa 样图、修后端、协调 | |

## 3. 已知缺口（按严重程度）
1. **一个项目多张图**：Stoa 说一栋楼可能有 8 张平面，题里不一定写是哪张。我们现在是「一题对一个文件」。没有图纸分组，没有「先判断问的是哪张图」
2. **数据集没按专业分**：项目浏览器按文件/楼栋分，没有分建筑、结构、给排水、暖通、电气。完整数据集约 10 GB，正常人找不到图。你的 docs_store 有 discipline 字段，但只用在上传的资料上
3. Stoa 的 5 类难题在扫描图上的实测：22:00 部署后我会跑，结果发你
4. 3D：Diletta 的大屏（150% 缩放）上会抖，Codex 在修
5. Swiss 的 3D 用你的 DXF 房间轮廓挤出，所以轮廓错 3D 就错

## 4. 请你接（按优先级，都在 engine/ 或新文件里，不碰 agent/app.py 和 web/）
### A. 图纸集整理（最想请你做，就是「流程」的入口）
`engine/sheetset.py`：输入一个目录或一组文件 → 输出
```json
{"projects":[{"id","title","buildings":[{"id","title","sheets":[
  {"path","kind":"plan|section|elevation|detail|schedule|model|photo|doc",
   "discipline":"architecture|structural|plumbing|hvac|electrical|fire|landscape|other",
   "level":"00|01|…|null","title","scale","sheet_no","confidence","reasons":[]}]}]}]}
```
- 依据：文件名（如 `M-101A`、`-D-X-0201`、`level_00`）、图签文字（你的 sheet.py 已能抽文字和比例）、IFC 的 IfcBuildingStorey 和专业（文件名 ARC/MEP/STR）
- 只用规则和你已有的抽取，不调模型（10 GB 上万文件）；结果缓存
- 我们这边：Gemini 把它接成 `GET /catalog/tree`，Codex 在项目选择里显示成「项目 → 楼 → 专业 → 楼层 → 图」文件夹

### B. 按题选图（「流程」的核心）
`engine.sheetset.pick(question, sheetset, current=None) -> [{"path","why","score"}]`：题里没写图时，按专业和楼层关键词（toilet→plumbing/architecture，damper→hvac，"ground floor"→level 00）选最可能的 1–3 张。工作台会显示「Answered from: M-101A (plumbing, level 00) · change」，用户可改选。这正好回应 Stoa 那句「按最好的用户体验做，界面可以交互」

### C. Stoa 样图失败项
22:00 部署后我把 4 张样图（学校 L00、aw_078 两张、daf_dorm）× 5 类题的结果发你。样图不进 git，在 Diletta 电脑 `data/stoa_samples/`，她可以转你。**不要拿样图训练或调参到背答案**，用你的合成扫描集验证

### D.（有空再做）`engine/review.py` 的 corrections.jsonl
记录我们这边谁改了什么，做「用户纠错 → 准确率提升」的故事

## 5. 请保持不变的接口（我们的工作台依赖这些）
- `answer()` 返回的 `value/unit/items/sources/method/warnings/evidence`
- `items[]` 里的 `box`（PDF 点）、`box_norm1000`、`png_bbox`、`pdf_bbox_pt`、`guid`、`category`、`name`、`number`
- method 前缀：`swiss_dxf:` `ifc:` `cubicasa:detector[` `cubicasa:rooms[` `cubicasa:prior:` `cubicasa:vlm[` `sheet:` `docqa:` `scan:`，以及后缀 `:uncertain`、`+reviewed`。**加新前缀没问题，改旧前缀先告诉我们**（`agent/engine_adapter.route()` 按前缀分来源）
- `engine/review.py` 的 `register / review / calibrate / measure / get` 签名

## 6. 共享的东西
- 仓库：`TRACE-Montree/Trace`，分支 `claude/night`（Diletta 推送后可见），你的仓库照常推，我们会拉
- 本文件、`docs/status/30_*.md`（工作台）、`31_*.md`（后端）、`docs/stoa-discord-notes.md`（Stoa 说明摘要）
- `web/src/gigi/adapters.ts`：你的输出怎么变成界面上的卡片和框
- `design/gigi/`：Gigi 的工作台源码（只读参考）

## 7. 时间线（赫尔辛基）
- 22:00 部署 → 测 Stoa 样图 → 结果发你
- **03:30 你的模型和引擎最终版**（之后我们拉一次、跑测试和评测、更新所有对外数字）
- 04:00 最后部署，05:00 冻结，09:00 前提交
- 对外数字以你最新的为准：swiss 99.88%、IFC 99.09%、cubicasa 85.02%（零 API 80.84%）、表格题 95.8%、历史扫描 45/45

## 8. 合并方式（不用你操作）
我们用 `git fetch origin main` 然后 `git checkout FETCH_HEAD -- engine models …` 拉你的目录，跑 pytest 后提交。你不需要合我们的分支。
