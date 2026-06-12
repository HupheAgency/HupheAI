import React from 'react'
import type { useMeetingNotes } from '../hooks/useMeetingNotes'

interface MeetingNotesDrawerProps {
  meeting: ReturnType<typeof useMeetingNotes>
  projectName: string | null
  onClose: () => void
}

export default function MeetingNotesDrawer({ meeting, projectName, onClose }: MeetingNotesDrawerProps) {
  return (
    <div className="fixed inset-0 z-[10000] flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] h-full bg-[#111113] border-l border-white/[0.08] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span className="text-white text-sm font-semibold">Meeting notulen</span>
            {meeting.chunks.length > 0 && (
              <span className="bg-white/[0.06] text-white/40 text-[11px] font-mono rounded px-1.5 py-0.5">
                {meeting.chunks.length} fragmenten
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {meeting.error && (
            <div className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
              {meeting.error}
            </div>
          )}

          {/* Structured notes (after summarize) */}
          {meeting.notes.length > 0 && meeting.notes.map((n) => (
            <div key={n.slideIdx} className="rounded-xl border border-white/[0.07] bg-[#161618] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-[#1a1a1c]">
                <span className="font-mono text-[10px] text-white/25">
                  {String(n.slideIdx + 1).padStart(2, '0')}
                </span>
                <span className="text-white/80 text-xs font-medium truncate">{n.slideHeading}</span>
              </div>
              <ul className="px-4 py-3 space-y-1.5">
                {n.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-white/60 text-xs leading-relaxed">
                    <span className="text-white/20 mt-0.5 flex-shrink-0">–</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Raw chunks (before summarize) */}
          {meeting.notes.length === 0 && meeting.chunks.length > 0 && (() => {
            const bySlide = new Map<number, { heading: string; texts: string[] }>()
            for (const c of meeting.chunks) {
              if (!bySlide.has(c.slideIdx)) bySlide.set(c.slideIdx, { heading: c.slideHeading, texts: [] })
              bySlide.get(c.slideIdx)!.texts.push(c.text)
            }
            return [...bySlide.entries()].sort(([a], [b]) => a - b).map(([idx, { heading, texts }]) => (
              <div key={idx} className="rounded-xl border border-white/[0.07] bg-[#161618] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-[#1a1a1c]">
                  <span className="font-mono text-[10px] text-white/25">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="text-white/80 text-xs font-medium truncate">{heading}</span>
                  <span className="ml-auto text-white/20 text-[10px]">{texts.length}×</span>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {texts.map((t, i) => (
                    <p key={i} className="text-white/45 text-xs leading-relaxed italic">&ldquo;{t}&rdquo;</p>
                  ))}
                </div>
              </div>
            ))
          })()}

          {meeting.chunks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <p className="text-white/25 text-xs leading-relaxed max-w-[200px]">
                Klik op <strong className="text-white/40">Notulen</strong> in de header om te beginnen met opnemen
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {meeting.chunks.length > 0 && (
          <div className="flex-shrink-0 border-t border-white/[0.07] px-5 py-3.5 flex items-center gap-2">
            <button
              onClick={meeting.summarize}
              disabled={meeting.summarizing}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-400/10 hover:bg-amber-400/15 text-amber-400 hover:text-amber-300 border border-amber-400/20 hover:border-amber-400/40 rounded-xl py-2.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {meeting.summarizing ? (
                <>
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Samenvatten…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  AI samenvatten
                </>
              )}
            </button>
            {meeting.notes.length > 0 && (
              <button
                onClick={() => {
                  const md = meeting.notes
                    .map((n) => `## Slide ${n.slideIdx + 1} — ${n.slideHeading}\n${n.bullets.map((b) => `- ${b}`).join('\n')}`)
                    .join('\n\n')
                  const blob = new Blob([md], { type: 'text/markdown' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'notulen.md'; a.click()
                  URL.revokeObjectURL(url)
                }}
                className="flex items-center gap-1.5 text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-xl px-3 py-2.5 text-xs transition-colors"
                title="Download als Markdown"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
            <button
              onClick={() => {
                let txt = ''
                if (meeting.notes.length > 0) {
                  txt = meeting.notes.map((n) =>
                    `Slide ${n.slideIdx + 1} — ${n.slideHeading}\n${n.bullets.map((b) => `• ${b}`).join('\n')}`
                  ).join('\n\n')
                } else {
                  const bySlide = new Map<number, { heading: string; texts: string[] }>()
                  for (const c of meeting.chunks) {
                    if (!bySlide.has(c.slideIdx)) bySlide.set(c.slideIdx, { heading: c.slideHeading, texts: [] })
                    bySlide.get(c.slideIdx)!.texts.push(c.text)
                  }
                  txt = [...bySlide.entries()].sort(([a], [b]) => a - b)
                    .map(([idx, { heading, texts }]) => `Slide ${idx + 1} — ${heading}\n${texts.join('\n')}`)
                    .join('\n\n')
                }
                const blob = new Blob([txt], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `${projectName ?? 'notulen'}.txt`; a.click()
                URL.revokeObjectURL(url)
              }}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-xl px-3 py-2.5 text-xs transition-colors"
              title="Download notities als .txt"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              .txt
            </button>
            <button
              onClick={meeting.clear}
              className="text-white/25 hover:text-red-400/70 border border-white/[0.06] hover:border-red-500/20 rounded-xl px-3 py-2.5 text-xs transition-colors"
              title="Wis alle notulen"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
