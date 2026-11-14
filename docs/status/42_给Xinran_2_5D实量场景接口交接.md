# 42 给 Xinran：2.5D 实量场景数据接口交接

## 目的

Trace 需要把 IFC、DXF/SVG、矢量 PDF 和已校准的扫描图识别结果，转换成一个可交互的 **2.5D 实量场景**：平面轮廓拉高为墙，构件用统一图标/低模表示，但墙、房间、门窗、构件和机电路径的位置、方向和比例必须来自原始资料。

这不是新的问答 solver。问答、数量、来源证据仍由 `engine.tools` 负责；本接口只提供可视化所需的几何和定位数据。

## 第一版范围

必须支持：

- 楼层、房间轮廓、墙、门、窗
- WC、洗手盆两类卫生构件（可扩展到灯、插座、淋浴等）
- 原图页码和区域 / IFC GUID 的双向证据
- 如果资料存在：给水、排水、电气、HVAC 的路径线

第一版不做：

- 从没有比例或坐标的照片“猜”出精确尺寸
- 逼真的室内漫游、爆炸、飞入、全屏距离标注
- 取代已有的答题、计数或 OCR 引擎

## 坐标和单位（必须统一）

所有输出必须使用：

- `unit: "m"`（米）
- 世界坐标为 `X` 向东 / 画面右，`Y` 向上，`Z` 向北 / 图纸上方；这与当前 IFC Viewer 的 Y-up 一致。
- 平面多边形使用 `[[x, z], ...]`；三维位置使用 `[x, y, z]`。
- 同一项目、同一楼层的 IFC、图纸和构件必须使用同一原点和旋转；不得每种构件自带一套局部坐标。
- 所有点、长度、厚度、宽高都用米，不能混入毫米或像素。

扫描图只有在给出可靠 `m_per_px`、原点和旋转后才能标记为 `measured`。否则必须标记为 `illustrative`，并在 `warnings` 写明原因。

## 建议 API

```text
GET /api/geometry/scene?path=<source path>&page=<optional page>
```

也可先以本地 JSON / engine function 交付；前端不依赖传输方式。响应格式字段可以增加，但不要改名。注意：现有 `/api/scene` 已用于多人家具摆放状态，不能复用。

```json
{
  "project_id": "duplex",
  "source_kind": "ifc",
  "unit": "m",
  "coordinate_system": "x-right,y-up,z-plan-north",
  "quality": "measured",
  "warnings": [],
  "sources": [
    {"file": "data/duplex/model.ifc", "page": null}
  ],
  "storeys": [
    {
      "id": "storey-guid-or-stable-id",
      "name": "Level 02",
      "elevation_m": 3.2,
      "height_m": 2.7,
      "outline": [[0, 0], [12, 0], [12, 8], [0, 8]],
      "source": {"file": "data/duplex/plan.pdf", "page": 2, "bbox": [0, 0, 1000, 800]}
    }
  ],
  "rooms": [
    {
      "id": "ifc-space-guid",
      "name": "Bathroom 208",
      "number": "R 2.08",
      "storey_id": "storey-guid-or-stable-id",
      "polygon": [[0, 0], [3.2, 0], [3.2, 2.4], [0, 2.4]],
      "floor_y_m": 3.2,
      "height_m": 2.7,
      "area_m2": 7.68,
      "label_point": [1.6, 3.2, 1.2],
      "source": {"file": "data/duplex/plan.pdf", "page": 2, "bbox": [100, 200, 360, 390]}
    }
  ],
  "walls": [
    {
      "id": "wall-guid-or-stable-id",
      "storey_id": "storey-guid-or-stable-id",
      "points": [[0, 0], [3.2, 0]],
      "thickness_m": 0.15,
      "base_y_m": 3.2,
      "height_m": 2.7,
      "source": {"file": "data/duplex/model.ifc", "page": null, "guid": "wall-guid"}
    }
  ],
  "openings": [
    {
      "id": "door-guid-or-stable-id",
      "kind": "door",
      "wall_id": "wall-guid-or-stable-id",
      "position": [1.1, 3.2, 0],
      "rotation_deg": 90,
      "width_m": 0.9,
      "height_m": 2.1,
      "source": {"file": "data/duplex/model.ifc", "page": null, "guid": "door-guid"}
    }
  ],
  "objects": [
    {
      "id": "WC-208.1",
      "guid": "optional-ifc-guid",
      "category": "toilet",
      "name": "WC 208.1",
      "storey_id": "storey-guid-or-stable-id",
      "room_id": "ifc-space-guid",
      "position": [0.8, 3.2, 1.3],
      "rotation_deg": 90,
      "footprint": {"width_m": 0.38, "depth_m": 0.7},
      "height_m": 0.42,
      "confidence": 0.96,
      "source": {"file": "data/duplex/plan.pdf", "page": 2, "bbox": [150, 240, 180, 280], "label": "WC-208.1"}
    }
  ],
  "systems": [
    {
      "id": "water-route-01",
      "kind": "water",
      "storey_id": "storey-guid-or-stable-id",
      "points": [[0, 5.4, 0], [1, 5.4, 0], [1, 5.4, 2]],
      "diameter_m": 0.025,
      "source": {"file": "data/duplex/plumbing.pdf", "page": 4, "bbox": [200, 180, 410, 290]}
    }
  ]
}
```

## 你需要交付的内容（按顺序）

### A. 坐标归一化与场景导出（最高优先级）

1. 为 IFC 导出一个真实项目的一层，填充 `storeys / rooms / walls / openings / objects`。
2. 房间、墙、门、窗、WC、洗手盆的 ID 应尽量是 IFC GUID；没有 GUID 的图纸对象给稳定 ID。
3. 在 Tallinn、FZK、Duplex 至少各人工对一个房间：房间轮廓、门窗、WC 的世界坐标与模型/图纸一致。
4. 每个对象保留 `source.file/page/bbox/guid`。`bbox` 是前端 `/drawing` 所展示 PNG 的像素坐标。

### B. 矢量图纸导出

1. DXF/SVG/矢量 PDF：输出墙线、房间多边形、门窗、构件位置、比例尺、原点、旋转。
2. 识别到的图层写入对象 `category` 或 `systems.kind`：`architecture / plumbing / electrical / hvac`。
3. 不能确定的图元保留但写 `confidence < 0.7`；不要强行归类。

### C. 扫描 PDF 导出

1. 输出识别框/轮廓之外，还需输出标定：图纸比例、像素原点、旋转、`m_per_px`。
2. 缺少尺度或参照尺寸：`quality: "illustrative"`，不得输出伪精确米制数。
3. 每个识别对象需 `id/category/position-or-polygon/source/confidence`。

### D. 机电图层（后续）

1. 给排水、电力、暖通用同一世界坐标导出路径点 `points`。
2. 线路/管线连接对象时，填可选 `from_id / to_id`。
3. 没有可靠向量路径时，输出原图证据，不要求虚构 3D 管线。

## 每阶段验收

### 交付 1：一个房间

- 一间卫生间的房间多边形、墙、门、窗、WC、洗手盆。
- 坐标为米，带来源。
- 人工比对原图后，墙体和构件位置无明显偏移。

### 交付 2：一层

- 一层所有房间、墙、门窗和上述卫生构件。
- 房间之间的相对位置正确，楼层轮廓正确。
- 至少一个对象可以从 3D 跳到原图证据。

### 交付 3：专业图层

- 同一层至少一条给排水或电力路径，坐标与该层建筑底图对齐。

## 我们接手后的责任

- 读取本接口，渲染清晰的 2.5D 建筑底图（房间、墙、门窗）。
- 使用统一的 WC、洗手盆、门窗、灯具等符号/低模，根据 `position / rotation / footprint` 摆放。
- 提供旋转、缩放、楼层/房间选择、建筑/给排水/电力/HVAC 图层开关。
- 画面只保留左侧比例尺、北向；尺寸仅在点选单个对象时按需显示。
- 绑定每个图元的来源，做 2D 图纸 ↔ 2.5D 场景的双向定位。
- `quality: illustrative` 或低置信度对象在界面明确标注，不能呈现为实量结果。

## 共同确认项

在开始一层集成前，双方确认：

1. 一个真实项目和一个具体楼层作为首个验收样本。
2. 坐标轴、原点、单位、门窗旋转方向。
3. WC / sink / door / window 的最小类别字典和统一图标。
4. 哪些扫描图有可信比例，哪些只能展示为示意。
5. 交付 1 的 JSON 与原图人工叠加核对通过后，才扩大到整层和机电。

## 15 Nov Plan 11 对接补充（已确认）

`scene_pdf` / `scene_scan` 可以是引擎内部函数名；浏览器端的公开路由仍使用
`GET /api/geometry/scene?path=&page=`，避免与已有的协作摆放状态 `/api/scene` 冲突。

每个由规则、模型或人工识别得到的 `rooms / walls / openings / objects / systems` 元素可额外带：

```json
{"method": "vector-symbol-cluster", "confidence": 0.91, "assumed": false}
```

- `method` 是实际采用的方法，例如 `vector-symbol-cluster`、`scan-wall-mask` 或
  `cubicassa-fallback`，不是前端猜测的文字。
- `confidence` 只能是 `0..1`；低于 `0.7` 的构件会显示为待复核符号。
- 平面图没有提供高度时，使用 2.7m / 2.1m 等默认值必须将相关元素标为
  `assumed: true`；前端会显示 “default height”。
- `systems` 是可选数组。只有有可靠路径点时才输出 `water / drain / electrical / hvac`
  路径；前端会按已有图层开关渲染，绝不补画未识别的管线。
- `storeys` 是可选数组；有时输出 `id / name / elevation_m / height_m / outline / source`，
  前端将把它接入现有楼层选择器。

### 证据 bbox 的不可变规则

Plan 11 提到 PDF point 与 norm1000，它们可以保留为引擎内部调试字段，但 `source.bbox`
必须最终换算成 `GET /drawing?path=&page=` 所显示 PNG（150 dpi）的像素坐标。这是 Trace
所有问答和 2D 高亮共用的格式；若没有该换算，前端只会保留 3D 选择，不会跳转一个可能错位的
原图框。

### 已接好前端范围

- 实量场景校验：缺坐标、单位、尺寸、数组或有非法置信度时拒绝展示为 measured。
- WC、sink、shower、bathtub、door、window 的统一低模会采用 `position / rotation_deg /
  footprint / height_m`；该图标不是识别结果本身。
- 低置信度与默认高度会明确标注；用户点击带有 PNG bbox 的构件会回到该页原图并高亮框。
- `architecture / sanitary / electrical / hvac` 开关、`storeys` 和真实 `systems` 路径已可读取。
