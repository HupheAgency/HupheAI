import type { Session } from '@supabase/supabase-js'
import type { AppView } from '../App'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

interface Props {
  session: Session
  onNavigate: (view: AppView, data?: unknown) => void
}

export default function DashboardPage({ session, onNavigate }: Props) {
  async function handleLogout() {
    await supabase?.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
        style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 pl-20"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-7 h-7 bg-[#facc15] rounded-md flex items-center justify-center">
            <img src={logo} alt="" className="w-4 h-4 object-contain" />
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">HupheAI</span>
        </div>

        {/* Rechts */}
        <div
          className="flex items-center gap-3 pr-5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-white/25 text-xs hidden sm:block">{session.user.email}</span>
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="text-white/40 hover:text-white/70 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors"
          >
            Uitloggen
          </button>
          <button
            id="settings-btn"
            onClick={() => onNavigate('settings')}
            className="text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-md p-1.5 transition-colors"
            title="Instellingen"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* Dashboard content */}
      <main className="flex-1 px-8 pt-10">
        {/* Sectietitel */}
        <p className="text-white/30 text-xs font-medium uppercase tracking-widest mb-5">
          Modules
        </p>

        {/* Module grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Atelier tegel */}
          <button
            id="module-editor"
            onClick={() => onNavigate('editor')}
            className="group flex flex-col items-center justify-center gap-3 bg-[#141414] hover:bg-[#1a1a1a] border border-white/[0.07] hover:border-emerald-500/30 rounded-xl p-6 aspect-square text-center transition-colors cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                 style={{ background: 'radial-gradient(circle at 50% 60%, rgba(16,185,129,0.08) 0%, transparent 70%)' }} />
            <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-all relative"
                 style={{ background: 'rgba(16,185,129,0.1)' }}>
              <EditorIcon />
            </div>
            <span className="text-white/80 group-hover:text-white text-sm font-medium transition-colors">
              Atelier
            </span>
          </button>

          {/* Huphe Code tegel */}
          <button
            id="module-code"
            onClick={() => onNavigate('code')}
            className="group flex flex-col items-center justify-center gap-3 bg-[#141414] hover:bg-[#1a1a1a] border border-white/[0.07] hover:border-indigo-500/30 rounded-xl p-6 aspect-square text-center transition-colors cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                 style={{ background: 'radial-gradient(circle at 50% 60%, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />
            <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-all text-lg relative"
                 style={{ background: 'rgba(99,102,241,0.1)' }}>
              <CodeIcon />
            </div>
            <span className="text-white/80 group-hover:text-white text-sm font-medium transition-colors">
              Code
            </span>
          </button>

          {/* Bestanden tegel */}
          <button
            id="module-projects"
            onClick={() => onNavigate('projects')}
            className="group flex flex-col items-center justify-center gap-3 bg-[#141414] hover:bg-[#1a1a1a] border border-white/[0.07] hover:border-amber-500/30 rounded-xl p-6 aspect-square text-center transition-colors cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                 style={{ background: 'radial-gradient(circle at 50% 60%, rgba(245,158,11,0.08) 0%, transparent 70%)' }} />
            <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-all relative"
                 style={{ background: 'rgba(245,158,11,0.1)' }}>
              <FilesIcon />
            </div>
            <span className="text-white/80 group-hover:text-white text-sm font-medium transition-colors">
              Bestanden
            </span>
          </button>
        </div>
      </main>
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.4)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}


function EditorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(16,185,129,0.8)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(99,102,241,0.8)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
      <line x1="12" y1="2" x2="12" y2="22" opacity="0.5" />
    </svg>
  )
}

function FilesIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(245,158,11,0.8)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
