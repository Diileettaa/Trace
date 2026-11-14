# 08 给 Gemini CLI：2D 房间点击接口 + 演示数据（11/14 15:30）

背景：建筑师要一个大家共享的 2D 平面区，点房间 → 弹出这个房间的 3D 预览 + 照片 + 状态（见 TASKS 或问 Diletta：I-1）。
前端（Codex）需要知道 2D 图上每个房间的轮廓，才能做点击。

只新建 agent/plan_rooms.py、scripts/seed_demo.py、tests/test_plan_rooms.py；agent/app.py 只加路由；更新 TASKS.md。
不碰 engine/（只读调用）、web/、agent/engine_adapter.py、agent/agent.py。不读 .env。不 push。

## 1. GET /plan/rooms?path=<drawing path>（P0）
返回这张 2D 图上所有房间，坐标用前端显示的那张图的像素坐标：
```
{"path": ..., "image_size": [w, h], "rooms": [
  {"space_id": "...", "name": "Küche", "number": "1.02", "area_m2": 12.3,
   "bbox_px": [x0, y0, x1, y1], "polygon_px": [[x, y], ...] 或 null,
   "status": "built|missing_wall|pending|null", "media_count": 3}]}
```
- swiss_dwellings（PDF/PNG）：用 engine/swiss.py 解析 DXF 的 rooms（有 bbox，可能有多边形）。米→像素的换算照抄 agent/engine_adapter.py 里 swiss 的 bbox_m 处理和 engine/swiss_view.py。
- ifc_models 的平面 PDF：同名 .svg 里有 data-guid，照 agent/ifc_plan.py 的 boxes_for 取 IfcSpace 的框；space_id = GUID。
- cubicasa5k 和用户上传的图：返回 {"rooms": [], "warnings": ["no room outlines for raster plans"]}，不要猜。
- status 来自 agent/collab.py（for_space），media_count 来自 agent/media.py（list_media）。
- 结果按 path 缓存在内存（lru_cache）。

## 2. scripts/seed_demo.py（P1）
给演示用的 IFC 模型和一张 swiss 图填演示数据，所有文字都以 "Demo: " 开头：
- 3 个房间的状态（built / missing_wall / pending）
- 每个房间 1–2 条留言（不同角色：architect / plumber / electrician）
- 2 个共享家具摆放（走 agent/scene.py）
- `--reset` 先清掉所有以 "Demo: " 开头的数据再写，可重复运行
- 不上传假照片

## 验收
- pytest 全部通过（Linux 和 Windows）；测试用 tests/fixtures 或临时文件，不依赖真实数据集
- 用真实数据集手测一次 /plan/rooms：一张 swiss PDF、一张 ifc_models 平面 PDF，把房间数打印出来写进 commit 信息
- commit 信息：`plan rooms endpoint + demo seed`
