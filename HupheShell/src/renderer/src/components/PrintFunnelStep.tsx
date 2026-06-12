import { useEffect, useRef, useState, type ReactNode } from 'react'
import MediaAssetPicker, { type MediaAsset } from './MediaAssetPicker'
import VisionModelSetup from './VisionModelSetup'
import { resolveCopyContent, type CopyBlock } from '../lib/copy-library'
import { loadLinkedTextSources, loadLinkedTextSourcesAsync, resolveTypewriterLinkedText } from '../lib/atelier-linked-sources'

export interface PrintFunnelPayload {
  title: string
  body: string
  imageSrc?: string
  assetId?: string
  titleCopyBlockId?: string
  bodyCopyBlockId?: string
  titleCopyOverride?: string
  bodyCopyOverride?: string
  lockedCopy?: boolean
  format?: string
  formats: string[]
}

interface PrintFunnelStepProps {
  onComplete: (payload: PrintFunnelPayload) => void
  initialPayload?: PrintFunnelPayload
  mediaAssets?: MediaAsset[]
  onSaveMediaAsset?: (asset: MediaAsset) => void
  targetProjectId?: string
}

export interface MediaFormatOption {
  id: string
  label: string
  shortLabel: string
  group: 'Offline print' | 'Social'
  width: number
  height: number
  unit: 'mm' | 'px'
}

export const MEDIA_FORMATS: MediaFormatOption[] = [
  { id: 'A4', label: 'A4', shortLabel: 'A4', group: 'Offline print', width: 210, height: 297, unit: 'mm' },
  { id: 'A3', label: 'A3', shortLabel: 'A3', group: 'Offline print', width: 297, height: 420, unit: 'mm' },
  { id: 'A5', label: 'A5', shortLabel: 'A5', group: 'Offline print', width: 148, height: 210, unit: 'mm' },
  { id: 'SRA3', label: 'SRA3', shortLabel: 'SRA3', group: 'Offline print', width: 320, height: 450, unit: 'mm' },
  { id: 'DL', label: 'DL', shortLabel: 'DL', group: 'Offline print', width: 99, height: 210, unit: 'mm' },
  {
    id: 'IG_SQUARE',
    label: 'Instagram vierkant',
    shortLabel: '1:1',
    group: 'Social',
    width: 1080,
    height: 1080,
    unit: 'px',
  },
  {
    id: 'IG_PORTRAIT',
    label: 'Instagram portret',
    shortLabel: '4:5',
    group: 'Social',
    width: 1080,
    height: 1350,
    unit: 'px',
  },
  {
    id: 'IG_STORY',
    label: 'Story / Reels',
    shortLabel: '9:16',
    group: 'Social',
    width: 1080,
    height: 1920,
    unit: 'px',
  },
  {
    id: 'LINKEDIN',
    label: 'LinkedIn post',
    shortLabel: 'LI',
    group: 'Social',
    width: 1200,
    height: 627,
    unit: 'px',
  },
  {
    id: 'SOCIAL_LANDSCAPE',
    label: 'Social landscape',
    shortLabel: '16:9',
    group: 'Social',
    width: 1920,
    height: 1080,
    unit: 'px',
  },
]

const MEDIA_FORMAT_GROUPS: MediaFormatOption['group'][] = ['Offline print', 'Social']

export default function PrintFunnelStep({ onComplete, initialPayload, mediaAssets, onSaveMediaAsset, targetProjectId }: PrintFunnelStepProps) {
  const [selectedFormats, setSelectedFormats] = useState<string[]>(
    initialPayload?.formats?.length ? initialPayload.formats : (initialPayload?.format ? [initialPayload.format] : [])
  )
  const [title, setTitle] = useState(initialPayload?.title ?? '')
  const [body, setBody] = useState(initialPayload?.body ?? '')
  const [titleCopyBlockId, setTitleCopyBlockId] = useState(initialPayload?.titleCopyBlockId ?? '')
  const [bodyCopyBlockId, setBodyCopyBlockId] = useState(initialPayload?.bodyCopyBlockId ?? '')
  const [lockedCopy, setLockedCopy] = useState(initialPayload?.lockedCopy ?? false)
  const [copyBlocks, setCopyBlocks] = useState<CopyBlock[]>(() => loadLinkedTextSources({ targetId: targetProjectId }))
  const [showTitleCopyLink, setShowTitleCopyLink] = useState(!!(initialPayload?.titleCopyBlockId))
  const [showBodyCopyLink, setShowBodyCopyLink] = useState(!!(initialPayload?.bodyCopyBlockId))
  const [imageSrc, setImageSrc] = useState(initialPayload?.imageSrc ?? '')
  const [assetId, setAssetId] = useState<string | undefined>(initialPayload?.assetId)
  const [imageFileName, setImageFileName] = useState('')
  const [imageDragging, setImageDragging] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)
  const [visionResult, setVisionResult] = useState('')
  const [visionError, setVisionError] = useState('')
  const [visionSetupOpen, setVisionSetupOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [linkedMode, setLinkedMode] = useState(false)
  const [linkedMenuOpen, setLinkedMenuOpen] = useState<'image' | 'style' | 'text' | null>(null)
  const [linkedMenuSearch, setLinkedMenuSearch] = useState('')
  const [linkedStyleSrc, setLinkedStyleSrc] = useState('')
  const [linkedStyleName, setLinkedStyleName] = useState('')

  useEffect(() => {
    void loadLinkedTextSourcesAsync({ targetId: targetProjectId }).then(async (blocks) => {
      setCopyBlocks(blocks)
      const titleBlock = blocks.find((block) => block.id === titleCopyBlockId)
      const bodyBlock = blocks.find((block) => block.id === bodyCopyBlockId)
      if (titleCopyBlockId) {
        const linkedTitle = await resolveTypewriterLinkedText(titleCopyBlockId, { targetId: targetProjectId, roles: ['print-title'] })
        setTitle(linkedTitle || (titleCopyBlockId.startsWith('typewriter:') ? '' : titleBlock?.content ?? ''))
      }
      if (bodyCopyBlockId) {
        const linkedBody = await resolveTypewriterLinkedText(bodyCopyBlockId, { targetId: targetProjectId, roles: ['print-body'] })
        setBody(linkedBody || (bodyCopyBlockId.startsWith('typewriter:') ? '' : bodyBlock?.content ?? ''))
      }
    })
  }, [targetProjectId, titleCopyBlockId, bodyCopyBlockId])

  async function handleAnalyzeImage() {
    if (!imageSrc) return
    const model = localStorage.getItem('huphe:vision-model') ?? 'llava'
    setVisionLoading(true)
    setVisionResult('')
    setVisionError('')
    try {
      const check = await (window as any).api.vision.checkModel(model) as { installed: boolean }
      if (!check.installed) { setVisionSetupOpen(true); setVisionLoading(false); return }
      const res = await (window as any).api.vision.analyze({ src: imageSrc, model }) as { ok: boolean; description?: string; error?: string }
      if (!res.ok) { setVisionError(res.error ?? 'Analyse mislukt.'); return }
      setVisionResult(res.description ?? '')
    } catch (err: any) {
      setVisionError(err.message ?? 'Analyse mislukt.')
    } finally {
      setVisionLoading(false)
    }
  }

  useEffect(() => {
    setSelectedFormats(initialPayload?.formats?.length ? initialPayload.formats : (initialPayload?.format ? [initialPayload.format] : []))
    setTitle(initialPayload?.title ?? '')
    setBody(initialPayload?.body ?? '')
    setTitleCopyBlockId(initialPayload?.titleCopyBlockId ?? '')
    setBodyCopyBlockId(initialPayload?.bodyCopyBlockId ?? '')
    setLockedCopy(initialPayload?.lockedCopy ?? false)
    setImageSrc(initialPayload?.imageSrc ?? '')
    setAssetId(initialPayload?.assetId)
    setImageFileName('')
  }, [initialPayload?.title, initialPayload?.body, initialPayload?.titleCopyBlockId, initialPayload?.bodyCopyBlockId, initialPayload?.lockedCopy, initialPayload?.imageSrc, initialPayload?.assetId, initialPayload?.format, initialPayload?.formats?.join('|')])

  const contentReady = title.trim().length > 0
  const imageReady = imageSrc.length > 0
  const formatsReady = selectedFormats.length > 0
  const canGenerate = formatsReady

  function toggleFormat(id: string) {
    setSelectedFormats((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  function readImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string)
      setImageFileName(file.name)
      setAssetId(undefined)
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setImageDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) readImageFile(file)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canGenerate) return
    onComplete({
      title: title.trim(),
      body: body.trim(),
      titleCopyBlockId: titleCopyBlockId || undefined,
      bodyCopyBlockId: bodyCopyBlockId || undefined,
      titleCopyOverride: titleCopyBlockId ? title.trim() : undefined,
      bodyCopyOverride: bodyCopyBlockId ? body.trim() : undefined,
      lockedCopy,
      imageSrc: imageSrc || undefined,
      assetId,
      formats: selectedFormats,
    })
  }

  async function linkCopyBlock(kind: 'title' | 'body', copyBlockId: string) {
    const block = copyBlocks.find((item) => item.id === copyBlockId)
    const linkedContent = await resolveTypewriterLinkedText(copyBlockId, {
      targetId: targetProjectId,
      roles: kind === 'title' ? ['print-title'] : ['print-body'],
    })
    const isTypewriter = copyBlockId?.startsWith('typewriter:')
    const content = linkedContent || (isTypewriter ? '' : block?.content) || (copyBlockId ? resolveCopyContent(copyBlockId, undefined, undefined, kind === 'title' ? title : body) : '')
    if (kind === 'title') {
      setTitleCopyBlockId(copyBlockId)
      if (block) setTitle(content)
    } else {
      setBodyCopyBlockId(copyBlockId)
      if (block) setBody(content)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-10 w-full"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 mb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-white font-semibold text-[18px]">Creëer jouw media assets</h1>
              <p className="text-white/35 text-sm">Volg de stappen hieronder om te beginnen</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2 pt-1">
              <span className="text-[11px] font-medium text-white/45">Linked mode</span>
              <button
                type="button"
                onClick={() => setLinkedMode((v) => !v)}
                className={['relative h-7 w-14 rounded-full transition-colors duration-200', linkedMode ? 'bg-[#facc15]' : 'bg-white/[0.14]'].join(' ')}
                aria-label="Linked mode"
                aria-pressed={linkedMode}
              >
                <span className={['absolute top-1 h-5 w-5 rounded-full bg-white shadow-lg transition-[left] duration-200', linkedMode ? 'left-8' : 'left-1'].join(' ')} />
              </button>
            </div>
          </div>
        </div>

        {linkedMode && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center gap-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Gekoppelde bronnen</p>
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => { setLinkedMenuSearch(''); setLinkedMenuOpen('image') }}
                className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-white/70">Koppel afbeelding</span>
                  <span className="block truncate text-white/30">{imageFileName || (imageSrc ? 'Afbeelding gekoppeld' : 'Upload of koppel de hoofdafbeelding')}</span>
                </span>
                <PlusIcon />
              </button>
              {linkedMenuOpen === 'image' && (
                <PrintLinkedDropdown
                  type="image"
                  search={linkedMenuSearch}
                  onSearch={setLinkedMenuSearch}
                  mediaAssets={mediaAssets ?? []}
                  copyBlocks={copyBlocks}
                  onSelectMedia={(asset) => { setImageSrc(asset.src); setAssetId(asset.id); setImageFileName(asset.name); setLinkedMenuOpen(null) }}
                  onSelectText={() => {}}
                  onClose={() => setLinkedMenuOpen(null)}
                />
              )}
              <button
                type="button"
                onClick={() => { setLinkedMenuSearch(''); setLinkedMenuOpen('style') }}
                className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-white/70">Koppel huisstijl</span>
                  <span className="block truncate text-white/30">{linkedStyleName || 'Upload of selecteer een stijlreferentie'}</span>
                </span>
                <PlusIcon />
              </button>
              {linkedMenuOpen === 'style' && (
                <PrintLinkedDropdown
                  type="style"
                  search={linkedMenuSearch}
                  onSearch={setLinkedMenuSearch}
                  mediaAssets={mediaAssets ?? []}
                  copyBlocks={copyBlocks}
                  onSelectMedia={(asset) => { setLinkedStyleSrc(asset.src); setLinkedStyleName(asset.name); setLinkedMenuOpen(null) }}
                  onSelectText={() => {}}
                  onClose={() => setLinkedMenuOpen(null)}
                />
              )}
              <button
                type="button"
                onClick={() => { setCopyBlocks(loadLinkedTextSources({ targetId: targetProjectId })); void loadLinkedTextSourcesAsync({ targetId: targetProjectId }).then(setCopyBlocks); setLinkedMenuSearch(''); setLinkedMenuOpen('text') }}
                className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2 text-left text-xs text-white/55 transition-colors hover:border-white/16 hover:text-white/75"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-white/70">Koppel tekst document</span>
                  <span className="block truncate text-white/30">
                    {titleCopyBlockId ? (copyBlocks.find(b => b.id === titleCopyBlockId)?.name ?? 'Document gekoppeld') : 'Gebruik briefing of copy als bron'}
                  </span>
                </span>
                <PlusIcon />
              </button>
              {linkedMenuOpen === 'text' && (
                <PrintLinkedDropdown
                  type="text"
                  search={linkedMenuSearch}
                  onSearch={setLinkedMenuSearch}
                  mediaAssets={mediaAssets ?? []}
                  copyBlocks={copyBlocks}
                  onSelectMedia={() => {}}
                  onSelectText={(block) => { void linkCopyBlock('title', block.id); void linkCopyBlock('body', block.id); setLinkedMenuOpen(null) }}
                  onClose={() => setLinkedMenuOpen(null)}
                />
              )}
            </div>
            {imageSrc && (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07]">
                <img src={imageSrc} alt="" className="h-20 w-full object-cover opacity-65" />
              </div>
            )}
          </div>
        )}

        {!linkedMode && (<><PrintStep index={1} label="Afbeelding" done={imageReady}>
          <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div />
            {mediaAssets !== undefined && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
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
            onDragOver={(e) => { e.preventDefault(); setImageDragging(true) }}
            onDragLeave={() => setImageDragging(false)}
            onDrop={handleDrop}
            className={[
              'relative flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-colors',
              imageDragging
                ? 'border-[#facc15] bg-[#facc15]/[0.04]'
                : 'border-white/[0.10] bg-[#0f0f0f] hover:border-white/20',
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
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) readImageFile(file)
              e.currentTarget.value = ''
            }}
          />
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
                    onClick={() => { setTitle(visionResult.split('.')[0]?.trim() ?? visionResult); setVisionResult('') }}
                    className="mt-2 text-[10px] font-semibold text-[#facc15] hover:text-[#fde047]"
                  >
                    Gebruik als header →
                  </button>
                </div>
              )}
              {visionError && <p className="text-[10px] text-red-300">{visionError}</p>}
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
          </div>
        </PrintStep>

        <PrintStep index={2} label="Tekst" done={contentReady} locked={false}>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/35">Header</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Header voor je media…"
                className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
              />
              {showTitleCopyLink ? (
                <select
                  value={titleCopyBlockId}
                  onFocus={() => { void loadLinkedTextSourcesAsync({ targetId: targetProjectId }).then(setCopyBlocks) }}
                  onChange={(event) => {
                    void linkCopyBlock('title', event.target.value)
                    if (!event.target.value) setShowTitleCopyLink(false)
                  }}
                  className="mt-1.5 h-8 w-full rounded-lg border border-white/[0.06] bg-[#111] px-2 text-xs text-white/45 outline-none transition-colors focus:border-white/[0.14] focus:text-white/70"
                >
                  <option value="">Geen copy block</option>
                  {copyBlocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => { void loadLinkedTextSourcesAsync({ targetId: targetProjectId }).then(setCopyBlocks); setShowTitleCopyLink(true) }}
                  className="mt-1 text-[11px] text-white/25 hover:text-white/50 transition-colors"
                >
                  + Koppel aan copy block
                </button>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/35">Subtekst</span>
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Subtekst voor je media…"
                className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
              />
              {showBodyCopyLink ? (
                <select
                  value={bodyCopyBlockId}
                  onFocus={() => { void loadLinkedTextSourcesAsync({ targetId: targetProjectId }).then(setCopyBlocks) }}
                  onChange={(event) => {
                    void linkCopyBlock('body', event.target.value)
                    if (!event.target.value) setShowBodyCopyLink(false)
                  }}
                  className="mt-1.5 h-8 w-full rounded-lg border border-white/[0.06] bg-[#111] px-2 text-xs text-white/45 outline-none transition-colors focus:border-white/[0.14] focus:text-white/70"
                >
                  <option value="">Geen copy block</option>
                  {copyBlocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => { void loadLinkedTextSourcesAsync({ targetId: targetProjectId }).then(setCopyBlocks); setShowBodyCopyLink(true) }}
                  className="mt-1 text-[11px] text-white/25 hover:text-white/50 transition-colors"
                >
                  + Koppel aan copy block
                </button>
              )}
            </label>
            {(titleCopyBlockId || bodyCopyBlockId) && (
              <button
                type="button"
                onClick={() => setLockedCopy((value) => !value)}
                className={['h-8 rounded-lg border px-3 text-xs transition-colors', lockedCopy ? 'border-[#facc15]/35 text-[#facc15]' : 'border-white/[0.07] text-white/40 hover:text-white/70'].join(' ')}
              >
                {lockedCopy ? 'Copy locked' : 'Copy automatisch bijwerken'}
              </button>
            )}
          </div>
        </PrintStep>
        </>)}

        <PrintStep index={3} label="Formaten" done={formatsReady} locked={false}>
          <div className="space-y-4">
            {MEDIA_FORMAT_GROUPS.map((group) => (
              <div key={group} className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">{group}</p>
                <div className="flex flex-wrap gap-2">
                  {MEDIA_FORMATS.filter((format) => format.group === group).map((format) => {
                    const selected = selectedFormats.includes(format.id)
                    return (
                      <button
                        key={format.id}
                        type="button"
                        onClick={() => toggleFormat(format.id)}
                        title={`${format.label} · ${format.width} x ${format.height} ${format.unit}`}
                        aria-pressed={selected}
                        className={[
                          'flex h-[68px] w-[62px] items-center justify-center rounded-xl transition-colors',
                          selected
                            ? 'bg-[#facc15]/[0.10] text-[#facc15] ring-1 ring-[#facc15]/45'
                            : 'text-white/45 hover:bg-white/[0.04] hover:text-white/75',
                        ].join(' ')}
                      >
                        <MediaFormatIcon format={format} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </PrintStep>

        <div className={['transition-opacity', !canGenerate ? 'opacity-30' : ''].join(' ')}>
          <button
            type="submit"
            disabled={!canGenerate}
            className="w-full font-semibold rounded-lg px-4 py-3 text-sm transition-colors bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:cursor-not-allowed text-black"
          >
            Genereer
          </button>
        </div>
      </div>
    </form>
  )
}

function MediaFormatIcon({ format }: { format: MediaFormatOption }) {
  const maxWidth = 46
  const maxHeight = 54
  const ratio = format.width / format.height
  const width = ratio >= 1 ? maxWidth : Math.max(22, Math.round(maxHeight * ratio))
  const height = ratio >= 1 ? Math.max(22, Math.round(maxWidth / ratio)) : maxHeight
  const fold = Math.max(7, Math.min(13, Math.round(Math.min(width, height) * 0.28)))
  const strokeWidth = 2
  const fontSize = format.shortLabel.length > 3 ? 8 : 9

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
      <text
        x={width / 2}
        y={height / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        fontSize={fontSize}
        fontWeight="700"
        letterSpacing="0"
      >
        {format.shortLabel}
      </text>
    </svg>
  )
}

function PrintStep({ index, label, done, locked, children }: {
  index: number
  label: string
  done?: boolean
  locked?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={[
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors',
          done
            ? 'bg-[#facc15] text-black'
            : locked
              ? 'bg-white/[0.05] text-white/20'
              : 'bg-white/[0.08] text-white/40',
        ].join(' ')}>
          {done ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : index}
        </div>
        <span className={['text-[11px] font-medium uppercase tracking-widest transition-colors', locked ? 'text-white/20' : 'text-white/50'].join(' ')}>
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function PrintLinkedDropdown({
  type,
  search,
  onSearch,
  mediaAssets,
  copyBlocks,
  onSelectMedia,
  onSelectText,
  onClose,
}: {
  type: 'image' | 'style' | 'text'
  search: string
  onSearch: (v: string) => void
  mediaAssets: MediaAsset[]
  copyBlocks: CopyBlock[]
  onSelectMedia: (asset: MediaAsset) => void
  onSelectText: (block: CopyBlock) => void
  onClose: () => void
}) {
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())
  const query = search.trim().toLowerCase()
  const mediaMatches = mediaAssets
    .filter((a) => a.src && !brokenIds.has(a.id))
    .filter((a) => !query || a.name.toLowerCase().includes(query))
    .slice(0, 40)
  const copyMatches = copyBlocks.filter((b) => !query || b.name.toLowerCase().includes(query) || b.content.toLowerCase().includes(query)).slice(0, 40)

  return (
    <div className="-mt-1 rounded-b-2xl rounded-t-lg border border-t-0 border-white/[0.08] bg-[#0d0d0d] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
          {type === 'image' ? 'Koppel afbeelding' : type === 'style' ? 'Koppel huisstijl' : 'Koppel tekst document'}
        </p>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/65">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        autoFocus
        placeholder="Zoek bronnen…"
        className="mb-2 h-9 w-full rounded-xl border border-white/[0.07] bg-[#151515] px-3 text-xs text-white/80 outline-none placeholder:text-white/25 focus:border-[#facc15]/35"
      />
      <div className="max-h-52 overflow-y-auto pr-1">
        {(type === 'image' || type === 'style') && (
          <div className="space-y-1">
            {mediaMatches.map((asset) => (
              <button key={asset.id} type="button" onClick={() => onSelectMedia(asset)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]">
                <span className="h-9 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]">
                  <img src={asset.src} alt="" className="h-full w-full object-cover" onError={() => setBrokenIds((prev) => new Set([...prev, asset.id]))} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-white/75">{asset.name}</span>
                  <span className="block truncate text-[10px] text-white/30">{asset.mimeType}</span>
                </span>
              </button>
            ))}
            {mediaMatches.length === 0 && <p className="px-2 py-5 text-center text-xs text-white/30">Geen assets gevonden.</p>}
          </div>
        )}
        {type === 'text' && (
          <div className="space-y-1">
            {copyMatches.map((block) => (
              <button key={block.id} type="button" onClick={() => onSelectText(block)} className="flex w-full flex-col rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]">
                <span className="truncate text-xs font-medium text-white/75">{block.name}</span>
                <span className="line-clamp-2 text-[10px] leading-snug text-white/32">{block.content}</span>
              </button>
            ))}
            {copyMatches.length === 0 && <p className="px-2 py-5 text-center text-xs text-white/30">Geen documenten gevonden.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.3L12 17l-6.2 4 2.4-7.3L2 9.2h7.6z" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
