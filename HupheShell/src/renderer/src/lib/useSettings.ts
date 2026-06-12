/**
 * useSettings — React hook voor dual-mode configuratie (Antigravity ↔ API)
 *
 * Gebruik:
 *   const { config, isLoading, isSwitching, setMode, recheckAntigravity } = useSettings()
 *
 * Push-events komen via de preload als CustomEvent 'huphe:mode-changed'.
 */

import { useCallback, useEffect, useState } from 'react'

// ───────────────────────────────────────────────────────────────────────────
//  Types
// ───────────────────────────────────────────────────────────────────────────

export type AIMode = 'api' | 'antigravity'
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface SettingsConfig {
  mode: AIMode
  antigravity: {
    mcpServerPath:    string
    connectionStatus: ConnectionStatus
    lastChecked:      string | null
  }
  api: {
    defaultProvider: string
    claudeModel:     string
    openaiModel:     string
    googleModel:     string
  }
  activeProjectPath: string | null
  keys: {
    claude:     boolean
    openai:     boolean
    openrouter: boolean
    google:     boolean
  }
  updatedAt: string
}

// ───────────────────────────────────────────────────────────────────────────
//  Hook
// ───────────────────────────────────────────────────────────────────────────

const api = () => (window as any).api?.settings

export function useSettings() {
  const [config, setConfig]       = useState<SettingsConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitching, setIsSwitching] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // ─── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    api()?.getConfig()
      .then((c: SettingsConfig) => { if (c) setConfig(c) })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false))
  }, [])

  // ─── Live push events ────────────────────────────────────────────────────
  useEffect(() => {
    const onModeChanged = (e: Event) => {
      const c = (e as CustomEvent<SettingsConfig>).detail
      if (c) setConfig(c)
    }
    window.addEventListener('huphe:mode-changed', onModeChanged)
    return () => window.removeEventListener('huphe:mode-changed', onModeChanged)
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const setMode = useCallback(async (mode: AIMode) => {
    setIsSwitching(true)
    setError(null)
    try {
      const updated = await api()?.setMode(mode)
      if (updated?.error) throw new Error(updated.error)
      if (updated) setConfig(updated)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSwitching(false)
    }
  }, [])

  const recheckAntigravity = useCallback(async () => {
    setIsSwitching(true)
    setError(null)
    try {
      const updated = await api()?.recheckAntigravity()
      if (updated?.error) throw new Error(updated.error)
      if (updated) setConfig(updated)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSwitching(false)
    }
  }, [])

  const saveKey = useCallback(async (name: string, value: string) => {
    const result = await api()?.saveKey(name, value)
    if (result?.ok === false) throw new Error(result.error ?? 'Opslaan mislukt')
    // Refresh config so key indicators update
    const updated = await api()?.getConfig()
    if (updated) setConfig(updated)
  }, [])

  const patchConfig = useCallback(async (patch: Record<string, unknown>) => {
    const updated = await api()?.patchConfig(patch)
    if (updated?.error) throw new Error(updated.error)
    if (updated) setConfig(updated)
  }, [])

  const setProjectPath = useCallback(async (path: string | null) => {
    const result = await (window as any).api?.settings?.setProjectPath(path)
    if (result?.ok === false) throw new Error(result.error ?? 'Opslaan mislukt')
    // Reflect the change locally without waiting for a push event
    setConfig(prev => prev ? { ...prev, activeProjectPath: path } : prev)
  }, [])

  return {
    config,
    isLoading,
    isSwitching,
    error,
    setMode,
    recheckAntigravity,
    saveKey,
    patchConfig,
    setProjectPath,
  }
}
