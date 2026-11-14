# 21 给 Codex：施工协作的页面（接 19 号后端）（11/14 18:40）

18 号做完再做这个。全部放进 18 号的工作台里，不要另开页面。只改 web/。不读 .env。不 push。每项截图自查后单独 commit。
接口都在 agent/app.py（agent/workflow.py），先读一遍请求/返回格式再写。

## 1. 排期里的「先后顺序」提醒（P0）
- 预约工时前调 `GET /workflow/check?space_id=&trade=&start=&end=`：有 blockers 就在表单下面红字显示 reason（人话），按钮变成「Book anyway」
- Schedule 标签（甘特图）：调 `GET /workflow/blockers`，违反顺序的条目画红边，悬停显示原因
- 房间卡 Overview 里：这个房间有 blocker 时顶部一条红色横幅

## 2. 订货和到货（P0）
- 家具目录 / 3D 已放家具旁边加「Order」：选要订的家具（默认当前房间的全部）、供应商（文本）、到货日期、送到哪个房间、通知哪些工种 → `POST /orders`
- 中间区域加「Calendar」标签：`GET /calendar?from=&to=` 月视图，工时（work）和到货（delivery，卡车图标）用不同颜色，点一个事件打开对应房间
- 订单列表（Calendar 旁边的小表）：状态 ordered / shipped / delivered，可以改 `POST /orders/status`

## 3. 通知铃铛（P0）
- 顶栏头像左边一个铃铛，未读数红点；按「你是谁」里的工种 `GET /notifications?trade=` 拉取，每 10 秒轮询
- 下拉列表：通知文字 + 时间；点一条 → `POST /notifications/read` 并跳到相关房间/订单
- 到货前一天的提醒用醒目颜色

## 4. 增项收费和预算（P0，建筑师模块 9）
- 房间卡加「Extras」标签：工人填「做什么 + 金额」→ `POST /change-orders`；列表显示 pending / approved / rejected
- 当前用户工种是 owner 时，pending 的条目旁边有 Approve / Reject → `POST /change-orders/decide`；不是 owner 时按钮灰掉并提示「Only the owner can approve extra costs」
- 顶栏加一个小的预算胶囊「Budget €12,340」：`GET /budget`，点开看明细（家具合计、已批准增项、待批准增项）

## 5. 项目设置（P1）
- 「Switch project」旁边一个齿轮 → `GET/POST /project/settings`：建筑类型（historic / new / renovation）、业主能看到什么（everything / final_and_questions）
- 当前用户是 owner 且 owner_view = final_and_questions 时：隐藏 Chat、Schedule 的细节，只显示房间状态、照片、需要业主决定的事（待批准增项、冲突）

## 验收
- npm run build 通过
- 截图：排水管工到缺墙的房间 → 红字提醒；下一张订单 → Calendar 出现到货 → 铃铛有通知；以 owner 身份批准一笔增项，预算数字变化
