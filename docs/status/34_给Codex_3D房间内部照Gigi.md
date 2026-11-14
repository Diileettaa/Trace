# 34 给 Codex：3D 房间内部照 Gigi 做（Ask 工作台的 Interior 3D）

背景：Ask 页已是 Gigi 工作台（Claude 写的 `web/src/gigi/Real3D.tsx`，里面用你的 IfcViewer）。Gigi 的「R 2.08 Interior 3D」是：**只显示这一个房间的剖切模型**（没有天花板、近侧两面墙去掉），斜上方俯视；构件带红/黄编号标签；构件到墙的尺寸线；底部 4 张距离卡。参考 design/gigi/src/components/Detailed3DViewer.tsx 第 320 行起 和 Diletta 发的截图。
现在我们的 Interior：镜头飞进楼层后常常贴着墙；整栋楼都还在，看不出是哪个房间；房间标签一大堆。

只改 web/src/IfcViewer.tsx 和 web/src/viewer3d/。不要改 web/src/gigi/（Claude 在做）。每项浏览器验证后单独 commit，不 push。先于 29 号第 2–4 项做（29 号第 0 项抖动仍最先）。

## 1. IfcViewer 新 props（Real3D 会传）
- `isolateSpaceGuid?: string | null`：给了就进入「房间模式」
- `elementTags?: { guid: string; code: string; verified: boolean; issue?: boolean }[]`：3D 里的编号标签
- `clearances?: { guid: string; left?: number; right?: number; front?: number; rear?: number }`（mm）：选中构件的尺寸线
- `hideRoomLabels?: boolean`

## 2. 房间模式（isolateSpaceGuid）
- 只显示：该 IfcSpace 包围盒内（外扩 0.3 m）的所有构件 + 与它相交的墙、门、窗、楼板；其他全部隐藏（不是半透明）
- 剖切：隐藏天花板/上层楼板；朝相机一侧的两面墙降到 1.0 m 高（clipping plane）或隐藏
- 相机：房间中心斜上方 45°，距离 = 房间对角线 × 1.4，看向房间中心；不进墙；保留 orbit，限制缩放范围（不能缩进墙里，也不能拉到看见整栋楼）
- 退出房间模式时恢复原状（不留隐藏）

## 3. 3D 标签（elementTags）
- 每个构件上方一个小标签（编号，如 DR-2-3.1）：已核实黄底黑字，未核实红底白字，有问题红框带 !
- 只在房间模式或 Whole Building 高亮时显示；最多 20 个，按距相机排序
- 点标签 = onSelectGuid(guid)

## 4. 尺寸线（clearances）
- 选中构件到四面墙各画一条细黄线 + 中间标数字（如「216 mm」），和 Gigi 的 420 mm / 450 mm 一样
- 数据由 Real3D 从 /api/element/info 传进来；没有的方向不画

## 5. 房间标签
- `hideRoomLabels` 为真时不显示房间名标签（房间模式下只显示当前房间名一个）
- Whole Building 下只显示当前楼层的房间标签，且同名的只留一个

## 验收
Ask 页 → Tallinn → 问 "How many doors are on this floor?" → 点任一门的 3D → 看到：只有那个房间、剖开、斜上方、门的标签、尺寸线；切回 Whole Building 恢复。截图发 Diletta。

## 补充（Diletta 实测 22:40，都要做）
6. **尺寸画在地板上**：房间模式下，在地板上画房间的长、宽尺寸线（细黑线 + 两端短竖线 + 中间白底数字「4.44 m」）；选中构件到四面墙的距离也画在地板上（黄线 + 数字）。数据：房间 L×B 来自 Real3D 传的 `roomDims?: {L,B,H}`，构件距离来自 `clearances`
7. **缩放不能飞出去/穿墙**：房间模式下 OrbitControls 的 target 固定在房间中心；minDistance = 房间对角线 × 0.6，maxDistance = 对角线 × 2.5；minPolarAngle 15°、maxPolarAngle 75°（只能从上方斜看，不钻到地板下）；拉远时看到的仍是这个剖开的房间（其他都隐藏），不会看到整栋楼
8. **点房间标签飞过去**：房间模式下点相邻房间的名字（或在模型里点另一个房间）= 切换 isolateSpaceGuid 到那个房间并平滑飞过去（0.6 s）；同时调 onSelectRoom
9. **Walk 改成第三人称小人**（只在房间模式里）：
   - 地板上放一个简单小人（胶囊身体 + 球头，高 1.7 m，黄色），相机在小人身后上方 3 m、斜 35° 跟随
   - 小人脚下画 4 个浅色箭头（前/后/左/右，半透明黄）；点箭头 = 小人朝那个方向走 0.8 m（0.3 s 动画）；键盘 WASD/方向键同样
   - 碰到墙停下（射线检测墙/门框，门洞可以穿过 → 走进相邻房间时自动切换 isolateSpaceGuid 到那个房间）
   - 去掉现在的摇杆、楼层小地图和「Walk mode」提示条；左下角只留一个「Exit walk」按钮（在原 Walk inside 位置）
   - 现在的问题：进入 Walk 后走不动、像钉在原地；方向按钮难用 —— 以上替代它
