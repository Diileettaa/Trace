# 24 给 Gemini CLI：「这个房间里有什么」（Stoa 现场必考题）（11/14 19:00）

Stoa 说评委会问：「浴室里有什么？」「卧室 3 里有几个插座/灯？」。现在 engine 只能对整张图或整层计数，不能列出一个房间里的东西。
新建 agent/room_contents.py、tests/test_room_contents.py；agent/app.py 加路由；agent/tools.py 加一个 Gemini 工具声明 + 分发（照抄 docs 工具的写法）。不改 engine/（只读调用）。不碰 web/。不读 .env。不 push。

## 1. Swiss（DXF）
- 用 engine/swiss.py 的 parse 结果：rooms 有轮廓/bbox，fixtures、doors、windows 有 bbox（米）
- 构件中心点落在房间多边形内就属于这个房间（门窗在墙上：中心点到房间边界 < 0.3 m 也算，标 on_boundary）
- 房间用编号或名字找（"5.08"、"Bagno"、"bathroom" → 同义词映射到图纸上的标签：bathroom→Bad/Bagno/Bain/Salle de bain，kitchen→Küche/Cucina/Cuisine，bedroom→Zimmer/Stanza/Chambre），多个匹配时全部返回，不要替用户挑

## 2. IFC
- 先看 IfcRelContainedInSpatialStructure 是否直接把构件放进 IfcSpace（engine/ifc.py 已经解析了这个关系）
- 不行就按几何：`pip install ifcopenshell`（加进 agent/requirements.txt），算每个构件和 IfcSpace 的包围盒，构件中心在空间包围盒内（高度在该楼层范围）就算；结果按模型文件缓存到 CACHE_DIR（第一次慢没关系）
- 装不上 ifcopenshell 时返回 value=null + warning，不要猜

## 3. 接口和工具
- `GET /room/contents?path=&room=` → 统一格式（和 answer_from_engine 一样）：
  `{value: 构件总数, unit: "count", items: [{category, name, guid?, png_bbox? / bbox_m?, on_boundary}], summary: {"toilet": 1, "sink": 1, "door": 1, ...}, room: {name, number, area_m2}, method: "room_contents:swiss" | "room_contents:ifc[contained|geometry]", warnings}`
- Swiss 的 items 要带 png_bbox（换算方法照抄 agent/engine_adapter.py），这样前端直接能画编号框
- Gemini 工具 `room_contents(path, room)`：描述写「List everything inside one room (fixtures, doors, windows, furniture, lights...) with evidence boxes. Use for 'what is in the bathroom', 'how many X in room Y'.」
- agent/agent.py 的提示词里加一句：问某个房间里有什么/有几个时调 room_contents

## 验收
- 用真实数据手测：swiss data/swiss_dwellings/site1000_bldg2082_floor9385.pdf 的一个浴室、一个厨房；ifc_models 的 esplanades 模型的一个房间。把结果打印进 commit 信息
- pytest 全部通过
- commit 信息：`room contents: what is inside a room (swiss + IFC) as API and agent tool`
