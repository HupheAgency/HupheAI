import { useEffect, useMemo, useRef, useState } from 'react'

export type AgentEventType =
  | 'task_assigned'
  | 'handoff'
  | 'result'
  | 'error'
  | 'thought'
  | 'tool'
  | 'file_read'
  | 'file_write'
  | 'memory_update'

export interface AgentEvent {
  id: string
  fromAgent: string
  toAgent?: string
  type: AgentEventType
  content: string
  createdAt: string
}

interface Props {
  events: AgentEvent[]
  loading?: boolean
}

const TYPE_META: Record<AgentEventType, { label: string; className: string }> = {
  task_assigned: { label: 'Taak', className: 'bg-blue-500/[0.12] text-blue-300 border-blue-500/20' },
  handoff: { label: 'Overdracht', className: 'bg-purple-500/[0.12] text-purple-300 border-purple-500/20' },
  result: { label: 'Resultaat', className: 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/20' },
  error: { label: 'Fout', className: 'bg-red-500/[0.12] text-red-300 border-red-500/20' },
  thought: { label: 'Gedachte', className: 'bg-white/[0.06] text-white/45 border-white/[0.07]' },
  tool: { label: 'Tool', className: 'bg-white/[0.06] text-white/45 border-white/[0.07]' },
  file_read: { label: 'Lezen', className: 'bg-white/[0.06] text-white/45 border-white/[0.07]' },
  file_write: { label: 'Schrijven', className: 'bg-white/[0.06] text-white/45 border-white/[0.07]' },
  memory_update: { label: 'Memory', className: 'bg-white/[0.06] text-white/45 border-white/[0.07]' },
}

export default function AgentEventsFeed({ events, loading = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const sortedEvents = useMemo(() => (
    [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  ), [events])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [sortedEvents.length, loading])

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div>
          <h2 className="text-white text-sm font-semibold tracking-tight">Agent activiteit</h2>
          <p className="text-white/35 text-xs mt-1">{sortedEvents.length} event{sortedEvents.length === 1 ? '' : 's'}</p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
          <span className={['h-2 w-2 rounded-full bg-emerald-400', sortedEvents.length > 0 ? 'animate-pulse' : 'opacity-30'].join(' ')} />
          <span className="text-white/40 text-xs">Live</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <SkeletonRows />
        ) : sortedEvents.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {sortedEvents.map((event) => (
              <AgentEventRow
                key={event.id}
                event={event}
                expanded={expandedIds.has(event.id)}
                onToggle={() => toggleExpanded(event.id)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </section>
  )
}

function AgentEventRow({
  event,
  expanded,
  onToggle,
}: {
  event: AgentEvent
  expanded: boolean
  onToggle: () => void
}) {
  const meta = TYPE_META[event.type]
  const hasMore = event.content.length > 180 || event.content.includes('\n')

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#141414] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-white/60 text-xs font-medium">
          {event.toAgent ? `${event.fromAgent} → ${event.toAgent}` : event.fromAgent}
        </span>
        <span className={['rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', meta.className].join(' ')}>
          {meta.label}
        </span>
        <time className="ml-auto text-white/25 text-xs" dateTime={event.createdAt}>
          {formatTime(event.createdAt)}
        </time>
      </div>

      <p
        className="mt-3 text-white/60 text-sm leading-relaxed whitespace-pre-wrap"
        style={expanded ? undefined : {
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        } as React.CSSProperties}
      >
        {event.content}
      </p>

      {hasMore && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 text-white/30 hover:text-white/60 text-xs transition-colors"
        >
          {expanded ? 'Minder tonen' : 'Meer tonen'}
        </button>
      )}
    </article>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-white/[0.07] bg-[#141414] p-4 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="h-6 w-32 rounded-full bg-white/[0.06]" />
            <div className="h-6 w-20 rounded-full bg-white/[0.06]" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-white/[0.05]" />
            <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center">
      <p className="max-w-xs text-center text-white/35 text-sm leading-relaxed">
        Nog geen agent-activiteit. Start een taak om agents aan het werk te zetten.
      </p>
    </div>
  )
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
