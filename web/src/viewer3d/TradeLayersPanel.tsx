import type { TradesState, TradeKey } from './types'

interface TradeLayersPanelProps {
  trades: TradesState
  onToggleTrade: (key: TradeKey, enabled: boolean) => void
  disabled?: boolean
}

export function TradeLayersPanel({
  trades,
  onToggleTrade,
  disabled = false,
}: TradeLayersPanelProps) {
  const noMep = trades.plumbing.count === 0 && trades.electrical.count === 0
  const tradeList = Object.values(trades).filter((trade) =>
    !(noMep && (trade.key === 'plumbing' || trade.key === 'electrical')),
  )

  return (
    <div className="explorer-row">
      <span className="explorer-label">Trades:</span>
      <div className="explorer-pills">
        {tradeList.map((trade) => {
          const hasElements = trade.count > 0
          const isDisabled = disabled || !hasElements

          return (
            <label
              key={trade.key}
              className={`trade-checkbox-label ${isDisabled ? 'disabled' : ''}`}
              title={
                hasElements
                  ? `${trade.label}: ${trade.count} elements. Untick to hide.`
                  : `No ${trade.label.toLowerCase()} elements found in this model`
              }
            >
              <input
                type="checkbox"
                checked={trade.enabled && hasElements}
                disabled={isDisabled}
                onChange={(e) => onToggleTrade(trade.key, e.target.checked)}
              />
              <span>{trade.label}</span>
              {hasElements ? (
                <span className="trade-count">({trade.count})</span>
              ) : (
                <span className="trade-none">(none in this model)</span>
              )}
            </label>
          )
        })}

        {noMep && (
          <span className="trade-none no-mep">No plumbing/electrical in this model</span>
        )}

      </div>
    </div>
  )
}
