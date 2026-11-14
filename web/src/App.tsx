import { useEffect, useMemo, useState } from 'react'
import { ask, getCollab, inventory, sampleQuestions } from './api'
import DrawingViewer from './DrawingViewer'
import IfcViewer from './IfcViewer'
import RoomCollabPanel from './components/RoomCollabPanel'
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
  const [collab, setCollab] = useState<CollabState>({ status: {}, messages: [] })
  const [space, setSpace] = useState<{ id: string; name: string } | null>(null)
  const [flashSpace, setFlashSpace] = useState<string | null>(null)

  useEffect(() => {
    sampleQuestions(source || undefined).then(setSamples)
  }, [source])
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
        entries.push({ index: sources.length, name: s.label ?? it?.name ?? `#${sources.length + 1}`,
          category: it?.category, storey: it?.storey, space_id: it?.space_id, space_name: it?.space_name })
        sources.push(s)
      })
      if (!paired) {
        for (const it of e.items ?? []) if (it.space_id && it.name) {
          entries.push({ index: -1, name: it.name, category: it.category, storey: it.storey,
            space_id: it.space_id, space_name: it.space_name })
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
    run(() => ask(q, path, role), setRes)
  }
  const scan = () => path && run(() => inventory(path, page), setInv)

  return (
    <div className="app">
      <aside className="panel">
        <h1>Trace</h1>
        <p className="sub">Ask a drawing anything. Every answer shows where it came from.</p>

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
          <input value={path} onChange={(e) => { setPath(e.target.value); setInv(null) }}
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

        {err && <div className="error">{err}</div>}
        {mock && <div className="mock">MOCK DATA — engine not connected, numbers are placeholders</div>}

        {res && (
          <section className="answer">
            <p className="answer-text">{res.answer_text}</p>
            {res.evidence.map((e, i) => <VerifyBadge key={i} ev={e} />)}
            {expected && (
              <p className="expected">Ground truth answer: {String(expected.answer)} {expected.unit ?? ''}</p>
            )}
            {warnings.length > 0 && (
              <ul className="warnings">{warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
            )}
            <details>
              <summary>Tool calls ({res.tool_calls.length}): {res.tool_calls.map((t) => t.name).join(' → ')}</summary>
              <pre>{JSON.stringify(res.tool_calls, null, 2)}</pre>
            </details>
          </section>
        )}

        {(entries.length > 0 || inv) && (
          <section>
            <h3>Building hierarchy (click to locate / scope question to room)</h3>
            {inv?.by_category && (
              <p className="dim small">{Object.entries(inv.by_category).map(([c, n]) => `${n} ${c}`).join(' · ')}</p>
            )}
            <SpaceTree entries={entries} collab={collab} selected={selected} activeSpace={space?.id ?? null}
              onSelectElement={(i) => i >= 0 && setSelected(i)}
              onSelectSpace={(id, name) => setSpace({ id, name })} />
          </section>
        )}

        {space && (
          <RoomCollabPanel spaceId={space.id} spaceName={space.name} role={role} collab={collab}
            onChange={setCollab} onHighlightSpace={setFlashSpace} />
        )}
      </aside>

      <main className="stage">
        {isIfc ? (
          <IfcViewer path={path} guids={guids} />
        ) : (
          <DrawingViewer path={path} page={page} sources={sources} selected={selected} onSelect={setSelected}
            flash={flash} />
        )}
      </main>
    </div>
  )
}
