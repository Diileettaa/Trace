import type { StoreyInfo } from './types'

interface StoreyPanelProps {
  storeys: StoreyInfo[]
  selectedStoreyId: string | null
  onSelectStorey: (storeyId: string | null) => void
  roomCounts?: Record<string, number>
  disabled?: boolean
}

export function StoreyPanel({
  storeys,
  selectedStoreyId,
  onSelectStorey,
  roomCounts = {},
  disabled = false,
}: StoreyPanelProps) {
  const hasStoreys = storeys.length > 0

  return (
    <div className="storey-sidebar">
      <strong>Open a floor</strong>
        <button
          type="button"
          className={`storey-pill ${selectedStoreyId === null ? 'active' : ''}`}
          onClick={() => onSelectStorey(null)}
          disabled={disabled || !hasStoreys}
          title="Restore full building with all storeys"
        >
          Whole building
        </button>

        {[...storeys].reverse().map((storey) => {
          const isSelected = selectedStoreyId === storey.id
          const displayElevation = storey.displayElevation ?? storey.elevation
          const elevSign = displayElevation > 0 ? '+' : ''
          const elevLabel = `${elevSign}${displayElevation.toFixed(1)}m`

          return (
            <button
              key={storey.id}
              type="button"
              className={`storey-pill ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectStorey(isSelected ? null : storey.id)}
              disabled={disabled}
          title={`Open ${storey.name} as a top-down floor plan (${elevLabel})`}
            >
              <span>{storey.name}</span><span className="storey-meta">{elevLabel} · {roomCounts[storey.id] ?? 0} rooms</span>
            </button>
          )
        })}

        {!hasStoreys && (
          <span className="dim small" style={{ marginLeft: 4 }}>
            (no storeys defined in this model)
          </span>
        )}
    </div>
  )
}
