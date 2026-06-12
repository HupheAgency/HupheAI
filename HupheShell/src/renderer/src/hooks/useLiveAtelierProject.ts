import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  setAtelierProjectLive,
  disableAtelierProjectLive,
  syncAtelierProjectData,
  fetchAtelierProjectById,
} from '../lib/atelier-project-sync'

export interface LiveAtelierProjectHandle {
  isLive: boolean
  isOwner: boolean
  shareCode: string | null
  saving: boolean
  enable: (projectId: string, type: string, name: string, data: unknown, ownerId: string, createdAt: string) => Promise<string | null>
  disable: (projectId: string) => void
  syncState: (projectId: string, data: unknown) => void
  connectToExisting: (projectId: string) => Promise<{ type: string; name: string; data: unknown } | null>
  reset: () => void
}

export function useLiveAtelierProject(
  onRemoteUpdate: (projectId: string, data: unknown) => void,
): LiveAtelierProjectHandle {
  const [isLive,    setIsLive]    = useState(false)
  const [isOwner,   setIsOwner]   = useState(false)
  const [shareCode, setShareCode] = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)

  const channelRef  = useRef<RealtimeChannel | null>(null)
  const ignoreRef   = useRef(false)
  const syncTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef  = useRef<{ projectId: string; data: unknown } | null>(null)

  const subscribe = useCallback((projectId: string) => {
    channelRef.current?.unsubscribe()
    channelRef.current = supabase!
      .channel(`atelier-project:${projectId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'atelier_projects', filter: `id=eq.${projectId}` },
        (payload) => {
          if (ignoreRef.current) { ignoreRef.current = false; return }
          const row = payload.new as { data: unknown }
          onRemoteUpdate(projectId, row.data)
        },
      )
      .subscribe()
  }, [onRemoteUpdate])

  const enable = useCallback(async (
    projectId: string,
    type: string,
    name: string,
    data: unknown,
    ownerId: string,
    createdAt: string,
  ): Promise<string | null> => {
    if (!supabase) return null
    setSaving(true)
    try {
      const { pushAtelierProjectToSupabase } = await import('../lib/atelier-project-sync')
      await pushAtelierProjectToSupabase(projectId, type, name, data, ownerId, createdAt)
      const code = await setAtelierProjectLive(projectId)
      if (!code) return null
      setIsLive(true)
      setIsOwner(true)
      setShareCode(code)
      subscribe(projectId)
      return code
    } finally {
      setSaving(false)
    }
  }, [subscribe])

  const disable = useCallback((projectId: string) => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    channelRef.current?.unsubscribe()
    channelRef.current = null
    disableAtelierProjectLive(projectId)
    setIsLive(false)
    setIsOwner(false)
  }, [])

  const syncState = useCallback((projectId: string, data: unknown) => {
    if (!isLive) return
    pendingRef.current = { projectId, data }
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      const pending = pendingRef.current
      if (!pending) return
      ignoreRef.current = true
      await syncAtelierProjectData(pending.projectId, pending.data)
    }, 400)
  }, [isLive])

  const connectToExisting = useCallback(async (projectId: string) => {
    if (!supabase) return null
    const remote = await fetchAtelierProjectById(projectId)
    if (!remote) return null
    const { data: { user } } = await supabase.auth.getUser()
    setIsLive(true)
    setIsOwner(user?.id === remote.ownerId)
    setShareCode(remote.shareCode)
    subscribe(projectId)
    return { type: remote.type, name: remote.name, data: remote.data }
  }, [subscribe])

  const reset = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    channelRef.current?.unsubscribe()
    channelRef.current = null
    setIsLive(false)
    setIsOwner(false)
    setShareCode(null)
  }, [])

  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe()
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [])

  return { isLive, isOwner, shareCode, saving, enable, disable, syncState, connectToExisting, reset }
}
