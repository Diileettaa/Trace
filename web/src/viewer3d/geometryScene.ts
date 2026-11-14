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

export function isGeometryScene(value: unknown): value is GeometryScene {
  if (!value || typeof value !== 'object') return false
  const scene = value as Partial<GeometryScene>
  return typeof scene.projectId === 'string'
    && (scene.sourceKind === 'ifc' || scene.sourceKind === 'vector-drawing' || scene.sourceKind === 'raster-drawing')
    && (scene.quality === 'measured' || scene.quality === 'illustrative')
    && (scene.coordinateSystem === 'x-right,y-up,z-plan-north' || scene.coordinateSystem === 'drawing-pixels')
    && (scene.unit === 'm' || scene.unit === 'px')
    && Array.isArray(scene.rooms)
    && Array.isArray(scene.walls)
    && Array.isArray(scene.openings)
    && Array.isArray(scene.objects)
}

/** The route is intentionally separate from `/api/scene`, which stores shared placements. */
export async function loadGeometryScene(path: string, page = 1): Promise<GeometryScene | null> {
  const query = new URLSearchParams({ path, page: String(page) })
  const response = await fetch(`/api/geometry/scene?${query}`)
  if (!response.ok) return null
  const value: unknown = await response.json()
  return isGeometryScene(value) ? value : null
}
