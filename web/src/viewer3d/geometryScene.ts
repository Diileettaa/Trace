import type { PlanRoom, PlanRoomsResult } from '../api'

export type SceneQuality = 'measured' | 'illustrative'
export type SceneSourceKind = 'ifc' | 'vector-drawing' | 'raster-drawing'
export type SceneCoordinateSystem = 'x-right,y-up,z-plan-north' | 'drawing-pixels' | 'image-norm1000' | 'drawing-norm1000'
export type PlanPoint = [number, number]
export type WorldPoint = [number, number, number]

export interface GeometrySource {
  file: string
  page?: number | null
  bbox?: [number, number, number, number]
  guid?: string
  label?: string
}

/** Recognition provenance supplied by the engine; never inferred in the UI. */
export interface GeometryEvidence {
  method?: string
  confidence?: number
  /** True when a dimension (normally a vertical height) is a documented default. */
  assumed?: boolean
}

export interface GeometryRoom extends GeometryEvidence {
  id: string
  name?: string | null
  number?: string | null
  storeyId?: string
  polygon: PlanPoint[]
  floorYM?: number
  heightM?: number
  areaM2?: number | null
  source?: GeometrySource
}

export interface GeometryStorey extends GeometryEvidence {
  id: string
  name: string
  elevationM: number
  heightM?: number
  outline?: PlanPoint[]
  source?: GeometrySource
}

export interface GeometryWall extends GeometryEvidence {
  id: string
  storeyId?: string
  points: PlanPoint[]
  thicknessM: number
  baseYM: number
  heightM: number
  source?: GeometrySource
}

export interface GeometryOpening extends GeometryEvidence {
  id: string
  kind: 'door' | 'window'
  wallId?: string
  position: WorldPoint
  rotationDeg: number
  widthM: number
  heightM: number
  source?: GeometrySource
}

export interface GeometryObject extends GeometryEvidence {
  id: string
  category: string
  name?: string
  storeyId?: string
  roomId?: string
  position: WorldPoint
  rotationDeg?: number
  footprint?: { widthM: number; depthM: number }
  heightM?: number
  source?: GeometrySource
}

/** A routed MEP line; it is rendered only when the engine supplies real points. */
export interface GeometrySystem extends GeometryEvidence {
  id: string
  kind: string
  storeyId?: string
  points: WorldPoint[]
  diameterM?: number
  fromId?: string
  toId?: string
  source?: GeometrySource
}

export interface GeometryScene {
  projectId: string
  sourceKind: SceneSourceKind
  quality: SceneQuality
  /** Exact metric scene: X right, Y up, Z plan north. */
  coordinateSystem: SceneCoordinateSystem
  unit: 'm' | 'px' | 'norm1000'
  warnings: string[]
  storeys: GeometryStorey[]
  rooms: GeometryRoom[]
  walls: GeometryWall[]
  openings: GeometryOpening[]
  objects: GeometryObject[]
  systems: GeometrySystem[]
}

/** A failed scene is never rendered as a plausible-looking measured model. */
export interface GeometrySceneLoadResult {
  scene: GeometryScene | null
  /** Undefined means that the optional geometry endpoint has not been implemented yet. */
  error?: string
}

const hasPolygon = (room: PlanRoom): room is PlanRoom & { polygon_px: PlanPoint[] } =>
  Array.isArray(room.polygon_px) && room.polygon_px.length >= 3

/**
 * This is deliberately an illustrative scene. `/plan/rooms` supplies image
 * pixels, not a calibrated metric coordinate system, so callers must never
 * show metre values or a metric scale bar for this result.
 */
export function illustrativeSceneFromPlanRooms(result: PlanRoomsResult): GeometryScene {
  return {
    projectId: result.path,
    sourceKind: 'vector-drawing',
    quality: 'illustrative',
    coordinateSystem: 'drawing-pixels',
    unit: 'px',
    warnings: [
      ...(result.warnings ?? []),
      'Drawing outlines are displayed in source pixels until a calibrated metric scene is supplied.',
    ],
    storeys: [],
    rooms: result.rooms.filter(hasPolygon).map(room => ({
      id: room.space_id,
      name: room.name,
      number: room.number,
      polygon: room.polygon_px,
      areaM2: room.area_m2,
      source: { file: result.path },
    })),
    walls: [],
    openings: [],
    objects: [],
    systems: [],
  }
}

/** Reject incomplete geometry instead of silently rendering it as measured. */
export function isMeasuredGeometryScene(value: GeometryScene): boolean {
  return value.quality === 'measured'
    && value.unit === 'm'
    && value.coordinateSystem === 'x-right,y-up,z-plan-north'
}

/** Uncalibrated scans may be useful spatial illustrations, never metric models. */
export function isIllustrativeGeometryScene(value: GeometryScene): boolean {
  return value.quality === 'illustrative'
    && (value.unit === 'norm1000' || value.unit === 'px')
    && (value.coordinateSystem === 'image-norm1000' || value.coordinateSystem === 'drawing-norm1000' || value.coordinateSystem === 'drawing-pixels')
}

type JsonRecord = Record<string, unknown>
const record = (value: unknown): JsonRecord | null => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
const text = (value: unknown) => typeof value === 'string' ? value : undefined
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const planarPoint = (value: unknown): PlanPoint | null => Array.isArray(value) && number(value[0]) !== undefined && number(value[1]) !== undefined ? [value[0] as number, value[1] as number] : null
const worldPoint = (value: unknown): WorldPoint | null => Array.isArray(value) && number(value[0]) !== undefined && number(value[1]) !== undefined && number(value[2]) !== undefined ? [value[0] as number, value[1] as number, value[2] as number] : null
const source = (value: unknown): GeometrySource | undefined => {
  const raw = record(value); const file = text(raw?.file)
  if (!raw || !file) return undefined
  const bbox = Array.isArray(raw.bbox) && raw.bbox.length === 4 && raw.bbox.every(item => number(item) !== undefined) ? raw.bbox as [number, number, number, number] : undefined
  return { file, page: number(raw.page) ?? null, bbox, guid: text(raw.guid), label: text(raw.label) }
}
const assumed = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  const flags = record(value)
  return flags && Object.values(flags).some(flag => flag === true) ? true : undefined
}
const evidence = (item: JsonRecord): GeometryEvidence => ({
  method: text(item.method), confidence: number(item.confidence), assumed: assumed(item.assumed),
})
const records = (value: unknown) => Array.isArray(value) ? value.map(record).filter((item): item is JsonRecord => item !== null) : []
const defined = <T,>(value: T | null): value is T => value !== null

/** Converts the engine's snake_case JSON contract to the renderer's camelCase model. */
export function normalizeGeometryScene(value: unknown): GeometryScene | null {
  const raw = record(value)
  if (!raw) return null
  const projectId = text(raw.project_id) ?? text(raw.projectId)
  const sourceKind = text(raw.source_kind) ?? text(raw.sourceKind)
  const quality = text(raw.quality)
  const coordinateSystem = text(raw.coordinate_system) ?? text(raw.coordinateSystem)
  const unit = text(raw.unit)
  if (!projectId || (sourceKind !== 'ifc' && sourceKind !== 'vector-drawing' && sourceKind !== 'raster-drawing')
    || (quality !== 'measured' && quality !== 'illustrative')
    || (coordinateSystem !== 'x-right,y-up,z-plan-north' && coordinateSystem !== 'drawing-pixels' && coordinateSystem !== 'image-norm1000' && coordinateSystem !== 'drawing-norm1000')
    || (unit !== 'm' && unit !== 'px' && unit !== 'norm1000')) return null
  const rooms: GeometryRoom[] = records(raw.rooms).map((item): GeometryRoom | null => {
    const polygon = (Array.isArray(item.polygon) ? item.polygon.map(planarPoint).filter((point): point is PlanPoint => point !== null) : [])
    const id = text(item.id)
    return id && polygon.length >= 3 ? { id, name: text(item.name) ?? null, number: text(item.number) ?? null, storeyId: text(item.storey_id) ?? text(item.storeyId), polygon, floorYM: number(item.floor_y_m) ?? number(item.floorYM), heightM: number(item.height_m) ?? number(item.heightM), areaM2: number(item.area_m2) ?? number(item.areaM2) ?? null, source: source(item.source), ...evidence(item) } as GeometryRoom : null
  }).filter(defined)
  const storeys: GeometryStorey[] = records(raw.storeys).map((item): GeometryStorey | null => {
    const id = text(item.id); const name = text(item.name); const elevationM = number(item.elevation_m) ?? number(item.elevationM)
    const outline = Array.isArray(item.outline) ? item.outline.map(planarPoint).filter((point): point is PlanPoint => point !== null) : undefined
    return id && name && elevationM !== undefined ? { id, name, elevationM, heightM: number(item.height_m) ?? number(item.heightM), outline, source: source(item.source), ...evidence(item) } : null
  }).filter(defined)
  const walls: GeometryWall[] = records(raw.walls).map((item): GeometryWall | null => {
    const points = (Array.isArray(item.points) ? item.points.map(planarPoint).filter((point): point is PlanPoint => point !== null) : [])
    const id = text(item.id); const thicknessM = number(item.thickness_m) ?? number(item.thicknessM); const baseYM = number(item.base_y_m) ?? number(item.baseYM); const heightM = number(item.height_m) ?? number(item.heightM)
    return id && points.length >= 2 && thicknessM !== undefined && baseYM !== undefined && heightM !== undefined ? { id, storeyId: text(item.storey_id) ?? text(item.storeyId), points, thicknessM, baseYM, heightM, source: source(item.source), ...evidence(item) } as GeometryWall : null
  }).filter(defined)
  const openings: GeometryOpening[] = records(raw.openings).map((item): GeometryOpening | null => {
    const id = text(item.id); const kind = text(item.kind); const position = worldPoint(item.position); const rotationDeg = number(item.rotation_deg) ?? number(item.rotationDeg); const widthM = number(item.width_m) ?? number(item.widthM); const heightM = number(item.height_m) ?? number(item.heightM)
    return id && (kind === 'door' || kind === 'window') && position && rotationDeg !== undefined && widthM !== undefined && heightM !== undefined ? { id, kind, wallId: text(item.wall_id) ?? text(item.wallId), position, rotationDeg, widthM, heightM, source: source(item.source), ...evidence(item) } as GeometryOpening : null
  }).filter(defined)
  const objects: GeometryObject[] = records(raw.objects).map((item): GeometryObject | null => {
    const id = text(item.id); const category = text(item.category); const position = worldPoint(item.position); const footprintRaw = record(item.footprint); const footprintWidth = number(footprintRaw?.width_m) ?? number(footprintRaw?.widthM); const footprintDepth = number(footprintRaw?.depth_m) ?? number(footprintRaw?.depthM)
    return id && category && position ? { id, category, name: text(item.name), storeyId: text(item.storey_id) ?? text(item.storeyId), roomId: text(item.room_id) ?? text(item.roomId), position, rotationDeg: number(item.rotation_deg) ?? number(item.rotationDeg), footprint: footprintWidth !== undefined && footprintDepth !== undefined ? { widthM: footprintWidth, depthM: footprintDepth } : undefined, heightM: number(item.height_m) ?? number(item.heightM), source: source(item.source), ...evidence(item) } as GeometryObject : null
  }).filter(defined)
  const systems: GeometrySystem[] = records(raw.systems).map((item): GeometrySystem | null => {
    const id = text(item.id); const kind = text(item.kind); const points = Array.isArray(item.points) ? item.points.map(worldPoint).filter((point): point is WorldPoint => point !== null) : []
    const diameterM = number(item.diameter_m) ?? number(item.diameterM)
    return id && kind && points.length >= 2 ? { id, kind, storeyId: text(item.storey_id) ?? text(item.storeyId), points, diameterM, fromId: text(item.from_id) ?? text(item.fromId), toId: text(item.to_id) ?? text(item.toId), source: source(item.source), ...evidence(item) } : null
  }).filter(defined)
  return { projectId, sourceKind: sourceKind as SceneSourceKind, quality: quality as SceneQuality, coordinateSystem: coordinateSystem as SceneCoordinateSystem, unit: unit as GeometryScene['unit'], warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((warning): warning is string => typeof warning === 'string') : [], storeys, rooms, walls, openings, objects, systems }
}

export function isGeometryScene(value: unknown): value is GeometryScene {
  return normalizeGeometryScene(value) !== null
}

/**
 * Keep the renderer deliberately strict: a partially parsed response must not
 * look like an authoritative measured building.  The engine can still return
 * empty arrays for a discipline that genuinely is absent from a drawing.
 */
export function geometrySceneValidationError(value: unknown, scene: GeometryScene | null): string | null {
  const raw = record(value)
  if (!raw || !scene) return 'Expected a metric geometry scene with its coordinate system and unit declared.'
  for (const key of ['rooms', 'walls', 'openings', 'objects']) {
    if (!Array.isArray(raw[key])) return `Geometry scene is missing the required ${key} array.`
  }
  if (scene.quality === 'measured' && !isMeasuredGeometryScene(scene)) return 'Measured geometry must use metres and x-right, y-up, z-plan-north coordinates.'
  if (scene.quality === 'illustrative' && !isIllustrativeGeometryScene(scene)) return 'Illustrative geometry must declare norm1000 or drawing-pixel coordinates.'
  if (scene.rooms.length + scene.walls.length + scene.openings.length + scene.objects.length === 0) {
    return 'Geometry scene contains no rooms, walls, openings, or objects.'
  }
  if (records(raw.rooms).length !== scene.rooms.length
    || records(raw.walls).length !== scene.walls.length
    || records(raw.openings).length !== scene.openings.length
    || records(raw.objects).length !== scene.objects.length) {
    return 'Geometry scene contains one or more incomplete coordinates or dimensions.'
  }
  if (scene.walls.some(wall => wall.thicknessM <= 0 || wall.heightM <= 0)
    || scene.openings.some(opening => opening.widthM <= 0 || opening.heightM <= 0)
    || scene.objects.some(item => item.confidence !== undefined && (item.confidence < 0 || item.confidence > 1))) {
    return 'Geometry scene contains invalid metric dimensions or confidence values.'
  }
  return null
}

/** The route is intentionally separate from `/api/scene`, which stores shared placements. */
export async function loadGeometryScene(path: string, page = 1): Promise<GeometrySceneLoadResult> {
  const query = new URLSearchParams({ path, page: String(page) })
  try {
    const response = await fetch(`/api/geometry/scene?${query}`)
    // The route is optional until Xinran's geometry exporter lands.  A missing
    // route is a normal fallback case, not an error shown to the user.
    if (response.status === 404) return { scene: null }
    if (!response.ok) return { scene: null, error: `Geometry source is unavailable (HTTP ${response.status}).` }
    const value: unknown = await response.json()
    const scene = normalizeGeometryScene(value)
    const error = geometrySceneValidationError(value, scene)
    return error ? { scene: null, error } : { scene }
  } catch {
    return { scene: null, error: 'Geometry source could not be read.' }
  }
}
