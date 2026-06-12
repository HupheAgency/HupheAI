import { useState } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  slideIndex: number
}

export default function PresenterNotesField({ value, onChange, slideIndex }: Props) {
  const [open, setOpen] = useState(false)
  const hasNotes = value.trim().length > 0

  return (
    <section className="border-t border-white/[0.07] pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          'w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors',
          open
            ? 'bg-white/[0.04] border-white/[0.12] text-white/70'
            : 'bg-transparent border-white/[0.07] text-white/45 hover:text-white/70 hover:bg-white/[0.03]',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16v16H4z" />
            <path d="M8 8h8" />
            <path d="M8 12h8" />
            <path d="M8 16h5" />
          </svg>
          Notities
          {hasNotes && <span className="w-1.5 h-1.5 rounded-full bg-[#facc15]" />}
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? 'rotate-180' : ''}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Sprekernotities voor slide ${slideIndex + 1}...`}
          className="mt-3 w-full min-h-[80px] resize-y bg-[#0f0f0f] border border-white/[0.07] focus:border-[#facc15]/40 rounded-xl text-white/70 text-xs p-3 outline-none transition-colors placeholder:text-white/25"
        />
      )}
    </section>
  )
}
