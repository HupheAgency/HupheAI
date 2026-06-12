import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AtelierThinkingBubble } from './AtelierSetupShell'
import CopyLibraryPanel from './CopyLibraryPanel'
import CrossFormatPanel from './CrossFormatPanel'
import RightPanelShell, { type RightPanelTab } from './RightPanelShell'
import { PanelTabBar } from './RightPanelShell'
import { IcoPlus, IcoSearch, IcoTrash, IcoPencil, IcoFile, IcoVideo } from './Icons'
import type { AtelierProjectFreshnessTarget, ProjectAssetRef } from '../lib/atelier-project-store'
import type { AtelierCreationType } from './AtelierCreationModeButtons'
import { checkAssetFreshness } from '../lib/asset-library'

export type AtelierSidebarPanelType = 'presentation' | 'banners' | 'print' | 'images' | 'video'

export interface SidebarProject {
  id: string
  type: AtelierSidebarPanelType
  name: string
  subtitle?: string
  thumbnailSrc?: string
  createdAt: string
}

export interface AtelierProjectsPanelConfig {
  type: AtelierSidebarPanelType
  projects: SidebarProject[]
  savedProjects?: AtelierProjectFreshnessTarget[]
  activeProjectId: string | null
  activeProjectMeta?: { id: string; assetRefs?: ProjectAssetRef[]; locked?: boolean }
  onCrossFormatCreate?: (targetType: AtelierCreationType) => void
  onRefreshAssets?: () => void
  onToggleProjectLock?: () => void
  search: string
  onSearch: (value: string) => void
  onNew: () => void
  onSelect: (projectId: string) => void
  onDelete: (projectId: string) => void
  onRename?: (projectId: string, newName: string) => void
}

type AtelierChatMessage = { role: 'user' | 'assistant'; content: string; model?: string }

export default function AtelierRightPanel({
  children,
  widthClass = 'w-[440px]',
  bodyClassName = 'h-full overflow-y-auto px-6 pb-7 pt-4',
  projectsPanel,
  defaultTab = 'edit',
  chatMessages,
  chatIsWaiting = false,
  forceShowChat = 0,
  convertContent,
}: {
  children: ReactNode
  widthClass?: string
  bodyClassName?: string
  projectsPanel?: AtelierProjectsPanelConfig
  defaultTab?: 'projects' | 'edit'
  chatMessages?: AtelierChatMessage[]
  chatIsWaiting?: boolean
  forceShowChat?: number
  convertContent?: ReactNode
}) {
  const [activeTab, setActiveTab] = useState<'projects' | 'edit' | 'copy' | 'chat' | 'convert'>(defaultTab)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const hasChatTab = !!chatMessages && !!projectsPanel?.activeProjectId

  useEffect(() => { setActiveTab(defaultTab) }, [defaultTab, projectsPanel?.type])
  useEffect(() => { if (forceShowChat) setActiveTab('chat') }, [forceShowChat])
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el || activeTab !== 'chat') return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [chatMessages?.length, chatIsWaiting, activeTab])

  // ── No projects panel: simple content shell ──────────────────────────────
  if (!projectsPanel) {
    return (
      <RightPanelShell widthClass={widthClass}>
        <div className={bodyClassName}>{children}</div>
      </RightPanelShell>
    )
  }

  // ── Images / Video / Presentation: clean compact panel (its own tab logic) ──
  if (projectsPanel.type === 'images' || projectsPanel.type === 'video' || projectsPanel.type === 'presentation') {
    return (
      <RightPanelShell widthClass={widthClass}>
        <AtelierCleanProjectsPanel config={projectsPanel} bodyClassName={bodyClassName}>
          {children}
        </AtelierCleanProjectsPanel>
      </RightPanelShell>
    )
  }

  // ── Standard panel (print / presentation / banners) ──────────────────────
  const tabs: RightPanelTab[] = [
    { id: 'edit', label: getAtelierEditTabLabel(projectsPanel.type, projectsPanel.activeProjectId) },
    { id: 'projects', label: 'Projecten' },
    ...(hasChatTab ? [{ id: 'chat', label: 'Chat' }] : []),
    ...(projectsPanel.type !== 'presentation' && projectsPanel.type !== 'banners' && projectsPanel.type !== 'print'
      ? [{ id: 'copy', label: 'Copy' }]
      : []),
    ...(convertContent ? [{ id: 'convert', label: 'Convert' }] : []),
  ]

  return (
    <RightPanelShell
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as typeof activeTab)}
      widthClass={widthClass}
    >
      {activeTab === 'projects' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pt-4">
            <AtelierFreshnessPanel config={projectsPanel} />
            {projectsPanel.activeProjectId && projectsPanel.onCrossFormatCreate && (
              <CrossFormatPanel sourceType={projectsPanel.type} onCreate={projectsPanel.onCrossFormatCreate} />
            )}
          </div>
          <AtelierProjectsPanelContent config={projectsPanel} />
        </div>
      ) : activeTab === 'chat' && hasChatTab ? (
        <div ref={chatScrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-5">
          {(!chatMessages || chatMessages.length === 0) && !chatIsWaiting ? (
            <p className="mt-10 px-2 text-center text-sm leading-relaxed text-white/28">
              Stel een vraag via de promptbar om het gesprek te starten.
            </p>
          ) : (
            chatMessages?.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={[
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5',
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-white text-black'
                    : 'rounded-tl-sm border border-white/[0.07] bg-[#1c1c1c]',
                ].join(' ')}>
                  {msg.role === 'assistant' && msg.model && (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#facc15]/70">{msg.model}</p>
                  )}
                  <p className={['whitespace-pre-wrap text-sm leading-relaxed', msg.role === 'user' ? 'text-black' : 'text-white/70'].join(' ')}>
                    {msg.content}
                  </p>
                </div>
              </div>
            ))
          )}
          {chatIsWaiting && <AtelierThinkingBubble />}
        </div>
      ) : activeTab === 'copy' && projectsPanel.type !== 'presentation' && projectsPanel.type !== 'banners' && projectsPanel.type !== 'print' ? (
        <CopyLibraryPanel />
      ) : activeTab === 'convert' && convertContent ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{convertContent}</div>
      ) : (
        <div className={['flex-1 min-h-0', bodyClassName.replace(/\bh-full\b/g, '').trim()].join(' ')}>
          {children}
        </div>
      )}
    </RightPanelShell>
  )
}

// ── Internal sub-components ───────────────────────────────────────────────────

function AtelierFreshnessPanel({ config }: { config: AtelierProjectsPanelConfig }) {
  const savedProject = config.savedProjects?.find((p) => p.id === config.activeProjectId)
  const meta = savedProject ?? (config.activeProjectMeta?.id === config.activeProjectId ? config.activeProjectMeta : null)
  if (!meta) return null

  const freshness = checkAssetFreshness(meta)
  const staleCount = freshness.staleRefs.length
  const archivedCount = freshness.archivedRefs.length
  const hasFreshnessWarning = staleCount > 0 || archivedCount > 0
  const isLocked = meta.locked ?? false

  if (!hasFreshnessWarning && !config.onToggleProjectLock) return null

  return (
    <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white/70">
            {isLocked ? 'Project vergrendeld' : hasFreshnessWarning ? 'Bronnen bijgewerkt' : 'Projectupdates'}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">
            {isLocked
              ? 'Automatisch vernieuwen staat uit.'
              : hasFreshnessWarning
                ? `${staleCount} update${staleCount === 1 ? '' : 's'} · ${archivedCount} gearchiveerd`
                : 'Automatische bronupdates toegestaan.'}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {hasFreshnessWarning && !isLocked && config.onRefreshAssets && (
            <button
              type="button"
              onClick={config.onRefreshAssets}
              className="h-8 rounded-lg border border-[#facc15]/25 px-3 text-xs font-semibold text-[#facc15] transition-colors hover:bg-[#facc15]/[0.08]"
            >
              Vernieuwen
            </button>
          )}
          {config.onToggleProjectLock && (
            <button
              type="button"
              onClick={config.onToggleProjectLock}
              className={['h-8 rounded-lg border px-3 text-xs transition-colors', isLocked ? 'border-[#facc15]/25 text-[#facc15]' : 'border-white/[0.07] text-white/42 hover:text-white/70'].join(' ')}
            >
              {isLocked ? 'Ontgrendel' : 'Lock'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const ATELIER_PROJECT_COPY: Record<AtelierSidebarPanelType, { title: string; newLabel: string; emptyLabel: string }> = {
  presentation: { title: 'Presentatieprojecten', newLabel: 'Nieuwe presentatie', emptyLabel: 'Nog geen presentatieprojecten.' },
  banners: { title: 'Bannerprojecten', newLabel: 'Nieuwe banner', emptyLabel: 'Nog geen bannerprojecten.' },
  print: { title: 'Editor', newLabel: 'Nieuwe media', emptyLabel: 'Nog geen mediaprojecten.' },
  images: { title: 'Afbeeldingen', newLabel: 'Nieuwe afbeelding', emptyLabel: 'Nog geen afbeeldingen.' },
  video: { title: "Video's", newLabel: 'Nieuwe video', emptyLabel: "Nog geen video's." },
}

function getAtelierEditTabLabel(type: AtelierSidebarPanelType, activeProjectId: string | null): string {
  return type === 'images' || type === 'video' || activeProjectId ? 'Editor' : 'Start'
}

function AtelierProjectsPanelContent({ config }: { config: AtelierProjectsPanelConfig }) {
  const copy = ATELIER_PROJECT_COPY[config.type]
  const q = config.search.trim().toLowerCase()
  const filtered = q
    ? config.projects.filter((p) => `${p.name} ${p.subtitle ?? ''}`.toLowerCase().includes(q))
    : config.projects

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white/86">{copy.title}</h2>
      </div>
      <button
        type="button"
        onClick={config.onNew}
        className="mb-4 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        <IcoPlus />
        {copy.newLabel}
      </button>
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
          <IcoSearch />
        </span>
        <input
          value={config.search}
          onChange={(e) => config.onSearch(e.target.value)}
          placeholder="Zoek project..."
          className="h-12 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] pl-10 pr-3 text-sm text-white/75 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.16]"
        />
      </label>
      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-widest text-white/30">Recent</p>
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm leading-relaxed text-white/30">
            {config.projects.length > 0 ? 'Geen projecten gevonden.' : copy.emptyLabel}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((project) => (
              <AtelierProjectPanelRow
                key={project.id}
                project={project}
                active={project.id === config.activeProjectId}
                onSelect={() => config.onSelect(project.id)}
                onDelete={() => config.onDelete(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AtelierCleanProjectsPanel({
  config, children, bodyClassName,
}: {
  config: AtelierProjectsPanelConfig
  children: ReactNode
  bodyClassName: string
}) {
  const [view, setView] = useState<'projects' | 'edit'>('edit')
  const [searching, setSearching] = useState(false)
  const copy = ATELIER_PROJECT_COPY[config.type]
  const q = config.search.trim().toLowerCase()
  const filtered = q
    ? config.projects.filter((p) => `${p.name} ${p.subtitle ?? ''}`.toLowerCase().includes(q))
    : config.projects

  const projectsTabLabel = config.type === 'presentation' ? 'Projecten' : copy.title
  const editTabLabel = getAtelierEditTabLabel(config.type, config.activeProjectId)

  const tabs: RightPanelTab[] = [
    { id: 'edit', label: editTabLabel },
    { id: 'projects', label: projectsTabLabel },
  ]

  const tabBarRight = view === 'projects' ? (
    <button
      type="button"
      onClick={() => { setSearching((s) => !s); if (searching) config.onSearch('') }}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/65"
    >
      <IcoSearch />
    </button>
  ) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PanelTabBar
        tabs={tabs}
        activeTab={view}
        onTabChange={(id) => setView(id as 'projects' | 'edit')}
        indent
        right={tabBarRight}
      />
      {view === 'projects' && searching && (
        <div className="flex-shrink-0 bg-[#1e1e1e] px-4 py-2">
          <input
            autoFocus
            value={config.search}
            onChange={(e) => config.onSearch(e.target.value)}
            placeholder="Zoeken..."
            className="h-9 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white/75 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.16]"
          />
        </div>
      )}

      {view === 'edit' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <button
            type="button"
            onClick={config.onNew}
            className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/85"
          >
            <IcoPlus />
            {copy.newLabel}
          </button>
          {filtered.length > 0 && (
            <p className="mt-3 px-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-white/25">Recent</p>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-white/25">
              {config.projects.length > 0 ? 'Geen resultaten.' : copy.emptyLabel}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((project) => (
                <AtelierCleanProjectRow
                  key={project.id}
                  project={project}
                  active={project.id === config.activeProjectId}
                  onSelect={() => config.onSelect(project.id)}
                  onDelete={() => config.onDelete(project.id)}
                  onRename={config.onRename ? (name) => config.onRename!(project.id, name) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AtelierCleanProjectRow({
  project, active, onSelect, onDelete, onRename,
}: {
  project: SidebarProject
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onRename?: (newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(project.name || '')
    setEditing(true)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== project.name) onRename?.(trimmed)
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={[
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 pr-[4.5rem] text-left transition-colors',
          active ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90',
        ].join(' ')}
      >
        {project.thumbnailSrc && (
          <span className="flex h-8 w-10 flex-shrink-0 overflow-hidden rounded-md border border-white/[0.07] bg-black/20">
            <img src={project.thumbnailSrc} alt="" className="h-full w-full object-cover" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-md border border-white/[0.14] bg-white/[0.06] px-1.5 py-0.5 text-sm text-white outline-none"
            />
          ) : (
            <span className="block truncate text-sm">{project.name || 'Project'}</span>
          )}
          <span className="mt-0.5 block truncate text-[11px] text-white/28">
            {project.subtitle || formatAtelierProjectDate(project.createdAt)}
          </span>
        </span>
      </button>
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onRename && (
          <button
            type="button"
            onClick={startEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.07] hover:text-white/70"
            title="Hernoemen"
          >
            <IcoPencil />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-red-500/[0.10] hover:text-red-300"
          title="Verwijderen"
        >
          <IcoTrash size={13} />
        </button>
      </div>
    </div>
  )
}

function AtelierProjectPanelRow({
  project, active, onSelect, onDelete,
}: {
  project: SidebarProject
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={[
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 pr-10 text-left transition-colors',
          active ? 'bg-white/[0.08] text-white' : 'text-white/58 hover:bg-white/[0.05] hover:text-white/90',
        ].join(' ')}
      >
        <span className="flex h-11 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-black/30 text-white/35">
          {project.thumbnailSrc ? (
            <img src={project.thumbnailSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <AtelierProjectTypeIcon type={project.type} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{project.name || 'Project'}</span>
          <span className="mt-0.5 block truncate text-xs text-white/30">
            {project.subtitle || formatAtelierProjectDate(project.createdAt)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-white/25 opacity-0 transition-colors hover:bg-red-500/[0.10] hover:text-red-300 group-hover:opacity-100"
        title="Project verwijderen"
      >
        <IcoTrash size={13} />
      </button>
    </div>
  )
}

function AtelierProjectTypeIcon({ type }: { type: AtelierSidebarPanelType }) {
  if (type === 'presentation') return <IcoFile />
  if (type === 'print') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" />
    </svg>
  )
  if (type === 'banners') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h6" /><path d="M7 13h10" />
    </svg>
  )
  if (type === 'video') return <IcoVideo />
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAtelierProjectDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
  } catch { return value }
}
