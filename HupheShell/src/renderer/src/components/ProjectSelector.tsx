/**
 * ProjectSelector — kies en toon de actieve projectmap
 *
 * Gebruik:
 *   import ProjectSelector from '../components/ProjectSelector'
 *   <ProjectSelector />
 *
 * Leest het pad via useSettings (config.activeProjectPath).
 * Opent een native map-picker via window.api.dialog.openFolder().
 * Slaat op via window.api.settings.setProjectPath().
 */

import { useState } from 'react'
import { useSettings } from '../lib/useSettings'

export default function ProjectSelector() {
  const { config, setProjectPath } = useSettings()
  const [isBusy, setIsBusy]       = useState(false)
  const [error,  setError]        = useState<string | null>(null)

  const projectPath = config?.activeProjectPath ?? null

  async function handlePick() {
    setIsBusy(true)
    setError(null)
    try {
      const result = await (window as any).api?.dialog?.openFolder()
      if (!result || result.canceled || !result.folderPath) return
      await setProjectPath(result.folderPath)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleClear() {
    setIsBusy(true)
    setError(null)
    try {
      await setProjectPath(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Path display ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors"
        style={{
          background: projectPath ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
          borderColor: projectPath ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
        }}
      >
        {/* Icon */}
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: projectPath
              ? 'rgba(99,102,241,0.15)'
              : 'rgba(255,255,255,0.05)',
          }}
        >
          <FolderIcon active={!!projectPath} />
        </div>

        {/* Path text */}
        <div className="flex-1 min-w-0">
          {projectPath ? (
            <>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">
                Actieve projectmap
              </p>
              <p
                className="text-white/80 text-xs font-mono truncate"
                title={projectPath}
              >
                {projectPath}
              </p>
            </>
          ) : (
            <>
              <p className="text-white/50 text-sm font-medium">Geen projectmap geselecteerd</p>
              <p className="text-white/25 text-[11px] mt-0.5">
                De orchestrator gebruikt de werkmap van de app als fallback.
              </p>
            </>
          )}
        </div>

        {/* Clear button — only shown when a path is set */}
        {projectPath && (
          <button
            onClick={handleClear}
            disabled={isBusy}
            title="Wis projectmap"
            className="flex-shrink-0 text-white/20 hover:text-white/50 transition-colors disabled:opacity-40"
          >
            <XIcon />
          </button>
        )}
      </div>

      {/* ── Warning when no path is set ───────────────────────────────────── */}
      {!projectPath && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
          <span className="text-amber-400/70 text-[11px] mt-0.5">⚠</span>
          <p className="text-amber-400/60 text-[11px] leading-relaxed">
            Geen projectmap geselecteerd. Claude Code werkt in de standaard werkmap.
            Kies een map zodat de orchestrator de juiste context heeft.
          </p>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-red-400/70 text-[11px] px-1">{error}</p>
      )}

      {/* ── Pick button ───────────────────────────────────────────────────── */}
      <button
        id="project-selector-pick-btn"
        onClick={handlePick}
        disabled={isBusy}
        className="flex items-center gap-2 w-full justify-center py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background:   isBusy ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.12)',
          borderColor:  'rgba(99,102,241,0.25)',
          color:        isBusy ? 'rgba(165,167,247,0.5)' : 'rgba(165,167,247,0.9)',
        }}
      >
        {isBusy ? (
          <><SpinnerIcon /> Map openen…</>
        ) : (
          <><FolderOpenIcon /> {projectPath ? 'Andere map kiezen' : 'Map kiezen'}</>
        )}
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke={active ? 'rgba(165,167,247,0.8)' : 'rgba(255,255,255,0.25)'}
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function FolderOpenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <polyline points="8 13 12 9 16 13" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
