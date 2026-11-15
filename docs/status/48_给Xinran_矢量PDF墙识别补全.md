# 48 给 Xinran：矢量 PDF 的 2.5D 缺墙（演示最急，约 30 分钟）

现象：`scene_pdf` 只把"涂黑的实心墙"当墙。很多图纸墙是空心双线（轮廓线），结果整张图只有几段墙。
实测 Tallinn 4 层平面（`ifc_models/...plan-04-4-korrus.pdf`）：scene_pdf 1.8 s → walls 3、rooms 39、openings 39、objects 19（6 种符号未命名）。
同一页走 `scene_scan`：17.9 s → walls 189、rooms 56，但只有 0–1000 图像单位（illustrative）。
（这张图我们后端已改成用 IFC 的第 4 层，所以 Tallinn 没问题；问题在没有 IFC 的纯 PDF 图纸：Sports Complex、CTR、1810 S Park、Vacation Rental。）

请做（业界做法，Raster-to-Vector / CubiCasa / FloorplanToBlender3d 都是这两步）：
1. 矢量墙：在 PDF 线条里找"平行双线对"——两条平行、重叠长度 > 0.5 m、间距 0.08–0.5 m（按图纸比例换成米）的线段 → 一段墙（中线 + 厚度）；端点就近合并成连续墙。
2. 兜底：如果第 1 步的墙仍 < 10 段，就用 `scene_scan` 同一页的墙（你现有的粗线检测），用这页的 PDF→米 变换（scale 已从图签读出）换成米，`method` 标 `scan_on_vector_page`，`confidence` 0.6。
3. 符号：有 key 时把 6 类重复符号命名（toilet / sink / shower / bath / stove …），`objects` 带 kind，前端会画成对应图标。
4. 墙高没有时给 `height_m = null`，前端按 3.0 m 画并标"assumed"。

验收：Sports Complex A-101（`Models/2D/Sports Complex - Sheet - A-101 - First Floor Plan.pdf`）、CTR 一张平面 → walls ≥ 50，rooms 有名字，toilets 有 kind。完成推仓库告诉 Diletta，我当场合并。
