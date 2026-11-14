# 06 给 Gemini CLI：文件区后端 B4（11/14 15:00）

只改 agent/files.py（新建）、agent/app.py（加路由）、tests/test_files.py（新建）、TASKS.md。
不碰 engine/、web/、agent/engine_adapter.py、agent/agent.py。不读 .env。不 push。

## 要做
项目文件区：大家上传图纸、合同、清单等文档，所有人可见。照抄 agent/media.py 的写法（SHA-256 去重、路径校验）。

- POST /files?author=&role=&title=&tags=&filename=   请求体为文件原始字节
  - 允许：.pdf .png .jpg .jpeg .dxf .ifc .docx .xlsx .csv .txt；≤50MB
  - 存到 CACHE_DIR/files/<sha256>.<ext>，元数据写 CACHE_DIR/files.json
  - 记录：{id, title, filename, author, role, tags[], size, kind, created_at}
- GET /files?tag=&q=   列表，新的在前；q 按 title/filename 模糊匹配
- GET /files/file?id=   下载，正确的 Content-Type；目录穿越返回 400 或 404
- DELETE /files?id=&author=   只有上传者本人能删（author 一致），否则 403
- 演示数据：没有任何文件时，GET /files 返回空列表即可，不要造假数据

## 验收
- pytest 全部通过（Linux 和 Windows 都要过：目录穿越测试允许 400 或 404）
- commit 信息：`B4 files area backend`
