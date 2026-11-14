import type { AnswerTraceStep, AskResponse, Evidence } from '../types'
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
  if (method.startsWith('engine:') || evidence.tool === 'answer_from_engine') return 'Geometry'
  if (method.includes('prior')) return 'Prior'
  if (method.includes('box detection') || method.includes('detector') || method.includes('inventory')) return 'Detector'
  if (method.includes('gemini') || method.includes('vision') || evidence.tool === 'count_in_drawing') return 'Vision LLM'
  return null
}

function seconds(value: number) {
  return `${value.toFixed(1)} s`
}

function stepClass(step: AnswerTraceStep) {
  if (step.kind === 'check') return step.ok === false ? 'trace-check failed' : 'trace-check passed'
  return `trace-${step.kind}`
}

export function HowIGotThis({ response }: { response: AskResponse }) {
  const evidence = response.evidence || []
  const trace = response.trace || []
  const usage = response.usage
  const sources = [...new Set(evidence.map(answerSource).filter((source): source is string => Boolean(source)))]
  const boxCount = evidence.flatMap((item) => item.sources || [])
    .filter((source) => Array.isArray(source.bbox) && source.bbox.length === 4).length
  const elementCount = evidence.reduce((total, item) => total + (item.items?.length || 0), 0)
  const evidenceCount = boxCount ? `${boxCount} ${boxCount === 1 ? 'box' : 'boxes'}`
    : elementCount ? `${elementCount} ${elementCount === 1 ? 'element' : 'elements'}` : 'No boxes or elements'
  const methods = [...new Set(evidence.map((item) => item.method).filter((method): method is string => Boolean(method)))]
  const warnings = [...new Set(evidence.flatMap((item) => item.warnings || []))]
  const engineTime = trace.filter((step) => step.kind === 'tool'
    && (step.title.includes('answer_from_engine') || step.method?.startsWith('engine:')))
    .reduce((total, step) => total + (step.elapsed_s || 0), 0)
  const llmTime = (response.timing?.gemini_calls_s || []).reduce((total, value) => total + value, 0)
  const inputTokens = usage?.input || 0
  const outputTokens = usage?.output || 0
  const thinkingTokens = usage?.thinking || 0
  const totalTokens = inputTokens + outputTokens + thinkingTokens
  const cached = Boolean(response.from_cache || evidence.some((item) => item.cached))
  const cost = response.from_cache ? 0 : usage
    ? estimateGeminiCostUsd(inputTokens, outputTokens, thinkingTokens) : null

  return (
    <details className="how-got-this" open>
      <summary>
        <span>How I got this</span>
        {sources.map((source) => <span className="source-badge" key={source}>{source}</span>)}
        <span className="evidence-count">{evidenceCount}</span>
        {cached && <span className="cache-badge">From cache</span>}
      </summary>
      <div className="how-got-body">
        {methods.length > 0 && <p className="method-line"><strong>Method:</strong> {methods.join(' · ')}</p>}
        <div className="trace-timing">
          <span><strong>Engine</strong> {seconds(engineTime)} · 0 tokens · €0</span>
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
