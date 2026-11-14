import { useEffect, useState } from 'react'
import type { CollabBooking, CollabState } from '../types'
import { bookWork, checkWorkflow, getWorkflowBlockers, type BookingViolation, type WorkflowBlocker } from '../api'

function hour(value: number) { return new Date(value * 1000).toLocaleString([], { dateStyle: 'short', hour: '2-digit', minute: '2-digit' }) }

export default function WorkTimeline({ collab, onChange, defaultRoomId }: { collab: CollabState; onChange: (state: CollabState) => void; defaultRoomId?: string }) {
  const me = (() => { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { return null } })()
  const [room, setRoom] = useState(defaultRoomId || '')
  const [trade, setTrade] = useState('architect')
  const [what, setWhat] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const [formBlockers, setFormBlockers] = useState<WorkflowBlocker[]>([])
  const [bookingViolations, setBookingViolations] = useState<BookingViolation[]>([])

  const bookings = collab.bookings || []
  const rooms = [...new Set(bookings.map(b => b.space_id))]

  useEffect(() => {
    if (defaultRoomId) setRoom(defaultRoomId)
  }, [defaultRoomId])

  // Check sequence rules as user fills out the booking form
  useEffect(() => {
    if (!room || !trade) {
      setFormBlockers([])
      return
    }
    let cancelled = false
    void checkWorkflow(room, trade, start, end).then(res => {
      if (!cancelled) setFormBlockers(res.blockers || [])
    }).catch(() => {
      if (!cancelled) setFormBlockers([])
    })
    return () => { cancelled = true }
  }, [room, trade, start, end])

  // Scan project-wide blockers for Gantt / Schedule timeline
  useEffect(() => {
    let cancelled = false
    void getWorkflowBlockers().then(res => {
      if (!cancelled) setBookingViolations(res.blockers || [])
    }).catch(() => {
      if (!cancelled) setBookingViolations([])
    })
    return () => { cancelled = true }
  }, [collab.bookings])

  async function submit() {
    if (!room || !me || !start || !end || !what) return
    try {
      onChange(await bookWork({
        space_id: room,
        trade,
        person: me.id,
        start: new Date(start).getTime() / 1000,
        end: new Date(end).getTime() / 1000,
        what,
      }))
      setError('')
      setWhat('')
    } catch (e) {
      setError(String(e))
    }
  }

  function overlapping(b: CollabBooking) {
    return bookings.filter(x => x.id !== b.id && x.space_id === b.space_id && x.start < b.end && x.end > b.start)
  }

  return <section className="collab timeline">
    <h3>Work timeline <span className="demo-schedule">Demo schedule · shared bookings</span></h3>
    <div className="timeline-form">
      <input aria-label="Room" placeholder="Room ID" value={room} onChange={e => setRoom(e.target.value)} />
      <select value={trade} onChange={e => setTrade(e.target.value)}>{['architect','electrician','plumber','floor','wall'].map(t => <option key={t}>{t}</option>)}</select>
      <label>Start<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>End<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <input placeholder="Work to be done" value={what} onChange={e => setWhat(e.target.value)} />
      <button disabled={!me} onClick={submit}>
        {formBlockers.length > 0 ? 'Book anyway' : 'Book time'}
      </button>
    </div>
    {formBlockers.length > 0 && <div className="form-blocker-warning">
      ⚠ {formBlockers.map(b => b.reason).join(' · ')}
    </div>}
    {error && <p className="error">{error}</p>}
    {!me && <p className="dim small">Register your contact above to book work.</p>}
    {rooms.map(id => <div className="timeline-room" key={id}><b>{id}</b><div className="timeline-row">{bookings.filter(b => b.space_id === id).sort((a,b) => a.start-b.start).map(b => {
      const clashes = overlapping(b)
      const winner = b.winner || (b.conflict_with ? bookings.find(x => x.id === b.conflict_with) : [b, ...clashes].sort((a,c) => a.created_at-c.created_at)[0])
      const owner = winner && collab.people?.find(p => p.id === winner.person)
      const violation = bookingViolations.find(v => v.booking_id === b.id)
      const violationReason = violation?.blockers?.map(x => x.reason).join('\n') || ''

      return <article key={b.id} className={`booking ${clashes.length ? 'conflict' : ''} ${violation ? 'order-violation' : ''}`} title={violationReason}>
        <strong>{b.trade}</strong> · {b.what}<br /><span>{hour(b.start)}–{hour(b.end)}</span>
        {clashes.length > 0 && <div className="conflict-detail">⚠ SCHEDULE CONFLICT · first booking keeps the slot{owner && <><br />Contact: {owner.name} · {owner.email} · {owner.phone}<br /><button onClick={() => window.dispatchEvent(new CustomEvent('trace-open-direct', { detail: owner.id }))}>Open private chat</button></>}</div>}
        {violation && <div className="booking-blocker-badge" title={violationReason}>
          ⚠ {violation.blockers.map(x => x.reason).join('; ')}
        </div>}
      </article>
    })}</div></div>)}
    {!bookings.length && <p className="dim small">No work booked yet. Pick a room, time and trade above to reserve the first slot.</p>}
  </section>
}
