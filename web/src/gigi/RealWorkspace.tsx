// Gigi's TraceWorkspace (design/gigi/src/components/TraceWorkspace.tsx), kept visually 1:1,
// with every fake value replaced by our API through adapters.ts. Differences from Gigi are marked "ours".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, Box, Camera, Check, CheckCircle2, ChevronDown, Clock, Download, History,
  Loader2, MessageSquare, Monitor, Plus, Send, SlidersHorizontal, Smartphone, Tablet, Upload, X,
} from 'lucide-react';
import {
  api, toScenario, withElementInfo, type FixtureVerification, type LayerId, type QueryScenario, type ScaleOption,
  type VerificationStatus,
} from './adapters';
import { RealPlan } from './RealPlan';
import { Real3D } from './Real3D';
import type { GeometrySource } from '../viewer3d/geometryScene';
import './gigi.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  bigMetric?: string;
  scenario?: QueryScenario;
  followUps?: { id: string; question: string }[];
  pending?: boolean;
  error?: boolean;
  source?: { label: string; path: string; page: number; why: string[] };  // ours: which sheet answered (engine.sheetset pick)
}
// ours: Xinran's sheet set — every drawing of the project by discipline and level
interface Sheet { path: string; page: number; kind?: string | null; discipline: string; level?: string | null; title?: string | null; sheet_no?: string | null; why: string[]; score?: number }
interface SheetGroup { discipline: string; label: string; sheets: Sheet[] }
const sheetName = (s: Sheet) => [s.sheet_no, s.level, s.kind === 'model' ? '3D model' : s.kind && s.kind !== 'doc' ? s.kind : null].filter(Boolean).join(' · ') || (s.path.split('/').pop() || s.path);
const sheetFile = (s: Sheet) => `${s.path.split('/').pop()}${s.page > 1 ? ` · p.${s.page}` : ''}`;
interface ChatSession { id: string; title: string; timestamp: string; messages: ChatMessage[] }
interface Project { id: string; title: string; subtitle?: string; model: string | null; plan: string | null; demo_data?: boolean }

const LAYER_GUIDE: { id: LayerId; label: string; code: string }[] = [
  { id: 'architecture', label: 'Architecture & Walls', code: 'AR-01' },
  { id: 'sanitary', label: 'Sanitary & Plumbing', code: 'SAN-02' },
  { id: 'hvac', label: 'Ventilation (HVAC)', code: 'TGA-LUF' },
  { id: 'electrical', label: 'Electrical & Lighting', code: 'ELT-04' },
  { id: 'furniture', label: 'Furniture', code: 'FF&E-06' },
  { id: 'dimensions', label: 'Dimension Chains', code: 'DIM-05' },
];

const DEFAULT_PROJECTS: Project[] = [
  { id: 'esplanades', title: 'Apartment building, Tallinn', model: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc', plan: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf', demo_data: true },
  { id: 'swiss', title: 'Swiss apartment floor', model: null, plan: 'data/swiss_dwellings/site1000_bldg2082_floor9385.pdf', demo_data: true },
];

const FALLBACK_PROMPTS = ['How many doors are on this floor?', 'How many toilets are on this floor?', 'What is the total area of all rooms?'];

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const load = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

function sheetLabel(p: Project | null, path: string): string {
  if (!p) return 'FLOOR PLAN';
  const name = (path.split('/').pop() || '').toLowerCase();
  const m = name.match(/(?:level|korrus|floor|plan)[-_ ]?(\d{1,2})|(\d{1,2})[-_ ]?korrus/);
  const n = m ? (m[1] || m[2]) : null;
  if (n) return `LEVEL ${n.padStart(2, '0')}`;
  if (path.toLowerCase().endsWith('.ifc')) return 'WHOLE MODEL';
  return 'FLOOR PLAN';
}

export const RealWorkspace: React.FC<{ onHome?: () => void }> = ({ onHome }) => {
  // ours: projects and sheets come from /api/catalog
  const [projects, setProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [project, setProject] = useState<Project>(() => load('trace.gigi.project', DEFAULT_PROJECTS[0]));
  const [askPath, setAskPath] = useState<string>(() => project.plan || project.model || '');
  const [sheetPage, setSheetPage] = useState<number>(1);
  const [sheetGroups, setSheetGroups] = useState<SheetGroup[]>([]);
  const sheetCount = sheetGroups.reduce((n, g) => n + g.sheets.length, 0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>(FALLBACK_PROMPTS);

  const chatKey = `trace.gigi.chats.${project.id}`;
  const [chats, setChats] = useState<ChatSession[]>(() => load(chatKey, [] as ChatSession[]).map((c) => ({ ...c, messages: c.messages.map((m) => m.pending ? { ...m, pending: false, error: true, text: 'Interrupted (page reloaded) — ask again.' } : m) })));
  const [activeChatId, setActiveChatId] = useState<string>(() => chats[0]?.id || '');
  const [scale, setScale] = useState<ScaleOption>('1:200');
  const [activeLayers, setActiveLayers] = useState<Record<LayerId, boolean>>({ architecture: true, sanitary: true, hvac: true, electrical: true, furniture: false, dimensions: true });

  // ours: storeys of the IFC model (reported by the 3D viewer) for the LEVEL switcher
  const [storeys, setStoreys] = useState<{ id: string; name: string; elevation: number }[]>([]);
  const [storeyId, setStoreyId] = useState<string | null>(null);
  const chosenStorey = storeys.find((s) => s.id === storeyId);
  const currentSheet = sheetGroups.flatMap((g) => g.sheets).find((sh) => sh.path === askPath && (sh.page === sheetPage || /\.ifc$/i.test(askPath)));
  const activeFloor = chosenStorey ? chosenStorey.name.toUpperCase()
    : currentSheet && sheetCount > 2 && !/\.ifc$/i.test(askPath) ? (currentSheet.sheet_no || currentSheet.level || sheetLabel(project, askPath)).toUpperCase()
    : sheetLabel(project, askPath);
  const [floorMenuOpen, setFloorMenuOpen] = useState<boolean>(false);
  const floorHoverTimer = useRef<number | null>(null);

  const [fixtures, setFixtures] = useState<Record<string, FixtureVerification>>({});
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d-building' | '3d-room'>('2d');
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [mobileTab, setMobileTab] = useState<'plan' | 'ask'>('plan');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [imageSize, setImageSize] = useState<[number, number] | null>(null);
  const [evidenceSource, setEvidenceSource] = useState<GeometrySource | null>(null);

  const [questionInput, setQuestionInput] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const [verifyModalOpen, setVerifyModalOpen] = useState<boolean>(false);
  const [verifyTargetId, setVerifyTargetId] = useState<string>('');
  const [verifyAuthor, setVerifyAuthor] = useState<string>(() => load('trace.gigi.inspector', ''));
  const [verifyStatus, setVerifyStatus] = useState<VerificationStatus>('Installed');
  const [verifyNote, setVerifyNote] = useState<string>('');
  const [verifyPhotoPreview, setVerifyPhotoPreview] = useState<string>('');
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [downloadToast, setDownloadToast] = useState<boolean>(false);
  const [howOpen, setHowOpen] = useState<Record<string, boolean>>({});
  // ours: interactive review + measuring (Xinran's /api/rv/*)
  const [tool, setTool] = useState<'view' | 'fix' | 'measure'>('view');
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [measurePts, setMeasurePts] = useState<[number, number][]>([]);
  const [measureStep, setMeasureStep] = useState<'calibrate' | 'measure'>('calibrate');
  const [calibLen, setCalibLen] = useState<string>('');
  const [toolMsg, setToolMsg] = useState<string>('');
  const [toolBusy, setToolBusy] = useState(false);
  const isRaster = /\.(png|jpe?g|tiff?|webp|bmp)$/i.test(askPath);

  // ---------- data loading (ours) ----------
  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then((c) => {
      const list: Project[] = (c.projects || []).filter((p: Project) => p.plan || p.model);
      if (list.length) setProjects(list);
    }).catch(() => undefined);
  }, []);
  useEffect(() => { save('trace.gigi.project', project); }, [project]);
  useEffect(() => {
    setSheetGroups([]);
    fetch(`/api/sheetset?project=${encodeURIComponent(project.id)}`).then((r) => r.json())
      .then((d) => {
        const groups: SheetGroup[] = Array.isArray(d?.groups) ? d.groups : [];
        setSheetGroups(groups);
        // drawing-set projects: open on an architectural floor plan, not whatever PDF sorted first
        if (project.id.startsWith('set-')) {
          const all = groups.flatMap((g) => g.sheets).filter((sh) => !/\.ifc$/i.test(sh.path));
          const best = all.find((sh) => sh.discipline === 'architecture' && sh.kind === 'plan' && sh.level)
            || all.find((sh) => sh.discipline === 'architecture' && sh.kind === 'plan') || all[0];
          if (best) { setAskPath(best.path); setSheetPage(best.page); }
        }
      }).catch(() => setSheetGroups([]));
  }, [project.id]);
  useEffect(() => { save(chatKey, chats); }, [chats, chatKey]);
  useEffect(() => {
    if (!askPath) return;
    fetch(`/api/questions?path=${encodeURIComponent(askPath)}&limit=40`).then((r) => r.json()).then((qs) => {
      const list = (Array.isArray(qs) ? qs : []) as { question: string; path?: string }[];
      const same = list.filter((q) => !q.path || q.path === askPath || q.path.replace(/_plan-.*$/, '') === askPath.replace(/_plan-.*$/, ''));
      const en = same.map((q) => q.question).filter((q) => /^[\x20-\x7E]+$/.test(q) && /^(how|what|which|where|is|are|does|do)\b/i.test(q));
      setQuickPrompts(en.length ? [...new Set(en)].slice(0, 3) as string[] : FALLBACK_PROMPTS);
    }).catch(() => setQuickPrompts(FALLBACK_PROMPTS));
  }, [askPath]);

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const lastScenario = useMemo(() => {
    const msgs = activeChat?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].scenario) return msgs[i].scenario!;
    return null;
  }, [activeChat]);
  const scenario = lastScenario;

  // refresh fixtures (verification state) whenever the shown answer changes
  const refreshFixtures = async (sc: QueryScenario | null) => {
    if (!sc) { setFixtures({}); return; }
    let verify: Record<string, any> | null = null;
    try { verify = await api.verifyStatus(sc.path, sc.targetIds); } catch { verify = null; }
    const base = { ...sc } as QueryScenario;
    setFixtures((prev) => {
      const next: Record<string, FixtureVerification> = {};
      sc.targetIds.forEach((id) => {
        const old = prev[id];
        const v = verify?.[id];
        const f = (old || (sc as any).__fixtures?.[id]) as FixtureVerification | undefined;
        if (!f) return;
        next[id] = v ? {
          ...f,
          verified: !!v.verified,
          status: (v.verified || v.author || v.ts || v.photos) ? (v.status || 'Installed') : 'Not checked',
          author: v.latest?.author || v.author || f.author,
          capturedAt: v.latest?.ts || v.ts || f.capturedAt,
          note: v.note || f.note,
          photoDataUrl: v.latest?.url ? `/api${String(v.latest.url).startsWith('/') ? '' : '/'}${v.latest.url}` : f.photoDataUrl,
          photoLabel: v.latest ? `Site photo · ${v.latest.author || 'team'}` : f.photoLabel,
        } : f;
      });
      return next;
    });
    void base;
  };
  useEffect(() => { void refreshFixtures(scenario); resetTools(); /* eslint-disable-next-line */ }, [scenario?.id]);

  const scenarioFixtures = (scenario?.targetIds || []).map((id) => fixtures[id]).filter(Boolean) as FixtureVerification[];
  const active3DFixture = (selectedFixtureId && fixtures[selectedFixtureId]) || scenarioFixtures[0] || null;
  const allTargetsVerified = scenarioFixtures.length > 0 && scenarioFixtures.every((f) => f.verified);
  const unverifiedFixture = scenarioFixtures.find((f) => f.status === 'Issue Reported') || scenarioFixtures.find((f) => !f.verified);
  const counts = scenarioFixtures.reduce((a, f) => { a[f.status] = (a[f.status] || 0) + 1; return a; }, {} as Record<string, number>);
  const overallStatus: VerificationStatus = counts['Issue Reported'] ? 'Issue Reported'
    : scenarioFixtures.length && counts['Installed'] === scenarioFixtures.length ? 'Installed'
    : (counts['In Progress'] || counts['Installed']) ? 'In Progress' : 'Not checked';

  // product data + clearances for the element shown in 3D
  useEffect(() => {
    const f = active3DFixture;
    if (!f || viewMode !== '3d-room' || !scenario) return;
    if (f.manufacturer !== 'Loading…') return;
    api.elementInfo(scenario.path, f.id).then((info) => {
      setFixtures((prev) => prev[f.id] ? { ...prev, [f.id]: withElementInfo(prev[f.id], info) } : prev);
    });
  }, [active3DFixture?.id, viewMode, scenario]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeChat?.messages.length, activeChatId]);
  useEffect(() => () => { if (floorHoverTimer.current) window.clearTimeout(floorHoverTimer.current); }, []);

  const handleFloorMouseEnter = () => {
    if (floorHoverTimer.current) window.clearTimeout(floorHoverTimer.current);
    floorHoverTimer.current = window.setTimeout(() => setFloorMenuOpen(true), 950);
  };
  const handleFloorMouseLeave = () => {
    if (floorHoverTimer.current) { window.clearTimeout(floorHoverTimer.current); floorHoverTimer.current = null; }
  };

  const switchProject = (p: Project) => {
    setProject(p);
    setAskPath(p.plan || p.model || '');
    setSheetPage(1);
    setChats(load(`trace.gigi.chats.${p.id}`, [] as ChatSession[]));
    setActiveChatId('');
    setFixtures({});
    setSelectedFixtureId(null);
    setViewMode('2d');
    setProjectMenuOpen(false);
    setFloorMenuOpen(false);
    setImageSize(null);
    setStoreys([]);
    setStoreyId(null);
  };

  const handleSelectChat = (chat: ChatSession) => {
    setActiveChatId(chat.id);
    setViewMode('2d');
    setSelectedFixtureId(null);
    setMobileDrawerOpen(false);
    const sc = [...chat.messages].reverse().find((m) => m.scenario)?.scenario;
    if (sc) {
      setScale(sc.recommendedScale);
      setActiveLayers((prev) => { const u = { ...prev }; sc.requiredLayers.forEach((l) => { u[l] = true; }); return u; });
    }
  };

  const handleCreateNewChat = () => {
    const newId = `chat-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId, title: 'New inspection chat', timestamp: 'Now',
      messages: [{ id: `welcome-${Date.now()}`, role: 'assistant', text: `Ready on ${project.title} · ${activeFloor}. Ask any question in any language—or pick a quick prompt below.` }],
    };
    setChats((prev) => [newSession, ...prev]);
    setActiveChatId(newId);
    setMobileDrawerOpen(false);
    if (devicePreview === 'mobile') setMobileTab('ask');
    return newId;
  };

  const patchChat = (chatId: string, fn: (c: ChatSession) => ChatSession) =>
    setChats((prev) => prev.map((c) => (c.id === chatId ? fn(c) : c)));

  // ours: every question goes to /api/ask; nothing is pre-scripted
  const runPromptInCurrentChat = async (promptText: string) => {
    const chatId = activeChat?.id || handleCreateNewChat();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: promptText };
    const pendingId = `a-${Date.now() + 1}`;
    const pending: ChatMessage = { id: pendingId, role: 'assistant', text: `Reading ${askPath.split('/').pop()}…`, pending: true };
    setChats((prev) => {
      const exists = prev.some((c) => c.id === chatId);
      const base = exists ? prev : [{ id: chatId, title: promptText, timestamp: now(), messages: [] }, ...prev];
      return base.map((c) => c.id !== chatId ? c : {
        ...c, title: c.title === 'New inspection chat' || !c.messages.some((m) => m.role === 'user') ? promptText : c.title,
        timestamp: now(), messages: [...c.messages, userMsg, pending],
      });
    });
    try {
      // ours: if the project has several sheets, let the sheet set pick the one that answers this question
      let usePath = askPath;
      let usePage = sheetPage;
      let source: ChatMessage['source'];
      if (sheetCount > 3) {  // a real sheet set; small projects keep the sheet the user opened
        const r = await fetch(`/api/sheetset/pick?project=${encodeURIComponent(project.id)}&q=${encodeURIComponent(promptText)}&current=${encodeURIComponent(askPath)}`)
          .then((x) => x.json()).catch(() => null);
        const top: Sheet | undefined = r?.picks?.[0];
        if (top && !(top.why || []).includes('no specific match') && !(/\.ifc$/i.test(top.path) && !/\.ifc$/i.test(askPath) && project.plan)) {
          usePath = top.path; usePage = top.page;
          source = { label: [top.title, sheetName(top)].filter(Boolean).join(' — '), path: top.path, page: top.page, why: top.why || [] };
          if (usePath !== askPath || usePage !== sheetPage) { setAskPath(usePath); setSheetPage(usePage); }
        }
      }
      const ask = await api.ask(usePath, promptText);
      const items: any[] = ask?.evidence?.[0]?.items || [];
      const ids = items.map((it: any) => String(it.id)).filter(Boolean);
      const [plan, verify] = await Promise.all([
        api.planRooms(usePath).catch(() => null),
        ids.length ? api.verifyStatus(usePath, ids).catch(() => null) : Promise.resolve(null),
      ]);
      const { scenario: sc, fixtures: fx } = toScenario(ask, promptText, usePath, plan, verify, imageSize);
      (sc as any).__fixtures = fx;
      setFixtures(fx);
      setSelectedFixtureId(null);
      setViewMode(/\.ifc$/i.test(usePath) ? '3d-building' : '2d');
      setScale(sc.recommendedScale);
      setActiveLayers((prev) => { const u = { ...prev }; sc.requiredLayers.forEach((l) => { u[l] = true; }); return u; });
      patchChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => m.id !== pendingId ? m : {
        id: pendingId, role: 'assistant', text: sc.aiSummary || 'No answer.', bigMetric: sc.bigMetric, scenario: sc,
        followUps: sc.followUpQuestions.map((f) => ({ id: f.id, question: f.question })), source,
      }) }));
    } catch (e) {
      patchChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => m.id !== pendingId ? m : {
        id: pendingId, role: 'assistant', error: true, text: `The question could not be answered: ${String((e as Error).message || e).slice(0, 200)}`,
      }) }));
    }
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionInput.trim();
    if (!q) return;
    void runPromptInCurrentChat(q);
    setQuestionInput('');
  };

  const resetTools = () => { setTool('view'); setRemoved(new Set()); setAdded([]); setMeasurePts([]); setToolMsg(''); };
  const rvPost = (route: string, body: unknown) =>
    fetch(`/api/rv/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const applyReview = async () => {
    if (!scenario || !activeChat) return;
    const who = verifyAuthor.trim() || 'Reviewer';
    setToolBusy(true);
    try {
      let answerId = (scenario as any).__rvId as string | undefined;
      if (!answerId) {
        const a = await rvPost('ask', { path: scenario.path, question: scenario.prompt });
        if (!a.answer_id) throw new Error(a.error || (a.warnings || []).join('; ') || 'review not available for this answer');
        answerId = a.answer_id; (scenario as any).__rvId = answerId;
      }
      const remove = scenario.targetIds.map((id, i) => (removed.has(id) ? i : -1)).filter((i) => i >= 0);
      const add = added.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.x + b.w), Math.round(b.y + b.h)]);
      const r = await rvPost('review', { answer_id: answerId, remove, add, user: who });
      const before = scenario.foundCount ?? '—';
      patchChat(activeChat.id, (c) => ({ ...c, messages: [...c.messages, {
        id: `rv-${Date.now()}`, role: 'assistant', bigMetric: String(r.value ?? '—'),
        text: `Model ${before} → reviewed by ${who}: ${r.value ?? '—'} (${remove.length} removed, ${add.length} added). Saved to the correction log.`,
      }] }));
      resetTools();
    } catch (e) {
      setToolMsg(`Could not apply: ${String((e as Error).message || e).slice(0, 160)}`);
    } finally { setToolBusy(false); }
  };
  const runMeasure = async (kind: 'calibrate' | 'area' | 'length') => {
    if (!imageSize || !activeChat) return;
    const norm = measurePts.map(([x, y]) => [Math.round((x * 1000) / imageSize[0]), Math.round((y * 1000) / imageSize[1])]);
    setToolBusy(true);
    try {
      if (kind === 'calibrate') {
        const len = parseFloat(calibLen.replace(',', '.'));
        if (norm.length !== 2 || !(len > 0)) { setToolMsg('Click both ends of a known dimension, then type its length in metres.'); return; }
        const r = await rvPost('calibrate', { path: askPath, p1: norm[0], p2: norm[1], length_m: len, image_size: imageSize, page: 0 });
        if (r.error) throw new Error(r.error);
        setMeasureStep('measure'); setMeasurePts([]); setToolMsg('Scale set. Now click the corners of an area (or a line for a length).');
        return;
      }
      const r = await rvPost('measure', { path: askPath, points: norm, kind, page: 0 });
      if (r.error || r.value == null) throw new Error(r.error || 'no value');
      const unit = r.unit === 'm2' ? 'm²' : r.unit || '';
      patchChat(activeChat.id, (c) => ({ ...c, messages: [...c.messages, {
        id: `ms-${Date.now()}`, role: 'assistant', bigMetric: `${Number(r.value).toFixed(2)} ${unit}`,
        text: `Measured ${kind} on the drawing (${measurePts.length} points, scale from ${r.scale_from || 'calibration'}).`,
      }] }));
      setMeasurePts([]); setToolMsg('Measured. Click new points for another measurement.');
    } catch (e) {
      setToolMsg(`Could not measure: ${String((e as Error).message || e).slice(0, 160)}`);
    } finally { setToolBusy(false); }
  };

  const toggleLayer = (layerId: LayerId) => setActiveLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));

  const openVerificationModal = () => {
    const t = unverifiedFixture || scenarioFixtures[0];
    if (t) {
      setVerifyTargetId(t.id);
      setVerifyStatus(t.status);
      setVerifyNote(t.verified ? t.note : '');
      setVerifyPhotoPreview(t.photoDataUrl);
    }
    setVerifyFile(null);
    setVerifyModalOpen(true);
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyFile(file);
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') setVerifyPhotoPreview(reader.result); };
    reader.readAsDataURL(file);
  };

  // ours: really stored (photo -> /api/collab/media, status only -> /api/verify/item), then re-read
  const handleSaveVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTargetId || !verifyAuthor.trim() || !scenario) return;
    const f = fixtures[verifyTargetId];
    setVerifyBusy(true);
    save('trace.gigi.inspector', verifyAuthor.trim());
    try {
      const space = (f as any)?.roomCode || '';
      if (verifyFile) {
        await api.uploadPhoto({ path: scenario.path, item_id: verifyTargetId, space_id: space, author: verifyAuthor.trim(), note: verifyNote.trim(), status: verifyStatus }, verifyFile);
      } else {
        await api.setStatus({ path: scenario.path, item_id: verifyTargetId, space_id: space, status: verifyStatus, note: verifyNote.trim(), author: verifyAuthor.trim() });
      }
      await refreshFixtures(scenario);
      setVerifyModalOpen(false);
    } catch (err) {
      alert(`Could not save: ${String((err as Error).message || err).slice(0, 160)}`);
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleUploadDrawing = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file, file.name);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (r.path) {
        const p: Project = { id: `upload-${r.path}`, title: file.name, subtitle: 'Uploaded', model: /\.ifc$/i.test(r.path) ? r.path : null, plan: /\.ifc$/i.test(r.path) ? null : r.path };
        setProjects((prev) => [p, ...prev]);
        switchProject(p);
      }
    } catch { /* surfaced by the empty plan */ }
    e.target.value = '';
  };

  const getStatusLabel = (status: VerificationStatus) => {
    if (status === 'Installed') return (<span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>Installed</span></span>);
    if (status === 'Issue Reported') return (<span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /><span>Issue Reported</span></span>);
    if (status === 'Not checked') return (<span className="inline-flex items-center gap-1 text-[#555C60] font-semibold"><Clock className="w-3.5 h-3.5 text-[#8A9194]" /><span>Not checked yet</span></span>);
    return (<span className="inline-flex items-center gap-1 text-[#9A7218] font-semibold"><Clock className="w-3.5 h-3.5 text-[#9A7218]" /><span>In Progress</span></span>);
  };

  // ---------------- Left Rail ----------------
  const renderLeftRail = () => (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#9A7218]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#202427]">History</h2>
          </div>
          <div className="flex items-center gap-1">
            {/* ours: upload your own drawing */}
            <button type="button" onClick={() => uploadRef.current?.click()} title="Upload a drawing or model" aria-label="Upload a drawing or model"
              className="w-6 h-6 rounded-md bg-white border border-[#A9AFB0]/60 text-[#202427] hover:border-[#202427] flex items-center justify-center transition-colors cursor-pointer shrink-0">
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input ref={uploadRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.dxf,.ifc,.tif,.tiff" className="hidden" onChange={handleUploadDrawing} />
            <button type="button" onClick={handleCreateNewChat} title="Start new chat" aria-label="Start new chat"
              className="w-6 h-6 rounded-md bg-[#202427] text-[#E9B949] hover:bg-[#202427]/90 flex items-center justify-center transition-colors cursor-pointer shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          {chats.length === 0 && (
            <p className="text-[11px] text-[#202427]/60 leading-snug">No chats yet for this project. Ask a question on the right.</p>
          )}
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <button key={chat.id} type="button" onClick={() => handleSelectChat(chat)}
                className={`w-full text-left p-2 rounded-md text-xs transition-colors cursor-pointer ${isActive ? 'bg-[#E9B949]/40 text-[#202427] font-semibold' : 'bg-white/75 text-[#202427]/80 hover:bg-white'}`}>
                <div className="line-clamp-2 leading-snug">{chat.title}</div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#202427]/55 mt-1">
                  <span>{chat.timestamp}</span>
                  <span>{chat.messages.length} msgs</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-3.5 border-t border-[#A9AFB0]/35">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#202427]">Scale (AI LoD)</h2>
          <span className="text-[10px] font-mono text-[#9A7218]">Auto</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['1:200', '1:100', '1:50', '1:20'] as ScaleOption[]).map((sc) => (
            <button key={sc} type="button" onClick={() => setScale(sc)}
              className={`py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${scale === sc ? 'bg-[#202427] text-[#E9B949] border-[#202427]' : 'bg-white text-[#202427] border-[#A9AFB0]/45 hover:border-[#202427]'}`}>
              {sc}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-[#202427]/65 leading-snug">
          {scale === '1:200' && 'Overview · Whole sheet.'}
          {scale === '1:100' && 'Submission · 2× around the answer.'}
          {scale === '1:50' && 'Execution · Room in focus with dimensions.'}
          {scale === '1:20' && 'Detail · Selected element in focus.'}
        </p>
      </div>

      <div className="pt-3.5 border-t border-[#A9AFB0]/35">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#202427] mb-2">Layer Guide</h2>
        <div className="space-y-1">
          {LAYER_GUIDE.map((layer) => {
            const isOn = activeLayers[layer.id];
            return (
              <button key={layer.id} type="button" onClick={() => toggleLayer(layer.id)}
                className="w-full text-left py-1 px-1.5 rounded hover:bg-[#202427]/5 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer">
                <span className={`truncate ${isOn ? 'text-[#202427] font-medium' : 'text-[#202427]/40 line-through'}`}>{layer.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${isOn ? 'bg-[#E9B949]/45 text-[#202427] font-semibold' : 'bg-[#A9AFB0]/20 text-[#202427]/50'}`}>{isOn ? 'ON' : 'OFF'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ---------------- Center Canvas ----------------
  const renderCenterCanvas = () => (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-[#202427]">Floor plan</span>
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-[#F7F6F2] border border-[#A9AFB0]/35">
              <button type="button" onClick={() => setViewMode('2d')}
                className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer ${viewMode === '2d' ? 'bg-[#202427] text-[#F7F6F2]' : 'text-[#202427]/70'}`}>2D</button>
              <button type="button" onClick={() => setViewMode('3d-building')}
                className={`px-2.5 py-0.5 text-xs font-medium rounded inline-flex items-center gap-1 transition-colors cursor-pointer ${viewMode !== '2d' ? 'bg-[#E9B949] text-[#202427] font-semibold' : 'text-[#202427]/70'}`}>
                <Box className="w-3 h-3" /><span>3D</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === '2d' && scenario && scenarioFixtures.length > 0 && (
              <button type="button" onClick={() => (tool === 'fix' ? resetTools() : (resetTools(), setTool('fix')))}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${tool === 'fix' ? 'bg-[#202427] text-[#E9B949] border-[#202427]' : 'bg-white text-[#202427] border-[#A9AFB0]/50 hover:border-[#202427]'}`}>
                Fix count
              </button>
            )}
            {viewMode === '2d' && isRaster && (
              <button type="button" onClick={() => (tool === 'measure' ? resetTools() : (resetTools(), setTool('measure'), setMeasureStep('calibrate')))}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${tool === 'measure' ? 'bg-[#202427] text-[#E9B949] border-[#202427]' : 'bg-white text-[#202427] border-[#A9AFB0]/50 hover:border-[#202427]'}`}>
                Measure
              </button>
            )}
            <span className="text-xs font-mono text-[#202427]/60">{activeFloor} · M {scale}</span>
          </div>
        </div>
        {tool !== 'view' && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-[#202427] text-[#F7F6F2] text-[11px] flex flex-wrap items-center gap-2">
            {tool === 'fix' ? (
              <>
                <span className="text-[#E9B949] font-semibold">Fix count</span>
                <span className="text-[#A9AFB0]">Click a wrong mark to remove it · drag on the sheet to add a missed one</span>
                <span className="font-mono">−{removed.size} · +{added.length}</span>
                <button type="button" disabled={toolBusy || (removed.size === 0 && added.length === 0)} onClick={() => void applyReview()}
                  className="ml-auto px-2.5 py-1 rounded bg-[#E9B949] text-[#202427] font-semibold cursor-pointer disabled:opacity-50">{toolBusy ? 'Saving…' : 'Apply'}</button>
                <button type="button" onClick={resetTools} className="px-2 py-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer">Cancel</button>
              </>
            ) : measureStep === 'calibrate' ? (
              <>
                <span className="text-[#E9B949] font-semibold">Set scale</span>
                <span className="text-[#A9AFB0]">Click both ends of a known dimension (or the scale bar), then type its length:</span>
                <input value={calibLen} onChange={(e) => setCalibLen(e.target.value)} placeholder="m" className="w-16 px-2 py-0.5 rounded bg-white text-[#202427] font-mono" />
                <span className="font-mono">{measurePts.length}/2 points</span>
                <button type="button" disabled={toolBusy || measurePts.length !== 2} onClick={() => void runMeasure('calibrate')}
                  className="ml-auto px-2.5 py-1 rounded bg-[#E9B949] text-[#202427] font-semibold cursor-pointer disabled:opacity-50">Set scale</button>
                <button type="button" onClick={() => setMeasurePts([])} className="px-2 py-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer">Clear</button>
                <button type="button" onClick={resetTools} className="px-2 py-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer">Close</button>
              </>
            ) : (
              <>
                <span className="text-[#E9B949] font-semibold">Measure</span>
                <span className="text-[#A9AFB0]">Click the corners of a room (area) or along a wall (length, e.g. baseboard)</span>
                <span className="font-mono">{measurePts.length} points</span>
                <button type="button" disabled={toolBusy || measurePts.length < 3} onClick={() => void runMeasure('area')} className="ml-auto px-2.5 py-1 rounded bg-[#E9B949] text-[#202427] font-semibold cursor-pointer disabled:opacity-50">Area</button>
                <button type="button" disabled={toolBusy || measurePts.length < 2} onClick={() => void runMeasure('length')} className="px-2.5 py-1 rounded bg-[#E9B949] text-[#202427] font-semibold cursor-pointer disabled:opacity-50">Length</button>
                <button type="button" onClick={() => setMeasurePts([])} className="px-2 py-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer">Clear</button>
                <button type="button" onClick={resetTools} className="px-2 py-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer">Close</button>
              </>
            )}
            {toolMsg && <span className="basis-full text-[#E9B949]">{toolMsg}</span>}
          </div>
        )}

        {/* Keynotes Strip */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <div className="rounded-xl border border-[#A9AFB0]/45 bg-[#F7F6F2]/70 px-3.5 py-2.5">
            <div className="text-[11px] font-mono font-semibold text-[#202427]/75 truncate">{scenario?.roomCode || activeFloor}</div>
            <div className="text-lg font-display font-semibold tabular-nums text-[#202427]">{scenario?.roomArea || '—'}</div>
            <div className="text-[10px] font-mono text-[#202427]/65 truncate">{scenario?.roomDimensions || 'Ask a question to focus a room'}</div>
          </div>
          <div className="rounded-xl border border-[#A9AFB0]/45 bg-[#F7F6F2]/70 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-[#202427]/75">Objects found</div>
            <div className="text-2xl font-display font-semibold tabular-nums text-[#202427] leading-tight mt-0.5">
              {scenario ? (scenario.foundCount ?? scenario.bigMetric) : '—'}
            </div>
          </div>
          <div className={`rounded-xl border px-3.5 py-2.5 ${overallStatus === 'Issue Reported' && scenario ? 'border-red-300 bg-red-50/70' : 'border-[#A9AFB0]/45 bg-[#F7F6F2]/70'}`}>
            <div className="text-[11px] font-medium text-[#202427]/75">Status</div>
            <div className="text-xs mt-1.5">{scenario ? getStatusLabel(overallStatus) : <span className="text-[#202427]/50">No answer yet</span>}</div>
            <div className="text-[10px] font-mono text-[#202427]/65 mt-1 truncate" title="Site checks recorded for the elements in this answer">
              {scenarioFixtures.length ? [counts['Issue Reported'] && `${counts['Issue Reported']} issue`, counts['In Progress'] && `${counts['In Progress']} in progress`, counts['Installed'] && `${counts['Installed']} checked`, counts['Not checked'] && `${counts['Not checked']} not checked`].filter(Boolean).join(' · ') : '—'}
            </div>
          </div>
        </div>

        <div className="border border-[#A9AFB0]/40 rounded-xl overflow-hidden">
          {viewMode === '2d' ? (
            !project.model || !/\.ifc$/i.test(askPath) ? (
              <RealPlan path={askPath} page={sheetPage} scenario={scenario} activeLayers={activeLayers} scale={scale} activeFloor={activeFloor}
                fixtures={fixtures} selectedFixtureId={selectedFixtureId} onImageSize={setImageSize}
                evidenceSource={evidenceSource?.file === askPath && (evidenceSource.page ?? 1) === sheetPage ? evidenceSource : null}
                tool={tool} removed={removed} added={added} measurePts={measurePts}
                onToggleRemove={(id) => setRemoved((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                onAddBox={(b) => setAdded((prev) => [...prev, b])}
                onMeasurePoint={(p) => setMeasurePts((prev) => (measureStep === 'calibrate' && prev.length >= 2 ? [p] : [...prev, p]))}
                onSelectFixtureFor3D={(id) => { setSelectedFixtureId(id); setViewMode('3d-room'); }} />
            ) : (
              <div className="h-[420px] flex flex-col items-center justify-center gap-2 bg-[#FCFCF9] blueprint-grid-bg text-center px-8">
                <span className="text-sm font-semibold text-[#202427]">{project.plan && askPath !== project.plan ? "This is the 3D model — pick a 2D sheet from the sheet menu" : "This project is a BIM model without a 2D sheet"}</span>
                <button type="button" onClick={() => setViewMode('3d-building')} className="px-3 py-1.5 rounded-md bg-[#E9B949] text-[#202427] text-xs font-semibold cursor-pointer">Open the 3D model →</button>
              </div>
            )
          ) : (
            <Real3D mode={viewMode === '3d-building' ? 'building' : 'room'} scenario={scenario} model={project.model} plan={project.plan}
              fixture={active3DFixture} siblingFixtures={scenarioFixtures}
              onSwitchMode={(m) => setViewMode(m === 'building' ? '3d-building' : '3d-room')}
              onSelectSibling={(id) => { if (fixtures[id]) setSelectedFixtureId(id); }} onBackTo2D={() => setViewMode('2d')}
              onAsk={(q) => void runPromptInCurrentChat(q)}
              onOpenSource={(source) => { setEvidenceSource(source); setAskPath(source.file); setSheetPage(source.page ?? 1); setViewMode('2d'); }}
              storeyId={storeyId} onStoreys={(list) => setStoreys([...list].sort((a, b) => b.elevation - a.elevation))}
              visibleLayers={{ architecture: activeLayers.architecture, sanitary: activeLayers.sanitary, hvac: activeLayers.hvac, electrical: activeLayers.electrical, furniture: activeLayers.furniture }} />
          )}
        </div>
      </div>

      {/* Bottom-Center Verify Action Button */}
      <div className="pt-3.5 flex flex-col items-center justify-center gap-1">
        <button type="button" onClick={openVerificationModal} disabled={!scenarioFixtures.length}
          className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${allTargetsVerified ? 'bg-[#202427] text-[#F7F6F2] border-[#202427] hover:bg-[#202427]/90' : 'bg-[#E9B949] text-[#202427] border-[#C98A12] hover:bg-[#E9B949]/90'}`}>
          <Camera className="w-3.5 h-3.5" />
          <span>{allTargetsVerified ? 'Update Verification' : 'Verify on Site · Add Photo'}</span>
          <ArrowDown className="w-3 h-3 opacity-70" />
        </button>
        <span className="text-[10px] font-mono text-[#202427]/60">
          {!scenarioFixtures.length ? 'Ask a question to get elements to verify.'
            : allTargetsVerified ? 'All targets verified — hover >1s over any mark for photo.'
            : unverifiedFixture?.status === 'Issue Reported' ? `${unverifiedFixture.code} (red) has a reported issue.` : 'Add a site photo to record a check.'}
        </span>
      </div>
    </div>
  );

  // ---------------- Right Rail ----------------
  const renderRightRail = () => (
    <div className="flex flex-col h-full justify-between min-h-0">
      <div className="px-4 pt-3.5 pb-2 border-b border-[#A9AFB0]/30 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-[#202427] truncate">{activeChat?.title || 'Ask Trace about this plan'}</h2>
        <span className="text-[10px] font-mono text-[#9A7218] shrink-0">{activeFloor}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {(activeChat?.messages || []).map((msg) => {
          const sc = msg.scenario;
          const msgFixtures = sc ? sc.targetIds.map((id) => fixtures[id] || (sc as any).__fixtures?.[id]).filter(Boolean) as FixtureVerification[] : [];
          return (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[94%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-[#202427] text-[#F7F6F2]' : msg.error ? 'bg-red-50 border border-red-300 text-red-900' : 'bg-white border border-[#A9AFB0]/45 text-[#202427]'}`}>
                {msg.pending && <Loader2 className="w-4 h-4 animate-spin text-[#9A7218] mb-1" />}
                {msg.bigMetric && <div className="text-2xl font-display font-semibold text-[#202427] tabular-nums mb-1">{msg.bigMetric}</div>}
                <p className="whitespace-pre-line">{msg.text}</p>
                {msg.source && (
                  <button type="button" onClick={() => { setAskPath(msg.source!.path); setSheetPage(msg.source!.page); setViewMode(/\.ifc$/i.test(msg.source!.path) ? '3d-building' : '2d'); }}
                    title={`Why this sheet: ${msg.source.why.join(' · ')}`}
                    className="mt-2 w-full text-left px-2 py-1.5 rounded bg-[#F7F6F2] border border-[#A9AFB0]/45 text-[10.5px] text-[#202427]/80 hover:border-[#E9B949] cursor-pointer">
                    <span className="font-semibold text-[#202427]">Answer from sheet:</span> {msg.source.label}
                    <span className="block font-mono text-[10px] text-[#202427]/55 truncate">{msg.source.path.split('/').pop()}{msg.source.page > 1 ? ` · page ${msg.source.page}` : ''} · picked because: {msg.source.why.join(', ')}</span>
                  </button>
                )}

                {/* ours: uncertain readings / alternatives from the engine */}
                {sc?.uncertain && (
                  <div className="mt-2 px-2 py-1.5 rounded bg-[#FFF8E1] border border-[#D49A1A] text-[11px] text-[#7A5200]">Two readings disagree — please review the marks.</div>
                )}
                {sc && sc.alternatives.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sc.alternatives.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-[#F7F6F2] border border-[#A9AFB0]/45 text-[10px] font-mono">{a.label}: {a.value}</span>
                    ))}
                  </div>
                )}

                {msg.role === 'assistant' && sc && msgFixtures.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#A9AFB0]/25 space-y-1.5">
                    <button type="button" onClick={() => {
                      if (!selectedFixtureId && msgFixtures[0]) setSelectedFixtureId(msgFixtures[0].id);
                      setViewMode('3d-room');
                      if (devicePreview === 'mobile') setMobileTab('plan');
                    }} className="w-full py-1.5 px-2.5 rounded bg-[#E9B949] hover:bg-[#E9B949]/90 text-[#202427] text-[11px] font-semibold transition-colors cursor-pointer text-left">
                      View {sc.roomCode} in 3D →
                    </button>
                    {[...msgFixtures].sort((a, b) => ['Issue Reported', 'In Progress', 'Installed', 'Not checked'].indexOf(a.status) - ['Issue Reported', 'In Progress', 'Installed', 'Not checked'].indexOf(b.status)).slice(0, 8).map((fix) => (
                      <button key={fix.id} type="button" onClick={() => { setSelectedFixtureId(fix.id); setViewMode('3d-room'); if (devicePreview === 'mobile') setMobileTab('plan'); }}
                        className={`w-full text-left px-2 py-1 rounded border flex items-center justify-between gap-1.5 text-[11px] cursor-pointer ${fix.status === 'Issue Reported' ? 'bg-red-50 border-red-300 text-red-900' : 'bg-[#F7F6F2] border-[#A9AFB0]/35 text-[#202427]'}`}>
                        <span className="font-mono font-semibold">{fix.code}</span>
                        <span className={`truncate flex-1 ${fix.status === 'Not checked' ? 'text-[#202427]/55' : ''}`}>{fix.status}</span>
                        <span className="font-medium underline">3D</span>
                      </button>
                    ))}
                    {msgFixtures.length > 8 && <div className="text-[10px] font-mono text-[#202427]/55">+{msgFixtures.length - 8} more marked on the plan</div>}
                  </div>
                )}

                {/* ours: How I got this */}
                {sc && (
                  <div className="mt-2 pt-1.5 border-t border-[#A9AFB0]/25">
                    <button type="button" onClick={() => setHowOpen((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                      className="w-full flex items-center justify-between text-[10px] font-semibold text-[#9A7218] cursor-pointer">
                      <span>How I got this · {sc.how.sourceLabel || sc.how.source} · {sc.responseTime} · {sc.how.tokens ? `${sc.how.tokens.toLocaleString()} tokens` : '0 tokens'}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${howOpen[msg.id] ? 'rotate-180' : ''}`} />
                    </button>
                    {howOpen[msg.id] && (
                      <div className="mt-1.5 space-y-1 text-[10px] font-mono text-[#202427]/75 break-words">
                        <div>method: {sc.how.method || '—'}</div>
                        {sc.how.badge && <div>check: {sc.how.badge.text}</div>}
                        {sc.how.formula && <div>formula: {sc.how.formula}</div>}
                        <div>cost: ${sc.how.costUsd.toFixed(4)} · file: {sc.path.split('/').pop()}</div>
                        {sc.how.warnings.map((w, i) => <div key={i} className="text-[#9A6500]">⚠ {w}</div>)}
                      </div>
                    )}
                  </div>
                )}

                {msg.role === 'assistant' && msg.followUps && msg.followUps.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#A9AFB0]/25 space-y-1.5">
                    <div className="text-[10px] font-semibold text-[#9A7218]">Follow-up:</div>
                    {msg.followUps.map((fu) => (
                      <button key={fu.id} type="button" onClick={() => void runPromptInCurrentChat(fu.question)}
                        className="w-full text-left p-2 rounded-lg bg-[#F7F6F2] hover:bg-[#E9B949]/25 border border-[#A9AFB0]/40 text-[11px] text-[#202427] leading-snug transition-colors cursor-pointer">
                        {fu.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {(!activeChat || !activeChat.messages.some((m) => m.role === 'user')) && (
          <div className="space-y-1.5 pt-2">
            <div className="text-[10px] font-semibold text-[#202427]/65">Quick prompts:</div>
            {quickPrompts.map((p) => (
              <button key={p} type="button" onClick={() => void runPromptInCurrentChat(p)}
                className="w-full text-left p-2 rounded-lg bg-white hover:bg-[#E9B949]/20 border border-[#A9AFB0]/45 text-[11px] text-[#202427] transition-colors cursor-pointer">
                {p}
              </button>
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleAskSubmit} className="p-3 border-t border-[#A9AFB0]/35 bg-[#F7F6F2] flex items-center gap-2 shrink-0">
        <input type="text" value={questionInput} onChange={(e) => setQuestionInput(e.target.value)} placeholder="Message Trace. about this plan..."
          className="flex-1 px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg text-[#202427] focus:outline-none focus:border-[#202427]" />
        <button type="submit" aria-label="Send message" className="p-2 rounded-lg bg-[#202427] text-[#E9B949] hover:bg-[#202427]/90 transition-colors cursor-pointer shrink-0">
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="gigi-root flex flex-col bg-[#E8E6DF] text-[#202427] min-h-[100vh] font-sans">
      {/* Native App Window Sub-Bar */}
      <div className="bg-[#202427] text-[#A9AFB0] px-5 py-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs relative">
        <div className="flex items-center gap-1.5 font-mono">
          {onHome && (
            <button type="button" onClick={onHome} className="inline-flex items-center gap-1 px-1.5 py-0.5 mr-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer">
              <ArrowLeft className="w-3 h-3" /><span>Home</span>
            </button>
          )}
          <span className="text-[#F7F6F2] font-medium">TRACE DESKTOP APP ·</span>
          {/* ours: PROJECT opens the real project list */}
          <div className="relative">
            <button type="button" onClick={() => setProjectMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/10 text-[#F7F6F2] font-medium cursor-pointer max-w-[280px]">
              <span className="truncate">{project.title.toUpperCase()}</span><ChevronDown className="w-3 h-3 shrink-0" />
            </button>
            {projectMenuOpen && (
              <div onMouseLeave={() => setProjectMenuOpen(false)} className="absolute left-0 top-full mt-1.5 w-80 max-h-[60vh] overflow-y-auto rounded-xl bg-[#202427] border border-[#E9B949]/60 shadow-xl py-1.5 z-50">
                <div className="px-3 py-1 text-[10px] font-mono text-[#A9AFB0] border-b border-white/10">Switch Project</div>
                {projects.map((p) => (
                  <button key={p.id} type="button" onClick={() => switchProject(p)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${project.id === p.id ? 'bg-[#E9B949]/20 text-[#E9B949]' : 'text-[#F7F6F2] hover:bg-white/10'}`}>
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{p.title}</div>
                      <div className="text-[10px] text-[#A9AFB0] font-sans truncate">{p.subtitle || (p.model ? 'BIM model' : 'Drawing')}{p.demo_data ? ' · Demo data' : ''}</div>
                    </div>
                    {project.id === p.id && <Check className="w-3.5 h-3.5 text-[#E9B949] shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span>·</span>
          <div className="relative" onMouseEnter={handleFloorMouseEnter} onMouseLeave={handleFloorMouseLeave}>
            <button type="button" onClick={() => setFloorMenuOpen((v) => !v)} title="Hover 1s or click to switch sheet"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-[#E9B949] hover:text-[#202427] text-[#E9B949] font-semibold transition-colors cursor-pointer">
              <span>{activeFloor}</span><ChevronDown className="w-3 h-3" />
            </button>
            {floorMenuOpen && (
              <div onMouseLeave={() => setFloorMenuOpen(false)} className="absolute left-0 top-full mt-1.5 w-80 rounded-xl bg-[#202427] border border-[#E9B949]/60 shadow-xl py-1.5 z-50">
                {project.model && (
                  <>
                    <div className="px-3 py-1 text-[10px] font-mono text-[#A9AFB0] border-b border-white/10">Building Floors (3D)</div>
                    {storeys.length === 0 && <div className="px-3 py-2 text-[11px] text-[#A9AFB0]">Open the 3D view once to load the floors…</div>}
                    {[{ id: '', name: 'Whole building', elevation: 0 }, ...storeys].map((st) => (
                      <button key={st.id || 'all'} type="button" onClick={() => { setStoreyId(st.id || null); setViewMode('3d-building'); setFloorMenuOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${(storeyId || '') === st.id ? 'bg-[#E9B949]/20 text-[#E9B949]' : 'text-[#F7F6F2] hover:bg-white/10'}`}>
                        <div className="min-w-0">
                          <div className="font-mono font-semibold">{st.id ? st.name.toUpperCase() : 'WHOLE BUILDING'}</div>
                          {st.id && <div className="text-[10px] text-[#A9AFB0] font-sans">+{st.elevation.toFixed(1)} m · only this floor, seen from above</div>}
                        </div>
                        {(storeyId || '') === st.id && <Check className="w-3.5 h-3.5 text-[#E9B949]" />}
                      </button>
                    ))}
                  </>
                )}
                {sheetCount > 0 ? (
                  <div className="max-h-[50vh] overflow-y-auto">
                    <div className="px-3 py-1 text-[10px] font-mono text-[#A9AFB0] border-y border-white/10">Sheet Set · {sheetCount} drawing{sheetCount === 1 ? '' : 's'} by discipline</div>
                    {sheetGroups.map((g) => (
                      <div key={g.discipline}>
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[#E9B949]/90">{g.label} · {g.sheets.length}</div>
                        {g.sheets.map((sh) => {
                          const on = askPath === sh.path && (sheetPage === sh.page || /\.ifc$/i.test(sh.path));
                          return (
                            <button key={`${sh.path}#${sh.page}`} type="button" title={`Sorted here because: ${sh.why.join(' · ')}`}
                              onClick={() => { setAskPath(sh.path); setSheetPage(sh.page); setStoreyId(null); setFloorMenuOpen(false); setViewMode(/\.ifc$/i.test(sh.path) ? '3d-building' : '2d'); }}
                              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${on ? 'bg-[#E9B949]/20 text-[#E9B949]' : 'text-[#F7F6F2] hover:bg-white/10'}`}>
                              <div className="min-w-0">
                                <div className="font-mono font-semibold truncate">{sheetName(sh)}</div>
                                <div className="text-[10px] text-[#A9AFB0] font-sans truncate">{sh.title ? `${sh.title} · ` : ''}{sheetFile(sh)}</div>
                              </div>
                              {on && <Check className="w-3.5 h-3.5 text-[#E9B949] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (<>
                <div className="px-3 py-1 text-[10px] font-mono text-[#A9AFB0] border-y border-white/10">Switch Sheet (2D)</div>
                {[project.plan, project.model].filter(Boolean).map((p) => (
                  <button key={p!} type="button" onClick={() => { setAskPath(p!); setStoreyId(null); setFloorMenuOpen(false); setViewMode(p!.toLowerCase().endsWith('.ifc') ? '3d-building' : '2d'); }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${askPath === p ? 'bg-[#E9B949]/20 text-[#E9B949]' : 'text-[#F7F6F2] hover:bg-white/10'}`}>
                    <div className="min-w-0">
                      <div className="font-mono font-semibold">{sheetLabel(project, p!)}</div>
                      <div className="text-[10px] text-[#A9AFB0] font-sans truncate">{p!.split('/').pop()}</div>
                    </div>
                    {askPath === p && <Check className="w-3.5 h-3.5 text-[#E9B949]" />}
                  </button>
                ))}
                </>)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setDownloadToast((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[#F7F6F2] text-[11px] font-medium transition-colors cursor-pointer">
            <Download className="w-3 h-3 text-[#E9B949]" /><span>Download App</span>
          </button>
          <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-md">
            {([['desktop', Monitor, 'Desktop'], ['tablet', Tablet, 'Tablet'], ['mobile', Smartphone, 'Mobile']] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" onClick={() => setDevicePreview(id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${devicePreview === id ? 'bg-[#E9B949] text-[#202427]' : 'text-[#A9AFB0] hover:text-[#F7F6F2]'}`}>
                <Icon className="w-3 h-3" /><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {downloadToast && (
        <div className="bg-[#E9B949] text-[#202427] px-5 py-2 text-xs font-medium flex items-center justify-between">
          <span>Trace. runs in the browser today; desktop and field apps are on the roadmap.</span>
          <button type="button" onClick={() => setDownloadToast(false)} className="font-semibold underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {devicePreview === 'desktop' && (
        <div className="flex-1 overflow-x-auto bg-white">
          <div className="min-w-[740px] h-[calc(100vh-2.75rem)] min-h-[600px] grid grid-cols-[195px_minmax(0,1fr)_260px] md:grid-cols-[210px_minmax(0,1fr)_280px] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
            <aside className="bg-[#F7F6F2] border-r border-[#A9AFB0]/35 px-3.5 py-4 overflow-y-auto">{renderLeftRail()}</aside>
            <section className="bg-white p-4 sm:p-5 overflow-y-auto flex flex-col justify-between">{renderCenterCanvas()}</section>
            <aside className="bg-[#F7F6F2] border-l border-[#A9AFB0]/35 overflow-hidden flex flex-col">{renderRightRail()}</aside>
          </div>
        </div>
      )}

      {devicePreview === 'tablet' && (
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="w-full max-w-[920px] h-[680px] rounded-2xl border-4 border-[#202427] bg-white shadow-xl overflow-hidden grid grid-cols-[185px_minmax(0,1fr)_255px]">
            <aside className="bg-[#F7F6F2] border-r border-[#A9AFB0]/35 px-3 py-4 overflow-y-auto">{renderLeftRail()}</aside>
            <section className="bg-white p-4 overflow-y-auto">{renderCenterCanvas()}</section>
            <aside className="bg-[#F7F6F2] border-l border-[#A9AFB0]/35 overflow-hidden flex flex-col">{renderRightRail()}</aside>
          </div>
        </div>
      )}

      {devicePreview === 'mobile' && (
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="relative w-[390px] h-[700px] rounded-[28px] border-4 border-[#202427] bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 bg-[#202427] text-[#F7F6F2] flex items-center justify-between text-xs font-mono shrink-0">
              <span>TRACE. FIELD · {activeFloor}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#E9B949]">M {scale}</span>
                <button type="button" onClick={() => setMobileDrawerOpen((v) => !v)} aria-label="Open History and Layers" title="History, Scale & Layers"
                  className="p-1.5 rounded-md bg-white/10 hover:bg-[#E9B949] hover:text-[#202427] text-[#E9B949] transition-colors cursor-pointer">
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-white flex flex-col">
              {mobileTab === 'plan' && <div className="p-3.5">{renderCenterCanvas()}</div>}
              {mobileTab === 'ask' && <div className="flex-1 flex flex-col">{renderRightRail()}</div>}
            </div>
            <nav aria-label="Mobile app tabs" className="grid grid-cols-2 border-t border-[#A9AFB0]/40 bg-[#F7F6F2] shrink-0">
              <button type="button" onClick={() => setMobileTab('plan')} className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium cursor-pointer ${mobileTab === 'plan' ? 'text-[#202427] bg-[#E9B949]/35' : 'text-[#202427]/65'}`}>
                <Box className="w-4 h-4" /><span>Plan / 3D</span>
              </button>
              <button type="button" onClick={() => setMobileTab('ask')} className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium cursor-pointer ${mobileTab === 'ask' ? 'text-[#202427] bg-[#E9B949]/35' : 'text-[#202427]/65'}`}>
                <MessageSquare className="w-4 h-4" /><span>Assistant</span>
              </button>
            </nav>
            {mobileDrawerOpen && (
              <div className="absolute inset-0 z-30 bg-[#202427]/55 backdrop-blur-xs flex justify-end" role="dialog" aria-modal="true" aria-label="History and Layers">
                <div className="w-[85%] h-full bg-[#F7F6F2] border-l border-[#A9AFB0]/50 flex flex-col overflow-hidden">
                  <div className="px-4 py-3 bg-[#202427] text-[#F7F6F2] flex items-center justify-between">
                    <span className="text-xs font-semibold">History, Scale &amp; Layers</span>
                    <button type="button" onClick={() => setMobileDrawerOpen(false)} aria-label="Close popup" className="p-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">{renderLeftRail()}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {verifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202427]/65 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="verify-modal-title">
          <div className="w-full max-w-md rounded-xl bg-[#F7F6F2] text-[#202427] border border-[#A9AFB0]/60 shadow-xl overflow-hidden">
            <div className="px-5 py-4 bg-[#202427] text-[#F7F6F2] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-[#E9B949]">On-Site Ground Truth</p>
                <h3 id="verify-modal-title" className="text-base font-semibold">{allTargetsVerified ? 'Update Site Verification' : 'Verify & Pin Site Photo'}</h3>
              </div>
              <button type="button" onClick={() => setVerifyModalOpen(false)} aria-label="Close modal" className="p-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveVerification} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Target Fixture</label>
                <select value={verifyTargetId} onChange={(e) => { const id = e.target.value; setVerifyTargetId(id); const f = fixtures[id]; if (f) { setVerifyStatus(f.status); setVerifyNote(f.verified ? f.note : ''); setVerifyPhotoPreview(f.photoDataUrl); } }}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg">
                  {scenarioFixtures.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.label} ({f.status})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Inspector Name</label>
                  <input type="text" required value={verifyAuthor} onChange={(e) => setVerifyAuthor(e.target.value)} placeholder="e.g. L. Saarinen"
                    className="w-full px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select value={verifyStatus} onChange={(e) => setVerifyStatus(e.target.value as VerificationStatus)} className="w-full px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg">
                    <option value="Installed">Installed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Issue Reported">Issue Reported</option>
                    <option value="Not checked">Not checked</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Attach Site Photo</label>
                <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-[#202427]/40 bg-white text-xs font-medium cursor-pointer hover:border-[#202427]">
                  <Upload className="w-4 h-4 text-[#9A7218]" /><span>{verifyFile ? verifyFile.name : 'Upload photo from device / camera'}</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoFileChange} className="hidden" />
                </label>
                {verifyPhotoPreview && <img src={verifyPhotoPreview} alt="" className="mt-2 h-24 w-full object-cover rounded-lg border border-[#A9AFB0]/45" />}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Verification Note</label>
                <textarea rows={2} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} className="w-full px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg" />
              </div>
              <button type="submit" disabled={verifyBusy}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                {verifyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Save Verification to Coordinate</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealWorkspace;
