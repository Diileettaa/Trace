# 28 给 Gemini CLI：Gigi 工作台需要的后端（11/14 20:10）

配合 Codex 25 号（三栏工作台：三张卡 ①房间 L×B×H ②Objects found ③「x/y verified」，构件编号框，Verify on Site 上传照片）。
只改 agent/（不改 engine/）、tests/、TASKS.md、README 接口表。不碰 web/。不读 .env。不 push。每项单独 commit。

## 1. /ask 构件带稳定 id + 所属房间
- evidence[].items 每项保证有 `id`（同一文件同一构件每次相同，重启后也相同）和 `space_id`/`room_name`（能算出就填，算不出给 null）
- IFC：id 用 GlobalId；swiss DXF：`<path>#<category>-<n>`（按坐标排序后编号，保证稳定）；扫描图检测：`<path>#det-<category>-<n>`（按 bbox 左上排序）
- 每项加 `label`：给图纸显示用的短编号，如 `WC-208.1`（类别缩写-房间号.序号；无房间号用 `WC-1`）
- 测试：同一题问两次 id 完全相同

## 2. GET /verify/status?path=&ids=a,b,c
- 一次返回 `{ids:{<id>:{verified:bool, photos:n, latest:{url,ts,author}|null}}, verified:x, total:y}`
- 数据来源：/collab/media 已有的照片（POST /collab/media 需支持 `item_id` 字段；没有就加上，旧数据兼容）
- 测试：POST 一张照片挂到某 id → verified 从 false 变 true，x 加 1

## 3. /plan/rooms 增加尺寸
- 每个房间加 `dims_m: {L, B, H|null}`（多边形包围盒，米，保留 2 位）；IFC 有层高就填 H，否则 null
- 没比例尺的扫描图：dims_m=null，不要瞎算

## 4. 体检结论（来自 docs/dataset-check.md）
- 报告的「Q&A pass 100%」只代表不报错，不代表答对。把列名改成「No crash」，再加一列「有答案」（返回数字/非空的比例）
- opening_design 里 0 count 的 IFC（stairs、colored_shapes、bad IFC）在 catalog 自动项目里排除或排到最后，别出现在精选

## 验收
- pytest 全过；在线下对 swiss、cubicasa、clinic IFC 各问一题，贴出 items 的 id/label/space_id 示例到 TASKS.md
- 完成后告诉 Diletta
