import { app, ipcMain, BrowserWindow, safeStorage, dialog } from 'electron'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { createWriteStream, existsSync as fsExistsSync, rmSync } from 'fs'
import { pipeline } from 'stream/promises'
const execAsync = promisify(execCb)
import { isModelInstalled, pullModel, analyzeImage, VISION_MODELS } from './lib/vision-model'
import { callOpenRouter, InsufficientCreditsError, WalletBlockedError } from './lib/proxy'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, watch as fsWatch, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, resolve, sep } from 'path'
import { createHash } from 'crypto'
import { tmpdir, homedir } from 'os'
import { fileURLToPath } from 'url'
import { z } from 'zod'

const SUPABASE_URL = (import.meta as any).env?.MAIN_VITE_SUPABASE_URL as string ?? ''
const SUPABASE_KEY = (import.meta as any).env?.MAIN_VITE_SUPABASE_KEY as string ?? ''
const OLLAMA_BASE = 'http://localhost:11434'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    console.warn(`[security] Ongeldige IPC payload geblokkeerd voor ${channel}:`, result.error.issues)
    throw new Error(`Ongeldige payload voor ${channel}`)
  }
  return result.data
}

const AccessTokenSchema = z.string().min(10).max(10000)
const ConversationIdSchema = z.string().min(1).max(200)
const AgentIdSchema = z.string().min(1).max(300)
const ModelNameSchema = z.string().min(1).max(300)
const PromptSchema = z.string().max(200000)
const EngineMessageContentSchema = z.union([
  z.string().max(200000),
  z.array(z.union([
    z.object({ type: z.literal('text'), text: z.string().max(200000) }),
    z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string().max(5_000_000) }) }),
  ])).max(100),
])
const EngineHistorySchema = z.array(z.object({
  role: z.string().max(40),
  content: EngineMessageContentSchema,
})).max(200)
const EngineAttachmentSchema = z.object({
  name: z.string().max(255),
  type: z.enum(['text', 'image']),
  content: z.string().max(5_000_000),
})

const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY)

const DEFAULT_CLOUD_AGENTS = [
  { id: '00000000-0000-0000-0000-000000000001', label: 'ChatGPT (GPT-4o)',      model: 'openai/gpt-4o',               description: 'OpenAI Flagship',    systemPrompt: '' },
  { id: '00000000-0000-0000-0000-000000000002', label: 'Gemini 1.5 Pro',        model: 'google/gemini-1.5-pro',        description: 'Google Flagship',    systemPrompt: '' },
  { id: '00000000-0000-0000-0000-000000000003', label: 'Claude 3.5 Sonnet',     model: 'anthropic/claude-3.5-sonnet',  description: 'Anthropic Flagship', systemPrompt: '' },
]

async function getOllamaStatus(): Promise<{ running: boolean; models: string[] }> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return { running: false, models: [] }
    const json = await res.json() as any
    const models: string[] = (json.models ?? []).map((m: any) => m.name as string)
    return { running: true, models }
  } catch {
    return { running: false, models: [] }
  }
}

function pickAtelierChatModel(models: string[], requested?: string): string | undefined {
  const normalizedRequested = requested?.replace(/^ollama\//, '')
  const usable = models.filter((model) => !isVisionOnlyOllamaModel(model))
  if (normalizedRequested && usable.includes(normalizedRequested)) return normalizedRequested

  const preferred = [
    'glm5',
    'glm-5',
    'glm4',
    'glm-4',
    'llama3.1',
    'llama3',
    'qwen2.5',
    'qwen2',
    'mistral',
    'gemma2',
    'gemma',
    'phi3',
  ]
  return usable.find((model) => preferred.some((name) => model.toLowerCase().startsWith(name)))
    ?? usable[0]
}

function isVisionOnlyOllamaModel(model: string): boolean {
  return /\b(llava|bakllava|moondream|minicpm-v|vision)\b/i.test(model)
}

function authedClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function loadKey(name: string): string | null {
  const p = join(app.getPath('userData'), `${name}.enc`)
  if (!existsSync(p)) return null
  try { return safeStorage.decryptString(readFileSync(p)) } catch { return null }
}

async function resolveCloudAgentModel(identifier?: string): Promise<string | null> {
  const raw = identifier?.trim()
  if (!raw || raw.startsWith('ollama/')) return null

  const defaultAgent = DEFAULT_CLOUD_AGENTS.find((agent) => agent.id === raw || agent.model === raw)
  if (defaultAgent) return defaultAgent.model

  if (raw.includes('/')) return raw
  if (!UUID_RE.test(raw)) return null

  const { data } = await anonClient
    .from('agents')
    .select('id, model')
    .eq('id', raw)
    .maybeSingle()

  return (data?.model as string | undefined) ?? null
}

function savedImagesDir(): string {
  return join(homedir(), 'Pictures', 'HupheAI')
}

function resolveSavedImagePath(src: string): string | null {
  const rawPath = src.startsWith('file://')
    ? (() => {
        try { return fileURLToPath(src) } catch { return src.replace('file://', '') }
      })()
    : src

  if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(rawPath)) return null

  const imagesDir = resolve(savedImagesDir())
  const filePath = resolve(rawPath)
  if (filePath !== imagesDir && !filePath.startsWith(`${imagesDir}${sep}`)) return null

  return filePath
}

// Modellen waarvan de output-modaliteit "image" bevat genereren beelden.
// OpenRouter geeft dit terug als architecture.modality, bijv. "text->text,image" of "text->image".
function outputModalitiesFromArchitecture(model: any): string[] {
  if (Array.isArray(model?.architecture?.output_modalities)) {
    return model.architecture.output_modalities.map((item: unknown) => String(item).toLowerCase())
  }
  const architectureModality = String(model?.architecture?.modality ?? '').toLowerCase()
  if (!architectureModality) return []
  const outputPart = architectureModality.includes('->')
    ? architectureModality.split('->').pop() ?? ''
    : architectureModality
  return outputPart.split(',').map((item) => item.trim()).filter(Boolean)
}

function isImageGenerationModel(model: string, modality?: string, label?: string): boolean {
  const value = `${model} ${label ?? ''}`.toLowerCase()
  if (modality) {
    const outputPart = modality.includes('->') ? modality.split('->')[1] : modality
    if (outputPart.toLowerCase().includes('image')) return true
  }
  // Fallback voor modellen zonder opgeslagen modality, of oude opgeslagen modellen
  // die nog als text->text in localStorage staan.
  const provider = value.split('/')[0] ?? ''
  const imageProviders = ['black-forest-labs', 'stability-ai', 'stabilityai', 'ideogram', 'ideogram-ai', 'recraft', 'recraft-ai', 'sourceful', 'bytedance-seed', 'fal-ai']
  const imageKeywords = ['image-preview', 'image-generation', 'nano-banana', 'banana', 'flux', 'stable-diffusion', 'sdxl', 'dall-e', 'imagen', 'midjourney', 'riverflow', 'seedream', 'recraft']
  return imageProviders.includes(provider) || imageKeywords.some((kw) => value.includes(kw))
}

function isKnownGenerationModel(model: any, wanted: 'image' | 'video'): boolean {
  const id = String(model?.id ?? '').toLowerCase()
  const name = String(model?.name ?? '').toLowerCase()
  const value = `${id} ${name}`
  const provider = id.split('/')[0] ?? ''

  if (wanted === 'image') {
    const imageProviders = ['black-forest-labs', 'stability-ai', 'stabilityai', 'ideogram', 'ideogram-ai', 'recraft', 'recraft-ai', 'sourceful', 'bytedance-seed', 'fal-ai']
    const imageKeywords = ['image-preview', 'image-generation', 'nano-banana', 'banana', 'flux', 'stable-diffusion', 'sdxl', 'dall-e', 'imagen', 'midjourney', 'riverflow', 'seedream', 'recraft']
    return imageProviders.includes(provider) || imageKeywords.some((keyword) => value.includes(keyword))
  }

  const videoProviders = ['runway', 'luma', 'pika', 'minimax', 'kling', 'wan']
  const videoKeywords = ['video-generation', 'text-to-video', 'image-to-video', 'veo', 'kling', 'runway', 'luma', 'pika', 'minimax', 'hailuo', 'seedance']
  return videoProviders.includes(provider) || videoKeywords.some((keyword) => value.includes(keyword))
}

function getGeneratedImagesDir(): string {
  const dir = join(app.getPath('userData'), 'generated-images')
  try { mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

function saveImageBuffer(buf: Buffer, ext: string): string {
  const dir = getGeneratedImagesDir()
  const filePath = join(dir, `huphe_generated_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
  writeFileSync(filePath, buf)
  return filePath
}

// Converteert een OpenRouter image object naar [IMAGE:...] token.
// HTTP URLs worden meteen gedownload zodat ze niet verlopen.
async function imageObjectToToken(img: any): Promise<string> {
  let httpUrl = ''
  let b64 = ''

  if (typeof img === 'string') {
    if (img.startsWith('http')) httpUrl = img
    else if (img.startsWith('file://')) return `[IMAGE:${img}]`
    else if (img.startsWith('data:image/')) {
      const match = img.match(/^data:image\/(\w+);base64,(.+)$/)
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
        const filePath = saveImageBuffer(Buffer.from(match[2], 'base64'), ext)
        return `[IMAGE:file://${filePath}]`
      }
    } else b64 = img
  } else if (typeof img === 'object' && img !== null) {
    if (img.b64_json) b64 = img.b64_json
    else if (img.image_url?.url) {
      const u = img.image_url.url as string
      if (u.startsWith('http')) httpUrl = u
      else if (u.startsWith('file://')) return `[IMAGE:${u}]`
      else if (u.startsWith('data:image/')) {
        const match = u.match(/^data:image\/(\w+);base64,(.+)$/)
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
          const filePath = saveImageBuffer(Buffer.from(match[2], 'base64'), ext)
          return `[IMAGE:file://${filePath}]`
        }
      }
    } else if (img.url) {
      const u = img.url as string
      if (u.startsWith('http')) httpUrl = u
      else if (u.startsWith('file://')) return `[IMAGE:${u}]`
    }
  }

  if (httpUrl) {
    try {
      const res = await fetch(httpUrl, { signal: AbortSignal.timeout(30000) })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const ct = res.headers.get('content-type') ?? ''
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
        const filePath = saveImageBuffer(buf, ext)
        return `[IMAGE:file://${filePath}]`
      }
    } catch (err) {
      console.warn('[engine:image] download failed, keeping URL:', httpUrl, err)
    }
    return `[IMAGE:${httpUrl}]`
  }

  if (b64) {
    const clean = b64.replace(/^data:image\/\w+;base64,/, '')
    const ext = clean.startsWith('iVBORw0KGgo') ? 'png' : 'jpg'
    const filePath = saveImageBuffer(Buffer.from(clean, 'base64'), ext)
    return `[IMAGE:file://${filePath}]`
  }

  return ''
}

async function extractImageTokensFromContent(content: unknown): Promise<string[]> {
  if (!Array.isArray(content)) return []
  const tokens = await Promise.all(
    content.map((part) => {
      if (!part || typeof part !== 'object') return Promise.resolve('')
      const imageUrl = (part as any).image_url?.url ?? (part as any).url
      return imageUrl ? imageObjectToToken({ image_url: { url: imageUrl } }) : Promise.resolve('')
    })
  )
  return tokens.filter(Boolean)
}

// Dedupliceert op basis van de eerste 120 tekens van de brondata, niet op bestandspaden.
// imageObjectToToken maakt bij elke aanroep een uniek /tmp pad, dus token-strings zijn altijd anders.
function deduplicateImageSources(images: any[]): any[] {
  const seen = new Set<string>()
  return images.filter((img) => {
    let key = ''
    if (typeof img === 'string') key = img.slice(0, 120)
    else if (typeof img === 'object' && img !== null) {
      key = img.b64_json?.slice(0, 120) ?? img.image_url?.url?.slice(0, 120) ?? img.url?.slice(0, 120) ?? ''
    }
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Converteert een [IMAGE:...] src naar een data-URL zodat we hem als referentie kunnen meesturen.
function imageSourceToDataUrl(src: string): string | null {
  if (src.startsWith('data:')) return src
  if (src.startsWith('http')) return src
  if (src.startsWith('file://')) {
    const filePath = src.slice('file://'.length)
    try {
      const buf = readFileSync(filePath)
      const ext = filePath.endsWith('.png') ? 'png' : 'jpeg'
      return `data:image/${ext};base64,${buf.toString('base64')}`
    } catch { return null }
  }
  return null
}

// Zoekt de meest recente [IMAGE:...] in de gesprekshistory (van assistant-berichten).
function findLastGeneratedImage(history: { role: string; content: string }[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'assistant') continue
    const match = history[i].content.match(/\[IMAGE:([^\]]+)\]/)
    if (match) {
      const dataUrl = imageSourceToDataUrl(match[1])
      if (dataUrl) return dataUrl
    }
  }
  return null
}

// Roept OpenRouter aan via chat/completions met modalities voor image-output modellen.
// Probeert eerst ['image', 'text'], valt terug op ['image'] als het model geen tekst-output ondersteunt.
// Als er een eerder gegenereerd beeld in de history staat, wordt dat als referentie meegestuurd (edit-modus).
async function callOpenRouterImageChat(
  model: string,
  prompt: string,
  systemPrompt: string | undefined,
  imageAttachments: { name: string; type: 'text' | 'image'; content: string }[],
  history: { role: string; content: string }[],
  jwt: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const referenceImage = findLastGeneratedImage(history)
  const isEdit = referenceImage !== null

  async function request(modalities: string[]) {
    const isLLMImageModel = modalities.includes('text')

    let finalPrompt: string
    if (isEdit && isLLMImageModel) {
      finalPrompt = `Pas de bijgevoegde afbeelding aan op basis van de volgende instructie. Genereer de aangepaste afbeelding en geef geen tekstuele reactie.\n\nInstructie: ${prompt}`
    } else if (isLLMImageModel) {
      finalPrompt = `Genereer een afbeelding op basis van de volgende beschrijving. Geef geen tekstuele reactie; genereer uitsluitend de afbeelding.\n\nBeschrijving: ${prompt}`
    } else {
      finalPrompt = systemPrompt ? `${systemPrompt}\n\nSubject: ${prompt}` : prompt
    }

    const contentParts: any[] = []
    if (referenceImage) contentParts.push({ type: 'image_url', image_url: { url: referenceImage } })
    contentParts.push({ type: 'text', text: finalPrompt })
    for (const img of imageAttachments) contentParts.push({ type: 'image_url', image_url: { url: img.content } })

    const content: any = contentParts.length === 1 ? contentParts[0].text : contentParts

    const imageMessages: any[] = []
    if (isLLMImageModel && systemPrompt && !isEdit) imageMessages.push({ role: 'system', content: systemPrompt })
    imageMessages.push({ role: 'user', content })

    return callOpenRouter({ model, modalities, messages: imageMessages, stream: false }, jwt)
  }

  let res = await request(['image', 'text'])
  let raw = await res.text()
  console.log('[engine:image] HTTP status:', res.status, res.statusText, '| body:', raw.slice(0, 300))

  if (res.status === 404 && raw.includes('output modalities: image, text')) {
    res = await request(['image'])
    raw = await res.text()
    console.log('[engine:image] fallback image-only status:', res.status, res.statusText, '| body:', raw.slice(0, 300))
  }

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 200)}`)

  let json: any
  try { json = JSON.parse(raw) } catch {
    throw new Error(`Onverwacht antwoord: ${raw.slice(0, 200)}`)
  }

  const message = json?.choices?.[0]?.message
  const images: any[] = message?.images ?? []
  const textContent: string = typeof message?.content === 'string' ? message.content : ''

  const rawTokens = images.length > 0
    ? await Promise.all(deduplicateImageSources(images).map(imageObjectToToken))
    : await extractImageTokensFromContent(message?.content)
  const imageTokens = rawTokens.filter(Boolean).join('\n')
  const result = [textContent, imageTokens].filter(Boolean).join('\n')
  console.log('[engine:image] images:', images.length, '| tokens:', imageTokens ? 'yes' : 'no', '| text:', textContent ? 'yes' : 'no')

  if (result) onChunk(result)
  return result
}

async function readSSEStream(response: Response, onChunk: (chunk: string) => void): Promise<string> {
  if (!response.body) return ''
  const reader = (response.body as any).getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try {
        const json = JSON.parse(raw)
        const chunk: string = json.choices?.[0]?.delta?.content ?? ''
        if (chunk) { full += chunk; onChunk(chunk) }
      } catch {}
    }
  }

  return full
}

let registered = false
let fileWatcher: ReturnType<typeof fsWatch> | null = null
let watcherWindow: BrowserWindow | null = null

export function registerEngineIPC(win: BrowserWindow): void {
  watcherWindow = win
  startFileWatcher()

  if (registered) return
  registered = true

  // ── ollama-status ────────────────────────────────────────────────────────────
  ipcMain.handle('engine:ollama-status', async () => {
    return getOllamaStatus()
  })

  // ── ollama-check-installed ────────────────────────────────────────────────────
  ipcMain.handle('ollama:check-installed', async () => {
    const appPath = '/Applications/Ollama.app'
    const binPath = '/usr/local/bin/ollama'
    const installed = fsExistsSync(appPath) || fsExistsSync(binPath)
    return { installed }
  })

  // ── ollama-install ────────────────────────────────────────────────────────────
  // Download Ollama.app voor macOS, pak het uit en zet het in /Applications.
  ipcMain.handle('ollama:install', async (event) => {
    const send = (msg: string, progress?: number) => {
      try { event.sender.send('ollama:install-progress', { msg, progress }) } catch {}
    }
    try {
      const zipPath = join(tmpdir(), 'Ollama-darwin.zip')
      const extractDir = join(tmpdir(), 'ollama-extract')

      send('Ollama downloaden…', 0)
      const res = await fetch('https://ollama.com/download/Ollama-darwin.zip')
      if (!res.ok || !res.body) throw new Error(`Download mislukt (${res.status})`)

      const total = Number(res.headers.get('content-length') ?? 0)
      let received = 0
      const writer = createWriteStream(zipPath)
      const reader = res.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(value)
        received += value.length
        if (total > 0) send('Downloaden…', Math.round((received / total) * 60))
      }
      await new Promise<void>((resolve, reject) => writer.end((err: Error | null) => err ? reject(err) : resolve()))

      send('Uitpakken…', 65)
      await execAsync(`rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -q "${zipPath}" -d "${extractDir}"`)

      send('Installeren in /Applications…', 85)
      await execAsync(`rm -rf "/Applications/Ollama.app" && cp -R "${extractDir}/Ollama.app" "/Applications/Ollama.app"`)

      send('Opruimen…', 95)
      await execAsync(`rm -rf "${zipPath}" "${extractDir}"`)

      send('Ollama geïnstalleerd! Opstarten…', 98)
      await execAsync('open -a Ollama')

      send('Klaar', 100)
      return { ok: true }
    } catch (e: any) {
      send(`Fout: ${e.message}`, -1)
      return { ok: false, error: e.message }
    }
  })

  // ── ollama-uninstall ──────────────────────────────────────────────────────────
  ipcMain.handle('ollama:uninstall', async () => {
    try {
      // Sluit Ollama af als het draait
      await execAsync('osascript -e \'quit app "Ollama"\' 2>/dev/null || true').catch(() => {})
      await new Promise(r => setTimeout(r, 1000))

      if (fsExistsSync('/Applications/Ollama.app')) {
        rmSync('/Applications/Ollama.app', { recursive: true, force: true })
      }
      // Verwijder ook de Ollama binary als die los geïnstalleerd is
      await execAsync('rm -f /usr/local/bin/ollama 2>/dev/null || true').catch(() => {})

      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── ollama-pull-model ─────────────────────────────────────────────────────────
  ipcMain.handle('ollama:pull-model', async (event, modelName: string) => {
    modelName = parseIpcPayload('ollama:pull-model', ModelNameSchema, modelName)
    const send = (msg: string, progress?: number) => {
      try { event.sender.send('ollama:pull-progress', { model: modelName, msg, progress }) } catch {}
    }
    try {
      send(`${modelName} downloaden…`, 0)
      await new Promise<void>((resolve, reject) => {
        const child = require('child_process').spawn('ollama', ['pull', modelName], { stdio: 'pipe' })
        let lastLine = ''
        child.stdout.on('data', (d: Buffer) => {
          const lines = d.toString().split('\n').filter(Boolean)
          if (lines.length) { lastLine = lines[lines.length - 1]; send(lastLine.slice(0, 80)) }
        })
        child.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
        child.on('error', reject)
      })
      send('Klaar', 100)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── ollama-remove-model ───────────────────────────────────────────────────────
  ipcMain.handle('ollama:remove-model', async (_event, modelName: string) => {
    try {
      modelName = parseIpcPayload('ollama:remove-model', ModelNameSchema, modelName)
      await execAsync(`ollama rm "${modelName}"`)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── atelier-chat-complete ───────────────────────────────────────────────────
  type AtelierMessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  ipcMain.handle('atelier:chat-complete', async (e, payload: {
    model?: string
    systemPrompt?: string
    messages: { role: 'system' | 'user' | 'assistant'; content: AtelierMessageContent }[]
    accessToken?: string  // optioneel — stuur mee vanuit renderer voor proxy-routing
  }) => {
    payload = parseIpcPayload('atelier:chat-complete', z.object({
      model: ModelNameSchema.optional(),
      systemPrompt: z.string().max(200000).optional(),
      messages: z.array(z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: EngineMessageContentSchema,
      })).max(200),
      accessToken: AccessTokenSchema.optional(),
    }), payload)
    // For Ollama, strip image parts since most local models don't support vision
    function toOllamaContent(content: AtelierMessageContent): string {
      if (typeof content === 'string') return content
      return content.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('\n')
    }

    const messages = [
      ...(payload.systemPrompt ? [{ role: 'system' as const, content: payload.systemPrompt }] : []),
      ...payload.messages.filter((message) => {
        const c = message.content
        return typeof c === 'string' ? c.trim() : c.length > 0
      }),
    ]

    try {
      const cloudModel = await resolveCloudAgentModel(payload.model)
      if (cloudModel) {
        let res: Response
        if (payload.accessToken) {
          res = await callOpenRouter({ model: cloudModel, messages, stream: true }, payload.accessToken)
        } else {
          // Fallback: directe call als accessToken niet meegestuurd is (BYOK)
          const key = loadKey('openrouter')
          if (!key) return { ok: false, error: 'OpenRouter API key niet geconfigureerd.' }
          res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://hupheai.app', 'X-Title': 'HupheAI Atelier' },
            body: JSON.stringify({ model: cloudModel, messages, stream: true }),
          })
        }
        if (!res.ok) {
          const text = await res.text()
          return { ok: false, error: `OpenRouter ${res.status}: ${text.slice(0, 200)}` }
        }
        // Stream SSE — emit each token to renderer, accumulate full response
        const reader = (res.body as any).getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read() as { done: boolean; value: Uint8Array }
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const token: string = (JSON.parse(data) as any).choices?.[0]?.delta?.content ?? ''
              if (token) {
                accumulated += token
                e.sender.send('atelier:stream-chunk', token)
              }
            } catch { /* malformed SSE line */ }
          }
        }
        if (!accumulated) return { ok: false, error: 'OpenRouter gaf geen antwoord.' }
        return { ok: true, content: accumulated, model: cloudModel }
      }

      const ollama = await getOllamaStatus()
      if (!ollama.running) return { ok: false, error: 'Ollama draait niet. Start Ollama of kies een cloudmodel met OpenRouter key.' }
      const requested = payload.model?.replace(/^ollama\//, '')
      const model = pickAtelierChatModel(ollama.models, requested)
      if (!model) {
        const installed = ollama.models.length ? ` Geïnstalleerd: ${ollama.models.join(', ')}.` : ''
        return { ok: false, error: `Geen geschikt Ollama-chatmodel gevonden.${installed} LLaVA is vooral voor vision en niet geschikt als Atelier-chat. Installeer bijvoorbeeld \`ollama pull llama3.1\`, \`ollama pull qwen2.5\` of \`ollama pull mistral\`, of kies een cloudmodel.` }
      }

      const ollamaMessages = messages.map((m) => ({ role: m.role, content: toOllamaContent(m.content) }))
      const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `Ollama ${res.status}: ${text.slice(0, 200)}` }
      }
      const json = await res.json() as any
      const content = json.choices?.[0]?.message?.content?.trim()
      if (!content) return { ok: false, error: 'Ollama gaf geen antwoord.' }
      return { ok: true, content, model: `ollama/${model}` }
    } catch (err: any) {
      return { ok: false, error: err.message ?? 'Atelier AI kon het gekozen model niet bereiken.' }
    }
  })

  // ── list-agents ─────────────────────────────────────────────────────────────
  ipcMain.handle('engine:list-agents', async () => {
    // 1. Ollama local models (Zet lokaal bovenaan, en specifiek GLM-4 Free)
    const ollama = await getOllamaStatus()
    const ollamaAgents = ollama.models.map((m) => {
      const isGlm4 = m.toLowerCase().includes('glm4')
      return {
        id: `ollama/${m}`,
        label: isGlm4 ? 'GLM-4 Free' : m,
        model: m,
        description: 'Lokaal via Ollama',
        systemPrompt: '',
      }
    })

    // Zorg dat GLM-4 Free absoluut als eerste in de lijst staat
    ollamaAgents.sort((a, b) => {
      if (a.label === 'GLM-4 Free') return -1
      if (b.label === 'GLM-4 Free') return 1
      return a.label.localeCompare(b.label)
    })

    // 2. Standaard Cloud Modellen — vaste UUIDs zodat agent_id nooit null is in de DB
    // 3. Supabase cloud agents (Custom)
    const { data } = await anonClient
      .from('agents')
      .select('id, name, model, description, system_prompt')
      .order('name')

    const cloudAgents = (data ?? []).map((a: any) => ({
      id: a.id as string,
      label: a.name as string,
      model: (a.model as string) ?? 'unknown',
      description: (a.description as string) ?? '',
      systemPrompt: (a.system_prompt as string) ?? '',
    }))

    // Filter cloudAgents to remove duplicates if they already exist in defaultAgents
    const customAgents = cloudAgents.filter(
      (ca) => !DEFAULT_CLOUD_AGENTS.some((da) => da.id === ca.id || da.model === ca.model)
    )

    const agents = [...ollamaAgents, ...DEFAULT_CLOUD_AGENTS, ...customAgents]

    return { ok: true, agents, ollamaRunning: ollama.running }
  })

  // ── create-conversation ──────────────────────────────────────────────────────
  ipcMain.handle('engine:create-conversation', async (_e, payload: {
    accessToken: string
    title?: string
    source?: string
  }) => {
    payload = parseIpcPayload('engine:create-conversation', z.object({
      accessToken: AccessTokenSchema,
      title: z.string().max(200).optional(),
      source: z.string().max(80).optional(),
    }), payload)
    const client = authedClient(payload.accessToken)
    const { data: userData, error: userErr } = await client.auth.getUser()
    if (userErr || !userData.user) return { ok: false, error: userErr?.message ?? 'Niet ingelogd' }

    const { data, error } = await client
      .from('engine_conversations')
      .insert({
        user_id: userData.user.id,
        title: payload.title ?? 'Nieuw gesprek',
        source: payload.source ?? 'chat',
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: (data as any).id as string }
  })

  // ── send-message ─────────────────────────────────────────────────────────────
  ipcMain.handle('engine:send-message', async (_e, payload: {
    accessToken: string
    conversationId: string
    agentId: string
    agentModel: string
    agentLabel?: string
    agentSystemPrompt?: string
    agentModality?: string
    message: string
    history: { role: string; content: string }[]
    attachments?: { name: string; type: 'text' | 'image'; content: string }[]
  }) => {
    payload = parseIpcPayload('engine:send-message', z.object({
      accessToken: AccessTokenSchema,
      conversationId: ConversationIdSchema,
      agentId: AgentIdSchema,
      agentModel: ModelNameSchema,
      agentLabel: z.string().max(200).optional(),
      agentSystemPrompt: z.string().max(200000).optional(),
      agentModality: z.string().max(80).optional(),
      message: PromptSchema,
      history: EngineHistorySchema,
      attachments: z.array(EngineAttachmentSchema).max(20).optional(),
    }), payload)
    const isOllama = payload.agentId.startsWith('ollama/')
    const supabase = authedClient(payload.accessToken)

    // Sla in de database alleen de tekst + namen van afbeeldingen op om null-byte errors te voorkomen
    let dbContent = payload.message
    const imageAttachments = payload.attachments?.filter(a => a.type === 'image') ?? []
    if (imageAttachments.length > 0) {
      dbContent += '\n\n' + imageAttachments.map(a => `[Bijlage afbeelding: ${a.name}]`).join('\n')
    }

    // Write user message
    const { data: userMsg, error: umErr } = await supabase
      .from('engine_messages')
      .insert({ conversation_id: payload.conversationId, role: 'user', content: dbContent })
      .select('id, created_at')
      .single()
    if (umErr) return { ok: false, error: umErr.message }

    const userMsgData = userMsg as any
    if (!win.isDestroyed()) {
      win.webContents.send('engine:message-added', {
        id: userMsgData.id,
        role: 'user',
        content: dbContent,
        conversationId: payload.conversationId,
        createdAt: userMsgData.created_at,
      })
    }

    // Build messages array
    const messages: any[] = []
    if (payload.agentSystemPrompt) messages.push({ role: 'system', content: payload.agentSystemPrompt })
    messages.push(...payload.history)

    // Voor de AI call: voeg de base64 afbeeldingen toe aan het bericht via het OpenAI vision formaat
    if (imageAttachments.length > 0) {
      const contentParts: any[] = [{ type: 'text', text: payload.message }]
      for (const img of imageAttachments) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: img.content } // img.content bevat al de data URL (base64)
        })
      }
      messages.push({ role: 'user', content: contentParts })
    } else {
      messages.push({ role: 'user', content: payload.message })
    }

    try {
      let assistantContent: string
      let model: string

      const onChunk = (chunk: string) => {
        if (!win.isDestroyed()) {
          win.webContents.send('engine:stream-chunk', { chunk, conversationId: payload.conversationId })
        }
      }

      if (isOllama) {
        const ollamaModel = payload.agentId.replace('ollama/', '')
        const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: ollamaModel, messages, stream: true }),
        })
        if (!res.ok) {
          const errText = await res.text()
          return { ok: false, error: `Ollama ${res.status}: ${errText.slice(0, 200)}` }
        }
        assistantContent = await readSSEStream(res, onChunk)
        model = ollamaModel
      } else {
        model = payload.agentModel
        const jwt = payload.accessToken

        if (isImageGenerationModel(model, payload.agentModality, payload.agentLabel)) {
          assistantContent = await callOpenRouterImageChat(model, payload.message, payload.agentSystemPrompt, imageAttachments, payload.history, jwt, onChunk)
        } else {
          const res = await callOpenRouter({ model, messages, stream: true }, jwt)
          if (!res.ok) {
            const errText = await res.text()
            return { ok: false, error: `OpenRouter ${res.status}: ${errText.slice(0, 200)}` }
          }
          assistantContent = await readSSEStream(res, onChunk)
        }
      }

      const agentUuid = UUID_RE.test(payload.agentId) ? payload.agentId : null

      const { data: asstMsg, error: amErr } = await supabase
        .from('engine_messages')
        .insert({
          conversation_id: payload.conversationId,
          role: 'assistant',
          agent_id: agentUuid,
          model,
          content: assistantContent,
        })
        .select('id, created_at')
        .single()
      if (amErr) return { ok: false, error: amErr.message }

      const asstMsgData = asstMsg as any
      if (!win.isDestroyed()) {
        win.webContents.send('engine:message-added', {
          id: asstMsgData.id,
          role: 'assistant',
          agentId: payload.agentId,
          model,
          content: assistantContent,
          conversationId: payload.conversationId,
          createdAt: asstMsgData.created_at,
        })
      }

      // Log agent event
      await supabase.from('agent_conversations').insert({
        engine_conversation_id: payload.conversationId,
        from_agent_id: agentUuid,
        event_type: 'result',
        content: `[${payload.agentId}] antwoordde via ${model}`,
      })

      return { ok: true, messageId: asstMsgData.id, content: assistantContent }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── search-openrouter-models ─────────────────────────────────────────────────
  ipcMain.handle('engine:search-openrouter-models', async (_e, query: string) => {
    try {
      query = parseIpcPayload('engine:search-openrouter-models', z.string().max(200), query)
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}` }
      const json = await res.json() as any
      const q = query.toLowerCase().trim()
      const filtered = (json.data ?? [])
        .filter((m: any) => !q || m.id?.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q))
        .slice(0, 50)
        .map((m: any) => ({
          id: m.id as string,
          label: (m.name ?? m.id) as string,
          model: m.id as string,
          description: ((m.description as string) ?? '').slice(0, 100),
          modality: (m.architecture?.modality as string) ??
            (Array.isArray(m.architecture?.output_modalities) ? `text->${m.architecture.output_modalities.join(',')}` : 'text->text'),
        }))
      return { ok: true, models: filtered }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── list-openrouter-models-by-modality ───────────────────────────────────────
  ipcMain.handle('engine:list-openrouter-models-by-modality', async (_e, modality: 'image' | 'video') => {
    try {
      modality = parseIpcPayload('engine:list-openrouter-models-by-modality', z.enum(['image', 'video']), modality)
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}`, models: [] }
      const json = await res.json() as any
      const wanted = modality.toLowerCase()

      const models = (json.data ?? [])
        .filter((m: any) => {
          const outputModalities = outputModalitiesFromArchitecture(m)
          return isKnownGenerationModel(m, wanted as 'image' | 'video')
            || outputModalities.includes(wanted)
        })
        .slice(0, 80)
        .map((m: any) => ({
          id: m.id as string,
          label: (m.name ?? m.id) as string,
          model: m.id as string,
          description: ((m.description as string) ?? '').slice(0, 100),
          modality: (m.architecture?.modality as string) ??
            (Array.isArray(m.architecture?.output_modalities) ? `text->${m.architecture.output_modalities.join(',')}` : 'text->text'),
        }))
      return { ok: true, models }
    } catch (err: any) {
      return { ok: false, error: err.message, models: [] }
    }
  })

  // ── delete-conversation ──────────────────────────────────────────────────────
  ipcMain.handle('engine:delete-conversation', async (_e, payload: {
    accessToken: string
    conversationId: string
  }) => {
    payload = parseIpcPayload('engine:delete-conversation', z.object({
      accessToken: AccessTokenSchema,
      conversationId: ConversationIdSchema,
    }), payload)
    const { error } = await authedClient(payload.accessToken)
      .from('engine_conversations')
      .delete()
      .eq('id', payload.conversationId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })

  // ── rename-conversation ──────────────────────────────────────────────────────
  ipcMain.handle('engine:rename-conversation', async (_e, payload: {
    accessToken: string
    conversationId: string
    title: string
  }) => {
    payload = parseIpcPayload('engine:rename-conversation', z.object({
      accessToken: AccessTokenSchema,
      conversationId: ConversationIdSchema,
      title: z.string().trim().min(1).max(200),
    }), payload)
    const { error } = await authedClient(payload.accessToken)
      .from('engine_conversations')
      .update({ title: payload.title })
      .eq('id', payload.conversationId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })

  // ── list-conversations ───────────────────────────────────────────────────────
  ipcMain.handle('engine:list-conversations', async (_e, payload: { accessToken: string }) => {
    payload = parseIpcPayload('engine:list-conversations', z.object({ accessToken: AccessTokenSchema }), payload)
    const { data, error } = await authedClient(payload.accessToken)
      .from('engine_conversations')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) return { ok: false, error: error.message }
    return { ok: true, conversations: data ?? [] }
  })

  // ── generate-title ───────────────────────────────────────────────────────────
  ipcMain.handle('engine:generate-title', async (_e, payload: {
    agentId: string
    agentModel: string
    message: string
    accessToken?: string
  }) => {
    payload = parseIpcPayload('engine:generate-title', z.object({
      agentId: AgentIdSchema,
      agentModel: ModelNameSchema,
      message: PromptSchema,
      accessToken: AccessTokenSchema.optional(),
    }), payload)
    try {
      // Image generation models can't do text completion — derive title from the prompt
      if (isImageGenerationModel(payload.agentModel)) {
        const words = payload.message.trim().split(/\s+/).slice(0, 4).join(' ')
        return { ok: true, title: words }
      }

      const isOllama = payload.agentId.startsWith('ollama/')
      const messages = [{ role: 'user', content: `Geef een titel van maximaal 3 woorden voor dit bericht. Antwoord alleen met de titel, geen aanhalingstekens of uitleg:\n\n${payload.message}` }]
      let assistantContent: string

      if (isOllama) {
        const ollamaModel = payload.agentId.replace('ollama/', '')
        const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: ollamaModel, messages, stream: false }),
        })
        if (!res.ok) return { ok: false, error: await res.text() }
        const json = await res.json() as any
        assistantContent = json.choices?.[0]?.message?.content ?? ''
      } else {
        let res: Response
        if (payload.accessToken) {
          res = await callOpenRouter({ model: payload.agentModel, messages, stream: false }, payload.accessToken)
        } else {
          const key = loadKey('openrouter')
          if (!key) return { ok: false, error: 'No OpenRouter key' }
          res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://hupheai.app', 'X-Title': 'HupheAI Engine' },
            body: JSON.stringify({ model: payload.agentModel, messages, stream: false }),
          })
        }
        if (!res.ok) return { ok: false, error: await res.text() }
        const json = await res.json() as any
        assistantContent = json.choices?.[0]?.message?.content ?? ''
      }

      return { ok: true, title: assistantContent }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── list-messages ────────────────────────────────────────────────────────────
  ipcMain.handle('engine:list-messages', async (_e, payload: {
    accessToken: string
    conversationId: string
  }) => {
    payload = parseIpcPayload('engine:list-messages', z.object({
      accessToken: AccessTokenSchema,
      conversationId: ConversationIdSchema,
    }), payload)
    const { data, error } = await authedClient(payload.accessToken)
      .from('engine_messages')
      .select('id, role, content, agent_id, model, created_at')
      .eq('conversation_id', payload.conversationId)
      .order('created_at')
    if (error) return { ok: false, error: error.message }
    return { ok: true, messages: data ?? [] }
  })

  // ── list-agent-events ────────────────────────────────────────────────────────
  ipcMain.handle('engine:list-agent-events', async (_e, payload: {
    accessToken: string
    conversationId: string
  }) => {
    payload = parseIpcPayload('engine:list-agent-events', z.object({
      accessToken: AccessTokenSchema,
      conversationId: ConversationIdSchema,
    }), payload)
    const { data, error } = await authedClient(payload.accessToken)
      .from('agent_conversations')
      .select('id, from_agent_id, to_agent_id, event_type, content, created_at')
      .eq('engine_conversation_id', payload.conversationId)
      .order('created_at')
    if (error) return { ok: false, error: error.message }
    return { ok: true, events: data ?? [] }
  })

  // ── list-document-states ─────────────────────────────────────────────────────
  ipcMain.handle('engine:list-document-states', async (_e, payload: {
    accessToken: string
  }) => {
    payload = parseIpcPayload('engine:list-document-states', z.object({ accessToken: AccessTokenSchema }), payload)
    const { data, error } = await authedClient(payload.accessToken)
      .from('document_states')
      .select('id, path, content, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) return { ok: false, error: error.message }
    return { ok: true, documents: data ?? [] }
  })

  // ── save-image ───────────────────────────────────────────────────────────────
  ipcMain.handle('engine:save-image', async (_e, payload: { src: string; name?: string }) => {
    try {
      payload = parseIpcPayload('engine:save-image', z.object({
        src: z.string().max(5_000_000),
        name: z.string().max(160).optional(),
      }), payload)

      let buffer: Buffer
      let ext = 'png'

      if (payload.src.startsWith('data:image/')) {
        const match = payload.src.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!match) return { ok: false, error: 'Ongeldig data URL' }
        ext = match[1] === 'jpeg' ? 'jpg' : match[1]
        buffer = Buffer.from(match[2], 'base64')
      } else if (payload.src.startsWith('file://') || payload.src.startsWith('huphe://file/')) {
        const filePath = payload.src.startsWith('huphe://file/')
          ? decodeURIComponent(payload.src.slice('huphe://file/'.length))
          : payload.src.replace('file://', '')
        buffer = readFileSync(filePath)
        ext = filePath.split('.').pop() ?? 'png'
      } else {
        return { ok: false, error: 'Onbekend afbeeldingsformaat' }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultName = `${payload.name ?? `huphe_${timestamp}`}.${ext}`
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { canceled, filePath: chosen } = await dialog.showSaveDialog(win, {
        defaultPath: join(app.getPath('downloads'), defaultName),
        filters: [
          { name: 'Afbeelding', extensions: [ext, 'png', 'jpg', 'webp'].filter((v, i, a) => a.indexOf(v) === i) },
        ],
      })
      if (canceled || !chosen) return { ok: false, canceled: true }

      writeFileSync(chosen, buffer)
      return { ok: true, path: chosen }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── list-saved-images ─────────────────────────────────────────────────────────
  ipcMain.handle('engine:list-saved-images', async () => {
    try {
      const imagesDir = savedImagesDir()
      if (!existsSync(imagesDir)) return { ok: true, images: [] }
      const files = readdirSync(imagesDir)
        .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
        .map(f => {
          const filePath = join(imagesDir, f)
          const stat = statSync(filePath)
          return { name: f, path: `file://${filePath}`, savedAt: stat.mtime.toISOString() }
        })
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      return { ok: true, images: files }
    } catch (err: any) {
      return { ok: false, error: err.message, images: [] }
    }
  })

  // ── delete-saved-image ───────────────────────────────────────────────────────
  ipcMain.handle('engine:delete-saved-image', async (_e, payload: { path: string }) => {
    try {
      payload = parseIpcPayload('engine:delete-saved-image', z.object({ path: z.string().max(4096) }), payload)
      const filePath = resolveSavedImagePath(payload.path)
      if (!filePath) return { ok: false, error: 'Ongeldig afbeeldingspad.' }
      if (!existsSync(filePath)) return { ok: true }
      if (!statSync(filePath).isFile()) return { ok: false, error: 'Pad is geen bestand.' }

      unlinkSync(filePath)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── distill-memory (stub) ────────────────────────────────────────────────────
  ipcMain.handle('engine:distill-memory', async () => {
    return { ok: true, distilled: 0 }
  })

  // ── run-task (multi-agent orchestrator) ──────────────────────────────────────
  ipcMain.handle('engine:run-task', async (_e, payload: {
    accessToken: string
    conversationId: string
    task: string
    coordinatorAgentId: string
    workerAgents: string[]
  }) => {
    payload = parseIpcPayload('engine:run-task', z.object({
      accessToken: AccessTokenSchema,
      conversationId: ConversationIdSchema,
      task: PromptSchema,
      coordinatorAgentId: AgentIdSchema,
      workerAgents: z.array(AgentIdSchema).max(50),
    }), payload)
    const supabase = authedClient(payload.accessToken)
    const isOllama = payload.coordinatorAgentId.startsWith('ollama/')

    const coordUuid = UUID_RE.test(payload.coordinatorAgentId) ? payload.coordinatorAgentId : null

    function emitEvent(data: object) {
      if (!win.isDestroyed()) win.webContents.send('engine:agent-event', data)
    }

    // Log: task assigned to coordinator
    await supabase.from('agent_conversations').insert({
      engine_conversation_id: payload.conversationId,
      from_agent_id: null,
      to_agent_id: coordUuid,
      event_type: 'task_assigned',
      content: payload.task,
    })
    emitEvent({ conversationId: payload.conversationId, fromAgent: 'Gebruiker', toAgent: payload.coordinatorAgentId, type: 'task_assigned', content: payload.task, createdAt: new Date().toISOString() })

    async function callModel(agentId: string, prompt: string): Promise<string> {
      const isLocal = agentId.startsWith('ollama/')
      if (isLocal) {
        const m = agentId.replace('ollama/', '')
        const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m, messages: [{ role: 'user', content: prompt }], stream: false }),
        })
        if (!res.ok) return `Fout: ${(await res.text()).slice(0, 200)}`
        return ((await res.json()) as any).choices?.[0]?.message?.content ?? ''
      } else {
        try {
          const res = await callOpenRouter({ model: agentId, messages: [{ role: 'user', content: prompt }], stream: false }, payload.accessToken)
          if (!res.ok) return `Fout: ${(await res.text()).slice(0, 200)}`
          return ((await res.json()) as any).choices?.[0]?.message?.content ?? ''
        } catch (err: any) {
          if (err instanceof InsufficientCreditsError) return 'Fout: Onvoldoende credits.'
          if (err instanceof WalletBlockedError) return 'Fout: Wallet geblokkeerd.'
          return `Fout: ${err.message}`
        }
      }
    }

    try {
      // Step 1: coordinator splits the task into subtasks
      const coordPrompt = `Je bent een coördinator. Splits de volgende taak op in subtaken voor beschikbare worker-agents.
Geef je antwoord als JSON array: [{ "agent": "<agent_id>", "task": "<subtaak>" }]
Beschikbare agents: ${payload.workerAgents.join(', ')}
Taak: ${payload.task}

Antwoord ALLEEN met de JSON array, geen extra tekst.`

      const coordResponse = await callModel(payload.coordinatorAgentId, coordPrompt)

      await supabase.from('agent_conversations').insert({
        engine_conversation_id: payload.conversationId,
        from_agent_id: coordUuid,
        event_type: 'thought',
        content: coordResponse,
      })
      emitEvent({ conversationId: payload.conversationId, fromAgent: payload.coordinatorAgentId, type: 'thought', content: coordResponse, createdAt: new Date().toISOString() })

      // Parse subtasks
      let subtasks: { agent: string; task: string }[] = []
      try {
        const match = coordResponse.match(/\[[\s\S]*\]/)
        if (match) subtasks = JSON.parse(match[0])
      } catch {}
      if (subtasks.length === 0 && payload.workerAgents.length > 0) {
        subtasks = [{ agent: payload.workerAgents[0], task: payload.task }]
      }

      // Step 2: execute subtasks with worker agents
      const results: { agent: string; result: string }[] = []
      for (const subtask of subtasks) {
        const workerUuid = UUID_RE.test(subtask.agent) ? subtask.agent : null

        await supabase.from('agent_conversations').insert({
          engine_conversation_id: payload.conversationId,
          from_agent_id: coordUuid,
          to_agent_id: workerUuid,
          event_type: 'handoff',
          content: subtask.task,
        })
        emitEvent({ conversationId: payload.conversationId, fromAgent: payload.coordinatorAgentId, toAgent: subtask.agent, type: 'handoff', content: subtask.task, createdAt: new Date().toISOString() })

        try {
          const workerResponse = await callModel(subtask.agent, subtask.task)
          results.push({ agent: subtask.agent, result: workerResponse })

          await supabase.from('agent_conversations').insert({
            engine_conversation_id: payload.conversationId,
            from_agent_id: workerUuid,
            to_agent_id: coordUuid,
            event_type: 'result',
            content: workerResponse,
          })
          emitEvent({ conversationId: payload.conversationId, fromAgent: subtask.agent, toAgent: payload.coordinatorAgentId, type: 'result', content: workerResponse, createdAt: new Date().toISOString() })
        } catch (err: any) {
          await supabase.from('agent_conversations').insert({
            engine_conversation_id: payload.conversationId,
            from_agent_id: workerUuid,
            event_type: 'error',
            content: err.message,
          })
          emitEvent({ conversationId: payload.conversationId, fromAgent: subtask.agent, type: 'error', content: err.message, createdAt: new Date().toISOString() })
        }
      }

      return { ok: true, results }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── vision: local vision model ───────────────────────────────────────────────

  ipcMain.handle('vision:list-models', async () => {
    const installed = await Promise.all(
      VISION_MODELS.map(async (m) => ({ ...m, installed: await isModelInstalled(m.id) }))
    )
    return installed
  })

  ipcMain.handle('vision:check-model', async (_event, { model }: { model: string }) => {
    model = parseIpcPayload('vision:check-model', ModelNameSchema, model)
    return { installed: await isModelInstalled(model) }
  })

  ipcMain.handle('vision:pull-model', async (event, { model }: { model: string }) => {
    try {
      model = parseIpcPayload('vision:pull-model', ModelNameSchema, model)
      await pullModel(model, (pct, status) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('vision:pull-progress', { pct, status })
        }
      })
      if (!event.sender.isDestroyed()) {
        event.sender.send('vision:pull-progress', { pct: 100, status: 'success' })
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('vision:analyze', async (_event, { src, model, prompt }: { src: string; model: string; prompt?: string }) => {
    try {
      ;({ src, model, prompt } = parseIpcPayload('vision:analyze', z.object({
        src: z.string().max(5_000_000),
        model: ModelNameSchema,
        prompt: z.string().max(200000).optional(),
      }), { src, model, prompt }))
      const description = await analyzeImage(src, model, prompt)
      return { ok: true, description }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}

// ── .agents/ file watcher ─────────────────────────────────────────────────────

function startFileWatcher(): void {
  if (fileWatcher) return

  const agentsDir = join(app.getAppPath(), '.agents')
  if (!existsSync(agentsDir)) return

  let debounce: ReturnType<typeof setTimeout> | null = null

  try {
    fileWatcher = fsWatch(agentsDir, { recursive: false }, (_event, filename) => {
      if (!filename || !filename.endsWith('.md') || filename.startsWith('.') || filename.startsWith('~')) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const filePath = join(agentsDir, filename as string)
        if (!existsSync(filePath)) return
        try {
          const content = readFileSync(filePath, 'utf8')
          const checksum = createHash('md5').update(content).digest('hex')
          const win = watcherWindow
          if (win && !win.isDestroyed()) {
            win.webContents.send('engine:file-changed', {
              path: `.agents/${filename}`,
              content,
              checksum,
              status: 'written',
            })
          }
        } catch {}
      }, 400)
    })
  } catch {}
}
