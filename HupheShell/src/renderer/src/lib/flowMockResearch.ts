import type {
  FlowQuestionInput,
  FlowResearchAdapter,
  FlowResearchAnswer,
  FlowResearchStep,
} from './flowTypes'

const STEP_DEFINITIONS: Array<Omit<FlowResearchStep, 'status' | 'detail'>> = [
  {
    id: 'security',
    label: 'Security check',
    description: 'Classificeert de vraag en blokkeert vertrouwelijke data richting extern zoeken.',
  },
  {
    id: 'local-search',
    label: 'Lokaal zoeken',
    description: 'Doorzoekt straks de eigen researchdatabase en lokale documenten.',
  },
  {
    id: 'external-query',
    label: 'Externe query',
    description: 'Maakt een gesanitiseerde zoekvraag zonder interne context.',
  },
  {
    id: 'local-synthesis',
    label: 'Lokale synthese',
    description: 'Combineert interne en externe resultaten binnen de veilige omgeving.',
  },
  {
    id: 'guardrails',
    label: 'Masterdocument check',
    description: 'Toetst het antwoord aan strategische richtlijnen en benchmarks.',
  },
]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createInitialFlowSteps(): FlowResearchStep[] {
  return STEP_DEFINITIONS.map((step) => ({ ...step, status: 'waiting' }))
}

function updateStep(
  steps: FlowResearchStep[],
  id: string,
  status: FlowResearchStep['status'],
  detail?: string,
): FlowResearchStep[] {
  return steps.map((step) => (
    step.id === id ? { ...step, status, detail } : step
  ))
}

export function buildSanitizedExternalQuery(question: string): string {
  return question
    .replace(/\b(klant|client|project)\s*[:=]\s*[^\n,.]+/gi, '$1: [verwijderd]')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(value: string, terms: string[]): boolean {
  const lower = value.toLowerCase()
  return terms.some((term) => lower.includes(term))
}

function buildDemoFocus(question: string) {
  const isSmoking = includesAny(question, ['rook', 'roken', 'sigaret', 'vapen', 'nicotine'])
  const isYouth = includesAny(question, ['jongeren', 'tieners', 'studenten', 'scholieren'])
  const isBehavior = includesAny(question, ['gedrag', 'aanspreken', 'motiveren', 'stoppen', 'veranderen'])

  const topic = isSmoking
    ? 'minder roken'
    : isBehavior
      ? 'gedragsverandering'
      : 'strategische communicatie'

  const audience = isYouth ? 'jongeren' : 'de doelgroep'

  return { audience, isSmoking, isYouth, topic }
}

function buildDemoRecommendations(input: FlowQuestionInput): string[] {
  const focus = buildDemoFocus(input.question)
  const recommendations = [
    `Maak de boodschap concreet voor ${focus.audience}: welk klein gedrag moet vandaag makkelijker worden?`,
    'Gebruik positieve framing: benadruk autonomie, haalbare winst en steun in plaats van schuld of schaamte.',
    'Scheid interne inzichten, externe literatuur en de uiteindelijke synthese zichtbaar van elkaar voordat een strateeg dit goedkeurt.',
  ]

  if (focus.isSmoking) {
    recommendations.splice(
      1,
      0,
      'Positioneer stoppen of minderen als een haalbare stap richting meer vrijheid, energie of controle, niet als moreel oordeel.',
    )
  }

  if (focus.isYouth) {
    recommendations.push('Test taal, kanalen en voorbeelden met jongeren zelf voordat je de campagne richting definitieve strategie brengt.')
  }

  return recommendations
}

function buildDemoSummary(input: FlowQuestionInput): string {
  const focus = buildDemoFocus(input.question)

  return [
    `Demo-run voor een vraag over ${focus.topic}.`,
    'Flow laat hier de beoogde werkwijze zien: eerst veilig classificeren, daarna lokale kennis ophalen, vervolgens een gesanitiseerde externe researchvraag maken en de synthese lokaal toetsen aan het masterdocument.',
    'De inhoud hieronder is testmateriaal om de ervaring te beoordelen. Er is nog geen echte interne database, lokale AI of externe research-agent gekoppeld.',
  ].join(' ')
}

export const mockFlowResearchAdapter: FlowResearchAdapter = {
  async run(input: FlowQuestionInput, onStepUpdate) {
    let steps = createInitialFlowSteps()
    onStepUpdate(steps)

    steps = updateStep(steps, 'security', 'active', 'Vraag geclassificeerd als strategische researchvraag.')
    onStepUpdate(steps)
    await wait(350)
    steps = updateStep(steps, 'security', 'done', 'Geen vertrouwelijke data naar externe research.')
    onStepUpdate(steps)

    steps = updateStep(steps, 'local-search', 'active', 'Mock: lokale bronnen worden straks via local RAG opgehaald.')
    onStepUpdate(steps)
    await wait(500)
    steps = updateStep(steps, 'local-search', 'done', '2 interne bronplaatsen voorbereid als placeholder.')
    onStepUpdate(steps)

    const sanitizedQuery = buildSanitizedExternalQuery(input.question)
    steps = updateStep(steps, 'external-query', 'active', sanitizedQuery)
    onStepUpdate(steps)
    await wait(450)
    steps = updateStep(steps, 'external-query', 'done', 'Externe research-adapter nog niet gekoppeld.')
    onStepUpdate(steps)

    steps = updateStep(steps, 'local-synthesis', 'active', 'Lokale synthese wordt gesimuleerd zonder externe API-call.')
    onStepUpdate(steps)
    await wait(500)
    steps = updateStep(steps, 'local-synthesis', 'done', 'Antwoord opgebouwd uit placeholder-bronnen.')
    onStepUpdate(steps)

    steps = updateStep(steps, 'guardrails', 'active', `Getoetst tegen ${input.masterDocumentVersion || 'masterdocument v0'}.`)
    onStepUpdate(steps)
    await wait(350)
    steps = updateStep(steps, 'guardrails', 'done', 'Richting past bij positief communiceren.')
    onStepUpdate(steps)

    const recommendations = buildDemoRecommendations(input)

    const answer: FlowResearchAnswer = {
      id: makeId('flow-answer'),
      title: input.question,
      summary: buildDemoSummary(input),
      recommendations,
      uncertainties: [
        'Nog geen echte lokale researchdatabase gekoppeld.',
        'Nog geen externe research-agent gekoppeld.',
        'Nog geen definitieve bewijsweging of menselijke goedkeuring.',
      ],
      sources: [
        {
          id: 'internal-placeholder-1',
          title: 'Demo interne researchdatabase',
          kind: 'internal',
          classification: 'client_confidential',
          evidenceLevel: 'unknown',
          excerpt: 'Testbron voor lokale RAG-resultaten. In de echte versie blijft deze data lokaal en wordt die niet extern meegestuurd.',
        },
        {
          id: 'external-placeholder-1',
          title: 'Demo externe researchscan',
          kind: 'external',
          classification: 'external',
          evidenceLevel: 'unknown',
          excerpt: `Testbron voor publieke research op basis van de gesanitiseerde query: "${sanitizedQuery}".`,
        },
        {
          id: 'master-placeholder-1',
          title: `${input.masterDocumentVersion || 'Masterdocument'} demo-check`,
          kind: 'master_document',
          classification: 'approved_conclusion',
          evidenceLevel: 'medium',
          excerpt: 'Demo-guardrail: positief communiceren, geen schuld of schaamte als primaire motivator.',
        },
      ],
      guardrails: [
        {
          id: 'positive-communication',
          label: 'Positief communiceren',
          status: 'passed',
          note: 'Het advies vermijdt schuld en stuurt op haalbare, positieve gedragsstappen.',
          sourceIds: ['master-placeholder-1'],
        },
        {
          id: 'source-separation',
          label: 'Bronnen gescheiden houden',
          status: 'passed',
          note: 'Interne, externe en synthese-informatie worden apart gelabeld.',
        },
      ],
      auditTrail: [
        { label: 'Vraag', value: input.question },
        { label: 'Klant/context', value: input.clientContext?.trim() || 'Niet opgegeven' },
        { label: 'Externe query', value: sanitizedQuery || 'Niet gemaakt' },
        { label: 'Masterdocument', value: input.masterDocumentVersion || 'Niet gekoppeld' },
        { label: 'Status', value: 'Mock-run, geen database of externe API gebruikt' },
      ],
    }

    return answer
  },
}
