export type AtelierSidebarType = 'banners' | 'print' | 'images' | 'video'

export interface SidebarProject {
  id: string
  type: AtelierSidebarType
  name: string
  thumbnailSrc?: string
  subtitle?: string
  createdAt: string
}

interface AtelierProjectSidebarV2Props {
  open: boolean
  type: AtelierSidebarType
  projects: SidebarProject[]
  activeProjectId: string | null
  search: string
  onToggle: () => void
  onSearch: (value: string) => void
  onNew: () => void
  onSelect: (projectId: string) => void
  onDelete: (projectId: string) => void
}

const COPY: Record<AtelierSidebarType, { title: string; newLabel: string; emptyLabel: string }> = {
  banners: {
    title: 'Bannerprojecten',
    newLabel: 'Nieuw banner',
    emptyLabel: 'Nog geen bannerprojecten.',
  },
  print: {
    title: 'Printprojecten',
    newLabel: 'Nieuw print',
    emptyLabel: 'Nog geen printprojecten.',
  },
  images: {
    title: 'Afbeeldingen',
    newLabel: 'Nieuwe afbeelding',
    emptyLabel: 'Nog geen afbeeldingen.',
  },
  video: {
    title: "Video's",
    newLabel: 'Nieuwe video',
    emptyLabel: "Nog geen video's.",
  },
}

export default function AtelierProjectSidebarV2({
  open,
  type,
  projects,
  activeProjectId,
  search,
  onToggle,
  onSearch,
  onNew,
  onSelect,
  onDelete,
}: AtelierProjectSidebarV2Props) {
  const copy = COPY[type]
  const q = search.trim().toLowerCase()
  const filteredProjects = (q
    ? projects.filter((project) => `${project.name} ${project.subtitle ?? ''}`.toLowerCase().includes(q))
    : projects
  ).filter((project) => project.type === type)

  return (
    <aside
      className={[
        'absolute top-0 right-0 bottom-0 z-40 flex flex-col transition-[width,border-color,background-color] duration-300 ease-in-out',
        open ? 'w-64 border-l border-white/[0.07] bg-[#111] shadow-2xl' : 'w-14 bg-transparent',
      ].join(' ')}
    >
      <div className={open ? 'flex items-center justify-between border-b border-white/[0.05] p-4' : 'flex h-14 items-center justify-center'}>
        {open && <h2 className="text-sm font-medium text-white/80">{copy.title}</h2>}
        <button
          type="button"
          onClick={onToggle}
          className={open
            ? 'rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/80'
            : 'flex h-9 w-9 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white'}
          aria-label={open ? 'Projecten inklappen' : 'Projecten uitklappen'}
          title={open ? 'Projecten inklappen' : 'Projecten uitklappen'}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      <div className={open ? 'flex-1 space-y-2 overflow-y-auto p-3' : 'flex flex-1 flex-col items-center gap-2 p-2'}>
        <button
          type="button"
          onClick={() => {
            onNew()
            if (open) onToggle()
          }}
          className={open
            ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white'
            : 'flex h-10 w-10 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white'}
          aria-label={copy.newLabel}
          title={copy.newLabel}
        >
          <PlusIcon />
          {open && <span>{copy.newLabel}</span>}
        </button>

        {open ? (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Zoek project..."
              className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-9 pr-3 text-sm text-white/75 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.14]"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Project zoeken"
            title="Project zoeken"
          >
            <SearchIcon />
          </button>
        )}

        {open && (
          <div className="mt-2 border-t border-white/[0.05] pt-4">
            <div className="px-3 pb-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Recent</span>
            </div>
            {filteredProjects.length === 0 ? (
              <p className="px-3 py-3 text-xs leading-relaxed text-white/30">
                {projects.some((project) => project.type === type) ? 'Geen projecten gevonden.' : copy.emptyLabel}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredProjects.map((project) => (
                  <SidebarProjectRow
                    key={project.id}
                    project={project}
                    active={project.id === activeProjectId}
                    onSelect={() => onSelect(project.id)}
                    onDelete={() => onDelete(project.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function SidebarProjectRow({
  project,
  active,
  onSelect,
  onDelete,
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
          'flex w-full items-center gap-2 rounded-lg px-2 py-2 pr-8 text-left transition-colors',
          active ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90',
        ].join(' ')}
      >
        <span className="flex h-10 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.07] bg-black/30 text-white/35">
          {project.thumbnailSrc ? (
            <img src={project.thumbnailSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <TypeIcon type={project.type} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{project.name || 'Nieuw project'}</span>
          <span className="mt-0.5 block truncate text-[10px] text-white/30">
            {project.subtitle || formatDate(project.createdAt)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/28 opacity-0 transition-colors hover:text-red-300 group-hover:opacity-100"
        title="Project verwijderen"
        aria-label="Project verwijderen"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

function TypeIcon({ type }: { type: AtelierSidebarType }) {
  if (type === 'print') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
    )
  }
  if (type === 'banners') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h6" />
        <path d="M7 13h10" />
      </svg>
    )
  }
  if (type === 'video') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 9l4-2v10l-4-2" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
}
