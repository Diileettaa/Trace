import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Box,
  Camera,
  Check,
  History,
  Layers,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';

interface WorkspaceLoopDemoProps {
  onOpenDemo: () => void;
}

interface LoopStep {
  id: number;
  title: string;
  subtitle: string;
  scale: '1:200' | '1:50' | '1:20';
  viewMode: '2d' | '3d-building' | '3d-room';
  showHighlights: boolean;
  showPhotoPopover: boolean;
  showFollowUp: boolean;
  activeChatIdx: number;
}

const LOOP_STEPS: LoopStep[] = [
  {
    id: 0,
    title: '01. Ask in Natural Language',
    subtitle: 'Type or select a question from persistent History (+ New Chat)',
    scale: '1:200',
    viewMode: '2d',
    showHighlights: false,
    showPhotoPopover: false,
    showFollowUp: false,
    activeChatIdx: 0,
  },
  {
    id: 1,
    title: '02. 1.8s AI Scale & Plan Scan',
    subtitle: 'Auto-scales to 1:50 LoD, highlights R 2.08 & flags unverified WC-208.2 in red',
    scale: '1:50',
    viewMode: '2d',
    showHighlights: true,
    showPhotoPopover: false,
    showFollowUp: false,
    activeChatIdx: 0,
  },
  {
    id: 2,
    title: '03. Hover >1s for Site Photos',
    subtitle: 'Compare installed fixtures vs. rough-in pipe connections & verify on site',
    scale: '1:20',
    viewMode: '2d',
    showHighlights: true,
    showPhotoPopover: true,
    showFollowUp: false,
    activeChatIdx: 0,
  },
  {
    id: 3,
    title: '04. Whole-Building & 3D WC Core',
    subtitle: 'Inspect Level 02 in 3D isometry or dive into realistic R 2.08 wall clearances',
    scale: '1:50',
    viewMode: '3d-room',
    showHighlights: true,
    showPhotoPopover: false,
    showFollowUp: true,
    activeChatIdx: 0,
  },
  {
    id: 4,
    title: '05. Proactive AI Follow-Up',
    subtitle: 'AI suggests root-cause checks, manufacturer specs & next floor inspection',
    scale: '1:50',
    viewMode: '3d-building',
    showHighlights: true,
    showPhotoPopover: false,
    showFollowUp: true,
    activeChatIdx: 0,
  },
];

export const WorkspaceLoopDemo: React.FC<WorkspaceLoopDemoProps> = ({
  onOpenDemo,
}) => {
  const [stepIdx, setStepIdx] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<boolean>(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => {
      setStepIdx((prev) => (prev + 1) % LOOP_STEPS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const step = LOOP_STEPS[stepIdx];

  return (
    <div
      className="rounded-2xl border border-[#A9AFB0]/60 bg-white shadow-sm overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Top Demo Control Strip */}
      <div className="px-4 sm:px-5 py-3 bg-[#F7F6F2] border-b border-[#A9AFB0]/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            aria-label={isPaused ? 'Play workspace loop' : 'Pause workspace loop'}
            className="p-1.5 rounded-md bg-white border border-[#A9AFB0]/50 text-[#202427] hover:border-[#202427] transition-colors cursor-pointer shrink-0"
          >
            {isPaused ? (
              <Play className="w-3.5 h-3.5" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="min-w-0">
            <div className="text-xs font-mono font-semibold text-[#202427] truncate">
              {step.title}
            </div>
            <div className="text-xs text-[#202427]/65 truncate">
              {step.subtitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 bg-white p-1 rounded-lg border border-[#A9AFB0]/40">
            {LOOP_STEPS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStepIdx(i)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                  i === stepIdx
                    ? 'bg-[#202427] text-[#E9B949] font-semibold'
                    : 'text-[#202427]/65 hover:text-[#202427]'
                }`}
              >
                0{i + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenDemo}
            className="px-3.5 py-1.5 rounded-lg bg-[#E9B949] text-[#202427] text-xs font-semibold hover:bg-[#E9B949]/90 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Open Demo Version</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Simulated Final 3-Column Trace. Native Workspace Frame */}
      <div className="bg-[#202427] text-[#F7F6F2] px-4 py-2 flex items-center justify-between text-[11px] font-mono border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-xs tracking-tight text-[#F7F6F2]">
            STOA / TRACE.
          </span>
          <span className="text-[#A9AFB0]">·</span>
          <span className="text-[#E9B949]">KAMMPPI OFFICE · REV 06</span>
        </div>
        <div className="flex items-center gap-3 text-[#A9AFB0]">
          <span className="px-2 py-0.5 rounded bg-white/10 text-[#F7F6F2]">
            LEVEL 02 ▾
          </span>
          <span className="hidden sm:inline">NATIVE WORKSPACE PREVIEW</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[185px_minmax(0,1fr)_240px] min-h-[390px] bg-[#F7F6F2]">
        {/* Left Rail: History + + New Chat + AI Scale LoD + Layer Guide */}
        <aside className="bg-white border-b md:border-b-0 md:border-r border-[#A9AFB0]/40 p-3 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#202427]/65 inline-flex items-center gap-1">
                  <History className="w-3 h-3" /> History
                </span>
                <span className="w-5 h-5 rounded border border-[#A9AFB0]/50 inline-flex items-center justify-center text-[#202427]">
                  <Plus className="w-3 h-3" />
                </span>
              </div>
              <div className="space-y-1">
                <div className="px-2 py-1.5 rounded bg-[#E9B949]/25 border border-[#E9B949]/60 text-[11px] font-medium text-[#202427] leading-tight">
                  Toilet bowls on 2nd floor?
                </div>
                <div className="px-2 py-1.5 rounded text-[11px] text-[#202427]/65 leading-tight truncate">
                  Fire dampers along Shaft B2?
                </div>
                <div className="px-2 py-1.5 rounded text-[11px] text-[#202427]/65 leading-tight truncate">
                  Door D-204 clear width &amp; frame?
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#202427]/65 mb-1.5">
                Scale (AI LoD)
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(['1:200', '1:50', '1:20'] as const).map((sc) => (
                  <div
                    key={sc}
                    className={`py-1 text-center rounded text-[10px] font-mono transition-colors ${
                      step.scale === sc
                        ? 'bg-[#202427] text-[#E9B949] font-semibold'
                        : 'bg-[#F7F6F2] text-[#202427]/70 border border-[#A9AFB0]/35'
                    }`}
                  >
                    {sc}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#202427]/65 mb-1.5 inline-flex items-center gap-1">
                <Layers className="w-3 h-3" /> Layer Guide
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex items-center justify-between text-[#202427]">
                  <span>Sanitary &amp; MEP</span>
                  <span className="font-mono text-[#9A7218] font-semibold">ON</span>
                </div>
                <div className="flex items-center justify-between text-[#202427]/55">
                  <span>HVAC Ductwork</span>
                  <span className="font-mono">OFF</span>
                </div>
                <div className="flex items-center justify-between text-[#202427]">
                  <span>Electrical &amp; Lighting</span>
                  <span className="font-mono text-[#9A7218] font-semibold">ON</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#A9AFB0]/30 text-[10px] font-mono text-[#202427]/60">
            4.2 hrs saved / plan
          </div>
        </aside>

        {/* Center Canvas: 2D/3D Toggle + Keynotes + Animated Plan/3D + Verify CTA */}
        <div className="p-3.5 flex flex-col justify-between gap-3 relative overflow-hidden">
          {/* Top Bar: 2D | 3D Switch + 3 Rounded Keynote Cards */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-white border border-[#A9AFB0]/50 p-0.5 text-[11px] font-mono">
              <span
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  step.viewMode === '2d'
                    ? 'bg-[#202427] text-[#E9B949] font-semibold'
                    : 'text-[#202427]/70'
                }`}
              >
                2D Plan
              </span>
              <span
                className={`px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 ${
                  step.viewMode !== '2d'
                    ? 'bg-[#202427] text-[#E9B949] font-semibold'
                    : 'text-[#202427]/70'
                }`}
              >
                <Box className="w-3 h-3" />
                3D View
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="px-2.5 py-1 rounded-lg bg-white border border-[#A9AFB0]/50 text-[10px]">
                <span className="font-mono font-semibold text-[#202427]">
                  R 2.08 · 28.4 m²
                </span>
                <span className="text-[#202427]/60 ml-1.5 hidden sm:inline">
                  7.1×4.0×2.8m
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-white border border-[#A9AFB0]/50 text-[10px] font-mono">
                <span className="text-[#202427]/65">Objects found:</span>{' '}
                <span className="font-bold text-[#202427]">
                  {step.showHighlights ? '3' : '—'}
                </span>
              </div>
              <div
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold transition-colors ${
                  step.showHighlights
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-white border-[#A9AFB0]/50 text-[#202427]/60'
                }`}
              >
                {step.showHighlights ? 'Status: Issue Reported' : 'Status: Scanning'}
              </div>
            </div>
          </div>

          {/* Interactive Drawing / 3D Viewport */}
          <div className="flex-1 min-h-[235px] rounded-xl border border-[#A9AFB0]/55 bg-white relative overflow-hidden flex items-center justify-center p-3">
            {step.viewMode === '2d' ? (
              <svg
                viewBox="0 0 560 250"
                className="w-full h-full max-h-[230px]"
                role="img"
                aria-label="Animated Level 02 1:50 floorplan preview showing R 2.08 Sanitary Core"
              >
                {/* Faint grid */}
                <defs>
                  <pattern
                    id="demo-grid"
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="#A9AFB0"
                      strokeOpacity="0.22"
                      strokeWidth="0.6"
                    />
                  </pattern>
                </defs>
                <rect width="560" height="250" fill="url(#demo-grid)" />

                {/* Multi-room outline (R 2.06, R 2.07, R 2.08 WC Core, Corridor) */}
                <g stroke="#202427" strokeWidth="2.2" fill="none">
                  <rect x="28" y="24" width="504" height="202" />
                  <line x1="170" y1="24" x2="170" y2="155" />
                  <line x1="395" y1="24" x2="395" y2="155" />
                  <line x1="28" y1="155" x2="532" y2="155" />
                  {/* Corridor divider */}
                  <line x1="295" y1="155" x2="295" y2="226" />
                </g>

                {/* Room R 2.08 Two-Tone Amber Background */}
                <rect
                  x="172"
                  y="26"
                  width="221"
                  height="127"
                  fill={step.showHighlights ? '#E9B949' : 'transparent'}
                  fillOpacity={step.showHighlights ? 0.2 : 0}
                  className="transition-all duration-500"
                />

                {/* Structural room labels */}
                <text x="42" y="45" fontSize="10" fontFamily="IBM Plex Mono" fill="#202427" opacity="0.6">
                  R 2.07 OFFICE
                </text>
                <text x="184" y="44" fontSize="11" fontFamily="IBM Plex Mono" fontWeight="700" fill="#202427">
                  R 2.08 WC CORE (28.4 m²)
                </text>
                <text x="410" y="45" fontSize="10" fontFamily="IBM Plex Mono" fill="#202427" opacity="0.6">
                  R 2.09 SHAFT
                </text>
                <text x="42" y="192" fontSize="10" fontFamily="IBM Plex Mono" fill="#202427" opacity="0.6">
                  CORRIDOR WEST · +3.600
                </text>

                {/* Dimension chains (Maßketten) */}
                {step.showHighlights && (
                  <g stroke="#9A7218" strokeWidth="1" fontFamily="IBM Plex Mono" fontSize="9" fill="#9A7218">
                    <line x1="170" y1="12" x2="395" y2="12" />
                    <line x1="170" y1="7" x2="170" y2="17" />
                    <line x1="395" y1="7" x2="395" y2="17" />
                    <text x="262" y="9" fontWeight="600">7100 mm</text>

                    <line x1="218" y1="138" x2="278" y2="138" />
                    <text x="228" y="149" fontWeight="600">850 mm c/c</text>
                  </g>
                )}

                {/* 3 Toilets inside R 2.08: 2 Verified Amber + 1 Unverified Red */}
                {/* WC-208.1 (Amber Verified) */}
                <g transform="translate(202, 65)">
                  <rect
                    x="-6"
                    y="-6"
                    width="38"
                    height="56"
                    rx="4"
                    fill={step.showHighlights ? '#E9B949' : '#F7F6F2'}
                    fillOpacity={step.showHighlights ? 0.5 : 1}
                    stroke={step.showHighlights ? '#9A7218' : '#202427'}
                    strokeWidth={step.showHighlights ? '2' : '1.2'}
                  />
                  <rect x="4" y="2" width="18" height="28" rx="7" fill="#FFFFFF" stroke="#202427" strokeWidth="1.2" />
                  <text x="-4" y="61" fontSize="8.5" fontFamily="IBM Plex Mono" fontWeight="600" fill="#202427">
                    WC-208.1
                  </text>
                </g>

                {/* WC-208.2 (RED UNVERIFIED / ROUGH-IN ONLY) */}
                <g transform="translate(272, 65)">
                  <rect
                    x="-6"
                    y="-6"
                    width="38"
                    height="56"
                    rx="4"
                    fill={step.showHighlights ? '#FEE2E2' : '#F7F6F2'}
                    stroke={step.showHighlights ? '#DC2626' : '#202427'}
                    strokeWidth={step.showHighlights ? '2.2' : '1.2'}
                    strokeDasharray={step.showHighlights ? '4 2' : 'none'}
                  />
                  <rect x="4" y="2" width="18" height="28" rx="7" fill="#FFFFFF" stroke={step.showHighlights ? '#DC2626' : '#202427'} strokeWidth="1.2" />
                  <text
                    x="-4"
                    y="61"
                    fontSize="8.5"
                    fontFamily="IBM Plex Mono"
                    fontWeight="700"
                    fill={step.showHighlights ? '#B91C1C' : '#202427'}
                  >
                    WC-208.2 !
                  </text>
                </g>

                {/* WC-208.3 Accessible (Amber Verified) */}
                <g transform="translate(340, 65)">
                  <rect
                    x="-6"
                    y="-6"
                    width="42"
                    height="56"
                    rx="4"
                    fill={step.showHighlights ? '#E9B949' : '#F7F6F2'}
                    fillOpacity={step.showHighlights ? 0.5 : 1}
                    stroke={step.showHighlights ? '#9A7218' : '#202427'}
                    strokeWidth={step.showHighlights ? '2' : '1.2'}
                  />
                  <rect x="6" y="2" width="18" height="30" rx="7" fill="#FFFFFF" stroke="#202427" strokeWidth="1.2" />
                  <text x="-4" y="61" fontSize="8.5" fontFamily="IBM Plex Mono" fontWeight="600" fill="#202427">
                    WC-208.3
                  </text>
                </g>

                {/* Dashed Evidence 01 Callout */}
                {step.showHighlights && (
                  <g>
                    <line x1="291" y1="62" x2="368" y2="34" stroke="#B91C1C" strokeWidth="1.5" strokeDasharray="3 2" />
                    <circle cx="291" cy="62" r="4" fill="#DC2626" />
                  </g>
                )}
              </svg>
            ) : step.viewMode === '3d-room' ? (
              /* 3D Realistic WC Core Spatial View Preview */
              <div className="w-full h-full flex flex-col justify-between bg-[#202427] rounded-lg p-3.5 text-[#F7F6F2]">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[#E9B949] font-semibold">
                    3D INTERIOR CUTAWAY · R 2.08 WC CORE
                  </span>
                  <span className="text-[#A9AFB0]">DIN 18040 CLEARANCES ACTIVE</span>
                </div>
                <svg viewBox="0 0 420 155" className="w-full h-36">
                  {/* Isometric floor slab */}
                  <polygon points="40,120 210,145 385,105 215,78" fill="#2D3236" stroke="#A9AFB0" strokeWidth="1" />
                  {/* Back tiled wall */}
                  <polygon points="40,120 40,35 215,8 215,78" fill="#363B40" stroke="#A9AFB0" strokeWidth="1" />
                  {/* Side wall */}
                  <polygon points="215,78 215,8 385,32 385,105" fill="#2A2E32" stroke="#A9AFB0" strokeWidth="1" />
                  {/* Window on side wall */}
                  <polygon points="265,32 340,42 340,68 265,58" fill="#A9AFB0" fillOpacity="0.28" stroke="#E9B949" strokeWidth="1" />
                  {/* WC-208.1 (Amber) */}
                  <rect x="75" y="75" width="22" height="26" rx="4" fill="#E9B949" />
                  <text x="68" y="114" fontSize="8" fontFamily="IBM Plex Mono" fill="#E9B949">450mm wall</text>
                  {/* WC-208.2 (Red Rough-in Pipe Only) */}
                  <rect x="135" y="64" width="22" height="24" rx="3" fill="#DC2626" fillOpacity="0.35" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="3 2" />
                  <circle cx="146" cy="76" r="4" fill="#EF4444" />
                  <text x="122" y="102" fontSize="8" fontFamily="IBM Plex Mono" fill="#FCA5A5">ROUGH-IN ONLY</text>
                  {/* WC-208.3 Accessible (Amber + grab rails) */}
                  <rect x="195" y="55" width="26" height="28" rx="4" fill="#E9B949" />
                  <line x1="188" y1="62" x2="188" y2="82" stroke="#F7F6F2" strokeWidth="2" />
                  <text x="184" y="96" fontSize="8" fontFamily="IBM Plex Mono" fill="#E9B949">950mm clear</text>
                </svg>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#A9AFB0]">
                  <span>WC-208.1 &amp; .3 Verified · WC-208.2 Rough-In Alert</span>
                  <span className="text-[#E9B949]">3D Orbit Ready</span>
                </div>
              </div>
            ) : (
              /* Whole-Building 3D Isometry Preview */
              <div className="w-full h-full flex flex-col justify-between bg-[#202427] rounded-lg p-3.5 text-[#F7F6F2]">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[#E9B949] font-semibold">
                    WHOLE-BUILDING 3D ISOMETRY · LEVEL 02
                  </span>
                  <span className="text-[#A9AFB0]">CLICK R 2.08 FOR INTERIOR</span>
                </div>
                <svg viewBox="0 0 420 155" className="w-full h-36">
                  {/* Base blueprint shadow */}
                  <polygon points="60,125 220,148 370,108 210,85" fill="#181B1D" stroke="#A9AFB0" strokeOpacity="0.4" strokeDasharray="4 2" />
                  {/* Extruded floorplate walls */}
                  <polygon points="80,108 215,128 345,95 210,76" fill="#2C3135" stroke="#A9AFB0" strokeWidth="1" />
                  <polygon points="80,108 80,62 215,82 215,128" fill="#32373C" stroke="#A9AFB0" strokeWidth="1" />
                  <polygon points="215,128 215,82 345,49 345,95" fill="#272B2F" stroke="#A9AFB0" strokeWidth="1" />
                  {/* Highlighted R 2.08 extrusion */}
                  <polygon points="180,88 245,98 285,84 220,74" fill="#E9B949" fillOpacity="0.4" stroke="#E9B949" strokeWidth="1.5" />
                  <circle cx="232" cy="84" r="5" fill="#DC2626" stroke="#F7F6F2" strokeWidth="1.2" />
                  <text x="195" y="64" fontSize="9" fontFamily="IBM Plex Mono" fill="#E9B949" fontWeight="700">
                    R 2.08 · 1 ISSUE
                  </text>
                </svg>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#A9AFB0]">
                  <span>36+ Rooms Indexed · 6 Levels Switchable</span>
                  <span className="text-[#E9B949]">1.8s Grounded</span>
                </div>
              </div>
            )}

            {/* Hover >1s Site Photo Popover Overlay on Step 3 */}
            {step.showPhotoPopover && (
              <div className="absolute right-3 bottom-3 w-52 rounded-lg bg-[#202427] text-[#F7F6F2] border border-[#E9B949]/70 shadow-lg p-2.5 z-10">
                <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                  <span className="text-red-400 font-semibold">WC-208.2 · UNVERIFIED</span>
                  <span className="text-[#A9AFB0]">12 Nov 2026</span>
                </div>
                <div className="h-20 rounded bg-black/40 overflow-hidden mb-1.5">
                  {!photoError ? (
                    <img
                      src="/src/assets/images/wc_rough_in_pipes_1794668065164.jpg"
                      alt="Unfinished Geberit carrier frame and DN100 waste pipe connections for WC-208.2"
                      referrerPolicy="no-referrer"
                      onError={() => setPhotoError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-[#A9AFB0]">
                      Rough-in pipe photo
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-[#F7F6F2]/85 leading-tight">
                  Only DN100 waste &amp; carrier frame visible. Ceramic bowl pending.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Centered Verify on Site Bar */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={onOpenDemo}
              className="px-4 py-1.5 rounded-lg bg-[#202427] text-[#F7F6F2] text-xs font-semibold hover:bg-[#202427]/90 transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-[#E9B949]" />
              <span>
                {step.showPhotoPopover
                  ? 'Verify WC-208.2 on Site'
                  : 'Verify on Site / Update Photo'}
              </span>
            </button>
          </div>
        </div>

        {/* Right Rail: Conversational AI Assistant Messages */}
        <aside className="bg-white border-t md:border-t-0 md:border-l border-[#A9AFB0]/40 p-3 flex flex-col justify-between gap-2.5">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-[#202427]/65">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Trace. AI
              </span>
              <span className="text-[#9A7218]">1.8s</span>
            </div>

            {/* User bubble */}
            <div className="p-2 rounded-lg bg-[#202427] text-[#F7F6F2] text-[11px] leading-snug ml-4">
              How many toilet bowls are on the 2nd floor?
            </div>

            {/* Assistant reply */}
            {step.showHighlights ? (
              <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#A9AFB0]/45 text-[11px] text-[#202427] space-y-1.5 leading-snug">
                <div className="font-semibold flex items-center gap-1 text-[#202427]">
                  <Check className="w-3 h-3 text-[#9A7218]" />
                  <span>3 toilets found in R 2.08</span>
                </div>
                <p className="text-[#202427]/80">
                  <strong className="text-[#202427]">WC-208.1</strong> &amp;{' '}
                  <strong className="text-[#202427]">WC-208.3</strong> verified on site.{' '}
                  <span className="text-red-700 font-semibold">WC-208.2</span> shows rough-in pipes only.
                </p>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#A9AFB0]/45 text-[11px] text-[#202427]/70 inline-flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#9A7218]" />
                <span>Scanning Level 02 sheets...</span>
              </div>
            )}

            {/* Follow-up prompt on steps 4 & 5 */}
            {step.showFollowUp && (
              <div className="p-2 rounded-lg bg-[#E9B949]/15 border border-[#E9B949]/45 text-[10.5px] text-[#202427] leading-snug">
                <span className="font-semibold block mb-0.5">Follow-up:</span>
                Want to inspect why WC-208.2 reported a delay or view Geberit &amp; Laufen specs?
              </div>
            )}
          </div>

          {/* Bottom Message Input Mock */}
          <div className="pt-2 border-t border-[#A9AFB0]/30 flex items-center gap-1.5">
            <div className="flex-1 px-2.5 py-1.5 rounded-md bg-[#F7F6F2] border border-[#A9AFB0]/45 text-[11px] text-[#202427]/55 truncate">
              Ask any plan question...
            </div>
            <button
              type="button"
              onClick={onOpenDemo}
              aria-label="Try interactive Workspace chat"
              className="p-1.5 rounded-md bg-[#202427] text-[#E9B949] hover:bg-[#202427]/90 cursor-pointer"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
