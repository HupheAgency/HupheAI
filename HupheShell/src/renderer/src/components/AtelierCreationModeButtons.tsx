import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

export type AtelierCreationType = 'presentation' | 'banners' | 'print' | 'images' | 'video' | 'scene3d'
export type AtelierCreationSelection = AtelierCreationType | null

export const ATELIER_CREATION_OPTIONS: Array<{
  id: AtelierCreationType
  label: string
  shortLabel: string
  description: string
  icon: ReactNode
}> = [
  {
    id: 'presentation',
    label: 'Presentatie',
    shortLabel: 'P',
    description: 'Decks, keynotes en slideverhalen',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </svg>
    ),
  },
  {
    id: 'banners',
    label: 'Banners',
    shortLabel: 'B',
    description: 'Social, display en campagneformaten',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h6" />
        <path d="M7 13h10" />
      </svg>
    ),
  },
  {
    id: 'print',
    label: 'Media',
    shortLabel: 'M',
    description: 'Offline print, social en vaste formaten',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
    ),
  },
  {
    id: 'images',
    label: 'Afbeeldingen',
    shortLabel: 'A',
    description: 'Beelden maken en varianten uitwerken',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    id: 'video',
    label: 'Video',
    shortLabel: 'V',
    description: 'Frames, scripts en video-assets',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 9l4-2v10l-4-2" />
      </svg>
    ),
  },
  {
    id: 'scene3d',
    label: '3D Scene',
    shortLabel: '3D',
    description: '3D compositie omzetten naar fotorealistische beelden',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 5v8l-9 5-9-5V8z" />
        <path d="M12 13l9-5" />
        <path d="M12 13l-9-5" />
        <path d="M12 13v9" />
      </svg>
    ),
  },
]

const SLUG_TO_TYPE: Record<string, AtelierCreationType> = {
  atelier_presentation: 'presentation',
  atelier_banners: 'banners',
  atelier_print: 'print',
  atelier_images: 'images',
  atelier_video: 'video',
  atelier_scene3d: 'scene3d',
}

const ALL_TYPES = new Set<AtelierCreationType>(['presentation', 'banners', 'print', 'images', 'video', 'scene3d'])

let _cache: Set<AtelierCreationType> | null = null
let _pending: Promise<Set<AtelierCreationType>> | null = null

async function loadEnabledTypes(): Promise<Set<AtelierCreationType>> {
  if (_cache) return _cache
  if (_pending) return _pending
  _pending = (async () => {
    if (!supabase) { _cache = ALL_TYPES; return ALL_TYPES }
    const { data } = await supabase.from('modules').select('slug, is_active').like('slug', 'atelier_%')
    if (!data || data.length === 0) { _cache = ALL_TYPES; return ALL_TYPES }
    const enabled = data
      .filter((m: { slug: string; is_active: boolean }) => m.is_active)
      .map((m: { slug: string }) => SLUG_TO_TYPE[m.slug])
      .filter(Boolean) as AtelierCreationType[]
    _cache = enabled.length > 0 ? new Set(enabled) : ALL_TYPES
    return _cache
  })()
  return _pending
}

export function clearAtelierSubTypeCache() {
  _cache = null
  _pending = null
}

export default function AtelierCreationModeButtons({
  activeType,
  onSelect,
  className = '',
}: {
  activeType: AtelierCreationSelection
  onSelect: (type: AtelierCreationType) => void
  className?: string
}) {
  const [enabledTypes, setEnabledTypes] = useState<Set<AtelierCreationType>>(() => _cache ?? ALL_TYPES)

  useEffect(() => {
    if (_cache) { setEnabledTypes(_cache); return }
    loadEnabledTypes().then(setEnabledTypes)
  }, [])

  const visibleOptions = ATELIER_CREATION_OPTIONS.filter(o => enabledTypes.has(o.id))

  return (
    <div className={['pointer-events-auto flex items-center justify-center gap-2', className].join(' ')}>
      {visibleOptions.map((option) => {
        const active = activeType === option.id
        return (
          <div key={option.id} className="relative group">
            <button
              type="button"
              onClick={() => onSelect(option.id)}
              className={[
                'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                active ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.08] hover:text-white',
              ].join(' ')}
              aria-label={option.label}
              title={option.label}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                {option.icon}
              </span>
            </button>
            <div className="pointer-events-none absolute left-1/2 top-[calc(100%+12px)] z-50 -translate-x-1/2 opacity-0 transition-opacity delay-100 group-hover:opacity-100">
              <div className="w-56 rounded-xl border border-white/[0.08] bg-[#1c1c1c] px-3 py-2 text-center shadow-xl">
                <p className="text-white/85 text-xs font-semibold leading-tight">{option.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/38">{option.description}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
