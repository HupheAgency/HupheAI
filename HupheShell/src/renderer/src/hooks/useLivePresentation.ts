import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// The hook treats blocks/overrides as opaque JSON — no local Block type needed.
type AnyBlocks   = unknown[]
type AnyOverrides = Record<string, unknown>

export interface LiveMember {
  user_id: string
  role: string
}

interface Options {
  onRemoteUpdate: (blocks: AnyBlocks, overrides: AnyOverrides) => void
  onRemoteSlideChange?: (idx: number) => void
  onRemoteThemeChange?: (templateClientId: string) => void
}

export interface LivePresentationHandle {
  presentationId: string | null
  isLive: boolean
  isOwner: boolean
  shareCode: string | null
  members: LiveMember[]
  saving: boolean
  enable: (opts: {
    name: string
    templateClientId: string
    blocks: AnyBlocks
    overrides: AnyOverrides
    mdText: string
    existingId?: string
  }) => Promise<{ id: string; shareCode: string } | null>
  connectToExisting: (presentationId: string) => Promise<{ templateClientId: string | null; name: string | null; blocks: AnyBlocks | null; overrides: AnyOverrides | null } | null>
  disable: (fallbackId?: string) => void
  syncState: (blocks: AnyBlocks, overrides: AnyOverrides) => void
  syncSlideIndex: (idx: number) => void
  syncTheme: (templateClientId: string) => void
  loadMembers: (presentationId: string) => Promise<void>
}

function generateShareCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function useLivePresentation({ onRemoteUpdate, onRemoteSlideChange, onRemoteThemeChange }: Options): LivePresentationHandle {
  const [presentationId, setPresentationId] = useState<string | null>(null)
  const [isLive,         setIsLive]         = useState(false)
  const [isOwner,        setIsOwner]        = useState(false)
  const [shareCode,      setShareCode]      = useState<string | null>(null)
  const [members,        setMembers]        = useState<LiveMember[]>([])
  const [saving,         setSaving]         = useState(false)

  const channelRef  = useRef<RealtimeChannel | null>(null)
  // Set to true just before we write so the echoed realtime event is ignored.
  const ignoreRef   = useRef(false)
  const syncTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSync = useRef<{ blocks: AnyBlocks; overrides: AnyOverrides } | null>(null)

  const subscribe = useCallback((id: string) => {
    channelRef.current?.unsubscribe()
    channelRef.current = supabase!
      .channel(`presentation:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'presentations', filter: `id=eq.${id}` },
        (payload) => {
          if (ignoreRef.current) { ignoreRef.current = false; return }
          const row = payload.new as { blocks: AnyBlocks; overrides: AnyOverrides }
          onRemoteUpdate(row.blocks, row.overrides)
        },
      )
      .on('broadcast', { event: 'slide-change' }, (payload) => {
        onRemoteSlideChange?.(payload.payload?.idx as number)
      })
      .on('broadcast', { event: 'theme-change' }, (payload) => {
        const tcid = payload.payload?.templateClientId as string | undefined
        if (tcid) onRemoteThemeChange?.(tcid)
      })
      .subscribe()
  }, [onRemoteUpdate, onRemoteSlideChange, onRemoteThemeChange])

  const enable = useCallback(async (opts: {
    name: string
    templateClientId: string
    blocks: AnyBlocks
    overrides: AnyOverrides
    mdText: string
    existingId?: string
  }) => {
    if (!supabase) return null
    setSaving(true)
    try {
      const code = generateShareCode()
      const payload = {
        name:               opts.name,
        template_client_id: opts.templateClientId,
        blocks:             opts.blocks,
        overrides:          opts.overrides,
        md_text:            opts.mdText,
        is_live:            true,
        share_code:         code,
      }
      let data: { id: string; share_code: string } | null = null
      if (opts.existingId) {
        const { data: d, error } = await supabase
          .from('presentations')
          .update(payload)
          .eq('id', opts.existingId)
          .select('id, share_code')
          .single()
        if (error) throw error
        data = d
      } else {
        const { data: d, error } = await supabase
          .from('presentations')
          .insert(payload)
          .select('id, share_code')
          .single()
        if (error) throw error
        data = d
      }
      if (!data) throw new Error('Geen data teruggekomen van Supabase')
      setPresentationId(data.id)
      setShareCode(data.share_code)
      setIsLive(true)
      setIsOwner(true)
      subscribe(data.id)
      return { id: data.id, shareCode: data.share_code as string }
    } finally {
      setSaving(false)
    }
  }, [subscribe])

  // Join an already-existing live session (used when opening via share code)
  const connectToExisting = useCallback(async (id: string) => {
    if (!supabase) return null
    setPresentationId(id)
    setIsLive(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('presentations')
      .select('share_code, owner_id, template_client_id, name, blocks, overrides')
      .eq('id', id)
      .single()
    if (data?.share_code) setShareCode(data.share_code)
    setIsOwner(user?.id === data?.owner_id)
    subscribe(id)
    return {
      templateClientId: (data?.template_client_id as string | null) ?? null,
      name: (data?.name as string | null) ?? null,
      blocks: (data?.blocks as AnyBlocks | null) ?? null,
      overrides: (data?.overrides as AnyOverrides | null) ?? null,
    }
  }, [subscribe])

  const disable = useCallback((fallbackId?: string) => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    channelRef.current?.unsubscribe()
    channelRef.current = null
    const idToDisable = presentationId ?? fallbackId ?? null
    if (idToDisable && supabase) {
      supabase.from('presentations').update({ is_live: false }).eq('id', idToDisable)
    }
    setIsLive(false)
    setIsOwner(false)
  }, [presentationId])

  const syncState = useCallback((blocks: AnyBlocks, overrides: AnyOverrides) => {
    if (!presentationId || !isLive || !supabase) return
    const client = supabase
    const pid    = presentationId
    pendingSync.current = { blocks, overrides }
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      const pending = pendingSync.current
      if (!pending) return
      ignoreRef.current = true
      await client.rpc('sync_presentation_state', {
        p_id:        pid,
        p_blocks:    pending.blocks as unknown as Record<string, unknown>,
        p_overrides: pending.overrides,
      })
    }, 400)
  }, [presentationId, isLive])

  const slideIndexTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncSlideIndex = useCallback((idx: number) => {
    if (!channelRef.current) return
    if (slideIndexTimer.current) clearTimeout(slideIndexTimer.current)
    slideIndexTimer.current = setTimeout(() => {
      channelRef.current?.send({ type: 'broadcast', event: 'slide-change', payload: { idx } })
    }, 150)
  }, [])

  // Broadcast a theme switch so connected viewers update immediately.
  // Late joiners pick up the theme via connectToExisting (DB), so no-op when offline.
  const syncTheme = useCallback((templateClientId: string) => {
    channelRef.current?.send({ type: 'broadcast', event: 'theme-change', payload: { templateClientId } })
  }, [])

  const loadMembers = useCallback(async (id: string) => {
    if (!supabase) return
    const { data } = await supabase
      .from('presentation_members')
      .select('user_id, role')
      .eq('presentation_id', id)
    setMembers(data ?? [])
  }, [])

  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe()
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [])

  return {
    presentationId,
    isLive,
    isOwner,
    shareCode,
    members,
    saving,
    enable,
    connectToExisting,
    disable,
    syncState,
    syncSlideIndex,
    syncTheme,
    loadMembers,
  }
}