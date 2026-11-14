// Mirrors the shared tool-result format agreed between developer A and B.

export interface Source {
  file: string
  page: number
  bbox: [number, number, number, number] // x0, y0, x1, y1 in pixels of the /drawing PNG
  label?: string
}

export interface Item {
  id?: string
  guid?: string // IFC elements: used to highlight in 3D
  category?: string
  name?: string
  storey?: string
  space_id?: string
  space_name?: string
}

export interface Evidence {
  tool: string
  value: number | string | null
  unit?: string | null
  items: Item[]
  sources: Source[]
  method?: string
  source?: string | { kind?: string; label?: string }
  warnings?: string[]
  by_category?: Record<string, number>
  cached?: boolean
  verified_by?: { nemotron_count: number | null; agreement: boolean | null; model?: string | null }
  model_file?: string
}

export interface AskResponse {
  answer_text: string
  evidence: Evidence[]
  tool_calls: { name: string; args: Record<string, unknown> }[]
  timing?: { total_s: number; gemini_calls_s: number[]; tools_s: number[] }
  usage?: { input?: number; output?: number; thinking?: number; gemini_calls?: number; vision_calls?: number; nemotron_calls?: number }
  trace?: AnswerTraceStep[]
  from_cache?: boolean
}

export interface AnswerTraceStep {
  kind: 'question' | 'tool' | 'check' | 'answer' | string
  title: string
  detail?: string
  method?: string
  boxes?: number
  items?: number
  elapsed_s?: number
  cached?: boolean
  warnings?: string[]
  ok?: boolean
}

export interface DatasetQuestion {
  path: string
  question: string
  answer: number | string
  unit: string | null
  type: string
}

export type Role = '' | 'architect' | 'electrician' | 'plumber' | 'owner'

export type RoomStatus = 'built' | 'missing_wall' | 'pending'

export interface CollabMessage {
  id?: string
  space_id: string
  text: string
  author?: string
  role?: string
  notify?: string[]
  ts: number
  changed?: boolean
  recipient?: string
  thread?: string
  attachment?: string | null
}

export interface CollabPerson { id: string; name: string; trade: string; email: string; phone: string }
export interface CollabBooking { id: string; space_id: string; trade: string; person: string; start: number; end: number; what: string; created_at: number; demo?: boolean; conflict_with?: string | null; winner?: CollabBooking }

export interface CollabState {
  statuses?: RoomStatus[]
  status: Record<string, { status: RoomStatus; author?: string; ts: number }>
  messages: CollabMessage[]
  people?: CollabPerson[]
  bookings?: CollabBooking[]
}
