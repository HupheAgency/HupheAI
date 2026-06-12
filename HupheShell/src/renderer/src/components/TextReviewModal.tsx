import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type SageTagRole = string

export interface TextSegment {
  id: string
  text: string
  role: SageTagRole | null
  source: 'auto' | 'manual'
  _originalKey?: string  // bewaart de originele veldnaam als de rol via mapping is veranderd
}

interface Props {
  segments: TextSegment[]
  availableRoles: string[]
  availableLayouts?: string[]
  headingRoles?: Set<string>
  onConfirm: (segments: TextSegment[]) => void
  onCancel: () => void
}

export default function TextReviewModal({
  segments,
  availableRoles,
  availableLayouts = [],
  headingRoles,
  onConfirm,
  onCancel,
}: Props) {
  const [localSegments, setLocalSegments] = useState<TextSegment[]>(() => segments.map((segment) => ({ ...segment })))
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const missingCount = localSegments.filter(
    (segment) => segment.role === null || (segment.role === '__layout__' && !segment.text.trim())
  ).length

  useEffect(() => {
    setLocalSegments(segments.map((segment) => ({ ...segment })))
    setOpenSegmentId(null)
    setConfirmOpen(false)
  }, [segments])

  useEffect(() => {
    if (!openSegmentId) return

    function handlePointerDown(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenSegmentId(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenSegmentId(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openSegmentId])

  useEffect(() => {
    if (!confirmOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setConfirmOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [confirmOpen])

  function setSegmentRole(segmentId: string, role: SageTagRole | null) {
    setLocalSegments((current) => (
      current.map((segment) => (
        segment.id === segmentId
          ? { ...segment, role, source: 'manual' }
          : segment
      ))
    ))
    setOpenSegmentId(null)
  }

  function setSegmentText(segmentId: string, text: string) {
    setLocalSegments((current) =>
      current.map((segment) =>
        segment.id === segmentId ? { ...segment, text } : segment
      )
    )
  }

  function insertSegmentAfter(segmentId: string) {
    setLocalSegments((current) => {
      const idx = current.findIndex((s) => s.id === segmentId)
      if (idx === -1) return current
      const next = [...current]
      next.splice(idx + 1, 0, { id: `seg-${Date.now()}`, text: '', role: null, source: 'manual' })
      return next
    })
  }

  function handleBuild() {
    if (missingCount > 0) {
      setConfirmOpen(true)
      return
    }

    onConfirm(localSegments)
  }

  function handleConfirmAnyway() {
    setConfirmOpen(false)
    onConfirm(localSegments)
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col">
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <header className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-white/[0.07] px-6 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center">
            <button
              type="button"
              onClick={onCancel}
              className="text-white/50 hover:text-white text-sm border border-white/[0.07] hover:border-white/15 rounded-xl px-3.5 py-2 transition-colors"
            >
              ← Terug
            </button>
          </div>

          <div className="text-center">
            <h1 className="text-white text-base font-semibold tracking-tight">Controleer je tekst</h1>
            <p className="text-white/50 text-xs mt-1">Wijs labels toe en pas tekst aan</p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <span
              className={[
                'text-xs font-medium rounded-xl border px-3 py-1.5',
                missingCount > 0
                  ? 'text-red-400 bg-red-500/[0.08] border-red-500/20'
                  : 'text-white/40 bg-white/[0.04] border-white/[0.07]',
              ].join(' ')}
            >
              {missingCount} zonder label
            </span>

            <button
              type="button"
              onClick={handleBuild}
              className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
            >
              Bouwen →
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6">
        <article className="max-w-[794px] mx-auto my-8 bg-white shadow-2xl p-16">
          <div className="space-y-0">
            {localSegments.map((segment) => (
              <div key={segment.id}>
                <TextSegmentRow
                  segment={segment}
                  availableRoles={availableRoles}
                  availableLayouts={availableLayouts}
                  headingRoles={headingRoles}
                  isOpen={openSegmentId === segment.id}
                  dropdownRef={openSegmentId === segment.id ? dropdownRef : undefined}
                  onOpen={() => setOpenSegmentId((current) => (current === segment.id ? null : segment.id))}
                  onSelectRole={(role) => setSegmentRole(segment.id, role)}
                  onChangeText={(text) => setSegmentText(segment.id, text)}
                />
                {segment.role !== '__layout__' && (
                  <button
                    type="button"
                    onClick={() => insertSegmentAfter(segment.id)}
                    className="w-full flex items-center gap-2 py-0.5 opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <div className="flex-1 h-px bg-gray-300" />
                    <span className="text-gray-400 text-[10px] leading-none select-none">+</span>
                    <div className="flex-1 h-px bg-gray-300" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => {
                const base = Date.now()
                setLocalSegments((current) => [
                  ...current,
                  { id: `seg-${base}-l`, text: '', role: '__layout__', source: 'manual' },
                  { id: `seg-${base}-t`, text: '', role: null, source: 'manual' },
                ])
              }}
              className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-400 hover:text-gray-500 flex items-center justify-center transition-colors text-lg leading-none"
            >
              +
            </button>
          </div>
        </article>
      </main>

      {confirmOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 px-6">
          <section className="bg-[#141414] rounded-2xl border border-white/[0.07] p-6 w-96 shadow-2xl">
            <h2 className="text-white text-base font-semibold tracking-tight">Doorgaan zonder alle labels?</h2>
            <p className="text-white/50 text-sm leading-relaxed mt-3">
              Er zijn nog {missingCount} fragmenten zonder label. Ongelabelde tekst wordt overgeslagen bij het bouwen. Weet je zeker dat je wilt doorgaan?
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-white/45 hover:text-white/75 text-sm border border-white/[0.07] hover:border-white/15 rounded-xl px-4 py-2 transition-colors"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleConfirmAnyway}
                className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
              >
                Toch doorgaan
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function TextSegmentRow({
  segment,
  availableRoles,
  availableLayouts,
  headingRoles,
  isOpen,
  dropdownRef,
  onOpen,
  onSelectRole,
  onChangeText,
}: {
  segment: TextSegment
  availableRoles: string[]
  availableLayouts?: string[]
  headingRoles?: Set<string>
  isOpen: boolean
  dropdownRef?: React.RefObject<HTMLDivElement | null>
  onOpen: () => void
  onSelectRole: (role: SageTagRole | null) => void
  onChangeText: (text: string) => void
}) {
  const isLayout = segment.role === '__layout__'
  const isUnlabeled = segment.role === null
  const isHeading = segment.role !== null && (headingRoles ? headingRoles.has(segment.role) : segment.role === 'Heading')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [segment.text])

  if (isLayout) {
    const layoutEmpty = !segment.text.trim()
    return (
      <div className="flex items-center gap-3 py-3 mt-1">
        <div className={['flex-1 h-px', layoutEmpty ? 'bg-red-200' : 'bg-gray-200'].join(' ')} />
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={onOpen}
            className={[
              'text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors border',
              layoutEmpty
                ? 'text-red-500 bg-red-50 border-red-200 hover:bg-red-100'
                : 'text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 border-gray-200',
            ].join(' ')}
          >
            {layoutEmpty ? 'Kies pagina type →' : `[${segment.text}]`}
          </button>
          {isOpen && availableLayouts && availableLayouts.length > 0 && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[#141414] border border-white/[0.07] rounded-xl shadow-2xl overflow-hidden z-30">
              <div className="max-h-56 overflow-y-auto py-1">
                {availableLayouts.map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    onClick={() => { onChangeText(layout); onOpen() }}
                    className={[
                      'w-full text-left px-3 py-2 text-xs font-mono transition-colors',
                      layout === segment.text
                        ? 'bg-white/[0.08] text-white'
                        : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80',
                    ].join(' ')}
                  >
                    {layout}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    )
  }

  return (
    <section
      className={[
        'relative group rounded-lg transition-colors',
        isUnlabeled
          ? 'bg-red-50 border border-red-200 p-3'
          : 'px-1 py-1.5 hover:bg-gray-50',
      ].join(' ')}
    >
      <textarea
        ref={textareaRef}
        value={segment.text}
        onChange={(e) => {
          onChangeText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        rows={1}
        className={[
          'w-full resize-none bg-transparent outline-none pr-28 block cursor-text',
          isHeading
            ? 'text-2xl font-bold text-gray-900 leading-tight'
            : isUnlabeled
              ? 'text-sm text-gray-600 leading-relaxed'
              : 'text-base text-gray-700 leading-relaxed',
        ].join(' ')}
      />

      <div className="absolute right-2 top-2" ref={dropdownRef}>
        <button
          type="button"
          onClick={onOpen}
          className={[
            'text-[10px] font-mono px-2 py-0.5 rounded-full transition-colors',
            isUnlabeled
              ? 'bg-red-100 text-red-500 hover:bg-red-200'
              : 'bg-[#facc15]/15 text-[#facc15] hover:bg-[#facc15]/25',
          ].join(' ')}
        >
          {segment.role ?? 'Geen label'}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-[#141414] border border-white/[0.07] rounded-xl shadow-2xl overflow-hidden z-30">
            <button
              type="button"
              onClick={() => onSelectRole(null)}
              className={[
                'w-full text-left px-3 py-2 text-xs transition-colors',
                segment.role === null
                  ? 'bg-red-500/[0.10] text-red-300'
                  : 'text-white/45 hover:bg-white/[0.05] hover:text-white/70',
              ].join(' ')}
            >
              — geen label —
            </button>

            <div className="h-px bg-white/[0.07]" />

            <div className="max-h-56 overflow-y-auto py-1">
              {availableRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => onSelectRole(role)}
                  className={[
                    'w-full text-left px-3 py-2 text-xs transition-colors',
                    segment.role === role
                      ? 'bg-[#facc15]/[0.12] text-[#facc15]'
                      : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80',
                  ].join(' ')}
                >
                  {role}
                </button>
              ))}

              {availableRoles.length === 0 && (
                <p className="px-3 py-3 text-white/25 text-xs">Geen rollen gevonden</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
