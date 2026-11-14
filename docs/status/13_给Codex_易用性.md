# 13 给 Codex：易用性修正（Diletta 线上实测，11/14 17:15）

用户不是建筑专业的人也要能看懂。只改 web/。不读 .env。不 push。每项单独 commit。

## 1. 每个控件下面加一行小字英文说明（P0）
字号小、灰色，一行以内。至少这些：
- Question：「Ask in any language, e.g. "How many toilets?" or "一共有几扇门"」
- Drawing / model path：「Which drawing or 3D model to ask about. Pick one from Examples or upload your own.」
- 角色下拉（Plumber…）：「Changes how the answer is explained, not the numbers.」
- Storey：「Show one floor only; everything above it is cut away.」
- Trades：「Building systems in this model. Untick to hide them.」
- Room：（已有，保留）
- Demo catalog / Add furniture：「Place demo furniture in the selected room. Everyone on the project sees it.」
- Fit / Zoom to selection：鼠标悬停提示
- Screenshot note：「Note saved with the screenshot.」
- Render style / Render mood image：「Generates an illustrative image of the selected room in this style (AI image, not to scale).」
- Export BOM (CSV)：「Download a list of the placed furniture with prices.」
- Scan & number all elements：「Find and number everything on the drawing.」

## 2. 3D 看不清（P0）
- data/ifc_models/bsc-clinic_clinic-plumbing.ifc 只有管道，现在是一团很淡的灰色细线，看不清。
  - 管线、细构件用更深、更饱和的工种颜色，提高不透明度；线状构件最小显示粗细要够
  - 背景和构件对比度要够
- 模型加载完自动 Fit（镜头对准模型包围盒中心，填满视图 80%）；滚轮缩放朝鼠标指向的位置缩放，不是朝屏幕中心
- 模型只有一个工种时，在 3D 上方写一句：「This model contains only plumbing (pipes and fixtures).」

## 3. 页面从上往下读（P0）
- 现在点 Examples 里的题，题目跳到页面最上面的 Question 框，用户的视线在下面。改成：Examples 放在 Question 框的**上面**；选题后 Question 框高亮闪一下
- Demo scenarios 下拉选完后要**显示选中的那一项**，不要跳回「Choose a demo scenario…」。Dataset samples 的两个下拉同理

## 4. Ask 页的 2D 图也能点房间看 3D（P1）
Project 页已经有 2D 点房间（f7769fc）。Ask 页的 2D 图也要能：
- 调 `GET /plan/rooms?path=` 拿到房间轮廓，鼠标移到房间上高亮，显示房间名、编号、面积
- 点房间 → 复用 Project 页的房间卡（3D 预览 + 状态 + 照片）
- 扫描图（cubicasa）没有房间轮廓：鼠标悬停提示「Room outlines are available for vector plans (Swiss, IFC)」

## 5. 等待提示（P1）
- 点 Ask 后按钮变「Answering…」并显示已用秒数；IFC 模型第一次加载 3D 时显示「Loading 3D model… (large models take ~10 s)」

## 验收
- npm run build 通过
- 用线上数据手测：plumbing 模型一打开就能看清管道；swiss 图点一个房间能看到 3D 预览；选一个 demo scenario 后下拉框显示所选项
