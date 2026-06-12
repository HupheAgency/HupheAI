const OLLAMA_BASE = 'http://localhost:11434'

export interface VisionModelOption {
  id: string
  label: string
  description: string
  sizeGb: number
  tag?: string
}

export const VISION_MODELS: VisionModelOption[] = [
  {
    id: 'llava',
    label: 'LLaVA 7B',
    description: 'Beste kwaliteit, breed compatibel',
    sizeGb: 4.7,
    tag: 'Aanbevolen',
  },
  {
    id: 'moondream',
    label: 'Moondream 2',
    description: 'Lichtgewicht en snel — ideaal voor beperkt RAM',
    sizeGb: 1.7,
    tag: 'Snel',
  },
]

export const DEFAULT_VISION_PROMPT =
  'Beschrijf deze afbeelding in maximaal 3 zinnen vanuit een marketingperspectief: het onderwerp, de sfeer, de kleuren en de doelgroep. Antwoord in het Nederlands.'

export async function isModelInstalled(modelId: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return false
    const json = await res.json() as { models: { name: string }[] }
    return (json.models ?? []).some((m) => m.name === modelId || m.name.startsWith(`${modelId}:`))
  } catch {
    return false
  }
}

export async function pullModel(
  modelId: string,
  onProgress: (pct: number, status: string) => void,
): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelId, stream: true }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`Ollama pull mislukt (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as { status?: string; total?: number; completed?: number }
        const status = obj.status ?? ''
        const pct = obj.total && obj.completed ? Math.round((obj.completed / obj.total) * 100) : 0
        onProgress(pct, status)
      } catch { /* ignore malformed lines */ }
    }
  }
}

export async function analyzeImage(
  base64src: string,
  modelId: string,
  prompt = DEFAULT_VISION_PROMPT,
): Promise<string> {
  // Strip the data URL prefix (data:image/jpeg;base64,...)
  const base64 = base64src.includes(',') ? base64src.split(',')[1] : base64src

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt, images: [base64] }],
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Vision analyse mislukt (${res.status}): ${text}`)
  }

  const json = await res.json() as { message?: { content?: string } }
  const content = json.message?.content?.trim()
  if (!content) throw new Error('Geen antwoord van het visionmodel.')
  return content
}
