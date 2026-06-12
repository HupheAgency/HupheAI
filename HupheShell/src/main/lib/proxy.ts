import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SUPABASE_FUNCTIONS_URL = `${(import.meta as any).env?.MAIN_VITE_SUPABASE_URL ?? ''}/functions/v1`

function loadKey(name: string): string | null {
  const p = join(app.getPath('userData'), `${name}.enc`)
  if (!existsSync(p)) return null
  try { return safeStorage.decryptString(readFileSync(p)) } catch { return null }
}

function getJwt(): string | null {
  return loadKey('supabase_jwt')
}

function proxyHeaders(jwt: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`,
  }
}

export class InsufficientCreditsError extends Error {
  constructor() { super('Onvoldoende credits. Waardeer je wallet op om verder te gaan.') }
}

export class WalletBlockedError extends Error {
  constructor() { super('Wallet geblokkeerd. Neem contact op met de beheerder.') }
}

/**
 * Stuur een verzoek naar de proxy-openrouter Edge Function.
 * Geeft de raw OpenRouter response terug (zelfde formaat als directe call).
 */
export async function callOpenRouter(
  body: Record<string, unknown>,
  jwt: string,
): Promise<Response> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-openrouter`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify(body),
  })

  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }

  return res
}

/**
 * Stuur een verzoek naar de proxy-fal-ai Edge Function.
 * Geeft de raw Fal.ai response als JSON terug.
 */
export async function callFalProxy(
  modelId: string,
  params: Record<string, unknown>,
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-ai`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({ model_id: modelId, ...params }),
  })

  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fal.ai proxy ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

export { getJwt }
