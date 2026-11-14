// Gemini 3.8 Flash standard paid-tier estimate (USD per 1M tokens).
// Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-11-14).
export const GEMINI_PRICING = {
  model: 'Gemini 3.8 Flash',
  inputUsdPerMillion: 0.75,
  outputUsdPerMillion: 3.75,
}

export function estimateGeminiCostUsd(inputTokens: number, outputTokens: number, thinkingTokens: number): number {
  return (inputTokens * GEMINI_PRICING.inputUsdPerMillion
    + (outputTokens + thinkingTokens) * GEMINI_PRICING.outputUsdPerMillion) / 1_000_000
}
