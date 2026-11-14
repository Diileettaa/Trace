import type { AskResponse, CollabState, CollabPerson, DatasetQuestion, Evidence, Role, RoomStatus } from './types'

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

export async function inventory(path: string, page = 1): Promise<Evidence> {
  const r = await fetch(`${BASE}/inventory?${new URLSearchParams({ path, page: String(page) })}`)
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
  return { tool: 'scan_drawing_inventory', ...(await r.json()) }
}

export async function getCollab(): Promise<CollabState> {
  const r = await fetch(`${BASE}/collab`)
  return r.ok ? r.json() : { status: {}, messages: [] }
}

export async function getPeople(): Promise<CollabPerson[]> {
  const response = await fetch(`${BASE}/collab/people`)
  return response.ok ? response.json() : []
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
