export interface DrawingAnnotation {
  type: 'circle' | 'line' | 'arrow' | 'pen'
  points: number[]
  color: string
  strokeWidth?: number
}

export interface TextHighlight {
  x: number; y: number; w: number; h: number
}

interface Comment {
  id: string
  author: string
  body: string
  createdAt: string
  resolved: boolean
  position?: { x: number; y: number }
  drawing?: DrawingAnnotation
  drawings?: DrawingAnnotation[]
  highlight?: TextHighlight
}

interface Props {
  slideIndex: number
  comments: Comment[]
  onResolve: (id: string) => void
  onDelete: (id: string) => void
  onStartDraw: (commentId: string) => void
  onStartHighlight: (commentId: string) => void
  annotatingCommentId?: string | null
  onHoverComment?: (id: string | null) => void
}

function formatTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function SlideCommentThread({
  slideIndex,
  comments,
  onAdd,
  onResolve,
  onDelete,
  onStartDraw,
  onStartHighlight,
  annotatingCommentId,
  onHoverComment,
}: Props) {
  const openCount = comments.filter((c) => !c.resolved).length

  return (
    <section className="bg-[#141414] border border-white/[0.07] rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            Slide {slideIndex + 1} — Opmerkingen
          </p>
          <p className="text-white/35 text-xs mt-0.5">Feedback en reviewpunten</p>
        </div>
        <span
          className={[
            'text-[10px] font-semibold rounded-xl px-2 py-1 flex-shrink-0',
            openCount > 0 ? 'bg-[#facc15] text-black' : 'bg-white/[0.08] text-white/40',
          ].join(' ')}
        >
          {openCount} open
        </span>
      </header>

      <div className="max-h-[400px] overflow-y-auto">
        {comments.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-white/35 text-sm">Nog geen opmerkingen op deze slide.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {comments.map((comment) => (
              <article
                key={comment.id}
                className="px-4 py-3 group"
                onMouseEnter={() => onHoverComment?.(comment.id)}
                onMouseLeave={() => onHoverComment?.(null)}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={comment.resolved ? 'text-white/30 text-xs font-medium' : 'text-white/70 text-xs font-medium'}>
                      {comment.author}
                      <span className="text-white/25 font-normal ml-2">{formatTime(comment.createdAt)}</span>
                      {(comment.drawing || (comment.drawings?.length ?? 0) > 0) && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[#facc15]/70" title="Tekening gekoppeld">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                        </span>
                      )}
                      {comment.highlight && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[#60a5fa]/70" title="Tekst gearceerd">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="2" y="8" width="20" height="8" rx="1"/>
                          </svg>
                        </span>
                      )}
                      {comment.position && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[#facc15]/70" title="Pin op slide">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12z"/>
                            <circle cx="12" cy="9" r="2"/>
                          </svg>
                        </span>
                      )}
                    </p>
                    <p
                      className={[
                        'text-xs leading-relaxed mt-1.5 whitespace-pre-wrap',
                        comment.resolved ? 'text-white/30 line-through' : 'text-white/55',
                      ].join(' ')}
                    >
                      {comment.body}
                    </p>
                  </div>

                  {!comment.resolved && (
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Pen/draw icon */}
                      <button
                        type="button"
                        onClick={() => onStartDraw(comment.id)}
                        title="Tekening toevoegen"
                        className={[
                          'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
                          annotatingCommentId === comment.id
                            ? 'bg-[#facc15] text-black'
                            : comment.drawing || (comment.drawings?.length ?? 0) > 0
                              ? 'text-[#facc15]/60 hover:text-[#facc15] hover:bg-white/[0.06]'
                              : 'text-white/30 hover:text-white/65 hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                      </button>

                      {/* Highlight/text icon */}
                      <button
                        type="button"
                        onClick={() => onStartHighlight(comment.id)}
                        title="Tekst arceren"
                        className={[
                          'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
                          comment.highlight
                            ? 'text-[#60a5fa]/70 hover:text-[#60a5fa] hover:bg-white/[0.06]'
                            : 'text-white/30 hover:text-white/65 hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="8" width="20" height="8" rx="1.5"/>
                          <line x1="6" y1="8" x2="6" y2="4"/><line x1="18" y1="8" x2="18" y2="4"/>
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => onResolve(comment.id)}
                        className="text-white/30 hover:text-[#facc15] text-[11px] border border-white/[0.07] hover:border-[#facc15]/30 rounded-lg px-2 py-1 transition-colors"
                      >
                        Oplossen
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(comment.id)}
                    title="Opmerking verwijderen"
                    className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-white/18 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

    </section>
  )
}
