import { useEffect, useRef, useState } from 'react'
import { drawingUrl } from './api'
import LicenseBadge from './components/LicenseBadge'
import type { Source } from './types'

interface Props {
  path: string
  page: number
  sources: Source[]
  selected: number | null
  onSelect: (i: number) => void
  flash?: Set<number> // boxes of a room that just changed (Room Board)
}

/** Shows one drawing page as an image with an SVG layer on top; every source bbox becomes a numbered box. */
export default function DrawingViewer({ path, page, sources, selected, onSelect, flash }: Props) {
  const [size, setSize] = useState<[number, number] | null>(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSize(null)
    setError('')
  }, [path, page])

  // scroll the selected box into view
  useEffect(() => {
    if (selected == null || !size || !wrap.current) return
    const [x0, y0, x1, y1] = sources[selected].bbox
    const el = wrap.current
    const scale = (el.scrollWidth / size[0])
    el.scrollTo({
      left: ((x0 + x1) / 2) * scale - el.clientWidth / 2,
      top: ((y0 + y1) / 2) * scale - el.clientHeight / 2,
      behavior: 'smooth',
    })
  }, [selected, size, sources])

  if (!path) return <div className="viewer empty">Select a question or enter a drawing path to preview here</div>

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <span className="path">{path}{page > 1 ? ` · p.${page}` : ''}</span>
        <button onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(6, z * 1.25))}>+</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="canvas" ref={wrap}>
        <div className="stack" style={{ width: size ? size[0] * zoom : undefined }}>
          <img
            src={drawingUrl(path, page)}
            onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
            onError={() => setError('Failed to load drawing (invalid path, or unsupported preview format e.g. IFC/DXF)')}
            style={{ width: '100%' }}
            alt={path}
          />
          {size && (
            <svg className="overlay" viewBox={`0 0 ${size[0]} ${size[1]}`} preserveAspectRatio="none">
              {sources.map((s, i) => {
                const [x0, y0, x1, y1] = s.bbox
                const on = i === selected
                const cls = `box${on ? ' on' : ''}${flash?.has(i) ? ' flash' : ''}`
                return (
                  <g key={i} onClick={() => onSelect(i)} className={cls}>
                    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} vectorEffect="non-scaling-stroke" />
                    <text x={x0} y={y0 - 4} fontSize={Math.max(12, size[0] / 80)}>{s.label ?? i + 1}</text>
                  </g>
                )
              })}
            </svg>
          )}
        </div>
      </div>
      <LicenseBadge path={path} />
    </div>
  )
}
