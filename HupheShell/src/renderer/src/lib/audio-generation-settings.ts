export interface AudioGenerationSettings {
  duration?: number
  editMode?: 'remix' | 'lyrics'
  extendBeforeDuration?: number
  extendAfterDuration?: number
  promptInfluence?: number
  audioFormat?: 'wav' | 'mp3' | 'aac' | 'flac'
  keepSpeechVocal?: boolean
}

const KEY_PREFIX = 'huphe:audio-generation-settings:'

export function loadAudioGenerationSettings(modelId: string): Partial<AudioGenerationSettings> | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${modelId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAudioGenerationSettings(modelId: string, settings: AudioGenerationSettings) {
  try {
    localStorage.setItem(`${KEY_PREFIX}${modelId}`, JSON.stringify(settings))
  } catch {
    // Instellingen zijn een UI-gemak; falen met opslaan mag generatie niet blokkeren.
  }
}
