import { BrowserWindow, ipcMain } from 'electron'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PulseStepDef {
  id:   string
  type: string
  data: {
    label:  string
    config: {
      agentId:      string
      avatarColor:  string
      pulseRole:    string
      pulsePhase:   string
    }
  }
}

// A phase groups one or more steps and defines how they execute
interface ExecutionPhase {
  id:                 string
  label:              string
  mode:               'sequential' | 'collaborative'
  stepIds:            string[]
  rounds?:            number    // collaborative: fixed round count
  iterationsInfinite?: boolean  // collaborative: run until stop condition
  maxIterations?:     number    // cap for infinite mode
  contextMode?:       'full' | 'last'   // full = all rounds history, last = previous round only
  loopRole?:          'collaborative' | 'critique' | 'consensus'
  outputMode?:        'last' | 'all' | 'synthesis'
  stopCondition?:     'fixed' | 'marker' | 'convergence'
  stopMarker?:        string    // e.g. '[AKKOORD]'
  feedbackTo?:        string    // phase ID to loop back to after this phase completes
  maxFeedback?:       number    // max times the feedback loop runs (default 0)
}

interface PipelineStages {
  nodes:         PulseStepDef[]
  executionPlan: ExecutionPhase[]
}

interface AgentConfig {
  id:            string
  name:          string
  model:         string
  system_prompt: string
  temperature:   number
  max_tokens:    number
}

interface StepOutput {
  stepId: string
  role:   string
  label:  string
  phase:  string
  round?: number
  output: string
}

export interface PulseCampaignInput {
  brief:             string
  clientName:        string
  involvementLevel:  'low' | 'medium' | 'high'
}

// ---------------------------------------------------------------------------
// Build user message per step, with collaborative round context support
// ---------------------------------------------------------------------------
function buildUserMessage(
  stepId:  string,
  input:   PulseCampaignInput,
  history: StepOutput[],
  opts?: {
    roundHistory?:    StepOutput[]  // outputs so far within the current collaborative phase run
    round?:           number
    totalRounds?:     number
    feedbackContext?: string        // reviewer feedback when creative phase is re-run
    loopRole?:        'collaborative' | 'critique' | 'consensus'
    contextMode?:     'full' | 'last'
    stepLabel?:       string
    stepRole?:        string
    stepPhase?:       string
  },
): string {
  // First occurrence of a step in global history
  const get = (id: string) => history.find((h) => h.stepId === id)?.output ?? ''
  // Most recent occurrence of a step in global history (handles iterations)
  const latest = (id: string) => [...history].reverse().find((h) => h.stepId === id)?.output ?? ''
  // Most recent output of a step within the current round history
  const prevRound = (id: string) => {
    const rh = opts?.roundHistory ?? []
    return [...rh].reverse().find((h) => h.stepId === id)?.output ?? ''
  }

  const round       = opts?.round ?? 1
  const totalRounds = opts?.totalRounds ?? 1
  const feedback    = opts?.feedbackContext ?? ''

  switch (stepId) {
    case 'intake':
      return `Klant: ${input.clientName}\n\nDe klant heeft ons de volgende briefing gegeven:\n\n${input.brief}\n\nMaak hier een gestructureerde interne intake van.`

    case 'debrief':
      return `Wij hebben de volgende interne intake ontvangen van de Account Director:\n\n${get('intake')}\n\nVertaal dit naar een formele debrief die wij terugsturen naar de klant ter bevestiging.`

    case 'brand-strategy':
      return `Wij hebben de volgende projectdebrief:\n\n${get('debrief')}\n\nGeef jouw merkstrategie-analyse voor deze opdracht. Focus op de merkpositionering, merkwaarden en strategische richting.`

    case 'behavioral-strategy':
      return `Wij hebben de volgende projectdebrief:\n\n${get('debrief')}\n\nGeef jouw gedragsanalyse voor deze opdracht. Focus op de psychologie van de doelgroep, relevante biases en gedragsinterventies.`

    case 'master-brief':
      return `Wij hebben de volgende projectdebrief:\n\n${get('debrief')}\n\n---\nDE MERKSTRATEEG GEEFT HET VOLGENDE INZICHT:\n\n${get('brand-strategy')}\n\n---\nDE GEDRAGSWETENSCHAPPER GEEFT HET VOLGENDE INZICHT:\n\n${get('behavioral-strategy')}\n\n---\nSmeed deze inzichten samen tot een Master Briefing voor het creatieve team.`

    case 'concepts': {
      const masterBrief = get('master-brief')

      // First round after Creative Director feedback: rewrite based on critique
      if (feedback && round === 1) {
        return `De Creatief Directeur heeft feedback gegeven op jouw eerdere concepten:\n\n${feedback}\n\n---\nMaster Briefing:\n\n${masterBrief}\n\nHerschrijf je 3 concepten op basis van deze feedback. Wees scherper en onderscheidender.`
      }

      // Round 1, no prior feedback
      if (round === 1) {
        return `Wij hebben de volgende Master Briefing voor het creatieve team:\n\n${masterBrief}\n\nBedenk op basis van deze briefing 3 scherpe, onderscheidende creatieve concepten.`
      }

      // Round 2+: refine based on Art Director's visual input
      const prevCopy = prevRound('concepts')
      const artInput = prevRound('art-direction')
      return `Je bent in ronde ${round} van ${totalRounds} van het creatieve overleg.\n\nMaster Briefing:\n\n${masterBrief}\n\n---\nJOUW CONCEPTEN (VORIGE RONDE):\n\n${prevCopy}\n\n---\nDE ART DIRECTOR REAGEERT:\n\n${artInput}\n\n---\nVerfijn en versterk je 3 concepten op basis van de visuele richting van de Art Director. Scherp de kernideeën aan waar nodig.`
    }

    case 'art-direction': {
      const masterBrief  = get('master-brief')
      const currentCopy  = prevRound('concepts')

      if (round === 1 && feedback) {
        return `De Copywriter heeft de concepten herzien na feedback van de Creatief Directeur:\n\n${currentCopy}\n\n---\nMaster Briefing:\n\n${masterBrief}\n\nGeef jouw bijgewerkte visuele richting per concept.`
      }

      if (round === 1) {
        return `De Copywriter heeft de volgende concepten aangeleverd:\n\n${currentCopy}\n\n---\nMaster Briefing:\n\n${masterBrief}\n\nGeef jouw visuele richting per concept. Vertaal elk concept naar een concrete visuele taal.`
      }

      // Round 2+: respond to refined copy
      const prevArt = prevRound('art-direction')
      return `Je bent in ronde ${round} van ${totalRounds} van het creatieve overleg.\n\nDe Copywriter heeft zijn concepten verfijnd:\n\n${currentCopy}\n\n---\nJOUW VORIGE VISUELE RICHTING:\n\n${prevArt}\n\n---\nMaster Briefing:\n\n${masterBrief}\n\n---\nPas je visuele richting aan op de bijgewerkte concepten. Versterk de visuele koers.`
    }

    case 'review': {
      const masterBrief  = get('master-brief')
      const copyOutput   = latest('concepts')
      const artOutput    = latest('art-direction')
      const reviewCount  = history.filter((h) => h.stepId === 'review').length
      const iterNote     = reviewCount > 0
        ? `\n\n(Dit is iteratie ${reviewCount + 1} — de concepten zijn herzien op basis van jouw eerdere feedback.)`
        : ''

      return `Master Briefing:\n\n${masterBrief}${iterNote}\n\n---\nDE COPYWRITER PRESENTEERT:\n\n${copyOutput}\n\n---\nDE ART DIRECTOR VOEGT TOE:\n\n${artOutput}\n\n---\nBeoordeel de concepten als Creatief Directeur. Geef per concept: BEOORDELING (Accepteren / Verbeteren / Afwijzen), STERKE PUNTEN, VERBETERPUNTEN en SCORE (1-10). Sluit af met een TOP 3 RANKING en DIRECTIEVERKLARING.`
    }

    default: {
      // Generic collaborative message builder for non-Pulse step IDs
      const round       = opts?.round ?? 1
      const totalRounds = opts?.totalRounds ?? 1
      const rh          = opts?.roundHistory ?? []
      const feedback    = opts?.feedbackContext ?? ''
      const loopRole    = opts?.loopRole ?? 'collaborative'
      const stepLabel   = opts?.stepLabel ?? stepId
      const stepRole    = opts?.stepRole ?? stepLabel
      const stepPhase   = opts?.stepPhase ?? 'pulse'

      const contextParts: string[] = []

      contextParts.push([
        `ROL: ${stepRole}`,
        `STAP: ${stepLabel}`,
        `FASE: ${stepPhase}`,
        '',
        `Klant: ${input.clientName}`,
        `Klantbetrokkenheid: ${input.involvementLevel}`,
        '',
        `Originele briefing:`,
        input.brief,
      ].join('\n'))

      if (stepPhase === 'intake') {
        contextParts.push([
          'Maak een gestructureerd Briefing Object.',
          'Gebruik deze verplichte velden: client, goal, audience, message, formats, deadline.',
          'Als een verplicht antwoord ontbreekt, zet de waarde op "onbekend" en noteer het veld in open_questions.',
          'Neem optionele context op voor brand_guidelines, budget, references en bestaande assets als die aanwezig is.',
          'Eindig met geldige JSON voor het Briefing Object.',
        ].join('\n'))
      }

      if (stepPhase === 'debrief') {
        contextParts.push('Schrijf een professionele, klantvriendelijke debrief die geschikt is voor akkoord via de Client Approval Gate.')
      }

      if (stepPhase === 'presentation-selection') {
        contextParts.push('Bereid drie duidelijke routes voor waaruit de klant één favoriet kan kiezen. Benoem per route het idee, de rationale en mogelijke executies.')
      }

      if (stepPhase === 'delivery') {
        contextParts.push('Vat de finale keuze samen en beschrijf welke assets en exports moeten worden opgeleverd.')
      }

      // Include the most useful prior context from global history (last 2 sequential outputs)
      const priorContext = history
        .filter((h) => !rh.some((r) => r.stepId === h.stepId))
        .slice(-2)
        .map((h) => `[${h.label}]:\n${h.output}`)
        .join('\n\n---\n\n')
      if (priorContext) contextParts.push(`CONTEXT UIT VORIGE FASE:\n\n${priorContext}`)

      if (feedback && round === 1) {
        contextParts.push(`FEEDBACK VAN DE BEOORDELAAR:\n\n${feedback}`)
      }

      if (rh.length > 0) {
        const roleHeader =
          loopRole === 'critique'   ? 'FEEDBACK RONDE TOT NU TOE' :
          loopRole === 'consensus'  ? 'CONSENSUS OVERLEG TOT NU TOE' :
          'SAMENWERKING TOT NU TOE'
        contextParts.push(`${roleHeader}:\n\n${rh.map((h) => `[${h.label}${h.round ? ` — ronde ${h.round}` : ''}]:\n${h.output}`).join('\n\n---\n\n')}`)
      }

      contextParts.push(`Je bent nu aan de beurt. Dit is ronde ${round}${totalRounds > 1 ? ` van ${totalRounds}` : ''}.`)

      return contextParts.join('\n\n---\n\n')
    }
  }
}

// ---------------------------------------------------------------------------
// Stream a single OpenRouter call, emitting token events
// ---------------------------------------------------------------------------
// TODO: vervang openrouterKey parameter door JWT + proxy-openrouter Edge Function
async function callAgentStream(
  agent:         AgentConfig,
  userMessage:   string,
  openrouterKey: string,
  onToken:       (token: string) => void,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${openrouterKey}`,
      'HTTP-Referer':  'https://hupheai.app',
      'X-Title':       'HupheAI Pulse',
    },
    body: JSON.stringify({
      model:       agent.model,
      stream:      true,
      temperature: agent.temperature,
      max_tokens:  agent.max_tokens,
      messages: [
        { role: 'system', content: agent.system_prompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  })

  if (!response.ok || !response.body) {
    const raw = await response.text()
    throw new Error(`OpenRouter ${response.status}: ${raw.slice(0, 200)}`)
  }

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText  = ''
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json  = JSON.parse(data)
        const token = json.choices?.[0]?.delta?.content ?? ''
        if (token) {
          fullText += token
          onToken(token)
        }
      } catch { /* partial JSON line, skip */ }
    }
  }

  return fullText
}

// ---------------------------------------------------------------------------
// Execute a sequential phase (each step runs once in order)
// ---------------------------------------------------------------------------
async function runSequentialPhase(
  phase:          ExecutionPhase,
  nodes:          PulseStepDef[],
  input:          PulseCampaignInput,
  history:        StepOutput[],
  agents:         AgentConfig[],
  openrouterKey:  string,
  emit:           (event: object) => void,
  cancel:         { cancelled: boolean },
  feedbackContext?: string,
): Promise<void> {
  for (const stepId of phase.stepIds) {
    if (cancel.cancelled) return

    const stepDef = nodes.find((s) => s.id === stepId)
    if (!stepDef) continue

    const agent = agents.find((a) => a.id === stepDef.data.config.agentId)
    if (!agent) {
      emit({ type: 'campaign:error', stepId, error: `Agent niet gevonden voor stap: ${stepId}` })
      throw new Error(`Agent niet gevonden: ${stepId}`)
    }

    emit({
      type:  'step:start',
      stepId,
      role:  stepDef.data.config.pulseRole,
      label: stepDef.data.label,
      model: agent.model,
      phase: stepDef.data.config.pulsePhase,
      color: stepDef.data.config.avatarColor,
    })

    const userMessage = buildUserMessage(stepId, input, history, {
      feedbackContext,
      stepLabel: stepDef.data.label,
      stepRole:  stepDef.data.config.pulseRole,
      stepPhase: stepDef.data.config.pulsePhase,
    })

    const output = await callAgentStream(
      agent,
      userMessage,
      openrouterKey,
      (token) => emit({ type: 'step:token', stepId, token }),
    )

    history.push({
      stepId,
      role:  stepDef.data.config.pulseRole,
      label: stepDef.data.label,
      phase: stepDef.data.config.pulsePhase,
      output,
    })

    emit({ type: 'step:done', stepId, role: stepDef.data.config.pulseRole, output })
  }
}

// ---------------------------------------------------------------------------
// Execute a collaborative phase (agents alternate for N rounds)
// ---------------------------------------------------------------------------
async function runCollaborativePhase(
  phase:          ExecutionPhase,
  nodes:          PulseStepDef[],
  input:          PulseCampaignInput,
  history:        StepOutput[],
  agents:         AgentConfig[],
  openrouterKey:  string,
  emit:           (event: object) => void,
  cancel:         { cancelled: boolean },
  feedbackContext?: string,
): Promise<void> {
  const isInfinite   = phase.iterationsInfinite ?? false
  const maxRounds    = isInfinite ? (phase.maxIterations ?? 8) : (phase.rounds ?? 1)
  const contextMode  = phase.contextMode ?? 'full'
  const loopRole     = phase.loopRole ?? 'collaborative'
  const stopCond     = phase.stopCondition ?? 'fixed'
  const stopMarker   = phase.stopMarker ?? ''

  const allRoundHistory: StepOutput[] = []  // full history for this phase run

  for (let round = 1; round <= maxRounds; round++) {
    if (cancel.cancelled) return

    emit({ type: 'phase:round-start', phaseId: phase.id, round, totalRounds: isInfinite ? null : maxRounds })

    // For 'last' context mode, only expose the previous round's outputs
    const visibleRoundHistory = contextMode === 'last'
      ? allRoundHistory.slice(-(phase.stepIds.length))
      : allRoundHistory

    let roundConverged = false

    for (const stepId of phase.stepIds) {
      if (cancel.cancelled) return

      const stepDef = nodes.find((s) => s.id === stepId)
      if (!stepDef) continue

      const agent = agents.find((a) => a.id === stepDef.data.config.agentId)
      if (!agent) {
        emit({ type: 'campaign:error', stepId, error: `Agent niet gevonden voor stap: ${stepId}` })
        throw new Error(`Agent niet gevonden: ${stepId}`)
      }

      emit({
        type:        'step:start',
        stepId,
        role:        stepDef.data.config.pulseRole,
        label:       stepDef.data.label,
        model:       agent.model,
        phase:       stepDef.data.config.pulsePhase,
        color:       stepDef.data.config.avatarColor,
        round,
        totalRounds: isInfinite ? null : maxRounds,
      })

      const userMessage = buildUserMessage(stepId, input, history, {
        roundHistory:    visibleRoundHistory,
        round,
        totalRounds:     isInfinite ? 0 : maxRounds,
        feedbackContext,
        loopRole,
        contextMode,
        stepLabel:       stepDef.data.label,
        stepRole:        stepDef.data.config.pulseRole,
        stepPhase:       stepDef.data.config.pulsePhase,
      })

      const output = await callAgentStream(
        agent,
        userMessage,
        openrouterKey,
        (token) => emit({ type: 'step:token', stepId, token }),
      )

      const stepOut: StepOutput = {
        stepId,
        role:  stepDef.data.config.pulseRole,
        label: stepDef.data.label,
        phase: stepDef.data.config.pulsePhase,
        round,
        output,
      }

      allRoundHistory.push(stepOut)
      history.push(stepOut)

      emit({ type: 'step:done', stepId, role: stepDef.data.config.pulseRole, round, output })

      // Check stop conditions for infinite mode
      if (isInfinite) {
        if (stopCond === 'marker' && stopMarker && output.includes(stopMarker)) {
          roundConverged = true
        }
        if (stopCond === 'convergence' && allRoundHistory.length >= phase.stepIds.length * 2) {
          const prev = allRoundHistory.at(-(phase.stepIds.length + 1))?.output ?? ''
          if (prev && output.length > 0 && Math.abs(output.length - prev.length) / Math.max(output.length, 1) < 0.05) {
            roundConverged = true
          }
        }
      }
    }

    emit({ type: 'phase:round-end', phaseId: phase.id, round, totalRounds: isInfinite ? null : maxRounds })

    if (roundConverged) {
      emit({ type: 'phase:converged', phaseId: phase.id, round })
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Main orchestration function — queue-based with feedback loop support
// ---------------------------------------------------------------------------
let activeCampaign: { cancelled: boolean } | null = null

export async function runPulseCampaign(
  input:         PulseCampaignInput,
  stages:        PipelineStages,
  agents:        AgentConfig[],
  openrouterKey: string,
  win:           BrowserWindow,
): Promise<void> {
  const emit = (event: object) => {
    try { win.webContents.send('pulse:event', event) } catch { /* window closed */ }
  }

  const cancel = { cancelled: false }
  activeCampaign = cancel

  const history: StepOutput[] = []
  const feedbackCounts: Record<string, number> = {}

  // Build execution queue from plan
  const queue: Array<{ phase: ExecutionPhase; feedbackContext?: string }> =
    stages.executionPlan.map((phase) => ({ phase }))

  while (queue.length > 0) {
    if (cancel.cancelled) {
      emit({ type: 'campaign:cancelled' })
      return
    }

    const { phase, feedbackContext } = queue.shift()!

    emit({ type: 'phase:start', phaseId: phase.id, label: phase.label, mode: phase.mode })

    try {
      if (phase.mode === 'collaborative') {
        await runCollaborativePhase(
          phase, stages.nodes, input, history, agents, openrouterKey, emit, cancel, feedbackContext,
        )
      } else {
        await runSequentialPhase(
          phase, stages.nodes, input, history, agents, openrouterKey, emit, cancel, feedbackContext,
        )
      }
    } catch {
      return // error was already emitted inside the phase runner
    }

    if (cancel.cancelled) {
      emit({ type: 'campaign:cancelled' })
      return
    }

    emit({ type: 'phase:done', phaseId: phase.id })

    // Handle feedback loop: re-run creative phase with review critique
    if (phase.feedbackTo && (phase.maxFeedback ?? 0) > 0) {
      const count = feedbackCounts[phase.id] ?? 0
      if (count < (phase.maxFeedback ?? 0)) {
        feedbackCounts[phase.id] = count + 1

        // The last step in this review phase produced the feedback
        const reviewOutput = [...history]
          .filter((h) => phase.stepIds.includes(h.stepId))
          .at(-1)?.output ?? ''

        const targetPhase = stages.executionPlan.find((p) => p.id === phase.feedbackTo)
        if (targetPhase) {
          const iteration = feedbackCounts[phase.id]
          const maxIter   = phase.maxFeedback ?? 0
          emit({ type: 'feedback:loop-start', phaseId: phase.id, targetPhaseId: phase.feedbackTo, iteration, maxIterations: maxIter })

          // Re-queue: creative phase with feedback context, then review again
          queue.unshift({ phase })
          queue.unshift({ phase: targetPhase, feedbackContext: reviewOutput })
        }
      }
    }
  }

  emit({ type: 'campaign:complete', history })
  activeCampaign = null
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------
export function registerPulseIPC(
  loadKey:     (name: string) => string | null,
  supabaseUrl: string,
  supabaseKey: string,
): void {

  ipcMain.removeHandler('pulse:start')
  ipcMain.removeHandler('pulse:cancel')
  ipcMain.removeHandler('pulse:status')

  ipcMain.handle('pulse:start', async (_event, input: PulseCampaignInput) => {
    const openrouterKey = loadKey('openrouter')
    if (!openrouterKey) {
      return { ok: false, error: 'OpenRouter API-key niet geconfigureerd. Stel hem in via Instellingen.' }
    }

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false, error: 'Geen venster beschikbaar.' }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: pipelines, error: pipelineErr } = await supabase
      .from('pipelines')
      .select('stages')
      .eq('module', 'pulse')
      .eq('is_active', true)
      .limit(1)

    if (pipelineErr || !pipelines?.length) {
      return { ok: false, error: 'Geen actieve Pulse-pipeline gevonden. Configureer er een in Backstage.' }
    }

    const stages = pipelines[0].stages as PipelineStages

    if (!stages.nodes?.length) {
      return { ok: false, error: 'Pulse-pipeline heeft geen stappen.' }
    }

    if (!stages.executionPlan?.length) {
      return { ok: false, error: 'Pulse-pipeline heeft geen executionPlan. Update de pipeline in Backstage.' }
    }

    // Fetch all agents referenced in the pipeline
    const agentIds = stages.nodes.map((s) => s.data.config.agentId).filter(Boolean)
    const { data: agentRows } = await supabase
      .from('agents')
      .select('id, name, model, system_prompt, temperature, max_tokens')
      .in('id', agentIds)

    if (!agentRows?.length) {
      return { ok: false, error: 'Geen agents gevonden voor de Pulse-pipeline.' }
    }

    console.log(`[pulse] campagne gestart voor: ${input.clientName}`)
    console.log(`[pulse] fasen: ${stages.executionPlan.map((p) => `${p.label}(${p.mode})`).join(' → ')}`)

    runPulseCampaign(input, stages, agentRows as AgentConfig[], openrouterKey, win).catch((err) => {
      console.error('[pulse] onverwachte fout:', err.message)
      try { win.webContents.send('pulse:event', { type: 'campaign:error', error: err.message }) } catch {}
    })

    return { ok: true }
  })

  ipcMain.handle('pulse:cancel', async () => {
    if (activeCampaign) {
      activeCampaign.cancelled = true
      activeCampaign = null
      console.log('[pulse] campagne geannuleerd')
    }
    return { ok: true }
  })

  ipcMain.handle('pulse:status', async () => {
    return { ok: true, running: activeCampaign !== null }
  })
}
