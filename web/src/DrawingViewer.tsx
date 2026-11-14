import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { drawingUrl } from './api'
import LicenseBadge from './components/LicenseBadge'
import type { AreaEvidence, AreaEvidenceRoom, Source } from './types'
import './drawing.css'

interface Props {
  path: string
  page: number
  sources: Source[]
  selected: number | null
  onSelect: (i: number) => void
  flash?: Set<number> // boxes of a room that just changed (Room Board)
  areaEvidence?: AreaEvidence | null
  selectedAreaRoom?: string | null
  onSelectAreaRoom?: (room: string) => void
}

function areaPolygon(room: AreaEvidenceRoom, path: string): [number, number][] {
  const pdfPath = path.toLowerCase().endsWith('.pdf')
  if (pdfPath && room.pdf_polygon_pt?.length) return room.pdf_polygon_pt.map(([x, y]) => [x * 150 / 72, y * 150 / 72])
  return room.png_polygon || room.pdf_polygon_pt?.map(([x, y]) => [x * 150 / 72, y * 150 / 72]) || []
}

function polygonCenter(points: [number, number][]): [number, number] {
  if (!points.length) return [0, 0]
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length]
}

/** Shows one drawing page as an image with an SVG layer on top; every source bbox becomes a numbered box. */
export default function DrawingViewer({ path, page, sources, selected, onSelect, flash, areaEvidence, selectedAreaRoom, onSelectAreaRoom }: Props) {
  const [size, setSize] = useState<[number, number] | null>(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [hovered, setHovered] = useState<number | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const wrap = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const pendingZoomRef = useRef<number | null>(null)
  const targetPointRef = useRef<{ drawingX: number; drawingY: number; clientX: number; clientY: number } | null>(null)

  const isDraggingRef = useRef(false)
  const hasMovedRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })
  const justDraggedRef = useRef(false)

  // Reset state on path/page change
  useEffect(() => {
    setSize(null)
    setError('')
    setHovered(null)
  }, [path, page])

  const fitToScreen = (naturalW?: number, naturalH?: number) => {
    const w = naturalW ?? size?.[0]
    const h = naturalH ?? size?.[1]
    if (!w || !h || !wrap.current) return
    const el = wrap.current
    const pad = 32
    const availW = Math.max(100, el.clientWidth - pad)
    const availH = Math.max(100, el.clientHeight - pad)
    const fitZoom = Math.min(availW / w, availH / h)
    const clampedZoom = Math.max(0.05, Math.min(6, fitZoom))
    setZoom(clampedZoom)
    requestAnimationFrame(() => {
      if (wrap.current) {
        wrap.current.scrollLeft = 0
        wrap.current.scrollTop = 0
      }
    })
  }

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth
    const h = e.currentTarget.naturalHeight
    setSize([w, h])
    fitToScreen(w, h)
  }

  // Zoom smoothly around a given screen coordinate (or viewport center)
  const zoomAroundPoint = (factor: number, clientX?: number, clientY?: number) => {
    if (!wrap.current || !stackRef.current || !size) return
    const el = wrap.current
    const stack = stackRef.current
    const wrapRect = el.getBoundingClientRect()

    const cx = clientX ?? (wrapRect.left + wrapRect.width / 2)
    const cy = clientY ?? (wrapRect.top + wrapRect.height / 2)

    const stackRect = stack.getBoundingClientRect()
    if (stackRect.width === 0 || stackRect.height === 0) return

    const curZ = pendingZoomRef.current ?? zoomRef.current
    const newZoom = Math.max(0.05, Math.min(10, curZ * factor))
    if (Math.abs(newZoom - curZ) < 0.001) return
    pendingZoomRef.current = newZoom

    const drawingX = Math.max(0, Math.min(size[0], ((cx - stackRect.left) / stackRect.width) * size[0]))
    const drawingY = Math.max(0, Math.min(size[1], ((cy - stackRect.top) / stackRect.height) * size[1]))

    targetPointRef.current = { drawingX, drawingY, clientX: cx, clientY: cy }
    setZoom(newZoom)
  }

  const zoomIn = () => zoomAroundPoint(1.25)
  const zoomOut = () => zoomAroundPoint(1 / 1.25)
  const handleFit = () => fitToScreen()

  // Adjust scroll after zoom updates so that cursor stays locked to the same drawing point
  useLayoutEffect(() => {
    zoomRef.current = zoom
    if (!targetPointRef.current || !wrap.current || !stackRef.current || !size) return
    const { drawingX, drawingY, clientX, clientY } = targetPointRef.current
    targetPointRef.current = null
    pendingZoomRef.current = null

    const el = wrap.current
    const stack = stackRef.current
    const wrapRect = el.getBoundingClientRect()

    const mouseInWrapX = clientX - wrapRect.left
    const mouseInWrapY = clientY - wrapRect.top

    const pointInStackX = (drawingX / size[0]) * stack.offsetWidth
    const pointInStackY = (drawingY / size[1]) * stack.offsetHeight

    el.scrollLeft = stack.offsetLeft + pointInStackX - mouseInWrapX
    el.scrollTop = stack.offsetTop + pointInStackY - mouseInWrapY
  }, [zoom, size])

  // Mouse wheel zooms around cursor
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      zoomAroundPoint(factor, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [size])

  // Click-and-drag pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDraggingRef.current = true
    hasMovedRef.current = false
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: wrap.current ? wrap.current.scrollLeft : 0,
      scrollTop: wrap.current ? wrap.current.scrollTop : 0,
    }
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !wrap.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      if (!hasMovedRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasMovedRef.current = true
        setIsPanning(true)
      }
      if (hasMovedRef.current) {
        wrap.current.scrollLeft = dragStartRef.current.scrollLeft - dx
        wrap.current.scrollTop = dragStartRef.current.scrollTop - dy
      }
    }

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setIsPanning(false)
        if (hasMovedRef.current) {
          justDraggedRef.current = true
          setTimeout(() => {
            justDraggedRef.current = false
          }, 50)
        }
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Scroll the selected box into view
  useEffect(() => {
    if (selected == null || !size || !wrap.current || !sources[selected]) return
    const [x0, y0, x1, y1] = sources[selected].bbox
    const el = wrap.current
    const stack = stackRef.current
    if (!stack) return
    const scale = stack.offsetWidth / size[0]
    const boxCenterX = stack.offsetLeft + ((x0 + x1) / 2) * scale
    const boxCenterY = stack.offsetTop + ((y0 + y1) / 2) * scale
    el.scrollTo({
      left: boxCenterX - el.clientWidth / 2,
      top: boxCenterY - el.clientHeight / 2,
      behavior: 'smooth',
    })
  }, [selected, size, sources])

  // Order badges so hovered and selected are rendered on top of overlapping badges
  const orderedIndices = useMemo(() => {
    const indices = sources.map((_, i) => i)
    indices.sort((a, b) => {
      const aPrio = (a === selected ? 2 : 0) + (a === hovered ? 1 : 0)
      const bPrio = (b === selected ? 2 : 0) + (b === hovered ? 1 : 0)
      return aPrio - bPrio
    })
    return indices
  }, [sources, selected, hovered])

  if (!path) return <div className="viewer empty">Select a question or enter a drawing path to preview here</div>

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <span className="path">{path}{page > 1 ? ` · p.${page}` : ''}</span>
        <button onClick={zoomOut} title="Zoom out">−</button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} title="Zoom in">+</button>
        <button onClick={handleFit} title="Fit whole drawing into view" className="fit-btn">Fit</button>
      </div>

      <div className="viewer-hint">
        <span className="hint-pill" />
        <span>Orange boxes = items found. Click a number to see it. Scroll to zoom, drag to move.</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div
        className={`canvas${isPanning ? ' panning' : ''}`}
        ref={wrap}
        onMouseDown={handleMouseDown}
      >
        <div
          className="stack"
          ref={stackRef}
          style={{ width: size ? size[0] * zoom : undefined }}
        >
          <img
            src={drawingUrl(path, page)}
            onLoad={handleImageLoad}
            onError={() => setError('Failed to load drawing (invalid path, or unsupported preview format e.g. IFC/DXF)')}
            style={{ width: '100%' }}
            alt={path}
            draggable={false}
          />
          {size && (
            <svg
              className="overlay"
              viewBox={`0 0 ${size[0]} ${size[1]}`}
              preserveAspectRatio="none"
            >
              {/* Layer 1: Box outlines and fills */}
              <g className="rects-layer">
                {sources.map((s, i) => {
                  const [x0, y0, x1, y1] = s.bbox
                  const minX = Math.min(x0, x1)
                  const minY = Math.min(y0, y1)
                  const w = Math.abs(x1 - x0)
                  const h = Math.abs(y1 - y0)
                  const on = i === selected
                  const isHovered = i === hovered
                  const cls = `box${on ? ' on' : ''}${isHovered ? ' hover' : ''}${flash?.has(i) ? ' flash' : ''}`
                  return (
                    <rect
                      key={`rect-${i}`}
                      x={minX}
                      y={minY}
                      width={w}
                      height={h}
                      className={cls}
                      vectorEffect="non-scaling-stroke"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!justDraggedRef.current && !hasMovedRef.current) onSelect(i)
                      }}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  )
                })}
              </g>

              {areaEvidence && <g className="area-evidence-layer">
                <defs><pattern id="area-excluded-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <rect width="8" height="8" fill="rgba(125,132,135,.18)" />
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#7d8487" strokeWidth="2" />
                </pattern></defs>
                {[...areaEvidence.breakdown.map((room, index) => ({ room, index, excluded: false })),
                  ...areaEvidence.excluded.map((room, index) => ({ room, index, excluded: true }))].map(({ room, index, excluded }) => {
                    const points = areaPolygon(room, path)
                    if (points.length < 3) return null
                    const roomKey = room.number || room.name || String(index + 1)
                    const isSelected = selectedAreaRoom === roomKey
                    const [cx, cy] = polygonCenter(points)
                    const listedIndex = excluded ? areaEvidence.breakdown.length + index : index
                    return <g key={`${excluded ? 'excluded' : 'included'}-${roomKey}-${index}`} className={`area-polygon${excluded ? ' excluded' : ' included'}${isSelected ? ' selected' : ''}`}
                      onClick={(event) => { event.stopPropagation(); onSelectAreaRoom?.(roomKey) }}>
                      <title>{excluded ? room.reason || 'Excluded from total' : room.net_formula || `${roomKey} · ${room.area_m2 ?? ''} m²`}</title>
                      <polygon points={points.map(([x, y]) => `${x},${y}`).join(' ')} vectorEffect="non-scaling-stroke" />
                      <g className="area-number">
                        <circle cx={cx} cy={cy} r={12 / (zoom || 1)} vectorEffect="non-scaling-stroke" />
                        <text x={cx} y={cy} fontSize={10 / (zoom || 1)} textAnchor="middle" dominantBaseline="central">{room.number || listedIndex + 1}</text>
                      </g>
                    </g>
                  })}
              </g>}

              {/* Layer 2: Numbered badges and full labels (hover/selected) */}
              <g className="badges-layer">
                {orderedIndices.map((i) => {
                  const s = sources[i]
                  const [x0, y0, x1, y1] = s.bbox
                  const minX = Math.min(x0, x1)
                  const minY = Math.min(y0, y1)
                  const on = i === selected
                  const isHovered = i === hovered
                  const showLabel = (on || isHovered) && Boolean(s.label)
                  const numStr = String(i + 1)

                  // Scale factor to keep constant screen pixel dimensions
                  const sFactor = zoom || 1
                  const invScale = 1 / sFactor

                  const badgeH = 16 * invScale
                  const badgeW = Math.max(badgeH, (numStr.length * 7 + 8) * invScale)
                  const badgeR = 3 * invScale
                  let badgeX = minX
                  let badgeY = minY
                  if (badgeX + badgeW > size[0]) badgeX = Math.max(0, size[0] - badgeW)
                  if (badgeY + badgeH > size[1]) badgeY = Math.max(0, size[1] - badgeH)

                  const labelText = s.label ?? ''
                  const labelH = 18 * invScale
                  const labelW = (labelText.length * 6.5 + 10) * invScale
                  const labelR = 3 * invScale
                  let labelX = badgeX + badgeW + 3 * invScale
                  let labelY = badgeY
                  if (labelX + labelW > size[0]) {
                    labelX = Math.max(0, badgeX - labelW - 3 * invScale)
                  }
                  if (labelX < 0) {
                    labelX = 0
                    labelY = Math.min(size[1] - labelH, badgeY + badgeH + 2 * invScale)
                  }

                  const badgeCls = `badge-group${on ? ' on' : ''}${isHovered ? ' hover' : ''}${flash?.has(i) ? ' flash' : ''}`

                  return (
                    <g
                      key={`badge-${i}`}
                      className={badgeCls}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!justDraggedRef.current && !hasMovedRef.current) onSelect(i)
                      }}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {/* Numbered badge at corner */}
                      <rect
                        x={badgeX}
                        y={badgeY}
                        width={badgeW}
                        height={badgeH}
                        rx={badgeR}
                        className="badge-bg"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={badgeX + badgeW / 2}
                        y={badgeY + badgeH / 2}
                        fontSize={10 * invScale}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="badge-text"
                      >
                        {numStr}
                      </text>

                      {/* Full label on hover or selected */}
                      {showLabel && (
                        <g className="full-label">
                          <rect
                            x={labelX}
                            y={labelY}
                            width={labelW}
                            height={labelH}
                            rx={labelR}
                            className="full-label-bg"
                            vectorEffect="non-scaling-stroke"
                          />
                          <text
                            x={labelX + labelW / 2}
                            y={labelY + labelH / 2}
                            fontSize={11 * invScale}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="full-label-text"
                          >
                            {labelText}
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>
      </div>
      <LicenseBadge path={path} />
    </div>
  )
}
