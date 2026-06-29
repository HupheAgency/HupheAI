import { useEffect, useState } from 'react'

export function ReconstructingOverlay({ visible, label = 'Reconstructing environment' }: { visible: boolean; label?: string }) {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500)
    return () => clearInterval(id)
  }, [visible])

  if (!visible) return null

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span className="font-mono text-sm tracking-wide text-white/80">
          {label}{'.'.repeat(dots)}
        </span>
      </div>
    </div>
  )
}
