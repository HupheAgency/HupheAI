import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Panel,
  useNodesState, useEdgesState, addEdge,
  BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow,
  Handle, Position, BackgroundVariant,
  type Connection, type NodeProps, type EdgeProps, type Node as FlowNode, type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import logo from '../assets/logo.png'
import { supabase } from '../lib/supabase'
import { Toggle } from '../components/Toggle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Department { id: string; name: string; created_at: string }

interface Agent {
  id: string; name: string; description: string; model: string
  modality: 'text' | 'image'; system_prompt: string; temperature: number
  max_tokens: number; avatar_color: string; department_id: string | null
  created_at: string; updated_at: string
}

interface WFNodeData extends Record<string, unknown> {
  subtype: string
  label: string
  config: Record<string, unknown>
}

type WFNode = FlowNode<WFNodeData>
type WFEdge = Edge

// Collaboration node types
interface CollaborationMember {
  nodeId:  string
  agentId: string
  label:   string
  color:   string
}

interface CollaborationConfig {
  iterations?:     number      // 0 = infinite, 1-6 = fixed (default 2)
  maxIterations?:  number      // cap for infinite mode (default 8)
  loopRole?:       'collaborative' | 'critique' | 'consensus'
  contextMode?:    'full' | 'last'
  stopCondition?:  'fixed' | 'marker' | 'convergence'
  stopMarker?:     string
  outputMode?:     'last' | 'all' | 'synthesis'
  members?:        CollaborationMember[]
}

// Execution plan phase (kept in stages for orchestrator use)
interface ExecutionPhase {
  id:                 string
  label:              string
  mode:               'sequential' | 'collaborative'
  stepIds:            string[]
  rounds?:            number
  iterationsInfinite?: boolean
  maxIterations?:     number
  contextMode?:       'full' | 'last'
  loopRole?:          'collaborative' | 'critique' | 'consensus'
  outputMode?:        'last' | 'all' | 'synthesis'
  stopCondition?:     'fixed' | 'marker' | 'convergence'
  stopMarker?:        string
  feedbackTo?:        string
  maxFeedback?:       number
  condition?:         Record<string, unknown>
}

type PulsePhaseId =
  | 'intake'
  | 'debrief'
  | 'strategie'
  | 'creative-direction'
  | 'concepting'
  | 'internal-review'
  | 'presentation-selection'
  | 'design'
  | 'delivery'

interface Pipeline {
  id: string; name: string; module: string; description: string
  is_active: boolean; nodes: WFNode[]; edges: WFEdge[]
  executionPlan: ExecutionPhase[]
  created_at: string; updated_at: string
}

interface PipelineRun {
  id: string; status: 'running' | 'completed' | 'failed'
  error: string | null; started_at: string; completed_at: string | null
}

interface ORouterModel {
  id: string
  name: string
  architecture?: { modality?: string; output_modalities?: string[] }
}

type Selection = { type: 'agent'; id: string } | { type: 'pipeline'; id: string } | null

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6',
  '#ef4444', '#f97316', '#ec4899', '#06b6d4',
]

const PULSE_PHASES: Array<{ value: PulsePhaseId; label: string }> = [
  { value: 'intake',                 label: 'Fase 1 · Intake' },
  { value: 'debrief',                label: 'Fase 2 · Debrief' },
  { value: 'strategie',              label: 'Fase 3 · Strategie' },
  { value: 'creative-direction',     label: 'Fase 4 · Creative Direction' },
  { value: 'concepting',             label: 'Fase 5 · Concepting' },
  { value: 'internal-review',        label: 'Fase 6 · Interne Review' },
  { value: 'presentation-selection', label: 'Fase 7 · Presentatie & Selectie' },
  { value: 'design',                 label: 'Fase 8 · Design' },
  { value: 'delivery',               label: 'Fase 9 · Oplevering' },
]

const PULSE_ROLE_PRESETS = [
  'Account Director',
  'Project Manager',
  'Merkstrateeg',
  'Gedragswetenschapper',
  'Strategy Director',
  'Creative Director',
  'Art Director',
  'Copywriter',
  'Designer',
]

// OpenRouter biedt beeldmodellen aan via ?output_modalities=image.
// We halen ze dynamisch op — geen hardcoded lijst meer nodig.

const TOOL_NODES = [
  { subtype: 'trigger',              label: 'Trigger',               icon: '⚡', description: 'Start van de flow' },
  { subtype: 'pulse-inbox',          label: 'Pulse Inbox',           icon: '▣',  description: 'Opgemaakte klantpagina' },
  { subtype: 'client-approval-gate', label: 'Client Approval Gate',  icon: '✓',  description: 'Pauzeer voor klantreview' },
  { subtype: 'feedback-loop',        label: 'Feedback Loop',         icon: '↩',  description: 'Vertaal feedback naar revisies' },
  { subtype: 'route-selection',      label: 'Route selectie',        icon: '◆',  description: 'Klant kiest winnende route' },
  { subtype: 'learning-capture',     label: 'Learning capture',      icon: '◎',  description: 'Sla klantvoorkeuren op' },
  { subtype: 'presentation-builder', label: 'Presentatie bouw',      icon: '▤',  description: 'Plaats content in template' },
  { subtype: 'asset-generation',     label: 'Asset generatie',       icon: '✦',  description: 'Genereer finale assets' },
  { subtype: 'notification',         label: 'Slack / Teams',         icon: '🔔', description: 'Mijlpaalbericht sturen' },
  { subtype: 'multi-format-export',  label: 'Multi-format export',   icon: '⇩',  description: 'Keynote, PDF en beelden exporteren' },
  { subtype: 'stock-image-search',   label: 'Stock image fallback',  icon: '⌕',  description: 'Zoek stockbeeld bij beeldfalen' },
  { subtype: 'output-image',         label: 'Afbeelding op slide',   icon: '🖼', description: 'Afbeelding laden op slide' },
  { subtype: 'output-text',          label: 'Tekst op slide',        icon: '✏',  description: 'Tekst laden op slideveld' },
  { subtype: 'output-mdtext',        label: 'Markdown output',       icon: '📄', description: 'Teruggeven als mdText' },
]

const UTILITY_NODES = [
  { subtype: 'intake-questionnaire', label: 'Intake vragenlijst', icon: '??', description: 'Required en nice-to-have vragen' },
  { subtype: 'parallel-worksession', label: 'Parallelle sessie',  icon: '||', description: 'Strategen of teams tegelijk laten werken' },
  { subtype: 'route-config',         label: 'Route configuratie', icon: '#',  description: 'Aantal routes en selectiegrenzen' },
  { subtype: 'thinking-loader',      label: 'Thinking loader',    icon: '…',  description: 'Klant ziet voortgangstekst' },
  { subtype: 'style-context',    label: 'Stijl context',    icon: '◐',  description: 'Brand voice en beeldstijl' },
  { subtype: 'context-loader',   label: 'Context loader',   icon: '↥',  description: 'Briefings en guidelines laden' },
  { subtype: 'translator',       label: 'Translator',       icon: '文', description: 'Campagnecontent vertalen' },
  { subtype: 'smart-cropping',   label: 'Smart cropping',   icon: '⌗',  description: 'Uitsnede op gezicht/object' },
  { subtype: 'versioning',       label: 'Versioning',       icon: 'v1', description: 'Conceptsnapshot opslaan' },
  { subtype: 'condition',        label: 'IF / THEN',        icon: '?',  description: 'Conditionele routering' },
  { subtype: 'to-html',          label: 'Naar HTML',        icon: '</>',description: 'Markdown → HTML' },
  { subtype: 'combine',          label: 'Combineer',        icon: '+',  description: 'Voeg teksten samen' },
  { subtype: 'template',         label: 'Template',         icon: '{}', description: 'Tekst met {{vars}}' },
  { subtype: 'trim',             label: 'Inkorten',         icon: '✂',  description: 'Beperk tekstlengte' },
  { subtype: 'image-brightness', label: 'Belichting',       icon: '☀',  description: 'Belichting aanpassen' },
  { subtype: 'image-3d',         label: 'Maak 3D',          icon: '◈',  description: '3D effect toepassen' },
  { subtype: 'image-remove-bg',  label: 'Achtergrond weg',  icon: '⬜', description: 'Achtergrond verwijderen' },
]

const IMAGE_PLACEHOLDER_UTILS = new Set(['image-brightness', 'image-3d', 'image-remove-bg'])

// ── Custom Node Components ────────────────────────────────────────────────────

function AgentNodeComponent({ data, selected }: NodeProps) {
  const d = data as WFNodeData
  const color = (d.config.avatarColor as string) ?? '#f59e0b'
  const desc = (d.config.agentDescription as string) ?? ''
  const modality = (d.config.modality as string) ?? 'text'
  const isImage = modality === 'image'
  const outColor = isImage ? 'rgba(167,139,250,0.55)' : 'rgba(96,165,250,0.55)'
  const outBorder = isImage ? 'rgba(167,139,250,0.3)' : 'rgba(96,165,250,0.3)'
  return (
    <div className={`relative w-56 rounded-xl border shadow-xl transition-all ${selected ? 'border-amber-400/60' : 'border-white/[0.1]'}`} style={{ background: '#161616' }}>

      {/* Handles */}
      <Handle type="target" position={Position.Left} id="input"
        style={{ top: '38%', background: 'rgba(250,204,21,0.55)', border: '1.5px solid rgba(250,204,21,0.3)', width: 9, height: 9 }} />
      <Handle type="target" position={Position.Left} id="stijl"
        style={{ top: '72%', background: 'rgba(167,139,250,0.6)', border: '1.5px solid rgba(167,139,250,0.3)', width: 9, height: 9 }} />
      <Handle type="source" position={Position.Right} id="output"
        style={{ top: '50%', background: outColor, border: `1.5px solid ${outBorder}`, width: 9, height: 9 }} />

      {/* Naam + beschrijving */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold text-black" style={{ background: color }}>
          {d.label[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-white/90 text-xs font-semibold truncate">{d.label}</p>
          {desc && <p className="text-white/30 text-[10px] truncate">{desc}</p>}
        </div>
      </div>

      {/* Handle labels */}
      <div className="flex items-center justify-between px-2.5 pb-2 border-t border-white/[0.04] mt-0.5 pt-1.5">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-white/35 leading-none">↙ in</span>
          <span className="text-[9px] text-purple-400/70 leading-none">↙ stijl</span>
        </div>
        <span className={`text-[9px] leading-none ${isImage ? 'text-purple-400/60' : 'text-blue-400/60'}`}>
          {isImage ? 'beeld ↗' : 'tekst ↗'}
        </span>
      </div>
    </div>
  )
}

function ToolNodeComponent({ data, selected }: NodeProps) {
  const d = data as WFNodeData
  const catalog = TOOL_NODES.find(n => n.subtype === d.subtype)
  const isTrigger = d.subtype === 'trigger'
  const isOutput = d.subtype.startsWith('output-')
  const btnLabel = (d.config.buttonLabel as string) ?? ''
  return (
    <div className={`w-48 rounded-xl border shadow-xl transition-all ${selected ? 'border-amber-400/60' : 'border-amber-500/20'}`} style={{ background: '#161610' }}>
      {!isTrigger && <Handle type="target" position={Position.Left} id="input" style={{ background: 'rgba(250,204,21,0.5)', border: 'none', width: 10, height: 10 }} />}
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-sm bg-amber-500/10 text-amber-400">
          {catalog?.icon}
        </div>
        <div className="min-w-0">
          <p className="text-amber-300/90 text-xs font-semibold truncate">{d.label}</p>
          {btnLabel && <p className="text-amber-400/40 text-[10px] truncate">{btnLabel}</p>}
          {!btnLabel && catalog && <p className="text-white/25 text-[10px] truncate">{catalog.description}</p>}
        </div>
      </div>
      {!isOutput && <Handle type="source" position={Position.Right} id="output" style={{ background: 'rgba(250,204,21,0.5)', border: 'none', width: 10, height: 10 }} />}
    </div>
  )
}

function UtilityNodeComponent({ data, selected }: NodeProps) {
  const d = data as WFNodeData
  const catalog = UTILITY_NODES.find(n => n.subtype === d.subtype)
  const isImagePlaceholder = IMAGE_PLACEHOLDER_UTILS.has(d.subtype)
  return (
    <div className={`w-48 rounded-xl border shadow-xl transition-all ${selected ? 'border-amber-400/60' : 'border-purple-500/20'}`} style={{ background: '#130f1e' }}>
      <Handle type="target" position={Position.Left} id="input" style={{ background: 'rgba(167,139,250,0.6)', border: 'none', width: 10, height: 10 }} />
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-sm bg-purple-500/10 text-purple-400">
          {catalog?.icon}
        </div>
        <div className="min-w-0">
          <p className="text-purple-300/90 text-xs font-semibold truncate">{d.label}</p>
          <p className="text-white/25 text-[10px] truncate">{isImagePlaceholder ? 'Binnenkort' : (catalog?.description ?? '')}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="output" style={{ background: 'rgba(167,139,250,0.6)', border: 'none', width: 10, height: 10 }} />
    </div>
  )
}

const LOOP_ROLE_COLORS: Record<string, string> = {
  collaborative: '#06b6d4',
  critique:      '#f97316',
  consensus:     '#8b5cf6',
}

function CollaborationNodeComponent({ data, selected }: NodeProps) {
  const d      = data as WFNodeData
  const cfg    = (d.config ?? {}) as CollaborationConfig
  const iters  = cfg.iterations === 0 ? '∞' : String(cfg.iterations ?? 2)
  const role   = cfg.loopRole ?? 'collaborative'
  const color  = LOOP_ROLE_COLORS[role] ?? '#06b6d4'
  const members = cfg.members ?? []

  const roleLabel: Record<string, string> = {
    collaborative: 'Samen',
    critique:      'Feedback',
    consensus:     'Consensus',
  }

  return (
    <div
      className={`w-52 rounded-xl border shadow-xl transition-all ${selected ? 'border-cyan-400/60' : 'border-cyan-500/20'}`}
      style={{ background: '#0c1a1f' }}
    >
      <Handle type="target" position={Position.Left} id="input" style={{ background: 'rgba(6,182,212,0.5)', border: 'none', width: 10, height: 10 }} />
      <div className="px-3 pt-2.5 pb-2">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: `${color}20`, color }}>
            ↺
          </div>
          <p className="text-white/90 text-xs font-semibold truncate flex-1">{d.label}</p>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-semibold flex-shrink-0" style={{ background: `${color}20`, color }}>
            {iters === '∞' ? `∞/${cfg.maxIterations ?? 8}` : `×${iters}`}
          </span>
        </div>

        {/* Mode badge */}
        <div className="mb-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium" style={{ borderColor: `${color}30`, color, background: `${color}10` }}>
            {roleLabel[role] ?? role}
          </span>
          {cfg.contextMode === 'last' && (
            <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/30">
              kort geheugen
            </span>
          )}
        </div>

        {/* Member avatars + add button */}
        <div className="flex items-center gap-1 flex-wrap">
          {members.length === 0 && (
            <span className="text-white/20 text-[10px]">Geen leden — configureer</span>
          )}
          {members.map((m) => (
            <div
              key={m.nodeId}
              className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-black"
              style={{ background: m.color }}
              title={m.label}
            >
              {m.label?.[0]?.toUpperCase()}
            </div>
          ))}
          {members.length < 6 && (
            <div className="w-5 h-5 rounded-md border border-dashed flex items-center justify-center text-[10px] text-white/20" style={{ borderColor: `${color}40` }}>
              +
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="output" style={{ background: 'rgba(6,182,212,0.5)', border: 'none', width: 10, height: 10 }} />
    </div>
  )
}

function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() => setEdges((eds) => eds.filter((e) => e.id !== id))}
            className="w-4 h-4 rounded-full flex items-center justify-center transition-all opacity-0 hover:opacity-100 group-hover:opacity-100"
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)' }}
            onMouseEnter={(e) => { (e.currentTarget.style.borderColor = 'rgba(248,113,113,0.5)'); (e.currentTarget.style.color = '#f87171') }}
            onMouseLeave={(e) => { (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'); (e.currentTarget.style.color = 'rgba(255,255,255,0.4)') }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <line x1="1" y1="4" x2="7" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

// Must be defined outside component for React Flow performance
const edgeTypes = { deletable: DeletableEdge }

const nodeTypes = {
  agentNode:          AgentNodeComponent,
  toolNode:           ToolNodeComponent,
  utilityNode:        UtilityNodeComponent,
  collaborationNode:  CollaborationNodeComponent,
}

// ── BackstagePage ─────────────────────────────────────────────────────────────

export default function BackstagePage({ onBack }: { onBack: () => void }) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [editedAgent, setEditedAgent] = useState<Agent | null>(null)
  const [editedPipeline, setEditedPipeline] = useState<Pipeline | null>(null)
  const [models, setModels] = useState<ORouterModel[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set())
  const [addingDept, setAddingDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')

  async function fetchDepartments() {
    if (!supabase) return
    const { data } = await supabase.from('departments').select('*').order('name')
    if (data) setDepartments(data as Department[])
  }

  async function fetchAgents() {
    if (!supabase) return
    const { data } = await supabase.from('agents').select('*').order('created_at')
    if (data) setAgents(data as Agent[])
  }

  async function fetchPipelines() {
    if (!supabase) return
    const { data } = await supabase.from('pipelines').select('*').order('created_at')
    if (data) {
      const parsed = (data as any[]).map((p) => {
        const raw = p.stages
        const isGraph = raw && !Array.isArray(raw) && Array.isArray(raw.nodes)
        return {
          ...p,
          nodes:         isGraph ? raw.nodes        : [],
          edges:         isGraph ? raw.edges  ?? [] : [],
          executionPlan: isGraph ? raw.executionPlan ?? [] : [],
        } as Pipeline
      })
      setPipelines(parsed)
    }
  }

  async function fetchModels() {
    setLoadingModels(true)
    setModelsError(null)
    try {
      // Haal tekst- én beeldmodellen parallel op.
      // OpenRouter ondersteunt ?output_modalities=image voor beeldmodellen.
      const [textRes, imageRes] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/models'),
        fetch('https://openrouter.ai/api/v1/models?output_modalities=image'),
      ])
      if (!textRes.ok) throw new Error(`HTTP ${textRes.status}`)
      const textJson = await textRes.json()
      const textList = (textJson.data ?? []) as ORouterModel[]
      let imageList: ORouterModel[] = []
      if (imageRes.ok) {
        const imageJson = await imageRes.json()
        imageList = (imageJson.data ?? []) as ORouterModel[]
      }
      // Merge beide lijsten en dedupleer op id.
      // Beeldmodellen staan vooraan zodat ze prominent in de picker verschijnen.
      const seen = new Set<string>()
      const merged: ORouterModel[] = []
      for (const m of [...imageList, ...textList]) {
        if (!seen.has(m.id)) { seen.add(m.id); merged.push(m) }
      }
      if (merged.length === 0) throw new Error('Lege lijst ontvangen')
      setModels(merged)
    } catch (e) {
      setModelsError(String(e))
    } finally {
      setLoadingModels(false)
    }
  }

  async function fetchRuns(pipelineId: string) {
    if (!supabase) return
    setLoadingRuns(true)
    const { data } = await supabase
      .from('pipeline_runs').select('id, status, error, started_at, completed_at')
      .eq('pipeline_id', pipelineId).order('started_at', { ascending: false }).limit(20)
    setRuns((data as PipelineRun[]) ?? [])
    setLoadingRuns(false)
  }

  useEffect(() => {
    fetchDepartments(); fetchAgents(); fetchPipelines(); fetchModels()
  }, [])

  useEffect(() => {
    if (!selection) { setEditedAgent(null); setEditedPipeline(null); setRuns([]); return }
    if (selection.type === 'agent') {
      const a = agents.find((a) => a.id === selection.id)
      setEditedAgent(a ? structuredClone(a) : null)
      setEditedPipeline(null)
    } else {
      const p = pipelines.find((p) => p.id === selection.id)
      setEditedPipeline(p ? structuredClone(p) : null)
      setEditedAgent(null)
      fetchRuns(selection.id)
    }
  }, [selection, agents.length, pipelines.length])

  // ── Departments ──────────────────────────────────────────────────────────

  async function createDepartment() {
    if (!supabase || !newDeptName.trim()) return
    await supabase.from('departments').insert({ name: newDeptName.trim() })
    await fetchDepartments(); setNewDeptName(''); setAddingDept(false)
  }

  async function deleteDepartment(id: string) {
    if (!supabase) return
    await supabase.from('departments').delete().eq('id', id)
    await fetchDepartments()
  }

  function toggleDept(id: string) {
    setCollapsedDepts((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  // ── Agents ───────────────────────────────────────────────────────────────

  async function addAgent(departmentId?: string | null) {
    if (!supabase) return
    const defaultModel = models.find(m => inferModalityFromId(m.id) === 'text')?.id || 'openai/gpt-4o'
    const { data } = await supabase.from('agents').insert({
      name: 'Nieuwe agent', description: '', model: defaultModel,
      modality: 'text', system_prompt: '', temperature: 0.4, max_tokens: 2048,
      avatar_color: AVATAR_COLORS[agents.length % AVATAR_COLORS.length],
      department_id: departmentId ?? null,
    }).select().single()
    if (data) { await fetchAgents(); setSelection({ type: 'agent', id: (data as Agent).id }) }
  }

  async function saveAgent() {
    if (!supabase || !editedAgent) return
    setSaving(true)
    await supabase.from('agents').update({
      name: editedAgent.name, description: editedAgent.description, model: editedAgent.model,
      modality: editedAgent.modality, system_prompt: editedAgent.system_prompt,
      temperature: editedAgent.temperature, max_tokens: editedAgent.max_tokens,
      avatar_color: editedAgent.avatar_color, department_id: editedAgent.department_id,
      updated_at: new Date().toISOString(),
    }).eq('id', editedAgent.id)
    await fetchAgents(); setSaving(false)
  }

  // ── Pipelines ────────────────────────────────────────────────────────────

  async function addPipeline() {
    if (!supabase) return
    const { data } = await supabase.from('pipelines').insert({
      name: 'Nieuwe pipeline', module: 'atelier', description: '', is_active: false,
      stages: { nodes: [], edges: [] },
    }).select().single()
    if (data) { await fetchPipelines(); setSelection({ type: 'pipeline', id: (data as any).id }) }
  }

  async function seedPulsePipeline() {
    if (!supabase) return
    setSaving(true)
    try {
      // 1. Zorg dat de agents bestaan
      const agencyAgents = [
        { name: 'Account Director', role: 'Account Director', color: '#f59e0b', prompt: 'Jij bent de Account Director van Pulse. Jouw doel is een perfecte intake...' },
        { name: 'Project Manager', role: 'Project Manager', color: '#10b981', prompt: 'Jij bent de Project Manager. Vertaal de briefing naar een strakke debrief...' },
        { name: 'Merkstrateeg', role: 'Merkstrateeg', color: '#8b5cf6', prompt: 'Jij bent de Merkstrateeg. Focus op positionering en "the big idea"...' },
        { name: 'Gedragswetenschapper', role: 'Gedragswetenschapper', color: '#3b82f6', prompt: 'Jij bent de Gedragswetenschapper. Analyseer consumentengedrag en bias...' },
        { name: 'Strategy Director', role: 'Strategy Director', color: '#6366f1', prompt: 'Jij bent de Strategy Director. Smeed de verschillende strategieën samen...' },
        { name: 'Creative Director', role: 'Creative Director', color: '#ef4444', prompt: 'Jij bent de Creative Director. Bewaak de creatieve kwaliteit en haakjes...' },
        { name: 'Art Director', role: 'Art Director', color: '#f97316', prompt: 'Jij bent de Art Director. Focus op de visuele route en beeldtaal...' },
        { name: 'Copywriter', role: 'Copywriter', color: '#ec4899', prompt: 'Jij bent de Copywriter. Focus op de tone-of-voice en sterke copy...' },
        { name: 'Designer', role: 'Designer', color: '#06b6d4', prompt: 'Jij bent de Designer. Focus op de visuele uitwerking en perfectie...' },
      ]

      const agentMap = new Map<string, string>()
      for (const a of agencyAgents) {
        const existing = agents.find(ea => ea.name === a.name)
        if (existing) {
          agentMap.set(a.role, existing.id)
        } else {
          const { data } = await supabase.from('agents').insert({
            name: a.name, description: `Pulse ${a.role}`, model: 'openai/gpt-4o',
            modality: 'text', system_prompt: a.prompt, avatar_color: a.color,
            temperature: 0.7, max_tokens: 2048
          }).select().single()
          if (data) agentMap.set(a.role, (data as any).id)
        }
      }
      await fetchAgents()

      // 2. Definieer de nodes
      const nodes: WFNode[] = [
        { id: 'n1', type: 'toolNode', position: { x: 0, y: 250 }, data: { subtype: 'trigger', label: 'Start Pulse Intake', config: {} } },
        { id: 'n2', type: 'utilityNode', position: { x: 250, y: 100 }, data: { subtype: 'context-loader', label: 'Intake Vragenlijst', config: { fileType: 'JSON', source: 'local' } } },
        { id: 'n3', type: 'agentNode', position: { x: 250, y: 250 }, data: { subtype: 'agent', label: 'Account Director', config: { agentId: agentMap.get('Account Director'), pulseRole: 'Account Director', pulsePhase: 'intake' } } },
        { id: 'n4', type: 'agentNode', position: { x: 550, y: 250 }, data: { subtype: 'agent', label: 'Project Manager', config: { agentId: agentMap.get('Project Manager'), pulseRole: 'Project Manager', pulsePhase: 'debrief' } } },
        { id: 'n5', type: 'toolNode', position: { x: 850, y: 250 }, data: { subtype: 'client-approval-gate', label: 'Debrief Akkoord', config: { approver: 'Klant', channel: 'huphe-app', format: 'in-app-page' } } },
        { id: 'n6', type: 'agentNode', position: { x: 1150, y: 100 }, data: { subtype: 'agent', label: 'Merkstrateeg', config: { agentId: agentMap.get('Merkstrateeg'), pulseRole: 'Merkstrateeg', pulsePhase: 'strategy' } } },
        { id: 'n7', type: 'agentNode', position: { x: 1150, y: 400 }, data: { subtype: 'agent', label: 'Gedragswetenschapper', config: { agentId: agentMap.get('Gedragswetenschapper'), pulseRole: 'Gedragswetenschapper', pulsePhase: 'strategy' } } },
        { id: 'n8', type: 'agentNode', position: { x: 1450, y: 250 }, data: { subtype: 'agent', label: 'Strategy Director', config: { agentId: agentMap.get('Strategy Director'), pulseRole: 'Strategy Director', pulsePhase: 'strategy-synthesis' } } },
        { id: 'n9', type: 'agentNode', position: { x: 1750, y: 250 }, data: { subtype: 'agent', label: 'Creative Director', config: { agentId: agentMap.get('Creative Director'), pulseRole: 'Creative Director', pulsePhase: 'creative-direction' } } },
        { id: 'n10', type: 'agentNode', position: { x: 2050, y: 100 }, data: { subtype: 'agent', label: 'Team 1 (Art+Copy)', config: { agentId: agentMap.get('Art Director'), pulseRole: 'Team 1', pulsePhase: 'concepting' } } },
        { id: 'n11', type: 'agentNode', position: { x: 2050, y: 400 }, data: { subtype: 'agent', label: 'Team 2 (Art+Copy)', config: { agentId: agentMap.get('Art Director'), pulseRole: 'Team 2', pulsePhase: 'concepting' } } },
        { id: 'n12', type: 'toolNode', position: { x: 2350, y: 250 }, data: { subtype: 'route-selection', label: 'Concept Keuze', config: { optionsCount: 3, selectionCount: 1 } } },
        { id: 'n13', type: 'agentNode', position: { x: 2650, y: 250 }, data: { subtype: 'agent', label: 'Designer', config: { agentId: agentMap.get('Designer'), pulseRole: 'Designer', pulsePhase: 'production' } } },
        { id: 'n14', type: 'toolNode', position: { x: 2950, y: 250 }, data: { subtype: 'multi-format-export', label: 'Finale Oplevering', config: { formats: ['keynote', 'pdf', 'images'] } } },
      ]

      const edges: WFEdge[] = [
        { id: 'e1-3', source: 'n1', target: 'n3' },
        { id: 'e2-3', source: 'n2', target: 'n3' },
        { id: 'e3-4', source: 'n3', target: 'n4' },
        { id: 'e4-5', source: 'n4', target: 'n5' },
        { id: 'e5-6', source: 'n5', target: 'n6' },
        { id: 'e5-7', source: 'n5', target: 'n7' },
        { id: 'e6-8', source: 'n6', target: 'n8' },
        { id: 'e7-8', source: 'n7', target: 'n8' },
        { id: 'e8-9', source: 'n8', target: 'n9' },
        { id: 'e9-10', source: 'n9', target: 'n10' },
        { id: 'e9-11', source: 'n9', target: 'n11' },
        { id: 'e10-12', source: 'n10', target: 'n12' },
        { id: 'e11-12', source: 'n11', target: 'n12' },
        { id: 'e12-13', source: 'n12', target: 'n13' },
        { id: 'e13-14', source: 'n13', target: 'n14' },
      ]

      const executionPlan = generateExecutionPlan(nodes, edges, [])

      // 3. Insert de pipeline
      const { data: pData } = await supabase.from('pipelines').insert({
        name: 'Pulse: Full Service (Auto-setup)', module: 'pulse',
        description: 'De volledige 9-fase bureau workflow.', is_active: true,
        stages: { nodes, edges, executionPlan }
      }).select().single()

      if (pData) {
        await fetchPipelines()
        setSelection({ type: 'pipeline', id: (pData as any).id })
        alert('✨ Pulse: Full Service pipeline succesvol opgezet!')
      }
    } catch (e) {
      console.error(e)
      alert('Fout bij het opzetten van de pipeline.')
    } finally {
      setSaving(false)
    }
  }

  async function savePipeline(p: Pipeline) {
    if (!supabase) return
    setSaving(true)
    const executionPlan = generateExecutionPlan(p.nodes, p.edges, p.executionPlan ?? [])
    await supabase.from('pipelines').update({
      name: p.name, module: p.module, description: p.description, is_active: p.is_active,
      stages: { nodes: p.nodes, edges: p.edges, executionPlan },
      updated_at: new Date().toISOString(),
    }).eq('id', p.id)
    await fetchPipelines(); setSaving(false)
  }

  function generateExecutionPlan(nodes: WFNode[], edges: WFEdge[], existingPlan: ExecutionPhase[]): ExecutionPhase[] {
    const collabNodes = nodes.filter((n) => n.type === 'collaborationNode')
    const collabMemberIds = new Set<string>()
    for (const collab of collabNodes) {
      const cfg = (collab.data.config ?? {}) as CollaborationConfig
      ;(cfg.members ?? []).forEach((m) => collabMemberIds.add(m.nodeId))
    }

    const standaloneAgents = orderNodesByEdges(
      nodes.filter((n) => n.type === 'agentNode' && !collabMemberIds.has(n.id)),
      edges,
    )

    const plan: ExecutionPhase[] = []

    const agentsByPhase = new Map<string, WFNode[]>()
    for (const agent of standaloneAgents) {
      const phase = (agent.data.config.pulsePhase as string) || 'intake'
      agentsByPhase.set(phase, [...(agentsByPhase.get(phase) ?? []), agent])
    }

    const orderedPhaseIds = [
      ...PULSE_PHASES.map((p) => p.value),
      ...Array.from(agentsByPhase.keys()).filter((phase) => !PULSE_PHASES.some((p) => p.value === phase)),
    ]

    for (const phaseId of orderedPhaseIds) {
      const phaseAgents = agentsByPhase.get(phaseId)
      if (!phaseAgents?.length) continue
      const existingSequential = existingPlan.find((p) =>
        p.mode === 'sequential' &&
        (p.id === `phase-${phaseId}` || p.stepIds.some((id) => phaseAgents.some((n) => n.id === id))),
      )
      plan.push({
        id:      existingSequential?.id ?? `phase-${phaseId}`,
        label:   existingSequential?.label ?? pulsePhaseLabel(phaseId),
        mode:    'sequential',
        stepIds: phaseAgents.map((n) => n.id),
        feedbackTo:   existingSequential?.feedbackTo,
        maxFeedback:  existingSequential?.maxFeedback,
        condition:    existingSequential?.condition,
      })
    }

    for (const collab of collabNodes) {
      const cfg       = (collab.data.config ?? {}) as CollaborationConfig
      const memberIds = (cfg.members ?? []).map((m) => m.nodeId)
      const isInfinite = cfg.iterations === 0
      const rounds    = isInfinite ? undefined : (cfg.iterations ?? 2)

      // Find the existing phase that overlaps with this collab node's members
      const existing = existingPlan.find((p) =>
        p.mode === 'collaborative' &&
        memberIds.length > 0 &&
        p.stepIds.some((id) => memberIds.includes(id)),
      )

      const phaseUpdate: ExecutionPhase = {
        id:                 existing?.id ?? collab.id,
        label:              collab.data.label,
        mode:               'collaborative',
        stepIds:            memberIds.length > 0 ? memberIds : (existing?.stepIds ?? []),
        rounds,
        iterationsInfinite: isInfinite || undefined,
        maxIterations:      isInfinite ? (cfg.maxIterations ?? 8) : undefined,
        contextMode:        cfg.contextMode,
        loopRole:           cfg.loopRole,
        outputMode:         cfg.outputMode,
        stopCondition:      isInfinite ? (cfg.stopCondition ?? 'fixed') : undefined,
        stopMarker:         cfg.stopCondition === 'marker' ? cfg.stopMarker : undefined,
        feedbackTo:         existing?.feedbackTo,
        maxFeedback:        existing?.maxFeedback,
        condition:          existing?.condition,
      }

      plan.push(phaseUpdate)
    }

    return plan.length > 0 ? plan : existingPlan
  }

  function orderNodesByEdges(candidateNodes: WFNode[], edges: WFEdge[]): WFNode[] {
    const byId = new Map(candidateNodes.map((n) => [n.id, n]))
    const incoming = new Map(candidateNodes.map((n) => [n.id, 0]))
    const outgoing = new Map(candidateNodes.map((n) => [n.id, [] as string[]]))

    for (const edge of edges) {
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue
      outgoing.get(edge.source)?.push(edge.target)
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    }

    const queue = candidateNodes.filter((n) => (incoming.get(n.id) ?? 0) === 0)
    const ordered: WFNode[] = []

    while (queue.length > 0) {
      const node = queue.shift()!
      ordered.push(node)
      for (const nextId of outgoing.get(node.id) ?? []) {
        const nextCount = (incoming.get(nextId) ?? 0) - 1
        incoming.set(nextId, nextCount)
        if (nextCount === 0) queue.push(byId.get(nextId)!)
      }
    }

    return ordered.length === candidateNodes.length ? ordered : candidateNodes
  }

  function pulsePhaseLabel(phaseId: string): string {
    return PULSE_PHASES.find((phase) => phase.value === phaseId)?.label ?? phaseId
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase()
  const filteredAgents = q ? agents.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) : []
  const unassignedAgents = agents.filter((a) => !a.department_id)
  const modelGroups = groupModels(models)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
      <header
        className="flex-shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
        style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5 pl-20" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="w-7 h-7 bg-[#facc15] rounded-md flex items-center justify-center">
            <img src={logo} alt="" className="w-4 h-4 object-contain" />
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">HupheAI</span>
          <span className="text-white/20 text-sm mx-1">/</span>
          <span className="text-white/50 text-sm font-medium">Backstage</span>
        </div>
        <div className="flex items-center gap-3 pr-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={onBack} className="text-white/40 hover:text-white/70 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-3 py-1.5 transition-colors">
            ← Terug
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="w-72 flex-shrink-0 border-r border-white/[0.07] flex flex-col overflow-hidden">
          <div className="px-3 pt-4 pb-3 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Zoek op naam of functie…"
                className="w-full bg-[#141414] border border-white/[0.08] text-white/60 text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none placeholder:text-white/20 focus:border-white/20 transition-colors" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors text-sm">✕</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-4">
            {q ? (
              <div className="px-3 flex flex-col gap-1.5">
                {filteredAgents.length === 0 ? (
                  <p className="text-white/20 text-xs px-1 mt-1">Geen resultaten.</p>
                ) : filteredAgents.map((a) => (
                  <AgentListItem key={a.id} agent={a} selected={selection?.type === 'agent' && selection.id === a.id} onClick={() => setSelection({ type: 'agent', id: a.id })} />
                ))}
              </div>
            ) : (
              <>
                <div className="px-4 mb-1 flex items-center justify-between">
                  <span className="text-white/30 text-[11px] font-medium uppercase tracking-widest">Agents</span>
                  <button onClick={() => setAddingDept(true)} className="text-white/40 hover:text-white/70 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-2.5 py-1 transition-colors">+ Afdeling</button>
                </div>

                {addingDept && (
                  <div className="px-3 mb-2">
                    <div className="flex gap-1.5">
                      <input autoFocus value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') createDepartment(); if (e.key === 'Escape') { setAddingDept(false); setNewDeptName('') } }}
                        placeholder="Naam afdeling…" className="flex-1 bg-[#141414] border border-amber-500/30 text-white/70 text-xs rounded-lg px-3 py-1.5 focus:outline-none" />
                      <button onClick={createDepartment} className="bg-amber-500 text-black text-xs font-semibold px-2.5 rounded-lg hover:bg-amber-400">✓</button>
                      <button onClick={() => { setAddingDept(false); setNewDeptName('') }} className="text-white/30 hover:text-white/60 text-xs px-2">✕</button>
                    </div>
                  </div>
                )}

                {departments.map((dept) => {
                  const deptAgents = agents.filter((a) => a.department_id === dept.id)
                  return (
                    <DeptFolder key={dept.id} dept={dept} agents={deptAgents} collapsed={collapsedDepts.has(dept.id)}
                      onToggle={() => toggleDept(dept.id)} onAddAgent={() => addAgent(dept.id)}
                      onDelete={deptAgents.length === 0 ? () => deleteDepartment(dept.id) : undefined}
                      selection={selection} onSelect={(id) => setSelection({ type: 'agent', id })} />
                  )
                })}

                {unassignedAgents.length > 0 && (
                  <DeptFolder dept={{ id: '__none', name: 'Zonder afdeling', created_at: '' }} agents={unassignedAgents}
                    collapsed={collapsedDepts.has('__none')} onToggle={() => toggleDept('__none')}
                    onAddAgent={() => addAgent(null)} selection={selection} onSelect={(id) => setSelection({ type: 'agent', id })} />
                )}

                {departments.length === 0 && unassignedAgents.length === 0 && (
                  <button onClick={() => addAgent()} className="mx-3 mt-1 w-[calc(100%-24px)] text-white/30 hover:text-white/60 text-xs border border-dashed border-white/[0.08] hover:border-white/20 rounded-xl py-3 transition-colors">
                    + Agent toevoegen
                  </button>
                )}

                <div className="mx-4 h-px bg-white/[0.06] my-4" />

                <div className="px-4 mb-2 flex items-center justify-between">
                  <span className="text-white/30 text-[11px] font-medium uppercase tracking-widest">Pipelines</span>
                  <div className="flex gap-1">
                    <button onClick={seedPulsePipeline} className="text-purple-400 hover:text-purple-300 text-[10px] border border-purple-500/20 hover:border-purple-500/40 rounded-md px-2 py-1 transition-colors">✨ Pulse Setup</button>
                    <button onClick={addPipeline} className="text-white/40 hover:text-white/70 text-xs border border-white/[0.08] hover:border-white/20 rounded-md px-2.5 py-1 transition-colors">+ Nieuw</button>
                  </div>
                </div>
                <div className="px-3 flex flex-col gap-1.5">
                  {pipelines.map((p) => (
                    <button key={p.id} onClick={() => setSelection({ type: 'pipeline', id: p.id })}
                      className={['w-full text-left px-3.5 py-3 rounded-xl border transition-colors', selection?.type === 'pipeline' && selection.id === p.id ? 'bg-[#1a1a1a] border-amber-500/30' : 'bg-[#111111] border-white/[0.06] hover:bg-[#151515] hover:border-white/[0.1]'].join(' ')}>
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.is_active ? 'bg-emerald-400' : 'bg-white/20'}`} />
                        <span className="text-white/80 text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-3.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 font-medium">{p.module}</span>
                        <span className="text-white/20 text-[10px]">{p.nodes.length} nodes</span>
                      </div>
                    </button>
                  ))}
                  {pipelines.length === 0 && <p className="text-white/20 text-xs px-1">Nog geen pipelines.</p>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className={`flex-1 ${selection?.type === 'pipeline' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {!selection ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-white/20 text-sm">Selecteer een agent of pipeline om te bewerken</p>
            </div>
          ) : selection.type === 'agent' && editedAgent ? (
            <AgentEditor agent={editedAgent} departments={departments} onChange={setEditedAgent}
              onSave={saveAgent} saving={saving} modelGroups={modelGroups}
              loadingModels={loadingModels} modelsError={modelsError} onRefreshModels={fetchModels} />
          ) : selection.type === 'pipeline' && editedPipeline ? (
            <WorkflowEditor
              key={editedPipeline.id}
              pipeline={editedPipeline}
              agents={agents}
              runs={runs}
              loadingRuns={loadingRuns}
              onChange={setEditedPipeline}
              onSave={savePipeline}
              saving={saving}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── DeptFolder ─────────────────────────────────────────────────────────────────

function DeptFolder({ dept, agents, collapsed, onToggle, onAddAgent, onDelete, selection, onSelect }: {
  dept: Department; agents: Agent[]; collapsed: boolean
  onToggle: () => void; onAddAgent: () => void; onDelete?: () => void
  selection: Selection; onSelect: (id: string) => void
}) {
  return (
    <div className="mb-0.5">
      <div className="group flex items-center gap-1.5 px-4 py-1.5 hover:bg-white/[0.02] rounded-lg mx-1 transition-colors">
        <button onClick={onToggle} className="text-white/20 text-[10px] w-3 flex-shrink-0">{collapsed ? '▶' : '▼'}</button>
        <span className="text-white/40 text-xs font-medium flex-1 truncate">{dept.name}</span>
        <button onClick={onAddAgent} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/60 text-xs transition-all" title="Agent toevoegen">+</button>
        {onDelete && (
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400/60 text-xs transition-all ml-1" title="Afdeling verwijderen">✕</button>
        )}
      </div>
      {!collapsed && (
        <div className="pl-5 pr-3 flex flex-col gap-1 mb-1">
          {agents.map((a) => (
            <AgentListItem key={a.id} agent={a} selected={selection?.type === 'agent' && selection.id === a.id} onClick={() => onSelect(a.id)} />
          ))}
          {agents.length === 0 && <p className="text-white/15 text-xs px-2 py-1">Leeg</p>}
        </div>
      )}
    </div>
  )
}

// ── AgentListItem ──────────────────────────────────────────────────────────────

function AgentListItem({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={['w-full text-left px-3 py-2 rounded-xl border transition-colors', selected ? 'bg-[#1a1a1a] border-amber-500/30' : 'bg-[#111111] border-white/[0.06] hover:bg-[#151515] hover:border-white/[0.1]'].join(' ')}>
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-black" style={{ background: agent.avatar_color }}>
          {agent.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-white/80 text-xs font-medium truncate">{agent.name}</p>
          {agent.description && <p className="text-white/25 text-[11px] truncate">{agent.description}</p>}
        </div>
      </div>
    </button>
  )
}

// ── AgentEditor ───────────────────────────────────────────────────────────────

function AgentEditor({ agent, departments, onChange, onSave, saving, modelGroups, loadingModels, modelsError, onRefreshModels }: {
  agent: Agent; departments: Department[]; onChange: (a: Agent) => void
  onSave: () => void; saving: boolean
  modelGroups: { label: string; options: ORouterModel[] }[]
  loadingModels: boolean; modelsError: string | null; onRefreshModels: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-bold text-black mt-0.5" style={{ background: agent.avatar_color }}>
          {agent.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <input value={agent.name} onChange={(e) => onChange({ ...agent, name: e.target.value })}
            className="w-full bg-transparent text-white text-xl font-semibold focus:outline-none border-b border-transparent focus:border-white/20 pb-1 transition-colors" placeholder="Agent naam" />
          <input value={agent.description} onChange={(e) => onChange({ ...agent, description: e.target.value })}
            placeholder="Korte omschrijving…" className="w-full mt-1.5 bg-transparent text-white/40 text-xs focus:outline-none border-b border-transparent focus:border-white/10 pb-0.5 transition-colors placeholder:text-white/20" />
        </div>
        <button onClick={onSave} disabled={saving} className="flex-shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors mt-1">
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>

      <div className="flex gap-6 mb-6">
        <div className="flex-1">
          <label className="text-white/30 text-[11px] uppercase tracking-wider block mb-2">Kleur</label>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map((c) => (
              <button key={c} onClick={() => onChange({ ...agent, avatar_color: c })}
                className="w-7 h-7 rounded-lg transition-transform hover:scale-110"
                style={{ background: c, outline: agent.avatar_color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </div>
        <div>
          <label className="text-white/30 text-[11px] uppercase tracking-wider block mb-2">Afdeling</label>
          <select value={agent.department_id ?? ''} onChange={(e) => onChange({ ...agent, department_id: e.target.value || null })}
            className="bg-[#141414] border border-white/[0.08] text-white/60 text-xs rounded-lg px-3 py-2 focus:outline-none">
            <option value="">Zonder afdeling</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-6">
        <label className="text-white/30 text-[11px] uppercase tracking-wider block mb-1.5">Model</label>
        <ModelPicker value={agent.model} onChange={(m, orModel) => {
          const detectedModality = orModel && isImageModel(orModel) ? 'image' : inferModalityFromId(m)
          onChange({ ...agent, model: m, modality: detectedModality })
        }} modelGroups={modelGroups} loading={loadingModels} error={modelsError} onRefresh={onRefreshModels} />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-white/20 text-[11px]">Type:</span>
          <button onClick={() => onChange({ ...agent, modality: agent.modality === 'image' ? 'text' : 'image' })}
            title="Klik om te wisselen"
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-opacity hover:opacity-70 ${agent.modality === 'image' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'}`}>
            {agent.modality === 'image' ? '🖼 Beeldgeneratie' : '✦ Tekst'}
          </button>
          <span className="text-white/15 text-[10px]">klik om te wisselen</span>
        </div>
      </div>

      <div className="mb-6">
        <label className="text-white/30 text-[11px] uppercase tracking-wider block mb-1.5">
          {agent.modality === 'image' ? 'Prompt template' : 'System prompt'}
        </label>
        {agent.modality === 'text' ? (
          <p className="text-white/20 text-[11px] mb-2">
            Gebruik <code className="bg-white/[0.06] px-1 rounded">{'{{text}}'}</code> voor de gebruikersinput en{' '}
            <code className="bg-white/[0.06] px-1 rounded">{'{{layouts}}'}</code> voor de beschikbare layouts.
          </p>
        ) : (
          <p className="text-white/20 text-[11px] mb-2">
            Beschrijf de beeldstijl. Gebruik <code className="bg-white/[0.06] px-1 rounded">{'{{text}}'}</code> om de input in te voegen.
          </p>
        )}
        <textarea value={agent.system_prompt} onChange={(e) => onChange({ ...agent, system_prompt: e.target.value })}
          rows={agent.modality === 'image' ? 5 : 10}
          className="w-full bg-[#141414] border border-white/[0.08] text-white/70 text-sm rounded-lg px-3 py-2.5 focus:outline-none resize-y font-mono leading-relaxed"
          placeholder={agent.modality === 'image' ? 'Professionele fotografie, {{text}}…' : 'Jij bent…'} />
      </div>

      {agent.modality === 'text' && (
        <div className="flex gap-6 items-end">
          <div className="flex-1">
            <label className="text-white/30 text-[11px] uppercase tracking-wider block mb-1.5">
              Temperature <span className="text-white/50 normal-case font-mono">{agent.temperature}</span>
            </label>
            <input type="range" min="0" max="1" step="0.05" value={agent.temperature}
              onChange={(e) => onChange({ ...agent, temperature: parseFloat(e.target.value) })} className="w-full accent-amber-500" />
          </div>
          <div>
            <label className="text-white/30 text-[11px] uppercase tracking-wider block mb-1.5">Max tokens</label>
            <input type="number" value={agent.max_tokens} onChange={(e) => onChange({ ...agent, max_tokens: parseInt(e.target.value) })}
              min={256} max={16000} step={256} className="w-28 bg-[#141414] border border-white/[0.08] text-white/70 text-sm rounded-lg px-3 py-2 focus:outline-none" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── WorkflowEditor ────────────────────────────────────────────────────────────

function WorkflowEditor(props: {
  pipeline: Pipeline; agents: Agent[]; runs: PipelineRun[]; loadingRuns: boolean
  onChange: (p: Pipeline) => void; onSave: (p: Pipeline) => void; saving: boolean
}) {
  return <ReactFlowProvider><WorkflowEditorInner {...props} /></ReactFlowProvider>
}

function WorkflowEditorInner({ pipeline, agents, runs, loadingRuns, onChange, onSave, saving }: {
  pipeline: Pipeline; agents: Agent[]; runs: PipelineRun[]; loadingRuns: boolean
  onChange: (p: Pipeline) => void; onSave: (p: Pipeline) => void; saving: boolean
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WFNode>(pipeline.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(pipeline.edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addMenuTab, setAddMenuTab] = useState<'agent' | 'tool' | 'utility' | 'collab'>('agent')
  const [localPipeline, setLocalPipeline] = useState(pipeline)
  const isFirstRender = useRef(true)
  const [nodeSearch, setNodeSearch] = useState<{ screenX: number; screenY: number; query: string } | null>(null)
  const nodeSearchRef = useRef<HTMLInputElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  // Sync node/edge changes back (skip first render)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setLocalPipeline((prev) => ({ ...prev, nodes: nodes as WFNode[], edges }))
  }, [nodes, edges])

  useEffect(() => {
    if (nodeSearch) nodeSearchRef.current?.focus()
  }, [nodeSearch])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: 'deletable', animated: true, style: { stroke: 'rgba(250,204,21,0.35)' } }, eds))
  }, [setEdges])

  function addNode(type: 'agentNode' | 'toolNode' | 'utilityNode' | 'collaborationNode', subtype: string, label: string, extra?: Record<string, unknown>, position?: { x: number; y: number }) {
    const newNode: WFNode = {
      id: crypto.randomUUID(), type,
      position: position ?? { x: 200 + Math.random() * 300, y: 80 + Math.random() * 200 },
      data: { subtype, label, config: { ...defaultNodeConfig(subtype), ...(extra ?? {}) } },
    }
    setNodes((nds) => [...nds, newNode])
    setAddMenuOpen(false)
    setSelectedNodeId(newNode.id)
  }

  function defaultNodeConfig(subtype: string): Record<string, unknown> {
    switch (subtype) {
      case 'intake-questionnaire':
        return {
          requiredQuestions: [
            'Wie is de opdrachtgever / het merk?',
            'Wat is het doel van de campagne?',
            'Wie is de doelgroep?',
            'Wat is de kernboodschap?',
            'Welke formaten zijn gewenst?',
            'Wat is de deadline?',
          ],
          niceToHaveQuestions: [
            'Zijn er bestaande brand guidelines?',
            'Wat is het budget of de scope?',
            'Zijn er referenties of inspiratiebronnen?',
            'Zijn er al bestaande assets?',
          ],
          unknownAllowed: true,
        }
      case 'parallel-worksession':
        return { mode: 'parallel', outputMode: 'synthesis' }
      case 'route-config':
        return { routesPerTeam: 2, teams: 2, minUsableRoutesPerTeam: 3, clientSelectionCount: 1 }
      case 'thinking-loader':
        return { message: 'Onze experts leggen de strategische fundamenten en bedenken de beste creatieve routes...' }
      case 'style-context':
        return { mode: 'both' }
      case 'context-loader':
        return { fileType: 'PDF', source: 'local' }
      case 'translator':
        return { provider: 'openrouter', targetLanguage: 'nl' }
      case 'smart-cropping':
        return { focus: 'face', aspectRatio: 'slide' }
      case 'versioning':
        return { versionLabel: 'v1', storage: 'supabase' }
      case 'condition':
        return { conditionLabel: 'Go / No-Go', ifValue: 'go' }
      case 'client-approval-gate':
        return { approver: 'Klant', reviewLink: '', channel: 'huphe-app', format: 'in-app-page', goValue: 'APPROVED', noGoValue: 'REQUEST_CHANGES' }
      case 'feedback-loop':
        return { source: 'client', maxRevisions: 3 }
      case 'pulse-inbox':
        return { pageType: 'debrief', actions: ['APPROVED', 'REQUEST_CHANGES'] }
      case 'route-selection':
        return { optionsCount: 3, selectionCount: 1, allowPdfDownload: true, allowEmailShare: true }
      case 'learning-capture':
        return { successLabel: 'gekozen route', rejectedLabel: 'niet de juiste richting' }
      case 'presentation-builder':
        return { templateSource: 'active-template', output: 'keynote' }
      case 'asset-generation':
        return { resolution: 'high', useSmartCropping: true }
      case 'notification':
        return { channel: 'slack', milestone: 'concept-ready' }
      case 'multi-format-export':
        return { formats: ['keynote', 'pdf', 'images'], destination: 'drive' }
      case 'stock-image-search':
        return { provider: 'unsplash', queryMode: 'from-prompt' }
      default:
        return {}
    }
  }

  function updateNodeData(nodeId: string, patch: Partial<WFNodeData>) {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
  }

  function deleteNode(nodeId: string) {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setSelectedNodeId(null)
  }

  function handleSave() {
    const p = { ...localPipeline, nodes: nodes as WFNode[], edges }
    onChange(p)
    onSave(p)
  }

  const BUTTON_OPTS = [
    { value: 'ai-auto',  label: 'AI+ (automatisch)' },
    { value: 'ai-prompt',label: 'Prompt (eigen invoer)' },
    { value: 'analyse',  label: 'Analyseer (Atelier)' },
    { value: 'pulse-start', label: 'Campagne starten (Pulse)' },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-white/[0.07] bg-[#0d0d0d] flex items-center gap-3">
        <input value={localPipeline.name}
          onChange={(e) => setLocalPipeline((p) => ({ ...p, name: e.target.value }))}
          className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 transition-colors min-w-0" />
        <select value={localPipeline.module} onChange={(e) => setLocalPipeline((p) => ({ ...p, module: e.target.value }))}
          className="bg-white/[0.05] border border-white/[0.08] text-white/50 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none flex-shrink-0">
          {['pulse', 'atelier', 'flow', 'ledger', 'twin'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={localPipeline.description}
          onChange={(e) => setLocalPipeline((p) => ({ ...p, description: e.target.value }))}
          placeholder="Beschrijving…"
          className="w-40 bg-transparent text-white/30 text-xs focus:outline-none border-b border-transparent focus:border-white/10 pb-0.5 transition-colors placeholder:text-white/15" />
        <Toggle
          checked={localPipeline.is_active}
          onChange={v => setLocalPipeline(p => ({ ...p, is_active: v }))}
          variant="emerald"
        />
        <span className="text-white/25 text-xs flex-shrink-0">{localPipeline.is_active ? 'Actief' : 'Inactief'}</span>
        <button onClick={handleSave} disabled={saving}
          className="flex-shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors">
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => { setSelectedNodeId(null); setNodeSearch(null) }}
          onPaneDoubleClick={(e) => setNodeSearch({ screenX: e.clientX, screenY: e.clientY, query: '' })}
          fitView colorMode="dark"
          defaultEdgeOptions={{ type: 'deletable', animated: true, style: { stroke: 'rgba(250,204,21,0.3)', strokeWidth: 1.5 } }}
          style={{ background: '#0a0a0a' }}
        >
          <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.04)" gap={24} size={1.5} />
          <Controls style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)' }} />

          {/* Add node palette */}
          <Panel position="top-left">
            <div className="relative">
              <button onClick={() => setAddMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 bg-[#161616] border border-white/[0.1] hover:border-white/20 text-white/60 hover:text-white/90 text-xs rounded-lg px-3 py-2 transition-colors shadow-lg">
                <span className="text-amber-400">+</span> Voeg node toe
              </button>
              {addMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#161616] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden z-50">
                  {/* Tabs */}
                  <div className="flex border-b border-white/[0.07]">
                    {(['agent', 'tool', 'utility', 'collab'] as const).map((tab) => (
                      <button key={tab} onClick={() => setAddMenuTab(tab)}
                        className={['flex-1 py-2 text-[11px] font-medium transition-colors', addMenuTab === tab ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/30 hover:text-white/60'].join(' ')}>
                        {tab === 'agent' ? 'Agents' : tab === 'tool' ? 'Tools' : tab === 'utility' ? 'Utils' : 'Loop'}
                      </button>
                    ))}
                  </div>
                  <div className="py-1.5 max-h-64 overflow-y-auto">
                    {addMenuTab === 'agent' && agents.map((a) => (
                      <button key={a.id} onClick={() => addNode('agentNode', 'agent', a.name, {
                        agentId: a.id, avatarColor: a.avatar_color,
                        agentDescription: a.description, modality: a.modality,
                        pulseRole: a.name, pulsePhase: 'intake',
                      })}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left">
                        <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-black" style={{ background: a.avatar_color }}>
                          {a.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white/80 text-xs font-medium truncate">{a.name}</p>
                          {a.description && <p className="text-white/30 text-[10px] truncate">{a.description}</p>}
                        </div>
                      </button>
                    ))}
                    {addMenuTab === 'agent' && agents.length === 0 && (
                      <p className="text-white/25 text-xs px-3 py-2">Maak eerst een agent aan.</p>
                    )}
                    {addMenuTab === 'tool' && TOOL_NODES.map((tn) => (
                      <button key={tn.subtype} onClick={() => addNode('toolNode', tn.subtype, tn.label)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left">
                        <span className="text-amber-400 text-sm w-5 text-center flex-shrink-0">{tn.icon}</span>
                        <div>
                          <p className="text-white/80 text-xs font-medium">{tn.label}</p>
                          <p className="text-white/30 text-[10px]">{tn.description}</p>
                        </div>
                      </button>
                    ))}
                    {addMenuTab === 'utility' && UTILITY_NODES.map((un) => (
                      <button key={un.subtype} onClick={() => addNode('utilityNode', un.subtype, un.label)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left">
                        <span className="text-purple-400 text-sm w-5 text-center flex-shrink-0">{un.icon}</span>
                        <div>
                          <p className="text-white/80 text-xs font-medium">{un.label}</p>
                          <p className="text-white/30 text-[10px]">{un.description}</p>
                        </div>
                      </button>
                    ))}
                    {addMenuTab === 'collab' && (
                      <div className="py-1">
                        <button
                          onClick={() => addNode('collaborationNode', 'loop', 'Samenwerking', {
                            iterations: 2, maxIterations: 8,
                            loopRole: 'collaborative', contextMode: 'full',
                            stopCondition: 'fixed', outputMode: 'last', members: [],
                          })}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
                        >
                          <span className="text-cyan-400 text-sm w-5 text-center flex-shrink-0">↺</span>
                          <div>
                            <p className="text-white/80 text-xs font-medium">Samenwerking loop</p>
                            <p className="text-white/30 text-[10px]">Twee of meer agents die overleggen</p>
                          </div>
                        </button>
                        <div className="mx-3 mt-2 p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
                          <p className="text-[10px] text-cyan-400/60 leading-relaxed">
                            Voeg de node toe, selecteer hem dan en kies leden via het configuratiepaneel.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Node config panel */}
          {selectedNode && (
            <Panel position="top-right">
              <NodeConfigPanel
                node={selectedNode} agents={agents} pipelineNodes={nodes}
                onChange={(patch) => updateNodeData(selectedNode.id, patch)}
                onDelete={() => deleteNode(selectedNode.id)}
                onClose={() => setSelectedNodeId(null)}
                buttonOpts={BUTTON_OPTS}
              />
            </Panel>
          )}

          {/* Empty state */}
          {nodes.length === 0 && (
            <Panel position="bottom-center">
              <p className="text-white/20 text-sm">Klik op "+ Voeg node toe" om te beginnen</p>
            </Panel>
          )}
        </ReactFlow>

        {/* Double-click node search overlay */}
        {nodeSearch && (() => {
          const allItems: Array<{ type: 'agentNode' | 'toolNode' | 'utilityNode' | 'collaborationNode'; subtype: string; label: string; icon: string; description: string; extra?: Record<string, unknown> }> = [
            ...agents.map((a) => ({ type: 'agentNode' as const, subtype: 'agent', label: a.name, icon: a.name[0]?.toUpperCase() ?? '?', description: a.description ?? '', extra: { agentId: a.id, avatarColor: a.avatar_color, agentDescription: a.description, modality: a.modality, pulseRole: a.name, pulsePhase: 'intake' } })),
            ...TOOL_NODES.map((n) => ({ type: 'toolNode' as const, subtype: n.subtype, label: n.label, icon: n.icon, description: n.description, extra: undefined })),
            ...UTILITY_NODES.map((n) => ({ type: 'utilityNode' as const, subtype: n.subtype, label: n.label, icon: n.icon, description: n.description, extra: undefined })),
            { type: 'collaborationNode', subtype: 'loop', label: 'Samenwerking loop', icon: '↺', description: 'Twee of meer agents die overleggen', extra: { iterations: 2, maxIterations: 8, loopRole: 'collaborative', contextMode: 'full', stopCondition: 'fixed', outputMode: 'last', members: [] } },
          ]
          const q = nodeSearch.query.toLowerCase()
          const filtered = q ? allItems.filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) : allItems.slice(0, 12)
          const flowPos = screenToFlowPosition({ x: nodeSearch.screenX, y: nodeSearch.screenY })

          return (
            <div
              className="fixed z-[9999] w-72 bg-[#161616] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden"
              style={{ left: nodeSearch.screenX, top: nodeSearch.screenY, transform: 'translate(-8px, -8px)' }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
                <input
                  ref={nodeSearchRef}
                  value={nodeSearch.query}
                  onChange={(e) => setNodeSearch((s) => s ? { ...s, query: e.target.value } : null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setNodeSearch(null); return }
                    if (e.key === 'Enter' && filtered.length > 0) {
                      const item = filtered[0]
                      addNode(item.type, item.subtype, item.label, item.extra, flowPos)
                      setNodeSearch(null)
                    }
                  }}
                  placeholder="Zoek node…"
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-amber-400/40"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 && (
                  <p className="text-white/25 text-xs px-3 py-2">Geen resultaten gevonden.</p>
                )}
                {filtered.map((item, i) => {
                  const isAgent = item.type === 'agentNode'
                  const agentColor = isAgent ? ((item.extra?.avatarColor as string) ?? '#f59e0b') : undefined
                  return (
                    <button key={i}
                      onClick={() => { addNode(item.type, item.subtype, item.label, item.extra, flowPos); setNodeSearch(null) }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] transition-colors text-left"
                    >
                      {isAgent ? (
                        <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-black" style={{ background: agentColor }}>{item.icon}</div>
                      ) : (
                        <span className="text-sm w-6 text-center flex-shrink-0 text-amber-400/80">{item.icon}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-white/80 text-xs font-medium truncate">{item.label}</p>
                        {item.description && <p className="text-white/30 text-[10px] truncate">{item.description}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Run history */}
      <div className="flex-shrink-0 border-t border-white/[0.07] bg-[#0d0d0d] px-5 py-3" style={{ maxHeight: 180 }}>
        <p className="text-white/25 text-[10px] uppercase tracking-widest mb-2">Run geschiedenis</p>
        {loadingRuns ? <p className="text-white/20 text-xs">Laden…</p> : runs.length === 0 ? <p className="text-white/20 text-xs">Nog geen runs.</p> : (
          <div className="overflow-y-auto flex flex-col gap-1" style={{ maxHeight: 120 }}>
            {runs.map((run) => <RunRow key={run.id} run={run} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── NodeConfigPanel ───────────────────────────────────────────────────────────

function NodeConfigPanel({ node, agents, pipelineNodes, onChange, onDelete, onClose, buttonOpts }: {
  node: WFNode
  agents: Agent[]
  pipelineNodes: WFNode[]
  onChange: (patch: Partial<WFNodeData>) => void
  onDelete: () => void
  onClose: () => void
  buttonOpts: { value: string; label: string }[]
}) {
  const d = node.data
  const isImagePlaceholder = IMAGE_PLACEHOLDER_UTILS.has(d.subtype)
  const pipelineTargets = pipelineNodes.filter((n) => n.id !== node.id)

  function patchConfig(patch: Record<string, unknown>) {
    onChange({ config: { ...d.config, ...patch } })
  }

  function toggleFormat(format: string) {
    const current = Array.isArray(d.config.formats) ? d.config.formats as string[] : []
    const next = current.includes(format) ? current.filter((f) => f !== format) : [...current, format]
    patchConfig({ formats: next })
  }

  function listToText(value: unknown): string {
    return Array.isArray(value) ? value.join('\n') : ''
  }

  function textToList(value: string): string[] {
    return value.split('\n').map((line) => line.trim()).filter(Boolean)
  }

  return (
    <div className="w-64 bg-[#161616] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.07]">
        <p className="text-white/70 text-xs font-semibold truncate">{d.label}</p>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs ml-2">✕</button>
      </div>

      <div className="px-3.5 py-3 space-y-3">
        {node.type !== 'agentNode' && node.type !== 'collaborationNode' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Label</p>
            <input value={d.label} onChange={(e) => onChange({ label: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
          </div>
        )}

        {/* Agent node: pick agent */}
        {node.type === 'agentNode' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Agent</p>
            <div className="space-y-1">
              {agents.map((a) => (
                <button key={a.id} onClick={() => onChange({
                  label: a.name,
                  config: { ...d.config, agentId: a.id, avatarColor: a.avatar_color, agentDescription: a.description, modality: a.modality, pulseRole: (d.config.pulseRole as string) ?? a.name, pulsePhase: (d.config.pulsePhase as string) ?? 'intake' },
                })}
                  className={['w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors', d.config.agentId === a.id ? 'bg-[#1a1a1a] border-amber-500/30' : 'border-white/[0.05] hover:bg-white/[0.03]'].join(' ')}>
                  <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black" style={{ background: a.avatar_color }}>{a.name[0]?.toUpperCase()}</div>
                  <span className="text-white/70 text-xs truncate">{a.name}</span>
                  {d.config.agentId === a.id && <span className="ml-auto text-amber-400/60 text-xs">✓</span>}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Rol</p>
                <select value={(d.config.pulseRole as string) ?? d.label} onChange={(e) => patchConfig({ pulseRole: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                  {[...new Set([d.label, ...PULSE_ROLE_PRESETS])].map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Fase</p>
                <select value={(d.config.pulsePhase as string) ?? 'intake'} onChange={(e) => patchConfig({ pulsePhase: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                  {PULSE_PHASES.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tool trigger: pick button */}
        {node.type === 'toolNode' && d.subtype === 'trigger' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Gekoppeld aan knop</p>
            <div className="space-y-1">
              {buttonOpts.map((opt) => (
                <button key={opt.value} onClick={() => patchConfig({ button: opt.value, buttonLabel: opt.label })}
                  className={['w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors', d.config.button === opt.value ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'border-white/[0.05] text-white/50 hover:bg-white/[0.03]'].join(' ')}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tool output-text: field name */}
        {node.type === 'toolNode' && d.subtype === 'output-text' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Veldnaam</p>
            <input value={(d.config.fieldName as string) ?? ''} onChange={(e) => patchConfig({ fieldName: e.target.value })}
              placeholder="bijv. heading, body…"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
          </div>
        )}

        {/* Client approval gate */}
        {node.type === 'toolNode' && d.subtype === 'client-approval-gate' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Kanaal</p>
              <select value={(d.config.channel as string) ?? 'huphe-app'} onChange={(e) => patchConfig({ channel: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="huphe-app">HupheAI App</option>
                <option value="email">E-mail</option>
                <option value="slack">Slack</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Formaat</p>
              <select value={(d.config.format as string) ?? 'in-app-page'} onChange={(e) => patchConfig({ format: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="in-app-page">Opgemaakte pagina</option>
                <option value="pdf-email">PDF bijlage</option>
                <option value="message-actions">Bericht met knoppen</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Reviewer</p>
              <input value={(d.config.approver as string) ?? ''} onChange={(e) => patchConfig({ approver: e.target.value })}
                placeholder="Klant, stakeholder…"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Reviewlink</p>
              <input value={(d.config.reviewLink as string) ?? ''} onChange={(e) => patchConfig({ reviewLink: e.target.value })}
                placeholder="https://…"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
            <TargetSelect label="Go naar" value={(d.config.goTo as string) ?? ''} targets={pipelineTargets} onChange={(value) => patchConfig({ goTo: value })} />
            <TargetSelect label="No-Go naar" value={(d.config.noGoTo as string) ?? ''} targets={pipelineTargets} onChange={(value) => patchConfig({ noGoTo: value })} />
          </div>
        )}

        {/* Pulse Inbox */}
        {node.type === 'toolNode' && d.subtype === 'pulse-inbox' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Pagina</p>
              <select value={(d.config.pageType as string) ?? 'debrief'} onChange={(e) => patchConfig({ pageType: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="debrief">Debrief approval</option>
                <option value="routes">3 routes presentatie</option>
                <option value="design-options">Designkeuze</option>
                <option value="delivery">Oplevering</option>
              </select>
            </div>
            <p className="text-white/25 text-[10px] leading-relaxed">
              Wordt gebruikt voor in-app klantgoedkeuringen en keuzes binnen Pulse.
            </p>
          </div>
        )}

        {/* Feedback loop */}
        {node.type === 'toolNode' && d.subtype === 'feedback-loop' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Feedbackbron</p>
              <select value={(d.config.source as string) ?? 'client'} onChange={(e) => patchConfig({ source: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="creative-director">Creative Director</option>
                <option value="client">Klant</option>
                <option value="qa">QA</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Max revisies</p>
              <input type="number" min={1} max={12} value={(d.config.maxRevisions as number) ?? 3}
                onChange={(e) => patchConfig({ maxRevisions: parseInt(e.target.value) || 3 })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
            <TargetSelect label="Terug naar" value={(d.config.returnTo as string) ?? ''} targets={pipelineTargets} onChange={(value) => patchConfig({ returnTo: value })} />
            <TargetSelect label="Escalatie" value={(d.config.escalateTo as string) ?? ''} targets={pipelineTargets} onChange={(value) => patchConfig({ escalateTo: value })} />
          </div>
        )}

        {/* Notification */}
        {node.type === 'toolNode' && d.subtype === 'notification' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Kanaal</p>
              <select value={(d.config.channel as string) ?? 'slack'} onChange={(e) => patchConfig({ channel: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="slack">Slack</option>
                <option value="teams">Teams</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Milestone</p>
              <input value={(d.config.milestone as string) ?? ''} onChange={(e) => patchConfig({ milestone: e.target.value })}
                placeholder="concept-ready"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
          </div>
        )}

        {/* Route selection */}
        {node.type === 'toolNode' && d.subtype === 'route-selection' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Opties</p>
                <input type="number" min={1} max={12} value={(d.config.optionsCount as number) ?? 3}
                  onChange={(e) => patchConfig({ optionsCount: parseInt(e.target.value) || 3 })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
              </div>
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Keuzes</p>
                <input type="number" min={1} max={3} value={(d.config.selectionCount as number) ?? 1}
                  onChange={(e) => patchConfig({ selectionCount: parseInt(e.target.value) || 1 })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-white/50 text-xs">
              <input type="checkbox" checked={!!d.config.allowPdfDownload} onChange={(e) => patchConfig({ allowPdfDownload: e.target.checked })} className="accent-amber-500" />
              PDF downloaden toestaan
            </label>
            <label className="flex items-center gap-2 text-white/50 text-xs">
              <input type="checkbox" checked={!!d.config.allowEmailShare} onChange={(e) => patchConfig({ allowEmailShare: e.target.checked })} className="accent-amber-500" />
              Mail delen toestaan
            </label>
          </div>
        )}

        {/* Learning capture */}
        {node.type === 'toolNode' && d.subtype === 'learning-capture' && (
          <div className="space-y-3">
            <input value={(d.config.successLabel as string) ?? ''} onChange={(e) => patchConfig({ successLabel: e.target.value })}
              placeholder="Label voor gekozen route"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            <input value={(d.config.rejectedLabel as string) ?? ''} onChange={(e) => patchConfig({ rejectedLabel: e.target.value })}
              placeholder="Label voor afgewezen routes"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
          </div>
        )}

        {/* Presentation builder */}
        {node.type === 'toolNode' && d.subtype === 'presentation-builder' && (
          <div className="space-y-3">
            <input value={(d.config.templateSource as string) ?? 'active-template'} onChange={(e) => patchConfig({ templateSource: e.target.value })}
              placeholder="Template bron"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            <select value={(d.config.output as string) ?? 'keynote'} onChange={(e) => patchConfig({ output: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
              <option value="keynote">Keynote</option>
              <option value="deck-data">Deck data</option>
            </select>
          </div>
        )}

        {/* Asset generation */}
        {node.type === 'toolNode' && d.subtype === 'asset-generation' && (
          <div className="space-y-3">
            <select value={(d.config.resolution as string) ?? 'high'} onChange={(e) => patchConfig({ resolution: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
              <option value="draft">Draft</option>
              <option value="high">Hoge resolutie</option>
              <option value="print">Print-ready</option>
            </select>
            <label className="flex items-center gap-2 text-white/50 text-xs">
              <input type="checkbox" checked={!!d.config.useSmartCropping} onChange={(e) => patchConfig({ useSmartCropping: e.target.checked })} className="accent-amber-500" />
              Smart Cropping toepassen
            </label>
          </div>
        )}

        {/* Multi-format export */}
        {node.type === 'toolNode' && d.subtype === 'multi-format-export' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Formaten</p>
              <div className="flex gap-1 flex-wrap">
                {['keynote', 'pdf', 'images'].map((format) => (
                  <button key={format} onClick={() => toggleFormat(format)}
                    className={['px-2 py-1 rounded-md text-[11px] border transition-colors', ((d.config.formats as string[] | undefined) ?? []).includes(format) ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/[0.07] text-white/35 hover:text-white/60'].join(' ')}>
                    {format}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Bestemming</p>
              <select value={(d.config.destination as string) ?? 'drive'} onChange={(e) => patchConfig({ destination: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="drive">Google Drive</option>
                <option value="dropbox">Dropbox</option>
                <option value="local">Lokaal</option>
                <option value="supabase">Supabase</option>
              </select>
            </div>
          </div>
        )}

        {/* Stock image fallback */}
        {node.type === 'toolNode' && d.subtype === 'stock-image-search' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Provider</p>
              <select value={(d.config.provider as string) ?? 'unsplash'} onChange={(e) => patchConfig({ provider: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="unsplash">Unsplash</option>
                <option value="getty">Getty</option>
                <option value="pexels">Pexels</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Zoekquery</p>
              <input value={(d.config.query as string) ?? ''} onChange={(e) => patchConfig({ query: e.target.value })}
                placeholder="Leeg = uit prompt"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
          </div>
        )}

        {/* Utility combine: separator */}
        {node.type === 'utilityNode' && d.subtype === 'combine' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Scheidingsteken</p>
            <input value={(d.config.separator as string) ?? '\n\n'} onChange={(e) => patchConfig({ separator: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-mono" />
          </div>
        )}

        {/* Utility template: template string */}
        {node.type === 'utilityNode' && d.subtype === 'template' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Template</p>
            <p className="text-white/20 text-[10px] mb-1">Gebruik <code className="bg-white/[0.06] px-1 rounded">{'{{input}}'}</code></p>
            <textarea value={(d.config.template as string) ?? ''} onChange={(e) => patchConfig({ template: e.target.value })}
              rows={3} placeholder="Schrijf: {{input}}"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none resize-none font-mono" />
          </div>
        )}

        {/* Utility trim: max length */}
        {node.type === 'utilityNode' && d.subtype === 'trim' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Max tekens</p>
            <input type="number" value={(d.config.maxLength as number) ?? 500} onChange={(e) => patchConfig({ maxLength: parseInt(e.target.value) })}
              min={50} step={50}
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
          </div>
        )}

        {/* Agency utilities */}
        {node.type === 'utilityNode' && d.subtype === 'intake-questionnaire' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Required vragen</p>
              <textarea value={listToText(d.config.requiredQuestions)} onChange={(e) => patchConfig({ requiredQuestions: textToList(e.target.value) })}
                rows={6}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none resize-none leading-relaxed" />
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Nice-to-have</p>
              <textarea value={listToText(d.config.niceToHaveQuestions)} onChange={(e) => patchConfig({ niceToHaveQuestions: textToList(e.target.value) })}
                rows={4}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none resize-none leading-relaxed" />
            </div>
            <label className="flex items-center gap-2 text-white/50 text-xs">
              <input type="checkbox" checked={d.config.unknownAllowed !== false} onChange={(e) => patchConfig({ unknownAllowed: e.target.checked })} className="accent-purple-500" />
              Onbekend telt als afgehandeld
            </label>
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'parallel-worksession' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Output</p>
              <select value={(d.config.outputMode as string) ?? 'synthesis'} onChange={(e) => patchConfig({ outputMode: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="synthesis">Synthese</option>
                <option value="all">Alle outputs</option>
                <option value="best">Beste output</option>
              </select>
            </div>
            <p className="text-white/25 text-[10px] leading-relaxed">
              Gebruik dit voor Merkstrateeg + Gedragswetenschapper of Team 1 + Team 2.
            </p>
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'route-config' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Teams</p>
                <input type="number" min={1} max={6} value={(d.config.teams as number) ?? 2}
                  onChange={(e) => patchConfig({ teams: parseInt(e.target.value) || 2 })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
              </div>
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Routes/team</p>
                <input type="number" min={1} max={8} value={(d.config.routesPerTeam as number) ?? 2}
                  onChange={(e) => patchConfig({ routesPerTeam: parseInt(e.target.value) || 2 })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Bruikbaar/team</p>
                <input type="number" min={1} max={8} value={(d.config.minUsableRoutesPerTeam as number) ?? 3}
                  onChange={(e) => patchConfig({ minUsableRoutesPerTeam: parseInt(e.target.value) || 3 })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
              </div>
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Klant kiest</p>
                <input type="number" min={1} max={3} value={(d.config.clientSelectionCount as number) ?? 1}
                  onChange={(e) => patchConfig({ clientSelectionCount: parseInt(e.target.value) || 1 })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
              </div>
            </div>
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'thinking-loader' && (
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Loader tekst</p>
            <textarea value={(d.config.message as string) ?? ''} onChange={(e) => patchConfig({ message: e.target.value })}
              rows={3}
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none resize-none leading-relaxed" />
          </div>
        )}

        {(node.type === 'utilityNode' || node.type === 'toolNode') && d.subtype === 'style-context' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Stijlmodus</p>
              {([
                ['text', 'Tekst'],
                ['image', 'Beeld'],
                ['both', 'Beide'],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => patchConfig({ mode: value })}
                  className={['w-full text-left px-2.5 py-1.5 rounded-lg border text-xs mb-1 transition-colors', (d.config.mode ?? 'both') === value ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'border-white/[0.05] text-white/50 hover:bg-white/[0.03]'].join(' ')}>
                  {label}
                </button>
              ))}
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Stijlprompt</p>
              <textarea
                value={(d.config.prompt as string) ?? ''}
                onChange={(e) => patchConfig({ prompt: e.target.value })}
                rows={5}
                placeholder="Beschrijf de beeldstijl voor deze specifieke pipeline, bv. 'Minimalistische zwart-wit fotografie, hoge contrasten, zakelijke sfeer…'"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-purple-500/40 resize-none placeholder:text-white/20"
              />
            </div>
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'context-loader' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Bestandstype</p>
              <select value={(d.config.fileType as string) ?? 'PDF'} onChange={(e) => patchConfig({ fileType: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="PDF">PDF</option>
                <option value="HUPHE">HUPHE</option>
                <option value="JSON">JSON</option>
                <option value="IMAGE">Referentiebeeld</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Bron</p>
              <select value={(d.config.source as string) ?? 'local'} onChange={(e) => patchConfig({ source: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="local">Lokaal</option>
                <option value="dropbox">Dropbox</option>
                <option value="url">URL</option>
                <option value="drive">Google Drive</option>
              </select>
            </div>
            <input value={(d.config.pathOrUrl as string) ?? ''} onChange={(e) => patchConfig({ pathOrUrl: e.target.value })}
              placeholder="Pad of URL"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'translator' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Provider</p>
              <select value={(d.config.provider as string) ?? 'openrouter'} onChange={(e) => patchConfig({ provider: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="openrouter">OpenRouter</option>
                <option value="deepl">DeepL</option>
              </select>
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Doeltaal</p>
              <input value={(d.config.targetLanguage as string) ?? 'nl'} onChange={(e) => patchConfig({ targetLanguage: e.target.value })}
                placeholder="nl, en-US, de…"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'smart-cropping' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Focus</p>
              <select value={(d.config.focus as string) ?? 'face'} onChange={(e) => patchConfig({ focus: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="face">Gezicht</option>
                <option value="object">Object</option>
                <option value="saliency">Visueel zwaartepunt</option>
              </select>
            </div>
            <input value={(d.config.aspectRatio as string) ?? 'slide'} onChange={(e) => patchConfig({ aspectRatio: e.target.value })}
              placeholder="slide, 16:9, 4:5…"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'versioning' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Versielabel</p>
              <input value={(d.config.versionLabel as string) ?? 'v1'} onChange={(e) => patchConfig({ versionLabel: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Opslag</p>
              <select value={(d.config.storage as string) ?? 'supabase'} onChange={(e) => patchConfig({ storage: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="supabase">Supabase run history</option>
                <option value="huphe">.huphe archief</option>
                <option value="local">Lokaal</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'utilityNode' && d.subtype === 'condition' && (
          <div className="space-y-3">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Conditie</p>
              <input value={(d.config.conditionLabel as string) ?? ''} onChange={(e) => patchConfig({ conditionLabel: e.target.value })}
                placeholder="Bijv. CD zegt Go"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            </div>
            <input value={(d.config.ifValue as string) ?? ''} onChange={(e) => patchConfig({ ifValue: e.target.value })}
              placeholder="IF waarde, bijv. go"
              className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" />
            <TargetSelect label="THEN" value={(d.config.thenTo as string) ?? ''} targets={pipelineTargets} onChange={(value) => patchConfig({ thenTo: value })} />
            <TargetSelect label="ELSE" value={(d.config.elseTo as string) ?? ''} targets={pipelineTargets} onChange={(value) => patchConfig({ elseTo: value })} />
          </div>
        )}

        {/* Image utilities: coming soon */}
        {isImagePlaceholder && (
          <div className="flex items-center gap-2 py-1">
            <span className="text-purple-400/50 text-xs">◈</span>
            <p className="text-white/25 text-xs">Binnenkort beschikbaar</p>
          </div>
        )}

        {/* to-html / output-image / output-mdtext: no config needed */}
        {(node.type === 'utilityNode' && d.subtype === 'to-html') ||
         (node.type === 'toolNode' && (d.subtype === 'output-image' || d.subtype === 'output-mdtext')) ? (
          <p className="text-white/20 text-xs py-1">Geen configuratie nodig.</p>
        ) : null}

        {/* ── Collaboration node config ── */}
        {node.type === 'collaborationNode' && (() => {
          const cfg      = (d.config ?? {}) as CollaborationConfig
          const iters    = cfg.iterations ?? 2
          const isInf    = iters === 0
          const members  = cfg.members ?? []
          const agentNodes = pipelineNodes.filter((n) => n.type === 'agentNode' && n.id !== node.id)
          const usedIds  = new Set(members.map((m) => m.nodeId))

          function patchCfg(patch: Partial<CollaborationConfig>) {
            patchConfig({ ...cfg, ...patch })
          }

          function addMember(agentNode: WFNode) {
            const aCfg = agentNode.data.config as any
            const newMember: CollaborationMember = {
              nodeId:  agentNode.id,
              agentId: aCfg.agentId ?? '',
              label:   agentNode.data.label,
              color:   aCfg.avatarColor ?? '#6b7280',
            }
            patchCfg({ members: [...members, newMember] })
          }

          function removeMember(nodeId: string) {
            patchCfg({ members: members.filter((m) => m.nodeId !== nodeId) })
          }

          const ITER_OPTIONS = [1, 2, 3, 4, 5, 6, 0] // 0 = ∞
          const color = LOOP_ROLE_COLORS[cfg.loopRole ?? 'collaborative']

          return (
            <div className="space-y-4">
              {/* Label */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Label</p>
                <input
                  value={d.label}
                  onChange={(e) => onChange({ label: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                />
              </div>

              {/* Iterations */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Iteraties</p>
                <div className="flex gap-1 flex-wrap">
                  {ITER_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => patchCfg({ iterations: n })}
                      className={['px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors border', iters === n ? 'border-cyan-500/50 text-cyan-300' : 'border-white/[0.07] text-white/35 hover:text-white/60'].join(' ')}
                      style={iters === n ? { background: `${color}15` } : {}}
                    >
                      {n === 0 ? '∞' : n}
                    </button>
                  ))}
                </div>
                {isInf && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-white/30 text-[10px]">Max veiligheidsgrens:</span>
                    <input
                      type="number" min={2} max={20}
                      value={cfg.maxIterations ?? 8}
                      onChange={(e) => patchCfg({ maxIterations: parseInt(e.target.value) || 8 })}
                      className="w-14 bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-md px-2 py-1 focus:outline-none text-center"
                    />
                  </div>
                )}
              </div>

              {/* Stop condition (infinite only) */}
              {isInf && (
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Stopconditie</p>
                  {([
                    ['fixed',       'Max bereikt'],
                    ['marker',      'Stopmarkering'],
                    ['convergence', 'Convergentie'],
                  ] as const).map(([val, lbl]) => (
                    <label key={val} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input type="radio" checked={(cfg.stopCondition ?? 'fixed') === val} onChange={() => patchCfg({ stopCondition: val })} className="accent-cyan-400" />
                      <span className="text-white/60 text-xs">{lbl}</span>
                    </label>
                  ))}
                  {cfg.stopCondition === 'marker' && (
                    <input
                      value={cfg.stopMarker ?? ''}
                      onChange={(e) => patchCfg({ stopMarker: e.target.value })}
                      placeholder="bijv. [AKKOORD]"
                      className="mt-1 w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-mono"
                    />
                  )}
                </div>
              )}

              {/* Mode */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Modus</p>
                {([
                  ['collaborative', 'Collaboratief', 'Agents bouwen samen'],
                  ['critique',      'Feedback loop', 'Één maakt, ander beoordeelt'],
                  ['consensus',     'Consensus',     'Agents stemmen over output'],
                ] as const).map(([val, lbl, desc]) => (
                  <button
                    key={val}
                    onClick={() => patchCfg({ loopRole: val })}
                    className={['w-full text-left px-2.5 py-2 rounded-lg border mb-1 transition-colors', (cfg.loopRole ?? 'collaborative') === val ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/[0.05] hover:bg-white/[0.02]'].join(' ')}
                  >
                    <p className={`text-xs font-medium ${(cfg.loopRole ?? 'collaborative') === val ? 'text-cyan-300' : 'text-white/50'}`}>{lbl}</p>
                    <p className="text-[10px] text-white/25">{desc}</p>
                  </button>
                ))}
              </div>

              {/* Context mode */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Geheugen per ronde</p>
                {([
                  ['full', 'Volledig — ziet alle vorige rondes'],
                  ['last', 'Kort — ziet alleen laatste ronde'],
                ] as const).map(([val, lbl]) => (
                  <label key={val} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input type="radio" checked={(cfg.contextMode ?? 'full') === val} onChange={() => patchCfg({ contextMode: val })} className="accent-cyan-400" />
                    <span className="text-white/60 text-xs">{lbl}</span>
                  </label>
                ))}
              </div>

              {/* Output mode */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Output naar volgende stap</p>
                {([
                  ['last',      'Laatste ronde'],
                  ['all',       'Alle rondes'],
                  ['synthesis', 'Synthese (samenvatting)'],
                ] as const).map(([val, lbl]) => (
                  <label key={val} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input type="radio" checked={(cfg.outputMode ?? 'last') === val} onChange={() => patchCfg({ outputMode: val })} className="accent-cyan-400" />
                    <span className="text-white/60 text-xs">{lbl}</span>
                  </label>
                ))}
              </div>

              {/* Members */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Leden</p>
                {members.length === 0 && (
                  <p className="text-white/20 text-[10px] mb-1.5">Nog geen leden. Voeg agents toe.</p>
                )}
                {members.map((m) => (
                  <div key={m.nodeId} className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black" style={{ background: m.color }}>
                      {m.label?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-white/60 text-xs flex-1 truncate">{m.label}</span>
                    <button onClick={() => removeMember(m.nodeId)} className="text-white/20 hover:text-red-400 text-xs transition-colors">✕</button>
                  </div>
                ))}
                {agentNodes.filter((n) => !usedIds.has(n.id)).length > 0 && (
                  <div className="mt-1.5">
                    <p className="text-white/20 text-[10px] mb-1">+ Agent toevoegen:</p>
                    {agentNodes.filter((n) => !usedIds.has(n.id)).map((n) => {
                      const nc = n.data.config as any
                      return (
                        <button
                          key={n.id}
                          onClick={() => addMember(n)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left mb-0.5"
                        >
                          <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-black" style={{ background: nc.avatarColor ?? '#6b7280' }}>
                            {n.data.label?.[0]?.toUpperCase()}
                          </div>
                          <span className="text-white/50 text-xs truncate">{n.data.label}</span>
                          <span className="ml-auto text-cyan-500/40 text-[10px]">+</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      <div className="px-3.5 py-2.5 border-t border-white/[0.07]">
        <button onClick={onDelete} className="w-full text-red-400/50 hover:text-red-400/80 text-xs border border-red-500/[0.1] hover:border-red-500/25 rounded-lg py-1.5 transition-colors">
          Verwijder node
        </button>
      </div>
    </div>
  )
}

function TargetSelect({ label, value, targets, onChange }: {
  label: string
  value: string
  targets: WFNode[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0f0f0f] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none">
        <option value="">Niet ingesteld</option>
        {targets.map((target) => (
          <option key={target.id} value={target.id}>{target.data.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── RunRow ─────────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: PipelineRun }) {
  const color = run.status === 'completed' ? 'text-emerald-400' : run.status === 'failed' ? 'text-red-400' : 'text-amber-400'
  const duration = run.completed_at && run.started_at
    ? `${((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s` : null
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#111111] border border-white/[0.06] rounded-lg text-xs">
      <span className={`${color} font-medium w-16 flex-shrink-0`}>{run.status}</span>
      <span className="text-white/30 flex-1">{new Date(run.started_at).toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      {duration && <span className="text-white/20 flex-shrink-0">{duration}</span>}
      {run.error && <span className="text-red-400/60 truncate max-w-xs" title={run.error}>{run.error}</span>}
    </div>
  )
}

// ── ModelPicker ───────────────────────────────────────────────────────────────

function ModelPicker({ value, onChange, modelGroups, loading, error, onRefresh }: {
  value: string; onChange: (model: string, orModel: ORouterModel | undefined) => void
  modelGroups: { label: string; options: ORouterModel[] }[]
  loading?: boolean; error?: string | null; onRefresh?: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const q = query.trim().toLowerCase()
  const allModels = modelGroups.flatMap((g) => g.options)
  const filtered = q ? allModels.filter((m) => m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q)) : allModels
  const filteredGroups = groupModels(filtered)

  function select(m: ORouterModel) { onChange(m.id, m); setOpen(false); setQuery('') }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input value={open ? query : value} onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }} placeholder={loading ? 'Modellen laden…' : 'Zoek model…'}
          disabled={loading} spellCheck={false}
          className="flex-1 bg-[#141414] border border-white/[0.08] border-r-0 text-white/70 text-sm rounded-l-lg px-3 py-2 focus:outline-none disabled:opacity-50" />
        <button onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); setQuery('') }} disabled={loading}
          className="bg-[#141414] border border-white/[0.08] text-white/40 hover:text-white/70 px-3 rounded-r-lg transition-colors disabled:opacity-50">
          {loading ? '…' : '▾'}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {error ? (
          <>
            <span className="text-red-400/70 text-[11px] flex-1">Laden mislukt: {error}</span>
            {onRefresh && <button onClick={onRefresh} className="text-white/40 hover:text-white/70 text-[11px] border border-white/[0.08] rounded px-2 py-0.5 transition-colors">Opnieuw</button>}
          </>
        ) : !loading && (
          <>
            <span className="text-white/15 text-[11px]">{modelGroups.reduce((n, g) => n + g.options.length, 0)} modellen geladen</span>
            {onRefresh && <button onClick={onRefresh} className="text-white/15 hover:text-white/40 text-[11px] transition-colors">↻</button>}
          </>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1c1c1c] border border-white/[0.1] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-white/30 text-xs px-4 py-3">Laden…</p>
          ) : filteredGroups.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-white/30 text-xs mb-2">Geen modellen gevonden. Je kunt het model-ID direct invoeren.</p>
              {onRefresh && <button onClick={onRefresh} className="text-white/40 hover:text-white/70 text-xs border border-white/[0.08] rounded px-2 py-1 transition-colors">Ververs lijst</button>}
            </div>
          ) : filteredGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pt-2.5 pb-1 sticky top-0 bg-[#1c1c1c]">
                <span className="text-white/20 text-[10px] uppercase tracking-widest font-medium">{group.label}</span>
              </div>
              {group.options.map((m) => (
                <button key={m.id} onMouseDown={(e) => { e.preventDefault(); select(m) }}
                  className={['w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2', m.id === value ? 'text-amber-400' : 'text-white/70'].join(' ')}>
                  <span className="truncate flex-1">{m.name || m.id}</span>
                  {isImageModel(m) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 flex-shrink-0">beeld</span>}
                  {m.name && m.name !== m.id && <span className="text-white/20 text-xs truncate flex-shrink-0 max-w-[120px]">{m.id}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isImageModel(m: ORouterModel): boolean {
  // Controleer het output_modalities array (nieuwste OpenRouter API-formaat)
  if ((m.architecture?.output_modalities ?? []).includes('image')) return true
  // Controleer legacy modality string ('image' of 'text->image')
  const mod = m.architecture?.modality ?? ''
  if (mod.includes('->image') || mod === 'image' || mod.includes('image->image')) return true
  // Fallback: detecteer op basis van provider/naam in het model-id
  return inferModalityFromId(m.id) === 'image'
}

const IMAGE_PROVIDERS = ['black-forest-labs', 'stability-ai', 'stabilityai', 'ideogram', 'recraft', 'sourceful', 'bytedance-seed', 'fal-ai']
const IMAGE_KEYWORDS = ['flux', 'stable-diffusion', 'sdxl', 'dall-e', 'imagen', 'midjourney', 'riverflow', 'seedream', 'ideogram', 'recraft']

function inferModalityFromId(modelId: string): 'text' | 'image' {
  const id = modelId.toLowerCase()
  const provider = id.split('/')[0] ?? ''
  if (IMAGE_PROVIDERS.includes(provider)) return 'image'
  if (IMAGE_KEYWORDS.some((kw) => id.includes(kw))) return 'image'
  return 'text'
}

function groupModels(models: ORouterModel[]): { label: string; options: ORouterModel[] }[] {
  const groups: Record<string, ORouterModel[]> = {}
  for (const m of models) {
    const provider = m.id.split('/')[0] ?? 'other'
    if (!groups[provider]) groups[provider] = []
    groups[provider].push(m)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([label, options]) => ({ label, options }))
}
