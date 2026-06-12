import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { WebSlidePreview, type TemplateData } from '../components/WebSlidePreview'
import { resolveTemplateData } from '../lib/template-storage'
import TextReviewModal, { type TextSegment } from '../components/TextReviewModal'
import { parseMarkdownToSegments, parsePlainTextToSegments, detectFileType } from '../lib/parseRawTextToSegments'
import logo from '../assets/logo.png'
import spinner from '../assets/spinner.png'

interface Props {
  onBack: () => void
}

const ALLOWED_EXTENSIONS = ['.txt', '.md']

type Mode = '1' | '2' | '3'

const MODES: { id: Mode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: '1',
    label: 'Ruwe aantekeningen',
    description: 'Losse notities worden omgezet naar een helder verhaal',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: '2',
    label: 'Gestructureerd document',
    description: 'Een uitgewerkt document wordt vertaald naar slides',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: '3',
    label: 'Presentatie ombouwen',
    description: 'Bestaande presentatie wordt opnieuw opgezet',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <polyline points="23 20 23 14 17 14" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
      </svg>
    ),
  },
]

interface Block { type: string; heading: string; body: string; fields: Record<string, string>; imagePath?: string }
type ReviewBlock = Block & { id: string; imageUrl?: string }

// Elke regel van de vorm [Layout Naam] start een nieuw blok.
// Regels van de vorm `veldnaam: waarde` (lowercase sleutel) worden als custom veld herkend.
// De eerste overige regel wordt heading, de rest body.
const FIELD_RE = /^([a-z][a-z0-9_-]*):\s+(.+)$/

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const tagMatch = line.match(/^\[(.+)\]$/)
    if (tagMatch) {
      if (current) blocks.push(current)
      current = { type: tagMatch[1], heading: '', body: '', fields: {} }
    } else if (current && line) {
      const fieldMatch = line.match(FIELD_RE)
      if (fieldMatch) {
        current.fields[fieldMatch[1]] = fieldMatch[2]
      } else if (!current.heading) {
        current.heading = line
      } else {
        current.body = current.body ? `${current.body}\n${line}` : line
      }
    }
  }
  if (current) blocks.push(current)
  return blocks
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Client {
  id: string
  name: string
}

export default function DeckPlaceholderPage({ onBack }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [client, setClient] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  // Text-review modal state (sits before the slide review step)
  const [showTextReview, setShowTextReview] = useState(false)
  const [textSegments, setTextSegments] = useState<TextSegment[]>([])
  const [availableRoles, setAvailableRoles] = useState<string[]>([])

  // Review step state
  const [reviewBlocks, setReviewBlocks] = useState<ReviewBlock[]>([])
  const [showReview, setShowReview] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  // Per-block image state
  const [blockGenerating, setBlockGenerating] = useState<Record<string, boolean>>({})
  const [blockPrompts, setBlockPrompts] = useState<Record<string, { show: boolean; text: string }>>({})
  // blockImages: blockId → filesystem path, populated via native dialog (File.path unreliable in Electron)
  const [blockImages, setBlockImages] = useState<Record<string, string>>({})

  // Preview step state
  const [showPreview, setShowPreview] = useState(false)
  // Keyboard navigation for preview — registered unconditionally (hooks rule)
  useEffect(() => {
    if (!showPreview) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setPreviewSlide((s) => Math.min(reviewBlocks.length - 1, s + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setPreviewSlide((s) => Math.max(0, s - 1))
      } else if (e.key === 'Escape') {
        setShowPreview(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPreview, reviewBlocks.length])

  // PDF export: main process drives slide switching via this event
  useEffect(() => {
    function onSetSlide(e: Event) {
      setPreviewSlide((e as CustomEvent<number>).detail)
    }
    window.addEventListener('pdf:set-slide', onSetSlide)
    return () => window.removeEventListener('pdf:set-slide', onSetSlide)
  }, [])
  const [previewSlide, setPreviewSlide] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const slideContainerRef = useRef<HTMLDivElement>(null)
  const [slideScale, setSlideScale] = useState(1)
  useEffect(() => {
    const el = slideContainerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setSlideScale(entry.contentRect.width / 1920)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [showPreview])
  useEffect(() => {
    if (!exportOpen) return
    function onClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [exportOpen])
  // previewData: all data needed for WebSlidePreview
  const [previewData, setPreviewData] = useState<{
    templateData: TemplateData
    mappings: Record<string, Record<number, string>>
    bgColors: Record<string, string>
  } | null>(null)
  const [placeholderUrl, setPlaceholderUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    ;(window as any).api.readPlaceholder().then((res: { ok: boolean; dataUrl?: string }) => {
      if (res.ok && res.dataUrl) setPlaceholderUrl(res.dataUrl)
    })
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('clients')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          setClientsError('Klanten konden niet worden opgehaald.')
        } else {
          setClients(data ?? [])
        }
        setClientsLoading(false)
      })
  }, [])

  function handleFile(f: File) {
    const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`Bestandstype niet ondersteund. Gebruik: ${ALLOWED_EXTENSIONS.join(', ')}`)
      return
    }
    setFileError('')
    setFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0]
    if (chosen) handleFile(chosen)
    e.target.value = ''
  }

  // Converts labeled TextSegments → Blocks for the slide generation flow.
  // Each 'Heading' segment starts a new block; Bodycopy fills body; other roles go into fields.
  function textSegmentsToBlocks(segments: TextSegment[]): Block[] {
    const result: Block[] = []
    let current: Block | null = null
    for (const seg of segments) {
      if (!seg.role) continue
      if (seg.role === 'Heading') {
        if (current) result.push(current)
        current = { type: 'Content', heading: seg.text, body: '', fields: {} }
      } else if (seg.role === 'Bodycopy') {
        if (!current) current = { type: 'Content', heading: '', body: '', fields: {} }
        current.body = current.body ? `${current.body}\n\n${seg.text}` : seg.text
      } else {
        if (!current) current = { type: 'Content', heading: '', body: '', fields: {} }
        current.fields[seg.role] = seg.text
      }
    }
    if (current) result.push(current)
    return result
  }

  // Called when the user confirms labels in TextReviewModal → proceed to slide review.
  function handleTextReviewConfirm(labeled: TextSegment[]) {
    setShowTextReview(false)
    const blocks = textSegmentsToBlocks(labeled)
    if (blocks.length === 0) {
      setGenerateError('Geen bruikbare blokken gevonden na labeling. Voeg minimaal één Heading toe.')
      return
    }
    setReviewBlocks(blocks.map((b, i) => ({ ...b, id: `block-${i}` })))
    setShowReview(true)
  }

  // Step 1: parse the document and enter review mode
  async function handleAnalyze() {
    setGenerateError('')
    if (!file) return

    if (mode !== '2') {
      setGenerateError(`Mode ${mode === '1' ? '1 (Ruwe aantekeningen)' : '3 (Presentatie ombouwen)'} is nog niet beschikbaar.`)
      return
    }

    const text = await file.text()
    console.log('[runMode2] raw bestand (%d tekens):\n%s', text.length, text)

    // Check if tekst-review step is enabled in settings.
    const reviewEnabled = localStorage.getItem('huphe:reviewTextDocs')
    const showReviewStep = reviewEnabled === null ? true : reviewEnabled === 'true'
    console.log('[handleAnalyze] reviewEnabled:', reviewEnabled, '→ showReviewStep:', showReviewStep)

    if (showReviewStep) {
      // Parse into labeled segments and show TextReviewModal.
      const fileType = detectFileType(file.name)
      const segments = fileType === 'markdown'
        ? parseMarkdownToSegments(text)
        : parsePlainTextToSegments(text)

      // Load available sageTag roles from template_mappings (best-effort).
      let roles: string[] = ['Heading', 'Subheading', 'Bodycopy', 'Klantnaam', 'Datum']
      if (supabase && client) {
        try {
          const { data } = await supabase.from('template_mappings').select('mappings').eq('client_id', client).maybeSingle()
          const raw = (data?.mappings as any) ?? {}
          const sageTagRoles = raw['_sageTagRoles'] ?? {}
          const fromTemplate = Object.values(sageTagRoles).flatMap((v) => Object.values(v as Record<string, string>))
          if (fromTemplate.length > 0) roles = [...new Set(fromTemplate)] as string[]
        } catch {}
      }

      setAvailableRoles(roles)
      setTextSegments(segments)
      setShowTextReview(true)
      return
    }

    // Review step disabled → use existing structured parseBlocks flow.
    const parsed = parseBlocks(text)
    console.log('[runMode2] geparseerde blokken:', JSON.stringify(parsed, null, 2))

    if (parsed.length === 0) {
      setGenerateError('Geen blokken gevonden. Gebruik [Layout Naam] als tag, bijv. [Content Black].')
      return
    }

    setReviewBlocks(parsed.map((b, i) => ({ ...b, id: `block-${i}` })))
    setShowReview(true)
  }

  // Step 2: generate deck from (possibly edited) review blocks
  async function handleGenerate() {
    console.log('[handleGenerate] gestart')
    setGenerateError('')
    setGenerating(true)
    try {
      let mappings: Record<string, Record<number, string>> = {}
      let sageTagMappings: Record<string, Record<string, string>> = {}
      let itemNames: Record<string, Record<string, string>> = {}
      let imageGeometry: Record<string, Record<string, { posX: number; posY: number; width: number; height: number }>> = {}
      if (supabase) {
        const { data } = await supabase
          .from('template_mappings')
          .select('mappings')
          .eq('client_id', client)
          .maybeSingle()
        const raw = (data?.mappings as any) ?? {}
        itemNames = raw['_names'] ?? raw['_labels'] ?? {}
        imageGeometry = raw['_imageGeometry'] ?? {}
        sageTagMappings = raw['_sageTagRoles'] ?? {}
        for (const [layoutName, items] of Object.entries(raw)) {
          if (layoutName === '_labels') continue
          if (layoutName === '_order') continue
          if (layoutName === '_names') continue
          if (layoutName === '_imageGeometry') continue
          if (layoutName === '_sageTagRoles') continue
          mappings[layoutName] = {}
          for (const [idx, role] of Object.entries(items as Record<string, string>)) {
            mappings[layoutName][Number(idx)] = role
          }
        }
        console.log('[runMode2] mappings geladen:', JSON.stringify(mappings, null, 2))
        console.log('[runMode2] sageTagMappings geladen:', JSON.stringify(sageTagMappings, null, 2))
      }

      // Strip the internal `id` field and merge blockImages (native dialog paths) into each block
      const blocks = reviewBlocks.map(({ id, ...b }) => ({ ...b, imagePath: blockImages[id] || undefined }))
      console.log('[handleGenerate] blocks met imagePath:', blocks.map((b) => ({ type: b.type, imagePath: b.imagePath ?? '(geen)' })))
      const result = await (window as any).api.generateDeckStructured({ clientId: client, blocks, mappings, sageTagMappings, itemNames, imageGeometry })
      if (!result.ok) setGenerateError(result.error ?? 'Genereren mislukt.')
    } finally {
      setGenerating(false)
    }
  }

  // Step 2b: Web-based fast preview using screenshots and WebSlidePreview
  async function handlePreview() {
    setPreviewLoading(true)
    setGenerateError('')
    try {
      if (!supabase) {
        setGenerateError('Supabase niet beschikbaar.')
        return
      }

      // Fetch template_data (layout styles) and template_mappings (role aliases + bgColors) in parallel
      const [templateRes, mappingsRes] = await Promise.all([
        supabase.from('templates').select('template_data').eq('client_id', client).maybeSingle(),
        supabase.from('template_mappings').select('mappings').eq('client_id', client).maybeSingle(),
      ])

      if (!templateRes.data?.template_data) {
        setGenerateError('Geen template gevonden voor deze klant. Upload eerst een .key bestand.')
        return
      }

      const templateData = await resolveTemplateData(supabase, templateRes.data.template_data)
      if (!templateData) {
        setGenerateError('Template data kon niet geladen worden.')
        return
      }
      const raw = (mappingsRes.data?.mappings as any) ?? {}

      const bgColors: Record<string, string> = raw['_bgColors'] ?? {}
      const mappings: Record<string, Record<number, string>> = {}
      for (const [layoutName, items] of Object.entries(raw)) {
        if (['_labels', '_order', '_names', '_imageGeometry', '_textStyles', '_bgColors', '_slideDimensions'].includes(layoutName)) continue
        mappings[layoutName] = {}
        for (const [idx, role] of Object.entries(items as Record<string, string>)) {
          mappings[layoutName][Number(idx)] = role
        }
      }

      setPreviewData({ templateData, mappings, bgColors })
      setPreviewSlide(0)
      setShowPreview(true)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleExportPdf() {
    if (!previewData || !slideContainerRef.current) return
    setExportOpen(false)
    setPdfExporting(true)
    setGenerateError('')
    try {
      const r = slideContainerRef.current.getBoundingClientRect()
      const result = await (window as any).api.exportPdfScreenshots({
        count: reviewBlocks.length,
        rect: {
          x:      Math.round(r.x),
          y:      Math.round(r.y),
          width:  Math.round(r.width),
          height: Math.round(r.height),
        },
      })
      if (!result.ok && !result.canceled) {
        setGenerateError(result.error ?? 'PDF exporteren mislukt.')
      }
    } catch (err: any) {
      setGenerateError(err.message ?? 'PDF exporteren mislukt.')
    } finally {
      setPdfExporting(false)
    }
  }

  // Block field editing helpers
  function updateBlockField(id: string, fieldKey: string, value: string) {
    setReviewBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, fields: { ...b.fields, [fieldKey]: value } } : b))
    )
  }

  function updateBlockHeading(id: string, value: string) {
    setReviewBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, heading: value } : b)))
  }

  function updateBlockBody(id: string, value: string) {
    setReviewBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, body: value } : b)))
  }

  // Drag-and-drop handlers for review cards
  function handleCardDragStart(i: number) {
    dragIndexRef.current = i
    setDraggingId(reviewBlocks[i].id)
  }

  function handleCardDragEnter(i: number) {
    const from = dragIndexRef.current
    if (from === null || from === i) return
    dragIndexRef.current = i
    setReviewBlocks((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      return next
    })
  }

  function handleCardDragEnd() {
    dragIndexRef.current = null
    setDraggingId(null)
  }

  // Image helpers for Content Image blocks
  // Uses native dialog via IPC — File.path is unreliable in Electron renderer.
  async function handlePickImage(blockId: string) {
    const result = await (window as any).api.pickImage()
    if (!result?.ok || !result.filePath) return
    const filePath: string = result.filePath
    console.log('[handlePickImage] blockId:', blockId, '| filePath:', filePath)
    setBlockImages((prev) => ({ ...prev, [blockId]: filePath }))
    setReviewBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, imageUrl: `file://${filePath}` } : b))
    )
  }

  async function runImageGeneration(blockId: string, userPrompt: string) {
    setBlockGenerating((prev) => ({ ...prev, [blockId]: true }))
    try {
      // Fetch master prompt from Supabase generation_settings
      let masterPrompt = 'Professional commercial photography, clean composition, high quality, Dutch advertising style.'
      if (supabase) {
        const { data } = await supabase
          .from('generation_settings')
          .select('image_prompt')
          .eq('id', 'default')
          .maybeSingle()
        if (data?.image_prompt) masterPrompt = data.image_prompt
      }
      // Load user's chosen provider from Supabase user_settings
      let provider = 'replicate'
      if (supabase) {
        const userId = await (window as any).api.getUserId()
        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('image_provider')
          .eq('profile_id', userId)
          .maybeSingle()
        if (settingsData?.image_provider) provider = settingsData.image_provider
      }
      const combined = [masterPrompt, userPrompt].filter(Boolean).join(' ')
      console.log('[generateImage] provider:', provider, '| prompt:', combined.slice(0, 120))
      const result = await (window as any).api.generateImage(combined, provider)
      if (!result.ok) {
        console.error('[generateImage] fout:', result.error)
        return
      }
      setBlockImages((prev) => ({ ...prev, [blockId]: result.filePath }))
      setReviewBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, imageUrl: `file://${result.filePath}` } : b))
      )
    } finally {
      setBlockGenerating((prev) => ({ ...prev, [blockId]: false }))
    }
  }

  async function generateFromContent(blockId: string) {
    const block = reviewBlocks.find((b) => b.id === blockId)
    if (!block) return
    const contentPrompt = [block.fields.hoofdtekst ?? block.heading, block.fields.subtekst ?? block.body]
      .filter(Boolean).join(', ')
    await runImageGeneration(blockId, contentPrompt)
  }

  async function generateFromPrompt(blockId: string) {
    const prompt = blockPrompts[blockId]?.text?.trim()
    if (!prompt) return
    await runImageGeneration(blockId, prompt)
  }

  function togglePromptInput(blockId: string) {
    setBlockPrompts((prev) => ({
      ...prev,
      [blockId]: { show: !(prev[blockId]?.show ?? false), text: prev[blockId]?.text ?? '' },
    }))
  }

  function updatePromptText(blockId: string, text: string) {
    setBlockPrompts((prev) => ({
      ...prev,
      [blockId]: { ...prev[blockId], show: prev[blockId]?.show ?? true, text },
    }))
  }

  const canAnalyze = Boolean(file) && Boolean(client) && Boolean(mode)

  // Shared header — used in both layouts
  const sharedHeader = (
    <header
      className="shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
      style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-3 pl-20"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          id="back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </button>
        <span className="text-white/10 text-xs">/</span>
        <span className="text-white/60 text-xs">Deck</span>
      </div>
      <div
        className="flex items-center gap-2 pr-5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="w-6 h-6 bg-[#facc15] rounded-md flex items-center justify-center">
          <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />
        </div>
      </div>
    </header>
  )

  // Shared form content — used in both centered and left-panel layout
  const formContent = (
    <div className="w-full max-w-md space-y-4">
      <div className="text-center space-y-1 mb-6">
        <h1 className="text-white font-semibold text-[18px]">Genereer een deck</h1>
        <p className="text-white/35 text-sm">
          Upload een document en kies een klant om te beginnen
        </p>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        id="dropzone"
        aria-label="Dropzone voor tekstdocument"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          'relative flex flex-col items-center justify-center gap-3',
          'w-full h-44 rounded-xl border-2 border-dashed cursor-pointer',
          'outline-none focus-visible:ring-2 focus-visible:ring-[#facc15]/40',
          'transition-colors',
          isDragging
            ? 'border-[#facc15] bg-[#facc15]/[0.04]'
            : file
              ? 'border-[#facc15]/30 bg-[#141414]'
              : 'border-white/[0.10] bg-[#141414] hover:border-white/20',
        ].join(' ')}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md"
          onChange={handleInputChange}
          className="sr-only"
          aria-hidden="true"
        />

        {file ? (
          <>
            <FileIcon />
            <div className="text-center">
              <p className="text-white text-sm font-medium">{file.name}</p>
              <p className="text-white/30 text-xs mt-0.5">{formatBytes(file.size)}</p>
            </div>
            <p className="text-white/25 text-xs">Klik of sleep om te vervangen</p>
          </>
        ) : (
          <>
            <UploadIcon />
            <div className="text-center">
              <p className="text-white/55 text-sm">Sleep een bestand hierheen</p>
              <p className="text-white/30 text-xs mt-1">.txt · .md</p>
            </div>
          </>
        )}
      </div>

      {/* Mode selector */}
      {file && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-white/50 uppercase tracking-widest">
            Modus
          </p>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const selected = mode === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={[
                    'flex flex-col items-start gap-2.5 rounded-xl p-3.5 text-left border transition-colors',
                    selected
                      ? 'bg-[#facc15]/[0.06] border-[#facc15]/40'
                      : 'bg-[#141414] border-white/[0.07] hover:border-white/[0.14]',
                  ].join(' ')}
                >
                  <span className={selected ? 'text-[#facc15]' : 'text-white/30'}>
                    {m.icon}
                  </span>
                  <div>
                    <p className={['text-xs font-medium leading-snug', selected ? 'text-white' : 'text-white/60'].join(' ')}>
                      {m.label}
                    </p>
                    <p className="text-white/25 text-[11px] leading-snug mt-0.5">
                      {m.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* File error */}
      {fileError && (
        <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
          {fileError}
        </p>
      )}

      {/* Client dropdown */}
      <div className="space-y-1.5">
        <label
          htmlFor="client-select"
          className="block text-[11px] font-medium text-white/50 uppercase tracking-widest"
        >
          Klant
        </label>
        <div className="relative">
          <select
            id="client-select"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className={[
              'w-full appearance-none bg-[#141414] border rounded-lg px-4 py-2.5',
              'text-sm transition-colors outline-none cursor-pointer',
              'focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20',
              client ? 'text-white border-white/[0.08]' : 'text-white/30 border-white/[0.08]',
            ].join(' ')}
          >
            <option value="" disabled>
              {clientsLoading ? 'Laden…' : clientsError ? 'Fout bij laden' : 'Kies een klant…'}
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} className="text-white bg-[#1a1a1a]">
                {c.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Analyse button — fades into background once review is open */}
      <button
        id="generate-btn"
        onClick={handleAnalyze}
        disabled={!canAnalyze || showReview}
        className={[
          'w-full font-semibold rounded-lg px-4 py-3 text-sm transition-colors mt-2',
          showReview
            ? 'bg-[#141414] text-white/20 cursor-not-allowed border border-white/[0.05]'
            : 'bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-25 disabled:cursor-not-allowed text-black',
        ].join(' ')}
      >
        Analyseer
      </button>

      {/* Error */}
      {generateError && !showReview && (
        <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
          {generateError}
        </p>
      )}

      {/* Hint */}
      {!canAnalyze && (
        <p className="text-center text-white/20 text-xs">
          {!file && !client
            ? 'Upload een document en kies een klant'
            : !file
              ? 'Upload nog een document'
              : !client
                ? 'Kies nog een klant'
                : 'Kies een modus'}
        </p>
      )}
    </div>
  )

  // ── Preview loading screen ─────────────────────────────────────────────
  if (previewLoading) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
        {sharedHeader}
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-8 h-8 border-2 border-white/10 border-t-[#facc15] rounded-full animate-spin" />
          <div className="text-center space-y-1.5">
            <p className="text-white/60 text-sm font-medium">Preview aanmaken via Keynote…</p>
            <p className="text-white/25 text-xs">Slides worden gegenereerd en geëxporteerd, dit duurt ~30–60 seconden</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Preview mode ────────────────────────────────────────────────────────
  if (showPreview && previewData) {
    const block = reviewBlocks[previewSlide]

    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">

        {/* PDF export spinner — covers the full view while slides are captured */}
        {pdfExporting && <ExportSpinner />}

        {/* Header */}
        <header
          className="shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
          style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
        >
          <div className="flex items-center gap-3 pl-20" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setShowPreview(false)}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Terug naar bewerken
            </button>
          </div>
          <div className="flex items-center gap-3 pr-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <span className="text-white/30 text-xs tabular-nums">
              {previewSlide + 1} / {reviewBlocks.length}
            </span>
            <div className="w-6 h-6 bg-[#facc15] rounded-md flex items-center justify-center">
              <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />
            </div>
          </div>
        </header>

        {/* Slide area */}
        <div className="flex-1 flex items-center justify-center gap-3 px-6 py-6 overflow-hidden">

          {/* Prev arrow */}
          <button
            onClick={() => setPreviewSlide((s) => Math.max(0, s - 1))}
            disabled={previewSlide === 0}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.05] hover:bg-white/[0.10] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Slide + dots */}
          <div className="flex flex-col items-center gap-4 flex-1 min-w-0">

            {/* Slide container — scales 1920×1080 WebSlidePreview to fit available width */}
            <div
              ref={slideContainerRef}
              className="relative w-full overflow-hidden rounded-xl shadow-2xl shadow-black/60 bg-black"
              style={{ aspectRatio: '16/9' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 1920,
                  height: 1080,
                  transformOrigin: 'top left',
                  transform: `scale(${slideScale})`,
                }}
              >
                <WebSlidePreview
                  block={block}
                  templateData={previewData.templateData}
                  mappings={previewData.mappings}
                  bgColors={previewData.bgColors}
                  imagePlaceholderUrl={block.type === 'Content Image' ? placeholderUrl : undefined}
                />
              </div>

              {/* Layout label overlay */}
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/40 text-white/40 text-[10px] tracking-wide z-50 pointer-events-none">
                {block?.type}
              </div>
            </div>

            {/* Dots navigation */}
            <div className="flex items-center gap-1.5">
              {reviewBlocks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPreviewSlide(i)}
                  className={[
                    'rounded-full transition-all',
                    i === previewSlide
                      ? 'w-4 h-1.5 bg-[#facc15]'
                      : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40',
                  ].join(' ')}
                />
              ))}
            </div>

          </div>

          {/* Next arrow */}
          <button
            onClick={() => setPreviewSlide((s) => Math.min(reviewBlocks.length - 1, s + 1))}
            disabled={previewSlide === reviewBlocks.length - 1}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.05] hover:bg-white/[0.10] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

        </div>

        {/* Footer: Export button with dropdown */}
        <div className="shrink-0 border-t border-white/[0.07] bg-[#070707] p-4 flex flex-col items-center gap-3">
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen((o) => !o)}
              disabled={generating}
              className="flex items-center gap-2 bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-25 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
            >
              {generating ? 'Exporteren…' : 'Exporteer'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {exportOpen && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-44 bg-[#1a1a1a] border border-white/[0.10] rounded-xl shadow-2xl overflow-hidden z-50">
                <button
                  onClick={() => { setExportOpen(false); handleGenerate() }}
                  disabled={generating}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                  Keynote
                </button>
                <div className="h-px bg-white/[0.06]" />
                <button
                  disabled
                  title="Binnenkort beschikbaar"
                  className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-sm text-white/25 cursor-not-allowed"
                >
                  <span className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    Website
                  </span>
                  <span className="text-[10px] text-white/20 bg-white/[0.06] rounded px-1.5 py-0.5">binnenkort</span>
                </button>
                <div className="h-px bg-white/[0.06]" />
                <button
                  onClick={handleExportPdf}
                  disabled={pdfExporting}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {pdfExporting ? 'PDF maken…' : 'PDF'}
                </button>
              </div>
            )}
          </div>

          {generateError && (
            <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5 max-w-md text-center">
              {generateError}
            </p>
          )}
        </div>

      </div>
    )
  }

  // ── Text-review modal (sits before slide review) ───────────────────────────
  if (showTextReview) {
    return (
      <TextReviewModal
        segments={textSegments}
        availableRoles={availableRoles}
        onConfirm={handleTextReviewConfirm}
        onCancel={() => setShowTextReview(false)}
      />
    )
  }

  // ── Split layout (review mode) ──────────────────────────────────────────────
  if (showReview) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">

        {sharedHeader}

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel: existing form — disabled while review is open */}
          <div className="w-[400px] shrink-0 border-r border-white/[0.07] overflow-y-auto flex flex-col items-center py-8 px-6 opacity-35 pointer-events-none select-none">
            {formContent}
          </div>

          {/* Right panel: review cards */}
          <div className="flex-1 bg-[#070707] flex flex-col overflow-hidden">

            {/* Scrollable cards area */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 max-w-2xl mx-auto">
                {/* Panel header */}
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-white font-semibold text-sm flex-1">
                    {reviewBlocks.length} blok{reviewBlocks.length !== 1 ? 'ken' : ''} gevonden
                  </h2>
                  <span className="text-white/25 text-xs">Sleep om te herordenen</span>
                  {/* Close button */}
                  <button
                    onClick={() => setShowReview(false)}
                    className="flex items-center justify-center w-6 h-6 rounded-md bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] transition-colors"
                    aria-label="Sluit review paneel"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="black" strokeWidth="1.75" strokeLinecap="round">
                      <line x1="1" y1="1" x2="9" y2="9" />
                      <line x1="9" y1="1" x2="1" y2="9" />
                    </svg>
                  </button>
                </div>

                {/* Block cards */}
                <div className="flex flex-col gap-2">
                  {reviewBlocks.map((block, i) => (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={() => handleCardDragStart(i)}
                      onDragEnter={() => handleCardDragEnter(i)}
                      onDragEnd={handleCardDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={[
                        'bg-[#141414] border rounded-xl overflow-hidden transition-opacity select-none',
                        draggingId === block.id
                          ? 'opacity-40 border-white/[0.15]'
                          : 'border-white/[0.08]',
                      ].join(' ')}
                    >
                      {/* Card header */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-[#1a1a1a] cursor-grab active:cursor-grabbing">
                        <GripIcon />
                        <span className="text-white/70 text-xs font-medium flex-1">{block.type}</span>
                        <span className="text-white/20 text-xs tabular-nums">{i + 1}</span>
                      </div>

                      {/* Card body — split for Content Image, full-width for all others */}
                      <div className={block.type === 'Content Image' ? 'flex' : ''}>

                        {/* Text fields */}
                        <div className="flex-1 p-4 flex flex-col gap-3">
                          {Object.keys(block.fields).length > 0 ? (
                            Object.entries(block.fields).map(([key, val]) => (
                              <div key={key} className="flex flex-col gap-1">
                                <label className="text-white/35 text-[10px] uppercase tracking-widest font-medium">
                                  {key}
                                </label>
                                <textarea
                                  value={val}
                                  onChange={(e) => updateBlockField(block.id, key, e.target.value)}
                                  rows={Math.max(key === 'subtekst' ? 4 : 1, val.split('\n').length)}
                                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm resize-none outline-none focus:border-[#facc15]/40 focus:ring-1 focus:ring-[#facc15]/15 transition-colors"
                                />
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="flex flex-col gap-1">
                                <label className="text-white/35 text-[10px] uppercase tracking-widest font-medium">
                                  hoofdtekst
                                </label>
                                <textarea
                                  value={block.heading}
                                  onChange={(e) => updateBlockHeading(block.id, e.target.value)}
                                  rows={Math.max(1, block.heading.split('\n').length)}
                                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm resize-none outline-none focus:border-[#facc15]/40 focus:ring-1 focus:ring-[#facc15]/15 transition-colors"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-white/35 text-[10px] uppercase tracking-widest font-medium">
                                  subtekst
                                </label>
                                <textarea
                                  value={block.body}
                                  onChange={(e) => updateBlockBody(block.id, e.target.value)}
                                  rows={Math.max(4, block.body.split('\n').length)}
                                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm resize-none outline-none focus:border-[#facc15]/40 focus:ring-1 focus:ring-[#facc15]/15 transition-colors"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {/* Image panel — only for Content Image */}
                        {block.type === 'Content Image' && (
                          <div className="w-48 shrink-0 border-l border-white/[0.06] p-3 flex flex-col gap-2">

                            {/* Image preview */}
                            <div className="w-full aspect-video rounded-lg overflow-hidden bg-[#0a0a0a] border border-white/[0.06] flex items-center justify-center">
                              {block.imageUrl ? (
                                <img src={block.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                // Default placeholder — swap src for actual Supabase URL when available
                                <div className="flex flex-col items-center gap-1.5">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                  <span className="text-white/15 text-[10px]">Geen afbeelding</span>
                                </div>
                              )}
                            </div>

                            {/* Action buttons */}
                            <button
                              onClick={() => handlePickImage(block.id)}
                              className="w-full text-left px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-white/60 hover:text-white/80 text-[11px] transition-colors"
                            >
                              Vervang beeld
                            </button>

                            <button
                              onClick={() => generateFromContent(block.id)}
                              disabled={blockGenerating[block.id]}
                              className="w-full text-left px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-white/60 hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] transition-colors"
                            >
                              {blockGenerating[block.id] ? 'Genereren…' : 'Genereer op basis van inhoud'}
                            </button>

                            <button
                              onClick={() => togglePromptInput(block.id)}
                              className={[
                                'w-full text-left px-2.5 py-1.5 rounded-md border text-[11px] transition-colors',
                                blockPrompts[block.id]?.show
                                  ? 'bg-[#facc15]/[0.08] border-[#facc15]/30 text-[#facc15]/80'
                                  : 'bg-white/[0.04] hover:bg-white/[0.07] border-white/[0.06] text-white/60 hover:text-white/80',
                              ].join(' ')}
                            >
                              Genereer zelf
                            </button>

                            {/* Custom prompt input */}
                            {blockPrompts[block.id]?.show && (
                              <div className="flex flex-col gap-1.5">
                                <textarea
                                  value={blockPrompts[block.id]?.text ?? ''}
                                  onChange={(e) => updatePromptText(block.id, e.target.value)}
                                  placeholder="Beschrijf het gewenste beeld…"
                                  rows={3}
                                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-lg px-2.5 py-2 text-white text-[11px] resize-none outline-none focus:border-[#facc15]/40 focus:ring-1 focus:ring-[#facc15]/15 transition-colors placeholder:text-white/20"
                                />
                                <button
                                  onClick={() => generateFromPrompt(block.id)}
                                  disabled={!blockPrompts[block.id]?.text?.trim() || blockGenerating[block.id]}
                                  className="w-full bg-[#facc15] hover:bg-[#fde047] disabled:opacity-25 disabled:cursor-not-allowed text-black font-semibold rounded-md px-2.5 py-1.5 text-[11px] transition-colors"
                                >
                                  {blockGenerating[block.id] ? 'Genereren…' : 'Genereer'}
                                </button>
                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sticky footer: Preview button */}
            <div className="shrink-0 border-t border-white/[0.07] bg-[#070707] p-4">
              <div className="max-w-2xl mx-auto space-y-3">
                <button
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-25 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-3 text-sm transition-colors"
                >
                  {previewLoading ? 'Laden…' : 'Preview'}
                </button>
                {generateError && (
                  <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
                    {generateError}
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    )
  }

  // ── Centered layout (default) ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {sharedHeader}
      <main className="flex-1 flex items-center justify-center px-8">
        {!file ? (
          <div className="w-full max-w-lg flex flex-col gap-3">
            <div
              role="button"
              tabIndex={0}
              id="dropzone"
              aria-label="Dropzone voor tekstdocument"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={[
                'relative flex flex-col items-center justify-center gap-4',
                'w-full h-72 rounded-2xl border-2 border-dashed cursor-pointer',
                'outline-none focus-visible:ring-2 focus-visible:ring-[#facc15]/40',
                'transition-colors',
                isDragging
                  ? 'border-[#facc15] bg-[#facc15]/[0.04]'
                  : 'border-white/[0.10] bg-[#141414] hover:border-white/20',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                onChange={handleInputChange}
                className="sr-only"
                aria-hidden="true"
              />
              <UploadIcon />
              <div className="text-center">
                <p className="text-white/55 text-sm">Sleep een bestand hierheen</p>
                <p className="text-white/30 text-xs mt-1">.txt · .md</p>
              </div>
            </div>
            {fileError && (
              <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
                {fileError}
              </p>
            )}
          </div>
        ) : (
          formContent
        )}
      </main>
    </div>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      {[3, 8, 13].flatMap((cy) =>
        [5, 11].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.25" fill="rgba(255,255,255,0.25)" />
        ))
      )}
    </svg>
  )
}

function FileIcon() {
  return (
    <div className="w-11 h-11 bg-[#facc15]/10 rounded-xl flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    </div>
  )
}

function UploadIcon() {
  return (
    <div className="w-11 h-11 bg-white/[0.04] rounded-xl flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16" />
        <line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      </svg>
    </div>
  )
}

// ── PDF export overlay ───────────────────────────────────────────────────────

function ExportSpinner() {
  return (
    <div
      id="pdf-spinner"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <style>{`
        @keyframes huphe-spin {
          0%   { transform: rotate(0deg); }
          45%  { transform: rotate(180deg); }
          65%  { transform: rotate(180deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <img
        src={spinner}
        alt=""
        style={{ width: 40, height: 40, animation: 'huphe-spin 1.2s ease-in-out infinite' }}
      />
    </div>
  )
}
