import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvolvementLevel = 'low' | 'medium' | 'high'

interface StepState {
  iterKey:      string   // unique key: stepId + iteration number
  stepId:       string
  role:         string
  label:        string
  phase:        string
  color:        string
  model:        string
  status:       'waiting' | 'active' | 'done' | 'error'
  output:       string
  error?:       string
  round?:       number
  totalRounds?: number
  iteration:    number   // which feedback loop iteration (1 = first run)
}

interface FeedbackMarker {
  id:            string
  iteration:     number
  maxIterations: number
  afterPhaseId:  string
}

interface CampaignResult {
  history: Array<{ stepId: string; role: string; label: string; phase: string; output: string }>
}

type View = 'intake' | 'running' | 'complete'

const PHASE_LABELS: Record<string, string> = {
  intake:                  '1 · Intake',
  debrief:                 '2 · Debrief',
  strategie:               '3 · Strategie',
  'creative-direction':    '4 · Creative Direction',
  concepting:              '5 · Concepting',
  'internal-review':       '6 · Interne Review',
  'presentation-selection':'7 · Presentatie & Selectie',
  design:                  '8 · Design',
  delivery:                '9 · Oplevering',
  creatie:                 'Creatie',
  review:                  'Review',
}

const PHASES = [
  'intake',
  'debrief',
  'strategie',
  'creative-direction',
  'concepting',
  'internal-review',
  'presentation-selection',
  'design',
  'delivery',
]

const INVOLVEMENT_OPTIONS: Array<{ value: InvolvementLevel; label: string; desc: string }> = [
  { value: 'high',   label: 'Regisseren', desc: 'Jij stuurt elke creatieve beslissing' },
  { value: 'medium', label: 'Sparren',     desc: 'Jij bevestigt de debrief en kiest het concept' },
  { value: 'low',    label: 'Delegeren',  desc: 'AI werkt autonoom, jij ziet het eindresultaat' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PulsePage() {
  const [view,           setView]           = useState<View>('intake')
  const [brief,          setBrief]          = useState('')
  const [involvement,    setInvolvement]    = useState<InvolvementLevel>('medium')
  const [steps,          setSteps]          = useState<StepState[]>([])
  const [feedbackMarkers,setFeedbackMarkers]= useState<FeedbackMarker[]>([])
  const [activeStepKey,  setActiveStepKey]  = useState<string | null>(null)
  const [_result,        setResult]         = useState<CampaignResult | null>(null)
  const [error,          setError]          = useState('')
  const [starting,       setStarting]       = useState(false)
  const [selectedKey,    setSelectedKey]    = useState<string | null>(null)

  // Track which feedback iteration we're in (increments on feedback:loop-start)
  const iterationRef = useRef(1)

  // ── Pulse event listener ──────────────────────────────────────────────────
  useEffect(() => {
    function onEvent(e: Event) {
      const ev = (e as CustomEvent).detail as any

      switch (ev.type) {
        case 'step:start': {
          const iterKey = `${ev.stepId}-iter-${iterationRef.current}`
          setSteps((prev) => {
            const exists = prev.find((s) => s.iterKey === iterKey)
            if (exists) {
              // Same step running again in a new round (within same iteration)
              return prev.map((s) => s.iterKey === iterKey
                ? { ...s, status: 'active', output: '', error: undefined, round: ev.round ?? s.round, totalRounds: ev.totalRounds ?? s.totalRounds }
                : s)
            }
            return [...prev, {
              iterKey,
              stepId:      ev.stepId,
              role:        ev.role,
              label:       ev.label,
              phase:       ev.phase,
              color:       ev.color ?? '#6b7280',
              model:       ev.model,
              status:      'active',
              output:      '',
              round:        ev.round,
              totalRounds:  ev.totalRounds,
              iteration:    iterationRef.current,
            }]
          })
          setActiveStepKey(iterKey)
          setSelectedKey(iterKey)
          break
        }

        case 'step:token':
          setSteps((prev) => {
            // Update the most recent entry for this stepId in current iteration
            const iterKey = `${ev.stepId}-iter-${iterationRef.current}`
            return prev.map((s) => s.iterKey === iterKey
              ? { ...s, output: s.output + ev.token }
              : s)
          })
          break

        case 'step:done':
          setSteps((prev) => {
            const iterKey = `${ev.stepId}-iter-${iterationRef.current}`
            return prev.map((s) => s.iterKey === iterKey ? { ...s, status: 'done' } : s)
          })
          break

        case 'feedback:loop-start':
          iterationRef.current += 1
          setFeedbackMarkers((prev) => [...prev, {
            id:            `fb-${ev.iteration}`,
            iteration:     ev.iteration,
            maxIterations: ev.maxIterations,
            afterPhaseId:  ev.phaseId,
          }])
          break

        case 'campaign:complete':
          setActiveStepKey(null)
          setResult(ev as CampaignResult)
          setView('complete')
          break

        case 'campaign:error':
          setError(ev.error ?? 'Onbekende fout')
          if (ev.stepId) {
            const iterKey = `${ev.stepId}-iter-${iterationRef.current}`
            setSteps((prev) => prev.map((s) =>
              s.iterKey === iterKey ? { ...s, status: 'error', error: ev.error } : s
            ))
          }
          setActiveStepKey(null)
          break

        case 'campaign:cancelled':
          setActiveStepKey(null)
          setError('Campagne geannuleerd.')
          break
      }
    }

    window.addEventListener('pulse:event', onEvent)
    return () => window.removeEventListener('pulse:event', onEvent)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleStart() {
    if (!brief.trim()) return
    setStarting(true)
    setError('')
    setSteps([])
    setFeedbackMarkers([])
    setResult(null)
    setSelectedKey(null)
    iterationRef.current = 1

    const res = await (window as any).api.pulse.start({
      brief: brief.trim(),
      involvementLevel: involvement,
    })

    setStarting(false)

    if (!res.ok) {
      setError(res.error ?? 'Starten mislukt')
      return
    }

    setView('running')
  }

  async function handleCancel() {
    await (window as any).api.pulse.cancel()
  }

  function handleReset() {
    setView('intake')
    setSteps([])
    setFeedbackMarkers([])
    setResult(null)
    setError('')
    setActiveStepKey(null)
    setSelectedKey(null)
    iterationRef.current = 1
  }

  // ── Phase grouping ────────────────────────────────────────────────────────
  const dynamicPhases = steps
    .map((s) => s.phase)
    .filter((phase) => !PHASES.includes(phase))
  const phases = [...PHASES, ...Array.from(new Set(dynamicPhases))]
  const stepsByPhase = phases.reduce<Record<string, StepState[]>>((acc, p) => {
    acc[p] = steps.filter((s) => s.phase === p)
    return acc
  }, {})

  const selectedStep = steps.find((s) => s.iterKey === selectedKey) ?? null
  const doneCount    = steps.filter((s) => s.status === 'done').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] overflow-hidden">

      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 border-b border-white/[0.06]"
        style={{ height: 52 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-[#a78bfa]/20 flex items-center justify-center">
            <PulseIcon />
          </div>
          <span className="text-white/80 font-semibold text-[14px] tracking-tight">Pulse</span>
        </div>
        <div className="flex items-center gap-2">
          {view === 'running' && (
            <button
              onClick={handleCancel}
              className="text-[11px] text-white/35 hover:text-red-400 border border-white/[0.08] hover:border-red-400/30 rounded-md px-3 py-1.5 transition-colors"
            >
              Stoppen
            </button>
          )}
          {view !== 'intake' && (
            <button
              onClick={handleReset}
              className="text-[11px] text-white/35 hover:text-white/60 border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors"
            >
              Nieuwe campagne
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {view === 'intake' ? (
        <IntakeView
          brief={brief}
          onBriefChange={setBrief}
          involvement={involvement}
          onInvolvementChange={setInvolvement}
          onStart={handleStart}
          starting={starting}
          error={error}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">

          {/* Left: workflow steps */}
          <div className="w-64 flex-shrink-0 border-r border-white/[0.06] flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
              {phases.map((phase) => {
                const phaseSteps = stepsByPhase[phase]
                const phaseHasStarted = steps.some((s) => phases.indexOf(s.phase) >= phases.indexOf(phase))
                if (!phaseSteps.length && view === 'running' && !phaseHasStarted) return null

                // Check if there's a feedback marker after this phase
                const marker = feedbackMarkers.find((m) => {
                  // 'review' phase → afterPhaseId is 'fase-review'
                  return m.afterPhaseId.includes(phase)
                })

                return (
                  <div key={phase}>
                    <p className="text-[9px] font-mono text-white/20 uppercase tracking-widest px-2 mb-1.5">
                      {PHASE_LABELS[phase] ?? phase}
                    </p>
                    {phaseSteps.length === 0 ? (
                      <div className="px-2 py-1.5">
                        <div className="h-7 rounded-md bg-white/[0.03] animate-pulse" />
                      </div>
                    ) : (
                      phaseSteps.map((step) => (
                        <StepRow
                          key={step.iterKey}
                          step={step}
                          isActive={step.iterKey === activeStepKey}
                          isSelected={step.iterKey === selectedKey}
                          onClick={() => setSelectedKey(step.iterKey)}
                        />
                      ))
                    )}

                    {/* Feedback loop marker — shown after review phase */}
                    {marker && (
                      <div className="mt-2 mx-2 rounded-md border border-[#f97316]/20 bg-[#f97316]/5 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#f97316] text-[10px]">↩</span>
                          <span className="text-[10px] text-[#f97316]/80 font-medium">
                            Feedback iteratie {marker.iteration}/{marker.maxIterations}
                          </span>
                        </div>
                        <p className="text-[9px] text-white/25 mt-0.5">Creatief team herschrijft</p>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Progress bar */}
              {steps.length > 0 && (
                <div className="px-2 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-white/20 font-mono">Voortgang</span>
                    <span className="text-[9px] text-white/20 font-mono">{doneCount}/{steps.length}</span>
                  </div>
                  <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#a78bfa] transition-all duration-500"
                      style={{ width: steps.length > 0 ? `${(doneCount / steps.length) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: output panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedStep ? (
              <OutputPanel step={selectedStep} />
            ) : (
              <ThinkingPanel />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Thinking panel
// ---------------------------------------------------------------------------

function ThinkingPanel() {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 h-10 w-10 rounded-xl border border-[#a78bfa]/25 bg-[#a78bfa]/10 flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-[#a78bfa] animate-pulse" />
        </div>
        <p className="text-white/70 text-sm font-medium">Onze experts zijn aan het werk</p>
        <p className="text-white/30 text-xs leading-relaxed mt-2">
          Ze leggen de strategische fundamenten, werken creatieve routes uit en bereiden de klantselectie voor.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intake view
// ---------------------------------------------------------------------------

function IntakeView({
  brief, onBriefChange,
  involvement, onInvolvementChange,
  onStart, starting, error,
}: {
  brief: string; onBriefChange: (v: string) => void
  involvement: InvolvementLevel; onInvolvementChange: (v: InvolvementLevel) => void
  onStart: () => void; starting: boolean; error: string
}) {
  const canStart = brief.trim().length > 20 && !starting

  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-6 py-6">

      <div className="w-full max-w-2xl space-y-6">

        {/* Greeting */}
        <h1 className="text-white/70 text-2xl font-semibold tracking-tight select-none text-center">
          Waar kan ik mee helpen?
        </h1>

        {/* Chat bar */}
        <div className="space-y-2">

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <div className="rounded-2xl border border-white/[0.10] bg-[#111] overflow-hidden focus-within:border-white/[0.18] transition-colors">

            {/* Brief textarea */}
            <textarea
              value={brief}
              onChange={(e) => onBriefChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && canStart) {
                  e.preventDefault()
                  onStart()
                }
              }}
              placeholder="Beschrijf de opdracht…"
              rows={4}
              className="w-full bg-transparent px-4 pt-4 pb-2 text-white text-sm outline-none resize-none placeholder:text-white/20 leading-relaxed"
            />

            {/* Bottom controls */}
            <div className="flex items-center gap-2 px-3 pb-3 pt-1">

              <div className="flex-1" />

              {/* Involvement dropdown */}
              <div className="relative">
                <select
                  value={involvement}
                  onChange={(e) => onInvolvementChange(e.target.value as InvolvementLevel)}
                  title={INVOLVEMENT_OPTIONS.find(o => o.value === involvement)?.desc}
                  className="appearance-none bg-white/[0.05] border border-white/[0.08] rounded-lg pl-3 pr-7 py-1.5 text-white/50 text-xs outline-none cursor-pointer hover:border-white/20 hover:text-white/70 transition-colors"
                >
                  {INVOLVEMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#1a1a1a] text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Send button */}
              <button
                onClick={onStart}
                disabled={!canStart}
                className={[
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0',
                  canStart
                    ? 'bg-[#a78bfa] hover:bg-[#9d7ff0] cursor-pointer'
                    : 'bg-white/[0.05] cursor-not-allowed',
                ].join(' ')}
              >
                {starting ? (
                  <span className="inline-block w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={canStart ? '#000' : 'rgba(255,255,255,0.2)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-white/15 text-[11px]">
            Enter om te starten · Shift+Enter voor nieuwe regel
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step row (sidebar)
// ---------------------------------------------------------------------------

function StepRow({ step, isActive, isSelected, onClick }: {
  step: StepState; isActive: boolean; isSelected: boolean; onClick: () => void
}) {
  const showRound     = step.totalRounds && step.totalRounds > 1
  const showIteration = step.iteration > 1

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left rounded-lg px-2.5 py-2 transition-colors group',
        isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        {/* Avatar dot */}
        <div
          className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black"
          style={{ background: step.color }}
        >
          {step.label.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-white/70 font-medium truncate">{step.label}</p>
          {(showRound || showIteration) && (
            <div className="flex items-center gap-1 mt-0.5">
              {showRound && (
                <span className="text-[8px] font-mono text-white/25">
                  R{step.round}/{step.totalRounds}
                </span>
              )}
              {showIteration && (
                <span
                  className="text-[8px] font-mono px-1 rounded-sm"
                  style={{ color: '#f97316', background: '#f9731615' }}
                >
                  ×{step.iteration}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="flex-shrink-0">
          {step.status === 'active' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-pulse" />
          )}
          {step.status === 'done' && (
            <span className="text-[#22c55e] text-[10px]">✓</span>
          )}
          {step.status === 'error' && (
            <span className="text-red-400 text-[10px]">✗</span>
          )}
          {step.status === 'waiting' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/10" />
          )}
        </div>
      </div>

      {isActive && (
        <div className="mt-1.5 ml-7">
          <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-[#a78bfa]/50 animate-[progressPulse_1.5s_ease-in-out_infinite]" style={{ width: '60%' }} />
          </div>
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Output panel
// ---------------------------------------------------------------------------

function OutputPanel({ step }: { step: StepState }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (step.status === 'active' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [step.output, step.status])

  const roundLabel = step.totalRounds && step.totalRounds > 1
    ? ` — Ronde ${step.round}/${step.totalRounds}`
    : ''
  const iterLabel = step.iteration > 1 ? ` — Iteratie ${step.iteration}` : ''

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3.5 border-b border-white/[0.05]">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-black flex-shrink-0"
          style={{ background: step.color }}
        >
          {step.label.charAt(0)}
        </div>
        <div>
          <p className="text-white/80 text-[13px] font-semibold">
            {step.label}
            {(roundLabel || iterLabel) && (
              <span className="text-white/30 font-normal text-[11px] ml-1.5">
                {roundLabel}{iterLabel}
              </span>
            )}
          </p>
          <p className="text-white/25 text-[10px] font-mono">{step.model}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {step.status === 'active' && (
            <span className="flex items-center gap-1.5 text-[10px] text-[#a78bfa]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-pulse" />
              Bezig…
            </span>
          )}
          {step.status === 'done' && (
            <span className="text-[10px] text-[#22c55e]">✓ Klaar</span>
          )}
          {step.status === 'error' && (
            <span className="text-[10px] text-red-400">✗ Fout</span>
          )}
        </div>
      </div>

      {/* Output content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        {step.error ? (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
            <p className="text-red-400 text-sm">{step.error}</p>
          </div>
        ) : step.output ? (
          <pre className="text-white/70 text-[13px] leading-relaxed whitespace-pre-wrap font-sans">
            {step.output}
            {step.status === 'active' && (
              <span className="inline-block w-1.5 h-4 bg-white/40 ml-0.5 animate-pulse align-middle" />
            )}
          </pre>
        ) : (
          <div className="flex items-center gap-2 text-white/20 text-sm">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
            Wachten op output…
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PulseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
