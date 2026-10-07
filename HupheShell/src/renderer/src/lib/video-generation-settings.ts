export interface VideoGenerationSettings {
  duration: number | 'auto'
  resolution: string
  aspectRatio: string
  generateAudio: boolean
  seed?: number
  bitrateMode?: string
  codec?: string
  draft?: boolean
}

const KEY_PREFIX = 'huphe:video-generation-settings:'

export function loadVideoGenerationSettings(modelId: string): Partial<VideoGenerationSettings> | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${modelId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveVideoGenerationSettings(modelId: string, settings: VideoGenerationSettings) {
  try {
    localStorage.setItem(`${KEY_PREFIX}${modelId}`, JSON.stringify(settings))
  } catch {
    // Instellingen zijn een UI-gemak; falen met opslaan mag generatie niet blokkeren.
  }
}
