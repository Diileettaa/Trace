import { useEffect, useMemo, useState } from 'react'
import { ask, getCollab, inventory, renderMoodImage, sampleQuestions } from './api'
import { DEMO_ITEMS, type DemoItem } from './demo'
import DrawingViewer from './DrawingViewer'
import IfcViewer, { type PlacedProduct } from './IfcViewer'
import RoomCollabPanel from './components/RoomCollabPanel'
import ContactRegistration from './components/ContactRegistration'
import SpaceTree, { type TreeEntry } from './components/SpaceTree'
import VerifyBadge from './components/VerifyBadge'
import type { AskResponse, CollabState, DatasetQuestion, Evidence, Role, Source } from './types'

const SOURCES = ['', 'cubicasa5k', 'swiss_dwellings', 'ifc_models', 'ifc_bench', 'opening_design']
const ROLES: { v: Role; label: string }[] = [
  { v: '', label: 'Any role' },
  { v: 'architect', label: 'Architect' },
  { v: 'electrician', label: 'Electrician' },
  { v: 'plumber', label: 'Plumber' },
  { v: 'owner', label: 'Owner' },
]

export default function App() {
  const [question, setQuestion] = useState('')
  const [path, setPath] = useState('')
  const [role, setRole] = useState<Role>('')
  const [samples, setSamples] = useState<DatasetQuestion[]>([])
  const [source, setSource] = useState('cubicasa5k')
  const [expected, setExpected] = useState<DatasetQuestion | null>(null)
  const [res, setRes] = useState<AskResponse | null>(null)
  const [inv, setInv] = useState<Evidence | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [collab, setCollab] = useState<CollabState>({ status: {}, messages: [] })
  const [space, setSpace] = useState<{ id: string; name: string } | null>(null)
  const [flashSpace, setFlashSpace] = useState<string | null>(null)
  const [placedProducts, setPlacedProducts] = useState<PlacedProduct[]>([])
  const [renderSource, setRenderSource] = useState('')
  const [renderRoomName, setRenderRoomName] = useState('')
  const [renderStyle, setRenderStyle] = useState('Warm minimal')
  const [renderImageUrl, setRenderImageUrl] = useState('')
  const [renderError, setRenderError] = useState('')
  const [renderBusy, setRenderBusy] = useState(false)

  useEffect(() => {
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

  const evidence: Evidence[] = useMemo(() => [...(inv ? [inv] : []), ...(res?.evidence ?? [])], [inv, res])

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
  const warnings = (res?.evidence ?? []).flatMap((e) => e.warnings ?? [])
  const mock = evidence.some((e) => (e.warnings ?? []).some((w) => w.includes('MOCK DATA')))
  const isIfc = path.toLowerCase().endsWith('.ifc')
  const modelFile = useMemo(() => {
    for (const e of evidence) {
      if (e.model_file) return e.model_file
    }
    return null
  }, [evidence])
  const activeIfcPath = isIfc ? path : (modelFile ?? '')

  const guids = useMemo(
    () => [...new Set(evidence.flatMap((e) => e.items ?? []).map((i) => i.guid).filter((g): g is string => !!g))],
    [evidence],
  )

  function pick(q: DatasetQuestion) {
    setQuestion(q.question)
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
    setPath(item.path)
    setQuestion(item.question)
    setRole(item.role ?? '')
    setSpace(item.space ?? null)
    setExpected(null)
    setRes(null)
    setInv(null)
    setSelected(null)
    setSelectedGuid(null)
    setViewMode(item.path.toLowerCase().endsWith('.ifc') ? '3d' : '2d')
  }

  async function run<T>(f: () => Promise<T>, set: (v: T) => void) {
    setBusy(true)
    setErr('')
    setSelected(null)
    try {
      set(await f())
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    if (!question.trim()) return
    const q = space ? `In room ${space.name} (space_id ${space.id}): ${question}` : question
    setRes(null)
    setSelectedGuid(null)
    run(() => ask(q, path, role), setRes)
  }
  const scan = () => path && run(() => inventory(path, page), setInv)

  return (
    <div className="app">
      <aside className="panel">
        <ContactRegistration />
        <header className="header">
          <div className="title-row">
            <h1>Trace</h1>
            <select
              className="demo-select"
              value=""
              onChange={(e) => {
                const item = DEMO_ITEMS.find((d) => d.id === e.target.value)
                if (item) applyDemo(item)
              }}
            >
              <option value="">Demo Scenarios…</option>
              {DEMO_ITEMS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <p className="sub">Ask a drawing anything. Every answer shows where it came from.</p>
        </header>

        <label>
          Dataset samples
          <div className="row">
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s || 'All sources'}</option>
              ))}
            </select>
            <select value="" onChange={(e) => pick(samples[Number(e.target.value)])}>
              <option value="">Select a question…</option>
              {samples.map((q, i) => (
                <option key={i} value={i}>{q.question.slice(0, 70)}</option>
              ))}
            </select>
          </div>
        </label>

        <label>
          Drawing / model path
          <input value={path} onChange={(e) => {
            const p = e.target.value
            setPath(p)
            setInv(null)
            setSelectedGuid(null)
            if (p.toLowerCase().endsWith('.ifc')) setViewMode('3d')
            else setViewMode('2d')
          }}
            placeholder="data/cubicasa5k/high_quality-108.png" />
        </label>

        <label>
          Question{space && <span className="scope"> · Room scope: {space.name} <a onClick={() => setSpace(null)}>×</a></span>}
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
        </label>

        <div className="row">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
        </div>
        {!isIfc && path && <button onClick={scan} disabled={busy}>Scan &amp; number all elements</button>}

        {err && <div className="error" title={err}><strong>Error:</strong> {err.length > 200 ? err.slice(0, 200) + '…' : err}</div>}
        {mock && <div className="mock">MOCK DATA — engine not connected, numbers are placeholders</div>}

        {busy && (
          <div className="loading">
            <div className="spinner" />
            <span>Gemini is analyzing the drawing…</span>
          </div>
        )}

        {res && (
          <section className="answer">
            <p className="answer-text">{res.answer_text}</p>
            {res.evidence.map((e, i) => (
              <div key={i}>
                <VerifyBadge ev={e} />
                {e.cached && <span className="badge grey">⚡ Cached result</span>}
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
            {warnings.length > 0 && (
              <ul className="warnings">{warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
            )}
            <details className="tool-chain">
              <summary>
                <span className="tool-chain-label">Gemini</span>
                {res.tool_calls.map((t, i) => (
                  <span key={i}>
                    <span className="tool-arrow"> → </span>
                    <span className="tool-name">{t.name}</span>
                  </span>
                ))}
                <span className="dim"> ({res.tool_calls.length} call{res.tool_calls.length === 1 ? '' : 's'})</span>
              </summary>
              <pre>{JSON.stringify(res.tool_calls, null, 2)}</pre>
            </details>
            {res.from_cache ? (
              <p className="dim small">Answered from cache (asked before)</p>
            ) : res.timing ? (
              <p className="dim small">
                Answered in {res.timing.total_s.toFixed(1)} s · Gemini {res.timing.gemini_calls_s.map((t) => t.toFixed(1)).join(' + ')} s
                · tools {res.timing.tools_s.map((t) => t.toFixed(1)).join(' + ')} s
              </p>
            ) : null}
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

        {space && (
          <RoomCollabPanel spaceId={space.id} spaceName={space.name} role={role} collab={collab}
            onChange={setCollab} onHighlightSpace={setFlashSpace} />
        )}
      </aside>

      <main className="stage" style={{ display: 'flex', flexDirection: 'column' }}>
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
            onScreenshot={(dataUrl, roomName) => {
              setRenderSource(dataUrl)
              setRenderRoomName(roomName)
              setRenderError('')
            }}
          />
        ) : (
          <DrawingViewer
            path={path}
            page={page}
            sources={sources}
            selected={selected}
            onSelect={(i) => {
              setSelected(i)
              const entry = entries.find((e) => e.index === i)
              if (entry?.guid) setSelectedGuid(entry.guid)
            }}
            flash={flash}
          />
        )}
        {(isIfc || viewMode === '3d') && activeIfcPath && (
          <section className="render-panel">
            <div className="render-actions">
              <label>Render style<input value={renderStyle} onChange={(event) => setRenderStyle(event.target.value)} /></label>
              <button disabled={!renderSource || renderBusy} onClick={renderMood}>
                {renderBusy ? 'Rendering…' : 'Render mood image'}
              </button>
              <button onClick={exportBom} disabled={!placedProducts.length && !(res?.evidence ?? []).some((item) => item.unit === 'count')}>
                Export BOM (CSV)
              </button>
              {renderSource && <span className="dim small">Screenshot ready · {renderRoomName}</span>}
            </div>
            {renderError && <p className="error">{renderError}</p>}
            {renderImageUrl && <div className="mood-result">
              <img src={renderImageUrl} alt={`Mood render for ${renderRoomName || 'selected room'}`} />
              <a href={renderImageUrl} download="trace-mood-render.png">Download PNG</a>
            </div>}
          </section>
        )}
      </main>
    </div>
  )
}
