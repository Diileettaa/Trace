import { useEffect, useState } from 'react'
import { createOrder, type Order, type ScenePlacement } from '../api'

interface Props {
  modelPath: string
  spaceId?: string
  spaceName?: string
  placements: ScenePlacement[]
  onClose: () => void
  onOrderCreated: (order: Order) => void
}

const TRADES = ['architect', 'electrician', 'plumber', 'floor', 'wall']

export default function OrderModal({ modelPath, spaceId = '', spaceName = '', placements, onClose, onOrderCreated }: Props) {
  // Default to items in the current space, or all if space not specified
  const spacePlacements = spaceId
    ? placements.filter(p => p.space_id === spaceId)
    : placements

  const defaultSelection = spacePlacements.length > 0 ? spacePlacements : placements
  const [selectedIds, setSelectedIds] = useState<string[]>(() => defaultSelection.map(p => p.instanceId))
  const [supplier, setSupplier] = useState('Nordic Furnishings AB')
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 5)
    return d.toISOString().split('T')[0]
  })
  const [deliverTo, setDeliverTo] = useState(spaceId || '')
  const [notifiedTrades, setNotifiedTrades] = useState<string[]>(['architect', 'plumber'])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (spaceId && !deliverTo) setDeliverTo(spaceId)
  }, [spaceId, deliverTo])

  const selectedItems = placements.filter(p => selectedIds.includes(p.instanceId))
  const totalPrice = selectedItems.reduce((sum, item) => sum + (item.price_eur || 0), 0)

  function toggleItem(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleTrade(t: string) {
    setNotifiedTrades(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier.trim()) { setError('Supplier name is required.'); return }
    if (!deliveryDate) { setError('Delivery date is required.'); return }
    if (!deliverTo.trim()) { setError('Destination space ID is required.'); return }
    if (selectedIds.length === 0) { setError('Please select at least one furniture item to order.'); return }

    let meName = 'Site Architect'
    try {
      const p = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')
      if (p?.name) meName = p.name
    } catch { /* use default */ }

    setSubmitting(true)
    setError('')
    try {
      const order = await createOrder({
        model: modelPath,
        items: selectedIds,
        supplier: supplier.trim(),
        delivery_date: deliveryDate,
        deliver_to_space_id: deliverTo.trim(),
        notify_trades: notifiedTrades,
        author: meName,
      })
      onOrderCreated(order)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="workbench-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <section className="workbench-dialog order-dialog">
        <button className="workbench-dialog-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>Order Furniture & Fixtures</h2>
        <p className="sub">
          Create purchase order for {spaceName ? `room ${spaceName}` : 'project'}. Total: <b>€{totalPrice.toLocaleString()}</b>
        </p>

        <form onSubmit={handleSubmit} className="order-form">
          <div className="order-items-selection">
            <b>Items to order ({selectedItems.length} selected):</b>
            <div className="order-items-list">
              {placements.length === 0 ? (
                <p className="dim small">No furniture placed in 3D yet. You can still order by selecting products.</p>
              ) : (
                placements.map(p => (
                  <label key={p.instanceId} className="order-item-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.instanceId)}
                      onChange={() => toggleItem(p.instanceId)}
                    />
                    <span>{p.name || p.catalogId}</span>
                    <span className="order-item-price">€{(p.price_eur || 0).toLocaleString()}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="order-field-row">
            <label>
              <b>Supplier</b>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Nordic Office AB" />
            </label>
            <label>
              <b>Expected Delivery Date</b>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </label>
          </div>

          <label>
            <b>Deliver to Room / Space ID</b>
            <input value={deliverTo} onChange={e => setDeliverTo(e.target.value)} placeholder="e.g. 101 or Room GUID" />
          </label>

          <div className="order-trades-section">
            <b>Notify trades upon delivery:</b>
            <div className="order-trades-checkboxes">
              {TRADES.map(t => (
                <label key={t} className="trade-checkbox">
                  <input
                    type="checkbox"
                    checked={notifiedTrades.includes(t)}
                    onChange={() => toggleTrade(t)}
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="form-blocker-warning">{error}</div>}

          <div className="order-dialog-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Placing order…' : `Confirm Order (€${totalPrice.toLocaleString()})`}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
