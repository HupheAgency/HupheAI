import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import logo from '../assets/logo.png'
import { supabase } from '../lib/supabase'
import { WebSlidePreview } from '../components/WebSlidePreview'
import type { TemplateData } from '../components/WebSlidePreview'
import { buildPreviewBlock, getSageTags } from '../lib/editor-types'
import type { Block, Overrides } from '../lib/editor-types'
import { loadBannerProjects, loadPrintProjects, upsertBannerProject, upsertPrintProject } from '../lib/atelier-project-store'
import { loadAtelierMediaProjects, saveAtelierMediaProjects, isImageAProject } from '../hooks/useAtelierMedia'
import { archiveTypewriterDocument, createTypewriterDocument, loadTypewriterDocuments, upsertTypewriterDocument, type TypewriterDocument } from '../lib/typewriter-documents'
import { loadAssets, resolveAssetSrc, type HupheAsset } from '../lib/asset-library'
import { shareAssetToSupabase } from '../lib/atelier-asset-sync'
import { fetchLiveAtelierProjects, pushAtelierProjectToSupabase, setAtelierProjectLive, disableAtelierProjectLive } from '../lib/atelier-project-sync'
import { loadAtelierMediaProjects as loadMediaProjectsLocal } from '../hooks/useAtelierMedia'
import { resolveTemplateData } from '../lib/template-storage'

const FAVORITES_KEY = 'huphe:asset-favorites:v1'
const VISUAL_SHARE_MAP_KEY = 'huphe:visual-share-map:v1'

interface ProjectMeta {
  name: string
  savedAt: string
  templateClientId: string | null
  supabasePresentationId: string | null
  filePath: string
  firstBlock?: Block | null
  overrides?: Overrides
  slideCount?: number
}

interface SavedImage {
  name: string
  path: string
  savedAt: string
}

type AssetType = 'project' | 'visual' | 'text' | 'presentation' | 'ai'
type ViewMode = 'grid' | 'list'

interface AssetItem {
  id: string
  title: string
  type: AssetType
  projectKind?: string
  description?: string
  thumbnail?: string
  preview?: ReactNode
  tags: string[]
  client?: string
  updatedAt: string
  createdAt: string
  updatedBy: string
  slides?: number
  words?: number
  isLive?: boolean
  isShared?: boolean
  isFavorite?: boolean
  shareCode?: string
  assetId?: string
  onOpen?: () => void
  onDelete?: () => void
  onShare?: () => void
  onRename?: (newTitle: string) => void
}

interface SharedLivePresentation {
  id: string
  name: string
  updated_at: string
  template_client_id: string
  blocks: Block[]
  overrides: Overrides
  md_text: string
}

interface PreviewResources {
  templateData: TemplateData
  mappings: Record<string, Record<number, string>>
  bgColors: Record<string, string>
  sageTagMappings: Record<string, Record<string, string>>
}

interface Props {
  onBack: () => void
  onOpenProject: (project: unknown) => void
  onJoinSession?: (project: unknown, presentationId: string) => void
  embedded?: boolean
  onNavigateToTypewriter?: (docId?: string) => void
  onOpenInAtelier?: (imagePath: string) => void
  onOpenAtelierMediaProject?: (projectId: string, type: 'images' | 'video' | 'print' | 'banners') => void
}

export default function ProjectsPage({ onBack, onOpenProject, onJoinSession, embedded, onNavigateToTypewriter, onOpenInAtelier, onOpenAtelierMediaProject }: Props) {
  const [projects,      setProjects]      = useState<ProjectMeta[]>([])
  const [loading,       setLoading]       = useState(true)
  const [opening,       setOpening]       = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)

  // supabasePresentationIds of the current user's own live presentations
  const [liveOwnedIds,  setLiveOwnedIds]  = useState<Set<string>>(new Set())
  const [liveTextDocIds, setLiveTextDocIds] = useState<Set<string>>(new Set())

  // presentations shared with this user that are currently live
  const [sharedLive,    setSharedLive]    = useState<SharedLivePresentation[]>([])
  const [sharedLoading, setSharedLoading] = useState(true)
  const [openingShared, setOpeningShared] = useState<string | null>(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [previewResources, setPreviewResources] = useState<Record<string, PreviewResources>>({})
  const [savedImages, setSavedImages] = useState<SavedImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(true)
  const [imageLightboxSrc, setImageLightboxSrc] = useState<string | null>(null)
  const [confirmDeleteImage, setConfirmDeleteImage] = useState<SavedImage | null>(null)
  const [deletingImage, setDeletingImage] = useState<string | null>(null)
  const [confirmDeleteTextDoc, setConfirmDeleteTextDoc] = useState<TypewriterDocument | null>(null)
  const [deletingTextDoc, setDeletingTextDoc] = useState<string | null>(null)
  const [typewriterDocuments, setTypewriterDocuments] = useState<TypewriterDocument[]>(() => loadTypewriterDocuments())
  const [dragActive, setDragActive] = useState(false)
  const [importingFiles, setImportingFiles] = useState(false)
  const [dropStatus, setDropStatus] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(FAVORITES_KEY) : null
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch { return new Set() }
  })
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [sharingVisual, setSharingVisual] = useState<string | null>(null)
  const [liveAtelierMap, setLiveAtelierMap] = useState<Map<string, string>>(new Map())
  const [goingLiveAtelier, setGoingLiveAtelier] = useState<string | null>(null)
  const dragDepthRef = useRef(0)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const api = (window as any).api
    api.listProjects().then((res: { ok: boolean; projects?: ProjectMeta[] }) => {
      setProjects(res.projects ?? [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const api = (window as any).api
    api.engine.listSavedImages()
      .then((res: { ok: boolean; images?: SavedImage[] }) => {
        if (res?.ok) setSavedImages(res.images ?? [])
      })
      .finally(() => setImagesLoading(false))
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favoriteIds))) } catch {}
  }, [favoriteIds])

  useEffect(() => {
    setTypewriterDocuments(loadTypewriterDocuments())
  }, [])

  useEffect(() => {
    if (!supabase) { setSharedLoading(false); return }
    const client = supabase
    let cancelled = false
    let liveChannel: ReturnType<typeof client.channel> | null = null

    client.auth.getUser()
      .then(({ data: { user } }) => {
        if (cancelled || !user) { setSharedLoading(false); return }
        if (!cancelled) {
          setOwnerId(user.id)
          fetchLiveAtelierProjects(user.id).then((items) => {
            if (!cancelled) setLiveAtelierMap(new Map(items.map((i) => [i.id, i.shareCode ?? ''])))
          })
        }

        // Own live presentations — match by supabasePresentationId stored in local file
        client
          .from('presentations')
          .select('id')
          .eq('owner_id', user.id)
          .eq('is_live', true)
          .then(({ data }) => {
            if (!cancelled) setLiveOwnedIds(new Set((data ?? []).map((p: { id: string }) => p.id)))
          })

        // Own live text documents — initiële fetch
        client
          .from('typewriter_documents')
          .select('id')
          .eq('owner_id', user.id)
          .eq('is_live', true)
          .then(({ data, error }) => {
            if (error) console.error('[ProjectsPage] live text docs fetch:', error.message)
            if (!cancelled) setLiveTextDocIds(new Set((data ?? []).map((d: { id: string }) => d.id)))
          })

        // Realtime: is_live-wijzigingen direct verwerken
        liveChannel = client
          .channel(`projects-typewriter-live-${user.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'typewriter_documents', filter: `owner_id=eq.${user.id}` },
            (payload) => {
              if (cancelled) return
              const row = payload.new as { id: string; is_live: boolean } | null
              if (!row?.id) return
              setLiveTextDocIds((prev) => {
                const next = new Set(prev)
                if (row.is_live) next.add(row.id)
                else next.delete(row.id)
                return next
              })
            },
          )
          .subscribe()

        // Presentations shared with this user that are currently live
        client
          .from('presentations')
          .select('id, name, updated_at, template_client_id, blocks, overrides, md_text')
          .neq('owner_id', user.id)
          .eq('is_live', true)
          .order('updated_at', { ascending: false })
          .then(({ data }) => {
            if (!cancelled) {
              setSharedLive((data as SharedLivePresentation[]) ?? [])
              setSharedLoading(false)
            }
          })
          .catch(() => { if (!cancelled) setSharedLoading(false) })
      })
      .catch(() => { if (!cancelled) setSharedLoading(false) })

    return () => {
      cancelled = true
      liveChannel?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const ids = Array.from(new Set([
      ...projects.map((p) => p.templateClientId),
      ...sharedLive.map((p) => p.template_client_id),
    ].filter((id): id is string => typeof id === 'string' && id.length > 0)))
      .filter((id) => !previewResources[id])

    if (ids.length === 0) return

    let cancelled = false
    const client = supabase

    ;(async () => {
      // Lokale templates eerst
      const localResults = await Promise.all(
        ids.map(async (id) => ({
          id,
          td: await (window as any).api?.getLocalTemplateData?.(id).then((r: any) => r?.ok ? r.templateData : null).catch(() => null),
          mappings: await (window as any).api?.getLocalMappings?.(id).catch(() => null),
        })),
      )

      // Supabase alleen voor IDs die lokaal niet beschikbaar zijn
      const missingIds = localResults.filter((r) => !r.td).map((r) => r.id)
      const remoteTemplates = new Map<string, TemplateData>()
      const remoteMappings = new Map<string, any>()
      if (missingIds.length > 0 && client) {
        const [templateRes, mappingRes] = await Promise.all([
          client.from('templates').select('client_id, template_data').in('client_id', missingIds),
          client.from('template_mappings').select('client_id, mappings').in('client_id', missingIds),
        ])
        for (const row of (templateRes.data as any[]) ?? []) {
          const resolved = await resolveTemplateData(client, row.template_data)
          if (resolved) remoteTemplates.set(row.client_id, resolved)
        }
        for (const row of (mappingRes.data as any[]) ?? []) {
          remoteMappings.set(row.client_id, row.mappings ?? {})
        }
      }

      if (cancelled) return
      const next: Record<string, PreviewResources> = {}
      for (const { id, td: localTd, mappings: localMappings } of localResults) {
        const templateData = localTd ?? remoteTemplates.get(id)
        if (!templateData) continue
        const raw = localMappings ?? remoteMappings.get(id) ?? {}
        next[id] = { templateData, mappings: raw, bgColors: raw._bgColors ?? {}, sageTagMappings: raw._mdToSageTag ?? {} }
      }
      if (Object.keys(next).length > 0) setPreviewResources((prev) => ({ ...prev, ...next }))
    })()

    return () => { cancelled = true }
  }, [projects, sharedLive, previewResources])

  function handleOpenShared(pres: SharedLivePresentation) {
    setOpeningShared(pres.id)
    const project = {
      version: 1,
      name: pres.name,
      savedAt: pres.updated_at,
      templateClientId: pres.template_client_id,
      mdText: pres.md_text,
      blocks: pres.blocks,
      overrides: pres.overrides,
    }
    if (onJoinSession) {
      onJoinSession(project, pres.id)
    } else {
      onOpenProject(project)
    }
  }

  async function handleDelete(p: ProjectMeta) {
    setDeleting(p.filePath)
    const api = (window as any).api
    await api.deleteProject(p.filePath)
    if (p.supabasePresentationId && supabase) {
      await supabase.from('presentations').delete().eq('id', p.supabasePresentationId)
    }
    setProjects((prev) => prev.filter((x) => x.filePath !== p.filePath))
    setDeleting(null)
    setConfirmDelete(null)
  }

  async function handleDeleteTextDoc(doc: TypewriterDocument) {
    setDeletingTextDoc(doc.id)
    const now = new Date().toISOString()
    archiveTypewriterDocument(doc.id, now)
    setTypewriterDocuments(loadTypewriterDocuments())
    if (supabase) {
      const { error } = await supabase
        .from('typewriter_documents')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', doc.id)
      if (error) console.error('[Projects] delete text doc failed:', error.message)
    }
    setDeletingTextDoc(null)
    setConfirmDeleteTextDoc(null)
  }

  async function handleGoLiveAtelier(rawProjectId: string, type: 'banners' | 'print' | 'media-images' | 'media-video') {
    if (!ownerId) return
    setGoingLiveAtelier(rawProjectId)
    try {
      let projectData: unknown = null
      let name = ''
      let createdAt = new Date().toISOString()
      if (type === 'banners') {
        const p = loadBannerProjects().find((b) => b.id === rawProjectId)
        if (!p) return
        projectData = p; name = p.name; createdAt = p.createdAt
      } else if (type === 'print') {
        const p = loadPrintProjects().find((b) => b.id === rawProjectId)
        if (!p) return
        projectData = p; name = p.name || p.title; createdAt = p.createdAt
      } else {
        const p = loadMediaProjectsLocal().find((b) => b.id === rawProjectId)
        if (!p) return
        projectData = p; name = p.title; createdAt = p.createdAt
      }
      await pushAtelierProjectToSupabase(rawProjectId, type, name, projectData, ownerId, createdAt)
      const code = await setAtelierProjectLive(rawProjectId)
      if (code) {
        setLiveAtelierMap((prev) => new Map([...prev, [rawProjectId, code]]))
        setLibraryRefreshToken((t) => t + 1)
      }
    } finally {
      setGoingLiveAtelier(null)
    }
  }

  async function handleStopLiveAtelier(rawProjectId: string) {
    await disableAtelierProjectLive(rawProjectId)
    setLiveAtelierMap((prev) => { const next = new Map(prev); next.delete(rawProjectId); return next })
    setLibraryRefreshToken((t) => t + 1)
  }

  async function handleShareVisual(img: SavedImage) {
    if (!ownerId) return
    setSharingVisual(img.path)
    try {
      const api = (window as any).api
      const buffer: ArrayBuffer | null = await api.readFileBuffer(img.path).catch(() => null)
      if (!buffer) return

      const ext = img.path.split('.').pop()?.toLowerCase() ?? ''
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

      let shareMap: Record<string, string> = {}
      try { shareMap = JSON.parse(window.localStorage.getItem(VISUAL_SHARE_MAP_KEY) ?? '{}') } catch {}
      if (!shareMap[img.path]) {
        shareMap[img.path] = `visual-shared-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        window.localStorage.setItem(VISUAL_SHARE_MAP_KEY, JSON.stringify(shareMap))
      }
      const assetId = shareMap[img.path]
      const asset: HupheAsset = {
        id: assetId, name: img.name, src: img.path, type: 'image', mimeType,
        isShared: false, createdAt: img.savedAt, updatedAt: new Date().toISOString(),
      }
      const result = await shareAssetToSupabase(asset, ownerId, buffer, mimeType)
      if (result) setLibraryRefreshToken((t) => t + 1)
    } finally {
      setSharingVisual(null)
    }
  }

  async function handleShareVideoProject(src: string, title: string, createdAt: string) {
    if (!ownerId) return
    setSharingVisual(src)
    try {
      const api = (window as any).api
      const buffer: ArrayBuffer | null = await api.readFileBuffer(src).catch(() => null)
      if (!buffer) return

      const ext = src.split('.').pop()?.toLowerCase() ?? ''
      const mimeType = ext === 'mp4' ? 'video/mp4'
        : ext === 'webm' ? 'video/webm'
        : ext === 'mov' ? 'video/quicktime'
        : ext === 'gif' ? 'image/gif'
        : 'video/mp4'

      let shareMap: Record<string, string> = {}
      try { shareMap = JSON.parse(window.localStorage.getItem(VISUAL_SHARE_MAP_KEY) ?? '{}') } catch {}
      if (!shareMap[src]) {
        shareMap[src] = `video-shared-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        window.localStorage.setItem(VISUAL_SHARE_MAP_KEY, JSON.stringify(shareMap))
      }
      const assetId = shareMap[src]
      const asset: HupheAsset = {
        id: assetId, name: title, src, type: 'video', mimeType,
        isShared: false, createdAt, updatedAt: new Date().toISOString(),
      }
      const result = await shareAssetToSupabase(asset, ownerId, buffer, mimeType)
      if (result) setLibraryRefreshToken((t) => t + 1)
    } finally {
      setSharingVisual(null)
    }
  }

  async function handleDeleteImage(img: SavedImage) {
    setDeletingImage(img.path)
    const api = (window as any).api
    const res = await api.engine.deleteSavedImage({ path: img.path })
    if (res.ok) {
      setSavedImages((prev) => prev.filter((item) => item.path !== img.path))
      if (imageLightboxSrc === img.path) setImageLightboxSrc(null)
    } else {
      console.error('[Projects] delete-saved-image failed:', res.error)
    }
    setDeletingImage(null)
    setConfirmDeleteImage(null)
  }

  async function handleOpen(filePath: string, presentationId?: string | null) {
    setOpening(filePath)
    const api = (window as any).api
    const res = await api.loadProject(filePath)
    const project = res.project ?? res
    if (presentationId && onJoinSession) {
      onJoinSession(project, presentationId)
    } else {
      onOpenProject(project)
    }
  }

  function formatDate(iso: string) {
    try {
      return new Intl.DateTimeFormat('nl-NL', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
    } catch { return iso }
  }

  const q = searchQuery.trim().toLowerCase()
  const filteredProjects  = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects
  const filteredShared    = q ? sharedLive.filter((p) => p.name.toLowerCase().includes(q)) : sharedLive
  const filteredImages    = (q ? savedImages.filter((img) => img.name.toLowerCase().includes(q)) : savedImages)
    .filter((img) => !isImageAProject(img.path))
  const filteredTypewriterDocuments = q
    ? typewriterDocuments.filter((doc) => `${doc.title} ${stripHtml(doc.content)}`.toLowerCase().includes(q))
    : typewriterDocuments
  const hasPresentations = projects.length > 0 || sharedLive.length > 0
  const hasImages = savedImages.length > 0
  const hasTypewriterDocuments = typewriterDocuments.length > 0
  const hasContent = hasPresentations || hasImages || hasTypewriterDocuments
  const allLoading = loading || sharedLoading || imagesLoading
  const imageLightboxIndex = imageLightboxSrc ? filteredImages.findIndex((img) => img.path === imageLightboxSrc) : -1

  const assetItems = useMemo<AssetItem[]>(() => {
    const bannerItems: AssetItem[] = loadBannerProjects().map((project) => {
      const id = `banner:${project.id}`
      const isLive = liveAtelierMap.has(project.id)
      const shareCode = liveAtelierMap.get(project.id) || undefined
      return {
        id,
        title: project.name,
        type: 'project',
        projectKind: 'Banner',
        description: `${project.slides.length} slide${project.slides.length === 1 ? '' : 's'} · ${project.enabledFormats.length} format${project.enabledFormats.length === 1 ? '' : 'en'}`,
        thumbnail: isTempPath(project.imageSrc) ? undefined : project.imageSrc,
        tags: ['Banners', ...(isLive ? ['Live'] : [])],
        client: inferClientName(project.name),
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        updatedBy: 'Atelier',
        isFavorite: favoriteIds.has(id),
        isLive,
        shareCode,
        assetId: project.id,
        onOpen: onOpenAtelierMediaProject
          ? () => onOpenAtelierMediaProject(project.id, 'banners')
          : undefined,
        onShare: isLive
          ? () => handleStopLiveAtelier(project.id)
          : () => handleGoLiveAtelier(project.id, 'banners'),
        onRename: (newTitle) => {
          upsertBannerProject({ ...project, name: newTitle, updatedAt: new Date().toISOString() })
          setLibraryRefreshToken((t) => t + 1)
        },
      }
    })

    const printItems: AssetItem[] = loadPrintProjects().map((project) => {
      const id = `media:${project.id}`
      const isLive = liveAtelierMap.has(project.id)
      const shareCode = liveAtelierMap.get(project.id) || undefined
      const formats = project.formats ?? (project.format ? [project.format] : [])
      const hasSocial = formats.some((f) => /social|instagram|facebook|twitter|linkedin/i.test(f))
      const hasPrint = formats.some((f) => /print|a4|a3|flyer|poster/i.test(f))
      const printKind = hasSocial && !hasPrint ? 'Social' : !hasSocial && hasPrint ? 'Print' : 'Multimedia'
      const resolvedSrc = resolveAssetSrc(project.assetId, project.imageSrc ?? '')
      const thumb = isTempPath(resolvedSrc) ? undefined : resolvedSrc || undefined
      const firstHtml = project.htmlByFormat ? Object.values(project.htmlByFormat)[0] : undefined
      return {
        id,
        title: project.name || project.title,
        type: 'project',
        projectKind: printKind,
        description: project.body || 'Media project',
        thumbnail: thumb,
        preview: !thumb && firstHtml ? <PrintHtmlPreview html={firstHtml} /> : undefined,
        tags: ['Media', ...(isLive ? ['Live'] : [])],
        client: inferClientName(project.name || project.title),
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        updatedBy: 'Atelier',
        isFavorite: favoriteIds.has(id),
        isLive,
        shareCode,
        assetId: project.id,
        onOpen: onOpenAtelierMediaProject
          ? () => onOpenAtelierMediaProject(project.id, 'print')
          : undefined,
        onShare: isLive
          ? () => handleStopLiveAtelier(project.id)
          : () => handleGoLiveAtelier(project.id, 'print'),
        onRename: (newTitle) => {
          upsertPrintProject({ ...project, name: newTitle, title: newTitle, updatedAt: new Date().toISOString() })
          setLibraryRefreshToken((t) => t + 1)
        },
      }
    })

    const mediaProjectItems: AssetItem[] = loadAtelierMediaProjects().map((project) => {
      const id = `${project.type === 'video' ? 'video' : 'media'}:${project.id}`
      const isVideo = project.type === 'video'
      const mediaType: 'media-images' | 'media-video' = isVideo ? 'media-video' : 'media-images'
      const isLive = liveAtelierMap.has(project.id)
      const shareCode = liveAtelierMap.get(project.id) || undefined
      let sharedAssetId: string | undefined
      try {
        const m: Record<string, string> = JSON.parse(window.localStorage.getItem(VISUAL_SHARE_MAP_KEY) ?? '{}')
        sharedAssetId = m[project.src]
      } catch {}
      const videoIsShared = !!(sharedAssetId && loadAssets().some((a) => a.id === sharedAssetId && a.isShared))
      return {
        id,
        title: project.title,
        type: 'project',
        projectKind: isVideo ? 'Video' : 'Afbeelding',
        description: project.prompt,
        thumbnail: project.src || undefined,
        tags: isVideo
          ? ['Video', ...(videoIsShared ? ['Linked'] : [])]
          : ['Afbeelding', ...(isLive ? ['Live'] : [])],
        client: inferClientName(project.title),
        updatedAt: project.createdAt,
        createdAt: project.createdAt,
        updatedBy: 'Atelier',
        isFavorite: favoriteIds.has(id),
        isLive: isVideo ? videoIsShared : isLive,
        isShared: isVideo ? videoIsShared : undefined,
        shareCode: isVideo ? undefined : shareCode,
        assetId: isVideo ? sharedAssetId : project.id,
        onOpen: onOpenAtelierMediaProject
          ? () => onOpenAtelierMediaProject(project.id, isVideo ? 'video' : 'images')
          : undefined,
        onRename: (newTitle) => {
          const all = loadAtelierMediaProjects()
          const updated = all.map((p) => p.id === project.id ? { ...p, title: newTitle } : p)
          saveAtelierMediaProjects(updated)
          setLibraryRefreshToken((t) => t + 1)
        },
        onShare: isVideo
          ? () => handleShareVideoProject(project.src, project.title, project.createdAt)
          : isLive
            ? () => handleStopLiveAtelier(project.id)
            : () => handleGoLiveAtelier(project.id, mediaType),
      }
    })

    const presentationItems: AssetItem[] = projects.map((p) => {
      const isLive = !!p.supabasePresentationId && liveOwnedIds.has(p.supabasePresentationId)
      const id = `presentation:${p.filePath}`
      return {
        id,
        title: p.name,
        type: 'presentation',
        description: `${p.slideCount ?? 0} slides`,
        preview: renderFirstSlidePreview(p.firstBlock, p.overrides, p.templateClientId ? previewResources[p.templateClientId] : undefined),
        tags: ['Presentation', ...(isLive ? ['Live'] : [])],
        client: inferClientName(p.name),
        updatedAt: p.savedAt,
        createdAt: p.savedAt,
        updatedBy: 'You',
        slides: p.slideCount,
        isLive,
        isFavorite: favoriteIds.has(id),
        onOpen: () => handleOpen(p.filePath, isLive ? p.supabasePresentationId : null),
        onDelete: () => setConfirmDelete(p),
      }
    })

    const sharedItems: AssetItem[] = sharedLive.map((p) => {
      const id = `presentation:${p.id}`
      return {
        id,
        title: p.name,
        type: 'presentation',
        description: 'Gedeelde live presentatie',
        preview: renderFirstSlidePreview(p.blocks[0], p.overrides, previewResources[p.template_client_id]),
        tags: ['Presentation', 'Shared', 'Live'],
        client: inferClientName(p.name),
        updatedAt: p.updated_at,
        createdAt: p.updated_at,
        updatedBy: 'Team',
        slides: (p.blocks as unknown[]).length || undefined,
        isLive: true,
        isShared: true,
        isFavorite: favoriteIds.has(id),
        onOpen: () => handleOpenShared(p),
      }
    })

    let shareMap: Record<string, string> = {}
    try { shareMap = JSON.parse(window.localStorage.getItem(VISUAL_SHARE_MAP_KEY) ?? '{}') } catch {}
    const sharedAssets = loadAssets()
    const sharedAssetIds = new Set(sharedAssets.filter((a) => a.isShared).map((a) => a.id))

    const imageItems: AssetItem[] = savedImages.filter((img) => !isImageAProject(img.path)).map((img) => {
      const id = `visual:${img.path}`
      const assetId = shareMap[img.path]
      const isShared = !!(assetId && sharedAssetIds.has(assetId))
      return {
        id,
        title: img.name,
        type: 'visual',
        description: 'Visueel asset',
        thumbnail: img.path,
        tags: ['Visual', ...(isShared ? ['Linked'] : [])],
        client: inferClientName(img.name),
        updatedAt: img.savedAt,
        createdAt: img.savedAt,
        updatedBy: 'Atelier',
        isFavorite: favoriteIds.has(id),
        isShared,
        assetId,
        onOpen: () => onOpenInAtelier ? onOpenInAtelier(img.path) : setImageLightboxSrc(img.path),
        onDelete: () => setConfirmDeleteImage(img),
        onShare: () => handleShareVisual(img),
      }
    })

    const textItems: AssetItem[] = typewriterDocuments.filter((doc) => doc.title.trim() || stripHtml(doc.content).trim()).map((doc) => {
      const id = `text:${doc.id}`
      const isLive = liveTextDocIds.has(doc.id) || !!doc.isLive
      return {
        id,
        title: doc.title || 'Naamloos tekstdocument',
        type: 'text',
        description: stripHtml(doc.content) || 'Leeg document',
        tags: ['Text', 'Typewriter', ...(isLive ? ['Live'] : [])],
        client: inferClientName(doc.title),
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
        updatedBy: 'You',
        words: wordCount(doc.content),
        isLive,
        shareCode: doc.shareCode,
        isFavorite: favoriteIds.has(id),
        onOpen: () => onNavigateToTypewriter?.(doc.id),
        onDelete: () => setConfirmDeleteTextDoc(doc),
        onRename: (newTitle) => {
          upsertTypewriterDocument({ ...doc, title: newTitle, updatedAt: new Date().toISOString() })
          setTypewriterDocuments(loadTypewriterDocuments())
        },
      }
    })

    return [...presentationItems, ...sharedItems, ...bannerItems, ...printItems, ...mediaProjectItems, ...textItems, ...imageItems]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [projects, sharedLive, savedImages, typewriterDocuments, liveOwnedIds, liveTextDocIds, liveAtelierMap, previewResources, favoriteIds, libraryRefreshToken, onNavigateToTypewriter, onOpenAtelierMediaProject])

  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return assetItems.filter((item) => {
      const haystack = `${item.title} ${item.description ?? ''} ${item.tags.join(' ')} ${item.client ?? ''} ${item.updatedBy}`.toLowerCase()
      if (query && !haystack.includes(query)) return false
      if (activeFilters.length > 0 && !activeFilters.some((filter) => assetMatchesLibraryFilter(item, filter))) return false
      return true
    })
  }, [activeFilters, assetItems, searchQuery])

  const selectedAsset = filteredAssets.find((item) => item.id === selectedAssetId)
    ?? filteredAssets[0]
    ?? assetItems[0]
    ?? null
  const groupedAssets = groupAssetsByDate(filteredAssets)
  const hasResults = filteredAssets.length > 0

  function toggleFilter(id: string) {
    if (id === 'all') {
      setActiveFilters([])
      return
    }
    if (id === 'clear') {
      setActiveFilters([])
      return
    }
    setActiveFilters((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stepImageLightbox(direction: -1 | 1) {
    if (filteredImages.length === 0) return
    const baseIndex = imageLightboxIndex >= 0 ? imageLightboxIndex : 0
    const nextIndex = (baseIndex + direction + filteredImages.length) % filteredImages.length
    setImageLightboxSrc(filteredImages[nextIndex].path)
  }

  function resetDragState() {
    dragDepthRef.current = 0
    setDragActive(false)
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDragActive(true)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.files.length) return
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    resetDragState()
    await importDroppedFiles(files)
  }

  async function importDroppedFiles(files: File[]) {
    setImportingFiles(true)
    setDropStatus(`${files.length} bestand${files.length === 1 ? '' : 'en'} importeren…`)

    let imageCount = 0
    let textCount = 0
    let skippedCount = 0

    for (const file of files) {
      try {
        if (file.type.startsWith('image/')) {
          const src = await readFileAsDataUrl(file)
          const baseName = stripExtension(file.name)
          const res = await (window as any).api.engine.saveImage({ src, name: baseName })
          if (res?.ok) imageCount += 1
          else skippedCount += 1
          continue
        }

        if (isTextLikeFile(file)) {
          const text = await readDroppedText(file)
          const document = createTypewriterDocument(stripExtension(file.name))
          upsertTypewriterDocument({
            ...document,
            content: textToHtml(text),
          })
          textCount += 1
          continue
        }

        skippedCount += 1
      } catch {
        skippedCount += 1
      }
    }

    const api = (window as any).api
    const imagesRes = await api.engine.listSavedImages()
    if (imagesRes?.ok) setSavedImages(imagesRes.images ?? [])
    setTypewriterDocuments(loadTypewriterDocuments())
    setLibraryRefreshToken((token) => token + 1)

    const parts = [
      imageCount > 0 ? `${imageCount} afbeelding${imageCount === 1 ? '' : 'en'}` : '',
      textCount > 0 ? `${textCount} tekstdocument${textCount === 1 ? '' : 'en'}` : '',
      skippedCount > 0 ? `${skippedCount} overgeslagen` : '',
    ].filter(Boolean)
    setDropStatus(parts.length ? `Toegevoegd: ${parts.join(' · ')}` : 'Geen geschikte bestanden gevonden.')
    setImportingFiles(false)
    window.setTimeout(() => setDropStatus(''), 4000)
  }

  async function handleImportInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    await importDroppedFiles(files)
  }

  useEffect(() => {
    if (!imageLightboxSrc) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setImageLightboxSrc(null)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        stepImageLightbox(-1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        stepImageLightbox(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [imageLightboxSrc, imageLightboxIndex, filteredImages])

  return (
    <div
      className={[
        embedded ? 'h-full bg-[#0a0a0a] flex flex-col' : 'min-h-screen bg-[#0a0a0a] flex flex-col',
        'relative overflow-x-hidden overscroll-x-none',
      ].join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!embedded && (
        <header
          className="flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
          style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-2.5 pl-20"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="w-7 h-7 bg-[#facc15] rounded-md flex items-center justify-center">
              <img src={logo} alt="" className="w-4 h-4 object-contain" />
            </div>
            <span className="text-white font-semibold text-[15px] tracking-tight">HupheAI</span>
          </div>
          <div
            className="flex items-center gap-3 pr-5"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={onBack}
              className="text-white/40 hover:text-white/70 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors"
            >
              ← Terug
            </button>
          </div>
        </header>
      )}

      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none px-7 pb-10 pt-7">
        <div className="mx-auto max-w-[1480px] min-w-0 overflow-x-hidden">
          <AssetsToolbar
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onImport={() => importInputRef.current?.click()}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            status={dropStatus}
          />
          <input
            ref={importInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.csv,.json,.rtf,.docx"
            onChange={handleImportInputChange}
            className="hidden"
          />

          <FilterBar activeFilters={activeFilters} onToggleFilter={toggleFilter} />

          {allLoading && (
            <div className="mt-8 flex items-center gap-2 text-sm text-white/30">
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.22-8.56" />
              </svg>
              Laden…
            </div>
          )}

          {!allLoading && !hasContent && (
            <div className="mt-24 flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <ImportIcon />
              </div>
              <div>
                <p className="text-sm font-medium text-white/50">Nog geen assets</p>
                <p className="mt-1 max-w-sm text-xs text-white/25">Sleep bestanden naar dit scherm of gebruik de importknop.</p>
              </div>
            </div>
          )}

          {!allLoading && hasContent && (
            <div className="documents-layout mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)_320px] gap-4 overflow-x-hidden max-[980px]:grid-cols-1">
              <section className="min-w-0">
                {!hasResults ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.10] bg-[#121214] px-6 py-12 text-center">
                    <p className="text-sm text-white/40">Geen assets gevonden voor deze filters.</p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <AssetGrid
                    groups={groupedAssets}
                    selectedId={selectedAsset?.id ?? null}
                    onSelect={setSelectedAssetId}
                    onToggleFavorite={toggleFavorite}
                  />
                ) : (
                  <AssetsTable
                    assets={filteredAssets}
                    selectedId={selectedAsset?.id ?? null}
                    onSelect={setSelectedAssetId}
                    onToggleFavorite={toggleFavorite}
                  />
                )}
              </section>

              <AssetDetailPanel asset={selectedAsset} onToggleFavorite={toggleFavorite} sharingVisual={sharingVisual} goingLiveAtelier={goingLiveAtelier} />
            </div>
          )}
        </div>
      </main>

      {(dragActive || importingFiles) && (
        <div className="pointer-events-none absolute inset-0 z-[9000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-8 flex min-h-[52vh] w-full max-w-4xl flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[#facc15]/55 bg-[#141414]/88 px-8 text-center shadow-2xl">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#facc15] text-3xl text-black">
              +
            </div>
            <p className="text-2xl font-semibold tracking-tight text-white">
              {importingFiles ? 'Bestanden toevoegen…' : 'Laat los om toe te voegen'}
            </p>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/45">
              Afbeeldingen komen onder Afbeeldingen. Tekstbestanden en Word-documenten worden als Typewriter document opgeslagen.
            </p>
          </div>
        </div>
      )}

      {imageLightboxSrc && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={(event) => { if (event.target === event.currentTarget) setImageLightboxSrc(null) }}
        >
          {filteredImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  stepImageLightbox(-1)
                }}
                className="absolute left-6 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/70 transition-colors hover:border-white/30 hover:text-white"
                aria-label="Vorige afbeelding"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  stepImageLightbox(1)
                }}
                className="absolute right-6 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/70 transition-colors hover:border-white/30 hover:text-white"
                aria-label="Volgende afbeelding"
              >
                ›
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs text-white/60">
                {(imageLightboxIndex >= 0 ? imageLightboxIndex : 0) + 1} / {filteredImages.length}
              </div>
            </>
          )}
          <img
            src={imageLightboxSrc}
            alt="Opgeslagen afbeelding"
            className="max-h-[88vh] max-w-[88vw] rounded-2xl shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setImageLightboxSrc(null)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/70 hover:text-white transition-colors"
            aria-label="Afbeelding sluiten"
          >
            ×
          </button>
        </div>
      )}

      {confirmDeleteImage && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteImage(null) }}
        >
          <div className="bg-[#141414] border border-white/[0.09] rounded-2xl p-6 w-[360px] flex flex-col gap-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">"{confirmDeleteImage.name}" verwijderen?</p>
                <p className="text-white/40 text-xs mt-1 leading-relaxed">
                  De afbeelding wordt permanent uit je HupheAI-afbeeldingenmap verwijderd.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteImage(null)}
                className="px-4 py-2 rounded-xl text-white/50 hover:text-white/80 text-xs border border-white/[0.08] hover:border-white/20 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => handleDeleteImage(confirmDeleteImage)}
                disabled={deletingImage === confirmDeleteImage.path}
                className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-red-400 hover:text-red-300 text-xs border border-red-500/20 hover:border-red-500/40 transition-colors font-medium"
              >
                {deletingImage === confirmDeleteImage.path ? 'Verwijderen…' : 'Ja, verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verwijder bevestigingsmodal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null) }}
        >
          <div className="bg-[#141414] border border-white/[0.09] rounded-2xl p-6 w-[360px] flex flex-col gap-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-semibold">"{confirmDelete.name}" verwijderen?</p>
                <p className="text-white/40 text-xs mt-1 leading-relaxed">
                  Het bestand wordt permanent van je computer verwijderd en is niet terug te halen.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-white/50 hover:text-white/80 text-xs border border-white/[0.08] hover:border-white/20 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.filePath}
                className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-red-400 hover:text-red-300 text-xs border border-red-500/20 hover:border-red-500/40 transition-colors font-medium"
              >
                {deleting === confirmDelete.filePath ? 'Verwijderen…' : 'Ja, verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteTextDoc && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteTextDoc(null) }}
        >
          <div className="bg-[#141414] border border-white/[0.09] rounded-2xl p-6 w-[360px] flex flex-col gap-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">"{confirmDeleteTextDoc.title || 'Naamloos tekstdocument'}" verwijderen?</p>
                <p className="text-white/40 text-xs mt-1 leading-relaxed">
                  Het document wordt permanent verwijderd en is niet terug te halen.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteTextDoc(null)}
                className="px-4 py-2 rounded-xl text-white/50 hover:text-white/80 text-xs border border-white/[0.08] hover:border-white/20 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => handleDeleteTextDoc(confirmDeleteTextDoc)}
                disabled={deletingTextDoc === confirmDeleteTextDoc.id}
                className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-red-400 hover:text-red-300 text-xs border border-red-500/20 hover:border-red-500/40 transition-colors font-medium"
              >
                {deletingTextDoc === confirmDeleteTextDoc.id ? 'Verwijderen…' : 'Ja, verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderFirstSlidePreview(
  block: Block | null | undefined,
  overrides: Overrides | undefined,
  resources: PreviewResources | undefined,
) {
  if (!block || !resources) return undefined
  return <FirstSlidePreview block={block} overrides={overrides ?? {}} resources={resources} />
}

function FirstSlidePreview({
  block,
  overrides,
  resources,
}: {
  block: Block
  overrides: Overrides
  resources: PreviewResources
}) {
  const sageTags = getSageTags(block.type, resources.templateData, resources.mappings)
  const previewBlock = buildPreviewBlock(block, overrides, resources.sageTagMappings, sageTags)

  return (
    <WebSlidePreview
      block={previewBlock}
      templateData={resources.templateData}
      mappings={resources.mappings}
      bgColors={resources.bgColors}
    />
  )
}

function AssetsToolbar({
  searchQuery,
  onSearch,
  onImport,
  viewMode,
  onViewModeChange,
  status,
}: {
  searchQuery: string
  onSearch: (value: string) => void
  onImport: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  status: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <label className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/25">
            <SearchIcon />
          </span>
          <input
            value={searchQuery}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Zoek assets, projecten, inhoud..."
            className="h-14 w-full rounded-[14px] border border-white/[0.08] bg-[#151515] pl-11 pr-4 text-[15px] text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.16]"
          />
        </label>
        <button
          type="button"
          onClick={onImport}
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[#151515] text-white/45 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]"
          title="Importeren"
        >
          <ImportIcon />
        </button>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="min-h-5 text-xs text-[#facc15]/75">{status}</p>
        <ViewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
    </section>
  )
}

function FilterBar({ activeFilters, onToggleFilter }: { activeFilters: string[]; onToggleFilter: (id: string) => void }) {
  const chips = [
    { id: 'all', label: 'Alles', icon: '●' },
    { id: 'afbeeldingen', label: 'Afbeeldingen', icon: '▧' },
    { id: 'presentations', label: 'Presentaties', icon: '▭' },
    { id: 'media', label: 'Media', icon: '◫' },
    { id: 'banners', label: 'Banners', icon: '▰' },
    { id: 'video', label: 'Video', icon: '▻' },
    { id: 'copy', label: 'Tekst', icon: 'T' },
    { id: 'clear', label: 'Wis alles', icon: '×' },
  ]
  return (
    <div className="mt-3 flex flex-wrap gap-2 rounded-[16px] border border-white/[0.08] bg-[#121214] p-2">
      {chips.map((chip) => {
        const active = chip.id === 'all' ? activeFilters.length === 0 : activeFilters.includes(chip.id)
        return (
          <FilterChip
            key={chip.id}
            label={chip.label}
            icon={chip.icon}
            active={active}
            muted={chip.id === 'clear'}
            onClick={() => onToggleFilter(chip.id)}
          />
        )
      })}
    </div>
  )
}

function FilterChip({ label, icon, active, muted, onClick }: { label: string; icon: string; active: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-8 items-center gap-2 rounded-[10px] border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-white/[0.16] bg-white/[0.10] text-white/88'
          : muted
            ? 'border-transparent bg-transparent text-white/32 hover:text-white/58'
            : 'border-white/[0.07] bg-[#18181a] text-white/45 hover:border-white/[0.13] hover:text-white/70',
      ].join(' ')}
    >
      <span className={active ? 'text-[#facc15]' : 'text-white/32'}>{icon}</span>
      {label}
    </button>
  )
}

function AssetGrid({
  groups,
  selectedId,
  onSelect,
  onToggleFavorite,
}: {
  groups: Array<{ label: string; assets: AssetItem[] }>
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
}) {
  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <AssetSection key={group.label} label={group.label}>
          <div className="document-grid grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {group.assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedId}
                onSelect={() => onSelect(asset.id)}
                onToggleFavorite={() => onToggleFavorite(asset.id)}
              />
            ))}
          </div>
        </AssetSection>
      ))}
    </div>
  )
}

function AssetSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/32">{label}</p>
      {children}
    </section>
  )
}

function AssetCard({ asset, selected, onSelect, onToggleFavorite }: { asset: AssetItem; selected: boolean; onSelect: () => void; onToggleFavorite: () => void }) {
  return (
    <article
      onClick={onSelect}
      onDoubleClick={() => asset.onOpen?.()}
      className={[
        'group relative cursor-pointer rounded-[14px] border bg-gradient-to-b from-[#1c1c1f] to-[#141416] p-2.5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:from-[#202024] hover:to-[#161618]',
        selected ? 'border-[#facc15]/55 shadow-[0_0_0_1px_rgba(250,204,21,0.12),0_12px_40px_rgba(250,204,21,0.05)]' : 'border-white/[0.08]',
      ].join(' ')}
    >
      <div className="relative overflow-hidden rounded-[10px] bg-[#0c0c0d]">
        <AssetPreview asset={asset} />
        <TypeBadge type={asset.type} projectKind={asset.projectKind} className="absolute left-2.5 top-2.5" />
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleFavorite() }}
          className={['absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.10] bg-black/45 transition-colors', asset.isFavorite ? 'text-[#facc15]' : 'text-white/35 hover:text-white/75'].join(' ')}
          title="Favoriet"
        >
          ★
        </button>
      </div>
      <div className="px-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-white/88">{asset.title}</p>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); asset.onDelete?.() }}
            className="text-white/25 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100"
          >
            ⋯
          </button>
        </div>
        <p className="mt-2 text-xs text-white/35">Bijgewerkt {relativeDate(asset.updatedAt)} door {asset.updatedBy}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {asset.tags.slice(0, 3).map((tag) => (
            <AssetTag key={tag} tag={tag} />
          ))}
        </div>
      </div>
    </article>
  )
}

function parsePrintHtmlDims(html: string): { w: number; h: number } {
  const px = html.match(/width:(\d+)px;height:(\d+)px/)
  if (px) return { w: parseInt(px[1]), h: parseInt(px[2]) }
  const mm = html.match(/width:([\d.]+)mm;height:([\d.]+)mm/)
  if (mm) return { w: Math.round(parseFloat(mm[1]) * 3.7795), h: Math.round(parseFloat(mm[2]) * 3.7795) }
  return { w: 794, h: 1123 }
}

function PrintHtmlPreview({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.offsetWidth)
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { w: dw, h: dh } = useMemo(() => parsePrintHtmlDims(html), [html])
  const scale = containerWidth > 0 ? containerWidth / dw : 0
  return (
    <div ref={containerRef} className="aspect-[1.55] w-full overflow-hidden relative bg-white">
      {scale > 0 && (
        <div style={{ width: dw, height: dh, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none', position: 'absolute', top: 0, left: 0 }}>
          <iframe srcDoc={html} style={{ width: dw, height: dh, border: 'none', display: 'block' }} sandbox="allow-same-origin" title="print preview" />
        </div>
      )}
    </div>
  )
}

function isTempPath(src?: string | null): boolean {
  if (!src) return false
  return src.includes('/var/folders/') || src.includes('/tmp/') || src.includes('\\Temp\\')
}

function SafeImg({ src, className }: { src?: string | null; className: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken || isTempPath(src)) return null
  return <img src={src} alt="" className={className} onError={() => setBroken(true)} />
}

function AssetPreview({ asset }: { asset: AssetItem }) {
  const [thumbBroken, setThumbBroken] = useState(false)
  const thumb = thumbBroken ? undefined : asset.thumbnail

  if (asset.type === 'visual') {
    if (thumb) {
      return <SafeImg src={thumb} className="aspect-[1.55] w-full object-cover" />
    }
    return null
  }
  if (asset.type === 'presentation') {
    return (
      <div className="aspect-video w-full bg-[#101012] p-3">
        {asset.preview ? (
          <div className="h-full w-full overflow-hidden rounded-md bg-black">{asset.preview}</div>
        ) : (
          <div className="h-full rounded-md border border-[#facc15]/20 bg-[#171717]" />
        )}
      </div>
    )
  }
  if (asset.type === 'project') {
    if (thumb) {
      return <SafeImg src={thumb} className="aspect-[1.55] w-full object-cover" />
    }
    if (asset.preview) {
      return <>{asset.preview}</>
    }
    return (
      <div className="aspect-[1.55] w-full p-4">
        <div className="h-full rounded-lg border border-[#4F46E5]/30 bg-[#4F46E5]/10 shadow-[8px_8px_0_rgba(79,70,229,0.18)]" />
      </div>
    )
  }
  return (
    <div className="aspect-[1.55] w-full bg-[#0e0e0f] p-5">
      <div className="h-full rounded-md bg-[#f4f1e8] px-4 py-3">
        <div className="mb-2 h-2 w-2/3 rounded-full bg-black/35" />
        <div className="mb-1.5 h-1.5 w-full rounded-full bg-black/18" />
        <div className="mb-1.5 h-1.5 w-5/6 rounded-full bg-black/18" />
        <div className="h-1.5 w-3/5 rounded-full bg-black/18" />
      </div>
    </div>
  )
}

function AssetDetailPanel({ asset, onToggleFavorite, sharingVisual, goingLiveAtelier }: { asset: AssetItem | null; onToggleFavorite: (id: string) => void; sharingVisual: string | null; goingLiveAtelier: string | null }) {
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')

  function startRename() {
    setRenameDraft(asset?.title ?? '')
    setRenaming(true)
  }

  function commitRename() {
    setRenaming(false)
    const trimmed = renameDraft.trim()
    if (trimmed && trimmed !== asset?.title) asset?.onRename?.(trimmed)
  }

  if (!asset) {
    return (
      <aside className="sticky top-4 h-fit rounded-[16px] border border-white/[0.08] bg-[rgba(20,20,22,0.85)] p-4 text-sm text-white/35 backdrop-blur-xl">
        Selecteer een asset.
      </aside>
    )
  }
  return (
    <aside className="sticky top-4 h-fit min-w-0 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[rgba(20,20,22,0.85)] p-4 shadow-2xl backdrop-blur-xl">
      <div className="overflow-hidden rounded-xl bg-[#0d0d0e]">
        <AssetPreview asset={asset} />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <TypeBadge type={asset.type} projectKind={asset.projectKind} />
        <button
          type="button"
          onClick={() => onToggleFavorite(asset.id)}
          className={asset.isFavorite ? 'text-[#facc15]' : 'text-white/35 hover:text-white/75'}
        >
          ★
        </button>
      </div>
      <div className="mt-3 flex items-start gap-1.5">
        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.14] bg-white/[0.05] px-2 py-1 text-base font-semibold text-white/90 outline-none"
          />
        ) : (
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-6 text-white/90 [overflow-wrap:anywhere]">{asset.title}</h2>
        )}
        {asset.onRename && !renaming && (
          <button
            type="button"
            onClick={startRename}
            className="mt-0.5 flex-shrink-0 text-white/25 transition-colors hover:text-white/65"
            title="Naam wijzigen"
          >
            <PencilDetailIcon />
          </button>
        )}
      </div>
      <p className="mt-2 line-clamp-4 text-sm leading-6 text-white/45">{asset.description || 'Geen beschrijving beschikbaar.'}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {asset.tags.map((tag) => (
          <AssetTag key={tag} tag={tag} large />
        ))}
      </div>
      <dl className="mt-5 space-y-3 text-xs">
        <DetailRow label="Aangemaakt" value={formatDateShort(asset.createdAt)} />
        <DetailRow label="Bijgewerkt" value={formatDateShort(asset.updatedAt)} />
        <DetailRow label="Door" value={asset.updatedBy} />
        {asset.client && <DetailRow label="Klant" value={asset.client} />}
      </dl>
      <div className="mt-5 flex -space-x-2">
        {['D', 'T', 'AI'].map((label) => (
          <span key={label} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#141416] bg-[#242428] text-[10px] font-semibold text-white/55">{label}</span>
        ))}
      </div>
      <button
        type="button"
        onClick={asset.onOpen}
        disabled={!asset.onOpen}
        className="mt-5 h-11 w-full rounded-xl bg-[#facc15] text-sm font-semibold text-black transition-colors hover:bg-[#fde047] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/25"
      >
        {asset.type === 'visual' ? 'Visual openen' : asset.type === 'text' ? 'Document openen' : asset.projectKind ? `${asset.projectKind} openen` : 'Project openen'}
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <LiveCodeButton asset={asset} />
        <ShareButton asset={asset} />
      </div>
      {asset.onShare && asset.isShared !== undefined && (
        <ShareVisualButton asset={asset} isBusy={sharingVisual === asset.thumbnail} />
      )}
      {asset.onShare && asset.isShared === undefined && (
        <LiveToggleButton asset={asset} isBusy={goingLiveAtelier === asset.assetId} />
      )}
      {asset.onDelete && (
        <button
          type="button"
          onClick={asset.onDelete}
          className="mt-2 h-9 w-full rounded-xl border border-red-500/15 bg-red-500/[0.04] text-[11px] text-red-400/60 transition-colors hover:border-red-500/30 hover:bg-red-500/[0.08] hover:text-red-400"
        >
          Verwijderen
        </button>
      )}
    </aside>
  )
}

function LiveCodeButton({ asset }: { asset: AssetItem }) {
  const [copied, setCopied] = useState(false)
  const canCopy = !!(asset.isLive && asset.shareCode)
  function handleCopy() {
    if (!asset.shareCode) return
    navigator.clipboard.writeText(asset.shareCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!canCopy}
      title={canCopy ? `Kopieer live code ${asset.shareCode}` : 'Geen live code beschikbaar'}
      className={[
        'h-9 rounded-xl border text-[11px] font-semibold transition-colors',
        canCopy
          ? 'border-[#facc15]/30 bg-[#facc15]/[0.08] text-[#facc15]/80 hover:bg-[#facc15]/[0.14] hover:text-[#facc15]'
          : 'border-white/[0.08] bg-white/[0.03] text-white/25 cursor-not-allowed',
      ].join(' ')}
    >
      {copied ? '✓ Gekopieerd' : canCopy ? `↑ ${asset.shareCode}` : 'Live code'}
    </button>
  )
}

function ShareButton({ asset }: { asset: AssetItem }) {
  const [shared, setShared] = useState(false)
  const canShare = !!(asset.isLive && asset.shareCode)
  function handleShare() {
    if (!asset.shareCode) return
    navigator.clipboard.writeText(`Bekijk "${asset.title}" live in HupheAI met code: ${asset.shareCode}`)
    setShared(true)
    window.setTimeout(() => setShared(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={!canShare}
      className={[
        'h-9 rounded-xl border text-[11px] transition-colors',
        canShare
          ? 'border-white/[0.12] bg-white/[0.04] text-white/55 hover:border-white/[0.20] hover:text-white/80'
          : 'border-white/[0.08] bg-white/[0.03] text-white/25 cursor-not-allowed',
      ].join(' ')}
    >
      {shared ? '✓ Bericht gekopieerd' : 'Delen'}
    </button>
  )
}

function LiveToggleButton({ asset, isBusy }: { asset: AssetItem; isBusy: boolean }) {
  const label = isBusy ? 'Bezig…' : asset.isLive ? 'Stop live' : 'Ga live'
  return (
    <button
      type="button"
      onClick={asset.onShare}
      disabled={isBusy}
      className={[
        'mt-2 h-9 w-full rounded-xl border text-[11px] font-semibold transition-colors',
        asset.isLive
          ? 'border-red-500/20 bg-red-500/[0.05] text-red-400/70 hover:bg-red-500/[0.10] hover:text-red-400'
          : 'border-[#facc15]/25 bg-[#facc15]/[0.06] text-[#facc15]/70 hover:bg-[#facc15]/[0.12] hover:text-[#facc15]',
        isBusy ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ShareVisualButton({ asset, isBusy }: { asset: AssetItem; isBusy: boolean }) {
  const label = isBusy ? 'Bezig…' : asset.isShared ? 'Beeld bijwerken' : 'Deel beeld'
  return (
    <button
      type="button"
      onClick={asset.onShare}
      disabled={isBusy}
      className={[
        'mt-2 h-9 w-full rounded-xl border text-[11px] font-semibold transition-colors',
        asset.isShared
          ? 'border-[#facc15]/25 bg-[#facc15]/[0.06] text-[#facc15]/70 hover:bg-[#facc15]/[0.12] hover:text-[#facc15]'
          : 'border-white/[0.12] bg-white/[0.04] text-white/55 hover:border-white/[0.22] hover:text-white/80',
        isBusy ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/30">{label}</dt>
      <dd className="truncate text-white/62">{value}</dd>
    </div>
  )
}

function AssetsTable({
  assets,
  selectedId,
  onSelect,
  onToggleFavorite,
}: {
  assets: AssetItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#121214]">
      <div className="grid grid-cols-[minmax(220px,1fr)_110px_1fr_110px_110px_70px] gap-3 border-b border-white/[0.07] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/28">
        <span>Naam</span><span>Type</span><span>Tags</span><span>Bijgewerkt</span><span>Door</span><span>Favoriet</span>
      </div>
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => onSelect(asset.id)}
          onDoubleClick={() => asset.onOpen?.()}
          className={['grid w-full grid-cols-[minmax(220px,1fr)_110px_1fr_110px_110px_70px] items-center gap-3 border-b border-white/[0.05] px-4 py-3.5 text-left text-sm transition-colors last:border-b-0 hover:bg-white/[0.035]', selectedId === asset.id ? 'bg-[#facc15]/[0.04]' : ''].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="h-8 w-10 overflow-hidden rounded-md bg-[#0d0d0e]"><AssetPreview asset={asset} /></span>
            <span className="truncate font-medium text-white/82">{asset.title}</span>
          </span>
          <span><TypeBadge type={asset.type} projectKind={asset.projectKind} /></span>
          <span className="truncate text-white/35">{asset.tags.join(', ')}</span>
          <span className="text-white/35">{relativeDate(asset.updatedAt)}</span>
          <span className="text-white/45">{asset.updatedBy}</span>
          <span
            onClick={(event) => { event.stopPropagation(); onToggleFavorite(asset.id) }}
            className={asset.isFavorite ? 'text-[#facc15]' : 'text-white/25'}
          >
            ★
          </span>
        </button>
      ))}
    </div>
  )
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-xl border border-white/[0.08] bg-[#151515] p-1">
      {(['grid', 'list'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          title={mode === 'grid' ? 'Rasterweergave' : 'Lijstweergave'}
          className={['flex h-8 w-9 items-center justify-center rounded-lg transition-colors', value === mode ? 'bg-white/[0.10] text-white/82' : 'text-white/35 hover:text-white/62'].join(' ')}
        >
          {mode === 'grid' ? <GridViewIcon /> : <ListViewIcon />}
        </button>
      ))}
    </div>
  )
}

function GridViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function ListViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}


function TypeBadge({ type, projectKind, className = '' }: { type: AssetType; projectKind?: string; className?: string }) {
  const meta: Record<AssetType, { label: string; color: string }> = {
    project: { label: 'PROJECT', color: '#4F46E5' },
    visual: { label: 'VISUEEL', color: '#7C3AED' },
    text: { label: 'TEKST', color: '#8A8A8A' },
    presentation: { label: 'PRESENTATIE', color: '#D5A900' },
    ai: { label: 'AI', color: '#37C978' },
  }
  if (projectKind) {
    return (
      <span
        className={['inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase leading-none text-white shadow-sm', className].join(' ')}
        style={{ backgroundColor: meta[type]?.color ?? '#4F46E5' }}
      >
        {projectKind}
        <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" opacity="0.85">
          <rect x="11" y="0" width="8" height="8" rx="2" />
          <rect x="11" y="12" width="8" height="8" rx="2" />
          <rect x="0" y="6" width="8" height="8" rx="2" />
          <line x1="8" y1="10" x2="11" y2="4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="8" y1="10" x2="11" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  return (
    <span
      className={['rounded-md px-1.5 py-1 text-[10px] font-bold uppercase leading-none text-white shadow-sm', className].join(' ')}
      style={{ backgroundColor: meta[type].color }}
    >
      {meta[type].label}
    </span>
  )
}

function AssetTag({ tag, large = false }: { tag: string; large?: boolean }) {
  const tagLower = tag.toLowerCase()
  const isLive = tagLower === 'live'
  const isLinked = tagLower === 'linked'
  return (
    <span
      className={[
        'rounded-md border px-1.5 py-0.5 font-semibold',
        large ? 'text-[11px]' : 'text-[10px]',
        isLive || isLinked
          ? 'border-[#facc15]/35 bg-[#facc15]/12 text-[#facc15]'
          : 'border-white/[0.07] bg-white/[0.04] text-white/38',
      ].join(' ')}
    >
      {tag}
    </span>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function groupAssetsByDate(assets: AssetItem[]): Array<{ label: string; assets: AssetItem[] }> {
  const today: AssetItem[] = []
  const yesterday: AssetItem[] = []
  const earlier: AssetItem[] = []
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 24 * 60 * 60 * 1000

  assets.forEach((asset) => {
    const time = new Date(asset.updatedAt).getTime()
    if (time >= startToday) today.push(asset)
    else if (time >= startYesterday) yesterday.push(asset)
    else earlier.push(asset)
  })

  return [
    { label: 'Vandaag', assets: today },
    { label: 'Gisteren', assets: yesterday },
    { label: 'Eerder', assets: earlier },
  ].filter((group) => group.assets.length > 0)
}

function assetMatchesLibraryFilter(asset: AssetItem, filter: string): boolean {
  const tags = asset.tags.map((tag) => tag.toLowerCase())
  const title = asset.title.toLowerCase()
  const kind = (asset.projectKind ?? '').toLowerCase()
  switch (filter) {
    case 'afbeeldingen':
      return asset.type === 'visual' || kind === 'afbeelding'
    case 'presentations':
      return asset.type === 'presentation'
    case 'media':
      return tags.includes('media') || kind === 'multimedia' || kind === 'print' || kind === 'social'
    case 'banners':
      return tags.includes('banner') || tags.includes('banners') || title.includes('banner') || kind === 'banner'
    case 'video':
      return tags.includes('video') || title.includes('video') || kind === 'video'
    case 'copy':
      return asset.type === 'text' || tags.includes('copy') || tags.includes('typewriter')
    default:
      return true
  }
}

function formatDateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function inferClientName(value?: string): string | undefined {
  if (!value) return undefined
  const lower = value.toLowerCase()
  if (lower.includes('nike')) return 'Nike'
  if (lower.includes('roorda')) return 'Roorda'
  if (lower.includes('huphe')) return 'Huphe'
  return undefined
}

function relativeDate(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Zojuist'
    if (minutes < 60) return `${minutes}m geleden`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}u geleden`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Gisteren'
    if (days < 7) return `${days} dagen geleden`
    if (days < 30) return `${Math.floor(days / 7)} wk geleden`
    return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(iso))
  } catch { return iso }
}

function wordCount(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return ''
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function isTextLikeFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type.startsWith('text/')
    || ['txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'docx'].includes(ext)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Kon bestand niet lezen.'))
    reader.readAsDataURL(file)
  })
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Kon bestand niet lezen.'))
    reader.readAsArrayBuffer(file)
  })
}

async function readDroppedText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'docx') {
    const buffer = await readFileAsArrayBuffer(file)
    const res = await (window as any).api.extractDocText({ fileName: file.name, buffer })
    if (!res?.ok) throw new Error(res?.error ?? 'Kon document niet lezen.')
    return res.text ?? ''
  }
  return file.text()
}

function PencilDetailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  )
}
