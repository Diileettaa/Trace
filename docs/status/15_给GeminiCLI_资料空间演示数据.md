# 15 给 Gemini CLI：资料空间的演示数据（11/14 17:20）

只改 scripts/seed_demo.py、agent/serve.py（只加启动钩子）、tests/test_seed_demo.py（新建）、TASKS.md。不读 .env。不 push。

## 1. seed_demo.py 加资料库演示数据
- 把 tests/fixtures/emails/*.eml（Xinran 写的 5 封样例邮件：两版图纸、未知发件人的许可、转发重复件、同版本冲突）依次 POST 进 /docs/ingest 对应的函数（直接调用 agent.docs_api.handle 或 docs_store，不走网络）
- 这样资料空间里会有：Current、Replaced、Needs a decision、Waiting for approval 各种状态
- 只在资料库里还没有这些文件时导入（可重复运行）；--reset 时清掉它们再导入
- 邮件主题前面不用加 "Demo:"，但 project 名设为 "Demo project"

## 2. 线上启动时自动填演示数据
Cloud Run 每次重启 CACHE_DIR 都是空的。
- agent/serve.py：环境变量 SEED_DEMO=1 时，启动时（FastAPI startup 事件）跑一次 seed_demo（房间状态、留言、家具摆放、资料库），出错只打印日志，不影响启动
- 本地开发不受影响（默认不跑）

## 验收
- pytest 全部通过
- 本地 `SEED_DEMO=1 uvicorn agent.serve:app` 启动后 GET /api/docs 能看到这些文件，状态各不相同
- commit 信息：`demo seed: document store samples + SEED_DEMO on startup`
