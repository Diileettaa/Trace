import { useState } from 'react'
import { postRoomChat, setRoomStatus } from '../api'
import type { CollabState, Role, RoomStatus } from '../types'

interface Props {
  spaceId: string
  spaceName: string
  role: Role
  collab: CollabState
  onChange: (s: CollabState) => void
  onHighlightSpace: (spaceId: string) => void
}

const STATUSES: { v: RoomStatus; label: string }[] = [
  { v: 'built', label: 'Built' },
  { v: 'missing_wall', label: 'Missing wall' },
  { v: 'pending', label: 'Pending' },
]
const TRADES = ['architect', 'electrician', 'plumber', 'owner']

/** Modules 3 & 4: construction status per room + a Room Board. A change highlights only that room. */
export default function RoomCollabPanel({ spaceId, spaceName, role, collab, onChange, onHighlightSpace }: Props) {
  const [text, setText] = useState('')
  const [notify, setNotify] = useState<string[]>([])
  const [err, setErr] = useState('')
  const status = collab.status[spaceId]?.status
  const msgs = collab.messages.filter((m) => m.space_id === spaceId)
  const me = (() => { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { return null } })()

  async function run(p: Promise<CollabState>) {
    setErr('')
    try {
      onChange(await p)
      onHighlightSpace(spaceId)
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <section className="collab">
      <h3>Room Board · {spaceName}</h3>
      <div className="row">
        {STATUSES.map((s) => (
          <button key={s.v} className={status === s.v ? `tag-btn on ${s.v}` : 'tag-btn'}
            onClick={() => run(setRoomStatus(spaceId, s.v, role))}>{s.label}</button>
        ))}
      </div>
      <ul className="msgs">
        {msgs.slice(-8).map((m, i) => (
          <li key={i}>
            <span className="dim">{collab.people?.find(p => p.id === m.author)?.name || m.author || 'someone'} · {collab.people?.find(p => p.id === m.author)?.trade || m.role || 'team'} · {new Date(m.ts * 1000).toLocaleString()}</span><br />{m.text}
            {m.attachment && <img className="chat-attachment" src={m.attachment} alt="Shared room screenshot" />}
            {m.notify && m.notify.length > 0 && <span className="notify"> → {m.notify.join(', ')}</span>}
          </li>
        ))}
        {msgs.length === 0 && <li className="dim">No messages for this room yet.</li>}
      </ul>
      <div className="row small">
        {TRADES.map((t) => (
          <label key={t} className="chk">
            <input type="checkbox" checked={notify.includes(t)}
              onChange={() => setNotify((n) => (n.includes(t) ? n.filter((x) => x !== t) : [...n, t]))} />{t}
          </label>
        ))}
      </div>
      <div className="row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Change or note for this room…" />
        <button onClick={() => { if (text.trim()) { run(postRoomChat(spaceId, text, me?.id || '', me?.trade || role, '')); setText('') } }}>Post</button>
      </div>
      {err && <div className="error">{err}</div>}
    </section>
  )
}
