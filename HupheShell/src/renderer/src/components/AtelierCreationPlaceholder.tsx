import type { ReactNode } from 'react'
import { ATELIER_CREATION_OPTIONS, type AtelierCreationType } from './AtelierCreationModeButtons'
import type { CrossFormatSeed } from '../lib/atelier-cross-format'

export default function AtelierCreationPlaceholder({
  type,
  seed,
  renderBanner,
  renderPrint,
  renderMedia,
}: {
  type: AtelierCreationType
  seed?: CrossFormatSeed | null
  renderBanner: () => ReactNode
  renderPrint: () => ReactNode
  renderMedia: () => ReactNode
}) {
  const content = type === 'banners'
    ? renderBanner()
    : type === 'print'
      ? renderPrint()
      : type === 'images' || type === 'video'
        ? renderMedia()
        : null

  if (content) {
    return (
      <>
        {seed && (seed.assetRefs.length > 0 || seed.copyRefs.length > 0) && (
          <div className="pointer-events-none absolute left-1/2 top-5 z-40 -translate-x-1/2 rounded-full border border-[#facc15]/20 bg-black/55 px-3 py-1.5 text-xs text-[#facc15] shadow-lg backdrop-blur-md">
            {seed.assetRefs.length} asset{seed.assetRefs.length === 1 ? '' : 's'} · {seed.copyRefs.length} copy
          </div>
        )}
        {content}
      </>
    )
  }

  const option = ATELIER_CREATION_OPTIONS.find((item) => item.id === type) ?? ATELIER_CREATION_OPTIONS[0]
  return (
    <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#141414]/85 px-6 py-8 text-center shadow-2xl backdrop-blur-md">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[#facc15]">
        {option.icon}
      </div>
      <p className="text-white text-sm font-semibold">{option.label}</p>
      <p className="mt-2 text-white/35 text-sm leading-relaxed">
        Deze werkvorm staat klaar in de Atelier-sidebar. De bestaande presentatie-flow blijft actief onder Presentatie.
      </p>
    </div>
  )
}
