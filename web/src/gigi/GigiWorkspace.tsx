import { useState, type CSSProperties } from 'react'
import { api, layerOf, toScenario, type FixtureVerification, type LayerId, type QueryScenario } from './adapters'

const TALLINN_PLAN = 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf'

function AnswerCard({ scenario }: { scenario: QueryScenario }) {
  return <article className="gigi-answer-card">
    <span className="gigi-answer-kicker">ANSWER · {scenario.responseTime}</span>
    <strong className="gigi-answer-metric">{scenario.bigMetric}</strong>
    <p>{scenario.aiSummary || 'No answer text was returned.'}</p>
    <small>{scenario.roomName}{scenario.roomArea !== '—' ? ` · ${scenario.roomArea}` : ''}</small>
  </article>
}

const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'architecture', label: 'Architecture & Walls' },
  { id: 'sanitary', label: 'Sanitary & Plumbing' },
  { id: 'hvac', label: 'Ventilation' },
  { id: 'electrical', label: 'Electrical & Lighting' },
  { id: 'dimensions', label: 'Dimension Chains' },
]
const ZOOM: Record<string, number> = { '1:200': 1, '1:100': 2, '1:50': 4, '1:20': 8 }

function PlanEvidence({ path, scenario, fixtures, scale, layers, onVerify }: { path: string; scenario: QueryScenario | null; fixtures: Record<string, FixtureVerification>; scale: string; layers: Record<LayerId, boolean>; onVerify: (fixture: FixtureVerification) => void }) {
  const [imageSize, setImageSize] = useState<[number, number] | null>(null)
  const [hovered, setHovered] = useState<FixtureVerification | null>(null)
  const visibleFixtures = Object.values(fixtures).filter(fixture => layers[layerOf(fixture.category)] && fixture.position)
  const polygon = scenario?.roomPolygon
  const first = visibleFixtures[0]
  return <div className="gigi-plan-scroll">
    <div className="gigi-plan-canvas" style={{ '--gigi-plan-zoom': ZOOM[scale] } as CSSProperties}>
      <img src={api.drawingUrl(path)} alt="Tallinn floor plan" onLoad={event => setImageSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} />
      {imageSize && <svg className="gigi-plan-overlay" viewBox={`0 0 ${imageSize[0]} ${imageSize[1]}`} preserveAspectRatio="none" aria-label="Evidence highlights">
        {polygon && <polygon className="gigi-room-highlight" points={polygon.map(([x, y]) => `${x},${y}`).join(' ')} />}
        {visibleFixtures.map((fixture, index) => {
          const box = fixture.position!
          const isIssue = fixture.status === 'Issue Reported'
          return <g key={fixture.id} className={`gigi-evidence-box ${isIssue ? 'issue' : ''}`} onMouseEnter={() => setHovered(fixture)} onMouseLeave={() => setHovered(null)} onClick={() => onVerify(fixture)}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} />
            <text x={box.x} y={Math.max(18, box.y - 6)}>{String(index + 1).padStart(2, '0')}</text>
          </g>
        })}
        {first?.position && <g className="gigi-evidence-lead"><line x1={first.position.x + first.position.w} y1={first.position.y} x2="920" y2="82" /><text x="750" y="68">EVIDENCE 01</text></g>}
      </svg>}
    </div>
    <small className="gigi-plan-caption">{visibleFixtures.length ? `${visibleFixtures.length} evidence boxes shown` : 'Ask a question to show drawing evidence'}</small>
    {hovered && <button className="gigi-fixture-hover" onClick={() => onVerify(hovered)}>{hovered.photoDataUrl ? <img src={hovered.photoDataUrl} alt="Latest site evidence" /> : null}<b>{hovered.label}</b><span>{hovered.verified ? `${hovered.status} · ${hovered.author || 'site team'}` : 'Unverified · no site photo yet'}</span><small>Verify on Site →</small></button>}
  </div>
}

export default function GigiWorkspace() {
  const [view, setView] = useState<'2D' | '3D'>('2D')
  const [question, setQuestion] = useState('')
  const [scenario, setScenario] = useState<QueryScenario | null>(null)
  const [fixtures, setFixtures] = useState<Record<string, FixtureVerification>>({})
  const [scale, setScale] = useState('1:200')
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ architecture: true, sanitary: true, hvac: true, electrical: true, dimensions: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verifyFixture, setVerifyFixture] = useState<FixtureVerification | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'Installed' | 'In Progress' | 'Issue Reported'>('Installed')
  const [verifyNote, setVerifyNote] = useState('')
  const [verifyFile, setVerifyFile] = useState<File | null>(null)
  const [savingVerification, setSavingVerification] = useState(false)

  const submit = async (nextQuestion = question) => {
    const prompt = nextQuestion.trim()
    if (!prompt || busy) return
    setBusy(true)
    setError('')
    try {
      const [answer, plan] = await Promise.all([
        api.ask(TALLINN_PLAN, prompt),
        api.planRooms(TALLINN_PLAN).catch(() => null),
      ])
      const ids = (answer.evidence?.[0]?.items || []).map((item: { id?: string }) => item.id).filter(Boolean)
      const verification = ids.length ? await api.verifyStatus(TALLINN_PLAN, ids).catch(() => null) : null
      const next = toScenario(answer, prompt, TALLINN_PLAN, plan, verification, plan?.image_size)
      setScenario(next.scenario)
      setFixtures(next.fixtures)
      setScale(next.scenario.recommendedScale)
      setLayers(current => ({ ...current, ...Object.fromEntries(next.scenario.requiredLayers.map(layer => [layer, true])) }))
      setQuestion('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not get an answer.')
    } finally {
      setBusy(false)
    }
  }

  const openVerification = (fixture: FixtureVerification) => {
    setVerifyFixture(fixture); setVerifyStatus(fixture.status); setVerifyNote(fixture.note === 'Unverified: no site photo yet.' ? '' : fixture.note); setVerifyFile(null)
  }
  const saveVerification = async () => {
    if (!verifyFixture || savingVerification) return
    setSavingVerification(true); setError('')
    try {
      if (verifyFile) await api.uploadPhoto({ path: TALLINN_PLAN, item_id: verifyFixture.id, space_id: verifyFixture.roomCode, author: 'Demo inspector', note: verifyNote, status: verifyStatus }, verifyFile)
      else await api.setStatus({ path: TALLINN_PLAN, item_id: verifyFixture.id, space_id: verifyFixture.roomCode, status: verifyStatus, note: verifyNote, author: 'Demo inspector' })
      const ids = Object.keys(fixtures)
      const verification = await api.verifyStatus(TALLINN_PLAN, ids)
      setFixtures(current => Object.fromEntries(Object.entries(current).map(([id, fixture]) => {
        const next = verification[id]
        return [id, next ? { ...fixture, status: next.status || (next.verified ? 'Installed' : 'In Progress'), verified: next.verified, note: next.note || '', author: next.author, capturedAt: next.ts, photoDataUrl: next.latest?.url ? `/api${next.latest.url.startsWith('/') ? '' : '/'}${next.latest.url}` : fixture.photoDataUrl } : fixture]
      })))
      setVerifyFixture(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save verification.') } finally { setSavingVerification(false) }
  }

  return <main className="gigi-shell">
    <header className="gigi-topbar"><b>TRACE DESKTOP APP</b><span>· TALLINN · LEVEL 02 ▾</span><nav><button>Desktop</button><button>Tablet</button><button>Mobile</button></nav></header>
    <div className="gigi-columns">
      <aside><b>HISTORY</b><button>＋ New inspection chat</button><b>SCALE (AI LoD)</b><div>{Object.keys(ZOOM).map(option => <button key={option} className={scale === option ? 'active' : ''} onClick={() => setScale(option)}>{option}</button>)}</div><b>LAYER GUIDE</b>{LAYERS.map(layer => <label key={layer.id}><input type="checkbox" checked={layers[layer.id]} onChange={event => setLayers(current => ({ ...current, [layer.id]: event.target.checked }))} />{layer.label}</label>)}</aside>
      <section><header>Floor plan <span><button onClick={() => setView('2D')}>2D</button><button onClick={() => setView('3D')}>3D</button></span></header><div className="gigi-keynotes"><article>ROOM<strong>{scenario?.roomCode || 'LEVEL 02'}</strong><b>{scenario?.roomArea || '— m²'}</b></article><article>OBJECTS FOUND<strong>{scenario?.foundCount ?? '—'}</strong></article><article>STATUS<strong>{scenario?.overallStatus || 'In Progress'}</strong><small>{scenario ? `${scenario.targetIds.length} targets` : '0/0 verified'}</small></article></div>{view === '2D' ? <PlanEvidence path={TALLINN_PLAN} scenario={scenario} fixtures={fixtures} scale={scale} layers={layers} onVerify={openVerification} /> : <div className="gigi-empty">Schematic · select a room to open 3D.</div>}</section>
      <aside><b>ASSISTANT</b>{scenario ? <AnswerCard scenario={scenario} /> : <article><strong>Ask a question</strong><p>Your evidence-backed answer will appear here.</p></article>}{scenario?.followUpQuestions.length ? <div className="gigi-follow-ups"><b>FOLLOW UP</b>{scenario.followUpQuestions.map(followUp => <button key={followUp.id} onClick={() => void submit(followUp.question)}>{followUp.question}</button>)}</div> : null}{error && <p className="error">{error}</p>}<textarea value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit() }} placeholder="Ask about this level…"/><button onClick={() => void submit()} disabled={busy}>{busy ? 'Answering…' : 'Send'}</button></aside>
    </div>
    {verifyFixture && <div className="gigi-modal-backdrop" role="presentation"><form className="gigi-verify-modal" onSubmit={event => { event.preventDefault(); void saveVerification() }}><header><b>VERIFY ON SITE</b><button type="button" onClick={() => setVerifyFixture(null)}>×</button></header><p><b>Target fixture</b><br />{verifyFixture.code} · {verifyFixture.label}</p><label>Inspector name<input value="Demo inspector" readOnly /></label><label>Status<select value={verifyStatus} onChange={event => setVerifyStatus(event.target.value as typeof verifyStatus)}><option>Installed</option><option>In Progress</option><option>Issue Reported</option></select></label><label>Add photo<input type="file" accept="image/*" onChange={event => setVerifyFile(event.target.files?.[0] || null)} /></label><label>Note<textarea value={verifyNote} onChange={event => setVerifyNote(event.target.value)} /></label><button className="gigi-save" disabled={savingVerification}>{savingVerification ? 'Saving…' : 'Save verification'}</button></form></div>}
  </main>
}
