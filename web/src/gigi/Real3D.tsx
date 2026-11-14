// Gigi's Detailed3DViewer frame (dark toolbar, Whole Building | Interior, fixture strip, clearance cards)
// around our real 3D: the IFC model (IfcViewer) or, for 2D vector plans, rooms extruded from /api/plan/rooms.
import React, { useState } from 'react';
import { ArrowLeft, Building2, Eye, Info, MessageSquare, Minus } from 'lucide-react';
import { roomEnglish } from '../roomNames';
import IfcViewer from '../IfcViewer';
import PlanRooms3D from '../components/PlanRooms3D';
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
}

const isGuid = (id: string) => /^[0-9A-Za-z_$]{22}$/.test(id);

const ROWS: { key: string; label: string; accent?: boolean }[] = [
  { key: 'leftWall', label: 'Left Clearance', accent: true },
  { key: 'rightWall', label: 'Right Clearance' },
  { key: 'frontClearance', label: 'Front / Door' },
  { key: 'rearRoughIn', label: 'Rear Wall' },
  { key: 'seatHeight', label: 'Elevation / Spec', accent: true },
];

export const Real3D: React.FC<Props> = ({
  mode, scenario, model, plan, fixture, siblingFixtures, onSwitchMode, onSelectSibling, onBackTo2D, onAsk,
}) => {
  const [pickedRoom, setPickedRoom] = useState<{ id: string; name: string } | null>(null);
  const [roomCardOpen, setRoomCardOpen] = useState(true);
  const guids = (scenario?.targetIds || []).filter(isGuid);
  const selectedGuid = mode === 'room' && fixture && isGuid(fixture.id) ? fixture.id : null;
  const roomLabel = scenario?.roomCode || 'Room';
  const dims = fixture?.dimensions3D || {};
  const rows = ROWS.filter((r) => dims[r.key]);
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
              <span>Whole Building 3D</span>
            </button>
            <button type="button" onClick={() => onSwitchMode('room')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${mode === 'room' ? 'bg-[#E9B949] text-[#202427] font-semibold' : 'text-[#A9AFB0] hover:text-[#F7F6F2]'}`}>
              <Eye className="w-3 h-3" />
              <span>{(fixture?.roomCode || (roomLabel !== 'Whole sheet' ? roomLabel : 'Room'))} Interior 3D</span>
            </button>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[#A9AFB0]">
          {model ? 'BIM model · real geometry' : plan ? 'Rooms extruded from the vector plan (2.7 m)' : ''}
        </span>
      </div>

      <div className="p-4 blueprint-grid-dark flex flex-col">
        {/* Fixture Selector Strip */}
        {mode === 'room' && strip.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {strip.map((sib) => {
                const isUnverified = !sib.verified;
                const isSelected = sib.id === fixture?.id;
                return (
                  <button key={sib.id} type="button" onClick={() => onSelectSibling(sib.id)}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer border ${isSelected
                      ? isUnverified ? 'bg-red-600 text-white border-red-400 font-semibold' : 'bg-[#E9B949] text-[#202427] border-[#E9B949] font-semibold'
                      : isUnverified ? 'bg-red-950/60 text-red-300 border-red-500/60' : 'bg-white/5 text-[#A9AFB0] border-white/15 hover:text-[#F7F6F2]'}`}>
                    {sib.code} {isUnverified ? '· Unverified' : ''}
                  </button>
                );
              })}
              {more > 0 && <span className="text-[11px] font-mono text-[#A9AFB0]">+{more} more</span>}
            </div>
            <span className="text-[11px] font-mono text-[#A9AFB0]">{fixture?.roomCode || roomLabel}</span>
          </div>
        )}

        <div className="gigi-3d h-[430px] rounded-lg overflow-hidden bg-[#16191B] relative">
          {model ? (
            <IfcViewer path={model} guids={guids} selectedGuid={selectedGuid} onSelectGuid={(g) => onSelectSibling(g)}
              onSelectRoom={(r) => { setPickedRoom(r); if (r) setRoomCardOpen(true); }}
              isolateSpaceGuid={mode === 'room' ? (fixture?.spaceId && isGuid(fixture.spaceId) ? fixture.spaceId : (pickedRoom && isGuid(pickedRoom.id) ? pickedRoom.id : null)) : null}
              elementTags={siblingFixtures.filter((f) => isGuid(f.id)).slice(0, 60).map((f) => ({ guid: f.id, code: f.code, verified: f.verified, issue: f.status === 'Issue Reported' }))}
              clearances={mode === 'room' && fixture && isGuid(fixture.id) && fixture.clearanceMm ? { guid: fixture.id, ...fixture.clearanceMm } : undefined}
              roomDims={mode === 'room' && scenario?.roomDimsM ? { L: scenario.roomDimsM.L, B: scenario.roomDimsM.B, H: scenario.roomDimsM.H ?? undefined } : undefined}
              hideRoomLabels={mode === 'room'} />
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
          {/* ours, in Gigi's style: the room the user clicked; collapses to a small chip in the corner */}
          {model && pickedRoom && (roomCardOpen ? (
            <div className="absolute top-3 left-3 z-10 w-64 rounded-xl bg-[#202427]/95 text-[#F7F6F2] border border-[#E9B949]/60 shadow-xl">
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-[#E9B949]">Room</div>
                  <div className="text-sm font-semibold truncate">{roomEnglish(pickedRoom.name)}</div>
                </div>
                <button type="button" onClick={() => setRoomCardOpen(false)} aria-label="Minimise room card" title="Minimise"
                  className="p-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] hover:bg-white/10 cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {onAsk && (
                  <button type="button" onClick={() => onAsk(`What is in the ${roomEnglish(pickedRoom.name)}?`)}
                    className="w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#E9B949] text-[#202427] text-[11px] font-semibold cursor-pointer">
                    <MessageSquare className="w-3 h-3" /><span>What is in this room?</span>
                  </button>
                )}
                <div className="text-[10px] text-[#A9AFB0] leading-snug">Click another room in the model to switch. Drag to orbit, scroll to zoom.</div>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setRoomCardOpen(true)} title={roomEnglish(pickedRoom.name)} aria-label="Open room card"
              className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#202427]/90 border border-[#E9B949]/60 text-[#E9B949] text-[11px] font-semibold cursor-pointer">
              <Info className="w-3.5 h-3.5" /><span className="max-w-[120px] truncate">{roomEnglish(pickedRoom.name)}</span>
            </button>
          ))}
        </div>

        {/* Exact Distance Breakdown for Selected Fixture */}
        {mode === 'room' && fixture && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-white/10">
            {rows.length ? rows.slice(0, 4).map((r) => (
              <div key={r.key} className="bg-[#171A1C] px-3 py-2 rounded-lg border border-white/10">
                <div className="text-[10px] text-[#A9AFB0]">{r.label}</div>
                <div className={`text-xs font-mono font-semibold mt-0.5 ${r.accent ? (fixture.verified ? 'text-[#E9B949]' : 'text-red-400') : 'text-[#F7F6F2]'}`}>
                  {dims[r.key]}
                </div>
              </div>
            )) : (
              <div className="col-span-2 sm:col-span-4 bg-[#171A1C] px-3 py-2 rounded-lg border border-white/10 text-xs text-[#A9AFB0]">
                {dims.note || 'Measuring clearances…'}
              </div>
            )}
            {rows.length > 0 && dims.note && (
              <div className="col-span-2 sm:col-span-4 text-[10px] font-mono text-[#A9AFB0]">{dims.note}</div>
            )}
            <div className="col-span-2 sm:col-span-4 text-[11px] text-[#A9AFB0]">
              <span className="font-mono text-[#F7F6F2]">{fixture.code}</span> · {fixture.label} · {fixture.manufacturer} · {fixture.modelSpec}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
