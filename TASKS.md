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
| T-26 | IFC 3D 楼层裁切与施工专业图层筛选 | Codex | [?] | web/src/viewer3d/**、web/src/IfcViewer.tsx | npm run build 通过；pytest 41 passed；默认全楼显示；缺少 MEP 时显示说明 |
