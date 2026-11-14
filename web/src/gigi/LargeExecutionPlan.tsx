import { useState, type CSSProperties } from 'react'
import { api, layerOf, type FixtureVerification, type LayerId, type QueryScenario } from './adapters'

const ZOOM: Record<string, number> = { '1:200': 1, '1:100': 2, '1:50': 4, '1:20': 8 }

export function LargeExecutionPlan({ path, scenario, fixtures, scale, layers, onVerify }: { path: string; scenario: QueryScenario | null; fixtures: Record<string, FixtureVerification>; scale: string; layers: Record<LayerId, boolean>; onVerify: (fixture: FixtureVerification) => void }) {
  const [imageSize, setImageSize] = useState<[number, number] | null>(null)
  const [hovered, setHovered] = useState<FixtureVerification | null>(null)
  const visible = Object.values(fixtures).filter(f => layers[layerOf(f.category)] && f.position)
  return <div className="gigi-plan-scroll blueprint-grid-bg"><div className="gigi-plan-canvas" style={{ '--gigi-plan-zoom': ZOOM[scale] } as CSSProperties}>
    <img src={api.drawingUrl(path)} alt="Floor plan" onLoad={e => setImageSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
    {imageSize && <svg className="gigi-plan-overlay" viewBox={`0 0 ${imageSize[0]} ${imageSize[1]}`}><>{scenario?.roomPolygon && <polygon className="gigi-room-highlight" points={scenario.roomPolygon.map(p => p.join(',')).join(' ')} />}{visible.map((f, i) => <g key={f.id} className={`gigi-evidence-box ${f.status === 'Issue Reported' ? 'issue' : ''}`} onMouseEnter={() => setHovered(f)} onMouseLeave={() => setHovered(null)} onClick={() => onVerify(f)}><rect x={f.position!.x} y={f.position!.y} width={f.position!.w} height={f.position!.h} /><text x={f.position!.x} y={f.position!.y - 6}>{String(i + 1).padStart(2, '0')}</text></g>)}</></svg>}
  </div><small className="gigi-plan-caption">{visible.length ? `${visible.length} evidence boxes shown` : 'Ask a question to show drawing evidence'}</small>{hovered && <button className="gigi-fixture-hover" onClick={() => onVerify(hovered)}><b>{hovered.label}</b><span>{hovered.verified ? hovered.status : 'Unverified · no site photo yet'}</span></button>}</div>
}
