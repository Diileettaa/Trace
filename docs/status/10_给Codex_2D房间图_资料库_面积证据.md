# 10 给 Codex：共享 2D 平面 + 点房间 3D 预览、资料库页、面积证据（11/14 16:35）

只改 web/。不读 .env。不 push。每项单独 commit。

## 1. 面积证据（P0，评分「推理可视化」）
后端 /ask 的 evidence 里，面积/长度/体积题现在带 `evidence`（answer_from_engine 那一项）：
```
{"formula": "17.29 (1.02 Zimmer) + 4.93 (1.03 Bad) + … = 118.32 m²", "rule": "...",
 "breakdown": [{"number","name","area_m2","gross_area_m2","holes":[{"area_m2"}],"net_formula","png_polygon":[[x,y]...],"pdf_polygon_pt":[[x,y]...]}],
 "excluded": [{"number","name","area_m2","reason","png_polygon":[...]}]}
```
- How I got this 面板顶部显示 `formula`，下面一行小字显示 `rule`
- 图上：`breakdown` 用绿色半透明多边形；`excluded` 用灰色斜线填充，悬停显示 `reason`
- PDF 图用 `pdf_polygon_pt × 150/72` 换算成像素（和现有的框一样）；PNG 直接用 `png_polygon`
- 有孔洞的房间，悬停显示 `net_formula`
- 每个房间多边形旁边放编号，点编号在面板里高亮对应那一行

## 2. Project 页：共享 2D 平面区（P0，建筑师 Gigi 的需求 I-1）
在 3D 区旁边（或用 2D/3D 切换）加一个大家共用的 2D 平面图：
- 接口：`GET /plan/rooms?path=<drawing>` → `{image_size, rooms:[{space_id, name, number, area_m2, bbox_px, polygon_px, status, media_count}]}`
  - swiss PDF 和 ifc_models 的平面 PDF 有房间；扫描图返回空列表 + warning（显示「No room outlines for scanned plans」，不要猜）
- 图用现有 `/drawing?path=` 显示，房间多边形叠加在上面；颜色按 status：built 绿、missing_wall 红色半透明、pending 黄、无状态 透明只描边
- 房间右上角：有照片时显示相机小图标 + 数量；任何房间都有一个 ⓘ 小圆圈
- **点房间 → 弹出房间卡**：
  - 上半：这个房间的 3D 预览
    - IFC 模型：用现有 IFC 查看器，只显示这个 IfcSpace 包围盒内的构件（墙、门、窗、家具、共享摆放的家具），镜头对准；缺墙（status = missing_wall）的墙用红色半透明
    - swiss 图：用 polygon 挤出 2.6 m 高的墙做一个简单盒子模型，门窗不画；标「Preview (extruded from plan)」
  - 下半：房间名、编号、面积、状态（可改，走现有 /collab/status）、留言、照片/视频（复用 B5 的房间媒体侧栏）
  - ⓘ 点开 = 直接跳到下半的照片和留言
- 每 3 秒轮询 /plan/rooms，状态和照片数变了就重画（和 /scene 一样）

## 3. 资料库页（P1）：用 Xinran 的 /docs，替换 Gemini 的 /files 界面
- 列表 `GET /docs?q=`：文件名、版本号 rev_label、状态（latest 绿 / superseded 灰 / conflict 红 / pending 黄 / rejected 划掉）、专业、上传人、时间、来自邮件时显示邮件主题
- 上传 `POST /docs`（multipart：file，可选 title、revision、uploaded_by）
- 点一行 → 右侧：版本历史 `GET /docs/versions?doc_key=`、审计记录 `GET /docs/events?id=`、下载 `GET /docs/file?id=`
- conflict / pending 旁边放按钮：Approve / Make latest / Reject → `POST /docs/resolve {"id","action"}`
- 搜索框支持多语言（后端已支持中英芬瑞德）
- 顶部一行说明：「Files sent to the project mailbox are filed here automatically」——**真实邮箱还没配，不要放假邮件**

## 验收
- npm run build 通过
- 手测：swiss 图问一道户型面积题，看到算式和绿/灰多边形；Project 页打开 ifc_models 的一张平面 PDF，点一个房间看到 3D 预览和照片区；资料库上传一个 PDF 再上传同名 revC，看到旧版变 superseded
