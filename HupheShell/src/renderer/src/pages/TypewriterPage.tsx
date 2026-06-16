import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Collaboration } from '@tiptap/extension-collaboration'
import { Mark } from '@tiptap/core'
import {
  fetchThreads,
  addComment,
  resolveThread,
  deleteComment,
  type TwThread,
} from '../lib/typewriter-comments'
import {
  fetchVersions,
  fetchVersionContent,
  createSnapshot,
  type TwVersion,
} from '../lib/typewriter-versions'
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
import { useYjsCollaboration } from '../hooks/useYjsCollaboration'
import { loadBannerProjects, loadPrintProjects } from '../lib/atelier-project-store'
import { loadAtelierMediaProjects } from '../hooks/useAtelierMedia'
import { IcoPanelToggle } from '../components/Icons'
import { PanelTabBar, RIGHT_PANEL_STYLE } from '../components/RightPanelShell'
import { sanitizeHtml } from '../lib/html-sanitize'

type RightTab = 'edit' | 'link' | 'files' | 'comments' | 'history'
type ReadingSize = 'small' | 'medium' | 'large'

const CommentMark = Mark.create({
  name: 'comment',
  spanning: true,
  inclusive: false,
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-thread-id'),
        renderHTML: (attrs) => attrs.threadId ? { 'data-thread-id': attrs.threadId } : {},
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => attrs.resolved ? { 'data-resolved': 'true' } : {},
      },
    }
  },
  parseHTML() { return [{ tag: 'span[data-thread-id]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'tw-comment-mark' }, 0]
  },
})
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
const TYPEWRITER_FIND_HIGHLIGHT = 'typewriter-find-result'
const TYPEWRITER_FIND_ACTIVE_HIGHLIGHT = 'typewriter-find-active-result'

type TextStats = {
  words: number
  characters: number
  readingMinutes: number
  speakingMinutes: number
}

type OutlineItem = {
  id: string
  label: string
  level: 1 | 2 | 3
}

const EMPTY_TEXT_STATS: TextStats = {
  words: 0,
  characters: 0,
  readingMinutes: 0,
  speakingMinutes: 0,
}

function makeInitialDocuments(): TypewriterDocument[] {
  return loadTypewriterDocuments()
}

const CURSOR_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316']

function cursorColorFromId(id: string): string {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0x7fffffff
  return CURSOR_COLORS[hash % CURSOR_COLORS.length]
}

function textPreviewFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function textStatsFromText(text: string): TextStats {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const words = normalized ? normalized.split(' ').length : 0
  const characters = normalized.replace(/\s/g, '').length
  return {
    words,
    characters,
    readingMinutes: words ? Math.max(1, Math.ceil(words / 225)) : 0,
    speakingMinutes: words ? Math.max(1, Math.ceil(words / 140)) : 0,
  }
}

function textStatsFromHtml(html: string): TextStats {
  if (typeof document === 'undefined') return EMPTY_TEXT_STATS
  const tmp = document.createElement('div')
  tmp.innerHTML = sanitizeHtml(html)
  return textStatsFromText(tmp.innerText)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.textContent?.trim()) nodes.push(node as Text)
  }
  return nodes
}

function findTextRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const ranges: Range[] = []
  collectTextNodes(root).forEach((node) => {
    const haystack = (node.textContent ?? '').toLowerCase()
    let start = haystack.indexOf(needle)
    while (start !== -1) {
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + needle.length)
      ranges.push(range)
      start = haystack.indexOf(needle, start + needle.length)
    }
  })
  return ranges
}

function extractOutlineItems(root: HTMLElement | null): OutlineItem[] {
  if (!root) return []
  return Array.from(root.querySelectorAll('h1, h2, h3'))
    .map((element, index) => {
      const label = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (!label) return null
      const level = Number(element.tagName.slice(1)) as 1 | 2 | 3
      const existingId = element.getAttribute('data-typewriter-outline-id')
      const id = existingId || `tw-outline-${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}`
      element.setAttribute('data-typewriter-outline-id', id)
      return { id, label, level }
    })
    .filter((item): item is OutlineItem => !!item)
}

interface Props {
  joinDocId?: string
}

export default function TypewriterPage({ joinDocId }: Props) {
  const ydoc = useMemo(() => new Y.Doc(), [])
  const [documents, setDocuments] = useState<TypewriterDocument[]>(makeInitialDocuments)
  const [activeId, setActiveId] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [status, setStatus] = useState('')
  const [rightTab, setRightTab] = useState<RightTab>('link')
  const [readingSize, setReadingSize] = useState<ReadingSize>('medium')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH)
  const [rightPanelResizing, setRightPanelResizing] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [pendingLink, setPendingLink] = useState<PendingLink>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [syncIndicator, setSyncIndicator] = useState<'idle' | 'syncing' | 'live'>('idle')
  const [editorStats, setEditorStats] = useState<TextStats>(EMPTY_TEXT_STATS)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [findMatches, setFindMatches] = useState(0)
  const [activeFindIndex, setActiveFindIndex] = useState(0)
  const [focusMode, setFocusMode] = useState(false)
  const [typewriterScrollEnabled, setTypewriterScrollEnabled] = useState(true)
  const [paragraphFocusEnabled, setParagraphFocusEnabled] = useState(false)
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])
  const [threads, setThreads] = useState<TwThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [pendingCommentBody, setPendingCommentBody] = useState('')
  const [composingComment, setComposingComment] = useState(false)
  const [replyingToThreadId, setReplyingToThreadId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [docIsLive, setDocIsLive] = useState(false)
  const [docShareCode, setDocShareCode] = useState<string | null>(null)
  const [goingLive, setGoingLive] = useState(false)
  const [openDocIds, setOpenDocIds] = useState<string[]>([])
  const [liveUsers, setLiveUsers] = useState<Array<{ name: string; color: string }>>([])
  const [versions, setVersions] = useState<TwVersion[]>([])
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const editorRef = useRef<HTMLElement | null>(null)
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const documentsRef = useRef<TypewriterDocument[]>(documents)
  const activeIdRef = useRef(activeId)
  const rightPanelWidthRef = useRef(rightPanelWidth)
  const editorSelectionRef = useRef<Range | null>(null)
  const findRangesRef = useRef<Range[]>([])
  const freshDocCreatedRef = useRef(false)
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId) ?? (activeId ? documents[0] : undefined),
    [activeId, documents],
  )

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { awareness } = useYjsCollaboration(activeId || undefined, ydoc)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        undoRedo: false,
      }),
      Underline,
      Superscript,
      Subscript,
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: 'Schrijf je tekst hier...',
      }),
      CommentMark,
      Collaboration.configure({ document: ydoc }),
    ],
    editorProps: {
      attributes: {
        class: [
          'typewriter-editor min-h-[calc(100vh-170px)] w-full rounded-[6px] border border-white/[0.08] bg-[#ffffff] px-14 py-12 text-left text-[17px] leading-8 text-[#161616] shadow-2xl outline-none',
          '[&_p]:my-3 [&_h1]:mb-5 [&_h1]:mt-7 [&_h1]:text-[34px] [&_h1]:font-semibold [&_h1]:leading-tight',
          '[&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:text-[26px] [&_h2]:font-semibold [&_h2]:leading-tight',
          '[&_h3]:mb-3 [&_h3]:mt-5 [&_h3]:text-[21px] [&_h3]:font-semibold',
          '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_li]:my-1',
          '[&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-[#facc15] [&_blockquote]:pl-5 [&_blockquote]:text-black/65',
          '[&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-black/[0.06] [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[14px]',
          '[&_a]:text-[#8a6b00] [&_a]:underline [&_a]:underline-offset-2',
          '[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-black/30 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
        ].join(' '),
        spellcheck: 'true',
        dir: 'ltr',
      },
      transformPastedHTML: (html) => sanitizeClipboardHtml(html),
    },
    onUpdate: ({ editor }) => {
      saveEditorContentFromEditor(editor)
      refreshFindHighlights(findQuery, activeFindIndex)
      scrollSelectionIntoTypewriterPosition()
    },
    onSelectionUpdate: ({ editor }) => {
      refreshSelectionFromEditor(editor)
      scrollSelectionIntoTypewriterPosition()
    },
  })

  useEffect(() => {
    editorRef.current = editor?.view.dom ?? null
  }, [editor])

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
    style.textContent = `
      ::highlight(${TYPEWRITER_SELECTION_HIGHLIGHT}) { background: rgba(250, 204, 21, 0.34); color: inherit; }
      ::highlight(${TYPEWRITER_FIND_HIGHLIGHT}) { background: rgba(250, 204, 21, 0.28); color: inherit; }
      ::highlight(${TYPEWRITER_FIND_ACTIVE_HIGHLIGHT}) { background: rgba(255, 127, 80, 0.45); color: inherit; }
      .typewriter-editor.typewriter-paragraph-focus > * { transition: opacity 160ms ease-out; }
      .typewriter-editor.typewriter-paragraph-focus > *:not([data-typewriter-focused="true"]) { opacity: 0.38; }
      .tw-comment-mark { background: rgba(250, 204, 21, 0.22); border-bottom: 2px solid rgba(250, 204, 21, 0.55); cursor: pointer; border-radius: 2px; }
      .tw-comment-mark[data-resolved="true"] { background: transparent; border-bottom: 2px solid rgba(255,255,255,0.12); }
      .collaboration-cursor__caret { border-left: 2px solid; border-right: 0; margin-left: -1px; margin-right: -1px; pointer-events: none; position: relative; word-break: normal; }
      .collaboration-cursor__label { border-radius: 3px 3px 3px 0; color: #fff; font-size: 11px; font-weight: 600; left: -1px; line-height: 1.3; padding: 2px 5px; position: absolute; top: -1.5em; user-select: none; white-space: nowrap; pointer-events: none; }
      .tw-reading-small .ProseMirror { font-size: 13px; line-height: 1.65; }
      .tw-reading-large .ProseMirror { font-size: 20px; line-height: 1.75; }
    `
    document.head.appendChild(style)
    return () => {
      ;(CSS as any).highlights?.delete(TYPEWRITER_SELECTION_HIGHLIGHT)
      ;(CSS as any).highlights?.delete(TYPEWRITER_FIND_HIGHLIGHT)
      ;(CSS as any).highlights?.delete(TYPEWRITER_FIND_ACTIVE_HIGHLIGHT)
      style.remove()
    }
  }, [])

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'f') {
        event.preventDefault()
        setFindOpen(true)
        requestAnimationFrame(() => document.getElementById('typewriter-find-input')?.focus())
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'f') {
        event.preventDefault()
        setFocusMode((value) => !value)
      }
      if (event.key === 'Escape') {
        if (focusMode) setFocusMode(false)
        else if (findOpen) setFindOpen(false)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [findOpen, focusMode])

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

  useEffect(() => {
    if (activeId) {
      loadThreads(activeId)
      loadVersions(activeId)
    }
  }, [activeId])

  // Awareness: stel user-staat in zodra we de gebruikersinfo hebben
  useEffect(() => {
    if (!ownerId) return
    supabase?.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? ''
      const name = data.user?.user_metadata?.full_name ?? email.split('@')[0] ?? 'Anoniem'
      awareness.setLocalStateField('user', {
        name,
        color: cursorColorFromId(ownerId),
      })
    })
  }, [ownerId, awareness])

  // Bijhouden welke gebruikers live zijn in dit document
  useEffect(() => {
    function update() {
      const others: Array<{ name: string; color: string }> = []
      awareness.states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (state?.user?.name) others.push({ name: state.user.name, color: state.user.color ?? '#888' })
      })
      setLiveUsers(others)
    }
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [awareness])

  useEffect(() => {
    if (!editor) return
    if (activeId === activeIdRef.current && editor.getHTML() !== '<p></p>') return
    activeIdRef.current = activeId
    editor.commands.setContent(sanitizeHtml(activeDocument?.content ?? ''), { emitUpdate: false })
    editorRef.current = editor.view.dom
    setEditorStats(textStatsFromHtml(activeDocument?.content ?? ''))
    requestAnimationFrame(() => setOutlineItems(extractOutlineItems(editor.view.dom)))
    clearFindHighlights()
    editor.commands.focus('end')
  }, [activeId, activeDocument?.content, editor])

  function syncDocuments(nextDocuments: TypewriterDocument[], nextActiveId = activeId) {
    const visible = nextDocuments.filter((document) => !document.deletedAt)
    const currentActive = documentsRef.current.find((document) => document.id === nextActiveId)
    const shouldKeepUnsavedActive = currentActive && !currentActive.deletedAt && !visible.some((document) => document.id === currentActive.id)
    const mergedVisible = shouldKeepUnsavedActive ? [currentActive, ...visible] : visible
    documentsRef.current = mergedVisible
    setDocuments(mergedVisible)
    setActiveId(mergedVisible.some((document) => document.id === nextActiveId) ? nextActiveId : mergedVisible[0]?.id ?? '')
  }

  function debouncedSaveToSupabase(doc: TypewriterDocument) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (ownerId) pushDocumentToSupabase(doc, ownerId)
    }, 400)
  }

  function persistDocument(nextDocument: TypewriterDocument) {
    const nextDocuments = upsertTypewriterDocument(nextDocument).filter((document) => !document.deletedAt)
    syncDocuments(nextDocuments, nextDocument.id)
    setStatus('Opgeslagen')
    debouncedSaveToSupabase(nextDocument)
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
    updateActiveParagraphFocus()
    refreshSelectionFromEditor(editor)
  }

  function refreshSelectionFromEditor(nextEditor: Editor | null) {
    const text = getEditorSelectionText()
    if (!text) clearEditorSelectionHighlight()
    setSelectedText((current) => (current === text ? current : text))
    updateActiveParagraphFocus()
    if (!nextEditor) {
      setActiveFormats(new Set())
      return
    }
    const nextFormats = new Set<string>()
    if (nextEditor.isActive('bold')) nextFormats.add('bold')
    if (nextEditor.isActive('italic')) nextFormats.add('italic')
    if (nextEditor.isActive('underline')) nextFormats.add('underline')
    if (nextEditor.isActive('strike')) nextFormats.add('strikeThrough')
    if (nextEditor.isActive('superscript')) nextFormats.add('superscript')
    if (nextEditor.isActive('subscript')) nextFormats.add('subscript')
    if (nextEditor.isActive('highlight')) nextFormats.add('highlight')
    if (nextEditor.isActive('bulletList')) nextFormats.add('insertUnorderedList')
    if (nextEditor.isActive('orderedList')) nextFormats.add('insertOrderedList')
    if (nextEditor.isActive({ textAlign: 'left' })) nextFormats.add('justifyLeft')
    if (nextEditor.isActive({ textAlign: 'center' })) nextFormats.add('justifyCenter')
    if (nextEditor.isActive({ textAlign: 'right' })) nextFormats.add('justifyRight')
    if (nextEditor.isActive({ textAlign: 'justify' })) nextFormats.add('justifyFull')
    setActiveFormats(nextFormats)
  }

  function refreshEditorStats() {
    setEditorStats(textStatsFromText(editor?.getText() ?? editorRef.current?.innerText ?? ''))
  }

  function refreshOutlineItems() {
    setOutlineItems(extractOutlineItems(editorRef.current))
  }

  async function loadThreads(docId: string) {
    const loaded = await fetchThreads(docId)
    setThreads(loaded)
  }

  async function loadVersions(docId: string) {
    const loaded = await fetchVersions(docId)
    setVersions(loaded)
  }

  async function handleSaveSnapshot(label?: string) {
    if (!activeId || !ownerId || savingSnapshot || !editor) return
    setSavingSnapshot(true)
    const content = sanitizeHtml(editor.getHTML())
    const id = await createSnapshot(activeId, content, label)
    if (id) {
      await loadVersions(activeId)
      setStatus('Versie opgeslagen')
    } else {
      setStatus('Versie opslaan mislukt')
    }
    setSavingSnapshot(false)
  }

  async function handleRestoreVersion(versionId: string) {
    if (!editor) return
    const content = await fetchVersionContent(versionId)
    if (!content) return
    editor.commands.setContent(sanitizeHtml(content), { emitUpdate: false })
    saveEditorContent()
    setStatus('Versie teruggezet')
    setRightTab('edit')
  }

  async function handleAddComment() {
    if (!activeId || !ownerId || !pendingCommentBody.trim() || !editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const threadId = crypto.randomUUID()
    editor.chain().setMark('comment', { threadId, resolved: false }).run()
    saveEditorContent()
    const comment = await addComment({
      docId: activeId,
      authorId: ownerId,
      body: pendingCommentBody.trim(),
      threadId,
      anchorThreadId: threadId,
    })
    if (comment) {
      setThreads((prev) => [...prev, { thread_id: threadId, resolved: false, comments: [comment] }])
      setActiveThreadId(threadId)
    }
    setPendingCommentBody('')
    setComposingComment(false)
  }

  async function handleReply(threadId: string) {
    if (!activeId || !ownerId || !replyBody.trim()) return
    const thread = threads.find((t) => t.thread_id === threadId)
    const rootComment = thread?.comments[0]
    const comment = await addComment({
      docId: activeId,
      authorId: ownerId,
      body: replyBody.trim(),
      threadId,
      parentId: rootComment?.id,
    })
    if (comment) {
      setThreads((prev) =>
        prev.map((t) => t.thread_id === threadId ? { ...t, comments: [...t.comments, comment] } : t)
      )
    }
    setReplyBody('')
    setReplyingToThreadId(null)
  }

  async function handleResolveThread(threadId: string, resolved: boolean) {
    await resolveThread(threadId, resolved)
    setThreads((prev) =>
      prev.map((t) =>
        t.thread_id === threadId
          ? { ...t, resolved, comments: t.comments.map((c) => ({ ...c, resolved })) }
          : t
      )
    )
    if (resolved && editor) {
      editor.state.doc.descendants((node, pos) => {
        const mark = node.marks.find((m) => m.type.name === 'comment' && m.attrs.threadId === threadId)
        if (mark) {
          const tr = editor.state.tr
          tr.addMark(pos, pos + node.nodeSize, editor.schema.marks.comment.create({ threadId, resolved: true }))
          editor.view.dispatch(tr)
        }
      })
      saveEditorContent()
    }
  }

  async function handleDeleteComment(commentId: string, threadId: string) {
    await deleteComment(commentId)
    const thread = threads.find((t) => t.thread_id === threadId)
    if (!thread) return
    const remaining = thread.comments.filter((c) => c.id !== commentId)
    if (remaining.length === 0) {
      setThreads((prev) => prev.filter((t) => t.thread_id !== threadId))
      if (editor) {
        editor.state.doc.descendants((node, pos) => {
          const mark = node.marks.find((m) => m.type.name === 'comment' && m.attrs.threadId === threadId)
          if (mark) {
            const tr = editor.state.tr
            tr.removeMark(pos, pos + node.nodeSize, editor.schema.marks.comment)
            editor.view.dispatch(tr)
          }
        })
        saveEditorContent()
      }
    } else {
      setThreads((prev) =>
        prev.map((t) => t.thread_id === threadId ? { ...t, comments: remaining } : t)
      )
    }
  }

  function clearFindHighlights() {
    findRangesRef.current = []
    setFindMatches(0)
    ;(CSS as any).highlights?.delete(TYPEWRITER_FIND_HIGHLIGHT)
    ;(CSS as any).highlights?.delete(TYPEWRITER_FIND_ACTIVE_HIGHLIGHT)
  }

  function refreshFindHighlights(nextQuery = findQuery, nextActiveIndex = activeFindIndex) {
    if (!editorRef.current || !nextQuery.trim()) {
      clearFindHighlights()
      return
    }
    const ranges = findTextRanges(editorRef.current, nextQuery)
    findRangesRef.current = ranges
    setFindMatches(ranges.length)
    const safeActiveIndex = ranges.length ? Math.min(nextActiveIndex, ranges.length - 1) : 0
    if (safeActiveIndex !== nextActiveIndex) setActiveFindIndex(safeActiveIndex)
    const HighlightCtor = (window as any).Highlight
    const highlights = (CSS as any).highlights
    if (HighlightCtor && highlights) {
      highlights.set(TYPEWRITER_FIND_HIGHLIGHT, new HighlightCtor(...ranges))
      if (ranges[safeActiveIndex]) {
        highlights.set(TYPEWRITER_FIND_ACTIVE_HIGHLIGHT, new HighlightCtor(ranges[safeActiveIndex]))
      } else {
        highlights.delete(TYPEWRITER_FIND_ACTIVE_HIGHLIGHT)
      }
    }
    if (ranges[safeActiveIndex]) {
      scrollRangeIntoView(ranges[safeActiveIndex], true)
    }
  }

  function moveFindResult(delta: number) {
    const total = findRangesRef.current.length
    if (!total) return
    const next = (activeFindIndex + delta + total) % total
    setActiveFindIndex(next)
    refreshFindHighlights(findQuery, next)
  }

  function replaceCurrentFindResult() {
    const range = findRangesRef.current[activeFindIndex]
    if (!range || !editorRef.current) return
    range.deleteContents()
    range.insertNode(document.createTextNode(replaceValue))
    editor?.commands.setContent(sanitizeHtml(editorRef.current.innerHTML), { emitUpdate: false })
    saveEditorContent()
    refreshFindHighlights(findQuery, activeFindIndex)
  }

  function replaceAllFindResults() {
    if (!editorRef.current || !findQuery.trim()) return
    const expression = new RegExp(escapeRegExp(findQuery), 'gi')
    collectTextNodes(editorRef.current).forEach((node) => {
      node.textContent = (node.textContent ?? '').replace(expression, replaceValue)
    })
    editor?.commands.setContent(sanitizeHtml(editorRef.current.innerHTML), { emitUpdate: false })
    saveEditorContent()
    refreshFindHighlights(findQuery, 0)
    setActiveFindIndex(0)
  }

  function scrollRangeIntoView(range: Range, forceCenter = false) {
    const scrollEl = editorScrollRef.current
    if (!scrollEl) return
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return
    const scrollRect = scrollEl.getBoundingClientRect()
    const desiredCenter = scrollRect.top + scrollRect.height / 2
    const currentCenter = rect.top + rect.height / 2
    const delta = currentCenter - desiredCenter
    if (forceCenter || Math.abs(delta) > scrollRect.height * 0.18) {
      scrollEl.scrollTop += delta
    }
  }

  function scrollSelectionIntoTypewriterPosition() {
    if (!typewriterScrollEnabled) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return
    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) return
    requestAnimationFrame(() => scrollRangeIntoView(range))
  }

  function updateActiveParagraphFocus() {
    if (!editorRef.current) return
    const blocks = Array.from(editorRef.current.querySelectorAll('[data-typewriter-focused="true"]'))
    blocks.forEach((block) => block.removeAttribute('data-typewriter-focused'))
    editorRef.current.classList.toggle('typewriter-paragraph-focus', paragraphFocusEnabled)
    if (!paragraphFocusEnabled) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) return
    const node = range.commonAncestorContainer
    const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as Element | null
    const block = element?.closest('p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, div')
    if (block && editorRef.current.contains(block)) block.setAttribute('data-typewriter-focused', 'true')
  }

  useEffect(() => {
    updateActiveParagraphFocus()
  }, [paragraphFocusEnabled])

  useEffect(() => {
    refreshFindHighlights(findQuery, activeFindIndex)
  }, [findQuery, activeFindIndex, activeId])

  function saveEditorContentFromEditor(nextEditor: Editor | null = editor) {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument || !nextEditor) return
    editorRef.current = nextEditor.view.dom
    const rawText = nextEditor.getText().trim()
    const html = sanitizeHtml(nextEditor.getHTML())
    setEditorStats(textStatsFromText(nextEditor.getText()))
    refreshOutlineItems()
    const autoTitle =
      currentDocument.title === 'Nieuw tekstdocument' && rawText
        ? rawText.split('\n')[0].slice(0, 60) || 'Nieuw tekstdocument'
        : currentDocument.title
    const updated = { ...currentDocument, title: autoTitle, content: html, updatedAt: new Date().toISOString() }
    const nextDocuments = upsertTypewriterDocument(updated).filter((document) => !document.deletedAt)
    documentsRef.current = nextDocuments
    setDocuments(nextDocuments)
    setStatus('Opgeslagen')
    debouncedSaveToSupabase(updated)
  }

  function saveEditorContent() {
    saveEditorContentFromEditor(editor)
  }

  function handleEditorInput() {
    saveEditorContent()
    refreshFindHighlights(findQuery, activeFindIndex)
    scrollSelectionIntoTypewriterPosition()
  }

  function jumpToOutlineItem(itemId: string) {
    const target = editorRef.current?.querySelector(`[data-typewriter-outline-id="${CSS.escape(itemId)}"]`)
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    editorRef.current?.focus()
    updateActiveParagraphFocus()
  }

  function applyFormat(command: string, value?: string) {
    if (!editor) return
    const chain = editor.chain().focus()
    switch (command) {
      case 'bold': chain.toggleBold().run(); break
      case 'italic': chain.toggleItalic().run(); break
      case 'underline': chain.toggleUnderline().run(); break
      case 'strikeThrough': chain.toggleStrike().run(); break
      case 'superscript': chain.toggleSuperscript().run(); break
      case 'subscript': chain.toggleSubscript().run(); break
      case 'highlight':
        if (editor.isActive('highlight')) chain.unsetHighlight().run()
        else chain.toggleHighlight({ color: value ?? '#facc15' }).run()
        break
      case 'formatBlock':
        if (value === 'h1') chain.toggleHeading({ level: 1 }).run()
        else if (value === 'h2') chain.toggleHeading({ level: 2 }).run()
        else if (value === 'h3') chain.toggleHeading({ level: 3 }).run()
        else if (value === 'blockquote') chain.toggleBlockquote().run()
        else if (value === 'pre') chain.toggleCodeBlock().run()
        else chain.setParagraph().run()
        break
      case 'fontName':
        if (value) chain.setFontFamily(value).run()
        break
      case 'fontSizePx':
        if (value) chain.setFontSize(value).run()
        break
      case 'lineHeight':
        if (value) chain.setLineHeight(value).run()
        break
      case 'letterSpacingEm':
        if (value) chain.setMark('textStyle', { letterSpacing: value === 'normal' ? null : value }).run()
        break
      case 'foreColor':
        if (value) chain.setColor(value).run()
        break
      case 'justifyLeft': chain.setTextAlign('left').run(); break
      case 'justifyCenter': chain.setTextAlign('center').run(); break
      case 'justifyRight': chain.setTextAlign('right').run(); break
      case 'justifyFull': chain.setTextAlign('justify').run(); break
      case 'insertUnorderedList': chain.toggleBulletList().run(); break
      case 'insertOrderedList': chain.toggleOrderedList().run(); break
      case 'indent': chain.sinkListItem('listItem').run(); break
      case 'outdent': chain.liftListItem('listItem').run(); break
      case 'undo': chain.undo().run(); break
      case 'redo': chain.redo().run(); break
      case 'selectAll':
        editor.commands.setTextSelection({ from: 0, to: editor.state.doc.content.size })
        break
      case 'removeFormat': chain.unsetAllMarks().clearNodes().run(); break
      case 'createLink':
        if (value) chain.extendMarkRange('link').setLink({ href: value }).run()
        break
      case 'unlink': chain.extendMarkRange('link').unsetLink().run(); break
      default:
        break
    }
    saveEditorContentFromEditor(editor)
    refreshFindHighlights(findQuery, activeFindIndex)
    scrollSelectionIntoTypewriterPosition()
    refreshSelectionFromEditor(editor)
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

  function handleExport(format: string) {
    if (!editor) return
    const html = sanitizeHtml(editor.getHTML())
    const text = editor.getText()
    const title = (activeDocument?.title || 'document').replace(/[<>:"/\\|?*]/g, '-')

    switch (format) {
      case 'copy-text':
        navigator.clipboard.writeText(text)
        setStatus('Tekst gekopieerd')
        break
      case 'copy-html':
        navigator.clipboard.writeText(html)
        setStatus('HTML gekopieerd')
        break
      case 'download-txt':
        triggerDownload(`${title}.txt`, text, 'text/plain')
        setStatus('Gedownload als .txt')
        break
      case 'download-html':
        triggerDownload(
          `${title}.html`,
          `<!DOCTYPE html>\n<html lang="nl">\n<head>\n  <meta charset="UTF-8">\n  <title>${title}</title>\n  <style>body{font-family:Georgia,serif;max-width:720px;margin:3rem auto;line-height:1.7;color:#1a1a1a}h1,h2,h3{font-weight:600}blockquote{border-left:4px solid #facc15;padding-left:1.25rem;color:#555}</style>\n</head>\n<body>\n${html}\n</body>\n</html>`,
          'text/html',
        )
        setStatus('Gedownload als .html')
        break
      case 'print':
        window.print()
        break
    }
  }

  function triggerDownload(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function startTextLink(text: string) {
    setPendingLink({ text })
    setSelectedText(text)
    setRightTab('link')
    setContextMenu(null)
    setStatus('')
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

  function replaceLinkedSelectionText(selectionId: string, newText: string) {
    const currentDocument = getCurrentActiveDocument()
    if (!currentDocument || !newText.trim()) return
    persistDocument({
      ...currentDocument,
      linkedSelections: currentDocument.linkedSelections.map((selection) =>
        selection.id === selectionId ? { ...selection, text: newText.trim() } : selection
      ),
    })
    setStatus('Gekoppelde tekst bijgewerkt')
  }

  if (!activeDocument) return null
  const effectiveRightPanelWidth = rightPanelWidth

  return (
    <main className={['h-full overflow-hidden bg-[#0a0a0a] text-white', focusMode ? 'typewriter-focus-mode' : ''].join(' ')} onClick={() => setContextMenu(null)}>
      <div
        className={['grid h-full', rightPanelResizing ? '' : 'transition-[grid-template-columns] duration-300'].join(' ')}
        style={{ gridTemplateColumns: focusMode ? 'minmax(0, 1fr)' : `56px minmax(0, 1fr) ${rightPanelOpen ? rightPanelWidth : RIGHT_PANEL_COLLAPSED_WIDTH}px` }}
      >
        {/* ── Left formatting toolbar ─────────────────── */}
        {!focusMode && <WritingToolbar
          activeFormats={activeFormats}
          readingSize={readingSize}
          onFormat={applyFormat}
          onBeforeAction={saveEditorSelection}
          onReadingSizeChange={setReadingSize}
        />}
        <section className="flex min-w-0 flex-col overflow-hidden">
          {!focusMode && (
          <header className="flex-shrink-0 bg-[#181818]">
            <div className="flex min-h-[40px] items-end border-b border-white/[0.10]">
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
              <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 mb-2 mr-3">
                {editorStats.words > 0 && (
                  <span className="hidden text-[11px] text-white/30 lg:inline">
                    {editorStats.words}w
                  </span>
                )}
                <div className="mx-1 h-3 w-px bg-white/[0.10]" />
                <button
                  type="button"
                  onClick={() => setFindOpen((open) => !open)}
                  title="Zoek en vervang (Cmd+F)"
                  className={['flex h-7 w-7 items-center justify-center rounded-md transition-colors', findOpen ? 'bg-[#facc15]/15 text-[#facc15]' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75'].join(' ')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setFocusMode(true)}
                  title="Focus mode (Cmd+Shift+F)"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white/75"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setTypewriterScrollEnabled((enabled) => !enabled)}
                  title={typewriterScrollEnabled ? 'Typewriter-scroll uitzetten' : 'Typewriter-scroll aanzetten'}
                  className={['flex h-7 w-7 items-center justify-center rounded-md transition-colors', typewriterScrollEnabled ? 'bg-[#facc15]/12 text-[#facc15]/80' : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'].join(' ')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 8 12 4 16 8"/><polyline points="16 16 12 20 8 16"/>
                  </svg>
                </button>
                <div className="mx-1 h-3 w-px bg-white/[0.10]" />
                {liveUsers.length > 0 && (
                  <span className="flex items-center gap-1" title={liveUsers.map((u) => u.name).join(', ')}>
                    {liveUsers.slice(0, 4).map((u, i) => (
                      <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow" style={{ backgroundColor: u.color }} title={u.name}>
                        {u.name.slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                  </span>
                )}
                {docIsLive && docShareCode ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] pl-2.5 pr-1 py-1 text-[11px] text-emerald-400/80">
                    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Live
                    <button type="button" onClick={() => { navigator.clipboard.writeText(docShareCode); setStatus('Code gekopieerd') }} className="ml-1 rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/25" title="Klik om code te kopiëren">
                      {docShareCode}
                    </button>
                  </span>
                ) : syncIndicator === 'live' && ownerId ? (
                  <button type="button" onClick={handleGoLive} disabled={goingLive} className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/35 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]/70 disabled:opacity-40">
                    {goingLive ? '…' : '↑ Live'}
                  </button>
                ) : syncIndicator === 'syncing' ? (
                  <span className="text-[11px] text-white/20">•</span>
                ) : null}
                {status && <span className="text-[11px] text-white/30">{status}</span>}
              </div>
            </div>
          </header>
          )}

          {findOpen && (
            <div className="flex-shrink-0 border-b border-white/[0.08] bg-[#101010] px-7 py-3">
              <div className="mx-auto flex max-w-[860px] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] p-2">
                <input
                  id="typewriter-find-input"
                  value={findQuery}
                  onChange={(event) => { setFindQuery(event.target.value); setActiveFindIndex(0) }}
                  placeholder="Zoeken..."
                  className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white/80 outline-none placeholder:text-white/25 focus:border-[#facc15]/35"
                />
                <span className="w-16 text-center text-[11px] text-white/35">
                  {findMatches ? `${activeFindIndex + 1}/${findMatches}` : '0/0'}
                </span>
                <button type="button" onClick={() => moveFindResult(-1)} className="h-8 rounded-lg border border-white/[0.08] px-2.5 text-sm text-white/45 hover:text-white" title="Vorige">↑</button>
                <button type="button" onClick={() => moveFindResult(1)} className="h-8 rounded-lg border border-white/[0.08] px-2.5 text-sm text-white/45 hover:text-white" title="Volgende">↓</button>
                <input
                  value={replaceValue}
                  onChange={(event) => setReplaceValue(event.target.value)}
                  placeholder="Vervangen door..."
                  className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white/80 outline-none placeholder:text-white/25 focus:border-[#facc15]/35"
                />
                <button type="button" onClick={replaceCurrentFindResult} className="h-8 rounded-lg border border-white/[0.08] px-3 text-[11px] font-semibold text-white/50 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]">Vervang</button>
                <button type="button" onClick={replaceAllFindResults} className="h-8 rounded-lg border border-white/[0.08] px-3 text-[11px] font-semibold text-white/50 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]">Alles</button>
                <button
                  type="button"
                  onClick={() => { setFindOpen(false); setFindQuery(''); clearFindHighlights() }}
                  className="h-8 rounded-lg px-2.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                  title="Zoekbalk sluiten"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div
            ref={editorScrollRef}
            className={[
              'flex-1 overflow-y-auto px-7 py-7',
              readingSize === 'small' ? 'tw-reading-small' : readingSize === 'large' ? 'tw-reading-large' : '',
              focusMode ? 'px-10 py-10' : '',
            ].join(' ')}
          >
            <BubbleToolbar
              editor={editor}
              onStartComment={() => { saveEditorSelection(); setComposingComment(true); setRightTab('link') }}
            />
            <div className={['mx-auto', focusMode ? 'max-w-[920px]' : 'max-w-[860px]'].join(' ')}>
              <div
                onBlur={() => syncDocuments(loadTypewriterDocuments(), activeId)}
                onMouseUp={refreshSelection}
                onKeyUp={() => { refreshSelection(); scrollSelectionIntoTypewriterPosition() }}
                onContextMenu={handleContextMenu}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        </section>

        {!focusMode && (
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
                { id: 'link', label: 'Koppelen' },
                { id: 'comments', label: threads.length > 0 ? `Notities (${threads.filter(t => !t.resolved).length || threads.length})` : 'Notities' },
                { id: 'history', label: versions.length > 0 ? `Versies (${versions.length})` : 'Versies' },
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
              {rightTab === 'link' ? (
                <KoppelenTab
                  activeDocument={activeDocument}
                  documents={documents}
                  selectedText={selectedText}
                  pendingLink={pendingLink}
                  linkTargets={linkTargets}
                  composingComment={composingComment}
                  pendingCommentBody={pendingCommentBody}
                  onStartLink={() => startTextLink(selectedText)}
                  onPickLinkTarget={(target) => linkTextToTarget(target)}
                  onCancelLink={() => { setPendingLink(null); setStatus('') }}
                  onUnlinkSelection={unlinkTextSelection}
                  onUpdateSelectionRole={updateLinkedSelectionRole}
                  onStartComment={() => { saveEditorSelection(); setComposingComment(true); setRightTab('link') }}
                  onPendingCommentBodyChange={setPendingCommentBody}
                  onSubmitComment={handleAddComment}
                  onCancelComment={() => { setComposingComment(false); setPendingCommentBody('') }}
                  onReplaceSelectionText={(selectionId) => replaceLinkedSelectionText(selectionId, selectedText)}
                  onJumpToSelection={(text) => {
                    if (!editor) return
                    // Search through full document text to handle multi-node selections
                    const fullText = editor.state.doc.textContent
                    const textIndex = fullText.indexOf(text)
                    if (textIndex === -1) return

                    // Map text index back to ProseMirror positions
                    let charCount = 0
                    let foundFrom = -1
                    let foundTo = -1
                    editor.state.doc.descendants((node, pos) => {
                      if (foundTo !== -1) return false
                      if (node.isText && node.text) {
                        const start = charCount
                        const end = charCount + node.text.length
                        if (foundFrom === -1 && textIndex >= start && textIndex < end) {
                          foundFrom = pos + (textIndex - start)
                        }
                        if (foundFrom !== -1) {
                          const endIndex = textIndex + text.length
                          if (endIndex <= end) {
                            foundTo = pos + (endIndex - start)
                          }
                        }
                        charCount += node.text.length
                      }
                    })
                    if (foundFrom === -1 || foundTo === -1) return

                    editor.commands.setTextSelection({ from: foundFrom, to: foundTo })
                    editor.commands.focus()

                    // Scroll the outer container so the selection lands in view
                    requestAnimationFrame(() => {
                      const { node } = editor.view.domAtPos(foundFrom)
                      const el = node instanceof Element ? node : node.parentElement
                      const container = editorScrollRef.current
                      if (!el || !container) return
                      const containerRect = container.getBoundingClientRect()
                      const elRect = el.getBoundingClientRect()
                      const targetScrollTop = container.scrollTop + elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2
                      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
                    })
                  }}
                />
              ) : rightTab === 'comments' ? (
                <CommentsTab
                  threads={threads}
                  activeThreadId={activeThreadId}
                  replyingToThreadId={replyingToThreadId}
                  replyBody={replyBody}
                  onReplyBodyChange={setReplyBody}
                  onStartReply={(threadId) => setReplyingToThreadId(threadId)}
                  onCancelReply={() => { setReplyingToThreadId(null); setReplyBody('') }}
                  onSubmitReply={handleReply}
                  onResolveThread={handleResolveThread}
                  onDeleteComment={handleDeleteComment}
                  onSelectThread={(threadId) => {
                    setActiveThreadId(threadId)
                    const el = editorRef.current?.querySelector(`[data-thread-id="${threadId}"]`)
                    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  }}
                />
              ) : (
                <HistoryTab
                  versions={versions}
                  saving={savingSnapshot}
                  onSave={handleSaveSnapshot}
                  onRestore={handleRestoreVersion}
                />
              )}
            </div>
          </div>
        </aside>
        )}
      </div>

      {focusMode && (
        <div className="fixed right-6 top-5 z-[320] flex items-center gap-2 rounded-full border border-white/[0.10] bg-[#111]/90 px-2 py-2 shadow-2xl backdrop-blur">
          <span className="hidden px-2 text-[11px] text-white/35 sm:inline">
            {editorStats.words} woorden · {editorStats.readingMinutes || 0} min lezen
          </span>
          <button
            type="button"
            onClick={() => setFindOpen((open) => !open)}
            className={['rounded-full px-3 py-1.5 text-[11px] transition-colors', findOpen ? 'bg-[#facc15]/15 text-[#facc15]' : 'bg-white/[0.06] text-white/45 hover:text-white'].join(' ')}
          >
            Zoek
          </button>
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="rounded-full bg-[#facc15] px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-[#ffe46b]"
          >
            Terug
          </button>
        </div>
      )}

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

// ─── WritingToolbar (left vertical bar) ──────────────────────────────────────

function WritingToolbar({
  activeFormats,
  readingSize,
  onFormat,
  onBeforeAction,
  onReadingSizeChange,
}: {
  activeFormats: Set<string>
  readingSize: ReadingSize
  onFormat: (command: string, value?: string) => void
  onBeforeAction: () => void
  onReadingSizeChange: (s: ReadingSize) => void
}) {
  function Btn({ title, active = false, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => { onBeforeAction(); onClick() }}
        className={[
          'flex items-center justify-center rounded-xl border p-2 w-full transition-colors',
          active
            ? 'border-[#facc15]/40 bg-[#facc15]/12 text-[#facc15]'
            : 'border-transparent text-white/40 hover:border-white/[0.10] hover:bg-white/[0.05] hover:text-white/75',
        ].join(' ')}
      >
        {children}
      </button>
    )
  }

  function Sep() {
    return <div className="w-full h-px bg-white/[0.07] my-px" />
  }

  return (
    <aside className="flex h-full w-14 flex-shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#111] overflow-y-auto py-2 px-1.5 gap-px">
      {/* Tekststijl */}
      <Btn title="Bold (Cmd+B)" active={activeFormats.has('bold')} onClick={() => onFormat('bold')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </Btn>
      <Btn title="Italic (Cmd+I)" active={activeFormats.has('italic')} onClick={() => onFormat('italic')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </Btn>
      <Btn title="Underline (Cmd+U)" active={activeFormats.has('underline')} onClick={() => onFormat('underline')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
      </Btn>
      <Btn title="Doorhalen" active={activeFormats.has('strikethrough')} onClick={() => onFormat('strikeThrough')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6C16 6 14.5 4 12 4C9.5 4 7 5.5 7 8C7 10.5 9 11.5 12 12.5C15 13.5 17 14.5 17 17C17 19.5 14.5 21 12 21C9.5 21 7.5 19 7.5 19"/></svg>
      </Btn>

      <Sep />

      {/* Alineastijl */}
      <Btn title="Body tekst" active={false} onClick={() => onFormat('formatBlock', 'p')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/></svg>
      </Btn>
      <Btn title="Titel (H1)" active={false} onClick={() => onFormat('formatBlock', 'h1')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h8M4 18h8"/></svg>
      </Btn>
      <Btn title="Ondertitel (H2)" active={false} onClick={() => onFormat('formatBlock', 'h2')}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12M4 12h8M4 18h8"/></svg>
      </Btn>
      <Btn title="Kop (H3)" active={false} onClick={() => onFormat('formatBlock', 'h3')}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h8M4 12h8M4 18h8"/></svg>
      </Btn>

      <Sep />

      {/* Uitlijning */}
      <Btn title="Links uitlijnen" active={activeFormats.has('justifyLeft')} onClick={() => onFormat('justifyLeft')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
      </Btn>
      <Btn title="Centreren" active={activeFormats.has('justifyCenter')} onClick={() => onFormat('justifyCenter')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
      </Btn>

      <Sep />

      {/* Lijst */}
      <Btn title="Opsommingslijst" active={activeFormats.has('insertUnorderedList')} onClick={() => onFormat('insertUnorderedList')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
      </Btn>
      <Btn title="Genummerde lijst" active={activeFormats.has('insertOrderedList')} onClick={() => onFormat('insertOrderedList')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </Btn>

      <Sep />

      {/* Leesgrootte */}
      {(['small', 'medium', 'large'] as ReadingSize[]).map((size, i) => (
        <button
          key={size}
          type="button"
          title={size === 'small' ? 'Klein (13px)' : size === 'medium' ? 'Middel (16px)' : 'Groot (20px)'}
          onClick={() => onReadingSizeChange(size)}
          className={[
            'flex items-center justify-center rounded-xl border p-2 w-full transition-colors',
            readingSize === size
              ? 'border-[#facc15]/40 bg-[#facc15]/12 text-[#facc15]'
              : 'border-transparent text-white/40 hover:border-white/[0.10] hover:bg-white/[0.05] hover:text-white/75',
          ].join(' ')}
        >
          <span style={{ fontSize: [11, 13, 15][i], lineHeight: 1, fontWeight: 600 }}>A</span>
        </button>
      ))}

    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function BubbleToolbar({
  editor,
  onStartComment,
}: {
  editor: Editor | null
  onStartComment: () => void
}) {
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null)
  const [visible, setVisible] = React.useState(false)
  const toolbarRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!editor) return

    function updatePosition() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setVisible(false)
        return
      }
      const range = sel.getRangeAt(0)
      const domRect = range.getBoundingClientRect()
      if (!domRect || domRect.width === 0) {
        setVisible(false)
        return
      }
      setRect({ top: domRect.top, left: domRect.left, width: domRect.width })
      setVisible(true)
    }

    editor.on('selectionUpdate', updatePosition)
    editor.on('blur', () => setVisible(false))
    return () => {
      editor.off('selectionUpdate', updatePosition)
      editor.off('blur', () => setVisible(false))
    }
  }, [editor])

  if (!visible || !rect || !editor) return null

  const toolbarWidth = 320
  const leftPos = rect.left + rect.width / 2 - toolbarWidth / 2
  const topPos = rect.top - 44

  const btn = (
    title: string,
    active: boolean,
    onClick: () => void,
    children: React.ReactNode,
  ) => (
    <button
      key={title}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={[
        'flex h-8 w-8 items-center justify-center rounded text-xs font-medium transition-colors',
        active
          ? 'bg-white/20 text-white'
          : 'text-white/70 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  )

  return (
    <div
      ref={toolbarRef}
      className="pointer-events-auto fixed z-[250] flex items-center gap-0.5 rounded-lg border border-white/15 bg-[#1c1c1c]/95 px-1.5 py-1 shadow-xl backdrop-blur-sm"
      style={{ top: topPos, left: leftPos, width: toolbarWidth }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {btn('Vet', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <span className="font-bold">B</span>)}
      {btn('Cursief', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <span className="italic">I</span>)}
      {btn('Onderstrepen', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <span className="underline underline-offset-2">U</span>)}
      {btn('Doorhalen', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <span className="line-through">S</span>)}
      <div className="mx-1 h-5 w-px bg-white/15" />
      {btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <span className="text-[10px] font-bold">H1</span>)}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <span className="text-[10px] font-bold">H2</span>)}
      {btn('H3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span className="text-[10px] font-bold">H3</span>)}
      <div className="mx-1 h-5 w-px bg-white/15" />
      {btn('Markeren', editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run(), (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11-6 6v3h3l6-6" /><path d="m22 5-9 9" /><path d="M16 3l5 5" />
        </svg>
      ))}
      {btn('Superscript', editor.isActive('superscript'), () => editor.chain().focus().toggleSuperscript().run(), (
        <span className="text-[9px]">x²</span>
      ))}
      {btn('Subscript', editor.isActive('subscript'), () => editor.chain().focus().toggleSubscript().run(), (
        <span className="text-[9px]">x₂</span>
      ))}
      <div className="mx-1 h-5 w-px bg-white/15" />
      {btn('Reageren', false, onStartComment, (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ))}
    </div>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1.5 text-left"
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {title}
          {badge}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={['text-white/25 transition-transform duration-150', open ? '' : '-rotate-90'].join(' ')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </section>
  )
}

// ─── KoppelenTab ──────────────────────────────────────────────────────────────

function KoppelenTab({
  activeDocument,
  documents,
  selectedText,
  pendingLink,
  linkTargets,
  composingComment,
  pendingCommentBody,
  onStartLink,
  onPickLinkTarget,
  onCancelLink,
  onUnlinkSelection,
  onUpdateSelectionRole,
  onStartComment,
  onPendingCommentBodyChange,
  onSubmitComment,
  onCancelComment,
  onReplaceSelectionText,
  onJumpToSelection,
}: {
  activeDocument: TypewriterDocument
  documents: TypewriterDocument[]
  selectedText: string
  pendingLink: { text: string } | null
  linkTargets: TypewriterLinkTarget[]
  composingComment: boolean
  pendingCommentBody: string
  onStartLink: () => void
  onPickLinkTarget: (target: TypewriterLinkTarget) => void
  onCancelLink: () => void
  onUnlinkSelection: (selectionId: string) => void
  onUpdateSelectionRole: (selectionId: string, role: TypewriterLinkRole) => void
  onStartComment: () => void
  onPendingCommentBodyChange: (v: string) => void
  onSubmitComment: () => void
  onCancelComment: () => void
  onReplaceSelectionText: (selectionId: string) => void
  onJumpToSelection: (text: string) => void
}) {
  const [linkSearch, setLinkSearch] = React.useState('')
  const filteredTargets = linkSearch.trim()
    ? linkTargets.filter((t) => t.label.toLowerCase().includes(linkSearch.toLowerCase()))
    : linkTargets

  return (
    <div className="space-y-3">

      {/* ── Selectiebalk met koppelknop ───────────── */}
      <div className="flex overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]">
        <div className="flex flex-1 items-center min-w-0 px-2.5 h-9">
          <p className="truncate text-[11px] text-white/50">
            {selectedText || 'Selecteer tekst om te koppelen'}
          </p>
        </div>
        <div className="w-px bg-white/[0.10]" />
        <button
          type="button"
          title="Koppel aan project of document"
          disabled={!selectedText}
          onClick={onStartLink}
          className={['flex h-9 w-9 flex-shrink-0 items-center justify-center transition-colors disabled:opacity-30', pendingLink ? 'text-[#facc15]' : 'text-white/40 hover:text-white/80'].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
      </div>

      {/* ── Dropdown doelkeuze ────────────────────── */}
      {pendingLink && (
        <div className="rounded-lg border border-white/[0.12] bg-[#161616] overflow-hidden">
          <div className="border-b border-white/[0.08] px-2.5 py-2">
            <input
              autoFocus
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Zoek project of document…"
              className="w-full bg-transparent text-[12px] text-white/80 outline-none placeholder:text-white/30"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filteredTargets.length === 0 && (
              <p className="py-3 text-center text-[12px] text-white/30">Geen resultaten</p>
            )}
            {filteredTargets.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => { onPickLinkTarget(target); setLinkSearch('') }}
                className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-white/[0.06] text-[8px] font-bold uppercase text-white/35">
                  {target.type === 'document' ? 'TW' : target.type === 'print' ? 'PR' : target.type === 'banners' ? 'BN' : 'MD'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-white/65">{target.label}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-white/[0.08] px-2.5 py-1.5">
            <button type="button" onClick={onCancelLink} className="text-[11px] text-white/30 hover:text-white/55">
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* ── Gekoppelde blokjes ────────────────────── */}
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
                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJumpToSelection(selection.text)}
                    className="mt-1.5 w-full text-left group"
                    title="Spring naar tekst in document"
                  >
                    <p className="line-clamp-3 text-sm leading-5 text-white/55 transition-colors group-hover:text-white/85">
                      {selection.text}
                    </p>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-white/20 transition-colors group-hover:text-[#facc15]/60">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                      Spring naar tekst
                    </span>
                  </button>
                  {selectedText && selectedText !== selection.text && (
                    <button
                      type="button"
                      onClick={() => onReplaceSelectionText(selection.id)}
                      className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-[#facc15]/30 bg-[#facc15]/[0.07] px-2.5 py-1.5 text-left text-[11px] text-[#facc15]/80 transition-colors hover:border-[#facc15]/50 hover:bg-[#facc15]/[0.12] hover:text-[#facc15]"
                      title="Vervang gekoppelde tekst door huidige selectie"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                      Vervang met huidige selectie
                    </button>
                  )}
                </div>
              )
            })}
    </div>
  )
}

// ─── EditTab ──────────────────────────────────────────────────────────────────

function EditTab({
  activeDocument,
  activeFormats,
  outlineItems,
  readingSize,
  onFormat,
  onBeforeToolbarAction,
  onJumpToOutlineItem,
  onReadingSizeChange,
  onExport,
}: {
  activeDocument: TypewriterDocument
  activeFormats: Set<string>
  outlineItems: OutlineItem[]
  readingSize: ReadingSize
  onFormat: (command: string, value?: string) => void
  onBeforeToolbarAction: () => void
  onJumpToOutlineItem: (itemId: string) => void
  onReadingSizeChange: (size: ReadingSize) => void
  onExport: (format: string) => void
}) {

  return (
    <div className="divide-y divide-white/[0.07]">

      {/* ── Tekststijl ────────────────────────────── */}
      <CollapsibleSection title="Tekststijl" defaultOpen>
        <div className="space-y-2">
          <ToolbarSelect
            label="Stijl"
            onBeforeAction={onBeforeToolbarAction}
            defaultValue="p"
            onChange={(value) => onFormat('formatBlock', value)}
            options={[
              ['p', 'Body'],
              ['h1', 'Title'],
              ['h2', 'Subtitle'],
              ['h3', 'H3'],
              ['blockquote', 'Citaat'],
              ['pre', 'Code'],
            ]}
          />
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Leesgrootte</p>
            <div className="overflow-hidden rounded-lg border border-white/[0.14] bg-[#1a1a1a]">
              <div className="grid grid-cols-3 divide-x divide-white/[0.10]">
                {(['small', 'medium', 'large'] as ReadingSize[]).map((size, i) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onReadingSizeChange(size)}
                    className={['flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors', readingSize === size ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:text-white/70'].join(' ')}
                    title={size === 'small' ? 'Klein (13px)' : size === 'medium' ? 'Middel (16px)' : 'Groot (20px)'}
                  >
                    <span style={{ fontSize: [11, 13, 16][i] }}>{['A', 'A', 'A'][i]}</span>
                    <span className="text-[9px] uppercase tracking-[0.12em]">{['S', 'M', 'L'][i]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Alinea ────────────────────────────────── */}
      <CollapsibleSection title="Alinea" defaultOpen>
        <div className="space-y-2">
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
        </div>
      </CollapsibleSection>

      {/* ── Bewerken ──────────────────────────────── */}
      <CollapsibleSection title="Bewerken" defaultOpen={false}>
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
          <div className="grid grid-cols-2 divide-x divide-white/[0.10] border-t border-white/[0.10]">
            <InlineButton
              title="Hyperlink toevoegen"
              onBeforeAction={onBeforeToolbarAction}
              onClick={() => {
                const url = window.prompt('URL voor de link')
                if (!url?.trim()) return
                const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
                onFormat('createLink', normalized)
              }}
            >
              <LinkIcon />
            </InlineButton>
            <InlineButton title="Hyperlink verwijderen" onBeforeAction={onBeforeToolbarAction} onClick={() => onFormat('unlink')}>
              <UnlinkIcon />
            </InlineButton>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Outline ───────────────────────────────── */}
      <CollapsibleSection
        title="Outline"
        defaultOpen={false}
        badge={outlineItems.length > 0 ? (
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/40">{outlineItems.length}</span>
        ) : undefined}
      >
        {outlineItems.length > 0 ? (
          <div className="space-y-0.5">
            {outlineItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onJumpToOutlineItem(item.id)}
                className={[
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] leading-4 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85',
                  item.level === 2 ? 'pl-4' : item.level === 3 ? 'pl-6' : '',
                ].join(' ')}
                title={item.label}
              >
                <span className="flex h-4 w-6 flex-shrink-0 items-center justify-center rounded bg-white/[0.05] text-[9px] font-semibold text-white/35">
                  H{item.level}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] leading-5 text-white/30">Gebruik Title, Subtitle of H3 om snel door je document te springen.</p>
        )}
      </CollapsibleSection>

      {/* ── Exporteren ───────────────────────────── */}
      <CollapsibleSection title="Exporteren" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => onExport('copy-text')} className="flex items-center gap-2 rounded-md border border-white/[0.10] bg-white/[0.03] px-2.5 py-2 text-left text-[12px] text-white/55 transition-colors hover:border-white/[0.20] hover:text-white/80">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Tekst kopiëren
          </button>
          <button type="button" onClick={() => onExport('copy-html')} className="flex items-center gap-2 rounded-md border border-white/[0.10] bg-white/[0.03] px-2.5 py-2 text-left text-[12px] text-white/55 transition-colors hover:border-white/[0.20] hover:text-white/80">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            HTML kopiëren
          </button>
          <button type="button" onClick={() => onExport('download-txt')} className="flex items-center gap-2 rounded-md border border-white/[0.10] bg-white/[0.03] px-2.5 py-2 text-left text-[12px] text-white/55 transition-colors hover:border-white/[0.20] hover:text-white/80">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download .txt
          </button>
          <button type="button" onClick={() => onExport('download-html')} className="flex items-center gap-2 rounded-md border border-white/[0.10] bg-white/[0.03] px-2.5 py-2 text-left text-[12px] text-white/55 transition-colors hover:border-white/[0.20] hover:text-white/80">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download .html
          </button>
          <button type="button" onClick={() => onExport('print')} className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-white/[0.10] bg-white/[0.03] px-2.5 py-2 text-[12px] text-white/55 transition-colors hover:border-white/[0.20] hover:text-white/80">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Afdrukken / opslaan als PDF
          </button>
        </div>
      </CollapsibleSection>

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

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function UnlinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

function CommentsTab({
  threads,
  activeThreadId,
  replyingToThreadId,
  replyBody,
  onReplyBodyChange,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onResolveThread,
  onDeleteComment,
  onSelectThread,
}: {
  threads: TwThread[]
  activeThreadId: string | null
  replyingToThreadId: string | null
  replyBody: string
  onReplyBodyChange: (v: string) => void
  onStartReply: (threadId: string) => void
  onCancelReply: () => void
  onSubmitReply: (threadId: string) => void
  onResolveThread: (threadId: string, resolved: boolean) => void
  onDeleteComment: (commentId: string, threadId: string) => void
  onSelectThread: (threadId: string) => void
}) {
  const open = threads.filter((t) => !t.resolved)
  const resolved = threads.filter((t) => t.resolved)

  if (threads.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-white/30">Nog geen opmerkingen.</p>
        <p className="mt-1 text-[12px] text-white/20">Selecteer tekst en klik op het chat-icoon om te beginnen.</p>
      </div>
    )
  }

  function ThreadCard({ thread }: { thread: TwThread }) {
    const root = thread.comments[0]
    const replies = thread.comments.slice(1)
    const isActive = activeThreadId === thread.thread_id
    const isReplying = replyingToThreadId === thread.thread_id

    return (
      <div
        className={[
          'rounded-lg border p-3 transition-colors',
          thread.resolved
            ? 'border-white/[0.07] bg-white/[0.02] opacity-60'
            : isActive
              ? 'border-[#facc15]/35 bg-[#facc15]/[0.05]'
              : 'border-white/[0.10] bg-[#151515]',
        ].join(' ')}
        onClick={() => !thread.resolved && onSelectThread(thread.thread_id)}
        role="button"
        tabIndex={0}
      >
        {/* Root comment */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#facc15]/20 text-[10px] font-semibold text-[#facc15]">
            {root?.author_id.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] leading-5 text-white/80">{root?.body}</p>
            <p className="mt-0.5 text-[10px] text-white/30">
              {root ? new Date(root.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-1">
            <button
              type="button"
              title={thread.resolved ? 'Heropenen' : 'Oplossen'}
              onClick={(e) => { e.stopPropagation(); onResolveThread(thread.thread_id, !thread.resolved) }}
              className="rounded p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            >
              {thread.resolved ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="m9 12 2 2 4-4"/></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="m9 12 2 2 4-4"/></svg>
              )}
            </button>
            {root && (
              <button
                type="button"
                title="Verwijderen"
                onClick={(e) => { e.stopPropagation(); onDeleteComment(root.id, thread.thread_id) }}
                className="rounded p-1 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="ml-7 mt-2 space-y-2 border-l border-white/[0.08] pl-3">
            {replies.map((reply) => (
              <div key={reply.id} className="flex items-start gap-2">
                <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/50">
                  {reply.author_id.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-5 text-white/70">{reply.body}</p>
                  <p className="mt-0.5 text-[10px] text-white/25">
                    {new Date(reply.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteComment(reply.id, thread.thread_id) }}
                  className="flex-shrink-0 rounded p-1 text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Reply input */}
        {!thread.resolved && (
          <div className="ml-7 mt-2">
            {isReplying ? (
              <div>
                <textarea
                  autoFocus
                  rows={2}
                  value={replyBody}
                  onChange={(e) => onReplyBodyChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitReply(thread.thread_id)
                    if (e.key === 'Escape') onCancelReply()
                  }}
                  placeholder="Reageer..."
                  className="w-full resize-none rounded border border-white/[0.12] bg-black/25 px-2 py-1.5 text-[12px] leading-5 text-white/80 outline-none placeholder:text-white/25 focus:border-[#facc15]/35"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="mt-1 flex justify-end gap-1.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onCancelReply() }} className="rounded px-2 py-1 text-[11px] text-white/35 hover:text-white/60">
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSubmitReply(thread.thread_id) }}
                    disabled={!replyBody.trim()}
                    className="rounded bg-[#facc15] px-2 py-1 text-[11px] font-semibold text-black disabled:opacity-40 hover:bg-[#ffe46b]"
                  >
                    Reageren
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onStartReply(thread.thread_id) }}
                className="text-[11px] text-white/30 transition-colors hover:text-white/60"
              >
                + Reageren
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {open.map((t) => <ThreadCard key={t.thread_id} thread={t} />)}
      {resolved.length > 0 && (
        <>
          <p className="pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">Opgelost</p>
          {resolved.map((t) => <ThreadCard key={t.thread_id} thread={t} />)}
        </>
      )}
    </div>
  )
}

function HistoryTab({
  versions,
  saving,
  onSave,
  onRestore,
}: {
  versions: TwVersion[]
  saving: boolean
  onSave: (label?: string) => void
  onRestore: (versionId: string) => void
}) {
  const [labelInput, setLabelInput] = React.useState('')
  const [showLabelInput, setShowLabelInput] = React.useState(false)
  const [confirmRestoreId, setConfirmRestoreId] = React.useState<string | null>(null)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-3">
      {/* Save snapshot */}
      <div className="rounded-lg border border-white/[0.10] bg-[#151515] p-3">
        {showLabelInput ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onSave(labelInput.trim() || undefined); setShowLabelInput(false); setLabelInput('') }
                if (e.key === 'Escape') { setShowLabelInput(false); setLabelInput('') }
              }}
              placeholder="Label (bijv. 'V1 Final')"
              className="w-full rounded-md border border-white/[0.12] bg-black/25 px-3 py-2 text-[13px] text-white/80 outline-none placeholder:text-white/30 focus:border-[#facc15]/40"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowLabelInput(false); setLabelInput('') }}
                className="flex-1 rounded-lg border border-white/[0.10] py-1.5 text-[12px] text-white/40 hover:text-white/65"
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => { onSave(labelInput.trim() || undefined); setShowLabelInput(false); setLabelInput('') }}
                className="flex-1 rounded-lg bg-[#facc15] py-1.5 text-[12px] font-semibold text-black disabled:opacity-40 hover:bg-[#ffe46b]"
              >
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave()}
              className="flex-1 rounded-lg border border-white/[0.10] bg-white/[0.03] py-2 text-[12px] text-white/50 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]/80 disabled:opacity-40"
            >
              {saving ? 'Opslaan…' : 'Versie opslaan'}
            </button>
            <button
              type="button"
              onClick={() => setShowLabelInput(true)}
              className="rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[12px] text-white/35 transition-colors hover:border-white/[0.20] hover:text-white/65"
              title="Opslaan met label"
            >
              + label
            </button>
          </div>
        )}
      </div>

      {/* Version list */}
      {versions.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[13px] text-white/30">Nog geen versies opgeslagen.</p>
          <p className="mt-1 text-[12px] text-white/20">Klik op 'Versie opslaan' om een snapshot te maken.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <div
              key={v.id}
              className="rounded-lg border border-white/[0.08] bg-[#151515] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {v.label ? (
                    <p className="truncate text-[13px] font-semibold text-white/80">{v.label}</p>
                  ) : (
                    <p className="text-[13px] text-white/50">Automatisch</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-white/30">{formatDate(v.created_at)}</p>
                </div>
                {confirmRestoreId === v.id ? (
                  <div className="flex flex-shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmRestoreId(null)}
                      className="rounded px-2 py-1 text-[11px] text-white/35 hover:text-white/60"
                    >
                      Nee
                    </button>
                    <button
                      type="button"
                      onClick={() => { onRestore(v.id); setConfirmRestoreId(null) }}
                      className="rounded bg-[#facc15] px-2 py-1 text-[11px] font-semibold text-black hover:bg-[#ffe46b]"
                    >
                      Ja, zet terug
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreId(v.id)}
                    className="flex-shrink-0 rounded-md border border-white/[0.10] px-2 py-1 text-[11px] text-white/40 transition-colors hover:border-[#facc15]/30 hover:text-[#facc15]"
                  >
                    Terugzetten
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
