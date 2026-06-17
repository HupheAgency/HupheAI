import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import logo from '../assets/logo.png'
import spinner from '../assets/spinner.png'
import TemplateValidationPanel from '../components/TemplateValidationPanel'
import CompanyAdminPanel from '../components/CompanyAdminPanel'
import CompanySetupModal from '../components/CompanySetupModal'
import { resolveTemplateData } from '../lib/template-storage'
import { extractLogosFromTemplateData, saveClientLogo } from '../lib/client-logos'
import { ClientLogoPanel } from '../components/ClientLogoPanel'
import { WebSlidePreview } from '../components/WebSlidePreview'
import { useCalibration } from '../hooks/useCalibration'
import { SettingsSidebar, SettingsTabId, getParentCategory } from '../components/settings/SettingsSidebar'
import { SettingsContextPanel } from '../components/settings/SettingsContextPanel'
import { SettingsPlaceholders } from '../components/settings/SettingsPlaceholders'
import { SettingsAllOverview } from '../components/settings/SettingsCategoryOverview'
import { SecuritySection } from '../components/settings/SecuritySection'
interface Props {
  onBack: () => void
  embedded?: boolean
  onShowPrivacy?: () => void
}

interface Client {
  id: string
  name: string
}

interface TextItem {
  role: string
  source: string
  ownedDrawableId?: string
  posX?: number
  posY?: number
  width?: number
  height?: number
  alignment?: string
  verticalAlignment?: string
  font?: string
  fontSize?: number
  color?: { r: number; g: number; b: number }
  charProperties?: Record<string, any>
  paraProperties?: Record<string, any>
  shapeProperties?: Record<string, any>
  rawData?: any
}

interface TemplateData {
  slideWidth: number
  slideHeight: number
  layouts: Array<{
    name: string
    textItems: TextItem[]
    images: Array<{ posX: number; posY: number; width: number; height: number; dataUrl?: string }>
    imageSlot?: { posX: number; posY: number; width: number; height: number }
    assets?: Array<{ posX: number; posY: number; width: number; height: number; dataUrl: string }>
    bgColor?: string
    previewDataUrl?: string
    rawData?: any
  }>
}

interface WizardState {
  clientId: string
  sessionPath: string
  templateData: TemplateData
  initialUserNames?: Record<string, Record<number, string>>
  initialScreenshots?: (string | null)[]
  initialStep?: number
}

interface ScreenshotProgress {
  sessionPath: string
  completed: number
  total: number
  current?: string
  phase?: 'preparing' | 'exporting' | 'done' | 'error'
}


const api = () => (window as any).api

export default function SettingsPage({ onBack, embedded, onShowPrivacy }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('account')
  const settingsMainRef = useRef<HTMLElement | null>(null)
  const settingsScrollTimerRef = useRef<number | null>(null)
  const [isSettingsMainScrolling, setIsSettingsMainScrolling] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [templateClientIds, setTemplateClientIds] = useState<Set<string>>(new Set())
  const [templateData, setTemplateData] = useState<Record<string, TemplateData>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadFeedback, setUploadFeedback] = useState<{ clientId: string; ok: boolean; msg: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null)
  const [layoutsOpen, setLayoutsOpen] = useState<Set<string>>(new Set())

  // Add-template form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [addError, setAddError] = useState('')

  const [wizard, setWizard] = useState<WizardState | null>(null)
  const [dismissedValidation, setDismissedValidation] = useState<Set<string>>(new Set())
  // AI visual calibration — runs as the final wizard step ("AI optimaliseert template").
  const calibration = useCalibration()
  const [calibrating, setCalibrating] = useState(false)

  const [generatingTwin, setGeneratingTwin] = useState<string | null>(null)
  const [twinFeedback, setTwinFeedback] = useState<{ clientId: string; ok: boolean; msg: string } | null>(null)

  // Snelle import (key + pdf)
  const [fastKeyFile, setFastKeyFile] = useState<File | null>(null)
  const [fastPdfFile, setFastPdfFile] = useState<File | null>(null)
  const [fastImporting, setFastImporting] = useState(false)
  const [fastError, setFastError] = useState('')

  // Template sharing
  const [shareCodeInput, setShareCodeInput] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [shareCodes, setShareCodes] = useState<Record<string, string>>({})
  const [generatingCode, setGeneratingCode] = useState<string | null>(null)

  const [placeholderUrl, setPlaceholderUrl] = useState<string | null>(null)

  // Account
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [jobTitleSaving, setJobTitleSaving] = useState(false)
  const [jobTitleSaved, setJobTitleSaved] = useState(false)
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // ── Billing ──────────────────────────────────────────────────────────────
  const [personalBalanceCents, setPersonalBalanceCents] = useState<number | null>(null)
  const [company, setCompany] = useState<{ id: string; name: string; monthlyBudgetCents: number; currentPeriodSpentCents: number; currentPeriodStart: string; ownerId?: string } | null>(null)
  const [companyMembers, setCompanyMembers] = useState<{ userId: string; email: string; role: 'admin' | 'member' }[]>([])
  const [companyRole, setCompanyRole] = useState<'admin' | 'member' | null>(null)
  const [companySetupOpen, setCompanySetupOpen] = useState(false)
  const [companyLoading, setCompanyLoading] = useState(false)
  const [companyError, setCompanyError] = useState('')
  const overviewTabs: SettingsTabId[] = ['account','workspace','ai','integrations','app','advanced']
  const activeParentTab = getParentCategory(activeTab)
  const isDetailTab = Boolean(activeParentTab)

  useEffect(() => {
    if (!overviewTabs.includes(activeTab)) return
    const frame = window.requestAnimationFrame(() => {
      const scroller = settingsMainRef.current
      const section = document.getElementById(`settings-section-${activeTab}`)
      if (!scroller || !section) return
      const scrollerTop = scroller.getBoundingClientRect().top
      const sectionTop = section.getBoundingClientRect().top
      scroller.scrollTo({
        top: scroller.scrollTop + sectionTop - scrollerTop - 36,
        behavior: 'smooth',
      })
      window.scrollTo(0, 0)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeTab])

  useEffect(() => {
    return () => {
      if (settingsScrollTimerRef.current !== null) window.clearTimeout(settingsScrollTimerRef.current)
    }
  }, [])

  function handleSettingsMainScroll() {
    setIsSettingsMainScrolling(true)
    if (settingsScrollTimerRef.current !== null) window.clearTimeout(settingsScrollTimerRef.current)
    settingsScrollTimerRef.current = window.setTimeout(() => {
      setIsSettingsMainScrolling(false)
      settingsScrollTimerRef.current = null
    }, 700)
  }

  useEffect(() => {
    api().readPlaceholder().then((res: { ok: boolean; dataUrl?: string }) => {
      if (res.ok && res.dataUrl) setPlaceholderUrl(res.dataUrl)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
      // Lokale clients en templates altijd laden, ongeacht Supabase status
      const [localClients, localTemplateIds] = await Promise.all([
        (window as any).api?.listLocalClients?.() as Promise<Array<{id: string; name: string}>> ?? Promise.resolve([]),
        (window as any).api?.listLocalTemplates?.() as Promise<string[]> ?? Promise.resolve([]),
      ])
      if (cancelled) return
      if (localClients?.length) {
        setClients((prev) => {
          const existingIds = new Set(prev.map((c: any) => c.id))
          const newClients = localClients.filter((c) => !existingIds.has(c.id))
          return [...prev, ...newClients].sort((a, b) => a.name.localeCompare(b.name))
        })
      }
      setTemplateClientIds((prev) => new Set([...prev, ...(localTemplateIds ?? [])]))

      if (!supabase) { setClientsLoading(false); return }

      // Single getUser call shared across all on-mount loads
      const { data: userData } = await supabase.auth.getUser()
      if (cancelled) return
      const user = userData.user
      if (user) {
        setUser(user)
        setDisplayName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')
        setJobTitle(user.user_metadata?.job_title ?? '')
        setAvatarDataUrl(user.user_metadata?.avatar_url ?? null)
      }

      const [clientsRes, templatesRes] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('templates').select('client_id'),
      ])
      if (cancelled) return
      if (clientsRes.data) {
        setClients((prev) => {
          const localIds = new Set((localClients ?? []).map((c) => c.id))
          const merged = [...(localClients ?? []).filter((c) => !clientsRes.data!.find((r: any) => r.id === c.id)), ...clientsRes.data!]
          return merged.filter((c) => localIds.has(c.id) || clientsRes.data!.find((r: any) => r.id === c.id)).sort((a: any, b: any) => a.name.localeCompare(b.name))
        })
      }
      const remoteIds = (templatesRes.data ?? []).map((r: any) => r.client_id as string)
      setTemplateClientIds(new Set([...(localTemplateIds ?? []), ...remoteIds]))

      if (!user?.id) return
      const { data: walletData } = await supabase.rpc('get_wallet')
      if (cancelled) return
      if (walletData) {
        const d = walletData as any
        if (!cancelled) setPersonalBalanceCents(d.personal_balance ?? 0)
        if (d.company_id) {
          // Haal ook owner_id op voor de transfer-functie
          const { data: companyData } = await supabase.from('company_accounts').select('owner_id').eq('id', d.company_id).maybeSingle()
          setCompany({ id: d.company_id, name: d.company_name ?? '', monthlyBudgetCents: d.company_monthly_budget ?? 0, currentPeriodSpentCents: d.company_period_spent ?? 0, currentPeriodStart: d.company_period_start ?? '', ownerId: (companyData as any)?.owner_id ?? undefined })
          setCompanyRole(d.company_role ?? 'member')
          if (d.company_role === 'admin') {
            const { data: members } = await supabase.from('company_members').select('user_id, role').eq('company_id', d.company_id)
            if (cancelled || !members) return
            const withEmails = await Promise.all(members.map(async (m: any) => {
              const { data: profile } = await supabase.from('user_profiles').select('email').eq('user_id', m.user_id).maybeSingle()
              return { userId: m.user_id, email: (profile as any)?.email ?? m.user_id, role: m.role as 'admin' | 'member' }
            }))
            if (!cancelled) setCompanyMembers(withEmails)
          }
        }
      }
      } finally {
        if (!cancelled) setClientsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function saveDisplayName() {
    if (!supabase) return
    setNameSaving(true)
    setNameSaved(false)
    await supabase.auth.updateUser({ data: { full_name: displayName } })
    setNameSaving(false)
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  async function saveJobTitle() {
    if (!supabase) return
    setJobTitleSaving(true)
    setJobTitleSaved(false)
    await supabase.auth.updateUser({ data: { job_title: jobTitle } })
    setJobTitleSaving(false)
    setJobTitleSaved(true)
    setTimeout(() => setJobTitleSaved(false), 2000)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !supabase) return
    setAvatarUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const img = new Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const size = 128
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setAvatarDataUrl(dataUrl)
        await supabase!.auth.updateUser({ data: { avatar_url: dataUrl } })
        setAvatarUploading(false)
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')

  async function handleDeleteMyData() {
    if (!supabase) return
    const confirmed = window.confirm(
      'Weet je zeker dat je je account en alle data wilt verwijderen?\n\n' +
      'Dit verwijdert:\n• Presentaties, assets, documenten\n• Engine-gesprekken en AI-sessies\n• Wallet en credits\n• Profiel en instellingen\n\n' +
      'Betalingsrecords blijven bewaard zoals wettelijk vereist.\nDit kan NIET ongedaan worden gemaakt.'
    )
    if (!confirmed) return
    setDeletingAccount(true)
    setDeleteAccountError('')
    const { data, error } = await supabase.rpc('delete_my_data')
    if (error || !(data as any)?.ok) {
      setDeleteAccountError(error?.message ?? 'Verwijderen mislukt.')
      setDeletingAccount(false)
      return
    }
    await supabase.auth.signOut()
  }


  async function handleCreateCompany(name: string, monthlyBudgetCents: number) {
    if (!supabase) return
    setCompanyLoading(true); setCompanyError('')
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { setCompanyLoading(false); setCompanyError('Niet ingelogd'); return }
    const { data, error } = await supabase.from('company_accounts').insert({ name, owner_id: u.id, monthly_budget_cents: monthlyBudgetCents }).select().single()
    if (error) { setCompanyLoading(false); setCompanyError(error.message); return }
    await supabase.from('company_members').insert({ company_id: (data as any).id, user_id: u.id, role: 'admin' })
    setCompany({ id: (data as any).id, name, monthlyBudgetCents, currentPeriodSpentCents: 0, currentPeriodStart: new Date().toISOString().slice(0, 10) })
    setCompanyRole('admin')
    setCompanyLoading(false)
    setCompanySetupOpen(false)
  }

  async function handleUpdateBudget(newBudgetCents: number) {
    if (!supabase || !company) return
    setCompanyLoading(true); setCompanyError('')
    const { error } = await supabase.from('company_accounts').update({ monthly_budget_cents: newBudgetCents }).eq('id', company.id)
    setCompanyLoading(false)
    if (error) setCompanyError(error.message)
    else setCompany(c => c ? { ...c, monthlyBudgetCents: newBudgetCents } : c)
  }

  async function handleInviteMember(email: string) {
    if (!supabase || !company) return
    setCompanyLoading(true)
    setCompanyError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${(import.meta as any).env?.RENDERER_VITE_SUPABASE_URL ?? (import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/invite-company-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ email, company_id: company.id, role: 'member' }),
    })
    const data = await res.json()
    if (!res.ok) setCompanyError(data.error ?? 'Uitnodiging mislukt')
    setCompanyLoading(false)
  }

  async function handleRemoveMember(userId: string) {
    if (!supabase || !company) return
    await supabase.from('company_members').delete().eq('company_id', company.id).eq('user_id', userId)
    setCompanyMembers(m => m.filter(x => x.userId !== userId))
  }

  async function handleChangeMemberRole(userId: string, role: 'admin' | 'member') {
    if (!supabase || !company) return
    await supabase.from('company_members').update({ role }).eq('company_id', company.id).eq('user_id', userId)
    setCompanyMembers(m => m.map(x => x.userId === userId ? { ...x, role } : x))
  }

  async function handleDeleteCompany() {
    if (!supabase || !company) return
    if (!window.confirm(`Weet je zeker dat je "${company.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    setCompanyLoading(true)
    setCompanyError('')
    await supabase.from('company_members').delete().eq('company_id', company.id)
    const { error } = await supabase.from('company_accounts').delete().eq('id', company.id)
    if (error) { setCompanyError(error.message); setCompanyLoading(false); return }
    await supabase.rpc('set_billing_preference', { p_prefer_personal: false })
    setCompany(null)
    setCompanyRole(null)
    setCompanyMembers([])
    setCompanyLoading(false)
  }

  async function handleTransferOwnership(newOwnerUserId: string) {
    if (!supabase || !company) return
    setCompanyLoading(true)
    setCompanyError('')
    const { error } = await supabase
      .from('company_accounts')
      .update({ owner_id: newOwnerUserId })
      .eq('id', company.id)
    if (error) { setCompanyError(error.message); setCompanyLoading(false); return }
    // Nieuwe eigenaar krijgt automatisch admin-rol
    await supabase.from('company_members')
      .upsert({ company_id: company.id, user_id: newOwnerUserId, role: 'admin' }, { onConflict: 'company_id,user_id' })
    setCompany(c => c ? { ...c, ownerId: newOwnerUserId } : c)
    setCompanyLoading(false)
  }

  async function handleUpload(clientId: string): Promise<{ ok: boolean; error?: string }> {
    setUploadFeedback(null)
    setUploading(clientId)
    try {
      const result = await api().pickAndImportTemplate(clientId)
      if (result.canceled) return { ok: false }
      if (!result.ok) {
        const msg = result.error ?? 'Importeren mislukt.'
        setUploadFeedback({ clientId, ok: false, msg })
        return { ok: false, error: msg }
      }
      // Template is al lokaal opgeslagen door pickAndImportTemplate — geen Supabase upload nodig.
      // Supabase sync vindt alleen plaats bij expliciet "live zetten".
      const td = result.templateData as TemplateData
      setTemplateClientIds((prev) => new Set([...prev, clientId]))
      setTemplateData((prev) => ({ ...prev, [clientId]: td }))
      setUploadFeedback({ clientId, ok: true, msg: 'Geïmporteerd — wizard opent…' })
      setWizard({ clientId, sessionPath: result.sessionPath, templateData: td })
      // Logo's extraheren en opslaan
      const extractedLogos = extractLogosFromTemplateData(td as any)
      if (extractedLogos.length > 0) {
        await saveClientLogo(clientId, extractedLogos[0], { source: 'import', makePrimary: false })
      }
      return { ok: true }
    } catch (err: any) {
      const msg = err?.message ?? 'Onbekende fout.'
      setUploadFeedback({ clientId, ok: false, msg })
      return { ok: false, error: msg }
    } finally {
      setUploading(null)
    }
  }

  async function handleAddTemplate() {
    if (!newName.trim()) return
    setAddingNew(true)
    setAddError('')
    try {
      const trimmed = newName.trim()
      // Kijk of de client al lokaal of in Supabase bestaat
      const existing = clients.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
      let clientId: string
      if (existing) {
        clientId = existing.id
      } else {
        // Lokale client aanmaken — geen Supabase nodig. Wordt gesync't bij live zetten.
        const newClient = await (window as any).api?.addLocalClient?.(trimmed)
        if (!newClient?.id) { setAddError('Aanmaken mislukt.'); return }
        clientId = newClient.id
        setClients((prev) => [...prev, { id: clientId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name)))
      }
      const uploadResult = await handleUpload(clientId)
      if (!uploadResult.ok) {
        if (uploadResult.error) setAddError(uploadResult.error)
        return
      }
      setShowAddForm(false)
      setNewName('')
    } finally {
      setAddingNew(false)
    }
  }

  async function handleDeleteTemplate(clientId: string, clientName: string) {
    if (!confirm(`Weet je zeker dat je het template van "${clientName}" wilt verwijderen?`)) return
    setDeletingTemplate(clientId)
    // Lokale bestanden en client registry opruimen
    await (window as any).api?.deleteLocalClient?.(clientId)
    if (supabase) {
      await Promise.all([
        supabase.from('clients').delete().eq('id', clientId),
        supabase.from('templates').delete().eq('client_id', clientId),
        supabase.from('template_mappings').delete().eq('client_id', clientId),
      ])
    }
    setClients((prev) => prev.filter((c) => c.id !== clientId))
    setTemplateClientIds((prev) => { const next = new Set(prev); next.delete(clientId); return next })
    setTemplateData((prev) => { const next = { ...prev }; delete next[clientId]; return next })
    setExpanded((prev) => (prev === clientId ? null : prev))
    setShareCodes((prev) => { const next = { ...prev }; delete next[clientId]; return next })
    setDeletingTemplate(null)
  }

  async function handleClaimCode() {
    if (!shareCodeInput.trim() || !supabase) return
    setClaiming(true)
    setClaimError('')
    const { data, error } = await supabase.rpc('join_template_by_code', { p_share_code: shareCodeInput.trim() })
    if (error || !data?.ok) {
      setClaimError(error?.message ?? data?.error ?? 'Code claimen mislukt.')
      setClaiming(false)
      return
    }
    
    // Refresh clients and templates
    const { data: clientData } = await supabase.from('clients').select('id, name').order('name')
    if (clientData) setClients(clientData)
    
    const { data: templateData } = await supabase.from('templates').select('client_id')
    if (templateData) setTemplateClientIds(new Set(templateData.map((r: any) => r.client_id as string)))
    
    setShareCodeInput('')
    setClaiming(false)
    setShowAddForm(false)
  }

  async function handleGenerateShareCode(clientId: string) {
    if (!supabase) return
    setGeneratingCode(clientId)
    const { data, error } = await supabase.rpc('generate_template_share_code', { p_client_id: clientId })
    if (!error && data?.ok && data.code) {
      setShareCodes(prev => ({ ...prev, [clientId]: data.code }))
    } else {
      alert(error?.message ?? data?.error ?? 'Kan code niet genereren.')
    }
    setGeneratingCode(null)
  }

  async function toggleExpand(clientId: string) {
    if (expanded === clientId) { setExpanded(null); return }
    setExpanded(clientId)
    if (!templateData[clientId]) {
      setLoadingExpand(clientId)
      // Lokale cache eerst
      const localRes = await (window as any).api?.getLocalTemplateData?.(clientId)
      if (localRes?.ok && localRes.templateData) {
        setTemplateData((prev) => ({ ...prev, [clientId]: localRes.templateData }))
      } else if (supabase) {
        const { data } = await supabase
          .from('templates')
          .select('template_data')
          .eq('client_id', clientId)
          .maybeSingle()
        if (data?.template_data) {
          const resolved = await resolveTemplateData(supabase, data.template_data)
          if (resolved) setTemplateData((prev) => ({ ...prev, [clientId]: resolved }))
        }
      }
      setLoadingExpand(null)
    }
  }

  async function handleWizardSave(clientId: string, userNames: Record<string, Record<number, string>>, sessionPath: string) {
    // Niet meer afhankelijk van Supabase — lokaal opslaan is altijd mogelijk
    const mappings: Record<string, any> = {}
    const layouts = (templateData[clientId] ?? wizard?.templateData)?.layouts ?? []

    // Preserve user-assigned names for text boxes that had no sageTag in the .key
    const userSageTags: Record<string, Record<string, string>> = {}
    // Collect ownedDrawable upgrades: shapes that need to be promoted to sagetags
    const upgrades: Record<string, Array<{ ownedDrawableId: string; tagName: string }>> = {}

    for (const [layoutName, items] of Object.entries(userNames)) {
      const layout = layouts.find((l) => l.name === layoutName)
      for (const [idxStr, name] of Object.entries(items)) {
        if (!name?.trim()) continue
        if (!userSageTags[layoutName]) userSageTags[layoutName] = {}
        userSageTags[layoutName][idxStr] = name.trim()

        // Check if this item is an ownedDrawable (not-yet-a-placeholder text box)
        const item = layout?.textItems[Number(idxStr)]
        if (item?.source === 'ownedDrawable' && item.ownedDrawableId) {
          if (!upgrades[layoutName]) upgrades[layoutName] = []
          upgrades[layoutName].push({ ownedDrawableId: item.ownedDrawableId, tagName: name.trim() })
        }
      }
    }
    if (Object.keys(userSageTags).length > 0) mappings['_userSageTags'] = userSageTags

    const order = layouts.map((l) => l.name)
    if (order.length > 0) mappings['_order'] = order

    if (Object.keys(mappings).length > 0) {
      // Lokaal opslaan als primaire opslag; Supabase als back-up
      await (window as any).api?.setLocalMappings?.(clientId, mappings)
      if (supabase) {
        await supabase.from('template_mappings').upsert({ client_id: clientId, mappings }, { onConflict: 'client_id' })
      }
    }

    // Upgrade non-placeholder text boxes to sageTag placeholders in the stored .key
    if (Object.keys(upgrades).length > 0) {
      const result = await api().upgradePlaceholders(clientId, upgrades)
      if (!result.ok) console.error('[wizard] upgrade-placeholders fout:', result.error)
    }

    // ── AI visual calibration step ──────────────────────────────────────────
    // Overgeslagen in PDF-modus (sessionPath === '') — geen Keynote nodig.
    // Calibratie kan later apart worden uitgevoerd via de template-lijst.
    try {
      const td = templateData[clientId] ?? wizard?.templateData
      const visualLayouts = (td?.layouts ?? []).filter((l) => (l.shapes?.length ?? 0) > 0 || (l.assets?.length ?? 0) > 0).map((l) => l.name)
      console.log('[calib] wizard-stap: visuele layouts:', visualLayouts.length, visualLayouts)
      if (td && visualLayouts.length > 0 && sessionPath) {
        setCalibrating(true)
        const report = await calibration.run(td, clientId, { layoutNames: visualLayouts })
        console.log('[calib] wizard-stap KLAAR — rapport:', report)
        if (report?.corrections && Object.keys(report.corrections).length > 0) {
          // Lokaal ophalen, mergen en opslaan
          const localMappings = await (window as any).api?.getLocalMappings?.(clientId) ?? {}
          const merged = { ...localMappings, _visualCorrections: report.corrections }
          await (window as any).api?.setLocalMappings?.(clientId, merged)
          if (supabase) {
            await supabase.from('template_mappings').upsert(
              { client_id: clientId, mappings: merged },
              { onConflict: 'client_id' },
            )
          }
          console.log('[calib] correcties opgeslagen voor', Object.keys(report.corrections).length, 'layouts')
        }
      }
    } catch (err) {
      console.error('[calib] wizard-stap fout:', err)
    } finally {
      setCalibrating(false)
    }

    api().cleanupWizardSession(sessionPath)

    // Digital twin automatisch aanmaken na wizard
    const td = templateData[clientId] ?? wizard?.templateData
    const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId
    if (td) {
      const localMappings = await api().getLocalMappings(clientId) ?? {}
      const sageTagMappings = localMappings['_mdToSageTag'] ?? {}
      api().generateTemplateTs({ templateData: td, name: clientName, clientId, sageTagMappings })
        .then((res: any) => console.log('[digital-twin] aangemaakt:', res?.slug ?? 'onbekend'))
        .catch((err: any) => console.warn('[digital-twin] mislukt:', err?.message))
    }

    setWizard(null)
    setUploadFeedback(null)
  }

  function handleWizardClose(sessionPath: string) {
    api().cleanupWizardSession(sessionPath)
    setWizard(null)
    setUploadFeedback(null)
  }

  async function handleFastImport() {
    if (!fastKeyFile || !newName.trim()) return
    setFastImporting(true)
    setFastError('')
    try {
      const trimmed = newName.trim()
      // Client aanmaken (lokaal — geen Supabase nodig)
      const existing = clients.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
      let clientId: string
      if (existing) {
        clientId = existing.id
      } else {
        const newClient = await api().addLocalClient(trimmed)
        if (!newClient?.id) { setFastError('Client aanmaken mislukt — herstart de app.'); return }
        clientId = newClient.id
        setClients((prev) => [...prev, { id: clientId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name)))
      }

      // .key parsen en lokaal opslaan
      const keyBuffer = await fastKeyFile.arrayBuffer()
      const importResult = await api().importTemplate(clientId, keyBuffer)
      if (!importResult?.ok) { setFastError(importResult?.error ?? '.key parsen mislukt.'); return }

      const td = importResult.templateData as TemplateData
      setTemplateClientIds((prev) => new Set([...prev, clientId]))
      setTemplateData((prev) => ({ ...prev, [clientId]: td }))

      // Logo's extraheren en opslaan in de backend
      const extractedLogos = extractLogosFromTemplateData(td as any)
      if (extractedLogos.length > 0) {
        const label = `${trimmed} — geïmporteerd ${new Date().toLocaleDateString('nl-NL')}`
        // Sla alleen het eerste unieke logo op als primary; duplicaten worden gededupliceerd door extractLogosFromTemplateData
        await saveClientLogo(clientId, extractedLogos[0], { label, source: 'import', makePrimary: true })
        console.log(`[fast-import] ${extractedLogos.length} uniek logo geëxtraheerd voor klant ${clientId}`)
      }

      // PDF pagina's omzetten naar referentiethumbnails
      let pdfScreenshots: (string | null)[] = []
      if (fastPdfFile) {
        const pdfBuffer = await fastPdfFile.arrayBuffer()
        const pdfResult = await api().pdfToScreenshots(pdfBuffer)
        if (pdfResult?.ok) {
          pdfScreenshots = pdfResult.dataUrls
        } else {
          console.warn('[fast-import] PDF conversie mislukt:', pdfResult?.error)
          setFastError(`PDF verwerken mislukt: ${pdfResult?.error ?? 'onbekend'}. Ga toch verder zonder PDF.`)
          // Toch doorgaan — PDF is optioneel
        }
      }

      // Wizard openen — sessionPath = '' zodat Keynote NIET wordt geopend
      setWizard({ clientId, sessionPath: '', templateData: td, initialScreenshots: pdfScreenshots.length ? pdfScreenshots : undefined })
      setShowAddForm(false)
      setNewName('')
      setFastKeyFile(null)
      setFastPdfFile(null)
      setFastError('')
    } catch (err: any) {
      setFastError(err?.message ?? 'Onbekende fout.')
    } finally {
      setFastImporting(false)
    }
  }

  async function handleGenerateDigitalTwin(clientId: string, clientName: string) {
    setGeneratingTwin(clientId)
    setTwinFeedback(null)
    try {
      // Lokale template data ophalen
      const localRes = await (window as any).api?.getLocalTemplateData?.(clientId)
      let td = localRes?.ok ? localRes.templateData : templateData[clientId]
      if (!td && supabase) {
        const { data } = await supabase.from('templates').select('template_data').eq('client_id', clientId).maybeSingle()
        if (data?.template_data) td = await resolveTemplateData(supabase, data.template_data)
      }
      if (!td) { setTwinFeedback({ clientId, ok: false, msg: 'Template data niet gevonden.' }); return }

      const localMappings = await (window as any).api?.getLocalMappings?.(clientId) ?? {}
      const sageTagMappings = localMappings['_mdToSageTag'] ?? {}

      const result = await (window as any).api?.generateTemplateTs?.({ templateData: td, name: clientName, clientId, sageTagMappings })
      if (result?.ok) {
        setTwinFeedback({ clientId, ok: true, msg: `Digital twin aangemaakt: ${result.slug}` })
      } else {
        setTwinFeedback({ clientId, ok: false, msg: result?.error ?? 'Genereren mislukt.' })
      }
    } catch (err: any) {
      setTwinFeedback({ clientId, ok: false, msg: err?.message ?? 'Onbekende fout.' })
    } finally {
      setGeneratingTwin(null)
    }
  }

  return (
    <div className={embedded ? 'h-full bg-[#0a0a0a] flex flex-col overflow-hidden' : 'min-h-screen bg-[#0a0a0a] flex flex-col'}>
      {!embedded && (
        <header
          className="flex-shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
          style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
        >
          <div className="flex items-center gap-3 pl-20" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={wizard ? () => handleWizardClose(wizard.sessionPath) : onBack}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {wizard ? 'Instellingen' : 'Dashboard'}
            </button>
            <span className="text-white/10 text-xs">/</span>
            <span className="text-white/60 text-xs">{wizard ? 'Rollen instellen' : 'Instellingen'}</span>
          </div>
          <div className="flex items-center gap-2 pr-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="w-6 h-6 bg-[#facc15] rounded-md flex items-center justify-center">
              <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />
            </div>
          </div>
        </header>
      )}

      {calibrating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(10,10,10,0.88)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: 24,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgba(250,204,21,0.25)', borderTopColor: '#facc15',
            animation: 'spin 0.9s linear infinite',
          }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>AI optimaliseert je template…</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', maxWidth: 360 }}>
            {calibration.progress.phase === 'fonts' && 'Fonts controleren…'}
            {calibration.progress.phase === 'keynote' && 'Keynote-referenties maken (dit kan even duren)…'}
            {calibration.progress.phase === 'correcting' && (
              <>Vergelijken & bijwerken — {calibration.progress.completed}/{calibration.progress.total}
                {calibration.progress.current ? ` · ${calibration.progress.current}` : ''}
                {calibration.progress.iteration ? ` (ronde ${calibration.progress.iteration})` : ''}</>
            )}
            {(calibration.progress.phase === 'idle' || calibration.progress.phase === 'done') && 'Voorbereiden…'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Open DevTools voor details (logs met [calib])</div>
        </div>
      )}

      {wizard ? (
        <MappingWizard
          wizard={wizard}
          onSave={(assignments) => handleWizardSave(wizard.clientId, assignments, wizard.sessionPath)}
          onClose={() => handleWizardClose(wizard.sessionPath)}
        />
      ) : (
        <div
          className="flex-1 flex min-h-0 overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 28% 12%, rgba(255,255,255,0.035), transparent 34%), radial-gradient(circle at 86% 0%, rgba(255,216,61,0.035), transparent 26%), #0A0A0A',
          }}
        >
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="w-[400px] flex-shrink-0" />
          <main
            ref={settingsMainRef}
            onScroll={handleSettingsMainScroll}
            className={[
              'settings-main-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-9 pb-24',
              isSettingsMainScrolling ? 'settings-main-scroll--active' : '',
            ].join(' ')}
          >
            <div className="mx-auto" style={{ maxWidth: 980 }}>
              {!isDetailTab && (
                <div className="mb-9">
                  <h1 className="text-[32px] font-semibold tracking-normal text-white">Instellingen</h1>
                  <p className="mt-1.5 text-sm text-white/[0.42]">Beheer je account, workspace en app voorkeuren.</p>
                </div>
              )}
              {isDetailTab && <div className="h-[112px]" />}
              {isDetailTab && activeParentTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab(activeParentTab)}
                  className="mb-3 inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-2 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/75"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Terug naar overzicht
                </button>
              )}
          {activeTab === 'advanced_templates' && (
            <div>
          {/* Templates */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-white font-semibold text-[17px]">Templates</h1>
              <p className="text-white/35 text-sm mt-1">
                Upload een <code className="text-white/50">.key</code> bestand en geef het een naam.
              </p>
            </div>
            <button
              onClick={() => { setShowAddForm((v) => !v); setAddError(''); setNewName('') }}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs border border-white/[0.08] hover:border-white/20 text-white/40 hover:text-white/70 rounded-md px-3 py-1.5 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Template toevoegen
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="mb-4 bg-[#141414] border border-white/[0.10] rounded-xl p-5 space-y-4 relative">
              <button
                onClick={() => { setShowAddForm(false); setFastKeyFile(null); setFastPdfFile(null); setFastError(''); setAddError('') }}
                className="absolute top-3 right-3 bg-white/[0.05] hover:bg-white/[0.1] text-white/50 hover:text-white transition-colors p-2 rounded-full z-10"
                title="Sluiten"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <p className="text-white/50 text-xs font-medium uppercase tracking-widest pr-8">Nieuw template</p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Naam (bijv. Roorda, Dark theme…)"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2.5 text-white/70 text-sm outline-none transition-colors placeholder:text-white/20"
                onKeyDown={(e) => { if (e.key === 'Enter' && fastKeyFile) handleFastImport() }}
              />

              {/* Snelle import: key + pdf dropzones */}
              <div className="grid grid-cols-2 gap-3">
                <label className={[
                  'flex flex-col items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                  fastKeyFile ? 'border-[#facc15]/40 bg-[#facc15]/[0.03]' : 'border-white/[0.08] hover:border-white/20',
                ].join(' ')}>
                  <input type="file" accept=".key" className="sr-only" onChange={(e) => setFastKeyFile(e.target.files?.[0] ?? null)} />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={fastKeyFile ? 'rgba(250,204,21,0.6)' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className={['text-xs text-center leading-snug', fastKeyFile ? 'text-[#facc15]/70' : 'text-white/30'].join(' ')}>
                    {fastKeyFile ? fastKeyFile.name : '.key bestand'}
                  </span>
                </label>
                <label className={[
                  'flex flex-col items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                  fastPdfFile ? 'border-white/30 bg-white/[0.02]' : 'border-white/[0.08] hover:border-white/20',
                ].join(' ')}>
                  <input type="file" accept=".pdf" className="sr-only" onChange={(e) => setFastPdfFile(e.target.files?.[0] ?? null)} />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={fastPdfFile ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className={['text-xs text-center leading-snug', fastPdfFile ? 'text-white/50' : 'text-white/30'].join(' ')}>
                    {fastPdfFile ? fastPdfFile.name : 'PDF met slides (optioneel)'}
                  </span>
                </label>
              </div>
              <p className="text-white/20 text-[11px] -mt-1">Met PDF worden slide-afbeeldingen direct gebruikt — geen Keynote nodig.</p>

              <div className="flex items-center gap-3">
                {fastImporting && (
                  <svg className="animate-spin text-white/40" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                <button
                  onClick={handleFastImport}
                  disabled={!newName.trim() || !fastKeyFile || fastImporting}
                  className="ml-auto bg-[#facc15] hover:bg-[#fde047] disabled:opacity-30 disabled:cursor-not-allowed text-black font-semibold rounded-md px-4 py-2 text-xs transition-colors"
                >
                  {fastImporting ? (fastPdfFile ? 'PDF verwerken…' : 'Importeren…') : 'Importeer'}
                </button>
              </div>
              {(fastError || addError) && <p className="text-red-400 text-xs">{fastError || addError}</p>}
              
              <div className="pt-3 border-t border-white/[0.06] mt-3">
                <p className="text-white/50 text-xs font-medium uppercase tracking-widest mb-3">Of claim een gedeeld template</p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={shareCodeInput}
                    onChange={(e) => setShareCodeInput(e.target.value)}
                    placeholder="Voer een 6-cijferige deel-code in…"
                    className="flex-1 bg-[#0f0f0f] border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2 text-white/70 text-sm outline-none transition-colors placeholder:text-white/20 font-mono uppercase"
                    maxLength={6}
                  />
                  <button
                    onClick={handleClaimCode}
                    disabled={shareCodeInput.length < 6 || claiming}
                    className="flex-shrink-0 text-xs border border-white/[0.08] hover:border-[#facc15]/30 text-white/40 hover:text-[#facc15]/80 disabled:opacity-30 disabled:cursor-not-allowed rounded-md px-4 py-2 transition-colors"
                  >
                    {claiming ? 'Claimen…' : 'Claimen'}
                  </button>
                </div>
                {claimError && <p className="text-red-400 text-xs mt-2">{claimError}</p>}
              </div>
            </div>
          )}

          {/* Template list — only uploaded templates */}
          {clientsLoading ? (
            <p className="text-white/20 text-sm">Laden…</p>
          ) : templateClientIds.size === 0 && !showAddForm ? (
            <p className="text-white/20 text-sm">Nog geen templates. Klik op "Template toevoegen" om te beginnen.</p>
          ) : (
            <div className="space-y-2">
              {clients.filter((c) => templateClientIds.has(c.id)).map((c) => {
                const isUploading = uploading === c.id
                const isExpanded = expanded === c.id
                const isDeleting = deletingTemplate === c.id
                const isLoadingExpand = loadingExpand === c.id
                const fb = uploadFeedback?.clientId === c.id ? uploadFeedback : null
                const twinFb = twinFeedback?.clientId === c.id ? twinFeedback : null
                const td = templateData[c.id]

                return (
                  <div key={c.id} className="bg-[#141414] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="px-5 py-4 space-y-3">
                      {/* Naam + expand */}
                      <button
                        onClick={() => toggleExpand(c.id)}
                        className="flex items-center gap-3 w-full text-left min-w-0"
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-[#facc15]" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-white text-sm font-medium">
                            <span className="truncate">{c.name}</span>
                            <svg
                              width="14" height="14" viewBox="0 0 24 24" fill="none"
                              stroke="rgba(255,255,255,0.5)" strokeWidth="2.5"
                              strokeLinecap="round" strokeLinejoin="round"
                              className={['transition-transform flex-shrink-0', isExpanded ? 'rotate-180' : ''].join(' ')}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </p>
                          {twinFb ? (
                            <p className={['text-xs mt-0.5', twinFb.ok ? 'text-[#facc15]/70' : 'text-red-400'].join(' ')}>{twinFb.msg}</p>
                          ) : fb ? (
                            <p className={['text-xs mt-0.5', fb.ok ? 'text-[#facc15]/70' : 'text-red-400'].join(' ')}>{fb.msg}</p>
                          ) : (
                            <p className="text-white/35 text-xs mt-0.5">Klik om logo's en layouts te zien</p>
                          )}
                        </div>
                      </button>

                      {/* Actie-knoppen op eigen regel */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleUpload(c.id)}
                          disabled={isUploading}
                          className="text-xs border border-white/[0.08] hover:border-white/20 text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed rounded-md px-3 py-1.5 transition-colors"
                        >
                          {isUploading ? 'Importeren…' : 'Vervangen'}
                        </button>
                        <button
                          onClick={async () => {
                            let resolvedTd = td
                            if (!resolvedTd) {
                              const localRes = await api().getLocalTemplateData(c.id)
                              resolvedTd = localRes?.ok ? localRes.templateData : null
                              if (!resolvedTd && supabase) {
                                const { data: tRes } = await supabase.from('templates').select('template_data').eq('client_id', c.id).maybeSingle()
                                if (tRes?.template_data) resolvedTd = await resolveTemplateData(supabase, tRes.template_data)
                              }
                              if (resolvedTd) setTemplateData((prev) => ({ ...prev, [c.id]: resolvedTd! }))
                            }
                            if (!resolvedTd) return
                            const localMappings = await api().getLocalMappings(c.id) ?? {}
                            const existing: Record<string, Record<number, string>> = localMappings['_userSageTags'] ?? {}
                            const storedScreenshots = (localMappings['_screenshots'] as (string | null)[] | undefined) ?? undefined
                            setWizard({ clientId: c.id, sessionPath: '', templateData: resolvedTd, initialUserNames: existing, initialScreenshots: storedScreenshots })
                          }}
                          title="Veldnamen opnieuw instellen"
                          className="text-xs border border-white/[0.08] hover:border-[#facc15]/30 text-white/40 hover:text-[#facc15]/80 rounded-md px-3 py-1.5 transition-colors"
                        >
                          Remapping
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(c.id, c.name)}
                          disabled={isDeleting}
                          className="text-xs border border-red-500/[0.12] hover:border-red-500/30 text-red-500/30 hover:text-red-500/60 disabled:opacity-30 disabled:cursor-not-allowed rounded-md px-3 py-1.5 transition-colors"
                        >
                          {isDeleting ? 'Verwijderen…' : 'Verwijder'}
                        </button>
                        <div className="relative group">
                          {shareCodes[c.id] ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                              <span className="text-xs text-white/50 font-mono select-all">{shareCodes[c.id]}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(shareCodes[c.id])
                                  setUploadFeedback({ clientId: c.id, ok: true, msg: 'Code gekopieerd!' })
                                  setTimeout(() => setUploadFeedback(null), 2000)
                                }}
                                className="text-white/30 hover:text-white/60"
                                title="Kopieer code"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleGenerateShareCode(c.id)}
                              disabled={generatingCode === c.id}
                              className="text-xs border border-white/[0.08] hover:border-blue-500/30 text-white/40 hover:text-blue-400/80 disabled:opacity-30 disabled:cursor-not-allowed rounded-md px-3 py-1.5 transition-colors"
                            >
                              {generatingCode === c.id ? 'Genereren…' : 'Deel link'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 space-y-4">
                        {/* Logo sectie */}
                        <ClientLogoPanel clientId={c.id} />

                        {/* Layouts sectie */}
                        <div>
                          <button
                            onClick={() => setLayoutsOpen((prev) => {
                              const next = new Set(prev)
                              next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                              return next
                            })}
                            className="flex items-center justify-between w-full py-1.5"
                          >
                            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                              Layouts {td ? `(${td.layouts.length})` : ''}
                            </span>
                            <svg
                              width="14" height="14" viewBox="0 0 24 24" fill="none"
                              stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"
                              strokeLinecap="round" strokeLinejoin="round"
                              className={['transition-transform', layoutsOpen.has(c.id) ? 'rotate-180' : ''].join(' ')}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>

                          {layoutsOpen.has(c.id) && (
                            isLoadingExpand ? (
                              <p className="text-white/20 text-xs py-2 mt-2">Laden…</p>
                            ) : !td ? (
                              <p className="text-white/20 text-xs mt-2">Geen template data beschikbaar.</p>
                            ) : (
                          <div className="space-y-4 mt-2">
                            {!dismissedValidation.has(c.id) && (() => {
                              const fieldCount = td.layouts.reduce((n, l) => n + l.textItems.filter((t) => t.source === 'sageTag').length, 0)
                              const imageSlotCount = td.layouts.filter((l) => l.imageSlot).length
                              const warnings: { type: 'no_sagetags' | 'no_image_slots' | 'unknown_font' | 'unsupported_element' | 'no_layouts'; message: string }[] = []
                              if (td.layouts.length === 0) warnings.push({ type: 'no_layouts', message: 'Geen layouts gevonden in dit template.' })
                              else if (fieldCount === 0) warnings.push({ type: 'no_sagetags', message: 'Geen SageTags gevonden. Voeg tekstvelden toe aan het Keynote-template.' })
                              return (
                                <TemplateValidationPanel
                                  layoutCount={td.layouts.length}
                                  fieldCount={fieldCount}
                                  imageSlotCount={imageSlotCount}
                                  warnings={warnings}
                                  onDismiss={() => setDismissedValidation((prev) => new Set([...prev, c.id]))}
                                />
                              )
                            })()}
                            <p className="text-white/20 text-[11px]">
                              {td.slideWidth} × {td.slideHeight} pt — {td.layouts.length} layout{td.layouts.length !== 1 ? 's' : ''}
                            </p>
                            {td.layouts.map((layout) => (
                              <div key={layout.name}>
                                <p className="text-[11px] font-medium text-white/50 font-mono mb-2">{layout.name}</p>
                                <div className="space-y-1">
                                  {layout.textItems.filter((item) => item.source === 'sageTag').map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/20">
                                      <span className="text-[10px] font-mono text-[#facc15]/60 flex-shrink-0 bg-[#facc15]/[0.06] px-1.5 py-0.5 rounded">
                                        {item.role}
                                      </span>
                                      <span className="text-white/20 text-xs truncate">
                                        {item.font ?? ''}{item.fontSize ? ` ${item.fontSize}pt` : ''}{item.alignment ? ` · ${item.alignment}` : ''}
                                      </span>
                                    </div>
                                  ))}
                                  {layout.images.length > 0 && (
                                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/20">
                                      <span className="text-[10px] font-mono text-white/30 flex-shrink-0 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                        afbeelding
                                      </span>
                                      <span className="text-white/20 text-xs">
                                        {layout.images.length} slot{layout.images.length !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
            </div>
          )}

          {/* Placeholder afbeelding */}
          {activeTab === 'advanced_placeholders' && (
          <div className="mt-3">
            <div className="mb-5">
              <h1 className="text-white font-semibold text-[17px]">Placeholder afbeelding</h1>
              <p className="text-white/35 text-sm mt-1">
                Standaard afbeelding voor Content Image slides zonder eigen afbeelding.
              </p>
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-xl p-5 flex items-center gap-5">
              <div className="w-32 h-20 rounded-lg overflow-hidden bg-black/30 flex-shrink-0">
                {placeholderUrl ? (
                  <img src={placeholderUrl} alt="Placeholder" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/5" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    const res = await api().pickAndReplacePlaceholder()
                    if (res.ok && res.dataUrl) setPlaceholderUrl(res.dataUrl)
                  }}
                  className="text-xs border border-white/[0.08] hover:border-white/20 text-white/40 hover:text-white/70 rounded-md px-3 py-1.5 transition-colors"
                >
                  Vervang placeholder
                </button>
                {placeholderUrl && (
                  <button
                    onClick={async () => {
                      const res = await api().deletePlaceholder()
                      if (res.ok) setPlaceholderUrl(null)
                    }}
                    className="text-xs border border-red-500/20 hover:border-red-500/40 text-red-400/50 hover:text-red-400/80 rounded-md px-3 py-1.5 transition-colors"
                  >
                    Verwijder placeholder
                  </button>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Tekst-review stap */}
          {activeTab === 'advanced_experiments' && (
          <div className="mt-3">
            <div className="mb-5">
              <h1 className="text-white font-semibold text-[17px]">Tekst-review stap</h1>
              <p className="text-white/35 text-sm mt-1">
                Toon een labeling-stap na het uploaden, zodat je tekst kunt controleren en categoriseren voordat de presentatie wordt gebouwd.
              </p>
            </div>
            <div className="bg-[#141414] border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.05]">
              <ReviewToggleRow
                label="Tekstdocumenten"
                description=".txt en .md bestanden"
                storageKey="huphe:reviewTextDocs"
                defaultValue={true}
              />
              <ReviewToggleRow
                label="Presentatiedocumenten"
                description=".key en .pptx bestanden"
                storageKey="huphe:reviewPresentations"
                defaultValue={false}
              />
            </div>
          </div>
          )}

          {/* Modellen */}
          {activeTab === 'ai_models' && (
            <>
          <div className="mt-3">
            <div className="mb-5">
              <h1 className="text-white font-semibold text-[17px]">Modellen</h1>
              <p className="text-white/35 text-sm mt-1">
                Voeg zelf OpenRouter-modellen toe aan je persoonlijke modelbibliotheek. Admin bepaalt per module welke basismodellen beschikbaar zijn; jouw extra tekstmodellen verschijnen in tekstpromptbars.
              </p>
            </div>
            <ModelenSection />
          </div>

          {/* Ollama — lokale AI */}
          <div className="mt-10">
            <OllamaSettingsSection />
          </div>

          {/* Standaardmodellen per module */}
          <div className="mt-10">
            <div className="mb-5">
              <h1 className="text-white font-semibold text-[17px]">Standaardmodellen</h1>
              <p className="text-white/35 text-sm mt-1">
                Welk model staat standaard aan in elke Atelier-module. Je kunt altijd per sessie wisselen via de promptbar.
              </p>
            </div>
            <DefaultModelsSection />
          </div>
            </>
          )}

          {/* Account */}
          {activeTab === 'account_profile' && (
          <div className="mt-3">
            <div className="mb-7">
              <h1 className="text-[28px] font-semibold text-white mb-1.5">Profiel</h1>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)' }}>Jouw persoonlijke gegevens.</p>
            </div>

            {/* Avatar */}
            <div className="mb-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-6 py-5 flex items-center gap-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="relative flex-shrink-0 group">
                  <input ref={avatarInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="relative w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-black font-bold text-xl select-none transition-opacity"
                    style={{ background: avatarDataUrl ? 'transparent' : '#FFD83D' }}
                    title="Foto wijzigen"
                  >
                    {avatarDataUrl
                      ? <img src={avatarDataUrl} alt="Avatar" className="w-full h-full object-cover" />
                      : (displayName || user?.email || '?')[0]?.toUpperCase()
                    }
                    <span className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.45)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </span>
                  </button>
                  {avatarUploading && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}>
                      <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Profielfoto</p>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="text-xs transition-colors"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    {avatarDataUrl ? 'Foto wijzigen →' : 'Foto uploaden →'}
                  </button>
                </div>
              </div>

              {/* Naam */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>Naam</p>
                <div className="flex items-center gap-2">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onBlur={saveDisplayName}
                    onKeyDown={(e) => e.key === 'Enter' && saveDisplayName()}
                    placeholder="Jouw naam…"
                    className="bg-transparent text-sm text-right focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 transition-colors placeholder:text-white/20 w-44"
                    style={{ color: 'rgba(255,255,255,0.75)' }}
                  />
                  {nameSaving && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Opslaan…</span>}
                  {nameSaved && <span className="text-[11px] text-green-400/70">✓</span>}
                </div>
              </div>

              {/* Functietitel */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>Functietitel</p>
                <div className="flex items-center gap-2">
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    onBlur={saveJobTitle}
                    onKeyDown={(e) => e.key === 'Enter' && saveJobTitle()}
                    placeholder="bijv. Creative Director…"
                    className="bg-transparent text-sm text-right focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 transition-colors placeholder:text-white/20 w-44"
                    style={{ color: 'rgba(255,255,255,0.75)' }}
                  />
                  {jobTitleSaving && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Opslaan…</span>}
                  {jobTitleSaved && <span className="text-[11px] text-green-400/70">✓</span>}
                </div>
              </div>

              {/* E-mail */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>E-mailadres</p>
                <p className="text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.45)' }}>{user?.email ?? '—'}</p>
              </div>

              {/* Plan */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>Abonnement</p>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.20)' }}>
                  Free
                </span>
              </div>

              {/* Lid sinds */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>Lid sinds</p>
                <p className="text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  {user?.created_at
                    ? new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(user.created_at))
                    : '—'}
                </p>
              </div>

              {/* Uitloggen */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                  onClick={handleSignOut}
                  className="text-xs rounded-lg px-3 py-1.5 transition-colors"
                  style={{ border: '1px solid rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.55)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.80)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.30)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.15)' }}
                >
                  Uitloggen
                </button>
                {onShowPrivacy && (
                  <button onClick={onShowPrivacy} className="text-xs transition-colors" style={{ color: 'rgba(255,255,255,0.20)' }}>
                    Privacybeleid
                  </button>
                )}
              </div>

              {/* Account verwijderen (GDPR) */}
              <div className="px-6 py-4">
                <button
                  onClick={handleDeleteMyData}
                  disabled={deletingAccount}
                  className="text-xs rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                  style={{ border: '1px solid rgba(239,68,68,0.10)', color: 'rgba(239,68,68,0.35)' }}
                  onMouseEnter={e => { if (!deletingAccount) { (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.70)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)' }}}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.35)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.10)' }}
                >
                  {deletingAccount ? 'Verwijderen…' : 'Account en data verwijderen'}
                </button>
                {deleteAccountError && <p className="text-red-400 text-[11px] mt-2">{deleteAccountError}</p>}
              </div>
            </div>
          </div>
          )}

          {/* ── Beveiliging ───────────────────────────────────────────── */}
          {activeTab === 'account_security' && (
            <div className="mt-3">
              <SecuritySection user={user} supabase={supabase} />
            </div>
          )}

          {/* ── AI Gebruik ────────────────────────────────────────────── */}
          {activeTab === 'ai_usage' && (
          <div className="mt-3">
            <div className="mb-7">
              <h1 className="text-[28px] font-semibold text-white mb-1.5">Gebruik</h1>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)' }}>Jouw AI-verbruik en beschikbare credits.</p>
            </div>

            {/* Persoonlijk saldo */}
            <div className="mb-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.30)' }}>Persoonlijk</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-semibold text-white tabular-nums">
                    {personalBalanceCents !== null ? (personalBalanceCents / 100).toFixed(2) : '—'}
                  </span>
                  <span className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>credits</span>
                </div>
              </div>
            </div>

            {/* Company budget */}
            {company && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.30)' }}>Workspace budget</p>
                  {(() => {
                    const spent = company.currentPeriodSpentCents
                    const budget = company.monthlyBudgetCents
                    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
                    return (
                      <>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                            €{(spent / 100).toFixed(2)} verbruikt
                          </span>
                          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            van €{(budget / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct > 80 ? '#ef4444' : '#FFD83D' }} />
                        </div>
                        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          {pct.toFixed(0)}% van maandbudget · resets {new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(new Date(new Date(company.currentPeriodStart).setMonth(new Date(company.currentPeriodStart).getMonth() + 1)))}
                        </p>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {!company && (
              <p className="text-sm mt-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Stel een maandbudget in via <button onClick={() => setActiveTab('workspace_billing')} className="underline hover:text-white/50 transition-colors">Workspace → Billing</button>.
              </p>
            )}
          </div>
          )}

          {/* ── Billing ───────────────────────────────────────────────── */}
          {activeTab === 'workspace_billing' && (
          <div className="mt-3">
            <h2 className="text-white font-semibold text-[15px] mb-1">Billing</h2>
            <p className="text-white/35 text-sm mb-6">Credits, bedrijfsaccount en betaalinstellingen.</p>

            {/* Bedrijfsaccount */}
            {company && (companyRole === 'admin') ? (
              <>
                <CompanyAdminPanel
                  company={company}
                  members={companyMembers}
                  currentUserId={user?.id}
                  onUpdateBudget={handleUpdateBudget}
                  onRemoveMember={handleRemoveMember}
                  onChangeMemberRole={handleChangeMemberRole}
                  onInviteMember={handleInviteMember}
                  onTransferOwnership={handleTransferOwnership}
                  saving={companyLoading}
                  error={companyError}
                />
                {company.ownerId === user?.id && companyMembers.filter(m => m.userId !== user?.id).length === 0 && (
                  <section className="mt-5 max-w-2xl bg-[#141414] border border-red-500/20 rounded-2xl p-6">
                    <h2 className="text-white text-base font-semibold tracking-tight">Bedrijfsaccount verwijderen</h2>
                    <p className="text-white/40 text-xs mt-1 mb-5 leading-relaxed">
                      Verwijder <strong className="text-white/60">{company.name}</strong> definitief. Alleen mogelijk als jij de enige gebruiker bent. Dit kan niet ongedaan worden gemaakt.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteCompany}
                      disabled={companyLoading}
                      className="border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
                    >
                      {companyLoading ? 'Verwijderen…' : 'Bedrijfsaccount verwijderen'}
                    </button>
                  </section>
                )}
              </>
            ) : !company ? (
              <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-6 max-w-md mb-5">
                <p className="text-white/60 text-sm font-medium">Bedrijfsaccount</p>
                <p className="text-white/30 text-xs mt-1 mb-4">Maak een bedrijfsaccount aan om een maandbudget in te stellen voor je team.</p>
                <button
                  onClick={() => setCompanySetupOpen(true)}
                  className="bg-[#facc15] hover:bg-[#fde047] text-black text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
                >
                  Bedrijfsaccount aanmaken →
                </button>
              </div>
            ) : null}

          </div>
          )}

          {/* Category overview — alle hoofdcategorieën onder elkaar; linker menu springt naar de juiste sectie */}
          {overviewTabs.includes(activeTab) && (
            <SettingsAllOverview onNavigate={setActiveTab} />
          )}

          <SettingsPlaceholders activeTab={activeTab} />

            </div>
          </main>
          <SettingsContextPanel
            activeTab={activeTab}
            companyName={company?.name ?? null}
            companyMembers={companyMembers.length}
            companyAdmins={companyMembers.filter(m => m.role === 'admin').length}
            creditsUsed={company?.currentPeriodSpentCents ? Math.round(company.currentPeriodSpentCents / 100) : undefined}
            creditsTotal={company?.monthlyBudgetCents ? Math.round(company.monthlyBudgetCents / 100) : undefined}
            plan={company ? 'Pro' : undefined}
          />
        </div>
      )}

      {companySetupOpen && (
        <CompanySetupModal
          onClose={() => setCompanySetupOpen(false)}
          onCreate={handleCreateCompany}
          loading={companyLoading}
          error={companyError}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MappingWizard — sageTag overview per layout
// ---------------------------------------------------------------------------

const SAVED_MODELS_KEY = 'huphe:saved-openrouter-models'

interface SavedModel { id: string; label: string; model: string }
interface ORModel { id: string; name?: string }

const MODULE_MODEL_KEYS = [
  { key: 'huphe:atelier-chat-model:media', label: 'Media editor', defaultModel: 'google/gemini-2.5-pro', hint: 'HTML/CSS generatie + vision' },
  { key: 'huphe:atelier-chat-model:banner', label: 'Banner editor', defaultModel: 'google/gemini-2.5-pro', hint: 'HTML/CSS generatie + vision' },
  { key: 'huphe:atelier-chat-model', label: 'Presentaties & Atelier chat', defaultModel: 'anthropic/claude-sonnet-4-5', hint: 'Structuur en langere output' },
]

// ── Ollama lokale AI ──────────────────────────────────────────────────────────

type OllamaState = 'checking' | 'not-installed' | 'installed' | 'installing' | 'uninstalling' | 'pulling'

function OllamaSettingsSection() {
  const [state, setState] = useState<OllamaState>('checking')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [visionInstalled, setVisionInstalled] = useState(false)
  const [pullingVision, setPullingVision] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'install' | 'uninstall' | 'pull-vision' | null>(null)
  const api = () => (window as any).api

  useEffect(() => {
    checkState()
  }, [])

  async function checkState() {
    setState('checking')
    const { installed } = await api().ollamaCheckInstalled()
    if (installed) {
      setState('installed')
      // Controleer of een vision-model aanwezig is
      const status = await api().engine.ollamaStatus()
      const hasVision = (status.models ?? []).some((m: string) =>
        m.includes('llava') || m.includes('moondream') || m.includes('llama3.2-vision')
      )
      setVisionInstalled(hasVision)
    } else {
      setState('not-installed')
      setVisionInstalled(false)
    }
  }

  async function install() {
    setConfirmAction(null)
    setState('installing')
    setProgress(0)
    setStatusMsg('Bezig…')
    const unsub = api().onOllamaInstallProgress((d: { msg: string; progress?: number }) => {
      setStatusMsg(d.msg)
      if (d.progress !== undefined && d.progress >= 0) setProgress(d.progress)
    })
    const res = await api().ollamaInstall()
    unsub()
    if (res.ok) {
      setState('installed')
    } else {
      setStatusMsg(`Mislukt: ${res.error}`)
      setState('not-installed')
    }
  }

  async function uninstall() {
    setConfirmAction(null)
    setState('uninstalling')
    setStatusMsg('Ollama verwijderen…')
    const res = await api().ollamaUninstall()
    if (res.ok) {
      setState('not-installed')
      setVisionInstalled(false)
    } else {
      setStatusMsg(`Mislukt: ${res.error}`)
      setState('installed')
    }
  }

  async function pullVision() {
    setConfirmAction(null)
    setPullingVision(true)
    setStatusMsg('llava:7b downloaden (±4 GB)…')
    const unsub = api().onOllamaPullProgress((d: { msg: string }) => setStatusMsg(d.msg.slice(0, 80)))
    const res = await api().ollamaPullModel('llava:7b')
    unsub()
    setPullingVision(false)
    if (res.ok) setVisionInstalled(true)
    else setStatusMsg(`Mislukt: ${res.error}`)
  }

  async function removeVision() {
    setConfirmAction(null)
    setPullingVision(true)
    setStatusMsg('llava:7b verwijderen…')
    await api().ollamaRemoveModel('llava:7b')
    setPullingVision(false)
    setVisionInstalled(false)
    setStatusMsg('')
  }

  const busy = state === 'installing' || state === 'uninstalling' || pullingVision
  const ollamaOn = state === 'installed'

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-white font-semibold text-[17px]">Lokale AI (Ollama)</h1>
        <p className="text-white/35 text-sm mt-1">
          Draai AI-modellen gratis op je eigen computer — geen internetverbinding of API-kosten nodig.
        </p>
      </div>

      {/* Bevestigingsdialoog */}
      {confirmAction && (
        <div className="mb-4 rounded-xl border border-white/[0.10] bg-[#1a1a1a] p-4 space-y-3">
          <p className="text-white/80 text-sm">
            {confirmAction === 'install' && 'Ollama downloaden en installeren (~200 MB)?'}
            {confirmAction === 'uninstall' && 'Ollama verwijderen van je computer?'}
            {confirmAction === 'pull-vision' && 'Beeldmodel llava:7b downloaden (~4 GB)?'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="flex-1 rounded-lg border border-white/[0.08] py-1.5 text-xs text-white/50 hover:text-white/75 transition-colors"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmAction === 'install') install()
                else if (confirmAction === 'uninstall') uninstall()
                else if (confirmAction === 'pull-vision') pullVision()
              }}
              className="flex-1 rounded-lg bg-[#facc15]/90 py-1.5 text-xs font-semibold text-black hover:bg-[#facc15] transition-colors"
            >
              Bevestigen
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">

        {/* Ollama toggle */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-white/80 text-sm font-medium">Ollama</p>
            <p className="text-white/35 text-xs mt-0.5">
              {state === 'checking' && 'Controleren…'}
              {state === 'not-installed' && 'Niet geïnstalleerd'}
              {state === 'installed' && 'Geïnstalleerd — lokale modellen actief'}
              {state === 'installing' && (statusMsg || 'Installeren…')}
              {state === 'uninstalling' && 'Verwijderen…'}
            </p>
            {(state === 'installing') && (
              <div className="mt-2 h-1 w-full max-w-xs rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full bg-[#facc15] transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
          {state === 'checking' ? (
            <svg className="animate-spin text-white/20 flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (ollamaOn) setConfirmAction('uninstall')
                else setConfirmAction('install')
              }}
              className={[
                'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed',
                ollamaOn ? 'bg-[#facc15]' : 'bg-white/[0.12]',
              ].join(' ')}
            >
              <span className={[
                'pointer-events-none absolute top-[2px] left-0 h-4 w-4 rounded-full transition-transform duration-200',
                ollamaOn ? 'translate-x-[18px] bg-black' : 'translate-x-[2px] bg-white/60',
              ].join(' ')} />
            </button>
          )}
        </div>

        {/* Vision toggle — alleen zichtbaar als Ollama geïnstalleerd is */}
        {ollamaOn && (
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-white/80 text-sm font-medium">Ollama Vision</p>
              <p className="text-white/35 text-xs mt-0.5">
                {pullingVision ? (statusMsg || 'Bezig…') : visionInstalled
                  ? 'llava:7b geïnstalleerd — beeldanalyse beschikbaar'
                  : 'Niet geïnstalleerd (~4 GB)'}
              </p>
            </div>
            {pullingVision ? (
              <svg className="animate-spin text-white/20 flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (visionInstalled) removeVision()
                  else setConfirmAction('pull-vision')
                }}
                className={[
                  'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed',
                  visionInstalled ? 'bg-[#facc15]' : 'bg-white/[0.12]',
                ].join(' ')}
              >
                <span className={[
                  'pointer-events-none absolute top-[2px] left-0 h-4 w-4 rounded-full transition-transform duration-200',
                  visionInstalled ? 'translate-x-[18px] bg-black' : 'translate-x-[2px] bg-white/60',
                ].join(' ')} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DefaultModelsSection() {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    for (const { key, defaultModel } of MODULE_MODEL_KEYS) {
      result[key] = localStorage.getItem(key) ?? defaultModel
    }
    return result
  })

  function handleChange(key: string, value: string) {
    const next = { ...values, [key]: value }
    setValues(next)
    localStorage.setItem(key, value)
  }

  return (
    <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-[#141414] overflow-hidden">
      {MODULE_MODEL_KEYS.map(({ key, label, defaultModel, hint }) => (
        <div key={key} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/85">{label}</p>
            <p className="mt-0.5 text-xs text-white/30">{hint}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <input
              value={values[key] ?? defaultModel}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={defaultModel}
              spellCheck={false}
              className="w-56 rounded-lg border border-white/[0.07] bg-[#1a1a1a] px-3 py-1.5 font-mono text-xs text-white/70 outline-none transition-colors placeholder:text-white/20 focus:border-white/20"
            />
            {values[key] !== defaultModel && (
              <button
                type="button"
                onClick={() => handleChange(key, defaultModel)}
                className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                title="Herstel naar aanbevolen"
              >
                Herstel
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function groupORModels(models: ORModel[]): { label: string; options: ORModel[] }[] {
  const groups: Record<string, ORModel[]> = {}
  for (const m of models) {
    const provider = m.id.split('/')[0] ?? 'other'
    if (!groups[provider]) groups[provider] = []
    groups[provider].push(m)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([label, options]) => ({ label, options }))
}

function ModelenSection() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [allModels, setAllModels] = useState<ORModel[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedModel[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_MODELS_KEY) ?? '[]') } catch { return [] }
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const fetchModels = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      const json = await res.json()
      setAllModels((json.data ?? []) as ORModel[])
    } catch (err: any) {
      setLoadError(err?.message ?? 'Ophalen mislukt')
    } finally {
      setLoading(false)
    }
  }, [])

  function handleFocus() {
    setOpen(true)
    if (!fetchedRef.current) { fetchedRef.current = true; fetchModels() }
  }

  function persist(models: SavedModel[]) {
    setSaved(models)
    localStorage.setItem(SAVED_MODELS_KEY, JSON.stringify(models))
  }

  function addModel(m: ORModel) {
    const model: SavedModel = { id: m.id, label: m.name ?? m.id, model: m.id }
    if (saved.some(s => s.id === m.id)) return
    persist([...saved, model])
    setOpen(false); setQuery('')
  }

  function removeModel(id: string) {
    persist(saved.filter(s => s.id !== id))
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? allModels.filter(m => m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q))
    : allModels
  const groups = groupORModels(filtered)

  return (
    <div className="space-y-4">
      {/* Saved models */}
      {saved.length > 0 && (
        <div className="bg-[#141414] border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.05]">
          {saved.map(m => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-white text-sm font-medium">{m.label}</p>
                <p className="text-white/30 text-xs mt-0.5">{m.id}</p>
              </div>
              <button
                onClick={() => removeModel(m.id)}
                className="p-1.5 text-white/30 hover:text-red-400 transition-colors rounded-md"
                title="Verwijder model"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Combobox */}
      <div ref={containerRef} className="relative">
        <div className="flex">
          <input
            value={open ? query : ''}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={handleFocus}
            placeholder={loading && allModels.length === 0 ? 'Modellen laden…' : 'Zoek en voeg model toe…'}
            disabled={loading && allModels.length === 0}
            spellCheck={false}
            className="flex-1 bg-[#141414] border border-white/[0.07] border-r-0 text-white/70 text-sm rounded-l-xl px-4 py-2.5 focus:outline-none focus:border-white/20 disabled:opacity-50 placeholder:text-white/25"
          />
          <button
            onMouseDown={e => { e.preventDefault(); setOpen(o => !o); setQuery(''); if (!fetchedRef.current) { fetchedRef.current = true; fetchModels() } }}
            disabled={loading && allModels.length === 0}
            className="bg-[#141414] border border-white/[0.07] text-white/40 hover:text-white/70 px-3 rounded-r-xl transition-colors disabled:opacity-50"
          >
            {loading && allModels.length === 0 ? '…' : '▾'}
          </button>
        </div>
        {loadError && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-red-400/70 text-[11px] flex-1">Laden mislukt: {loadError}</span>
            <button onClick={() => fetchModels()} className="text-white/40 hover:text-white/70 text-[11px] border border-white/[0.07] rounded px-2 py-0.5 transition-colors">Opnieuw</button>
          </div>
        )}
        {!loadError && allModels.length > 0 && (
          <div className="mt-1.5">
            <span className="text-white/15 text-[11px]">{allModels.length} modellen geladen</span>
          </div>
        )}
        {open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1c1c1c] border border-white/[0.1] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
            {loading && allModels.length === 0 ? (
              <p className="text-white/30 text-xs px-4 py-3">Laden…</p>
            ) : groups.length === 0 ? (
              <p className="text-white/30 text-xs px-4 py-3">Geen modellen gevonden.</p>
            ) : groups.map(group => (
              <div key={group.label}>
                <div className="px-3 pt-2.5 pb-1 sticky top-0 bg-[#1c1c1c]">
                  <span className="text-white/20 text-[10px] uppercase tracking-widest font-medium">{group.label}</span>
                </div>
                {group.options.map(m => (
                  <button
                    key={m.id}
                    onMouseDown={e => { e.preventDefault(); addModel(m) }}
                    className={[
                      'w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2',
                      saved.some(s => s.id === m.id) ? 'text-amber-400' : 'text-white/70'
                    ].join(' ')}
                  >
                    <span className="truncate flex-1">{m.name || m.id}</span>
                    {saved.some(s => s.id === m.id) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 flex-shrink-0">toegevoegd</span>}
                    {m.name && m.name !== m.id && <span className="text-white/20 text-xs truncate flex-shrink-0 max-w-[120px]">{m.id}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewToggleRow({ label, description, storageKey, defaultValue }: {
  label: string
  description: string
  storageKey: string
  defaultValue: boolean
}) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey)
    return stored === null ? defaultValue : stored === 'true'
  })

  function toggle() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem(storageKey, String(next))
  }

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div>
        <p className="text-white/70 text-sm font-medium">{label}</p>
        <p className="text-white/30 text-xs mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
        style={{ background: enabled ? '#facc15' : 'rgba(255,255,255,0.08)' }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0px)' }}
        />
      </button>
    </div>
  )
}

/** Comprimeer een dataUrl naar JPEG op maxWidth breedte. */
function compressDataUrl(src: string, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

interface MappingWizardProps {
  wizard: WizardState
  onSave: (userNames: Record<string, Record<number, string>>) => Promise<void>
  onClose: () => void
}

function MappingWizard({ wizard, onSave, onClose }: MappingWizardProps) {
  const { templateData, sessionPath } = wizard
  const totalLayouts = templateData.layouts.length
  const [step, setStep] = useState(wizard.initialStep ?? 0)
  // PDF-modus: initialScreenshots zijn referentiepagina's, niet 1-op-1 per layout
  const isPdfMode = !sessionPath && (wizard.initialScreenshots?.length ?? 0) > 0
  const [screenshots, setScreenshots] = useState<(string | null)[]>(isPdfMode ? [] : (wizard.initialScreenshots ?? []))
  const pdfPages = isPdfMode ? (wizard.initialScreenshots ?? []) : []
  const [screenshotsLoading, setScreenshotsLoading] = useState(!wizard.initialScreenshots?.length && !!sessionPath)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [screenshotProgress, setScreenshotProgress] = useState<ScreenshotProgress>(() => ({
    sessionPath,
    completed: 0,
    total: totalLayouts,
    current: templateData.layouts[0]?.name,
    phase: 'preparing',
  }))
  // userNames: layoutName → itemIndex → user-typed name (pre-gevuld met bestaande mappings)
  const [userNames, setUserNames] = useState<Record<string, Record<number, string>>>(wizard.initialUserNames ?? {})
  const [deletedByLayout, setDeletedByLayout] = useState<Record<string, Set<number>>>({})
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const slideRef = useRef<HTMLDivElement>(null)
  const [slideSize, setSlideSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = slideRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSlideSize({ w: r.width, h: r.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const [dotCount, setDotCount] = useState(1)
  useEffect(() => {
    if (!screenshotsLoading) return
    const id = setInterval(() => setDotCount((n) => (n % 3) + 1), 500)
    return () => clearInterval(id)
  }, [screenshotsLoading])

  useEffect(() => {
    const handleScreenshotProgress = (event: Event) => {
      const detail = (event as CustomEvent<ScreenshotProgress>).detail
      if (!detail || detail.sessionPath !== sessionPath) return
      const total = detail.total || totalLayouts
      setScreenshotProgress({
        ...detail,
        completed: Math.min(Math.max(detail.completed ?? 0, 0), total),
        total,
      })
    }

    window.addEventListener('wizard:screenshot-progress', handleScreenshotProgress)
    return () => window.removeEventListener('wizard:screenshot-progress', handleScreenshotProgress)
  }, [sessionPath, totalLayouts])

  const screenshotsFiredRef = useRef(false)
  useEffect(() => {
    // Remapping-modus: geen sessionPath, sla screenshots over
    if (!sessionPath) {
      setScreenshotsLoading(false)
      return
    }
    if (screenshotsFiredRef.current) return
    screenshotsFiredRef.current = true
    const layoutNames = templateData.layouts.map((l) => l.name)
    setScreenshotProgress({
      sessionPath,
      completed: 0,
      total: layoutNames.length,
      current: layoutNames[0],
      phase: 'preparing',
    })
    api().takeWizardScreenshots(sessionPath, layoutNames)
      .then((res: any) => {
        if (res.ok) setScreenshots(res.screenshots ?? [])
        setScreenshotProgress((prev) => ({
          ...prev,
          sessionPath,
          completed: res.ok ? layoutNames.length : prev.completed,
          total: layoutNames.length,
          phase: res.ok ? 'done' : 'error',
        }))
        setScreenshotsLoading(false)
      })
      .catch((err: any) => {
        console.error('[wizard:take-screenshots] fout:', err)
        setScreenshotProgress((prev) => ({
          ...prev,
          sessionPath,
          total: layoutNames.length,
          phase: 'error',
        }))
        setScreenshotsLoading(false)
      })
  }, [sessionPath, templateData.layouts])

  // Upload gecomprimeerde screenshots naar Storage zodra ze beschikbaar zijn.
  // Alleen bij initiële import (sessionPath is gevuld).
  const screenshotUploadedRef = useRef(false)
  useEffect(() => {
    if (!screenshots.length || !sessionPath || screenshotUploadedRef.current || !supabase) return
    screenshotUploadedRef.current = true
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const urls = await Promise.all(screenshots.map(async (src, i) => {
        if (!src) return null
        try {
          const compressed = await compressDataUrl(src, 640, 0.80)
          const blob = dataUrlToBlob(compressed)
          const path = `${user.id}/${wizard.clientId}/screenshots/${i}.jpg`
          const { error } = await supabase.storage.from('atelier-assets')
            .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
          if (error) return null
          return supabase.storage.from('atelier-assets').getPublicUrl(path).data.publicUrl
        } catch { return null }
      }))
      const localMappings = await (window as any).api?.getLocalMappings?.(wizard.clientId) ?? {}
      let existing = localMappings
      if (!Object.keys(existing).length && supabase) {
        const { data } = await supabase.from('template_mappings')
          .select('mappings').eq('client_id', wizard.clientId).maybeSingle()
        existing = (data?.mappings as any) ?? {}
      }
      const merged = { ...existing, _screenshots: urls }
      await (window as any).api?.setLocalMappings?.(wizard.clientId, merged)
      if (supabase) {
        await supabase.from('template_mappings').upsert(
          { client_id: wizard.clientId, mappings: merged },
          { onConflict: 'client_id' },
        )
      }
    })()
  }, [screenshots.length])

  function setName(layoutName: string, idx: number, name: string) {
    setUserNames((prev) => ({
      ...prev,
      [layoutName]: { ...(prev[layoutName] ?? {}), [idx]: name },
    }))
  }

  function deleteItem(layoutName: string, idx: number) {
    setDeletedByLayout((prev) => {
      const next = new Set(prev[layoutName] ?? [])
      next.add(idx)
      return { ...prev, [layoutName]: next }
    })
    setUserNames((prev) => {
      const copy = { ...(prev[layoutName] ?? {}) }
      delete copy[idx]
      return { ...prev, [layoutName]: copy }
    })
  }

  async function handleSave() {
    setSaving(true)
    const filtered: Record<string, Record<number, string>> = {}
    for (const [layoutName, items] of Object.entries(userNames)) {
      const deleted = deletedByLayout[layoutName] ?? new Set()
      const kept = Object.fromEntries(
        Object.entries(items).filter(([i]) => !deleted.has(Number(i)))
      )
      if (Object.keys(kept).length > 0) filtered[layoutName] = kept as Record<number, string>
    }
    await onSave(filtered)
    setSaving(false)
  }

  const layout = templateData.layouts[step]
  const isLast = step === templateData.layouts.length - 1
  if (!layout) return null

  const deletedIdxs = deletedByLayout[layout.name] ?? new Set<number>()
  const allItems = layout.textItems.map((item, origIdx) => ({ item, origIdx }))
  const visibleItems = allItems.filter(({ origIdx }) => !deletedIdxs.has(origIdx))
  const namedCount   = visibleItems.filter(({ item }) => item.source === 'sageTag' && item.role).length
  const unnamedCount = visibleItems.length - namedCount

  const SLIDE_W = templateData.slideWidth || 1920
  const SLIDE_H = templateData.slideHeight || 1080
  const imagePath = screenshots[step] || layout.previewDataUrl || null
  const progressTotal = screenshotProgress.total || totalLayouts || 1
  const progressCompleted = Math.min(Math.max(screenshotProgress.completed || 0, 0), progressTotal)
  const progressPercent = (progressCompleted / progressTotal) * 100

  function scaleX(pt: number) { return slideSize.w > 0 ? (pt / SLIDE_W) * slideSize.w : (pt / SLIDE_W) * 100 }
  function scaleY(pt: number) { return slideSize.h > 0 ? (pt / SLIDE_H) * slideSize.h : (pt / SLIDE_H) * 100 }
  const usePixels = slideSize.w > 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-8 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-start gap-3">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Annuleren en sluiten"
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-white/[0.08] text-white/30 hover:border-white/20 hover:text-white/70 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
            <div>
              <p className="text-[10px] text-white/25 uppercase tracking-widest">
                Layout {step + 1} van {templateData.layouts.length}
              </p>
              <h2 className="text-white font-semibold text-[15px] mt-0.5 font-mono">{layout.name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {namedCount > 0 && (
              <span className="text-[#facc15]/50">{namedCount} benoemd</span>
            )}
            {unnamedCount > 0 && (
              <span className="text-white/25">{unnamedCount} zonder naam</span>
            )}
          </div>
        </div>
        <div className="h-[3px] bg-white/[0.04] rounded-full">
          <div
            className="h-[3px] bg-[#facc15] rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / templateData.layouts.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* PDF referentiestrip — alleen in PDF-modus */}
        {isPdfMode && pdfPages.length > 0 && (
          <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#0a0a0a] px-4 py-2 flex items-center gap-1 overflow-x-auto">
            <span className="flex-shrink-0 text-[10px] text-white/25 uppercase tracking-widest mr-2">PDF-referentie</span>
            {pdfPages.map((src, i) => src && (
              <img
                key={i}
                src={src}
                alt={`Slide ${i + 1}`}
                title={`Slide ${i + 1}`}
                className="flex-shrink-0 h-14 rounded border border-white/[0.08] cursor-default"
                style={{ aspectRatio: '16/9', objectFit: 'contain', background: '#111' }}
              />
            ))}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: slide screenshot with overlay ─────────────────────── */}
        <div className="w-[62%] flex-shrink-0 bg-[#0c0c0c] border-r border-white/[0.06] flex items-center justify-center p-8">
          <div
            ref={slideRef}
            className="relative w-full rounded-xl shadow-2xl overflow-hidden"
            style={{ aspectRatio: `${SLIDE_W}/${SLIDE_H}`, background: '#1a1a1a' }}
          >
            {imagePath ? (
              <img
                key={imagePath}
                src={imagePath}
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'contain' }}
                alt={layout.name}
              />
            ) : !screenshotsLoading ? (
              // Fallback: render de slide live via WebSlidePreview
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ transform: `scale(${slideSize.w > 0 ? slideSize.w / (SLIDE_W) : 1})`, transformOrigin: 'top left' }}
              >
                <WebSlidePreview
                  block={{ id: '', type: layout.name, heading: '', body: '', fields: {} }}
                  templateData={templateData}
                />
              </div>
            ) : null}

            {allItems
              .filter(({ item, origIdx }) => (item.width ?? 0) > 0 && !deletedIdxs.has(origIdx))
              .map(({ item, origIdx }) => {
                const left   = scaleX(item.posX ?? 0)
                const top    = scaleY(item.posY ?? 0)
                const width  = scaleX(item.width ?? 0)
                const rawH   = item.height ?? 0
                const height = rawH > 0 ? scaleY(rawH) : (usePixels ? 20 : 2)
                const hasSageTag = item.source === 'sageTag' && !!item.role
                const displayName = userNames[layout.name]?.[origIdx] ?? (hasSageTag ? item.role : '')
                const isHovered = hoveredIdx === origIdx
                return (
                  <div
                    key={origIdx}
                    onMouseEnter={() => setHoveredIdx(origIdx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{
                      position: 'absolute',
                      left:   usePixels ? left   : `${left}%`,
                      top:    usePixels ? top    : `${top}%`,
                      width:  usePixels ? width  : `${width}%`,
                      height: usePixels ? height : `${height}%`,
                      background: isHovered
                        ? 'rgba(250,204,21,0.18)'
                        : hasSageTag ? 'rgba(250,204,21,0.06)' : 'rgba(255,255,255,0.04)',
                      border: isHovered
                        ? '2px solid rgba(250,204,21,0.90)'
                        : hasSageTag
                          ? '1px solid rgba(250,204,21,0.30)'
                          : '1px dashed rgba(255,255,255,0.18)',
                      borderRadius: 3,
                      cursor: 'pointer',
                      transition: 'background 0.1s, border 0.1s',
                      zIndex: isHovered ? 10 : 1,
                    }}
                  >
                    {displayName && (
                      <span
                        className="absolute top-1 left-1 text-[9px] font-mono font-bold px-1 py-0.5 rounded"
                        style={{
                          background: 'rgba(0,0,0,0.75)',
                          color: isHovered ? 'rgba(250,204,21,1)' : hasSageTag ? 'rgba(250,204,21,0.85)' : 'rgba(255,255,255,0.55)',
                          lineHeight: 1,
                        }}
                      >
                        {displayName}
                      </span>
                    )}
                    <span
                      className="absolute bottom-1 right-1 text-[8px] font-mono"
                      style={{ color: isHovered ? 'rgba(250,204,21,0.6)' : 'rgba(255,255,255,0.20)' }}
                    >
                      {origIdx + 1}
                    </span>
                  </div>
                )
              })}

            {/* Loading overlay — covers preview + text boxes while screenshots load */}
            {screenshotsLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black z-50">
                <style>{`
                  @keyframes huphe-spin {
                    0%   { transform: rotate(0deg); }
                    45%  { transform: rotate(180deg); }
                    65%  { transform: rotate(180deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                <img src={spinner} alt="" style={{ width: 36, height: 36, animation: 'huphe-spin 1.2s ease-in-out infinite' }} />
                <p className="text-white/40 text-xs tracking-wide">
                  {'Hupheing' + '.'.repeat(dotCount)}
                </p>
                <div className="w-56 max-w-[70%]">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/35 tabular-nums">
                    <span>Slides scannen</span>
                    <span>{progressCompleted}/{progressTotal}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-[#facc15] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                {screenshotProgress.current && (
                  <p className="max-w-[70%] truncate text-center font-mono text-[11px] text-white/25">
                    {screenshotProgress.current}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: item list ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2" style={{minWidth:0}}>
          <p className="text-[10px] font-medium text-white/25 uppercase tracking-widest mb-4">
            {visibleItems.length} tekstveld{visibleItems.length !== 1 ? 'en' : ''}
            {deletedIdxs.size > 0 && (
              <span className="ml-2 text-white/15">({deletedIdxs.size} verwijderd)</span>
            )}
          </p>
          {visibleItems.map(({ item, origIdx }) => {
            const hasSageTag = item.source === 'sageTag' && !!item.role
            const currentName = userNames[layout.name]?.[origIdx] ?? (hasSageTag ? item.role! : '')
            const isHovered = hoveredIdx === origIdx
            return (
              <div
                key={origIdx}
                onMouseEnter={() => setHoveredIdx(origIdx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={[
                  'rounded-xl px-3 py-2.5 border flex items-center gap-2.5 transition-colors group',
                  isHovered
                    ? 'bg-[#facc15]/[0.07] border-[#facc15]/30'
                    : 'bg-[#111111] border-white/[0.06]',
                ].join(' ')}
              >
                <span className={[
                  'text-[10px] font-mono rounded px-1.5 py-0.5 flex-shrink-0 tabular-nums',
                  isHovered ? 'bg-[#facc15]/20 text-[#facc15]/80' : 'bg-white/[0.04] text-white/25',
                ].join(' ')}>
                  {origIdx + 1}
                </span>

                {hasSageTag && (
                  <span className="text-[9px] font-mono text-[#facc15]/40 flex-shrink-0 border border-[#facc15]/20 px-1 py-0.5 rounded">
                    sage
                  </span>
                )}

                <input
                  type="text"
                  value={currentName}
                  onChange={(e) => setName(layout.name, origIdx, e.target.value)}
                  placeholder="Geef een naam…"
                  className={[
                    'flex-1 min-w-0 bg-transparent rounded-md px-2 py-1 text-[11px] font-mono outline-none transition-colors placeholder:text-white/20',
                    isHovered
                      ? 'text-white border border-[#facc15]/25 focus:border-[#facc15]/60'
                      : 'text-white/70 border border-white/[0.06] focus:border-white/20',
                  ].join(' ')}
                />

                {item.fontSize && (
                  <span className="text-[10px] text-white/15 flex-shrink-0">{item.fontSize}pt</span>
                )}

                <button
                  type="button"
                  onClick={() => deleteItem(layout.name, origIdx)}
                  title="Verwijder dit veld"
                  className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )
          })}
          {visibleItems.length === 0 && (
            <p className="text-white/20 text-sm pt-2">Geen tekstvelden in deze layout.</p>
          )}
        </div>
        </div>{/* end inner flex row */}
      </div>

      <div className="flex-shrink-0 px-8 py-4 border-t border-white/[0.06] flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Vorige
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayoutMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 text-white/25 hover:text-white/60 text-xs tabular-nums transition-colors"
          >
            {step + 1} / {templateData.layouts.length}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {layoutMenuOpen && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-56 max-h-72 overflow-y-auto rounded-xl border border-white/[0.10] bg-[#181818] shadow-2xl">
              {templateData.layouts.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setStep(i); setLayoutMenuOpen(false) }}
                  className={[
                    'w-full text-left px-3 py-2 text-[12px] transition-colors hover:bg-white/[0.06]',
                    i === step ? 'text-[#facc15]' : 'text-white/55',
                  ].join(' ')}
                >
                  <span className="text-white/25 tabular-nums mr-2">{String(i + 1).padStart(2, '0')}</span>
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs border border-white/[0.08] hover:border-white/20 text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed rounded-md px-3 py-1.5 transition-colors"
          >
            {saving ? 'Opslaan…' : 'Opslaan & sluiten'}
          </button>
          {!isLast ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1.5 bg-[#facc15] hover:bg-[#fde047] text-black font-semibold rounded-lg px-4 py-1.5 text-sm transition-colors"
            >
              Volgende
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-[#facc15] hover:bg-[#fde047] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-1.5 text-sm transition-colors"
            >
              {saving ? 'Opslaan…' : 'Alles opslaan'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
