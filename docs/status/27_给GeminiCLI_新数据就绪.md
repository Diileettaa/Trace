# 27 给 Gemini CLI：比赛现场换新数据也能用（11/14 19:50）

比赛时 Stoa 可能给新的图纸/模型（完整数据集约 10 GB，或评委自带文件）。要求：换 DATA_DIR 或上传新文件后，Project 页、文件浏览器、问答、房间功能都照常工作，不依赖写死的文件名。
只改 agent/catalog.py、agent/uploads.py（如需要）、agent/app.py（路由）、scripts/、tests/、TASKS.md。不改 engine/。不碰 web/。不读 .env。不 push。

## 1. 项目卡片自动生成
- agent/catalog.py 的 PROJECTS 现在是写死的 4 个。保留它们作为「精选」（文件存在时），再自动补充：DATA_DIR 里每个 IFC 模型 = 一个项目（同名前缀的平面 PDF 自动配对）；每个 swiss 楼栋 = 一个项目
- 自动项目的 title 从文件名生成，demo_data=false；`GET /catalog` 的 projects 最多返回 12 个精选+自动，另加 `GET /catalog/projects?q=&offset=&limit=` 分页搜索全部

## 2. 上传的文件 = 新项目
- 用户上传 IFC / DXF / PDF / PNG（现有 POST /upload）后，`GET /catalog` 里出现「Uploaded」来源和对应项目卡片；重启后仍在（存在 CACHE_DIR/uploads）
- 上传 IFC 后：/plan/rooms、/room/contents、/ask、3D 都要能用这个路径（逐个接口测，不行的修或返回清楚的 warning）

## 3. 新数据体检脚本 scripts/check_dataset.py
`python scripts/check_dataset.py --data <目录>`：遍历全部文件，对每个 IFC/DXF/PDF/PNG 试：能否解析、房间数、/plan/rooms 是否有结果、engine 能否回答一道基础计数题（门数）、耗时。输出 docs/dataset-check.md：按来源汇总通过率 + 失败清单（文件、错误）。任何单个文件出错都不能中断。
- 对 E:/Download/junction-dataset-preview 跑一遍，把报告 commit；重点看 ifc_bench 的 5 个模型和 opening_design 里的 IFC/PDF（这些我们从没测过）

## 4. 大数据集性能
- catalog 对 10 GB / 上万文件：首次扫描结果缓存到 CACHE_DIR/catalog.json（按目录 mtime 失效），/catalog 响应 < 1 s
- questions.jsonl 可能 12 万行：/questions 用索引或流式读取，不要每次全量加载

## 验收
- pytest 全部通过；用临时目录造一个「新数据集」（复制 2 个 IFC + 2 个 PDF 改名）测试自动项目和体检脚本
- commit 信息：`new-data readiness: auto projects, uploads as projects, dataset check, catalog cache`
