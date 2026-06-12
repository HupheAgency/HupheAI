import { useEffect, useState } from 'react'

interface VisionModel {
  id: string
  label: string
  description: string
  sizeGb: number
  tag?: string
  installed: boolean
}

interface Props {
  onClose: () => void
  onModelReady?: (modelId: string) => void
}

export default function VisionModelSetup({ onClose, onModelReady }: Props) {
  const [models, setModels] = useState<VisionModel[]>([])
  const [loading, setLoading] = useState(true)
  const [ollamaOnline, setOllamaOnline] = useState(true)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullPct, setPullPct] = useState(0)
  const [pullStatus, setPullStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await (window as any).api.vision.listModels() as VisionModel[]
      setModels(result)
      setOllamaOnline(true)
    } catch {
      setOllamaOnline(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleInstall(modelId: string) {
    setPulling(modelId)
    setPullPct(0)
    setPullStatus('Bezig met laden…')
    setError('')
    try {
      const res = await (window as any).api.vision.pullModel(
        modelId,
        (pct: number, status: string) => {
          setPullPct(pct)
          setPullStatus(formatStatus(status))
        },
      ) as { ok: boolean; error?: string }

      if (!res.ok) {
        setError(res.error ?? 'Installeren mislukt.')
      } else {
        setModels((prev) => prev.map((m) => m.id === modelId ? { ...m, installed: true } : m))
        onModelReady?.(modelId)
      }
    } catch (err: any) {
      setError(err.message ?? 'Installeren mislukt.')
    } finally {
      setPulling(null)
      setPullPct(0)
      setPullStatus('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.07] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Visionmodel installeren</h2>
            <p className="mt-0.5 text-xs text-white/40">
              Analyseer afbeeldingen lokaal op je computer — geen cloud, geen kosten.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {!ollamaOnline && (
            <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200">
              Ollama draait niet. Start Ollama eerst via{' '}
              <span className="font-mono text-yellow-100">ollama serve</span> of de Ollama app.
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-white/30 text-sm">Laden…</div>
          ) : (
            models.map((model) => {
              const isPulling = pulling === model.id
              return (
                <div
                  key={model.id}
                  className="rounded-xl border border-white/[0.07] bg-[#0f0f0f] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{model.label}</span>
                        {model.tag && (
                          <span className="rounded-full bg-[#facc15]/10 px-2 py-0.5 text-[10px] font-semibold text-[#facc15]">
                            {model.tag}
                          </span>
                        )}
                        {model.installed && (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                            Geïnstalleerd
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-white/40">{model.description}</p>
                      <p className="mt-1 text-[10px] text-white/25">{model.sizeGb} GB</p>
                    </div>

                    {!model.installed && !isPulling && (
                      <button
                        type="button"
                        onClick={() => handleInstall(model.id)}
                        disabled={!!pulling || !ollamaOnline}
                        className="flex-shrink-0 rounded-lg bg-[#facc15] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#fde047] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Installeer
                      </button>
                    )}

                    {model.installed && (
                      <button
                        type="button"
                        onClick={() => { onModelReady?.(model.id); onClose() }}
                        className="flex-shrink-0 rounded-lg border border-white/[0.08] px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white"
                      >
                        Gebruik
                      </button>
                    )}
                  </div>

                  {isPulling && (
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-[#facc15] transition-all duration-300"
                          style={{ width: `${pullPct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-white/35">
                        {pullPct > 0 ? `${pullPct}%` : ''} {pullStatus}
                      </p>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {error && (
            <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}

          <p className="text-[10px] text-white/25 leading-relaxed">
            Modellen worden lokaal opgeslagen via Ollama. Je hebt Ollama nodig — download via{' '}
            <span className="text-white/40">ollama.com</span>.
            Eenmalige download; daarna werkt het offline.
          </p>
        </div>
      </div>
    </div>
  )
}

function formatStatus(status: string): string {
  if (status === 'success') return 'Klaar'
  if (status.startsWith('pulling')) return 'Downloaden…'
  if (status.startsWith('verifying')) return 'Verifiëren…'
  if (status.startsWith('writing')) return 'Opslaan…'
  return status
}

function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
