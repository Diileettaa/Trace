# 22 给 Gemini CLI：AI 推荐产品和工人（建筑师模块 7、9）（11/14 18:40）

新建 agent/recommend.py、tests/test_recommend.py；agent/app.py 只加路由；更新 TASKS.md。不碰 engine/、web/、已有函数。不读 .env。不 push。

## 1. 按房间推荐产品：`GET /recommend/products?space_id=&need=&model=&budget_eur=`
建筑师原话：「我要订马桶时，系统给我建议，并从目录里找出可选的型号」
- need：自由文字（"toilet"、"lamp for the bedroom"、"sofa"）。先用关键词映射到 web/src/catalog.json 的 category/名字；映射不到时再调一次 Gemini（GEMINI_MODEL，temperature 0，只让它从目录 id 列表里选，返回 JSON），不要让它编新产品
- 房间尺寸：IFC 模型用 engine 的房间面积（from engine.query import query：intent=area, category=room, scope={room: space_id}），拿不到就跳过尺寸过滤
- 过滤：尺寸放得下（宽×深 < 房间面积的 25%）、不超预算；排序：价格、和房间里已放家具的材质/颜色一致的优先（读 agent/scene.py 的 placements）
- 返回最多 5 个：`{id, name, price_eur, image, reason}`，reason 一句人话，例如 "Fits a 4.2 m² bathroom; matches the white ceramic already placed"
- 返回里写明 `source: "rules"` 或 `"gemini"`，以及 token 数（rules 时为 0）

## 2. 推荐以前合作过的工人：`GET /recommend/people?trade=&space_id=`
建筑师原话：「推荐本地的、以前合作过的电工」
- 从 agent/collab.py 的 people 和 bookings 里算：同工种的人，按合作次数（预约数）、最近一次合作时间排序；有冲突的时间段的人往后排
- 返回 `[{name, trade, jobs_done, last_job, available_now, reason}]`

## 3. 演示数据
scripts/seed_demo.py 补几个 Demo 工人和历史预约（--reset 可重复运行），让推荐有东西可排

## 验收
- pytest 全部通过；Gemini 调用在测试里打桩
- commit 信息：`recommendations: products for a room, people worked with before`
