interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  variant?: 'yellow' | 'emerald'
  className?: string
}

/**
 * Toggle — track w-9 h-5 (36×20px), thumb h-4 w-4 (16×16px).
 * Off: thumb 2px from left. On: thumb 2px from right.
 * Gebruik altijd dit component ipv inlined toggle HTML.
 */
export function Toggle({ checked, onChange, disabled, variant = 'yellow', className }: ToggleProps) {
  const trackOn = variant === 'emerald' ? 'bg-emerald-500/70' : 'bg-[#facc15]'
  const thumbOn = variant === 'emerald' ? 'bg-white' : 'bg-black'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked ? trackOn : 'bg-white/[0.12]',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <span
        className={[
          'pointer-events-none absolute top-[2px] left-0 h-4 w-4 rounded-full transition-transform duration-200',
          checked ? `translate-x-[18px] ${thumbOn}` : 'translate-x-[2px] bg-white/60',
        ].join(' ')}
      />
    </button>
  )
}
