import { useEffect, useMemo, useState } from 'react'
import type { CollabBooking, CollabState } from '../types'
import { bookWork, checkWorkflow, getWorkflowBlockers, type BookingViolation, type WorkflowBlocker } from '../api'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const localDateKey = (seconds: number) => {
  const value = new Date(seconds * 1000)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
const defaultDay = (bookings: CollabBooking[]) => bookings.length ? localDateKey(Math.max(...bookings.map(booking => booking.end))) : localDateKey(Date.now() / 1000)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const daySeconds = (day: string) => new Date(`${day}T00:00:00`).getTime() / 1000
const timeText = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const moveDay = (day: string, amount: number) => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return localDateKey(date.getTime() / 1000)
}

interface Props {
  collab: CollabState
  onChange: (state: CollabState) => void
  defaultRoomId?: string
  onOpenDirect?: (personId: string) => void
}

/** A daily site plan: work is grouped by location, not by person. */
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
  const selectedDayStart = daySeconds(day)
  const selectedDayEnd = selectedDayStart + 86400
  const dayBookings = bookings.filter(booking => booking.start < selectedDayEnd && booking.end > selectedDayStart)
  const bookingsByRoom = useMemo(() => {
    const grouped = new Map<string, CollabBooking[]>()
    for (const booking of dayBookings) grouped.set(booking.space_id, [...(grouped.get(booking.space_id) || []), booking])
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([spaceId, items]) => [spaceId, items.sort((left, right) => left.start - right.start)] as const)
  }, [dayBookings])

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
  function bookingStyle(booking: CollabBooking) {
    const left = clamp((Math.max(booking.start, selectedDayStart) - selectedDayStart) / 86400 * 100, 0, 100)
    const width = clamp((Math.min(booking.end, selectedDayEnd) - Math.max(booking.start, selectedDayStart)) / 86400 * 100, 3.5, 100 - left)
    return { left: `${left}%`, width: `${width}%` }
  }
  const violationFor = (booking: CollabBooking) => bookingViolations.find(item => item.booking_id === booking.id)

  return <section className="collab timeline">
    <header className="day-schedule-heading"><div><small>DAILY SITE PLAN</small><h3>Who is working in each area</h3><p>Choose a day. Work is grouped by room or work area, so time, place, person and trade stay together.</p></div><div className="day-picker"><button type="button" aria-label="Previous day" onClick={() => setDay(current => moveDay(current, -1))}>‹</button><label>Work date<input type="date" value={day} onChange={event => setDay(event.target.value)} /></label><button type="button" aria-label="Next day" onClick={() => setDay(current => moveDay(current, 1))}>›</button><button type="button" onClick={() => setDay(localDateKey(Date.now() / 1000))}>Today</button></div></header>
    <div className="day-schedule-wrap">
      <div className="day-schedule-board">
        <div className="day-schedule-sticky day-schedule-meta-head"><span>Work area</span><span>Assigned to</span></div>
        <div className="day-time-scale">{HOURS.map(hour => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{hourLabel(hour)}</span>)}</div>
        {bookingsByRoom.map(([spaceId, items]) => <section className="day-location-group" key={spaceId}>
          <header><b>{spaceId}</b><small>{items.length} booking{items.length === 1 ? '' : 's'} · same-area conflicts are marked red</small></header>
          {items.map(booking => {
            const person = peopleByReference.get(booking.person)
            const conflicts = bookings.filter(other => other.id !== booking.id && other.space_id === booking.space_id && other.start < booking.end && other.end > booking.start)
            const violation = violationFor(booking)
            return <div className="day-booking-row" key={booking.id}>
              <button type="button" className="day-booking-person" onClick={() => setSelectedPersonId(person?.id || booking.person)} title={`Contact ${person?.name || booking.person}`}><span className="person-contact-circle">{(person?.name || booking.person).slice(0, 1).toUpperCase()}</span><span><b>{person?.name || booking.person}</b><small>{person?.trade || booking.trade} · {spaceId}</small></span></button>
              <div className="day-timeline-lane">{HOURS.map(hour => <i aria-hidden="true" key={hour} style={{ left: `${hour / 24 * 100}%` }} />)}<button type="button" className={`day-work-block${conflicts.length ? ' conflict' : ''}${violation ? ' order-violation' : ''}`} style={bookingStyle(booking)} onClick={() => setSelectedPersonId(person?.id || booking.person)} title={`${spaceId} · ${timeText(booking.start)}–${timeText(booking.end)} · ${booking.what}`}><b>{timeText(booking.start)}–{timeText(booking.end)}</b><span>{booking.what}</span>{conflicts.length > 0 && <em>Conflict</em>}</button></div>
            </div>
          })}
        </section>)}
        {!bookingsByRoom.length && <p className="day-schedule-empty">No work is booked for this day. Add the first reservation below.</p>}
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
    {rooms.length > 0 && <p className="timeline-legend">Only overlapping reservations for the same work area conflict. Other rooms can be booked at the same time.</p>}
  </section>
}
