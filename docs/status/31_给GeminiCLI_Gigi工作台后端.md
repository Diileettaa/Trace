# 31 给 Gemini CLI：Gigi 工作台需要的后端（11/14 21:15）

配合 Codex 30 号。只改 agent/、tests/、scripts/seed_demo.py、README 接口表。不改 engine/、web/。不读 .env。不 push。每项单独 commit，先跑 pytest。

## 1. 构件状态（不带照片也能改）
- `POST /verify/item` body `{path, item_id, space_id?, status: "Installed"|"In Progress"|"Issue Reported", note?, author}` → 存到 collab 状态（JSON 文件，和照片同处）
- `POST /collab/media` 加可选 query `status`，上传照片时一并写状态
- `GET /verify/status` 每个 id 返回：`{verified, status, note, author, ts, photos, latest:{url,ts,author}}`；`verified` = 有照片或 status 被人设过；无记录时 status="In Progress", verified=false

## 2. 构件信息 `GET /element/info?path=&id=`
- IFC（id=GlobalId）：`{type, name, manufacturer, model, storey, space, bbox_m:{L,B,H}, clearances:{left_wall, right_wall, front, rear, height_aff}}`
  - manufacturer/model：Pset_ManufacturerTypeInformation（Manufacturer、ModelReference/ModelLabel），没有就 IfcTypeObject.Name / ObjectType
  - clearances：构件包围盒到所在 IfcSpace 包围盒四边的距离（mm，取整），height_aff = 构件底到楼层标高。用 room_contents 的缓存索引，不要每次重算几何（用子进程那套）
- swiss DXF（id 形如 `<path>#wc-1`）：类别、房间、bbox_m、到房间多边形四边距离
- 扫描图：只返回 type、bbox（像素）、其余 null
- 测试：clinic IFC 一个马桶、swiss 一个 WC 各一条

## 3. /ask 补字段（只在 agent/engine_adapter.py 输出层加，不动 engine）
- `summary.room`：items 里最多的 space_id、room_name，以及从 /plan/rooms 取的 area_m2、dims_m（能取到就填）
- 每个 item 加 `source_index`：它在 sources 里的框下标（方便前端对应框）

## 4. Demo 数据（SEED_DEMO=1）
- 把 design/gigi/src/assets/images 里 3 张马桶照片 + 2 张风管照片复制到 demo 媒体目录
- Tallinn（esplanades 平面 PDF）问「How many toilets」得到的前 3 个马桶 id：第 1 个 Installed + wc_installed_standard 照片（M. Lindqvist）；第 2 个无照片 In Progress；第 3 个 Issue Reported + wc_installed_accessible 照片 + note「transfer zone 865 mm, 35 mm short of 900 mm (DIN 18040)」（K. Korhonen）
- swiss site1000 的 WC 同样配 2 张
- 标 Demo（author 后加「· Demo」）

## 5. 验收
- pytest 全过；对本地跑：Tallinn 马桶题 → /verify/status 返回 1 Installed / 1 In Progress / 1 Issue；/element/info 返回 clearances
- 完成告诉 Diletta

## 6. 交互复核接到我们的 /ask（Xinran 的 engine/review.py；说明见 Xinran 的「07 frontend interactive review」）
Xinran 的路由（/api/docs/ask 等）要先把文件上传到资料库拿 doc id。我们的工作台按 path 工作，所以在 agent/app.py 加同功能、按 path 的路由（直接调 engine.review，不改 engine）：
- `/ask`：engine 原始结果出来后（转换前）调用 `review.register(r, <实际文件路径>, question)`，把返回的 `answer_id`、`alternatives`、`interactive` 放进 /ask 响应顶层；每个 item 加 `review_id`（= register 后 items 里的 id，顺序与我们 items 一致，写测试保证）
- `POST /review` body 同 Xinran：`{answer_id, remove, add, choose, user}` → 返回 review.review() 结果，并带上我们的 `answer_text`（如「Model 41 → reviewed by X: 44」）
- `GET /answer?id=`
- `POST /calibrate {path, p1, p2, length_m, image_size, page}`、`POST /measure {path, points, kind, page}`：path 用 drawings.resolve 转实际文件
- 坐标：矢量 PDF 用 `box`（PDF 点），扫描/图片用 `box_norm1000`；/ask 的 items 里两种都原样透传，方便前端画
- 方法名以 `:uncertain` 结尾时，回答 `warnings` 里加一条「Two readings disagree — please review」
- 测试：swiss 一题、扫描图（mock vision）一题，review remove 1 个 → value 减 1

## 7.（第 1–6 做完后）到墙距离改成按房间真实轮廓算
现在 clearances 用构件外包盒到房间外包盒，L 形房间、斜墙会偏几十厘米。改：
- 房间轮廓用 IfcSpace 的平面多边形（room_contents 索引里没有就从 plan SVG 的 polygon_px 换算），swiss 用 DXF 房间多边形
- 构件取平面外包矩形的四条边中点，沿 ±x、±y 方向射线求到房间多边形边的最近交点距离 → left/right/front/rear（front = 构件朝向一侧；不知道朝向时按离门最近的一侧）
- 返回 `method: "polygon"`；退回外包盒时 `method: "bbox"`，前端据此显示 ≈
- 测试：L 形房间一例
