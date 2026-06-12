import { useRef, useState } from 'react'

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'done' | 'error'

export interface VoiceCommandAction {
  action: 'update_slide'
  slideIndex: number
  changes: { heading?: string; body?: string }
  explanation: string
}

interface UseVoiceCommandOptions {
  blocks: { index: number; type: string; heading: string; body: string; fields: Record<string, string> }[]
  activeSlideIndex: number
  onAction: (action: VoiceCommandAction) => void
}

export function useVoiceCommand({ blocks, activeSlideIndex, onAction }: UseVoiceCommandOptions) {
  const [status,     setStatus]     = useState<VoiceStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [explanation, setExplanation] = useState('')
  const [error,      setError]      = useState('')
  const recognitionRef = useRef<any>(null)

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Spraakherkenning is niet beschikbaar in deze omgeving.')
      setStatus('error')
      return
    }

    setError('')
    setTranscript('')
    setExplanation('')
    setStatus('listening')

    const recognition = new SpeechRecognition()
    recognition.lang = 'nl-NL'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = async (e: any) => {
      const text: string = e.results[0][0].transcript
      setTranscript(text)
      setStatus('processing')

      const api = (window as any).api
      const result = await api.voiceCommand({ transcript: text, blocks, activeSlideIndex })

      if (result.ok) {
        setExplanation(result.action.explanation ?? '')
        setStatus('done')
        onAction(result.action as VoiceCommandAction)
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setError(result.error ?? 'Onbekende fout.')
        setStatus('error')
      }
    }

    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech') {
        setError('Geen spraak gedetecteerd. Probeer opnieuw.')
      } else if (e.error === 'not-allowed') {
        setError('Microfoon toegang geweigerd.')
      } else {
        setError(`Fout: ${e.error}`)
      }
      setStatus('error')
    }

    recognition.onend = () => {
      if (status === 'listening') setStatus('idle')
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setStatus('idle')
  }

  function dismiss() {
    setStatus('idle')
    setError('')
    setTranscript('')
    setExplanation('')
  }

  return { status, transcript, explanation, error, startListening, stopListening, dismiss }
}
