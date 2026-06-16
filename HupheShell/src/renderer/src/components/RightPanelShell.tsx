/**
 * RightPanelShell — master document voor alle rechter menupanelen.
 *
 * Alles wat in een rechter paneel in de app gebruikt wordt, staat hier:
 *  - RightPanelShell    de buitenste schil (achtergrond, toggle, tab-balk)
 *  - PanelTabBar        gedeelde tab-balk
 *  - PanelLayerRow      gedeelde rij-stijl voor lagen/slides
 *  - PanelLayerDragHandle  grip-icoon voor drag-and-drop
 *  - PanelSectionHeader gedeelde sectie-kop (bijv. "Tekst", "Afbeelding")
 *
 * Wil je de look aanpassen? Doe dat hier — het werkt automatisch overal.
 */

import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { IcoPanelToggle } from './Icons'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RightPanelTab = {
  id: string
  label: string
  badge?: number
}

export const RIGHT_PANEL_STYLE = {
  shellBase: 'relative h-full flex-shrink-0 overflow-visible transition-[width] duration-300',
  shellSurface: 'border-l border-white/[0.07] bg-gradient-to-b from-[#1e1e1e] to-[#0d0d0d] shadow-2xl backdrop-blur-md',
  collapsedWidth: 'w-11',
  toggleButton: 'absolute left-2 top-2.5 z-30 flex h-7 w-7 items-center justify-center text-white/35 transition-colors hover:text-white/75',
  contentColumn: 'flex h-full flex-col overflow-hidden transition-opacity duration-200',
  contentOpen: 'opacity-100',
  contentClosed: 'pointer-events-none opacity-0',
  tabBarRoot: 'flex-shrink-0 border-b border-white/[0.08] bg-[#161616]',
  tabBarInner: 'flex items-end overflow-x-auto',
  tabBarIndent: 'pl-11',
  tabButton: 'relative flex-shrink-0 px-3 py-3 text-[12px] font-semibold leading-none transition-colors',
  tabButtonActive: 'mb-[-1px] rounded-tl-[8px] rounded-tr-[8px] border border-b-[#161616] border-white/[0.12] bg-[#1e1e1e] text-white/90',
  tabButtonInactive: 'text-white/50 hover:text-white/75',
  tabBadge: 'ml-1.5 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red-500 px-[3px] text-[9px] font-bold leading-none text-white',
  tabRightSlot: 'ml-auto flex items-center pb-1.5 pr-2',
  body: 'flex min-h-0 flex-1 flex-col overflow-hidden',
  headerBar: 'h-[53px] flex-shrink-0 flex items-center gap-3 pl-14 pr-12 border-b border-white/[0.06] bg-[#131313]',
}

// ─── PanelTabBar ──────────────────────────────────────────────────────────────

/**
 * Gedeelde tab-balk voor alle rechter panels.
 * Pas hier de tab-stijl aan en het werkt in presentaties, media, typewriter, etc.
 */
export function PanelTabBar({
  tabs,
  activeTab,
  onTabChange,
  indent = false,
  right,
}: {
  tabs: RightPanelTab[]
  activeTab: string
  onTabChange: (id: string) => void
  /** Laat ruimte voor de collapse-toggle (gebruik in RightPanelShell). */
  indent?: boolean
  right?: ReactNode
}) {
  return (
    <div className={RIGHT_PANEL_STYLE.tabBarRoot}>
      <div className={[RIGHT_PANEL_STYLE.tabBarInner, indent ? RIGHT_PANEL_STYLE.tabBarIndent : ''].join(' ')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              RIGHT_PANEL_STYLE.tabButton,
              activeTab === tab.id
                ? RIGHT_PANEL_STYLE.tabButtonActive
                : RIGHT_PANEL_STYLE.tabButtonInactive,
            ].join(' ')}
          >
            {tab.label}
            {tab.badge ? (
              <span className={RIGHT_PANEL_STYLE.tabBadge}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
        {right && (
          <div className={RIGHT_PANEL_STYLE.tabRightSlot}>{right}</div>
        )}
      </div>
    </div>
  )
}

// ─── PanelLayerRow ────────────────────────────────────────────────────────────

/**
 * Gedeelde rij voor lagen en slides in alle rechter panels.
 * Pas hier de rij-stijl aan en het werkt in presentaties en media/print.
 */
export function PanelLayerRow({
  active = false,
  selected = false,
  hidden = false,
  dragging = false,
  dropTarget = false,
  draggable,
  children,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDrop,
  onMouseEnter,
  onMouseLeave,
}: {
  active?: boolean
  selected?: boolean
  hidden?: boolean
  dragging?: boolean
  dropTarget?: boolean
  draggable?: boolean
  children: ReactNode
  onClick?: (e: MouseEvent) => void
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
  onDragOver?: (e: DragEvent) => void
  onDragEnter?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className={[
        'group relative flex cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors',
        dragging ? 'opacity-45' : '',
        dropTarget ? 'outline outline-1 outline-[#facc15]/25' : '',
        active
          ? 'bg-[#facc15]/[0.08] text-[#facc15]'
          : selected
            ? 'bg-[#facc15]/[0.05] text-[#facc15]/70'
            : hidden
              ? 'text-white/28 hover:bg-white/[0.04] hover:text-white/55'
              : 'text-white/55 hover:bg-white/[0.04] hover:text-white/80',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/** Grip-icoon voor drag-and-drop in een PanelLayerRow. */
export function PanelLayerDragHandle() {
  return (
    <span className="flex flex-shrink-0 cursor-grab items-center text-white/15 active:cursor-grabbing group-hover:text-white/30">
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
        <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        <circle cx="7" cy="3" r="1.2" fill="currentColor" />
        <circle cx="3" cy="7" r="1.2" fill="currentColor" />
        <circle cx="7" cy="7" r="1.2" fill="currentColor" />
        <circle cx="3" cy="11" r="1.2" fill="currentColor" />
        <circle cx="7" cy="11" r="1.2" fill="currentColor" />
      </svg>
    </span>
  )
}

// ─── PanelSectionHeader ───────────────────────────────────────────────────────

/**
 * Gedeelde sectie-kop binnen uitklapbare rijen (bijv. "Tekst", "Afbeelding").
 * Pas hier de stijl aan en het werkt in alle uitklapbare kaarten.
 */
export function PanelSectionHeader({
  icon,
  label,
  collapsed,
  onToggle,
  active = false,
}: {
  icon: ReactNode
  label: string
  collapsed: boolean
  onToggle: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'flex w-full items-center gap-2 py-2 pl-4 pr-3 text-left text-[11px] font-semibold transition-colors',
        active ? 'text-white/65 hover:text-white/85' : 'text-white/45 hover:text-white/65',
      ].join(' ')}
    >
      <span className={[
        'flex h-4 w-4 flex-shrink-0 items-center justify-center',
        active ? 'text-white/40' : 'text-white/28',
      ].join(' ')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={[
          'flex-shrink-0 transition-transform duration-150',
          collapsed ? 'text-white/18' : 'rotate-180 text-white/35',
        ].join(' ')}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )
}

// ─── RightPanelShell ──────────────────────────────────────────────────────────

/**
 * Buitenste schil voor alle rechter panelen.
 * Bevat: achtergrond, collapse-toggle, tab-balk, content-area.
 */
export default function RightPanelShell({
  tabs = [],
  activeTab,
  onTabChange,
  widthClass = 'w-[300px]',
  defaultOpen = true,
  tabBarRight,
  children,
}: {
  tabs?: RightPanelTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  widthClass?: string
  defaultOpen?: boolean
  tabBarRight?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <aside
      className={[
        RIGHT_PANEL_STYLE.shellBase,
        RIGHT_PANEL_STYLE.shellSurface,
        open ? widthClass : RIGHT_PANEL_STYLE.collapsedWidth,
      ].join(' ')}
    >
      {/* Collapse / expand toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={RIGHT_PANEL_STYLE.toggleButton}
        aria-label={open ? 'Menu inklappen' : 'Menu uitklappen'}
        title={open ? 'Menu inklappen' : 'Menu uitklappen'}
      >
        <IcoPanelToggle open={open} />
      </button>

      {/* Main column — fades out when collapsed */}
      <div
        className={[
          RIGHT_PANEL_STYLE.contentColumn,
          open ? RIGHT_PANEL_STYLE.contentOpen : RIGHT_PANEL_STYLE.contentClosed,
        ].join(' ')}
      >
        {tabs.length > 0 && (
          <PanelTabBar
            tabs={tabs}
            activeTab={activeTab ?? ''}
            onTabChange={(id) => onTabChange?.(id)}
            indent
            right={tabBarRight}
          />
        )}

        <div className={RIGHT_PANEL_STYLE.body}>
          {children}
        </div>
      </div>
    </aside>
  )
}
