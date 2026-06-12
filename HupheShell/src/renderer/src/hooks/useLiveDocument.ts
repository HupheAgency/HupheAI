import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { TypewriterDocument } from '../lib/typewriter-documents'
import { pushDocumentToSupabase } from '../lib/typewriter-sync'

type RemoteUpdate = Pick<TypewriterDocument, 'id' | 'content' | 'title' | 'updatedAt'>

export interface LiveDocumentHandle {
  syncDocument: (doc: TypewriterDocument) => void
}

export function useLiveDocument(
  documentId: string | undefined,
  ownerId: string | null,
  onRemoteUpdate: (update: RemoteUpdate) => void,
): LiveDocumentHandle {
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ownerIdRef = useRef(ownerId)
  const onRemoteUpdateRef = useRef(onRemoteUpdate)

  useEffect(() => { ownerIdRef.current = ownerId }, [ownerId])
  useEffect(() => { onRemoteUpdateRef.current = onRemoteUpdate }, [onRemoteUpdate])

  useEffect(() => {
    if (!documentId || !supabase) return

    const channel = supabase
      .channel(`typewriter-doc:${documentId}`)
      .on('broadcast', { event: 'doc-change' }, (payload: { payload: RemoteUpdate }) => {
        onRemoteUpdateRef.current(payload.payload)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [documentId])

  const syncDocument = useCallback((doc: TypewriterDocument) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      const oid = ownerIdRef.current
      if (oid) await pushDocumentToSupabase(doc, oid)

      channelRef.current?.send({
        type: 'broadcast',
        event: 'doc-change',
        payload: {
          id: doc.id,
          content: doc.content,
          title: doc.title,
          updatedAt: doc.updatedAt,
        } satisfies RemoteUpdate,
      })
    }, 400)
  }, [])

  return { syncDocument }
}
