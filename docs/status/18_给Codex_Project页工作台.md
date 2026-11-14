# 18 给 Codex：Project 页改成「工作台」，所有路径框换成选择器（11/14 17:45）

问题（Diletta 实测）：Project 页是一长串表单；2D/3D 要手打路径，默认值 data/ifc_models/model.ifc、data/swiss_dwellings/drawing.pdf 根本不存在，一打开什么都看不到；联系人注册、私信、排期一层层往下堆，不知道先做什么。
参考大网站的做法：Autodesk Construction Cloud / Procore（左边导航、中间模型、右边详情）、Figma（顶部身份、右侧属性面板）、Notion（空状态给出下一步）。
只改 web/。不读 .env。不 push。每项单独 commit，每项用浏览器截图自查。17 号（3D 大改）先做完再做这个。

## 1. 文件选择器替换所有路径输入框（P0，Ask 页和 Project 页都要）
- 新接口 `GET /catalog`（可选 `?kind=3d` 或 `?kind=plan`）→ `{featured: [path...], sources: [{source, label, count, items:[{path, name, kind, size_kb, questions}]}]}`
- 做一个「Choose drawing / model」按钮 → 弹窗：顶部「Featured」（演示数据就是针对这几个文件准备的），下面按来源分组，可搜索；每项显示名字、类型图标（3D / Plan）、有几道题库题
- 平面图项可以用 `/drawing?path=...&page=1` 做小缩略图（懒加载）
- 路径输入框保留，但收进「Advanced」，默认不显示
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

## 4. 统一视觉（P1）
- 所有主按钮同一种颜色（品牌黄），次按钮描边；禁用状态的按钮旁边写原因（hover 提示），例如「Register your name first」
- 中文日期格式问题：日期输入用 ISO 显示（2026-11-15 09:00），不要跟浏览器语言变成 gg/mm/aaaa

## 验收
- npm run build 通过
- 截图：打开 Project 页不用任何输入就看到 esplanades 3D 模型；点一个房间右侧出现房间卡四个标签；顶栏头像；Files 标签是网盘
