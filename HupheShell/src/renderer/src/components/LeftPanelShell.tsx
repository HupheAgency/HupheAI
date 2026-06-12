/**
 * LeftPanelShell — master document voor het linker tool-menu.
 *
 * Dit is het smalle icoon-menu aan de linkerkant van de editor
 * (print, media, banners). Niet het slideoverzicht van presentaties —
 * dat is inhoud en valt buiten dit systeem.
 *
 * Componenten:
 *  - LeftPanelShell     de buitenste schil (achtergrond, border-right, breedte)
 *  - LeftToolButton     icoon-knop met ingebouwde tooltip
 *  - LeftToolGroup      scheidingslijn tussen groepen tools
 *  - LeftToolTooltip    tooltip-wrapper (zelfde stijl als de AppShell pill nav)
 *
 * Wil je de look aanpassen? Doe dat hier — het werkt automatisch in
 * alle editor-modules die dit menu gebruiken.
 */

import type { ReactNode } from 'react'

// ─── LeftPanelShell ───────────────────────────────────────────────────────────

export function LeftPanelShell({
  children,
  widthClass = 'w-12',
  className = '',
}: {
  children: ReactNode
  widthClass?: string
  className?: string
}) {
  return (
    <div
      className={[
        'flex h-full flex-shrink-0 flex-col overflow-hidden',
        'border-r border-white/[0.06] bg-[#0f0f0f]',
        widthClass,
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

// ─── LeftToolTooltip ──────────────────────────────────────────────────────────

/**
 * Tooltip die rechts uitkomt bij hover — zelfde stijl als de witte pil-navigatie.
 * Gebruik als wrapper om elk icoon dat een label nodig heeft.
 */
export function LeftToolTooltip({
  label,
  children,
  wip = false,
}: {
  label: string
  children: ReactNode
  wip?: boolean
}) {
  return (
    <div className="group relative">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 opacity-0 transition-opacity delay-100 group-hover:opacity-100">
        <div className="whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#1c1c1c] px-3 py-2 shadow-xl">
          <p className="text-xs font-semibold leading-tight text-white/85">
            {label}
            {wip && <span className="ml-1.5 text-white/35">· Nog in ontwikkeling</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── LeftToolButton ───────────────────────────────────────────────────────────

/**
 * Icoon-knop met ingebouwde tooltip voor tool-paletten (print/media editor).
 */
export function LeftToolButton({
  icon,
  label,
  active = false,
  disabled = false,
  wip = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  wip?: boolean
  onClick?: () => void
}) {
  const isUnavailable = disabled && !wip
  return (
    <LeftToolTooltip label={label} wip={wip}>
      <button
        type="button"
        onClick={isUnavailable ? undefined : onClick}
        aria-label={label}
        disabled={isUnavailable}
        className={[
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          active
            ? 'bg-[#facc15]/10 text-[#facc15]'
            : wip
              ? 'cursor-default text-white/20'
              : isUnavailable
                ? 'cursor-not-allowed text-white/12'
                : 'text-white/40 hover:bg-white/[0.07] hover:text-white',
        ].join(' ')}
      >
        {icon}
      </button>
    </LeftToolTooltip>
  )
}

// ─── LeftToolGroup ────────────────────────────────────────────────────────────

export function LeftToolGroup() {
  return <div className="my-1.5 h-px w-6 self-center bg-white/[0.08]" />
}
