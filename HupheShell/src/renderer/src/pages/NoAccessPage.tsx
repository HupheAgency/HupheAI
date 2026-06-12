import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

interface Props {
  email: string
  onSignOut: () => void
}

export default function NoAccessPage({ email, onSignOut }: Props) {
  async function handleSignOut() {
    await supabase?.auth.signOut()
    onSignOut()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-[#facc15] rounded-lg flex items-center justify-center">
                <img src={logo} alt="" className="w-5 h-5 object-contain" />
              </div>
              <span className="text-white font-semibold text-xl tracking-tight">HupheAI</span>
            </div>
            <p className="text-white/25 text-xs">{email}</p>
          </div>

          <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-8 space-y-5 text-center">
            <div className="space-y-2">
              <h1 className="text-white font-semibold text-base">Je account heeft nog geen toegang</h1>
              <p className="text-white/40 text-sm leading-relaxed">
                Je bent ingelogd, maar je account is nog niet geactiveerd voor deze beta. Vraag Tom of een admin om je uitnodiging te controleren.
              </p>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
