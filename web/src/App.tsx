import { useEffect, useMemo, useRef, useState } from 'react'
import { ask, fileUrl, getCollab, getPlanRooms, inventory, listProjectDocs, renderMoodImage, sampleQuestions, type PlanRoom, type PlanRoomsResult, type ProjectDocument } from './api'
import { DEMO_ITEMS, type DemoItem } from './demo'
import DrawingViewer from './DrawingViewer'
import IfcViewer, { type PlacedProduct } from './IfcViewer'
import CommunityPage from './components/CommunityPage'
import SharedPlanPanel from './components/SharedPlanPanel'
import LandingPage from './components/LandingPage'
import SpaceTree, { type TreeEntry } from './components/SpaceTree'
import UploadButton from './components/UploadButton'
import VerifyBadge from './components/VerifyBadge'
import { HowIGotThis } from './components/HowIGotThis'
import { DatasetBrowser, CatalogProjects, type CatalogItem, type CatalogProject } from './components/DatasetBrowser'
import PlanRooms3D from './components/PlanRooms3D'
import type { AskResponse, CollabState, DatasetQuestion, Evidence, Role, Source } from './types'

const SOURCES = ['', 'cubicasa5k', 'swiss_dwellings', 'ifc_models', 'ifc_bench', 'opening_design']
const ROLES: { v: Role; label: string }[] = [
  { v: '', label: 'Any role' },
  { v: 'architect', label: 'Architect' },
  { v: 'electrician', label: 'Electrician' },
  { v: 'plumber', label: 'Plumber' },
  { v: 'owner', label: 'Owner' },
]

function renderBoldMarkdown(text: string) {
  return text.split(/(\*\*[^*]+?\*\*|__[^_]+?__)/g).map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function renderAnswerWithDocuments(text: string, documents: ProjectDocument[], onOpen: (document: ProjectDocument) => void) {
  const names = documents.flatMap(doc => [doc.filename, doc.title || ''].filter(Boolean).map(name => ({ name, doc })))
    .sort((a, b) => b.name.length - a.name.length)
  if (!names.length) return renderBoldMarkdown(text)
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`(${names.map(item => escapeRegExp(item.name)).join('|')})`, 'ig')
  return text.split(matcher).map((part, index) => {
    const match = names.find(item => item.name.toLowerCase() === part.toLowerCase())
    return match ? <button type="button" className="answer-document-link" key={index} onClick={() => onOpen(match.doc)}>{part}</button> : <span key={index}>{renderBoldMarkdown(part)}</span>
  })
}

export default function App() {
  const [question, setQuestion] = useState('')
  const [path, setPath] = useState('')
  const [role, setRole] = useState<Role>('')
  const [samples, setSamples] = useState<DatasetQuestion[]>([])
  const [source, setSource] = useState('cubicasa5k')
  const [selectedDemoId, setSelectedDemoId] = useState('')
  const [selectedSampleIndex, setSelectedSampleIndex] = useState('')
  const [questionFlash, setQuestionFlash] = useState(false)
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const [expected, setExpected] = useState<DatasetQuestion | null>(null)
  const [res, setRes] = useState<AskResponse | null>(null)
  const [answerDocuments, setAnswerDocuments] = useState<ProjectDocument[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null)
  const [inv, setInv] = useState<Evidence | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<'ask' | 'scan' | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedAreaRoom, setSelectedAreaRoom] = useState<string | null>(null)
  const [askPlan, setAskPlan] = useState<PlanRoomsResult | null>(null)
  const [askPlanChecked, setAskPlanChecked] = useState(false)
  const [askRoomId, setAskRoomId] = useState<string | null>(null)
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [collab, setCollab] = useState<CollabState>({ status: {}, messages: [] })
  const [activePage, setActivePage] = useState<'home' | 'ask' | 'community'>('home')
  const [space, setSpace] = useState<{ id: string; name: string } | null>(null)
  const [flashSpace, setFlashSpace] = useState<string | null>(null)
  const [placedProducts, setPlacedProducts] = useState<PlacedProduct[]>([])
  const [renderSource, setRenderSource] = useState('')
  const [renderRoomName, setRenderRoomName] = useState('')
  const [renderNote, setRenderNote] = useState('')
  const [renderStyle, setRenderStyle] = useState('Warm minimal')
  const [renderImageUrl, setRenderImageUrl] = useState('')
  const [renderError, setRenderError] = useState('')
  const [renderBusy, setRenderBusy] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [project, setProject] = useState<CatalogProject | null>(null)
  const [projectPlanPath, setProjectPlanPath] = useState('')

  useEffect(() => {
    setSelectedSampleIndex('')
    sampleQuestions(source || undefined).then(setSamples)
  }, [source])
  useEffect(() => () => { if (renderImageUrl) URL.revokeObjectURL(renderImageUrl) }, [renderImageUrl])
  useEffect(() => {
    getCollab().then(setCollab)
  }, [])
  useEffect(() => {
    if (!flashSpace) return
    const t = setTimeout(() => setFlashSpace(null), 4000)
    return () => clearTimeout(t)
  }, [flashSpace])
  useEffect(() => {
    if (!questionFlash) return
    const timer = window.setTimeout(() => setQuestionFlash(false), 1200)
    return () => window.clearTimeout(timer)
  }, [questionFlash])
  useEffect(() => {
    if (busyAction !== 'ask') { setElapsedSeconds(0); return }
    const started = Date.now()
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - started) / 1000))
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [busyAction])
  useEffect(() => { if (activePage === 'ask') setViewMode('2d') }, [activePage, path])

  const evidence: Evidence[] = useMemo(() => [...(inv ? [inv] : []), ...(res?.evidence ?? [])], [inv, res])
  const visibleSamples = useMemo(() => samples.filter(q => !path || q.path === path), [samples, path])

  // every box on the current drawing, paired with its item when the tool returned them in order
  const { sources, entries } = useMemo(() => {
    const sources: Source[] = []
    const entries: TreeEntry[] = []
    for (const e of evidence) {
      const paired = (e.items?.length ?? 0) === (e.sources?.length ?? 0)
      ;(e.sources ?? []).forEach((s, i) => {
        if (s.file !== path) return
        const it = paired ? e.items[i] : undefined
        entries.push({
          index: sources.length,
          name: s.label ?? it?.name ?? `#${sources.length + 1}`,
          category: it?.category,
          storey: it?.storey,
          space_id: it?.space_id,
          space_name: it?.space_name,
          guid: it?.guid,
        })
        sources.push(s)
      })
      if (!paired) {
        for (const it of e.items ?? []) {
          if (it.space_id && it.name) {
            entries.push({
              index: -1,
              name: it.name,
              category: it.category,
              storey: it.storey,
              space_id: it.space_id,
              space_name: it.space_name,
              guid: it.guid,
            })
          } else if (it.name || it.guid || it.id) {
            entries.push({
              index: -1,
              name: it.name || it.guid || it.id || 'Element',
              category: it.category,
              storey: it.storey,
              space_id: it.space_id,
              space_name: it.space_name,
              guid: it.guid,
            })
          }
        }
      }
    }
    return { sources, entries }
  }, [evidence, path])

  const flash = useMemo(
    () => new Set(entries.filter((e) => flashSpace && e.space_id === flashSpace && e.index >= 0).map((e) => e.index)),
    [entries, flashSpace],
  )
  const page = sources[0]?.page ?? 1
  const mock = evidence.some((e) => (e.warnings ?? []).some((w) => w.includes('MOCK DATA')))
  const isIfc = path.toLowerCase().endsWith('.ifc')
  const modelFile = useMemo(() => {
    for (const e of evidence) {
      if (e.model_file) return e.model_file
    }
    return null
  }, [evidence])
  const activeIfcPath = isIfc ? path : (modelFile ?? '')
  const areaEvidence = res?.evidence.find((item) => item.tool === 'answer_from_engine')?.evidence || null

  async function findDatasetPath(document: ProjectDocument) {
    const categories = ['swiss_dwellings', 'ifc_models', 'cubicasa5k', 'ifc_bench', 'opening_design']
    const source = document.source?.toLowerCase()
    const candidates = [...new Set([...(categories.includes(source || '') ? [source!] : []), ...categories])]
    for (const category of candidates) {
      const candidate = `data/${category}/${document.filename}`
      const controller = new AbortController()
      try {
        const response = await fetch(fileUrl(candidate), { headers: { Range: 'bytes=0-0' }, signal: controller.signal })
        const exists = response.ok
        controller.abort()
        if (exists) return candidate
      } catch { controller.abort() }
    }
    return ''
  }

  async function askAboutDocument(document: ProjectDocument) {
    const datasetPath = await findDatasetPath(document)
    setSelectedDocumentId(document.id)
    setActivePage('ask')
    setPath(datasetPath)
    setQuestion(`About ${document.filename} (project document ID ${document.id}): `)
    setRole('')
    setRes(null); setAnswerDocuments([]); setInv(null); setSelected(null); setSelectedGuid(null); setExpected(null)
    setViewMode(datasetPath.toLowerCase().endsWith('.ifc') ? '3d' : '2d')
  }

  function openAnswerDocument(document: ProjectDocument) {
    setSelectedDocumentId(document.id)
    setActivePage('community')
  }

  useEffect(() => {
    let active = true
    setAskPlan(null); setAskPlanChecked(false); setAskRoomId(null)
    if (!path || path.toLowerCase().endsWith('.ifc')) return () => { active = false }
    const refresh = async () => {
      try {
        const next = await getPlanRooms(path, page)
        if (active) { setAskPlan(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); setAskPlanChecked(true) }
      } catch { if (active) setAskPlanChecked(true) }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [path, page])

  const guids = useMemo(
    () => [...new Set(evidence.flatMap((e) => e.items ?? []).map((i) => i.guid).filter((g): g is string => !!g))],
    [evidence],
  )

  function pick(q: DatasetQuestion) {
    setQuestion(q.question)
    setSelectedDemoId('')
    setQuestionFlash(true)
    setPath(q.path)
    setExpected(q)
    setRes(null)
    setInv(null)
    setSelected(null)
    setSelectedGuid(null)
    setViewMode(q.path.toLowerCase().endsWith('.ifc') ? '3d' : '2d')
  }


  async function renderMood() {
    if (!renderSource) return
    setRenderBusy(true)
    setRenderError('')
    setRenderImageUrl('')
    try {
      const blob = await renderMoodImage({
        image_base64: renderSource,
        room_name: renderRoomName || space?.name || 'Selected room',
        products: placedProducts.map(({ instanceId: _instanceId, ...product }) => product),
        style: renderStyle,
      })
      setRenderImageUrl(URL.createObjectURL(blob))
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error))
    } finally {
      setRenderBusy(false)
    }
  }

  function exportBom() {
    const rows: string[][] = [['Name', 'Quantity', 'Dimensions', 'Unit price (EUR)', 'Subtotal (EUR)']]
    const productGroups = new Map<string, { product: PlacedProduct; quantity: number }>()
    for (const product of placedProducts) {
      const current = productGroups.get(product.catalogId)
      if (current) current.quantity += 1
      else productGroups.set(product.catalogId, { product, quantity: 1 })
    }
    for (const { product, quantity } of productGroups.values()) {
      rows.push([product.name, String(quantity), `${product.width_mm} × ${product.depth_mm} × ${product.height_mm} mm`,
        product.price_eur.toFixed(2), (product.price_eur * quantity).toFixed(2)])
    }

    const answerCounts = new Map<string, number>()
    for (const result of res?.evidence ?? []) {
      if (result.unit !== 'count' || typeof result.value !== 'number') continue
      if (result.by_category && Object.keys(result.by_category).length) {
        for (const [category, count] of Object.entries(result.by_category)) {
          answerCounts.set(category, (answerCounts.get(category) ?? 0) + count)
        }
      } else if (result.items?.length) {
        const perCategory = new Map<string, number>()
        for (const item of result.items) {
          const name = item.category || item.name || result.tool
          perCategory.set(name, (perCategory.get(name) ?? 0) + 1)
        }
        for (const [name, count] of perCategory) answerCounts.set(name, (answerCounts.get(name) ?? 0) + count)
      } else {
        answerCounts.set(result.tool, (answerCounts.get(result.tool) ?? 0) + result.value)
      }
    }
    for (const [name, quantity] of answerCounts) rows.push([`Answer count — ${name}`, String(quantity), '', '', ''])

    const csvCell = (value: string) => {
      const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
      return `"${safe.replaceAll('"', '""')}"`
    }
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'trace-bom.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function applyDemo(item: DemoItem) {
    setSelectedDemoId(item.id)
    setSelectedSampleIndex('')
    setPath(item.path)
    setQuestion(item.question)
    setQuestionFlash(true)
    setRole(item.role ?? '')
    setSpace(item.space ?? null)
    setExpected(null)
    setRes(null)
    setInv(null)
    setSelected(null)
    setSelectedGuid(null)
    setViewMode(item.path.toLowerCase().endsWith('.ifc') ? '3d' : '2d')
  }

  async function run<T>(f: () => Promise<T>, set: (v: T) => void, action: 'ask' | 'scan' = 'ask') {
    setBusy(true)
    setBusyAction(action)
    setErr('')
    setSelected(null)
    try {
      set(await f())
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  const submit = () => {
    if (!question.trim()) return
    const q = space ? `In room ${space.name} (space_id ${space.id}): ${question}` : question
    setRes(null)
    setAnswerDocuments([])
    setSelectedGuid(null)
    setSelectedAreaRoom(null)
    run(async () => {
      const answer = await ask(q, path, role)
      if (/\b[\w.-]+\.(?:pdf|dwg|dxf|ifc|png|jpe?g|docx|xlsx)\b/i.test(answer.answer_text)) {
        void listProjectDocs(answer.answer_text).then(matches => setAnswerDocuments(matches.filter(doc => answer.answer_text.toLowerCase().includes((doc.title || doc.filename).toLowerCase()) || answer.answer_text.toLowerCase().includes(doc.filename.toLowerCase())))).catch(() => setAnswerDocuments([]))
      }
      return answer
    }, setRes, 'ask')
  }
  const scan = () => path && run(() => inventory(path, page), setInv, 'scan')

  function showHowItWorks() {
    setActivePage('home')
    window.setTimeout(() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }), 0)
  }

  return (
    <div className="app-shell">
      <nav className="top-nav" aria-label="Main navigation">
        <button className="nav-brand" onClick={() => setActivePage('home')}>{activePage === 'ask' ? 'TRACE DESKTOP APP' : '[ ] TRACE.'}</button>
        <div className="nav-links">
          <button className={activePage === 'home' ? 'active' : ''} onClick={() => setActivePage('home')}>Home</button>
        <button className={activePage === 'ask' ? 'active' : ''} onClick={() => setActivePage('ask')}>Ask</button>
        <button className={activePage === 'community' ? 'active' : ''} onClick={() => setActivePage('community')}>Project</button>
        </div>
        <div className="nav-actions">{activePage === 'ask' && <><span className="desktop-project">PROJECT 01</span><button className="desktop-level" onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}>LEVEL 02 ▾</button></>}<button className="nav-how" onClick={showHowItWorks}>How it works</button><button className="nav-launch" onClick={() => setActivePage('ask')}>Launch Demo</button></div>
      </nav>
      {activePage === 'home' ? <LandingPage onLaunch={() => setActivePage('ask')} onHowItWorks={showHowItWorks} /> : activePage === 'community' && !project ? <><CatalogProjects onBrowse={() => setBrowserOpen(true)} onOpen={(next) => { setProject(next); setPath(next.model || next.plan || ''); setProjectPlanPath(next.plan || '') }} /><DatasetBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} onSelect={(item: CatalogItem) => { setPath(item.path); setProjectPlanPath(item.kind === 'plan' ? item.path : ''); setProject({ id: 'browse', title: item.label, subtitle: item.kind === '3d' ? 'Selected IFC model' : 'Selected drawing', description: '', model: item.kind === '3d' ? item.path : null, plan: item.kind === 'plan' ? item.path : null, demo_data: false }); setBrowserOpen(false) }} /></> : activePage === 'community' ? <CommunityPage
        collab={collab} onChange={setCollab}
        screenshot={renderSource ? { dataUrl: renderSource, roomName: renderRoomName, note: renderNote } : null}
        onScreenshot={(dataUrl, roomName, note) => { setRenderSource(dataUrl); setRenderRoomName(roomName); setRenderNote(note) }}
        selectedDocumentId={selectedDocumentId} onAskDocument={askAboutDocument} modelPath={path}
        drawingPath={path.toLowerCase().endsWith('.ifc') ? projectPlanPath : path}
        onModelPathChange={(nextPath) => { setPath(nextPath); setViewMode('3d') }}
        projectName={project?.title || 'Demo project'} onSwitchProject={() => { setProject(null); setProjectPlanPath('') }}
      /> : <div className="app gigi-workspace">
      <aside className="panel">
        <header className="header">
          <div className="title-row">
            <h1>Trace</h1>
          </div>
          <p className="sub">Ask a drawing anything. Every answer shows where it came from.</p>
        </header>
        <section className="workspace-left-guide"><div className="workspace-left-title"><b>HISTORY</b><button onClick={() => { setQuestion(''); setRes(null); setInv(null) }}>＋</button></div><button className="history-item" onClick={() => questionRef.current?.focus()}>{question || 'New evidence conversation'}<small>{res ? '1 answer' : 'No answers yet'}</small></button><b>SCALE <small>zoom level</small></b><div className="scale-options">{['1:200','1:100','1:50','1:20'].map(scale => <button key={scale}>{scale}</button>)}</div><b>LAYER GUIDE</b><div className="layer-guide">{['Architecture & Walls','Sanitary & Plumbing','Ventilation','Electrical & Lighting','Dimension Chains'].map(layer => <label key={layer}><input type="checkbox" defaultChecked />{layer}</label>)}</div></section>

        <details className="examples-panel">
          <summary>Examples</summary>
          <label>
            Demo scenarios
            <select className="demo-select" value={selectedDemoId} onChange={(e) => {
              const item = DEMO_ITEMS.find((d) => d.id === e.target.value)
              if (item) applyDemo(item)
            }}>
              <option value="">Choose a demo scenario…</option>
              {DEMO_ITEMS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label>
            Dataset samples
            <div className="row">
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => <option key={s} value={s}>{s || 'All sources'}</option>)}
              </select>
              <select value={selectedSampleIndex} onChange={(e) => {
                const index = e.target.value
                setSelectedSampleIndex(index)
                if (index !== '' && visibleSamples[Number(index)]) pick(visibleSamples[Number(index)])
              }}>
                <option value="">Select a question…</option>
                {visibleSamples.map((q, i) => <option key={i} value={i}>{q.question.slice(0, 70)}</option>)}
              </select>
            </div>
          </label>
        </details>

        <label className="question-primary">
          Question{space && <span className="scope"> · Room scope: {space.name} <a onClick={() => setSpace(null)}>×</a></span>}
          <textarea ref={questionRef} className={questionFlash ? 'question-flash' : ''} value={question} onChange={(e) => setQuestion(e.target.value)} rows={4}
            placeholder="Ask a question about your drawing or model…"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
          <small className="control-help">Ask in any language, e.g. "How many toilets?" or "一共有几扇门"</small>
        </label>

        <label>
          Drawing / model path
          <button type="button" className="dataset-picker-button" onClick={() => setBrowserOpen(true)}>{path ? `▧ ${path.split('/').pop()}` : 'Browse drawings and models…'}</button>
          <small className="control-help">Choose a file to preview it immediately.</small>
        </label>
        <UploadButton onUploaded={(u) => {
          setPath(u.path)
          setInv(null)
          setSelectedGuid(null)
          setViewMode(u.kind === 'ifc' ? '3d' : '2d')
        }} />

        <div className="row">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
          <small className="control-help role-help">Changes how the answer is explained, not the numbers.</small>
          <button className="primary" onClick={submit} disabled={busy}>{busyAction === 'ask' ? `Answering… ${elapsedSeconds}s` : busyAction === 'scan' ? 'Scanning…' : 'Ask'}</button>
        </div>

        {!isIfc && path && <div className="control-with-help"><button onClick={scan} disabled={busy}>Scan &amp; number all elements</button><small className="control-help">Find and number everything on the drawing.</small></div>}

        {err && <div className="error" title={err}><strong>Error:</strong> {err.length > 200 ? err.slice(0, 200) + '…' : err}</div>}
        {mock && <div className="mock">MOCK DATA — engine not connected, numbers are placeholders</div>}

        {busy && (
          <div className="loading">
            <div className="spinner" />
            <span>{busyAction === 'ask' ? `Answering… ${elapsedSeconds}s` : 'Scanning the drawing…'}</span>
          </div>
        )}

        {res && (
          <section className="answer">
            <p className="answer-text">{renderAnswerWithDocuments(res.answer_text, answerDocuments, openAnswerDocument)}</p>
            {res.evidence.map((e, i) => (
              <div key={i}>
                <VerifyBadge ev={e} />
              </div>
            ))}
            {expected && (
              <p className="expected">Ground truth answer: {String(expected.answer)} {expected.unit ?? ''}</p>
            )}
            {modelFile && !isIfc && (
              <div>
                <button className="open-3d-btn" onClick={() => setViewMode('3d')}>
                  <span>⬡</span> Open in 3D ({modelFile.split('/').pop()})
                </button>
              </div>
            )}
            {res.evidence.some((e) => (e.items?.length ?? 0) > 0) && (
              <div>
                <h3>Evidence elements ({res.evidence.reduce((sum, e) => sum + (e.items?.length ?? 0), 0)}):</h3>
                <ul className="evidence">
                  {res.evidence.flatMap((e) => e.items ?? []).map((it, idx) => {
                    const isSel = !!it.guid && it.guid === selectedGuid
                    return (
                      <li
                        key={idx}
                        className={isSel ? 'on' : ''}
                        onClick={() => {
                          if (it.guid) {
                            setSelectedGuid(it.guid)
                            if (activeIfcPath) setViewMode('3d')
                          }
                          const srcIdx = sources.findIndex((s) => s.label === it.name || s.label === it.id)
                          if (srcIdx >= 0) setSelected(srcIdx)
                        }}
                      >
                        <strong>{it.name || it.category || `Element ${idx + 1}`}</strong>
                        {it.storey && <span className="dim"> · {it.storey}</span>}
                        {it.space_name && <span className="dim"> · {it.space_name}</span>}
                        {it.guid && <span className="dim"> · GUID: {it.guid}</span>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {res.tool_calls.length > 0 && <div className="tool-chain">
                <span className="tool-chain-label">Gemini</span>
                {res.tool_calls.map((t, i) => (
                  <span key={i}>
                    <span className="tool-arrow"> → </span>
                    <span className="tool-name">{t.name}</span>
                  </span>
                ))}
                <span className="dim"> ({res.tool_calls.length} call{res.tool_calls.length === 1 ? '' : 's'})</span>
            </div>}
            <HowIGotThis response={res} areaEvidence={areaEvidence} selectedAreaRoom={selectedAreaRoom} onSelectAreaRoom={setSelectedAreaRoom} />
          </section>
        )}

        {(entries.length > 0 || inv) && (
          <section>
            <h3>Building hierarchy (click to locate / scope question to room)</h3>
            {inv?.by_category && (
              <p className="dim small">{Object.entries(inv.by_category).map(([c, n]) => `${n} ${c}`).join(' · ')}</p>
            )}
            <SpaceTree
              entries={entries}
              collab={collab}
              selected={selected}
              selectedGuid={selectedGuid}
              activeSpace={space?.id ?? null}
              onSelectElement={(i, entry) => {
                if (i >= 0) setSelected(i)
                if (entry?.guid) {
                  setSelectedGuid(entry.guid)
                  if (activeIfcPath) setViewMode('3d')
                }
              }}
              onSelectSpace={(id, name) => setSpace({ id, name })}
            />
          </section>
        )}

      </aside>

      <main className="stage" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="workspace-heading"><div><span>Floor plan</span><small> · Demo workspace</small></div><div className="workspace-mode"><button className={viewMode === '2d' ? 'on' : ''} onClick={() => setViewMode('2d')}>2D</button><button className={viewMode === '3d' ? 'on' : ''} onClick={() => setViewMode('3d')}>3D</button></div></div>
        <section className="keynote-cards" aria-label="Room summary">
          <article><span>ROOM</span><strong>{space?.name || 'LEVEL 02'}</strong><b>{selectedAreaRoom ? 'Selected area' : '— m²'}</b><small>L × B × H · available with room evidence</small></article>
          <article><span>OBJECTS FOUND</span><strong>{res?.summary?.evidence_count ?? evidence.reduce((n, item) => n + (item.items?.length ?? 0), 0)}</strong><small>Evidence in current answer</small></article>
          <article><span>STATUS</span><strong className="status-progress">In progress</strong><small>2/3 verified · Demo</small></article>
        </section>
        {modelFile && !isIfc && (
          <div className="viewer-tabs">
            <button className={viewMode === '2d' ? 'on' : ''} onClick={() => setViewMode('2d')}>2D Drawing</button>
            <button className={viewMode === '3d' ? 'on' : ''} onClick={() => setViewMode('3d')}>3D Model ({modelFile.split('/').pop()}){placedProducts.length ? ` · ${placedProducts.length} placed` : ''}</button>
          </div>
        )}
        {(isIfc || viewMode === '3d') && activeIfcPath ? (
          <IfcViewer
            path={activeIfcPath}
            guids={guids}
            selectedGuid={selectedGuid}
            onSelectGuid={setSelectedGuid}
            onPlacementsChange={setPlacedProducts}
            collab={collab}
            onCollabChange={setCollab}
            onScreenshot={(dataUrl, roomName, note) => {
              setRenderSource(dataUrl)
              setRenderRoomName(roomName)
              setRenderNote(note)
              setRenderError('')
            }}
          />
        ) : viewMode === '3d' ? <PlanRooms3D path={path} /> : (
          <DrawingViewer
            path={path}
            page={page}
            sources={sources}
            selected={selected}
            areaEvidence={areaEvidence}
            selectedAreaRoom={selectedAreaRoom}
            onSelectAreaRoom={setSelectedAreaRoom}
            planRooms={askPlan?.rooms}
            roomOutlineUnavailable={askPlanChecked && !(askPlan?.rooms.some(room => (room.polygon_px?.length || 0) >= 3))}
            onSelectPlanRoom={(room: PlanRoom) => setAskRoomId(room.space_id)}
            onSelect={(i) => {
              setSelected(i)
              const entry = entries.find((e) => e.index === i)
              if (entry?.guid) setSelectedGuid(entry.guid)
            }}
            flash={flash}
          />
        )}
        {askRoomId && <SharedPlanPanel compact drawingPath={path} modelPath={activeIfcPath} selectedRoomId={askRoomId} onCloseRoom={() => setAskRoomId(null)} collab={collab} onChange={setCollab} onScreenshot={(dataUrl, roomName, note) => { setRenderSource(dataUrl); setRenderRoomName(roomName); setRenderNote(note) }} />}
        {(isIfc || viewMode === '3d') && activeIfcPath && (
          <section className="render-panel">
            <div className="render-actions">
              <label>Render style<input value={renderStyle} onChange={(event) => setRenderStyle(event.target.value)} /><small className="control-help">Generates an illustrative image of the selected room in this style (AI image, not to scale).</small></label>
              <button disabled={!renderSource || renderBusy} onClick={renderMood}>
                {renderBusy ? 'Rendering…' : 'Render mood image'}
              </button>
              <small className="control-help">Generates an illustrative image of the selected room in this style (AI image, not to scale).</small>
              <button onClick={exportBom} disabled={!placedProducts.length && !(res?.evidence ?? []).some((item) => item.unit === 'count')}>
                Export BOM (CSV)
              </button>
              <small className="control-help">Download a list of the placed furniture with prices.</small>
              {renderSource && <span className="dim small">Screenshot ready · {renderRoomName}</span>}
            </div>
            {renderError && <p className="error">{renderError}</p>}
            {renderImageUrl && <div className="mood-result">
              <img src={renderImageUrl} alt={`Mood render for ${renderRoomName || 'selected room'}`} />
              <a href={renderImageUrl} download="trace-mood-render.png">Download PNG</a>
            </div>}
      <DatasetBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} onSelect={(item: CatalogItem) => { setPath(item.path); setInv(null); setSelectedGuid(null); setRes(null); setViewMode(item.kind === '3d' ? '3d' : '2d'); setBrowserOpen(false) }} />
          </section>
        )}
      </main>
      <aside className="workspace-chat" aria-label="Assistant chat">
        <header><span>ASSISTANT</span><small>Evidence-first chat</small></header>
        {question && <div className="chat-question">{question}</div>}
        {res ? <article className="chat-answer"><strong>{String(res.answer_text.match(/\d+(?:[.,]\d+)?/)?.[0] ?? 'Answer')}</strong><p>{renderAnswerWithDocuments(res.answer_text, answerDocuments, openAnswerDocument)}</p><button onClick={() => activeIfcPath && setViewMode('3d')}>View evidence in 3D →</button>{(res as AskResponse & { follow_ups?: string[] }).follow_ups?.length ? <div className="follow-ups"><b>Follow-up:</b>{(res as AskResponse & { follow_ups?: string[] }).follow_ups?.map((item: string, index: number) => <button key={index} onClick={() => { setQuestion(item); questionRef.current?.focus() }}>{item}</button>)}</div> : null}</article> : <article className="chat-answer empty"><strong>Ask a question</strong><p>Your evidence-backed answer will appear here.</p></article>}
        <div className="chat-compose"><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about this level…" rows={3} /><button className="primary" onClick={submit} disabled={busy}>Send</button></div>
      </aside>
    </div>}
    </div>
  )
}
