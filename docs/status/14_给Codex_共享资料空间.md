# 14 给 Codex：Project 页的共享资料空间做成好用的「云盘」（11/14 17:20）

背景：这一块不只是邮件，是整个项目共用的资料空间（图纸、许可、报告）。Xinran 的后端已接在 /docs（接口见 docs/06-B侧接口总表.md 第 5 节）。
现在的 DocsLibrary.tsx 是一张表，不直观。只改 web/。不读 .env。不 push。每项单独 commit。

## 1. 布局像网盘（P0）
- 左栏「文件夹」：All files · Architecture · Structural · HVAC · Electrical · Fire · Permits · Needs attention（conflict + pending），每个后面带数量；点了就按 discipline / permit / status 过滤（GET /docs 支持 discipline=、permit=、status=）
- 中间：文件卡片网格（也可切换成列表）。卡片：文件类型图标、文件名、版本号大字（Rev C）、状态标签、谁传的、多久以前（"2 h ago"）
- 右栏：点卡片后显示预览（PDF/图片直接显示，用 /docs/file?id=）、版本时间线（/docs/versions）、操作记录（/docs/events）
- 顶部一个大的拖放区：「Drop drawings, permits or reports here」，也可以点击选文件；上传后显示回执（POST /docs 返回的 status + reason，用一句人话说出来）

## 2. 状态说人话（P0）
- latest →「Current」绿色
- superseded →「Replaced by Rev X」灰色，点它跳到新版本
- conflict →「Needs a decision: two different files claim the same revision」红色，旁边按钮 Keep this one / Reject
- pending →「Waiting for approval」黄色，按钮 Approve / Reject
- rejected →「Rejected」划线
- 每个状态标签鼠标悬停有一句解释

## 3. 和问答连起来（P1）
- 图纸卡片上放「Ask about this drawing」：跳到 Ask 页，把这个文件填进 Drawing 框（数据集里的文件用它的数据集路径；资料库自己的文件走后端 ask_drawing，Gemini 在 Ask 页自动会用）
- Ask 页问「Which revision of A-101 is current?」这类问题，Gemini 现在会调 search_docs，回答里出现的文件名做成可点的链接，点了打开资料空间并选中它

## 4. 邮件入口说明（P1）
- 顶部一行：「Send or CC files to the project mailbox and they are filed here automatically, with revision tracking.」
- 真实邮箱还没配置：GET /docs/mailbox 返回 503 时，显示灰色「Mailbox not connected yet (demo uses sample e-mails)」，不要报错

## 验收
- npm run build 通过
- 手测：上传 A-101_revB.pdf 再上传 A-101_revC.pdf，Rev B 卡片显示「Replaced by Rev C」；点 Needs attention 能看到冲突文件
