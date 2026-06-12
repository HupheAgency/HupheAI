import SlideCommentThread from './SlideCommentThread'

interface SavedComment {
  id: string
  author: string
  body: string
  createdAt: string
  resolved: boolean
  position?: { x: number; y: number }
  drawing?: { type: string; points: number[]; color: string; strokeWidth?: number }
  drawings?: { type: string; points: number[]; color: string; strokeWidth?: number }[]
  highlight?: { x: number; y: number; w: number; h: number }
}

interface FeedbackTabPanelProps {
  activeSlideIdx: number
  activeSlideLabel: string
  activeSlideHeading: string
  activeComments: SavedComment[]
  commentDraft: string
  isPlacingComment: boolean
  annotatingCommentId: string | null
  onCommentDraftChange: (value: string) => void
  onAddCommentDraw: () => void
  onAddCommentHighlight: () => void
  onBeginPlacingComment: () => void
  onStopPlacingComment: () => void
  onResolveComment: (id: string) => void
  onDeleteComment: (id: string) => void
  onStartDrawAnnotation: (commentId: string) => void
  onStartHighlightAnnotation: (commentId: string) => void
  onHoverComment: (id: string | null) => void
}

type SlideCommentThreadProps = Parameters<typeof SlideCommentThread>[0]

function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function HighlightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="8" width="20" height="8" rx="1.5" />
      <line x1="6" y1="8" x2="6" y2="4" />
      <line x1="18" y1="8" x2="18" y2="4" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2" />
    </svg>
  )
}

export default function FeedbackTabPanel({
  activeSlideIdx,
  activeSlideLabel,
  activeSlideHeading,
  activeComments,
  commentDraft,
  isPlacingComment,
  annotatingCommentId,
  onCommentDraftChange,
  onAddCommentDraw,
  onAddCommentHighlight,
  onBeginPlacingComment,
  onStopPlacingComment,
  onResolveComment,
  onDeleteComment,
  onStartDrawAnnotation,
  onStartHighlightAnnotation,
  onHoverComment,
}: FeedbackTabPanelProps) {
  const draftIsEmpty = commentDraft.trim().length === 0
  const actionDisabled = draftIsEmpty || isPlacingComment
  const openCommentCount = activeComments.filter((comment) => !comment.resolved).length

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      <section
        className={[
          'rounded-xl border p-3 space-y-2.5',
          isPlacingComment
            ? 'bg-[#18150a] border-[#facc15]/35'
            : 'bg-[#141414] border-white/[0.07]',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#facc15]/70">
            {activeSlideLabel}
          </span>
          <p className="flex-1 truncate text-xs font-semibold text-white/75">
            {activeSlideHeading}
          </p>
          {openCommentCount > 0 && (
            <span className="font-mono text-[10px] text-white/30">
              {openCommentCount} open
            </span>
          )}
          {isPlacingComment && (
            <span className="rounded-full border border-[#facc15]/20 bg-[#facc15]/12 px-2 py-0.5 text-[10px] font-semibold text-[#facc15]">
              plaats pin
            </span>
          )}
        </div>

        <textarea
          value={commentDraft}
          onChange={(event) => onCommentDraftChange(event.target.value)}
          disabled={isPlacingComment}
          rows={3}
          placeholder="Nieuwe feedback..."
          className="w-full resize-none bg-[#0f0f0f] border border-white/[0.07] focus:border-[#facc15]/40 rounded-xl text-white/70 text-xs p-3 outline-none transition-colors placeholder:text-white/25 disabled:opacity-45"
        />

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onAddCommentDraw}
            disabled={actionDisabled}
            className="h-10 text-xs border border-white/[0.08] bg-white/[0.03] text-white/42 hover:bg-[#facc15] hover:border-[#facc15] hover:text-black disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white/[0.03] disabled:hover:border-white/[0.08] disabled:hover:text-white/42 rounded-lg px-3 transition-colors flex items-center justify-center gap-1.5"
          >
            <PenIcon />
            Tekening
          </button>

          <button
            type="button"
            onClick={onAddCommentHighlight}
            disabled={actionDisabled}
            className="h-10 text-xs border border-white/[0.08] bg-white/[0.03] text-white/42 hover:bg-[#facc15] hover:border-[#facc15] hover:text-black disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white/[0.03] disabled:hover:border-white/[0.08] disabled:hover:text-white/42 rounded-lg px-3 transition-colors flex items-center justify-center gap-1.5"
          >
            <HighlightIcon />
            Arceren
          </button>

          <button
            type="button"
            onClick={onBeginPlacingComment}
            disabled={actionDisabled}
            className="h-10 bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-35 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-lg px-3 transition-colors flex items-center justify-center gap-1.5"
          >
            <PinIcon />
            Plaats opmerking
          </button>
        </div>

        {isPlacingComment && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onStopPlacingComment}
              className="text-white/30 hover:text-white/65 text-xs border border-white/[0.08] hover:border-white/20 rounded-lg px-3 py-2 transition-colors"
            >
              Annuleer pin plaatsen
            </button>
          </div>
        )}
      </section>

      {activeComments.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-[#141416] overflow-hidden">
          <div className="px-3.5 py-3">
            <SlideCommentThread
              slideIndex={activeSlideIdx}
              comments={activeComments as SlideCommentThreadProps['comments']}
              onResolve={onResolveComment}
              onDelete={onDeleteComment}
              onStartDraw={onStartDrawAnnotation}
              onStartHighlight={onStartHighlightAnnotation}
              annotatingCommentId={annotatingCommentId}
              onHoverComment={onHoverComment}
            />
          </div>
        </div>
      )}
    </div>
  )
}
