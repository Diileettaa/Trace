export interface RoomMetricFixture {
  id: string
  code: string
  category?: string
  clearance?: { left?: number; right?: number; front?: number; rear?: number }
}

interface Props {
  room: { name: string; number?: string; width: number; depth: number; height: number; area?: number }
  fixtures: RoomMetricFixture[]
  derived?: boolean
}

const iconFor = (category = '', code = '') => {
  const value = `${category} ${code}`.toLowerCase()
  if (/toilet|wc/.test(value)) return 'WC'
  if (/sink|basin|wash/.test(value)) return '▱'
  if (/shower/.test(value)) return '⌁'
  if (/bath/.test(value)) return '▭'
  return '◆'
}

export function RoomMetricsCard({ room, fixtures, derived = false }: Props) {
  const area = room.area ?? room.width * room.depth
  return <aside className="room-metrics-card" aria-label="Measured room schematic">
    <header><span>{derived ? 'DERIVED FROM DRAWING' : 'BIM MEASURED'}</span><strong>{room.name}{room.number ? ` · ${room.number}` : ''}</strong></header>
    <div className="metric-grid">
      <span>L <b>{room.width.toFixed(2)} m</b></span><span>W <b>{room.depth.toFixed(2)} m</b></span>
      <span>H <b>{room.height.toFixed(2)} m</b></span><span>Area <b>{area.toFixed(2)} m²</b></span>
    </div>
    <div className="metric-scale" aria-label="One metre scale"><i /><span>1 m</span></div>
    {fixtures.length > 0 && <ul className="metric-fixtures">{fixtures.slice(0, 6).map(fixture => {
      const values = Object.values(fixture.clearance ?? {}).filter((value): value is number => typeof value === 'number')
      return <li key={fixture.id}><em>{iconFor(fixture.category, fixture.code)}</em><span>{fixture.code}</span>{values.length > 0 && <small>≈ {Math.min(...values)} mm clearance</small>}</li>
    })}</ul>}
  </aside>
}
