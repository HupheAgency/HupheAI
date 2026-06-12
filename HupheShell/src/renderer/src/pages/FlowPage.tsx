import { useState, type FormEvent } from 'react'
import {
  createInitialFlowSteps,
  mockFlowResearchAdapter,
} from '../lib/flowMockResearch'
import AnimatedPixelBackground from '../components/AnimatedPixelBackground'
import type {
  FlowEvidenceLevel,
  FlowGuardrailCheck,
  FlowResearchAnswer,
  FlowResearchStep,
  FlowSource,
  FlowSourceKind,
} from '../lib/flowTypes'

type FlowView = 'intake' | 'running' | 'complete'

const evidenceLabels: Record<FlowEvidenceLevel, string> = {
  strong: 'sterk bewijs',
  medium: 'redelijk bewijs',
  early: 'vroeg signaal',
  unknown: 'nog onbekend',
}

const sourceKindLabels: Record<FlowSourceKind, string> = {
  internal: 'intern',
  external: 'extern',
  master_document: 'masterdocument',
  synthesis: 'synthese',
}

export default function FlowPage() {
  const [view, setView] = useState<FlowView>('intake')
  const [question, setQuestion] = useState('')
  const [steps, setSteps] = useState<FlowResearchStep[]>(createInitialFlowSteps())
  const [answer, setAnswer] = useState<FlowResearchAnswer | null>(null)
  const [error, setError] = useState('')

  const canStart = question.trim().length > 12 && view !== 'running'

  async function handleStart(event?: FormEvent) {
    event?.preventDefault()
    if (!canStart) return

    setView('running')
    setAnswer(null)
    setError('')
    setSteps(createInitialFlowSteps())

    try {
      const result = await mockFlowResearchAdapter.run({
        question: question.trim(),
        masterDocumentVersion: 'Masterdocument v0.1',
      }, setSteps)
      setAnswer(result)
      setView('complete')
    } catch (err: any) {
      setError(err?.message ?? 'Flow kon deze researchvraag niet verwerken.')
      setView('intake')
    }
  }

  function handleReset() {
    setView('intake')
    setAnswer(null)
    setError('')
    setSteps(createInitialFlowSteps())
  }

  return (
    <div className="relative h-full flex flex-col bg-[#0a0a0a] overflow-hidden">
      {view === 'intake' && <AnimatedPixelBackground />}
      <div
        className="relative z-10 flex-shrink-0 flex items-center justify-between px-6 border-b border-white/[0.06]"
        style={{ height: 52 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-[#facc15]/20 flex items-center justify-center">
            <FlowIcon />
          </div>
          <span className="text-white/80 font-semibold text-[14px] tracking-tight">Flow</span>
        </div>

        {view !== 'intake' && (
          <button
            onClick={handleReset}
            className="text-[11px] text-white/35 hover:text-white/60 border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors"
          >
            Nieuwe vraag
          </button>
        )}
      </div>

      {view === 'intake' ? (
        <div className="relative z-10 flex flex-1 min-h-0">
          <IntakeView
            question={question}
            onQuestionChange={setQuestion}
            onStart={handleStart}
            starting={false}
            error={error}
          />
        </div>
      ) : view === 'running' ? (
        <div className="relative z-10 flex flex-1 min-h-0">
          <ThinkingPanel steps={steps} />
        </div>
      ) : answer ? (
        <div className="relative z-10 flex flex-1 min-h-0">
          <ResearchResultView answer={answer} />
        </div>
      ) : null}
    </div>
  )
}

function IntakeView({
  question,
  onQuestionChange,
  onStart,
  starting,
  error,
}: {
  question: string
  onQuestionChange: (value: string) => void
  onStart: (event?: FormEvent) => void
  starting: boolean
  error: string
}) {
  const canStart = question.trim().length > 12 && !starting

  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-6 py-6">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-white/70 text-2xl font-semibold tracking-tight select-none text-center">
          Waar wil je onderzoek naar doen?
        </h1>

        <div className="space-y-2">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <form
            onSubmit={onStart}
            className="rounded-2xl border border-white/[0.10] bg-[#111] overflow-hidden focus-within:border-white/[0.18] transition-colors"
          >
            <textarea
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && canStart) {
                  event.preventDefault()
                  onStart()
                }
              }}
              placeholder="Stel een researchvraag..."
              rows={4}
              className="w-full bg-transparent px-4 pt-4 pb-2 text-white text-sm outline-none resize-none placeholder:text-white/20 leading-relaxed"
            />

            <div className="flex items-center gap-2 px-3 pb-3 pt-1">
              <div className="flex-1" />

              <button
                type="submit"
                disabled={!canStart}
                className={[
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0',
                  canStart
                    ? 'bg-[#facc15] hover:bg-[#fde047] cursor-pointer'
                    : 'bg-white/[0.05] cursor-not-allowed',
                ].join(' ')}
              >
                {starting ? (
                  <span className="inline-block w-3 h-3 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={canStart ? '#000' : 'rgba(255,255,255,0.2)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-white/15 text-[11px]">
            Enter om te starten · Shift+Enter voor nieuwe regel
          </p>
        </div>
      </div>
    </div>
  )
}

function ThinkingPanel({ steps }: { steps: FlowResearchStep[] }) {
  const activeStep = steps.find((step) => step.status === 'active')
  const doneCount = steps.filter((step) => step.status === 'done').length
  const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0

  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 h-10 w-10 rounded-xl border border-[#facc15]/25 bg-[#facc15]/10 flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-[#facc15] animate-pulse" />
        </div>
        <p className="text-white/70 text-sm font-medium">Flow doet onderzoek</p>
        <p className="text-white/30 text-xs leading-relaxed mt-2">
          {activeStep?.label ?? 'Onderzoek wordt voorbereid.'}
        </p>
        <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden mt-5">
          <div
            className="h-full bg-[#facc15] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function ResearchResultView({ answer }: { answer: FlowResearchAnswer }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <article className="max-w-3xl mx-auto">
        <p className="text-white/25 text-xs uppercase tracking-widest mb-3">Antwoord</p>
        <h1 className="text-white/85 text-2xl font-semibold tracking-tight">{answer.title}</h1>
        <p className="text-white/55 text-sm leading-relaxed mt-4">{answer.summary}</p>

        <ResultSection title="Aanbevelingen" items={answer.recommendations} />
        <ResultSection title="Nog onzeker" items={answer.uncertainties} muted />
        <SourceSection sources={answer.sources} />
        <GuardrailSection checks={answer.guardrails} />
      </article>
    </div>
  )
}

function ResultSection({
  title,
  items,
  muted = false,
}: {
  title: string
  items: string[]
  muted?: boolean
}) {
  return (
    <section className="mt-8 border-t border-white/[0.06] pt-5">
      <h2 className="text-white/70 text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed">
            <span className={muted ? 'mt-2 h-1.5 w-1.5 rounded-full bg-white/20 flex-shrink-0' : 'mt-2 h-1.5 w-1.5 rounded-full bg-[#facc15] flex-shrink-0'} />
            <span className={muted ? 'text-white/40' : 'text-white/55'}>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SourceSection({ sources }: { sources: FlowSource[] }) {
  return (
    <section className="mt-8 border-t border-white/[0.06] pt-5">
      <h2 className="text-white/70 text-sm font-semibold">Bronnen</h2>
      <div className="mt-3 space-y-3">
        {sources.map((source) => (
          <div key={source.id}>
            <p className="text-white/55 text-sm">{source.title}</p>
            <p className="text-white/25 text-[11px] mt-1">
              {sourceKindLabels[source.kind]} · {source.classification} · {evidenceLabels[source.evidenceLevel]}
            </p>
            <p className="text-white/35 text-xs leading-relaxed mt-1.5">{source.excerpt}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function GuardrailSection({ checks }: { checks: FlowGuardrailCheck[] }) {
  return (
    <section className="mt-8 border-t border-white/[0.06] pt-5 pb-8">
      <h2 className="text-white/70 text-sm font-semibold">Checks</h2>
      <div className="mt-3 space-y-2">
        {checks.map((check) => (
          <div key={check.id} className="flex gap-3">
            <span className={check.status === 'passed' ? 'mt-1.5 h-1.5 w-1.5 rounded-full bg-green-400 flex-shrink-0' : 'mt-1.5 h-1.5 w-1.5 rounded-full bg-[#facc15] flex-shrink-0'} />
            <div>
              <p className="text-white/55 text-sm">{check.label}</p>
              <p className="text-white/35 text-xs leading-relaxed mt-1">{check.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FlowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(250,204,21,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8.9 8.9 0 0 1-2.6 6.4A8.9 8.9 0 0 1 12 21a9 9 0 0 1 0-18" />
      <path d="M3 12h7" />
      <path d="m7 8 4 4-4 4" />
      <path d="M14 7h7" />
      <path d="M14 17h7" />
    </svg>
  )
}
