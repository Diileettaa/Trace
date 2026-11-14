import { useState } from 'react'
import { api, toScenario, type QueryScenario } from './adapters'

const TALLINN_PLAN = 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf'

function AnswerCard({ scenario }: { scenario: QueryScenario }) {
  return <article className="gigi-answer-card">
    <span className="gigi-answer-kicker">ANSWER · {scenario.responseTime}</span>
    <strong className="gigi-answer-metric">{scenario.bigMetric}</strong>
    <p>{scenario.aiSummary || 'No answer text was returned.'}</p>
    <small>{scenario.roomName}{scenario.roomArea !== '—' ? ` · ${scenario.roomArea}` : ''}</small>
  </article>
}

export default function GigiWorkspace() {
  const [view, setView] = useState<'2D' | '3D'>('2D')
  const [question, setQuestion] = useState('')
  const [scenario, setScenario] = useState<QueryScenario | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      setScenario(toScenario(answer, prompt, TALLINN_PLAN, plan, verification, plan?.image_size).scenario)
      setQuestion('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not get an answer.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="gigi-shell">
    <header className="gigi-topbar"><b>TRACE DESKTOP APP</b><span>· TALLINN · LEVEL 02 ▾</span><nav><button>Desktop</button><button>Tablet</button><button>Mobile</button></nav></header>
    <div className="gigi-columns">
      <aside><b>HISTORY</b><button>＋ New inspection chat</button><b>SCALE (AI LoD)</b><div>{['1:200', '1:100', '1:50', '1:20'].map(scale => <button key={scale}>{scale}</button>)}</div><b>LAYER GUIDE</b>{['Architecture & Walls', 'Sanitary & Plumbing', 'Ventilation', 'Electrical & Lighting', 'Dimension Chains'].map(layer => <label key={layer}><input type="checkbox" defaultChecked />{layer}</label>)}</aside>
      <section><header>Floor plan <span><button onClick={() => setView('2D')}>2D</button><button onClick={() => setView('3D')}>3D</button></span></header><div className="gigi-keynotes"><article>ROOM<strong>{scenario?.roomCode || 'LEVEL 02'}</strong><b>{scenario?.roomArea || '— m²'}</b></article><article>OBJECTS FOUND<strong>{scenario?.foundCount ?? '—'}</strong></article><article>STATUS<strong>{scenario?.overallStatus || 'In Progress'}</strong><small>{scenario ? `${scenario.targetIds.length} targets` : '0/0 verified'}</small></article></div><div className="gigi-empty">{view === '2D' ? 'Drawing evidence loads with the current answer.' : 'Schematic · select a room to open 3D.'}</div></section>
      <aside><b>ASSISTANT</b>{scenario ? <AnswerCard scenario={scenario} /> : <article><strong>Ask a question</strong><p>Your evidence-backed answer will appear here.</p></article>}{scenario?.followUpQuestions.length ? <div className="gigi-follow-ups"><b>FOLLOW UP</b>{scenario.followUpQuestions.map(followUp => <button key={followUp.id} onClick={() => void submit(followUp.question)}>{followUp.question}</button>)}</div> : null}{error && <p className="error">{error}</p>}<textarea value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit() }} placeholder="Ask about this level…"/><button onClick={() => void submit()} disabled={busy}>{busy ? 'Answering…' : 'Send'}</button></aside>
    </div>
  </main>
}
