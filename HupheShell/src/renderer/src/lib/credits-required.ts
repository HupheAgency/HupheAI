export const CREDITS_REQUIRED_EVENT = 'huphe:credits-required'

type CreditsRequiredDetail = {
  message?: string
}

function messageFromError(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [
      record.error,
      record.message,
      record.status,
      record.statusCode,
      record.code,
    ]
    return parts.filter((part) => part !== undefined && part !== null).join(' ')
  }
  return String(error)
}

export function isCreditsRequiredError(error: unknown): boolean {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : null
  const status = Number(record?.status ?? record?.statusCode)
  if (status === 402) return true

  const message = messageFromError(error).toLowerCase()
  if (status === 403 && /\b(credits?|wallet|saldo|billing|payment|betaling)\b/.test(message)) return true

  return [
    'onvoldoende credits',
    'payment required',
    'credits op',
    'geen credits',
    'wallet blocked',
    'waardeer je wallet op',
    'saldo',
  ].some((needle) => message.includes(needle))
}

export function notifyCreditsRequired(detail: CreditsRequiredDetail = {}) {
  window.dispatchEvent(new CustomEvent(CREDITS_REQUIRED_EVENT, { detail }))
}

export function notifyIfCreditsRequired(error: unknown): boolean {
  if (!isCreditsRequiredError(error)) return false
  notifyCreditsRequired({ message: messageFromError(error) })
  return true
}
