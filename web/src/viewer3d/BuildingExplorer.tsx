import type { StoreyInfo, TradesState, TradeKey } from './types'
import { useMemo, useState } from 'react'
import { englishRoomName } from '../roomNames'
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
  rooms: { key: string; name: string; number?: string; areaM2?: number; storeyId?: string }[]
  selectedRoomKey: string
  onSelectRoom: (key: string) => void
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
  rooms,
  selectedRoomKey,
  onSelectRoom,
  trades,
  onToggleTrade,
  disabled = false,
}: BuildingExplorerProps) {
  const [roomQuery, setRoomQuery] = useState('')
  const filteredRooms = useMemo(() => rooms.filter(room =>
    `${room.name} ${room.number ?? ''}`.toLowerCase().includes(roomQuery.trim().toLowerCase())), [roomQuery, rooms])
  return (
    <div className="explorer-bar" aria-label="3D building explorer">
      <StoreyPanel
        storeys={storeys}
        selectedStoreyId={selectedStoreyId}
        onSelectStorey={onSelectStorey}
        roomCounts={roomCounts}
        disabled={disabled}
      />
      <section className="room-list-panel" aria-label="Room list">
        <strong>Open a room <span className="room-list-count">{filteredRooms.length}</span></strong>
        <input aria-label="Search rooms" placeholder="Search rooms…" value={roomQuery} onChange={event => setRoomQuery(event.target.value)} />
        <div className="room-list-scroll">
          {[...storeys].reverse().map(floor => {
            const floorRooms = filteredRooms.filter(room => room.storeyId === floor.id)
            if (!floorRooms.length) return null
            return <div className="room-list-group" key={floor.id}>
              <small>{floor.name}</small>
              {floorRooms.map(room => <button type="button" key={room.key}
                className={selectedRoomKey === room.key ? 'active' : ''}
                onClick={() => onSelectRoom(room.key)} disabled={disabled}>
                <span>{englishRoomName(room.name)}{room.number ? ` · ${room.number}` : ''}</span>
                {room.areaM2 !== undefined && <small>{room.areaM2.toFixed(1)} m²</small>}
              </button>)}
            </div>
          })}
          {filteredRooms.some(room => !room.storeyId) && <div className="room-list-group"><small>Other</small>
          {filteredRooms.filter(room => !room.storeyId).map(room => <button type="button" key={room.key} className={selectedRoomKey === room.key ? 'active' : ''} onClick={() => onSelectRoom(room.key)}>{englishRoomName(room.name)}</button>)}
          </div>}
          {!filteredRooms.length && <small className="dim">No matching rooms.</small>}
        </div>
      </section>
      <TradeLayersPanel
        trades={trades}
        onToggleTrade={onToggleTrade}
        disabled={disabled}
      />
      <div className="explorer-actions">
        <label><input type="checkbox" checked={exploded} onChange={event => onExplodedChange(event.target.checked)} disabled={disabled} /> Explode</label>
        <button type="button" className={planView ? 'active' : ''} onClick={() => onPlanViewChange(!planView)} disabled={disabled}>{planView ? '3D' : 'Plan'}</button>
      </div>
      <div className="explorer-hint">
        <span className="hint-badge">💡 Hint:</span>
        <span>
          Click a floor for its plan view. Click a room for its floor plan and measurements.
        </span>
      </div>
    </div>
  )
}
