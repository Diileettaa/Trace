# 给 Xinran：共享文件区 + CC 邮箱 + 自然语言稳健性

2026-11-14 14:35 · 来自 B 侧（Diletta / Claude）

两件事：**第 1 件是新功能**（建筑师 Gigi 提的，交给你做）；**第 2 件是 engine 的改动请求**，直接关系到现场评测得分。

---

## 第 1 件：共享文件区 + CC 邮箱归档

### 为什么要做

建筑师的原话：现在许可证、申请表、政府文件、收据都躺在各人的私人邮箱里，要先下载再上传到系统，没人愿意做，所以文件永远不同步。

做法：给每个项目一个专用邮箱。大家跟政府、供应商发邮件时把它放进**抄送（CC）**。系统自动读这个邮箱，把附件归档进项目的文件区，全队可见，不用任何人手动上传。

### 范围（黑客松版本，别做大）

**只做后端。** 前端由 Codex 接。不要碰 `web/`、`agent/agent.py`、`agent/engine_adapter.py`（有人在改）。

新建一个文件 `agent/docs_store.py`，所有逻辑放里面；在 `agent/app.py` 里只加路由，别动已有的路由。

### 数据结构

存储：JSON 存 `CACHE_DIR/docs.json`，文件存 `CACHE_DIR/docs/<sha256>.<ext>`（按内容哈希，自动去重）。

每条记录：

```json
{
  "id": "d1",
  "title": "Building permit 2026-114",
  "category": "permit",
  "author": "Gigi",
  "source": "email",
  "from_email": "permits@helsinki.fi",
  "subject": "Lupapäätös 2026-114",
  "received_at": "2026-11-12T09:31:00+02:00",
  "file": "<sha256>.pdf",
  "kind": "pdf",
  "bytes": 182344,
  "space_id": null,
  "created_at": "2026-11-14T14:40:00+02:00"
}
```

`category` 只收这几个值：`permit` / `application` / `receipt` / `drawing` / `other`。
`source` 只收 `upload` 或 `email`。
`space_id` 可选，用来把文件挂到某个房间（比如 A21），没有就是 null。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/docs?title=&category=&author=&space_id=` | body 是原始文件字节（和现有的 `/upload` 一样的风格），返回新建的那条记录 |
| GET | `/docs?category=&space_id=` | 列表，按 `created_at` 倒序；两个参数都可选 |
| GET | `/docs/file?id=` | 返回文件本身。**必须校验 id，不能让人用 `../` 跳出 `CACHE_DIR/docs`** |
| POST | `/docs/ingest` | 从邮箱拉取新邮件，归档附件，返回新增的记录列表 |
| GET | `/docs/mailbox` | 返回 `{address, mode}`，让前端显示"把这个地址加到抄送"。`mode` 是 `live` 或 `demo` |

### `/docs/ingest` 怎么做

两种模式，用环境变量决定，**不要把任何密码写进代码或提交进 git**：

```
IMAP_HOST=imap.gmail.com
IMAP_USER=project-trace@gmail.com
IMAP_PASS=<应用专用密码>
PROJECT_MAILBOX=project-trace@gmail.com
```

- **live 模式**：上面三个变量齐全时，用 Python 标准库 `imaplib` + `email` 连上去，只读 `UNSEEN` 的邮件，取出每个附件建一条记录（`source="email"`，`from_email` 取发件人，`subject` 取主题，`received_at` 取邮件日期），处理完标记已读。`category` 用主题关键词猜：含 permit/lupa → permit，含 invoice/receipt/kuitti → receipt，含 application/hakemus → application，其余 other。猜不准没关系，前端能改。
- **demo 模式**：变量缺失时，读 `tests/fixtures/emails/*.eml`（你自己造 2–3 个样例，带 PDF 附件）。**返回的记录里 `mode` 必须标成 `demo`**，前端会显示"Demo"标签。评委看到的是真实流程，只是信源是样例文件。

**优先把 demo 模式做出来**，它保证演示一定能跑。live 模式有时间再做；真要做就新注册一个 Gmail，开应用专用密码，别用任何人的私人邮箱。

### 测试

`tests/test_docs_store.py`，要覆盖：上传一条并能取回、按 category 过滤、`../` 跳目录被拒绝、demo 模式 ingest 能从 .eml 里解出附件并建记录、同一个文件上传两次只存一份。

### 提交

分支 `claude/night`。提交信息 `T-31 project documents + email ingest`，并在 `TASKS.md` 末尾加一行 T-31。
**不要读也不要打印 `.env`。不要 push，推送由 Diletta 来做。**

---

## 第 2 件：engine 的自然语言稳健性（重要，直接关系到得分）

### 问题

现在系统里能跑通的题，基本都是数据集自带的那套问法。但评委是**现场即兴提问**，用自己的话、可能换语言。如果 engine 只认得模板化的问法，评委随便换个说法就会返回 None，我们就只能退回去用视觉模型猜——而你的全量评测已经证明，几何和检测模型比视觉模型准得多。**每退回一次，就是白白丢掉一次本来能答对的题。**

### 请你做两件事

**（1）写一份 `docs/engine-questions.md`**，列出 engine 现在支持的全部题型。每种题型写三样：

| 内容 | 例子 |
| --- | --- |
| 类别代号 | `count_doors` |
| 返回的 method 字符串 | `swiss_dxf:doors` |
| 标准问法（英文一条就够） | `How many doors are drawn on this floor plan?` |
| 需要的参数 | 房间号 / 楼层 / 公寓字母 / 无 |

我这边会在 Gemini 层做一个改写：把评委的自由提问改写成你这份文档里的标准问法，再交给 engine。**所以这份清单越准确，我们能答对的题就越多。** 这件事比下面的 (2) 更紧急，先做它。

**（2）让 engine 的问题识别宽容一点**，在不改变返回值的前提下：

- 同义词：toilet / WC / lavatory / 马桶 / WC-istuin / toalett 应该都能认出来；door / doorway / 门；window / 窗；bathroom / washroom / KPH / PH / Bad / bagno。
- 大小写、标点、多余的词（please、can you tell me、在这张图上）都应该忽略。
- 房间号的多种写法：`5.11`、`room 5.11`、`Stanza 5.11`、`locale 5.11`。
- **认不出来时，返回一个明确的信号**，而不是 None 或者先验值。比如：

```python
{"value": None, "method": "unrecognised_question",
 "warnings": ["question not recognised; closest categories: count_doors, count_windows"]}
```

这样我这边就知道该走改写、还是该转去视觉模型，而不是傻等。

**（3）如果有余力**，暴露一个分类函数，让我可以在不跑完整查询的情况下先问一句"你听懂了吗"：

```python
engine.questions.classify(question) -> {"category": "count_doors", "params": {...}, "confidence": 0.0-1.0}
```

有了它，前端就能在用户打字时实时显示"我理解成：这层楼有多少扇门"，评委点一下就确认了——这正好吃到评分里"几秒内能核实"那一项。

### 优先级

1. `docs/engine-questions.md`（今天下午就要，我等着它做改写层）
2. 同义词 + `unrecognised_question` 信号
3. `classify()` 函数
4. 文件区 + CC 邮箱（T-31）

如果时间不够，**(1) 和 (2) 优先于 T-31**。准确率占 25%，文件区只是加分项。

---

## 有问题找我

- 接口字段不清楚、或者你想改字段：先在群里说一声，我这边 adapter 和前端都要跟着改。
- 你那边的 engine 合并（04 文件第 1 步）我今天下午做，做完我会把全量评测结果发给你核对。
