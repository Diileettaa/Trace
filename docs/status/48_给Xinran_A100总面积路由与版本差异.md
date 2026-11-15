# A-100 总房间面积：请复现并对齐版本

## 用户报告

你电脑上的版本能够处理这张图；当前 Trace 本地工作台和已部署站点却把问题标为 `SITE PLAN`，不给出房间总面积。请先对齐同一文件、同一接口和同一提交，再判断是否应该计算。

## 可复现输入

- 项目：`set-Sports_Complex`
- 当前图纸：
  `data/opening_design/Sports_Complex/Transfer/_Archive/20150922 - site dimensions/20150922 - XSC - A-100.A - SITE PLAN.pdf`
- 页面：1
- 问题：`What is the total area of all rooms?`
- 网页表现：低置信度，`engine:sheet:none:site_plan`，`0 tokens`，提示改问楼层平面。

## 已核实的事实

1. 这不是低清扫描：PDF 是一页矢量图，`3024 x 2160` PDF points；网页按 150 dpi 显示约 `6300 x 4500 px`。
2. 当前解析器能读到约 `670` 条矢量文字/线条、比例 `3/64\" = 1'-0\"`、标题 `Site Plan`，也读到项目说明 `BUILDING FOOTPRINT = 50,400 SF`。
3. 当前房间追踪误报了 6 个“房间”，但它们是 title block / revision / project-data 文本，不是室内空间。因此不能把 `50,400 SF` 当作房间总面积。
4. 当前 `site_plan` 告警来自标题和问题关键词的宽松匹配；它不能区分“只有总平面”与“总平面中嵌有可用的室内平面/放大图”。

## 对照：同项目正确证据页

同一句问题在下列图纸可得到可复核结果：

- `data/opening_design/Sports_Complex/Sheets - Current Set/A-801 - Door and Finish Schedules & Wall Types.pdf`
- 返回：`49560`（房间完成面/面积表求和）
- 方法：`engine:sheet:schedule+docqa:sum`
- 证据：27 个表格行

这说明前端应先把“总房间面积”路由到 A-801；这部分由 Codex 的前端修复处理。它不能替代 A-100 本身的识别差异调查。

## 请 Xinran 返回的材料

请勿发送 API key。只需给以下输出或提交号：

1. 你电脑上对上面**同一路径、同一问题**的原始 JSON（至少 `value`、`method`、`warnings`、`sources/items`）。
2. 对应 Git commit hash，以及是否有未 push 的 `engine/` 或 `agent/` 改动。
3. 实际走的是哪一个接口：`/ask`、`/api/ask`、`/rv/ask` 或直接 `engine.answer()`；是否命中缓存。
4. 是否调用 Gemini/视觉模型；若调用，输入是整页、裁剪图还是 tile，最长边分辨率是多少。
5. 若你确实得到“所有房间总面积”，请给每个被计入房间的名称/边界或面积表行，确认它不是 `BUILDING FOOTPRINT`。

## 建议的引擎验收标准（Xinran 负责）

`SITE PLAN` 只能是路由提示，不能单独决定拒答。对于“房间总面积”：

1. 有房间面积表：按被引用的表格行求和，返回每行证据。
2. 有室内平面：至少两个有效房间标签位于主建筑轮廓内，且标签不是 title block、修订栏或项目说明；有可靠比例/尺寸/已标面积后才计算。
3. 只有建筑外轮廓或 `Building Footprint`：可以回答占地面积，但必须明确它不是房间面积。
4. 不足证据：返回 `value: null` 和可操作的推荐图纸，而不是猜数字。

## 相邻词/图纸类型的回归项

同一规则不能只检查 `rooms`。请覆盖：

- 标题/类型：`SITE PLAN`、`SITE LAYOUT`、`MASTER PLAN`、`LANDSCAPE`。
- 房间相关问法：`room(s)`、`space(s)`、`area`、`floor area`、`unit`、`suite`、`apartment`、`bedroom`、`kitchen`、`corridor`。
- 构件相关问法：`door(s)`、`window(s)`、`toilet/WC`、`sink`、`shower`。
- 例外：总平面中存在放大平面、建筑轮廓面积、停车位/道路/退界/场地尺寸时，应按实际可见证据答，不应一律拒绝。
