# 12 给 Gemini CLI：Verda 使用日志（11/14 16:50）

只改 docs/verda-log.md（整篇重写成英文）和 TASKS.md。不碰代码。不读 .env。不 push。

## 素材（只用这些，不要编数字）
- Xinran 仓库的文件，用 `git show FETCH_HEAD:<path>` 读（先 `git fetch origin main`）：
  - `docs/04-B侧调整指令.md`：第 0 节（YOLO vs Gemini vs 先验的对比表）、第 7 节（Verda 提交说明、Discord 帖原文、write-up 链接）、第 12 节（房间模型、零 API 模式）
  - `train/train.sh`、`train/setup.sh`、`train/cubicasa_to_yolo.py`：训练怎么跑的
  - `train/report_rooms/results.csv`：房间模型每个 epoch 的指标
  - `models/detector.json`、`models/rooms.json`：模型配置
- 本仓库 `docs/eval-results.md`：最终准确率

## 结构
1. Idea：为什么需要 GPU（通用视觉大模型数门只有 37%，需要专门训练的检测模型）
2. Why Verda：A100 80GB，按小时，1 小时训完（写素材里有的理由，没有就写「not recorded」）
3. Process log 表格：时间 | 做了什么 | Verda 产品 | 耗时 / 成本 | 问题与处理。只填素材里能找到的；找不到的格子写「not recorded」
4. Results：两个模型（门窗洁具、房间）在留出测试集上的数字；零 API 模式 79.9% vs 带 Gemini 83.6%
5. Scaling to real users
6. Links：write-up 链接（04 第 7 节），Discord 帖原文放在代码块里

## 验收
- 每个数字都能在上面的素材里找到出处
- commit 信息：`docs: Verda log`
