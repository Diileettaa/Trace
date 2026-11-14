# 19 给 Gemini CLI：建筑师的施工协作功能（后端）（11/14 17:50）

建筑师 Gigi 的模块 3、7、9 还没做。全部做成后端接口 + 测试，前端之后交给 Codex。
新建 agent/workflow.py、tests/test_workflow.py；agent/app.py 只加路由；更新 TASKS.md。
可以读 agent/collab.py、agent/scene.py 学写法和数据格式（JSON 文件存在 CACHE_DIR，加锁）。不改 collab.py / scene.py 的已有函数。不碰 engine/、web/。不读 .env。不 push。
所有演示数据文字以 "Demo: " 开头，并加进 scripts/seed_demo.py（--reset 可重复运行）。

## 1. 施工先后顺序（模块 3：「墙坏了，先修墙再装马桶」）
- 规则表（代码里写死，够演示用）：
  - plumber / electrician 在某房间干活，要求该房间状态不是 missing_wall（墙要先好）
  - tiler（瓷砖）要求 plumber 在这个房间的活已经结束
  - painter 要求 electrician 和 tiler 都结束
- `GET /workflow/check?space_id=&trade=&start=&end=` → `{ok, blockers:[{reason, needs_trade, needs_status}]}`，用人话写 reason，例如 "Wall in A21 is not built yet – fix the wall before plumbing"
- `GET /workflow/blockers` → 整个项目里现有排期（collab 的 bookings）违反顺序的列表
- 预约时不拦截，只返回警告（前端显示红色提示）

## 2. 订货和到货通知（模块 7：「这张桌子 5 号会送到你那里」）
- `POST /orders` body：`{model, items:[instanceId...] 或 "all", supplier, delivery_date, deliver_to_space_id, notify_trades:[...], author}`
  - items 从共享场景（agent/scene.py 的 placements）里取名称、数量、单价，算总价
- `GET /orders` 列表（状态 ordered / shipped / delivered）；`POST /orders/status` `{id, status}`
- 每个订单自动生成：
  - 一条日历事件（`GET /calendar?from=&to=` 返回订单到货 + collab 排期，统一格式 `{date, kind: delivery|work, title, space_id, trades}`）
  - 发给 notify_trades 的通知：`GET /notifications?trade=` → `[{id, text, created_at, read}]`，`POST /notifications/read {id}`
- 到货前一天的订单在 /notifications 里额外出一条提醒（请求时计算即可，不用定时任务）

## 3. 增项收费，客户点 OK 才算（模块 9）
- `POST /change-orders` `{space_id, trade, author, description, amount_eur}` → 状态 pending
- `POST /change-orders/decide` `{id, decision: approve|reject, by}`；只有 role = owner 的人能决定（role 从请求里传，演示够用），否则 403
- `GET /change-orders` 列表；`GET /budget` → `{furniture_total, approved_change_orders, pending_change_orders, total}`（furniture_total 来自共享场景的家具价格）

## 4. 客户透明度（模块 9）
- `GET/POST /project/settings`：`{owner_view: "everything" | "final_and_questions", building_type: "historic" | "new" | "renovation", status_note}`（模块 1 的「历史建筑还是新建筑」也放这里）
- 存起来即可，前端按 owner_view 决定业主看到多少

## 验收
- pytest 全部通过（Linux 和 Windows）
- 每个接口至少一个正常用例 + 一个错误用例
- commit 信息：`workflow: work order rules, orders + deliveries + notifications, change orders, budget, project settings`
