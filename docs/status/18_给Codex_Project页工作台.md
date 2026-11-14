# 18 给 Codex：Project 页改成「工作台」，所有路径框换成选择器（11/14 17:45）

问题（Diletta 实测）：Project 页是一长串表单；2D/3D 要手打路径，默认值 data/ifc_models/model.ifc、data/swiss_dwellings/drawing.pdf 根本不存在，一打开什么都看不到；联系人注册、私信、排期一层层往下堆，不知道先做什么。
参考大网站的做法：Autodesk Construction Cloud / Procore（左边导航、中间模型、右边详情）、Figma（顶部身份、右侧属性面板）、Notion（空状态给出下一步）。
只改 web/。不读 .env。不 push。每项单独 commit，每项用浏览器截图自查。17 号（3D 大改）先做完再做这个。

## 1. 文件浏览器替换所有路径输入框（P0，Ask 页和 Project 页都要）
- 接口 `GET /catalog`（可选 `?kind=3d` 或 `?kind=plan`）返回文件夹树：
  `{featured:[path...], sources:[{source, label, description, license, count, groups:[{name, count, items:[{path, label, kind, size_kb, questions}]}]}]}`
  例：Swiss apartments → Site 1000 · Building 2082 → Floor 9385；BIM models → bsc esplanades… → 3D model / Plan 04…；Scanned floor plans → Colour plans → Plan 11397
- 做成像网盘一样逐层点进去的弹窗：第一层是来源文件夹（大卡片：名字、说明、文件数）→ 第二层是建筑/模型/项目 → 第三层是文件（平面图用 `/drawing?path=&page=1` 懒加载缩略图，3D 用立方体图标）。顶部面包屑可以返回上一层；有搜索框；最上面固定一排「Featured」（演示数据就是为这几个文件准备的）
- 卡片底部小字显示 license（数据来源署名）
- 路径输入框收进「Advanced」，默认不显示
- **选中文件后立刻在右侧显示图纸或 3D 模型**，再让用户提问；Examples 里的题也按当前图纸过滤（GET /questions 已有 path 信息，前端过滤）
- 演示模式（URL 带 ?demo=1 或从 Launch Demo 进入）隐藏「Upload your own drawing」；正常模式保留但放到文件浏览器里作为「Upload」按钮
- **Project 页打开时直接加载 featured 里的第一个 IFC（esplanades 模型）和它对应的平面 PDF**，不要空白

## 2. Project 页布局改成三栏工作台（P0）
- 顶栏：项目名「Demo project」+ 当前模型名（点开就是选择器）+ 右上角「你是谁」：第一次进来弹一个小窗填名字和工种，存 localStorage，以后都显示成头像（首字母 + 工种颜色），点头像可改。**删掉页面里的「Team contacts / Register contact」大表单**
- 左栏（窄）：楼层 → 房间树（和 17 号的房间列表共用），房间名后面有状态小圆点和未读消息数
- 中间（最大）：标签页「3D」「2D plan」「Files」，默认 3D
- 右栏（选中房间时出现）：房间卡，内部标签「Overview」（名字、面积、状态可改）「Chat」（房间聊天）「Photos」（媒体）「Schedule」（这个房间的排期，冲突标红）
- 私信：顶栏一个信封图标，点开是抽屉，不占主页面
- 「Work timeline」整个项目的排期：做成中间区域的第 4 个标签页「Schedule」，按房间 × 时间的甘特图样式，冲突标红

## 3. 空状态和引导（P1）
- 每个空区域都写下一步怎么做，而不是只写「No bookings yet」：例如「No work booked in this room yet. Pick a time and trade to book it.」
- 第一次打开 Project 页：右下角 3 步小引导（1 选房间 → 2 看状态和照片 → 3 留言或排期），可以关掉，关了不再出现

## 4. 在 3D 里点哪里就在哪里操作（P0，建筑师要求）
- 3D 里单击一个房间或构件：在点击位置旁边弹出一个小浮窗（不是跑到页面上方），里面有：
  - 名字、类别、所在楼层和房间
  - 「Add note」：写备注，存成这个房间的留言（/collab/message），带 3D 截图
  - 「Screenshot」：截当前视角，附在备注里
  - 「Photos (n)」「Timeline」：打开右栏房间卡对应的标签
  - 「Place furniture here」：打开家具目录，放到点击的位置
- 上方工具条的截图/备注保留，但主要入口是这个浮窗
- 有备注或照片的房间，在 3D 里房间中心显示一个小气泡图标和数量，点气泡直接打开

## 5. 家具目录像网店（P0）
- 目录弹窗改成：左边类别文件夹（Living / Bedroom / Kitchen / Bathroom / Lighting / Office），中间大图卡片（图片、名字、价格、尺寸、材质、颜色），点卡片看大图和详情
- 图片：`web/public/catalog/<id>.png`（Gemini CLI 正在用 AI 生成，生成前用现在的 3D 形状缩略图兜底）；卡片标「Demo catalog · AI-generated preview」
- **从卡片直接拖进 3D 视图**：松手的位置就是摆放位置（射线打到地板），落在哪个房间就属于哪个房间；拖动时显示半透明预览
- 目录数据：`web/src/catalog.json`，Gemini CLI 会扩充到约 40 件并加 category、image 字段，字段名以它为准

## 6. 统一视觉（P1）
- 所有主按钮同一种颜色（品牌黄），次按钮描边；禁用状态的按钮旁边写原因（hover 提示），例如「Register your name first」
- 中文日期格式问题：日期输入用 ISO 显示（2026-11-15 09:00），不要跟浏览器语言变成 gg/mm/aaaa

## 验收
- npm run build 通过
- 截图：从文件浏览器逐层点到 Swiss → Site 1000 → Floor 9385，图纸立刻显示；在 3D 里点一个房间出现浮窗；从目录把沙发拖进房间
- 截图：打开 Project 页不用任何输入就看到 esplanades 3D 模型；点一个房间右侧出现房间卡四个标签；顶栏头像；Files 标签是网盘
