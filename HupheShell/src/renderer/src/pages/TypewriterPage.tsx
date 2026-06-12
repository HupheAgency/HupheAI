import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  archiveTypewriterDocument,
  createTypewriterDocument,
  getLastActiveDocId,
  loadTypewriterDocuments,
  saveLastActiveDocId,
  upsertTypewriterDocument,
  type TypewriterDocument,
  type TypewriterLinkRole,
} from '../lib/typewriter-documents'
import { archiveCopyBlock, upsertCopyBlock } from '../lib/copy-library'
import { supabase } from '../lib/supabase'
import { fetchDocumentsFromSupabase, fetchDocumentById, pushAllDocumentsToSupabase, pushDocumentToSupabase } from '../lib/typewriter-sync'
import { useLiveDocument } from '../hooks/useLiveDocument'
import { loadBannerProjects, loadPrintProjects } from '../lib/atelier-project-store'
import { loadAtelierMediaProjects } from '../hooks/useAtelierMedia'
import { IcoPanelToggle } from '../components/Icons'
import { PanelTabBar, RIGHT_PANEL_STYLE } from '../components/RightPanelShell'
import { sanitizeHtml } from '../lib/html-sanitize'

type RightTab = 'edit' | 'files'
type ContextMenuState = { x: number; y: number; text: string } | null
type PendingLink = { text: string } | null
type TypewriterLinkTarget = {
  id: string
  label: string
  description: string
  type: 'document' | 'banners' | 'print' | 'images' | 'video'
  rawId: string
}

const ROLE_LABELS: Record<TypewriterLinkRole, string> = {
  'banner-heading': 'Banner heading',
  'banner-subheading': 'Banner subheading',
  'banner-button': 'Banner button',
  'banner-body': 'Banner body',
  'print-title': 'Print header',
  'print-body': 'Print bodycopy',
  'print-cta': 'Print CTA',
  'document-text': 'Gekoppelde tekst',
}

const LINK_ROLE_OPTIONS: Array<{ value: TypewriterLinkRole; label: string }> = [
  { value: 'document-text', label: 'Kies tekstvlak' },
  { value: 'print-title', label: 'Print header' },
  { value: 'print-body', label: 'Print bodycopy' },
  { value: 'print-cta', label: 'Print CTA' },
  { value: 'banner-heading', label: 'Banner heading' },
  { value: 'banner-subheading', label: 'Banner subheading' },
  { value: 'banner-button', label: 'Banner button' },
]

function linkRoleOptionsForSelection(selection: TypewriterDocument['linkedSelections'][number]): Array<{ value: TypewriterLinkRole; label: string }> {
  if (selection.targetProjectType === 'print') {
    return LINK_ROLE_OPTIONS.filter((option) => ['document-text', 'print-title', 'print-body', 'print-cta'].includes(option.value))
  }
  if (selection.targetProjectType === 'banners') {
    return LINK_ROLE_OPTIONS.filter((option) => ['document-text', 'banner-heading', 'banner-subheading', 'banner-button', 'banner-body'].includes(option.value))
  }
  return LINK_ROLE_OPTIONS.filter((option) => option.value === 'document-text')
}

const RIGHT_PANEL_MIN_WIDTH = 230
const RIGHT_PANEL_MAX_WIDTH = 460
const RIGHT_PANEL_CONTENT_MIN_WIDTH = 230
const RIGHT_PANEL_DEFAULT_WIDTH = 345
// Width of the narrow strip shown when the panel is collapsed (matches Engine w-14 = 56px)
const RIGHT_PANEL_COLLAPSED_WIDTH = 56
const TYPEWRITER_SELECTION_HIGHLIGHT = 'typewriter-toolbar-selection'

function makeInitialDocuments(): TypewriterDocument[] {
  return loadTypewriterDocuments()
}


function textPreviewFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface Props {
  joinDocId?: string
}

export default function TypewriterPage({ joinDocId }: Props) {
  const [documents, setDocuments] = useState<TypewriterDocument[]>(makeInitialDocuments)
  const [activeId, setActiveId] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [status, setStatus] = useState('')
  const [rightTab, setRightTab] = useState<RightTab>('edit')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH)
  const [rightPanelResizing, setRightPanelResizing] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [pendingLink, setPendingLink] = useState<PendingLink>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [syncIndicator, setSyncIndicator] = useState<'idle' | 'syncing' | 'live'>('idle')
  const [docIsLive, setDocIsLive] = useState(false)
  const [docShareCode, setDocShareCode] = useState<string | null>(null)
  const [goingLive, setGoingLive] = useState(false)
  const [openDocIds, setOpenDocIds] = useState<string[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const documentsRef = useRef<TypewriterDocument[]>(documents)
  const activeIdRef = useRef(activeId)
  const rightPanelWidthRef = useRef(rightPanelWidth)
  const editorSelectionRef = useRef<Range | null>(null)
  const freshDocCreatedRef = useRef(false)

  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth }, [rightPanelWidth])

  // Open the document the user clicked on (set by AppShell via saveLastActiveDocId),
  // or fall back to a fresh blank document if no target is known.
  useEffect(() => {
    if (freshDocCreatedRef.current) return
    freshDocCreatedRef.current = true
    const targetId = getLastActiveDocId()
    const target = targetId ? documents.find((d) => d.id === targetId && !d.deletedAt) : null
    if (target) {
      setOpenDocIds([target.id])
      setActiveId(target.id)
    } else {
      createDocument()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof document === 'undefined') return
    const style = document.createElement('style')
    style.textContent = `::highlight(${TYPEWRITER_SELECTION_HIGHLIGHT}) { background: rgba(250, 204, 21, 0.34); color: inherit; }`
    document.head.appendChild(style)
    return () => {
      ;(CSS as any).highlights?.delete(TYPEWRITER_SELECTION_HIGHLIGHT)
      style.remove()
    }
  }, [])

  const startRightPanelResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setRightPanelResizing(true)
    setRightPanelOpen(true)
    const startX = event.clientX
    const startWidth = rightPanelWidthRef.current

    function handleMouseMove(moveEvent: MouseEvent) {
      const unconstrainedWidth = startWidth - (moveEvent.clientX - startX)
      
      if (unconstrainedWidth < 150) {
        setRightPanelOpen(false)
        rightPanelWidthRef.current = RIGHT_PANEL_COLLAPSED_WIDTH
      } else {
        setRightPanelOpen(true)
        const nextWidth = Math.max(
          RIGHT_PANEL_MIN_WIDTH,
          Math.min(RIGHT_PANEL_MAX_WIDTH, unconstrainedWidth),
        )
        rightPanelWidthRef.current = nextWidth
        setRightPanelWidth(nextWidth)
      }
    }

    function handleMouseUp() {
      setRightPanelResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  // Haal user ID op voor Supabase sync
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (data.user) setOwnerId(data.user.id)
    })
  }, [])

  // Onthoud het actieve document over navigaties heen
  useEffect(() => {
    if (activeId) saveLastActiveDocId(activeId)
  }, [activeId])

  // Joined doc laden wanneer via code deelgenomen
  useEffect(() => {
    if (!joinDocId) return
    fetchDocumentById(joinDocId).then((doc) => {
      if (!doc) return
      upsertTypewriterDocument(doc)
      const all = loadTypewriterDocuments().filter((d) => !d.deletedAt)
      syncDocuments(all, joinDocId)
    })
  }, [joinDocId])

  // Live-status ophalen bij actief document (wacht op auth, race-condition safe)
  useEffect(() => {
    if (!activeId || !ownerId || !supabase) return
    let cancelled = false

    // Sync UI direct met lokale cache zodat de vorige status niet blijft hangen
    const cachedDoc = documentsRef.current.find((d) => d.id === activeId)
    setDocIsLive(cachedDoc?.isLive ?? false)
    setDocShareCode(cachedDoc?.shareCode ?? null)

    supabase
      .from('typewriter_documents')
      .select('is_live, share_code')
      .eq('id', activeId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[Typewriter] live-status fetch:', error.message); return }
        const isLive: boolean = (data as any)?.is_live ?? false
        const shareCode: string | null = (data as any)?.share_code ?? null
        setDocIsLive(isLive)
        setDocShareCode(shareCode)
        const doc = documentsRef.current.find((d) => d.id === activeId)
        if (doc && (doc.isLive !== isLive || doc.shareCode !== (shareCode ?? undefined))) {
          upsertTypewriterDocument({ ...doc, isLive, shareCode: shareCode ?? undefined })
        }
      })
    return () => { cancelled = true }
  }, [activeId, ownerId])

  // Eerste sync: haal documenten op uit Supabase en merge met lokaal
  useEffect(() => {
    if (!ownerId) return
    setSyncIndicator('syncing')
    fetchDocumentsFromSupabase(ownerId).then((remote) => {
      if (remote.length === 0) {
        const local = loadTypewriterDocuments()
        if (local.length > 0) pushAllDocumentsToSupabase(local, ownerId)
      } else {
        const local = loadTypewriterDocuments({ includeArchived: true })
        const merged = new Map<string, TypewriterDocument>()
        local.forEach((d) => merged.set(d.id, d))
        remote.forEach((r) => {
          const existing = merged.get(r.id)
          const localArchivedButRemoteNot = !!(existing?.deletedAt && !r.deletedAt)
          if (!existing || r.updatedAt > existing.updatedAt || localArchivedButRemoteNot) {
            upsertTypewriterDocument(r)
            merged.set(r.id, r)
          }
        })
        const afterMerge = loadTypewriterDocuments()
        if (afterMerge.length === 0) {
          const restorable = remote.filter((r) => !r.deletedAt)
          syncDocuments(restorable)
        } else {
          syncDocuments(afterMerge)
        }
      }
      setSyncIndicator('live')
    })
  }, [ownerId])

  // Live document hook: Realtime channel voor samenwerken
  const handleRemoteUpdate = useCallback((update: { id: string; content: string; title: string; updatedAt: string }) => {
    const current = documentsRef.current.find((d) => d.id === update.id)
    if (!current) return
    if (update.updatedAt <= current.updatedAt) return
    const updated = { ...current, content: update.content, title: update.title, updatedAt: update.updatedAt }
    upsertTypewriterDocument(updated)
    syncDocuments(
      loadTypewriterDocuments(),
      activeIdRef.current,
    )
    // Update editor als dit het actieve document is
    if (update.id === activeIdRef.current && editorRef.current) {
      const sel = window.getSelection()
      const hadFocus = document.activeElement === editorRef.current
      editorRef.current.innerHTML = sanitizeHtml(update.content)
      if (hadFocus && sel) editorRef.current.focus()
    }
  }, [])

  const { syncDocument } = useLiveDocument(activeId, ownerId, handleRemoteUpdate)

  useEffect(() => {
    if (!editorRef.current) return
    if (activeId === activeIdRef.current && editorRef.current.innerHTML !== '') return
    activeIdRef.current = activeId
    editorRef.current.innerHTML = sanitizeHtml(activeDocument?.content ?? '')
    editorRef.current.focus()
  }, [activeId])

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId) ?? (activeId ? documents[0] : undefined),
    [activeId, documents],
  )

  function syncDocuments(nextDocuments: TypewriterDocument[], nextActiveId = activeId) {
    const visible = nextDocuments.filter((document) => !document.deletedAt)
    const currentActive = documentsRef.current.find((document) => document.id === nextActiveId)
    const shouldKeepUnsavedActive = currentActive && !currentActive.deletedAt && !visible.some((document) => document.id === currentActive.id)
    const mergedVisible = shouldKeepUnsavedActive ? [currentActive, ...visible] : visible
    documentsRef.current = mergedVisible
    setDocuments(mergedVisible)
    setActiveId(mergedVisible.some((document) => document.id === nextActiveId) ? nextActiveId : mergedVisible[0]?.id ?? '')
  }

  function persistDocument(nextDocument: TypewriterDocument) {
    const nextDocuments = upsertTypewriterDocument(nextDocument).filter((document) => !document.deletedAt)
    syncDocuments(nextDocuments, nextDocument.id)
    setStatus('Opgeslagen')
    syncDocument(nextDocument)
  }

  function getCurrentActiveDocument(): TypewriterDocument | undefined {
    return documentsRef.current.find((document) => document.id === activeId) ?? activeDocument
  }

  function updateActiveDocument(patch: Partial<TypewriterDocument>) {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument) return
    persistDocument({ ...currentDocument, ...patch })
  }

  function createDocument() {
    saveEditorContent()
    const document = createTypewriterDocument()
    const nextDocuments = [document, ...documentsRef.current.filter((item) => !item.deletedAt)]
    documentsRef.current = nextDocuments
    setDocuments(nextDocuments)
    setActiveId(document.id)
    setOpenDocIds((prev) => [...prev, document.id])
    setSelectedText('')
    setStatus('Nieuw document')
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  function closeTab(docId: string) {
    setOpenDocIds((prev) => {
      const next = prev.filter((id) => id !== docId)
      if (next.length === 0) {
        // Will create a new doc — defer so state settles
        requestAnimationFrame(() => createDocument())
        return prev
      }
      if (activeId === docId) {
        const idx = prev.indexOf(docId)
        const nextActive = next[Math.min(idx, next.length - 1)]
        setActiveId(nextActive)
      }
      return next
    })
  }

  function archiveActiveDocument() {
    if (!activeDocument || documents.length <= 1) return
    const nextDocuments = archiveTypewriterDocument(activeDocument.id).filter((document) => !document.deletedAt)
    syncDocuments(nextDocuments)
    setSelectedText('')
    setStatus('Document gearchiveerd')
  }

  function getEditorSelectionText(): string {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return ''
    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) return ''
    return selection.toString().trim()
  }

  function clearEditorSelectionHighlight() {
    ;(CSS as any).highlights?.delete(TYPEWRITER_SELECTION_HIGHLIGHT)
  }

  function updateEditorSelectionHighlight(range: Range | null) {
    if (!range || range.collapsed || !editorRef.current) {
      clearEditorSelectionHighlight()
      return
    }
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      clearEditorSelectionHighlight()
      return
    }
    const HighlightCtor = (window as any).Highlight
    const highlights = (CSS as any).highlights
    if (!HighlightCtor || !highlights) return
    highlights.set(TYPEWRITER_SELECTION_HIGHLIGHT, new HighlightCtor(range.cloneRange()))
  }

  function saveEditorSelection() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return
    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) return
    editorSelectionRef.current = range.cloneRange()
    updateEditorSelectionHighlight(range)
  }

  function restoreEditorSelection(): boolean {
    const range = editorSelectionRef.current
    if (!range || !editorRef.current) return false
    if (!editorRef.current.contains(range.commonAncestorContainer)) return false
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }

  function refreshSelection() {
    saveEditorSelection()
    const text = getEditorSelectionText()
    if (!text) clearEditorSelectionHighlight()
    setSelectedText((current) => (current === text ? current : text))
    const activeCommandFormats = ['bold', 'italic', 'underline', 'strikeThrough',
      'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
      'insertUnorderedList', 'insertOrderedList',
      'superscript', 'subscript']
      .filter((cmd) => { try { return document.queryCommandState(cmd) } catch { return false } })
    const bgColor = (() => { try { return document.queryCommandValue('backColor') } catch { return '' } })()
    const hasHighlight = !!(bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'rgb(255, 255, 255)')
    setActiveFormats(new Set([...activeCommandFormats, ...(hasHighlight ? ['highlight'] : [])]))
  }

  function saveEditorContent() {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument || !editorRef.current) return
    const rawText = editorRef.current.innerText.trim()
    if (!rawText) return
    const autoTitle =
      currentDocument.title === 'Nieuw tekstdocument' && rawText
        ? rawText.split('\n')[0].slice(0, 60) || 'Nieuw tekstdocument'
        : currentDocument.title
    const updated = { ...currentDocument, title: autoTitle, content: sanitizeHtml(editorRef.current.innerHTML), updatedAt: new Date().toISOString() }
    const nextDocuments = upsertTypewriterDocument(updated).filter((document) => !document.deletedAt)
    documentsRef.current = nextDocuments
    setDocuments(nextDocuments)
    setStatus('Opgeslagen')
    syncDocument(updated)
  }

  function applyFormat(command: string, value?: string) {
    editorRef.current?.focus()
    restoreEditorSelection()
    if (command === 'fontSizePx' && value && editorRef.current) {
      document.execCommand('fontSize', false, '7')
      editorRef.current.querySelectorAll('font[size="7"]').forEach((fontEl) => {
        const span = document.createElement('span')
        span.style.fontSize = value
        span.innerHTML = sanitizeHtml(fontEl.innerHTML)
        fontEl.replaceWith(span)
      })
    } else if (command === 'lineHeight' && value && editorRef.current) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const node = sel.getRangeAt(0).commonAncestorContainer
        const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as Element | null
        const block = el?.closest('p, h1, h2, h3, h4, h5, h6, blockquote, li, div')
        if (block) (block as HTMLElement).style.lineHeight = value
      }
    } else if (command === 'letterSpacingEm' && value && editorRef.current) {
      document.execCommand('fontSize', false, '7')
      editorRef.current.querySelectorAll('font[size="7"]').forEach((fontEl) => {
        const span = document.createElement('span')
        span.style.letterSpacing = value
        span.innerHTML = sanitizeHtml(fontEl.innerHTML)
        fontEl.replaceWith(span)
      })
    } else if (command === 'highlight') {
      // Use native backColor so Cmd+Z works correctly as a single undo step
      const current = document.queryCommandValue('backColor')
      const hasHighlight = current && current !== 'rgba(0, 0, 0, 0)' && current !== 'rgb(255, 255, 255)'
      if (hasHighlight) {
        document.execCommand('backColor', false, 'rgba(0,0,0,0)')
      } else {
        document.execCommand('backColor', false, value ?? '#facc15')
      }
    } else {
      document.execCommand(command, false, value)
    }
    saveEditorContent()
    refreshSelection()
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const text = getEditorSelectionText()
    if (!text) return
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, text })
  }

  async function handleGoLive() {
    if (!supabase || !activeId || !ownerId || goingLive) return
    setGoingLive(true)
    try {
      const currentDoc = getCurrentActiveDocument()
      if (currentDoc) await pushDocumentToSupabase(currentDoc, ownerId)
      const { data, error } = await supabase.rpc('set_typewriter_doc_live', { p_doc_id: activeId })
      if (!error && data) {
        setDocIsLive(true)
        setDocShareCode(data as string)
        setStatus('Document is nu live')
        const liveDoc = getCurrentActiveDocument()
        if (liveDoc) upsertTypewriterDocument({ ...liveDoc, isLive: true, shareCode: data as string })
      } else {
        setStatus('Live zetten mislukt')
        console.error('[Typewriter] handleGoLive RPC error:', error?.message)
      }
    } catch (err: any) {
      setStatus('Live zetten mislukt')
      console.error('[Typewriter] handleGoLive:', err?.message)
    }
    setGoingLive(false)
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const html = event.clipboardData.getData('text/html')
    const plain = event.clipboardData.getData('text/plain')
    let insert: string
    if (html) {
      insert = sanitizeClipboardHtml(html)
    } else if (plain) {
      insert = plain
        .split(/\r?\n/)
        .map((line) => line ? `<p>${encodeTextEntities(line)}</p>` : '')
        .join('')
    } else {
      return
    }
    if (!insert) return
    document.execCommand('insertHTML', false, insert)
    saveEditorContent()
  }

  function startTextLink(text: string) {
    setPendingLink({ text })
    setSelectedText(text)
    setRightTab('files')
    setContextMenu(null)
    setStatus('Sleep de koppeling naar een live document')
  }

  const linkTargets = useMemo<TypewriterLinkTarget[]>(() => {
    const otherDocuments = documents
      .filter((document) => document.id !== activeDocument?.id)
      .map<TypewriterLinkTarget>((document) => ({
        id: `document:${document.id}`,
        rawId: document.id,
        type: 'document',
        label: document.title || 'Naamloos tekstdocument',
        description: textPreviewFromHtml(document.content) || 'Tekstdocument',
      }))
    const printProjects = loadPrintProjects().map<TypewriterLinkTarget>((project) => ({
      id: `print:${project.id}`,
      rawId: project.id,
      type: 'print',
      label: project.name || project.title || 'Print advertentie',
      description: 'Print advertentie',
    }))
    const bannerProjects = loadBannerProjects().map<TypewriterLinkTarget>((project) => ({
      id: `banners:${project.id}`,
      rawId: project.id,
      type: 'banners',
      label: project.name || 'Bannerset',
      description: 'Bannerset',
    }))
    const mediaProjects = loadAtelierMediaProjects().map<TypewriterLinkTarget>((project) => ({
      id: `${project.type}:${project.id}`,
      rawId: project.id,
      type: project.type,
      label: project.title || (project.type === 'video' ? 'Video project' : 'Media project'),
      description: project.type === 'video' ? 'Video project' : 'Media project',
    }))
    return [...printProjects, ...bannerProjects, ...mediaProjects, ...otherDocuments]
  }, [activeDocument?.id, documents])

  function linkTextToTarget(target: TypewriterLinkTarget, text = pendingLink?.text) {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument || !text?.trim()) return

    const now = new Date().toISOString()
    const copyBlockId = `typewriter-linked-${currentDocument.id}-${target.id}-${Date.now()}`
    upsertCopyBlock({
      id: copyBlockId,
      name: `${target.label} · gekoppelde tekst`,
      role: 'custom',
      content: text.trim(),
      tags: ['typewriter', 'linked-target', target.id],
      createdAt: now,
      updatedAt: now,
    })

    persistDocument({
      ...currentDocument,
      linkedSelections: [
        {
          id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          copyBlockId,
          role: 'document-text',
          text: text.trim(),
          targetDocumentId: target.type === 'document' ? target.rawId : undefined,
          targetProjectId: target.type === 'document' ? undefined : target.id,
          targetProjectType: target.type === 'document' ? undefined : target.type,
          targetName: target.label,
          createdAt: now,
        },
        ...(activeDocument?.linkedSelections ?? []),
      ],
    })
    setPendingLink(null)
    setStatus(`Gekoppeld aan ${target.label}`)
  }

  function unlinkTextSelection(selectionId: string) {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument) return
    const selection = currentDocument.linkedSelections.find((item) => item.id === selectionId)
    if (selection?.copyBlockId) archiveCopyBlock(selection.copyBlockId)
    persistDocument({
      ...currentDocument,
      linkedSelections: currentDocument.linkedSelections.filter((item) => item.id !== selectionId),
    })
    setStatus('Koppeling verwijderd')
  }

  function updateLinkedSelectionRole(selectionId: string, role: TypewriterLinkRole) {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument) return
    persistDocument({
      ...currentDocument,
      linkedSelections: currentDocument.linkedSelections.map((selection) =>
        selection.id === selectionId ? { ...selection, role } : selection
      ),
    })
    setStatus(role === 'document-text' ? 'Tekstvlak losgekoppeld' : `Tekstvlak: ${ROLE_LABELS[role] ?? role}`)
  }

  if (!activeDocument) return null
  const effectiveRightPanelWidth = rightPanelWidth

  return (
    <main className="h-full overflow-hidden bg-[#0a0a0a] text-white" onClick={() => setContextMenu(null)}>
      <div
        className={['grid h-full', rightPanelResizing ? '' : 'transition-[grid-template-columns] duration-300'].join(' ')}
        style={{ gridTemplateColumns: `minmax(0, 1fr) ${rightPanelOpen ? rightPanelWidth : RIGHT_PANEL_COLLAPSED_WIDTH}px` }}
      >
        <section className="flex min-w-0 flex-col overflow-hidden">
          <header className="flex-shrink-0 bg-[#131313]">
            <div className="flex items-end border-b border-white/[0.08]">
              {openDocIds.map((docId) => {
                const doc = documents.find((d) => d.id === docId)
                if (!doc) return null
                const isActive = docId === activeId
                return (
                  <div
                    key={docId}
                    onClick={() => { saveEditorContent(); setActiveId(docId) }}
                    className={[
                      'flex min-w-0 max-w-[200px] cursor-pointer select-none items-center gap-1.5 px-4 py-3 transition-colors',
                      isActive
                        ? 'mb-[-1px] rounded-tl-[10px] rounded-tr-[10px] border border-b-[#0a0a0a] border-white/[0.10] bg-[#0a0a0a] text-white/90'
                        : 'text-white/40 hover:text-white/70',
                    ].join(' ')}
                  >
                    {isActive ? (
                      <input
                        value={doc.title}
                        onChange={(e) => updateActiveDocument({ title: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Nieuw document"
                        className="min-w-0 w-full bg-transparent text-[13px] font-semibold leading-none text-white/90 outline-none placeholder:text-white/30"
                      />
                    ) : (
                      <span className="min-w-0 truncate text-[13px] font-semibold leading-none">
                        {doc.title || 'Nieuw document'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); closeTab(docId) }}
                      className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.14] hover:text-white/75"
                      aria-label="Tab sluiten"
                    >
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={createDocument}
                className="mb-2 ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/65"
                title="Nieuw document"
                aria-label="Nieuw document"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <div className="ml-auto flex flex-shrink-0 items-center gap-2 mb-2 mr-3">
                {status && <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-white/35">{status}</span>}
                {docIsLive && docShareCode ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] pl-2.5 pr-1 py-1 text-[11px] text-emerald-400/80">
                    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Live
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(docShareCode); setStatus('Code gekopieerd') }}
                      className="ml-1 rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/25"
                      title="Klik om code te kopiëren"
                    >
                      {docShareCode}
                    </button>
                  </span>
                ) : syncIndicator === 'live' && ownerId ? (
                  <button
                    type="button"
                    onClick={handleGoLive}
                    disabled={goingLive}
                    className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-1 text-[11px] text-white/35 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]/70 disabled:opacity-40"
                  >
                    {goingLive ? 'Even wachten…' : '↑ Live zetten'}
                  </button>
                ) : syncIndicator === 'syncing' ? (
                  <span className="text-[11px] text-white/25">Synchroniseren…</span>
                ) : null}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-7 py-7">
            <div className="mx-auto max-w-[860px]">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={saveEditorContent}
                onPaste={handlePaste}
                onBlur={() => syncDocuments(loadTypewriterDocuments(), activeId)}
                onMouseUp={refreshSelection}
                onKeyUp={refreshSelection}
                onContextMenu={handleContextMenu}
                dir="ltr"
                className="typewriter-editor min-h-[calc(100vh-170px)] w-full rounded-[6px] border border-white/[0.08] bg-[#ffffff] px-14 py-12 text-left text-[17px] leading-8 text-[#161616] shadow-2xl outline-none empty:before:text-black/30 empty:before:content-[attr(data-placeholder)]"
                data-placeholder="Schrijf je tekst hier..."
                spellCheck
              />
            </div>
          </div>
        </section>

        <aside className={[RIGHT_PANEL_STYLE.shellBase, RIGHT_PANEL_STYLE.shellSurface].join(' ')}>
          <div
            role="separator"
            aria-orientation="vertical"
            title="Sleep om het menu breder of smaller te maken"
            onMouseDown={startRightPanelResize}
            className="absolute -left-1.5 top-0 z-40 h-full w-3 cursor-col-resize"
          >
            <div className={['mx-auto h-full w-px transition-colors', rightPanelResizing ? 'bg-[#facc15]/70' : 'bg-transparent hover:bg-white/[0.18]'].join(' ')} />
          </div>
          <button
            type="button"
            onClick={() => {
              if (rightPanelOpen) {
                setRightPanelOpen(false)
                setRightPanelWidth(RIGHT_PANEL_COLLAPSED_WIDTH)
              } else {
                setRightPanelOpen(true)
                setRightPanelWidth(RIGHT_PANEL_MAX_WIDTH)
              }
            }}
            className={RIGHT_PANEL_STYLE.toggleButton}
            aria-label={rightPanelOpen ? 'Rechter menu inklappen' : 'Rechter menu uitklappen'}
            title={rightPanelOpen ? 'Menu inklappen' : 'Menu uitklappen'}
          >
            <IcoPanelToggle open={rightPanelOpen} />
          </button>
          <div className={[RIGHT_PANEL_STYLE.contentColumn, rightPanelOpen ? RIGHT_PANEL_STYLE.contentOpen : `${RIGHT_PANEL_STYLE.contentClosed} hidden`].join(' ')}>
            <PanelTabBar
              tabs={[
                { id: 'edit', label: 'Bewerken' },
                { id: 'files', label: 'Bestanden' },
              ]}
              activeTab={rightTab}
              onTabChange={(id) => setRightTab(id as typeof rightTab)}
              indent
              right={
                <button
                  type="button"
                  onClick={createDocument}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/65"
                  title="Nieuw document"
                  aria-label="Nieuw document"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
              {rightTab === 'edit' ? (
                <EditTab
                  activeDocument={activeDocument}
                  documents={documents}
                  selectedText={selectedText}
                  activeFormats={activeFormats}
                  onFormat={applyFormat}
                  onBeforeToolbarAction={saveEditorSelection}
                  onStartLink={() => startTextLink(selectedText)}
                  onUnlinkSelection={unlinkTextSelection}
                  onUpdateSelectionRole={updateLinkedSelectionRole}
                />
              ) : (
                <FilesTab
                  documents={documents}
                  activeDocument={activeDocument}
                  targets={linkTargets}
                  pendingLink={pendingLink}
                  onSelectDocument={(document) => {
                    saveEditorContent()
                    syncDocuments(loadTypewriterDocuments(), document.id)
                    setOpenDocIds((prev) =>
                      prev.includes(document.id) ? prev : [...prev, document.id]
                    )
                    setSelectedText('')
                    setStatus('')
                  }}
                  onArchiveDocument={(docId) => {
                    if (documents.length <= 1) return
                    const allAfterArchive = archiveTypewriterDocument(docId)
                    const archived = allAfterArchive.find((d) => d.id === docId)
                    if (archived && ownerId) pushDocumentToSupabase(archived, ownerId)
                    syncDocuments(allAfterArchive.filter((d) => !d.deletedAt))
                    setOpenDocIds((prev) => prev.filter((id) => id !== docId))
                    setSelectedText('')
                    setStatus('Document gearchiveerd')
                  }}
                  onRenameDocument={(docId, newTitle) => {
                    const doc = documentsRef.current.find((d) => d.id === docId)
                    if (!doc) return
                    const updated = { ...doc, title: newTitle, updatedAt: new Date().toISOString() }
                    const nextDocs = upsertTypewriterDocument(updated).filter((d) => !d.deletedAt)
                    documentsRef.current = nextDocs
                    setDocuments(nextDocs)
                  }}
                  onDragStart={() => setStatus('Sleep naar een live document')}
                  onDropLink={linkTextToTarget}
                />
              )}
            </div>
          </div>
        </aside>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[300] w-56 overflow-hidden rounded-xl border border-white/[0.12] bg-[#1c1c1c] shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="border-b border-white/[0.08] px-3 py-2">
            <p className="line-clamp-2 text-[11px] leading-5 text-white/45">
              &ldquo;{contextMenu.text}&rdquo;
            </p>
          </div>
          <div className="p-1">
            <button
              type="button"
              onClick={() => startTextLink(contextMenu.text)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              Koppel aan document
              <span className="text-[#facc15]">↗</span>
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function EditTab({
  activeDocument,
  documents,
  selectedText,
  activeFormats,
  onFormat,
  onBeforeToolbarAction,
  onStartLink,
  onUnlinkSelection,
  onUpdateSelectionRole,
}: {
  activeDocument: TypewriterDocument
  documents: TypewriterDocument[]
  selectedText: string
  activeFormats: Set<string>
  onFormat: (command: string, value?: string) => void
  onBeforeToolbarAction: () => void
  onStartLink: () => void
  onUnlinkSelection: (selectionId: string) => void
  onUpdateSelectionRole: (selectionId: string, role: TypewriterLinkRole) => void
}) {
  const [textColor, setTextColor] = useState('#161616')
  const [highlightColor, setHighlightColor] = useState('#facc15')

  return (
    <div className="space-y-3">

      {/* ── Tekst ─────────────────────────────────── */}
      <section>
        <div className="overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]">
          <div className="grid grid-cols-4 divide-x divide-white/[0.10]">
            <InlineButton title="Vet (Ctrl+B)" active={activeFormats.has('bold')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('bold')}>
              <span className="font-bold">B</span>
            </InlineButton>
            <InlineButton title="Cursief (Ctrl+I)" active={activeFormats.has('italic')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('italic')}>
              <span className="italic">I</span>
            </InlineButton>
            <InlineButton title="Onderstrepen (Ctrl+U)" active={activeFormats.has('underline')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('underline')}>
              <span className="underline underline-offset-2">U</span>
            </InlineButton>
            <InlineButton title="Doorhalen" active={activeFormats.has('strikeThrough')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('strikeThrough')}>
              <span className="line-through">S</span>
            </InlineButton>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/[0.10] border-t border-white/[0.10]">
            <InlineButton title="Superscript (x²)" active={activeFormats.has('superscript')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('superscript')}>
              <SuperscriptIcon />
            </InlineButton>
            <InlineButton title="Subscript (x₂)" active={activeFormats.has('subscript')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('subscript')}>
              <SubscriptIcon />
            </InlineButton>
            <div className="relative h-8 w-full">
              <InlineButton
                title="Markeren (klik om aan/uit te zetten)"
                active={activeFormats.has('highlight')}
                onBeforeAction={onBeforeToolbarAction}
                onClick={() => onFormat('highlight', highlightColor)}
              >
                <span className="relative flex h-5 w-5 items-center justify-center rounded-[3px] border border-white/25">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 11-6 6v3h3l6-6" /><path d="m22 5-9 9" /><path d="M16 3l5 5" />
                  </svg>
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-[2px]" style={{ backgroundColor: highlightColor }} />
                </span>
              </InlineButton>
              <label
                className="absolute bottom-1 right-1 z-10 cursor-pointer"
                title="Markeerkleur kiezen"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="block h-2.5 w-2.5 rounded-[2px] border border-white/30" style={{ backgroundColor: highlightColor }} />
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
                  className="absolute h-px w-px opacity-0"
                  tabIndex={-1}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ToolbarSelect
            label="Stijl"
            onBeforeAction={onBeforeToolbarAction}
            defaultValue="p"
            onChange={(value) => onFormat('formatBlock', value)}
            options={[
              ['p', 'Paragraaf'],
              ['h1', 'Kop 1'],
              ['h2', 'Kop 2'],
              ['h3', 'Kop 3'],
              ['blockquote', 'Citaat'],
              ['pre', 'Code'],
            ]}
          />
          <ToolbarSelect
            label="Lettertype"
            onBeforeAction={onBeforeToolbarAction}
            defaultValue="Inter"
            onChange={(value) => onFormat('fontName', value)}
            options={[
              ['Inter', 'Inter'],
              ['Arial', 'Arial'],
              ['Georgia', 'Georgia'],
              ['Times New Roman', 'Times'],
              ['Courier New', 'Courier'],
            ]}
          />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_38px] gap-2">
          <ToolbarSelect
            label="Grootte"
            onBeforeAction={onBeforeToolbarAction}
            defaultValue="16px"
            onChange={(value) => onFormat('fontSizePx', value)}
            options={Array.from({ length: 39 }, (_, index) => {
              const size = index + 10
              return [`${size}px`, `${size}px`] as [string, string]
            })}
          />
          <div className="flex items-end">
            <label className="relative flex h-8 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]" title="Tekstkleur">
              <span
                className="pointer-events-none h-4 w-4 rounded-[3px] border border-white/30 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                style={{ backgroundColor: textColor }}
              />
              <input
                type="color"
                value={textColor}
                onMouseDown={onBeforeToolbarAction}
                onChange={(event) => {
                  setTextColor(event.target.value)
                  onFormat('foreColor', event.target.value)
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>
      </section>

      {/* ── Alinea ────────────────────────────────── */}
      <section>
        <div className="overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]">
          <div className="grid grid-cols-4 divide-x divide-white/[0.10]">
            <InlineButton title="Links uitlijnen" active={activeFormats.has('justifyLeft')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('justifyLeft')}>
              <AlignIcon type="left" />
            </InlineButton>
            <InlineButton title="Centreren" active={activeFormats.has('justifyCenter')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('justifyCenter')}>
              <AlignIcon type="center" />
            </InlineButton>
            <InlineButton title="Rechts uitlijnen" active={activeFormats.has('justifyRight')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('justifyRight')}>
              <AlignIcon type="right" />
            </InlineButton>
            <InlineButton title="Uitvullen" active={activeFormats.has('justifyFull')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('justifyFull')}>
              <AlignIcon type="justify" />
            </InlineButton>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/[0.10] border-t border-white/[0.10]">
            <InlineButton title="Opsommingslijst" active={activeFormats.has('insertUnorderedList')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('insertUnorderedList')}>
              <ListIcon ordered={false} />
            </InlineButton>
            <InlineButton title="Genummerde lijst" active={activeFormats.has('insertOrderedList')} onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('insertOrderedList')}>
              <ListIcon ordered />
            </InlineButton>
            <InlineButton title="Inspringing vergroten" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('indent')}>
              <IndentIcon increase />
            </InlineButton>
            <InlineButton title="Inspringing verkleinen" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('outdent')}>
              <IndentIcon increase={false} />
            </InlineButton>
          </div>
        </div>
      </section>

      {/* ── Spatiëring ────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 gap-2">
          <ToolbarSelect
            label="Regelafstand"
            onBeforeAction={onBeforeToolbarAction}
            defaultValue="1.5"
            onChange={(value) => onFormat('lineHeight', value)}
            options={[
              ['1', '× 1.0'],
              ['1.2', '× 1.2'],
              ['1.4', '× 1.4'],
              ['1.5', '× 1.5'],
              ['1.6', '× 1.6'],
              ['1.8', '× 1.8'],
              ['2', '× 2.0'],
              ['2.5', '× 2.5'],
            ]}
          />
          <ToolbarSelect
            label="Spatiëring"
            onBeforeAction={onBeforeToolbarAction}
            defaultValue="normal"
            onChange={(value) => onFormat('letterSpacingEm', value)}
            options={[
              ['-0.05em', '−50'],
              ['-0.02em', '−20'],
              ['normal', '0'],
              ['0.02em', '+20'],
              ['0.05em', '+50'],
              ['0.08em', '+80'],
              ['0.1em', '+100'],
              ['0.15em', '+150'],
              ['0.2em', '+200'],
            ]}
          />
        </div>
      </section>

      {/* ── Bewerken ──────────────────────────────── */}
      <section>
        <div className="overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]">
          <div className="grid grid-cols-4 divide-x divide-white/[0.10]">
            <InlineButton title="Ongedaan maken (Ctrl+Z)" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('undo')}>
              <UndoIcon />
            </InlineButton>
            <InlineButton title="Opnieuw (Ctrl+Y)" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('redo')}>
              <RedoIcon />
            </InlineButton>
            <InlineButton title="Alles selecteren (Ctrl+A)" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('selectAll')}>
              <SelectAllIcon />
            </InlineButton>
            <InlineButton title="Opmaak wissen" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('removeFormat')}>
              <ClearFormatIcon />
            </InlineButton>
          </div>
        </div>
      </section>

      {/* ── Selectie & koppeling ──────────────────── */}
      <section>
        <div className="flex h-8 overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]">
          <div className="flex flex-1 items-center min-w-0 px-2.5">
            <p className="truncate text-[11px] text-white/50">
              {selectedText || 'Selecteer tekst om te koppelen'}
            </p>
          </div>
          <div className="w-px bg-white/[0.10]" />
          <div className="flex w-9 flex-shrink-0">
            <InlineButton title="Koppel aan document" onClick={onStartLink} disabled={!selectedText}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </InlineButton>
          </div>
        </div>
      </section>

      {/* ── Gekoppelde fragmenten ─────────────────── */}
      {activeDocument.linkedSelections.length > 0 && (
        <section>
          <div className="space-y-2">
            {activeDocument.linkedSelections.map((selection) => {
              const targetDocument = documents.find((document) => document.id === selection.targetDocumentId)
              const targetName = selection.targetName ?? targetDocument?.title
              return (
                <div key={selection.id} className="rounded-xl border border-white/[0.12] bg-white/[0.04] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <select
                        value={selection.role}
                        onChange={(event) => onUpdateSelectionRole(selection.id, event.target.value as TypewriterLinkRole)}
                        className={[
                          'h-7 max-w-full rounded-lg border bg-[#111] px-2 pr-7 text-[11px] font-semibold uppercase tracking-[0.14em] outline-none transition-colors',
                          selection.role === 'document-text'
                            ? 'border-white/[0.10] text-white/35 hover:border-[#facc15]/35 hover:text-[#facc15]'
                            : 'border-[#facc15]/25 text-[#facc15]',
                        ].join(' ')}
                        title="Kies tekstvlak"
                      >
                        {linkRoleOptionsForSelection(selection).map((option) => (
                          <option key={option.value} value={option.value} className="bg-[#111] text-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {targetName && <p className="mt-0.5 truncate text-[11px] text-white/35">→ {targetName}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnlinkSelection(selection.id)}
                      className="flex-shrink-0 rounded-md border border-white/[0.10] px-2 py-1 text-[10px] font-medium text-white/38 transition-colors hover:border-red-400/35 hover:bg-red-500/[0.08] hover:text-red-300"
                      title="Koppeling verwijderen"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-white/60">{selection.text}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function ListIcon({ ordered }: { ordered: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ordered ? (
        <>
          <path d="M4 6h1v4" />
          <path d="M4 10h2" />
          <path d="M4 14h2l-2 4h2" />
        </>
      ) : (
        <>
          <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
        </>
      )}
      <path d="M10 7h10" />
      <path d="M10 12h10" />
      <path d="M10 17h10" />
    </svg>
  )
}

function SelectAllIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  )
}

function InlineButton({ title, onClick, onBeforeAction, active, disabled, children }: { title: string; onClick: () => void; onBeforeAction?: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault()
        onBeforeAction?.()
      }}
      onClick={onClick}
      className={[
        'flex h-8 w-full items-center justify-center transition-colors',
        active
          ? 'bg-[#facc15]/[0.12] text-[#facc15]'
          : 'text-white/70 hover:bg-white/[0.07] hover:text-white',
        disabled ? 'opacity-30 cursor-not-allowed' : ''
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function AlignIcon({ type }: { type: 'left' | 'center' | 'right' | 'justify' }) {
  const lines: Record<string, [number, number, number][]> = {
    left: [[2, 12, 20], [2, 8, 14], [2, 12, 18], [2, 8, 14]],
    center: [[2, 12, 22], [5, 8, 19], [3, 12, 21], [5, 8, 19]],
    right: [[4, 12, 22], [8, 8, 22], [6, 12, 22], [8, 8, 22]],
    justify: [[2, 12, 22], [2, 8, 22], [2, 12, 22], [2, 8, 22]],
  }
  const rows = lines[type]
  const ys = [5, 9, 13, 17]
  return (
    <svg width="14" height="18" viewBox="0 0 24 22" fill="none">
      {rows.map(([x1, , x2], i) => (
        <line key={i} x1={x1} y1={ys[i]} x2={x2} y2={ys[i]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" /><path d="M3 13C5 8 9.5 5 15 5a9 9 0 0 1 0 18 9 9 0 0 1-7-3.4" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" /><path d="M21 13C19 8 14.5 5 9 5a9 9 0 0 0 0 18 9 9 0 0 0 7-3.4" />
    </svg>
  )
}

function SuperscriptIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 19 8-8" /><path d="m12 19-8-8" />
      <path d="M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.3 20 7c0-.47-.17-.93-.48-1.29a2.1 2.1 0 0 0-2.62-.44c-.42.24-.74.61-.9 1.06" />
    </svg>
  )
}

function SubscriptIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 5 8 8" /><path d="m12 5-8 8" />
      <path d="M20 21h-4c0-1.5.44-2 1.5-2.5S20 17.3 20 16c0-.47-.17-.93-.48-1.29a2.1 2.1 0 0 0-2.62-.44c-.42.24-.74.61-.9 1.06" />
    </svg>
  )
}

function IndentIcon({ increase }: { increase: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
      {increase ? (
        <><line x1="9" y1="12" x2="21" y2="12" /><polyline points="3 8 7 12 3 16" /></>
      ) : (
        <><line x1="11" y1="12" x2="21" y2="12" /><polyline points="7 8 3 12 7 16" /></>
      )}
    </svg>
  )
}

function ClearFormatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" /><path d="M5 20h6" /><path d="M13 4 8 20" /><line x1="17" y1="12" x2="22" y2="17" /><line x1="22" y1="12" x2="17" y2="17" />
    </svg>
  )
}

function FilesTab({
  documents,
  activeDocument,
  targets,
  pendingLink,
  onSelectDocument,
  onArchiveDocument,
  onRenameDocument,
  onDragStart,
  onDropLink,
}: {
  documents: TypewriterDocument[]
  activeDocument: TypewriterDocument
  targets: TypewriterLinkTarget[]
  pendingLink: PendingLink
  onSelectDocument: (document: TypewriterDocument) => void
  onArchiveDocument: (docId: string) => void
  onRenameDocument: (docId: string, newTitle: string) => void
  onDragStart: () => void
  onDropLink: (target: TypewriterLinkTarget, text?: string) => void
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editingTitle, setEditingTitle] = React.useState('')

  function startEdit(doc: TypewriterDocument, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingTitle(doc.title || '')
    setEditingId(doc.id)
  }

  function commitEdit() {
    if (editingId) {
      const trimmed = editingTitle.trim()
      if (trimmed) onRenameDocument(editingId, trimmed)
    }
    setEditingId(null)
  }

  return (
    <div>
      {pendingLink ? (
        <>
          <div className="mb-3 px-3 py-2 rounded-xl border border-[#facc15]/25 bg-[#facc15]/[0.06]">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#facc15]/80">Sleep koppeling</p>
            <div
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', pendingLink.text)
                onDragStart()
              }}
              className="cursor-grab rounded-lg bg-black/20 px-3 py-2 text-sm leading-6 text-white/70 active:cursor-grabbing"
            >
              {pendingLink.text}
            </div>
          </div>
          {targets.length === 0 ? (
            <p className="px-3 py-2 text-sm text-white/30">Geen koppeldoelen gevonden.</p>
          ) : (
            <>
              <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-widest text-white/30">Koppelen aan</p>
              {targets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onDropLink(target, e.dataTransfer.getData('text/plain') || pendingLink.text) }}
                  onClick={() => onDropLink(target, pendingLink.text)}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-white/60 transition-colors hover:bg-[#facc15]/[0.07] hover:text-white/90"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{target.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/30">{target.description}</span>
                  </span>
                  <span className="ml-2 flex-shrink-0 text-[#facc15]/60 text-xs">↗</span>
                </button>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-widest text-white/30">Documenten</p>
          {documents.map((doc) => {
            const isActive = doc.id === activeDocument.id
            const isEditing = editingId === doc.id
            return (
              <div key={doc.id} className="group relative">
                <button
                  type="button"
                  onClick={() => !isActive && onSelectDocument(doc)}
                  className={[
                    'flex w-full items-center rounded-xl px-3 py-2.5 pr-[4.5rem] text-left transition-colors',
                    isActive ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-md border border-white/[0.14] bg-white/[0.06] px-1.5 py-0.5 text-sm text-white outline-none"
                      />
                    ) : (
                      <span className="block truncate text-sm font-medium">{doc.title || 'Naamloos tekstdocument'}</span>
                    )}
                    <span className="mt-0.5 block truncate text-[11px] text-white/30">
                      {textPreviewFromHtml(doc.content) || 'Leeg document'}
                    </span>
                  </span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => startEdit(doc, e)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.07] hover:text-white/70"
                    title="Hernoemen"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onArchiveDocument(doc.id) }}
                    disabled={documents.length <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-red-500/[0.10] hover:text-red-300 disabled:pointer-events-none disabled:opacity-20"
                    title="Archiveer"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function ToolbarSelect({
  label,
  onBeforeAction,
  defaultValue,
  options,
  onChange,
}: {
  label: string
  onBeforeAction?: () => void
  defaultValue: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <label className="block relative" title={label}>
      <select
        aria-label={label}
        defaultValue={defaultValue}
        onMouseDown={onBeforeAction}
        onFocus={onBeforeAction}
        onChange={(event) => onChange(event.target.value)}
        className="appearance-none h-8 w-full rounded-lg border border-white/[0.14] bg-[#1a1a1a] pl-2.5 pr-7 text-[13px] text-white/80 outline-none transition-colors hover:border-white/[0.22] focus:border-[#facc15]/40"
      >
        {options.map(([value, name]) => (
          <option key={value} value={value} className="bg-[#111] text-white">{name}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-white/40">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </label>
  )
}

function encodeTextEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sanitizeClipboardHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return encodeTextEntities(node.textContent ?? '')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const kids = Array.from(el.childNodes).map(walk).join('')
    switch (tag) {
      case 'p': return kids ? `<p>${kids}</p>` : ''
      case 'div': return kids ? `<p>${kids}</p>` : ''
      case 'br': return '<br>'
      case 'b':
      case 'strong': return `<strong>${kids}</strong>`
      case 'i':
      case 'em': return `<em>${kids}</em>`
      case 'u': return `<u>${kids}</u>`
      case 's':
      case 'strike':
      case 'del': return `<s>${kids}</s>`
      case 'ul': return `<ul>${kids}</ul>`
      case 'ol': return `<ol>${kids}</ol>`
      case 'li': return `<li>${kids}</li>`
      case 'h1': case 'h2': case 'h3':
      case 'h4': case 'h5': case 'h6':
        return `<p><strong>${kids}</strong></p>`
      // Pass children through, drop the wrapper tag
      case 'span':
      case 'font':
      case 'a':
      case 'body':
      case 'html': return kids
      default: return kids
    }
  }

  return walk(doc.body)
}
