# 35 给 Codex：34 号房间模式实测不工作（Claude 23:00 在 localhost 实测）

复现：Demo Version（Ask 工作台）→ Tallinn → 问 "How many doors are on this floor?" → 右栏点 `DR-2-3.1 Issue Reported` 的「3D」→ Real3D 以房间模式打开（isolateSpaceGuid = 该门所在 IfcSpace 的 GlobalId，elementTags = 该房间的 8 个门，clearances 有 4 个值）。

看到的（截图在 Diletta 那里）：
1. **画面是一片空的米色**：房间、墙、门都没显示。isolateSpaceGuid 隔离后把所有东西都藏了，或者相机对着空处。请在控制台打印：隔离用的包围盒、可见构件数、相机位置/target。可见构件数为 0 时退回：显示该房间所在楼层，并把相机对准房间包围盒
2. **构件标签排成网格**（DR-4-3.1、DR-17-3.1… 整齐排三列），不是挂在构件上。标签位置必须 = 构件包围盒顶部中心投影到屏幕，每帧更新；找不到构件几何的不显示
3. **标签样式**：白色大字浮在模型上看不清。改成小胶囊：已检查黄底黑字，Issue 红底白字，未检查深灰底浅字，字号 10px 等宽，最多 12 个
4. **尺寸**：216 mm / 424 mm 等数字浮在空中、没有线。要画在地板上：从构件边到墙的黄色细线 + 线中间的小数字
5. **onSelectRoom 在加载时自动触发**，把第一个房间（Corridor）报上来。只在用户点击房间时才调 onSelectRoom
6. **Walk inside**：在空场景里点了没反应。房间模式下 Walk = 第三人称小人放在房间中心，箭头可点，碰墙停
7. Whole Building 模式下不要显示 elementTags（Real3D 已经不传，但请确保 IfcViewer 清掉旧标签）

验收：同样步骤，看到一个剖开的 WC 房间（斜上方）、里面的门有红/灰小标签挂在门上、地板上有 4 条黄线带数字；Walk 能走。截图发 Diletta。每项单独 commit，commit 前跑 cd web && npm run build。
