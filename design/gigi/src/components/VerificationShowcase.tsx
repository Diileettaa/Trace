import React, { useState } from 'react';
import {
  Box,
  Camera,
  Check,
  Clock,
  Eye,
  Layers,
  MapPin,
  RotateCw,
  Search,
  User,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { FieldPhotoLog, VERIFICATION_SCENARIOS } from '../data/traceData';
import { ComplexExecutionDrawing } from './ComplexExecutionDrawing';

interface VerificationShowcaseProps {
  onOpenSubscribe: () => void;
}

export const VerificationShowcase: React.FC<VerificationShowcaseProps> = ({
  onOpenSubscribe,
}) => {
  const [activeScenarioId, setActiveScenarioId] = useState<string>(
    VERIFICATION_SCENARIOS[0].id
  );
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [zoomed, setZoomed] = useState<boolean>(false);
  const [isolateLayer, setIsolateLayer] = useState<boolean>(false);
  const [orbitAngle, setOrbitAngle] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [customLogs, setCustomLogs] = useState<Record<string, FieldPhotoLog[]>>({});
  const [showPinForm, setShowPinForm] = useState<boolean>(false);
  const [pinAuthor, setPinAuthor] = useState<string>('');
  const [pinNote, setPinNote] = useState<string>('');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const scenario =
    VERIFICATION_SCENARIOS.find((s) => s.id === activeScenarioId) ||
    VERIFICATION_SCENARIOS[0];

  const allLogs = [...(customLogs[scenario.id] || []), ...scenario.photoLogs];
  const latestLog = allLogs[0];

  const handleSelectScenario = (id: string) => {
    if (id === activeScenarioId) return;
    setIsSearching(true);
    setViewMode('2d');
    setShowPinForm(false);
    setActiveScenarioId(id);
    window.setTimeout(() => {
      setIsSearching(false);
    }, 360);
  };

  const handlePinPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinAuthor.trim() || !pinNote.trim()) return;
    const newEntry: FieldPhotoLog = {
      id: `custom-${Date.now()}`,
      imageUrl: scenario.photoLogs[0].imageUrl,
      caption: pinNote.trim(),
      author: pinAuthor.trim(),
      role: 'Site Architect',
      capturedAt: 'Nov 14, 2026 · Just now',
      coordinateRef: `${scenario.gridRef} · Verified`,
    };
    setCustomLogs((prev) => ({
      ...prev,
      [scenario.id]: [newEntry, ...(prev[scenario.id] || [])],
    }));
    setPinAuthor('');
    setPinNote('');
    setShowPinForm(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#A9AFB0]/45 shadow-[0_1px_3px_rgba(32,36,39,0.05)] overflow-hidden">
      {/* Light Card Header matching clean editorial aesthetic */}
      <div className="px-6 py-4 border-b border-[#A9AFB0]/30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-[#202427]">
            Drawing analysis
          </h2>
          <span className="text-xs font-mono text-[#202427]/60">
            LPH 5 · 1:50 Execution Plan
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F6F2] border border-[#A9AFB0]/35">
            {VERIFICATION_SCENARIOS.map((item) => {
              const isActive = item.id === scenario.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectScenario(item.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#202427] text-[#F7F6F2]'
                      : 'text-[#202427]/70 hover:text-[#202427]'
                  }`}
                >
                  {item.shortLabel}
                </button>
              );
            })}
          </div>
          <span className="hidden sm:inline text-xs text-[#202427]/55 whitespace-nowrap">
            Sample project
          </span>
        </div>
      </div>

      {/* Natural Language Query Prompt Bar */}
      <div className="px-6 py-3.5 bg-[#F7F6F2]/70 border-b border-[#A9AFB0]/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Search className="w-4 h-4 text-[#9A7218] shrink-0" />
          <p className="text-sm font-medium text-[#202427] truncate">
            “{scenario.query}”
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#202427]/70 shrink-0">
          <Clock className="w-3.5 h-3.5 text-[#9A7218]" />
          <span>Found in {scenario.responseTime}</span>
          <span aria-hidden="true">·</span>
          <span>{scenario.gridRef}</span>
        </div>
      </div>

      {/* Main Split: Left = Dense 1:50 Plan or Click-to-3D Model, Right = Verified Answer & Site Photo */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left 8 Columns: Complex 1:50 Drawing Sheet or 3D Model */}
        <div className="lg:col-span-8 border-b lg:border-b-0 lg:border-r border-[#A9AFB0]/30 flex flex-col bg-[#FCFCF9]">
          {/* Drawing / 3D Toolbar */}
          <div className="px-5 py-2.5 border-b border-[#A9AFB0]/25 bg-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-[#F7F6F2] p-0.5 rounded-lg border border-[#A9AFB0]/35">
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === '2d'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/70 hover:text-[#202427]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>2D Execution Plan (1:50)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === '3d'
                    ? 'bg-[#E9B949] text-[#202427] font-semibold'
                    : 'text-[#202427]/70 hover:text-[#202427]'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>3D Model &amp; Dimensions</span>
              </button>
            </div>

            {viewMode === '2d' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsolateLayer((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    isolateLayer
                      ? 'bg-[#202427] text-[#F7F6F2] border-[#202427]'
                      : 'bg-white text-[#202427]/80 border-[#A9AFB0]/50 hover:border-[#202427]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isolateLayer ? 'Show All Trades' : 'Dim Other Trades'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[#A9AFB0]/50 bg-white text-[#202427]/80 hover:border-[#202427] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {zoomed ? (
                    <>
                      <ZoomOut className="w-3.5 h-3.5" />
                      <span>Full Sheet</span>
                    </>
                  ) : (
                    <>
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Zoom 200%</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setOrbitAngle((prev) => (prev === 0 ? 18 : prev === 18 ? -16 : 0))
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F7F6F2] border border-[#A9AFB0]/50 text-xs font-medium text-[#202427] hover:border-[#202427] transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#9A7218]" />
                <span>
                  Orbit View ({orbitAngle >= 0 ? `+${orbitAngle}°` : `${orbitAngle}°`})
                </span>
              </button>
            )}
          </div>

          {/* Drawing / 3D Canvas */}
          <div className="relative flex-1 min-h-[340px] flex flex-col justify-center overflow-hidden">
            {isSearching ? (
              <div className="py-24 flex flex-col items-center justify-center gap-2.5 text-xs font-mono text-[#202427]/70">
                <div className="w-6 h-6 border-2 border-[#E9B949] border-t-[#202427] rounded-full animate-spin" />
                <span>Scanning 1:50 layers, dimensions &amp; MEP overlays...</span>
              </div>
            ) : viewMode === '2d' ? (
              <div className="p-3 sm:p-4">
                <ComplexExecutionDrawing
                  scenarioId={scenario.id}
                  zoomed={zoomed}
                  isolateLayer={isolateLayer}
                  onInspect3D={() => setViewMode('3d')}
                />
                <div className="mt-2.5 px-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#202427]/70">
                  <span>
                    Click the amber highlight in the plan to inspect exact 3D placement and dimensions.
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMode('3d')}
                    className="font-semibold text-[#202427] underline decoration-[#E9B949] decoration-2 underline-offset-4 hover:text-[#9A7218] cursor-pointer whitespace-nowrap"
                  >
                    Open 3D Spatial View →
                  </button>
                </div>
              </div>
            ) : (
              /* Dark High-Contrast 3D BIM Spatial Inspector */
              <div className="p-5 bg-[#202427] text-[#F7F6F2] flex-1 flex flex-col justify-between blueprint-grid-dark">
                <div className="flex items-center justify-between text-xs font-mono text-[#A9AFB0]">
                  <span className="text-[#E9B949]">
                    3D BIM Cut · {scenario.elementCode} · {scenario.gridRef}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMode('2d')}
                    className="text-[#F7F6F2] hover:text-[#E9B949] underline cursor-pointer"
                  >
                    ← Back to 2D Plan
                  </button>
                </div>

                <svg
                  viewBox="0 0 500 250"
                  className="w-full h-auto max-h-[250px] my-2 select-none transition-transform duration-200"
                  style={{
                    transform: `perspective(900px) rotateY(${orbitAngle * 0.45}deg)`,
                  }}
                  role="img"
                  aria-label={`3D BIM spatial view of ${scenario.elementCode} with exact dimensions`}
                >
                  {/* Structural Floor Slab */}
                  <polygon
                    points="75,185 255,235 425,170 245,122"
                    fill="#272C30"
                    stroke="#A9AFB0"
                    strokeOpacity={0.5}
                    strokeWidth={1.2}
                  />
                  {/* Back Left Structural Wall */}
                  <polygon
                    points="75,185 245,122 245,26 75,88"
                    fill="#1E2225"
                    stroke="#A9AFB0"
                    strokeOpacity={0.5}
                    strokeWidth={1.2}
                  />
                  {/* Shaft Partition Wall */}
                  <polygon
                    points="245,122 425,170 425,74 245,26"
                    fill="#181B1D"
                    stroke="#A9AFB0"
                    strokeOpacity={0.5}
                    strokeWidth={1.2}
                  />
                  {/* Ceiling Soffit Plane */}
                  <polygon
                    points="75,88 245,26 425,74 255,136"
                    fill="none"
                    stroke="#A9AFB0"
                    strokeOpacity={0.35}
                    strokeDasharray="4 4"
                  />

                  {scenario.id === 'hvac-damper' ? (
                    <g>
                      <polygon
                        points="135,98 320,146 340,138 155,90"
                        fill="#A9AFB0"
                        fillOpacity={0.28}
                        stroke="#F7F6F2"
                        strokeWidth={1.2}
                      />
                      <polygon
                        points="135,98 320,146 320,168 135,120"
                        fill="#A9AFB0"
                        fillOpacity={0.18}
                        stroke="#F7F6F2"
                        strokeWidth={1.2}
                      />
                      {/* Highlighted 3D Fire Damper Unit */}
                      <polygon
                        points="210,117 258,129 258,153 210,141"
                        fill="#E9B949"
                        fillOpacity={0.88}
                        stroke="#F7F6F2"
                        strokeWidth={1.4}
                      />
                      <polygon
                        points="210,117 232,108 280,120 258,129"
                        fill="#E9B949"
                        fillOpacity={0.96}
                        stroke="#F7F6F2"
                        strokeWidth={1.2}
                      />
                      <polygon
                        points="258,129 280,120 280,144 258,153"
                        fill="#C89B34"
                        stroke="#F7F6F2"
                        strokeWidth={1.2}
                      />
                      {/* Live Clearance Dimension */}
                      <line
                        x1={234}
                        y1={147}
                        x2={234}
                        y2={216}
                        stroke="#E9B949"
                        strokeWidth={1.3}
                        strokeDasharray="3 2"
                      />
                      <circle cx={234} cy={147} r={2.8} fill="#E9B949" />
                      <circle cx={234} cy={216} r={2.8} fill="#E9B949" />
                      <rect x={242} y={175} width={114} height={18} rx={3} fill="#202427" stroke="#E9B949" strokeWidth={0.9} />
                      <text x={248} y={187} fill="#E9B949" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                        2,490 mm clear
                      </text>
                      <rect x={135} y={54} width={120} height={18} rx={3} fill="#202427" stroke="#A9AFB0" strokeOpacity={0.5} />
                      <text x={141} y={66} fill="#F7F6F2" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                        1,120 mm from B4
                      </text>
                    </g>
                  ) : (
                    <g>
                      <polygon
                        points="272,155 344,174 344,86 272,67"
                        fill="#2E3438"
                        stroke="#F7F6F2"
                        strokeWidth={1.3}
                      />
                      <ellipse
                        cx={306}
                        cy={124}
                        rx={14}
                        ry={18}
                        fill="#E9B949"
                        fillOpacity={0.92}
                        stroke="#F7F6F2"
                        strokeWidth={1.4}
                      />
                      <line
                        x1={276}
                        y1={117}
                        x2={336}
                        y2={131}
                        stroke="#F7F6F2"
                        strokeWidth={5}
                        strokeOpacity={0.85}
                      />
                      <line
                        x1={306}
                        y1={142}
                        x2={306}
                        y2={202}
                        stroke="#E9B949"
                        strokeWidth={1.3}
                        strokeDasharray="3 2"
                      />
                      <rect x={314} y={166} width={112} height={18} rx={3} fill="#202427" stroke="#E9B949" strokeWidth={0.9} />
                      <text x={320} y={178} fill="#E9B949" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                        1,450 mm AFF
                      </text>
                      <rect x={162} y={102} width={108} height={18} rx={3} fill="#202427" stroke="#A9AFB0" strokeOpacity={0.5} />
                      <text x={168} y={114} fill="#F7F6F2" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                        Ø 110 mm · EI 120
                      </text>
                    </g>
                  )}
                </svg>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-[#A9AFB0]/20">
                  {scenario.dimensions.map((dim) => (
                    <div
                      key={dim.label}
                      className="bg-[#181B1D] px-3 py-2 rounded-lg border border-[#A9AFB0]/20"
                    >
                      <div className="text-[11px] text-[#A9AFB0] truncate">{dim.label}</div>
                      <div className="text-xs font-mono font-semibold tabular-nums text-[#E9B949] mt-0.5">
                        {dim.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Columns: Grounded Answer + On-Site Photo Memory */}
        <div className="lg:col-span-4 p-5 bg-white flex flex-col justify-between gap-5">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#9A7218]">Verified Answer</span>
                <span className="font-mono text-[#202427]/60 tabular-nums">
                  {scenario.elementCode}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[#202427]">
                {scenario.answer}
              </p>
            </div>

            {/* As-Built Site Photo Card */}
            <div className="rounded-xl border border-[#A9AFB0]/45 bg-[#F7F6F2]/65 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-[#A9AFB0]/30 flex items-center justify-between gap-2 bg-white">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#202427]">
                  <Camera className="w-3.5 h-3.5 text-[#9A7218]" />
                  <span>As-Built Site Photo</span>
                </div>
                <span className="text-[11px] font-mono text-[#202427]/60 tabular-nums">
                  {allLogs.length} {allLogs.length === 1 ? 'record' : 'records'}
                </span>
              </div>

              <div className="relative aspect-[4/3] bg-[#202427] overflow-hidden">
                {!imageErrors[latestLog.id] ? (
                  <img
                    src={latestLog.imageUrl}
                    alt={latestLog.caption}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setImageErrors((prev) => ({ ...prev, [latestLog.id]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center text-[#F7F6F2]">
                    <Camera className="w-6 h-6 text-[#E9B949]" />
                    <span className="text-xs font-medium">
                      {scenario.elementCode} Site Capture
                    </span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3">
                  <p className="text-xs text-[#F7F6F2] line-clamp-2">{latestLog.caption}</p>
                </div>
              </div>

              <div className="px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 text-[#202427]">
                <span className="flex items-center gap-1.5 font-medium">
                  <User className="w-3.5 h-3.5 text-[#9A7218]" />
                  <span>{latestLog.author}</span>
                </span>
                <span className="font-mono text-[11px] text-[#202427]/70 tabular-nums">
                  {latestLog.capturedAt}
                </span>
              </div>

              <div className="px-3.5 pb-3 flex items-center justify-between gap-2 text-[11px] font-mono text-[#202427]/70">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#9A7218]" />
                  <span>{latestLog.coordinateRef}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPinForm((v) => !v)}
                  className="font-sans font-semibold text-[#202427] underline decoration-[#E9B949] decoration-2 underline-offset-2 cursor-pointer"
                >
                  {showPinForm ? 'Cancel' : '+ Pin Site Photo'}
                </button>
              </div>

              {showPinForm && (
                <form
                  onSubmit={handlePinPhoto}
                  className="p-3 border-t border-[#A9AFB0]/35 bg-white space-y-2"
                >
                  <input
                    type="text"
                    required
                    value={pinAuthor}
                    onChange={(e) => setPinAuthor(e.target.value)}
                    placeholder="Your name (e.g. L. Saarinen)"
                    className="w-full px-2.5 py-1.5 text-xs bg-[#F7F6F2] border border-[#A9AFB0]/50 rounded text-[#202427] focus:outline-none focus:border-[#202427]"
                  />
                  <input
                    type="text"
                    required
                    value={pinNote}
                    onChange={(e) => setPinNote(e.target.value)}
                    placeholder="Site verification note..."
                    className="w-full px-2.5 py-1.5 text-xs bg-[#F7F6F2] border border-[#A9AFB0]/50 rounded text-[#202427] focus:outline-none focus:border-[#202427]"
                  />
                  <button
                    type="submit"
                    className="w-full py-1.5 px-3 text-xs font-semibold rounded bg-[#202427] text-[#F7F6F2] hover:bg-[#202427]/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 text-[#E9B949]" />
                    <span>Save Dated Photo to Coordinate</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSubscribe}
            className="w-full py-2.5 px-4 rounded-lg bg-[#202427] text-[#F7F6F2] text-sm font-semibold hover:bg-[#202427]/90 transition-colors cursor-pointer whitespace-nowrap"
          >
            Subscribe to Trace.
          </button>
        </div>
      </div>
    </div>
  );
};
