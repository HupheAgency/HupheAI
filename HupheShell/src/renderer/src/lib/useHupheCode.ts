/**
 * useHupheCode — React hook voor de Huphe Code AI pipeline
 *
 * Gebruik:
 *   const { state, logs, submitTask, resetPipeline } = useHupheCode()
 *
 * Push-events komen via de preload als CustomEvents (zelfde patroon als wizard).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ───────────────────────────────────────────────────────────────────────────
//  Types
// ───────────────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | 'IDLE'
  | 'AUDITING'
  | 'BUILDING'
  | 'TESTING'
  | 'REVIEWING'
  | 'DONE'
  | 'FAILED'

export interface PipelineState {
  status: PipelineStatus
  task: string
  currentNode?: string
  patchLoop?: number
  error?: string
  submittedAt?: string
  updatedAt?: string
}

export interface PipelineLogEntry {
  ts: string
  tag: string
  msg: string
}

export interface SubmitOptions {
  screenshotPath?: string
  designSpecPath?: string
  projectPath?: string
}

// ───────────────────────────────────────────────────────────────────────────
//  Status metadata (voor UI badge kleuren / labels)
// ───────────────────────────────────────────────────────────────────────────

export const STATUS_META: Record<PipelineStatus, { label: string; color: string; node: string }> = {
  IDLE:      { label: 'Inactief',    color: '#6B7280', node: '—' },
  AUDITING:  { label: 'Auditing',   color: '#F59E0B', node: 'GLM-5 Auditor' },
  BUILDING:  { label: 'Bouwen',     color: '#3B82F6', node: 'Claude Builder' },
  TESTING:   { label: 'Testen',     color: '#8B5CF6', node: 'OpenClaw Operator' },
  REVIEWING: { label: 'QA Review',  color: '#EC4899', node: 'GPT-5 QA' },
  DONE:      { label: 'Klaar ✅',   color: '#10B981', node: '—' },
  FAILED:    { label: 'Mislukt ❌', color: '#EF4444', node: '—' },
}

// ───────────────────────────────────────────────────────────────────────────
//  Hook
// ───────────────────────────────────────────────────────────────────────────

const MAX_LOG_LINES = 200

export function useHupheCode() {
  const [state, setState]   = useState<PipelineState>({ status: 'IDLE', task: '' })
  const [logs, setLogs]     = useState<PipelineLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  // Keep a ref so event handlers always close over the latest state
  const stateRef = useRef(state)
  stateRef.current = state

  // ─── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    ;(window as any).api?.hupheCode?.getState().then((s: PipelineState) => {
      if (s) setState(s)
    }).catch(() => {/* pipeline dir not yet initialised — silent */})
  }, [])

  // ─── Subscribe to live push events ───────────────────────────────────────
  useEffect(() => {
    const onStateUpdate = (e: Event) => {
      const s = (e as CustomEvent<PipelineState>).detail
      setState(s)
    }

    const onLog = (e: Event) => {
      const entry = (e as CustomEvent<PipelineLogEntry>).detail
      setLogs(prev => [...prev.slice(-(MAX_LOG_LINES - 1)), entry])
    }

    window.addEventListener('huphe-code:state-update', onStateUpdate)
    window.addEventListener('huphe-code:log', onLog)
    return () => {
      window.removeEventListener('huphe-code:state-update', onStateUpdate)
      window.removeEventListener('huphe-code:log', onLog)
    }
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const submitTask = useCallback(async (task: string, opts: SubmitOptions = {}) => {
    setLoading(true)
    try {
      const result = await (window as any).api?.hupheCode?.submitTask(task, opts)
      if (result && !result.ok) {
        console.error('[useHupheCode] submitTask error:', result.error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const resetPipeline = useCallback(async () => {
    await (window as any).api?.hupheCode?.setState({ status: 'IDLE', task: '', patchLoop: 0, error: null })
    setLogs([])
  }, [])

  const forceStage = useCallback(async (status: PipelineStatus) => {
    await (window as any).api?.hupheCode?.setState({ status })
  }, [])

  return {
    state,
    logs,
    loading,
    statusMeta: STATUS_META[state.status],
    submitTask,
    resetPipeline,
    forceStage,
  }
}
