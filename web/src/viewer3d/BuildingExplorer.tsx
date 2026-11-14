import type { StoreyInfo, TradesState, TradeKey } from './types'
import { StoreyPanel } from './StoreyPanel'
import { TradeLayersPanel } from './TradeLayersPanel'
import './viewer3d.css'

interface BuildingExplorerProps {
  storeys: StoreyInfo[]
  selectedStoreyId: string | null
  onSelectStorey: (storeyId: string | null) => void
  roomCounts?: Record<string, number>
  exploded: boolean
  onExplodedChange: (value: boolean) => void
  planView: boolean
  onPlanViewChange: (value: boolean) => void
  trades: TradesState
  onToggleTrade: (key: TradeKey, enabled: boolean) => void
  disabled?: boolean
}

export function BuildingExplorer({
  storeys,
  selectedStoreyId,
  onSelectStorey,
  roomCounts,
  exploded,
  onExplodedChange,
  planView,
  onPlanViewChange,
  trades,
  onToggleTrade,
  disabled = false,
}: BuildingExplorerProps) {
  return (
    <div className="explorer-bar" aria-label="3D building explorer">
      <StoreyPanel
        storeys={storeys}
        selectedStoreyId={selectedStoreyId}
        onSelectStorey={onSelectStorey}
        roomCounts={roomCounts}
        disabled={disabled}
      />
      <TradeLayersPanel
        trades={trades}
        onToggleTrade={onToggleTrade}
        disabled={disabled}
      />
      <div className="explorer-actions">
        <label><input type="checkbox" checked={exploded} onChange={event => onExplodedChange(event.target.checked)} disabled={disabled} /> Explode</label>
        <button type="button" className={planView ? 'active' : ''} onClick={() => onPlanViewChange(!planView)} disabled={disabled}>Plan view</button>
      </div>
      <div className="explorer-hint">
        <span className="hint-badge">💡 Hint:</span>
        <span>
          Select a storey to isolate that floor and cut above it. Untick trades to hide their elements.
        </span>
      </div>
    </div>
  )
}
