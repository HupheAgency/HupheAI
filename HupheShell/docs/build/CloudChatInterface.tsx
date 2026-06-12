import { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  agentLabel?: string
  content: string
  createdAt: string
}

export interface AgentOption {
  id: string
  label: string
}

interface Props {
  messages: ChatMessage[]
  agents: AgentOption[]
  selectedAgentId: string
  running?: boolean
  error?: string
  onSelectAgent: (id: string) => void
  onSendMessage: (agentId: string, message: string) => void | Promise<void>
}

export default function CloudChatInterface({
  messages,
  agents,
  selectedAgentId,
  running = false,
  error,
  onSelectAgent,
  onSendMessage,
}: Props) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]
  const canSend = draft.trim().length > 0 && Boolean(selectedAgent) && !running
  const empty = messages.length === 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, running])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend || !selectedAgent) return
    const message = draft.trim()
    setDraft('')
    await onSendMessage(selectedAgent.id, message)
  }

  return (
    <main className="relative flex h-screen w-full flex-col overflow-hidden bg-[#0a0a0a] text-white">
      {error && (
        <div className="absolute top-4 left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-center text-red-300 text-xs">
            {error}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-40 sm:px-6 md:px-8">
        {!empty && (
          <div className="mx-auto max-w-3xl space-y-6 py-8">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {running && <ThinkingBubble />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div
        className={[
          'absolute left-0 right-0 flex flex-col items-center px-4 transition-all duration-500 ease-in-out sm:px-6',
          empty ? 'top-1/2 -translate-y-1/2' : 'bottom-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent pt-10 pb-8',
        ].join(' ')}
      >
        {empty && (
          <h1 className="mb-8 text-center text-2xl font-medium tracking-tight text-white/90 sm:text-3xl">
            Ga verder waar je gebleven was.
          </h1>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-3xl items-center rounded-[2rem] border border-white/[0.07] bg-[#1e1e1e] px-4 py-2.5 shadow-sm transition-colors focus-within:border-white/15"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything"
            disabled={running}
            className="min-w-0 flex-1 border-none bg-transparent px-2 text-white text-base outline-none placeholder:text-white/25 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <select
              value={selectedAgent?.id ?? ''}
              onChange={(event) => onSelectAgent(event.target.value)}
              disabled={running || agents.length === 0}
              className="max-w-[130px] appearance-none bg-transparent pr-4 text-white/60 text-sm font-medium outline-none transition-colors hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-40 sm:max-w-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='rgba(255,255,255,0.4)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right center',
              }}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id} className="bg-[#111] text-white">
                  {agent.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={!canSend}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-colors disabled:bg-white/[0.06] disabled:text-white/25"
              aria-label="Verstuur bericht"
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <article className={['flex w-full', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <div
        className={[
          'max-w-[85%] px-5 py-3.5',
          isUser ? 'rounded-[24px] bg-[#1e1e1e] text-white/90' : 'bg-transparent text-white/80',
        ].join(' ')}
      >
        {!isUser && message.agentLabel && (
          <p className="mb-2 text-white/45 text-xs font-medium">{message.agentLabel}</p>
        )}
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
      </div>
    </article>
  )
}

function ThinkingBubble() {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setDots((value) => (value + 1) % 4), 500)
    return () => clearInterval(timer)
  }, [])

  return (
    <article className="flex w-full justify-start">
      <div className="px-1 py-2 text-white/40 text-sm">
        Thinking{'.'.repeat(dots)}
      </div>
    </article>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  )
}
