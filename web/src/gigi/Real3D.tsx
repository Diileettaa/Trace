// Gigi's 2.5D frame around the geometry scene exported by the engine.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Building2, Eye } from 'lucide-react';
import IsoSceneSvg from '../components/IsoSceneSvg';
import { isIllustrativeGeometryScene, isMeasuredGeometryScene, loadGeometryScene, type GeometryScene, type GeometrySource } from '../viewer3d/geometryScene';
import type { FixtureVerification, QueryScenario } from './adapters';

interface Props {
  mode: 'building' | 'room';
  scenario: QueryScenario | null;
  model: string | null;   // IFC path when the project has one
  plan: string | null;    // 2D sheet path
  page?: number;          // selected page when the source is a multi-page drawing
  fixture: FixtureVerification | null;
  siblingFixtures: FixtureVerification[];
  onSwitchMode: (mode: 'building' | 'room') => void;
  onSelectSibling: (id: string) => void;
  onBackTo2D: () => void;
  onAsk?: (question: string) => void;   // ours: ask about the room the user clicked
  onOpenSource?: (source: GeometrySource) => void;
  storeyId?: string | null;              // LEVEL switcher in Gigi's top bar
  /** A room selected from the 2D plan. It may be a plan number, not an IFC GUID. */
  focusRoomId?: string | null;
  onStoreys?: (list: { id: string; name: string; elevation: number }[]) => void;
  /** Keep the workspace LEVEL control in sync when Floor needs a real storey. */
  onSelectStorey?: (id: string) => void;
  visibleLayers?: Partial<Record<'architecture' | 'sanitary' | 'hvac' | 'electrical' | 'furniture', boolean>>;
}

const roomReference = (value: string) => value.trim().toLocaleLowerCase()
  .replace(/^room[-\s_]*/i, '').replace(/^rm[-\s_]*/i, '').replace(/\s+/g, '');
const resolveSceneRoom = (scene: GeometryScene, requested: string | null | undefined) => {
  if (!requested) return null;
  const key = roomReference(requested);
  const matches = scene.rooms.filter((room) => [room.id, room.number, room.name]
    .filter((value): value is string => !!value)
    .some((value) => roomReference(value) === key));
  return matches.length === 1 ? matches[0].id : null;
};
const fixtureDescription = (fixture: FixtureVerification) => {
  const category = fixture.category.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const room = fixture.roomName || fixture.roomCode;
  return [category || fixture.label, room].filter(Boolean).join(' · ');
};

export const Real3D: React.FC<Props> = ({
  mode, scenario, model, plan, fixture, siblingFixtures, onSwitchMode, onSelectSibling, onBackTo2D,
  page = 1, storeyId, onStoreys, onSelectStorey, visibleLayers, onOpenSource, focusRoomId,
}) => {
  const [pickedRoom, setPickedRoom] = useState<{ id: string; name: string } | null>(null);
  const [roomFocusDismissed, setRoomFocusDismissed] = useState(false);
  const [geometryScene, setGeometryScene] = useState<GeometryScene | null>(null);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const announcedGeometryStoreys = useRef<string>('');
  // Keep a room selected while changing from the building tab to its floor view.
  // Only a new answer/fixture should clear the local room focus.
  useEffect(() => { setPickedRoom(null); setRoomFocusDismissed(false); }, [fixture?.id, focusRoomId]);
  useEffect(() => {
    const source = model || plan;
    let active = true;
    setGeometryScene(null);
    setGeometryError(null);
    setGeometryLoading(!!source);
    if (!source) { setGeometryError('No IFC model or drawing source is selected.'); return () => { active = false; }; }
    void loadGeometryScene(source, page).then((result) => {
      if (!active) return;
      if (result.scene && (isMeasuredGeometryScene(result.scene) || isIllustrativeGeometryScene(result.scene))) setGeometryScene(result.scene);
      else setGeometryError(result.error ?? null);
      setGeometryLoading(false);
    });
    return () => { active = false; };
  }, [model, plan, page]);
  useEffect(() => {
    if (geometryScene?.storeys.length) {
      const signature = geometryScene.storeys.map((storey) => `${storey.id}:${storey.elevationM}`).join('|');
      if (signature !== announcedGeometryStoreys.current) {
        announcedGeometryStoreys.current = signature;
        onStoreys?.(geometryScene.storeys.map((storey) => ({ id: storey.id, name: storey.name, elevation: storey.elevationM })));
      }
    }
  }, [geometryScene, onStoreys]);
  const roomLabel = scenario?.roomCode || 'Room';
  // Gigi's strip shows the elements of one room: keep the selected element's room, at most 8 chips
  const strip = (() => {
    const same = fixture?.roomCode ? siblingFixtures.filter((f) => f.roomCode === fixture.roomCode) : [];
    const list = same.length > 1 ? same : siblingFixtures;
    const head = fixture ? [fixture, ...list.filter((f) => f.id !== fixture.id)] : list;
    return head.slice(0, 8);
  })();
  const more = Math.max(0, (fixture?.roomCode ? siblingFixtures.filter((f) => f.roomCode === fixture.roomCode).length : siblingFixtures.length) - strip.length);
  const requestedRoomId = roomFocusDismissed ? null : (focusRoomId || fixture?.spaceId || pickedRoom?.id || null);
  const resolvedFocusRoomId = geometryScene ? resolveSceneRoom(geometryScene, requestedRoomId) : null;
  const focusedStoreyId = resolvedFocusRoomId ? geometryScene?.rooms.find((room) => room.id === resolvedFocusRoomId)?.storeyId : null;
  // A Floor is one actual storey, never the overlapping collection behind
  // "Whole building".  Prefer the room's known storey; otherwise choose the
  // first usable storey (not an unmodelled roof) and reflect that choice in
  // the top-level LEVEL menu.
  const floorStoreyId = storeyId || focusedStoreyId || geometryScene?.storeys.find((storey) => (storey.heightM ?? 0) >= 2)?.id || geometryScene?.storeys[0]?.id || null;
  useEffect(() => {
    if (mode === 'room' && !storeyId && floorStoreyId) onSelectStorey?.(floorStoreyId);
  }, [floorStoreyId, mode, onSelectStorey, storeyId]);
  const roomFocusMissing = mode === 'room' && !!requestedRoomId && !resolvedFocusRoomId;
  const geometryIncomplete = geometryScene?.realism?.roomEdgeCoverageAfter !== undefined
    && geometryScene.realism.roomEdgeCoverageAfter < .95;

  return (
    <div className="bg-[#202427] text-[#F7F6F2] flex flex-col">
      {/* 2.5D Toolbar */}
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
              <span>2.5D Building</span>
            </button>
            <button type="button" onClick={() => onSwitchMode('room')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${mode === 'room' ? 'bg-[#E9B949] text-[#202427] font-semibold' : 'text-[#A9AFB0] hover:text-[#F7F6F2]'}`}>
              <Eye className="w-3 h-3" />
              <span>2.5D Floor</span>
            </button>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[#A9AFB0]">
          {geometryScene ? (isMeasuredGeometryScene(geometryScene) ? (roomFocusMissing ? 'Room geometry is unavailable for this plan label' : mode === 'room' ? `Measured 2.5D floor${floorStoreyId ? ' · selected level' : ''}${resolvedFocusRoomId ? ' · focused room' : ''}` : 'Measured 2.5D building · click a room to inspect') : '2.5D generated from the drawing · not to scale') : '2.5D geometry from the selected source'}
        </span>
        {geometryIncomplete && <span className="text-[11px] font-mono text-amber-300">Geometry incomplete</span>}
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
                    <span className="block">{sib.code} {isUnverified ? '· Issue' : sib.status === 'Not checked' ? '' : `· ${sib.status}`}</span>
                    <span className="block mt-0.5 text-[10px] font-sans font-normal opacity-80">{fixtureDescription(sib)}</span>
                  </button>
                );
              })}
              {more > 0 && <span className="text-[11px] font-mono text-[#A9AFB0]">+{more} more</span>}
            </div>
            <span className="text-[11px] font-mono text-[#A9AFB0]">{fixture?.roomCode || roomLabel}</span>
          </div>
        )}

        <div className="gigi-3d h-[430px] rounded-lg overflow-hidden bg-[#16191B] relative">
          {geometryLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-8">
              <span className="text-sm font-semibold text-[#E9B949]">Loading 2.5D geometry…</span>
              <span className="text-xs text-[#A9AFB0]">Reading rooms, walls, openings and source evidence.</span>
            </div>
          ) : geometryScene ? (
            <IsoSceneSvg scene={geometryScene} onSelectObject={onSelectSibling}
              onSelectRoom={(room) => { setRoomFocusDismissed(false); setPickedRoom(room); onSwitchMode('room'); }}
              onSelectSource={onOpenSource}
              onBackToFloor={() => { setRoomFocusDismissed(true); setPickedRoom(null); }}
              storeyId={mode === 'building' ? null : floorStoreyId} visibleLayers={visibleLayers}
              focusRoomId={mode === 'room' ? resolvedFocusRoomId : null} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-8">
              <span className="text-sm font-semibold text-[#E9B949]">2.5D scene unavailable</span>
              <span className="text-xs text-[#A9AFB0] max-w-md">
                {geometryError || 'The selected source has no exported rooms, walls, openings or objects yet.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
