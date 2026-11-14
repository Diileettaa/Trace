import IfcViewer from '../IfcViewer'
import type { QueryScenario } from './adapters'

export function Detailed3DViewer({ path, scenario, mode, onBack, onMode }: { path: string; scenario: QueryScenario | null; mode: 'building' | 'room'; onBack: () => void; onMode: (mode: 'building' | 'room') => void }) {
  return <div className="gigi-3d-stage blueprint-grid-dark"><div className="gigi-3d-toolbar"><button onClick={onBack}>← Back to 2D</button><button className={mode === 'building' ? 'active' : ''} onClick={() => onMode('building')}>Building</button><button className={mode === 'room' ? 'active' : ''} onClick={() => onMode('room')}>Room</button><span>Schematic fallback available</span></div><IfcViewer path={path} guids={scenario?.targetIds || []} selectedGuid={mode === 'room' ? scenario?.targetIds[0] : null} /></div>
}
