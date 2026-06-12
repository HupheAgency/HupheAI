// Wallet RPCs response types
export interface WalletCreditResult { balance: bigint }
export interface WalletDebitResult  { balance: bigint }
export interface ReserveResult      { reservation_id: string }
export interface SettleResult       { refunded_amount: bigint }
export interface ReleaseResult      { released_amount: bigint }

// AI model uit de database
export interface AiModel {
  id: string
  provider: 'openrouter' | 'fal'
  model_id: string
  input_cost_per_1k: number
  output_cost_per_1k: number
  image_cost: number
  markup_pct: number
  active: boolean
  price_version: number
}

// Standaard Edge Function error response
export interface EdgeError {
  error: string
  code?: 'insufficient_balance' | 'unauthorized' | 'model_not_found' | 'upstream_error'
}

// OpenRouter usage (uit API-respons)
export interface OpenRouterUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// Fal.ai job respons (vereenvoudigd)
export interface FalResult {
  images?: Array<{ url: string }>
  timings?: { inference: number }
}
