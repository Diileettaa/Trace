#!/usr/bin/env node
// Checks the 2.5D scene exchange contract. It validates data only; it never
// attempts to infer, repair, or invent building geometry.
import { readFile } from 'node:fs/promises'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/check_geometry_scene.mjs <scene.json>')
  process.exit(2)
}

const errors = []
const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const point2 = value => Array.isArray(value) && value.length >= 2 && isNumber(value[0]) && isNumber(value[1])
const point3 = value => Array.isArray(value) && value.length >= 3 && isNumber(value[0]) && isNumber(value[1]) && isNumber(value[2])
const positive = (value, label) => { if (!isNumber(value) || value <= 0) errors.push(`${label} must be a positive number`) }
const source = (value, label) => {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || typeof value.file !== 'string') errors.push(`${label}.source needs a file`)
  if (value?.bbox !== undefined && (!Array.isArray(value.bbox) || value.bbox.length !== 4 || !value.bbox.every(isNumber))) errors.push(`${label}.source.bbox must be four drawing-PNG pixel values`)
}
const evidence = (value, label) => {
  if (value?.confidence !== undefined && (!isNumber(value.confidence) || value.confidence < 0 || value.confidence > 1)) errors.push(`${label}.confidence must be within 0..1`)
  if (value?.assumed !== undefined && typeof value.assumed !== 'boolean' && (typeof value.assumed !== 'object' || value.assumed === null)) errors.push(`${label}.assumed must be boolean or a boolean flag object`)
  source(value?.source, label)
}

let scene
try { scene = JSON.parse(await readFile(file, 'utf8')) } catch (error) {
  console.error(`Could not read JSON: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

if (!scene || typeof scene !== 'object' || Array.isArray(scene)) errors.push('scene must be a JSON object')
const measured = scene?.quality === 'measured'
const illustrative = scene?.quality === 'illustrative'
if (!measured && !illustrative) errors.push('quality must be "measured" or "illustrative"')
if (measured && scene?.unit !== 'm') errors.push('measured scenes require unit "m"')
if (measured && scene?.coordinate_system !== 'x-right,y-up,z-plan-north') errors.push('measured scenes require x-right, y-up, z-plan-north coordinates')
if (illustrative && scene?.unit !== 'norm1000' && scene?.unit !== 'px') errors.push('illustrative scenes require unit "norm1000" or "px"')
if (illustrative && !['image-norm1000', 'drawing-norm1000', 'drawing-pixels'].includes(scene?.coordinate_system)) errors.push('illustrative scenes require image-norm1000, drawing-norm1000, or drawing-pixels coordinates')
if (typeof scene?.project_id !== 'string' || !scene.project_id) errors.push('project_id is required')
for (const key of ['rooms', 'walls', 'openings', 'objects']) if (!Array.isArray(scene?.[key])) errors.push(`${key} must be an array`)

for (const [index, room] of (scene?.rooms ?? []).entries()) {
  const label = `rooms[${index}]`
  if (typeof room?.id !== 'string') errors.push(`${label}.id is required`)
  if (!Array.isArray(room?.polygon) || room.polygon.length < 3 || !room.polygon.every(point2)) errors.push(`${label}.polygon needs at least three [x,z] points`)
  evidence(room, label)
}
for (const [index, wall] of (scene?.walls ?? []).entries()) {
  const label = `walls[${index}]`
  if (typeof wall?.id !== 'string') errors.push(`${label}.id is required`)
  if (!Array.isArray(wall?.points) || wall.points.length < 2 || !wall.points.every(point2)) errors.push(`${label}.points needs at least two [x,z] points`)
  positive(wall?.thickness_m, `${label}.thickness_m`); positive(wall?.height_m, `${label}.height_m`)
  if (!isNumber(wall?.base_y_m)) errors.push(`${label}.base_y_m must be a number`)
  evidence(wall, label)
}
for (const [index, opening] of (scene?.openings ?? []).entries()) {
  const label = `openings[${index}]`
  if (typeof opening?.id !== 'string') errors.push(`${label}.id is required`)
  if (!['door', 'window'].includes(opening?.kind)) errors.push(`${label}.kind must be door or window`)
  if (!point3(opening?.position)) errors.push(`${label}.position must be [x,y,z]`)
  positive(opening?.width_m, `${label}.width_m`); positive(opening?.height_m, `${label}.height_m`)
  if (!isNumber(opening?.rotation_deg)) errors.push(`${label}.rotation_deg must be a number`)
  evidence(opening, label)
}
for (const [index, object] of (scene?.objects ?? []).entries()) {
  const label = `objects[${index}]`
  if (typeof object?.id !== 'string' || typeof object?.category !== 'string') errors.push(`${label}.id and .category are required`)
  if (!point3(object?.position)) errors.push(`${label}.position must be [x,y,z]`)
  if (object?.footprint !== undefined) {
    positive(object.footprint?.width_m, `${label}.footprint.width_m`)
    positive(object.footprint?.depth_m, `${label}.footprint.depth_m`)
  }
  evidence(object, label)
}
for (const [index, system] of (scene?.systems ?? []).entries()) {
  const label = `systems[${index}]`
  if (typeof system?.id !== 'string' || typeof system?.kind !== 'string') errors.push(`${label}.id and .kind are required`)
  if (!Array.isArray(system?.points) || system.points.length < 2 || !system.points.every(point3)) errors.push(`${label}.points needs at least two [x,y,z] points`)
  if (system?.diameter_m !== undefined) positive(system.diameter_m, `${label}.diameter_m`)
  evidence(system, label)
}

if (Array.isArray(scene?.rooms) && Array.isArray(scene?.walls) && Array.isArray(scene?.openings) && Array.isArray(scene?.objects)
  && scene.rooms.length + scene.walls.length + scene.openings.length + scene.objects.length === 0) errors.push('scene has no renderable geometry')

if (errors.length) {
  console.error(`Scene contract failed (${errors.length} error${errors.length === 1 ? '' : 's'}):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`Scene contract passed: ${scene.project_id} · ${scene.quality} (${scene.rooms.length} rooms, ${scene.walls.length} walls, ${scene.objects.length} objects)`)
