import type React from 'react'

interface Props {
  message: string
}

export default function MaintenancePage({ message }: Props) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <section className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#facc15] mb-6">
            <span className="text-black text-sm font-bold">H</span>
          </div>

          <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-8">
            <div className="mx-auto mb-5 w-12 h-12 rounded-2xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(250,204,21,0.9)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-5.7 5.7a2.1 2.1 0 0 1-3-3l5.7-5.7a6 6 0 0 1 7.9-7.9l-3.1 3.1Z" />
              </svg>
            </div>

            <h1 className="text-white text-xl font-semibold tracking-tight">
              Even offline voor onderhoud
            </h1>

            <p className="text-white/50 text-sm leading-relaxed mt-3">
              {message}
            </p>

            <p className="text-white/25 text-xs mt-5">
              Probeer het later opnieuw.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
