import { useEffect, useMemo, useRef, useState } from 'react'
import { IsometricCanvas, IsometricPath } from '@elchininet/isometric'
import type { GeometryObject, GeometryRoom, GeometryScene, GeometrySource, PlanPoint } from '../viewer3d/geometryScene'

type SceneLayer = 'architecture' | 'sanitary' | 'hvac' | 'electrical' | 'furniture'
type Point3 = [number, number, number]

interface Props {
  scene: GeometryScene
  onSelectObject?: (id: string) => void
  onSelectRoom?: (room: { id: string; name: string }) => void
  onSelectSource?: (source: GeometrySource) => void
  onBackToFloor?: () => void
  focusRoomId?: string | null
  storeyId?: string | null
  visibleLayers?: Partial<Record<SceneLayer, boolean>>
}

const WIDTH = 1000
const HEIGHT = 560
const COS30 = Math.sqrt(3) / 2
const roomName = (room: GeometryRoom) => room.name || room.number || room.id
const roomCaption = (room: GeometryRoom) => {
  const generic = !room.name || /^room$/i.test(room.name.trim())
  if (room.number) return generic ? `Room ${room.number}` : `${room.name} · Room ${room.number}`
  return roomName(room)
}
const objectKind = (category: string) => {
  const value = category.toLowerCase()
  if (/toilet|\bwc\b/.test(value)) return 'Toilet'
  if (/sink|basin|wash/.test(value)) return 'Sink'
  if (/shower/.test(value)) return 'Shower'
  if (/bath|tub/.test(value)) return 'Bathtub'
  if (/kitchen|stove|cook|oven/.test(value)) return 'Kitchen fixture'
  return category.replace(/[_-]+/g, ' ')
}
const shortName = (value: string, maximum = 22) => value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value
const metric = (scene: GeometryScene) => scene.quality === 'measured' && scene.unit === 'm'
const layerFor = (kind: string): SceneLayer => {
  const value = kind.toLowerCase()
  if (/electric|light|socket|power|cable/.test(value)) return 'electrical'
  if (/hvac|vent|duct|air/.test(value)) return 'hvac'
  if (/toilet|wc|sink|basin|wash|shower|bath|water|drain|plumb|pipe/.test(value)) return 'sanitary'
  if (/chair|table|desk|furniture|cabinet/.test(value)) return 'furniture'
  return 'architecture'
}
const layerVisible = (layer: SceneLayer, visible?: Props['visibleLayers']) => visible?.[layer] !== false
const inStorey = (item: { storeyId?: string }, storeyId?: string | null) => !storeyId || !item.storeyId || item.storeyId === storeyId
const midpoint = (points: PlanPoint[]) => points.reduce(([sx, sz], [x, z]) => [sx + x, sz + z] as PlanPoint, [0, 0] as PlanPoint).map(value => value / Math.max(points.length, 1)) as PlanPoint
const contains = (point: PlanPoint, box: Bounds, padding = 0) => point[0] >= box.minX - padding && point[0] <= box.maxX + padding && point[1] >= box.minZ - padding && point[1] <= box.maxZ + padding

interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }
const emptyBounds = (): Bounds => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity })
const addPoint = (bounds: Bounds, [x, y, z]: Point3) => {
  bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x)
  bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y)
  bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z)
}
const validBounds = (bounds: Bounds) => Number.isFinite(bounds.minX)
const polygonBounds = (polygon: PlanPoint[], y = 0): Bounds => {
  const bounds = emptyBounds(); polygon.forEach(([x, z]) => addPoint(bounds, [x, y, z])); return bounds
}
const overlaps = (a: Bounds, b: Bounds, padding = 0) => a.minX <= b.maxX + padding && a.maxX >= b.minX - padding && a.minZ <= b.maxZ + padding && a.maxZ >= b.minZ - padding

const rotated = (x: number, z: number, degrees = 0): PlanPoint => {
  const radians = degrees * Math.PI / 180
  return [x * Math.cos(radians) - z * Math.sin(radians), x * Math.sin(radians) + z * Math.cos(radians)]
}
const footprint = (object: GeometryObject) => {
  const width = object.footprint?.widthM ?? .55
  const depth = object.footprint?.depthM ?? .55
  const [cx, , cz] = object.position
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([x, z]) => { const [rx, rz] = rotated(x, z, object.rotationDeg); return [cx + rx, cz + rz] as PlanPoint })
}

/**
 * SVG-only isometric view. The library's `(right, left, top)` axes map to
 * Trace's `(x, z, y)`, which gives the requested 30° projection exactly.
 */
export default function IsoSceneSvg({ scene, onSelectObject, onSelectRoom, onSelectSource, onBackToFloor, focusRoomId, storeyId, visibleLayers }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const initialViewBox = useRef(`0 0 ${WIDTH} ${HEIGHT}`)
  const [resetToken, setResetToken] = useState(0)
  const [selected, setSelected] = useState<{ title: string; source?: GeometrySource } | null>(null)
  const measured = metric(scene)

  const drawing = useMemo(() => {
    const architectureVisible = layerVisible('architecture', visibleLayers)
    const focus = focusRoomId ? scene.rooms.find(room => room.id === focusRoomId) : undefined
    const focusBounds = focus ? polygonBounds(focus.polygon, focus.floorYM ?? 0) : undefined
    const includedStoreys = new Set(scene.storeys.filter(storey => !storeyId || storey.id === storeyId).map(storey => storey.id))
    const roomAllowed = (room: GeometryRoom) => architectureVisible && inStorey(room, storeyId) && (!focus || room.id === focus.id)
    const rooms = scene.rooms.filter(roomAllowed)
    const walls = scene.walls.filter(wall => architectureVisible && inStorey(wall, storeyId) && (!focusBounds || overlaps(polygonBounds(wall.points, wall.baseYM), focusBounds, 1.0)))
    const openings = scene.openings.filter(opening => architectureVisible && (!focusBounds || contains([opening.position[0], opening.position[2]], focusBounds, 1.0)))
    const objects = scene.objects.filter(object => inStorey(object, storeyId) && layerVisible(layerFor(object.category), visibleLayers) && (!focus || object.roomId === focus.id || contains([object.position[0], object.position[2]], focusBounds!, .25)))
    const systems = scene.systems.filter(system => inStorey(system, storeyId) && layerVisible(layerFor(system.kind), visibleLayers) && (!focusBounds || system.points.some(([x, , z]) => contains([x, z], focusBounds, .5))))
    const storeyOrder = scene.storeys.filter(storey => includedStoreys.size === 0 || includedStoreys.has(storey.id)).sort((a, b) => a.elevationM - b.elevationM)
    const extraLift = new Map(storeyOrder.map((storey, index) => [storey.id, storeyOrder.length > 1 && !focus ? index : 0]))
    const lift = (id?: string) => extraLift.get(id ?? '') ?? 0
    // Every wall on a generated storey is shown at one coherent visual height.
    // This preserves the plan's real wall network while making an incomplete
    // elevation drawing readable as a buildable 2.5D layout.
    const suppliedStoreyHeight = storeyOrder.length === 1 ? storeyOrder[0]?.heightM : undefined
    const sourceHeights = walls.map((wall) => wall.heightM).filter((height) => height > 0).sort((a, b) => a - b)
    const visualWallHeightM = suppliedStoreyHeight && suppliedStoreyHeight > 0
      ? suppliedStoreyHeight
      : sourceHeights[Math.floor(sourceHeights.length / 2)] ?? 2.7
    const wallHeight = () => visualWallHeightM
    return { focus, focusBounds, rooms, walls, openings, objects, systems, lift, wallHeight, visualWallHeightM }
  }, [focusRoomId, scene, storeyId, visibleLayers])

  useEffect(() => {
    const hostElement = host.current
    if (!hostElement) return
    hostElement.replaceChildren()
    setSelected(null)

    const allBounds = emptyBounds()
    const addPlan = (points: PlanPoint[], y: number) => points.forEach(([x, z]) => addPoint(allBounds, [x, y, z]))
    drawing.rooms.forEach(room => addPlan(room.polygon, (room.floorYM ?? 0) + drawing.lift(room.storeyId)))
    drawing.walls.forEach(wall => { addPlan(wall.points, wall.baseYM + drawing.lift(wall.storeyId)); addPlan(wall.points, wall.baseYM + drawing.wallHeight() + drawing.lift(wall.storeyId)) })
    drawing.openings.forEach(opening => addPoint(allBounds, [opening.position[0], opening.position[1] + opening.heightM + drawing.lift(), opening.position[2]]))
    drawing.objects.forEach(object => { const y = object.position[1] + drawing.lift(object.storeyId); addPlan(footprint(object), y); addPlan(footprint(object), y + (object.heightM ?? .7)) })
    drawing.systems.forEach(system => system.points.forEach(([x, y, z]) => addPoint(allBounds, [x, y + drawing.lift(system.storeyId), z])))
    if (!validBounds(allBounds)) { addPoint(allBounds, [-2, 0, -2]); addPoint(allBounds, [2, 3, 2]) }

    const cx = (allBounds.minX + allBounds.maxX) / 2
    const cz = (allBounds.minZ + allBounds.maxZ) / 2
    const yCenter = (allBounds.minY + allBounds.maxY) / 2
    const projected = (point: Point3) => [
      (point[0] - cx - (point[2] - cz)) * COS30,
      ((point[0] - cx + point[2] - cz) / 2) - (point[1] - yCenter),
    ] as const
    const corners: Point3[] = [[allBounds.minX, allBounds.minY, allBounds.minZ], [allBounds.minX, allBounds.minY, allBounds.maxZ], [allBounds.maxX, allBounds.minY, allBounds.minZ], [allBounds.maxX, allBounds.maxY, allBounds.maxZ]]
    const raw = corners.map(projected)
    const rawWidth = Math.max(...raw.map(([x]) => x)) - Math.min(...raw.map(([x]) => x)) || 1
    const rawHeight = Math.max(...raw.map(([, y]) => y)) - Math.min(...raw.map(([, y]) => y)) || 1
    const scale = Math.max(.1, Math.min(WIDTH * .8 / rawWidth, HEIGHT * .68 / rawHeight, 80))
    const canvas = new IsometricCanvas({ container: hostElement, width: WIDTH, height: HEIGHT, scale, backgroundColor: '#202427' })
    const svg = canvas.getElement() as SVGSVGElement
    svgRef.current = svg
    svg.setAttribute('class', 'iso-scene-svg')
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', drawing.focus ? `2.5D room view for ${roomName(drawing.focus)}` : '2.5D isometric floor view')
    svg.style.width = '100%'; svg.style.height = '100%'; svg.style.touchAction = 'none'
    initialViewBox.current = `0 0 ${WIDTH} ${HEIGHT}`

    const namespace = 'http://www.w3.org/2000/svg'
    const element = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
      const node = document.createElementNS(namespace, tag)
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)))
      return node
    }
    const defs = element('defs')
    const pattern = element('pattern', { id: 'iso-grid', width: 32, height: 32, patternUnits: 'userSpaceOnUse' })
    pattern.append(element('path', { d: 'M 32 0 L 0 0 0 32', fill: 'none', stroke: '#A9AFB0', 'stroke-opacity': .11, 'stroke-width': 1 }))
    defs.append(pattern); svg.insertBefore(defs, svg.children[1] ?? null)
    // The grid is decorative; it must not sit above rooms and swallow their clicks.
    svg.insertBefore(element('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: 'url(#iso-grid)', 'pointer-events': 'none' }), svg.children[2] ?? null)

    const world = ([x, y, z]: Point3) => ({ right: x - cx, left: z - cz, top: y - yCenter })
    const screen = (point: Point3) => {
      const [x, y] = projected(point); return [WIDTH / 2 + x * scale, HEIGHT / 2 + y * scale] as const
    }
    const addPath = (points: Point3[], appearance: { fill: string; opacity?: number; stroke?: string; strokeOpacity?: number; width?: number; dash?: number[] }, data?: { title: string; source?: GeometrySource; click?: () => void }) => {
      if (points.length < 2) return
      const path = new IsometricPath({ autoclose: appearance.fill !== 'none', fillColor: appearance.fill, fillOpacity: appearance.opacity ?? 1, strokeColor: appearance.stroke ?? '#F7F6F2', strokeOpacity: appearance.strokeOpacity ?? .6, strokeWidth: appearance.width ?? 1 })
      const first = world(points[0]); path.moveTo(first.right, first.left, first.top)
      points.slice(1).forEach(point => { const p = world(point); path.lineTo(p.right, p.left, p.top) })
      if (appearance.dash) path.strokeDashArray = appearance.dash
      canvas.addChild(path)
      const node = path.getElement() as SVGPathElement
      if (data) {
        if (data.click) node.dataset.isoClick = 'true'
        node.style.cursor = data.click ? 'pointer' : 'default'
        const title = element('title'); title.textContent = data.title; node.append(title)
        const normalStroke = node.getAttribute('stroke') || '#F7F6F2'
        node.addEventListener('pointerenter', () => { node.setAttribute('stroke', '#E9B949'); node.setAttribute('stroke-width', '2.2') })
        node.addEventListener('pointerleave', () => { node.setAttribute('stroke', normalStroke); node.setAttribute('stroke-width', String(appearance.width ?? 1)) })
        node.addEventListener('click', event => { event.stopPropagation(); setSelected({ title: data.title, source: data.source }); data.click?.() })
      }
      return node
    }
    const addText = (text: string, x: number, y: number, attrs: Record<string, string | number> = {}) => {
      const node = element('text', { x, y, fill: '#A9AFB0', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 12, ...attrs })
      node.textContent = text; svg.append(node); return node
    }
    const addChip = (text: string, at: Point3, color = '#E9B949') => {
      const [x, y] = screen(at); const width = Math.max(56, Math.min(210, text.length * 7.2 + 18)); const group = element('g')
      group.append(element('rect', { x: x + 8, y: y - 27, width, height: 20, rx: 4, fill: '#202427', stroke: color, 'stroke-opacity': .9 }))
      const label = element('text', { x: x + 16, y: y - 13, fill: color, 'font-family': 'IBM Plex Mono, monospace', 'font-size': 10, 'font-weight': 600 }); label.textContent = shortName(text); group.append(label)
      svg.append(group)
    }
    const fixtureIcon = (object: GeometryObject, lift: number) => {
      const category = object.category.toLowerCase(); const [x, y, z] = object.position; const baseY = y + lift + .025
      const footprintPoints = footprint(object).map(([px, pz]) => [px, baseY, pz] as Point3)
      const base = object.confidence !== undefined && object.confidence < .7 ? '#B65B4F' : '#F8FAFC'
      const outline = '#A9AFB0'
      const select = () => onSelectObject?.(object.id)
      const room = object.roomId ? scene.rooms.find((candidate) => candidate.id === object.roomId) : drawing.focus
      const description = [objectKind(category), room ? roomCaption(room) : null].filter(Boolean).join(' · ')
      const metadata = { title: description || object.name || object.category || object.id, source: object.source, click: select }
      if (/toilet|\bwc\b/.test(category)) {
        const w = object.footprint?.widthM ?? .46; const d = object.footprint?.depthM ?? .68
        addPath(footprintPoints, { fill: '#CBD5E1', opacity: .94, stroke: outline, strokeOpacity: .95 }, metadata)
        addPath([[x - w * .3, baseY + .05, z - d * .2], [x + w * .3, baseY + .05, z - d * .2], [x + w * .22, baseY + .05, z + d * .22], [x - w * .22, baseY + .05, z + d * .22]], { fill: base, opacity: .98, stroke: outline, strokeOpacity: .95 }, metadata)
      } else if (/sink|basin|wash/.test(category)) {
        addPath(footprintPoints, { fill: '#475569', opacity: .95, stroke: outline, strokeOpacity: .95 }, metadata)
        const w = object.footprint?.widthM ?? .6; const d = object.footprint?.depthM ?? .42
        addPath([[x - w * .32, baseY + .05, z - d * .25], [x + w * .32, baseY + .05, z - d * .25], [x + w * .22, baseY + .05, z + d * .25], [x - w * .22, baseY + .05, z + d * .25]], { fill: base, opacity: .96, stroke: outline, strokeOpacity: .95 }, metadata)
      } else if (/shower/.test(category)) {
        addPath(footprintPoints, { fill: '#3B4A5A', opacity: .78, stroke: '#A9AFB0', strokeOpacity: .95 }, metadata)
      } else if (/bath|tub/.test(category)) {
        addPath(footprintPoints, { fill: '#CBD5E1', opacity: .95, stroke: outline, strokeOpacity: .95 }, metadata)
        const w = object.footprint?.widthM ?? 1.5; const d = object.footprint?.depthM ?? .7
        addPath([[x - w * .3, baseY + .04, z - d * .22], [x + w * .3, baseY + .04, z - d * .22], [x + w * .22, baseY + .04, z + d * .22], [x - w * .22, baseY + .04, z + d * .22]], { fill: '#202427', opacity: .9, stroke: outline, strokeOpacity: .75 }, metadata)
      } else if (/kitchen|stove|cook|oven/.test(category)) {
        addPath(footprintPoints, { fill: '#64748B', opacity: .96, stroke: outline, strokeOpacity: .95 }, metadata)
      } else {
        addPath(footprintPoints, { fill: '#6B7376', opacity: .9, stroke: outline, strokeOpacity: .85 }, metadata)
      }
      // Labels stay in the inspected room; a whole floor would otherwise be unreadable.
      if (drawing.focus) addChip(description || object.name || object.id, [x, baseY + .1, z], object.confidence !== undefined && object.confidence < .7 ? '#F87171' : '#E9B949')
    }

    // Slab first: a thin union bounding box, as Gigi's floor base.
    const slabY = allBounds.minY - .2
    const slabCorners: PlanPoint[] = [[allBounds.minX, allBounds.minZ], [allBounds.maxX, allBounds.minZ], [allBounds.maxX, allBounds.maxZ], [allBounds.minX, allBounds.maxZ]]
    addPath(slabCorners.map(([x, z]) => [x, slabY, z] as Point3), { fill: '#353C40', opacity: 1, stroke: '#A9AFB0', strokeOpacity: .72 })
    addPath([slabCorners[1], slabCorners[2]].map(([x, z]) => [x, slabY, z] as Point3).concat([ [allBounds.maxX, slabY - .2, allBounds.maxZ], [allBounds.maxX, slabY - .2, allBounds.minZ] ] as Point3[]), { fill: '#252B2F', opacity: 1, stroke: '#A9AFB0', strokeOpacity: .55 })

    drawing.rooms.forEach(room => {
      const y = (room.floorYM ?? 0) + drawing.lift(room.storeyId)
      const selectedRoom = drawing.focus?.id === room.id
      addPath(room.polygon.map(([x, z]) => [x, y, z] as Point3), { fill: selectedRoom ? '#E9B949' : '#2E3338', opacity: selectedRoom ? .58 : .96, stroke: selectedRoom ? '#E9B949' : '#A9AFB0', strokeOpacity: selectedRoom ? 1 : .42, width: selectedRoom ? 2.1 : 1 }, {
        title: `${roomName(room)}${measured && room.areaM2 !== null && room.areaM2 !== undefined ? ` · ${room.areaM2.toFixed(1)} m²` : ''}`,
        source: room.source,
        click: () => onSelectRoom?.({ id: room.id, name: roomName(room) }),
      })
      if (selectedRoom) addChip(roomCaption(room), [...midpoint(room.polygon), y + .08] as Point3)
    })

    // Far walls first means their faces naturally stay behind fixtures.
    drawing.walls.slice().sort((a, b) => midpoint(a.points)[0] + midpoint(a.points)[1] - midpoint(b.points)[0] - midpoint(b.points)[1]).forEach(wall => {
      const y = wall.baseYM + drawing.lift(wall.storeyId); const top = y + drawing.wallHeight()
      for (let index = 1; index < wall.points.length; index++) {
        const [ax, az] = wall.points[index - 1]; const [bx, bz] = wall.points[index]; const length = Math.hypot(bx - ax, bz - az)
        if (!length) continue
        const nx = -(bz - az) / length * wall.thicknessM / 2; const nz = (bx - ax) / length * wall.thicknessM / 2
        const a: Point3 = [ax + nx, y, az + nz], b: Point3 = [bx + nx, y, bz + nz], c: Point3 = [bx - nx, y, bz - nz], d: Point3 = [ax - nx, y, az - nz]
        const au: Point3 = [a[0], top, a[2]], bu: Point3 = [b[0], top, b[2]], cu: Point3 = [c[0], top, c[2]], du: Point3 = [d[0], top, d[2]]
        const detail = { title: wall.id || 'Wall', source: wall.source }
        addPath([a, b, bu, au], { fill: '#D9D4C7', opacity: .58, stroke: '#202427', strokeOpacity: .88 }, detail)
        addPath([b, c, cu, bu], { fill: '#A9AFB0', opacity: .55, stroke: '#202427', strokeOpacity: .82 }, detail)
        addPath([au, bu, cu, du], { fill: '#E8E2D4', opacity: .72, stroke: '#202427', strokeOpacity: .88 }, detail)
      }
    })

    drawing.openings.forEach(opening => {
      const [x, rawY, z] = opening.position; const y = rawY + drawing.lift(); const height = opening.heightM; const radians = opening.rotationDeg * Math.PI / 180
      const dx = Math.cos(radians) * opening.widthM / 2; const dz = Math.sin(radians) * opening.widthM / 2
      const points: Point3[] = [[x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + height, z + dz], [x - dx, y + height, z - dz]]
      const color = opening.kind === 'window' ? '#3B4A5A' : '#2B3A4D'
      addPath(points, { fill: color, opacity: opening.kind === 'window' ? .88 : .96, stroke: '#A9AFB0', strokeOpacity: .95 }, { title: opening.kind === 'window' ? 'Window' : 'Door', source: opening.source })
      if (opening.kind === 'window') addPath([[x, y, z], [x, y + height, z]], { fill: 'none', stroke: '#A9AFB0', strokeOpacity: .9, width: 1.4 })
      else { const [knobX, knobY] = screen([x + dx * .55, y + height * .45, z + dz * .55]); svg.append(element('circle', { cx: knobX, cy: knobY, r: 3, fill: '#E9B949' })) }
    })

    // Wall faces naturally sit above the floor fill. Keep an invisible, topmost
    // room footprint below the MEP / fixture layer so a room stays selectable
    // even where a wall visually overlaps its floor polygon.
    drawing.rooms.forEach(room => {
      const y = (room.floorYM ?? 0) + drawing.lift(room.storeyId) + .002
      const hit = addPath(room.polygon.map(([x, z]) => [x, y, z] as Point3), { fill: '#000000', opacity: 0, stroke: 'none', strokeOpacity: 0 }, {
        title: `Open ${roomName(room)}`,
        source: room.source,
        click: () => onSelectRoom?.({ id: room.id, name: roomName(room) }),
      })
      hit?.setAttribute('pointer-events', 'all')
    })

    drawing.systems.forEach(system => {
      const color = layerFor(system.kind) === 'electrical' ? '#E9B949' : layerFor(system.kind) === 'hvac' ? '#86B7C8' : '#579C87'
      addPath(system.points.map(([x, y, z]) => [x, y + drawing.lift(system.storeyId), z] as Point3), { fill: 'none', stroke: color, strokeOpacity: .9, width: Math.max(1.5, (system.diameterM ?? .03) * scale), dash: [4, 3] }, { title: system.kind, source: system.source })
    })
    drawing.objects.forEach(object => fixtureIcon(object, drawing.lift(object.storeyId)))

    if (measured) {
      // Scale and plan direction are the stable reference; do not carpet the
      // scene with derived length / height labels.
      svg.append(element('path', { d: `M 32 ${HEIGHT - 60} L 82 ${HEIGHT - 60}`, stroke: '#E9B949', 'stroke-width': 3 }))
      addText('1 m', 90, HEIGHT - 56, { fill: '#F7F6F2', 'font-size': 11 })
      const [upX, upZ] = scene.planUpVector ?? [0, 1]; addText(`↑ PLAN UP ${upX || upZ ? '' : '· assumed'}`, WIDTH - 170, 29, { fill: '#A9AFB0', 'font-size': 10 })
    } else addText('ILLUSTRATIVE · NOT TO SCALE', 28, HEIGHT - 24, { fill: '#A9AFB0', 'font-size': 11, 'font-weight': 600 })
    if (drawing.focus) addText(`← FLOOR`, 28, 30, { fill: '#E9B949', 'font-size': 12, 'font-weight': 700 })

    let start: { x: number; y: number; viewBox: number[] } | null = null
    const readViewBox = () => (svg.getAttribute('viewBox') || initialViewBox.current).split(' ').map(Number)
    const onWheel = (event: WheelEvent) => {
      event.preventDefault(); const [x, y, width, height] = readViewBox(); const factor = event.deltaY > 0 ? 1.14 : .88
      const nextWidth = Math.max(240, Math.min(WIDTH * 2.4, width * factor)); const nextHeight = nextWidth * height / width
      const rect = svg.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width; const py = (event.clientY - rect.top) / rect.height
      svg.setAttribute('viewBox', `${x + (width - nextWidth) * px} ${y + (height - nextHeight) * py} ${nextWidth} ${nextHeight}`)
    }
    const onPointerDown = (event: PointerEvent) => { if ((event.target as Element).closest('[data-iso-click]')) return; start = { x: event.clientX, y: event.clientY, viewBox: readViewBox() }; svg.setPointerCapture(event.pointerId) }
    const onPointerMove = (event: PointerEvent) => { if (!start) return; const rect = svg.getBoundingClientRect(); const [x, y, width, height] = start.viewBox; svg.setAttribute('viewBox', `${x - (event.clientX - start.x) / rect.width * width} ${y - (event.clientY - start.y) / rect.height * height} ${width} ${height}`) }
    const stopPointer = () => { start = null }
    svg.addEventListener('wheel', onWheel, { passive: false }); svg.addEventListener('pointerdown', onPointerDown); svg.addEventListener('pointermove', onPointerMove); svg.addEventListener('pointerup', stopPointer); svg.addEventListener('pointercancel', stopPointer)
    return () => { svg.removeEventListener('wheel', onWheel); svg.removeEventListener('pointerdown', onPointerDown); svg.removeEventListener('pointermove', onPointerMove); svg.removeEventListener('pointerup', stopPointer); svg.removeEventListener('pointercancel', stopPointer); hostElement.replaceChildren(); svgRef.current = null }
  }, [drawing, measured, onBackToFloor, onSelectObject, onSelectRoom, onSelectSource, resetToken, scene])

  return <div className="iso-scene-root" style={{ position: 'relative', height: '100%', overflow: 'hidden', background: '#202427' }}>
    <div ref={host} className="iso-scene-host" style={{ height: '100%', width: '100%' }} />
    {drawing.focus && <button type="button" onClick={onBackToFloor} style={{ position: 'absolute', left: 12, top: 10, zIndex: 2, border: '1px solid rgba(233,185,73,.55)', borderRadius: 999, background: 'rgba(32,36,39,.92)', color: '#E9B949', padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>← Floor</button>}
    <div style={{ position: 'absolute', right: 12, bottom: 10, zIndex: 2, border: '1px solid rgba(233,185,73,.45)', borderRadius: 999, background: 'rgba(32,36,39,.92)', overflow: 'hidden' }}><button type="button" onClick={() => setResetToken(token => token + 1)} style={{ color: '#F7F6F2', padding: '6px 12px', fontSize: 11 }}>Reset</button></div>
    {selected && <aside style={{ position: 'absolute', right: 12, top: 10, zIndex: 2, maxWidth: 220, border: '1px solid rgba(169,175,176,.45)', borderRadius: 7, background: 'rgba(32,36,39,.94)', color: '#F7F6F2', padding: '8px 10px', display: 'grid', gap: 6, fontSize: 11 }}><strong>{selected.title}</strong>{selected.source && <button type="button" onClick={() => onSelectSource?.(selected.source!)} style={{ color: '#E9B949', textAlign: 'left' }}>Open source evidence</button>}</aside>}
  </div>
}
