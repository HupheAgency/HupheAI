import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface Props {
  name: string
  savedAt: string
  isLive?: boolean
  isShared?: boolean
  slideCount?: number
  preview?: ReactNode
  onClick: () => void
  onDelete?: () => void
  loading?: boolean
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function ProjectThumbnailCard({
  name,
  savedAt,
  isLive,
  isShared,
  slideCount,
  preview,
  onClick,
  onDelete,
  loading,
}: Props) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (loading) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <article
      role="button"
      tabIndex={loading ? -1 : 0}
      aria-disabled={loading}
      onClick={() => { if (!loading) onClick() }}
      onKeyDown={handleKeyDown}
      className={[
        'group bg-[#141414] hover:bg-[#1a1a1a] border border-white/[0.07] hover:border-[#facc15]/20 rounded-2xl overflow-hidden transition-colors cursor-pointer outline-none focus:border-[#facc15]/40 focus:ring-1 focus:ring-[#facc15]/20',
        loading ? 'pointer-events-none' : '',
      ].join(' ')}
    >
      <div className="relative h-32 bg-[#0d0d0d] overflow-hidden">
        {preview ? <ProjectPreviewFrame>{preview}</ProjectPreviewFrame> : <ProjectPreviewPlaceholder />}

        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#141414] to-transparent pointer-events-none" />

        {onDelete && !loading && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`${name} verwijderen`}
            className="absolute right-3 top-3 w-8 h-8 rounded-xl bg-black/55 border border-white/[0.10] text-white/35 hover:text-red-400 hover:border-red-500/30 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
            ) : (
              <p className="text-white/90 text-sm font-medium truncate">
                {name}
              </p>
            )}
          </div>

          {slideCount !== undefined && !loading && (
            <span className="text-white/25 text-[10px] flex-shrink-0 mt-0.5">
              {slideCount} slides
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-2">
          {loading ? (
            <div className="h-3 w-28 rounded bg-white/[0.05] animate-pulse" />
          ) : (
            <p className="text-white/30 text-xs truncate">
              {formatDate(savedAt)}
            </p>
          )}

          {!loading && (isLive || isShared) && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {isLive && (
                <span className="inline-flex items-center gap-1.5 text-green-400 text-[10px] font-medium">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                  </span>
                  Live
                </span>
              )}

              {isShared && (
                <span className="text-blue-400/70 text-[10px] font-medium">
                  Gedeeld
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function ProjectPreviewFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const update = () => {
      const rect = frame.getBoundingClientRect()
      setScale(Math.min(rect.width / 1920, rect.height / 1080))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        ref={frameRef}
        className="relative w-[82%] aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-[#111111] shadow-2xl pointer-events-none"
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            opacity: scale > 0 ? 1 : 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function ProjectPreviewPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-[74%] aspect-video rounded-xl border border-white/[0.07] bg-[#111111] shadow-2xl p-4">
        <div className="h-2 w-1/2 rounded-full bg-white/[0.18]" />
        <div className="mt-4 grid grid-cols-[1.2fr_0.8fr] gap-3">
          <div className="space-y-2">
            <div className="h-1.5 w-full rounded-full bg-white/[0.10]" />
            <div className="h-1.5 w-5/6 rounded-full bg-white/[0.08]" />
            <div className="h-1.5 w-2/3 rounded-full bg-white/[0.06]" />
          </div>
          <div className="rounded-lg bg-[#facc15]/[0.14] border border-[#facc15]/20" />
        </div>
      </div>
    </div>
  )
}
