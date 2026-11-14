import { useState } from 'react'
import type { CollabBooking, CollabState } from '../types'
import { bookWork } from '../api'

function hour(value: number) { return new Date(value * 1000).toLocaleString([], { dateStyle: 'short', hour: '2-digit', minute: '2-digit' }) }
export default function WorkTimeline({ collab, onChange }: { collab: CollabState; onChange: (state: CollabState) => void }) {
  const me = (() => { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { return null } })()
  const [room, setRoom] = useState(''); const [trade, setTrade] = useState('architect'); const [what, setWhat] = useState('')
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [error, setError] = useState('')
  const bookings = collab.bookings || []
  const rooms = [...new Set(bookings.map(b => b.space_id))]
  async function submit() {
    if (!room || !me || !start || !end || !what) return
    try { onChange(await bookWork({ space_id: room, trade, person: me.id, start: new Date(start).getTime() / 1000, end: new Date(end).getTime() / 1000, what })); setError(''); setWhat('') }
    catch (e) { setError(String(e)) }
  }
  function overlapping(b: CollabBooking) { return bookings.filter(x => x.id !== b.id && x.space_id === b.space_id && x.start < b.end && x.end > b.start) }
  return <section className="collab timeline">
    <h3>Work timeline <span className="demo-schedule">Demo schedule · shared bookings</span></h3>
    <div className="timeline-form">
      <input aria-label="Room" placeholder="Room ID" value={room} onChange={e => setRoom(e.target.value)} />
      <select value={trade} onChange={e => setTrade(e.target.value)}>{['architect','electrician','plumber','floor','wall'].map(t => <option key={t}>{t}</option>)}</select>
      <label>Start<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>End<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <input placeholder="Work to be done" value={what} onChange={e => setWhat(e.target.value)} />
      <button disabled={!me} onClick={submit}>Book time</button>
    </div>
    {error && <p className="error">{error}</p>}
    {!me && <p className="dim small">Register your contact above to book work.</p>}
    {rooms.map(id => <div className="timeline-room" key={id}><b>{id}</b><div className="timeline-row">{bookings.filter(b => b.space_id === id).sort((a,b) => a.start-b.start).map(b => {
      const clashes = overlapping(b); const winner = b.winner || (b.conflict_with ? bookings.find(x => x.id === b.conflict_with) : [b, ...clashes].sort((a,c) => a.created_at-c.created_at)[0])
      const owner = winner && collab.people?.find(p => p.id === winner.person)
      const invalidOrder = /toilet|wc/i.test(b.what) && bookings.some(x => x.space_id === b.space_id && /wall/i.test(x.what) && x.end > b.start)
      return <article key={b.id} className={`booking ${clashes.length ? 'conflict' : ''}`}>
        <strong>{b.trade}</strong> · {b.what}<br /><span>{hour(b.start)}–{hour(b.end)}</span>
        {clashes.length > 0 && <div className="conflict-detail">⚠ SCHEDULE CONFLICT · first booking keeps the slot{owner && <><br />Contact: {owner.name} · {owner.email} · {owner.phone}<br /><button onClick={() => window.dispatchEvent(new CustomEvent('trace-open-direct', { detail: owner.id }))}>Open private chat</button></>}</div>}
        {invalidOrder && <div className="order-warning">⚠ Wall work should finish before toilet installation.</div>}
      </article>
    })}</div></div>)}
    {!bookings.length && <p className="dim small">No bookings yet. New entries are shown in the Demo schedule.</p>}
  </section>
}
