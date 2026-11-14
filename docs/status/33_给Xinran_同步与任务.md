# 33 给 Xinran：22:30 同步 + 请你接的 4 件事

接 32 号。下面是 32 号之后的变化，以及请你直接做的事。每件都只动你自己的文件（engine/、agent/docs_api.py、agent/docs_tools.py、tools/、eval/），我们这边接入只需几行。

## 一、我们这 1.5 小时做了什么
1. **Ask 页 = Gigi 的工作台，用真实数据**（`web/src/gigi/RealWorkspace.tsx`、`RealPlan.tsx`、`Real3D.tsx`、`adapters.ts`，提交 `27d46d8` 起）
   - 三栏：History / 图纸 + 三张卡 + 证据框 / 对话。你的引擎结果直接画在图上：已核实黄、未核实红；构件编号如 `DR-2-3.1`、`WC-2.18.1`
   - 3D：真 IFC 模型 + 到墙距离卡（`/element/info`，现在用外包盒估算，标 ≈）
   - 每个回答下面有「How I got this」：method、来源、耗时、token、成本。你的 method 字符串原样显示给评委
2. **扫描图和 PDF 图纸全部交给你的引擎**（`f80cbc2`）：上传文件走 `engine.answer.answer_sheet()`；method 是 `sheet:` / `docqa:` / `scan:` 的答案直接用，不再经过我们的 Gemini。你的 `box_norm1000` 和 `box` 已转成图上的框
3. 你的 `2a89eca` 已合并（`c940eb6`），pytest 155/155
4. 修了：上传扫描图问面积时，我们的 agent 会白烧约 10 万 token。现在每题上限 3 万 token，超了就说明原因（`511ae8c`）
5. 界面全英文：爱沙尼亚语、德语、意大利语、法语房间名都翻成英文显示（`web/src/roomNames.ts`）
6. 删掉了 Gemini 加的「WC 房间数当马桶数」：那是猜数，违反你「绝不猜」的原则（`2efa45a`）
7. 线上 Gemini key 一直是接着的（Cloud Run 环境变量）；本地 `.env` 也有 key，之前是旧后端进程占着端口

## 二、请你做（按优先级）

### 1. 复核接口改成「按路径」（最急，Stoa 说界面可以交互）
现在 `/ask /review /calibrate /measure` 要先上传到资料库拿 doc id。工作台是按数据集路径或上传路径工作的。请在 `agent/docs_api.py` 里让这几个路由**也接受 `path`**（和 `id` 二选一）：
```
POST /ask       {"path": "data/... 或 uploads/...", "question": "..."}   → 同现在（answer_id、items、alternatives、interactive）
POST /calibrate {"path": ..., "p1", "p2", "length_m", "image_size", "page"}
POST /measure   {"path": ..., "points", "kind", "page"}
```
`path` 用 `os.path.join(JUNCTION_DATA, path)` 解析；`uploads/` 开头的在 `CACHE_DIR/uploads/`（看 `agent/uploads.py`）。挂载在我们的 `/api/docs/*` 下，前端直接调 `/api/docs/ask`。**做完这个，Gemini 31 号第 6 项就取消，避免两边重复做。**

### 2. 用 Stoa 的 4 张样图自测（你有 key，本地就能跑）
样图在 Diletta 电脑 `data/stoa_samples/`（她会发你；不进 git，不拿来训练）：
- 英国学校 L00（1:200，有比例尺，房间只有名字没有面积）
- 美国 aw_078 两张
- 宿舍 daf_dorm

每张问 5 类题：门、窗、某个房间的面积、某个房间的踢脚线、楼板/管道（有的话）。我们线上旧路线的结果：门 3（错）、窗 27、厕所 13，面积和踢脚线失败。请用你的引擎跑一遍，把结果表写进 `eval/stoa_samples_result.md`。**扫描图面积题如果答不了，请返回明确的 `warnings`**（如「no room areas printed; calibrate the scale and measure」），前端会据此显示「Set scale」按钮

### 3. 房间墙尺寸（Gigi 3D 房间视图要显示）
`engine/ifc.py` 加一个函数：
```python
room_walls(ifc_path, space_guid) -> {"walls": [{"guid","name","length_m","thickness_m","height_m","side"}], "room": {"L","B","H"}, "method": "...", "warnings": []}
```
- 用 IfcRelSpaceBoundary 找边界墙；没有就用房间轮廓边附近的 IfcWall
- 算不出就返回空列表 + 原因，不估
- 我们包一个 `/room/walls` 路由，几行代码。**Gemini 31 号第 8 项取消。**

### 4. 图纸集整理 + 按题选图（32 号 A、B，不变）
`engine/sheetset.py`：一个目录 → 项目 / 楼 / 专业 / 楼层 / 图。再加 `pick(question, sheetset)`：题里没写是哪张图时，自动选。我们把它接成项目下拉里的文件夹树，再在回答卡上显示「Answered from: M-101A · change」。

## 三、接口约定（不变）
- method 前缀加新的没问题，改旧的先告诉我们
- items 里保留 `box`（PDF 点）、`box_norm1000`、`png_bbox`、`guid`、`category`、`name`
- 绝不猜：答不出就 `value=None` + `warnings` 写原因，界面照实显示

## 四、时间
03:30 你的最终版 → 我们合并、跑测试、更新所有对外数字 → 04:00 最后部署 → 05:00 冻结。
1、3 做完就推你的仓库，告诉 Diletta，我当场拉。
