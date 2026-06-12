import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, ReactNode } from 'react'
import { sanitizeHtml } from '../lib/html-sanitize'

interface RichTextEditorProps {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function inlineMarkdownToHtml(input: string): string {
  return escapeHtml(input)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}

function markdownToHtml(value: string): string {
  if (!value.trim()) return ''

  const lines = value.split(/\r?\n/)
  const html: string[] = []
  let inList = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const bulletMatch = line.match(/^\s*-\s+(.*)$/)

    if (bulletMatch) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inlineMarkdownToHtml(bulletMatch[1])}</li>`)
      continue
    }

    if (inList) {
      html.push('</ul>')
      inList = false
    }

    if (!line.trim()) {
      html.push('<p><br></p>')
    } else {
      html.push(`<p>${inlineMarkdownToHtml(line)}</p>`)
    }
  }

  if (inList) html.push('</ul>')
  return html.join('')
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''

  if (!(node instanceof HTMLElement)) return ''

  const children = Array.from(node.childNodes).map(inlineNodeToMarkdown).join('')
  const tagName = node.tagName.toLowerCase()

  if (tagName === 'strong' || tagName === 'b') return `**${children}**`
  if (tagName === 'em' || tagName === 'i') return `*${children}*`
  if (tagName === 'br') return '\n'
  return children
}

function editorHtmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = []

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text.trim()) lines.push(text)
      continue
    }

    if (!(node instanceof HTMLElement)) continue

    const tagName = node.tagName.toLowerCase()

    if (tagName === 'ul' || tagName === 'ol') {
      for (const item of Array.from(node.children)) {
        if (item.tagName.toLowerCase() === 'li') {
          lines.push(`- ${inlineNodeToMarkdown(item).trim()}`)
        }
      }
      continue
    }

    const line = inlineNodeToMarkdown(node).replace(/\n+$/g, '')
    lines.push(line)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Typ tekst...',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef(value)
  const [focused, setFocused] = useState(false)
  const [empty, setEmpty] = useState(value.trim().length === 0)
  const [formatState, setFormatState] = useState({ bold: false, italic: false, list: false })

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const isActive = document.activeElement === editor
    if (isActive && value === lastEmittedRef.current) return

    editor.innerHTML = sanitizeHtml(markdownToHtml(value))
    setEmpty(value.trim().length === 0)
  }, [value])

  useEffect(() => {
    function onSelectionChange() {
      if (document.activeElement !== editorRef.current) return
      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        list: document.queryCommandState('insertUnorderedList'),
      })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  function syncFromDom() {
    const editor = editorRef.current
    if (!editor) return

    const next = editorHtmlToMarkdown(editor)
    lastEmittedRef.current = next
    setEmpty(next.trim().length === 0)
    onChange(next)
  }

  function runCommand(command: 'bold' | 'italic' | 'insertUnorderedList') {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    document.execCommand(command)
    syncFromDom()
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    syncFromDom()
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#141414] text-white shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
      <div className="flex items-center gap-1 border-b border-white/[0.07] px-2.5 py-2">
        <ToolbarButton label="Vet" active={formatState.bold} onClick={() => runCommand('bold')}>
          B
        </ToolbarButton>
        <ToolbarButton label="Cursief" italic active={formatState.italic} onClick={() => runCommand('italic')}>
          I
        </ToolbarButton>
        <ToolbarButton label="Bullet-lijst" active={formatState.list} onClick={() => runCommand('insertUnorderedList')}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 6h13" />
            <path d="M8 12h13" />
            <path d="M8 18h13" />
            <path d="M3 6h.01" />
            <path d="M3 12h.01" />
            <path d="M3 18h.01" />
          </svg>
        </ToolbarButton>
      </div>

      <div className="relative">
        {empty && !focused && (
          <span className="pointer-events-none absolute left-3.5 top-3 text-sm text-white/25">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncFromDom}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            syncFromDom()
          }}
          className="min-h-[112px] w-full rounded-b-2xl px-3.5 py-3 text-sm leading-relaxed text-white/80 outline-none transition-colors focus:bg-white/[0.015] [&_em]:text-white/80 [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1 [&_strong]:font-semibold [&_ul]:my-1"
        />
      </div>
    </div>
  )
}

function ToolbarButton({
  children,
  label,
  italic,
  active,
  onClick,
}: {
  children: ReactNode
  label: string
  italic?: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-semibold transition-colors',
        active
          ? 'border-[#facc15]/60 bg-[#facc15] text-black'
          : 'border-white/[0.07] bg-white/[0.03] text-white/55 hover:border-[#facc15]/45 hover:bg-[#facc15] hover:text-black',
        italic ? 'italic' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
