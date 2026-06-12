/**
 * SettingsToggle — Dual-mode schakelaar (Antigravity ↔ API direct)
 *
 * Gebruik:
 *   import SettingsToggle from '../components/SettingsToggle'
 *   <SettingsToggle />
 *
 * Leest en schrijft de mode via useSettings (window.api.settings).
 * Luistert ook naar het 'huphe:mode-changed' CustomEvent zodat de
 * UI live bijwerkt als de mode elders verandert.
 */

import { useSettings, type AIMode, type ConnectionStatus } from '../lib/useSettings'

// ─── Connection status metadata ────────────────────────────────────────────────

const STATUS_META: Record<ConnectionStatus, { label: string; color: string; dotPulse: boolean }> = {
  connected:    { label: 'verbonden',    color: '#10B981', dotPulse: false },
  connecting:   { label: 'verbinden…',  color: '#F59E0B', dotPulse: true  },
  disconnected: { label: 'niet verbonden', color: '#6B7280', dotPulse: false },
  error:        { label: 'fout',         color: '#EF4444', dotPulse: false },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsToggle() {
  const { config, isSwitching, error, setMode, recheckAntigravity } = useSettings()

  if (!config) return null

  const isAntigravity = config.mode === 'antigravity'
  const connStatus    = config.antigravity?.connectionStatus ?? 'disconnected'
  const statusMeta    = STATUS_META[connStatus]

  async function handleToggle() {
    if (isSwitching) return
    const next: AIMode = isAntigravity ? 'api' : 'antigravity'
    await setMode(next)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Mode toggle card ──────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-[#141414] border border-white/[0.08]">
        <div className="flex items-center justify-between gap-4">
          {/* Left: label + description */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white/70 text-sm font-medium">
                {isAntigravity ? '⚡ Antigravity Mode' : '🔑 API Direct Mode'}
              </span>
              {isAntigravity && (
                <ConnectionDot status={connStatus} />
              )}
            </div>
            <span className="text-white/30 text-[11px] leading-relaxed">
              {isAntigravity
                ? 'Orchestratie via de Claude Code CLI in Antigravity. Geen API-key nodig.'
                : 'Roept AI providers direct aan via jouw eigen API-keys.'}
            </span>
          </div>

          {/* Right: toggle switch */}
          <button
            id="settings-mode-toggle"
            role="switch"
            aria-checked={isAntigravity}
            onClick={handleToggle}
            disabled={isSwitching}
            title={isAntigravity ? 'Schakel naar API Direct' : 'Schakel naar Antigravity'}
            className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isSwitching
                ? 'rgba(255,255,255,0.08)'
                : isAntigravity
                  ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                  : 'rgba(255,255,255,0.08)',
            }}
          >
            {isSwitching ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <SpinnerIcon />
              </span>
            ) : (
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: isAntigravity ? 'translateX(20px)' : 'translateX(0px)' }}
              />
            )}
          </button>
        </div>

        {/* ── Antigravity status row ─────────────────────────────────────── */}
        {isAntigravity && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusMeta.dotPulse ? 'animate-pulse' : ''}`}
                style={{ background: statusMeta.color }}
              />
              <span className="text-[11px]" style={{ color: statusMeta.color }}>
                MCP Server {statusMeta.label}
              </span>
              {config.antigravity?.lastChecked && (
                <span className="text-white/20 text-[10px]">
                  · {formatRelativeTime(config.antigravity.lastChecked)}
                </span>
              )}
            </div>

            <button
              onClick={recheckAntigravity}
              disabled={isSwitching || connStatus === 'connecting'}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSwitching ? 'controleert…' : 'hercheck'}
            </button>
          </div>
        )}

        {/* ── Error banner ──────────────────────────────────────────────────── */}
        {error && (
          <div className="mt-3 pt-3 border-t border-red-500/20">
            <p className="text-red-400/70 text-[11px] leading-relaxed">{error}</p>
          </div>
        )}
      </div>

      {/* ── Mode info / hints ─────────────────────────────────────────────── */}
      {isAntigravity ? (
        <AntigravityHint status={connStatus} />
      ) : (
        <APIDirectHint keys={config.keys} />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.dotPulse ? 'animate-pulse' : ''}`}
      style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}

function AntigravityHint({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
        <p className="text-emerald-400/70 text-[11px] leading-relaxed">
          ✅ Antigravity MCP server is bereikbaar. Taken worden gestuurd via de Claude Code CLI
          die geïnstalleerd is in Antigravity.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15">
        <p className="text-red-400/70 text-[11px] leading-relaxed">
          ⚠️ Kan de Antigravity MCP server niet bereiken. Zorg dat Antigravity open is
          en de Claude Code extensie actief is. Klik op "hercheck" om opnieuw te proberen.
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 rounded-xl bg-[#141414] border border-white/[0.06]">
      <p className="text-white/30 text-[11px] leading-relaxed">
        Antigravity is een VS Code fork met Claude Code ingebouwd als extensie.
        De binary wordt gevonden in <code className="text-white/50 text-[10px]">~/.antigravity/extensions/</code>.
      </p>
    </div>
  )
}

function APIDirectHint({ keys }: { keys: { claude: boolean; openai: boolean; openrouter: boolean; google: boolean } }) {
  const hasAny = keys.claude || keys.openai || keys.openrouter || keys.google
  return (
    <div className="p-3 rounded-xl bg-[#141414] border border-white/[0.06]">
      <p className="text-white/25 text-[10px] uppercase tracking-wider mb-2">Opgeslagen Keys</p>
      <div className="flex flex-wrap gap-2">
        {([
          { k: 'claude',     label: 'Claude'     },
          { k: 'openai',     label: 'OpenAI'     },
          { k: 'openrouter', label: 'OpenRouter' },
          { k: 'google',     label: 'Google'     },
        ] as const).map(({ k, label }) => (
          <span
            key={k}
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={
              keys[k]
                ? { background: 'rgba(16,185,129,0.12)', color: 'rgba(16,185,129,0.8)', border: '1px solid rgba(16,185,129,0.2)' }
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.06)' }
            }
          >
            {keys[k] ? '✓ ' : ''}{label}
          </span>
        ))}
      </div>
      {!hasAny && (
        <p className="mt-2 text-white/25 text-[11px]">
          Voeg API-keys toe hieronder om direct via de providers te werken.
        </p>
      )}
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60)  return `${secs}s geleden`
    const mins = Math.floor(secs / 60)
    if (mins < 60)  return `${mins}m geleden`
    return `${Math.floor(mins / 60)}u geleden`
  } catch {
    return ''
  }
}
