# Trace 任务板 (TASKS.md)

状态：`[ ]` 待办 · `[~]` 进行中 · `[?]` 待审 · `[x]` 完成。开工前改 `[~]`；`python -m pytest -q` 和 `cd web && npm run build` 都过了才改 `[?]`。

| 编号 | 任务 | 负责 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| T-01 | 安全检查 + 首次推 GitHub，看 CRACI 跑 | Diletta | [ ] | 全部历史已扫过，无 key（AIza / nvapi- / sk-） |
| T-02 | 视觉/复核 API 磁盘缓存 | Claude | [?] | `agent/vision.py` `cached_call`：图片 SHA256 + prompt + model；存 `cache/vision/`；结果带 `cached` |
| T-03 | 模块 1：全构件识别编号 | Claude | [?] | 工具 `scan_drawing_inventory` + `GET /inventory`；无 key 时返回 `mock/inventory.json` 并标 MOCK DATA |
| T-04 | 缓存/清单/契约单测 | Claude（代 Codex） | [?] | `tests/test_inventory_and_cache.py`，共 23 个测试全过；CI 文件未改 |
| T-05 | 模块 2：分层目录树 | Claude | [?] | `web/src/components/SpaceTree.tsx` |
| T-06 | 模块 3&4：房间状态 + Room Board | Claude | [?] | `web/src/components/RoomCollabPanel.tsx`；改动只闪烁该房间的框 |
| T-07 | 数据源署名 + IFC 实测 | Claude / Diletta | [~] | `LicenseBadge.tsx` 只写来源名，许可证文字要按数据集 LICENSE 补；真实 IFC 加载需在本机测 |
| T-08 | 后端 collab 接口 + 角色 | Claude | [?] | `agent/collab.py`，`/collab*`；角色加 plumber、owner |
| T-09 | 前端总装 + Nemotron 徽章 | Claude | [?] | `App.tsx`、`DrawingViewer.tsx`、`VerifyBadge.tsx`；`npm run build` 通过 |
| T-10 | 接 Xinran 的 engine | Claude | [?] | `engine/` 从 origin/main 拷入（Xinran 维护，只读）；`agent/engine_adapter.py` 转成统一格式；智能体优先调 `answer_from_engine`；真实题库抽测：swiss 40/40 且全部带框；ifc_models 34/40（错的 4 题是 preview 里没有该 IFC 模型）；cubicasa 引擎只有统计先验 → 自动转 Gemini 视觉计数 |
| T-11 | Verda 批处理 + Dockerfile + 部署 | Codex / Diletta | [?] | 预热脚本完成；pytest 23 passed，前端 build 通过；Verda 部署仍待确认 |
| T-12 | README 各 Tech Challenge + verda-log | Codex | [?] | 文档完成；pytest 23 passed，前端 build 通过 |
| T-13 | Codex 真实提交（Codex 挑战证据） | Codex | [ ] | 上面的 T-04 是 Claude 写的，Codex 挑战需要 Codex 自己做 T-11/T-12 |
| T-14 | 界面全部改英文（评委看英文），中文只留在代码注释里 | Gemini (Antigravity) | [?] | All UI text translated to English, zero CJK strings in UI, npm run build passed. |
| T-15 | 3D 联动：后端证据里有 `model_file`（如 data/ifc_models/x.ifc）时，在答案区加 "Open in 3D" 按钮，用 IfcViewer 加载 model_file 并高亮 items 里的 guid；目录树/证据点击 → IfcViewer 按 guid 高亮并居中；拿数据集里最小的真实 .ifc 测，WASM 路径在 build+preview 下也能加载 | Gemini (Antigravity) | [?] | Added 3D linkage with Open in 3D button, GUID highlighting and camera centering on tree/evidence clicks, bundled WASM in build+preview with ErrorBoundary, build passed. |
| T-16 | Demo 黄金路径：左上加 "Demo" 下拉，5 道固定演示题（PNG 计数、全构件识别、IFC 计数、IFC 面积、房间留言），一键填入路径和问题 | Gemini (Antigravity) | [?] | Demo dropdown with 5 golden path scenarios in web/src/demo.ts, one-click fill of path+question+role, npm run build passed. |
| T-17 | 答案卡片打磨：加载动画、显示工具调用链（Gemini → 工具名）、cached 标记、错误提示友好 | Gemini (Antigravity) | [?] | Added loading spinner, styled tool call chain (Gemini → tool badges), cached result badge, friendly error banner, npm run build passed. |
| T-19 | 3D 摆放（建筑师模块 7/8）：在 IfcViewer 里选一个房间，从小型产品目录（web/src/catalog.json：桌子、灯、马桶等，带真实尺寸 mm、价格、材质、颜色）里选一件，按真实尺寸放进 3D 场景该房间地面中心，可拖动、旋转；"Screenshot" 按钮导出当前 3D 视图 PNG | Codex | [?] | web/src/**；15 件 Demo catalog；IfcSpace 选择、家具摆放编辑与 PNG 截图；pytest 34 passed，web build 通过 |
| T-20 | 后端 /render：输入 3D 截图 + 产品描述 + 风格，调用 Gemini 图像生成出氛围效果图并缓存；返回 PNG | Codex | [?] | agent/render.py、agent/app.py 新增 /render、tests/test_render.py；FakeClient 单测；pytest 37 passed，web build 通过 |
| T-21 | 前端效果图面板：T-19 截图后点 "Render mood image"，调用 /render 显示结果并可下载；导出 BOM CSV | Codex | [?] | web/src/**；截图生成/预览/下载；CSV 汇总放置产品及当前答案计数；pytest 37 passed，web build 通过 |

| T-18 | 数据引擎离线抽样评测 | Codex | [?] | scripts/eval_engine.py、docs/eval-results.md | pytest 31 passed；web build 通过；每来源 50 题离线抽样已记录 |
| T-25 | 团队协作：联系人、房间/私聊、施工时间线冲突、3D 截图备注 | Codex | [?] | agent/collab.py、agent/app.py、web/src/**（不含 DrawingViewer.tsx）、tests/** | 四块分别提交；pytest 41 passed，web build 通过；a0f8ac5、13f51ae、74c531c、c4da309 |
| T-27 | Gigi 视觉系统、落地页和 Home/Ask/Community 导航 | Codex | [?] | web/src/**（样式及新增页面；viewer 仅颜色） | Gigi palette、landing page、Home/Ask/Community 导航完成；npm run build 通过 |
| T-26 | IFC 3D 楼层裁切与施工专业图层筛选 | Codex | [?] | web/src/viewer3d/**、web/src/IfcViewer.tsx、web/src/App.tsx | IFC 完成转换后加载 storeys、按 IFC class 统计 trades 并记录控制台分类计数；镜头 fit 后恢复 controls；答案渲染粗体 Markdown 并移除空工具 JSON 区块。指定 bsc-esplanades_1807-ep-ar-v18.ifc 浏览器验证：7 storeys、Architecture 1987、Structure 86；pytest 53 passed，web build 通过 |
| T-28 | 上传图纸后端（PDF/PNG/JPG/DXF/IFC，≤50MB）：/upload + 路径解析 + 引擎/视觉分发 | Claude | [?] | agent/app.py、agent/uploads.py、agent/drawings.py、agent/engine_adapter.py、tests/test_upload.py | POST /upload 支持 raw/multipart，保存至 CACHE_DIR/uploads/<sha256>.<ext>；/drawing、/file、/ask 严防路径遍历；DXF/IFC 走 engine，图片/PDF 走视觉；pytest 64 passed，web build 通过 |
| A6 | 3D trade-readable IFC model and legend | Codex | [?] | web/src/** | Added per-trade colours/legend, hides empty trades, displays “Only plumbing in this model” when applicable, hides grid and fits model; browser loaded bsc-clinic_clinic-plumbing.ifc and showed only plumbing with levels; pytest 64 passed, web build passed |
| A7 | Answer provenance panel | Codex | [?] | web/src/** | Added default-open collapsible “How I got this” panel with ordered trace, source badge, method, box/element count, engine/LLM time, token usage, estimated Gemini cost, warnings and cache badge; engine shown as 0 tokens/€0; pytest 64 passed, web build passed |
| T-30 | 房间多媒体后端（JPG/PNG/MP4/MOV/PDF，≤50MB）：/collab/media + /collab/media/file + 房间过滤 + 去重防越权 | Claude | [?] | agent/media.py、agent/app.py、tests/test_room_media.py | POST/GET /collab/media 支持多媒体保存与按 space_id 过滤，/collab/media/file 防越权，去重存储；pytest 71 passed |
| B4 | 项目文件区后端（多文档格式，≤50MB）：/files + /files/file + /files (DELETE) + 去重搜索与鉴权 | Claude | [?] | agent/files.py、agent/app.py、tests/test_files.py | POST/GET/DELETE /files 支持文档上传、tag/q检索、本人删除鉴权、防目录穿越；pytest 85 passed |
| T-31 | 共享 3D 场景状态后端：/scene + /scene/placement + /scene/history + 轮询与并发锁 | Claude | [?] | agent/scene.py、agent/app.py、tests/test_scene.py | GET /scene 支持 since_version 轮询，POST/DELETE /scene/placement 版本递增与历史记录，并发写 20 次安全；pytest 94 passed |
| I-1 | 2D 房间点击接口 + 演示数据：GET /plan/rooms + scripts/seed_demo.py | Gemini (CLI) | [?] | agent/plan_rooms.py、scripts/seed_demo.py、tests/test_plan_rooms.py、agent/app.py | GET /plan/rooms 返回 2D 房间像素坐标 (bbox + polygon)，swiss 实测 31 间，IFC 实测 60 间；对接 collab 状态与 media 计数，lru_cache 内存缓存；scripts/seed_demo.py 支持 --reset 重复填充与清理演示数据；tests/test_plan_rooms.py 7 passed |
| T-33 | 上线冒烟测试脚本：scripts/smoke.py + tests/test_smoke.py | Gemini (CLI) | [?] | scripts/smoke.py、tests/test_smoke.py、TASKS.md | 纯标准库 urllib；按序执行 6 步冒烟（health, ask, plan/rooms, scene, docs, web root）；支持 --skip-llm；TestClient 注入测试 4 passed |
| T-34 | Verda 使用日志整篇重写（英文）：docs/verda-log.md | Gemini (CLI) | [?] | docs/verda-log.md、TASKS.md | 严格依据 A 侧全量评测、训练脚本及权重配置真实数字重写为英文；涵盖 A100 训练耗时、双模型留出集指标、零 API 模式、Discord 原文及 write-up 链接 |
| T-35 | 资料空间演示数据 + 启动钩子：scripts/seed_demo.py + agent/serve.py | Gemini (CLI) | [?] | scripts/seed_demo.py、agent/serve.py、tests/test_seed_demo.py、TASKS.md | 资料空间导入 5 封样例邮件（latest/superseded/conflict/pending 4 种状态）；支持幂等与 --reset；SEED_DEMO=1 时 FastAPI startup 自动填充；tests/test_seed_demo.py 4 passed |
| T-36 | 成本和速度报表脚本：scripts/cost_report.py + tests/test_cost_report.py | Gemini (CLI) | [?] | scripts/cost_report.py、tests/test_cost_report.py、TASKS.md | 纯标准库；按 seed 抽样各来源评测，计算正确率（面积 2% 容差）、Zero-LLM 比率、token、每千题成本；支持 --dry-run 与生成 docs/cost-report.md；tests/test_cost_report.py 5 passed |
| T-37 | 建筑师施工协作后端：施工先后规则 + 订货通知 + 增项审批 + 项目设置 | Gemini (CLI) | [?] | agent/workflow.py、agent/app.py、scripts/seed_demo.py、tests/test_workflow.py、TASKS.md | 模块 3/7/9：/workflow/check & blockers、/orders & /calendar & /notifications、/change-orders & /budget（业主 role 鉴权 403）、/project/settings；演示数据 --reset 支持；tests/test_workflow.py 7 passed |
| T-38 | 家具目录扩充 + AI 产品图生成：web/src/catalog.json + web/public/catalog/*.png + scripts/gen_catalog_images.py | Gemini (CLI) | [?] | web/src/catalog.json、web/public/catalog/*.png、scripts/gen_catalog_images.py、TASKS.md | 扩充至 40 件产品（覆盖 living/bedroom/kitchen/bathroom/lighting/office 6 类，每类 5–8 件）；全套 40 张 512x512 纯白底真实 3/4 视角产品摄影图；npm run build 通过 |
| T-39 | AI 推荐产品和工人后端：/recommend/products + /recommend/people | Gemini (CLI) | [?] | agent/recommend.py、agent/app.py、scripts/seed_demo.py、tests/test_recommend.py、TASKS.md | 关键词规则 + Gemini 备用选品、房间尺寸/预算过滤、3D 场景材质匹配优先与人话 reason；工人合作次数、最近时间、冲突后排；tests/test_recommend.py 7 passed |
| T-40 | 房间内构件清单后端与工具：GET /room/contents + room_contents 工具 | Gemini (CLI) | [?] | agent/room_contents.py、agent/tools.py、agent/app.py、agent/agent.py、agent/requirements.txt、tests/test_room_contents.py、TASKS.md | Swiss 点在多边形内与 0.3m 边界判定、米转像素 png_bbox；IFC 空间几何与包围盒判定（ifcopenshell 缓存）；实测 Swiss 厨房 4 件/浴室 5 件、IFC 走廊 37 件/卫生间 1 件；tests/test_room_contents.py 6 passed |
| T-41 | 换新数据集就绪：自动项目卡片 + 上传作为项目 + 数据全体检 + catalog 缓存 | Gemini (CLI) | [?] | agent/catalog.py、agent/uploads.py、agent/plan_rooms.py、agent/app.py、scripts/check_dataset.py、docs/dataset-check.md、tests/test_catalog.py、TASKS.md | 自动根据 DATA_DIR 生成 IFC 与 Swiss 项目卡片并配对图纸；上传文件自动生成项目卡片并在 /plan/rooms 等生效；scripts/check_dataset.py 体检 883 个文件 100% 通过；catalog 缓存响应 <1s；tests/test_catalog.py 5 passed |
| T-42 | Gigi 工作台后端支持：稳定构件 ID + 核验状态接口 + 房间尺寸 + 体检结论优化 | Gemini (CLI) | [?] | agent/engine_adapter.py、agent/media.py、agent/plan_rooms.py、agent/catalog.py、agent/room_contents.py、scripts/check_dataset.py、docs/dataset-check.md、tests/、TASKS.md | ① /ask 稳定 id/label/space_id：Swiss 如 ...#wc-1 / WC-2.18.1 / space_id 2.18；CubiCasa 如 ...#det-toilet-1 / WC-1；Clinic IFC 如 283DPC... / SAN-1；② GET /verify/status + POST /collab/media item_id；③ /plan/rooms dims_m {L, B, H}；④ check_dataset 加 No Crash 与 Has Answer，排除 opening_design 0 count IFC；pytest 全部通过 |
