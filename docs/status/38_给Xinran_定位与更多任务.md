# 38 给 Xinran：图纸集已接入 + 一批新任务（定位优先）

## 一、你的东西我们接了什么（23:40）
- `engine.sheetset` 已接入（`bf1da48` `214b827` `16da999`）：
  - `GET /api/sheetset?project=` 返回按专业 → 楼层分好组的全部图纸；`GET /api/sheetset/pick?project=&q=&current=` 返回 `pick()` 的结果
  - 工作台楼层菜单变成「Sheet Set · N drawings by discipline」；超过 3 张图的项目，提问前先 `pick`，回答卡下显示「Answer from sheet: A101 — why」
  - 新增 3 个纯 PDF 图纸集项目：CTR（26 张）、Sports Complex（24）、Vacation Rental（15），加上 1810 S Park（26）
  - `.dwg` 不列（网页显示不了）
- `/rv/*` 按路径、`/room/walls` 都已接
- 3D 交给 Codex 重做（36 号）：房间改成剖切盒 + 外部视角，楼层俯视，地上画尺寸线。**它需要你下面第 1、2 节的数据**

规则不变：只动你的文件（engine/、agent/docs_api.py、agent/docs_tools.py、tools/、eval/）；绝不猜，答不出就 `None` + `warnings`；method 前缀可加不可改。每做完一项推你的仓库，告诉 Diletta，我拉。

## 二、定位（最急，按顺序）

### 1. 构件到墙的真实距离（替换我们现在的外包盒 ≈ 估算）
```python
ifc.clearances(ifc_path, guid) -> {"guid", "room_guid",
  "sides": [{"dir": "front|back|left|right", "distance_m", "wall_guid", "wall_name", "from": [x,y,z], "to": [x,y,z]}],
  "exact": True/False, "method": "geometry:mesh-to-wall-face" , "warnings": []}
```
- 用构件真实网格到最近墙面（同一房间的边界墙）的最短水平距离，不用外包盒
- `from`/`to` 是两个端点（世界坐标，米），前端直接在地面画尺寸线
- 算不准就 `exact=False` + 原因；前端只有 `exact=True` 才去掉「≈」

### 2. 房间清单 + 轮廓（3D 房间列表、楼层俯视、点房间名飞过去都靠它）
```python
ifc.spaces(ifc_path) -> [{"guid", "name_raw", "long_name", "storey_guid", "storey_name", "elevation_m",
  "height_m", "area_m2", "polygon": [[x,y], ...], "label_point": [x,y,z], "bbox": [[x0,y0,z0],[x1,y1,z1]]}]
ifc.storeys(ifc_path) -> [{"guid", "name", "elevation_m", "height_m", "bbox": [[...],[...]], "space_count"}]
```
- 坐标和 web-ifc 加载后的世界坐标一致（Y 向上，单位米）——请在 Tallinn、FZK、Duplex、Hitos 上各对一个房间，写进 eval
- `label_point`：轮廓内的点（不是外包盒中心，L 形房间要落在房间里）

### 3. 构件属于哪个房间
```python
ifc.room_of(ifc_path, guids: list) -> {guid: {"space_guid", "space_name", "method": "rel-contained|point-in-polygon", "storey_name"}}
```
- 先用 IfcRelContainedInSpatialStructure / IfcRelSpaceBoundary，没有就用构件中心点在房间轮廓里
- 用途：回答卡写「4 toilets — 2 in WC 2.04, 1 in Bathroom 2.18…」，而不是「Whole sheet」

### 4. IFC 构件 → 2D 图纸上的位置（Tallinn、Molio、FZK 的图纸都是从模型出的）
- 对 `*_plan-*.pdf` 这类由模型导出的图，给每个答案 item 算 `png_bbox`（页面像素）和 `box_norm1000`
- 写一个对齐检查：随机 20 个门 / 马桶，标记框中心和图上符号中心的像素误差，结果写 `eval/plan_alignment.md`（平均误差、最大误差）
- 误差大的话给出原因（比例、原点、旋转），不要硬凑

### 5. 扫描图的框准不准（cubicasa / Stoa 样图）
- cubicasa 有标注：门、窗、马桶的框和真值算 IoU，写 `eval/scan_boxes_iou.md`（每类平均 IoU、漏检、多检）
- 框太松或者偏移的，看能不能收紧（比如 2x2 分块后的坐标还原）
- Stoa 4 张样图：每张截图标出你的框，人工看一眼哪类最差，写进同一个文件

### 6. 平面图房间名的位置（2D 图上点房间名用）
`plan_rooms(path, page)` 现在给面积；请每个房间再加 `polygon_norm1000` 和 `label_norm1000`（房间名文字在图上的位置），Swiss 和 Tallinn 两种图都要。

## 三、其他（定位之后做）

### 7. 多页 PDF 按页回答
`answer_sheet(path, question, page=None)`：`pick()` 给了页码（如 1810 S Park 第 8 页），但现在回答总是看第 1 页。加 `page`，items 的 `sources` 写对页码。我们这边 `/api/ask` 会多传一个 `page` 字段。

### 8. 图纸集分类自查
对 CTR、Sports Complex、Vacation Rental、1810 S Park 四套图跑 `scan()`，人工看分错的（专业 / 楼层 / 类型），列表写 `eval/sheetset_check.md`，能改规则的就改。挪威语、丹麦语的词（Rømningstrapp、etasje、værelse…）也加进识别。

### 9. 每个答案给一个可信度
答案里加 `confidence`（0–1）和 `confidence_reason`（如「exact from geometry」「vision model, 2 readings disagree」）。界面低于 0.7 的显示「Please verify」。

### 10. 问答测试的失败项
我正在跑全项目问答测试（15 个项目 × 5 类问题），结果会写进 `docs/status/qa_sweep.md`。引擎相关的失败项请你修，修完在表里标 done。

### 11. 提交用的数字和方法说明
04:00 前：
- 重跑 eval，更新 swiss / IFC / cubicasa / zero-API 四个数字
- 每个引擎（geometry / detector / prior / sheet / schedule / scan）用两三句英文写清楚「怎么算的、什么时候会说不知道」，写进 `eval/methods_for_submission.md`。Diletta 直接贴进提交表单

## 四、时间
1–3 越早越好（Codex 的 3D 在等），做完一项推一项。03:30 最终版 → 04:00 最后部署 → 05:00 冻结。
