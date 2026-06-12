import { ATELIER_CREATION_OPTIONS, type AtelierCreationType } from './AtelierCreationModeButtons'

interface Props {
  sourceType: AtelierCreationType
  onCreate: (targetType: AtelierCreationType) => void
}

const CROSS_FORMAT_TARGETS: AtelierCreationType[] = ['presentation', 'banners', 'print', 'images']

export default function CrossFormatPanel({ sourceType, onCreate }: Props) {
  const targets = CROSS_FORMAT_TARGETS.filter((type) => type !== sourceType)
  if (targets.length === 0) return null

  return (
    <div className="mb-5 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-white/32">Gebruik in ander format</p>
      <div className="grid grid-cols-2 gap-2">
        {targets.map((target) => {
          const option = ATELIER_CREATION_OPTIONS.find((item) => item.id === target)
          return (
            <button
              key={target}
              type="button"
              onClick={() => onCreate(target)}
              className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-3 text-left text-xs text-white/55 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white/85"
            >
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#facc15]">{option?.icon}</span>
              <span className="truncate">{option?.label ?? target}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
