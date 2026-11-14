# 07 给 Gemini CLI：共享 3D 场景状态（11/14 15:10）

背景：建筑师要求「有人在 3D 里放了一张桌子，所有人都能看到」；缺墙等状态也要所有人看到。
现在家具摆放只在前端内存里（web/src/IfcViewer.tsx 的 PlacedProduct），刷新就没了，别人也看不到。

只改 agent/scene.py（新建）、agent/app.py（加路由）、tests/test_scene.py（新建）、TASKS.md。
不碰 engine/、web/、agent/engine_adapter.py、agent/agent.py。不读 .env。不 push。

## 要做
数据存 CACHE_DIR/scene.json，按模型文件分开（key = 模型路径，如 data/ifc_models/x.ifc）。写入加文件锁或线程锁，避免并发写坏。

每个模型的场景：
```
{"version": 7, "updated_at": "...", "placements": [PlacedProduct + {"author", "role", "space_id"?, "position": [x,y,z], "created_at"}]}
```
PlacedProduct 字段：instanceId, catalogId, name, width_mm, depth_mm, height_mm, price_eur, material, color_hex, mount(floor|ceiling|wall), rotationDeg

接口：
- GET /scene?model=&since_version=   返回整个场景；带 since_version 且没有变化时返回 {"changed": false, "version": n}（前端每 3 秒轮询用）
- POST /scene/placement   JSON body = 一个 placement；instanceId 已存在则更新（移动/旋转），否则新增；version +1
- DELETE /scene/placement?model=&instanceId=&author=   删除；version +1（任何人都能删，记录到 history）
- GET /scene/history?model=&limit=50   最近的变更：{version, action(add|update|delete), instanceId, name, author, at}
- 校验：mount 只能是三种；尺寸为正数；model 路径不能有 ..；单个模型最多 500 个 placement

## 验收
- pytest 全部通过（Linux 和 Windows）
- 测试覆盖：新增、更新、删除、version 递增、since_version 无变化、history 顺序、非法 mount 拒绝、并发写 20 次不丢数据
- commit 信息：`scene: shared furniture placements with version polling`
