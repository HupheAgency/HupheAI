import { useEffect, useRef, useState } from 'react'
import spinnerSrc from '../assets/spinner.png'
import AgentEventsFeed, { type AgentEventType } from './AgentEventsFeed'
import AnimatedPixelBackground from './AnimatedPixelBackground'
import AtelierCreationModeButtons, { type AtelierCreationType } from './AtelierCreationModeButtons'
import DocumentStatePanel, { type SavedImage } from './DocumentStatePanel'
import TaskRunnerInput from './TaskRunnerInput'

export interface AtelierAgentOption {
  id: string
  label: string
  model: string
  description?: string
  modality?: string
}

export interface AtelierChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  agentLabel?: string
  content: string
  createdAt: string
}

// Agent events and document state are omitted from the main UI in this minimalist version,
// but types are kept to avoid breaking existing imports.
export interface AtelierAgentEvent {
  id: string
  fromAgent: string
  toAgent?: string
  type: AgentEventType
  content: string
  createdAt: string
}

export interface AtelierDocumentState {
  id: string
  path: string
  status: string
  updatedAt: string
  content: string
}

export interface AtelierConversationOption {
  id: string
  title: string
  updatedAt?: string
}

interface Props {
  agents: AtelierAgentOption[]
  selectedAgentId: string
  messages: AtelierChatMessage[]
  agentEvents?: AtelierAgentEvent[]
  documents?: AtelierDocumentState[]
  savedImages?: SavedImage[]
  conversations?: AtelierConversationOption[]
  running?: boolean
  streamingContent?: string
  error?: string
  onSelectAgent: (agentId: string) => void
  onAddAgent?: (agent: AtelierAgentOption) => void
  onSendMessage: (agentId: string, message: string, attachments?: { name: string; type: 'text' | 'image'; content: string }[]) => void | Promise<void>
  onSaveImage?: (src: string) => void | Promise<void>
  onNewChat?: () => void
  onSearchChat?: () => void
  onSelectConversation?: (id: string) => void
  onRenameConversation?: (id: string, newTitle: string) => void
  onDeleteConversation?: (id: string) => void
  onRunTask?: (task: string, coordinatorAgentId: string, workerAgentIds: string[]) => void | Promise<void>
  onCreationTypeSelect?: (type: AtelierCreationType) => void
  initialImagePath?: string | null
}

export default function AtelierShell({
  agents,
  selectedAgentId,
  messages,
  agentEvents = [],
  documents = [],
  savedImages = [],
  conversations = [],
  running = false,
  streamingContent = '',
  error,
  onSelectAgent,
  onAddAgent,
  onSendMessage,
  onSaveImage,
  onNewChat,
  onSearchChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onRunTask,
  onCreationTypeSelect,
  initialImagePath,
}: Props) {
  const [draft, setDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [imageLightboxIndex, setImageLightboxIndex] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<{ name: string; type: 'text' | 'image'; content: string }[]>([])
  const [coordinatorAgentId, setCoordinatorAgentId] = useState(() => agents[0]?.id ?? '')
  const [workerAgentIds, setWorkerAgentIds] = useState<string[]>(() => agents.slice(1).map(a => a.id))
  const messageEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftInputRef = useRef<HTMLInputElement>(null)

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && Boolean(selectedAgent) && !running
  const isEmpty = messages.length === 0
  const showLandingBackground = isEmpty
  const chatImages = getMessageImages(messages, streamingContent)
  const imageLightboxSrc = imageLightboxIndex == null ? null : chatImages[imageLightboxIndex] ?? null

  function openImageLightbox(src: string) {
    const index = chatImages.indexOf(src)
    setImageLightboxIndex(index >= 0 ? index : null)
  }

  function stepImageLightbox(direction: -1 | 1) {
    if (chatImages.length === 0) return
    setImageLightboxIndex((current) => {
      const base = current ?? 0
      return (base + direction + chatImages.length) % chatImages.length
    })
  }

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  useEffect(() => {
    if (!imageLightboxSrc) return
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setImageLightboxIndex(null)
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepImageLightbox(-1)
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepImageLightbox(1)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [imageLightboxSrc, chatImages.length])

  function readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const content = await readAsDataURL(file)
        setAttachments(prev => [...prev, { name: file.name, type: 'image', content }])
      } else {
        const content = await readAsText(file)
        setAttachments(prev => [...prev, { name: file.name, type: 'text', content }])
      }
    }
    e.target.value = ''
  }

  function removeAttachment(name: string) {
    setAttachments(prev => prev.filter(a => a.name !== name))
  }

  async function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!canSend || !selectedAgent) return
    let message = draft.trim()
    
    // Bijlagen die tekst zijn voegen we nog steeds samen in het bericht
    const textAttachments = attachments.filter(a => a.type === 'text')
    if (textAttachments.length > 0) {
      message += textAttachments.map(a => `\n\n--- ${a.name} ---\n${a.content}`).join('')
    }
    
    const imageAttachments = attachments.filter(a => a.type === 'image')

    setDraft('')
    setAttachments([])
    requestAnimationFrame(() => draftInputRef.current?.focus())
    await onSendMessage(selectedAgent.id, message, imageAttachments)
    requestAnimationFrame(() => draftInputRef.current?.focus())
  }

  return (
    <div className="relative flex h-full w-full bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {showLandingBackground && <AnimatedPixelBackground />}

      {/* Main Content Area */}
      <main className={['flex-1 flex flex-col relative z-10 min-w-0 transition-[padding] duration-300', sidebarOpen ? 'pr-64' : 'pr-14'].join(' ')}>
        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 max-w-md w-full px-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-red-300 text-xs text-center shadow-lg backdrop-blur-md">
              {error}
            </div>
          </div>
        )}

        {/* Chat History Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 pb-40">
          {!isEmpty && (
            <div className="max-w-3xl mx-auto py-8 space-y-6">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} onImageOpen={openImageLightbox} onSaveImage={onSaveImage} />
              ))}
              {running && streamingContent.length > 0 && (() => {
                const streamParts = parseMessageContent(streamingContent)
                return (
                  <article className="flex w-full justify-start">
                    <div className="max-w-[85%] px-5 py-3.5 bg-transparent text-white/80">
                      {streamParts.map((part, i) =>
                        part.type === 'image' ? (
                          <button
                            key={i}
                            type="button"
                            onClick={() => openImageLightbox(part.value)}
                            className="group relative mt-1 block max-w-full cursor-pointer overflow-hidden rounded-xl border-0 bg-transparent p-0 text-left"
                            title="Afbeelding vergroten"
                          >
                            <img src={part.value} alt="Gegenereerde afbeelding" className="max-w-full rounded-xl" style={{ maxHeight: 512 }} />
                            <ExpandImageIcon />
                          </button>
                        ) : part.value ? (
                          <p key={i} className="text-[15px] leading-relaxed whitespace-pre-wrap">{part.value}</p>
                        ) : null
                      )}
                    </div>
                  </article>
                )
              })()}
              {running && streamingContent.length === 0 && <ThinkingBubble />}
              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          className={[
            'absolute left-0 right-0 px-4 sm:px-6 transition-all duration-500 ease-in-out flex flex-col items-center',
            isEmpty ? 'top-1/2 -translate-y-1/2' : 'bottom-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent pt-10 pb-8',
          ].join(' ')}
        >
          {isEmpty && (
            <h1 className="text-2xl sm:text-3xl font-medium text-white/90 mb-8 text-center tracking-tight">
              Let's huphefy some stuff.
            </h1>
          )}

          <div className="w-full max-w-3xl">
            <form
              onSubmit={handleSubmit}
              className="relative flex flex-col bg-[#1e1e1e] border border-white/[0.05] focus-within:border-white/[0.15] rounded-[2rem] px-4 py-2.5 transition-all shadow-sm"
            >
              {/* Attachment chips */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2 pt-0.5">
                  {attachments.map(a => (
                    <div key={a.name} className="flex items-center gap-1.5 bg-white/[0.08] rounded-full px-3 py-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50 flex-shrink-0">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span className="text-white/70 text-xs truncate max-w-[140px]">{a.name}</span>
                      <button type="button" onClick={() => removeAttachment(a.name)} className="text-white/30 hover:text-white/80 transition-colors leading-none ml-0.5">×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center">
                {/* Plus button — opens native file picker directly */}
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <input
                  ref={draftInputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything"
                  className="flex-1 bg-transparent border-none outline-none text-white text-base px-3 placeholder:text-white/40 min-w-0"
                />

                {/* Right Side Tools */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <AgentSelector
                    agents={agents}
                    selectedAgent={selectedAgent}
                    onSelectAgent={onSelectAgent}
                    onAddAgent={onAddAgent}
                  />

                  {/* Mic Icon */}
                  <button type="button" className="p-2 text-white/40 hover:text-white/80 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  </button>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={!canSend}
                    className={[
                      'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      canSend ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20',
                    ].join(' ')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="8" y1="12" x2="16" y2="12" stroke={canSend ? 'white' : 'currentColor'} strokeWidth="2" strokeLinecap="round" />
                      <line x1="12" y1="8" x2="12" y2="16" stroke={canSend ? 'white' : 'currentColor'} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
            {isEmpty && (
              <AtelierCreationModeButtons
                activeType={null}
                onSelect={(type) => onCreationTypeSelect?.(type)}
                className="mt-4"
              />
            )}
          </div>
        </div>
      </main>

      {/* Right Sidebar Panel */}
      <aside
        className={[
          'absolute top-0 right-0 bottom-0 z-30 flex flex-col transition-[width,border-color,background-color] duration-300 ease-in-out',
          sidebarOpen ? 'w-64 border-l border-white/[0.07] bg-[#111] shadow-2xl' : 'w-14 bg-transparent',
        ].join(' ')}
      >
        <div className={sidebarOpen ? 'flex items-center justify-between p-4 border-b border-white/[0.05]' : 'flex h-14 items-center justify-center'}>
          {sidebarOpen && <h2 className="text-white/80 font-medium text-sm">Menu</h2>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={sidebarOpen ? 'p-1.5 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/[0.05]' : 'flex h-9 w-9 items-center justify-center rounded-full text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors'}
            aria-label={sidebarOpen ? 'Menu inklappen' : 'Menu uitklappen'}
            title={sidebarOpen ? 'Menu inklappen' : 'Menu uitklappen'}
          >
            {sidebarOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

        <div className={sidebarOpen ? 'flex-1 p-3 space-y-1 overflow-y-auto' : 'flex-1 flex flex-col items-center gap-2 p-2'}>
          <button
            onClick={() => { onNewChat?.(); if (sidebarOpen) setSidebarOpen(false) }}
            className={sidebarOpen
              ? 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors text-sm'
              : 'flex h-10 w-10 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white'}
            aria-label="Nieuwe chat"
            title="Nieuwe chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {sidebarOpen && <span>New chat</span>}
          </button>

          <button
            onClick={() => { onSearchChat?.(); if (sidebarOpen) setSidebarOpen(false) }}
            className={sidebarOpen
              ? 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors text-sm'
              : 'flex h-10 w-10 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white'}
            aria-label="Zoeken"
            title="Zoeken"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {sidebarOpen && <span>Search chat</span>}
          </button>

          {sidebarOpen && conversations.length > 0 && (
            <div className="pt-4 mt-2 border-t border-white/[0.05]">
              <div className="px-3 pb-2">
                <span className="text-white/30 text-[10px] font-medium uppercase tracking-wider">Recent</span>
              </div>
              <div className="space-y-0.5">
                {conversations.map(conv => (
                  <ConversationRow
                    key={conv.id}
                    conversation={conv}
                    onSelect={() => { onSelectConversation?.(conv.id); setSidebarOpen(false) }}
                    onRename={(newTitle) => onRenameConversation?.(conv.id, newTitle)}
                    onDelete={() => onDeleteConversation?.(conv.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

      </aside>

      {imageLightboxSrc && (
        <div
          className="absolute inset-0 z-[80] flex items-center justify-center bg-black/82 p-5 backdrop-blur-md"
          onClick={() => setImageLightboxIndex(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white/70 transition-colors hover:bg-white/[0.14] hover:text-white"
            onClick={(e) => { e.stopPropagation(); setImageLightboxIndex(null) }}
            aria-label="Afbeelding sluiten"
            title="Sluiten"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {chatImages.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08] text-white/72 transition-colors hover:bg-white/[0.14] hover:text-white"
                onClick={(e) => { e.stopPropagation(); stepImageLightbox(-1) }}
                aria-label="Vorige afbeelding"
                title="Vorige afbeelding"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                className="absolute right-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08] text-white/72 transition-colors hover:bg-white/[0.14] hover:text-white"
                onClick={(e) => { e.stopPropagation(); stepImageLightbox(1) }}
                aria-label="Volgende afbeelding"
                title="Volgende afbeelding"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.10] bg-black/35 px-3 py-1 text-xs font-medium text-white/60 backdrop-blur-md">
                {(imageLightboxIndex ?? 0) + 1} / {chatImages.length}
              </div>
            </>
          )}
          <img
            src={imageLightboxSrc}
            alt="Gegenereerde afbeelding vergroot"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function AgentSelector({
  agents,
  selectedAgent,
  onSelectAgent,
  onAddAgent,
}: {
  agents: AtelierAgentOption[]
  selectedAgent?: AtelierAgentOption
  onSelectAgent: (agentId: string) => void
  onAddAgent?: (agent: AtelierAgentOption) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [orResults, setOrResults] = useState<AtelierAgentOption[]>([])
  const [orLoading, setOrLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setQuery(''); setOrResults([]) }
    else setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: globalThis.MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!q) { setOrResults([]); return }
    setOrLoading(true)
    const tid = setTimeout(async () => {
      try {
        const result = await (window as any).api.engine.searchOpenRouterModels(q)
        if (result.ok) setOrResults(result.models)
      } finally {
        setOrLoading(false)
      }
    }, 300)
    return () => clearTimeout(tid)
  }, [query])

  const q = query.trim().toLowerCase()
  const filteredAgents = q
    ? agents.filter(a => a.label.toLowerCase().includes(q) || a.model.toLowerCase().includes(q))
    : agents
  const newOrResults = orResults.filter(r => !agents.some(a => a.id === r.id))

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 text-white/55 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/85"
        title={selectedAgent ? `Model: ${selectedAgent.label}` : 'Model kiezen'}
        aria-label={selectedAgent ? `Model kiezen, huidig model ${selectedAgent.label}` : 'Model kiezen'}
        aria-expanded={open}
      >
        <ModelIcon agent={selectedAgent} />
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-80 rounded-2xl border border-white/[0.10] bg-[#151515] shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: 340 }}>
          {/* Search input */}
          <div className="p-2 border-b border-white/[0.06] flex-shrink-0">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek model…"
              className="w-full bg-white/[0.05] rounded-lg px-3 py-1.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
            />
          </div>

          <div className="overflow-y-auto flex-1 p-1.5">
            {/* Saved / DB agents */}
            {filteredAgents.length > 0 && (
              <>
                {q && <div className="px-2 pt-1.5 pb-0.5"><span className="text-white/20 text-[10px] uppercase tracking-wider">Opgeslagen</span></div>}
                {filteredAgents.map((agent) => {
                  const selected = agent.id === selectedAgent?.id
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => { onSelectAgent(agent.id); setOpen(false) }}
                      className={['flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'].join(' ')}
                    >
                      <ModelIcon agent={agent} />
                      <div className="min-w-0 flex-1">
                        <p className={['truncate text-sm font-medium', selected ? 'text-white/90' : 'text-white/72'].join(' ')}>{agent.label}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{agent.model}</p>
                      </div>
                      {selected && (
                        <svg className="flex-shrink-0 text-[#facc15]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </>
            )}

            {/* OpenRouter live results */}
            {q && (
              <>
                <div className="px-2 pt-2 pb-0.5 flex items-center gap-2">
                  <span className="text-white/20 text-[10px] uppercase tracking-wider">OpenRouter</span>
                  {orLoading && <span className="text-white/20 text-[10px]">…</span>}
                </div>
                {!orLoading && newOrResults.length === 0 && (
                  <p className="px-3 py-2 text-xs text-white/25">Geen nieuwe modellen gevonden</p>
                )}
                {newOrResults.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => { onAddAgent?.(agent); setOpen(false) }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <ModelIcon agent={agent} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white/72">{agent.label}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{agent.model}</p>
                    </div>
                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/35">+ voeg toe</span>
                  </button>
                ))}
              </>
            )}

            {!q && agents.length === 0 && (
              <p className="px-3 py-2 text-xs text-white/35">Geen modellen beschikbaar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelIcon({ agent }: { agent?: AtelierAgentOption }) {
  const icon = getModelIcon(agent)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [icon.url])

  if (icon.url && !failed) {
    return (
      <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/[0.12] bg-white">
        <img
          src={icon.url}
          alt=""
          className="h-5 w-5 object-contain"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return (
    <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.07] px-1.5 text-[9px] font-bold text-white/72">
      {icon.fallback.slice(0, 3)}
    </span>
  )
}

function getModelIcon(agent?: AtelierAgentOption): { url?: string; fallback: string } {
  const provider = getModelProvider(agent)
  const fallback = getModelFallback(agent, provider)
  const directDomain = {
    ollama: 'ollama.com',
    openai: 'chatgpt.com',
    anthropic: 'claude.ai',
    google: 'gemini.google.com',
    meta: 'meta.ai',
    mistral: 'mistral.ai',
    deepseek: 'deepseek.com',
    qwen: 'chat.qwen.ai',
    xai: 'x.ai',
    zai: 'chat.z.ai',
    openrouter: 'openrouter.ai',
  }[provider]
  const modelSlug = getModelSlug(agent)
  const slugDomain = modelSlug ? getProviderDomain(modelSlug) : undefined
  const domain = directDomain ?? slugDomain

  return {
    url: domain ? `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}` : undefined,
    fallback,
  }
}

function getModelSlug(agent?: AtelierAgentOption): string {
  const model = agent?.model || agent?.id || ''
  const first = model.split('/')[0]?.toLowerCase() ?? ''
  return first.replace(/[^a-z0-9.-]/g, '')
}

function getProviderDomain(slug: string): string | undefined {
  const domains: Record<string, string> = {
    alibaba: 'qwen.ai',
    amazon: 'aws.amazon.com',
    baidu: 'baidu.com',
    cohere: 'cohere.com',
    deepseek: 'deepseek.com',
    google: 'gemini.google.com',
    groq: 'groq.com',
    meta: 'meta.ai',
    'meta-llama': 'meta.ai',
    microsoft: 'microsoft.com',
    mistral: 'mistral.ai',
    moonshotai: 'moonshot.ai',
    nousresearch: 'nousresearch.com',
    openai: 'chatgpt.com',
    openrouter: 'openrouter.ai',
    perplexity: 'perplexity.ai',
    qwen: 'chat.qwen.ai',
    rekaai: 'reka.ai',
    stabilityai: 'stability.ai',
    xai: 'x.ai',
    'x-ai': 'x.ai',
    zhipuai: 'z.ai',
  }
  return domains[slug]
}

function getModelFallback(agent: AtelierAgentOption | undefined, provider: string): string {
  const modelName = (agent?.model || agent?.label || provider || 'LLM')
    .split('/')
    .pop()
    ?.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    ?? 'LLM'
  const compact = modelName.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase()
  return compact || 'LLM'
}

function getModelProvider(agent?: AtelierAgentOption): string {
  const value = `${agent?.id ?? ''} ${agent?.model ?? ''} ${agent?.label ?? ''}`.toLowerCase()
  if (value.includes('openrouter')) return 'openrouter'
  if (value.includes('ollama/')) return 'ollama'
  if (value.includes('openai/') || value.includes('gpt') || value.includes('chatgpt')) return 'openai'
  if (value.includes('anthropic/') || value.includes('claude')) return 'anthropic'
  if (value.includes('google/') || value.includes('gemini')) return 'google'
  if (value.includes('meta-llama') || value.includes('llama')) return 'meta'
  if (value.includes('mistral')) return 'mistral'
  if (value.includes('deepseek')) return 'deepseek'
  if (value.includes('qwen')) return 'qwen'
  if (value.includes('x-ai/') || value.includes('grok')) return 'xai'
  if (value.includes('z-ai/') || value.includes('glm')) return 'zai'
  return 'generic'
}

function ChevronDownIcon() {
  return (
    <svg className="flex-shrink-0 text-white/35" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ThinkingBubble() {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <article className="flex w-full justify-start">
      <div className="flex items-center gap-3 px-1 py-2">
        <style>{`
          @keyframes huphe-spin {
            0%   { transform: rotate(0deg); }
            45%  { transform: rotate(180deg); }
            65%  { transform: rotate(180deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <img
          src={spinnerSrc}
          alt=""
          style={{ width: 22, height: 22, animation: 'huphe-spin 1.2s ease-in-out infinite' }}
        />
        <span className="text-white/40 text-sm">
          {'Thinking' + '.'.repeat(dots)}
        </span>
      </div>
    </article>
  )
}

function parseMessageContent(content: string): { type: 'text' | 'image'; value: string }[] {
  const parts: { type: 'text' | 'image'; value: string }[] = []
  const regex = /\[IMAGE:(.*?)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    parts.push({ type: 'image', value: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) parts.push({ type: 'text', value: content.slice(lastIndex) })
  return parts
}

function getMessageImages(messages: AtelierChatMessage[], streamingContent: string): string[] {
  const images: string[] = []
  const seen = new Set<string>()
  const addFromContent = (content: string) => {
    for (const part of parseMessageContent(content)) {
      if (part.type !== 'image' || seen.has(part.value)) continue
      seen.add(part.value)
      images.push(part.value)
    }
  }
  messages.forEach((message) => addFromContent(message.content))
  if (streamingContent) addFromContent(streamingContent)
  return images
}

function SaveImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function ExpandImageIcon() {
  return (
    <span className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-black/35 text-white/70 opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    </span>
  )
}

function ChatBubble({ message, onImageOpen, onSaveImage }: { message: AtelierChatMessage; onImageOpen?: (src: string) => void; onSaveImage?: (src: string) => void | Promise<void> }) {
  const isUser = message.role === 'user'
  const parts = parseMessageContent(message.content)

  return (
    <article className={['flex w-full', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <div
        className={[
          'max-w-[85%] px-5 py-3.5',
          isUser
            ? 'bg-[#1e1e1e] rounded-[24px] text-white/90'
            : 'bg-transparent text-white/80',
        ].join(' ')}
      >
        {!isUser && message.agentLabel && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-white/[0.1] flex items-center justify-center flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <p className="text-white/50 text-xs font-medium">{message.agentLabel}</p>
          </div>
        )}
        {parts.map((part, i) =>
          part.type === 'image' ? (
            <div key={i} className="group relative mt-1 inline-block max-w-full">
              <button
                type="button"
                onClick={() => onImageOpen?.(part.value)}
                className="relative block max-w-full cursor-pointer overflow-hidden rounded-xl border-0 bg-transparent p-0 text-left"
                title="Afbeelding vergroten"
              >
                <img
                  src={part.value}
                  alt="Gegenereerde afbeelding"
                  className="max-w-full rounded-xl"
                  style={{ maxHeight: 512 }}
                />
                <ExpandImageIcon />
              </button>
              {onSaveImage && (
                <button
                  type="button"
                  onClick={() => onSaveImage(part.value)}
                  className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-black/35 text-white/70 opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100 hover:text-white hover:bg-black/60"
                  title="Afbeelding opslaan"
                >
                  <SaveImageIcon />
                </button>
              )}
            </div>
          ) : part.value ? (
            <p key={i} className="text-[15px] leading-relaxed whitespace-pre-wrap">{part.value}</p>
          ) : null
        )}
      </div>
    </article>
  )
}

function ConversationRow({
  conversation,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: AtelierConversationOption
  onSelect: () => void
  onRename: (newTitle: string) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)

  const handleSave = () => {
    setIsEditing(false)
    if (draft.trim() !== '' && draft !== conversation.title) {
      onRename(draft.trim())
    } else {
      setDraft(conversation.title)
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center px-2 py-1.5 bg-white/[0.05] rounded-lg">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') { setIsEditing(false); setDraft(conversation.title) }
          }}
          onBlur={handleSave}
          className="w-full bg-transparent border-none outline-none text-white text-xs"
        />
      </div>
    )
  }

  return (
    <div className="group relative w-full">
      <button
        onClick={onSelect}
        className="w-full text-left truncate px-3 py-2 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.05] transition-colors text-xs pr-14"
      >
        {conversation.title || 'Nieuw gesprek'}
      </button>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
          className="p-1 text-white/40 hover:text-white/90 transition-colors"
          title="Hernoemen"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 text-white/40 hover:text-red-400 transition-colors"
          title="Verwijderen"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
