import { useEffect, useState } from 'react'
import type { SavedBannerProject } from '../lib/atelier-project-store'
import { resolveAssetSrc } from '../lib/asset-library'
import type { MediaAsset } from '../lib/media-asset-store'

export const BANNER_DEFAULT_FORMATS: string[] = []

export type BannerTextRole = 'heading' | 'copy' | 'button'

export interface BannerSlide {
  id: string
  texts: {
    role: BannerTextRole
    value: string
    copyBlockId?: string
    copyOverride?: string
    lockedCopy?: boolean
  }[]
}

export interface BannerProject {
  id: string
  imageSrc: string
  assetId?: string
  styleReferenceSrc?: string
  styleReferenceName?: string
  styleReferenceAnalysis?: string
  styleMode?: 'reference' | 'autonomous'
  inputText: string
  slides: BannerSlide[]
  enabledFormats: string[]
  assetRefs?: SavedBannerProject['assetRefs']
  copyRefs?: SavedBannerProject['copyRefs']
  locked?: boolean
  createdAt: string
  updatedAt: string
}

export interface GeneratedBanner {
  formatId: string
  html: string
}

export function useAtelierBanner({
  savedProjects,
  activeProjectId,
  onSaveProject,
  onSaveMediaAsset,
  onShellLevel,
}: {
  savedProjects: SavedBannerProject[]
  activeProjectId: string | null
  onSaveProject: (project: SavedBannerProject) => void
  onSaveMediaAsset?: (asset: MediaAsset) => void
  onShellLevel?: (level: 'landing' | 'funnel' | 'editor') => void
}) {
  const [step, setStep] = useState<'input' | 'slides' | 'result'>('input')
  const [project, setProject] = useState<BannerProject | null>(null)
  const [generatedBanners, setGeneratedBanners] = useState<GeneratedBanner[]>([])
  const [enabledFormats, setEnabledFormats] = useState<string[]>(() => [...BANNER_DEFAULT_FORMATS])
  const [saveConfirm, setSaveConfirm] = useState(false)

  // Automatisch herladen wanneer een gelinkt gedeeld asset wordt bijgewerkt via Realtime
  useEffect(() => {
    const assetId = project?.assetId
    if (!assetId) return
    function handler(e: Event) {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      if (id !== assetId) return
      const newSrc = resolveAssetSrc(assetId)
      if (newSrc) setProject((prev) => prev ? { ...prev, imageSrc: newSrc } : null)
    }
    window.addEventListener('huphe:asset-updated', handler)
    return () => window.removeEventListener('huphe:asset-updated', handler)
  }, [project?.assetId])

  useEffect(() => {
    if (!activeProjectId) return
    const saved = savedProjects.find((item) => item.id === activeProjectId)
    if (!saved) return
    const savedFormats = saved.enabledFormats?.length ? saved.enabledFormats : [...BANNER_DEFAULT_FORMATS]
    setProject({
      id: saved.id,
      imageSrc: resolveAssetSrc(saved.assetId, saved.imageSrc),
      assetId: saved.assetId,
      styleReferenceSrc: saved.styleReferenceSrc,
      styleReferenceName: saved.styleReferenceName,
      styleReferenceAnalysis: saved.styleReferenceAnalysis,
      styleMode: saved.styleMode,
      inputText: saved.inputText ?? '',
      slides: saved.slides,
      enabledFormats: savedFormats,
      assetRefs: saved.assetRefs,
      copyRefs: saved.copyRefs,
      locked: saved.locked,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    })
    setEnabledFormats(savedFormats)
    setGeneratedBanners([])
    setStep('slides')
  }, [activeProjectId, savedProjects])

  function handleInputComplete(
    imageSrc: string,
    inputText: string,
    existingAssetId?: string,
    inputSlides?: BannerSlide[],
    inputFormats?: string[],
    styleReference?: { src?: string; name?: string; analysis?: string; mode: 'reference' | 'autonomous' },
  ) {
    const lines = inputText.split('\n').map((line) => line.trim()).filter(Boolean)
    const heading = lines[0] ?? ''
    const copy = lines.slice(1).join(' ')
    const slides: BannerSlide[] = inputSlides?.length
      ? inputSlides
      : [
        { id: `s${Date.now()}a`, texts: [{ role: 'heading', value: heading }] },
        ...(copy ? [{ id: `s${Date.now()}b`, texts: [{ role: 'copy' as const, value: copy }] }] : []),
      ]
    const now = new Date().toISOString()
    let resolvedAssetId = existingAssetId
    let assetRefs: SavedBannerProject['assetRefs'] = []
    if (!resolvedAssetId && onSaveMediaAsset) {
      resolvedAssetId = `asset_${Date.now()}`
      onSaveMediaAsset({ id: resolvedAssetId, name: 'Banner afbeelding', src: imageSrc, mimeType: 'image/jpeg', createdAt: now, updatedAt: now })
    }
    if (resolvedAssetId) {
      assetRefs = [{ assetId: resolvedAssetId, role: 'background', slotId: 'banner-image', sourceUpdatedAt: now }]
    }
    const nextFormats = inputFormats?.length ? inputFormats : enabledFormats
    setEnabledFormats(nextFormats)
    setProject({
      id: `banner_${Date.now()}`,
      imageSrc,
      assetId: resolvedAssetId,
      styleReferenceSrc: styleReference?.src,
      styleReferenceName: styleReference?.name,
      styleReferenceAnalysis: styleReference?.analysis,
      styleMode: styleReference?.mode ?? 'autonomous',
      inputText,
      slides,
      enabledFormats: nextFormats,
      assetRefs,
      copyRefs: [],
      createdAt: now,
      updatedAt: now,
    })
    setStep('slides')
  }

  function handleProjectUpdate(updates: Partial<BannerProject>) {
    setProject((prev) => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null)
  }

  function handleGenerated(banners: GeneratedBanner[]) {
    setGeneratedBanners(banners)
    setStep('result')
    onShellLevel?.('editor')
  }

  function handleSave() {
    if (!project) return
    const name = project.slides[0]?.texts[0]?.value || `Banner ${new Date().toLocaleDateString('nl')}`
    onSaveProject({
      id: project.id,
      type: 'banners',
      name,
      imageSrc: project.imageSrc,
      assetId: project.assetId,
      styleReferenceSrc: project.styleReferenceSrc,
      styleReferenceName: project.styleReferenceName,
      styleReferenceAnalysis: project.styleReferenceAnalysis,
      styleMode: project.styleMode,
      inputText: project.inputText,
      slides: project.slides,
      enabledFormats,
      assetRefs: project.assetRefs,
      copyRefs: project.copyRefs,
      locked: project.locked,
      createdAt: project.createdAt,
      updatedAt: new Date().toISOString(),
    })
    setSaveConfirm(true)
    setTimeout(() => setSaveConfirm(false), 2000)
  }

  return {
    step,
    setStep,
    project,
    generatedBanners,
    enabledFormats,
    setEnabledFormats,
    saveConfirm,
    handleInputComplete,
    handleProjectUpdate,
    handleGenerated,
    handleSave,
  }
}
