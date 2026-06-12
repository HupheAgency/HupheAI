import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  BANNER_DEFAULT_FORMATS,
  useAtelierBanner,
  type BannerProject,
  type BannerSlide,
  type BannerTextRole,
  type GeneratedBanner,
} from '../hooks/useAtelierBanner'
import AtelierSetupShell from './AtelierSetupShell'
import { type AtelierProjectsPanelConfig } from './AtelierRightPanel'
import type { AtelierCreationType } from './AtelierCreationModeButtons'
import type { SavedBannerProject } from '../lib/atelier-project-store'
import type { CrossFormatSeed } from '../lib/atelier-cross-format'
import type { MediaAsset } from '../lib/media-asset-store'
import BannerAnimatedPreview from './BannerAnimatedPreview'
import MediaAssetPicker from './MediaAssetPicker'
import VisionModelSetup from './VisionModelSetup'
import { loadCopyBlocks, resolveCopyContent, type CopyBlock } from '../lib/copy-library'
import { loadLinkedTextSources, loadLinkedTextSourcesAsync } from '../lib/atelier-linked-sources'
import { SparkleIcon, SpinnerIcon, Step, PlusTinyIcon, CloseTinyIcon, AtelierSaveImageIcon, AtelierExpandImageIcon } from './AtelierSharedUI'
import { getSeedAsset, getSeedCopy, getSeedCopyIds } from './PrintFlow'

interface BannerFormat {
  id: string
  label: string
  width: number
  height: number
}

const IAB_FORMATS: BannerFormat[] = [
  { id: '300x250', label: 'Medium Rectangle', width: 300, height: 250 },
  { id: '728x90', label: 'Leaderboard', width: 728, height: 90 },
  { id: '160x600', label: 'Wide Skyscraper', width: 160, height: 600 },
  { id: '300x600', label: 'Half Page', width: 300, height: 600 },
  { id: '320x50', label: 'Mobile Banner', width: 320, height: 50 },
  { id: '320x100', label: 'Large Mobile Banner', width: 320, height: 100 },
  { id: '468x60', label: 'Full Banner', width: 468, height: 60 },
  { id: '234x60', label: 'Half Banner', width: 234, height: 60 },
  { id: '120x600', label: 'Skyscraper', width: 120, height: 600 },
  { id: '970x90', label: 'Super Leaderboard', width: 970, height: 90 },
  { id: '970x250', label: 'Billboard', width: 970, height: 250 },
  { id: '300x1050', label: 'Portrait', width: 300, height: 1050 },
  { id: '250x250', label: 'Square', width: 250, height: 250 },
  { id: '200x200', label: 'Small Square', width: 200, height: 200 },
]

function getSeedBannerSlides(seed?: CrossFormatSeed | null): BannerSlide[] | undefined {
  const copy = getSeedCopy(seed)
  const ids = getSeedCopyIds(seed)
  const buttonRef = seed?.copyRefs.find((item) => item.role === 'button')
  const texts: BannerSlide['texts'] = [
    ...(copy.heading ? [{ role: 'heading' as const, value: copy.heading, copyBlockId: ids.titleCopyBlockId }] : []),
    ...(copy.body ? [{ role: 'copy' as const, value: copy.body, copyBlockId: ids.bodyCopyBlockId }] : []),
    ...(copy.button ? [{ role: 'button' as const, value: copy.button, copyBlockId: buttonRef?.copyBlockId }] : []),
  ]
  return texts.length > 0 ? [{ id: `s${Date.now()}seed`, texts }] : undefined
}

type BannerDraftSlide = { heading: string; subheading: string; button: string }
type LinkedSourceMenu = 'image' | 'style' | 'template' | 'text'

function deriveBannerDraftSlides(initialSlides?: BannerSlide[], initialText?: string): BannerDraftSlide[] {
  if (initialSlides?.length) {
    return initialSlides.map((slide) => ({
      heading: slide.texts.find((text) => text.role === 'heading')?.value ?? '',
      subheading: slide.texts.find((text) => text.role === 'copy')?.value ?? '',
      button: slide.texts.find((text) => text.role === 'button')?.value ?? '',
    }))
  }

  const lines = initialText?.split('\n').map((line) => line.trim()).filter(Boolean) ?? []
  return [{
    heading: lines[0] ?? '',
    subheading: lines[1] ?? '',
    button: lines[2] ?? '',
  }]
}

function buildBannerCopyRefs(slides: BannerSlide[], copyBlocks: CopyBlock[]): SavedBannerProject['copyRefs'] {
  const blocksById = new Map(copyBlocks.map((block) => [block.id, block]))
  const refs = new Map<string, NonNullable<SavedBannerProject['copyRefs']>[number]>()
  slides.forEach((slide) => {
    slide.texts.forEach((text, textIdx) => {
      if (!text.copyBlockId) return
      const block = blocksById.get(text.copyBlockId)
      refs.set(`${slide.id}:${textIdx}:${text.copyBlockId}`, {
        copyBlockId: text.copyBlockId,
        role: text.role,
        slotId: `${slide.id}:${textIdx}`,
        sourceUpdatedAt: block?.updatedAt,
        locked: text.lockedCopy,
      })
    })
  })
  return [...refs.values()]
}

export default function BannerFlow({
  onShellLevel,
  onCreationTypeSelect,
  onClearCreationType,
  savedProjects,
  activeProjectId,
  onSaveProject,
  mediaAssets,
  onSaveMediaAsset,
  projectsPanel,
  seed,
  onPromptSubmit,
  promptMessages,
  autonomousInput,
  chatModels,
  chatModelsLoading,
  chatSelectedModelId,
  onChatModelSelect,
}: {
  onShellLevel?: (level: 'landing' | 'funnel' | 'editor') => void
  onCreationTypeSelect?: (type: AtelierCreationType) => void
  onClearCreationType?: () => void
  savedProjects: SavedBannerProject[]
  activeProjectId: string | null
  onSaveProject: (project: SavedBannerProject) => void
  mediaAssets?: MediaAsset[]
  onSaveMediaAsset?: (asset: MediaAsset) => void
  projectsPanel?: AtelierProjectsPanelConfig
  seed?: CrossFormatSeed | null
  onPromptSubmit?: (prompt: string) => void | Promise<void>
  promptMessages?: Array<{ role: 'user' | 'assistant'; content: string; model?: string }>
  autonomousInput?: { heading: string; copy: string; cta: string; formats?: string[] } | null
  chatModels?: import('../hooks/useAtelierMedia').AtelierMediaModel[]
  chatModelsLoading?: boolean
  chatSelectedModelId?: string
  onChatModelSelect?: (id: string) => void
}) {
  const {
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
  } = useAtelierBanner({
    savedProjects,
    activeProjectId,
    onSaveProject,
    onSaveMediaAsset,
    onShellLevel,
  })

  const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false)

  useEffect(() => {
    if (!autonomousInput) return
    const { heading, copy, cta, formats } = autonomousInput
    const inputText = [heading, copy, cta].filter(Boolean).join('\n')
    const slides: BannerSlide[] = [{
      id: `sauto_${Date.now()}`,
      texts: [
        ...(heading ? [{ role: 'heading' as const, value: heading }] : []),
        ...(copy ? [{ role: 'copy' as const, value: copy }] : []),
        ...(cta ? [{ role: 'button' as const, value: cta }] : []),
      ],
    }]
    setShouldAutoGenerate(true)
    handleInputComplete('', inputText, undefined, slides, formats?.length ? formats : undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autonomousInput])

  const saveButton = project ? (
    <button
      type="button"
      onClick={handleSave}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white"
    >
      {saveConfirm ? '✓ Opgeslagen' : 'Opslaan'}
    </button>
  ) : null

  if (step === 'input') {
    return (
      <AtelierSetupShell
        type="banners"
        inputPlaceholder="Vertel wat voor banners je wilt maken..."
        onCreationTypeSelect={onCreationTypeSelect}
        onClearCreationType={onClearCreationType}
        onPromptSubmit={onPromptSubmit}
        promptMessages={promptMessages}
        projectsPanel={projectsPanel}
        chatModels={chatModels}
        chatModelsLoading={chatModelsLoading}
        chatSelectedModelId={chatSelectedModelId}
        onChatModelSelect={onChatModelSelect}
      >
        <BannerInputStep
          initialImageSrc={project?.imageSrc ?? getSeedAsset(seed).src}
          initialAssetId={project?.assetId ?? getSeedAsset(seed).assetId}
          initialStyleReferenceSrc={project?.styleReferenceSrc}
          initialStyleReferenceName={project?.styleReferenceName}
          initialStyleReferenceAnalysis={project?.styleReferenceAnalysis}
          initialText={project?.inputText ?? [getSeedCopy(seed).heading, getSeedCopy(seed).body, getSeedCopy(seed).button].filter(Boolean).join('\n')}
          initialSlides={project?.slides ?? getSeedBannerSlides(seed)}
          initialFormats={project?.enabledFormats ?? []}
          onComplete={handleInputComplete}
          mediaAssets={mediaAssets}
          onSaveMediaAsset={onSaveMediaAsset}
          savedProjects={savedProjects}
        />
      </AtelierSetupShell>
    )
  }
  if (step === 'slides' && project) {
    return (
      <BannerSlidesEditor
        project={project}
        enabledFormats={enabledFormats}
        onProjectUpdate={handleProjectUpdate}
        onBack={() => setStep('input')}
        onGenerated={handleGenerated}
        saveButton={saveButton}
        autoGenerate={shouldAutoGenerate}
      />
    )
  }
  if (step === 'result' && project && generatedBanners.length > 0) {
    return (
      <BannerResultView
        project={project}
        banners={generatedBanners}
        enabledFormats={enabledFormats}
        onEnabledFormatsChange={setEnabledFormats}
        saveButton={saveButton}
        onBack={() => {
          setStep('slides')
          onShellLevel?.('funnel')
        }}
      />
    )
  }
  return null
}

function BannerInputStep({
  initialImageSrc,
  initialAssetId,
  initialStyleReferenceSrc,
  initialStyleReferenceName,
  initialStyleReferenceAnalysis,
  initialText,
  initialSlides,
  initialFormats,
  onComplete,
  mediaAssets,
  onSaveMediaAsset,
  savedProjects,
}: {
  initialImageSrc?: string
  initialAssetId?: string
  initialStyleReferenceSrc?: string
  initialStyleReferenceName?: string
  initialStyleReferenceAnalysis?: string
  initialText?: string
  initialSlides?: BannerSlide[]
  initialFormats?: string[]
  onComplete: (
    imageSrc: string,
    inputText: string,
    assetId?: string,
    slides?: BannerSlide[],
    formats?: string[],
    styleReference?: { src?: string; name?: string; analysis?: string; mode: 'reference' | 'autonomous' },
  ) => void
  mediaAssets?: MediaAsset[]
  onSaveMediaAsset?: (asset: MediaAsset) => void
  savedProjects?: SavedBannerProject[]
}) {
  const initialDraftSlides = useMemo(() => deriveBannerDraftSlides(initialSlides, initialText), [initialSlides, initialText])
  const [linkedMode, setLinkedMode] = useState(false)
  const [draftSlides, setDraftSlides] = useState<BannerDraftSlide[]>(initialDraftSlides)
  const [selectedFormats, setSelectedFormats] = useState<string[]>(initialFormats?.length ? initialFormats : ['300x250', ...BANNER_DEFAULT_FORMATS])
  const [imageSrc, setImageSrc] = useState(initialImageSrc ?? '')
  const [assetId, setAssetId] = useState<string | undefined>(initialAssetId)
  const [imageFileName, setImageFileName] = useState('')
  const [imgDragging, setImgDragging] = useState(false)
  const [styleReferenceSrc, setStyleReferenceSrc] = useState(initialStyleReferenceSrc ?? '')
  const [styleReferenceName, setStyleReferenceName] = useState(initialStyleReferenceName ?? '')
  const [styleReferenceAnalysis, setStyleReferenceAnalysis] = useState(initialStyleReferenceAnalysis ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)
  const [visionResult, setVisionResult] = useState('')
  const [visionError, setVisionError] = useState('')
  const [styleVisionLoading, setStyleVisionLoading] = useState(false)
  const [styleVisionError, setStyleVisionError] = useState('')
  const [masterTemplateName, setMasterTemplateName] = useState('')
  const [leadTextName, setLeadTextName] = useState('')
  const [linkedMenu, setLinkedMenu] = useState<LinkedSourceMenu | null>(null)
  const [linkedSearch, setLinkedSearch] = useState('')
  const [availableCopyBlocks, setAvailableCopyBlocks] = useState<CopyBlock[]>(() => loadLinkedTextSources())
  const [visionSetupOpen, setVisionSetupOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleAnalyzeImage() {
    if (!imageSrc) return
    const model = localStorage.getItem('huphe:vision-model') ?? 'llava'
    setVisionLoading(true)
    setVisionResult('')
    setVisionError('')
    try {
      const check = await (window as any).api.vision.checkModel(model) as { installed: boolean }
      if (!check.installed) {
        setVisionSetupOpen(true)
        setVisionLoading(false)
        return
      }
      const res = await (window as any).api.vision.analyze({ src: imageSrc, model }) as { ok: boolean; description?: string; error?: string }
      if (!res.ok) { setVisionError(res.error ?? 'Analyse mislukt.'); return }
      setVisionResult(res.description ?? '')
    } catch (err: any) {
      setVisionError(err.message ?? 'Analyse mislukt.')
    } finally {
      setVisionLoading(false)
    }
  }

  async function handleAnalyzeStyleReference() {
    if (!styleReferenceSrc) return
    const model = localStorage.getItem('huphe:vision-model') ?? 'llava'
    setStyleVisionLoading(true)
    setStyleVisionError('')
    try {
      const check = await (window as any).api.vision.checkModel(model) as { installed: boolean }
      if (!check.installed) {
        setVisionSetupOpen(true)
        setStyleVisionLoading(false)
        return
      }
      const res = await (window as any).api.vision.analyze({ src: styleReferenceSrc, model }) as { ok: boolean; description?: string; error?: string }
      if (!res.ok) { setStyleVisionError(res.error ?? 'Stijlanalyse mislukt.'); return }
      setStyleReferenceAnalysis(res.description ?? '')
    } catch (err: any) {
      setStyleVisionError(err.message ?? 'Stijlanalyse mislukt.')
    } finally {
      setStyleVisionLoading(false)
    }
  }

  useEffect(() => {
    setDraftSlides(initialDraftSlides)
  }, [initialDraftSlides])

  useEffect(() => {
    setSelectedFormats(initialFormats?.length ? initialFormats : ['300x250', ...BANNER_DEFAULT_FORMATS])
  }, [initialFormats?.join('|')])

  useEffect(() => {
    setImageSrc(initialImageSrc ?? '')
    setAssetId(initialAssetId)
    setImageFileName('')
  }, [initialImageSrc, initialAssetId])

  useEffect(() => {
    setStyleReferenceSrc(initialStyleReferenceSrc ?? '')
    setStyleReferenceName(initialStyleReferenceName ?? '')
    setStyleReferenceAnalysis(initialStyleReferenceAnalysis ?? '')
  }, [initialStyleReferenceSrc, initialStyleReferenceName, initialStyleReferenceAnalysis])

  function loadImageFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string)
      setImageFileName(file.name)
      setAssetId(undefined)
    }
    reader.readAsDataURL(file)
  }

  function handleImageDrop(e: React.DragEvent) {
    e.preventDefault()
    setImgDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && /^image\/(png|jpeg|webp)$/.test(file.type)) loadImageFile(file)
  }

  function updateDraftSlide(index: number, patch: Partial<BannerDraftSlide>) {
    setDraftSlides((slides) => slides.map((slide, i) => i === index ? { ...slide, ...patch } : slide))
  }

  function addDraftSlide() {
    setDraftSlides((slides) => [...slides, { heading: '', subheading: '', button: '' }])
  }

  function removeDraftSlide(index: number) {
    setDraftSlides((slides) => slides.length <= 1 ? slides : slides.filter((_, i) => i !== index))
  }

  function toggleFormat(id: string) {
    setSelectedFormats((formats) =>
      formats.includes(id) ? formats.filter((format) => format !== id) : [...formats, id]
    )
  }

  function openLinkedMenu(menu: LinkedSourceMenu) {
    if (menu === 'text') {
      setAvailableCopyBlocks(loadLinkedTextSources())
      void loadLinkedTextSourcesAsync().then(setAvailableCopyBlocks)
    }
    setLinkedSearch('')
    setLinkedMenu((current) => current === menu ? null : menu)
  }

  function linkMediaAsset(asset: MediaAsset, role: 'image' | 'style') {
    if (role === 'image') {
      setImageSrc(asset.src)
      setAssetId(asset.id)
      setImageFileName(asset.name)
      setVisionResult('')
      setVisionError('')
    } else {
      setStyleReferenceSrc(asset.src)
      setStyleReferenceName(asset.name)
      setStyleReferenceAnalysis('')
      setStyleVisionError('')
    }
    setLinkedMenu(null)
  }

  function linkMasterTemplate(project: SavedBannerProject) {
    setMasterTemplateName(project.name)
    setLinkedMenu(null)
  }

  function linkTextDocument(block: CopyBlock) {
    setLeadTextName(block.name)
    if (!draftSlides.some((slide) => slide.heading || slide.subheading || slide.button)) {
      setDraftSlides([{
        heading: block.name,
        subheading: block.content.split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? '',
        button: '',
      }])
    }
    setLinkedMenu(null)
  }

  function renderLinkedDropdown(menu: LinkedSourceMenu) {
    if (linkedMenu !== menu) return null
    return (
      <LinkedSourceDropdown
        menu={menu}
        search={linkedSearch}
        onSearch={setLinkedSearch}
        mediaAssets={mediaAssets ?? []}
        savedProjects={savedProjects ?? []}
        copyBlocks={availableCopyBlocks}
        onSelectMedia={linkMediaAsset}
        onSelectTemplate={linkMasterTemplate}
        onSelectText={linkTextDocument}
        onClose={() => setLinkedMenu(null)}
      />
    )
  }

  function completeInput() {
    const cleanSlides = draftSlides
      .map((slide) => ({
        heading: slide.heading.trim(),
        subheading: slide.subheading.trim(),
        button: slide.button.trim(),
      }))
      .filter((slide) => slide.heading || slide.subheading || slide.button)
    const effectiveSlides = linkedMode && cleanSlides.length === 0
      ? [{ heading: leadTextName.replace(/\.[^.]+$/, ''), subheading: 'Content uit gekoppeld tekstdocument', button: '' }]
      : cleanSlides
    const inputText = linkedMode
      ? `Tekstdocument: ${leadTextName}`
      : effectiveSlides
        .map((slide) => [slide.heading, slide.subheading, slide.button].filter(Boolean).join('\n'))
        .join('\n\n')
    const slides: BannerSlide[] = effectiveSlides.map((slide, index) => ({
      id: `s${Date.now()}${index}`,
      texts: [
        ...(slide.heading ? [{ role: 'heading' as const, value: slide.heading }] : []),
        ...(slide.subheading ? [{ role: 'copy' as const, value: slide.subheading }] : []),
        ...(slide.button ? [{ role: 'button' as const, value: slide.button }] : []),
      ],
    }))
    onComplete(imageSrc, inputText, assetId, slides, selectedFormats, {
      src: styleReferenceSrc || undefined,
      name: styleReferenceName || undefined,
      analysis: styleReferenceAnalysis || undefined,
      mode: styleReferenceSrc ? 'reference' : 'autonomous',
    })
  }

  const textReady = linkedMode
    ? leadTextName.trim().length > 0
    : draftSlides.some((slide) => slide.heading.trim() || slide.subheading.trim() || slide.button.trim())
  const formatsReady = selectedFormats.length > 0
  const canNext = textReady && imageSrc.length > 0 && formatsReady

  return (
    <div className="relative z-10 w-full max-w-md space-y-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white font-semibold text-[18px]">Maak een bannerset</h1>
            <p className="text-white/35 text-sm">Afbeelding, tekst, button, klaar.</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-[11px] font-medium text-white/45">Linked mode</span>
            <button
              type="button"
              onClick={() => setLinkedMode((value) => !value)}
              className={[
                'relative h-7 w-14 rounded-full transition-colors duration-200',
                linkedMode ? 'bg-[#facc15]' : 'bg-white/[0.14]',
              ].join(' ')}
              aria-label="Linked mode"
              aria-pressed={linkedMode}
            >
              <span
                className={[
                  'absolute top-1 h-5 w-5 rounded-full bg-white shadow-lg transition-[left] duration-200',
                  linkedMode ? 'left-8' : 'left-1',
                ].join(' ')}
              />
            </button>
          </div>
        </div>
      </div>

      {!linkedMode && (
      <Step index={1} label="Achtergrondafbeelding" done={!!imageSrc}>
        <div className="flex items-center justify-between">
          <div />
          {mediaAssets !== undefined && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Bibliotheek
            </button>
          )}
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setImgDragging(true) }}
          onDragLeave={() => setImgDragging(false)}
          onDrop={handleImageDrop}
          className={[
            'relative flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-colors',
            imgDragging ? 'border-[#facc15] bg-[#facc15]/[0.04]' : 'border-white/[0.10] bg-[#0f0f0f] hover:border-white/20',
          ].join(' ')}
        >
          {imageSrc ? (
            <>
              <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
              <div className="relative flex flex-col items-center gap-1 text-white/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34" />
                  <polygon points="18 2 22 6 12 16 8 16 8 12 18 2" />
                </svg>
                <span className="text-xs font-medium">{imageFileName || 'Afbeelding geladen'}</span>
                <span className="text-[10px] text-white/40">Klik om te wijzigen</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/30">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <div className="text-center">
                <p className="text-sm">Sleep een afbeelding hier</p>
                <p className="text-xs text-white/20">PNG, JPG of WebP</p>
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => {
            const file = e.target.files?.[0]
            if (file) loadImageFile(file)
          }} />
        </div>

        {pickerOpen && (
          <MediaAssetPicker
            assets={mediaAssets ?? []}
            onSelect={({ assetId: aid, src }) => { setImageSrc(src); setAssetId(aid); setImageFileName(''); setPickerOpen(false) }}
            onUpload={asset => { onSaveMediaAsset?.(asset) }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {imageSrc && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleAnalyzeImage}
              disabled={visionLoading}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] text-xs text-white/50 transition-colors hover:border-[#facc15]/30 hover:bg-[#facc15]/[0.04] hover:text-[#facc15] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {visionLoading ? (
                <><SpinnerIcon /> Afbeelding analyseren…</>
              ) : (
                <><SparkleIcon /> AI analyseer afbeelding</>
              )}
            </button>

            {visionResult && (
              <div className="rounded-xl border border-[#facc15]/20 bg-[#facc15]/[0.04] p-3">
                <p className="text-xs leading-relaxed text-white/70">{visionResult}</p>
                <button
                  type="button"
                  onClick={() => { updateDraftSlide(0, { heading: visionResult.split('.')[0]?.trim() ?? visionResult }); setVisionResult('') }}
                  className="mt-2 text-[10px] font-semibold text-[#facc15] hover:text-[#fde047]"
                >
                  Gebruik als header →
                </button>
              </div>
            )}

            {visionError && (
              <p className="text-[10px] text-red-300">{visionError}</p>
            )}
          </div>
        )}

        {visionSetupOpen && (
          <VisionModelSetup
            onClose={() => setVisionSetupOpen(false)}
            onModelReady={(modelId) => {
              localStorage.setItem('huphe:vision-model', modelId)
              setVisionSetupOpen(false)
              setTimeout(handleAnalyzeImage, 200)
            }}
          />
        )}
      </Step>
      )}

      {linkedMode && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="mb-3 flex items-center gap-2">
            <SparkleIcon />
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Gekoppelde bronnen</p>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => openLinkedMenu('image')}
              className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
            >
              <span className="min-w-0">
                <span className="block font-medium text-white/70">Koppel afbeelding</span>
                <span className="block truncate text-white/30">{imageFileName || (imageSrc ? 'Afbeelding gekoppeld' : 'Upload of koppel de hoofdafbeelding')}</span>
              </span>
              <PlusTinyIcon />
            </button>
            {renderLinkedDropdown('image')}
            <button
              type="button"
              onClick={() => openLinkedMenu('style')}
              className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
            >
              <span className="min-w-0">
                <span className="block font-medium text-white/70">Koppel huisstijl</span>
                <span className="block truncate text-white/30">{styleReferenceName || 'Upload een bannerset of stijlvoorbeeld'}</span>
              </span>
              <PlusTinyIcon />
            </button>
            {renderLinkedDropdown('style')}
            <button
              type="button"
              onClick={() => openLinkedMenu('template')}
              className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
            >
              <span className="min-w-0">
                <span className="block font-medium text-white/70">Koppel master template</span>
                <span className="block truncate text-white/30">{masterTemplateName || 'Koppel een templatebestand voor grote sets'}</span>
              </span>
              <PlusTinyIcon />
            </button>
            {renderLinkedDropdown('template')}
            <button
              type="button"
              onClick={() => openLinkedMenu('text')}
              className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
            >
              <span className="min-w-0">
                <span className="block font-medium text-white/70">Koppel tekst document</span>
                <span className="block truncate text-white/30">{leadTextName || 'Gebruik briefing/copy als bron'}</span>
              </span>
              <PlusTinyIcon />
            </button>
            {renderLinkedDropdown('text')}
          </div>

          {styleReferenceSrc && (
            <div className="mt-3 space-y-2">
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <img src={styleReferenceSrc} alt="" className="h-24 w-full object-cover opacity-70" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAnalyzeStyleReference}
                  disabled={styleVisionLoading}
                  className="flex h-8 flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] text-xs text-white/50 transition-colors hover:border-[#facc15]/30 hover:bg-[#facc15]/[0.04] hover:text-[#facc15] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {styleVisionLoading ? <><SpinnerIcon /> Stijl analyseren…</> : <><SparkleIcon /> AI analyseer huisstijl</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setStyleReferenceSrc(''); setStyleReferenceName(''); setStyleReferenceAnalysis(''); setStyleVisionError('') }}
                  className="flex h-8 items-center justify-center rounded-xl border border-white/[0.07] px-3 text-xs text-white/35 transition-colors hover:border-red-400/30 hover:text-red-300"
                >
                  Wis
                </button>
              </div>
              {styleReferenceAnalysis && (
                <div className="rounded-xl border border-[#facc15]/20 bg-[#facc15]/[0.04] p-3">
                  <p className="text-xs leading-relaxed text-white/70">{styleReferenceAnalysis}</p>
                </div>
              )}
              {styleVisionError && <p className="text-[10px] text-red-300">{styleVisionError}</p>}
            </div>
          )}
        </div>
      )}

      {!linkedMode && (
        <Step index={2} label="Slides" done={textReady} locked={!imageSrc}>
          <div className={['space-y-3 transition-opacity', !imageSrc ? 'opacity-30 pointer-events-none select-none' : ''].join(' ')}>
            {draftSlides.map((slide, index) => (
              <div key={index} className="rounded-2xl border border-white/[0.08] bg-[#121212] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Slide {index + 1}</p>
                  {draftSlides.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDraftSlide(index)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-red-400/[0.08] hover:text-red-300"
                      aria-label="Slide verwijderen"
                      title="Slide verwijderen"
                    >
                      <CloseTinyIcon />
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/35">Heading</span>
                    <input
                      value={slide.heading}
                      onChange={(e) => updateDraftSlide(index, { heading: e.target.value })}
                      placeholder="Bijvoorbeeld: Nieuwe Nike schoenen"
                      className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/35">Subheading</span>
                    <input
                      value={slide.subheading}
                      onChange={(e) => updateDraftSlide(index, { subheading: e.target.value })}
                      placeholder="Korte ondersteunende zin"
                      className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/35">Button</span>
                    <input
                      value={slide.button}
                      onChange={(e) => updateDraftSlide(index, { button: e.target.value })}
                      placeholder="Bijvoorbeeld: Shop nu"
                      className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
                    />
                  </label>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addDraftSlide}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] px-3 text-xs font-medium text-white/45 transition-colors hover:border-white/24 hover:text-white/75"
            >
              <PlusTinyIcon />
              Extra slide
            </button>
          </div>
        </Step>
      )}

      <Step index={linkedMode ? 2 : 3} label="Formaten" done={formatsReady} locked={!textReady}>
        <div className={['transition-opacity', !textReady ? 'opacity-30 pointer-events-none select-none' : ''].join(' ')}>
          <BannerFormatPicker
            selectedFormats={selectedFormats}
            onToggle={toggleFormat}
          />
        </div>
      </Step>

      <div className={['transition-opacity', !canNext ? 'opacity-30' : ''].join(' ')}>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => canNext && completeInput()}
          className="w-full font-semibold rounded-lg px-4 py-3 text-sm transition-colors flex items-center justify-center gap-2 bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:cursor-not-allowed text-black"
        >
          Volgende
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function BannerFormatPicker({
  selectedFormats,
  onToggle,
}: {
  selectedFormats: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {IAB_FORMATS.map((format) => {
        const selected = selectedFormats.includes(format.id)
        return (
          <button
            key={format.id}
            type="button"
            onClick={() => onToggle(format.id)}
            className={[
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
              selected
                ? 'border-[#facc15]/40 bg-[#facc15]/[0.06] text-white/90'
                : 'border-white/[0.08] text-white/45 hover:border-white/20 hover:text-white/70',
            ].join(' ')}
          >
            <span className={selected ? 'text-[#facc15]' : 'text-white/25'}>
              <BannerFormatIcon format={format} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight">{format.label}</p>
              <p className="text-[10px] text-white/35">{format.width}×{format.height}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function LinkedSourceDropdown({
  menu,
  search,
  onSearch,
  mediaAssets,
  savedProjects,
  copyBlocks,
  onSelectMedia,
  onSelectTemplate,
  onSelectText,
  onClose,
}: {
  menu: LinkedSourceMenu
  search: string
  onSearch: (value: string) => void
  mediaAssets: MediaAsset[]
  savedProjects: SavedBannerProject[]
  copyBlocks: CopyBlock[]
  onSelectMedia: (asset: MediaAsset, role: 'image' | 'style') => void
  onSelectTemplate: (project: SavedBannerProject) => void
  onSelectText: (block: CopyBlock) => void
  onClose: () => void
}) {
  const query = search.trim().toLowerCase()
  const mediaMatches = mediaAssets
    .filter((asset) => !query || asset.name.toLowerCase().includes(query))
    .slice(0, 40)
  const templateMatches = savedProjects
    .filter((project) => !query || project.name.toLowerCase().includes(query))
    .slice(0, 40)
  const copyMatches = copyBlocks
    .filter((block) => !query || block.name.toLowerCase().includes(query) || block.content.toLowerCase().includes(query))
    .slice(0, 40)

  const title = menu === 'image'
    ? 'Koppel afbeelding'
    : menu === 'style'
      ? 'Koppel huisstijl'
      : menu === 'template'
        ? 'Koppel master template'
        : 'Koppel tekst document'
  const emptyText = menu === 'template'
    ? 'Geen live templates gevonden.'
    : menu === 'text'
      ? 'Geen live tekstdocumenten gevonden.'
      : 'Geen live assets gevonden.'

  return (
    <div className="-mt-1 rounded-b-2xl rounded-t-lg border border-t-0 border-white/[0.08] bg-[#0d0d0d] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/65"
          aria-label="Menu sluiten"
        >
          <CloseTinyIcon />
        </button>
      </div>
      <input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        autoFocus
        placeholder="Zoek live bronnen..."
        className="mb-2 h-9 w-full rounded-xl border border-white/[0.07] bg-[#151515] px-3 text-xs text-white/80 outline-none placeholder:text-white/25 focus:border-[#facc15]/35"
      />
      <div className="max-h-56 overflow-y-auto pr-1">
        {(menu === 'image' || menu === 'style') && (
          <div className="space-y-1">
            {mediaMatches.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelectMedia(asset, menu === 'image' ? 'image' : 'style')}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="h-9 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]">
                  <img src={asset.src} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-white/75">{asset.name}</span>
                  <span className="block truncate text-[10px] text-white/30">{asset.mimeType}</span>
                </span>
              </button>
            ))}
            {mediaMatches.length === 0 && <p className="px-2 py-5 text-center text-xs text-white/30">{emptyText}</p>}
          </div>
        )}
        {menu === 'template' && (
          <div className="space-y-1">
            {templateMatches.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectTemplate(project)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="flex h-9 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]">
                  {project.imageSrc ? <img src={project.imageSrc} alt="" className="h-full w-full object-cover" /> : <SparkleIcon />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-white/75">{project.name}</span>
                  <span className="block truncate text-[10px] text-white/30">{project.enabledFormats.length} formaten</span>
                </span>
              </button>
            ))}
            {templateMatches.length === 0 && <p className="px-2 py-5 text-center text-xs text-white/30">{emptyText}</p>}
          </div>
        )}
        {menu === 'text' && (
          <div className="space-y-1">
            {copyMatches.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => onSelectText(block)}
                className="flex w-full flex-col rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="truncate text-xs font-medium text-white/75">{block.name}</span>
                <span className="line-clamp-2 text-[10px] leading-snug text-white/32">{block.content}</span>
              </button>
            ))}
            {copyMatches.length === 0 && <p className="px-2 py-5 text-center text-xs text-white/30">{emptyText}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function BannerFormatIcon({ format }: { format: BannerFormat }) {
  const maxWidth = 48
  const maxHeight = 42
  const ratio = format.width / format.height
  const width = ratio >= 1 ? maxWidth : Math.max(12, Math.round(maxHeight * ratio))
  const height = ratio >= 1 ? Math.max(10, Math.round(maxWidth / ratio)) : maxHeight
  const fold = Math.max(5, Math.min(10, Math.round(Math.min(width, height) * 0.32)))
  const strokeWidth = 2

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
    >
      <path
        d={`M 3 ${strokeWidth} H ${width - fold} L ${width - strokeWidth} ${fold} V ${height - strokeWidth} H 3 Z`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${width - fold} ${strokeWidth} V ${fold} H ${width - strokeWidth}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BannerSlidesEditor({
  project,
  enabledFormats,
  onProjectUpdate,
  onBack,
  onGenerated,
  saveButton,
  autoGenerate,
}: {
  project: BannerProject
  enabledFormats: string[]
  onProjectUpdate: (updates: Partial<BannerProject>) => void
  onBack: () => void
  onGenerated: (banners: GeneratedBanner[]) => void
  saveButton?: React.ReactNode
  autoGenerate?: boolean
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copyBlocks, setCopyBlocks] = useState<CopyBlock[]>(() => loadCopyBlocks())

  function addSlide() {
    onProjectUpdate({ slides: [...project.slides, { id: `s${Date.now()}`, texts: [{ role: 'heading' as const, value: '' }] }] })
  }

  function removeSlide(id: string) {
    if (project.slides.length <= 1) return
    onProjectUpdate({ slides: project.slides.filter(s => s.id !== id) })
  }

  function updateSlideText(slideId: string, textIdx: number, value: string) {
    const nextSlides = project.slides.map(s =>
      s.id !== slideId ? s : {
        ...s,
        texts: s.texts.map((t, i) => i === textIdx ? { ...t, value, copyOverride: t.copyBlockId ? value : t.copyOverride } : t),
      }
    )
    onProjectUpdate({
      slides: nextSlides,
      copyRefs: buildBannerCopyRefs(nextSlides, copyBlocks),
    })
  }

  function updateSlideRole(slideId: string, textIdx: number, role: BannerTextRole) {
    const nextSlides = project.slides.map(s =>
      s.id !== slideId ? s : { ...s, texts: s.texts.map((t, i) => i === textIdx ? { ...t, role } : t) }
    )
    onProjectUpdate({
      slides: nextSlides,
      copyRefs: buildBannerCopyRefs(nextSlides, copyBlocks),
    })
  }

  function updateSlideCopyBlock(slideId: string, textIdx: number, copyBlockId: string) {
    const block = copyBlocks.find((item) => item.id === copyBlockId)
    const nextSlides = project.slides.map(s =>
      s.id !== slideId ? s : {
        ...s,
        texts: s.texts.map((t, i) => {
          if (i !== textIdx) return t
          if (!copyBlockId) {
            const { copyBlockId: _copyBlockId, copyOverride: _copyOverride, lockedCopy: _lockedCopy, ...rest } = t
            return rest
          }
          return {
            ...t,
            copyBlockId,
            value: resolveCopyContent(copyBlockId, undefined, undefined, t.value),
            copyOverride: undefined,
            lockedCopy: false,
            role: t.role === 'button' || t.role === 'heading' || t.role === 'copy' ? t.role : block?.role === 'cta' ? 'button' : 'copy',
          }
        }),
      }
    )
    onProjectUpdate({
      slides: nextSlides,
      copyRefs: buildBannerCopyRefs(nextSlides, copyBlocks),
    })
  }

  function toggleSlideCopyLock(slideId: string, textIdx: number) {
    const nextSlides = project.slides.map(s =>
      s.id !== slideId ? s : {
        ...s,
        texts: s.texts.map((t, i) => i === textIdx ? { ...t, lockedCopy: !t.lockedCopy } : t),
      }
    )
    onProjectUpdate({
      slides: nextSlides,
      copyRefs: buildBannerCopyRefs(nextSlides, copyBlocks),
    })
  }

  function addTextToSlide(slideId: string) {
    onProjectUpdate({
      slides: project.slides.map(s =>
        s.id !== slideId ? s : { ...s, texts: [...s.texts, { role: 'copy' as const, value: '' }] }
      ),
    })
  }

  function removeTextFromSlide(slideId: string, textIdx: number) {
    onProjectUpdate({
      slides: project.slides.map(s =>
        s.id !== slideId || s.texts.length <= 1 ? s : { ...s, texts: s.texts.filter((_, i) => i !== textIdx) }
      ),
    })
  }

  async function handleGenerate() {
    setCopyBlocks(loadCopyBlocks())
    setGenerating(true)
    setError('')
    try {
      const api = (window as any).api
      const res = await api.banner?.generate({ ...project, enabledFormats })
      if (!res?.ok) {
        setError(res?.error ?? 'Genereren mislukt.')
        return
      }
      onGenerated(res.banners ?? [])
    } catch (err: any) {
      setError(err?.message ?? 'Genereren mislukt.')
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate = enabledFormats.length > 0 && project.slides.some(s => s.texts.some(t => t.value.trim()))

  const autoFiredRef = useRef(false)
  useEffect(() => {
    if (!autoGenerate || autoFiredRef.current || !canGenerate) return
    autoFiredRef.current = true
    void handleGenerate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, canGenerate])

  return (
    <div className="relative z-10 flex h-full w-full overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
        <div className="mb-5 flex items-center gap-3">
          <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-white/50 hover:text-white/90 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-white/80">Slides samenstellen</h2>
          <div className="flex-1" />
          {saveButton}
        </div>

        <div className="flex flex-col gap-3">
          {project.slides.map((slide, slideIdx) => (
            <div key={slide.id} className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-white/40">Slide {slideIdx + 1}</span>
                {project.slides.length > 1 && (
                  <button type="button" onClick={() => removeSlide(slide.id)} className="text-white/25 hover:text-red-400 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {slide.texts.map((t, ti) => (
                  <div key={ti} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={t.role}
                        onChange={e => updateSlideRole(slide.id, ti, e.target.value as BannerTextRole)}
                        className="h-8 flex-shrink-0 rounded-lg border border-white/[0.08] bg-[#141414] px-2 text-xs text-white/70 outline-none"
                      >
                        <option value="heading">Heading</option>
                        <option value="copy">Subtekst</option>
                        <option value="button">Button</option>
                      </select>
                      <input
                        value={t.value}
                        onChange={e => updateSlideText(slide.id, ti, e.target.value)}
                        placeholder={t.role === 'heading' ? 'Header…' : t.role === 'button' ? 'Buttontekst…' : 'Subtekst…'}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#141414] px-3 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-white/20 transition-colors"
                      />
                      {slide.texts.length > 1 && (
                        <button type="button" onClick={() => removeTextFromSlide(slide.id, ti)} className="flex-shrink-0 text-white/20 hover:text-white/50 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-[104px]">
                      <select
                        value={t.copyBlockId ?? ''}
                        onFocus={() => setCopyBlocks(loadCopyBlocks())}
                        onChange={(event) => updateSlideCopyBlock(slide.id, ti, event.target.value)}
                        className="h-7 min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-[#111] px-2 text-[11px] text-white/45 outline-none transition-colors focus:border-white/[0.14] focus:text-white/70"
                      >
                        <option value="">Geen copy block</option>
                        {copyBlocks.map((block) => (
                          <option key={block.id} value={block.id}>{block.name}</option>
                        ))}
                      </select>
                      {t.copyBlockId && (
                        <button
                          type="button"
                          onClick={() => toggleSlideCopyLock(slide.id, ti)}
                          className={['h-7 rounded-lg border px-2 text-[11px] transition-colors', t.lockedCopy ? 'border-[#facc15]/35 text-[#facc15]' : 'border-white/[0.06] text-white/35 hover:text-white/60'].join(' ')}
                        >
                          {t.lockedCopy ? 'Locked' : 'Auto'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => addTextToSlide(slide.id)} className="flex h-7 items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Tekstregel
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addSlide} className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.10] text-sm text-white/35 hover:border-white/20 hover:text-white/60 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Slide toevoegen
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-2 text-xs text-red-300">{error}</p>
          )}
          <button
            type="button"
            disabled={!canGenerate || generating}
            onClick={handleGenerate}
            className="w-full font-semibold rounded-lg px-4 py-3 text-sm transition-colors flex items-center justify-center gap-2 bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:cursor-not-allowed text-black"
          >
            {generating ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Genereren…
              </>
            ) : 'Banners maken'}
          </button>
        </div>
      </div>

      <div className="flex w-64 flex-shrink-0 flex-col items-center border-l border-white/[0.06] px-4 py-6">
        <p className="mb-3 text-xs font-medium text-white/40">Voorbeeld 300×250</p>
        <BannerAnimatedPreview
          slides={project.slides}
          imageSrc={project.imageSrc}
          containerWidth={224}
          width={300}
          height={250}
        />
      </div>
    </div>
  )
}

function BannerResultView({
  project,
  banners,
  enabledFormats,
  onEnabledFormatsChange,
  onBack,
  saveButton,
}: {
  project: BannerProject
  banners: GeneratedBanner[]
  enabledFormats: string[]
  onEnabledFormatsChange: (formats: string[]) => void
  onBack: () => void
  saveButton?: React.ReactNode
}) {
  const [viewMode, setViewMode] = useState<'single' | 'overview'>('single')
  const [selectedFormatId, setSelectedFormatId] = useState(banners[0]?.formatId ?? '')
  const [exporting, setExporting] = useState(false)

  const selectedBanner = banners.find(b => b.formatId === selectedFormatId) ?? banners[0]
  const selectedFormat = IAB_FORMATS.find(f => f.id === selectedBanner?.formatId)

  async function handleExportAll() {
    setExporting(true)
    try {
      const api = (window as any).api
      await api.banner?.export({ banners, title: project.inputText.slice(0, 40) || 'Banners' })
    } catch { }
    setExporting(false)
  }

  function handleDownloadOne(banner: GeneratedBanner) {
    const blob = new Blob([banner.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `banner-${banner.formatId}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative z-10 flex h-full w-full overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-white/50 hover:text-white/90 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5">
            {(['single', 'overview'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={['flex h-6 items-center rounded-lg px-2.5 text-xs transition-colors', viewMode === mode ? 'bg-white/[0.10] text-white/90' : 'text-white/40 hover:text-white/70'].join(' ')}
              >
                {mode === 'single' ? 'Enkel' : 'Overzicht'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {saveButton}
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportAll}
            className="flex h-8 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exporteer alles
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {viewMode === 'single' ? (
            <BannerSingleView
              banner={selectedBanner}
              format={selectedFormat}
              banners={banners}
              onSelectFormat={setSelectedFormatId}
              onDownload={() => selectedBanner && handleDownloadOne(selectedBanner)}
            />
          ) : (
            <BannerOverviewView
              banners={banners}
              onSelectFormat={id => { setSelectedFormatId(id); setViewMode('single') }}
            />
          )}
        </div>
      </div>

      <BannerFormatsSidebar
        enabledFormats={enabledFormats}
        onEnabledFormatsChange={onEnabledFormatsChange}
      />
    </div>
  )
}

function BannerSingleView({
  banner,
  format,
  banners,
  onSelectFormat,
  onDownload,
}: {
  banner?: GeneratedBanner
  format?: BannerFormat
  banners: GeneratedBanner[]
  onSelectFormat: (id: string) => void
  onDownload: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  function replay() {
    const el = iframeRef.current
    if (!el || !banner) return
    el.srcdoc = ''
    requestAnimationFrame(() => { if (el && banner) el.srcdoc = banner.html })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select
          value={banner?.formatId ?? ''}
          onChange={e => onSelectFormat(e.target.value)}
          className="h-8 rounded-xl border border-white/[0.08] bg-[#1a1a1a] px-3 text-sm text-white/80 outline-none"
        >
          {banners.map(b => {
            const fmt = IAB_FORMATS.find(f => f.id === b.formatId)
            return <option key={b.formatId} value={b.formatId}>{fmt ? `${fmt.width}×${fmt.height} — ${fmt.label}` : b.formatId}</option>
          })}
        </select>
        <button type="button" onClick={replay} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-white/50 hover:text-white/90 transition-colors" title="Animatie herspelen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.82" />
          </svg>
        </button>
        <button type="button" onClick={onDownload} className="flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download HTML
        </button>
      </div>

      {banner && format && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08]" style={{ width: format.width, height: format.height, maxWidth: '100%' }}>
          <iframe
            ref={iframeRef}
            srcDoc={banner.html}
            style={{ width: format.width, height: format.height, border: 'none', display: 'block' }}
            sandbox="allow-scripts"
            title={`Banner ${format.id}`}
          />
        </div>
      )}
    </div>
  )
}

function BannerOverviewView({
  banners,
  onSelectFormat,
}: {
  banners: GeneratedBanner[]
  onSelectFormat: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-6">
      {banners.map(banner => {
        const format = IAB_FORMATS.find(f => f.id === banner.formatId)
        if (!format) return null
        const scale = Math.min(1, 240 / Math.max(format.width, format.height))
        const displayW = Math.round(format.width * scale)
        const displayH = Math.round(format.height * scale)
        return (
          <button key={banner.formatId} type="button" onClick={() => onSelectFormat(banner.formatId)} className="group flex flex-col items-center gap-2">
            <div className="overflow-hidden rounded-xl border border-white/[0.08] group-hover:border-white/20 transition-colors" style={{ width: displayW, height: displayH }}>
              <iframe
                srcDoc={banner.html}
                style={{ width: format.width, height: format.height, border: 'none', display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left' }}
                sandbox="allow-scripts"
                title={format.id}
              />
            </div>
            <p className="text-[10px] text-white/40 group-hover:text-white/60 transition-colors">{format.width}×{format.height} — {format.label}</p>
          </button>
        )
      })}
    </div>
  )
}

function BannerFormatsSidebar({
  enabledFormats,
  onEnabledFormatsChange,
}: {
  enabledFormats: string[]
  onEnabledFormatsChange: (formats: string[]) => void
}) {
  function toggle(id: string) {
    onEnabledFormatsChange(
      enabledFormats.includes(id) ? enabledFormats.filter(f => f !== id) : [...enabledFormats, id]
    )
  }

  return (
    <div className="flex w-52 flex-shrink-0 flex-col border-l border-white/[0.06]">
      <div className="flex-shrink-0 border-b border-white/[0.06] px-4 py-3">
        <p className="text-xs font-medium text-white/50">Formaten</p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {IAB_FORMATS.map(format => {
          const enabled = enabledFormats.includes(format.id)
          return (
            <button key={format.id} type="button" onClick={() => toggle(format.id)} className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left hover:bg-white/[0.03] transition-colors">
              <div className={['flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors', enabled ? 'border-[#facc15] bg-[#facc15]/20' : 'border-white/[0.15]'].join(' ')}>
                {enabled && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={['truncate text-xs', enabled ? 'text-white/80' : 'text-white/35'].join(' ')}>{format.label}</p>
                <p className="text-[10px] text-white/25">{format.width}×{format.height}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
