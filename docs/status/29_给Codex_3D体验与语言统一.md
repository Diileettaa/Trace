# 29 给 Codex：3D 体验 + 语言统一（Diletta 实测 11/14 20:50）

每项浏览器验证后单独 commit，不 push。只改 web/。

## 0. 最高优先：页面抖动（Diletta 视频 21:00）
- 静止不动时整页来回抖/重影（Whole Building、Explode、房间标签都出现双影），3D 模型有时消失
- 疑似：3D 画布按容器尺寸 resize → 页面出现/消失滚动条 → 容器宽度变 → 再 resize，死循环。或 ResizeObserver 里 setState 引起重排
- 修：3D 容器固定高度（calc(100vh - 顶栏)）、overflow:hidden；body 设 `scrollbar-gutter: stable`；resize 回调用 requestAnimationFrame 去抖，尺寸变化 <2px 忽略；renderer.setSize(w,h,false)

- 补充（Claude 21:30 本地测）：780 px 宽窗口下没测到尺寸循环，但 **3D 画布被挤到 20 px 宽**（canvas 31×679）→ 窄屏布局 bug，要修：3D 区最小宽 480 px，侧栏在 <1200 px 时收成抽屉
- 抖动只在 Diletta 的大屏（约 2400 px、Windows 缩放 150%，devicePixelRatio=1.5）出现。重点查：
  1. 小数 DPR 下 canvas 尺寸取整来回 ±1 px → 用 Math.floor(w*dpr)，且只在变化 ≥2 px 时 setSize
  2. e15bd85 触控板惯性缩放 / OrbitControls damping 永不停止 → 速度 <0.001 时归零，停止 render 循环（按需渲染）
  3. 房间标签（HTML 覆盖层）每帧重新定位用了小数像素 → transform 取整
  4. 用 Chrome DevTools 把窗口设成 2400×1300、DPR 1.5（Device toolbar）复现，静止 10 秒用 rAF 记录按钮 getBoundingClientRect 和相机位置，必须全程不变
- 验证：Tallinn 3D 静止 30 秒录屏无抖动，控制台无 ResizeObserver loop 警告

## 1. 语言统一
- 界面文字全部英文（按钮、提示、空状态）。不做多语言 UI 切换（时间不够）；问答回答保持用户提问的语言
- 模型里的爱沙尼亚语/德语房间名是数据，不翻原文，但显示为「英文 · 原文」：如 `Living room + kitchen · ELUTUBA+KÖÖK`
- 词表放 web/src/roomNames.ts：ELUTUBA→Living room, KÖÖK→Kitchen, ESIK→Hallway, TUALETTRUUM→WC, VANNITUBA→Bathroom, MAGAMISTUBA→Bedroom, KORIDOR→Corridor, TREPIKODA→Staircase, PANIPAIK→Storage, RÕDU→Balcony, SAUN→Sauna, TEHNOSEADMED→Technical room；德语 Bad→Bathroom, Küche→Kitchen, Flur→Hallway, Zimmer→Room, Büro→Office；+ 号拆开逐个翻。未知的照原样
- 用在：楼层/房间列表、3D 标签、房间卡、下拉框、回答卡

## 2. Walk 简化（像街景，但更简单）
- 进入 Walk：相机放在房间外侧斜上方（能看到整间房），**该房间做剖切**：隐藏天花板和靠相机一侧的墙（半开房间），其他房间淡化 20% 不透明
- 地面上画 4 个浅色箭头（前/后/左/右，半透明黄 #E9B949 40%），点一下 = 平滑移动 1 m；键盘 WASD/方向键同样
- 去掉现在的摇杆和楼层小地图挡视线的部分（小地图见 3）
- **Exit Walk 放在和 Walk inside 同一个位置（左下角）**，进入后那个按钮就变成「Exit Walk · Esc」；顶部工具条不要再出现 Exit Walk
- 完成标准：从 Whole Building 点房间 → Walk → 看到整间半开房间 → 点箭头移动 → 左下角退出，回到原视角

## 3. 浮动面板可移动/收起
- 楼层小地图（5.korrus 那个）和点房间弹出的 IfcSpace 卡：都可拖到任意角落、可收起成一个小标签、记住位置（localStorage）
- 默认：小地图左下角收起状态；房间卡右上角

## 4. 房间卡只保留一种
- 现在点房间有两种卡：浮动 IfcSpace 卡（Add note/Screenshot/Photos/Timeline/Place furniture）和右栏 ROOM DETAILS。刷新后显示不一致
- 统一成一种：右栏房间卡（Overview/Chat/Photos/Schedule），浮动卡去掉或只作为右栏的收起态。刷新后保持同一个
- 首次引导浮层（Choose a room）挡住右栏：缩小移到左下角

## 5. 之后
- 继续 28 号前端部分（Swiss 无 IFC 时用 /plan/rooms 挤出房间 3D）和 25 号第 4 步
