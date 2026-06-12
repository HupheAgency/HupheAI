import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import AtelierShell, {
  type AtelierAgentEvent,
  type AtelierAgentOption,
  type AtelierChatMessage,
  type AtelierConversationOption,
  type AtelierDocumentState,
} from '../components/AtelierShell'
import { type SavedImage } from '../components/DocumentStatePanel'
import SlideEditorPage from './SlideEditorPage'
import type { AtelierCreationType } from '../components/AtelierCreationModeButtons'
import { loadAtelierMediaProjects } from '../hooks/useAtelierMedia'

const api = (window as any).api

export default function AtelierPage({ initialImagePath, initialMediaProjectId, initialMediaProjectType, onShellLevelChange }: {
  initialImagePath?: string | null
  initialMediaProjectId?: string | null
  initialMediaProjectType?: AtelierCreationType | null
  onShellLevelChange?: (level: 'landing' | 'funnel' | 'editor') => void
}) {
  const [creationMode, setCreationMode] = useState<AtelierCreationType | null>(null)
  const [creationToken, setCreationToken] = useState(0)
  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const [agents, setAgents] = useState<AtelierAgentOption[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [messages, setMessages] = useState<AtelierChatMessage[]>([])
  const [agentEvents, setAgentEvents] = useState<AtelierAgentEvent[]>([])
  const [documents, setDocuments] = useState<AtelierDocumentState[]>([])
  const [running, setRunning] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null)
  const [conversations, setConversations] = useState<AtelierConversationOption[]>([])
  const [savedImages, setSavedImages] = useState<SavedImage[]>([])

  const conversationId = useRef<string | null>(null)
  const accessToken = useRef<string | null>(null)
  const userId = useRef<string | null>(null)
  const agentMap = useRef<Map<string, AtelierAgentOption>>(new Map())
  const historyRef = useRef<{ role: string; content: string }[]>([])

  // ── Open media project directly by ID ─────────────────────────────────────

  useEffect(() => {
    if (!initialMediaProjectId || !initialMediaProjectType) return
    setPendingImageSrc(null)
    setPendingProjectId(initialMediaProjectId)
    setCreationMode(initialMediaProjectType)
    setCreationToken((t) => t + 1)
  }, [initialMediaProjectId, initialMediaProjectType])

  // ── Open image from Documents ──────────────────────────────────────────────

  useEffect(() => {
    if (!initialImagePath) return
    const api = (window as any).api
    const src = api?.toHupheFileUrl
      ? api.toHupheFileUrl(initialImagePath)
      : initialImagePath.startsWith('huphe://')
        ? initialImagePath
        : `huphe://file/${encodeURIComponent(decodeURIComponent(initialImagePath.replace(/^file:\/\//, '')))}`
    const existing = loadAtelierMediaProjects().find(
      (p) => p.type === 'images' && (p.src === src || p.assets?.some((a) => a.src === src))
    )
    if (existing) {
      setPendingImageSrc(null)
      setPendingProjectId(existing.id)
    } else {
      setPendingImageSrc(src)
      setPendingProjectId(null)
    }
    setCreationMode('images')
    setCreationToken((t) => t + 1)
  }, [initialImagePath])

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      // Get auth session
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session) { setError('Niet ingelogd.'); return }
      accessToken.current = session.access_token
      userId.current = session.user.id

      // Load agents (Ollama first, then saved OpenRouter models, then cloud)
      const agentsRes = await api.engine.listAgents()
      if (!agentsRes.ok) { setError(agentsRes.error); return }
      setOllamaRunning(agentsRes.ollamaRunning ?? false)

      // Merge saved OpenRouter models from Settings
      const savedRaw = localStorage.getItem('huphe:saved-openrouter-models')
      const savedModels: AtelierAgentOption[] = savedRaw ? JSON.parse(savedRaw) : []
      const ollamaAgents = (agentsRes.agents as AtelierAgentOption[]).filter(a => a.id.startsWith('ollama/'))
      const cloudAgents = (agentsRes.agents as AtelierAgentOption[]).filter(a => !a.id.startsWith('ollama/'))
      const allAgents = [...ollamaAgents, ...savedModels, ...cloudAgents]

      setAgents(allAgents)
      allAgents.forEach((a) => agentMap.current.set(a.id, a))

      // Default: prefer glm4, fallback to first
      const glm4 = allAgents.find(a => a.id.toLowerCase().includes('glm4') || a.label.toLowerCase().includes('glm4'))
      setSelectedAgentId(glm4?.id ?? allAgents[0]?.id ?? '')

      // Start with no conversation, lazy create on first message
      conversationId.current = null
      setMessages([])
      setAgentEvents([])
      historyRef.current = []

      // Load existing document states
      const docsRes = await api.engine.listDocumentStates({ accessToken: session.access_token })
      if (docsRes.ok) {
        setDocuments(docsRes.documents.map(mapDocument))
      }

      // Load conversation history
      const convsRes = await api.engine.listConversations({ accessToken: session.access_token })
      if (convsRes.ok) {
        setConversations(convsRes.conversations.map((c: any) => ({
          id: c.id,
          title: c.title ?? 'Nieuw gesprek',
          updatedAt: c.created_at,
        })))
      }

      // Load saved images
      const imagesRes = await api.engine.listSavedImages()
      if (imagesRes.ok) setSavedImages(imagesRes.images)
    }
    init()
  }, [])

  // ── Supabase Realtime ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) return

    const msgChannel = supabase
      .channel('engine_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'engine_messages' }, (payload) => {
        const row = payload.new as any
        if (row.conversation_id !== conversationId.current) return
        const agent = row.agent_id ? agentMap.current.get(row.agent_id) : undefined
        const msg: AtelierChatMessage = {
          id: row.id,
          role: row.role,
          agentLabel: agent?.label,
          content: row.content,
          createdAt: row.created_at,
        }
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .subscribe()

    const evtChannel = supabase
      .channel('agent_conversations_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_conversations' }, (payload) => {
        const row = payload.new as any
        if (row.engine_conversation_id !== conversationId.current) return
        const fromAgent = row.from_agent_id ? (agentMap.current.get(row.from_agent_id)?.label ?? row.from_agent_id) : 'System'
        const toAgent = row.to_agent_id ? (agentMap.current.get(row.to_agent_id)?.label ?? row.to_agent_id) : undefined
        setAgentEvents(prev => [...prev, {
          id: row.id,
          fromAgent,
          toAgent,
          type: row.event_type,
          content: row.content,
          createdAt: row.created_at,
        }])
      })
      .subscribe()

    const docChannel = supabase
      .channel('document_states_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_states' }, (payload) => {
        const row = payload.new as any
        if (!row) return
        setDocuments(prev => {
          const idx = prev.findIndex(d => d.id === row.id)
          const doc = mapDocument(row)
          if (idx >= 0) { const next = [...prev]; next[idx] = doc; return next }
          return [doc, ...prev]
        })
      })
      .subscribe()

    return () => {
      supabase!.removeChannel(msgChannel)
      supabase!.removeChannel(evtChannel)
      supabase!.removeChannel(docChannel)
    }
  }, [])

  // ── Streaming + agent events from main process ─────────────────────────────

  useEffect(() => {
    const onMessageAdded = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (data.conversationId !== conversationId.current) return
      const agent = data.agentId ? agentMap.current.get(data.agentId) : undefined
      const msg: AtelierChatMessage = {
        id: data.id,
        role: data.role,
        agentLabel: agent?.label,
        content: data.content,
        createdAt: data.createdAt,
      }
      if (msg.role === 'assistant') setStreamingContent('')
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
    }
    const onStreamChunk = (e: Event) => {
      const { chunk, conversationId: chunkConvId } = (e as CustomEvent).detail
      if (chunkConvId !== conversationId.current) return
      setStreamingContent(prev => prev + chunk)
    }
    const onAgentEvent = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (data.conversationId !== conversationId.current) return
      const fromAgent = data.fromAgent ?? 'System'
      const toAgent = data.toAgent
      setAgentEvents(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        fromAgent,
        toAgent,
        type: data.type,
        content: data.content,
        createdAt: data.createdAt ?? new Date().toISOString(),
      }])
    }
    window.addEventListener('engine:message-added', onMessageAdded)
    window.addEventListener('engine:stream-chunk', onStreamChunk)
    window.addEventListener('engine:agent-event', onAgentEvent)
    return () => {
      window.removeEventListener('engine:message-added', onMessageAdded)
      window.removeEventListener('engine:stream-chunk', onStreamChunk)
      window.removeEventListener('engine:agent-event', onAgentEvent)
    }
  }, [])

  // ── Main-process push events ───────────────────────────────────────────────

  useEffect(() => {
    const onFileChanged = async (e: Event) => {
      const { path, content, checksum, status } = (e as CustomEvent).detail
      if (!accessToken.current || !userId.current) return

      // Upsert to Supabase directly from renderer (has authenticated client)
      await supabase!
        .from('document_states')
        .upsert(
          { user_id: userId.current, path, content, status, checksum, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,path' }
        )
    }

    window.addEventListener('engine:file-changed', onFileChanged)
    return () => window.removeEventListener('engine:file-changed', onFileChanged)
  }, [])

  // ── Send message ───────────────────────────────────────────────────────────

  const refreshConversations = useCallback(async () => {
    if (!accessToken.current) return
    const convsRes = await api.engine.listConversations({ accessToken: accessToken.current })
    if (convsRes.ok) {
      setConversations(convsRes.conversations.map((c: any) => ({
        id: c.id,
        title: c.title ?? 'Nieuw gesprek',
        updatedAt: c.updated_at,
      })))
    }
  }, [])

  const handleSendMessage = useCallback(async (agentId: string, message: string, attachments?: { name: string; type: 'text' | 'image'; content: string }[]) => {
    if (!accessToken.current) return

    // Lazy create conversation if it doesn't exist yet
    if (!conversationId.current) {
      const convRes = await api.engine.createConversation({
        accessToken: accessToken.current,
        title: 'Nieuw gesprek',
        source: 'chat',
      })
      if (!convRes.ok) { setError(convRes.error); return }
      conversationId.current = convRes.id
    }

    const currentConvId = conversationId.current
    const isFirstMessage = historyRef.current.length === 0
    setRunning(true)
    setError(undefined)

    const agent = agentMap.current.get(agentId)

    const result = await api.engine.sendMessage({
      accessToken: accessToken.current,
      conversationId: currentConvId,
      agentId,
      agentModel: agent?.model ?? agentId,
      agentLabel: agent?.label,
      agentSystemPrompt: (agent as any)?.systemPrompt ?? undefined,
      agentModality: agent?.modality,
      message,
      history: historyRef.current.slice(-20),
      attachments,
    })

    if (!result.ok) {
      setError(result.error)
    } else {
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: message },
        { role: 'assistant', content: result.content },
      ]

      // Auto-title: na het eerste bericht een titel genereren
      if (isFirstMessage && currentConvId && accessToken.current) {
        const convId = currentConvId
        const token = accessToken.current
        // Fire-and-forget: geen await zodat UI niet blokkeert
        ;(async () => {
          try {
            const titleResult = await api.engine.generateTitle({
              agentId,
              agentModel: agent?.model ?? agentId,
              message,
            })
            if (titleResult.ok && titleResult.title) {
              const title = titleResult.title.trim().replace(/^["']|["']$/g, '').slice(0, 60)
              await api.engine.renameConversation({ accessToken: token, conversationId: convId, title })
              await refreshConversations()
            }
          } catch {}
        })()
      }

      await refreshConversations()
    }

    setRunning(false)
    setStreamingContent('')
  }, [refreshConversations])

  // ── Add OpenRouter model ───────────────────────────────────────────────────

  const handleAddAgent = useCallback((agent: AtelierAgentOption) => {
    agentMap.current.set(agent.id, agent)
    setAgents((prev) => prev.some((a) => a.id === agent.id) ? prev : [...prev, agent])
    const saved: AtelierAgentOption[] = JSON.parse(localStorage.getItem('huphe:saved-openrouter-models') ?? '[]')
    if (!saved.some((m) => m.id === agent.id)) {
      localStorage.setItem('huphe:saved-openrouter-models', JSON.stringify([...saved, agent]))
    }
    setSelectedAgentId(agent.id)
  }, [])

  // ── New chat ───────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    conversationId.current = null
    setMessages([])
    setAgentEvents([])
    historyRef.current = []

    historyRef.current = []
  }, [])

  // ── Save image ─────────────────────────────────────────────────────────────

  const handleSaveImage = useCallback(async (src: string) => {
    const res = await api.engine.saveImage({ src })
    console.log('[Engine] save-image result:', res)
    if (res.ok) {
      const imagesRes = await api.engine.listSavedImages()
      console.log('[Engine] list-saved-images result:', imagesRes)
      if (imagesRes.ok) setSavedImages(imagesRes.images)
    } else {
      console.error('[Engine] save-image failed:', res.error)
    }
  }, [])

  // ── Search chat ────────────────────────────────────────────────────────────

  const handleSearchChat = useCallback(() => {
    console.log('[Engine] Search chat — not yet implemented')
  }, [])

  // ── Rename conversation ────────────────────────────────────────────────────

  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    if (!accessToken.current) return
    await api.engine.renameConversation({ accessToken: accessToken.current, conversationId: id, title: newTitle })
    await refreshConversations()
  }, [refreshConversations])

  // ── Delete conversation ────────────────────────────────────────────────────

  const handleDeleteConversation = useCallback(async (id: string) => {
    if (!accessToken.current) return
    await api.engine.deleteConversation({ accessToken: accessToken.current, conversationId: id })
    if (conversationId.current === id) {
      conversationId.current = null
      setMessages([])
      setAgentEvents([])
      historyRef.current = []
    }
    await refreshConversations()
  }, [refreshConversations])

  // ── Select conversation ────────────────────────────────────────────────────

  const handleSelectConversation = useCallback(async (id: string) => {
    if (!accessToken.current) return
    conversationId.current = id
    historyRef.current = []
    setMessages([])
    setAgentEvents([])

    const res = await api.engine.listMessages({ accessToken: accessToken.current, conversationId: id })
    if (!res.ok) return
    const loaded: AtelierChatMessage[] = res.messages.map((m: any) => {
      const agent = m.agent_id ? agentMap.current.get(m.agent_id) : undefined
      return { id: m.id, role: m.role, agentLabel: agent?.label, content: m.content, createdAt: m.created_at }
    })
    setMessages(loaded)
    historyRef.current = loaded
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))
  }, [])

  if (creationMode !== null) {
    return (
      <SlideEditorPage
        key={`creation-${creationToken}`}
        embedded
        onBack={() => { setCreationMode(null); setPendingImageSrc(null); setPendingProjectId(null) }}
        initialCreationType={creationMode}
        initialCreationToken={creationToken}
        onCreationTypeClear={() => { setCreationMode(null); setPendingImageSrc(null); setPendingProjectId(null) }}
        initialImageSrc={pendingImageSrc}
        initialMediaProjectId={pendingProjectId}
        onShellLevelChange={onShellLevelChange}
      />
    )
  }

  return (
    <div className="relative flex flex-col h-full w-full bg-[#0a0a0a]">
      {ollamaRunning === false && (
        <div className="flex items-center justify-between gap-4 px-5 py-2.5 bg-[#1a1200] border-b border-yellow-500/20 text-yellow-300 text-xs">
          <span>Ollama niet gevonden — installeer Ollama om lokale AI-modellen te gebruiken.</span>
          <button
            onClick={() => api.openExternal('https://ollama.com/download')}
            className="flex-shrink-0 px-3 py-1 rounded-full border border-yellow-500/40 hover:bg-yellow-500/10 transition-colors"
          >
            Installeer Ollama
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <AtelierShell
          agents={agents}
          selectedAgentId={selectedAgentId}
          messages={messages}
          agentEvents={agentEvents}
          documents={documents}
          savedImages={savedImages}
          running={running}
          streamingContent={streamingContent}
          error={error}
          onSelectAgent={setSelectedAgentId}
          onAddAgent={handleAddAgent}
          onSendMessage={handleSendMessage}
          onSaveImage={handleSaveImage}
          conversations={conversations}
          onNewChat={handleNewChat}
          onSearchChat={handleSearchChat}
          onSelectConversation={handleSelectConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
          onCreationTypeSelect={(type) => { setCreationMode(type); setCreationToken(t => t + 1) }}
          initialImagePath={initialImagePath}
        />
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapDocument(row: any): AtelierDocumentState {
  return {
    id: row.id,
    path: row.path,
    status: row.status,
    updatedAt: row.updated_at,
    content: row.content ?? '',
  }
}
