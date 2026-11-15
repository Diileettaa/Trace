import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { CollabBooking, CollabState } from '../types'
import { bookWork, checkWorkflow, getWorkflowBlockers, type BookingViolation, type WorkflowBlocker } from '../api'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const dateKey = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)
const defaultDay = (bookings: CollabBooking[]) => bookings.length ? dateKey(Math.max(...bookings.map(booking => booking.end))) : new Date().toISOString().slice(0, 10)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface Props {
  collab: CollabState
  onChange: (state: CollabState) => void
  defaultRoomId?: string
  onOpenDirect?: (personId: string) => void
}

/** Shared person-by-time schedule. A conflict only exists when both bookings use the same space. */
export default function WorkTimeline({ collab, onChange, defaultRoomId, onOpenDirect }: Props) {
  const me = (() => { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') as { id: string } | null } catch { return null } })()
  const [room, setRoom] = useState(defaultRoomId || '')
  const [trade, setTrade] = useState('architect')
  const [what, setWhat] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const [formBlockers, setFormBlockers] = useState<WorkflowBlocker[]>([])
  const [bookingViolations, setBookingViolations] = useState<BookingViolation[]>([])
  const [day, setDay] = useState(() => defaultDay(collab.bookings || []))
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [contactedBookingId, setContactedBookingId] = useState('')
  const scheduleRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; scrollLeft: number } | null>(null)

  const bookings = collab.bookings || []
  const people = useMemo(() => {
    const known = collab.people || []
    const knownIds = new Set(known.map(person => person.id))
    const unknown = [...new Set(bookings.map(booking => booking.person).filter(id => id && !knownIds.has(id)))].map(id => ({ id, name: id, trade: 'Team member', email: '', phone: '' }))
    return [...known, ...unknown]
  }, [bookings, collab.people])
  const peopleByReference = useMemo(() => new Map(people.flatMap(person => [[person.id, person], [person.name, person]])), [people])
  const selectedPerson = peopleByReference.get(selectedPersonId)
  const rooms = [...new Set(bookings.map(booking => booking.space_id))]
  const startSeconds = start ? new Date(start).getTime() / 1000 : NaN
  const endSeconds = end ? new Date(end).getTime() / 1000 : NaN
  const draftConflicts = Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && room
    ? bookings.filter(booking => booking.space_id === room && startSeconds < booking.end && endSeconds > booking.start)
    : []
  const firstConflict = draftConflicts.slice().sort((a, b) => a.created_at - b.created_at)[0]
  const conflictPerson = firstConflict ? peopleByReference.get(firstConflict.person) : undefined
  const dayStart = new Date(`${day}T00:00`).getTime() / 1000
  const dayEnd = dayStart + 86400
  const dayBookings = bookings.filter(booking => booking.start < dayEnd && booking.end > dayStart)

  useEffect(() => { if (defaultRoomId) setRoom(defaultRoomId) }, [defaultRoomId])
  useEffect(() => {
    if (!room || !trade) { setFormBlockers([]); return }
    let cancelled = false
    void checkWorkflow(room, trade, start, end).then(result => { if (!cancelled) setFormBlockers(result.blockers || []) }).catch(() => { if (!cancelled) setFormBlockers([]) })
    return () => { cancelled = true }
  }, [room, trade, start, end])
  useEffect(() => {
    let cancelled = false
    void getWorkflowBlockers().then(result => { if (!cancelled) setBookingViolations(result.blockers || []) }).catch(() => { if (!cancelled) setBookingViolations([]) })
    return () => { cancelled = true }
  }, [bookings])
  useEffect(() => { setContactedBookingId('') }, [room, start, end])

  async function submit() {
    if (!room || !me || !start || !end || !what) return
    if (firstConflict && contactedBookingId !== firstConflict.id) {
      setError('This room and time are already reserved. Contact the first reservation holder before creating an overlapping booking.')
      return
    }
    try {
      onChange(await bookWork({ space_id: room, trade, person: me.id, start: startSeconds, end: endSeconds, what }))
      setError(''); setWhat(''); setContactedBookingId('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  function openConflictChat() {
    if (!firstConflict || !conflictPerson?.id) { setError('The current reservation has no contact record yet. Ask a project administrator to add one before overlapping it.'); return }
    setContactedBookingId(firstConflict.id)
    onOpenDirect?.(conflictPerson.id)
  }
  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scheduleRef.current
    if (!node || (event.target as Element).closest('button')) return
    drag.current = { x: event.clientX, scrollLeft: node.scrollLeft }
    node.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scheduleRef.current
    if (!node || !drag.current) return
    node.scrollLeft = drag.current.scrollLeft - (event.clientX - drag.current.x)
  }
  function endDrag() { drag.current = null }
  function bookingStyle(booking: CollabBooking) {
    const top = clamp((Math.max(booking.start, dayStart) - dayStart) / 86400 * 100, 0, 100)
    const height = clamp((Math.min(booking.end, dayEnd) - Math.max(booking.start, dayStart)) / 86400 * 100, 4, 100 - top)
    return { top: `${top}%`, height: `${height}%` }
  }
  const violationFor = (booking: CollabBooking) => bookingViolations.find(item => item.booking_id === booking.id)

  return <section className="collab timeline">
    <header className="person-schedule-heading"><div><small>SHARED WORK HOURS</small><h3>Who is working where</h3><p>One vertical axis per person. Drag sideways to browse the team; click an axis to contact its owner.</p></div><label>Work date<input type="date" value={day} onChange={event => setDay(event.target.value)} /></label></header>
    <div className="person-schedule-wrap" ref={scheduleRef} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div className="person-schedule">
        <div className="person-time-axis">{HOURS.map(hour => <span key={hour} style={{ top: `${hour / 24 * 100}%` }}>{hourLabel(hour)}</span>)}</div>
        {people.length ? people.map(person => <div className="person-schedule-column" key={person.id}>
          <button type="button" className="person-axis-head" onClick={() => setSelectedPersonId(person.id)} title={`Open contact for ${person.name}`}><span className="person-contact-circle">{person.name.slice(0, 1).toUpperCase()}</span><b>{person.name}</b><small>{person.trade}</small></button>
          <div className="person-axis-hours">
            {HOURS.map(hour => <i aria-hidden="true" key={hour} style={{ top: `${hour / 24 * 100}%` }} />)}
            {dayBookings.filter(booking => booking.person === person.id).map(booking => {
              const conflicts = bookings.filter(other => other.id !== booking.id && other.space_id === booking.space_id && other.start < booking.end && other.end > booking.start)
              const violation = violationFor(booking)
              return <button type="button" key={booking.id} className={`person-work-block${conflicts.length ? ' conflict' : ''}${violation ? ' order-violation' : ''}`} style={bookingStyle(booking)} onClick={() => setSelectedPersonId(person.id)} title={`${booking.space_id} · ${booking.what}`}><b>{booking.space_id}</b><span>{booking.what}</span>{conflicts.length > 0 && <em>Conflict</em>}</button>
            })}
          </div>
        </div>) : <p className="person-schedule-empty">No team members yet. Register a contact to create the first work axis.</p>}
      </div>
    </div>
    {selectedPerson && <aside className="person-contact-card"><span className="person-contact-circle">{selectedPerson.name.slice(0, 1).toUpperCase()}</span><div><small>TEAM CONTACT</small><b>{selectedPerson.name}</b><span>{selectedPerson.trade}</span>{selectedPerson.email && <a href={`mailto:${selectedPerson.email}`}>{selectedPerson.email}</a>}{selectedPerson.phone && <a href={`tel:${selectedPerson.phone}`}>{selectedPerson.phone}</a>}</div><button type="button" onClick={() => onOpenDirect?.(selectedPerson.id)}>Private chat</button><button type="button" aria-label="Close contact" onClick={() => setSelectedPersonId('')}>×</button></aside>}

    <div className="timeline-form">
      <input aria-label="Room" placeholder="Room / work area ID" value={room} onChange={event => setRoom(event.target.value)} />
      <select value={trade} onChange={event => setTrade(event.target.value)}>{['architect', 'electrician', 'plumber', 'floor', 'wall'].map(item => <option key={item}>{item}</option>)}</select>
      <label>Start<input type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>End<input type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <input placeholder="Work to be done" value={what} onChange={event => setWhat(event.target.value)} />
      <button type="button" disabled={!me || Boolean(firstConflict && contactedBookingId !== firstConflict.id)} onClick={() => void submit()}>{firstConflict ? contactedBookingId === firstConflict.id ? 'Book overlapping time' : 'Contact first reservation' : formBlockers.length ? 'Book anyway' : 'Book time'}</button>
    </div>
    {firstConflict && <div className="schedule-conflict-callout"><b>Same-area time conflict</b><span>{room} is already reserved by {conflictPerson?.name || firstConflict.person} for {firstConflict.what}.</span><button type="button" onClick={openConflictChat}>Open private chat with {conflictPerson?.name || 'reservation holder'}</button>{contactedBookingId === firstConflict.id && <small>Private chat opened. Agree on an exchange or overlap before saving this booking.</small>}</div>}
    {formBlockers.length > 0 && <div className="form-blocker-warning">⚠ {formBlockers.map(blocker => blocker.reason).join(' · ')}</div>}
    {error && <p className="error">{error}</p>}
    {!me && <p className="dim small">Set up your contact above to book work or start a private conversation.</p>}
    {!bookings.length && <p className="dim small">No work booked yet. Choose a room, time and trade to reserve the first slot.</p>}
    {rooms.length > 0 && <p className="timeline-legend">Red blocks conflict only with another booking in the same room or work area. Other areas can be booked at the same time.</p>}
  </section>
}
