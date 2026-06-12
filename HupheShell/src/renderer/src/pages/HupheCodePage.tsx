import { useState, useRef, useEffect, useCallback } from 'react'
import { useHupheCode, STATUS_META, type PipelineStatus, type PipelineLogEntry } from '../lib/useHupheCode'
import { useSettings } from '../lib/useSettings'
import SettingsToggle from '../components/SettingsToggle'
import ProjectSelector from '../components/ProjectSelector'

interface Props {
  onBack: () => void
  embedded?: boolean
}

// ─── Pipeline node metadata ───────────────────────────────────────────────────
const NODES: { id: PipelineStatus; label: string; model: string; icon: string; color: string }[] = [
  { id: 'AUDITING',  label: 'Auditor',  model: 'GLM-4 via Ollama (lokaal)', icon: '🔍', color: '#F59E0B' },
  { id: 'BUILDING',  label: 'Builder',  model: 'Claude Opus',          icon: '🔨', color: '#3B82F6' },
  { id: 'TESTING',   label: 'Operator', model: 'npm test (lokaal)',    icon: '🧪', color: '#8B5CF6' },
  { id: 'REVIEWING', label: 'QA',       model: 'GPT-4o Vision',        icon: '🎨', color: '#EC4899' },
]

// ─── API Key config ───────────────────────────────────────────────────────────
interface KeyConfig {
  claude: string
  openai: string
  projectPath: string
}

const KEY_FIELDS: { key: keyof KeyConfig; label: string; placeholder: string; secret: boolean; help: string }[] = [
  {
    key: 'claude',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-…',
    secret: true,
    help: 'Gebruikt door de Builder node (API-modus). Niet nodig bij Antigravity-modus.',
  },
  {
    key: 'openai',
    label: 'OpenAI API Key',
    placeholder: 'sk-…',
    secret: true,
    help: 'Gebruikt door de QA node (GPT-4o). Genereer op platform.openai.com/api-keys',
  },
  {
    key: 'projectPath',
    label: 'Project Path (voor npm test)',
    placeholder: '/Users/jij/project/mijn-app',
    secret: false,
    help: 'Absoluut pad naar het project waarop de Operator node `npm run test` uitvoert',
  },
]

const ENGINE_AGENTS = [
  { id: 'strategist', label: 'Strategist', model: 'Planning & direction' },
  { id: 'builder', label: 'Builder', model: 'Code & execution' },
  { id: 'reviewer', label: 'Reviewer', model: 'QA & critique' },
  { id: 'documentarian', label: 'Documentarian', model: 'Docs & memory' },
  { id: 'direct', label: 'Direct model', model: 'OpenRouter' },
]

export default function HupheCodePage({ onBack, embedded }: Props) {
  const { state, logs, loading, submitTask, resetPipeline } = useHupheCode()
  const { config: settingsConfig } = useSettings()
  const [task, setTask]                     = useState('')
  const [screenshotPath, setScreenshotPath] = useState('')
  const [view, setView]                     = useState<'pipeline' | 'settings'>('pipeline')
  const [selectedAgentId, setSelectedAgentId] = useState(ENGINE_AGENTS[0].id)
  const logRef = useRef<HTMLDivElement>(null)

  const isDone           = state.status === 'DONE'
  const isFailed         = state.status === 'FAILED'
  const isRunning        = !['IDLE', 'DONE', 'FAILED'].includes(state.status)
  const activeProjectPath = settingsConfig?.activeProjectPath ?? null
  const noProject        = activeProjectPath === null

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!task.trim() || isRunning || noProject) return
    const selectedAgent = ENGINE_AGENTS.find(agent => agent.id === selectedAgentId) ?? ENGINE_AGENTS[0]
    const routedTask = selectedAgent.id === 'direct'
      ? task.trim()
      : `Praat als ${selectedAgent.label} (${selectedAgent.model}).\n\n${task.trim()}`
    await submitTask(routedTask, {
      screenshotPath: screenshotPath || undefined,
      projectPath:    activeProjectPath ?? undefined,
      designSpecPath: selectedAgent.label,
    })
    setTask('')
  }

  async function handleReset() {
    await resetPipeline()
    setTask('')
    setScreenshotPath('')
  }

  const activeNodeIndex = NODES.findIndex(n => n.id === state.status)
  const showIntro = view === 'pipeline'

  return (
    <div className={embedded ? 'h-full bg-[#0a0a0a] flex flex-col' : 'min-h-screen bg-[#0a0a0a] flex flex-col'} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      {!embedded && <header
        className="flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
        style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
      >
        <div className="flex items-center gap-3 pl-20" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button id="huphe-code-back-btn" onClick={onBack}
            className="text-white/30 hover:text-white/70 transition-colors mr-1" title="Terug">
            <ChevronLeftIcon />
          </button>
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-sm"
               style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>⚡</div>
          <span className="text-white font-semibold text-[15px] tracking-tight">Huphe Code</span>
          <span className="text-white/20 text-xs ml-1">AI Orchestratie Pipeline</span>
        </div>

        <div className="flex items-center gap-2 pr-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <StatusBadge status={state.status} patchLoop={state.patchLoop} />
          {/* Settings tab */}
          <button
            id="huphe-code-settings-btn"
            onClick={() => setView(v => v === 'settings' ? 'pipeline' : 'settings')}
            className={`flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 transition-colors ${
              view === 'settings'
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'text-white/30 hover:text-white/60 border-white/[0.08] hover:border-white/20'
            }`}
          >
            <GearIcon />
            {view === 'settings' ? 'Pipeline' : 'Instellingen'}
          </button>
          {(isRunning || isDone || isFailed) && (
            <button id="huphe-code-reset-btn" onClick={handleReset}
              className="text-white/30 hover:text-white/60 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors">
              Reset
            </button>
          )}
        </div>
      </header>}

      {view === 'settings' ? (
        <SettingsPanel />
      ) : showIntro ? (
        <EngineIntroView
          task={task}
          selectedAgentId={selectedAgentId}
          loading={loading}
          isRunning={isRunning}
          noProject={noProject}
          statusLabel={STATUS_META[state.status].label}
          onTaskChange={setTask}
          onAgentChange={setSelectedAgentId}
          onSubmit={handleSubmit}
          onNewChat={handleReset}
          onOpenSettings={() => setView('settings')}
        />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Task input + Node flow ─────────────────────────── */}
          <aside className="w-[340px] flex-shrink-0 flex flex-col border-r border-white/[0.07] bg-[#0d0d0d]">
            {/* Task form */}
            <div className="p-5 border-b border-white/[0.07]">
              <p className="text-white/30 text-[10px] font-medium uppercase tracking-widest mb-3">Nieuwe Taak</p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <textarea
                  id="huphe-code-task-input"
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  placeholder="Beschrijf de code-wijziging die de pipeline moet uitvoeren…"
                  rows={5}
                  disabled={isRunning}
                  className="w-full bg-[#141414] border border-white/[0.08] focus:border-indigo-500/50 rounded-lg px-3 py-2.5 text-white/80 text-sm placeholder-white/20 resize-none outline-none transition-colors disabled:opacity-40"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any) }}
                />
                <input
                  id="huphe-code-screenshot-path"
                  value={screenshotPath}
                  onChange={e => setScreenshotPath(e.target.value)}
                  placeholder="Screenshot pad (optioneel, voor QA node)"
                  disabled={isRunning}
                  className="w-full bg-[#141414] border border-white/[0.08] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-white/60 text-xs placeholder-white/20 outline-none transition-colors disabled:opacity-40"
                />

                {/* ── Project path selector ─────────────────────────── */}
                <ProjectSelector />

                <button
                  id="huphe-code-submit-btn"
                  type="submit"
                  disabled={!task.trim() || isRunning || loading || noProject}
                  title={noProject ? 'Selecteer eerst een projectmap' : undefined}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: (!task.trim() || isRunning || loading || noProject)
                      ? 'rgba(99,102,241,0.15)'
                      : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    color: (!task.trim() || isRunning || loading || noProject) ? 'rgba(255,255,255,0.3)' : '#fff',
                  }}
                >
                  {isRunning ? <><SpinnerIcon /> Pipeline actief…</> : <><FlashIcon /> Start Pipeline</>}
                </button>
                {noProject && !isRunning && (
                  <p className="text-amber-400/50 text-[10px] text-center">
                    Kies een projectmap om de pipeline te starten
                  </p>
                )}
                {!noProject && (
                  <p className="text-white/20 text-[10px] text-center">⌘ + Enter om te verzenden</p>
                )}
              </form>
            </div>

            {/* Node flow */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-white/30 text-[10px] font-medium uppercase tracking-widest mb-4">Pipeline Nodes</p>
              <div className="flex flex-col gap-0">
                {NODES.map((node, i) => {
                  const isActive  = state.status === node.id
                  const isPast    = activeNodeIndex > i && isRunning
                  const isSuccess = isDone
                  return (
                    <div key={node.id} className="flex flex-col items-start">
                      <div className="flex items-center gap-3 w-full rounded-xl px-3 py-3 transition-all"
                           style={{
                             background: isActive ? `${node.color}14` : 'transparent',
                             border: `1px solid ${isActive ? `${node.color}40` : 'transparent'}`,
                           }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 transition-all"
                             style={{
                               background: isActive ? `${node.color}22`
                                 : isPast || isSuccess ? 'rgba(16,185,129,0.12)'
                                 : 'rgba(255,255,255,0.03)',
                             }}>
                          {isActive ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke={node.color} strokeWidth="2.5" strokeLinecap="round"
                                 className="animate-spin">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          ) : isPast || isSuccess ? '✓' : node.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium"
                                  style={{ color: isActive ? '#fff' : isPast || isSuccess ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.35)' }}>
                              {node.label}
                            </span>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium animate-pulse"
                                    style={{ background: `${node.color}30`, color: node.color }}>
                                actief
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-white/25">{node.model}</span>
                        </div>
                        {isActive && state.status === 'BUILDING' && (state.patchLoop ?? 0) > 0 && (
                          <span className="text-[10px] text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full flex-shrink-0">
                            poging {(state.patchLoop ?? 0) + 1}
                          </span>
                        )}
                      </div>
                      {i < NODES.length - 1 && (
                        <div className="ml-[27px] w-px h-4"
                             style={{ background: isPast || isSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)' }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* State detail */}
              {(isDone || isFailed || state.task) && (
                <div className="mt-6 p-3 rounded-xl bg-[#141414] border border-white/[0.06]">
                  <p className="text-white/25 text-[10px] uppercase tracking-wider mb-2">Huidige Taak</p>
                  <p className="text-white/60 text-xs leading-relaxed">{state.task || '—'}</p>
                  {isFailed && state.error && (
                    <div className="mt-3 pt-3 border-t border-red-500/20">
                      <p className="text-red-400/70 text-[11px] font-medium mb-1">Fout</p>
                      <p className="text-red-400/50 text-xs leading-relaxed break-all">{state.error}</p>
                    </div>
                  )}
                  {isDone && (
                    <div className="mt-3 pt-3 border-t border-emerald-500/20">
                      <p className="text-emerald-400/70 text-xs">✅ Pipeline succesvol afgerond</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ── Right: Live log ────────────────────────────────────────── */}
          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07] bg-[#0d0d0d]">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-white/10'}`} />
                <p className="text-white/30 text-[10px] font-medium uppercase tracking-widest">Live Log</p>
              </div>
              <span className="text-white/15 text-xs">{logs.length} berichten</span>
            </div>

            <div ref={logRef} className="flex-1 overflow-y-auto p-5 font-mono" style={{ fontSize: 11, lineHeight: 1.7 }}>
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <TerminalIcon />
                  <p className="text-white/20 text-sm">Wacht op pipeline activiteit…</p>
                  <p className="text-white/12 text-xs">Geef een taakinstructie op en klik op "Start Pipeline"</p>
                </div>
              ) : (
                logs.map((entry, i) => <LogLine key={i} entry={entry} />)
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}

function EngineIntroView({
  task,
  selectedAgentId,
  loading,
  isRunning,
  noProject,
  statusLabel,
  onTaskChange,
  onAgentChange,
  onSubmit,
  onNewChat,
  onOpenSettings,
}: {
  task: string
  selectedAgentId: string
  loading: boolean
  isRunning: boolean
  noProject: boolean
  statusLabel: string
  onTaskChange: (value: string) => void
  onAgentChange: (agentId: string) => void
  onSubmit: (event: React.FormEvent) => void
  onNewChat: () => void
  onOpenSettings: () => void
}) {
  const canSubmit = task.trim().length > 0 && !loading && !isRunning && !noProject

  return (
    <div className="relative flex-1 overflow-hidden bg-[#fbfaf7] text-[#171717]">
      <main className="h-full pr-16 flex items-center justify-center px-8">
        <section className="w-full max-w-3xl -mt-10">
          <h1 className="text-center text-[28px] font-medium tracking-tight text-[#1d1d1f] mb-8">
            Let's huphefy some stuff
          </h1>

          <form onSubmit={onSubmit}>
            <div className="rounded-[28px] border border-black/10 bg-white shadow-[0_18px_70px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-black/55 hover:bg-black/[0.04] transition-colors flex-shrink-0"
                aria-label="Bijlage toevoegen"
              >
                <PlusIcon />
              </button>

              <div className="w-px h-7 bg-black/10 flex-shrink-0" />

              <textarea
                id="huphe-code-task-input"
                value={task}
                onChange={event => onTaskChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey && canSubmit) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Ask anything"
                rows={1}
                className="min-h-[38px] max-h-32 flex-1 resize-none bg-transparent py-2 text-[17px] leading-snug text-black/80 placeholder:text-black/35 outline-none"
              />

              <select
                value={selectedAgentId}
                onChange={event => onAgentChange(event.target.value)}
                className="max-w-[170px] bg-transparent text-black/45 hover:text-black/70 text-sm outline-none cursor-pointer"
                aria-label="Kies agent"
              >
                {ENGINE_AGENTS.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={!canSubmit}
                className={[
                  'w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0',
                  canSubmit
                    ? 'bg-black text-white hover:bg-black/85'
                    : 'bg-black/[0.08] text-black/25 cursor-not-allowed',
                ].join(' ')}
                aria-label="Verstuur"
              >
                {loading || isRunning ? <SmallSpinnerIcon /> : <VoiceWaveIcon />}
              </button>
            </div>
          </form>

          <p className="text-center text-black/25 text-[12px] mt-4">
            {noProject
              ? 'Kies eerst een projectmap via instellingen om Engine te starten.'
              : isRunning
                ? `Engine is bezig · ${statusLabel}`
                : 'Enter om te starten · Shift+Enter voor een nieuwe regel'}
          </p>
        </section>
      </main>

      <aside className="absolute right-0 top-0 h-full w-16 border-l border-black/[0.07] bg-[#fbfaf7] flex flex-col items-center py-4">
        <button
          type="button"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-black/70 hover:bg-black/[0.05] transition-colors"
          aria-label="Menu"
          title="Menu"
        >
          <MenuIcon />
        </button>

        <div className="mt-7 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onNewChat}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-black/65 hover:bg-black/[0.05] transition-colors"
            aria-label="New chat"
            title="New chat"
          >
            <NewChatIcon />
          </button>

          <button
            type="button"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-black/65 hover:bg-black/[0.05] transition-colors"
            aria-label="Search chat"
            title="Search chat"
          >
            <SearchIcon />
          </button>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-black/45 hover:text-black/70 hover:bg-black/[0.05] transition-colors"
          aria-label="Instellingen"
          title="Instellingen"
        >
          <GearIcon />
        </button>
      </aside>
    </div>
  )
}

// ─── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel() {
  const api = (window as any).api

  const [values, setValues]   = useState<KeyConfig>({ claude: '', openai: '', projectPath: '' })
  const [saved, setSaved]     = useState<Partial<Record<keyof KeyConfig, boolean>>>({})
  const [hasKey, setHasKey]   = useState<Partial<Record<keyof KeyConfig, boolean>>>({})
  const [saving, setSaving]   = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [mockMode, setMockMode] = useState(false)

  // Load existing settings on mount
  useEffect(() => {
    async function load() {
      const config = await api?.hupheCode?.getConfig?.() ?? {}
      setValues(v => ({ ...v, projectPath: config.projectPath || '' }))
      setMockMode(!!config.mockMode)

      const keys: (keyof KeyConfig)[] = ['claude', 'openai']
      const checks: Partial<Record<keyof KeyConfig, boolean>> = {}
      for (const k of keys) {
        checks[k] = !!(await api?.hasKey?.(k))
      }
      setHasKey(checks)
    }
    load()
  }, [])

  const handleChange = useCallback((key: keyof KeyConfig, val: string) => {
    setValues(v => ({ ...v, [key]: val }))
    setSaved(s => ({ ...s, [key]: false }))
  }, [])

  async function handleSaveAll() {
    setSaving(true)
    setMessage(null)
    try {
      // Save API keys via safeStorage
      for (const field of KEY_FIELDS) {
        if (field.secret && values[field.key]) {
          await api?.setKey?.(field.key, values[field.key])
        }
      }
      // Save projectPath + mockMode via plain config
      await api?.hupheCode?.setConfig?.({
        projectPath: values.projectPath,
        mockMode,
      })
      // Refresh hasKey state
      const checks: Partial<Record<keyof KeyConfig, boolean>> = {}
      for (const k of ['claude', 'openai'] as const) {
        checks[k] = !!(await api?.hasKey?.(k))
      }
      setHasKey(checks)
      setMessage({ text: 'Instellingen opgeslagen ✓', ok: true })
      setTimeout(() => setMessage(null), 3000)
    } catch (err: any) {
      setMessage({ text: `Fout: ${err.message}`, ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-8 py-10">
        <p className="text-white/30 text-[10px] font-medium uppercase tracking-widest mb-4">Uitvoeringsmodus</p>
        <div className="mb-8">
          <SettingsToggle />
        </div>

        <p className="text-white/30 text-[10px] font-medium uppercase tracking-widest mb-6">API Configuratie</p>

        <div className="flex flex-col gap-5">
          {KEY_FIELDS.map(field => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-white/60 text-xs font-medium" htmlFor={`setting-${field.key}`}>
                  {field.label}
                </label>
                {field.secret && hasKey[field.key] && (
                  <span className="text-[10px] text-emerald-400/70 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                    ✓ Opgeslagen
                  </span>
                )}
              </div>
              <input
                id={`setting-${field.key}`}
                type={field.secret ? 'password' : 'text'}
                value={values[field.key]}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full bg-[#141414] border border-white/[0.08] focus:border-indigo-500/50 rounded-lg px-3 py-2.5 text-white/80 text-sm placeholder-white/20 outline-none transition-colors font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-white/25 text-[11px] leading-relaxed">{field.help}</p>
            </div>
          ))}
        </div>

        {/* Test modus toggle */}
        <div className="mt-8 p-4 rounded-xl bg-[#141414] border border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-white/70 text-sm font-medium">🧪 Test modus</span>
              <span className="text-white/30 text-[11px] leading-relaxed">
                {mockMode
                  ? 'Pipeline draait in mock-modus — geen echte API calls worden gedaan.'
                  : 'Pipeline gebruikt echte API keys voor alle nodes.'}
              </span>
            </div>
            {/* Toggle switch */}
            <button
              id="huphe-code-mock-mode-toggle"
              role="switch"
              aria-checked={mockMode}
              onClick={() => setMockMode(m => !m)}
              className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              style={{
                background: mockMode
                  ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                  : 'rgba(255,255,255,0.08)',
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: mockMode ? 'translateX(20px)' : 'translateX(0px)' }}
              />
            </button>
          </div>
          {mockMode && (
            <p className="mt-3 text-amber-400/50 text-[10px] leading-relaxed border-t border-amber-400/10 pt-3">
              ⚠️ Test modus actief — alle AI nodes simuleren hun output lokaal. Zet uit om echte API calls te gebruiken.
            </p>
          )}
        </div>

        {/* Save button */}
        <div className="mt-6 flex items-center gap-4">
          <button
            id="huphe-code-save-settings-btn"
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-2 py-2.5 px-5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}
          >
            {saving ? <><SpinnerIcon /> Opslaan…</> : 'Instellingen opslaan'}
          </button>
          {message && (
            <span className={`text-xs ${message.ok ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, patchLoop }: { status: PipelineStatus; patchLoop?: number }) {
  const meta = STATUS_META[status]
  const isRunning = !['IDLE', 'DONE', 'FAILED'].includes(status)
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
         style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}>
      {isRunning && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: meta.color }} />}
      {meta.label}
      {patchLoop !== undefined && patchLoop > 0 && status === 'BUILDING' && (
        <span className="opacity-60">· {patchLoop}</span>
      )}
    </div>
  )
}

function LogLine({ entry }: { entry: PipelineLogEntry }) {
  const tagColor: Record<string, string> = {
    '[AUDITOR]':  '#F59E0B',
    '[BUILDER]':  '#60A5FA',
    '[OPERATOR]': '#A78BFA',
    '[QA]':       '#F472B6',
    '[PIPELINE]': '#34D399',
  }
  const color = tagColor[entry.tag] ?? 'rgba(255,255,255,0.3)'
  return (
    <div className="flex gap-2 hover:bg-white/[0.02] px-1 rounded transition-colors group">
      <span className="text-white/15 flex-shrink-0 select-none">{entry.ts.slice(11, 19)}</span>
      <span className="flex-shrink-0 font-semibold" style={{ color }}>{entry.tag}</span>
      <span className="text-white/50 group-hover:text-white/70 transition-colors break-all">{entry.msg}</span>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function SmallSpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function FlashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function VoiceWaveIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v4" />
      <path d="M8 7v10" />
      <path d="M12 4v16" />
      <path d="M16 8v8" />
      <path d="M20 11v2" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function NewChatIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function TerminalIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
