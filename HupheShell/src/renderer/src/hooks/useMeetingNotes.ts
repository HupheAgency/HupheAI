import { useEffect, useRef, useState } from 'react'

export interface NoteChunk {
  slideIdx: number
  slideHeading: string
  text: string
  timestamp: string
}

export interface SlideNote {
  slideIdx: number
  slideHeading: string
  bullets: string[]
}

interface UseMeetingNotesOptions {
  activeIdx: number
  blocks: Array<{ heading: string }>
}

const CHUNK_DURATION_MS = 12_000 // 12 seconds per recording chunk

export function useMeetingNotes({ activeIdx, blocks }: UseMeetingNotesOptions) {
  const [isRecording, setIsRecording]   = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [chunks, setChunks]             = useState<NoteChunk[]>([])
  const [notes, setNotes]               = useState<SlideNote[]>([])
  const [summarizing, setSummarizing]   = useState(false)
  const [error, setError]               = useState('')

  const isRecordingRef  = useRef(false)
  const streamRef       = useRef<MediaStream | null>(null)
  const recorderRef     = useRef<MediaRecorder | null>(null)
  const activeSlideRef  = useRef({ idx: activeIdx, heading: '' })
  const chunkSlideRef   = useRef({ idx: activeIdx, heading: '' }) // slide at start of chunk

  useEffect(() => {
    activeSlideRef.current = {
      idx:     activeIdx,
      heading: blocks[activeIdx]?.heading?.trim() || `Slide ${activeIdx + 1}`,
    }
  }, [activeIdx, blocks])

  function recordNextChunk() {
    if (!isRecordingRef.current || !streamRef.current) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    // Snapshot the slide at the START of this chunk
    chunkSlideRef.current = { ...activeSlideRef.current }

    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    const parts: BlobPart[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data)
    }

    recorder.onstop = async () => {
      if (!isRecordingRef.current && parts.length === 0) return
      if (parts.length === 0) return

      const blob = new Blob(parts, { type: mimeType })
      if (blob.size < 2000) {
        // Too small — likely silence, skip transcription
        if (isRecordingRef.current) recordNextChunk()
        return
      }

      setTranscribing(true)
      try {
        const arrayBuffer = await blob.arrayBuffer()
        const { idx, heading } = chunkSlideRef.current
        const result = await (window as any).api.transcribeAudio({
          audioBuffer: arrayBuffer,
          mimeType,
        })
        if (result.ok && result.text?.trim()) {
          setChunks((prev) => [
            ...prev,
            { slideIdx: idx, slideHeading: heading, text: result.text.trim(), timestamp: new Date().toISOString() },
          ])
        } else if (result.error && result.error !== 'leeg') {
          setError(result.error)
        }
      } catch (err: any) {
        setError(`Transcriptie mislukt: ${err.message}`)
      } finally {
        setTranscribing(false)
      }

      if (isRecordingRef.current) recordNextChunk()
    }

    recorderRef.current = recorder
    recorder.start()

    // Stop after chunk duration to process and restart
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, CHUNK_DURATION_MS)
  }

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current    = stream
      isRecordingRef.current = true
      setIsRecording(true)
      recordNextChunk()
    } catch (err: any) {
      setError('Microfoon toegang geweigerd. Geef toegang via Systeeminstellingen → Privacy → Microfoon.')
    }
  }

  function stopRecording() {
    isRecordingRef.current = false
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    setIsRecording(false)
  }

  async function summarize() {
    if (chunks.length === 0) return
    setSummarizing(true)
    setError('')
    try {
      const result = await (window as any).api.meetingNotesSummarize({ chunks })
      if (result.ok) {
        setNotes(result.notes as SlideNote[])
      } else {
        setError(result.error ?? 'Samenvatten mislukt.')
      }
    } finally {
      setSummarizing(false)
    }
  }

  function clear() {
    setChunks([])
    setNotes([])
    setError('')
  }

  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return { isRecording, transcribing, chunks, notes, summarizing, error, startRecording, stopRecording, summarize, clear }
}
