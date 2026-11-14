import { useEffect, useRef } from 'react'
import type { AnswerBadge, AnswerTraceStep, AreaEvidence, AskResponse, Evidence } from '../types'
import { estimateGeminiCostUsd, GEMINI_PRICING } from '../pricing'
import './HowIGotThis.css'

function answerSource(evidence: Evidence): string | null {
  const supplied = evidence.source
  if (typeof supplied === 'string' && supplied.trim()) return supplied.trim()
  if (supplied && typeof supplied === 'object') {
    const label = supplied.label || supplied.kind
    if (label) return label
  }

  const method = (evidence.method || '').toLowerCase()
  if (/yolo|detector/.test(method)) return 'detector'
  if (method.includes('prior')) return 'Prior'
  if (method.includes('box detection') || method.includes('inventory')) return 'detector'
  if (method.startsWith('engine:') || evidence.tool === 'answer_from_engine') return 'geometry'
  if (method.includes('gemini') || method.includes('vision') || evidence.tool === 'count_in_drawing') return 'vision'
  return null
}

const SOURCE_LABELS: Record<string, string> = {
  geometry: 'Geometry', detector: 'Detector (YOLO)', prior: 'Prior', vision: 'Vision LLM',
}

function badgeFor(response: AskResponse): AnswerBadge | null {
  return response.summary?.badge
    || response.evidence.find((item) => item.badge)?.badge
    || response.trace?.find((step) => step.badge)?.badge
    || null
}

function seconds(value: number) {
  return `${value.toFixed(1)} s`
}

function stepClass(step: AnswerTraceStep) {
  if (step.kind === 'check') return step.ok === false ? 'trace-check failed' : 'trace-check passed'
  return `trace-${step.kind}`
}

export function HowIGotThis({ response, areaEvidence, selectedAreaRoom, onSelectAreaRoom }: {
  response: AskResponse
  areaEvidence?: AreaEvidence | null
  selectedAreaRoom?: string | null
  onSelectAreaRoom?: (room: string) => void
}) {
  const evidence = response.evidence || []
  const trace = response.trace || []
  const usage = response.usage
  const summary = response.summary
  const sourceCode = summary?.source || evidence.find((item) => item.source)?.source
  const sourceKind = typeof sourceCode === 'string' ? sourceCode.toLowerCase()
    : sourceCode && typeof sourceCode === 'object' ? (sourceCode.kind || '').toLowerCase() : ''
  const inferredSource = evidence.map(answerSource).find(Boolean) || null
  const sourceLabel = sourceKind === 'needs_vision' ? null
    : SOURCE_LABELS[sourceKind] || (sourceKind ? summary?.source_label || evidence.find((item) => item.source)?.source_label || sourceKind : inferredSource
      ? SOURCE_LABELS[inferredSource.toLowerCase()] || inferredSource : null)
  const answerBadge = badgeFor(response)
  const boxCount = evidence.flatMap((item) => item.sources || [])
    .filter((source) => Array.isArray(source.bbox) && source.bbox.length === 4).length
  const elementCount = evidence.reduce((total, item) => total + (item.items?.length || 0), 0)
  const evidenceCount = boxCount ? `${boxCount} ${boxCount === 1 ? 'box' : 'boxes'}`
    : elementCount ? `${elementCount} ${elementCount === 1 ? 'element' : 'elements'}` : 'No boxes or elements'
  const methods = summary?.method ? [summary.method]
    : [...new Set(evidence.map((item) => item.method).filter((method): method is string => Boolean(method)))]
  const warnings = [...new Set([...(summary?.warnings || []), ...evidence.flatMap((item) => item.warnings || [])])]
  const engineTime = trace.filter((step) => step.kind === 'tool'
    && (step.title.includes('answer_from_engine') || step.method?.startsWith('engine:')))
    .reduce((total, step) => total + (step.elapsed_s || 0), 0)
  const engineMs = summary?.engine_ms ?? evidence.find((item) => item.engine_ms !== undefined)?.engine_ms
    ?? trace.find((step) => step.engine_ms !== undefined)?.engine_ms ?? engineTime * 1000
  const llmTime = summary?.llm_s ?? (response.timing?.gemini_calls_s || []).reduce((total, value) => total + value, 0)
  const inputTokens = usage?.input || 0
  const outputTokens = usage?.output || 0
  const thinkingTokens = usage?.thinking || 0
  const totalTokens = summary?.llm_tokens ?? inputTokens + outputTokens + thinkingTokens
  const engineTokens = summary?.engine_tokens ?? 0
  const cached = Boolean(response.from_cache || evidence.some((item) => item.cached))
  const cost = usage?.cost_usd ?? summary?.cost_usd ?? (response.from_cache ? 0 : usage
    ? estimateGeminiCostUsd(inputTokens, outputTokens, thinkingTokens) : null)
  const badgeClass = answerBadge?.color === 'green' ? 'green' : answerBadge?.color === 'yellow' ? 'yellow' : 'grey'
  const answerBoxes = summary?.boxes ?? boxCount
  const answerElements = summary?.evidence_count ?? elementCount
  const evidenceLabel = answerBoxes > 0 ? `${answerBoxes} ${answerBoxes === 1 ? 'box' : 'boxes'}`
    : answerElements > 0 ? `${answerElements} ${answerElements === 1 ? 'element' : 'elements'}` : 'No boxes or elements'
  const selectedRow = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { selectedRow.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [selectedAreaRoom])

  return (
    <details className="how-got-this" open>
      <summary>
        <span>How I got this</span>
        {sourceLabel && <span className="source-badge">{sourceLabel}</span>}
        {answerBadge && <span className={`answer-method-badge ${badgeClass}`}>{answerBadge.text}
          {answerBadge.color === 'yellow' && answerBadge.other_count !== undefined && <b> · Other method: {answerBadge.other_count}</b>}
        </span>}
        <span className="evidence-count">{evidenceLabel || evidenceCount}</span>
        {cached && <span className="cache-badge">From cache</span>}
      </summary>
      <div className="how-got-body">
        {areaEvidence && <section className="area-proof" aria-label="Area calculation evidence">
          <h4>Area calculation</h4>
          <p className="area-formula">{areaEvidence.formula}</p>
          <p className="area-rule">{areaEvidence.rule}</p>
          {areaEvidence.breakdown.map((room, index) => {
            const key = room.number || room.name || String(index + 1)
            const selected = selectedAreaRoom === key
            return <button key={`included-${key}-${index}`} ref={selected ? selectedRow : undefined}
              className={`area-evidence-row included${selected ? ' selected' : ''}`}
              onClick={() => onSelectAreaRoom?.(key)} title={room.net_formula || undefined}>
              <span>{room.number || index + 1}. {room.name || 'Room'}</span>
              <strong>{room.area_m2?.toFixed(2) ?? '—'} m²</strong>
              {room.net_formula && <small>{room.net_formula}</small>}
            </button>
          })}
          {areaEvidence.excluded.map((room, index) => <button key={`excluded-${room.number || room.name || index}`}
            className={`area-evidence-row excluded${selectedAreaRoom === (room.number || room.name) ? ' selected' : ''}`}
            onClick={() => onSelectAreaRoom?.(room.number || room.name || '')} title={room.reason || 'Excluded from total'}>
            <span>{room.number || index + 1}. {room.name || 'Excluded room'}</span>
            <strong>{room.area_m2?.toFixed(2) ?? '—'} m²</strong>
            <small>{room.reason || 'Excluded from total'}</small>
          </button>)}
        </section>}
        {methods.length > 0 && <p className="method-line"><strong>Method:</strong> {methods.join(' · ')}</p>}
        {summary?.interpreted && <p className="interpreted-line"><strong>Interpreted as:</strong> {summary.interpreted}</p>}
        <div className="trace-timing">
          <span><strong>Engine</strong> {engineMs.toFixed(0)} ms · {engineTokens.toLocaleString()} tokens · €0</span>
          <span><strong>LLM</strong> {seconds(llmTime)} · {totalTokens.toLocaleString()} tokens</span>
          <span><strong>Estimated Gemini cost</strong> {cost === null ? 'unavailable' : `$${cost.toFixed(5)}`}
            {cost !== null && <small> · {GEMINI_PRICING.model} standard pricing</small>}
          </span>
        </div>
        {trace.length > 0 ? <ol className="answer-trace">
          {trace.map((step, index) => <li className={stepClass(step)} key={`${step.kind}-${index}`}>
            <span className="trace-kind">{step.kind}</span>
            <div><strong>{step.title}</strong>{step.detail && <p>{step.detail}</p>}
              {step.kind === 'tool' && step.boxes !== undefined && <small>{step.boxes} evidence {step.boxes === 1 ? 'box' : 'boxes'}</small>}
            </div>
          </li>)}
        </ol> : <p className="dim small">Trace steps are unavailable for this response.</p>}
        {warnings.length > 0 && <div className="trace-warnings"><strong>Warnings</strong>
          <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>}
      </div>
    </details>
  )
}
