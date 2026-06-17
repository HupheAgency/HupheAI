import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'
import AdminCreditPanel from '../components/AdminCreditPanel'
import { AdminSidebar, type AdminTabId, getAdminParentCategory, ADMIN_NAV_GROUPS } from '../components/admin/AdminSidebar'
import { AdminContextPanel } from '../components/admin/AdminContextPanel'
import { AdminOverview } from '../components/admin/AdminOverview'
import { Toggle } from '../components/Toggle'
import { clearAtelierSubTypeCache } from '../components/AtelierCreationModeButtons'
import UserModulePanel from './UserModulePanel'
import {
  MODULE_TYPES,
  MODULE_LABELS,
  loadModulePrompt,
  saveModulePrompt,
  resetModulePrompt,
  getDefaultModulePrompt,
  loadModuleModels,
  saveModuleModels,
  resetModuleModels,
  getDefaultModuleModels,
  type ModuleModelConfig,
  IMAGE_PIPELINE_SLOTS,
  loadImagePipelinePrompt,
  saveImagePipelinePrompt,
  resetImagePipelinePrompt,
  getDefaultImagePipelinePrompt,
  type ImagePipelineSlot,
} from '../lib/atelier-module-config'
import {
  deleteAdminHtmlTemplate,
  htmlTemplateToTemplateData,
  loadHtmlPresentationTemplates,
  saveAdminHtmlTemplate,
  updateAdminHtmlTemplate,
  type HtmlPresentationTemplate,
} from '../lib/html-presentation-templates'

const api = () => (window as any).api

interface UserProfile {
  user_id: string
  email: string
  display_name: string | null
  updated_at: string
  is_active: boolean
}

interface MaintenanceConfig {
  is_active: boolean
  message: string
}

interface AuditLogEntry {
  id: string
  actor_id: string
  action: string
  target_table: string | null
  target_id: string | null
  created_at: string
}

interface DbModule {
  id: string
  slug: string
  label: string
  description: string
  is_active: boolean
}

interface JoinRequest {
  id: string
  email: string
  name: string | null
  message: string | null
  status: 'pending' | 'approved' | 'denied'
  requested_at: string
}

interface Props {
  session: Session
  onBack: () => void
  embedded?: boolean
  onAccessChanged?: () => void | Promise<void>
}

export default function AdminPage({ session, onBack, embedded, onAccessChanged }: Props) {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [activating, setActivating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [maintenance, setMaintenance] = useState<MaintenanceConfig>({ is_active: false, message: '' })
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  const [modules, setModules] = useState<DbModule[]>([])
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [userModuleIds, setUserModuleIds] = useState<Map<string, Set<string>>>(new Map())
  const [savingModule, setSavingModule] = useState<string | null>(null)
  const [savingGlobalModule, setSavingGlobalModule] = useState<string | null>(null)

  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [joinLoading, setJoinLoading] = useState(true)
  const [approvingRequest, setApprovingRequest] = useState<string | null>(null)
  const [denyingRequest, setDenyingRequest] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  const [activeModuleTab, setActiveModuleTab] = useState<string>('banners')

  // ── Wallet inzage ─────────────────────────────────────────────────────────
  const [walletExpandedUserId, setWalletExpandedUserId] = useState<string | null>(null)
  const [userWallets, setUserWallets] = useState<Map<string, { personalBalance: number; companyBalance: number }>>(new Map())
  const [userTransactions, setUserTransactions] = useState<Map<string, any[]>>(new Map())
  const [walletLoading, setWalletLoading] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState<Record<string, string>>({})
  const [creditSaving, setCreditSaving] = useState<string | null>(null)
  const [modulePromptDrafts, setModulePromptDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(MODULE_TYPES.map((type) => [type, loadModulePrompt(type)]))
  )
  const [pipelineDrafts, setPipelineDrafts] = useState<Record<ImagePipelineSlot, string>>(() => ({
    generate: loadImagePipelinePrompt('generate'),
    edit: loadImagePipelinePrompt('edit'),
    'mask-edit': loadImagePipelinePrompt('mask-edit'),
  }))
  const [pipelineSaved, setPipelineSaved] = useState<Record<string, boolean>>({})
  const [moduleModelDrafts, setModuleModelDrafts] = useState<Record<string, ModuleModelConfig[]>>(() =>
    Object.fromEntries(MODULE_TYPES.map((type) => [type, loadModuleModels(type)]))
  )
  const [moduleModelInputs, setModuleModelInputs] = useState<Record<string, string>>({})
  const [moduleSaved, setModuleSaved] = useState<Record<string, boolean>>({})
  const [moduleModelsSaved, setModuleModelsSaved] = useState<Record<string, boolean>>({})
  const [moduleModelSuggestions, setModuleModelSuggestions] = useState<Record<string, { id: string; label: string; model: string }[]>>({})
  const [moduleModelDropdownRect, setModuleModelDropdownRect] = useState<Record<string, { top: number; left: number; width: number }>>({})
  const moduleModelSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const moduleModelInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function handleModuleModelInputChange(type: string, value: string, modality: string) {
    setModuleModelInputs((prev) => ({ ...prev, [type]: value }))
    // Update dropdown anchor position
    const inputEl = moduleModelInputRefs.current[type]
    if (inputEl) {
      const rect = inputEl.getBoundingClientRect()
      setModuleModelDropdownRect((prev) => ({ ...prev, [type]: { top: rect.bottom + 4, left: rect.left, width: rect.width } }))
    }
    clearTimeout(moduleModelSearchTimers.current[type])
    if (!value.trim() || value.length < 2) {
      setModuleModelSuggestions((prev) => ({ ...prev, [type]: [] }))
      return
    }
    moduleModelSearchTimers.current[type] = setTimeout(async () => {
      try {
        const api = (window as any).api
        const res = await api.engine.searchOpenRouterModels(value.trim())
        if (!res?.ok) return
        const keyword = modality === 'image' ? ['image', 'flux', 'banana', 'imagen', 'seedream', 'recraft'] : modality === 'video' ? ['video', 'veo', 'kling', 'runway', 'luma'] : []
        const results = (res.models ?? [])
          .filter((m: any) => keyword.length === 0 || keyword.some((kw) => `${m.id} ${m.label} ${m.model} ${m.modality ?? ''}`.toLowerCase().includes(kw)))
          .slice(0, 8)
          .map((m: any) => ({ id: m.id, label: m.label ?? m.id, model: m.model ?? m.id }))
        setModuleModelSuggestions((prev) => ({ ...prev, [type]: results }))
      } catch {}
    }, 300)
  }

  const [openrouterKey, setOpenrouterKey] = useState('')
  const [openrouterHasKey, setOpenrouterHasKey] = useState(false)
  const [openrouterSaving, setOpenrouterSaving] = useState(false)
  const [openrouterSaved, setOpenrouterSaved] = useState(false)

  const [groqKey, setGroqKey] = useState('')
  const [groqHasKey, setGroqHasKey] = useState(false)
  const [groqSaving, setGroqSaving] = useState(false)
  const [groqSaved, setGroqSaved] = useState(false)

  const [stripeKey, setStripeKey] = useState('')
  const [stripeHasKey, setStripeHasKey] = useState(false)
  const [stripeSaving, setStripeSaving] = useState(false)
  const [stripeSaved, setStripeSaved] = useState(false)

  const [serperKey, setSerperKey] = useState('')
  const [serperHasKey, setSerperHasKey] = useState(false)
  const [serperSaving, setSerperSaving] = useState(false)
  const [serperSaved, setSerperSaved] = useState(false)
  const [falKey, setFalKey] = useState('')
  const [falHasKey, setFalHasKey] = useState(false)
  const [falSaving, setFalSaving] = useState(false)
  const [falSaved, setFalSaved] = useState(false)

  const [typekitId, setTypekitId] = useState('')
  const [typekitHasKey, setTypekitHasKey] = useState(false)
  const [typekitSaving, setTypekitSaving] = useState(false)
  const [typekitSaved, setTypekitSaved] = useState(false)

  const [htmlTemplates, setHtmlTemplates] = useState<HtmlPresentationTemplate[]>(() => loadHtmlPresentationTemplates())
  const [templateUploadError, setTemplateUploadError] = useState<string | null>(null)
  const [templateUploadSaved, setTemplateUploadSaved] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState({ name: '', description: '', html: '', logoUrlOnDark: undefined as string | undefined, logoUrlOnLight: undefined as string | undefined })

  const [feePct, setFeePct] = useState(0)
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState('')

  const [activeTab, setActiveTab] = useState<AdminTabId>('accounts')
  const adminMainRef = useRef<HTMLElement | null>(null)
  const adminScrollTimerRef = useRef<number | null>(null)
  const [isAdminMainScrolling, setIsAdminMainScrolling] = useState(false)
  const activeParent = getAdminParentCategory(activeTab) ?? activeTab
  const isDetailTab = ADMIN_NAV_GROUPS.some(g => g.items.some(i => i.id === activeTab))
  const isOverviewTab = ADMIN_NAV_GROUPS.some(g => g.id === activeTab && g.items.length > 0)

  // ── Bedrijfsaccounts ──────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<{ id: string; name: string; ownerEmail: string; memberCount: number; balance: number }[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    // Bedrijfsaccounts met wallet en ledencijfer laden
    supabase.from('company_accounts').select('id, name, owner_id').then(async ({ data: cos }) => {
      if (!cos) { setCompaniesLoading(false); return }
      const enriched = await Promise.all(cos.map(async (co: any) => {
        const [ownerRes, membersRes, walletRes] = await Promise.all([
          supabase.from('user_profiles').select('email').eq('user_id', co.owner_id).maybeSingle(),
          supabase.from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', co.id),
          supabase.from('company_wallets').select('balance').eq('company_id', co.id).maybeSingle(),
        ])
        return {
          id: co.id,
          name: co.name,
          ownerEmail: (ownerRes.data as any)?.email ?? co.owner_id,
          memberCount: membersRes.count ?? 0,
          balance: (walletRes.data as any)?.balance ?? 0,
        }
      }))
      setCompanies(enriched)
      setCompaniesLoading(false)
    })

    Promise.all([
      supabase.from('user_profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('admin_users').select('user_id'),
      supabase.from('maintenance_config').select('is_active, message').eq('id', 'global').maybeSingle(),
      supabase.from('audit_log').select('id, actor_id, action, target_table, target_id, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('modules').select('id, slug, label, description, is_active').order('label'),
      supabase.from('join_requests').select('id, email, name, message, status, requested_at').order('requested_at', { ascending: false }),
    ]).then(([profilesRes, adminsRes, maintenanceRes, logsRes, modulesRes, joinRes]) => {
      if (profilesRes.error) setError(profilesRes.error.message)
      setProfiles((profilesRes.data as UserProfile[]) ?? [])
      setAdminIds(new Set((adminsRes.data ?? []).map((r: { user_id: string }) => r.user_id)))
      if (maintenanceRes.data) setMaintenance(maintenanceRes.data)
      setAuditLogs((logsRes.data as AuditLogEntry[]) ?? [])
      setModules((modulesRes.data as DbModule[]) ?? [])
      setJoinRequests((joinRes.data as JoinRequest[]) ?? [])
      setLoading(false)
      setLogsLoading(false)
      setJoinLoading(false)
    })
    supabase.rpc('get_credit_config').then(({ data: cfg }) => {
      if (cfg) setFeePct((cfg as any).platform_fee_pct ?? 0)
    })
  }, [])

  useEffect(() => {
    api().hasKey('openrouter').then((has: boolean) => setOpenrouterHasKey(has))
    api().hasKey('groq').then((has: boolean) => setGroqHasKey(has))
    api().hasKey('stripe').then((has: boolean) => setStripeHasKey(has))
    api().hasKey('serper').then((has: boolean) => setSerperHasKey(has))
    api().hasKey('fal').then((has: boolean) => setFalHasKey(has))
    api().hasKey('typekit').then((has: boolean) => setTypekitHasKey(has))
  }, [])

  useEffect(() => {
    const onTemplatesChanged = () => setHtmlTemplates(loadHtmlPresentationTemplates())
    window.addEventListener('huphe:html-templates-changed', onTemplatesChanged)
    return () => window.removeEventListener('huphe:html-templates-changed', onTemplatesChanged)
  }, [])

  useEffect(() => {
    return () => {
      if (adminScrollTimerRef.current !== null) window.clearTimeout(adminScrollTimerRef.current)
    }
  }, [])

  function handleAdminMainScroll() {
    setIsAdminMainScrolling(true)
    if (adminScrollTimerRef.current !== null) window.clearTimeout(adminScrollTimerRef.current)
    adminScrollTimerRef.current = window.setTimeout(() => {
      setIsAdminMainScrolling(false)
      adminScrollTimerRef.current = null
    }, 700)
  }

  async function loadUserModules(userId: string) {
    if (!supabase || userModuleIds.has(userId)) return
    const { data } = await supabase
      .from('user_module_access')
      .select('module_id')
      .eq('user_id', userId)
    setUserModuleIds(prev => new Map(prev).set(userId, new Set((data ?? []).map((r: { module_id: string }) => r.module_id))))
  }

  async function handleExpandUser(userId: string) {
    if (expandedUserId === userId) { setExpandedUserId(null); return }
    setExpandedUserId(userId)
    await loadUserModules(userId)
  }

  async function handleExpandWallet(userId: string) {
    if (walletExpandedUserId === userId) { setWalletExpandedUserId(null); return }
    setWalletExpandedUserId(userId)
    if (userWallets.has(userId)) return
    setWalletLoading(userId)
    const [walletRes, txRes] = await Promise.all([
      supabase!.from('wallets').select('personal_balance, company_balance').eq('user_id', userId).maybeSingle(),
      supabase!.from('wallet_transactions').select('type, amount_cents, description, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    ])
    setUserWallets(m => new Map(m).set(userId, {
      personalBalance: (walletRes.data as any)?.personal_balance ?? 0,
      companyBalance: (walletRes.data as any)?.company_balance ?? 0,
    }))
    setUserTransactions(m => new Map(m).set(userId, txRes.data ?? []))
    setWalletLoading(null)
  }

  async function handleGiveCredits(userId: string) {
    const amount = parseInt(creditAmount[userId] ?? '0', 10)
    if (!amount || !supabase) return
    setCreditSaving(userId)
    await supabase.from('wallets').upsert(
      { user_id: userId, personal_balance: (userWallets.get(userId)?.personalBalance ?? 0) + amount },
      { onConflict: 'user_id' }
    )
    await supabase.from('wallet_transactions').insert({
      user_id: userId, type: 'admin', amount_cents: amount,
      description: `Admin bijschrijving door ${session.user.email}`,
    })
    setUserWallets(m => new Map(m).set(userId, {
      ...m.get(userId)!,
      personalBalance: (m.get(userId)?.personalBalance ?? 0) + amount,
    }))
    setCreditAmount(c => ({ ...c, [userId]: '' }))
    setCreditSaving(null)
  }

  async function toggleModule(userId: string, moduleId: string, enable: boolean) {
    if (!supabase) return
    setSavingModule(moduleId)
    const currentIds = userModuleIds.get(userId) ?? new Set<string>()
    if (enable) {
      const { error } = await supabase.from('user_module_access').insert({ user_id: userId, module_id: moduleId })
      if (!error) {
        const next = new Set(currentIds); next.add(moduleId)
        setUserModuleIds(prev => new Map(prev).set(userId, next))
        await onAccessChanged?.()
      }
    } else {
      const { error } = await supabase.from('user_module_access').delete().eq('user_id', userId).eq('module_id', moduleId)
      if (!error) {
        const next = new Set(currentIds); next.delete(moduleId)
        setUserModuleIds(prev => new Map(prev).set(userId, next))
        await onAccessChanged?.()
      }
    }
    setSavingModule(null)
  }

  async function toggleModuleGlobal(moduleId: string, currentlyActive: boolean) {
    if (!supabase || savingGlobalModule) return
    setSavingGlobalModule(moduleId)
    const { error } = await supabase.from('modules').update({ is_active: !currentlyActive }).eq('id', moduleId)
    if (!error) {
      setModules(prev => prev.map(m => m.id === moduleId ? { ...m, is_active: !currentlyActive } : m))
      const toggled = modules.find(m => m.id === moduleId)
      if (toggled?.slug.startsWith('atelier_')) clearAtelierSubTypeCache()
      await onAccessChanged?.()
    }
    setSavingGlobalModule(null)
  }

  async function toggleActive(userId: string, currentlyActive: boolean) {
    if (!supabase || activating) return
    setActivating(userId)
    setError(null)
    const { error } = await supabase.from('user_profiles').update({ is_active: !currentlyActive }).eq('user_id', userId)
    if (error) { setError(error.message); setActivating(null); return }
    supabase.rpc('log_action', { p_action: currentlyActive ? 'user_blocked' : 'user_activated', p_target_table: 'user_profiles', p_target_id: userId }).then(() => {})
    setProfiles(prev => prev.map(p => p.user_id === userId ? { ...p, is_active: !currentlyActive } : p))
    setActivating(null)
  }

  async function toggleAdmin(userId: string) {
    if (!supabase || toggling) return
    setToggling(userId)
    setError(null)
    const isAdmin = adminIds.has(userId)
    if (isAdmin) {
      const { error } = await supabase.from('admin_users').delete().eq('user_id', userId)
      if (error) { setError(error.message); setToggling(null); return }
      supabase.rpc('log_action', { p_action: 'admin_removed', p_target_table: 'admin_users', p_target_id: userId }).then(() => {})
      setAdminIds(prev => { const next = new Set(prev); next.delete(userId); return next })
    } else {
      const { error } = await supabase.from('admin_users').insert({ user_id: userId })
      if (error) { setError(error.message); setToggling(null); return }
      supabase.rpc('log_action', { p_action: 'admin_granted', p_target_table: 'admin_users', p_target_id: userId }).then(() => {})
      setAdminIds(prev => new Set([...prev, userId]))
    }
    setToggling(null)
  }

  async function saveMaintenance() {
    if (!supabase || maintenanceSaving) return
    setMaintenanceSaving(true)
    setMaintenanceError(null)
    const { error } = await supabase.from('maintenance_config').upsert({
      id: 'global',
      is_active: maintenance.is_active,
      message: maintenance.message,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
    }, { onConflict: 'id' })
    if (error) setMaintenanceError(error.message)
    setMaintenanceSaving(false)
  }

  async function approveRequest(req: JoinRequest) {
    if (!supabase) return
    setApprovingRequest(req.id)
    setJoinError(null)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { error } = await supabase.functions.invoke('approve-join-request', {
      body: { requestId: req.id, email: req.email },
      headers: { Authorization: `Bearer ${currentSession?.access_token}` },
    })
    if (error) {
      setJoinError(`Goedkeuren mislukt: ${error.message}`)
    } else {
      supabase.rpc('log_action', { p_action: 'join_request_approved', p_target_table: 'join_requests', p_target_id: req.id }).then(() => {})
      setJoinRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r))
    }
    setApprovingRequest(null)
  }

  async function denyRequest(requestId: string) {
    if (!supabase) return
    setDenyingRequest(requestId)
    setJoinError(null)
    const { error } = await supabase.from('join_requests').update({ status: 'denied', reviewed_at: new Date().toISOString(), reviewed_by: session.user.id }).eq('id', requestId)
    if (error) {
      setJoinError(`Afwijzen mislukt: ${error.message}`)
    } else {
      supabase.rpc('log_action', { p_action: 'join_request_denied', p_target_table: 'join_requests', p_target_id: requestId }).then(() => {})
      setJoinRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'denied' } : r))
    }
    setDenyingRequest(null)
  }

  async function saveOpenrouterKey() {
    if (!openrouterKey.trim()) return
    setOpenrouterSaving(true)
    setOpenrouterSaved(false)
    await api().setKey('openrouter', openrouterKey.trim())
    setOpenrouterHasKey(true)
    setOpenrouterKey('')
    setOpenrouterSaving(false)
    setOpenrouterSaved(true)
    setTimeout(() => setOpenrouterSaved(false), 2500)
  }

  async function saveGroqKey() {
    if (!groqKey.trim()) return
    setGroqSaving(true)
    setGroqSaved(false)
    await api().setKey('groq', groqKey.trim())
    setGroqHasKey(true)
    setGroqKey('')
    setGroqSaving(false)
    setGroqSaved(true)
    setTimeout(() => setGroqSaved(false), 2500)
  }

  async function saveStripeKey() {
    if (!stripeKey.trim()) return
    setStripeSaving(true)
    setStripeSaved(false)
    await api().setKey('stripe', stripeKey.trim())
    setStripeHasKey(true)
    setStripeKey('')
    setStripeSaving(false)
    setStripeSaved(true)
    setTimeout(() => setStripeSaved(false), 2500)
  }

  async function saveFalKey() {
    if (!falKey.trim()) return
    setFalSaving(true)
    await api().setKey('fal', falKey.trim())
    setFalHasKey(true)
    setFalKey('')
    setFalSaving(false)
    setFalSaved(true)
    setTimeout(() => setFalSaved(false), 2000)
  }

  async function saveSerperKey() {
    if (!serperKey.trim()) return
    setSerperSaving(true)
    setSerperSaved(false)
    await api().setKey('serper', serperKey.trim())
    setSerperHasKey(true)
    setSerperKey('')
    setSerperSaving(false)
    setSerperSaved(true)
    setTimeout(() => setSerperSaved(false), 2500)
  }

  async function saveTypekitId() {
    if (!typekitId.trim()) return
    setTypekitSaving(true)
    setTypekitSaved(false)
    await api().setKey('typekit', typekitId.trim())
    setTypekitHasKey(true)
    setTypekitId('')
    setTypekitSaving(false)
    setTypekitSaved(true)
    setTimeout(() => setTypekitSaved(false), 2500)
  }

  async function handleHtmlTemplateUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setTemplateUploadError(null)
    setTemplateUploadSaved(false)
    if (!file.name.toLowerCase().endsWith('.html')) {
      setTemplateUploadError('Upload een .html bestand met data-huphe-layout en data-huphe-field attributen.')
      return
    }
    try {
      const html = await file.text()
      const name = file.name.replace(/\.html$/i, '').replace(/[-_]+/g, ' ').trim() || 'HTML template'
      const template = saveAdminHtmlTemplate({ name, description: 'Eigen HTML-presentatietemplate', html })
      const parsed = htmlTemplateToTemplateData(template)
      if (parsed.layouts.length === 0) throw new Error('Geen layouts gevonden.')
      setHtmlTemplates(loadHtmlPresentationTemplates())
      setTemplateUploadSaved(true)
      setTimeout(() => setTemplateUploadSaved(false), 2500)
    } catch (err: any) {
      setTemplateUploadError(err?.message ?? 'Template uploaden mislukt.')
    }
  }

  function handleDeleteHtmlTemplate(id: string) {
    deleteAdminHtmlTemplate(id)
    setHtmlTemplates(loadHtmlPresentationTemplates())
  }

  function startEditHtmlTemplate(template: HtmlPresentationTemplate) {
    setEditingTemplateId(template.id)
    setTemplateUploadError(null)
    setTemplateDraft({
      name: template.name,
      description: template.description,
      html: template.html ?? '',
      logoUrlOnDark: template.logoUrlOnDark,
      logoUrlOnLight: template.logoUrlOnLight,
    })
  }

  function cancelEditHtmlTemplate() {
    setEditingTemplateId(null)
    setTemplateDraft({ name: '', description: '', html: '', logoUrlOnDark: undefined, logoUrlOnLight: undefined })
  }

  function saveEditedHtmlTemplate() {
    if (!editingTemplateId) return
    try {
      const updated = updateAdminHtmlTemplate(editingTemplateId, templateDraft)
      if (!updated) {
        setTemplateUploadError('Alleen eigen HTML-templates kunnen worden aangepast.')
        return
      }
      const parsed = htmlTemplateToTemplateData(updated)
      if (parsed.layouts.length === 0) {
        setTemplateUploadError('HTML-template heeft geen layouts. Voeg data-huphe-layout toe aan minimaal één section.')
        return
      }
      setHtmlTemplates(loadHtmlPresentationTemplates())
      cancelEditHtmlTemplate()
      setTemplateUploadSaved(true)
      setTimeout(() => setTemplateUploadSaved(false), 2500)
    } catch (err: any) {
      setTemplateUploadError(err?.message ?? 'Template opslaan mislukt.')
    }
  }

  function formatLogTime(iso: string) {
    return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  async function handleSaveFee(newFeePct: number) {
    if (!supabase) return
    setFeeSaving(true); setFeeError('')
    const { error } = await supabase.rpc('set_credit_config', { p_fee_pct: newFeePct })
    setFeeSaving(false)
    if (error) setFeeError(error.message)
    else setFeePct(newFeePct)
  }

  const pendingCount = joinRequests.filter(r => r.status === 'pending').length

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden" style={{ background: 'radial-gradient(circle at 28% 12%, rgba(255,255,255,0.035), transparent 34%), radial-gradient(circle at 86% 0%, rgba(255,216,61,0.035), transparent 26%), #0A0A0A' }}>
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} joinRequestCount={pendingCount} />
      <div className="w-[400px] flex-shrink-0" />

      <main
        ref={adminMainRef}
        onScroll={handleAdminMainScroll}
        className={[
          'settings-main-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-9 pb-24',
          isAdminMainScrolling ? 'settings-main-scroll--active' : '',
        ].join(' ')}
      >
        <div className={isOverviewTab ? 'mx-auto flex flex-col min-h-0' : 'mx-auto'} style={{ maxWidth: 980 }}>

          {!isDetailTab && (
            <div className={['mb-9', isOverviewTab ? 'flex-shrink-0' : ''].join(' ')}>
              <h1 className="text-[32px] font-semibold tracking-normal text-white">
                {activeTab === 'accounts' ? 'Accounts' : activeTab === 'modules' ? 'Modules' : activeTab === 'platform' ? 'Platform' : activeTab === 'systeem' ? 'Systeem' : activeTab === 'aanmeldingen' ? 'Aanmeldingen' : activeTab === 'templates' ? 'Templates' : 'Admin'}
              </h1>
              <p className="mt-1.5 text-sm text-white/[0.42]">
                {activeTab === 'accounts' ? 'Gebruikers en bedrijfsaccounts beheren.' : activeTab === 'modules' ? 'AI-gedrag en module-toegang instellen.' : activeTab === 'platform' ? 'Marge en API-verbindingen.' : activeTab === 'systeem' ? 'Onderhoud, monitoring en logs.' : activeTab === 'aanmeldingen' ? 'Toegangsverzoeken bekijken en behandelen.' : 'HTML-templates uploaden en beheren.'}
              </p>
            </div>
          )}
          {isDetailTab && <div className="h-[112px]" />}
          {isDetailTab && (
            <button
              type="button"
              onClick={() => setActiveTab(activeParent)}
              className="mb-3 inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-2 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/75"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Terug naar overzicht
            </button>
          )}

          {error && (
            <div className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-6">{error}</div>
          )}

          {/* Widget dashboard voor parent-tabs */}
          {isOverviewTab && (
            <div className="flex-1 min-h-0">
              <AdminOverview
                activeTab={activeTab}
                onNavigate={setActiveTab}
                userCount={profiles.length}
                companyCount={companies.length}
                joinRequestCount={pendingCount}
                feePct={feePct}
                apiKeyStatuses={{
                  openrouter: openrouterHasKey,
                  groq: groqHasKey,
                  stripe: stripeHasKey,
                  fal: falHasKey,
                  serper: serperHasKey,
                }}
                maintenanceActive={maintenance.is_active}
                activeModuleCount={modules.filter(m => m.is_active).length}
                templateCount={htmlTemplates.length}
                lastAuditAction={auditLogs[0]?.action}
              />
            </div>
          )}

          {/* Platform-marge */}
          {activeTab === 'platform_fees' && <section>
            <div className="mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Platform-marge</h2>
              <p className="text-white/35 text-xs mt-1">Stel de marge in die alle gebruikers betalen bovenop de AI-kosten.</p>
            </div>
            <AdminCreditPanel
              currentFeePct={feePct}
              onSave={handleSaveFee}
              saving={feeSaving}
              error={feeError}
            />
          </section>}

          {/* Aanvragen */}
          {(activeTab === 'aanmeldingen') && <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Beta-aanvragen</h2>
              {!joinLoading && <span className="text-white/25 text-xs">{joinRequests.length} totaal</span>}
            </div>
            {joinError && (
              <div className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-3">{joinError}</div>
            )}
            {joinLoading ? (
              <p className="text-white/25 text-sm py-8 text-center">Laden…</p>
            ) : joinRequests.length === 0 ? (
              <div className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-8 text-center">
                <p className="text-white/30 text-sm">Nog geen aanvragen ontvangen.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {joinRequests.map(req => (
                  <div key={req.id} className={[
                    'border rounded-xl px-5 py-4 space-y-2',
                    req.status === 'pending' ? 'bg-[#141414] border-[#facc15]/20' : 'bg-[#141414] border-white/[0.07]',
                  ].join(' ')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white text-sm font-medium">{req.name || req.email}</p>
                          {req.name && <p className="text-white/35 text-xs">{req.email}</p>}
                          <span className={[
                            'text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0',
                            req.status === 'pending' ? 'bg-[#facc15]/10 text-[#facc15]' :
                            req.status === 'approved' ? 'bg-green-500/10 text-green-400' :
                            'bg-white/[0.06] text-white/35',
                          ].join(' ')}>
                            {req.status === 'pending' ? 'Wachtend' : req.status === 'approved' ? 'Goedgekeurd' : 'Afgewezen'}
                          </span>
                        </div>
                        {req.message && (
                          <p className="text-white/40 text-xs mt-1 leading-relaxed">{req.message}</p>
                        )}
                        <p className="text-white/15 text-[10px] mt-1">
                          {new Date(req.requested_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => denyRequest(req.id)}
                            disabled={denyingRequest === req.id || approvingRequest === req.id}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors disabled:opacity-40"
                          >
                            {denyingRequest === req.id ? '…' : 'Afwijzen'}
                          </button>
                          <button
                            onClick={() => approveRequest(req)}
                            disabled={approvingRequest === req.id || denyingRequest === req.id}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#facc15] hover:bg-[#fde047] text-black transition-colors disabled:opacity-40"
                          >
                            {approvingRequest === req.id ? '…' : 'Goedkeuren'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>}

          {/* Maintenance mode */}
          {activeTab === 'systeem_maintenance' && <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Maintenance mode</h2>
              {maintenance.is_active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">LIVE</span>
              )}
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">App offline zetten</p>
                  <p className="text-white/35 text-xs mt-0.5">Gebruikers zien een melding. Nieuwe logins worden geblokkeerd.</p>
                </div>
                <Toggle
                  checked={maintenance.is_active}
                  onChange={v => setMaintenance(prev => ({ ...prev, is_active: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-white/50 uppercase tracking-widest">Bericht voor gebruikers</label>
                <textarea
                  rows={3}
                  value={maintenance.message}
                  onChange={e => setMaintenance(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="We zijn even offline voor een update. Probeer het over 5 minuten opnieuw."
                  className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20 transition-colors resize-none"
                />
              </div>
              {maintenanceError && <p className="text-red-400 text-xs">{maintenanceError}</p>}
              <button onClick={saveMaintenance} disabled={maintenanceSaving} className="bg-[#facc15] hover:bg-[#fde047] disabled:opacity-40 text-black font-semibold rounded-lg px-4 py-2 text-sm transition-colors">
                {maintenanceSaving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </section>}

          {/* API sleutels */}
          {activeTab === 'platform_keys' && <section>
            <div className="mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">API sleutels</h2>
              <p className="text-white/35 text-xs mt-1">
                Alleen admins kunnen externe AI-diensten koppelen of sleutels vervangen.
              </p>
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
              <ApiKeyRow
                label="OpenRouter"
                description="Vereist voor AI-beeldgeneratie in Atelier."
                hasKey={openrouterHasKey}
                value={openrouterKey}
                placeholder={openrouterHasKey ? '••••••••••••  (vervang bestaande sleutel)' : 'sk-or-…'}
                saving={openrouterSaving}
                saved={openrouterSaved}
                iconBg="rgba(99,102,241,0.12)"
                iconStroke="rgb(129,140,248)"
                onChange={setOpenrouterKey}
                onSave={saveOpenrouterKey}
                icon={(
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                )}
              />
              <ApiKeyRow
                label="Groq"
                description="Vereist voor Meeting Notulist — spraak naar tekst via Whisper."
                hasKey={groqHasKey}
                value={groqKey}
                placeholder={groqHasKey ? '••••••••••••  (vervang bestaande sleutel)' : 'gsk_…'}
                saving={groqSaving}
                saved={groqSaved}
                iconBg="rgba(249,115,22,0.12)"
                iconStroke="rgb(251,146,60)"
                onChange={setGroqKey}
                onSave={saveGroqKey}
                icon={(
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </>
                )}
              />
              <ApiKeyRow
                label="Stripe"
                description="Vereist voor betalingen via Stripe Checkout (credits kopen)."
                hasKey={stripeHasKey}
                value={stripeKey}
                placeholder={stripeHasKey ? '••••••••••••  (vervang bestaande sleutel)' : 'sk_live_…'}
                saving={stripeSaving}
                saved={stripeSaved}
                iconBg="rgba(99,179,237,0.12)"
                iconStroke="rgb(147,210,255)"
                onChange={setStripeKey}
                onSave={saveStripeKey}
                icon={(
                  <>
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </>
                )}
              />
              <ApiKeyRow
                label="Serper"
                description="Google Image Search voor automatisch merkstijl opzoeken in de Media editor."
                hasKey={serperHasKey}
                value={serperKey}
                placeholder={serperHasKey ? '••••••••••••  (vervang bestaande sleutel)' : 'serper-sleutel…'}
                saving={serperSaving}
                saved={serperSaved}
                iconBg="rgba(250,204,21,0.10)"
                iconStroke="rgb(250,204,21)"
                onChange={setSerperKey}
                onSave={saveSerperKey}
                icon={(
                  <>
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </>
                )}
              />
              <ApiKeyRow
                label="fal.ai"
                description="Vereist voor AI-inpainting in de Ad→HTML converter (tekst en logo's verwijderen uit foto's)."
                hasKey={falHasKey}
                value={falKey}
                placeholder={falHasKey ? '••••••••••••  (vervang bestaande sleutel)' : 'fal_…'}
                saving={falSaving}
                saved={falSaved}
                iconBg="rgba(168,85,247,0.12)"
                iconStroke="rgb(196,136,255)"
                onChange={setFalKey}
                onSave={saveFalKey}
                icon={(
                  <>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </>
                )}
              />
              <ApiKeyRow
                label="Adobe Fonts (Typekit)"
                description="Kit ID van fonts.adobe.com — maakt Adobe-fonts beschikbaar in gegenereerde HTML, ook buiten jouw eigen machine."
                hasKey={typekitHasKey}
                value={typekitId}
                placeholder={typekitHasKey ? '••••••••  (vervang bestaand kit ID)' : 'abc1def2…'}
                saving={typekitSaving}
                saved={typekitSaved}
                iconBg="rgba(235,100,50,0.12)"
                iconStroke="rgb(235,130,80)"
                onChange={setTypekitId}
                onSave={saveTypekitId}
                icon={(
                  <>
                    <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" />
                    <circle cx="19" cy="17" r="3" />
                  </>
                )}
              />
            </div>
          </section>}

          {/* Modules */}
          {activeTab === 'modules_globaal' && <section>
            {(() => {
              const mainModules = modules.filter(m => !m.slug.startsWith('atelier_') && m.slug !== 'engine')
              const atelierSubModules = modules.filter(m => m.slug.startsWith('atelier_'))
              const atelierMod = mainModules.find(m => m.slug === 'atelier')
              const visibleCount = mainModules.filter(m => m.is_active).length
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Modules</h2>
                    <span className="text-white/25 text-xs">{visibleCount}/{mainModules.length} actief</span>
                  </div>
                  <div className="bg-[#141414] border border-white/[0.07] rounded-2xl divide-y divide-white/[0.05]">
                    {mainModules.length === 0 ? (
                      <p className="text-white/25 text-sm py-8 text-center">Geen modules gevonden.</p>
                    ) : mainModules.map(mod => (
                      <div key={mod.id}>
                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm font-medium">{mod.label}</p>
                              <span className="text-white/20 text-[10px] font-mono">{mod.slug}</span>
                            </div>
                            {mod.description && (
                              <p className="text-white/35 text-xs mt-0.5 leading-relaxed">{mod.description}</p>
                            )}
                          </div>
                          <Toggle
                            checked={mod.is_active}
                            onChange={() => toggleModuleGlobal(mod.id, mod.is_active)}
                            disabled={savingGlobalModule === mod.id}
                          />
                        </div>

                        {/* Atelier sub-types — ingesprongen onder de hoofd-toggle */}
                        {mod.slug === 'atelier' && atelierSubModules.length > 0 && (
                          <div className={['divide-y divide-white/[0.04] transition-opacity', atelierMod?.is_active ? 'opacity-100' : 'opacity-40 pointer-events-none'].join(' ')}>
                            {atelierSubModules.map(sub => (
                              <div key={sub.id} className="flex items-center justify-between gap-4 pl-10 pr-5 py-3 bg-white/[0.02]">
                                <div className="min-w-0 flex-1">
                                  <p className="text-white/70 text-xs font-medium">{sub.label}</p>
                                  {sub.description && (
                                    <p className="text-white/30 text-[11px] mt-0.5">{sub.description}</p>
                                  )}
                                </div>
                                <Toggle
                                  checked={sub.is_active}
                                  onChange={() => toggleModuleGlobal(sub.id, sub.is_active)}
                                  disabled={savingGlobalModule === sub.id}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </section>}

          {/* Templates */}
          {(activeTab === 'templates') && <section>
            <div className="mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Templates</h2>
              <p className="text-white/35 text-xs mt-1">
                Voeg HTML-presentatietemplates toe. Gebruik <code className="text-white/45">data-huphe-layout</code>, <code className="text-white/45">data-huphe-field</code> en eventueel <code className="text-white/45">data-huphe-image</code>.
              </p>
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/[0.05]">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-[#0f0f0f] px-4 py-6 text-center transition-colors hover:border-[#facc15]/40">
                  <input type="file" accept=".html" className="sr-only" onChange={handleHtmlTemplateUpload} />
                  <span className="text-sm font-semibold text-white/75">Upload HTML-template</span>
                  <span className="mt-1 text-xs text-white/30">Mini website met vaste tekst- en beeldslots</span>
                </label>
                {templateUploadError && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">{templateUploadError}</p>}
                {templateUploadSaved && <p className="mt-3 rounded-lg border border-green-500/20 bg-green-500/[0.08] px-3 py-2 text-xs text-green-300">Template toegevoegd.</p>}
              </div>
              <div className="divide-y divide-white/[0.05]">
                {htmlTemplates.map((template) => {
                  const td = htmlTemplateToTemplateData(template)
                  const editing = editingTemplateId === template.id
                  return (
                    <div key={template.id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-white/80">{template.name}</p>
                            <span className={['rounded-full px-2 py-0.5 text-[10px] font-medium', template.source === 'system' ? 'bg-[#facc15]/10 text-[#facc15]' : 'bg-white/[0.06] text-white/35'].join(' ')}>
                              {template.source === 'system' ? 'Huphe' : 'Eigen'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-white/32">{template.description}</p>
                          <p className="mt-1 text-[10px] text-white/18">{td.layouts.length} layout{td.layouts.length === 1 ? '' : 's'} · HTML</p>
                        </div>
                        {template.source === 'admin' && (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => editing ? cancelEditHtmlTemplate() : startEditHtmlTemplate(template)}
                              className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/35 transition-colors hover:border-white/[0.14] hover:text-white/65"
                            >
                              {editing ? 'Annuleer' : 'Bewerk'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHtmlTemplate(template.id)}
                              className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/35 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
                            >
                              Verwijder
                            </button>
                          </div>
                        )}
                      </div>

                      {editing && (
                        <div className="mt-4 space-y-3 rounded-xl border border-white/[0.07] bg-[#0f0f0f] p-4">
                          <label className="block">
                            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-white/35">Naam</span>
                            <input
                              value={templateDraft.name}
                              onChange={(e) => setTemplateDraft((prev) => ({ ...prev, name: e.target.value }))}
                              className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 text-sm text-white/75 outline-none transition-colors focus:border-[#facc15]/40"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-white/35">Beschrijving</span>
                            <input
                              value={templateDraft.description}
                              onChange={(e) => setTemplateDraft((prev) => ({ ...prev, description: e.target.value }))}
                              className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 text-sm text-white/75 outline-none transition-colors focus:border-[#facc15]/40"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-white/35">HTML</span>
                            <textarea
                              value={templateDraft.html}
                              onChange={(e) => setTemplateDraft((prev) => ({ ...prev, html: e.target.value }))}
                              rows={14}
                              className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-xs leading-relaxed text-white/70 outline-none transition-colors focus:border-[#facc15]/40 font-mono"
                            />
                          </label>

                          {/* Logo uploads */}
                          <div>
                            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-white/35">Logo's</span>
                            <p className="mb-3 text-[11px] text-white/30 leading-relaxed">Gebruik het logo-slot in je template (<code className="text-white/45">data-huphe-field="logo"</code> of een SageTag met role <code className="text-white/45">logo</code>). Upload hier twee varianten — de app kiest automatisch op basis van de diakleur.</p>
                            <div className="grid grid-cols-2 gap-3">
                              {(['onDark', 'onLight'] as const).map((variant) => {
                                const key = variant === 'onDark' ? 'logoUrlOnDark' : 'logoUrlOnLight'
                                const current = templateDraft[key]
                                const label = variant === 'onDark' ? 'Logo voor donkere dia\'s' : 'Logo voor lichte dia\'s'
                                const bgPreview = variant === 'onDark' ? '#111111' : '#f5f5f5'
                                return (
                                  <div key={variant} className="flex flex-col gap-2">
                                    <span className="text-[10px] text-white/40">{label}</span>
                                    {current ? (
                                      <div
                                        className="relative flex items-center justify-center rounded-lg border border-white/[0.08] overflow-hidden"
                                        style={{ background: bgPreview, height: 64 }}
                                      >
                                        <img src={current} alt="" className="max-h-full max-w-full object-contain p-2" />
                                        <button
                                          type="button"
                                          onClick={() => setTemplateDraft((prev) => ({ ...prev, [key]: undefined }))}
                                          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white/60 hover:text-white text-[10px]"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ) : (
                                      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/[0.10] bg-[#0a0a0a] px-3 py-4 text-center transition-colors hover:border-[#facc15]/30" style={{ height: 64 }}>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="sr-only"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (!file) return
                                            const reader = new FileReader()
                                            reader.onload = () => setTemplateDraft((prev) => ({ ...prev, [key]: reader.result as string }))
                                            reader.readAsDataURL(file)
                                            e.target.value = ''
                                          }}
                                        />
                                        <span className="text-[11px] text-white/30">Klik om te uploaden</span>
                                      </label>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditHtmlTemplate}
                              className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/35 transition-colors hover:border-white/[0.14] hover:text-white/65"
                            >
                              Annuleer
                            </button>
                            <button
                              type="button"
                              onClick={saveEditedHtmlTemplate}
                              className="rounded-lg bg-[#facc15] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#fde047]"
                            >
                              Opslaan
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>}

          {/* Bedrijfsaccounts */}
          {activeTab === 'accounts_companies' && <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Bedrijfsaccounts</h2>
              {!companiesLoading && <span className="text-white/25 text-xs">{companies.length} account{companies.length !== 1 ? 's' : ''}</span>}
            </div>
            {companiesLoading ? (
              <p className="text-white/25 text-sm py-4 text-center">Laden…</p>
            ) : companies.length === 0 ? (
              <div className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-6 text-center">
                <p className="text-white/25 text-sm">Nog geen bedrijfsaccounts.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {companies.map(co => (
                  <div key={co.id} className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium">{co.name}</p>
                      <p className="text-white/30 text-xs mt-0.5">Eigenaar: {co.ownerEmail}</p>
                      <p className="text-white/20 text-[10px] mt-0.5">{co.memberCount} leden</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white/60 text-sm font-semibold">
                        {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(co.balance / 100000)}
                      </p>
                      <p className="text-white/20 text-[10px]">wallet</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>}

          {/* Gebruikers */}
          {activeTab === 'accounts_users' && <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Gebruikers</h2>
              {!loading && <span className="text-white/25 text-xs">{profiles.length} account{profiles.length !== 1 ? 's' : ''}</span>}
            </div>
            {loading ? (
              <p className="text-white/25 text-sm py-8 text-center">Laden…</p>
            ) : profiles.length === 0 ? (
              <div className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-8 text-center space-y-1">
                <p className="text-white/30 text-sm">Nog geen gebruikersprofielen.</p>
                <p className="text-white/20 text-xs">Accounts verschijnen hier zodra iemand voor het eerst inlogt.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {profiles.map(profile => {
                  const isCurrentUser = profile.user_id === session.user.id
                  const isAdmin = adminIds.has(profile.user_id)
                  const isExpanded = expandedUserId === profile.user_id
                  return (
                    <div key={profile.user_id} className={['border rounded-xl overflow-hidden', profile.is_active ? 'bg-[#141414] border-white/[0.07]' : 'bg-[#141414] border-red-500/20'].join(' ')}>
                      <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-medium truncate">{profile.display_name || profile.email}</p>
                            {isCurrentUser && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#facc15]/10 text-[#facc15] font-medium flex-shrink-0">jij</span>}
                            {isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40 font-medium flex-shrink-0">admin</span>}
                            {!profile.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium flex-shrink-0">geblokkeerd</span>}
                          </div>
                          {profile.display_name && <p className="text-white/30 text-xs truncate mt-0.5">{profile.email}</p>}
                          <p className="text-white/15 text-[10px] mt-0.5">
                            Actief {new Date(profile.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleExpandWallet(profile.user_id)}
                            className={['text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors', walletExpandedUserId === profile.user_id ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-white/[0.09] hover:text-white/65'].join(' ')}
                          >
                            Wallet
                          </button>
                          <button
                            onClick={() => handleExpandUser(profile.user_id)}
                            className={['text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors', isExpanded ? 'bg-[#facc15]/10 border-[#facc15]/20 text-[#facc15]' : 'bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-white/[0.09] hover:text-white/65'].join(' ')}
                          >
                            Modules
                          </button>
                          {!isCurrentUser && (
                            <>
                              <button
                                onClick={() => toggleActive(profile.user_id, profile.is_active)}
                                disabled={activating === profile.user_id}
                                className={['text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors', profile.is_active ? 'bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20' : 'bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20'].join(' ')}
                              >
                                {activating === profile.user_id ? '…' : profile.is_active ? 'Blokkeren' : 'Activeren'}
                              </button>
                              <button
                                onClick={() => toggleAdmin(profile.user_id)}
                                disabled={toggling === profile.user_id}
                                className={['text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors', isAdmin ? 'bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20' : 'bg-white/[0.04] border-white/[0.07] text-white/35 hover:bg-white/[0.09] hover:text-white/65'].join(' ')}
                              >
                                {toggling === profile.user_id ? '…' : isAdmin ? 'Admin verwijderen' : 'Admin maken'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {walletExpandedUserId === profile.user_id && (
                        <div className="px-5 pb-5 pt-4 border-t border-white/[0.05]">
                          {walletLoading === profile.user_id ? (
                            <p className="text-white/25 text-xs py-4 text-center">Laden…</p>
                          ) : (
                            <div className="space-y-4">
                              {/* Saldo */}
                              <div className="flex gap-3">
                                <div className="flex-1 bg-[#0d0d0d] border border-white/[0.06] rounded-xl p-3">
                                  <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Persoonlijk saldo</p>
                                  <p className="text-white text-sm font-semibold">
                                    {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((userWallets.get(profile.user_id)?.personalBalance ?? 0) / 100)}
                                  </p>
                                </div>
                                <div className="flex-1 bg-[#0d0d0d] border border-white/[0.06] rounded-xl p-3">
                                  <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Bedrijfssaldo</p>
                                  <p className="text-white text-sm font-semibold">
                                    {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((userWallets.get(profile.user_id)?.companyBalance ?? 0) / 100)}
                                  </p>
                                </div>
                              </div>

                              {/* Credits bijschrijven */}
                              <div className="flex gap-2 items-end">
                                <label className="flex-1">
                                  <span className="block text-white/30 text-[10px] uppercase tracking-widest mb-1.5">Credits bijschrijven (centen)</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={creditAmount[profile.user_id] ?? ''}
                                    onChange={e => setCreditAmount(c => ({ ...c, [profile.user_id]: e.target.value }))}
                                    placeholder="bijv. 500 = €5"
                                    className="w-full bg-[#0a0a0a] border border-white/[0.07] focus:border-green-400/30 rounded-lg px-3 py-2 text-white/70 text-xs outline-none placeholder:text-white/20"
                                  />
                                </label>
                                <button
                                  onClick={() => handleGiveCredits(profile.user_id)}
                                  disabled={!creditAmount[profile.user_id] || creditSaving === profile.user_id}
                                  className="bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
                                >
                                  {creditSaving === profile.user_id ? '…' : 'Geven'}
                                </button>
                              </div>

                              {/* Transacties */}
                              <div>
                                <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Recente transacties</p>
                                {(userTransactions.get(profile.user_id) ?? []).length === 0 ? (
                                  <p className="text-white/20 text-xs">Geen transacties.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {(userTransactions.get(profile.user_id) ?? []).map((tx: any, i: number) => (
                                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                                        <div>
                                          <p className="text-white/60 text-xs">{tx.description || tx.type}</p>
                                          <p className="text-white/20 text-[10px]">{new Date(tx.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                        <p className={['text-xs font-semibold', tx.amount_cents > 0 ? 'text-green-400' : 'text-red-400'].join(' ')}>
                                          {tx.amount_cents > 0 ? '+' : ''}{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(tx.amount_cents / 100)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="px-5 pb-5 pt-1 border-t border-white/[0.05]">
                          <UserModulePanel
                            modules={modules.filter(m => m.is_active)}
                            enabledModuleIds={userModuleIds.get(profile.user_id) ?? new Set()}
                            onToggle={(moduleId, enabled) => toggleModule(profile.user_id, moduleId, enabled)}
                            saving={savingModule}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>}

          {/* Atelier module prompts */}
          {activeTab === 'modules_prompts' && <section>
            <div className="mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Atelier module-prompts</h2>
              <p className="text-white/35 text-xs mt-1">Stuur het AI-gedrag per module door het spiekbriefje te bewerken. AI leest dit elke keer dat een gebruiker iets typt in de promptbar.</p>
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-2xl overflow-hidden">
              <div className="flex border-b border-white/[0.06]">
                {MODULE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveModuleTab(type)}
                    className={['flex-1 px-3 py-2.5 text-xs font-medium transition-colors', activeModuleTab === type ? 'text-white bg-white/[0.05]' : 'text-white/40 hover:text-white/70'].join(' ')}
                  >
                    {MODULE_LABELS[type as keyof typeof MODULE_LABELS]}
                  </button>
                ))}
              </div>
              {MODULE_TYPES.map((type) => activeModuleTab !== type ? null : type === 'images' ? (
                <div key={type} className="p-4 space-y-5">
                  <p className="text-white/35 text-xs">
                    De pijplijn detecteert automatisch in welke staat de gebruiker zich bevindt en stuurt de bijbehorende systeemprompt mee. Gebruik <code className="text-white/50 bg-white/[0.06] px-1 rounded">{'{{prompt}}'}</code> als plaatshouder voor de gebruikersinput.
                  </p>
                  {IMAGE_PIPELINE_SLOTS.map((slot) => (
                    <div key={slot.id} className="space-y-2">
                      <div>
                        <p className="text-white/70 text-xs font-semibold">{slot.label}</p>
                        <p className="text-white/30 text-xs">{slot.trigger}</p>
                      </div>
                      <textarea
                        value={pipelineDrafts[slot.id] ?? ''}
                        onChange={(e) => setPipelineDrafts((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                        rows={6}
                        className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-[#facc15]/40 rounded-xl px-3 py-2.5 text-white/70 text-xs leading-relaxed outline-none transition-colors resize-y font-mono placeholder:text-white/20"
                        placeholder={`Systeemprompt voor "${slot.label}"…`}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            resetImagePipelinePrompt(slot.id)
                            setPipelineDrafts((prev) => ({ ...prev, [slot.id]: getDefaultImagePipelinePrompt(slot.id) }))
                          }}
                          className="text-xs text-white/35 hover:text-white/60 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12]"
                        >
                          Herstel standaard
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            saveImagePipelinePrompt(slot.id, pipelineDrafts[slot.id] ?? '')
                            setPipelineSaved((prev) => ({ ...prev, [slot.id]: true }))
                            setTimeout(() => setPipelineSaved((prev) => ({ ...prev, [slot.id]: false })), 2000)
                          }}
                          className="bg-[#facc15] hover:bg-[#fde047] text-black text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors"
                        >
                          {pipelineSaved[slot.id] ? '✓ Opgeslagen' : 'Opslaan'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div key={type} className="p-4 space-y-3">
                  <textarea
                    value={modulePromptDrafts[type] ?? ''}
                    onChange={(e) => setModulePromptDrafts((prev) => ({ ...prev, [type]: e.target.value }))}
                    rows={12}
                    className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-[#facc15]/40 rounded-xl px-3 py-2.5 text-white/70 text-xs leading-relaxed outline-none transition-colors resize-y font-mono placeholder:text-white/20"
                    placeholder="Schrijf hier de instructies voor de AI in deze module..."
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        resetModulePrompt(type)
                        setModulePromptDrafts((prev) => ({ ...prev, [type]: getDefaultModulePrompt(type) }))
                      }}
                      className="text-xs text-white/35 hover:text-white/60 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12]"
                    >
                      Herstel standaard
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        saveModulePrompt(type, modulePromptDrafts[type] ?? '')
                        setModuleSaved((prev) => ({ ...prev, [type]: true }))
                        setTimeout(() => setModuleSaved((prev) => ({ ...prev, [type]: false })), 2000)
                      }}
                      className="bg-[#facc15] hover:bg-[#fde047] text-black text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors"
                    >
                      {moduleSaved[type] ? '✓ Opgeslagen' : 'Opslaan'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>}

          {/* Atelier module models */}
          {activeTab === 'modules_models' && <section>
            <div className="mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Modeltoegang per module</h2>
              <p className="text-white/35 text-xs mt-1">Bepaal welke modellen zichtbaar zijn in de promptbar van elke module. Zo komt er geen tekstmodel in Afbeeldingen en geen beeldmodel in de tekstmodules.</p>
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-2xl overflow-hidden">
              <div className="flex border-b border-white/[0.06]">
                {MODULE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveModuleTab(type)}
                    className={['flex-1 px-3 py-2.5 text-xs font-medium transition-colors', activeModuleTab === type ? 'text-white bg-white/[0.05]' : 'text-white/40 hover:text-white/70'].join(' ')}
                  >
                    {MODULE_LABELS[type as keyof typeof MODULE_LABELS]}
                  </button>
                ))}
              </div>
              {MODULE_TYPES.map((type) => {
                if (activeModuleTab !== type) return null
                const modality = type === 'images' ? 'image' : type === 'video' ? 'video' : 'text'
                const draft = moduleModelDrafts[type] ?? []
                const input = moduleModelInputs[type] ?? ''
                return (
                  <div key={type} className="p-4 space-y-4">
                    <div className="rounded-xl border border-white/[0.07] bg-[#0f0f0f] divide-y divide-white/[0.05] overflow-hidden">
                      {draft.length === 0 ? (
                        <p className="px-4 py-4 text-xs text-white/30">Geen modellen ingesteld.</p>
                      ) : draft.map((model) => (
                        <div key={model.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white/80">{model.label}</p>
                            <p className="mt-0.5 truncate font-mono text-[11px] text-white/30">{model.model}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setModuleModelDrafts((prev) => ({ ...prev, [type]: draft.filter((item) => item.id !== model.id) }))}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-red-300"
                            title="Model verwijderen"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="relative flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input
                          ref={(el) => { moduleModelInputRefs.current[type] = el }}
                          value={input}
                          onChange={(e) => handleModuleModelInputChange(type, e.target.value, modality)}
                          onBlur={() => setTimeout(() => setModuleModelSuggestions((prev) => ({ ...prev, [type]: [] })), 150)}
                          placeholder={modality === 'text' ? 'Zoek model...' : modality === 'image' ? 'Zoek afbeeldingsmodel...' : 'Zoek videomodel...'}
                          spellCheck={false}
                          className="w-full rounded-xl border border-white/[0.08] bg-[#0f0f0f] px-3 py-2 font-mono text-xs text-white/70 outline-none transition-colors placeholder:text-white/20 focus:border-[#facc15]/40"
                        />
                        {(moduleModelSuggestions[type] ?? []).length > 0 && moduleModelDropdownRect[type] && (
                          <div
                            className="fixed z-[9999] overflow-hidden rounded-xl border border-white/[0.10] bg-[#1a1a1a] shadow-2xl"
                            style={{ top: moduleModelDropdownRect[type].top, left: moduleModelDropdownRect[type].left, width: moduleModelDropdownRect[type].width }}
                          >
                            {(moduleModelSuggestions[type] ?? []).map((suggestion) => (
                              <button
                                key={suggestion.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  const id = suggestion.model || suggestion.id
                                  if (draft.some((m) => m.id === id || m.model === id)) return
                                  const next: ModuleModelConfig = {
                                    id,
                                    label: suggestion.label,
                                    model: id,
                                    provider: modality === 'image' ? 'fal' : 'openrouter',
                                    modality,
                                  }
                                  setModuleModelDrafts((prev) => ({ ...prev, [type]: [...draft, next] }))
                                  setModuleModelInputs((prev) => ({ ...prev, [type]: '' }))
                                  setModuleModelSuggestions((prev) => ({ ...prev, [type]: [] }))
                                }}
                                className="flex w-full flex-col px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] border-b border-white/[0.05] last:border-0"
                              >
                                <span className="text-xs font-medium text-white/80">{suggestion.label}</span>
                                <span className="mt-0.5 font-mono text-[10px] text-white/30">{suggestion.model || suggestion.id}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const id = input.trim()
                          if (!id || draft.some((model) => model.id === id || model.model === id)) return
                          const next: ModuleModelConfig = {
                            id,
                            label: id.split('/').pop() || id,
                            model: id,
                            provider: modality === 'image' ? 'fal' : 'openrouter',
                            modality,
                          }
                          setModuleModelDrafts((prev) => ({ ...prev, [type]: [...draft, next] }))
                          setModuleModelInputs((prev) => ({ ...prev, [type]: '' }))
                          setModuleModelSuggestions((prev) => ({ ...prev, [type]: [] }))
                        }}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                      >
                        Toevoegen
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetModuleModels(type)
                          setModuleModelDrafts((prev) => ({ ...prev, [type]: getDefaultModuleModels(type) }))
                        }}
                        className="text-xs text-white/35 hover:text-white/60 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12]"
                      >
                        Herstel standaard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveModuleModels(type, draft)
                          setModuleModelsSaved((prev) => ({ ...prev, [type]: true }))
                          setTimeout(() => setModuleModelsSaved((prev) => ({ ...prev, [type]: false })), 2000)
                        }}
                        className="bg-[#facc15] hover:bg-[#fde047] text-black text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors"
                      >
                        {moduleModelsSaved[type] ? '✓ Opgeslagen' : 'Opslaan'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>}

          {/* Uitnodigen */}
          {(activeTab === 'aanmeldingen') && <section>
            <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">Gebruiker uitnodigen</h2>
            <div className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-4 space-y-3">
              <p className="text-white/45 text-xs leading-relaxed">
                Collega's kunnen via de app een toegangsaanvraag sturen (zie "Beta-aanvragen" hierboven). Je kunt ze ook handmatig uitnodigen via het Supabase dashboard.
              </p>
              <ol className="text-white/30 text-xs space-y-1.5 list-decimal list-inside">
                <li>Ga naar <span className="text-white/55 font-mono text-[11px]">supabase.com/dashboard</span></li>
                <li>Open het <span className="text-white/55">HupheAI</span> project → Authentication → Users</li>
                <li>Klik op <span className="text-white/55">"Invite user"</span> en vul het e-mailadres in</li>
              </ol>
            </div>
          </section>}

          {/* Dev restart — alleen zichtbaar in development */}
          {import.meta.env.DEV && (
            <section>
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">Developer</h2>
              <div className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">App herstarten</p>
                  <p className="text-white/30 text-xs mt-0.5">Sluit de app af en start <code className="text-white/40">npm run dev</code> opnieuw</p>
                </div>
                <button
                  onClick={() => (window as any).api.devRestart()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-black bg-[#facc15] hover:bg-[#fde047] transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-4.6" />
                  </svg>
                  Herstart
                </button>
              </div>
            </section>
          )}

          {/* Audit log */}
          {activeTab === 'systeem_audit' && <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest">Activiteitenlog</h2>
              {!logsLoading && <span className="text-white/25 text-xs">laatste 50 acties</span>}
            </div>
            {logsLoading ? (
              <p className="text-white/25 text-sm py-8 text-center">Laden…</p>
            ) : auditLogs.length === 0 ? (
              <div className="bg-[#141414] border border-white/[0.07] rounded-xl px-5 py-8 text-center">
                <p className="text-white/30 text-sm">Nog geen activiteit gelogd.</p>
              </div>
            ) : (
              <div className="bg-[#141414] border border-white/[0.07] rounded-xl overflow-hidden">
                {auditLogs.map((entry, i) => (
                  <div key={entry.id} className={['flex items-start gap-4 px-5 py-3 text-xs', i < auditLogs.length - 1 ? 'border-b border-white/[0.05]' : ''].join(' ')}>
                    <span className="text-white/20 flex-shrink-0 font-mono tabular-nums pt-0.5">{formatLogTime(entry.created_at)}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-white/70 font-medium">{entry.action}</span>
                      {entry.target_table && <span className="text-white/30 ml-1.5 font-mono">{entry.target_table}</span>}
                    </div>
                    <span className="text-white/15 font-mono flex-shrink-0 hidden sm:block">{entry.actor_id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>}

        </div>
      </main>

      <AdminContextPanel
        activeTab={activeTab}
        userCount={profiles.length}
        companyCount={companies.length}
        joinRequestCount={pendingCount}
      />
    </div>
  )
}

function ApiKeyRow({
  label,
  description,
  hasKey,
  value,
  placeholder,
  saving,
  saved,
  iconBg,
  iconStroke,
  icon,
  onChange,
  onSave,
}: {
  label: string
  description: string
  hasKey: boolean
  value: string
  placeholder: string
  saving: boolean
  saved: boolean
  iconBg: string
  iconStroke: string
  icon: React.ReactNode
  onChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {icon}
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-white/80 text-sm font-medium">{label}</p>
            {hasKey ? (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                ✓ Actief
              </span>
            ) : (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-white/30">
                Niet ingesteld
              </span>
            )}
          </div>
          <p className="text-white/30 text-xs">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
          placeholder={placeholder}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] focus:border-[#facc15]/40 rounded-lg px-3 py-2 text-white/70 text-sm outline-none transition-colors placeholder:text-white/20 font-mono"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={!value.trim() || saving}
          className="flex-shrink-0 bg-[#facc15] hover:bg-[#fde047] disabled:opacity-30 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          {saving ? 'Opslaan…' : saved ? '✓ Opgeslagen' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
