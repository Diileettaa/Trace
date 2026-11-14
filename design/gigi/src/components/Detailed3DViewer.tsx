import React, { useState } from 'react';
import { ArrowLeft, Building2, Eye, RotateCw } from 'lucide-react';
import { FixtureVerification, QueryScenario } from '../data/workspaceData';

interface Detailed3DViewerProps {
  mode: 'building' | 'room';
  scenario: QueryScenario;
  fixture: FixtureVerification;
  allFixtures: Record<string, FixtureVerification>;
  siblingFixtures: FixtureVerification[];
  onSwitchMode: (mode: 'building' | 'room') => void;
  onSelectSibling: (id: string) => void;
  onBackTo2D: () => void;
}

export const Detailed3DViewer: React.FC<Detailed3DViewerProps> = ({
  mode,
  scenario,
  fixture,
  allFixtures,
  siblingFixtures,
  onSwitchMode,
  onSelectSibling,
  onBackTo2D,
}) => {
  const [orbitAngle, setOrbitAngle] = useState<number>(0);

  const wc1 = allFixtures['wc-01'];
  const wc2 = allFixtures['wc-02'];
  const wc3 = allFixtures['wc-03'];

  return (
    <div className="bg-[#202427] text-[#F7F6F2] flex flex-col">
      {/* 3D Toolbar */}
      <div className="px-4 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackTo2D}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-xs font-medium text-[#F7F6F2] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#E9B949]" />
            <span>2D Plan</span>
          </button>

          <div className="inline-flex items-center p-0.5 rounded-md bg-white/10">
            <button
              type="button"
              onClick={() => onSwitchMode('building')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                mode === 'building'
                  ? 'bg-[#E9B949] text-[#202427] font-semibold'
                  : 'text-[#A9AFB0] hover:text-[#F7F6F2]'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Whole Building 3D</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('room')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                mode === 'room'
                  ? 'bg-[#E9B949] text-[#202427] font-semibold'
                  : 'text-[#A9AFB0] hover:text-[#F7F6F2]'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{scenario.roomCode} Interior 3D</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setOrbitAngle((prev) => (prev === 0 ? 14 : prev === 14 ? -14 : 0))
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 border border-white/15 text-xs font-medium hover:border-[#E9B949] transition-colors cursor-pointer"
        >
          <RotateCw className="w-3 h-3 text-[#E9B949]" />
          <span>Orbit ({orbitAngle >= 0 ? `+${orbitAngle}°` : `${orbitAngle}°`})</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* MODE A: WHOLE BUILDING 3D ISOMETRY OVER THE FLOORPLAN FOOTPRINT     */}
      {/* =================================================================== */}
      {mode === 'building' ? (
        <div className="p-4 blueprint-grid-dark flex flex-col items-center">
          <svg
            viewBox="0 0 760 400"
            className="w-full h-auto max-h-[360px] select-none transition-transform duration-200"
            style={{
              transform: `perspective(1100px) rotateY(${orbitAngle * 0.4}deg)`,
            }}
            role="img"
            aria-label="Whole building Level 02 3D isometric model extruded over floorplan"
          >
            {/* Base Floorplan Slab Footprint (Level 02 Deck) */}
            <polygon
              points="70,225 390,95 695,215 375,350"
              fill="#2B3136"
              stroke="#A9AFB0"
              strokeWidth={1.5}
            />
            {/* Faint 2D Plan Lines projected on the Floor Slab */}
            <g stroke="#A9AFB0" strokeOpacity={0.28} strokeWidth={0.8}>
              <line x1="150" y1="192" x2="455" y2="317" />
              <line x1="255" y1="150" x2="560" y2="272" />
              <line x1="195" y1="276" x2="515" y2="145" />
              <line x1="230" y1="290" x2="550" y2="158" />
            </g>

            {/* Extruded Back-Left Perimeter Wall (North Facade with Window Cutouts) */}
            <polygon
              points="70,225 390,95 390,32 70,162"
              fill="#1E2225"
              stroke="#F7F6F2"
              strokeOpacity={0.55}
              strokeWidth={1.1}
            />
            {/* North Window Bays */}
            {[0.18, 0.38, 0.62, 0.82].map((t, i) => {
              const x1 = 70 + 320 * t;
              const y1 = 225 - 130 * t;
              return (
                <polygon
                  key={`nw-${i}`}
                  points={`${x1},${y1 - 18} ${x1 + 28},${y1 - 29} ${x1 + 28},${y1 - 48} ${x1},${y1 - 37}`}
                  fill="#93C5FD"
                  fillOpacity={0.22}
                  stroke="#A9AFB0"
                  strokeWidth={0.8}
                />
              );
            })}

            {/* Extruded Back-Right Perimeter Wall (East Facade) */}
            <polygon
              points="390,95 695,215 695,152 390,32"
              fill="#181B1E"
              stroke="#F7F6F2"
              strokeOpacity={0.55}
              strokeWidth={1.1}
            />

            {/* Extruded Interior Corridor Spine Walls */}
            <polygon
              points="195,276 515,145 515,96 195,227"
              fill="#32383D"
              fillOpacity={0.78}
              stroke="#A9AFB0"
              strokeWidth={0.9}
            />
            <polygon
              points="232,291 552,160 552,111 232,242"
              fill="#262B2F"
              fillOpacity={0.78}
              stroke="#A9AFB0"
              strokeWidth={0.9}
            />

            {/* Extruded North Wing Room Partitions */}
            {[
              { x1: 155, y1: 190, x2: 280, y2: 241 },
              { x1: 235, y1: 158, x2: 360, y2: 209 },
              { x1: 315, y1: 125, x2: 440, y2: 176 },
            ].map((w, idx) => (
              <polygon
                key={`np-${idx}`}
                points={`${w.x1},${w.y1} ${w.x2},${w.y2} ${w.x2},${w.y2 - 48} ${w.x1},${w.y1 - 48}`}
                fill="#2E3439"
                fillOpacity={0.72}
                stroke="#A9AFB0"
                strokeWidth={0.8}
              />
            ))}

            {/* Extruded Stairwell Cores */}
            <polygon
              points="115,206 185,178 185,126 115,154"
              fill="#3E454B"
              stroke="#F7F6F2"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            <polygon
              points="435,288 510,258 510,206 435,236"
              fill="#3E454B"
              stroke="#F7F6F2"
              strokeOpacity={0.6}
              strokeWidth={1}
            />

            {/* ============================================================== */}
            {/* CLICKABLE HIGHLIGHTED ZONE IN 3D BUILDING (e.g. R 2.08 WC)     */}
            {/* ============================================================== */}
            <g
              onClick={() => onSwitchMode('room')}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
              aria-label={`Zoom into 3D interior of ${scenario.roomCode}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSwitchMode('room');
                }
              }}
            >
              {/* Highlighted Floor & Volume of Active Zone */}
              {scenario.id === 'wc-count' ? (
                <g>
                  <polygon
                    points="318,125 415,164 495,131 398,92"
                    fill="#E9B949"
                    fillOpacity={0.45}
                    stroke="#E9B949"
                    strokeWidth={2}
                  />
                  <polygon
                    points="318,125 415,164 415,112 318,73"
                    fill="#E9B949"
                    fillOpacity={0.32}
                    stroke="#E9B949"
                    strokeWidth={1.6}
                  />
                  <polygon
                    points="415,164 495,131 495,79 415,112"
                    fill="#E9B949"
                    fillOpacity={0.24}
                    stroke="#E9B949"
                    strokeWidth={1.6}
                  />
                </g>
              ) : (
                <polygon
                  points="195,276 515,145 552,160 232,291"
                  fill="#E9B949"
                  fillOpacity={0.45}
                  stroke="#E9B949"
                  strokeWidth={2}
                />
              )}

              {/* 3D Callout Tag */}
              <rect x="430" y="42" width="188" height="24" rx="4" fill="#E9B949" />
              <text
                x="524"
                y="57.5"
                textAnchor="middle"
                fill="#202427"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="DM Sans, sans-serif"
              >
                {scenario.roomCode} · Click to inspect interior 3D →
              </text>
            </g>

            {/* Front Low Cutaway Walls (Semi-transparent so interior remains clear) */}
            <polygon
              points="70,225 375,350 375,318 70,193"
              fill="#202427"
              fillOpacity={0.65}
              stroke="#A9AFB0"
              strokeWidth={1}
            />
            <polygon
              points="375,350 695,215 695,183 375,318"
              fill="#191D20"
              fillOpacity={0.65}
              stroke="#A9AFB0"
              strokeWidth={1}
            />

            {/* Building Overall Dimensions */}
            <text x="200" y="318" fill="#A9AFB0" fontSize="9" fontFamily="IBM Plex Mono, monospace">
              38.40 m Wing Length
            </text>
            <text x="550" y="305" fill="#A9AFB0" fontSize="9" fontFamily="IBM Plex Mono, monospace">
              21.60 m Depth · H 3.10 m
            </text>
          </svg>
        </div>
      ) : (
        /* =================================================================== */
        /* MODE B: REALISTIC 3D INTERIOR OF WC CORE R 2.08 WITH ALL 3 TOILETS, */
        /* VANITY SINKS, STALL PARTITIONS, DOORS, WINDOW & WALL DISTANCES      */
        /* =================================================================== */
        <div className="p-4 blueprint-grid-dark flex flex-col">
          {/* Fixture Selector Strip */}
          {siblingFixtures.length > 1 && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {siblingFixtures.map((sib) => {
                  const isUnverified = !sib.verified;
                  const isSelected = sib.id === fixture.id;
                  return (
                    <button
                      key={sib.id}
                      type="button"
                      onClick={() => onSelectSibling(sib.id)}
                      className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer border ${
                        isSelected
                          ? isUnverified
                            ? 'bg-red-600 text-white border-red-400 font-semibold'
                            : 'bg-[#E9B949] text-[#202427] border-[#E9B949] font-semibold'
                          : isUnverified
                          ? 'bg-red-950/60 text-red-300 border-red-500/60'
                          : 'bg-white/5 text-[#A9AFB0] border-white/15 hover:text-[#F7F6F2]'
                      }`}
                    >
                      {sib.code} {isUnverified ? '· Unverified' : ''}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-mono text-[#A9AFB0]">
                R 2.08 · Realistic 3D Cutaway
              </span>
            </div>
          )}

          <svg
            viewBox="0 0 740 375"
            className="w-full h-auto max-h-[345px] select-none transition-transform duration-200"
            style={{
              transform: `perspective(1100px) rotateY(${orbitAngle * 0.4}deg)`,
            }}
            role="img"
            aria-label="Realistic 3D interior view of WC Core R 2.08 with 3 toilet bowls, sinks, doors, and wall distances"
          >
            {/* WC Core Tiled Floor Slab (6.40m x 4.44m) */}
            <polygon
              points="75,245 385,115 665,220 355,355"
              fill="#2E3439"
              stroke="#A9AFB0"
              strokeWidth={1.4}
            />
            {/* Porcelain Tile Grid on Floor */}
            {[0.2, 0.4, 0.6, 0.8].map((t) => (
              <g key={`tile-${t}`} stroke="#A9AFB0" strokeOpacity={0.18} strokeWidth={0.7}>
                <line
                  x1={75 + 310 * t}
                  y1={245 - 130 * t}
                  x2={355 + 310 * t}
                  y2={355 - 135 * t}
                />
                <line
                  x1={75 + 280 * t}
                  y1={245 + 110 * t}
                  x2={385 + 280 * t}
                  y2={115 + 105 * t}
                />
              </g>
            ))}

            {/* Back-Left Wall (North Cistern Wall — all 3 toilets sit along/off this wall) */}
            <polygon
              points="75,245 385,115 385,22 75,152"
              fill="#22272B"
              stroke="#F7F6F2"
              strokeOpacity={0.55}
              strokeWidth={1.2}
            />
            {/* Back-Right Exterior Wall (with Frosted Window in Accessible WC) */}
            <polygon
              points="385,115 665,220 665,125 385,22"
              fill="#1A1E21"
              stroke="#F7F6F2"
              strokeOpacity={0.55}
              strokeWidth={1.2}
            />

            {/* Frosted Window in Accessible WC (Back-Right Wall) */}
            <polygon
              points="520,124 600,154 600,114 520,84"
              fill="#BAE6FD"
              fillOpacity={0.22}
              stroke="#F7F6F2"
              strokeWidth={1.1}
            />
            <line x1="560" y1="139" x2="560" y2="99" stroke="#F7F6F2" strokeWidth={0.8} />
            <text x="515" y="76" fill="#A9AFB0" fontSize="8" fontFamily="IBM Plex Mono, monospace">
              Window BRH 1.35m
            </text>

            {/* Pre-Wall Cistern Shelf along North Wall (Stall 1 & Stall 2) */}
            <polygon
              points="110,230 345,132 345,80 110,178"
              fill="#353C42"
              stroke="#A9AFB0"
              strokeWidth={1}
            />
            <polygon
              points="110,178 345,80 360,86 125,184"
              fill="#475057"
              stroke="#A9AFB0"
              strokeWidth={0.9}
            />

            {/* ============================================================== */}
            {/* TOILET 1: WC-208.1 (Installed Standard Ceramic + Flush Plate)  */}
            {/* ============================================================== */}
            <g
              onClick={() => onSelectSibling('wc-01')}
              className="cursor-pointer"
            >
              {/* Dual Flush Plate */}
              <polygon
                points="158,184 174,177 174,167 158,174"
                fill="#E2E8F0"
                stroke="#202427"
                strokeWidth={0.8}
              />
              {/* 3D Ceramic Bowl */}
              <ellipse
                cx="176"
                cy="218"
                rx="18"
                ry="10"
                fill={fixture.id === 'wc-01' ? '#E9B949' : '#F8FAFC'}
                stroke="#202427"
                strokeWidth={1.3}
              />
              <path
                d="M 158 218 Q 160 238 176 241 Q 192 238 194 218 Z"
                fill={fixture.id === 'wc-01' ? '#D49A1A' : '#CBD5E1'}
                stroke="#202427"
                strokeWidth={1.1}
              />
              <ellipse cx="176" cy="217" rx="10" ry="5" fill="#1E293B" fillOpacity={0.55} />
              <rect x="132" y="140" width="58" height="15" rx="3" fill="#202427" stroke="#E9B949" strokeWidth={0.9} />
              <text x="161" y="150.5" textAnchor="middle" fill="#E9B949" fontSize="8" fontFamily="IBM Plex Mono, monospace">
                WC-208.1
              </text>
            </g>

            {/* Cubicle Divider Partition between Stall 1 and Stall 2 */}
            <polygon
              points="212,216 270,238 270,158 212,136"
              fill="#3D444A"
              fillOpacity={0.68}
              stroke="#F7F6F2"
              strokeWidth={1}
            />

            {/* ============================================================== */}
            {/* TOILET 2: WC-208.2 (UNVERIFIED -> RED! Rough-In Frame/Pipes)   */}
            {/* ============================================================== */}
            <g
              onClick={() => onSelectSibling('wc-02')}
              className="cursor-pointer"
            >
              {/* Exposed Geberit Carrier & DN100 Pipe Stub-out (Rough-In) */}
              <rect
                x="262"
                y="138"
                width="26"
                height="44"
                fill={wc2?.verified ? '#E9B949' : '#EF4444'}
                fillOpacity={0.28}
                stroke={wc2?.verified ? '#E9B949' : '#EF4444'}
                strokeWidth={1.6}
                strokeDasharray="3 2"
              />
              <circle
                cx="275"
                cy="176"
                r="7"
                fill={wc2?.verified ? '#E9B949' : '#DC2626'}
                stroke="#F7F6F2"
                strokeWidth={1.2}
              />
              <line x1="268" y1="162" x2="282" y2="156" stroke="#F7F6F2" strokeWidth={2} />
              <rect
                x="244"
                y="108"
                width="82"
                height="16"
                rx="3"
                fill={wc2?.verified ? '#202427' : '#7F1D1D'}
                stroke={wc2?.verified ? '#E9B949' : '#EF4444'}
                strokeWidth={1}
              />
              <text
                x="285"
                y="119"
                textAnchor="middle"
                fill={wc2?.verified ? '#E9B949' : '#FECACA'}
                fontSize="8"
                fontFamily="IBM Plex Mono, monospace"
              >
                {wc2?.verified ? 'WC-208.2' : 'WC-208.2 (RED)'}
              </text>
            </g>

            {/* Stall Front Doors (with handles) */}
            <polygon
              points="168,266 226,242 226,162 168,186"
              fill="#475569"
              fillOpacity={0.35}
              stroke="#A9AFB0"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <polygon
              points="270,238 345,206 345,128 270,158"
              fill="#475569"
              fillOpacity={0.35}
              stroke="#A9AFB0"
              strokeWidth={1}
              strokeDasharray="4 2"
            />

            {/* Structural Wall separating Standard WCs from Accessible WC */}
            <polygon
              points="360,126 458,164 458,72 360,34"
              fill="#2A3035"
              fillOpacity={0.88}
              stroke="#F7F6F2"
              strokeWidth={1.2}
            />

            {/* ============================================================== */}
            {/* TOILET 3: WC-208.3 (Accessible WC + Grab Rails + Corner Sink)  */}
            {/* ============================================================== */}
            <g
              onClick={() => onSelectSibling('wc-03')}
              className="cursor-pointer"
            >
              {/* Extended Accessible Toilet Bowl */}
              <ellipse
                cx="488"
                cy="185"
                rx="22"
                ry="12"
                fill={fixture.id === 'wc-03' ? '#E9B949' : '#F8FAFC'}
                stroke="#202427"
                strokeWidth={1.4}
              />
              <path
                d="M 466 185 Q 469 208 488 211 Q 507 208 510 185 Z"
                fill={fixture.id === 'wc-03' ? '#D49A1A' : '#CBD5E1'}
                stroke="#202427"
                strokeWidth={1.2}
              />
              <ellipse cx="488" cy="184" rx="12" ry="6" fill="#1E293B" fillOpacity={0.55} />
              {/* Folding Safety Grab Rails */}
              <line x1="455" y1="145" x2="495" y2="160" stroke="#F8FAFC" strokeWidth={3} strokeLinecap="round" />
              <line x1="505" y1="158" x2="542" y2="172" stroke="#F8FAFC" strokeWidth={3} strokeLinecap="round" />

              {/* Accessible Washbasin on Exterior Wall */}
              <polygon
                points="558,188 594,202 580,210 544,196"
                fill="#F8FAFC"
                stroke="#202427"
                strokeWidth={1}
              />
              <rect x="462" y="114" width="66" height="15" rx="3" fill="#202427" stroke="#EF4444" strokeWidth={0.9} />
              <text x="495" y="124.5" textAnchor="middle" fill="#FCA5A5" fontSize="8" fontFamily="IBM Plex Mono, monospace">
                WC-208.3 (!)
              </text>
            </g>

            {/* ============================================================== */}
            {/* VANITY COUNTER WITH 2 WASHBASINS, MIRRORS & ENTRANCE DOOR      */}
            {/* ============================================================== */}
            {/* Vanity Countertop in South-West Anteroom */}
            <polygon
              points="145,274 265,320 295,307 175,261"
              fill="#475057"
              stroke="#F7F6F2"
              strokeWidth={1.1}
            />
            <polygon
              points="145,274 265,320 265,334 145,288"
              fill="#2B3136"
              stroke="#F7F6F2"
              strokeWidth={1}
            />
            {/* Two Ceramic Washbasins */}
            <ellipse cx="192" cy="278" rx="14" ry="7" fill="#F8FAFC" stroke="#202427" strokeWidth={1} />
            <ellipse cx="242" cy="297" rx="14" ry="7" fill="#F8FAFC" stroke="#202427" strokeWidth={1} />
            <text x="190" y="330" fill="#A9AFB0" fontSize="8" fontFamily="IBM Plex Mono, monospace">
              2× Vanity Sinks &amp; Mirrors
            </text>

            {/* Entrance Door T-2.08a on Front-Right */}
            <polygon
              points="355,345 415,320 415,230 355,255"
              fill="#334155"
              fillOpacity={0.7}
              stroke="#F7F6F2"
              strokeWidth={1.1}
            />
            <circle cx="364" cy="295" r="2.6" fill="#E9B949" />
            <text x="422" y="315" fill="#A9AFB0" fontSize="8" fontFamily="IBM Plex Mono, monospace">
              Door T-2.08a (90/213)
            </text>

            {/* ============================================================== */}
            {/* DISTANCE DIMENSIONS TO WALLS FOR ACTIVE SELECTED TOILET        */}
            {/* ============================================================== */}
            <g fontFamily="IBM Plex Mono, monospace" fontSize="8.5" fontWeight="600">
              {fixture.id === 'wc-01' && (
                <>
                  <line x1="126" y1="226" x2="158" y2="218" stroke="#E9B949" strokeWidth={1.6} />
                  <rect x="84" y="226" width="84" height="16" rx="3" fill="#202427" stroke="#E9B949" />
                  <text x="126" y="237" textAnchor="middle" fill="#E9B949">420 mm left</text>
                  <line x1="194" y1="218" x2="225" y2="225" stroke="#E9B949" strokeWidth={1.6} />
                  <rect x="192" y="246" width="86" height="16" rx="3" fill="#202427" stroke="#E9B949" />
                  <text x="235" y="257" textAnchor="middle" fill="#E9B949">450 mm div</text>
                </>
              )}
              {fixture.id === 'wc-02' && (
                <>
                  <line x1="238" y1="188" x2="266" y2="178" stroke="#EF4444" strokeWidth={1.6} />
                  <rect x="200" y="192" width="112" height="16" rx="3" fill="#7F1D1D" stroke="#EF4444" />
                  <text x="256" y="203" textAnchor="middle" fill="#FECACA">450 mm · Unverified</text>
                </>
              )}
              {fixture.id === 'wc-03' && (
                <>
                  <line x1="422" y1="168" x2="466" y2="185" stroke="#EF4444" strokeWidth={1.6} strokeDasharray="3 2" />
                  <rect x="366" y="188" width="118" height="16" rx="3" fill="#7F1D1D" stroke="#EF4444" />
                  <text x="425" y="199" textAnchor="middle" fill="#FECACA">865 mm (35mm short)</text>
                </>
              )}
            </g>
          </svg>

          {/* Exact Distance Breakdown for Selected Fixture */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-white/10">
            <div className="bg-[#171A1C] px-3 py-2 rounded-lg border border-white/10">
              <div className="text-[10px] text-[#A9AFB0]">Left Clearance</div>
              <div
                className={`text-xs font-mono font-semibold mt-0.5 ${
                  fixture.verified ? 'text-[#E9B949]' : 'text-red-400'
                }`}
              >
                {fixture.dimensions3D.leftWall}
              </div>
            </div>
            <div className="bg-[#171A1C] px-3 py-2 rounded-lg border border-white/10">
              <div className="text-[10px] text-[#A9AFB0]">Right Clearance</div>
              <div className="text-xs font-mono font-semibold text-[#F7F6F2] mt-0.5">
                {fixture.dimensions3D.rightWall}
              </div>
            </div>
            <div className="bg-[#171A1C] px-3 py-2 rounded-lg border border-white/10">
              <div className="text-[10px] text-[#A9AFB0]">Front / Door</div>
              <div className="text-xs font-mono font-semibold text-[#F7F6F2] mt-0.5">
                {fixture.dimensions3D.frontClearance}
              </div>
            </div>
            <div className="bg-[#171A1C] px-3 py-2 rounded-lg border border-white/10">
              <div className="text-[10px] text-[#A9AFB0]">Elevation / Spec</div>
              <div className="text-xs font-mono font-semibold text-[#E9B949] mt-0.5">
                {fixture.dimensions3D.seatHeight}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
