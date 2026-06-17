const KEY_PREFIX = 'huphe:atelier-module-prompt:'
const MODEL_KEY_PREFIX = 'huphe:atelier-module-models:'
const IMAGE_PIPELINE_KEY_PREFIX = 'huphe:atelier-image-pipeline:'

export type ImagePipelineSlot = 'generate' | 'edit' | 'mask-edit'

export const IMAGE_PIPELINE_SLOTS: { id: ImagePipelineSlot; label: string; trigger: string }[] = [
  {
    id: 'generate',
    label: 'Nieuw beeld',
    trigger: 'Actief wanneer er geen referentieafbeelding is',
  },
  {
    id: 'edit',
    label: 'Bewerken',
    trigger: 'Actief wanneer een bestaande afbeelding wordt bewerkt (geen masker)',
  },
  {
    id: 'mask-edit',
    label: 'Masker bewerken',
    trigger: 'Actief wanneer een masker is getekend op de afbeelding',
  },
]

const IMAGE_PIPELINE_DEFAULTS: Record<ImagePipelineSlot, string> = {
  generate: `Genereer een afbeelding op basis van de volgende beschrijving. Geef GEEN tekstuele reactie, genereer uitsluitend de afbeelding.

Beschrijving: {{prompt}}`,

  edit: `Je ontvangt een referentieafbeelding en een instructie. Voer uitsluitend de instructie uit. Verander niets anders aan de afbeelding — compositie, stijl, kleuren, achtergrond, belichting en alle overige details blijven exact hetzelfde.

Genereer de aangepaste afbeelding en geef GEEN tekstuele reactie.

Instructie: {{prompt}}`,

  'mask-edit': `Je ontvangt een afbeelding met een ORANJE gemarkeerd gebied. Pas uitsluitend het oranje gemarkeerde gebied aan volgens de instructie hieronder. Alles buiten het oranje gebied — compositie, stijl, kleuren, achtergrond, belichting — blijft precies zoals het is.

Genereer de aangepaste afbeelding en geef GEEN tekstuele reactie.

Instructie: {{prompt}}`,
}

export function loadImagePipelinePrompt(slot: ImagePipelineSlot): string {
  const stored = localStorage.getItem(`${IMAGE_PIPELINE_KEY_PREFIX}${slot}`)
  return stored ?? IMAGE_PIPELINE_DEFAULTS[slot]
}

export function saveImagePipelinePrompt(slot: ImagePipelineSlot, prompt: string) {
  if (prompt.trim() === IMAGE_PIPELINE_DEFAULTS[slot].trim()) {
    localStorage.removeItem(`${IMAGE_PIPELINE_KEY_PREFIX}${slot}`)
  } else {
    localStorage.setItem(`${IMAGE_PIPELINE_KEY_PREFIX}${slot}`, prompt)
  }
}

export function resetImagePipelinePrompt(slot: ImagePipelineSlot) {
  localStorage.removeItem(`${IMAGE_PIPELINE_KEY_PREFIX}${slot}`)
}

export function getDefaultImagePipelinePrompt(slot: ImagePipelineSlot): string {
  return IMAGE_PIPELINE_DEFAULTS[slot]
}

export const MODULE_TYPES = ['presentation', 'banners', 'print', 'images', 'video'] as const
export type ModuleType = typeof MODULE_TYPES[number]

export const MODULE_LABELS: Record<ModuleType, string> = {
  presentation: 'Presentaties',
  banners: 'Banners',
  print: 'Media / Print',
  images: 'Afbeeldingen',
  video: 'Video',
}

export type ModuleModelConfig = {
  id: string
  label: string
  model: string
  provider?: 'openrouter' | 'fal' | 'ollama' | 'custom'
  modality?: 'text' | 'image' | 'video'
}

export const DEFAULT_MODULE_MODELS: Record<ModuleType, ModuleModelConfig[]> = {
  presentation: [
    { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', model: 'anthropic/claude-sonnet-4-5', provider: 'openrouter', modality: 'text' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', model: 'google/gemini-2.5-pro', provider: 'openrouter', modality: 'text' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', model: 'openai/gpt-4o', provider: 'openrouter', modality: 'text' },
  ],
  banners: [
    { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', model: 'anthropic/claude-sonnet-4-5', provider: 'openrouter', modality: 'text' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', model: 'google/gemini-2.5-pro', provider: 'openrouter', modality: 'text' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', model: 'openai/gpt-4o', provider: 'openrouter', modality: 'text' },
  ],
  print: [
    { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', model: 'anthropic/claude-sonnet-4-5', provider: 'openrouter', modality: 'text' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', model: 'google/gemini-2.5-pro', provider: 'openrouter', modality: 'text' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', model: 'openai/gpt-4o', provider: 'openrouter', modality: 'text' },
  ],
  images: [
    { id: 'nanobanana/nano-banana-pro', label: 'Nano Banana Pro', model: 'nanobanana/nano-banana-pro', provider: 'openrouter', modality: 'image' },
    { id: 'black-forest-labs/flux-1.1-pro', label: 'FLUX 1.1 Pro', model: 'black-forest-labs/flux-1.1-pro', provider: 'openrouter', modality: 'image' },
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (image)', model: 'google/gemini-2.0-flash-exp:free', provider: 'openrouter', modality: 'image' },
    { id: 'openai/gpt-4o-image', label: 'GPT-4o Image', model: 'openai/gpt-4o-image', provider: 'openrouter', modality: 'image' },
    { id: 'ideogram-ai/ideogram-v2', label: 'Ideogram v2', model: 'ideogram-ai/ideogram-v2', provider: 'openrouter', modality: 'image' },
  ],
  video: [
    { id: 'google/veo-3', label: 'Veo 3', model: 'google/veo-3', provider: 'openrouter', modality: 'video' },
    { id: 'minimax/video-01', label: 'MiniMax Video-01', model: 'minimax/video-01', provider: 'openrouter', modality: 'video' },
    { id: 'luma/ray-2-720p', label: 'Luma Ray 2', model: 'luma/ray-2-720p', provider: 'openrouter', modality: 'video' },
    { id: 'wan-ai/wan-2.1-t2v-turbo', label: 'Wan 2.1 Turbo', model: 'wan-ai/wan-2.1-t2v-turbo', provider: 'openrouter', modality: 'video' },
  ],
}

// Embedded defaults — editable per module in admin
const DEFAULTS: Record<ModuleType, string> = {
  presentation: `Je bent de presentatie module van HupheAI Atelier.

Minimum vereisten voor een presentatie:
- Onderwerp: waar gaat het over?
- Aantal slides: hoeveel? (standaard 8, max 30)
- Stijl/template: vrij of specifiek template? (optioneel)

Werkwijze:
1. Begrijp het onderwerp en de doelgroep
2. Vraag alleen wat echt ontbreekt voor een goede opzet
3. Zodra onderwerp en aantal duidelijk zijn: bevestig kort wat je gaat maken en welke stijl je gebruikt

Let op: voeg NOOIT het woord KLAAR toe — de app genereert automatisch via de intent-parser zodra alles bekend is.`,

  banners: `Je bent de banner module van HupheAI Atelier.

Minimum vereisten voor een bannerset:
- Heading: pakkende hoofdtekst (max 6 woorden)
- Copy: ondersteunende tekst (max 10 woorden)
- CTA: call-to-action knoptekst (max 3 woorden, bijv. "Meer weten")

Werkwijze:
1. Begrijp het merk, product of campagne
2. Als het onderwerp duidelijk is: genereer direct teksten en sluit af met het KLAAR-signaal
3. Als er iets onduidelijk is: stel maximaal één gerichte vraag

Zodra je heading, copy en CTA kunt schrijven, sluit je bericht af met (op een nieuwe aparte regel):
KLAAR:{"heading":"...","copy":"...","cta":"..."}

Regels:
- Schrijf heading, copy en cta altijd zelf op basis van het gesprek
- KLAAR pas toevoegen als je genoeg context hebt
- Noem het woord KLAAR nooit in gewone conversatietekst`,

  print: `Je bent de advertentie/media module van HupheAI Atelier.

Minimum vereisten voor een print-advertentie:
- Headline (title): pakkende titel, max 8 woorden
- Bodycopy (body): ondersteunende tekst, max 2 zinnen
- Afbeelding: vraag of de gebruiker er al een heeft of er een wil laten genereren
- Formaat: bijv. A4 staand, Instagram Post, LinkedIn Banner (optioneel, de gebruiker kan dit in het formulier kiezen)

Werkwijze:
1. Begrijp het onderwerp en de doelstelling van de advertentie
2. Vraag per keer naar één ding dat je nog niet weet
3. Zodra je title en body kunt schrijven (en je weet wat er met de afbeelding moet): genereer de teksten en sluit af met het KLAAR-signaal

Zodra je genoeg weet, sluit je bericht af met (op een nieuwe aparte regel):
KLAAR:{"title":"...","body":"..."}

Regels:
- Schrijf title en body altijd zelf op basis van het gesprek
- KLAAR pas toevoegen als je genoeg context hebt
- Noem het woord KLAAR nooit in gewone conversatietekst`,
}

export function loadModulePrompt(type: string): string {
  const stored = localStorage.getItem(`${KEY_PREFIX}${type}`)
  return stored ?? DEFAULTS[type as ModuleType] ?? ''
}

export function saveModulePrompt(type: string, prompt: string) {
  if (prompt.trim() === DEFAULTS[type as ModuleType]?.trim()) {
    localStorage.removeItem(`${KEY_PREFIX}${type}`)
  } else {
    localStorage.setItem(`${KEY_PREFIX}${type}`, prompt)
  }
}

export function resetModulePrompt(type: string) {
  localStorage.removeItem(`${KEY_PREFIX}${type}`)
}

export function getDefaultModulePrompt(type: string): string {
  return DEFAULTS[type as ModuleType] ?? ''
}

export function loadModuleModels(type: string): ModuleModelConfig[] {
  try {
    const stored = localStorage.getItem(`${MODEL_KEY_PREFIX}${type}`)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // Fall back to defaults when local config is malformed.
  }
  return DEFAULT_MODULE_MODELS[type as ModuleType] ?? []
}

export function saveModuleModels(type: string, models: ModuleModelConfig[]) {
  localStorage.setItem(`${MODEL_KEY_PREFIX}${type}`, JSON.stringify(models))
  window.dispatchEvent(new CustomEvent('huphe:atelier-module-models-changed', { detail: { type } }))
}

export function resetModuleModels(type: string) {
  localStorage.removeItem(`${MODEL_KEY_PREFIX}${type}`)
  window.dispatchEvent(new CustomEvent('huphe:atelier-module-models-changed', { detail: { type } }))
}

export function getDefaultModuleModels(type: string): ModuleModelConfig[] {
  return DEFAULT_MODULE_MODELS[type as ModuleType] ?? []
}
