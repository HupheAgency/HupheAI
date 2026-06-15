import { useEffect, useRef } from 'react'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { supabase } from '../lib/supabase'

const YJS_EVENT = 'yjs-update'
const AWARENESS_EVENT = 'yjs-awareness'

export interface YjsProvider {
  awareness: Awareness
}

export function useYjsCollaboration(documentId: string | undefined, ydoc: Y.Doc): YjsProvider {
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const awarenessRef = useRef<Awareness | null>(null)

  if (!awarenessRef.current) {
    awarenessRef.current = new Awareness(ydoc)
  }

  const awareness = awarenessRef.current

  useEffect(() => {
    if (!documentId || !supabase) return

    channelRef.current?.unsubscribe()

    const channel = supabase
      .channel(`tw-yjs:${documentId}`)
      .on(
        'broadcast',
        { event: YJS_EVENT },
        ({ payload }: { payload: { update: number[] } }) => {
          Y.applyUpdate(ydoc, new Uint8Array(payload.update), 'remote')
        },
      )
      .on(
        'broadcast',
        { event: AWARENESS_EVENT },
        ({ payload }: { payload: { update: number[] } }) => {
          applyAwarenessUpdate(awareness, new Uint8Array(payload.update), 'remote')
        },
      )
      .subscribe()

    channelRef.current = channel

    function handleYjsUpdate(update: Uint8Array, origin: unknown) {
      if (origin === 'remote') return
      channel.send({
        type: 'broadcast',
        event: YJS_EVENT,
        payload: { update: Array.from(update) },
      })
    }

    function handleAwarenessUpdate(
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) {
      if (origin === 'remote') return
      const changed = [...added, ...updated, ...removed]
      if (!changed.includes(awareness.clientID)) return
      const update = encodeAwarenessUpdate(awareness, [awareness.clientID])
      channel.send({
        type: 'broadcast',
        event: AWARENESS_EVENT,
        payload: { update: Array.from(update) },
      })
    }

    ydoc.on('update', handleYjsUpdate)
    awareness.on('update', handleAwarenessUpdate)

    return () => {
      ydoc.off('update', handleYjsUpdate)
      awareness.off('update', handleAwarenessUpdate)
      awareness.setLocalState(null)
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [documentId, ydoc, awareness])

  return { awareness }
}
