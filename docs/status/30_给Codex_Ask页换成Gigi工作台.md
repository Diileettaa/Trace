# 30 给 Codex：Ask 页整页换成 Gigi 工作台 + 真实数据（最高优先，11/14 21:15）

源码在 `design/gigi/src/`（只读参考，不改）：`components/TraceWorkspace.tsx`（主体）、`LargeExecutionPlan.tsx`（2D）、`Detailed3DViewer.tsx`（3D）、`data/workspaceData.ts`（假数据结构）。
**做法：把这几个文件复制到 web/src/gigi/，样式/布局/文案/交互一模一样（Tailwind 类、颜色、字号、间距照抄），只把假数据换成我们的接口。** Ask 路由直接渲染新的 GigiWorkspace；旧 Ask 页留在 `?legacy=1`。
29 号第 0 项（抖动）先修完再开始这个；29 号 2–5 暂停，放到本任务之后。
每一步浏览器对照 Gigi 实际应用（AI Studio 的 Untitled）验证后单独 commit，不 push。只改 web/。

## 数据映射（Gigi 假数据 → 我们的接口）
| Gigi | 我们 |
|---|---|
| `QueryScenario` | 一次 `POST /api/ask` 的结果（见下） |
| `scenario.foundCount` / 回答卡大数字 `bigMetric` | `evidence[0].value`（无数值时显示 answer_text 的第一行） |
| `aiSummary` | `answer_text`（去掉 markdown 的 **） |
| `responseTime` | `timing.total_s` 格式化 "1.2s" |
| `followUpQuestions` | `follow_ups`（字符串数组）。点击 = 在当前对话里真的再问一次 /ask（不是预置答案） |
| `roomCode / roomName` | items 里出现最多的 `space_id` / `room_name`；没有就用文件名 |
| `roomArea / roomDimensions` | `GET /api/plan/rooms?path=` 中该房间的 `area_m2` 和 `dims_m` → "L 6.40m × B 4.44m × H 2.85m"（H 为 null 就不显示 H） |
| `roomHighlight` | 该房间多边形（plan/rooms 的 polygon / bbox，按图纸像素坐标） |
| `targetIds` / `FixtureVerification` | `evidence[0].items`：`id`、`label`（= Gigi 的 code，如 WC-208.1）、`name`（= Gigi 的 label）、`space_id`、`room_name`；框位置来自 `evidence[0].sources[i].bbox`（图纸像素） |
| `verified / status / author / capturedAt / note / photoDataUrl` | `GET /api/verify/status?path=&ids=`（Gemini 31 号会扩展：status、note、author、ts、photo url） |
| `manufacturer / modelSpec / dimensions3D` | `GET /api/element/info?path=&id=`（Gemini 31 号新建）；没有的字段显示 "—"，不要编 |
| `overallStatus` | 任一 Issue → Issue Reported；全部 Installed → Installed；否则 In Progress |
| 「x/y verified」 | /verify/status 的 verified/total |
| `LAYER_GUIDE` 开关 | 按 item.category 分组控制证据框显示：sanitary=toilet/sink/shower/bath，architecture=door/window/wall/room，hvac=duct/damper，electrical=light/socket，dimensions=尺寸标注层（显示房间 L×B 标注） |
| `requiredLayers` | 由本次回答 items 的类别自动打开 |
| `scale` 1:200…1:20 | 2D 图纸缩放级别（1:200=整张 fit，1:100=2×，1:50=4× 以房间为中心，1:20=8× 以选中构件为中心）；`recommendedScale`：单房间结果→1:50，整层结果→1:100 |
| `FLOOR_OPTIONS` / LEVEL 02 下拉 | IFC：模型楼层列表（已有 3D 用的 storeys）；swiss/扫描图：只有一项「Floor plan」。悬停 1 s 或点击打开，照抄 |
| `TRACE DESKTOP APP · PROJECT 01` | PROJECT 01 换成当前项目名，点击 = 打开项目选择（/api/catalog 的项目卡片弹窗） |
| History（ChatSession） | localStorage，按项目存；每条 = 一段对话（标题=第一问、时间、消息数）；`+` 新对话 |
| 新对话 Quick prompts | `GET /api/questions?path=<当前文件>&limit=3`（没有就用 3 个通用问题：How many doors / toilets / What is the area of room …） |
| 2D 底图 | `GET /api/drawing?path=&page=1` 的 PNG，SVG 叠加层用同一像素坐标（viewBox=图片宽高） |
| 悬停构件 >0.85 s 弹照片卡 | /verify/status 的 latest photo；没照片显示「Unverified · no site photo yet」红框 |
| 点构件 → 3D 房间 | 见下「3D」 |
| Verify on Site · Add Photo 弹窗 | 字段照抄（Target Fixture、Inspector Name、Status、照片、Note）。提交 = `POST /api/collab/media?item_id=&space_id=&author=&note=&status=` 上传照片；没照片只改状态 = `POST /api/verify/item`（31 号）。保存后重新拉 /verify/status，框红→黄、卡③ x/y 更新 |
| Download App 提示条、Desktop/Tablet/Mobile 预览 | 照抄（纯前端） |

## 3D（先简单、要稳）
- `3d-building`（Whole Building）：IFC 项目用我们现有 IfcViewer，目标房间高亮黄色、其余半透明；swiss/扫描图用 1c1d399 的房间挤出。外面套 Gigi 的深色工具条（Back to 2D、Building|Room 切换、Rotate）。IfcViewer 自己的工具按钮全部隐藏
- `3d-room`（Interior）：IfcViewer 飞到该房间（已有 Interior），选中构件高亮；右侧叠加 Gigi 的尺寸卡（dimensions3D 五行 = /element/info 的 clearances；没有数据的行隐藏）
- 3D 加载慢或失败：显示 Gigi 的 SVG 示意（不要白屏），标「Schematic」
- 不放 Walk/Explode/Peel/家具等（这些留在 Project 页）

## 我们的东西放哪（本任务里只做标★的，其余记下不做）
- ★ 回答卡下方一行可折叠「How I got this」：来源徽章（exact from geometry / trained detector / AI vision）、method、tokens、cost、耗时 —— 评委必看
- ★ 面积题：答案卡里显示算式（evidence 的 formula/areas），房间多边形绿色
- ★ 上传自己的图纸：History 上方小按钮「Upload drawing」（POST /api/upload，成功后切到该文件）
- 角色、房间聊天、排期、通知/日历/订货/预算、资料库、Walk/Explode/Tour/Record/家具 → 不进工作台，留在 Project 页
- 旧 Ask 页的 Examples/文件路径框/Role 选择 → 不要了（Gigi 的 History + Quick prompts + PROJECT 下拉已替代）

## 步骤与完成标准
1. 复制 Gigi 组件 + 外壳（顶条、三栏、手机/平板外壳）用假数据跑通，像素级对照截图 → commit
2. 接 /ask：问 Tallinn「How many toilets」→ 三张卡、回答卡、follow-ups 全部来自真实接口 → commit
3. 2D：真实图纸 + 证据框（红/黄）+ 房间高亮 + Evidence 01 引线 + 图层/比例尺 → commit
4. Verify 弹窗 + 悬停照片（真上传，刷新后仍在）→ commit
5. 3D 两种模式 + 尺寸卡 → commit
6. History/新对话/Quick prompts/楼层/项目切换 → commit
7. ★ 三项 → commit
8. 三个项目各问 3 题截图发 Diletta：Tallinn（IFC 平面）、Swiss、扫描图 colorful-11397
