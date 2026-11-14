import { useState } from 'react'
import { setRoomStatus } from '../api'
import IfcViewer from '../IfcViewer'
import type { CollabState, RoomStatus } from '../types'
import type { PlanRoom } from '../api'
import RoomPlanPreview from './RoomPlanPreview'
import RoomCollabPanel from './RoomCollabPanel'
import RoomMediaPanel from './RoomMediaPanel'

export default function RoomDetailCard({ room, modelPath, collab, onChange, onScreenshot, onClose }: {
  room: PlanRoom; modelPath: string; collab: CollabState; onChange: (state: CollabState) => void
  onScreenshot: (dataUrl: string, name: string, note: string) => void; onClose: () => void
}) {
  const [error, setError] = useState('')
  const [status, setStatus] = useState<RoomStatus>(room.status || 'pending')
  const label = room.name || room.number || room.space_id
  const isIfc = modelPath.toLowerCase().endsWith('.ifc')
  return <div className="room-plan-card">
    <div className="room-plan-card-heading"><div><span className="dim small">Room details</span><h3>{label}</h3></div><button onClick={onClose} aria-label="Close room details">Close</button></div>
    {isIfc ? <div className="room-plan-card-preview"><IfcViewer path={modelPath} guids={[]} previewRoomGuid={room.space_id} previewRoomStatus={status} onSelectRoom={() => {}} onScreenshot={(dataUrl, name, note) => onScreenshot(dataUrl, name, note)} /></div>
      : room.polygon_px ? <RoomPlanPreview polygon={room.polygon_px} missingWall={status === 'missing_wall'} /> : <p className="dim">Room outline unavailable.</p>}
    <div className="room-plan-details-grid">
      <section><h4>Room information</h4><dl><dt>Number</dt><dd>{room.number || '—'}</dd><dt>Area</dt><dd>{room.area_m2 == null ? '—' : `${room.area_m2.toFixed(2)} m²`}</dd></dl>
        <label>Status <select value={status} onChange={async event => { const next = event.target.value as RoomStatus; setStatus(next); try { onChange(await setRoomStatus(room.space_id, next)) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }}><option value="built">Built</option><option value="missing_wall">Missing wall</option><option value="pending">Pending</option></select></label>
        {error && <p className="error">{error}</p>}
      </section>
      <RoomCollabPanel spaceId={room.space_id} spaceName={label} role="" collab={collab} onChange={onChange} onHighlightSpace={() => {}} />
      <RoomMediaPanel spaceId={room.space_id} roomName={label} />
    </div>
  </div>
}
