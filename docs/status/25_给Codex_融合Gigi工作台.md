# 25 给 Codex：把建筑师 Gigi 的工作台设计和我们的真实数据融合（11/14 19:45）

Gigi 在 Google AI Studio 里做了一个设计稿式的 App（**她的代码不能改**；Diletta 会把导出的源码放到 `design/gigi/`，只当参考，可以照抄组件和样式到 web/，但不要改 design/gigi/ 里的文件）。
她的版本全是写死的假数据，但界面和交互是建筑师认可的「最终形态」。我们的版本有真实引擎、真实图纸、真实 3D。
**目标：界面照 Gigi 的来，数据和 3D 用我们的。** 只改 web/。不读 .env。不 push。每项截图自查后单独 commit。

## Gigi 的工作台（照这个做，截图见 design/gigi/screenshots/ 如果有）
- 顶部深色条（#202427）：「TRACE DESKTOP APP · PROJECT 01 · LEVEL 02 ▾」——LEVEL 鼠标停 1 秒或点击 → 楼层选择；右边 Desktop / Tablet / Mobile 切换
- 三栏，满高度，各自滚动：
  - **左栏（#F7F6F2）**：HISTORY（每条历史是一段完整对话：问题 + 时间 + 消息数；「+」新对话）→ SCALE（AI LOD）1:200 / 1:100 / 1:50 / 1:20 → LAYER GUIDE（各工种 ON/OFF：Architecture & Walls、Sanitary & Plumbing、Ventilation、Electrical & Lighting、Dimension Chains）
  - **中间（白）**：「Floor plan」+ 2D | 3D 切换；上方三张圆角 keynote 卡：① 房间号 + 面积大字 + 小字 L×B×H ② Objects found + 大数字 ③ Status（Installed 绿 / In progress 黄 / Issue reported 红，下面小字 "2/3 verified"）；下面是图纸，命中的房间浅黄填充、每个命中构件深黄虚线框 + 编号标签（WC-208.1）、一个「Evidence 01」引线标签；未核实的构件红色；底部正中黄色按钮「Verify on Site · Add Photo」（全部核实后变「Update Verification」）
  - **右栏（#F7F6F2）**：聊天：用户问题深色气泡；回答卡片：大数字 + 一段说明 + 黄色按钮「View … in 3D →」+ 每个命中构件一行（编号、状态、"3D" 链接）+ 「Follow-up:」两三个可点的追问；底部固定输入框 + 发送
- 鼠标在命中构件上停 > 1 秒 → 弹出现场照片（日期、拍摄人、状态）
- 点命中构件 → 3D 打开这个房间，显示到墙的距离

## 用我们的真实数据填
| Gigi 的界面 | 我们的数据来源 |
| --- | --- |
| 图纸 | `/drawing?path=` 真实平面图；命中构件 = /ask 返回的 evidence sources（bbox，已是图纸像素坐标） |
| 房间浅黄填充 | `/plan/rooms?path=` 的 polygon_px（命中构件所在的房间） |
| 卡 ①：房间号、面积、L×B×H | `/room/contents?path=&room=` 的 room（name、number、area_m2）；L×B 用 polygon 的包围盒算，H 没有就不显示 |
| 卡 ②：Objects found | `/ask` 的 summary.evidence_count |
| 卡 ③：Status、x/y verified | `/collab` 的房间状态 + `/collab/media?space_id=` 有照片的构件数 |
| 编号标签 | evidence items 的 name（WC 1、Door 3…） |
| 红色 = 未核实 | 这个构件（id）在 /collab/media 里没有照片 |
| 回答卡片的大数字和说明 | /ask 的 answer_text、summary |
| Follow-up 追问 | /ask 新增的 `follow_ups`（字符串数组），点了就当作新问题发送 |
| 3D | 我们的 IfcViewer（含 17、23 号的楼层/房间/走进去/展示模式），IFC 题直接显示；swiss 图用 18 号的房间挤出预览 |
| Verify on Site · Add Photo | `POST /collab/media`（space_id、author、note、文件），挂在当前选中构件或房间 |
| 悬停 1 秒看照片 | `GET /collab/media?space_id=` |
| HISTORY | 前端保存每段对话（localStorage），切换时恢复图纸 + 回答 |
| SCALE (AI LOD) | 我们没有 AI 重绘：1:200 = 适合全图，1:100、1:50、1:20 = 对命中区域逐级放大；小字写「zoom level」，不要假装生成了新图 |
| LAYER GUIDE | 3D 用现有工种图层；2D 图纸没有分层 → 2D 时只控制我们自己的叠加层（房间填充、编号框、尺寸标注） |
| Desktop / Tablet / Mobile | 照 Gigi：Mobile 是底部两个标签（Plan/3D、Assistant），History 和 Layers 放右上角图标弹窗 |

## 3D 必须修的（Diletta 实测）
- 穿模：构件互相穿插、相机进到墙里。相机 near plane 调小但不要太小（0.05 m），开 logarithmicDepthBuffer 或调整 polygonOffset 解决 z-fighting；Walk 模式不能穿墙（简单的射线碰撞：前方 0.3 m 内有墙就停）
- 缩放：滚轮朝鼠标指的位置缩放；右下角一个竖向缩放滑杆（+ / − 和拖动条）；单击某处 = 那里成为旋转中心并平滑拉近一点

## Gigi 的着陆页、价格页、教育版
- 着陆页（Every answer. Backed by evidence.）、Plans（Monthly/Annual，三个套餐 + 对比表）、Education（Trace Campus）照她的做，放进我们的 Home；「Launch Demo / Try Live Demo」进入我们的真实工作台
- 着陆页底部写「Built for Stoa – Make Blueprints Talk · Junction 2026」（Gigi 要求提到 Stoa）
- 演示数据一律标 Demo；价格页的价格来自经济学同学的方案（490 / 1,190 / 2,790 € 基础价），没有就保留 Gigi 的

## 更新（19:50）
- **先做完 26 号（3D 稳定性）再做本任务**；本任务里「3D 必须修的」一节已并入 26 号，跳过
- Gigi 已定稿、可以直接照抄的：**Workspace** 和 **How it works** 页。Education 她还在改，Plans/商业部分以后整页搬，**第 5 步先只做 How it works，Education 和 Plans 留占位链接**
- 我们有而 Gigi 没有的功能，放进她的布局而不是另开页面：
  - How I got this（来源/方法/token/成本）→ 回答卡片下方可折叠一行「How I got this」
  - 面积算式和绿/灰多边形 → 图纸叠加层 + 回答卡片里的算式
  - 文件夹浏览器/项目卡片 → 顶部「PROJECT 01」点开
  - 房间聊天、排期、增项、订货、日历、通知、预算、资料库 → 顶栏右侧图标（铃铛、日历、文件、预算胶囊）点开为右侧抽屉；房间相关的放进点房间后的房间卡
  - 家具目录、展示模式、Tour、Walk → 3D 视图内的工具按钮
  - 角色（建筑师/电工/水管工/业主）→ 顶栏头像

## 顺序
1 工作台三栏 + keynote 卡 + 聊天（含 follow_ups）→ 2 图纸上的高亮、编号、红色未核实、悬停照片、Verify 按钮 → 3 3D 修穿模和缩放 → 4 History / Scale / Layer / Mobile → 5 着陆页、价格、教育版
