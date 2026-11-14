import type { StoreyInfo } from './types'

interface StoreyPanelProps {
  storeys: StoreyInfo[]
  selectedStoreyId: string | null
  onSelectStorey: (storeyId: string | null) => void
  disabled?: boolean
}

export function StoreyPanel({
  storeys,
  selectedStoreyId,
  onSelectStorey,
  disabled = false,
}: StoreyPanelProps) {
  const hasStoreys = storeys.length > 0

  return (
    <div className="explorer-row">
      <span className="explorer-label">Storey:</span>
      <div className="explorer-pills">
        <button
          type="button"
          className={`storey-pill ${selectedStoreyId === null ? 'active' : ''}`}
          onClick={() => onSelectStorey(null)}
          disabled={disabled || !hasStoreys}
          title="Restore full building with all storeys"
        >
          All storeys
        </button>

        {storeys.map((storey) => {
          const isSelected = selectedStoreyId === storey.id
          const elevSign = storey.elevation >= 0 ? '+' : ''
          const elevLabel = `${elevSign}${storey.elevation.toFixed(1)}m`

          return (
            <button
              key={storey.id}
              type="button"
              className={`storey-pill ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectStorey(isSelected ? null : storey.id)}
              disabled={disabled}
              title={`Show ${storey.name} with 1.2 m cut-away (${elevLabel})`}
            >
              {storey.name} <span className="dim small">({elevLabel})</span>
            </button>
          )
        })}

        {!hasStoreys && (
          <span className="dim small" style={{ marginLeft: 4 }}>
            (no storeys defined in this model)
          </span>
        )}
      </div>
    </div>
  )
}
