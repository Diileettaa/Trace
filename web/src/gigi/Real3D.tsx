// Gigi's 3D frame around our real IFC or drawing-derived 2.5D scene.
// around our real 3D: the IFC model (IfcViewer) or, for 2D vector plans, rooms extruded from /api/plan/rooms.
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Eye } from 'lucide-react';
import IfcViewer from '../IfcViewer';
import PlanRooms3D from '../components/PlanRooms3D';
import GeometrySceneViewer from '../components/GeometrySceneViewer';
import { isMeasuredGeometryScene, loadGeometryScene, type GeometryScene } from '../viewer3d/geometryScene';
import type { FixtureVerification, QueryScenario } from './adapters';

interface Props {
  mode: 'building' | 'room';
  scenario: QueryScenario | null;
  model: string | null;   // IFC path when the project has one
  plan: string | null;    // 2D sheet path
  fixture: FixtureVerification | null;
  siblingFixtures: FixtureVerification[];
  onSwitchMode: (mode: 'building' | 'room') => void;
  onSelectSibling: (id: string) => void;
  onBackTo2D: () => void;
  onAsk?: (question: string) => void;   // ours: ask about the room the user clicked
  storeyId?: string | null;              // LEVEL switcher in Gigi's top bar
  onStoreys?: (list: { id: string; name: string; elevation: number }[]) => void;
  visibleLayers?: Partial<Record<'architecture' | 'sanitary' | 'hvac' | 'electrical', boolean>>;
}

const isGuid = (id: string) => /^[0-9A-Za-z_$]{22}$/.test(id);

export const Real3D: React.FC<Props> = ({
  mode, scenario, model, plan, fixture, siblingFixtures, onSwitchMode, onSelectSibling, onBackTo2D,
  storeyId, onStoreys, visibleLayers,
}) => {
  const [pickedRoom, setPickedRoom] = useState<{ id: string; name: string } | null>(null);
  const [geometryScene, setGeometryScene] = useState<GeometryScene | null>(null);
  useEffect(() => { setPickedRoom(null); }, [fixture?.id, mode]);
  useEffect(() => {
    const source = model || plan;
    let active = true;
    setGeometryScene(null);
    if (!source) return () => { active = false; };
    void loadGeometryScene(source).then((next) => { if (active && next && isMeasuredGeometryScene(next)) setGeometryScene(next); });
    return () => { active = false; };
  }, [model, plan]);
  const guids = (scenario?.targetIds || []).filter(isGuid);
  const selectedGuid = mode === 'room' && fixture && isGuid(fixture.id) ? fixture.id : null;
  const roomLabel = scenario?.roomCode || 'Room';
  // Gigi's strip shows the elements of one room: keep the selected element's room, at most 8 chips
  const strip = (() => {
    const same = fixture?.roomCode ? siblingFixtures.filter((f) => f.roomCode === fixture.roomCode) : [];
    const list = same.length > 1 ? same : siblingFixtures;
    const head = fixture ? [fixture, ...list.filter((f) => f.id !== fixture.id)] : list;
    return head.slice(0, 8);
  })();
  const more = Math.max(0, (fixture?.roomCode ? siblingFixtures.filter((f) => f.roomCode === fixture.roomCode).length : siblingFixtures.length) - strip.length);

  return (
    <div className="bg-[#202427] text-[#F7F6F2] flex flex-col">
      {/* 3D Toolbar */}
      <div className="px-4 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBackTo2D}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-xs font-medium text-[#F7F6F2] transition-colors cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5 text-[#E9B949]" />
            <span>2D Plan</span>
          </button>
          <div className="inline-flex items-center p-0.5 rounded-md bg-white/10">
            <button type="button" onClick={() => onSwitchMode('building')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${mode === 'building' ? 'bg-[#E9B949] text-[#202427] font-semibold' : 'text-[#A9AFB0] hover:text-[#F7F6F2]'}`}>
              <Building2 className="w-3 h-3" />
              <span>3D Building</span>
            </button>
            <button type="button" onClick={() => onSwitchMode('room')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${mode === 'room' ? 'bg-[#E9B949] text-[#202427] font-semibold' : 'text-[#A9AFB0] hover:text-[#F7F6F2]'}`}>
              <Eye className="w-3 h-3" />
              <span>3D Floor</span>
            </button>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[#A9AFB0]">
          {model ? 'BIM geometry · choose a floor or room from the explorer' : plan ? '3D generated from the drawing · assumed wall height 2.7 m' : ''}
        </span>
      </div>

      <div className="p-4 blueprint-grid-dark flex flex-col">
        {/* Fixture Selector Strip */}
        {mode === 'room' && strip.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {strip.map((sib) => {
                const isUnverified = sib.status === 'Issue Reported';
                const isSelected = sib.id === fixture?.id;
                return (
                  <button key={sib.id} type="button" onClick={() => onSelectSibling(sib.id)}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer border ${isSelected
                      ? isUnverified ? 'bg-red-600 text-white border-red-400 font-semibold' : 'bg-[#E9B949] text-[#202427] border-[#E9B949] font-semibold'
                      : isUnverified ? 'bg-red-950/60 text-red-300 border-red-500/60' : 'bg-white/5 text-[#A9AFB0] border-white/15 hover:text-[#F7F6F2]'}`}>
                    {sib.code} {isUnverified ? '· Issue' : sib.status === 'Not checked' ? '' : `· ${sib.status}`}
                  </button>
                );
              })}
              {more > 0 && <span className="text-[11px] font-mono text-[#A9AFB0]">+{more} more</span>}
            </div>
            <span className="text-[11px] font-mono text-[#A9AFB0]">{fixture?.roomCode || roomLabel}</span>
          </div>
        )}

        <div className="gigi-3d h-[430px] rounded-lg overflow-hidden bg-[#16191B] relative">
          {geometryScene ? (
            <GeometrySceneViewer scene={geometryScene} onSelectObject={onSelectSibling} />
          ) : model ? (
            <IfcViewer path={model} guids={guids} selectedGuid={selectedGuid} onSelectGuid={(g) => onSelectSibling(g)}
              onSelectRoom={setPickedRoom}
              isolateSpaceGuid={mode === 'room' ? (fixture?.spaceId && isGuid(fixture.spaceId) ? fixture.spaceId : (pickedRoom && isGuid(pickedRoom.id) ? pickedRoom.id : null)) : null}
              elementTags={mode !== 'room' ? [] : strip.filter((f) => isGuid(f.id)).map((f) => ({ guid: f.id, code: f.code, category: f.category, verified: f.verified, issue: f.status === 'Issue Reported' }))}
              roomDims={mode === 'room' && scenario?.roomDimsM ? { L: scenario.roomDimsM.L, B: scenario.roomDimsM.B, H: scenario.roomDimsM.H ?? undefined } : undefined}
              hideRoomLabels={false}
              storeyId={mode === 'building' ? storeyId ?? null : null} onStoreys={onStoreys} visibleLayers={visibleLayers} />
          ) : plan && /swiss_dwellings|\.dxf$/i.test(plan) ? (
            <PlanRooms3D path={plan} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-8">
              <span className="text-sm font-semibold text-[#E9B949]">No 3D for this drawing</span>
              <span className="text-xs text-[#A9AFB0] max-w-md">
                3D needs a BIM model (IFC) or a vector plan with room outlines. This sheet is a scan or image, so
                Trace shows the evidence on the 2D drawing instead.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
