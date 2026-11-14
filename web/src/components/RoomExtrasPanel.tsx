import { useEffect, useState } from 'react'
import { createChangeOrder, decideChangeOrder, getChangeOrders, type ChangeOrder } from '../api'

interface Props {
  spaceId: string
  spaceName?: string
  userTrade?: string
  userName?: string
  onBudgetChange?: () => void
}

export default function RoomExtrasPanel({ spaceId, spaceName, userTrade = '', userName = '', onBudgetChange }: Props) {
  const [items, setItems] = useState<ChangeOrder[]>([])
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionFeedback, setActionFeedback] = useState('')

  const isOwner = userTrade.trim().toLowerCase() === 'owner'

  async function loadData() {
    try {
      const res = await getChangeOrders(spaceId)
      setItems(res.change_orders || [])
    } catch (err) {
      console.warn('Failed to load change orders:', err)
    }
  }

  useEffect(() => {
    void loadData()
  }, [spaceId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!desc.trim()) { setError('Please enter what extra work is needed.'); return }
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) { setError('Please enter a valid positive amount in €.'); return }

    setLoading(true)
    setError('')
    try {
      await createChangeOrder({
        space_id: spaceId,
        trade: userTrade || 'contractor',
        author: userName || 'Site Worker',
        description: desc.trim(),
        amount_eur: num,
      })
      setDesc('')
      setAmount('')
      await loadData()
      onBudgetChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleDecide(orderId: string, decision: 'approve' | 'reject') {
    if (!isOwner) return
    try {
      await decideChangeOrder({
        id: orderId,
        decision,
        by: userName || 'Owner',
        role: 'owner',
      })
      setActionFeedback(`Change order ${decision}d.`)
      setTimeout(() => setActionFeedback(''), 3000)
      await loadData()
      onBudgetChange?.()
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="room-extras-panel">
      <form onSubmit={handleCreate} className="change-order-form">
        <h4>Request Extra Work / Change Order</h4>
        <input
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Work needed (e.g. Extra power outlet & conduit)"
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            min="1"
            step="10"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Cost (€)"
            style={{ width: '120px' }}
          />
          <button type="submit" className="primary" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Submitting…' : 'Submit Extra'}
          </button>
        </div>
        {error && <div className="form-blocker-warning">{error}</div>}
      </form>

      {actionFeedback && <small style={{ color: '#2b6cb0', fontWeight: 600 }}>{actionFeedback}</small>}

      <div className="change-orders-list">
        <h4>Extra Cost Items ({items.length})</h4>
        {items.length === 0 ? (
          <p className="dim small">No extra change orders filed for {spaceName || spaceId}.</p>
        ) : (
          items.map(co => (
            <article key={co.id} className="change-order-card">
              <div className="change-order-header">
                <span>{co.description}</span>
                <span className={`change-order-status-badge ${co.status}`}>{co.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4a5568' }}>
                <span>By {co.author} ({co.trade})</span>
                <span style={{ fontWeight: 700, color: '#2d3748' }}>€{co.amount_eur.toLocaleString()}</span>
              </div>
              {co.status === 'pending' && (
                <div className="change-order-actions">
                  <button
                    type="button"
                    className="approve"
                    disabled={!isOwner}
                    title={!isOwner ? 'Only the owner can approve extra costs' : 'Approve extra cost'}
                    onClick={() => handleDecide(co.id, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="reject"
                    disabled={!isOwner}
                    title={!isOwner ? 'Only the owner can approve extra costs' : 'Reject extra cost'}
                    onClick={() => handleDecide(co.id, 'reject')}
                  >
                    Reject
                  </button>
                  {!isOwner && (
                    <small className="dim" style={{ fontSize: '10px' }}>
                      Only the owner can approve extra costs
                    </small>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  )
}
