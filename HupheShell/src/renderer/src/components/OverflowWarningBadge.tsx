interface OverflowWarningBadgeProps {
  visible: boolean
  message?: string
}

export default function OverflowWarningBadge({
  visible,
  message = 'Tekst valt buiten het templatevlak',
}: OverflowWarningBadgeProps) {
  if (!visible) return null

  return (
    <div
      className="absolute right-2 top-2 z-20 inline-flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-full border border-[#facc15]/40 bg-[#facc15] px-2 py-1 text-[10px] font-semibold leading-none text-black shadow-[0_8px_24px_rgba(250,204,21,0.18)]"
      title={message}
      role="status"
      aria-live="polite"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      <span className="truncate">{message}</span>
    </div>
  )
}
