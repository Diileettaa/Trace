import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock } from 'lucide-react';
import {
  FixtureVerification,
  LayerId,
  QueryScenario,
  ScaleOption,
} from '../data/workspaceData';

interface LargeExecutionPlanProps {
  scenario: QueryScenario;
  activeLayers: Record<LayerId, boolean>;
  scale: ScaleOption;
  activeFloor?: string;
  fixtures: Record<string, FixtureVerification>;
  selectedFixtureId: string | null;
  onSelectFixtureFor3D: (fixtureId: string) => void;
}

export const LargeExecutionPlan: React.FC<LargeExecutionPlanProps> = ({
  scenario,
  activeLayers,
  scale,
  activeFloor = 'LEVEL 02',
  fixtures,
  selectedFixtureId,
  onSelectFixtureFor3D,
}) => {
  const [hoveredFixtureId, setHoveredFixtureId] = useState<string | null>(null);
  const [dwellReadyId, setDwellReadyId] = useState<string | null>(null);
  const dwellTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
    };
  }, []);

  const handleMouseEnterFixture = (id: string) => {
    setHoveredFixtureId(id);
    if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = window.setTimeout(() => {
      setDwellReadyId(id);
    }, 850);
  };

  const handleMouseLeaveFixture = () => {
    setHoveredFixtureId(null);
    setDwellReadyId(null);
    if (dwellTimerRef.current) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };

  // True Level-of-Detail (LoD) flags driven by architectural Scale (Maßstab)
  const isOverview200 = scale === '1:200';
  const isDesign100 = scale === '1:100';
  const isExecution50 = scale === '1:50' || scale === '1:20';
  const isDetail20 = scale === '1:20';

  const getViewBoxForScale = (): string => {
    if (scale === '1:200') return '0 0 1200 720';
    if (scale === '1:100') {
      if (scenario.id === 'wc-count') return '280 15 840 504';
      if (scenario.id === 'fire-doors') return '40 190 840 504';
      return '110 130 920 552';
    }
    if (scale === '1:50') {
      if (scenario.id === 'wc-count') return '560 46 420 260';
      if (scenario.id === 'fire-doors') return '90 310 460 280';
      return '340 210 540 325';
    }
    // 1:20 Ultra-Fine Construction Detail
    if (scenario.id === 'wc-count') return '636 88 232 146';
    if (scenario.id === 'fire-doors') return '270 325 220 140';
    return '430 275 260 165';
  };

  const dwellFixture = dwellReadyId ? fixtures[dwellReadyId] : null;
  const targetFixtures = scenario.targetIds
    .map((id) => fixtures[id])
    .filter(Boolean);

  return (
    <div className="relative w-full bg-[#FCFCF9] select-none overflow-hidden flex flex-col">
      <svg
        viewBox={getViewBoxForScale()}
        className="w-full h-auto max-h-[395px] xl:max-h-[455px] transition-all duration-300"
        role="img"
        aria-label={`Level 02 execution drawing at scale ${scale}`}
      >
        <defs>
          <pattern
            id="execConcrete"
            width="8"
            height="8"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#202427" strokeWidth="0.75" strokeOpacity="0.4" />
          </pattern>
          <pattern
            id="execMasonry"
            width="6"
            height="6"
            patternTransform="rotate(-45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#202427" strokeWidth="0.65" strokeOpacity="0.3" />
          </pattern>
          <pattern id="execInsulation" width="10" height="7" patternUnits="userSpaceOnUse">
            <path d="M 0 3.5 Q 2.5 0, 5 3.5 T 10 3.5" fill="none" stroke="#5A6065" strokeWidth="0.65" strokeOpacity="0.55" />
          </pattern>
          <pattern id="execTileGrid" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="none" stroke="#A9AFB0" strokeWidth="0.35" strokeOpacity="0.45" />
          </pattern>
        </defs>

        {/* Sheet Background & Frame */}
        <rect x="0" y="0" width="1200" height="720" fill="#FCFCF9" />
        <rect x="10" y="10" width="1180" height="700" fill="none" stroke="#202427" strokeWidth="1.2" />

        {/* DIMENSION CHAINS & AXES (LoD scales with 1:200 -> 1:20) */}
        {activeLayers.dimensions && (
          <g fontFamily="IBM Plex Mono, monospace" fontSize="6.5" fill="#202427">
            {[
              { x: 112, l: 'A' },
              { x: 268, l: 'B' },
              { x: 438, l: 'C' },
              { x: 646, l: 'D' },
              { x: 866, l: 'E' },
              { x: 1085, l: 'F' },
            ].map((ax) => (
              <g key={ax.l}>
                <line x1={ax.x} y1={38} x2={ax.x} y2={668} stroke="#8B9296" strokeWidth="0.45" strokeDasharray="12 3 2 3" />
                <circle cx={ax.x} cy={30} r={8.5} fill="#FCFCF9" stroke="#202427" strokeWidth="0.75" />
                <text x={ax.x} y={33} textAnchor="middle" fontWeight="600">{ax.l}</text>
              </g>
            ))}
            {[
              { y: 92, l: '1' },
              { y: 296, l: '2' },
              { y: 368, l: '3' },
              { y: 616, l: '4' },
            ].map((ax) => (
              <g key={ax.l}>
                <line x1={42} y1={ax.y} x2={1145} y2={ax.y} stroke="#8B9296" strokeWidth="0.45" strokeDasharray="12 3 2 3" />
                <circle cx={32} cy={ax.y} r={8.5} fill="#FCFCF9" stroke="#202427" strokeWidth="0.75" />
                <text x={32} y={ax.y + 3} textAnchor="middle" fontWeight="600">{ax.l}</text>
              </g>
            ))}

            {/* 1:200 shows overall dimension only; 1:100+ adds axis & opening chains */}
            <line x1="100" y1="48" x2="1095" y2="48" stroke="#202427" strokeWidth="0.5" />
            <text x="598" y="45" textAnchor="middle">38.400</text>
            <line x1="56" y1="92" x2="56" y2="616" stroke="#202427" strokeWidth="0.5" />
            <text x="52" y="355" textAnchor="middle" transform="rotate(-90 52 355)">21.600</text>

            {!isOverview200 && (
              <>
                <line x1="112" y1="60" x2="1085" y2="60" stroke="#202427" strokeWidth="0.5" />
                <text x="190" y="57.5" textAnchor="middle">5.800</text>
                <text x="353" y="57.5" textAnchor="middle">6.400</text>
                <text x="542" y="57.5" textAnchor="middle">7.800</text>
                <text x="756" y="57.5" textAnchor="middle">6.400</text>
                <text x="975" y="57.5" textAnchor="middle">8.200</text>
              </>
            )}

            {isExecution50 && (
              <>
                <line x1="100" y1="72" x2="1095" y2="72" stroke="#202427" strokeWidth="0.45" />
                <text x="155" y="69.5" textAnchor="middle">2.40</text>
                <text x="235" y="69.5" textAnchor="middle">1.80</text>
                <text x="340" y="69.5" textAnchor="middle">2.80</text>
                <text x="520" y="69.5" textAnchor="middle">2.40</text>
                <text x="710" y="69.5" textAnchor="middle">2.10</text>
                <text x="805" y="69.5" textAnchor="middle">1.80</text>
                <text x="960" y="69.5" textAnchor="middle">3.20</text>
              </>
            )}
          </g>
        )}

        {/* ARCHITECTURE LAYER (Adapts Wall Poché / Hatches / Detail to Scale) */}
        {activeLayers.architecture && (
          <g>
            {/* Outer Envelope: Solid dark poché at 1:200, Hatched Concrete + Insulation at 1:50/1:20 */}
            {isExecution50 && (
              <>
                <rect x="94" y="82" width="1004" height="544" fill="none" stroke="#202427" strokeWidth="0.6" />
                <rect x="94" y="82" width="1004" height="10" fill="url(#execInsulation)" />
                <rect x="94" y="616" width="1004" height="10" fill="url(#execInsulation)" />
                <rect x="94" y="92" width="10" height="524" fill="url(#execInsulation)" />
                <rect x="1088" y="92" width="10" height="524" fill="url(#execInsulation)" />
              </>
            )}

            <rect
              x="104"
              y="92"
              width="984"
              height="14"
              fill={isOverview200 ? '#202427' : 'url(#execConcrete)'}
              stroke="#202427"
              strokeWidth="1.2"
            />
            <rect
              x="104"
              y="602"
              width="984"
              height="14"
              fill={isOverview200 ? '#202427' : 'url(#execConcrete)'}
              stroke="#202427"
              strokeWidth="1.2"
            />
            <rect
              x="104"
              y="106"
              width="14"
              height="496"
              fill={isOverview200 ? '#202427' : 'url(#execConcrete)'}
              stroke="#202427"
              strokeWidth="1.2"
            />
            <rect
              x="1074"
              y="106"
              width="14"
              height="496"
              fill={isOverview200 ? '#202427' : 'url(#execConcrete)'}
              stroke="#202427"
              strokeWidth="1.2"
            />

            {/* Interior Walls */}
            <g fill={isOverview200 ? '#3A4044' : 'url(#execMasonry)'} stroke="#202427" strokeWidth="0.85">
              <rect x="264" y="106" width="8" height="190" />
              <rect x="434" y="106" width="8" height="190" />
              <rect x="642" y="106" width="10" height="190" fill={isOverview200 ? '#202427' : 'url(#execConcrete)'} />
              <rect x="862" y="106" width="10" height="190" fill={isOverview200 ? '#202427' : 'url(#execConcrete)'} />
              <rect x="442" y="196" width="200" height="7" />
              <rect x="540" y="106" width="7" height="90" />
              <rect x="118" y="289" width="956" height="8" />
              <rect x="118" y="367" width="956" height="8" />
              <rect x="434" y="375" width="9" height="227" />
              <rect x="560" y="375" width="7" height="125" />
              <rect x="560" y="500" width="150" height="7" />
              <rect x="642" y="375" width="7" height="125" />
              <rect x="710" y="375" width="10" height="227" fill={isOverview200 ? '#202427' : 'url(#execConcrete)'} />
              <rect x="886" y="375" width="8" height="227" />
              <rect x="894" y="485" width="180" height="7" />
            </g>

            {/* Stairwells */}
            <rect x="118" y="106" width="146" height="183" fill="#F4F2EC" stroke="#202427" strokeWidth="1.0" />
            <rect x="720" y="375" width="166" height="227" fill="#F4F2EC" stroke="#202427" strokeWidth="1.0" />
            {!isOverview200 &&
              Array.from({ length: 12 }).map((_, i) => (
                <g key={`st-${i}`}>
                  <line x1={130 + i * 9} y1={120} x2={130 + i * 9} y2={182} stroke="#202427" strokeWidth="0.6" />
                  <line x1={130 + i * 9} y1={206} x2={130 + i * 9} y2={268} stroke="#202427" strokeWidth="0.6" />
                  <line x1={735 + i * 10} y1={495} x2={735 + i * 10} y2={580} stroke="#202427" strokeWidth="0.6" />
                </g>
              ))}

            {/* WC Core Tiling & Stalls */}
            {isExecution50 && (
              <rect x="652" y="106" width="210" height="183" fill="url(#execTileGrid)" />
            )}
            <rect x="652" y="106" width="120" height="14" fill="url(#execMasonry)" stroke="#202427" strokeWidth="0.85" />
            <rect x="772" y="106" width="8" height="132" fill="url(#execMasonry)" stroke="#202427" strokeWidth="0.85" />
            <line x1="716" y1="120" x2="716" y2="195" stroke="#202427" strokeWidth="1.2" />
            <line x1="652" y1="195" x2="772" y2="195" stroke="#202427" strokeWidth="0.9" strokeDasharray="3 2" />

            {/* 1:20 ULTRA-FINE WALL LAYER & STUD DETAIL */}
            {isDetail20 && (
              <g fontFamily="IBM Plex Mono, monospace" fontSize="3.8" fill="#202427">
                <line x1="652" y1="110" x2="772" y2="110" stroke="#202427" strokeWidth="0.35" strokeDasharray="2 1" />
                <line x1="652" y1="116" x2="772" y2="116" stroke="#1E5F8A" strokeWidth="0.4" />
                <text x="656" y="114.5" fill="#202427" fontWeight="600">
                  VORWAND 180mm: 2×12.5mm GKBI + GEBERIT DUOFIX + FEINSTEINZEUG
                </text>
                <text x="680" y="176" fill="#202427">
                  ANSCHLUSS DN 100 / TW DN 20 · ACHSABSTAND 180mm
                </text>
                <text x="784" y="122" fill="#9A6500" fontWeight="600">
                  STÜTZKLAPPGRIFFE H=850mm
                </text>
              </g>
            )}

            {/* Doors & Swings (Hidden at 1:200 overview, visible at 1:100+, tagged at 1:50+) */}
            {!isOverview200 &&
              [
                { x: 200, y: 289, w: 34, dir: 'up', tag: 'T-2.01' },
                { x: 330, y: 289, w: 32, dir: 'up', tag: 'T-2.02' },
                { x: 485, y: 289, w: 32, dir: 'up', tag: 'T-2.03' },
                { x: 668, y: 289, w: 32, dir: 'up', tag: 'T-2.08a' },
                { x: 805, y: 289, w: 36, dir: 'up', tag: 'T-2.08b' },
                { x: 940, y: 289, w: 34, dir: 'up', tag: 'T-2.09' },
                { x: 364, y: 367, w: 34, dir: 'down', tag: 'T-2.04 · T30-RS' },
                { x: 472, y: 367, w: 30, dir: 'down', tag: 'T-2.05' },
                { x: 584, y: 367, w: 30, dir: 'down', tag: 'T-2.06' },
                { x: 945, y: 367, w: 32, dir: 'down', tag: 'T-2.10' },
              ].map((d) => (
                <g key={d.tag}>
                  <rect x={d.x} y={d.y - 1} width={d.w} height={10} fill="#FCFCF9" />
                  {d.dir === 'up' ? (
                    <>
                      <line x1={d.x} y1={d.y} x2={d.x} y2={d.y - d.w} stroke="#202427" strokeWidth="0.95" />
                      <path d={`M ${d.x} ${d.y - d.w} A ${d.w} ${d.w} 0 0 1 ${d.x + d.w} ${d.y}`} fill="none" stroke="#202427" strokeWidth="0.55" />
                    </>
                  ) : (
                    <>
                      <line x1={d.x} y1={d.y + 8} x2={d.x} y2={d.y + 8 + d.w} stroke="#202427" strokeWidth="0.95" />
                      <path d={`M ${d.x} ${d.y + 8 + d.w} A ${d.w} ${d.w} 0 0 0 ${d.x + d.w} ${d.y + 8}`} fill="none" stroke="#202427" strokeWidth="0.55" />
                    </>
                  )}
                  {isExecution50 && (
                    <text x={d.x + 2} y={d.dir === 'up' ? d.y - 8 : d.y + 20} fontSize="5.2" fontFamily="IBM Plex Mono, monospace" fill="#202427">
                      {d.tag}
                    </text>
                  )}
                </g>
              ))}

            {/* Furniture (1:100+) */}
            {!isOverview200 && (
              <g fill="none" stroke="#202427" strokeWidth="0.65">
                <rect x="296" y="148" width="110" height="52" rx="6" />
                {[160, 210, 260].map((dy) => (
                  <g key={`desk-${dy}`}>
                    <rect x="155" y={398 + (dy - 160) * 1.15} width="112" height="32" />
                    <rect x="290" y={398 + (dy - 160) * 1.15} width="112" height="32" />
                  </g>
                ))}
                <rect x="910" y="395" width="150" height="24" />
                <rect x="935" y="510" width="105" height="62" rx="4" />
              </g>
            )}

            {/* Room Stamps: Minimal Room Code only at 1:200; Full Stamp at 1:100+ */}
            {[
              { x: 350, y: 245, code: 'R 2.02', title: 'CONFERENCE NORTH', area: '42.0 m²' },
              { x: 490, y: 152, code: 'R 2.03', title: 'EXEC OFFICE', area: '21.6 m²' },
              { x: 585, y: 245, code: 'R 2.06', title: 'PRINT / ARCHIVE', area: '16.8 m²' },
              { x: 756, y: 256, code: 'R 2.08', title: 'WC CORE', area: '28.4 m²' },
              { x: 970, y: 196, code: 'R 2.11', title: 'MEETING LAB', area: '38.6 m²' },
              { x: 274, y: 556, code: 'R 2.04', title: 'STUDIO WEST', area: '86.5 m²' },
              { x: 498, y: 448, code: 'R 2.12a', title: 'POD 1', area: '8.5 m²' },
              { x: 602, y: 448, code: 'R 2.12b', title: 'POD 2', area: '8.5 m²' },
              { x: 985, y: 452, code: 'R 2.05', title: 'KITCHENETTE', area: '18.4 m²' },
            ].map((rm) => (
              <g key={rm.code}>
                {isOverview200 ? (
                  <text
                    x={rm.x}
                    y={rm.y}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="IBM Plex Mono, monospace"
                    fill="#202427"
                  >
                    {rm.code}
                  </text>
                ) : (
                  <>
                    <rect x={rm.x - 42} y={rm.y - 14} width={84} height={26} fill="#FCFCF9" fillOpacity="0.92" stroke="#202427" strokeWidth="0.55" />
                    <text x={rm.x} y={rm.y - 4.5} textAnchor="middle" fontSize="5.6" fontWeight="600" fontFamily="IBM Plex Mono, monospace" fill="#202427">
                      {rm.code} · {rm.title}
                    </text>
                    <text x={rm.x} y={rm.y + 6.5} textAnchor="middle" fontSize="5.4" fontFamily="IBM Plex Mono, monospace" fill="#555C60">
                      {rm.area} | OKFF +3.45
                    </text>
                  </>
                )}
              </g>
            ))}
          </g>
        )}

        {/* SANITARY & PLUMBING LAYER */}
        {activeLayers.sanitary && (
          <g>
            {isExecution50 && (
              <>
                <line x1="665" y1="114" x2="845" y2="114" stroke="#1E5F8A" strokeWidth="1.2" strokeDasharray="5 2" />
                <line x1="665" y1="118" x2="845" y2="118" stroke="#6E4726" strokeWidth="1.2" />
              </>
            )}
            {[675, 712].map((sx) => (
              <g key={`sink-${sx}`}>
                <rect x={sx} y={248} width={26} height={20} rx={3} fill="#FCFCF9" stroke="#1E5F8A" strokeWidth="0.9" />
                <ellipse cx={sx + 13} cy={258} rx={8} ry={6} fill="none" stroke="#1E5F8A" strokeWidth="0.65" />
              </g>
            ))}
            <rect x="822" y="216" width="24" height="22" rx={3} fill="#FCFCF9" stroke="#1E5F8A" strokeWidth="0.9" />
            {!isOverview200 && (
              <>
                <circle cx="814" cy="212" r="28" fill="none" stroke="#1E5F8A" strokeWidth="0.6" strokeDasharray="3 3" />
                <text x="814" y="214" textAnchor="middle" fontSize="5" fontFamily="IBM Plex Mono, monospace" fill="#1E5F8A">
                  Ø 1500
                </text>
              </>
            )}

            {['wc-01', 'wc-02', 'wc-03'].map((wcId) => {
              const f = fixtures[wcId];
              if (!f) return null;
              const isHoriz = wcId === 'wc-03';
              return (
                <g key={wcId}>
                  {!isHoriz ? (
                    <>
                      <rect x={f.position.x + 4} y={f.position.y} width={22} height={8} fill="#FCFCF9" stroke="#1E5F8A" strokeWidth="0.85" />
                      <ellipse cx={f.position.x + 15} cy={f.position.y + 21} rx={9} ry={13} fill="#FCFCF9" stroke="#1E5F8A" strokeWidth="0.95" />
                    </>
                  ) : (
                    <>
                      <rect x={f.position.x} y={f.position.y + 6} width={8} height={22} fill="#FCFCF9" stroke="#1E5F8A" strokeWidth="0.85" />
                      <ellipse cx={f.position.x + 21} cy={f.position.y + 17} rx={13} ry={9} fill="#FCFCF9" stroke="#1E5F8A" strokeWidth="0.95" />
                    </>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* HVAC / VENTILATION LAYER */}
        {activeLayers.hvac && (
          <g>
            <rect x="190" y="314" width="760" height="22" fill="#2B5B84" fillOpacity="0.14" stroke="#1D476B" strokeWidth="1.0" />
            {!isOverview200 && (
              <>
                <rect x="210" y="340" width="700" height="13" fill="#9A3B26" fillOpacity="0.1" stroke="#9A3B26" strokeWidth="0.85" />
                <rect x="338" y="185" width="14" height="129" fill="#2B5B84" fillOpacity="0.12" stroke="#1D476B" strokeWidth="0.8" />
                <rect x="692" y="218" width="14" height="96" fill="#2B5B84" fillOpacity="0.12" stroke="#1D476B" strokeWidth="0.8" />
                <rect x="280" y="353" width="14" height="140" fill="#2B5B84" fillOpacity="0.12" stroke="#1D476B" strokeWidth="0.8" />
              </>
            )}
            <rect x="492" y="312" width="44" height="26" fill="#FCFCF9" stroke="#1D476B" strokeWidth="1.0" />
            <line x1="492" y1="312" x2="536" y2="338" stroke="#9A3B26" strokeWidth="1.0" />
            <rect x="765" y="312" width="44" height="26" fill="#FCFCF9" stroke="#1D476B" strokeWidth="1.0" />
            <line x1="765" y1="312" x2="809" y2="338" stroke="#9A3B26" strokeWidth="1.0" />
          </g>
        )}

        {/* ELECTRICAL & LIGHTING LAYER */}
        {activeLayers.electrical && (
          <g>
            <line x1="150" y1="305" x2="1030" y2="305" stroke="#2E6B47" strokeWidth="2.0" strokeDasharray="2 2" />
            {!isOverview200 &&
              [180, 250, 320, 390].map((lx) => (
                <g key={`el-${lx}`}>
                  <rect x={lx} y={405} width={22} height={6} fill="#2E6B47" fillOpacity="0.2" stroke="#2E6B47" strokeWidth="0.6" />
                  <rect x={lx} y={515} width={22} height={6} fill="#2E6B47" fillOpacity="0.2" stroke="#2E6B47" strokeWidth="0.6" />
                </g>
              ))}
          </g>
        )}

        {/* HIGHLIGHTS: Light Amber Room + Amber Verified Objects + RED Unverified Object */}
        <g>
          {/* Light Soft Amber over the entire active Room */}
          <rect
            x={scenario.roomHighlight.x}
            y={scenario.roomHighlight.y}
            width={scenario.roomHighlight.w}
            height={scenario.roomHighlight.h}
            rx={4}
            fill="#E9B949"
            fillOpacity={0.18}
            stroke="#E9B949"
            strokeWidth={1.6}
            strokeDasharray="6 3"
          />

          {/* Highlighted Dimension Chains (Maßketten) */}
          {scenario.id === 'wc-count' && (
            <g fontFamily="IBM Plex Mono, monospace" fontSize="6.5" fontWeight="600" fill="#8C6208">
              <line x1="652" y1="100" x2="772" y2="100" stroke="#D49A1A" strokeWidth="1.5" />
              <circle cx="652" cy="100" r="2" fill="#D49A1A" />
              <circle cx="691" cy="100" r="2" fill="#D49A1A" />
              <circle cx="741" cy="100" r="2" fill="#D49A1A" />
              <circle cx="772" cy="100" r="2" fill="#D49A1A" />
              <rect x="660" y="88" width="26" height="10" rx="2" fill="#FFF8E1" stroke="#D49A1A" strokeWidth="0.6" />
              <text x="673" y="95.5" textAnchor="middle">420</text>
              <rect x="703" y="88" width="26" height="10" rx="2" fill="#FFF8E1" stroke="#D49A1A" strokeWidth="0.6" />
              <text x="716" y="95.5" textAnchor="middle">900</text>
              <line x1="780" y1="204" x2="848" y2="204" stroke="#D49A1A" strokeWidth="1.5" />
              <rect x="786" y="191" width="54" height="10" rx="2" fill="#FFF8E1" stroke="#D49A1A" strokeWidth="0.6" />
              <text x="813" y="198.5" textAnchor="middle">865 (!)</text>
            </g>
          )}

          {/* Target Fixtures: Intense Amber if verified, RED if NOT verified */}
          {targetFixtures.map((fixture, idx) => {
            const isSelected = selectedFixtureId === fixture.id;
            const isHovered = hoveredFixtureId === fixture.id;
            const isUnverified = !fixture.verified;
            const cx = fixture.position.x + fixture.position.w / 2;
            const cy = fixture.position.y + fixture.position.h / 2;
            const showLeader = idx === 0;

            const fillColor = isUnverified ? '#EF4444' : '#E9B949';
            const strokeColor = isUnverified ? '#B91C1C' : '#C98A12';
            const tagTextColor = isUnverified ? '#FCA5A5' : '#E9B949';

            return (
              <g
                key={fixture.id}
                onClick={() => onSelectFixtureFor3D(fixture.id)}
                onMouseEnter={() => handleMouseEnterFixture(fixture.id)}
                onMouseLeave={handleMouseLeaveFixture}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${fixture.label} in 3D`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFixtureFor3D(fixture.id);
                  }
                }}
              >
                <rect
                  x={fixture.position.x - 6}
                  y={fixture.position.y - 6}
                  width={fixture.position.w + 12}
                  height={fixture.position.h + 12}
                  rx={3}
                  fill={fillColor}
                  fillOpacity={isSelected || isHovered ? 0.58 : 0.4}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2.5 : 2}
                  strokeDasharray="5 3"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={4.2}
                  fill={strokeColor}
                  stroke="#FCFCF9"
                  strokeWidth={1.2}
                />
                {showLeader && (
                  <g>
                    <polyline
                      points={`${cx},${cy} ${cx + 38},${cy - 34} ${cx + 96},${cy - 34}`}
                      fill="none"
                      stroke="#C98A12"
                      strokeWidth={1.6}
                    />
                    <rect
                      x={cx + 38}
                      y={cy - 54}
                      width={78}
                      height={20}
                      rx={4}
                      fill="#E9B949"
                      stroke="#C98A12"
                      strokeWidth={0.8}
                    />
                    <text
                      x={cx + 77}
                      y={cy - 41}
                      textAnchor="middle"
                      fill="#202427"
                      fontSize="8.5"
                      fontWeight="600"
                      fontFamily="DM Sans, sans-serif"
                    >
                      Evidence 01
                    </text>
                  </g>
                )}
                <rect
                  x={fixture.position.x - 5}
                  y={fixture.position.y + fixture.position.h + 8}
                  width={fixture.position.w + 16}
                  height={12}
                  rx={2.5}
                  fill={isUnverified ? '#7F1D1D' : '#202427'}
                />
                <text
                  x={fixture.position.x + fixture.position.w / 2 + 3}
                  y={fixture.position.y + fixture.position.h + 16.5}
                  textAnchor="middle"
                  fill={tagTextColor}
                  fontSize="5.8"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {fixture.code}
                </text>
              </g>
            );
          })}
        </g>

        {/* CAD Title Block (Plankopf) */}
        <g>
          <rect x="890" y="636" width="286" height="60" fill="#FCFCF9" stroke="#202427" strokeWidth="1.0" />
          <line x1="890" y1="654" x2="1176" y2="654" stroke="#202427" strokeWidth="0.6" />
          <line x1="890" y1="675" x2="1176" y2="675" stroke="#202427" strokeWidth="0.6" />
          <line x1="1064" y1="654" x2="1064" y2="696" stroke="#202427" strokeWidth="0.6" />
          <text x="898" y="648" fontSize="6.8" fontWeight="700" fontFamily="IBM Plex Mono, monospace" fill="#202427">
            AUSFÜHRUNGSPLANUNG LPH 5 · KAMPPI {activeFloor}
          </text>
          <text x="898" y="668" fontSize="6.2" fontFamily="IBM Plex Mono, monospace" fill="#202427">
            GESCHOSS: {activeFloor} · INNENAUSBAU / TGA
          </text>
          <text x="1072" y="668" fontSize="6.5" fontWeight="700" fontFamily="IBM Plex Mono, monospace" fill="#9A7218">
            M {scale}
          </text>
          <text x="898" y="689" fontSize="5.8" fontFamily="IBM Plex Mono, monospace" fill="#555C60">
            PLAN-ID: AR-OG2-208-D · REV D
          </text>
          <text x="1072" y="689" fontSize="5.8" fontFamily="IBM Plex Mono, monospace" fill="#202427">
            14.11.2026
          </text>
        </g>
      </svg>

      {/* Hover-Dwell (>0.85s) Site Photo Verification Popover */}
      {dwellFixture && (
        <div
          className={`absolute bottom-9 left-3 z-20 w-72 rounded-xl bg-[#202427] text-[#F7F6F2] border shadow-xl overflow-hidden pointer-events-none ${
            dwellFixture.verified ? 'border-[#E9B949]/80' : 'border-red-500'
          }`}
          role="status"
        >
          <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <span
              className={`text-xs font-mono font-semibold ${
                dwellFixture.verified ? 'text-[#E9B949]' : 'text-red-400'
              }`}
            >
              {dwellFixture.code} · {dwellFixture.photoLabel}
            </span>
            <span
              className={`text-[10px] font-mono ${
                dwellFixture.verified ? 'text-[#A9AFB0]' : 'text-red-300'
              }`}
            >
              {dwellFixture.verified ? 'Verified' : 'Unverified'}
            </span>
          </div>
          <div className="relative h-36 bg-[#16191B]">
            <img
              src={dwellFixture.photoDataUrl}
              alt={dwellFixture.label}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-1.5 text-[11px] font-mono text-[#F7F6F2]">
              {dwellFixture.verified
                ? `${dwellFixture.author} · ${dwellFixture.capturedAt}`
                : 'Rough-in connections only · Awaiting fixture verification'}
            </div>
          </div>
          <div className="px-3.5 py-2 text-xs text-[#F7F6F2]/90 flex items-start gap-2">
            {dwellFixture.status === 'Installed' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            {dwellFixture.status === 'Issue Reported' && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            )}
            {dwellFixture.status === 'In Progress' && (
              <Clock className="w-3.5 h-3.5 text-[#E9B949] shrink-0 mt-0.5" />
            )}
            <span className="line-clamp-2">{dwellFixture.note}</span>
          </div>
        </div>
      )}

      {/* Subtle Hint Strip */}
      <div className="px-3.5 py-1.5 border-t border-[#A9AFB0]/25 bg-white flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#202427]/70">
        <span>
          Hover &gt;1s over a yellow/red mark to view site photo · Click to open realistic 3D room.
        </span>
        <span className="font-mono text-[#202427] font-medium">
          LoD Scale {scale}
        </span>
      </div>
    </div>
  );
};
