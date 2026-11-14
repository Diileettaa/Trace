import type { PlanRoom, PlanRoomsResult } from '../api'

export type SceneQuality = 'measured' | 'illustrative'
export type SceneSourceKind = 'ifc' | 'vector-drawing' | 'raster-drawing'
export type PlanPoint = [number, number]
export type WorldPoint = [number, number, number]

export interface GeometrySource {
  file: string
  page?: number | null
  bbox?: [number, number, number, number]
  guid?: string
  label?: string
}

export interface GeometryRoom {
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

export interface GeometryWall {
  id: string
  storeyId?: string
  points: PlanPoint[]
  thicknessM: number
  baseYM: number
  heightM: number
  source?: GeometrySource
}

export interface GeometryOpening {
  id: string
  kind: 'door' | 'window'
  wallId?: string
  position: WorldPoint
  rotationDeg: number
  widthM: number
  heightM: number
  source?: GeometrySource
}

export interface GeometryObject {
  id: string
  category: string
  name?: string
  storeyId?: string
  roomId?: string
  position: WorldPoint
  rotationDeg?: number
  footprint?: { widthM: number; depthM: number }
  heightM?: number
  confidence?: number
  source?: GeometrySource
}

export interface GeometryScene {
  projectId: string
  sourceKind: SceneSourceKind
  quality: SceneQuality
  /** Exact metric scene: X right, Y up, Z plan north. */
  coordinateSystem: 'x-right,y-up,z-plan-north' | 'drawing-pixels'
  unit: 'm' | 'px'
  warnings: string[]
  rooms: GeometryRoom[]
  walls: GeometryWall[]
  openings: GeometryOpening[]
  objects: GeometryObject[]
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
  }
}

/** Reject incomplete geometry instead of silently rendering it as measured. */
export function isMeasuredGeometryScene(value: GeometryScene): boolean {
  return value.quality === 'measured'
    && value.unit === 'm'
    && value.coordinateSystem === 'x-right,y-up,z-plan-north'
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
    || (coordinateSystem !== 'x-right,y-up,z-plan-north' && coordinateSystem !== 'drawing-pixels')
    || (unit !== 'm' && unit !== 'px')) return null
  const rooms: GeometryRoom[] = records(raw.rooms).map((item): GeometryRoom | null => {
    const polygon = (Array.isArray(item.polygon) ? item.polygon.map(planarPoint).filter((point): point is PlanPoint => point !== null) : [])
    const id = text(item.id)
    return id && polygon.length >= 3 ? { id, name: text(item.name) ?? null, number: text(item.number) ?? null, storeyId: text(item.storey_id) ?? text(item.storeyId), polygon, floorYM: number(item.floor_y_m) ?? number(item.floorYM), heightM: number(item.height_m) ?? number(item.heightM), areaM2: number(item.area_m2) ?? number(item.areaM2) ?? null, source: source(item.source) } as GeometryRoom : null
  }).filter(defined)
  const walls: GeometryWall[] = records(raw.walls).map((item): GeometryWall | null => {
    const points = (Array.isArray(item.points) ? item.points.map(planarPoint).filter((point): point is PlanPoint => point !== null) : [])
    const id = text(item.id); const thicknessM = number(item.thickness_m) ?? number(item.thicknessM); const baseYM = number(item.base_y_m) ?? number(item.baseYM); const heightM = number(item.height_m) ?? number(item.heightM)
    return id && points.length >= 2 && thicknessM !== undefined && baseYM !== undefined && heightM !== undefined ? { id, storeyId: text(item.storey_id) ?? text(item.storeyId), points, thicknessM, baseYM, heightM, source: source(item.source) } as GeometryWall : null
  }).filter(defined)
  const openings: GeometryOpening[] = records(raw.openings).map((item): GeometryOpening | null => {
    const id = text(item.id); const kind = text(item.kind); const position = worldPoint(item.position); const rotationDeg = number(item.rotation_deg) ?? number(item.rotationDeg); const widthM = number(item.width_m) ?? number(item.widthM); const heightM = number(item.height_m) ?? number(item.heightM)
    return id && (kind === 'door' || kind === 'window') && position && rotationDeg !== undefined && widthM !== undefined && heightM !== undefined ? { id, kind, wallId: text(item.wall_id) ?? text(item.wallId), position, rotationDeg, widthM, heightM, source: source(item.source) } as GeometryOpening : null
  }).filter(defined)
  const objects: GeometryObject[] = records(raw.objects).map((item): GeometryObject | null => {
    const id = text(item.id); const category = text(item.category); const position = worldPoint(item.position); const footprintRaw = record(item.footprint); const footprintWidth = number(footprintRaw?.width_m) ?? number(footprintRaw?.widthM); const footprintDepth = number(footprintRaw?.depth_m) ?? number(footprintRaw?.depthM)
    return id && category && position ? { id, category, name: text(item.name), storeyId: text(item.storey_id) ?? text(item.storeyId), roomId: text(item.room_id) ?? text(item.roomId), position, rotationDeg: number(item.rotation_deg) ?? number(item.rotationDeg), footprint: footprintWidth !== undefined && footprintDepth !== undefined ? { widthM: footprintWidth, depthM: footprintDepth } : undefined, heightM: number(item.height_m) ?? number(item.heightM), confidence: number(item.confidence), source: source(item.source) } as GeometryObject : null
  }).filter(defined)
  return { projectId, sourceKind: sourceKind as SceneSourceKind, quality: quality as SceneQuality, coordinateSystem: coordinateSystem as GeometryScene['coordinateSystem'], unit: unit as GeometryScene['unit'], warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((warning): warning is string => typeof warning === 'string') : [], rooms, walls, openings, objects }
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
  if (scene.quality !== 'measured') return 'Geometry scene is illustrative, not calibrated metric data.'
  if (!isMeasuredGeometryScene(scene)) return 'Geometry scene must use metres and x-right, y-up, z-plan-north coordinates.'
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
