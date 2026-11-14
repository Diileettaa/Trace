import type { TradesState, TradeKey } from './types'
import { ARCHITECTURE_OPACITY, TRADE_COLORS } from './tradeClassifier'

interface TradeLayersPanelProps {
  trades: TradesState
  onToggleTrade: (key: TradeKey, enabled: boolean) => void
  disabled?: boolean
}

export function TradeLayersPanel({ trades, onToggleTrade, disabled = false }: TradeLayersPanelProps) {
  const noMep = trades.plumbing.count === 0 && trades.electrical.count === 0
  const tradeList = Object.values(trades).filter((trade) => trade.count > 0)
  const onlyTrade = tradeList.length === 1 ? tradeList[0] : null

  return (
    <div className="explorer-row">
      <span className="explorer-label">Trades:</span>
      <div className="explorer-pills">
        {onlyTrade ? (
          <span className="only-trade">Only {onlyTrade.label.toLowerCase()} in this model</span>
        ) : tradeList.map((trade) => (
          <label key={trade.key} className={`trade-checkbox-label trade-${trade.key} ${disabled ? 'disabled' : ''}`}>
            <input type="checkbox" checked={trade.enabled} disabled={disabled}
              onChange={(event) => onToggleTrade(trade.key, event.target.checked)} />
            <span>{trade.label}</span>
            <span className="trade-count">({trade.count})</span>
          </label>
        ))}
        {!onlyTrade && tradeList.length > 0 && noMep && <span className="trade-none no-mep">No plumbing/electrical in this model</span>}
        {!tradeList.length && <span className="trade-none">No trade elements found in this model</span>}
      </div>
      {tradeList.length > 0 && <div className="trade-legend" aria-label="Trade colour legend">
        {tradeList.map((trade) => <span className="trade-legend-item" key={trade.key}>
          <i className={`trade-swatch trade-swatch-${trade.key}`} style={{ backgroundColor: TRADE_COLORS[trade.key as TradeKey], opacity: trade.key === 'architecture' ? ARCHITECTURE_OPACITY : 1 }} />
          {trade.label}
        </span>)}
      </div>}
    </div>
  )
}
