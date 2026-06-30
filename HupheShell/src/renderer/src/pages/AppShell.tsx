import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import logo from '../assets/logo.png'
import {
  IcoAtelier, IcoBackstage, IcoFlow, IcoFolder, IcoHome, IcoLedger,
  IcoPulse, IcoSettings, IcoTwin, IcoTypewriter,
} from '../components/Icons'
import { supabase } from '../lib/supabase'
import { getSavedAccounts, removeAccount, switchToAccount, addAccount, type SavedAccount } from '../lib/account-switcher'
import TopUpModal from '../components/TopUpModal'
import ProjectsPage from './ProjectsPage'
import PulsePage from './PulsePage'
import FlowPage from './FlowPage'
import AtelierPage from './AtelierPage'
import SettingsPage from './SettingsPage'
import AdminPage from './AdminPage'
import WelcomeHero from './WelcomeHero'
import { useAssetSync } from '../hooks/useAssetSync'
import { saveLastActiveDocId } from '../lib/typewriter-documents'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog'
import { CREDITS_REQUIRED_EVENT } from '../lib/credits-required'

const TypewriterPage = lazy(() => import('./TypewriterPage'))

class TypewriterBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[Typewriter] renderer crash boundary:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-[#0a0a0a] px-6 text-white">
          <div className="max-w-md rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-5 shadow-2xl">
            <p className="text-sm font-semibold text-red-200">Typewriter kon niet laden</p>
            <p className="mt-2 text-sm leading-6 text-white/55">
              De rest van HupheAI blijft beschikbaar. Herstart de app of open een ander onderdeel terwijl deze fout wordt onderzocht.
            </p>
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-5 text-red-100/70">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

type Module = 'home' | 'pulse' | 'atelier' | 'flow' | 'typewriter' | 'ledger' | 'twin' | 'documents' | 'settings'
type ActiveView = Module | 'admin'

interface ModuleConfig {
  id: Module
  label: string
  description: string
  active: boolean
  icon: React.ReactNode
}

const MODULES: ModuleConfig[] = [
  {
    id: 'home',
    label: 'Home',
    description: 'Introscherm',
    active: true,
    icon: <IcoHome />,
  },
  {
    id: 'pulse',
    label: 'Pulse',
    description: 'Autonoom reclamebureau',
    active: true,
    icon: <IcoPulse />,
  },
  {
    id: 'atelier',
    label: 'Atelier',
    description: 'AI-commandocentrum en agents',
    active: true,
    icon: <IcoAtelier />,
  },
  {
    id: 'flow',
    label: 'Flow',
    description: 'Onderzoek & strategie',
    active: true,
    icon: <IcoFlow />,
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    description: 'Tekstdocumenten en gekoppelde copy',
    active: true,
    icon: <IcoTypewriter />,
  },
  {
    id: 'ledger',
    label: 'Ledger',
    description: 'Administratie & geld',
    active: false,
    icon: <IcoLedger />,
  },
  {
    id: 'twin',
    label: 'Twin',
    description: 'Jouw AI-duplicaat',
    active: false,
    icon: <IcoTwin />,
  },
  {
    id: 'documents',
    label: 'Assets',
    description: 'Jouw opgeslagen assets',
    active: true,
    icon: <IcoFolder />,
  },
  {
    id: 'settings',
    label: 'Instellingen',
    description: 'Templates, account en configuratie',
    active: true,
    icon: <IcoSettings />,
  },
]

function formatCredits(millicredits: number): string {
  return new Intl.NumberFormat('nl-NL').format(Math.floor(Math.max(0, millicredits) / 100))
}

interface Props {
  session: Session
  allowedModuleSlugs: Set<string>
  activeModuleSlugs?: Set<string>
  onNavigateBackstage: () => void
  onAdminAccessChanged: () => void | Promise<void>
  onOpenProject: (data: unknown) => void
  onJoinSession: (project: unknown, presentationId: string) => void
  returnModule?: string
}

export default function AppShell({ session, allowedModuleSlugs, activeModuleSlugs, onNavigateBackstage, onAdminAccessChanged, onOpenProject, onJoinSession, returnModule }: Props) {
  // Asset sync: luistert naar Supabase Realtime en houdt lokale cache vers
  const { initialSync: syncAssetsOnMount } = useAssetSync(session.user.id)
  useEffect(() => { syncAssetsOnMount() }, [session.user.id])

  const [active, setActive] = useState<ActiveView>('home')
  const [unsavedDialogTarget, setUnsavedDialogTarget] = useState<ActiveView | null>(null)

  function safeNavigate(target: ActiveView) {
    const isDirty = (window as any).__editorIsDirty?.()
    if (isDirty) {
      setUnsavedDialogTarget(target)
    } else {
      setActive(target)
    }
  }

  useEffect(() => {
    if (returnModule && returnModule !== 'home') setActive(returnModule as ActiveView)
  }, [returnModule])
  const [isAdmin, setIsAdmin] = useState(false)
  const [previewAsUser, setPreviewAsUser] = useState(false)
  // In gebruikersweergave: toon alleen is_active:true modules (zoals een gewone gebruiker ziet)
  const visibleModuleSlugs = previewAsUser ? (activeModuleSlugs ?? allowedModuleSlugs) : allowedModuleSlugs

  const [joinOpen,        setJoinOpen]        = useState(false)
  const [joinCode,        setJoinCode]        = useState('')
  const [joining,         setJoining]         = useState(false)
  const [joinError,       setJoinError]       = useState('')
  const [typewriterJoinDocId, setTypewriterJoinDocId] = useState<string | undefined>(undefined)
  const [atelierInitialImagePath, setAtelierInitialImagePath] = useState<string | null>(null)
  const [atelierInitialMediaProjectId, setAtelierInitialMediaProjectId] = useState<string | null>(null)
  const [atelierInitialMediaProjectType, setAtelierInitialMediaProjectType] = useState<'images' | 'video' | 'print' | 'banners' | null>(null)
const [atelierShellLevel, setAtelierShellLevel] = useState<'landing' | 'funnel' | 'editor'>('landing')

  // Reset atelierShellLevel when leaving Atelier so the nav pill reappears
  useEffect(() => {
    if (active !== 'atelier') setAtelierShellLevel('landing')
  }, [active])

  // ── Notifications ────────────────────────────────────────────────────────
  interface AppNotification {
    id: string
    type: string
    title: string
    body: string | null
    data: Record<string, string>
    read_at: string | null
    created_at: string
  }
  const [notifications,    setNotifications]    = useState<AppNotification[]>([])
  const [notifOpen,        setNotifOpen]        = useState(false)
  const notifRef           = useRef<HTMLDivElement>(null)
  const notifChannelRef    = useRef<RealtimeChannel | null>(null)
  const unreadCount        = notifications.filter(n => !n.read_at).length

  // ── User menu ────────────────────────────────────────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef    = useRef<HTMLDivElement>(null)

  // ── Account switcher ─────────────────────────────────────────────────────
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  useEffect(() => {
    if (userMenuOpen) setSavedAccounts(getSavedAccounts())
  }, [userMenuOpen])

  // ── Wallet ───────────────────────────────────────────────────────────────
  const [wallet, setWallet] = useState({ personalBalance: 0, companyBalance: 0, companyName: undefined as string | undefined, companyId: undefined as string | undefined })
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [topUpLoading, setTopUpLoading] = useState(false)
  const [topUpError, setTopUpError] = useState('')
  const [topUpNotice, setTopUpNotice] = useState('')
  const [activeAccount, setActiveAccount] = useState<'personal' | 'company'>(() =>
    (localStorage.getItem('huphe:active-account') as 'personal' | 'company') ?? 'personal'
  )

  function switchActiveAccount(account: 'personal' | 'company') {
    setActiveAccount(account)
    localStorage.setItem('huphe:active-account', account)
    setUserMenuOpen(false)
    supabase?.rpc('set_billing_preference', { p_prefer_personal: account === 'personal' }).then(() => {})
  }

  const refreshWallet = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_wallet')
    if (data) {
      setWallet({
        personalBalance: data.personal_balance ?? 0,
        companyBalance: data.company_balance ?? 0,
        companyName: data.company_name ?? undefined,
        companyId: data.company_id ?? undefined,
      })
      // Als bedrijfsaccount weg is, terugvallen op persoonlijk
      if (!data.company_id) {
        setActiveAccount('personal')
        localStorage.setItem('huphe:active-account', 'personal')
      }
    }
  }, [])

  useEffect(() => { refreshWallet() }, [refreshWallet])

  useEffect(() => {
    function onCreditsRequired(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail
      const message = detail?.message?.trim()
      setTopUpError('')
      setTopUpNotice(message || 'Je hebt onvoldoende credits om deze actie uit te voeren. Waardeer je wallet op om verder te gaan.')
      setTopUpOpen(true)
    }

    function onCreditsPaid() {
      setTopUpOpen(false)
      setTopUpError('')
      // Ververs saldo na korte vertraging zodat webhook tijd heeft om te verwerken
      setTimeout(refreshWallet, 2000)
      setTimeout(refreshWallet, 6000)
    }

    window.addEventListener(CREDITS_REQUIRED_EVENT, onCreditsRequired)
    window.addEventListener('huphe:credits-paid', onCreditsPaid)
    return () => {
      window.removeEventListener(CREDITS_REQUIRED_EVENT, onCreditsRequired)
      window.removeEventListener('huphe:credits-paid', onCreditsPaid)
    }
  }, [])

  async function handleCheckout(amountCents: number) {
    setTopUpLoading(true)
    setTopUpError('')
    try {
      const { data: cfg } = await supabase!.rpc('get_credit_config').maybeSingle()
      const feePct = (cfg as any)?.platform_fee_pct ?? 0
      const result = await (window as any).api.credits.checkout({ amountCents, userId: session.user.id, feePct })
      if (!result.ok) { setTopUpError(result.error ?? 'Betaling mislukt'); return }
      setTopUpOpen(false)
      setTimeout(refreshWallet, 5000)
    } catch (e: any) {
      setTopUpError(e.message ?? 'Onbekende fout')
    } finally {
      setTopUpLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    // Load existing notifications
    client
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setNotifications((data as AppNotification[]) ?? []))

    // Subscribe to new ones in realtime
    notifChannelRef.current = client
      .channel('my-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as AppNotification, ...prev])
      })
      .subscribe()

    return () => { notifChannelRef.current?.unsubscribe() }
  }, [session.user.id])

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  // Waarschuw bij afsluiten van de app als er onopgeslagen wijzigingen zijn
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if ((window as any).__editorIsDirty?.()) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  async function markAllRead() {
    if (!supabase) return
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id)
    if (!unreadIds.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) setIsAdmin(data !== null)
      })
  }, [session.user.id])

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4 || !supabase) return
    setJoinError('')
    setJoining(true)
    try {
      // 1. Probeer eerst als presentatie
      const { data: presId, error: presError } = await supabase
        .rpc('join_presentation_by_code', { p_code: code })

      if (!presError && presId) {
        const { data: pres, error: fetchError } = await supabase
          .from('presentations')
          .select('*')
          .eq('id', presId)
          .single()
        if (fetchError || !pres) throw fetchError ?? new Error('Presentatie niet gevonden.')
        const project = {
          version: 1 as const,
          name: pres.name,
          savedAt: pres.updated_at,
          templateClientId: pres.template_client_id,
          mdText: pres.md_text,
          blocks: pres.blocks,
          overrides: pres.overrides,
        }
        setJoinOpen(false)
        setJoinCode('')
        onJoinSession(project, presId as string)
        return
      }

      // 2. Probeer als Typewriter-document
      const { data: docId, error: docError } = await supabase
        .rpc('join_typewriter_doc_by_code', { p_code: code })
      if (!docError && docId) {
        setJoinOpen(false)
        setJoinCode('')
        setTypewriterJoinDocId(docId as string)
        safeNavigate('typewriter')
        return
      }

      throw new Error('Code niet herkend.')
    } catch (err: any) {
      setJoinError(err.message ?? 'Fout bij verbinden.')
    } finally {
      setJoining(false)
    }
  }

  const [moduleDropdownOpen, setModuleDropdownOpen] = useState(false)
  const moduleDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moduleDropdownOpen) return
    function onClickOutside(e: MouseEvent) {
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(e.target as Node)) {
        setModuleDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [moduleDropdownOpen])

  function handleModuleClick(mod: ModuleConfig) {
    safeNavigate(mod.id)
  }

  function handleOpenInAtelier(imagePath: string) {
    setAtelierInitialImagePath(imagePath)
    setAtelierInitialMediaProjectId(null)
    setAtelierInitialMediaProjectType(null)
    safeNavigate('atelier')
  }

  function handleOpenAtelierMediaProject(projectId: string, type: 'images' | 'video' | 'print' | 'banners') {
    setAtelierInitialImagePath(null)
    setAtelierInitialMediaProjectId(projectId)
    setAtelierInitialMediaProjectType(type)
    safeNavigate('atelier')
  }

  useEffect(() => {
    if (active !== 'atelier') {
      setAtelierInitialImagePath(null)
      setAtelierInitialMediaProjectId(null)
      setAtelierInitialMediaProjectType(null)
    }
  }, [active])

  // ── Join modal ───────────────────────────────────────────────────────────
  const joinModal = joinOpen && (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { setJoinOpen(false); setJoinError(''); setJoinCode('') } }}
    >
      <div className="bg-[#141414] border border-white/[0.10] rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <span className="text-white font-semibold text-sm">Lid worden van sessie</span>
          <button
            onClick={() => { setJoinOpen(false); setJoinError(''); setJoinCode('') }}
            className="text-white/35 hover:text-white/70 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-white/40 text-xs leading-relaxed">
            Voer de 6-tekens code in die je collega heeft gedeeld via Atelier.
          </p>
          <input
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            className="w-full bg-[#0a0a0a] border border-white/[0.10] rounded-xl px-4 py-3 text-white font-mono text-2xl font-bold tracking-[0.25em] text-center outline-none focus:border-[#facc15]/50 transition-colors placeholder:text-white/15"
          />
          {joinError && (
            <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
              {joinError}
            </p>
          )}
          <button
            onClick={handleJoin}
            disabled={joinCode.trim().length < 4 || joining}
            className="w-full bg-[#facc15] hover:bg-[#fde047] disabled:bg-white/[0.06] disabled:text-white/25 disabled:cursor-not-allowed text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {joining ? 'Verbinden…' : 'Deelnemen'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
      {joinModal}

      {unsavedDialogTarget && (
        <UnsavedChangesDialog
          description="Als je nu weggaat gaan je laatste wijzigingen verloren."
          onSaveAndLeave={(window as any).__editorRequestSave ? () => {
            ;(window as any).__editorRequestSave()
            setActive(unsavedDialogTarget)
            setUnsavedDialogTarget(null)
          } : undefined}
          onLeaveWithout={() => {
            setActive(unsavedDialogTarget)
            setUnsavedDialogTarget(null)
          }}
          onCancel={() => setUnsavedDialogTarget(null)}
        />
      )}

      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111] relative z-[60]"
        style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2.5 pl-20"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
            onClick={() => safeNavigate('home')}
          >
            <div className="w-7 h-7 bg-[#facc15] rounded-md flex items-center justify-center">
              <img src={logo} alt="" className="w-4 h-4 object-contain" />
            </div>
            <span className="text-white font-semibold text-[15px] tracking-tight">HupheAI</span>
          </button>
          {active !== 'home' && (
            <>
              <span className="text-white/20 text-[15px] select-none">·</span>
              <div className="relative" ref={moduleDropdownRef}>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[#facc15]/80 font-semibold text-[11px] tracking-[0.12em] uppercase transition-opacity hover:opacity-70"
                  onClick={() => setModuleDropdownOpen(v => !v)}
                >
                  {MODULES.find((m) => m.id === active)?.label ?? active}
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {moduleDropdownOpen && (
                  <div className="absolute left-0 top-full mt-2 z-[70] w-44 rounded-xl border border-white/[0.10] bg-[#1a1a1a] py-1.5 shadow-2xl">
                    {MODULES.filter((m) => m.active && m.id !== 'home' && (
                      m.id === 'settings' || m.id === 'typewriter' || visibleModuleSlugs.has(m.id)
                    )).map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        className={[
                          'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors',
                          active === mod.id
                            ? 'text-[#facc15]'
                            : 'text-white/60 hover:text-white hover:bg-white/[0.05]',
                        ].join(' ')}
                        onClick={() => { handleModuleClick(mod); setModuleDropdownOpen(false) }}
                      >
                        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center opacity-70">{mod.icon}</span>
                        {mod.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {previewAsUser && (
            <span className="flex items-center gap-1.5 text-[11px] bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20 rounded-full px-2.5 py-0.5 font-medium">
              Gebruikersweergave
              <button
                onClick={() => setPreviewAsUser(false)}
                className="hover:text-white transition-colors leading-none"
                title="Terug naar adminweergave"
              >
                ×
              </button>
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-3 pr-5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => { setJoinOpen(true); setJoinError(''); setJoinCode('') }}
            className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors"
            title="Lid worden van een live sessie"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Join live
          </button>

          {/* Notification bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markAllRead() }}
              className="relative text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-md p-1.5 transition-colors"
              title="Meldingen"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#facc15] text-black text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-[#141414] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                  <span className="text-white text-xs font-semibold">Meldingen</span>
                  {notifications.some(n => !n.read_at) && (
                    <button onClick={markAllRead} className="text-white/35 hover:text-white/65 text-[11px] transition-colors">
                      Alles gelezen
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-white/25 text-xs text-center py-8">Geen meldingen</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (n.type === 'join_request') { setNotifOpen(false); safeNavigate('admin') }
                        }}
                        className={[
                          'px-4 py-3 border-b border-white/[0.05] last:border-0',
                          !n.read_at ? 'bg-[#facc15]/[0.04]' : '',
                          n.type === 'join_request' ? 'cursor-pointer hover:bg-white/[0.03]' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-2.5">
                          {!n.read_at && (
                            <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#facc15]" />
                          )}
                          <div className={!n.read_at ? '' : 'pl-4'}>
                            <p className="text-white/80 text-xs font-medium leading-snug">{n.title}</p>
                            {n.body && <p className="text-white/40 text-[11px] mt-0.5 truncate">{n.body}</p>}
                            <p className="text-white/20 text-[10px] mt-1">
                              {new Date(n.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar + dropdown */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="w-8 h-8 rounded-full bg-[#facc15] text-black text-[13px] font-bold flex items-center justify-center hover:bg-[#fde047] transition-colors flex-shrink-0"
              title={session.user.email ?? ''}
            >
              {(session.user.user_metadata?.full_name ?? session.user.email ?? 'U').charAt(0).toUpperCase()}
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#161616] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden z-50">

                {/* Account cards — persoonlijk + bedrijf */}
                <div className="p-2 space-y-0.5">
                  {/* Persoonlijk */}
                  <button
                    onClick={() => switchActiveAccount('personal')}
                    className={['w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors', activeAccount === 'personal' ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'].join(' ')}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#facc15] text-black text-[13px] font-bold flex items-center justify-center flex-shrink-0">
                      {(session.user.user_metadata?.full_name ?? session.user.email ?? 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-[13px] font-medium truncate leading-tight">
                        {session.user.user_metadata?.full_name ?? session.user.email}
                      </p>
                      <p className="text-white/35 text-[11px] mt-0.5">
                        Persoonlijk · {formatCredits(wallet.personalBalance)} cr
                      </p>
                    </div>
                    {activeAccount === 'personal' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(250,204,21,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  {/* Bedrijfsaccount */}
                  {wallet.companyName && (
                    <button
                      onClick={() => switchActiveAccount('company')}
                      className={['w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors', activeAccount === 'company' ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'].join(' ')}
                    >
                      <div className="w-8 h-8 rounded-xl bg-white/[0.07] border border-white/[0.10] text-white/55 text-[13px] font-bold flex items-center justify-center flex-shrink-0">
                        {wallet.companyName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/80 text-[13px] font-medium truncate leading-tight">{wallet.companyName}</p>
                        <p className="text-white/35 text-[11px] mt-0.5">
                          Bedrijf · {formatCredits(wallet.companyBalance)} cr
                        </p>
                      </div>
                      {activeAccount === 'company' && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(250,204,21,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>

                {/* Menu items */}
                <div className="border-t border-white/[0.07] py-1.5">
                  <MenuButton
                    onClick={() => { setUserMenuOpen(false); safeNavigate('settings') }}
                    icon={<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>}
                  >
                    Instellingen
                  </MenuButton>

                  {isAdmin && !previewAsUser && (
                    <MenuButton
                      onClick={() => { setUserMenuOpen(false); safeNavigate('admin') }}
                      icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
                    >
                      Admin
                    </MenuButton>
                  )}

                  {isAdmin && !previewAsUser && (
                    <MenuButton
                      onClick={() => { setUserMenuOpen(false); setPreviewAsUser(true) }}
                      icon={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                    >
                      Gebruikersweergave
                    </MenuButton>
                  )}

                  {isAdmin && !previewAsUser && (
                    <MenuButton
                      onClick={() => { setUserMenuOpen(false); void (window as any).api?.restartApp?.() }}
                      icon={<><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></>}
                    >
                      Herstart
                    </MenuButton>
                  )}

                  <WalletMenuButton
                    personalBalance={wallet.personalBalance}
                    companyBalance={wallet.companyBalance}
                    companyName={wallet.companyName}
                    onTopUp={() => {
                      setUserMenuOpen(false)
                      setTopUpError('')
                      setTopUpNotice('')
                      setTopUpOpen(true)
                    }}
                  />
                </div>

                {/* Andere ingelogde accounts (multi-user) */}
                {savedAccounts.filter(a => a.email !== session.user.email).length > 0 && (
                  <div className="border-t border-white/[0.07] py-1.5">
                    {savedAccounts
                      .filter(a => a.email !== session.user.email)
                      .map(account => (
                        <button
                          key={account.email}
                          onClick={async () => {
                            setUserMenuOpen(false)
                            await switchToAccount(account)
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                        >
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white/60">
                            {(account.displayName ?? account.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] text-white/65">{account.email}</p>
                          </div>
                        </button>
                      ))}
                  </div>
                )}

                <div className="border-t border-white/[0.07] py-1.5">
                  <MenuButton
                    onClick={async () => { setUserMenuOpen(false); await addAccount() }}
                    icon={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                  >
                    Account toevoegen
                  </MenuButton>
                  <MenuButton
                    onClick={async () => {
                      setUserMenuOpen(false)
                      removeAccount(session.user.email!)
                      await supabase?.auth.signOut()
                    }}
                    icon={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>}
                    danger
                  >
                    Uitloggen
                  </MenuButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {topUpOpen && (
        <TopUpModal
          onClose={() => setTopUpOpen(false)}
          onCheckout={handleCheckout}
          loading={topUpLoading}
          error={topUpError}
          notice={topUpNotice}
        />
      )}

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar pill — hidden when Atelier editor is active or Typewriter is open */}
        {!(active === 'atelier' && atelierShellLevel === 'editor') && active !== 'typewriter' && <div className="flex-shrink-0 flex flex-col items-center justify-center pl-5 pr-3 relative z-20">
          <nav
            className="bg-white rounded-[28px] flex flex-col items-center gap-0.5 py-3 px-2 w-[64px]"
            style={{ boxShadow: '0 24px 70px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.92)' }}
          >
            {(() => {
              const visible = MODULES.filter(mod => {
                return mod.id === 'home' || mod.id === 'settings' || mod.id === 'typewriter' || visibleModuleSlugs.has(mod.id)
              })
              const hasMiddle = visible.length > 2
              return visible.map((mod, i) => {
                const isActive = active === mod.id
                return (
                  <div key={mod.id}>
                    {hasMiddle && i === visible.length - 1 && (
                      <div className="w-8 h-px bg-black/[0.06] my-1.5 mx-auto" />
                    )}
                    <SidebarBtn
                      active={isActive}
                      enabled={true}
                      onClick={() => handleModuleClick(mod)}
                      label={mod.label}
                    >
                      {mod.icon}
                    </SidebarBtn>
                    {hasMiddle && i === 0 && (
                      <div className="w-8 h-px bg-black/[0.06] my-1.5 mx-auto" />
                    )}
                  </div>
                )
              })
            })()}
            {isAdmin && !previewAsUser && (
              <>
                <div className="w-8 h-px bg-black/[0.06] my-1.5 mx-auto" />
                <SidebarBtn
                  active={false}
                  enabled={true}
                  onClick={onNavigateBackstage}
                  label="Backstage"
                >
                  <IcoBackstage />
                </SidebarBtn>
                <SidebarBtn
                  active={active === 'admin'}
                  enabled={true}
                  onClick={() => safeNavigate('admin')}
                  label="Admin"
                >
                  <IcoTwin />
                </SidebarBtn>
              </>
            )}
          </nav>
        </div>}

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {active === 'home' && (
            <WelcomeHero />
          )}

          {active === 'pulse' && (
            <PulsePage />
          )}

          {active === 'documents' && (
            <ProjectsPage
              embedded
              onBack={() => safeNavigate('home')}
              onOpenProject={onOpenProject}
              onJoinSession={onJoinSession}
              onNavigateToTypewriter={(docId) => {
                if (docId) saveLastActiveDocId(docId)
                safeNavigate('typewriter')
              }}
              onOpenInAtelier={handleOpenInAtelier}
              onOpenAtelierMediaProject={handleOpenAtelierMediaProject}
            />
          )}

          {active === 'flow' && (
            <FlowPage />
          )}

          {active === 'typewriter' && (
            <TypewriterBoundary>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-[#0a0a0a] text-sm text-white/45">
                    Typewriter laden...
                  </div>
                }
              >
                <TypewriterPage joinDocId={typewriterJoinDocId} />
              </Suspense>
            </TypewriterBoundary>
          )}

          {active === 'atelier' && (
            <AtelierPage
              initialImagePath={atelierInitialImagePath}
              initialMediaProjectId={atelierInitialMediaProjectId}
              initialMediaProjectType={atelierInitialMediaProjectType}
onShellLevelChange={setAtelierShellLevel}
            />
          )}

          {active === 'settings' && (
            <SettingsPage
              embedded
              onBack={() => safeNavigate('home')}
            />
          )}

          {active === 'admin' && (
            <AdminPage
              session={session}
              embedded
              onBack={() => safeNavigate('home')}
              onAccessChanged={onAdminAccessChanged}
            />
          )}

          {MODULES.find(m => m.id === active && !m.active) && (
            <ComingSoonPanel module={MODULES.find(m => m.id === active)!} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Panels ────────────────────────────────────────────────────────────────────

function ComingSoonPanel({ module: mod }: { module: ModuleConfig }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 select-none">
      <div className="w-12 h-12 bg-white/[0.04] border border-white/[0.07] rounded-2xl flex items-center justify-center mb-1">
        <div style={{ opacity: 0.25, filter: 'invert(1)' }}>{mod.icon}</div>
      </div>
      <h2 className="text-white/70 font-semibold text-lg tracking-tight">{mod.label}</h2>
      <span className="mt-2 text-[11px] font-medium px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/25 tracking-wide uppercase">
        Binnenkort beschikbaar
      </span>
    </div>
  )
}

// ── Sidebar button ─────────────────────────────────────────────────────────────

function SidebarBtn({
  active,
  enabled,
  onClick,
  label,
  children,
}: {
  active: boolean
  enabled: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        style={{ color: 'rgba(0,0,0,0.55)' }}
        className={[
          'w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
          active ? 'bg-black/[0.08]' : 'hover:bg-black/[0.05]',
          !enabled ? 'opacity-30' : '',
        ].join(' ')}
      >
        {children}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity delay-100 z-50">
        <div className="bg-[#1c1c1c] border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
          <p className="text-white/85 text-xs font-semibold leading-tight">{label}</p>
        </div>
      </div>
    </div>
  )
}


function MenuButton({ children, onClick, icon, danger }: {
  children: React.ReactNode
  onClick: () => void
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
        danger
          ? 'text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.07]'
          : 'text-white/65 hover:text-white hover:bg-white/[0.05]',
      ].join(' ')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      {children}
    </button>
  )
}

function WalletMenuButton({
  personalBalance,
  companyBalance,
  companyName,
  onTopUp,
}: {
  personalBalance: number
  companyBalance: number
  companyName?: string
  onTopUp: () => void
}) {
  const hasCredits = personalBalance > 0 || companyBalance > 0
  const hasCompanyCredits = companyBalance > 0

  return (
    <button
      type="button"
      onClick={onTopUp}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white/65 hover:text-white hover:bg-white/[0.05] transition-colors"
    >
      <span className="w-[14px] h-[14px] flex items-center justify-center text-[#facc15] text-[13px] leading-none flex-shrink-0" aria-hidden="true">
        ⬡
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-white/65">Credits</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none text-white/30 min-w-0">
          {hasCredits ? (
            <>
              {hasCompanyCredits && companyName && (
                <span className="max-w-[72px] truncate" title={companyName}>{companyName}</span>
              )}
              {hasCompanyCredits && (
                <span className="text-[#facc15]/75 tabular-nums">{formatCredits(companyBalance)}</span>
              )}
              {hasCompanyCredits && <span className="text-white/15">·</span>}
              <span className="tabular-nums">{formatCredits(personalBalance)}</span>
            </>
          ) : (
            <span>Geen credits</span>
          )}
        </span>
      </span>
      <span className="text-[#facc15] text-xs font-semibold flex-shrink-0">
        Opladen
      </span>
    </button>
  )
}
