import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

export interface DetectedElement {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  role: string | null
}

interface Props {
  backgroundImage: string
  elements: DetectedElement[]
  availableRoles: string[]
  onConfirm: (elements: DetectedElement[]) => void
  onReject: () => void
}

const CANVAS_WIDTH = 1920
const CANVAS_HEIGHT = 1080

function getConfidenceClasses(confidence: number) {
  if (confidence >= 0.8) {
    return 'border-emerald-500/60 bg-emerald-500/10 focus-within:border-emerald-400'
  }

  if (confidence >= 0.5) {
    return 'border-amber-500/60 bg-amber-500/10 focus-within:border-amber-400'
  }

  return 'border-red-500/60 bg-red-500/10 focus-within:border-red-400'
}

function getConfidenceLabel(confidence: number) {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

export default function PdfImportReviewScreen({
  backgroundImage,
  elements,
  availableRoles,
  onConfirm,
  onReject,
}: Props) {
  const [localElements, setLocalElements] = useState<DetectedElement[]>(() => elements.map((element) => ({ ...element })))
  const [openElementId, setOpenElementId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalElements(elements.map((element) => ({ ...element })))
    setOpenElementId(null)
  }, [elements])

  useEffect(() => {
    if (!openElementId) return

    function handlePointerDown(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenElementId(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenElementId(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openElementId])

  function updateElement(elementId: string, patch: Partial<DetectedElement>) {
    setLocalElements((current) => (
      current.map((element) => (
        element.id === elementId ? { ...element, ...patch } : element
      ))
    ))
  }

  function setRole(elementId: string, role: string | null) {
    updateElement(elementId, { role })
    setOpenElementId(null)
  }

  return (
    <div className="fixed inset-0 z-[250] bg-[#0a0a0a] text-white flex flex-col">
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />

      <main className="flex-1 min-h-0 overflow-auto px-6 py-6 flex items-center justify-center">
        <section className="w-full max-w-[1280px]">
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/[0.07] shadow-2xl">
            <img
              src={backgroundImage}
              alt=""
              className="absolute inset-0 w-full h-full object-contain bg-black"
              draggable={false}
            />

            {localElements.map((element) => (
              <DetectedElementBox
                key={element.id}
                element={element}
                availableRoles={availableRoles}
                isOpen={openElementId === element.id}
                dropdownRef={openElementId === element.id ? dropdownRef : undefined}
                onOpen={() => setOpenElementId((current) => (current === element.id ? null : element.id))}
                onSetRole={(role) => setRole(element.id, role)}
                onTextChange={(text) => updateElement(element.id, { text })}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-white/[0.07] bg-[#0a0a0a]/95 backdrop-blur px-6 py-4">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-white text-sm font-medium">
              {localElements.length} blokken herkend
            </p>
            <p className="text-white/40 text-xs mt-1">
              Controleer tekst en rollen voordat je importeert.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReject}
              className="text-white/45 hover:text-white/75 text-sm border border-white/[0.07] hover:border-white/15 rounded-xl px-4 py-2.5 transition-colors"
            >
              Afwijzen
            </button>
            <button
              type="button"
              onClick={() => onConfirm(localElements)}
              className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
            >
              Importeren →
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function DetectedElementBox({
  element,
  availableRoles,
  isOpen,
  dropdownRef,
  onOpen,
  onSetRole,
  onTextChange,
}: {
  element: DetectedElement
  availableRoles: string[]
  isOpen: boolean
  dropdownRef?: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onSetRole: (role: string | null) => void
  onTextChange: (text: string) => void
}) {
  const left = `${(element.x / CANVAS_WIDTH) * 100}%`
  const top = `${(element.y / CANVAS_HEIGHT) * 100}%`
  const width = `${(element.width / CANVAS_WIDTH) * 100}%`
  const height = `${(element.height / CANVAS_HEIGHT) * 100}%`

  return (
    <div
      className={[
        'absolute rounded-lg border p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.18)] transition-colors',
        getConfidenceClasses(element.confidence),
      ].join(' ')}
      style={{ left, top, width, height }}
    >
      <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1.5" ref={dropdownRef}>
        <button
          type="button"
          onClick={onOpen}
          className="max-w-[180px] truncate bg-black/70 hover:bg-black/90 border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-white/80 transition-colors"
        >
          {element.role ?? 'Geen rol'}
        </button>
        <span className="bg-black/55 border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-white/45">
          {getConfidenceLabel(element.confidence)}
        </span>

        {isOpen && (
          <div className="absolute left-0 top-full mt-2 w-56 bg-[#141414] border border-white/[0.07] rounded-xl shadow-2xl overflow-hidden z-30">
            <button
              type="button"
              onClick={() => onSetRole(null)}
              className={[
                'w-full text-left px-3 py-2 text-xs transition-colors',
                element.role === null
                  ? 'bg-red-500/[0.10] text-red-300'
                  : 'text-white/45 hover:bg-white/[0.05] hover:text-white/70',
              ].join(' ')}
            >
              — geen rol —
            </button>

            <div className="h-px bg-white/[0.07]" />

            <div className="max-h-56 overflow-y-auto py-1">
              {availableRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => onSetRole(role)}
                  className={[
                    'w-full text-left px-3 py-2 text-xs transition-colors',
                    element.role === role
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

      <textarea
        value={element.text}
        onChange={(event) => onTextChange(event.target.value)}
        className="w-full h-full resize-none bg-black/20 focus:bg-black/35 outline-none rounded-md pt-6 px-2 pb-2 text-[11px] leading-snug text-white/85 placeholder:text-white/25"
        placeholder="Herkende tekst"
      />
    </div>
  )
}
