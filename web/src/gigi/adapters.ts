// Real-data adapters for the Gigi workspace (brief 30).
// Turns our /api responses into the shapes Gigi's components already use
// (QueryScenario, FixtureVerification from design/gigi/src/data/workspaceData.ts),
// so GigiWorkspace / LargeExecutionPlan / Detailed3DViewer can stay visually identical.
// Written by Claude; Codex owns the components that call it.

export type LayerId = 'architecture' | 'sanitary' | 'hvac' | 'electrical' | 'dimensions';
export type ScaleOption = '1:200' | '1:100' | '1:50' | '1:20';
export type VerificationStatus = 'Installed' | 'In Progress' | 'Issue Reported';

export interface Box { x: number; y: number; w: number; h: number }

export interface FixtureVerification {
  id: string;            // stable item id from /api/ask (IFC GlobalId or path#cat-n)
  code: string;          // short plan tag, e.g. WC-208.1
  label: string;         // display name, e.g. "Toilet 1 (WC)"
  category: string;
  roomCode: string;
  roomName: string | null;
  status: VerificationStatus;
  verified: boolean;
  author?: string;
  capturedAt?: string;
  note: string;
  photoDataUrl: string;  // '' when no site photo yet
  photoLabel: string;
  manufacturer: string;  // '—' until /api/element/info answers
  modelSpec: string;
  dimensions3D: Record<string, string>; // filled from /api/element/info clearances; empty = hide rows
  position: Box | null;  // drawing pixels (same frame as /api/drawing PNG); null = no box on this sheet
  reviewId?: number | string; // id for /api/review
}

export interface FollowUp { id: string; question: string; answer?: string }

export interface QueryScenario {
  id: string;
  prompt: string;
  shortLabel: string;
  responseTime: string;
  roomCode: string;
  roomName: string;
  roomArea: string;
  roomDimensions: string;
  foundCount: number | null;
  bigMetric: string;
  unit: string;
  overallStatus: VerificationStatus;
  recommendedScale: ScaleOption;
  requiredLayers: LayerId[];
  roomHighlight: Box | null;
  roomPolygon: [number, number][] | null;
  targetIds: string[];
  aiSummary: string;
  followUpQuestions: FollowUp[];
  // ours, shown in "How I got this"
  how: { source: string; sourceLabel: string; method: string; badge: { color: string; text: string } | null;
         tokens: number; costUsd: number; totalS: number; warnings: string[]; formula?: string };
  // interactive review (Xinran's engine/review.py via /api/review)
  answerId?: string;
  alternatives: { label: string; value: number }[];
  uncertain: boolean;
  path: string;
}

const CATEGORY_LAYER: Record<string, LayerId> = {
  toilet: 'sanitary', wc: 'sanitary', sink: 'sanitary', basin: 'sanitary', shower: 'sanitary',
  shower_tub: 'sanitary', bathtub: 'sanitary', bath: 'sanitary', sanitary: 'sanitary', fixture: 'sanitary',
  flowterminal: 'sanitary', pipe: 'sanitary',
  duct: 'hvac', damper: 'hvac', hvac: 'hvac', air_terminal: 'hvac',
  light: 'electrical', socket: 'electrical', switch: 'electrical', electrical: 'electrical', lamp: 'electrical',
};
export const layerOf = (category: string): LayerId =>
  CATEGORY_LAYER[(category || '').toLowerCase()] ?? 'architecture';

const stripMd = (s: string) => (s || '').replace(/\*\*/g, '').replace(/\s+\n/g, '\n').trim();

function boxFrom(src: any, imgW: number, imgH: number): Box | null {
  if (!src) return null;
  if (Array.isArray(src.bbox) && src.bbox.length === 4) {
    const [x0, y0, x1, y1] = src.bbox;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  if (Array.isArray(src.box_norm1000) && imgW && imgH) {
    const [x0, y0, x1, y1] = src.box_norm1000;
    return { x: (x0 * imgW) / 1000, y: (y0 * imgH) / 1000, w: ((x1 - x0) * imgW) / 1000, h: ((y1 - y0) * imgH) / 1000 };
  }
  return null;
}

function mostCommon<T>(xs: T[]): T | null {
  const m = new Map<T, number>();
  xs.forEach((x) => x != null && m.set(x, (m.get(x) || 0) + 1));
  let best: T | null = null, n = 0;
  m.forEach((v, k) => { if (v > n) { n = v; best = k; } });
  return best;
}

export interface PlanRoom {
  space_id: string; name: string | null; number: string | null; area_m2: number | null;
  dims_m: { L: number; B: number; H: number | null } | null;
  bbox_px: number[]; polygon_px: [number, number][] | null;
}
export interface PlanRooms { path: string; image_size: [number, number] | null; rooms: PlanRoom[] }

export interface VerifyEntry {
  verified: boolean; status?: VerificationStatus; note?: string; author?: string; ts?: string; photos: number;
  latest: { url: string; ts?: string; author?: string } | null;
}

/** /api/ask response (+ optional /api/plan/rooms, /api/verify/status) -> Gigi scenario + fixtures. */
export function toScenario(
  ask: any,
  question: string,
  path: string,
  plan?: PlanRooms | null,
  verify?: Record<string, VerifyEntry> | null,
  imageSize?: [number, number] | null,
): { scenario: QueryScenario; fixtures: Record<string, FixtureVerification> } {
  const ev = (ask?.evidence || [])[0] || {};
  const items: any[] = ev.items || [];
  const sources: any[] = ev.sources || [];
  const [imgW, imgH] = imageSize || plan?.image_size || [0, 0];

  const fixtures: Record<string, FixtureVerification> = {};
  items.forEach((it, i) => {
    const id = String(it.id ?? `${path}#item-${i + 1}`);
    const src = it.source_index != null ? sources[it.source_index] : sources[i];
    const v = verify?.[id];
    const status: VerificationStatus = v?.status || (v?.verified ? 'Installed' : 'In Progress');
    fixtures[id] = {
      id,
      code: it.label || `${(it.category || 'ITEM').slice(0, 3).toUpperCase()}-${i + 1}`,
      label: it.name || it.label || it.category || 'Item',
      category: it.category || 'item',
      roomCode: it.space_id ? String(it.room_name || it.space_id) : '',
      roomName: it.room_name ?? null,
      status,
      verified: !!v?.verified,
      author: v?.latest?.author || v?.author,
      capturedAt: v?.latest?.ts || v?.ts,
      note: v?.note || (v?.verified ? '' : 'Unverified: no site photo yet.'),
      photoDataUrl: v?.latest?.url ? `/api${v.latest.url.startsWith('/') ? '' : '/'}${v.latest.url}` : '',
      photoLabel: v?.latest ? `Site photo · ${v.latest.author || 'team'}` : 'No site photo yet',
      manufacturer: '—',
      modelSpec: '—',
      dimensions3D: {},
      position: boxFrom(src, imgW, imgH) || boxFrom(it, imgW, imgH),
      reviewId: it.review_id,
    };
  });

  // room the answer is about
  const roomKey = mostCommon(items.map((it) => it.space_id).filter(Boolean)) as string | null;
  const room = plan?.rooms?.find((r) => r.space_id === roomKey || r.number === roomKey || r.name === roomKey)
    || (ask?.summary?.room ? { ...ask.summary.room } : null);
  const roomName = room?.name || items.find((it) => it.space_id === roomKey)?.room_name || '';
  const roomCode = room?.number || roomName || (path.split('/').pop() || '').replace(/\.[^.]+$/, '');
  const dims = room?.dims_m;
  const roomDimensions = dims
    ? `L ${dims.L.toFixed(2)}m × B ${dims.B.toFixed(2)}m${dims.H ? ` × H ${dims.H.toFixed(2)}m` : ''}`
    : 'L × B × H not available';
  const bb = room?.bbox_px;
  const roomHighlight = bb && bb.length === 4 && bb[2] > bb[0] ? { x: bb[0], y: bb[1], w: bb[2] - bb[0], h: bb[3] - bb[1] } : null;

  const fx = Object.values(fixtures);
  const overallStatus: VerificationStatus = fx.some((f) => f.status === 'Issue Reported')
    ? 'Issue Reported' : fx.length && fx.every((f) => f.verified && f.status === 'Installed') ? 'Installed' : 'In Progress';

  const value = ev.value;
  const unit = ev.unit || '';
  const bigMetric = value == null ? '—'
    : unit === 'm2' ? `${Number(value).toFixed(2)} m²`
    : unit === 'm' ? `${Number(value).toFixed(2)} m`
    : unit === 'm3' ? `${Number(value).toFixed(2)} m³`
    : String(value);

  const layers = new Set<LayerId>(['architecture']);
  fx.forEach((f) => layers.add(layerOf(f.category)));
  if (unit === 'm2' || unit === 'm') layers.add('dimensions');

  const totalS = ask?.timing?.total_s ?? ask?.summary?.total_s ?? 0;
  const summary = ask?.summary || {};
  const usage = ask?.usage || {};
  const method = String(ev.method || summary.method || '');

  return {
    scenario: {
      id: ask?.answer_id || `q-${Date.now()}`,
      prompt: question,
      shortLabel: question.length > 28 ? question.slice(0, 26) + '…' : question,
      responseTime: `${Number(totalS).toFixed(1)}s`,
      roomCode,
      roomName: roomName || roomCode,
      roomArea: room?.area_m2 != null ? `${Number(room.area_m2).toFixed(1)} m²` : '—',
      roomDimensions,
      foundCount: typeof value === 'number' && unit === 'count' ? value : fx.length || null,
      bigMetric,
      unit,
      overallStatus,
      recommendedScale: roomKey && fx.length ? '1:50' : '1:100',
      requiredLayers: [...layers],
      roomHighlight,
      roomPolygon: room?.polygon_px || null,
      targetIds: Object.keys(fixtures),
      aiSummary: stripMd(ask?.answer_text || ''),
      followUpQuestions: (ask?.follow_ups || []).map((q: string, i: number) => ({ id: `fu-${i}`, question: q })),
      how: {
        source: ev.source || summary.source || '',
        sourceLabel: ev.source_label || summary.source_label || '',
        method,
        badge: ev.badge || summary.badge || null,
        tokens: (usage.input || 0) + (usage.output || 0) + (usage.thinking || 0),
        costUsd: usage.cost_usd || 0,
        totalS: Number(totalS) || 0,
        warnings: [...(ev.warnings || []), ...(summary.warnings || [])].filter((w, i, a) => a.indexOf(w) === i),
        formula: ev.evidence?.formula || ev.formula,
      },
      answerId: ask?.answer_id,
      alternatives: ask?.alternatives || [],
      uncertain: /uncertain/.test(method),
      path,
    },
    fixtures,
  };
}

/** Merge /api/element/info into a fixture (manufacturer, model, clearance rows for the 3D card). */
export function withElementInfo(f: FixtureVerification, info: any): FixtureVerification {
  if (!info) return f;
  const c = info.clearances || {};
  const mm = (v: any) => (v == null ? null : `${Math.round(Number(v))} mm`);
  const rows: Record<string, string> = {};
  if (c.left_wall != null) rows.leftWall = `${mm(c.left_wall)} to left wall`;
  if (c.right_wall != null) rows.rightWall = `${mm(c.right_wall)} to right wall`;
  if (c.front != null) rows.frontClearance = `${mm(c.front)} front clearance`;
  if (c.rear != null) rows.rearRoughIn = `${mm(c.rear)} to rear wall`;
  if (c.height_aff != null) rows.seatHeight = `${mm(c.height_aff)} AFF`;
  return {
    ...f,
    manufacturer: info.manufacturer || f.manufacturer,
    modelSpec: info.model || info.type || f.modelSpec,
    dimensions3D: rows,
  };
}

// ---- thin API helpers (all relative to /api) ----
const j = async (r: Response) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
export const api = {
  ask: (path: string, question: string, role?: string) =>
    fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, question, role }) }).then(j),
  planRooms: (path: string): Promise<PlanRooms> => fetch(`/api/plan/rooms?path=${encodeURIComponent(path)}&page=1`).then(j),
  verifyStatus: (path: string, ids: string[]) =>
    fetch(`/api/verify/status?path=${encodeURIComponent(path)}&ids=${ids.map(encodeURIComponent).join(',')}`).then(j)
      .then((r: any) => r.ids as Record<string, VerifyEntry>),
  elementInfo: (path: string, id: string) =>
    fetch(`/api/element/info?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`).then(j).catch(() => null),
  drawingUrl: (path: string, page = 1) => `/api/drawing?path=${encodeURIComponent(path)}&page=${page}`,
  questions: (path: string, limit = 3) =>
    fetch(`/api/questions?path=${encodeURIComponent(path)}&limit=${limit}`).then(j).catch(() => []),
  uploadPhoto: (q: { path: string; item_id: string; space_id?: string; author: string; note?: string; status?: VerificationStatus }, file: File) => {
    const p = new URLSearchParams({ ...q, filename: file.name } as any);
    return fetch(`/api/collab/media?${p}`, { method: 'POST', body: file }).then(j);
  },
  setStatus: (body: { path: string; item_id: string; space_id?: string; status: VerificationStatus; note?: string; author: string }) =>
    fetch('/api/verify/item', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  review: (body: { answer_id: string; remove?: (number | string)[]; add?: number[][]; choose?: number; user: string }) =>
    fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  calibrate: (body: { path: string; p1: number[]; p2: number[]; length_m: number; image_size?: number[]; page?: number }) =>
    fetch('/api/calibrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  measure: (body: { path: string; points: number[][]; kind: 'area' | 'length'; page?: number }) =>
    fetch('/api/measure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
};
