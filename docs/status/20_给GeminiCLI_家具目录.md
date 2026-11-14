# 20 给 Gemini CLI：家具目录扩充 + 产品图（11/14 18:10）

先做完 19 号再做这个。只改 web/src/catalog.json、新建 web/public/catalog/*.png、scripts/gen_catalog_images.py、TASKS.md。不读 .env 的内容（脚本从环境变量读 GEMINI_API_KEY）。不 push。

## 1. 扩充目录（web/src/catalog.json）
- 先读现有格式（15 件），保留已有字段和 id，不要改名（前端在用）
- 加两个字段：`category`（living | bedroom | kitchen | bathroom | lighting | office）、`image`（"/catalog/<id>.png"）
- 扩充到约 40 件，每类 5–8 件；价格、尺寸（mm）、材质、颜色要合理；全部是虚构的通用产品，**不要用真实品牌名或型号**
- 已有的 mount（floor/ceiling/wall）规则照旧

## 2. 产品图（scripts/gen_catalog_images.py）
- 用 Gemini 图像生成（模型名用环境变量 GEMINI_IMAGE_MODEL，默认用 agent/render.py 里正在用的那个图像模型），每件生成一张 512×512 的产品图：白色背景、正面 3/4 视角、产品摄影风格，提示词由名字 + 材质 + 颜色 + 尺寸组成；不要文字、不要商标
- 存到 web/public/catalog/<id>.png；已存在的跳过（可重复运行）；失败的打印出来，不中断
- 跑一遍生成全部图片，图片一起 commit

## 验收
- `npm run build` 通过（JSON 合法）
- 40 张图都在；随机打开 3 张看一下是产品图而不是乱码
- commit 信息：`demo furniture catalog: 40 items with categories and generated product images`
