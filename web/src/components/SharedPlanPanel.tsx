import { useEffect, useMemo, useRef, useState } from 'react'
import { drawingUrl, getPlanRooms, setRoomStatus, type PlanRoom, type PlanRoomsResult } from '../api'
import type { CollabState, RoomStatus } from '../types'
import IfcViewer from '../IfcViewer'
import RoomPlanPreview from './RoomPlanPreview'
import RoomCollabPanel from './RoomCollabPanel'
import RoomMediaPanel from './RoomMediaPanel'

const statusColor: Record<string, string> = { built: '#74A889', missing_wall: '#D84B45', pending: '#E9B949' }
export default function SharedPlanPanel({ drawingPath, modelPath, collab, onChange, onScreenshot }: {
  drawingPath: string; modelPath: string; collab: CollabState; onChange: (state: CollabState) => void
  onScreenshot: (dataUrl: string, name: string, note: string) => void
}) {
  const [path, setPath] = useState(drawingPath)
  const [plan, setPlan] = useState<PlanRoomsResult | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<PlanRoom | null>(null)
  const details = useRef<HTMLDivElement>(null)
  const isIfc = modelPath.toLowerCase().endsWith('.ifc')
  const polygonRooms = useMemo(() => plan?.rooms.filter(room => (room.polygon_px?.length || 0) >= 3) || [], [plan])
  async function refresh() {
    if (!path.trim()) { setPlan(null); return }
    try {
      const next = await getPlanRooms(path.trim())
      setPlan(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  useEffect(() => { setPath(drawingPath) }, [drawingPath])
  useEffect(() => {
    let active = true
    const run = async () => {
      if (!path.trim()) { setPlan(null); return }
      try { const next = await getPlanRooms(path.trim()); if (active) { setPlan(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); setError('') } }
      catch (cause) { if (active) setError(cause instanceof Error ? cause.message : String(cause)) }
    }
    void run(); const timer = window.setInterval(() => void run(), 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [path])
  function choose(room: PlanRoom, focusDetails = false) { setSelected(room); if (focusDetails) window.setTimeout(() => details.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) }
  const [width, height] = plan?.image_size || [0, 0]
  return <section className="project-section shared-plan-section">
    <div className="project-section-heading"><div><h2>Shared 2D plan</h2><p className="sub">Room status and team notes, synchronized from the project plan.</p></div></div>
    <div className="row project-model-picker"><input aria-label="Plan drawing path" value={path} onChange={event => setPath(event.target.value)} placeholder="data/swiss_dwellings/drawing.pdf" /><button onClick={() => void refresh()}>Load plan</button></div>
    {error && <p className="error">{error}</p>}
    {plan && <>
      {!plan.rooms.length && <p className="dim small">No room outlines for scanned plans</p>}
      {polygonRooms.length > 0 && <div className="shared-plan-canvas" style={{ aspectRatio: width && height ? `${width} / ${height}` : '4 / 3' }}>
        <img src={drawingUrl(path)} alt="Project floor plan" />
        <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Clickable room outlines">
          {polygonRooms.map((room, index) => {
            const points = room.polygon_px!.map(point => point.join(',')).join(' ')
            const [x, y] = room.bbox_px
            return <g key={room.space_id} className="shared-plan-room" onClick={() => choose(room)}>
              <polygon points={points} fill={statusColor[room.status || ''] || '#E9B949'} fillOpacity={selected?.space_id === room.space_id ? .42 : .2} stroke={statusColor[room.status || ''] || '#A9AFB0'} />
              <text x={x + 12} y={y + 24}>{room.number || room.name || index + 1}</text>
              {room.media_count ? <text className="plan-icon" x={x + 12} y={y + 48}>📷 {room.media_count}</text> : null}
              <text className="plan-icon" x={x + 64} y={y + 48} onClick={event => { event.stopPropagation(); choose(room, true) }}>ⓘ</text>
            </g>
          })}
        </svg>
      </div>}
    </>}
    {selected && <div className="room-plan-card" ref={details}>
      <div className="room-plan-card-heading"><div><span className="dim small">Room details</span><h3>{selected.name || selected.number || selected.space_id}</h3></div><button onClick={() => setSelected(null)} aria-label="Close room details">Close</button></div>
      {isIfc ? <div className="room-plan-card-preview"><IfcViewer path={modelPath} guids={[]} previewRoomGuid={selected.space_id} previewRoomStatus={selected.status} onSelectRoom={() => {}} onScreenshot={(dataUrl, name, note) => onScreenshot(dataUrl, name, note)} /></div>
        : selected.polygon_px ? <RoomPlanPreview polygon={selected.polygon_px} missingWall={selected.status === 'missing_wall'} /> : <p className="dim">Room outline unavailable.</p>}
      <div className="room-plan-details-grid">
        <section><h4>Room information</h4><dl><dt>Number</dt><dd>{selected.number || '—'}</dd><dt>Area</dt><dd>{selected.area_m2 == null ? '—' : `${selected.area_m2.toFixed(2)} m²`}</dd></dl>
          <label>Status <select value={selected.status || 'pending'} onChange={async event => { const status = event.target.value as RoomStatus; const updated = { ...selected, status }; setSelected(updated); setPlan(current => current ? { ...current, rooms: current.rooms.map(room => room.space_id === selected.space_id ? updated : room) } : current); try { onChange(await setRoomStatus(selected.space_id, status)) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }}><option value="built">Built</option><option value="missing_wall">Missing wall</option><option value="pending">Pending</option></select></label>
        </section>
        <RoomCollabPanel spaceId={selected.space_id} spaceName={selected.name || selected.number || selected.space_id} role="" collab={collab} onChange={onChange} onHighlightSpace={() => {}} />
        <RoomMediaPanel spaceId={selected.space_id} roomName={selected.name || selected.number || selected.space_id} />
      </div>
    </div>}
  </section>
}
