import type { AskResponse, CollabState, CollabPerson, DatasetQuestion, Evidence, Role, RoomStatus, RoomMedia } from './types'
import type { CollabBooking } from './types'

const BASE = '/api'

export async function ask(question: string, path: string, role: Role): Promise<AskResponse> {
  const r = await fetch(`${BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, path: path || null, role: role || null }),
  })
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
  return r.json()
}

export async function sampleQuestions(source?: string): Promise<DatasetQuestion[]> {
  const q = new URLSearchParams({ limit: '200', ...(source ? { source } : {}) })
  const r = await fetch(`${BASE}/questions?${q}`)
  if (!r.ok) return []
  return r.json()
}

export const drawingUrl = (path: string, page = 1) =>
  `${BASE}/drawing?${new URLSearchParams({ path, page: String(page) })}`

// raw dataset file (e.g. an .ifc model for the 3D viewer)
export const fileUrl = (path: string) => `${BASE}/file?${new URLSearchParams({ path })}`

export interface ScenePlacement {
  instanceId: string
  catalogId: string
  name: string
  width_mm: number
  depth_mm: number
  height_mm: number
  price_eur?: number
  material?: string
  color_hex?: string
  mount: 'floor' | 'ceiling' | 'wall'
  rotationDeg: number
  position: [number, number, number]
  space_id?: string | null
  author?: string
  role?: string
}
export interface SceneSnapshot { model: string; version: number; changed?: boolean; placements?: ScenePlacement[] }
export async function getScene(model: string, sinceVersion?: number): Promise<SceneSnapshot> {
  const query = new URLSearchParams({ model, ...(sinceVersion === undefined ? {} : { since_version: String(sinceVersion) }) })
  const response = await fetch(`${BASE}/scene?${query}`)
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}
export async function saveScenePlacement(model: string, placement: ScenePlacement): Promise<{ version: number }> {
  const response = await fetch(`${BASE}/scene/placement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...placement, model }) })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}
export async function deleteScenePlacement(model: string, instanceId: string, author = ''): Promise<{ version: number }> {
  const query = new URLSearchParams({ model, instanceId, author })
  const response = await fetch(`${BASE}/scene/placement?${query}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}

export async function inventory(path: string, page = 1): Promise<Evidence> {
  const r = await fetch(`${BASE}/inventory?${new URLSearchParams({ path, page: String(page) })}`)
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
  return { tool: 'scan_drawing_inventory', ...(await r.json()) }
}

export async function getCollab(): Promise<CollabState> {
  let viewer = ''
  try { viewer = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.id || '' } catch { /* contacts can be registered later */ }
  const r = await fetch(`${BASE}/collab${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ''}`)
  return r.ok ? r.json() : { status: {}, messages: [] }
}

export async function getPeople(): Promise<CollabPerson[]> {
  const response = await fetch(`${BASE}/collab/people`)
  return response.ok ? response.json() : []
}
export async function getRoomMedia(spaceId: string): Promise<RoomMedia[]> {
  const response = await fetch(`${BASE}/collab/media?${new URLSearchParams({ space_id: spaceId })}`)
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}
export const roomMediaUrl = (id: string) => `${BASE}/collab/media/file?${new URLSearchParams({ id })}`
export async function uploadRoomMedia(spaceId: string, author: string, role: string, note: string, file: File): Promise<RoomMedia> {
  const query = new URLSearchParams({ space_id: spaceId, author, role, note, filename: file.name })
  const response = await fetch(`${BASE}/collab/media?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}
export async function registerPerson(person: Omit<CollabPerson, 'id'>): Promise<CollabPerson> {
  const response = await fetch(`${BASE}/collab/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(person) })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}

async function post(url: string, body: unknown): Promise<CollabState> {
  const r = await fetch(`${BASE}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
  return r.json()
}

export const setRoomStatus = (space_id: string, status: RoomStatus, author = '') =>
  post('/collab/status', { space_id, status, author })

export const postRoomMessage = (space_id: string, text: string, role = '', notify: string[] = []) =>
  post('/collab/message', { space_id, text, role, notify })

export const postRoomChat = (space_id: string, text: string, author: string, role: string, attachment = '') =>
  post('/collab/message', { space_id, text, author, role, attachment })

export async function postDirect(recipient: string, text: string, author: string, attachment = ''): Promise<CollabState> {
  const response = await fetch(`${BASE}/collab/direct`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient, text, author, attachment }) })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}

export async function bookWork(body: Pick<CollabBooking, 'space_id' | 'trade' | 'person' | 'start' | 'end' | 'what'>): Promise<CollabState> {
  const response = await fetch(`${BASE}/collab/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}


export interface MoodRenderRequest {
  image_base64: string
  room_name: string
  products: unknown[]
  style: string
}

export async function renderMoodImage(body: MoodRenderRequest): Promise<Blob> {
  const response = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(error?.detail || `${response.status}: image render failed`)
  }
  return response.blob()
}

export interface UploadResult { path: string; kind: string; pages: number; name: string; bytes: number }

/** Upload the user's own drawing (PDF/PNG/JPG/IFC, max 50 MB). Body is the raw file. */
export async function uploadDrawing(file: File): Promise<UploadResult> {
  const r = await fetch(`${BASE}/upload?${new URLSearchParams({ filename: file.name })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  if (!r.ok) {
    let msg = `Upload failed (${r.status})`
    try { msg = (await r.json()).detail || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  return r.json()
}
