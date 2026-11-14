import React from 'react';

interface ComplexExecutionDrawingProps {
  scenarioId: string;
  zoomed: boolean;
  isolateLayer: boolean;
  onInspect3D: () => void;
}

export const ComplexExecutionDrawing: React.FC<ComplexExecutionDrawingProps> = ({
  scenarioId,
  zoomed,
  isolateLayer,
  onInspect3D,
}) => {
  const isHvac = scenarioId === 'hvac-damper';

  // Target bounding box coordinates in 920x560 CAD coordinate space
  const targetBox = isHvac
    ? { x: 438, y: 205, width: 126, height: 84, code: 'BSK-204 / FD-E', label: 'Click highlight → 3D' }
    : { x: 616, y: 318, width: 108, height: 86, code: 'FS-110 / S-02', label: 'Click highlight → 3D' };

  const viewBox = zoomed
    ? isHvac
      ? '290 125 410 250'
      : '470 230 390 240'
    : '0 0 920 560';

  const dimOpacity = isolateLayer ? 0.25 : 1;

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-auto select-none bg-[#FCFCF9] transition-all duration-300"
      role="img"
      aria-label="Detailed 1:50 architectural and MEP execution drawing (Ausführungsplanung)"
    >
      <defs>
        {/* Reinforced Concrete Diagonal Hatch */}
        <pattern
          id="concreteHatch"
          width="8"
          height="8"
          patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="#202427" strokeWidth="0.8" strokeOpacity="0.45" />
          <line x1="4" y1="0" x2="4" y2="8" stroke="#202427" strokeWidth="0.4" strokeOpacity="0.3" />
        </pattern>

        {/* Masonry Cross Hatch */}
        <pattern
          id="masonryHatch"
          width="6"
          height="6"
          patternTransform="rotate(-45 0 0)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="#202427" strokeWidth="0.7" strokeOpacity="0.35" />
        </pattern>

        {/* Thermal Insulation Wave Pattern */}
        <pattern id="insulationHatch" width="12" height="8" patternUnits="userSpaceOnUse">
          <path
            d="M 0 4 Q 3 0, 6 4 T 12 4"
            fill="none"
            stroke="#5A6065"
            strokeWidth="0.75"
            strokeOpacity="0.6"
          />
        </pattern>

        {/* Technical Grid Dot Pattern */}
        <pattern id="cadDots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="#A9AFB0" fillOpacity="0.45" />
        </pattern>
      </defs>

      {/* Sheet Paper & CAD Frame */}
      <rect x="0" y="0" width="920" height="560" fill="#FCFCF9" />
      <rect x="8" y="8" width="904" height="544" fill="url(#cadDots)" stroke="#202427" strokeWidth="1.2" />
      <rect x="14" y="14" width="892" height="532" fill="none" stroke="#202427" strokeWidth="0.4" />

      {/* Structural Grid Axes (A-F Horizontal, 1-5 Vertical) */}
      <g opacity={dimOpacity}>
        {[
          { x: 110, label: 'A' },
          { x: 265, label: 'B' },
          { x: 445, label: 'C' },
          { x: 635, label: 'D' },
          { x: 805, label: 'E' },
        ].map((axis) => (
          <g key={axis.label}>
            <line
              x1={axis.x}
              y1={36}
              x2={axis.x}
              y2={515}
              stroke="#6C7378"
              strokeWidth="0.55"
              strokeDasharray="10 3 2 3"
            />
            <circle cx={axis.x} cy={28} r={9} fill="#FCFCF9" stroke="#202427" strokeWidth="0.8" />
            <text
              x={axis.x}
              y={31.5}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="600"
              fill="#202427"
              fontFamily="IBM Plex Mono, monospace"
            >
              {axis.label}
            </text>
          </g>
        ))}

        {[
          { y: 95, label: '1' },
          { y: 215, label: '2' },
          { y: 345, label: '3' },
          { y: 465, label: '4' },
        ].map((axis) => (
          <g key={axis.label}>
            <line
              x1={38}
              y1={axis.y}
              x2={870}
              y2={axis.y}
              stroke="#6C7378"
              strokeWidth="0.55"
              strokeDasharray="10 3 2 3"
            />
            <circle cx={28} cy={axis.y} r={9} fill="#FCFCF9" stroke="#202427" strokeWidth="0.8" />
            <text
              x={28}
              y={axis.y + 3}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="600"
              fill="#202427"
              fontFamily="IBM Plex Mono, monospace"
            >
              {axis.label}
            </text>
          </g>
        ))}
      </g>

      {/* Triple Exterior Dimension Chains (Top & Left) */}
      <g opacity={dimOpacity} fontFamily="IBM Plex Mono, monospace" fontSize="6.8" fill="#202427">
        {/* Top Chain 1: Overall */}
        <line x1="100" y1="46" x2="815" y2="46" stroke="#202427" strokeWidth="0.55" />
        <text x="457" y="43.5" textAnchor="middle">21.450</text>
        {/* Top Chain 2: Axes */}
        <line x1="110" y1="58" x2="805" y2="58" stroke="#202427" strokeWidth="0.55" />
        {[110, 265, 445, 635, 805].map((x) => (
          <line key={`t2-${x}`} x1={x - 3} y1={61} x2={x + 3} y2={55} stroke="#202427" strokeWidth="0.8" />
        ))}
        <text x="187" y="55.5" textAnchor="middle">4.650</text>
        <text x="355" y="55.5" textAnchor="middle">5.400</text>
        <text x="540" y="55.5" textAnchor="middle">5.700</text>
        <text x="720" y="55.5" textAnchor="middle">5.100</text>
        {/* Top Chain 3: Windows & Piers */}
        <line x1="100" y1="70" x2="815" y2="70" stroke="#202427" strokeWidth="0.5" />
        <text x="145" y="68" textAnchor="middle">1.15</text>
        <text x="200" y="68" textAnchor="middle">2.40</text>
        <text x="305" y="68" textAnchor="middle">1.80</text>
        <text x="395" y="68" textAnchor="middle">2.40</text>
        <text x="505" y="68" textAnchor="middle">1.45</text>
        <text x="580" y="68" textAnchor="middle">2.80</text>
        <text x="695" y="68" textAnchor="middle">1.95</text>
        <text x="768" y="68" textAnchor="middle">1.65</text>

        {/* Left Dimension Chains */}
        <line x1="52" y1="85" x2="52" y2="475" stroke="#202427" strokeWidth="0.55" />
        <text x="48" y="280" textAnchor="middle" transform="rotate(-90 48 280)">11.820</text>
        <line x1="66" y1="95" x2="66" y2="465" stroke="#202427" strokeWidth="0.55" />
        <text x="62" y="155" textAnchor="middle" transform="rotate(-90 62 155)">3.600</text>
        <text x="62" y="280" textAnchor="middle" transform="rotate(-90 62 280)">3.900</text>
        <text x="62" y="405" textAnchor="middle" transform="rotate(-90 62 405)">3.600</text>
      </g>

      {/* Outer Structural Concrete Walls + Thermal Insulation Layer */}
      <g opacity={dimOpacity}>
        {/* Outer WDVS Insulation */}
        <rect x="92" y="82" width="730" height="398" fill="none" stroke="#202427" strokeWidth="0.7" />
        <rect x="92" y="82" width="730" height="10" fill="url(#insulationHatch)" />
        <rect x="92" y="470" width="730" height="10" fill="url(#insulationHatch)" />
        <rect x="92" y="92" width="10" height="378" fill="url(#insulationHatch)" />
        <rect x="812" y="92" width="10" height="378" fill="url(#insulationHatch)" />

        {/* Structural Concrete Perimeter Walls */}
        <rect x="102" y="92" width="710" height="14" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="1.2" />
        <rect x="102" y="456" width="710" height="14" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="1.2" />
        <rect x="102" y="106" width="14" height="350" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="1.2" />
        <rect x="798" y="106" width="14" height="350" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="1.2" />

        {/* Window Openings in Perimeter Walls */}
        {[170, 355, 540, 725].map((wx) => (
          <g key={`win-t-${wx}`}>
            <rect x={wx} y={82} width={68} height={24} fill="#FCFCF9" stroke="#202427" strokeWidth="0.9" />
            <line x1={wx} y1={94} x2={wx + 68} y2={94} stroke="#202427" strokeWidth="0.8" />
            <line x1={wx} y1={98} x2={wx + 68} y2={98} stroke="#202427" strokeWidth="0.5" />
            <text x={wx + 34} y={79} textAnchor="middle" fontSize="5.8" fontFamily="IBM Plex Mono, monospace" fill="#202427">
              F-2.1 · BRH 0.90
            </text>
          </g>
        ))}

        {/* Interior Concrete Core & Structural Columns */}
        {[
          { x: 260, y: 210 },
          { x: 440, y: 210 },
          { x: 630, y: 210 },
          { x: 260, y: 340 },
          { x: 440, y: 340 },
        ].map((col, idx) => (
          <rect
            key={`col-${idx}`}
            x={col.x}
            y={col.y}
            width={16}
            height={16}
            fill="#202427"
            fillOpacity="0.85"
          />
        ))}

        {/* Staircase & Elevator Concrete Core (Left Bottom) */}
        <rect x="116" y="290" width="144" height="166" fill="none" stroke="#202427" strokeWidth="1.4" />
        <rect x="116" y="290" width="144" height="10" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="0.9" />
        <rect x="250" y="290" width="10" height="166" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="0.9" />
        {/* Stair Treads */}
        {Array.from({ length: 12 }).map((_, i) => (
          <g key={`step-${i}`}>
            <line
              x1={124 + i * 9}
              y1={310}
              x2={124 + i * 9}
              y2={364}
              stroke="#202427"
              strokeWidth="0.7"
            />
            <line
              x1={124 + i * 9}
              y1={382}
              x2={124 + i * 9}
              y2={436}
              stroke="#202427"
              strokeWidth="0.7"
            />
          </g>
        ))}
        <path d="M 124 337 L 236 337 L 236 409 L 130 409" fill="none" stroke="#202427" strokeWidth="0.85" />
        <polygon points="130,409 138,405 138,413" fill="#202427" />

        {/* Interior Drywall Partitions (Double-stud W112 / F90) */}
        <rect x="264" y="106" width="7" height="174" fill="url(#masonryHatch)" stroke="#202427" strokeWidth="0.9" />
        <rect x="444" y="106" width="7" height="104" fill="url(#masonryHatch)" stroke="#202427" strokeWidth="0.9" />
        <rect x="633" y="106" width="9" height="350" fill="url(#masonryHatch)" stroke="#202427" strokeWidth="1.0" />
        {/* Corridor Horizontal Partition Walls */}
        <rect x="264" y="220" width="369" height="7" fill="url(#masonryHatch)" stroke="#202427" strokeWidth="0.9" />
        <rect x="264" y="280" width="369" height="7" fill="url(#masonryHatch)" stroke="#202427" strokeWidth="0.9" />

        {/* Fire Shaft S-02 (Target 2 Area) */}
        <rect x="642" y="325" width="66" height="74" fill="url(#concreteHatch)" stroke="#202427" strokeWidth="1.2" />
        <rect x="649" y="332" width="52" height="60" fill="#FCFCF9" stroke="#202427" strokeWidth="0.8" />
        {/* Risers inside Shaft S-02 */}
        <circle cx="663" cy="348" r="6" fill="none" stroke="#202427" strokeWidth="0.9" />
        <circle cx="680" cy="348" r="5" fill="none" stroke="#202427" strokeWidth="0.9" />
        <circle cx="663" cy="370" r="7" fill="none" stroke="#202427" strokeWidth="0.9" />
        <circle cx="684" cy="370" r="4.5" fill="#202427" fillOpacity="0.2" stroke="#202427" strokeWidth="0.8" />
        <text x="675" y="388" textAnchor="middle" fontSize="6" fontFamily="IBM Plex Mono, monospace" fill="#202427">
          SH-S02 EI120
        </text>

        {/* Doors with Swing Arcs & Detailed Architectural Door Tags */}
        {[
          { x: 205, y: 280, w: 32, dir: 'up', tag: 'T-2.01 · T30-RS' },
          { x: 320, y: 220, w: 30, dir: 'up', tag: 'T-2.02 · 90/213' },
          { x: 500, y: 220, w: 30, dir: 'up', tag: 'T-2.03 · 90/213' },
          { x: 355, y: 287, w: 34, dir: 'down', tag: 'T-2.04 · 101/213' },
          { x: 555, y: 287, w: 34, dir: 'down', tag: 'T-2.05 · 101/213' },
          { x: 633, y: 238, w: 30, dir: 'right', tag: 'T-2.06 · EI90' },
        ].map((door) => (
          <g key={door.tag}>
            {door.dir === 'up' && (
              <>
                <rect x={door.x} y={door.y - 1} width={door.w} height={9} fill="#FCFCF9" />
                <line x1={door.x} y1={door.y} x2={door.x} y2={door.y - door.w} stroke="#202427" strokeWidth="1" />
                <path
                  d={`M ${door.x} ${door.y - door.w} A ${door.w} ${door.w} 0 0 1 ${door.x + door.w} ${door.y}`}
                  fill="none"
                  stroke="#202427"
                  strokeWidth="0.6"
                />
                <text x={door.x + 2} y={door.y - 10} fontSize="5.5" fontFamily="IBM Plex Mono, monospace" fill="#202427">
                  {door.tag}
                </text>
              </>
            )}
            {door.dir === 'down' && (
              <>
                <rect x={door.x} y={door.y - 8} width={door.w} height={9} fill="#FCFCF9" />
                <line x1={door.x} y1={door.y} x2={door.x} y2={door.y + door.w} stroke="#202427" strokeWidth="1" />
                <path
                  d={`M ${door.x} ${door.y + door.w} A ${door.w} ${door.w} 0 0 0 ${door.x + door.w} ${door.y}`}
                  fill="none"
                  stroke="#202427"
                  strokeWidth="0.6"
                />
                <text x={door.x + 2} y={door.y + 18} fontSize="5.5" fontFamily="IBM Plex Mono, monospace" fill="#202427">
                  {door.tag}
                </text>
              </>
            )}
            {door.dir === 'right' && (
              <>
                <rect x={door.x - 1} y={door.y} width={11} height={door.w} fill="#FCFCF9" />
                <line x1={door.x + 9} y1={door.y} x2={door.x + 9 + door.w} y2={door.y} stroke="#202427" strokeWidth="1" />
                <path
                  d={`M ${door.x + 9 + door.w} ${door.y} A ${door.w} ${door.w} 0 0 1 ${door.x + 9} ${door.y + door.w}`}
                  fill="none"
                  stroke="#202427"
                  strokeWidth="0.6"
                />
              </>
            )}
          </g>
        ))}

        {/* Interior Furniture, Sanitary & Ceiling Grid Chaos */}
        {/* Conference Table in R 2.02 */}
        <rect x="495" y="135" width="95" height="44" rx="4" fill="none" stroke="#202427" strokeWidth="0.7" strokeDasharray="3 2" />
        {[508, 532, 556, 578].map((cx) => (
          <g key={`ch-${cx}`}>
            <rect x={cx - 5} y={126} width={10} height={6} fill="none" stroke="#202427" strokeWidth="0.55" />
            <rect x={cx - 5} y={182} width={10} height={6} fill="none" stroke="#202427" strokeWidth="0.55" />
          </g>
        ))}

        {/* WC / Sanitary Stalls in Right Core */}
        <rect x="720" y="325" width="78" height="131" fill="none" stroke="#202427" strokeWidth="0.8" />
        <line x1="720" y1="368" x2="798" y2="368" stroke="#202427" strokeWidth="0.7" />
        <line x1="720" y1="412" x2="798" y2="412" stroke="#202427" strokeWidth="0.7" />
        {/* Toilets & Sinks */}
        <ellipse cx="780" cy="346" rx="8" ry="5" fill="none" stroke="#202427" strokeWidth="0.7" />
        <ellipse cx="780" cy="390" rx="8" ry="5" fill="none" stroke="#202427" strokeWidth="0.7" />
        <rect x="728" y="424" width="12" height="20" fill="none" stroke="#202427" strokeWidth="0.7" />

        {/* Recessed Acoustic Ceiling Grid Lines in South Open Studio */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            key={`cg-v-${i}`}
            x1={295 + i * 32}
            y1={290}
            x2={295 + i * 32}
            y2={450}
            stroke="#A9AFB0"
            strokeWidth="0.35"
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`cg-h-${i}`}
            x1={270}
            y1={315 + i * 32}
            x2={625}
            y2={315 + i * 32}
            stroke="#A9AFB0"
            strokeWidth="0.35"
          />
        ))}

        {/* Electrical Luminaire Symbols & Cable Tray Run */}
        {[311, 407, 503, 599].map((lx) => (
          <g key={`lum-${lx}`}>
            <rect x={lx - 10} y={336} width={20} height={6} fill="#202427" fillOpacity="0.15" stroke="#202427" strokeWidth="0.6" />
            <rect x={lx - 10} y={400} width={20} height={6} fill="#202427" fillOpacity="0.15" stroke="#202427" strokeWidth="0.6" />
            <text x={lx} y={333} textAnchor="middle" fontSize="4.8" fontFamily="IBM Plex Mono, monospace" fill="#555C60">
              LED-14W
            </text>
          </g>
        ))}

        {/* Room Stamps (Raumstempel) */}
        {[
          { x: 162, y: 158, num: 'R 2.01', name: 'FOYER / RECEPTION', area: '26.4 m²', ffb: 'OKFF +3.45' },
          { x: 355, y: 158, num: 'R 2.02', name: 'STUDIO NORTH', area: '38.2 m²', ffb: 'OKFF +3.45' },
          { x: 542, y: 158, num: 'R 2.03', name: 'MEETING LAB', area: '31.5 m²', ffb: 'OKFF +3.45' },
          { x: 455, y: 376, num: 'R 2.04', name: 'OPEN WORKSPACE', area: '74.8 m²', ffb: 'OKFF +3.45' },
          { x: 722, y: 168, num: 'R 2.05', name: 'PRINT & ARCHIVE', area: '22.1 m²', ffb: 'OKFF +3.45' },
        ].map((rm) => (
          <g key={rm.num}>
            <rect
              x={rm.x - 42}
              y={rm.y - 16}
              width={84}
              height={34}
              fill="#FCFCF9"
              fillOpacity="0.88"
              stroke="#202427"
              strokeWidth="0.6"
            />
            <line x1={rm.x - 42} y1={rm.y - 4} x2={rm.x + 42} y2={rm.y - 4} stroke="#202427" strokeWidth="0.45" />
            <text x={rm.x} y={rm.y - 7.5} textAnchor="middle" fontSize="6" fontWeight="600" fontFamily="IBM Plex Mono, monospace" fill="#202427">
              {rm.num} · {rm.name}
            </text>
            <text x={rm.x} y={rm.y + 5} textAnchor="middle" fontSize="5.8" fontFamily="IBM Plex Mono, monospace" fill="#202427">
              {rm.area}
            </text>
            <text x={rm.x} y={rm.y + 14} textAnchor="middle" fontSize="5.2" fontFamily="IBM Plex Mono, monospace" fill="#555C60">
              {rm.ffb} | UKRD +6.30
            </text>
          </g>
        ))}

        {/* Section Cut Lines (A-A and B-B) */}
        <line x1="310" y1="74" x2="310" y2="492" stroke="#202427" strokeWidth="0.9" strokeDasharray="16 4 2 4" />
        <polygon points="310,74 305,84 315,84" fill="#202427" />
        <polygon points="310,492 305,482 315,482" fill="#202427" />
        <text x="318" y="84" fontSize="8" fontWeight="700" fontFamily="IBM Plex Mono, monospace" fill="#202427">A</text>
        <text x="318" y="489" fontSize="8" fontWeight="700" fontFamily="IBM Plex Mono, monospace" fill="#202427">A</text>
      </g>

      {/* OVERLAY MEP CHAOS: HVAC Supply/Extract Ducts, Cable Trays, Firestop & Sprinklers */}
      <g opacity={isolateLayer && !isHvac ? 0.35 : 1}>
        {/* Main Corridor HVAC Supply Duct (SD-204 600x350) */}
        <rect
          x="130"
          y="236"
          width="580"
          height="22"
          fill="#2B5B84"
          fillOpacity="0.14"
          stroke="#1D476B"
          strokeWidth="1.0"
        />
        <line x1="130" y1="247" x2="710" y2="247" stroke="#1D476B" strokeWidth="0.6" strokeDasharray="8 3" />
        {/* Branch Ducts North & South */}
        <rect x="200" y="138" width="14" height="98" fill="#2B5B84" fillOpacity="0.12" stroke="#1D476B" strokeWidth="0.8" />
        <rect x="385" y="138" width="14" height="98" fill="#2B5B84" fillOpacity="0.12" stroke="#1D476B" strokeWidth="0.8" />
        <rect x="575" y="258" width="14" height="120" fill="#2B5B84" fillOpacity="0.12" stroke="#1D476B" strokeWidth="0.8" />
        {/* Extract Duct (Parallel Red/Terracotta CAD Linework) */}
        <rect
          x="230"
          y="262"
          width="460"
          height="13"
          fill="#9A3B26"
          fillOpacity="0.1"
          stroke="#9A3B26"
          strokeWidth="0.85"
        />
        {/* Cable Tray (Kabelrinne 300x60) */}
        <line x1="125" y1="229" x2="660" y2="229" stroke="#3D6B4F" strokeWidth="2.4" strokeDasharray="2 2" />
        <text x="150" y="226" fontSize="5.2" fontFamily="IBM Plex Mono, monospace" fill="#2E543D">
          KR 300×60 · UK +2.92m
        </text>
        <text x="330" y="250" fontSize="5.6" fontWeight="600" fontFamily="IBM Plex Mono, monospace" fill="#1D476B">
          ZUL SD-204 600×350 · UK +2.84m
        </text>

        {/* Revision Cloud around HVAC Damper / Shaft Zone */}
        <path
          d="M 432 204 Q 445 192 465 202 Q 488 190 510 202 Q 535 192 558 205 Q 574 220 568 245 Q 576 270 558 286 Q 536 298 512 288 Q 486 298 462 288 Q 436 296 428 272 Q 418 248 430 226 Q 422 212 432 204 Z"
          fill="none"
          stroke="#9A3B26"
          strokeWidth="0.9"
          strokeDasharray="4 2"
          opacity={dimOpacity}
        />
      </g>

      {/* Dense CAD Notes & Title Block (Plankopf) */}
      <g opacity={dimOpacity}>
        <rect x="652" y="482" width="250" height="60" fill="#FCFCF9" stroke="#202427" strokeWidth="1.0" />
        <line x1="652" y1="498" x2="902" y2="498" stroke="#202427" strokeWidth="0.6" />
        <line x1="652" y1="518" x2="902" y2="518" stroke="#202427" strokeWidth="0.6" />
        <line x1="792" y1="498" x2="792" y2="542" stroke="#202427" strokeWidth="0.6" />
        <text x="658" y="493" fontSize="6.5" fontWeight="700" fontFamily="IBM Plex Mono, monospace" fill="#202427">
          AUSFÜHRUNGSPLANUNG LPH 5 · KOORDINATION TGA / INNENAUSBAU
        </text>
        <text x="658" y="511" fontSize="6" fontFamily="IBM Plex Mono, monospace" fill="#202427">
          PROJEKT: KAMPPI MIXED-USE · LVL 02
        </text>
        <text x="798" y="511" fontSize="6" fontFamily="IBM Plex Mono, monospace" fill="#202427">
          M 1:50 · REV C
        </text>
        <text x="658" y="533" fontSize="5.8" fontFamily="IBM Plex Mono, monospace" fill="#555C60">
          PLAN-NR: AR-TGA-204-C · HELSINKI
        </text>
        <text x="798" y="533" fontSize="5.8" fontFamily="IBM Plex Mono, monospace" fill="#202427">
          DATUM: 14.11.26
        </text>
      </g>

      {/* Interactive Signal Amber (#E9B949) Verified Source Highlight */}
      <g
        onClick={onInspect3D}
        className="cursor-pointer group"
        role="button"
        tabIndex={0}
        aria-label="Click yellow highlighted region to open 3D model with dimensions"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onInspect3D();
          }
        }}
      >
        <rect
          x={targetBox.x}
          y={targetBox.y}
          width={targetBox.width}
          height={targetBox.height}
          rx={4}
          fill="#E9B949"
          fillOpacity={0.32}
          stroke="#D49A1A"
          strokeWidth={2.5}
        />
        {/* Corner Registration Ticks */}
        <path
          d={`M ${targetBox.x - 6} ${targetBox.y + 10} L ${targetBox.x - 6} ${targetBox.y - 6} L ${targetBox.x + 10} ${targetBox.y - 6}`}
          fill="none"
          stroke="#202427"
          strokeWidth={1.6}
        />
        <path
          d={`M ${targetBox.x + targetBox.width - 10} ${targetBox.y + targetBox.height + 6} L ${targetBox.x + targetBox.width + 6} ${targetBox.y + targetBox.height + 6} L ${targetBox.x + targetBox.width + 6} ${targetBox.y + targetBox.height - 10}`}
          fill="none"
          stroke="#202427"
          strokeWidth={1.6}
        />
        {/* Callout Label Flag */}
        <rect
          x={targetBox.x}
          y={targetBox.y - 22}
          width={142}
          height={18}
          rx={3}
          fill="#202427"
        />
        <rect
          x={targetBox.x + 3}
          y={targetBox.y - 19}
          width={6}
          height={12}
          rx={1}
          fill="#E9B949"
        />
        <text
          x={targetBox.x + 13}
          y={targetBox.y - 10}
          fill="#F7F6F2"
          fontSize="8"
          fontWeight="600"
          fontFamily="IBM Plex Mono, monospace"
        >
          {targetBox.code} · Open 3D →
        </text>
      </g>
    </svg>
  );
};
