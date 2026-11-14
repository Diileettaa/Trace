import { useEffect, useState } from 'react'
import { getCalendar, getOrders, updateOrderStatus, type CalendarEvent, type Order } from '../api'

interface Props {
  modelPath: string
  onSelectRoom?: (spaceId: string) => void
  onOpenOrderModal?: () => void
}

export default function CalendarOrdersView({ modelPath, onSelectRoom, onOpenOrderModal }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayIndex = firstDay.getDay()

  const fromStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const toStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  async function loadData() {
    setLoading(true)
    try {
      const [calRes, ordRes] = await Promise.all([
        getCalendar(fromStr, toStr),
        getOrders(modelPath),
      ])
      setEvents(calRes.events || [])
      setOrders(ordRes.orders || [])
    } catch (err) {
      console.warn('Failed to load calendar/orders:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [fromStr, toStr, modelPath])

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  async function handleStatusChange(orderId: string, newStatus: 'ordered' | 'shipped' | 'delivered') {
    try {
      await updateOrderStatus(orderId, newStatus)
      setStatusMsg(`Order status updated to ${newStatus}`)
      setTimeout(() => setStatusMsg(''), 3000)
      void loadData()
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err))
    }
  }

  // Group events by day string YYYY-MM-DD
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    if (!ev.date) continue
    const dateKey = ev.date.split('T')[0]
    if (!eventsByDate.has(dateKey)) eventsByDate.set(dateKey, [])
    eventsByDate.get(dateKey)!.push(ev)
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <section className="calendar-orders-view">
      <div className="calendar-orders-layout">
        {/* Left / Main: Month Calendar */}
        <div className="calendar-section">
          <header className="calendar-header">
            <div className="calendar-nav">
              <button type="button" onClick={prevMonth}>‹</button>
              <h2>{monthName}</h2>
              <button type="button" onClick={nextMonth}>›</button>
            </div>
            <div className="calendar-legend">
              <span className="legend-item delivery">🚚 Delivery</span>
              <span className="legend-item work">🔨 Work booking</span>
              {onOpenOrderModal && (
                <button type="button" className="primary small" onClick={onOpenOrderModal}>
                  + Place order
                </button>
              )}
            </div>
          </header>

          <div className="calendar-grid">
            {weekDays.map(d => (
              <div key={d} className="calendar-weekday-cell">{d}</div>
            ))}

            {Array.from({ length: startingDayIndex }).map((_, i) => (
              <div key={`blank-${i}`} className="calendar-day-cell blank" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
              const dayEvents = eventsByDate.get(dateKey) || []

              return (
                <div key={dateKey} className={`calendar-day-cell ${dayEvents.length ? 'has-events' : ''}`}>
                  <span className="day-number">{dayNum}</span>
                  <div className="day-events">
                    {dayEvents.map((ev, idx) => (
                      <button
                        key={`${ev.date}-${idx}`}
                        type="button"
                        className={`calendar-event-chip ${ev.kind}`}
                        title={`${ev.title} (Room: ${ev.space_id || 'Project'})`}
                        onClick={() => ev.space_id && onSelectRoom?.(ev.space_id)}
                      >
                        {ev.kind === 'delivery' ? '🚚 ' : '🔨 '}
                        <span>{ev.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right / Sidebar: Orders List */}
        <aside className="orders-section">
          <div className="orders-header">
            <h3>Recent Orders ({orders.length})</h3>
            {loading && <small className="orders-status-msg">Loading…</small>}
            {statusMsg && <small className="orders-status-msg">{statusMsg}</small>}
          </div>

          <div className="orders-list">
            {orders.length === 0 ? (
              <p className="dim small">No purchase orders placed yet.</p>
            ) : (
              orders.map(order => (
                <article key={order.id} className="order-card">
                  <div className="order-card-header">
                    <strong>{order.supplier}</strong>
                    <span className="order-price">€{(order.total_price_eur || 0).toLocaleString()}</span>
                  </div>
                  <div className="order-card-meta">
                    <small>Items: {order.items?.length || 0} · Room: {order.deliver_to_space_id || 'N/A'}</small>
                    <small>Delivery: <b>{order.delivery_date}</b></small>
                  </div>
                  <div className="order-card-status">
                    <label>Status: </label>
                    <select
                      value={order.status}
                      onChange={e => void handleStatusChange(order.id, e.target.value as 'ordered' | 'shipped' | 'delivered')}
                    >
                      <option value="ordered">Ordered</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                    </select>
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
