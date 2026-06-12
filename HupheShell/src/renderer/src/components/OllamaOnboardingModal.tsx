import { useState, useEffect } from 'react'

const STORAGE_KEY = 'huphe:ollama-onboarding-done'

export function useOllamaOnboarding() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    // Nog niet eerder getoond — check eerst of Ollama al geïnstalleerd is
    ;(window as any).api.ollamaCheckInstalled?.()
      .then(({ installed }: { installed: boolean }) => {
        if (installed) {
          // Al aanwezig, niet vragen
          localStorage.setItem(STORAGE_KEY, '1')
        } else {
          setShow(true)
        }
      })
      .catch(() => {
        // IPC niet beschikbaar (preload nog niet gebouwd) — stil negeren
      })
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  return { show, dismiss }
}

type Phase = 'prompt' | 'downloading' | 'done' | 'error'

export function OllamaOnboardingModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('prompt')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  function decline() {
    localStorage.setItem(STORAGE_KEY, '1')
    onClose()
  }

  async function install() {
    setPhase('downloading')
    setProgress(0)

    const unsub = (window as any).api.onOllamaInstallProgress((data: { msg: string; progress?: number }) => {
      setStatusMsg(data.msg)
      if (data.progress !== undefined) {
        if (data.progress === -1) {
          setPhase('error')
          setErrorMsg(data.msg)
        } else {
          setProgress(data.progress)
        }
      }
    })

    try {
      const res = await (window as any).api.ollamaInstall()
      unsub()
      if (res.ok) {
        localStorage.setItem(STORAGE_KEY, '1')
        setPhase('done')
      } else {
        setPhase('error')
        setErrorMsg(res.error ?? 'Onbekende fout')
      }
    } catch (e: any) {
      unsub()
      setPhase('error')
      setErrorMsg(e.message ?? 'Onbekende fout')
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.10] bg-[#131313] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-7 pt-7 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#facc15]/10 border border-[#facc15]/20 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-[17px]">Lokale AI met Ollama</h2>
              <p className="text-white/40 text-xs mt-0.5">Gratis, privé, offline beschikbaar</p>
            </div>
          </div>

          {phase === 'prompt' && (
            <>
              <p className="text-white/65 text-sm leading-relaxed">
                Ollama laat je AI-modellen lokaal op je Mac draaien — gratis, zonder internetverbinding en zonder dat je data naar een server gaat.
              </p>
              <ul className="mt-3 space-y-1.5">
                {['Volledig gratis, geen API-kosten', 'Werkt ook offline', 'Je data blijft op jouw computer', 'Ondersteunt chat- én beeldmodellen'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-white/55 text-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-white/30 text-xs mt-4">
                Download: ~200 MB — vereist macOS 11+
              </p>
            </>
          )}

          {phase === 'downloading' && (
            <div className="space-y-3">
              <p className="text-white/60 text-sm">{statusMsg || 'Bezig…'}</p>
              <div className="relative h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#facc15] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-white/25 text-xs text-right">{progress}%</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="text-sm font-medium">Ollama is geïnstalleerd!</span>
              </div>
              <p className="text-white/45 text-sm">
                Ollama draait nu op de achtergrond. In de Engine-module vind je lokale modellen automatisch terug. Pull extra modellen via Instellingen → AI → Ollama.
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-2">
              <p className="text-red-400 text-sm font-medium">Installatie mislukt</p>
              <p className="text-white/40 text-xs leading-relaxed">{errorMsg}</p>
              <p className="text-white/30 text-xs">
                Probeer Ollama handmatig te installeren via{' '}
                <button
                  type="button"
                  onClick={() => (window as any).api.openExternal('https://ollama.com/download')}
                  className="text-[#facc15]/70 hover:text-[#facc15] underline"
                >
                  ollama.com/download
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-7 pb-7 flex gap-3">
          {phase === 'prompt' && (
            <>
              <button
                type="button"
                onClick={decline}
                className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/75"
              >
                Nee, later
              </button>
              <button
                type="button"
                onClick={install}
                className="flex-1 rounded-xl bg-[#facc15] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
              >
                Ja, download Ollama
              </button>
            </>
          )}

          {phase === 'downloading' && (
            <button
              type="button"
              disabled
              className="flex-1 rounded-xl bg-white/[0.05] py-2.5 text-sm text-white/25 cursor-not-allowed"
            >
              Bezig met installeren…
            </button>
          )}

          {(phase === 'done' || phase === 'error') && (
            <button
              type="button"
              onClick={() => { onClose() }}
              className="flex-1 rounded-xl bg-[#facc15] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              {phase === 'done' ? 'Aan de slag' : 'Sluiten'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
