# 09 给 Codex：3D 可用性 + 家具目录弹窗（11/14 16:00）

Diletta 实测 data/ifc_bench/ac20_arc.ifc 发现的问题。只改 web/。不读 .env。不 push。每项单独 commit。

## 1. 缩放和导航（P0）
- 现在滚轮放大不了。滚轮缩放、右键平移、左键旋转都要能用（OrbitControls：enableZoom，minDistance 很小，maxDistance 按模型包围盒的 3 倍）
- 加按钮：Fit（看全模型）、Zoom to selection（看选中的构件或房间）
- 双击构件 = 镜头对准它

## 2. 点击构件显示「这是什么」（P0）
- 单击任意构件 → 高亮 + 右侧信息卡：IFC 类别（变成好懂的名字：Wall、Slab、Column、Furniture…）、名称、类型、楼层、所在房间、尺寸（宽×深×高，m）、GUID
- 鼠标悬停显示一行提示（类别 + 名称）
- 工种复选框旁边的说明要写清楚每类是什么，例如 Structure (3)：「slabs, columns, beams」；Furniture (255)：「furniture that is part of the IFC model」
- 取消 Architecture 后只剩家具时，家具不要是一片白盒子：用 Furniture 的颜色，并保持可点击

## 3. 家具目录弹窗（P0）
- 现在的下拉框换成「Add furniture」按钮 → 弹出窗口，里面是格子卡片（每个产品一张卡）
- 每张卡：缩略图 + 名称 + 价格 + 尺寸 + 材质
- 缩略图：用 three.js 把这个产品自己的 3D 形状（就是放进模型里的那个形状、颜色）离屏渲染成小图。**不要用网上的产品照片**
- 卡片上方按类别筛选：Kitchen / Bathroom / Living / Bedroom / Lighting / Office
- 点卡片 → 放进当前选中的房间；弹窗上方写清楚「Placing into room 007」
- 房间下拉框改名为「Room」并说明：它决定家具放在哪里，不改变目录
- 卡片上标「Demo catalog」：价格是演示数据

## 验收
- npm run build 通过
- 用 ac20_arc.ifc 手测：能放大到一个房间、点一张桌子看到信息卡、从弹窗把沙发放进 207 号房间、另一个浏览器窗口 3 秒内看到这张沙发
