// Gigi's LargeExecutionPlan look (design/gigi/src/components/LargeExecutionPlan.tsx) on a real drawing:
// the sheet PNG from /api/drawing with an SVG overlay in drawing pixels. Same marks, colours, tags,
// "Evidence 01" leader, hover-dwell site photo and hint strip as Gigi; no invented geometry.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { api, layerOf, type FixtureVerification, type LayerId, type QueryScenario, type ScaleOption } from './adapters';
import type { GeometrySource } from '../viewer3d/geometryScene';

interface Props {
  path: string;
  page?: number;          // ours: sheet page inside a multi-page PDF set
  scenario: QueryScenario | null;
  activeLayers: Record<LayerId, boolean>;
  scale: ScaleOption;
  activeFloor: string;
  fixtures: Record<string, FixtureVerification>;
  selectedFixtureId: string | null;
  onSelectFixtureFor3D: (id: string) => void;
  onImageSize?: (size: [number, number]) => void;
  // ours: interactive review (Xinran's /api/rv/*). In 'fix' mode a click toggles a mark off, a drag on empty paper adds one.
  tool?: 'view' | 'fix' | 'measure';
  removed?: Set<string>;
  added?: { x: number; y: number; w: number; h: number }[];
  measurePts?: [number, number][];
  onToggleRemove?: (id: string) => void;
  onAddBox?: (b: { x: number; y: number; w: number; h: number }) => void;
  onMeasurePoint?: (p: [number, number]) => void;
  /** Source evidence from a measured 3D element; bbox is in this drawing's pixels. */
  evidenceSource?: GeometrySource | null;
}

const ZOOM: Record<ScaleOption, number> = { '1:200': 1, '1:100': 2, '1:50': 4, '1:20': 8 };

export const RealPlan: React.FC<Props> = ({
  path, page = 1, scenario, activeLayers, scale, activeFloor, fixtures, selectedFixtureId, onSelectFixtureFor3D, onImageSize,
  tool = 'view', removed, added = [], measurePts = [], onToggleRemove, onAddBox, onMeasurePoint, evidenceSource,
}) => {
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoveredFixtureId, setHoveredFixtureId] = useState<string | null>(null);
  const [dwellReadyId, setDwellReadyId] = useState<string | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const url = api.drawingUrl(path, page);
  // ours: drag to pan, wheel / pinch to zoom (on top of the LoD scale, reset when the scale or answer changes)
  const [userView, setUserView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; vb: { x: number; y: number; w: number; h: number }; moved: boolean } | null>(null);

  useEffect(() => { setSize(null); setFailed(false); setUserView(null); }, [path, page]);
  useEffect(() => { setUserView(null); }, [scale, scenario?.id, selectedFixtureId, evidenceSource?.file, evidenceSource?.page, evidenceSource?.bbox?.join(','), evidenceSource?.bboxNorm1000?.join(',')]);
  useEffect(() => () => { if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current); }, []);

  const handleMouseEnterFixture = (id: string) => {
    setHoveredFixtureId(id);
    if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = window.setTimeout(() => setDwellReadyId(id), 850);
  };
  const handleMouseLeaveFixture = () => {
    setHoveredFixtureId(null);
    setDwellReadyId(null);
    if (dwellTimerRef.current) { window.clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
  };

  const targetFixtures = (scenario?.targetIds || [])
    .map((id) => fixtures[id])
    .filter((f): f is FixtureVerification => !!f && !!f.position && activeLayers[layerOf(f.category)]);

  // Xinran's scene exporter keeps drawing evidence in a resolution-independent
  // 0..1000 frame. Convert it only after this exact PNG has loaded.
  const evidenceBbox = useMemo<[number, number, number, number] | null>(() => {
    if (evidenceSource?.bbox) return evidenceSource.bbox;
    if (!evidenceSource?.bboxNorm1000 || !size) return null;
    const [x0, y0, x1, y1] = evidenceSource.bboxNorm1000;
    return [x0 * size[0] / 1000, y0 * size[1] / 1000, x1 * size[0] / 1000, y1 * size[1] / 1000];
  }, [evidenceSource, size]);

  // LoD: 1:200 whole sheet; finer scales zoom on the room / the selected element (true crop, not a fake redraw)
  const viewBox = useMemo(() => {
    if (!size) return '0 0 1000 700';
    const [W, H] = size;
    const bbox = evidenceBbox;
    if (bbox) {
      const [x0, y0, x1, y1] = bbox;
      const rawW = Math.max(x1 - x0, 8), rawH = Math.max(y1 - y0, 8);
      const w = Math.min(W, rawW * 2.2), h = Math.min(H, rawH * 2.2);
      const x = Math.min(Math.max((x0 + x1) / 2 - w / 2, 0), W - w);
      const y = Math.min(Math.max((y0 + y1) / 2 - h / 2, 0), H - h);
      return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
    }
    const z = ZOOM[scale];
    if (z === 1 && targetFixtures.length) {
      // ours: overview = all answer marks framed with a margin, so they are big enough to see at once
      const xs0 = targetFixtures.map((f) => f.position!.x), ys0 = targetFixtures.map((f) => f.position!.y);
      const xs1 = targetFixtures.map((f) => f.position!.x + f.position!.w), ys1 = targetFixtures.map((f) => f.position!.y + f.position!.h);
      const bx0 = Math.min(...xs0), by0 = Math.min(...ys0), bx1 = Math.max(...xs1), by1 = Math.max(...ys1);
      let w = Math.max((bx1 - bx0) * 1.5, W * 0.4), h = Math.max((by1 - by0) * 1.5, H * 0.4);
      const ar = W / H; if (w / h > ar) h = w / ar; else w = h * ar;
      w = Math.min(w, W); h = Math.min(h, H);
      const x = Math.min(Math.max((bx0 + bx1) / 2 - w / 2, 0), W - w), y = Math.min(Math.max((by0 + by1) / 2 - h / 2, 0), H - h);
      return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
    }
    if (z === 1) return `0 0 ${W} ${H}`;
    const sel = selectedFixtureId ? fixtures[selectedFixtureId]?.position : null;
    const room = scenario?.roomHighlight;
    let cx = W / 2, cy = H / 2;
    const focus = (z >= 8 && sel) ? sel : (room || sel || targetFixtures[0]?.position || null);
    if (focus) { cx = focus.x + focus.w / 2; cy = focus.y + focus.h / 2; }
    else if (targetFixtures.length) {
      const xs = targetFixtures.map((f) => f.position!.x + f.position!.w / 2);
      const ys = targetFixtures.map((f) => f.position!.y + f.position!.h / 2);
      cx = xs.reduce((a, b) => a + b, 0) / xs.length; cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    }
    const w = W / z, h = H / z;
    const x = Math.min(Math.max(cx - w / 2, 0), W - w), y = Math.min(Math.max(cy - h / 2, 0), H - h);
    return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }, [size, scale, selectedFixtureId, fixtures, scenario, targetFixtures, evidenceBbox]);

  const baseVb = (() => { const [x, y, w, h] = viewBox.split(' ').map(Number); return { x, y, w, h }; })();
  const vb = userView || baseVb;
  const zoomFactor = size ? Math.max(size[0] / vb.w, 1) : ZOOM[scale];
  // marks keep a constant on-screen size whatever the sheet resolution / zoom
  const k = size ? Math.max(size[0], size[1]) / 1200 / zoomFactor : 1;

  const toSvg = (clientX: number, clientY: number) => {
    const el = svgRef.current; if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sc = Math.min(r.width / vb.w, r.height / vb.h);
    const ox = (r.width - vb.w * sc) / 2, oy = (r.height - vb.h * sc) / 2;
    return { x: vb.x + (clientX - r.left - ox) / sc, y: vb.y + (clientY - r.top - oy) / sc };
  };
  const clampVb = (v: { x: number; y: number; w: number; h: number }) => {
    if (!size) return v;
    const w = Math.min(Math.max(v.w, size[0] / 24), size[0]), h = w * (v.h / v.w);
    return { w, h, x: Math.min(Math.max(v.x, -w * 0.25), size[0] - w * 0.75), y: Math.min(Math.max(v.y, -h * 0.25), size[1] - h * 0.75) };
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const f = Math.exp(Math.max(-0.2, Math.min(0.2, e.deltaY * 0.0015)));  // smooth, ≤ ~20 % per event (touchpads)
    const p = toSvg(e.clientX, e.clientY);
    setUserView(clampVb({ x: p.x - (p.x - vb.x) * f, y: p.y - (p.y - vb.y) * f, w: vb.w * f, h: vb.h * f }));
  };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'fix' && (e.target as Element).tagName === 'image') {
      const p = toSvg(e.clientX, e.clientY); setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      svgRef.current?.setPointerCapture(e.pointerId); return;
    }
    if (tool === 'measure') { const p = toSvg(e.clientX, e.clientY); onMeasurePoint?.([p.x, p.y]); return; }
    dragRef.current = { x: e.clientX, y: e.clientY, vb, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draft) { const p = toSvg(e.clientX, e.clientY); setDraft({ ...draft, x1: p.x, y1: p.y }); return; }
    const d = dragRef.current; const el = svgRef.current; if (!d || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; el.setPointerCapture(e.pointerId); }
    const r = el.getBoundingClientRect(); const sc = Math.min(r.width / d.vb.w, r.height / d.vb.h);
    setUserView(clampVb({ ...d.vb, x: d.vb.x - dx / sc, y: d.vb.y - dy / sc }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draft) {
      const b = { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) };
      setDraft(null); try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* */ }
      if (b.w > 3 && b.h > 3) onAddBox?.(b);
      return;
    }
    const d = dragRef.current; dragRef.current = null;
    if (d?.moved) { try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ } }
  };
  // React's wheel listener is passive (cannot stop the page scrolling): attach a native one
  const wheelRef = useRef(onWheel); wheelRef.current = onWheel;
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  const vbString = `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`;
  const dwellFixture = dwellReadyId ? fixtures[dwellReadyId] : null;
  const poly = scenario?.roomPolygon;

  return (
    <div className="relative bg-[#FCFCF9] blueprint-grid-bg">
      <svg ref={svgRef} viewBox={vbString} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerUp} style={{ touchAction: 'none', cursor: tool === 'fix' || tool === 'measure' ? 'crosshair' : dragRef.current?.moved ? 'grabbing' : 'grab' }}
        className="w-full h-[520px] select-none block" role="img"
        aria-label={`Floor plan ${activeFloor} at scale ${scale}`}>
        {!failed && (
          <image href={url} x={0} y={0} width={size?.[0] || 1000} height={size?.[1] || 700}
            preserveAspectRatio="xMinYMin meet" opacity={activeLayers.architecture ? 1 : 0.25}
            onLoad={() => {
              const img = new Image();
              img.onload = () => { const s: [number, number] = [img.naturalWidth, img.naturalHeight]; setSize(s); onImageSize?.(s); };
              img.src = url;
            }}
            onError={() => setFailed(true)} />
        )}

        {/* target room: Gigi's amber room wash */}
        {scenario && (poly && poly.length > 2 ? (
          <polygon points={poly.map((p) => p.join(',')).join(' ')} fill="#E9B949" fillOpacity={0.14}
            stroke="#E9B949" strokeWidth={2.4 * k} strokeDasharray={`${8 * k} ${5 * k}`} />
        ) : scenario.roomHighlight ? (
          <rect x={scenario.roomHighlight.x} y={scenario.roomHighlight.y} width={scenario.roomHighlight.w}
            height={scenario.roomHighlight.h} fill="#E9B949" fillOpacity={0.14} stroke="#E9B949"
            strokeWidth={2.4 * k} strokeDasharray={`${8 * k} ${5 * k}`} />
        ) : null)}

        {/* dimension chain for the room (only real numbers from /api/plan/rooms) */}
        {activeLayers.dimensions && scenario?.roomHighlight && scenario.roomDimensions.startsWith('L ') && (
          <g fontFamily="IBM Plex Mono, monospace" fontSize={11 * k} fill="#202427">
            <line x1={scenario.roomHighlight.x} y1={scenario.roomHighlight.y - 14 * k}
              x2={scenario.roomHighlight.x + scenario.roomHighlight.w} y2={scenario.roomHighlight.y - 14 * k}
              stroke="#202427" strokeWidth={1 * k} />
            <rect x={scenario.roomHighlight.x + scenario.roomHighlight.w / 2 - 70 * k} y={scenario.roomHighlight.y - 30 * k}
              width={140 * k} height={16 * k} rx={3 * k} fill="#FFF8E1" stroke="#D49A1A" strokeWidth={0.8 * k} />
            <text x={scenario.roomHighlight.x + scenario.roomHighlight.w / 2} y={scenario.roomHighlight.y - 18.5 * k}
              textAnchor="middle">{scenario.roomDimensions.split(' × H')[0]}</text>
          </g>
        )}

        {/* ours: dim the sheet around the answer so the marks stand out (holes cut at every mark) */}
        {targetFixtures.length > 0 && size && (
          <g pointerEvents="none">
            <defs>
              <mask id="trace-answer-mask">
                <rect x={0} y={0} width={size[0]} height={size[1]} fill="white" />
                {targetFixtures.map((f) => { const q = f.position!; const m = 14 * k;
                  return <rect key={`m-${f.id}`} x={q.x - m} y={q.y - m} width={q.w + 2 * m} height={q.h + 2 * m} rx={6 * k} fill="black" />; })}
              </mask>
            </defs>
            <rect x={0} y={0} width={size[0]} height={size[1]} fill="#202427" fillOpacity={0.32} mask="url(#trace-answer-mask)" />
          </g>
        )}
        {/* target fixtures: amber if verified, RED if not (Gigi's rule) */}
        <g>
          {targetFixtures.map((fixture, idx) => {
            const p = fixture.position!;
            const isSelected = selectedFixtureId === fixture.id;
            const isHovered = hoveredFixtureId === fixture.id;
            // red only for reported problems; elements nobody has checked yet are neutral
            const st = fixture.status;
            const isUnverified = st === 'Issue Reported';
            const notChecked = st === 'Not checked';
            const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
            const fillColor = isUnverified ? '#EF4444' : notChecked ? '#A9AFB0' : st === 'Installed' ? '#E9B949' : '#F3D58A';
            const strokeColor = isUnverified ? '#B91C1C' : '#C98A12';  // ours: every answer mark gets a strong outline
            const tagTextColor = isUnverified ? '#FCA5A5' : notChecked ? '#E8E6DF' : '#E9B949';
            const pad = 10 * k;
            return (
              <g key={fixture.id} onClick={() => (tool === 'fix' ? onToggleRemove?.(fixture.id) : onSelectFixtureFor3D(fixture.id))}
                opacity={removed?.has(fixture.id) ? 0.25 : 1}
                onMouseEnter={() => handleMouseEnterFixture(fixture.id)} onMouseLeave={handleMouseLeaveFixture}
                className="cursor-pointer" role="button" tabIndex={0} aria-label={`Inspect ${fixture.label} in 3D`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFixtureFor3D(fixture.id); } }}>
                <rect x={p.x - pad - 5 * k} y={p.y - pad - 5 * k} width={p.w + 2 * pad + 10 * k} height={p.h + 2 * pad + 10 * k} rx={6 * k}
                  fill="none" stroke={isUnverified ? '#EF4444' : '#E9B949'} strokeOpacity={0.45} strokeWidth={6 * k}>
                  <animate attributeName="stroke-opacity" values="0.15;0.6;0.15" dur="1.8s" repeatCount="indefinite" />
                </rect>
                <rect x={p.x - pad} y={p.y - pad} width={p.w + 2 * pad} height={p.h + 2 * pad} rx={3 * k}
                  fill={fillColor} fillOpacity={isSelected || isHovered ? 0.6 : notChecked ? 0.28 : 0.42} stroke={strokeColor}
                  strokeWidth={(isSelected ? 3.6 : 3) * k} />
                <circle cx={p.x - pad} cy={p.y - pad} r={11 * k} fill={strokeColor} stroke="#FCFCF9" strokeWidth={1.6 * k} />
                <text x={p.x - pad} y={p.y - pad + 4 * k} textAnchor="middle" fill="#FFFFFF" fontSize={11.5 * k} fontWeight="700"
                  fontFamily="DM Sans, sans-serif">{idx + 1}</text>
                {idx === 0 && (
                  <g>
                    <polyline points={`${cx},${cy} ${cx + 38 * k},${cy - 34 * k} ${cx + 96 * k},${cy - 34 * k}`}
                      fill="none" stroke="#C98A12" strokeWidth={1.6 * k} />
                    <rect x={cx + 38 * k} y={cy - 54 * k} width={78 * k} height={20 * k} rx={4 * k} fill="#E9B949"
                      stroke="#C98A12" strokeWidth={0.8 * k} />
                    <text x={cx + 77 * k} y={cy - 41 * k} textAnchor="middle" fill="#202427" fontSize={8.5 * k}
                      fontWeight="600" fontFamily="DM Sans, sans-serif">Evidence 01</text>
                  </g>
                )}
                <rect x={p.x - 5 * k} y={p.y + p.h + 8 * k} width={Math.max(p.w + 16 * k, fixture.code.length * 4.2 * k + 8 * k)}
                  height={14 * k} rx={2.5 * k} fill={isUnverified ? '#7F1D1D' : '#202427'} />
                <text x={p.x - 5 * k + Math.max(p.w + 16 * k, fixture.code.length * 4.2 * k + 8 * k) / 2}
                  y={p.y + p.h + 18 * k} textAnchor="middle" fill={tagTextColor} fontSize={7 * k} fontWeight="700"
                  fontFamily="IBM Plex Mono, monospace">{fixture.code}</text>
              </g>
            );
          })}
        </g>

        {/* ours: review edits */}
        {added.map((b, i) => (
          <g key={`add-${i}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3 * k} fill="#22C55E" fillOpacity={0.25} stroke="#15803D" strokeWidth={2 * k} strokeDasharray={`${5 * k} ${3 * k}`} />
            <text x={b.x + b.w / 2} y={b.y - 4 * k} textAnchor="middle" fontSize={8 * k} fontFamily="IBM Plex Mono, monospace" fill="#15803D" fontWeight="700">+ added</text>
          </g>
        ))}
        {evidenceBbox && (
          <g className="pointer-events-none">
            <rect x={evidenceBbox[0]} y={evidenceBbox[1]}
              width={evidenceBbox[2] - evidenceBbox[0]} height={evidenceBbox[3] - evidenceBbox[1]}
              fill="#E9B949" fillOpacity={0.13} stroke="#C98A12" strokeWidth={2.5 * k} />
            <text x={evidenceBbox[0]} y={Math.max(12 * k, evidenceBbox[1] - 5 * k)}
              fill="#202427" fontSize={11 * k} fontFamily="ui-monospace, monospace">{evidenceSource?.label || '3D source evidence'}</text>
          </g>
        )}
        {draft && <rect x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)} width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} fill="#22C55E" fillOpacity={0.15} stroke="#15803D" strokeWidth={1.5 * k} />}
        {measurePts.length > 0 && (
          <g>
            <polyline points={measurePts.map((p) => p.join(',')).join(' ')} fill={measurePts.length > 2 ? '#E9B949' : 'none'} fillOpacity={0.15} stroke="#C98A12" strokeWidth={2 * k} />
            {measurePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4 * k} fill="#C98A12" stroke="#FCFCF9" strokeWidth={1 * k} />)}
          </g>
        )}
      </svg>

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-[#202427]/60 p-6 text-center">
          This sheet could not be rendered ({path.split('/').pop()}). Ask a question to see the evidence list.
        </div>
      )}

      {/* Hover-Dwell (>0.85s) Site Photo Verification Popover */}
      {dwellFixture && (
        <div className={`absolute bottom-9 left-3 z-20 w-72 rounded-xl bg-[#202427] text-[#F7F6F2] border shadow-xl overflow-hidden pointer-events-none ${dwellFixture.verified ? 'border-[#E9B949]/80' : 'border-red-500'}`} role="status">
          <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <span className={`text-xs font-mono font-semibold ${dwellFixture.verified ? 'text-[#E9B949]' : 'text-red-400'}`}>
              {dwellFixture.code} · {dwellFixture.photoLabel}
            </span>
            <span className={`text-[10px] font-mono ${dwellFixture.verified ? 'text-[#A9AFB0]' : 'text-red-300'}`}>
              {dwellFixture.status}
            </span>
          </div>
          <div className="relative h-36 bg-[#16191B]">
            {dwellFixture.photoDataUrl ? (
              <img src={dwellFixture.photoDataUrl} alt={dwellFixture.label} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] font-mono text-red-300">No site photo yet</div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-1.5 text-[11px] font-mono text-[#F7F6F2]">
              {dwellFixture.verified ? `${dwellFixture.author || 'Team'}${dwellFixture.capturedAt ? ` · ${dwellFixture.capturedAt}` : ''}` : 'Awaiting site verification'}
            </div>
          </div>
          <div className="px-3.5 py-2 text-xs text-[#F7F6F2]/90 flex items-start gap-2">
            {dwellFixture.status === 'Installed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
            {dwellFixture.status === 'Issue Reported' && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
            {dwellFixture.status === 'In Progress' && <Clock className="w-3.5 h-3.5 text-[#E9B949] shrink-0 mt-0.5" />}
            <span className="line-clamp-2">{dwellFixture.note || dwellFixture.label}</span>
          </div>
        </div>
      )}

      {/* Subtle Hint Strip */}
      <div className="px-3.5 py-1.5 border-t border-[#A9AFB0]/25 bg-white flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#202427]/70">
        <span><b className="text-[#C98A12]">■</b> checked · <b className="text-red-600">■</b> issue · <b className="text-[#8A9194]">■</b> not checked yet · drag to move · scroll to zoom · hover &gt;1s for site photo · click for 3D</span>
        {userView && <button type="button" onClick={() => setUserView(null)} className="font-mono text-[#9A7218] underline cursor-pointer">Reset view</button>}
        <span className="font-mono text-[#202427] font-medium">LoD Scale {scale}</span>
      </div>
    </div>
  );
};
