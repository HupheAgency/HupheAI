export type ProjectAssetRole = 'background' | 'foreground' | 'logo' | 'product' | 'general'
export type ProjectCopyRole = 'heading' | 'copy' | 'button' | 'title' | 'body' | 'custom'

export interface ProjectAssetRef {
  assetId: string
  role: ProjectAssetRole
  slotId?: string
  sourceUpdatedAt?: string
  locked?: boolean
}

export interface ProjectCopyRef {
  copyBlockId: string
  role: ProjectCopyRole
  slotId?: string
  sourceUpdatedAt?: string
  locked?: boolean
}

export interface SavedBannerProject {
  id: string
  type: 'banners'
  name: string
  imageSrc: string
  assetId?: string
  styleReferenceSrc?: string
  styleReferenceName?: string
  styleReferenceAnalysis?: string
  styleMode?: 'reference' | 'autonomous'
  inputText?: string
  slides: Array<{
    id: string
    texts: {
      role: 'heading' | 'copy' | 'button'
      value: string
      copyBlockId?: string
      copyOverride?: string
      lockedCopy?: boolean
    }[]
  }>
  enabledFormats: string[]
  assetRefs?: ProjectAssetRef[]
  copyRefs?: ProjectCopyRef[]
  locked?: boolean
  createdAt: string
  updatedAt: string
}

export interface SavedPrintProject {
  id: string
  type: 'print'
  name: string
  title: string
  body: string
  imageSrc?: string
  assetId?: string
  format?: string
  formats?: string[]
  titleCopyBlockId?: string
  bodyCopyBlockId?: string
  titleCopyOverride?: string
  bodyCopyOverride?: string
  lockedCopy?: boolean
  htmlByFormat?: Record<string, string>
  assetRefs?: ProjectAssetRef[]
  copyRefs?: ProjectCopyRef[]
  locked?: boolean
  createdAt: string
  updatedAt: string
}

export interface AtelierProjectFreshnessTarget {
  id: string
  type: 'presentation' | 'banners' | 'print' | 'images' | 'video'
  name: string
  assetId?: string
  assetRefs?: ProjectAssetRef[]
  locked?: boolean
}

export type AtelierSavedProject = SavedBannerProject | SavedPrintProject

const BANNER_KEY = 'huphe:banner-projects:v1'
const PRINT_KEY = 'huphe:print-projects:v1'
const LEGACY_SINGLE_BANNER_KEY = 'huphe:banner-project:v1'
const LEGACY_SINGLE_BANNER_MIGRATION_KEY = 'huphe:banner-project:v1:migrated'
const MAX_PROJECTS = 50

function getProjects<T extends { updatedAt: string }>(key: string): T[] {
  try {
    const data = localStorage.getItem(key)
    if (!data) return []
    const parsed = JSON.parse(data) as T[]
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      : []
  } catch { return [] }
}

function upsertProject<T extends { id: string; updatedAt: string }>(key: string, project: T): T[] {
  try {
    const projects = getProjects<T>(key)
    const idx = projects.findIndex(p => p.id === project.id)
    if (idx >= 0) projects[idx] = project
    else projects.push(project)
    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    if (projects.length > MAX_PROJECTS) projects.length = MAX_PROJECTS
    localStorage.setItem(key, JSON.stringify(projects))
    return projects
  } catch { return [] }
}

function removeProject<T extends { id: string; updatedAt: string }>(key: string, id: string): T[] {
  try {
    const filtered = getProjects<T>(key).filter(p => p.id !== id)
    localStorage.setItem(key, JSON.stringify(filtered))
    return filtered
  } catch { return [] }
}

function withAssetRefs<T extends { assetId?: string; assetRefs?: ProjectAssetRef[]; updatedAt: string }>(project: T, role: ProjectAssetRole, slotId: string): T {
  if (!project.assetId || project.assetRefs?.some((ref) => ref.assetId === project.assetId)) return project
  return {
    ...project,
    assetRefs: [
      ...(project.assetRefs ?? []),
      { assetId: project.assetId, role, slotId, sourceUpdatedAt: project.updatedAt },
    ],
  }
}

function migrateLegacySingleBannerProject(): void {
  try {
    if (localStorage.getItem(LEGACY_SINGLE_BANNER_MIGRATION_KEY) === '1') return
    const raw = localStorage.getItem(LEGACY_SINGLE_BANNER_KEY)
    localStorage.setItem(LEGACY_SINGLE_BANNER_MIGRATION_KEY, '1')
    if (!raw) return

    const parsed = JSON.parse(raw) as Partial<SavedBannerProject>
    if (!parsed?.id || !parsed.imageSrc || !Array.isArray(parsed.slides)) return

    const now = new Date().toISOString()
    const project: SavedBannerProject = withAssetRefs({
      id: parsed.id,
      type: 'banners',
      name: parsed.name ?? parsed.slides[0]?.texts?.[0]?.value ?? `Banner ${new Date().toLocaleDateString('nl')}`,
      imageSrc: parsed.imageSrc,
      assetId: parsed.assetId,
      inputText: parsed.inputText,
      slides: parsed.slides,
      enabledFormats: parsed.enabledFormats ?? [],
      createdAt: parsed.createdAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
    }, 'background', 'banner-image')

    upsertProject<SavedBannerProject>(BANNER_KEY, project)
  } catch {
    // Legacy migration is best-effort. Existing v2 projects remain available.
  }
}

export const loadBannerProjects = (): SavedBannerProject[] => {
  migrateLegacySingleBannerProject()
  return getProjects<SavedBannerProject>(BANNER_KEY).map((project) => withAssetRefs(project, 'background', 'banner-image'))
}
export const loadPrintProjects = (): SavedPrintProject[] =>
  getProjects<SavedPrintProject>(PRINT_KEY).map((project) => withAssetRefs(project, 'background', 'print-image'))

export const upsertBannerProject = (project: SavedBannerProject): SavedBannerProject[] =>
  upsertProject<SavedBannerProject>(BANNER_KEY, withAssetRefs(project, 'background', 'banner-image'))

export const upsertPrintProject = (project: SavedPrintProject): SavedPrintProject[] =>
  upsertProject<SavedPrintProject>(PRINT_KEY, withAssetRefs(project, 'background', 'print-image'))

export const removeBannerProject = (id: string): SavedBannerProject[] =>
  removeProject<SavedBannerProject>(BANNER_KEY, id)

export const removePrintProject = (id: string): SavedPrintProject[] =>
  removeProject<SavedPrintProject>(PRINT_KEY, id)
