import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'
import logo from './assets/logo.png'
import LoginPage from './pages/LoginPage'
import AppShell from './pages/AppShell'
import SettingsPage from './pages/SettingsPage'
import BackstagePage from './pages/BackstagePage'
import AdminPage from './pages/AdminPage'
import NoAccessPage from './pages/NoAccessPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import SlideEditorPage, { type PostAnalysisState } from './pages/SlideEditorPage'
import TosAcceptancePage from './pages/TosAcceptancePage'
import MaintenancePage from './pages/MaintenancePage'
import JoinRequestPage from './pages/JoinRequestPage'
import DeckPlaceholderPage from './pages/DeckPlaceholderPage'
import { CURRENT_TOS_VERSION } from './constants/legal'
import { saveCurrentAccount } from './lib/account-switcher'
import { OllamaOnboardingModal, useOllamaOnboarding } from './components/OllamaOnboardingModal'

export type AppView = 'dashboard' | 'settings' | 'editor' | 'backstage' | 'admin' | 'deck'

export default function App() {
  const { show: showOllamaOnboarding, dismiss: dismissOllamaOnboarding } = useOllamaOnboarding()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isActive, setIsActive] = useState<boolean>(true)
  const [hasTosAccepted, setHasTosAccepted] = useState<boolean | null>(null)
  const [maintenanceActive, setMaintenanceActive] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [allowedModuleSlugs, setAllowedModuleSlugs] = useState<Set<string>>(() => {
    try {
      const cached = localStorage.getItem('huphe:allowed-module-slugs')
      return cached ? new Set(JSON.parse(cached) as string[]) : new Set()
    } catch { return new Set() }
  })
  // Alleen is_active:true modules — gebruikt voor gebruikersweergave preview
  const [activeModuleSlugs, setActiveModuleSlugs] = useState<Set<string>>(new Set())
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showJoinRequest, setShowJoinRequest] = useState(false)
  const [view, setView] = useState<AppView>('dashboard')
  const [editorProject, setEditorProject] = useState<unknown>(null)
  const [analysisResult, setAnalysisResult] = useState<PostAnalysisState | null>(null)
  const [livePresentationId, setLivePresentationId] = useState<string | undefined>(undefined)
  const [returnModule, setReturnModule] = useState<string>('home')

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    const client = supabase
    const loadingTimeout = setTimeout(() => setLoading(false), 5000)
    ;(async () => {
      const [sessionRes, maintenanceRes] = await Promise.all([
        client.auth.getSession(),
        client.from('maintenance_config').select('is_active, message').eq('id', 'global').maybeSingle(),
      ])

      if (maintenanceRes.data?.is_active) {
        setMaintenanceActive(true)
        setMaintenanceMessage(maintenanceRes.data.message ?? '')
      }

      if (sessionRes.error?.message?.includes('Invalid Refresh Token') ||
          sessionRes.error?.message?.includes('Already Used')) {
        await client.auth.signOut()
        setLoading(false)
        clearTimeout(loadingTimeout)
        return
      }

      const session = sessionRes.data.session
      setSession(session)

      if (session?.access_token) {
        void (window as any).api?.setJwt(session.access_token)
      }
      if (session) saveCurrentAccount(session)

      if (session?.user) {
        // upsert fire-and-forget — niet awaiten zodat het laden niet blokkeert
        void client.from('user_profiles').upsert({
          user_id: session.user.id,
          email: session.user.email ?? '',
          display_name: session.user.user_metadata?.full_name ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        const [profileRes, tosRes, accessRes] = await Promise.all([
          client.from('user_profiles').select('is_active').eq('user_id', session.user.id).single(),
          client.from('tos_acceptances').select('id').eq('user_id', session.user.id).eq('tos_version', CURRENT_TOS_VERSION).maybeSingle(),
          client.from('user_module_access').select('module_id').eq('user_id', session.user.id),
        ])

        setIsActive(profileRes.data?.is_active ?? true)
        setHasTosAccepted(tosRes.data !== null)

        // Admin-check: platform admin via app_metadata of e-mail (geen DB-query nodig)
        // company_members apart ophalen zodat een 500 de rest niet blokkeert
        const platformRole = (session.user as any).app_metadata?.role
        const isPlatformAdmin = platformRole === 'admin' || session.user.email === 'tfzwarts@gmail.com'
        let isCompanyAdmin = false
        if (!isPlatformAdmin) {
          try {
            const { data: memberData } = await client
              .from('company_members').select('role').eq('user_id', session.user.id).maybeSingle()
            isCompanyAdmin = memberData?.role === 'admin'
          } catch { /* tabel niet bereikbaar of RLS-fout — geen admin */ }
        }
        const isAdmin = isPlatformAdmin || isCompanyAdmin

        // Laad menu-modules — admins krijgen altijd alle actieve modules
        if (isAdmin) {
          client.from('modules').select('slug, is_active')
            .then(({ data: moduleRows }) => {
              const all = (moduleRows ?? []) as { slug: string; is_active: boolean }[]
              const slugs = all.map(m => m.slug)
              setAllowedModuleSlugs(new Set(slugs))
              setActiveModuleSlugs(new Set(all.filter(m => m.is_active).map(m => m.slug)))
              try { localStorage.setItem('huphe:allowed-module-slugs', JSON.stringify(slugs)) } catch {}
            })
        } else if (accessRes.data && accessRes.data.length > 0) {
          const moduleIds = accessRes.data.map((r: { module_id: string }) => r.module_id)
          client.from('modules').select('slug').in('id', moduleIds).eq('is_active', true)
            .then(({ data: moduleRows }) => {
              const slugs = (moduleRows ?? []).map((m: { slug: string }) => m.slug)
              setAllowedModuleSlugs(new Set(slugs))
              try { localStorage.setItem('huphe:allowed-module-slugs', JSON.stringify(slugs)) } catch {}
            })
        }
      }
      setLoading(false)
      clearTimeout(loadingTimeout)
    })().catch(() => {
      setLoading(false)
      clearTimeout(loadingTimeout)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED failure leidt tot SIGNED_OUT — zorg voor schone local state
      if (event === 'SIGNED_OUT') {
        setSession(null)
        setView('dashboard')
        setAllowedModuleSlugs(new Set())
        try { localStorage.removeItem('huphe:allowed-module-slugs') } catch {}
        return
      }
      if (session?.access_token) {
        void (window as any).api?.setJwt(session.access_token)
      }
      if (session) saveCurrentAccount(session)

      // Uitnodiging accepteren: als user metadata company_id bevat, automatisch lid worden
      if (event === 'SIGNED_IN' && session?.user?.user_metadata?.company_id) {
        const { company_id, company_role } = session.user.user_metadata
        void supabase?.from('company_members').upsert(
          { company_id, user_id: session.user.id, role: company_role ?? 'member' },
          { onConflict: 'company_id,user_id' }
        ).then(() => {
          void supabase?.from('company_invites')
            .update({ accepted: true })
            .eq('company_id', company_id)
            .eq('email', session.user.email ?? '')
        })
      }

      setSession(session)
      if (!session) {
        setView('dashboard')
        setAllowedModuleSlugs(new Set())
        return
      }
      // Bij (her)inloggen: herlaad module-toegang zodat het menu compleet is.
      // De initiële mount-IIFE wordt maar één keer uitgevoerd en slaat dit over
      // als de gebruiker op dat moment uitgelogd was.
      if (event === 'SIGNED_IN' && session.user) {
        const platformRole = (session.user as any).app_metadata?.role
        const userEmail = session.user.email ?? ''
        const isPlatformAdmin2 = platformRole === 'admin' || userEmail === 'tfzwarts@gmail.com'
        ;(async () => {
          let isAdmin2 = isPlatformAdmin2
          if (!isPlatformAdmin2) {
            try {
              const { data: m } = await client.from('company_members').select('role').eq('user_id', session.user.id).maybeSingle()
              isAdmin2 = m?.role === 'admin'
            } catch { /* RLS-fout of tabel niet beschikbaar */ }
          }
          const { data: accessData } = await client.from('user_module_access').select('module_id').eq('user_id', session.user.id)
          let slugs2: string[]
          if (isAdmin2) {
            const { data: allModules } = await client.from('modules').select('slug, is_active')
            const all2 = (allModules ?? []) as { slug: string; is_active: boolean }[]
            slugs2 = all2.map(m => m.slug)
            setActiveModuleSlugs(new Set(all2.filter(m => m.is_active).map(m => m.slug)))
          } else {
            if (!accessData?.length) return
            const moduleIds = accessData.map((r: { module_id: string }) => r.module_id)
            const { data: moduleRows } = await client.from('modules').select('slug').in('id', moduleIds).eq('is_active', true)
            slugs2 = (moduleRows ?? []).map((m: { slug: string }) => m.slug)
          }
          setAllowedModuleSlugs(new Set(slugs2))
          try { localStorage.setItem('huphe:allowed-module-slugs', JSON.stringify(slugs2)) } catch {}
        })()
      }
    })

    const handleDeepLink = async (e: Event) => {
      const url = (e as CustomEvent<string>).detail
      try {
        const parsed = new URL(url)

        // Credits betaald — sluit modal en ververs saldo
        if (parsed.hostname === 'credits' || parsed.pathname?.startsWith('/credits')) {
          window.dispatchEvent(new CustomEvent('huphe:credits-paid'))
          return
        }

        const code = parsed.searchParams.get('code')
        if (code) {
          await client.auth.exchangeCodeForSession(code)
          return
        }
        const hash = new URLSearchParams(parsed.hash.slice(1))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        if (accessToken && refreshToken) {
          await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        }
      } catch (err) {
        console.error('[deep-link] auth error:', err)
      }
    }
    window.addEventListener('auth:deep-link', handleDeepLink)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('auth:deep-link', handleDeepLink)
    }
  }, [])

  function handleLaunchEditor(analysis: PostAnalysisState) {
    setReturnModule('home')
    setAnalysisResult(analysis)
    setEditorProject(null)
    setView('editor')
  }

  function handleOpenProject(data: unknown) {
    setReturnModule('documents')
    setEditorProject(data)
    setAnalysisResult(null)
    setLivePresentationId(undefined)
    setView('editor')
  }

  function handleJoinSession(project: unknown, presentationId: string) {
    setReturnModule('documents')
    setEditorProject(project)
    setAnalysisResult(null)
    setLivePresentationId(presentationId)
    setView('editor')
  }

  async function refreshAllowedModules(userId: string) {
    if (!supabase || !session) return
    const platformRole = (session.user as any).app_metadata?.role
    const isPlatformAdmin = platformRole === 'admin' || session.user.email === 'tfzwarts@gmail.com'
    let isCompanyAdmin = false
    if (!isPlatformAdmin) {
      try {
        const { data: m } = await supabase.from('company_members').select('role').eq('user_id', userId).maybeSingle()
        isCompanyAdmin = m?.role === 'admin'
      } catch { /* RLS-fout of tabel niet beschikbaar */ }
    }
    const isAdmin = isPlatformAdmin || isCompanyAdmin
    if (isAdmin) {
      const { data: allModules } = await supabase.from('modules').select('slug, is_active')
      const all = (allModules ?? []) as { slug: string; is_active: boolean }[]
      const slugs = all.map(m => m.slug)
      setAllowedModuleSlugs(new Set(slugs))
      setActiveModuleSlugs(new Set(all.filter(m => m.is_active).map(m => m.slug)))
      try { localStorage.setItem('huphe:allowed-module-slugs', JSON.stringify(slugs)) } catch {}
      return
    }
    const { data: accessRows } = await supabase
      .from('user_module_access').select('module_id').eq('user_id', userId)
    if (accessRows && accessRows.length > 0) {
      const ids = accessRows.map((r: { module_id: string }) => r.module_id)
      const { data: moduleRows } = await supabase
        .from('modules').select('slug').in('id', ids).eq('is_active', true)
      setAllowedModuleSlugs(new Set((moduleRows ?? []).map((m: { slug: string }) => m.slug)))
    } else {
      setAllowedModuleSlugs(new Set())
    }
  }

  function handleBackToDashboard() {
    if (view === 'admin' && session) refreshAllowedModules(session.user.id)
    setView('dashboard')
    setAnalysisResult(null)
    setEditorProject(null)
    setLivePresentationId(undefined)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <span className="text-white/20 text-sm">Laden…</span>
      </div>
    )
  }

  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-3 px-8">
        <div className="w-9 h-9 bg-[#facc15] rounded-lg flex items-center justify-center mb-2">
          <img src={logo} alt="" className="w-5 h-5 object-contain" />
        </div>
        <p className="text-white font-semibold text-sm">Configuratie vereist</p>
        <p className="text-white/40 text-xs text-center max-w-xs">
          Maak een <code className="text-white/60">.env</code> bestand aan op basis van{' '}
          <code className="text-white/60">.env.example</code> en bouw de app opnieuw.
        </p>
      </div>
    )
  }

  if (maintenanceActive) {
    return <MaintenancePage message={maintenanceMessage} />
  }

  if (showPrivacy) {
    return <PrivacyPolicyPage onBack={() => setShowPrivacy(false)} />
  }

  if (showJoinRequest) {
    return <JoinRequestPage onBack={() => setShowJoinRequest(false)} />
  }

  if (!session) {
    return (
      <LoginPage
        onShowPrivacy={() => setShowPrivacy(true)}
        onShowJoinRequest={() => setShowJoinRequest(true)}
      />
    )
  }

  if (!isActive) {
    return <NoAccessPage email={session.user.email ?? ''} onSignOut={() => setSession(null)} />
  }

  if (hasTosAccepted === false) {
    return (
      <TosAcceptancePage
        onAccept={async () => {
          await supabase!.from('tos_acceptances').insert({
            user_id: session.user.id,
            tos_version: CURRENT_TOS_VERSION,
          })
          setHasTosAccepted(true)
        }}
        onSignOut={() => supabase?.auth.signOut()}
      />
    )
  }

  // Ollama onboarding — toon na eerste login/TOS, bovenop elke view
  const ollamaModal = showOllamaOnboarding && hasTosAccepted
    ? <OllamaOnboardingModal onClose={dismissOllamaOnboarding} />
    : null

  switch (view) {
    case 'settings':
      return <>{ollamaModal}<SettingsPage onBack={handleBackToDashboard} onShowPrivacy={() => setShowPrivacy(true)} /></>
    case 'backstage':
      return <>{ollamaModal}<BackstagePage onBack={handleBackToDashboard} /></>
    case 'admin':
      return <>{ollamaModal}<AdminPage session={session} onBack={handleBackToDashboard} /></>
    case 'deck':
      return <>{ollamaModal}<DeckPlaceholderPage onBack={handleBackToDashboard} /></>
    case 'editor':
      return (
        <SlideEditorPage
          onBack={handleBackToDashboard}
          onModuleSelect={(moduleId) => { setView(moduleId === 'home' ? 'dashboard' : moduleId as any) }}
          allowedModuleSlugs={allowedModuleSlugs}
          backLabel={returnModule === 'documents' ? 'Documenten' : 'Dashboard'}
          initialProject={editorProject as any}
          initialAnalysis={analysisResult ?? undefined}
          initialPresentationId={livePresentationId}
        />
      )
    default:
      return (
        <>
          {ollamaModal}
          <AppShell
            session={session}
            allowedModuleSlugs={allowedModuleSlugs}
            activeModuleSlugs={activeModuleSlugs}
            onNavigateBackstage={() => setView('backstage')}
            onAdminAccessChanged={() => refreshAllowedModules(session.user.id)}
            onOpenProject={handleOpenProject}
            onJoinSession={handleJoinSession}
            returnModule={returnModule}
          />
        </>
      )
  }
}
