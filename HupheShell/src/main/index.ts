import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, shell } from 'electron'
import { exec, spawn } from 'child_process'
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs'
import mammoth from 'mammoth'
import { tmpdir } from 'os'
import { basename, dirname, extname, resolve, sep, join } from 'path'
import { pathToFileURL } from 'url'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'
import { registerHupheCodeIPC } from './huphe-code-ipc'
import { registerPulseIPC } from './pulse-orchestrator'
import { registerEngineIPC } from './engine-ipc'
import { autoUpdater } from 'electron-updater'
import { generateHtml5Banner, IAB_FORMATS, type BannerProject } from './lib/banner-generator'
import { generateHtml5Print, PRINT_FORMATS, type PrintPayload } from './lib/print-generator'
import { z } from 'zod'

app.setName('HupheAI')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'huphe',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

// JWT van de ingelogde gebruiker — bijgewerkt zodra een IPC-call hem meestuurt.
// Gebruikt door handlers die geen eigen accessToken in de payload krijgen.
let cachedJwt: string | null = null

function getJwtOrKey(): string | null {
  if (cachedJwt) return cachedJwt
  // Fallback voor BYOK-modus (testperiode)
  const { existsSync: fsExists, readFileSync: fsRead } = require('fs')
  const { app: electronApp, safeStorage: ss } = require('electron')
  const { join: pathJoin } = require('path')
  const p = pathJoin(electronApp.getPath('userData'), 'openrouter.enc')
  if (!fsExists(p)) return null
  try { return ss.decryptString(fsRead(p)) } catch { return null }
}

let pendingDeepLink: string | null = null

function redactSentryPayload(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj
  for (const key of Object.keys(obj as object)) {
    if (/api.?key|password|token|secret/i.test(key)) {
      ;(obj as Record<string, unknown>)[key] = '[filtered]'
    } else {
      redactSentryPayload((obj as Record<string, unknown>)[key])
    }
  }
  return obj
}

async function initSentry(): Promise<void> {
  if (!process.env.SENTRY_DSN) return

  try {
    const Sentry = await import('@sentry/electron/main')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      beforeSend(event) {
        return redactSentryPayload(event) as typeof event
      },
    })
  } catch (err) {
    console.warn('[sentry] main init overgeslagen:', err)
  }
}

// ---------------------------------------------------------------------------
// template:import — receives a .key ArrayBuffer, writes to a temp file,
// runs parse_key.py, and returns the structured template JSON.
// The .key file is also saved to templatesDir() so generation stays in sync.
//
// Required Supabase migration:
//   create table templates (
//     client_id   text primary key,
//     template_data jsonb not null,
//     updated_at  timestamptz default now()
//   );
// ---------------------------------------------------------------------------
type TemplateData = {
  slideWidth:  number
  slideHeight: number
  layouts: Array<{
    name:      string
    textItems: Array<{
      role: string; source: string
      posX?: number; posY?: number; width?: number; height?: number
      alignment?: string; verticalAlignment?: string; font?: string; fontSize?: number
      color?: { r: number; g: number; b: number }
      charProperties?: Record<string, any>
      paraProperties?: Record<string, any>
      shapeProperties?: Record<string, any>
      rawData?: any
    }>
    images:     Array<{ posX: number; posY: number; width: number; height: number; dataUrl?: string }>
    imageSlot?: { posX: number; posY: number; width: number; height: number }
    assets?:    Array<{ posX: number; posY: number; width: number; height: number; dataUrl: string }>
    bgColor?:   string
  }>
}

type ImportedPresentationSlide = {
  title: string
  body: string
  layoutName?: string
}

type WizardScreenshotProgress = {
  sessionPath: string
  completed: number
  total: number
  current?: string
  phase: 'preparing' | 'exporting' | 'done' | 'error'
}


async function runPythonParser(keyPath: string): Promise<{ ok: true; data: TemplateData } | { ok: false; error: string }> {
  const scriptPath = join(__dirname, 'parse_key.py')
  if (!existsSync(scriptPath)) return { ok: false, error: 'parse_key.py niet gevonden' }

  return new Promise((resolve) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    const child = spawn('python3', [scriptPath, keyPath])
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => err.push(d))
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8').trim()
      if (stderr) console.warn('[parse_key] stderr:', stderr)
      if (code !== 0) { resolve({ ok: false, error: stderr || `exit ${code}` }); return }
      try {
        const data: TemplateData = JSON.parse(Buffer.concat(out).toString('utf8'))
        if ((data as any).error) { resolve({ ok: false, error: (data as any).error }); return }
        resolve({ ok: true, data })
      } catch (e: any) {
        resolve({ ok: false, error: e.message })
      }
    })
    child.on('error', (e) => resolve({ ok: false, error: e.message }))
  })
}

async function runPythonScript(scriptPath: string, ...args: string[]): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  if (!existsSync(scriptPath)) return { ok: false, error: `Script niet gevonden: ${scriptPath}` }
  return new Promise((resolve) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    const child = spawn('python3', [scriptPath, ...args])
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => err.push(d))
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8').trim()
      if (stderr) console.warn(`[${scriptPath}] stderr:`, stderr)
      if (code !== 0) { resolve({ ok: false, error: stderr || `exit ${code}` }); return }
      try {
        const data = JSON.parse(Buffer.concat(out).toString('utf8'))
        if (data.error) { resolve({ ok: false, error: data.error }); return }
        resolve({ ok: true, data })
      } catch (e: any) {
        resolve({ ok: false, error: e.message })
      }
    })
    child.on('error', (e) => resolve({ ok: false, error: e.message }))
  })
}

function runCommand(command: string, args: string[], timeout = 60000): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolveResult) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    const child = spawn(command, args, { shell: false })
    const killTimer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch {}
      resolveResult({ ok: false, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), error: `Timeout na ${timeout}ms` })
    }, timeout)
    child.stdout?.on('data', (d: Buffer) => out.push(d))
    child.stderr?.on('data', (d: Buffer) => err.push(d))
    child.on('close', (code) => {
      clearTimeout(killTimer)
      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8')
      resolveResult({ ok: code === 0, stdout, stderr, error: code === 0 ? undefined : stderr.trim() || `exit ${code}` })
    })
    child.on('error', (e) => {
      clearTimeout(killTimer)
      resolveResult({ ok: false, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), error: e.message })
    })
  })
}

function sanitizeStorageId(value: string, label = 'id'): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    console.warn(`[security] Ongeldige ${label} geblokkeerd:`, value)
    throw new Error(`Ongeldige ${label}`)
  }
  return value
}

function assertInsideRoot(inputPath: string, root: string): string {
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(inputPath)
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    console.warn('[security] Geblokkeerde path traversal:', inputPath)
    throw new Error('Blocked: path traversal attempt')
  }
  return resolvedPath
}

function safeExternalUrl(input: string, allowedHosts: string[] = []): string | null {
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:') return null
    if (allowedHosts.length && !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    console.warn(`[security] Ongeldige IPC payload geblokkeerd voor ${channel}:`, result.error.issues)
    throw new Error(`Ongeldige payload voor ${channel}`)
  }
  return result.data
}

const StorageIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/)
const NonEmptyStringSchema = z.string().trim().min(1)
const ShortStringSchema = z.string().max(500)
const DataUrlSchema = z.string().regex(/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/)
const FilePathSchema = z.string().min(1).max(4096)
const AccessTokenSchema = z.string().min(10).max(10000).optional()
const HttpsUrlSchema = z.string().url().refine((value) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}, 'Alleen HTTPS URLs zijn toegestaan')

const HupheLocalFileSchema = z.string().min(1).max(4096)
const ArrayBufferSchema = z.instanceof(ArrayBuffer)
const ImportPayloadSchema = z.object({
  fileName: z.string().min(1).max(255),
  buffer: ArrayBufferSchema,
})
const LocalPathSchema = z.string().min(1).max(4096)
const HUPHE_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
  '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.ogg', '.m4a',
  '.woff', '.woff2', '.ttf', '.otf',
  '.pdf',
])

function normalizeLocalFilePath(input: string): string {
  const raw = input.startsWith('file://')
    ? decodeURIComponent(new URL(input).pathname)
    : input
  const resolved = resolve(raw)
  const ext = extname(resolved).toLowerCase()
  if (!HUPHE_FILE_EXTENSIONS.has(ext)) {
    console.warn('[security] Geblokkeerde huphe:// file extension:', ext || '(geen)', resolved)
    throw new Error('Bestandstype niet toegestaan')
  }
  if (!existsSync(resolved)) {
    throw new Error('Bestand niet gevonden')
  }
  return resolved
}

function toHupheFileUrl(input: string): string {
  const filePath = normalizeLocalFilePath(input)
  return `huphe://file/${encodeURIComponent(filePath)}`
}

// PNG iTXt chunk writer — stores UTF-8 prompt metadata inside the PNG file.
// iTXt format: keyword\0 compressionFlag(0) compressionMethod(0) langTag\0 transKeyword\0 text(UTF-8)
function makePngItxtChunk(keyword: string, text: string): Buffer {
  const kwBuf  = Buffer.from(keyword, 'latin1')
  const txtBuf = Buffer.from(text, 'utf8')
  const data   = Buffer.concat([kwBuf, Buffer.from([0, 0, 0, 0, 0]), txtBuf])
  const type   = Buffer.from('iTXt')
  const len    = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(pngCrc32(Buffer.concat([type, data])), 0)
  return Buffer.concat([len, type, data, crcBuf])
}

function pngCrc32(buf: Buffer): number {
  if (!pngCrc32.table) {
    pngCrc32.table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      pngCrc32.table[i] = c
    }
  }
  let crc = 0xFFFFFFFF
  for (const byte of buf) crc = (crc >>> 8) ^ pngCrc32.table[(crc ^ byte) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}
pngCrc32.table = null as Uint32Array | null

function writePngPromptMetadata(filePath: string, meta: { prompt: string; model: string; modelLabel: string; createdAt: string }) {
  if (!filePath.endsWith('.png')) return
  try {
    const buf = readFileSync(filePath)
    const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (!buf.slice(0, 8).equals(PNG_SIG)) return
    // Parse past IHDR (8 sig + 4 len + 4 type + 13 data + 4 crc = 33 bytes)
    const ihdrLen = buf.readUInt32BE(8)
    const afterIhdr = 8 + 4 + 4 + ihdrLen + 4
    const chunks = Buffer.concat([
      makePngItxtChunk('huphe:prompt',     meta.prompt),
      makePngItxtChunk('huphe:model',      meta.model),
      makePngItxtChunk('huphe:modelLabel', meta.modelLabel),
      makePngItxtChunk('huphe:createdAt',  meta.createdAt),
    ])
    writeFileSync(filePath, Buffer.concat([buf.slice(0, afterIhdr), chunks, buf.slice(afterIhdr)]))
  } catch (e) {
    console.warn('[writePngPromptMetadata] kon metadata niet schrijven:', e)
  }
}

function rewriteLocalFileUrls(html: string): string {
  return html.replace(/file:\/\/([^"'\s)<>]+)/g, (match) => {
    try { return toHupheFileUrl(match) } catch { return match }
  })
}

function registerHupheProtocol(): void {
  protocol.handle('huphe', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'file') return new Response('Not found', { status: 404 })
      const filePath = normalizeLocalFilePath(decodeURIComponent(url.pathname.replace(/^\/+/, '')))
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.warn('[security] huphe:// request geblokkeerd:', request.url, err)
      return new Response('Forbidden', { status: 403 })
    }
  })
}

// ── File import validatie ────────────────────────────────────────────────────

const IMPORT_SIZE_LIMITS: Record<string, number> = {
  '.key':  500 * 1024 * 1024,
  '.pptx': 500 * 1024 * 1024,
  '.ppt':  500 * 1024 * 1024,
  '.pdf':  100 * 1024 * 1024,
  '.jpg':   20 * 1024 * 1024,
  '.jpeg':  20 * 1024 * 1024,
  '.png':   20 * 1024 * 1024,
  '.webp':  20 * 1024 * 1024,
  '.gif':   20 * 1024 * 1024,
}

// Magic bytes per bestandstype (offset 0, tenzij anders aangegeven)
const MAGIC_SIGNATURES: Array<{ exts: string[]; bytes: number[] }> = [
  { exts: ['.key', '.pptx', '.ppt'], bytes: [0x50, 0x4B, 0x03, 0x04] }, // ZIP PK\x03\x04
  { exts: ['.key', '.pptx', '.ppt'], bytes: [0x50, 0x4B, 0x05, 0x06] }, // ZIP empty
  { exts: ['.pdf'],                  bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { exts: ['.png'],                  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { exts: ['.jpg', '.jpeg'],         bytes: [0xFF, 0xD8, 0xFF] },
  { exts: ['.gif'],                  bytes: [0x47, 0x49, 0x46, 0x38] },
  { exts: ['.webp'],                 bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WebP header)
]

function validateImportBuffer(ext: string, buffer: ArrayBuffer): { ok: true } | { ok: false; error: string } {
  if (buffer.byteLength === 0) return { ok: false, error: 'Bestand is leeg.' }

  const limit = IMPORT_SIZE_LIMITS[ext]
  if (limit && buffer.byteLength > limit) {
    return { ok: false, error: `Bestand is te groot (max ${Math.round(limit / 1024 / 1024)} MB voor ${ext}).` }
  }

  const sigs = MAGIC_SIGNATURES.filter(s => s.exts.includes(ext))
  if (sigs.length > 0) {
    const bytes = new Uint8Array(buffer)
    const valid = sigs.some(s => s.bytes.every((b, i) => bytes[i] === b))
    if (!valid) return { ok: false, error: `Bestand heeft een onverwacht formaat (verwacht ${ext}).` }
  }

  return { ok: true }
}

function buildRendererCsp(): string {
  const connectSrc = app.isPackaged
    ? "'self' https: wss:"
    : "'self' http://localhost:* ws://localhost:* https: wss:"
  return [
    "default-src 'self' file: hupheai:",
    app.isPackaged ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: file: https: huphe: hupheai:",
    "media-src 'self' data: blob: file: https: huphe: hupheai:",
    "font-src 'self' data: file: https://fonts.gstatic.com https://use.typekit.net",
    `connect-src ${connectSrc}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
}

function installRendererCsp(window: BrowserWindow): void {
  const csp = buildRendererCsp()
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {}
    responseHeaders['Content-Security-Policy'] = [csp]
    callback({ responseHeaders })
  })
}

// ── Geïnstalleerde fonts ophalen (systeem + Adobe CC) ────────────────────────

let _installedFontsCache: Set<string> | null = null

async function getInstalledFontFamilies(): Promise<Set<string>> {
  if (_installedFontsCache) return _installedFontsCache

  const families = new Set<string>()

  // 1. fc-list (Homebrew) — pikt systeemfonts op
  await new Promise<void>((resolve) => {
    const fcList = exec(
      '/opt/homebrew/bin/fc-list --format="%{family}\\n" 2>/dev/null || fc-list --format="%{family}\\n" 2>/dev/null',
      { shell: '/bin/zsh' },
      (err, stdout) => {
        if (!err && stdout) {
          for (const line of stdout.split('\n')) {
            for (const name of line.split(',')) {
              const trimmed = name.trim()
              if (trimmed && !trimmed.startsWith('.')) families.add(trimmed)
            }
          }
        }
        resolve()
      }
    )
    fcList.on('error', () => resolve())
    setTimeout(() => { fcList.kill(); resolve() }, 3000)
  })

  // 2. Adobe CC fonts — verborgen OTF bestanden in de livetype map
  // fc-list scant deze map niet, dus we lezen ze zelf uit
  const adobeDir = join(require('os').homedir(), 'Library/Application Support/Adobe/CoreSync/plugins/livetype/.r')
  try {
    const { readdirSync: rd, readFileSync: rf } = await import('fs')
    const files = rd(adobeDir).filter(f => f.startsWith('.') && f.endsWith('.otf'))
    for (const file of files) {
      try {
        const data = rf(join(adobeDir, file))
        const name = readOtfFamilyName(data)
        if (name) families.add(name)
      } catch { /* skip onleesbaar bestand */ }
    }
  } catch { /* Adobe CC map niet aanwezig */ }

  _installedFontsCache = families
  return families
}

/** Leest de font family name (nameID=1) uit een OTF/TTF buffer. */
function readOtfFamilyName(data: Buffer): string | null {
  try {
    const tag = data.slice(0, 4).toString('binary')
    if (!['\x00\x01\x00\x00', 'OTTO', 'true', 'typ1'].includes(tag)) return null
    const numTables = data.readUInt16BE(4)
    for (let i = 0; i < numTables; i++) {
      const base = 12 + i * 16
      if (data.slice(base, base + 4).toString('ascii') !== 'name') continue
      const offset = data.readUInt32BE(base + 8)
      const count = data.readUInt16BE(offset + 2)
      const strOffset = data.readUInt16BE(offset + 4)
      for (let j = 0; j < count; j++) {
        const r = offset + 6 + j * 12
        const platform = data.readUInt16BE(r)
        const nameId = data.readUInt16BE(r + 6)
        if (nameId !== 1) continue
        const length = data.readUInt16BE(r + 8)
        const strOff = data.readUInt16BE(r + 10)
        const raw = data.slice(offset + strOffset + strOff, offset + strOffset + strOff + length)
        const name = platform === 3 ? raw.swap16().toString('utf16le').trim() : raw.toString('latin1').trim()
        if (name) return name
      }
    }
  } catch { /* parse fout */ }
  return null
}

ipcMain.handle('window:set-fullscreen', (_event, flag: boolean) => {
  flag = parseIpcPayload('window:set-fullscreen', z.boolean(), flag)
  const win = BrowserWindow.fromWebContents(_event.sender) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.setFullScreen(flag)
})

ipcMain.handle('file:to-huphe-url', (_event, filePath: string) => {
  const parsed = parseIpcPayload('file:to-huphe-url', HupheLocalFileSchema, filePath)
  return toHupheFileUrl(parsed)
})

// template:pick-and-import — opent een native bestandskiezer voor .key bundles
// (HTML file input werkt niet voor macOS directory-bundles)
// en importeert het gekozen bestand direct.
ipcMain.handle('template:pick-and-import', async (_event, clientId: string) => {
  clientId = parseIpcPayload('template:pick-and-import', StorageIdSchema, clientId)
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Kies een Keynote template (.key)',
    filters: [{ name: 'Keynote', extensions: ['key'] }],
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  const filePath = filePaths[0]
  const sessionPath = join(tmpdir(), `huphe_session_${clientId}.key`)
  try {
    // Parse direct op het originele pad — geen onnodige kopie nodig
    const result = await runPythonParser(filePath)
    if (!result.ok) return { ok: false, error: result.error }

    // Sla op in templatesDir — .key kan een directory-bundle of ZIP zijn
    const dest = join(templatesDir(), `${clientId}.key`)
    if (lstatSync(filePath).isDirectory()) {
      cpSync(filePath, dest, { recursive: true })
      cpSync(filePath, sessionPath, { recursive: true })
    } else {
      const buf = readFileSync(filePath)
      writeFileSync(dest, buf)
      writeFileSync(sessionPath, buf)
    }

    // Volledige templateData (incl. dataUrls) lokaal opslaan — Supabase krijgt gestripte versie
    writeFileSync(join(templatesDir(), `${clientId}_data.json`), JSON.stringify({ _cacheVersion: TEMPLATE_CACHE_VERSION, data: result.data }))
    return { ok: true, templateData: result.data, sessionPath }
  } catch (err: any) {
    try { unlinkSync(sessionPath) } catch {}
    return { ok: false, error: err.message }
  }
})

// Cache versie — verhoog dit als parse_key.py nieuwe velden toevoegt.
// Verouderde caches worden automatisch opnieuw opgebouwd.
const TEMPLATE_CACHE_VERSION = 23

// template:get-local-data — laad volledige templateData (incl. dataUrls) uit lokale cache.
// Als de cache ontbreekt of verouderd is, wordt hij automatisch herbouwd vanuit het .key bestand.
ipcMain.handle('template:get-local-data', async (_event, clientId: string) => {
  clientId = parseIpcPayload('template:get-local-data', StorageIdSchema, clientId)
  const jsonPath = join(templatesDir(), `${clientId}_data.json`)
  if (existsSync(jsonPath)) {
    try {
      const cached = JSON.parse(readFileSync(jsonPath, 'utf8'))
      if (cached._cacheVersion === TEMPLATE_CACHE_VERSION) {
        return { ok: true, templateData: cached.data }
      }
      // Cache verouderd — val door naar herparse
    } catch { /* val door naar herparse */ }
  }
  // Cache ontbreekt of verouderd — herbouwen vanuit de lokale .key file
  const keyPath = join(templatesDir(), `${clientId}.key`)
  if (!existsSync(keyPath)) return { ok: false }
  const result = await runPythonParser(keyPath)
  if (!result.ok) return { ok: false }
  try {
    writeFileSync(jsonPath, JSON.stringify({ _cacheVersion: TEMPLATE_CACHE_VERSION, data: result.data }))
  } catch { /* schrijven mislukt — retourneer toch de data */ }
  return { ok: true, templateData: result.data }
})

// ── Lokale client registry ─────────────────────────────────────────────────
// clients.json in templatesDir bevat [{id, name}] — clients die nog niet in Supabase staan.
// Bij live zetten worden ze naar Supabase gesync'd.

function clientsFilePath(): string { return join(templatesDir(), 'clients.json') }

function readLocalClients(): Array<{ id: string; name: string }> {
  const p = clientsFilePath()
  if (!existsSync(p)) return []
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return [] }
}

function writeLocalClients(clients: Array<{ id: string; name: string }>): void {
  writeFileSync(clientsFilePath(), JSON.stringify(clients), 'utf8')
}

ipcMain.handle('template:list-local-clients', async () => readLocalClients())

ipcMain.handle('template:add-local-client', async (_event, name: string) => {
  name = parseIpcPayload('template:add-local-client', z.string().trim().min(1).max(120), name)
  const clients = readLocalClients()
  const existing = clients.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing
  const id = randomUUID()
  writeLocalClients([...clients, { id, name }])
  return { id, name }
})

ipcMain.handle('template:delete-local-client', async (_event, clientId: string) => {
  clientId = parseIpcPayload('template:delete-local-client', StorageIdSchema, clientId)
  writeLocalClients(readLocalClients().filter((c) => c.id !== clientId))
  // Lokale template bestanden verwijderen
  const dir = templatesDir()
  for (const suffix of ['_data.json', '_mappings.json', '.key']) {
    const p = join(dir, `${clientId}${suffix}`)
    if (existsSync(p)) try { rmSync(p, { recursive: true }) } catch {}
  }
  return { ok: true }
})

// template:list-local — lijst alle clientIds waarvoor een lokale template bestaat
ipcMain.handle('template:list-local', async () => {
  const dir = templatesDir()
  try {
    const files = readdirSync(dir)
    return files
      .filter((f) => f.endsWith('_data.json') && !f.startsWith('_'))
      .map((f) => f.replace(/_data\.json$/, ''))
  } catch {
    return []
  }
})

// template:get-local-mappings — lees mappings JSON voor een client
ipcMain.handle('template:get-local-mappings', async (_event, clientId: string) => {
  clientId = parseIpcPayload('template:get-local-mappings', StorageIdSchema, clientId)
  const path = join(templatesDir(), `${clientId}_mappings.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
})

// template:set-local-mappings — schrijf mappings JSON voor een client
ipcMain.handle('template:set-local-mappings', async (_event, clientId: string, mappings: unknown) => {
  try {
    clientId = parseIpcPayload('template:set-local-mappings/clientId', StorageIdSchema, clientId)
    mappings = parseIpcPayload('template:set-local-mappings/mappings', z.record(z.string(), z.unknown()), mappings)
    writeFileSync(join(templatesDir(), `${clientId}_mappings.json`), JSON.stringify(mappings), 'utf8')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

// ── client:logos — lokale logo-opslag per klant ───────────────────────────────

interface LocalLogo { id: string; clientId: string; label: string | null; dataUrl: string; isPrimary: boolean; source: string; createdAt: string }

function logosFilePath(clientId: string): string { return join(templatesDir(), `${sanitizeStorageId(clientId, 'clientId')}_logos.json`) }
function readLocalLogos(clientId: string): LocalLogo[] {
  const p = logosFilePath(clientId)
  if (!existsSync(p)) return []
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return [] }
}
function writeLocalLogos(clientId: string, logos: LocalLogo[]): void {
  writeFileSync(logosFilePath(clientId), JSON.stringify(logos), 'utf8')
}

ipcMain.handle('client:get-logos', (_event, clientId: string) => readLocalLogos(parseIpcPayload('client:get-logos', StorageIdSchema, clientId)))

ipcMain.handle('client:save-logo', (_event, clientId: string, dataUrl: string, opts: { label?: string; source?: string; makePrimary?: boolean } = {}) => {
  clientId = parseIpcPayload('client:save-logo/clientId', StorageIdSchema, clientId)
  dataUrl = parseIpcPayload('client:save-logo/dataUrl', DataUrlSchema, dataUrl)
  opts = parseIpcPayload('client:save-logo/options', z.object({
    label: z.string().max(120).optional(),
    source: z.string().max(60).optional(),
    makePrimary: z.boolean().optional(),
  }).default({}), opts)
  const logos = readLocalLogos(clientId)
  const { label = null, source = 'import', makePrimary = false } = opts
  if (makePrimary) logos.forEach((l) => { l.isPrimary = false })
  const newLogo: LocalLogo = { id: crypto.randomUUID(), clientId, label, dataUrl, isPrimary: makePrimary || logos.length === 0, source, createdAt: new Date().toISOString() }
  logos.unshift(newLogo)
  writeLocalLogos(clientId, logos)
  return newLogo
})

ipcMain.handle('client:set-primary-logo', (_event, clientId: string, logoId: string) => {
  clientId = parseIpcPayload('client:set-primary-logo/clientId', StorageIdSchema, clientId)
  logoId = parseIpcPayload('client:set-primary-logo/logoId', z.uuid(), logoId)
  const logos = readLocalLogos(clientId)
  logos.forEach((l) => { l.isPrimary = l.id === logoId })
  writeLocalLogos(clientId, logos)
  return { ok: true }
})

ipcMain.handle('client:delete-logo', (_event, clientId: string, logoId: string) => {
  clientId = parseIpcPayload('client:delete-logo/clientId', StorageIdSchema, clientId)
  logoId = parseIpcPayload('client:delete-logo/logoId', z.uuid(), logoId)
  const logos = readLocalLogos(clientId).filter((l) => l.id !== logoId)
  writeLocalLogos(clientId, logos)
  return { ok: true }
})

ipcMain.handle('client:update-logo', (_event, clientId: string, logoId: string, patch: { label?: string }) => {
  clientId = parseIpcPayload('client:update-logo/clientId', StorageIdSchema, clientId)
  logoId = parseIpcPayload('client:update-logo/logoId', z.uuid(), logoId)
  patch = parseIpcPayload('client:update-logo/patch', z.object({ label: z.string().max(120).optional() }), patch)
  const logos = readLocalLogos(clientId)
  const logo = logos.find((l) => l.id === logoId)
  if (!logo) return { ok: false }
  if (patch.label !== undefined) logo.label = patch.label
  writeLocalLogos(clientId, logos)
  return { ok: true }
})

ipcMain.handle('template:import', async (_event, clientId: string, buffer: ArrayBuffer) => {
  clientId = parseIpcPayload('template:import/clientId', StorageIdSchema, clientId)
  buffer = parseIpcPayload('template:import/buffer', ArrayBufferSchema, buffer)
  const validation = validateImportBuffer('.key', buffer)
  if (!validation.ok) return { ok: false, error: validation.error }
  // Session file is kept alive so the wizard can take screenshots via Keynote.
  // The renderer calls wizard:cleanup(sessionPath) when the wizard is done.
  const sessionPath = join(tmpdir(), `huphe_session_${clientId}.key`)
  try {
    writeFileSync(sessionPath, Buffer.from(buffer))
    const result = await runPythonParser(sessionPath)
    if (!result.ok) {
      try { unlinkSync(sessionPath) } catch {}
      return { ok: false, error: result.error }
    }
    console.log('[template:import] layouts:', result.data.layouts.map((l) => l.name))
    writeFileSync(join(templatesDir(), `${clientId}.key`), Buffer.from(buffer))
    writeFileSync(join(templatesDir(), `${clientId}_data.json`), JSON.stringify({ _cacheVersion: TEMPLATE_CACHE_VERSION, data: result.data }))
    return { ok: true, templateData: result.data, sessionPath }
  } catch (err: any) {
    try { unlinkSync(sessionPath) } catch {}
    return { ok: false, error: err.message }
  }
})

function xmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function parsePptxSlides(pptxPath: string): ImportedPresentationSlide[] {
  const zip = new AdmZip(pptxPath)

  // Build slideLayoutN.xml → layout name map
  const layoutNameMap: Record<string, string> = {}
  zip.getEntries()
    .filter((e) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(e.entryName))
    .forEach((e) => {
      const xml = zip.readAsText(e.entryName)
      const m = xml.match(/<p:cSld[^>]+name="([^"]+)"/)
      if (m) layoutNameMap[e.entryName.split('/').pop()!] = m[1]
    })

  // Build slide{N}.xml → layout name via rels
  const slideLayoutMap: Record<string, string> = {}
  zip.getEntries()
    .filter((e) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(e.entryName))
    .forEach((e) => {
      const num = e.entryName.match(/slide(\d+)\.xml\.rels$/)?.[1]
      const relXml = zip.readAsText(e.entryName)
      const lm = relXml.match(/slideLayouts\/(slideLayout\d+\.xml)/)
      if (num && lm) slideLayoutMap[`slide${num}.xml`] = layoutNameMap[lm[1]] ?? ''
    })

  const entries = zip.getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const bi = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return ai - bi
    })

  return entries.map((entryName, index) => {
    const xml = zip.readAsText(entryName)
    const texts = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => xmlDecode(match[1]).trim())
      .filter(Boolean)

    const title = texts[0] || `Slide ${index + 1}`
    const body = texts.slice(1).join('\n')
    const slideName = entryName.split('/').pop()!
    return { title, body, layoutName: slideLayoutMap[slideName] ?? '' }
  }).filter((slide) => slide.title || slide.body)
}

function convertPresentationToPptx(inputPath: string, ext: string): Promise<string> {
  const outputDir = join(tmpdir(), `huphe_presentation_import_${Date.now()}`)
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'imported.pptx')
  const source = inputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const target = outputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const openCommand = ext === '.key'
    ? `open POSIX file "${source}"`
    : `open POSIX file "${source}"`

  const script = [
    'tell application "Keynote"',
    '  activate',
    `  set theDoc to ${openCommand}`,
    '  delay 1',
    `  export theDoc to POSIX file "${target}" as Microsoft PowerPoint`,
    '  close theDoc saving no',
    'end tell',
  ].join('\n')

  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-e', script])
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (code !== 0 || !existsSync(outputPath)) {
        reject(new Error(stderr.trim() || `Keynote conversie mislukt (exit ${code})`))
        return
      }
      resolve(outputPath)
    })
    child.on('error', reject)
  })
}

ipcMain.handle('presentation:import', async (_event, payload: { fileName: string; buffer: ArrayBuffer }) => {
  payload = parseIpcPayload('presentation:import', ImportPayloadSchema, payload)
  const ext = payload.fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  if (!['.key', '.ppt', '.pptx'].includes(ext)) {
    return { ok: false, error: 'Gebruik een .key, .ppt of .pptx bestand.' }
  }
  const validation = validateImportBuffer(ext, payload.buffer)
  if (!validation.ok) return { ok: false, error: validation.error }

  const inputPath = join(tmpdir(), `huphe_import_${Date.now()}_${payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`)
  try {
    writeFileSync(inputPath, Buffer.from(payload.buffer))
    const pptxPath = ext === '.pptx' ? inputPath : await convertPresentationToPptx(inputPath, ext)
    const slides = parsePptxSlides(pptxPath)
    if (slides.length === 0) {
      return { ok: false, error: 'Geen tekst gevonden in deze presentatie.' }
    }
    return { ok: true, slides }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Presentatie importeren mislukt.' }
  } finally {
    try { unlinkSync(inputPath) } catch {}
  }
})

ipcMain.handle('presentation:import-ir', async (_event, payload: { fileName: string; buffer: ArrayBuffer }) => {
  payload = parseIpcPayload('presentation:import-ir', ImportPayloadSchema, payload)
  const ext = payload.fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  if (!['.key', '.ppt', '.pptx'].includes(ext)) {
    return { ok: false, error: 'Gebruik een .key, .ppt of .pptx bestand.' }
  }
  const validation = validateImportBuffer(ext, payload.buffer)
  if (!validation.ok) return { ok: false, error: validation.error }
  const inputPath = join(tmpdir(), `huphe_ir_import_${Date.now()}_${payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`)
  try {
    writeFileSync(inputPath, Buffer.from(payload.buffer))
    const pptxPath = ext === '.pptx' ? inputPath : await convertPresentationToPptx(inputPath, ext)
    const { importFromPptx } = await import('./lib/pptx-importer')
    const result = await importFromPptx(readFileSync(pptxPath))
    return { ok: true, presentation: result.presentation, fidelityItems: result.fidelityItems }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'IR import mislukt.' }
  } finally {
    try { unlinkSync(inputPath) } catch {}
  }
})

// Open an existing Keynote as a self-contained project.
// Receives the absolute file path from the renderer (Electron File.path).
// Reads the file in the main process — no large IPC buffer transfer.
ipcMain.handle('key:import-as-project', async (_event, filePath: string) => {
  filePath = parseIpcPayload('key:import-as-project', LocalPathSchema, filePath)
  console.log('[key:import-as-project] filePath:', filePath)
  const clientId = randomUUID()
  try {
    if (!existsSync(filePath)) return { ok: false, error: `Bestand niet gevonden: ${filePath}` }

    // Run both parsers in parallel: template layouts + slide content
    const [templateResult, slidesResult] = await Promise.all([
      runPythonParser(filePath),
      runPythonScript(join(__dirname, 'parse_key_slides.py'), filePath),
    ])

    console.log('[key:import-as-project] templateResult.ok:', templateResult.ok, (templateResult as any).error ?? '')
    console.log('[key:import-as-project] slidesResult.ok:', slidesResult.ok, (slidesResult as any).error ?? '')

    if (!templateResult.ok) return { ok: false, error: `Template: ${templateResult.error}` }
    if (!slidesResult.ok)   return { ok: false, error: `Slides: ${slidesResult.error}` }

    const slides: ImportedPresentationSlide[] = slidesResult.data.slides ?? []
    if (slides.length === 0) return { ok: false, error: 'Geen slide-inhoud gevonden. Bevat de Keynote tekst op de slides?' }

    // Copy .key to templatesDir so generate/export still works.
    // A .key can be a directory bundle (macOS package) or a ZIP file.
    const dest = join(templatesDir(), `${clientId}.key`)
    if (lstatSync(filePath).isDirectory()) {
      cpSync(filePath, dest, { recursive: true })
    } else {
      const buf = readFileSync(filePath)
      writeFileSync(dest, buf)
    }

    return { ok: true, clientId, templateData: templateResult.data, slides }
  } catch (err: any) {
    console.error('[key:import-as-project] error:', err)
    return { ok: false, error: err.message ?? 'Keynote openen mislukt.' }
  }
})

// Fallback: renderer sends ArrayBuffer when File.path is unavailable (some drag-drop contexts).
ipcMain.handle('key:import-as-project-buffer', async (_event, payload: { fileName: string; buffer: ArrayBuffer }) => {
  payload = parseIpcPayload('key:import-as-project-buffer', ImportPayloadSchema, payload)
  console.log('[key:import-as-project-buffer] fileName:', payload.fileName)
  const validation = validateImportBuffer('.key', payload.buffer)
  if (!validation.ok) return { ok: false, error: validation.error }
  const clientId = randomUUID()
  const tempPath = join(tmpdir(), `huphe_keyopen_${Date.now()}.key`)
  try {
    writeFileSync(tempPath, Buffer.from(payload.buffer))
    const [templateResult, slidesResult] = await Promise.all([
      runPythonParser(tempPath),
      runPythonScript(join(__dirname, 'parse_key_slides.py'), tempPath),
    ])
    console.log('[key:import-as-project-buffer] template.ok:', templateResult.ok, 'slides.ok:', slidesResult.ok)
    if (!templateResult.ok) return { ok: false, error: `Template: ${templateResult.error}` }
    if (!slidesResult.ok)   return { ok: false, error: `Slides: ${slidesResult.error}` }
    const slides: ImportedPresentationSlide[] = slidesResult.data.slides ?? []
    if (slides.length === 0) return { ok: false, error: 'Geen slide-inhoud gevonden.' }
    writeFileSync(join(templatesDir(), `${clientId}.key`), Buffer.from(payload.buffer))
    return { ok: true, clientId, templateData: templateResult.data, slides }
  } catch (err: any) {
    console.error('[key:import-as-project-buffer] error:', err)
    return { ok: false, error: err.message ?? 'Keynote openen mislukt.' }
  } finally {
    try { unlinkSync(tempPath) } catch {}
  }
})

// Drag-and-drop of macOS .key packages: renderer reads Index/*.iwa files directly
// via webkitGetAsEntry() and sends them as ArrayBuffers. We write them to a temp
// directory bundle, run the Python parsers, then copy to templatesDir.
ipcMain.handle('key:import-as-project-files', async (
  _event,
  fileName: string,
  files: Record<string, ArrayBuffer>,
) => {
  fileName = parseIpcPayload('key:import-as-project-files/fileName', z.string().min(1).max(255), fileName)
  files = parseIpcPayload('key:import-as-project-files/files', z.record(z.string().min(1).max(512), ArrayBufferSchema), files)
  console.log('[key:import-as-project-files] fileName:', fileName, 'entries:', Object.keys(files).length)
  const clientId = randomUUID()
  const tempDir   = join(tmpdir(), `huphe_key_${clientId}.key`)
  const destDir   = join(templatesDir(), `${clientId}.key`)
  try {
    // Write IWA files to a temp directory that looks like a .key bundle
    for (const [relativePath, buf] of Object.entries(files)) {
      const fullPath = join(tempDir, ...relativePath.split('/'))
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, Buffer.from(buf))
    }

    const [templateResult, slidesResult] = await Promise.all([
      runPythonParser(tempDir),
      runPythonScript(join(__dirname, 'parse_key_slides.py'), tempDir),
    ])
    console.log('[key:import-as-project-files] template.ok:', templateResult.ok, 'slides.ok:', slidesResult.ok)
    if (!templateResult.ok) return { ok: false, error: `Template: ${templateResult.error}` }
    if (!slidesResult.ok)   return { ok: false, error: `Slides: ${slidesResult.error}` }

    const slides: ImportedPresentationSlide[] = slidesResult.data.slides ?? []
    if (slides.length === 0) return { ok: false, error: 'Geen slide-inhoud gevonden.' }

    // Persist the bundle in templatesDir so export/generation still works
    cpSync(tempDir, destDir, { recursive: true })
    return { ok: true, clientId, templateData: templateResult.data, slides }
  } catch (err: any) {
    console.error('[key:import-as-project-files] error:', err)
    return { ok: false, error: err.message ?? 'Keynote openen mislukt.' }
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
})

// Generates a .ts template file from parsed Keynote templateData.
// Only available in development mode — writes to the source tree.
ipcMain.handle('template:generate-ts', async (_event, payload: {
  templateData: any
  name: string
  clientId: string
  sageTagMappings?: Record<string, Record<string, string>>
}) => {
  if (app.isPackaged) return { ok: false, error: 'Alleen beschikbaar in development mode.' }
  payload = parseIpcPayload('template:generate-ts', z.object({
    templateData: z.record(z.string(), z.unknown()),
    name: z.string().min(1).max(160),
    clientId: StorageIdSchema,
    sageTagMappings: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  }), payload)

  const { templateData, name, clientId, sageTagMappings = {} } = payload
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'keynote-template'
  const varName = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/-/g, '') + 'Template'

  // Strip calibration artifacts — skinDataUrl and previewDataUrl are runtime-only
  const cleanTemplateData = {
    ...templateData,
    layouts: (templateData.layouts ?? []).map((l: any) => {
      const { skinDataUrl: _s, previewDataUrl: _p, ...rest } = l
      return rest
    }),
  }

  const now = new Date().toISOString()
  const ts = [
    `// Auto-generated from Keynote import — ${name}`,
    `// Generated: ${now}`,
    `import type { HtmlPresentationTemplate } from '../../../lib/html-presentation-templates'`,
    `import type { TemplateData } from '../../../components/WebSlidePreview'`,
    ``,
    `const templateData: TemplateData = ${JSON.stringify(cleanTemplateData, null, 2)}`,
    ``,
    `export const sageTagMappings: Record<string, Record<string, string>> = ${JSON.stringify(sageTagMappings, null, 2)}`,
    ``,
    `export const ${varName}: HtmlPresentationTemplate = {`,
    `  id: ${JSON.stringify(slug)},`,
    `  name: ${JSON.stringify(name)},`,
    `  description: 'Geïmporteerd uit Keynote.',`,
    `  rawTemplateData: templateData,`,
    `  keynoteClientId: ${JSON.stringify(clientId)},`,
    `  source: 'system',`,
    `  createdAt: ${JSON.stringify(now)},`,
    `  updatedAt: ${JSON.stringify(now)},`,
    `}`,
  ].join('\n')

  const templatesDir = join(app.getAppPath(), 'src', 'renderer', 'src', 'templates', 'presentation', slug)
  const outFile = join(templatesDir, 'index.ts')
  mkdirSync(templatesDir, { recursive: true })
  writeFileSync(outFile, ts, 'utf-8')

  // Update de templates index — verwijder eerst alle bestaande regels voor deze slug,
  // dan voeg de correcte import en array-entry toe.
  const indexPath = join(app.getAppPath(), 'src', 'renderer', 'src', 'templates', 'presentation', 'index.ts')
  let indexSrc = readFileSync(indexPath, 'utf-8')
  const slugNorm = slug.toLowerCase().replace(/-/g, '')

  // Verwijder alle regels die deze slug importeren of ernaar verwijzen
  const cleanedLines = indexSrc.split('\n').filter((l) => {
    // Verwijder import-regels voor deze slug-folder
    if (l.includes(`from './${slug}'`)) return false
    // Verwijder array-entries voor templates van deze slug
    const m = l.match(/^\s+([a-zA-Z0-9_]+Template),/)
    if (m && m[1].toLowerCase().replace(/template$/, '').replace(/-/g, '') === slugNorm) return false
    return true
  })
  indexSrc = cleanedLines.join('\n')

  // Voeg de correcte import en array-entry toe
  const importLine = `import { ${varName} } from './${slug}'`
  indexSrc = indexSrc.replace(
    /^(import .+\n)+/m,
    (match) => match + importLine + '\n',
  )
  indexSrc = indexSrc.replace(
    /systemHtmlPresentationTemplates: HtmlPresentationTemplate\[] = \[/,
    `systemHtmlPresentationTemplates: HtmlPresentationTemplate[] = [\n  ${varName},`,
  )
  writeFileSync(indexPath, indexSrc, 'utf-8')

  console.log(`[template:generate-ts] geschreven: ${outFile}`)
  return { ok: true, path: outFile, slug }
})

// template:pdf-to-screenshots — PDF pagina's omzetten naar PNG dataURLs via pdftoppm.
// Gebruikt als alternatief voor Keynote screenshots in de wizard.
ipcMain.handle('template:pdf-to-screenshots', async (_event, pdfBuffer: ArrayBuffer) => {
  pdfBuffer = parseIpcPayload('template:pdf-to-screenshots', ArrayBufferSchema, pdfBuffer)
  const pdfValidation = validateImportBuffer('.pdf', pdfBuffer)
  if (!pdfValidation.ok) return { ok: false, error: pdfValidation.error }
  const PDFTOPPM = '/opt/homebrew/bin/pdftoppm'
  if (!existsSync(PDFTOPPM)) return { ok: false, error: 'pdftoppm niet gevonden.' }

  const tmpPdf = join(tmpdir(), `huphe_pdf_${Date.now()}.pdf`)
  const tmpPrefix = join(tmpdir(), `huphe_pdf_${Date.now()}_page`)
  try {
    writeFileSync(tmpPdf, Buffer.from(pdfBuffer))
    const result = await runCommand(PDFTOPPM, ['-png', '-r', '144', tmpPdf, tmpPrefix], 60000)
    if (!result.ok) throw new Error(result.error || 'pdftoppm mislukt')
    // Lees gegenereerde PNG bestanden gesorteerd op paginanummer
    const dir = tmpdir()
    const prefix = tmpPrefix.split('/').pop()!
    const pngs = readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
      .sort()
      .map((f) => join(dir, f))

    const dataUrls = pngs.map((p) => {
      const buf = readFileSync(p)
      try { unlinkSync(p) } catch {}
      return `data:image/png;base64,${buf.toString('base64')}`
    })
    return { ok: true, dataUrls }
  } catch (err: any) {
    return { ok: false, error: err.message }
  } finally {
    try { unlinkSync(tmpPdf) } catch {}
  }
})

// template:build-key-from-html — bouw een .key bestand vanuit TemplateData JSON + shape PNGs.
// shape_pngs: {layoutName: base64PngString} — elke layout heeft een pre-rendered achtergrond.
ipcMain.handle('template:build-key-from-html', async (_event, payload: {
  templateData: unknown
  shapePngs: Record<string, string>  // layoutName → base64 PNG
  name: string
  baseKeyClientId?: string           // optionele UUID voor een betere donor .key
}) => {
  const { templateData, shapePngs, name, baseKeyClientId } = payload
  const buildPy = join(__dirname, 'build_key.py')
  if (!existsSync(buildPy)) return { ok: false, error: 'build_key.py niet gevonden.' }

  const tmpDir = join(tmpdir(), `huphe_build_key_${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  const templateDataPath = join(tmpDir, 'template_data.json')
  const shapesDir = join(tmpDir, 'shapes')
  mkdirSync(shapesDir, { recursive: true })
  const outputKey = join(tmpDir, `${name.replace(/[^a-z0-9_-]/gi, '_')}.key`)

  try {
    writeFileSync(templateDataPath, JSON.stringify(templateData), 'utf8')

    // Schrijf shape PNGs naar schijf
    for (const [layoutName, b64] of Object.entries(shapePngs)) {
      const safeName = layoutName.replace(/[/\\?%*:|"<>]/g, '_')
      const pngPath = join(shapesDir, `${safeName}.png`)
      const base64Data = b64.replace(/^data:image\/\w+;base64,/, '')
      writeFileSync(pngPath, Buffer.from(base64Data, 'base64'))
    }

    // Zoek de beste donor .key: gebruik opgegeven client of de eerste beschikbare
    let baseKey: string | null = null
    const tDir = templatesDir()
    if (baseKeyClientId) {
      sanitizeStorageId(baseKeyClientId, 'baseKeyClientId')
      const candidate = join(tDir, `${baseKeyClientId}.key`)
      if (existsSync(candidate)) baseKey = candidate
    }
    if (!baseKey) {
      const { readdirSync: rd } = await import('fs')
      const keyFiles = rd(tDir).filter((f) => f.endsWith('.key'))
      if (keyFiles.length > 0) baseKey = join(tDir, keyFiles[0])
    }
    if (!baseKey) return { ok: false, error: 'Geen donor .key gevonden. Importeer eerst een Keynote-template.' }

    // Run build_key.py
    const result = await runCommand('python3', [buildPy, templateDataPath, shapesDir, outputKey, baseKey], 120000)

    if (!result.ok) return result

    // Lees het gebouwde .key bestand en retourneer als buffer
    const keyBuffer = readFileSync(outputKey)
    return { ok: true, buffer: keyBuffer.buffer.slice(keyBuffer.byteOffset, keyBuffer.byteOffset + keyBuffer.byteLength), fileName: `${name}.key` }
  } finally {
    // Opruimen
    try { rmSync(tmpDir, { recursive: true }) } catch {}
  }
})

// Generates a preview .key file with one slide per layout using write_key.py
// (works for all templates, including those with only master slides and no example slides),
// then exports each slide as PNG via Keynote Creator Studio.
ipcMain.handle('wizard:take-screenshots', async (event, sessionPath: string, layoutNames: string[]) => {
  sessionPath = assertInsideRoot(sessionPath, tmpdir())
  if (!existsSync(sessionPath)) return { ok: false, error: 'Sessiebestand niet gevonden. Upload het .key bestand opnieuw.' }

  const totalLayouts = layoutNames.length
  const emitProgress = (progress: Omit<WizardScreenshotProgress, 'sessionPath' | 'total'>) => {
    event.sender.send('wizard:screenshot-progress', {
      sessionPath,
      total: totalLayouts,
      ...progress,
    } satisfies WizardScreenshotProgress)
  }

  if (totalLayouts === 0) {
    emitProgress({ completed: 0, phase: 'done' })
    return { ok: true, screenshots: [] }
  }

  console.log('[wizard:take-screenshots] layouts:', layoutNames)
  emitProgress({ completed: 0, current: layoutNames[0], phase: 'preparing' })

  const writePy = join(__dirname, 'write_key.py')
  const asStr   = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  // Pre-launch Keynote Creator Studio once so it stays alive across batches.
  await runCommand('open', ['-g', '-a', 'Keynote Creator Studio'], 10000)
  await new Promise<void>((r) => setTimeout(r, 3000))

  // Process layouts in small batches to avoid Keynote crashes on large files.
  // 10 slides per batch keeps memory pressure low while staying fast.
  const BATCH_SIZE = 10
  const allScreenshots: (string | null)[] = []

  for (let batchStart = 0; batchStart < layoutNames.length; batchStart += BATCH_SIZE) {
    const batch      = layoutNames.slice(batchStart, batchStart + BATCH_SIZE)
    const batchNum   = Math.floor(batchStart / BATCH_SIZE) + 1
    const totalBatch = Math.ceil(layoutNames.length / BATCH_SIZE)
    const label      = `batch ${batchNum}/${totalBatch} (${batch.length} layouts)`

    const exportDir   = join(tmpdir(), `huphe_wizard_${Date.now()}`)
    const slidesPath  = join(tmpdir(), `huphe_wiz_slides_${Date.now()}.json`)
    const previewPath = join(tmpdir(), `huphe_wiz_preview_${Date.now()}.key`)
    mkdirSync(exportDir, { recursive: true })
    emitProgress({ completed: allScreenshots.length, current: batch[0], phase: 'preparing' })

    writeFileSync(slidesPath, JSON.stringify(batch.map((name) => ({ layoutName: name, fields: {} }))))

    const genResult = await runCommand('python3', [writePy, sessionPath, slidesPath, previewPath], 60000)
    try { unlinkSync(slidesPath) } catch {}
    const genOk = { ok: genResult.ok, error: genResult.error }
    if (!genOk.ok) {
      console.error(`[wizard:take-screenshots] ${label} write_key.py fout:`, genOk.error)
      batch.forEach((layoutName) => {
        allScreenshots.push(null)
        emitProgress({
          completed: Math.min(allScreenshots.length, totalLayouts),
          current: layoutName,
          phase: 'error',
        })
      })
      continue
    }

    emitProgress({ completed: allScreenshots.length, current: batch[0], phase: 'exporting' })

    // Fixed 8s delay per 10-slide batch — Keynote can always load a small file.
    const script = [
      'tell application "Keynote Creator Studio"',
      `  set theDoc to open POSIX file "${asStr(previewPath)}"`,
      '  delay 8',
      `  export theDoc to POSIX file "${asStr(exportDir)}" as slide images with properties {image format:PNG}`,
      '  close theDoc saving no',
      'end tell',
    ].join('\n')

    const scriptPath = join(tmpdir(), `huphe_wiz_script_${Date.now()}.applescript`)
    writeFileSync(scriptPath, script)

    const batchPngs = await (async () => {
      const osascript = await runCommand('osascript', [scriptPath], 90000)
      try { unlinkSync(scriptPath) } catch {}
      try { unlinkSync(previewPath) } catch {}
      if (!osascript.ok) {
        console.error(`[wizard:take-screenshots] ${label} Keynote fout:`, osascript.error)
        return []
      }
      const pngs = findPngsRecursive(exportDir)
      console.log(`[wizard:take-screenshots] ${label} → ${pngs.length} PNGs`)
      pngs.forEach((p, i) => console.log(`  [${batchStart + i}] ${basename(p)}`))
      // Resize to max 1920px wide — prevents oversized base64 payloads from Retina exports.
      await Promise.all(pngs.map((p) => runCommand('sips', ['-Z', '1920', p], 30000)))
      return pngs
    })()

    batch.forEach((layoutName, idx) => {
      const p = batchPngs[idx]
      allScreenshots.push(p ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null)
      emitProgress({
        completed: Math.min(allScreenshots.length, totalLayouts),
        current: layoutName,
        phase: p ? 'exporting' : 'error',
      })
    })
  }

  // Quit Keynote Creator Studio when all batches are done.
  void runCommand('osascript', ['-e', 'tell application "Keynote Creator Studio" to quit saving no'], 10000)
  BrowserWindow.getAllWindows()[0]?.focus()
  emitProgress({ completed: totalLayouts, phase: 'done' })
  console.log(`[wizard:take-screenshots] klaar — ${allScreenshots.filter(Boolean).length}/${layoutNames.length} screenshots`)
  return { ok: true, screenshots: allScreenshots }
})

ipcMain.handle('wizard:cleanup', (_event, sessionPath: string) => {
  try { unlinkSync(assertInsideRoot(sessionPath, tmpdir())) } catch {}
  return { ok: true }
})

// ── Skin rendering (screenshot-as-background) ───────────────────────────────
// Generate a "skin" for one layout: the Keynote render with all sage-tag fields
// BLANKED (empty text, empty media), so only the decoration (shapes, shadows,
// phone mockups, logos…) remains. The renderer then overlays the editable
// sage-tag fields on top — pixel-perfect decoration, fully editable content.
ipcMain.handle('skin:generate', async (_event, payload: { clientId: string; layoutName: string; blankFields: Record<string, string> }) => {
  const clientId = sanitizeStorageId(payload.clientId, 'clientId')
  const keyPath = join(templatesDir(), `${clientId}.key`)
  if (!existsSync(keyPath)) return { ok: false, error: 'Template .key niet gevonden.' }

  const writePy     = join(__dirname, 'write_key.py')
  const slidesPath  = join(tmpdir(), `huphe_skin_slides_${Date.now()}.json`)
  const previewPath = join(tmpdir(), `huphe_skin_preview_${Date.now()}.key`)
  const exportDir   = join(tmpdir(), `huphe_skin_${Date.now()}`)
  const asStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  try {
    mkdirSync(exportDir, { recursive: true })
    // One slide of this layout, every sage tag blanked.
    writeFileSync(slidesPath, JSON.stringify([{ layoutName: payload.layoutName, fields: payload.blankFields }]))

    const gen = await runCommand('python3', [writePy, keyPath, slidesPath, previewPath], 60000)
    if (!gen.ok) return { ok: false, error: `write_key: ${gen.error}` }

    await runCommand('open', ['-g', '-a', 'Keynote Creator Studio'], 10000)
    const script = [
      'tell application "Keynote Creator Studio"',
      `  set theDoc to open POSIX file "${asStr(previewPath)}"`,
      '  delay 6',
      `  export theDoc to POSIX file "${asStr(exportDir)}" as slide images with properties {image format:PNG}`,
      '  close theDoc saving no',
      'end tell',
    ].join('\n')
    const scriptPath = join(tmpdir(), `huphe_skin_script_${Date.now()}.applescript`)
    writeFileSync(scriptPath, script)

    const png = await (async () => {
      const osascript = await runCommand('osascript', [scriptPath], 90000)
      try { unlinkSync(scriptPath) } catch {}
      if (!osascript.ok) { console.error('[skin] Keynote fout:', osascript.error); return null }
      const pngs = findPngsRecursive(exportDir)
      if (!pngs.length) return null
      await runCommand('sips', ['-Z', '2400', pngs[0]], 30000)
      return `data:image/png;base64,${readFileSync(pngs[0]).toString('base64')}`
    })()
    if (!png) return { ok: false, error: 'Keynote-export mislukt (Keynote Creator Studio geïnstalleerd?).' }
    return { ok: true, skinDataUrl: png }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Skin genereren mislukt.' }
  } finally {
    try { unlinkSync(slidesPath) } catch {}
    try { unlinkSync(previewPath) } catch {}
  }
})

// ── Calibration (visual fidelity) ──────────────────────────────────────────
// Resolve the local .key path for a template so the calibrator can feed it to
// the existing Keynote screenshot pipeline as a sessionPath.
ipcMain.handle('calibration:get-key-path', (_event, clientId: string) => {
  clientId = sanitizeStorageId(clientId, 'clientId')
  const p = join(templatesDir(), `${clientId}.key`)
  if (!existsSync(p)) return { ok: false, error: 'Template .key niet gevonden.' }
  return { ok: true, keyPath: p }
})

// Hidden offscreen window that renders the real WebSlidePreview for calibration,
// so HTML screenshots never disturb the visible editor. The renderer boots into
// a minimal calibration mode via the #calibration hash.
let calibrationWin: BrowserWindow | null = null

ipcMain.handle('calibration:session-start', async (_event, payload: { templateData: unknown; mappings?: unknown; bgColors?: unknown }) => {
  if (calibrationWin) { try { calibrationWin.destroy() } catch {} calibrationWin = null }
  const win = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  calibrationWin = win
  let appReadyFired = false
  const appReady = new Promise<void>((resolve) => {
    ipcMain.once('calibration:app-ready', () => { appReadyFired = true; resolve() })
    setTimeout(resolve, 6000)
  })
  win.webContents.on('console-message', (_e, _lvl, message) => console.log('[calib-win]', message))
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[calib-win] laden mislukt:', code, desc))
  const devServerURL = process.env['ELECTRON_RENDERER_URL']
  console.log('[calib] verborgen venster laadt:', devServerURL ? `${devServerURL}#calibration` : 'index.html#calibration')
  if (devServerURL) await win.loadURL(`${devServerURL}#calibration`)
  else await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'calibration' })
  await appReady
  console.log('[calib] verborgen venster app-ready:', appReadyFired ? 'ja' : 'TIMEOUT (6s) — venster reageerde niet')
  win.webContents.send('calibration:init', payload)
  await new Promise((r) => setTimeout(r, 200))
  return { ok: true, appReady: appReadyFired }
})

// Render one layout (with optional corrections) in the hidden window and return
// its screenshot, cropped to the 16:9 slide region.
ipcMain.handle('calibration:render-and-capture', async (_event, payload: { layoutName: string; corrections?: unknown }) => {
  const win = calibrationWin
  if (!win || win.isDestroyed()) return { ok: false, error: 'Geen calibratievenster.' }
  await new Promise<void>((resolve) => {
    ipcMain.once('calibration:rendered', () => resolve())
    win.webContents.send('calibration:render', payload)
    setTimeout(resolve, 4000)
  })
  await new Promise((r) => setTimeout(r, 180))  // let fonts/images finish painting
  const img = await win.webContents.capturePage()
  const { width: physW, height: physH } = img.getSize()
  const cropH = Math.min(Math.round(physW * 9 / 16), physH)
  const cropped = img.crop({ x: 0, y: 0, width: physW, height: cropH })
  const pngBuf = stripIccChunk(cropped.toPNG())
  return { ok: true, dataUrl: `data:image/png;base64,${pngBuf.toString('base64')}` }
})

ipcMain.handle('calibration:session-end', () => {
  if (calibrationWin) { try { calibrationWin.destroy() } catch {} calibrationWin = null }
  return { ok: true }
})

// ── Ad → HTML converter ───────────────────────────────────────────────────────

let adLogWin: BrowserWindow | null = null

ipcMain.handle('ad:open-log-window', () => {
  if (adLogWin && !adLogWin.isDestroyed()) { adLogWin.focus(); return { ok: true } }
  adLogWin = new BrowserWindow({
    width: 740,
    height: 560,
    title: 'Ad→HTML Logs',
    backgroundColor: '#0e0e0e',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  adLogWin.on('closed', () => { adLogWin = null })
  adLogWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0e0e0e;color:#d4d4d4;font:12px/1.6 'SF Mono','Fira Mono',monospace;padding:12px;overflow-y:auto}
  .line{padding:2px 0;border-bottom:1px solid #1a1a1a;white-space:pre-wrap;word-break:break-all}
  .line.info{color:#7ec8e3}.line.ok{color:#6fcf97}.line.warn{color:#f2c94c}.line.err{color:#eb5757}
  .line.section{color:#facc15;font-weight:700;margin-top:8px;border-bottom:1px solid #2a2a2a}
  #log{padding-bottom:40px}
  #clear{position:fixed;bottom:10px;right:12px;background:#1e1e1e;color:#666;border:1px solid #333;border-radius:6px;padding:4px 10px;cursor:pointer;font:11px monospace}
  #clear:hover{color:#fff}
</style></head><body>
<div id="log"></div>
<button id="clear">wis</button>
<script>
  const log = document.getElementById('log')
  document.getElementById('clear').addEventListener('click', () => { log.textContent = '' })
  window.appendAdLog = ({msg,level})=>{
    const d = new Date()
    const ts = d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0')
    const el = document.createElement('div')
    el.className = 'line '+(level||'info')
    el.textContent = '['+ts+'] '+msg
    log.appendChild(el)
    el.scrollIntoView()
  }
</script></body></html>`)}`)
  return { ok: true }
})

function adLog(event: Electron.IpcMainInvokeEvent | null, msg: string, level: 'info' | 'ok' | 'warn' | 'err' | 'section' = 'info') {
  console.log(`[ad:log] [${level}] ${msg}`)
  const payload = { msg, level }
  try { adLogWin?.webContents.executeJavaScript(`window.appendAdLog?.(${JSON.stringify(payload)})`).catch(() => {}) } catch {}
  try { if (event) event.sender.send('ad:log', payload) } catch {}
}

async function renderHtmlCapture(html: string, width: number, height: number, event: Electron.IpcMainInvokeEvent | null = null): Promise<Buffer> {
  adLog(event, `renderHtmlCapture: ${width}×${height}px, HTML ${(html.length / 1024).toFixed(1)}KB`)
  const t0 = Date.now()
  const safeHtml = rewriteLocalFileUrls(html)
  const win = new BrowserWindow({ show: false, width, height, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(safeHtml)}`)
    adLog(event, `  BrowserWindow geladen in ${Date.now() - t0}ms`)
    await win.webContents.executeJavaScript(`
      document.documentElement.style.cssText += ';overflow:hidden!important';
      (async () => {
        const s = document.createElement('style');
        s.textContent = '*,*::before,*::after{animation-duration:0ms!important;transition-duration:0ms!important}';
        document.head.appendChild(s);
        await document.fonts.ready;
      })()
    `)
    const fontCount = await win.webContents.executeJavaScript(`document.fonts.size`)
    adLog(event, `  Fonts ready: ${fontCount} font(s) geladen`)
    await new Promise((r) => setTimeout(r, 150))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width, height })
    const size = img.getSize()
    adLog(event, `  capturePage: ${size.width}×${size.height}px in ${Date.now() - t0}ms totaal`)
    return stripIccChunk(img.toPNG())
  } finally {
    try { win.destroy() } catch {}
  }
}

ipcMain.handle('ad:image-to-html', async (event, payload: { imageDataUrl: string }) => {
  const { imageDataUrl } = payload
  const apiKey = cachedJwt
  if (!apiKey) return { ok: false, error: 'Niet ingelogd.' }
  const { callOpenRouter } = await import('./lib/proxy')

  const sendProgress = (message: string) => {
    try { event.sender.send('ad:progress', message) } catch {}
  }

  const log = (msg: string, level: 'info' | 'ok' | 'warn' | 'err' | 'section' = 'info') => adLog(event, msg, level)

  try {
    const { default: sharp } = await import('sharp')
    const imgBuf = Buffer.from(imageDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')

    log('── Ad→HTML pipeline gestart ──', 'section')
    log(`Afbeelding: ${(imgBuf.length / 1024).toFixed(1)}KB, mime prefix: ${imageDataUrl.slice(0, 20)}`)

    const meta = await sharp(imgBuf).metadata()
    const width = meta.width ?? 1200
    const height = meta.height ?? 628
    log(`Afmetingen: ${width}×${height}px, formaat: ${meta.format}, kleurruimte: ${meta.space ?? 'onbekend'}`)

    const callClaude = async (messages: unknown[], label: string): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> => {
      log(`Claude aanroep: ${label}`, 'section')
      const bodyStr = JSON.stringify({ model: 'anthropic/claude-sonnet-4-6', messages, temperature: 0, stream: false })
      log(`  Model: anthropic/claude-sonnet-4-6`)
      log(`  Payload grootte: ${(bodyStr.length / 1024).toFixed(1)}KB`)
      log(`  Berichten: ${(messages as any[]).length}, content-blokken: ${(messages as any[])[0]?.content?.length ?? '?'}`)
      const t0 = Date.now()
      const res = await callOpenRouter(JSON.parse(bodyStr), apiKey)
      const durationMs = Date.now() - t0
      if (!res.ok) {
        const errText = await res.text()
        const { openRouterError } = await import('./lib/ad-pipeline')
        const msg = openRouterError(res.status, errText)
        log(`  ${msg}`, 'err')
        throw new Error(msg)
      }
      const json = await res.json() as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } }
      const content = json.choices[0].message.content
      const inputTokens = json.usage?.prompt_tokens ?? 0
      const outputTokens = json.usage?.completion_tokens ?? 0
      log(`  Duur: ${durationMs}ms`, durationMs > 20000 ? 'warn' : 'ok')
      log(`  Tokens: ${inputTokens} input / ${outputTokens} output`, 'ok')
      log(`  Antwoord lengte: ${content.length} tekens`)
      return { content, inputTokens, outputTokens, durationMs }
    }

    const extractHtml = (text: string, label: string): string => {
      const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/)
      if (fenced) {
        log(`  HTML extractie (${label}): code fence gevonden, ${fenced[1].trim().length} tekens`)
        return fenced[1].trim()
      }
      const start = text.indexOf('<!DOCTYPE') >= 0 ? text.indexOf('<!DOCTYPE') : text.indexOf('<html')
      if (start >= 0) {
        log(`  HTML extractie (${label}): raw HTML op positie ${start}, ${text.slice(start).trim().length} tekens`)
        return text.slice(start).trim()
      }
      log(`  HTML extractie (${label}): geen herkenbaar HTML gevonden, retourneer raw tekst`, 'warn')
      return text.trim()
    }

    const { compareImages } = await import('./lib/visual-diff')

    log('── Stap 1: initiële HTML genereren ──', 'section')
    sendProgress('Claude genereert de initiële HTML…')
    const initResult = await callClaude([{
      role: 'user',
      content: [
        { type: 'text', text: `Bouw deze advertentie exact na in HTML en CSS.\n\nRegels:\n- Één HTML-bestand met inline <style>, geen externe resources.\n- Vervang foto's door placeholder-divs met dezelfde dominante kleur en afmeting.\n- Body: margin 0, padding 0, overflow hidden.\n- Root-element exact ${width}×${height}px.\n- Absolute positionering voor pixelaccurate layout.\n- Exacte kleuren, fonts (of closest web-safe fallback), tekst en groottes.\n- Retourneer ALLEEN de HTML, geen uitleg.` },
        { type: 'text', text: 'De advertentie:' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    }], 'initiële HTML')

    let html = extractHtml(initResult.content, 'stap-1')
    log(`Initiële HTML: ${(html.length / 1024).toFixed(1)}KB`)

    const ACCEPT_SSIM = 0.82
    const MAX_ITER = 3
    let ssim = 0
    let heatmap = ''
    let iterations = 0
    let status: 'ok' | 'requires_manual_review' = 'ok'

    log('── Referentie PNG voorbereiden ──', 'section')
    const refPng = await sharp(imgBuf).resize(width, height, { fit: 'fill' }).png().toBuffer()
    log(`Referentie PNG: ${(refPng.length / 1024).toFixed(1)}KB, ${width}×${height}px`)

    for (let i = 1; i <= MAX_ITER; i++) {
      iterations = i
      log(`── Iteratie ${i}/${MAX_ITER} ──`, 'section')
      sendProgress(`Iteratie ${i}/${MAX_ITER}: HTML renderen…`)

      const t0 = Date.now()
      const candBuf = await renderHtmlCapture(html, width, height, event)
      log(`Render klaar: ${(candBuf.length / 1024).toFixed(1)}KB in ${Date.now() - t0}ms`)

      sendProgress(`Iteratie ${i}/${MAX_ITER}: vergelijken met origineel…`)
      const cmpW = Math.min(width, 960)
      const cmpH = Math.min(height, 540)
      log(`SSIM vergelijking op ${cmpW}×${cmpH}px (downscaled van ${width}×${height})`)
      const diff = await compareImages(refPng, candBuf, { width: cmpW, height: cmpH })
      ssim = diff.ssim
      heatmap = diff.heatmap
      const ssimPct = (ssim * 100).toFixed(2)
      const pixelPct = (diff.pixelDiff * 100).toFixed(2)
      log(`SSIM: ${ssimPct}% (drempel: ${(ACCEPT_SSIM * 100).toFixed(0)}%) | pixelDiff: ${pixelPct}%`, ssim >= ACCEPT_SSIM ? 'ok' : ssim >= 0.7 ? 'warn' : 'err')
      sendProgress(`Iteratie ${i}/${MAX_ITER}: SSIM ${ssimPct}%`)

      if (ssim >= ACCEPT_SSIM) {
        log(`Drempel gehaald (${ssimPct}% ≥ ${(ACCEPT_SSIM * 100).toFixed(0)}%) — pipeline stopt`, 'ok')
        break
      }
      if (i === MAX_ITER) {
        log(`Max iteraties bereikt zonder drempel — status: requires_manual_review`, 'warn')
        status = 'requires_manual_review'
        break
      }

      log(`Drempel niet gehaald — Claude corrigeert op basis van diff…`)
      sendProgress(`Claude analyseert het verschil…`)
      const candDataUrl = `data:image/png;base64,${candBuf.toString('base64')}`
      const fixResult = await callClaude([{
        role: 'user',
        content: [
          { type: 'text', text: `De huidige HTML render heeft een SSIM van ${ssimPct}% t.o.v. het origineel (100% = identiek). Pas de HTML aan zodat het origineel zo exact mogelijk wordt nagebouwd. Bekijk de drie afbeeldingen en retourneer ALLEEN de volledige gecorrigeerde HTML.\n\nHuidige HTML:\n\`\`\`html\n${html}\n\`\`\`` },
          { type: 'text', text: '1. ORIGINEEL (doel):' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: '2. HUIDIGE RENDER (te corrigeren):' },
          { type: 'image_url', image_url: { url: candDataUrl } },
          { type: 'text', text: '3. DIFF-heatmap (rood = afwijking):' },
          { type: 'image_url', image_url: { url: heatmap } },
        ],
      }], `correctie iteratie ${i}`)
      const prevLen = html.length
      html = extractHtml(fixResult.content, `iteratie-${i}`)
      log(`HTML bijgewerkt: ${(prevLen / 1024).toFixed(1)}KB → ${(html.length / 1024).toFixed(1)}KB`)
    }

    log(`── Pipeline klaar ──`, 'section')
    log(`Eindresultaat: SSIM ${(ssim * 100).toFixed(2)}%, ${iterations} iteratie(s), status: ${status}`, status === 'ok' ? 'ok' : 'warn')

    return { ok: true, html, ssim, iterations, heatmap, status }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

// ── Ad→HTML pipeline v2 (segmentatie + fal.ai inpainting) ────────────────────
//
// TODO: vervang loadKey('openrouter') + loadKey('fal') door JWT + proxy Edge Functions
// Vereiste keys: loadKey('openrouter') + loadKey('fal')
// Valt terug op v1 (pure Claude) als fal-key ontbreekt.

ipcMain.handle('ad:convert-smart', async (event, payload: { imageDataUrl: string; imageModel?: string; accessToken?: string }) => {
  const { imageDataUrl, imageModel = 'google/gemini-3.1-flash-image-preview', accessToken } = payload
  if (!accessToken) return { ok: false, error: 'Niet ingelogd.' }

  const sendProgress = (message: string) => { try { event.sender.send('ad:progress', message) } catch {} }
  const log = (msg: string, level: 'info' | 'ok' | 'warn' | 'err' | 'section' = 'info') => adLog(event, msg, level)

  try {
    const { default: sharp } = await import('sharp')
    const {
      analyzeAdSegments, generateMask, resolveLogoSource, assembleHtml,
    } = await import('./lib/ad-pipeline')

    const imgBuf = Buffer.from(imageDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const meta = await sharp(imgBuf).metadata()
    const width = meta.width ?? 1200
    const height = meta.height ?? 628

    log('── Ad→HTML Smart Pipeline gestart ──', 'section')
    log(`Afbeelding: ${width}×${height}px, ${(imgBuf.length / 1024).toFixed(1)}KB, formaat: ${meta.format}`)

    // Stap 1: segmentatie
    sendProgress('Beeld analyseren — tekst, logo\'s en achtergrond herkennen…')
    const analysis = await analyzeAdSegments(imageDataUrl, width, height, accessToken, log)

    let cleanBgDataUrl = imageDataUrl

    if (analysis.background.type === 'photo' || analysis.background.type === 'illustration') {
      // Stap 2: masker (voor logging — OpenRouter gebruikt het niet maar het geeft inzicht)
      sendProgress('Masker genereren voor tekst- en logo-gebieden…')
      await generateMask(width, height, analysis, log)

      // Stap 3: tekst/logo verwijderen via de bestaande image:generate-ai logica
      sendProgress(`${imageModel.split('/').pop()} verwijdert tekst en logo's uit het beeld…`)
      log(`  Model: ${imageModel}`)
      log(`  Aanroep via image:generate-ai patroon (referenceImage + prompt)`)

      const removePrompt = 'Remove all text and logos from this image. Change absolutely nothing else — keep every person, color, object, background and detail exactly as-is. Only remove overlaid text and logo elements.'

      const { callOpenRouter } = await import('./lib/proxy')
      const tryRequest = async (modalities: string[]) =>
        callOpenRouter({
          model: imageModel,
          modalities,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              { type: 'text', text: `Pas de bijgevoegde afbeelding aan op basis van de volgende instructie. Gebruik de bijgevoegde afbeelding als directe referentie en behoud compositie, uitsnede, stijl, belichting, achtergrond en alle niet-genoemde details zo exact mogelijk. Wijzig alleen wat expliciet in de instructie staat. Genereer de aangepaste afbeelding en geef geen tekstuele reactie.\n\nInstructie: ${removePrompt}` },
            ],
          }],
        }, accessToken!)

      let imgRes = await tryRequest(['image', 'text'])
      let imgRaw = await imgRes.text()
      log(`  HTTP ${imgRes.status} (image+text)`, imgRes.ok ? 'ok' : 'warn')

      if (!imgRes.ok && imgRaw.includes('output modalities')) {
        log(`  Fallback naar modalities: ['image']…`)
        imgRes = await tryRequest(['image'])
        imgRaw = await imgRes.text()
        log(`  HTTP ${imgRes.status} (image-only)`, imgRes.ok ? 'ok' : 'err')
      }

      if (!imgRes.ok) {
        const { openRouterError } = await import('./lib/ad-pipeline')
        throw new Error(openRouterError(imgRes.status, imgRaw))
      }

      const imgJson = JSON.parse(imgRaw)
      log(`  Response preview: ${JSON.stringify(imgJson).slice(0, 200)}`)
      const message = imgJson?.choices?.[0]?.message
      const images: any[] = message?.images ?? []

      let b64 = ''
      let imgUrl = ''
      if (images.length > 0) {
        const img = images[0]
        if (typeof img === 'string') {
          if (img.startsWith('http')) imgUrl = img
          else b64 = img
        } else if (typeof img === 'object' && img !== null) {
          if (img.b64_json) b64 = img.b64_json
          else if (img.image_url?.url) { const u = img.image_url.url; if (u.startsWith('http')) imgUrl = u; else b64 = u }
          else if (img.url) { if (img.url.startsWith('http')) imgUrl = img.url; else b64 = img.url }
        }
      }

      if (imgUrl) {
        log(`  Resultaat als URL — downloaden: ${imgUrl}`)
        const dlRes = await fetch(imgUrl)
        if (!dlRes.ok) throw new Error(`Download mislukt: ${dlRes.status}`)
        const dlBuf = Buffer.from(await dlRes.arrayBuffer())
        b64 = dlBuf.toString('base64')
        log(`  Download: ${(dlBuf.length / 1024).toFixed(1)}KB`, 'ok')
      }

      if (!b64) {
        log(`  Volledige response: ${JSON.stringify(imgJson).slice(0, 500)}`, 'err')
        throw new Error('Model gaf geen afbeelding terug. Gebruik een model met image-output (bijv. Nano Banana Pro).')
      }

      const rawDataUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`

      // Snij witte randen weg die Gemini soms toevoegt bij tekstverwijdering
      try {
        const rawBuf = Buffer.from(rawDataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64')
        const trimmed = await sharp(rawBuf)
          .trim({ background: '#ffffff', threshold: 15 })
          .resize(width, height, { fit: 'cover', position: 'center' })
          .png()
          .toBuffer()
        cleanBgDataUrl = `data:image/png;base64,${trimmed.toString('base64')}`
        log(`  Witte randen bijgesneden en bijgeschaald naar ${width}×${height}px`, 'ok')
      } catch {
        cleanBgDataUrl = rawDataUrl
      }
      log(`  Schone achtergrond: ${(cleanBgDataUrl.length / 1024).toFixed(1)}KB`, 'ok')
    } else {
      log(`Achtergrond is ${analysis.background.type} — geen beeldbewerking nodig`, 'ok')
    }

    // Stap 4: logo's resolven via logo-protocol
    sendProgress('Logo\'s ophalen en verwerken…')
    const resolvedLogos = new Map<number, import('./lib/ad-pipeline').ResolvedLogo>()
    for (let i = 0; i < analysis.logoSegments.length; i++) {
      const seg = analysis.logoSegments[i]
      sendProgress(`Logo ${i + 1}/${analysis.logoSegments.length} verwerken (${seg.brandName ?? 'onbekend'})…`)
      const serperKey = loadKey('serper')
      const resolved = await resolveLogoSource(seg, imgBuf, width, height, accessToken, serperKey, log)
      resolvedLogos.set(i, resolved)
      log(`  Logo[${i}] → methode: ${resolved.method}`, 'ok')
    }

    // Stap 5: HTML assemblen
    sendProgress('HTML assemblen…')
    const installedFonts = await getInstalledFontFamilies()
    const typekitId = loadKey('typekit') ?? null
    const { html: initialHtml, fontWarnings } = await assembleHtml(analysis, cleanBgDataUrl, resolvedLogos, log, installedFonts, typekitId)

    // Stap 6: visuele correctie — render de HTML, vergelijk met origineel, Claude corrigeert
    log('── Stap 6: visuele correctie ──', 'section')
    let finalHtml = initialHtml
    const MAX_CORRECTION_ROUNDS = 1

    // Strip base64 data URLs uit de HTML voor Claude — te groot om mee te sturen
    // Sla de originele waarden op en herstel na de correctie
    const stripDataUrls = (html: string): { stripped: string; map: Map<string, string> } => {
      const map = new Map<string, string>()
      let idx = 0
      const stripped = html.replace(/data:[^"']+;base64,[A-Za-z0-9+/=]+/g, (match) => {
        const placeholder = `__DATA_URL_${idx++}__`
        map.set(placeholder, match)
        return placeholder
      })
      return { stripped, map }
    }

    const restoreDataUrls = (html: string, map: Map<string, string>): string => {
      let result = html
      for (const [placeholder, original] of map) {
        result = result.split(placeholder).join(original)
      }
      return result
    }

    for (let round = 1; round <= MAX_CORRECTION_ROUNDS; round++) {
      sendProgress(`Visuele correctie ronde ${round}/${MAX_CORRECTION_ROUNDS}…`)
      log(`  Ronde ${round}: HTML renderen…`)
      const candBuf = await renderHtmlCapture(finalHtml, width, height, event)
      // Downscale candidate naar max 640px breed voor snellere Claude-aanroep
      const candScaled = await sharp(candBuf).resize(640, undefined, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
      const candDataUrl = `data:image/jpeg;base64,${candScaled.toString('base64')}`
      log(`  Candidate downscaled: ${(candBuf.length / 1024).toFixed(0)}KB → ${(candScaled.length / 1024).toFixed(0)}KB`)

      const { stripped, map } = stripDataUrls(finalHtml)
      log(`  HTML gestript: ${(finalHtml.length / 1024).toFixed(1)}KB → ${(stripped.length / 1024).toFixed(1)}KB (${map.size} data URLs vervangen)`)

      const corrRes = await callOpenRouter({
        model: 'anthropic/claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Vergelijk het ORIGINEEL met de huidige HTML-RENDER. Pas ALLEEN de CSS aan (font-size, top, left, width, height van elementen) zodat de layout exact overeenkomt. Verander geen src-attributen of content. Retourneer de volledige gecorrigeerde HTML met de placeholder-teksten (__DATA_URL_0__ etc.) ongewijzigd.\n\nHuidige HTML:\n\`\`\`html\n${stripped}\n\`\`\`` },
          { type: 'text', text: 'ORIGINEEL:' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: 'HUIDIGE RENDER (corrigeer dit):' },
          { type: 'image_url', image_url: { url: candDataUrl } },
        ]}],
        temperature: 0,
      }, accessToken!)

      if (!corrRes.ok) { log(`  Ronde ${round} mislukt: ${corrRes.status}`, 'warn'); break }
      const corrJson = await corrRes.json() as { choices: Array<{ message: { content: string } }> }
      const corrContent = corrJson.choices[0].message.content
      const fenced = corrContent.match(/```(?:html)?\s*([\s\S]*?)```/)
      const htmlStart = corrContent.indexOf('<!DOCTYPE') >= 0 ? corrContent.indexOf('<!DOCTYPE') : corrContent.indexOf('<html')
      const correctedStripped = fenced ? fenced[1].trim() : htmlStart >= 0 ? corrContent.slice(htmlStart).trim() : null
      if (correctedStripped) {
        const corrected = restoreDataUrls(correctedStripped, map)
        log(`  Ronde ${round}: gecorrigeerd (${(corrected.length / 1024).toFixed(1)}KB)`, 'ok')
        finalHtml = corrected
      } else {
        log(`  Ronde ${round}: geen HTML in response — stoppen`, 'warn'); break
      }
    }

    log('── Smart Pipeline klaar ──', 'section')
    log(`Segmenten: ${analysis.textSegments.length} tekst, ${analysis.logoSegments.length} logo's, achtergrond: ${analysis.background.type}`, 'ok')
    if (fontWarnings.length) log(`Font-waarschuwingen: ${fontWarnings.length}`, 'warn')

    return { ok: true, html: finalHtml, fontWarnings, analysis, width, height }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Pipeline fout: ${msg}`, 'err')
    return { ok: false, error: msg }
  }
})

// Run the deterministic visual diff between a Keynote reference and the HTML
// render. Returns SSIM/pixelDiff/regions/heatmap — the objective acceptance
// gate for the (later) AI correction loop.
ipcMain.handle('calibration:diff', async (
  _event,
  payload: {
    referenceDataUrl: string
    candidateDataUrl: string
    templateWidth?: number
    templateHeight?: number
    regions?: Array<{ id: string; posX: number; posY: number; width: number; height: number }>
  },
) => {
  try {
    const { compareImages } = await import('./lib/visual-diff')
    const toBuf = (u: string) => Buffer.from(u.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const result = await compareImages(toBuf(payload.referenceDataUrl), toBuf(payload.candidateDataUrl), {
      templateWidth: payload.templateWidth,
      templateHeight: payload.templateHeight,
      regions: payload.regions,
    })
    return { ok: true, result }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Visuele diff mislukt.' }
  }
})

// Ask a vision model to propose visual corrections from the Keynote vs HTML
// screenshots. Returns corrections JSON within the constrained vocabulary.
ipcMain.handle('calibration:propose', async (
  _event,
  payload: {
    referenceDataUrl: string
    candidateDataUrl: string
    elements: Array<{ id: string; kind: string; facts?: Record<string, unknown>; current?: Record<string, unknown> }>
    worstRegions?: string[]
    model?: string
  },
) => {
  const apiKey = cachedJwt
  if (!apiKey) { console.error('[calib] Niet ingelogd — AI-correctie kan niet draaien.'); return { ok: false, error: 'Niet ingelogd.' } }
  const { callOpenRouter } = await import('./lib/proxy')
  const { proposeCorrections } = await import('./lib/calibration-ai')
  const res = await proposeCorrections({
    jwt: apiKey,
    model: payload.model,
    referenceDataUrl: payload.referenceDataUrl,
    candidateDataUrl: payload.candidateDataUrl,
    elements: payload.elements as any,
    worstRegions: payload.worstRegions,
  })
  if (!res.ok) console.error('[calib] AI-voorstel mislukt:', res.error)
  return res
})

// Upgrades non-placeholder text boxes in the stored template to sageTag placeholders.
// upgrades: { layoutName: [{ ownedDrawableId, tagName }] }
ipcMain.handle('template:upgrade-placeholders', async (_event, clientId: string, upgrades: Record<string, Array<{ ownedDrawableId: string; tagName: string }>>) => {
  clientId = sanitizeStorageId(clientId, 'clientId')
  const templatePath = join(templatesDir(), `${clientId}.key`)
  if (!existsSync(templatePath)) return { ok: false, error: 'Template niet gevonden.' }

  const upgradesPath = join(tmpdir(), `huphe_upgrades_${Date.now()}.json`)
  const scriptPath   = join(__dirname, 'upgrade_key.py')

  writeFileSync(upgradesPath, JSON.stringify(upgrades, null, 2))
  const result = await runCommand('python3', [scriptPath, templatePath, upgradesPath], 60000)
  try { unlinkSync(upgradesPath) } catch {}
  return result.ok ? { ok: true } : { ok: false, error: result.error }
})

function templatesDir(): string {
  const dir = join(app.getPath('appData'), 'HupheAI', 'templates')
  mkdirSync(dir, { recursive: true })
  return dir
}

// Persistent device UUID — generated once and stored in appData.
// Used as the user identifier for Supabase profiles / user_settings lookups.
function getOrCreateUserId(): string {
  const idPath = join(app.getPath('userData'), 'device-id.txt')
  if (existsSync(idPath)) return readFileSync(idPath, 'utf8').trim()
  const id = randomUUID()
  writeFileSync(idPath, id, 'utf8')
  return id
}

ipcMain.handle('user:get-id', () => getOrCreateUserId())

// Renderer stuurt de sessie-JWT mee na login — slaan we op voor handlers zonder eigen accessToken
ipcMain.handle('auth:set-jwt', (_event, jwt: string) => {
  cachedJwt = parseIpcPayload('auth:set-jwt', z.string().min(10).max(10000), jwt)
})

// --- Placeholder afbeelding ---

function placeholderPath(): string {
  const dir = join(app.getPath('appData'), 'HupheAI')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'placeholder.png')
}


ipcMain.handle('placeholder:read', () => {
  try {
    const p = placeholderPath()
    if (!existsSync(p)) return { ok: false }
    const buf = readFileSync(p)
    return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}`, filePath: p }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('placeholder:delete', () => {
  try {
    const p = placeholderPath()
    if (existsSync(p)) require('fs').unlinkSync(p)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('placeholder:replace', (_event, sourcePath: string) => {
  try {
    copyFileSync(sourcePath, placeholderPath())
    const buf = readFileSync(placeholderPath())
    return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('placeholder:pick-and-replace', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Afbeeldingen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  try {
    copyFileSync(filePaths[0], placeholderPath())
    const buf = readFileSync(placeholderPath())
    return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

// Opens a native file dialog and returns the chosen image path (no side effects).
ipcMain.handle('image:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Afbeeldingen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  return { ok: true, filePath: filePaths[0] }
})

// Opens a native folder picker and returns the selected directory path.
ipcMain.handle('dialog:open-key-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Open een Keynote presentatie',
    filters: [{ name: 'Keynote', extensions: ['key'] }],
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  return { ok: true, filePath: filePaths[0] }
})

ipcMain.handle('dialog:open-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Kies een projectmap',
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  return { ok: true, folderPath: filePaths[0] }
})

// ---------------------------------------------------------------------------
// safeStorage helpers for API keys
// ---------------------------------------------------------------------------

function keyPath(name: string): string {
  return join(app.getPath('userData'), `${name}.enc`)
}

function storeKey(name: string, value: string): void {
  const enc = safeStorage.encryptString(value)
  writeFileSync(keyPath(name), enc)
}

function loadKey(name: string): string | null {
  const p = keyPath(name)
  if (!existsSync(p)) return null
  try { return safeStorage.decryptString(readFileSync(p)) } catch { return null }
}

ipcMain.handle('key:set', (_event, name: string, value: string) => {
  name = parseIpcPayload('key:set/name', StorageIdSchema, name)
  value = parseIpcPayload('key:set/value', z.string().max(20000), value)
  storeKey(name, value)
  return { ok: true }
})

ipcMain.handle('key:has', (_event, name: string) => {
  name = parseIpcPayload('key:has/name', StorageIdSchema, name)
  return existsSync(keyPath(name))
})

// ---------------------------------------------------------------------------
// Credits — Stripe Checkout
// ---------------------------------------------------------------------------
// De renderer geeft amountCents, userId en feePct mee.
// Main process maakt de Stripe Checkout Session aan (heeft de secret key)
// en opent de betalingspagina in de standaardbrowser.
ipcMain.handle('credits:checkout', async (_event, payload: { amountCents: number; userId: string; feePct: number }) => {
  payload = parseIpcPayload('credits:checkout', z.object({
    amountCents: z.number().int().min(100).max(1000000),
    userId: z.string().min(1).max(200),
    feePct: z.number().min(0).max(30),
  }), payload)
  const stripeKey = loadKey('stripe')
  if (!stripeKey) return { ok: false, error: 'Stripe API-key niet geconfigureerd. Stel hem in via Instellingen → Billing.' }

  const { amountCents, userId, feePct } = payload
  if (!amountCents || amountCents < 100) return { ok: false, error: 'Minimumbedrag is €1.' }

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'payment_method_types[0]': 'card',
        'payment_method_types[1]': 'ideal',
        mode: 'payment',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(amountCents),
        'line_items[0][price_data][product_data][name]': 'HupheAI Credits',
        'line_items[0][price_data][product_data][description]': `${(amountCents / 100).toFixed(2)} EUR aan genereer-credits`,
        'line_items[0][quantity]': '1',
        client_reference_id: userId,
        'metadata[user_id]': userId,
        'metadata[amount_cents]': String(amountCents),
        'metadata[fee_pct]': String(feePct),
        'metadata[millicredits]': String(Math.floor(amountCents * 1000 * (1 - feePct / 100))),
        success_url: 'https://hupheai.app/credits/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://hupheai.app/credits/cancel',
      }).toString(),
    })
    const json = await res.json() as any
    if (!res.ok) return { ok: false, error: json?.error?.message ?? 'Stripe fout' }
    const checkoutUrl = safeExternalUrl(json.url, ['stripe.com'])
    if (!checkoutUrl) return { ok: false, error: 'Stripe gaf een onveilige checkout-URL terug.' }
    shell.openExternal(checkoutUrl)
    return { ok: true, sessionId: json.id }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Stripe aanroep mislukt' }
  }
})

// ---------------------------------------------------------------------------
// Image generation — routes to the provider chosen by the user.
// ---------------------------------------------------------------------------

async function generateViaReplicate(prompt: string): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const apiKey = (import.meta as any).env?.MAIN_VITE_HUGGINGFACE_API_KEY as string | undefined
  if (!apiKey) return { ok: false, error: 'MAIN_VITE_HUGGINGFACE_API_KEY niet geconfigureerd.' }

  const url = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell'
  console.log('[image:generate] provider=replicate url:', url)
  console.log('[image:generate] Authorization: Bearer', apiKey.slice(0, 8) + '…')
  console.log('[image:generate] prompt (eerste 100):', prompt.slice(0, 100))

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt }),
  })
  if (!response.ok) {
    const text = await response.text()
    console.error('[image:generate] Replicate fout:', response.status, text)
    return { ok: false, error: `Replicate ${response.status}: ${text.slice(0, 200)}` }
  }
  const arrayBuffer = await response.arrayBuffer()
  const filePath = join(tmpdir(), `huphe_generated_${Date.now()}.jpg`)
  writeFileSync(filePath, Buffer.from(arrayBuffer))
  console.log('[image:generate] opgeslagen:', filePath)
  return { ok: true, filePath }
}

async function generateViaComfyUICloud(prompt: string): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const apiKey = loadKey('comfyui')
  if (!apiKey) return { ok: false, error: 'ComfyUI Cloud API key niet geconfigureerd. Stel hem in via Instellingen.' }

  const BASE = 'https://cloud.comfy.org/api'

  // FLUX.1-schnell workflow — prompt is injected in node 6
  const workflow = {
    '1':  { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-schnell.safetensors' } },
    '2':  { class_type: 'CLIPTextEncode',          inputs: { clip: ['1', 1], text: prompt } },
    '3':  { class_type: 'CLIPTextEncode',          inputs: { clip: ['1', 1], text: '' } },
    '4':  { class_type: 'EmptyLatentImage',         inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '5':  { class_type: 'KSampler',                inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: Math.floor(Math.random() * 1e15), steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '6':  { class_type: 'VAEDecode',               inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7':  { class_type: 'SaveImage',               inputs: { images: ['6', 0], filename_prefix: 'huphe' } },
  }

  console.log('[image:generate] provider=comfyui-cloud')
  console.log('[image:generate] prompt (eerste 100):', prompt.slice(0, 100))

  // 1. Queue the prompt
  const queueRes = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  })
  if (!queueRes.ok) {
    const text = await queueRes.text()
    console.error('[image:generate] ComfyUI Cloud queue fout:', queueRes.status, text)
    return { ok: false, error: `ComfyUI Cloud ${queueRes.status}: ${text.slice(0, 200)}` }
  }
  const { prompt_id } = await queueRes.json() as { prompt_id: string }
  console.log('[image:generate] ComfyUI Cloud prompt_id:', prompt_id)

  // 2. Poll status every 2s (max 120s)
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, 2000))
    const statusRes = await fetch(`${BASE}/job/${prompt_id}/status`, {
      headers: { 'X-API-Key': apiKey },
    })
    if (!statusRes.ok) {
      console.warn('[image:generate] status poll fout:', statusRes.status)
      continue
    }
    const status = await statusRes.json() as { status: string; output_files?: string[] }
    console.log('[image:generate] status:', status.status)

    if (status.status === 'failed') {
      return { ok: false, error: 'ComfyUI Cloud: generatie mislukt.' }
    }
    if (status.status !== 'completed') continue

    // 3. Download the first output image
    const outputFiles = status.output_files ?? []
    const imageFile = outputFiles.find((f) => /\.(png|jpg|webp)$/i.test(f)) ?? outputFiles[0]
    if (!imageFile) return { ok: false, error: 'ComfyUI Cloud: geen afbeelding in output.' }

    const viewRes = await fetch(`${BASE}/view?filename=${encodeURIComponent(imageFile)}`, {
      headers: { 'X-API-Key': apiKey },
    })
    if (!viewRes.ok) return { ok: false, error: `ComfyUI Cloud download fout: ${viewRes.status}` }

    const ext = imageFile.split('.').pop() ?? 'png'
    const filePath = join(tmpdir(), `huphe_generated_${Date.now()}.${ext}`)
    writeFileSync(filePath, Buffer.from(await viewRes.arrayBuffer()))
    console.log('[image:generate] ComfyUI Cloud opgeslagen:', filePath)
    return { ok: true, filePath }
  }
  return { ok: false, error: 'ComfyUI Cloud: timeout — generatie duurde te lang.' }
}

// Downloads any image URL to a temp file and returns the local path.
// Used by the Pollinations renderer flow: preview via <img src={url}>, then persist to disk.
ipcMain.handle('image:download-url', async (_event, url: string) => {
  try {
    url = parseIpcPayload('image:download-url', HttpsUrlSchema, url)
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) return { ok: false, error: `Download fout: ${response.status}` }
    const buf = Buffer.from(await response.arrayBuffer())
    const ct = response.headers.get('content-type') ?? ''
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const dir = join(app.getPath('userData'), 'generated-images')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, `huphe_generated_${Date.now()}.${ext}`)
    writeFileSync(filePath, buf)
    console.log('[image:download-url] opgeslagen:', filePath)
    return { ok: true, filePath: toHupheFileUrl(filePath) }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('image:delete-file', async (_event, filePath: string) => {
  try {
    let raw: string
    if (filePath.startsWith('file://')) {
      raw = decodeURIComponent(filePath.slice(7))
    } else if (filePath.startsWith('huphe://file/')) {
      raw = decodeURIComponent(filePath.slice('huphe://file/'.length))
    } else {
      raw = filePath
    }
    const resolved = resolve(raw)
    const allowedDir = resolve(join(app.getPath('userData'), 'generated-images'))
    if (!resolved.startsWith(allowedDir + sep)) return { ok: false, error: 'Niet toegestaan' }
    if (existsSync(resolved)) unlinkSync(resolved)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('image:generate', async (_event, prompt: string, provider: string) => {
  prompt = parseIpcPayload('image:generate/prompt', z.string().trim().min(1).max(6000), prompt)
  provider = parseIpcPayload('image:generate/provider', z.enum(['replicate', 'comfyui']), provider)
  console.log('[image:generate] provider:', provider)
  try {
    if (provider === 'comfyui') return await generateViaComfyUICloud(prompt)
    return await generateViaReplicate(prompt)
  } catch (err: any) {
    console.error('[image:generate] onverwachte fout:', err.message)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('image:generate-ai', async (_event, payload: { prompt: string; model: string; modelLabel?: string; systemPrompt?: string; referenceImageSrc?: string; accessToken?: string }) => {
  payload = parseIpcPayload('image:generate-ai', z.object({
    prompt: z.string().trim().min(1).max(12000),
    model: z.string().trim().min(1).max(200),
    modelLabel: z.string().max(200).optional(),
    systemPrompt: z.string().max(6000).optional(),
    referenceImageSrc: z.string().max(20 * 1024 * 1024).optional(),
    maskImageSrc: z.string().max(20 * 1024 * 1024).optional(),
    accessToken: AccessTokenSchema,
  }), payload)
  let { prompt, model, modelLabel, systemPrompt, referenceImageSrc, maskImageSrc, accessToken } = payload
  const originalPrompt = prompt
  const hasMaskInput = Boolean(maskImageSrc)

  // Converteer file:// / huphe:// referentie naar base64 data URL zodat OpenRouter hem kan lezen
  let referenceImage: string | null = null
  if (referenceImageSrc) {
    if (referenceImageSrc.startsWith('data:') || referenceImageSrc.startsWith('http')) {
      referenceImage = referenceImageSrc
    } else {
      let localPath: string | null = null
      if (referenceImageSrc.startsWith('file://')) {
        localPath = referenceImageSrc.slice('file://'.length)
      } else if (referenceImageSrc.startsWith('huphe://file/')) {
        localPath = decodeURIComponent(referenceImageSrc.slice('huphe://file/'.length))
      }
      if (localPath) {
        try {
          const buf = readFileSync(localPath)
          const ext = localPath.endsWith('.png') ? 'png' : localPath.endsWith('.webp') ? 'webp' : 'jpeg'
          referenceImage = `data:image/${ext};base64,${buf.toString('base64')}`
        } catch { referenceImage = null }
      }
    }
  }
  const isEdit = referenceImage !== null
  const effectiveJwt = accessToken ?? cachedJwt
  if (!effectiveJwt) {
    return { ok: false, error: 'Niet ingelogd.' }
  }
  const { callOpenRouter } = await import('./lib/proxy')

  // Vertaal de slide-prompt naar het Engels zodat image-modellen (Flux etc.)
  // niet letterlijk Nederlandse woorden als beeldinhoud interpreteren.
  const hasNonAscii = /[^\x00-\x7F]/.test(prompt)
  const likelyNonEnglish = hasNonAscii || /\b(de|het|een|van|voor|met|naar|zijn|wordt|deze|door|aan)\b/.test(prompt)
  if (likelyNonEnglish) {
    try {
      const transRes = await callOpenRouter({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: 'Translate the following text to English. Output only the translated text, nothing else.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
      }, effectiveJwt)
      if (transRes.ok) {
        const transJson = await transRes.json() as any
        const translated = transJson?.choices?.[0]?.message?.content?.trim()
        if (translated) {
          console.log('[image:generate-ai] prompt vertaald naar EN:', translated.slice(0, 120))
          prompt = translated
          // Sync translated text into pipeline systemPrompt (renderer embedded original Dutch)
          if (systemPrompt) systemPrompt = systemPrompt.replace(originalPrompt, translated)
        }
      }
    } catch (e) {
      console.warn('[image:generate-ai] vertaling mislukt, originele prompt gebruikt:', e)
    }
  }

  // Model en prompt komen van de Backstage agent-configuratie — niet hardcoded.
  console.log('[image:generate-ai] → OpenRouter direct, model:', model)
  console.log('[image:generate-ai] prompt:', prompt.slice(0, 120) + (prompt.length > 120 ? '…' : ''))

  try {
    // We proberen het model aan te roepen.
    // Strategie: 
    // 1. We proberen eerst modalities: ['image', 'text']. Dit is nodig voor Gemini/Claude om beeld te genereren.
    // 2. Als dit een 404 geeft met de melding dat 'text' niet ondersteund wordt (bijv. Flux/Riverflow), 
    //    dan proberen we het opnieuw met modalities: ['image'].

    async function performOpenRouterRequest(targetModalities: string[], includeReference = true) {
      const isLLM = targetModalities.includes('text')

      let finalPrompt: string
      if (isLLM && systemPrompt) {
        // Renderer has already embedded the user prompt via {{prompt}} substitution.
        finalPrompt = systemPrompt
      } else if (isLLM) {
        // Fallback when no pipeline prompt is configured (e.g., direct API calls).
        if (hasMaskInput) {
          finalPrompt = `Je bent een AI-beeldeditor. De bijgevoegde afbeelding toont het origineel met een ORANJE gemarkeerd gebied. Pas uitsluitend het ORANJE gemarkeerde gebied aan. Behoud de rest precies zoals het is. Genereer de aangepaste afbeelding en geef GEEN tekstuele reactie.\n\nInstructie: ${prompt}`
        } else if (isEdit) {
          finalPrompt = `Pas de bijgevoegde afbeelding aan op basis van de instructie. Behoud compositie, stijl, belichting en alle niet-genoemde details exact. Genereer de aangepaste afbeelding en geef geen tekstuele reactie.\n\nInstructie: ${prompt}`
        } else {
          finalPrompt = `Genereer een afbeelding op basis van de volgende beschrijving. Geef GEEN tekstuele reactie, genereer uitsluitend de afbeelding.\n\nBeschrijving: ${prompt}`
        }
      } else {
        finalPrompt = prompt
      }

      const messages: any[] = []

      const contentParts: any[] = []
      if (includeReference) {
        if (hasMaskInput && maskImageSrc) {
          contentParts.push({ type: 'image_url', image_url: { url: maskImageSrc } })
        } else if (referenceImage) {
          contentParts.push({ type: 'image_url', image_url: { url: referenceImage } })
        }
      }
      contentParts.push({ type: 'text', text: finalPrompt })
      const content: any = contentParts.length === 1 ? contentParts[0].text : contentParts
      messages.push({ role: 'user', content })

      const payload: any = {
        model,
        modalities: targetModalities,
        messages,
      }

      return callOpenRouter(payload, effectiveJwt)
    }

    function extractImageFromResponse(json: any): { b64?: string; url?: string } | null {
      const message = json?.choices?.[0]?.message
      const images: any[] = message?.images ?? []
      if (images.length > 0) {
        const img = images[0]
        if (typeof img === 'string') return img.startsWith('http') ? { url: img } : { b64: img }
        if (img.b64_json) return { b64: img.b64_json }
        if (img.image_url?.url) return img.image_url.url.startsWith('http') ? { url: img.image_url.url } : { b64: img.image_url.url }
        if (img.url) return img.url.startsWith('http') ? { url: img.url } : { b64: img.url }
      }
      if (Array.isArray(message?.content)) {
        for (const part of message.content) {
          if (part?.type === 'image_url') {
            const imgUrl: string = part.image_url?.url ?? part.url ?? ''
            if (imgUrl.startsWith('data:')) return { b64: imgUrl }
            if (imgUrl.startsWith('http')) return { url: imgUrl }
          }
        }
      }
      if (typeof message?.content === 'string') {
        const m = message.content.match(/https?:\/\/[^\s)\]'"]+/i)
        if (m) return { url: m[0] }
      }
      return null
    }

    async function tryRequest(modalities: string[], includeReference: boolean): Promise<{ res: Response; raw: string; json: any } | null> {
      const r = await performOpenRouterRequest(modalities, includeReference)
      const rw = await r.text()
      if (!r.ok) return { res: r, raw: rw, json: null }
      try { return { res: r, raw: rw, json: JSON.parse(rw) } } catch { return { res: r, raw: rw, json: null } }
    }

    // Probeer: LLM met referentie → LLM zonder referentie (diffusion fallback) → image-only zonder referentie
    const hasReference = Boolean(referenceImage || (hasMaskInput && maskImageSrc))
    let attempt = await tryRequest(['image', 'text'], true)

    // 404 voor text-modality → fall back naar image-only
    if (attempt && attempt.res.status === 404 && attempt.raw.includes('output modalities: image, text')) {
      console.log('[image:generate-ai] 404 op image+text, fallback naar image-only voor model:', model)
      attempt = await tryRequest(['image'], true)
    }

    // Geen afbeelding terug maar wél referentie meegestuurd → model ondersteunt geen image input, retry zonder
    if (attempt && attempt.res.ok && attempt.json && hasReference && !extractImageFromResponse(attempt.json)) {
      console.log('[image:generate-ai] geen afbeelding met referentie, retry zonder referentie voor model:', model)
      attempt = await tryRequest(['image', 'text'], false)
      if (attempt && attempt.res.status === 404 && attempt.raw.includes('output modalities: image, text')) {
        attempt = await tryRequest(['image'], false)
      }
    }

    const res = attempt!.res
    const raw = attempt!.raw
    const json = attempt!.json

    console.log('[image:generate-ai] HTTP status:', res.status, res.statusText)
    console.log('[image:generate-ai] response body (eerste 400):', raw.slice(0, 400))

    if (!res.ok) {
      console.error('[image:generate-ai] ✗ OpenRouter fout:', raw)
      if (raw.toLowerCase().includes('output modalities') || raw.toLowerCase().includes('requested output modalities')) {
        return { ok: false, error: 'Dit model ondersteunt geen beeldgeneratie via OpenRouter. Kies een model met image-output, zoals Nano Banana of een Flux/Imagen-model.' }
      }
      let errorMsg = raw.slice(0, 200)
      try {
        const parsed = JSON.parse(raw)
        errorMsg = parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? errorMsg
        if (typeof errorMsg !== 'string') errorMsg = raw.slice(0, 200)
      } catch {}
      return { ok: false, error: errorMsg }
    }

    if (!json) {
      return { ok: false, error: `Onverwacht antwoord (${res.status}): ${raw.slice(0, 200)}` }
    }

    const found = extractImageFromResponse(json)
    const pngMeta = { prompt: originalPrompt, model, modelLabel: modelLabel ?? model, createdAt: new Date().toISOString() }

    if (found?.b64) {
      let b64 = found.b64.replace(/^data:image\/\w+;base64,/, '')
      const ext = b64.startsWith('iVBORw0KGgo') ? 'png' : found.b64.includes('image/png') ? 'png' : found.b64.includes('image/webp') ? 'webp' : 'jpg'
      const dir = join(app.getPath('userData'), 'generated-images')
      mkdirSync(dir, { recursive: true })
      const filePath = join(dir, `huphe_generated_${Date.now()}.${ext}`)
      writeFileSync(filePath, Buffer.from(b64, 'base64'))
      writePngPromptMetadata(filePath, pngMeta)
      console.log('[image:generate-ai] ✓ base64 afbeelding opgeslagen:', filePath)
      return { ok: true, filePath: toHupheFileUrl(filePath) }
    }

    if (found?.url) {
      try {
        const imgRes = await fetch(found.url, { signal: AbortSignal.timeout(30000) })
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer())
          const ct = imgRes.headers.get('content-type') ?? ''
          const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
          const dir = join(app.getPath('userData'), 'generated-images')
          mkdirSync(dir, { recursive: true })
          const filePath = join(dir, `huphe_generated_${Date.now()}.${ext}`)
          writeFileSync(filePath, buf)
          writePngPromptMetadata(filePath, pngMeta)
          console.log('[image:generate-ai] ✓ URL gedownload en opgeslagen:', filePath)
          return { ok: true, filePath: toHupheFileUrl(filePath) }
        }
      } catch (downloadErr: any) {
        console.warn('[image:generate-ai] download mislukt, URL als fallback:', downloadErr.message)
      }
      console.log('[image:generate-ai] ✓ afbeelding URL ontvangen (niet gedownload):', found.url)
      return { ok: true, imageUrl: found.url }
    }

    const message = json?.choices?.[0]?.message
    console.error('[image:generate-ai] ✗ geen afbeelding in response. Volledig bericht:', JSON.stringify(message))
    return { ok: false, error: 'Geen afbeelding ontvangen van OpenRouter. Controleer of het model beeldgeneratie ondersteunt.' }

  } catch (err: any) {
    console.error('[image:generate-ai] fetch fout:', err.message)
    return { ok: false, error: err.message }
  }
})

// ── Scene 3D → AI generatie ─────────────────────────────────────────
ipcMain.handle('scene3d:generate', async (_event, payload: { screenshotDataUrl: string; prompt: string; referenceImageSrc?: string; accessToken?: string }) => {
  payload = parseIpcPayload('scene3d:generate', z.object({
    screenshotDataUrl: z.string().min(1).max(20 * 1024 * 1024),
    prompt: z.string().trim().min(1).max(6000),
    referenceImageSrc: z.string().max(20 * 1024 * 1024).optional(),
    accessToken: AccessTokenSchema,
  }), payload)
  const { screenshotDataUrl, prompt, referenceImageSrc, accessToken } = payload
  const effectiveJwt = accessToken ?? cachedJwt
  if (!effectiveJwt) return { ok: false, error: 'Niet ingelogd.' }

  try {
    const { callFalProxy, callOpenRouter } = await import('./lib/proxy')

    let englishPrompt = prompt
    const likelyNonEnglish = /[^\x00-\x7F]/.test(prompt) || /\b(de|het|een|van|voor|met|naar|zijn|wordt|deze|door|aan)\b/.test(prompt)
    if (likelyNonEnglish) {
      try {
        const transRes = await callOpenRouter({
          model: 'meta-llama/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: 'Translate the following text to English. Output only the translated text, nothing else.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 300,
        }, effectiveJwt)
        if (transRes.ok) {
          const transJson = await transRes.json() as any
          const translated = transJson?.choices?.[0]?.message?.content?.trim()
          if (translated) englishPrompt = translated
        }
      } catch { /* use original */ }
    }

    const compositionNote = 'Maintain the exact composition, camera angle, subject position and facing direction from the reference image.'
    const fullPrompt = `${compositionNote} ${englishPrompt}`

    const dataUrlMatch = screenshotDataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!dataUrlMatch) return { ok: false, error: 'Ongeldig screenshot formaat.' }
    const [, mimeType, base64Data] = dataUrlMatch

    const result = await callFalProxy('fal-ai/flux/dev/image-to-image', {
      image_base64: base64Data,
      image_mime_type: mimeType,
      prompt: fullPrompt,
      strength: 0.65,
      num_images: 1,
      image_size: 'landscape_16_9',
    }, effectiveJwt) as any

    const imageUrl = result?.images?.[0]?.url
    if (!imageUrl) return { ok: false, error: 'Geen resultaat van AI.' }
    return { ok: true, imageUrl }
  } catch (err: any) {
    console.error('[scene3d:generate] fout:', err.message)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('video:generate-ai', async (_event, payload: { prompt: string; model: string; systemPrompt?: string; accessToken?: string; referenceImageSrc?: string }) => {
  payload = parseIpcPayload('video:generate-ai', z.object({
    prompt: z.string().trim().min(1).max(12000),
    model: z.string().trim().min(1).max(200),
    systemPrompt: z.string().max(6000).optional(),
    accessToken: AccessTokenSchema,
    referenceImageSrc: z.string().max(20 * 1024 * 1024).optional(),
  }), payload)
  const { prompt, model, systemPrompt, accessToken, referenceImageSrc } = payload
  const effectiveJwtVideo = accessToken ?? cachedJwt
  if (!effectiveJwtVideo) return { ok: false, error: 'Niet ingelogd.' }
  const { callOpenRouter } = await import('./lib/proxy')

  let referenceImage: string | null = null
  if (referenceImageSrc) {
    if (referenceImageSrc.startsWith('data:') || referenceImageSrc.startsWith('http')) {
      referenceImage = referenceImageSrc
    } else {
      let localPath: string | null = null
      if (referenceImageSrc.startsWith('file://')) {
        localPath = referenceImageSrc.slice('file://'.length)
      } else if (referenceImageSrc.startsWith('huphe://file/')) {
        localPath = decodeURIComponent(referenceImageSrc.slice('huphe://file/'.length))
      }
      if (localPath) {
        try {
          const buf = readFileSync(localPath)
          const ext = localPath.endsWith('.png') ? 'png' : localPath.endsWith('.webp') ? 'webp' : 'jpeg'
          referenceImage = `data:image/${ext};base64,${buf.toString('base64')}`
        } catch {
          referenceImage = null
        }
      }
    }
  }

  async function performOpenRouterRequest(targetModalities: string[]) {
    const finalPrompt = systemPrompt
      ? `${systemPrompt}\n\nMaak een video op basis van ${referenceImage ? 'het bijgevoegde startbeeld en ' : ''}deze beschrijving. Geef geen tekstuele reactie; genereer uitsluitend de video.\n\nBeschrijving: ${prompt}`
      : `Maak een video op basis van ${referenceImage ? 'het bijgevoegde startbeeld en ' : ''}deze beschrijving. Geef geen tekstuele reactie; genereer uitsluitend de video.\n\nBeschrijving: ${prompt}`

    const contentParts: any[] = []
    if (referenceImage) contentParts.push({ type: 'image_url', image_url: { url: referenceImage } })
    contentParts.push({ type: 'text', text: finalPrompt })

    return callOpenRouter({
      model,
      modalities: targetModalities,
      messages: [{ role: 'user', content: contentParts.length === 1 ? finalPrompt : contentParts }],
      stream: false,
    }, effectiveJwtVideo)
  }

  try {
    let res = await performOpenRouterRequest(['video', 'text'])
    let raw = await res.text()
    if (res.status === 404 && raw.includes('output modalities: video, text')) {
      res = await performOpenRouterRequest(['video'])
      raw = await res.text()
    }
    if (!res.ok) return { ok: false, error: `OpenRouter fout ${res.status}: ${raw.slice(0, 200)}` }

    let json: any
    try { json = JSON.parse(raw) } catch {
      return { ok: false, error: `Onverwacht antwoord (${res.status}): ${raw.slice(0, 200)}` }
    }

    const message = json?.choices?.[0]?.message
    const videos: any[] = [
      ...(Array.isArray(message?.videos) ? message.videos : []),
      ...(Array.isArray(message?.content) ? message.content.filter((part: any) => part?.type === 'video_url' || part?.video_url || part?.url) : []),
    ]

    for (const video of videos) {
      const value = typeof video === 'string'
        ? video
        : video?.video_url?.url ?? video?.url ?? video?.b64_json ?? ''
      if (!value) continue
      if (value.startsWith('http')) return { ok: true, videoUrl: value }

      const match = value.match(/^data:video\/(\w+);base64,(.+)$/)
      const ext = match?.[1] === 'quicktime' ? 'mov' : (match?.[1] ?? 'mp4')
      const clean = match?.[2] ?? value.replace(/^data:video\/\w+;base64,/, '')
      const filePath = join(tmpdir(), `huphe_generated_video_${Date.now()}.${ext}`)
      writeFileSync(filePath, Buffer.from(clean, 'base64'))
      return { ok: true, filePath }
    }

    const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '')
    const urlMatch = content.match(/https?:\/\/[^\s)\]'"]+/i)
    if (urlMatch) return { ok: true, videoUrl: urlMatch[0] }

    return { ok: false, error: 'Geen video ontvangen van OpenRouter. Controleer of het model videogeneratie ondersteunt.' }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})




function findPngsRecursive(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) results.push(...findPngsRecursive(full))
      else if (/\.(png|jpg|jpeg)$/i.test(entry.name)) results.push(full)
    }
  } catch {}
  // Natural numeric sort so "Slide 2.png" < "Slide 10.png" (Keynote export naming).
  return results.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

// Escape een string voor gebruik in een AppleScript string literal.
// Geeft een AppleScript expressie terug die newlines als `return` concateneert.
function asString(s: string): string {
  return s
    .split('\n')
    .map((l) => `"${l.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(' & return & ')
}

interface Block { type: string; heading: string; body: string; fields: Record<string, string>; imagePath?: string; imageOffset?: { x: number; y: number }; imageAlign?: 'left' | 'center' | 'right'; imageScale?: number }

ipcMain.handle('deck:generate-structured', async (_event, payload: {
  clientId: string
  blocks: Block[]
  name?: string
  mappings?: Record<string, Record<number, string>>
  sageTagMappings?: Record<string, Record<string, string>>
  userTagNames?: Record<string, Record<string, string>>
  itemNames?: Record<string, Record<string, string>>
  imageGeometry?: Record<string, Record<string, { posX: number; posY: number; width: number; height: number }>>
}) => {
  const { blocks } = payload
  const clientId = sanitizeStorageId(payload.clientId, 'clientId')
  const templatePath = join(templatesDir(), `${clientId}.key`)

  if (!existsSync(templatePath)) {
    return { ok: false, error: 'Template niet gevonden voor deze klant.' }
  }
  if (blocks.length === 0) {
    return { ok: false, error: 'Geen blokken gevonden in het document.' }
  }

  // Build slides JSON for write_key.py.
  // sageTagMappings holds _mdToSageTag: { layoutName: { mdLabel: sageTagName } }.
  // resolveKey maps each MD-label to the sageTag write_key.py expects in tag_to_storage.
  // Fallback: use the MD-label as-is so content is never silently dropped.
  const slides = blocks.map((block) => {
    const { type: layoutName, heading, body, fields } = block
    const mdToSageTag = payload.sageTagMappings?.[layoutName] ?? {}

    const resolveKey = (mdLabel: string): string => mdToSageTag[mdLabel] ?? mdLabel

    const slideFields: Record<string, string> = {}

    if (heading) slideFields[resolveKey('heading')] = heading
    if (body)    slideFields[resolveKey('body')]    = body

    for (const [mdLabel, text] of Object.entries(fields)) {
      if (!text) continue
      slideFields[resolveKey(mdLabel)] = text
    }

    return {
      layoutName,
      fields: slideFields,
      imagePath:   block.imagePath   ?? null,
      imageOffset: block.imageOffset ?? null,
      imageAlign:  block.imageAlign  ?? null,
    }
  })

  const safeName    = payload.name ? payload.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 80) : ''
  const outputName  = safeName ? `${safeName}.key` : `huphe_deck_${Date.now()}.key`
  const slidesPath  = join(tmpdir(), `huphe_slides_${Date.now()}.json`)
  const outputPath  = join(tmpdir(), outputName)
  const scriptPath  = join(__dirname, 'write_key.py')

  const slidesPayload = payload.userTagNames && Object.keys(payload.userTagNames).length > 0
    ? { slides, userTagNames: payload.userTagNames }
    : slides
  writeFileSync(slidesPath, JSON.stringify(slidesPayload, null, 2))
  console.log(`[deck:generate-structured] ${blocks.length} blokken → ${slidesPath}`)

  const result = await runCommand('python3', [scriptPath, templatePath, slidesPath, outputPath], 120000)
  try { unlinkSync(slidesPath) } catch {}
  if (result.stderr) console.log('[write_key.py stderr]\n' + result.stderr)
  if (!result.ok) {
    console.error('[deck:generate-structured] fout:', result.error)
    return { ok: false, error: result.error }
  }
  const generatedPath = result.stdout.trim() || outputPath
  console.log('[deck:generate-structured] geslaagd:', generatedPath)
  // Open the result in Finder so the user can download it
  void runCommand('open', ['-R', outputPath], 10000)
  return { ok: true, outputPath: generatedPath }
})

// Generate a temporary Keynote, export each slide as PNG, then close without saving.
// Returns the PNG file paths in slide order (used by the preview step).
ipcMain.handle('deck:preview-generate', async (_event, payload: {
  clientId: string
  blocks: Block[]
  mappings?: Record<string, Record<number, string>>
  itemNames?: Record<string, Record<string, string>>
  imageGeometry?: Record<string, Record<string, { posX: number; posY: number; width: number; height: number }>>
}) => {
  const { blocks } = payload
  const clientId = sanitizeStorageId(payload.clientId, 'clientId')
  const templatePath = join(templatesDir(), `${clientId}.key`)

  if (!existsSync(templatePath)) return { ok: false, error: 'Template niet gevonden voor deze klant.' }
  if (blocks.length === 0)       return { ok: false, error: 'Geen blokken gevonden in het document.' }

  const exportDir = join(tmpdir(), `huphe_preview_${Date.now()}`)
  mkdirSync(exportDir, { recursive: true })

  // Build the same slide lines as deck:generate-structured
  const slideLines: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const { type: layoutName, heading, body, fields, imagePath } = blocks[i]
    const v = `s${i}`
    slideLines.push(`    set ${v} to make new slide at end with properties {base layout: master slide ${asString(layoutName)}}`)
    slideLines.push(`    tell ${v}`)
    const layoutMapping = payload.mappings?.[layoutName]
    const hasMappings = layoutMapping && Object.keys(layoutMapping).length > 0
    slideLines.push(`      repeat with ti in every text item`)
    slideLines.push(`        try`)
    slideLines.push(`          set object text of ti to " "`)
    slideLines.push(`        end try`)
    slideLines.push(`      end repeat`)
    if (hasMappings) {
      for (const [idxStr, role] of Object.entries(layoutMapping!)) {
        if (!role || role === 'negeren') continue
        const content =
          role in fields        ? fields[role] :
          role === 'hoofdtekst' ? heading :
          role === 'subtekst'   ? body : ''
        slideLines.push(`      try`)
        slideLines.push(`        set object text of text item ${idxStr} to ${asString(content || ' ')}`)
        slideLines.push(`      end try`)
      }
    } else {
      const fallbackHeading = (fields['hoofdtekst'] ?? heading) || ''
      const fallbackBody    = (fields['subtekst']   ?? body)    || ''
      if (fallbackHeading) {
        slideLines.push(`      try`)
        slideLines.push(`        set object text of text item 1 to ${asString(fallbackHeading)}`)
        slideLines.push(`      end try`)
      }
      if (fallbackBody) {
        slideLines.push(`      try`)
        slideLines.push(`        set object text of text item 2 to ${asString(fallbackBody)}`)
        slideLines.push(`      end try`)
      }
    }
    if (layoutName === 'Content Image') {
      const effectiveImagePath = imagePath || join(app.getPath('appData'), 'HupheAI', 'placeholder.png')
      const geom = payload.imageGeometry?.[layoutName]?.['1']
      slideLines.push(`      try`)
      slideLines.push(`        delete image 1`)
      slideLines.push(`      end try`)
      slideLines.push(`      try`)
      slideLines.push(`        set newImg to make new image at end of images with properties {file: POSIX file ${asString(effectiveImagePath)}}`)
      if (geom) {
        slideLines.push(`        set position of newImg to {${geom.posX}, ${geom.posY}}`)
        slideLines.push(`        set width of newImg to ${geom.width}`)
        slideLines.push(`        set height of newImg to ${geom.height}`)
      }
      slideLines.push(`      end try`)
    }
    slideLines.push(`    end tell`)
  }

  const script = [
    'do shell script "open -g -a \\\"Keynote Creator Studio\\\""',
    'delay 1',
    'tell application "Keynote Creator Studio"',
    `  set theDoc to open POSIX file "${templatePath}"`,
    '  tell theDoc',
    '    set origCount to count of slides',
    ...slideLines,
    '    repeat origCount times',
    '      delete slide 1',
    '    end repeat',
    '  end tell',
    `  export theDoc to POSIX file "${exportDir}" as slide images with properties {image format:PNG}`,
    '  close theDoc saving no',
    'end tell',
  ].join('\n')

  const scriptPath = join(tmpdir(), `huphe_preview_${Date.now()}.applescript`)
  console.log('[deck:preview-generate] scriptPath:', scriptPath)
  console.log('[deck:preview-generate] script:\n' + script)
  writeFileSync(scriptPath, script)
  console.log(`[deck:preview-generate] ${blocks.length} blokken, exportDir: ${exportDir}`)

  const result = await runCommand('osascript', [scriptPath], 120000)
  try { unlinkSync(scriptPath) } catch {}
  BrowserWindow.getAllWindows()[0]?.focus()
  if (!result.ok) {
    console.error('[deck:preview-generate] fout:', result.error)
    return { ok: false, error: result.error }
  }
  const pngs = findPngsRecursive(exportDir)
  console.log(`[deck:preview-generate] ${pngs.length} PNGs gegenereerd`)
  return { ok: true, slidePaths: pngs }
})

const KEYNOTE_SCRIPT = `
do shell script "open -g -a \"Keynote Creator Studio\""
delay 1
tell application "Keynote Creator Studio"
  make new document
end tell
`.trim()

function stripIccChunk(png: Buffer): Buffer {
  const out: Buffer[] = [png.subarray(0, 8)]
  let pos = 8
  while (pos + 12 <= png.length) {
    const len  = png.readUInt32BE(pos)
    const type = png.subarray(pos + 4, pos + 8).toString('ascii')
    if (type !== 'iCCP') out.push(png.subarray(pos, pos + 12 + len))
    pos += 12 + len
  }
  return Buffer.concat(out)
}

ipcMain.handle('deck:export-pdf-screenshots', async (event, payload: {
  count: number
  rect:  { x: number; y: number; width: number; height: number }
  name?: string
}) => {
  const { count } = payload
  const { PDFDocument } = await import('pdf-lib')

  const pdfDoc = await PDFDocument.create()

  for (let i = 0; i < count; i++) {
    // Ask renderer to show slide i (spinner is covering it — user sees nothing)
    event.sender.send('pdf:set-slide', i)
    // Wait for React re-render + paint behind the spinner
    await new Promise(r => setTimeout(r, 400))
    // Briefly hide spinner so capturePage sees the clean slide
    await event.sender.executeJavaScript(
      `(function(){ var s=document.getElementById('pdf-spinner'); if(s) s.style.display='none'; })()`
    )
    await new Promise(r => setTimeout(r, 50))
    const fullImg = await event.sender.capturePage()
    const { width: physW, height: physH } = fullImg.getSize()
    const cropH = Math.min(Math.round(physW * 9 / 16), physH)
    const nativeImg = fullImg.crop({ x: 0, y: 0, width: physW, height: cropH })
    console.log(`[PDF] slide ${i}: full ${physW}×${physH} → cropped ${physW}×${cropH}`)
    // Restore spinner immediately
    await event.sender.executeJavaScript(
      `(function(){ var s=document.getElementById('pdf-spinner'); if(s) s.style.display='flex'; })()`
    )
    const pngBuf = stripIccChunk(nativeImg.toPNG())
    const img    = await pdfDoc.embedPng(pngBuf)
    const page   = pdfDoc.addPage([1920, 1080])
    page.drawImage(img, { x: 0, y: 0, width: 1920, height: 1080 })
  }

  const pdfBytes = await pdfDoc.save()

  const safePdfName = payload.name ? payload.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 80) : ''
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'PDF opslaan',
    defaultPath: safePdfName ? `${safePdfName}.pdf` : 'presentatie.pdf',
    filters: [{ name: 'PDF-document', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  writeFileSync(filePath, Buffer.from(pdfBytes))
  return { ok: true, filePath }
})

ipcMain.handle('deck:capture-slide-previews', async (event, payload: { count: number }) => {
  const { count } = payload
  const pngs: string[] = []

  for (let i = 0; i < count; i++) {
    event.sender.send('pdf:set-slide', i)
    await new Promise(r => setTimeout(r, 400))
    const fullImg = await event.sender.capturePage()
    const { width: physW, height: physH } = fullImg.getSize()
    const cropH = Math.min(Math.round(physW * 9 / 16), physH)
    const nativeImg = fullImg.crop({ x: 0, y: 0, width: physW, height: cropH })
    const pngBuf = stripIccChunk(nativeImg.toPNG())
    pngs.push(pngBuf.toString('base64'))
  }

  return pngs
})

ipcMain.handle('deck:export-pdf-ir', async (_event, payload: { slides: unknown[]; name?: string }) => {
  try {
    const { renderSlidesToHtml } = await import('./lib/slide-html-renderer')
    const html = renderSlidesToHtml(payload.slides as any)

    const { PDFDocument } = await import('pdf-lib')
    const { BrowserWindow: BW } = await import('electron')
    const win = new BW({ show: false, webPreferences: { offscreen: true } })

    const pdfDoc = await PDFDocument.create()

    await new Promise<void>((resolve) => {
      win.webContents.on('did-finish-load', async () => {
        for (let i = 0; i < payload.slides.length; i++) {
          await win.webContents.executeJavaScript(
            `document.querySelectorAll('.slide').forEach((s,j)=>s.style.display=j===${i}?'block':'none')`
          )
          await new Promise(r => setTimeout(r, 80))
          const img = await win.webContents.capturePage()
          const jpg = img.toJPEG(92)
          const embedded = await pdfDoc.embedJpg(jpg)
          const page = pdfDoc.addPage([1920, 1080])
          page.drawImage(embedded, { x: 0, y: 0, width: 1920, height: 1080 })
        }
        resolve()
      })
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    })

    win.destroy()

    const pdfBytes = await pdfDoc.save()
    const safeName = payload.name ? payload.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 80) : ''
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'PDF opslaan',
      defaultPath: safeName ? `${safeName}.pdf` : 'presentatie.pdf',
      filters: [{ name: 'PDF-document', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    writeFileSync(filePath, Buffer.from(pdfBytes))
    return { ok: true, filePath }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'PDF exporteren mislukt.' }
  }
})

ipcMain.handle('deck:export-pptx', async (_event, payload: { slides: Array<{ title: string; fields: Record<string, string> }>; name?: string }) => {
  try {
    const { exportToPptx } = await import('./lib/pptx-exporter')
    const buf = await exportToPptx(payload.slides, payload.name ?? 'presentatie')
    const safeName = payload.name ? payload.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 80) : ''
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'PowerPoint opslaan',
      defaultPath: safeName ? `${safeName}.pptx` : 'presentatie.pptx',
      filters: [{ name: 'PowerPoint-presentatie', extensions: ['pptx'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    writeFileSync(filePath, buf)
    return { ok: true, filePath }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'PPTX exporteren mislukt.' }
  }
})

// ── Project opslaan / laden ──────────────────────────────────────────────────

function projectsDir(): string {
  return join(app.getPath('documents'), 'HupheAI', 'Projects')
}

function ensureProjectsDir(): string {
  const dir = projectsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('debug:log', async (_event, ...args: unknown[]) => {
  console.log('[renderer]', ...args)
})

ipcMain.handle('fs:read-file-buffer', async (_event, filePath: string) => {
  try {
    filePath = parseIpcPayload('fs:read-file-buffer', FilePathSchema, filePath)
    const safePath = assertInsideRoot(filePath, app.getPath('userData'))
    const buf = readFileSync(safePath)
    return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

// key:save-buffer — sla een .key buffer op via save dialog
ipcMain.handle('key:save-buffer', async (_event, buffer: ArrayBuffer, defaultFileName: string) => {
  const validation = validateImportBuffer('.key', buffer)
  if (!validation.ok) return { ok: false, error: validation.error }
  defaultFileName = parseIpcPayload('key:save-buffer/defaultFileName', z.string().trim().min(1).max(120), defaultFileName)
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Keynote opslaan',
    defaultPath: join(app.getPath('documents'), defaultFileName.endsWith('.key') ? defaultFileName : `${defaultFileName}.key`),
    filters: [{ name: 'Keynote', extensions: ['key'] }],
  })
  if (canceled || !filePath) return { ok: false }
  try {
    writeFileSync(filePath, Buffer.from(buffer))
    return { ok: true, filePath }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('project:save', async (_event, projectData: unknown, filePath?: string) => {
  projectData = parseIpcPayload('project:save/projectData', z.record(z.string(), z.unknown()), projectData)
  filePath = filePath === undefined ? undefined : parseIpcPayload('project:save/filePath', FilePathSchema, filePath)
  const d = projectData as any
  const name = d.name ?? 'Nieuw project'
  console.log('[project:save] naam:', name, '| bestaand pad:', filePath ?? '(nieuw)')
  console.log('[project:save] blocks:', d.blocks?.length ?? 0, 'overrides keys:', Object.keys(d.overrides ?? {}).length)
  console.log('[project:save] overrides:', JSON.stringify(d.overrides ?? {}).slice(0, 300))
  if (d.blocks?.length) {
    ;(d.blocks as any[]).forEach((b: any, i: number) => {
      if (b.imagePath || i < 3) {
        console.log(`[project:save] block[${i}] id:`, b.id, '| heading:', (b.heading ?? '').slice(0, 30), '| imagePath:', b.imagePath ?? '(geen)')
      }
    })
  }
  try {
    const dir = ensureProjectsDir()
    if (filePath) {
      const safePath = assertInsideRoot(filePath, dir)
      writeFileSync(safePath, JSON.stringify(projectData, null, 2), 'utf-8')
      console.log('[project:save] ✓ overschreven:', safePath)
      return { ok: true, filePath: safePath }
    }
    const safeName = name.replace(/[/\\?%*:|"<>]/g, '-')
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    console.log('[project:save] dialoog openen…')
    const { canceled, filePath: chosen } = await dialog.showSaveDialog(win, {
      title: 'Project opslaan',
      defaultPath: join(dir, `${safeName}.huphe`),
      filters: [{ name: 'Huphe Project', extensions: ['huphe'] }],
    })
    if (canceled || !chosen) {
      console.log('[project:save] geannuleerd door gebruiker')
      return { ok: false, canceled: true }
    }
    writeFileSync(chosen, JSON.stringify(projectData, null, 2), 'utf-8')
    console.log('[project:save] ✓ opgeslagen als:', chosen)
    return { ok: true, filePath: chosen }
  } catch (err: any) {
    console.error('[project:save] fout:', err.message)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('project:autosave', async (_event, projectData: unknown) => {
  try {
    projectData = parseIpcPayload('project:autosave/projectData', z.record(z.string(), z.unknown()), projectData)
    const d = projectData as any
    const name = (d.name ?? 'Nieuw project').replace(/[/\\?%*:|"<>]/g, '-')
    const dir = ensureProjectsDir()
    const filePath = join(dir, `${name}.huphe`)
    writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf-8')
    console.log('[project:autosave] ✓ automatisch opgeslagen:', filePath)
    return { ok: true, filePath }
  } catch (err: any) {
    console.error('[project:autosave] fout:', err.message)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('project:list', async () => {
  try {
    const dir = ensureProjectsDir()
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.huphe'))
      .map((f) => {
        try {
          const fp = join(dir, f)
          const data = JSON.parse(readFileSync(fp, 'utf-8'))
          const blocks = Array.isArray(data.blocks) ? data.blocks : []
          return {
            name: data.name ?? f.replace('.huphe', ''),
            savedAt: data.savedAt ?? null,
            templateClientId: data.templateClientId ?? null,
            supabasePresentationId: data.supabasePresentationId ?? null,
            filePath: fp,
            firstBlock: blocks[0] ?? null,
            slideCount: blocks.length || undefined,
            overrides: data.overrides ?? {},
          }
        } catch { return null }
      })
      .filter(Boolean)
    return { ok: true, projects: entries }
  } catch (err: any) {
    return { ok: false, error: err.message, projects: [] }
  }
})

ipcMain.handle('project:load', async (_event, filePath: string) => {
  try {
    filePath = parseIpcPayload('project:load', FilePathSchema, filePath)
    const safePath = assertInsideRoot(filePath, ensureProjectsDir())
    const data = JSON.parse(readFileSync(safePath, 'utf-8'))
    return { ok: true, project: { ...data, _filePath: safePath } }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('project:delete', async (_event, filePath: string) => {
  try {
    filePath = parseIpcPayload('project:delete', FilePathSchema, filePath)
    const safePath = assertInsideRoot(filePath, ensureProjectsDir())
    if (existsSync(safePath)) unlinkSync(safePath)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('document:import-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Importeer document',
    filters: [
      { name: 'Documenten', extensions: ['docx', 'pages'] },
    ],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  const filePath = filePaths[0]
  const ext = filePath.split('.').pop()?.toLowerCase()
  const title = basename(filePath).replace(/\.(docx|pages)$/i, '')
  try {
    if (ext === 'docx') {
      const buffer = readFileSync(filePath)
      const result = await mammoth.convertToHtml({ buffer })
      return { ok: true, html: result.value, title }
    } else if (ext === 'pages') {
      const html = await new Promise<string>((resolve, reject) => {
        exec(`textutil -convert html -stdout "${filePath.replace(/"/g, '\\"')}"`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout)
        })
      })
      return { ok: true, html, title }
    }
    return { ok: false, error: 'Onbekend bestandsformaat' }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('document:import-google-docs', async (_event, url: string) => {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (!match) return { ok: false, error: 'Geen geldig Google Docs-link' }
  const docId = match[1]
  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`
    const res = await net.fetch(exportUrl)
    if (!res.ok) return { ok: false, error: `Fout bij ophalen document (${res.status})` }
    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].replace(/ - Google (Docs|Drive)/i, '').trim() : 'Google Doc'
    return { ok: true, html, title }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('ai:voice-command', async (_event, payload: {
  transcript: string
  blocks: { index: number; type: string; heading: string; body: string; fields: Record<string, string> }[]
  activeSlideIndex: number
}) => {
  payload = parseIpcPayload('ai:voice-command', z.object({
    transcript: z.string().min(1).max(10000),
    blocks: z.array(z.object({
      index: z.number().int().min(0).max(10000),
      type: z.string().max(200),
      heading: z.string().max(10000),
      body: z.string().max(50000),
      fields: z.record(z.string(), z.string()),
    })).max(500),
    activeSlideIndex: z.number().int().min(0).max(10000),
  }), payload)
  const jwt = cachedJwt
  if (!jwt) return { ok: false, error: 'Niet ingelogd. Log eerst in om AI-functies te gebruiken.' }
  const { callOpenRouter } = await import('./lib/proxy')

  const { transcript, blocks, activeSlideIndex } = payload

  const slideSummary = blocks
    .map(b => `Slide ${b.index} [${b.type}]: heading="${b.heading}" | body="${b.body.slice(0, 80)}"`)
    .join('\n')

  const system = `Je bent een assistent die spraakcommando's omzet naar slide-bewerkingen voor een presentatie-editor.

De editor werkt met blokken die elk een 'heading', 'body' en vrije 'fields' hebben.
De actieve slide heeft index ${activeSlideIndex} (0-gebaseerd).

Retourneer UITSLUITEND geldig JSON (geen markdown, geen uitleg). Gebruik dit formaat:
{
  "action": "update_slide",
  "slideIndex": <number>,
  "changes": {
    "heading": "<nieuwe tekst of weglaten als niet gewijzigd>",
    "body": "<nieuwe tekst of weglaten als niet gewijzigd>"
  },
  "explanation": "<korte Nederlandse uitleg van wat je hebt gedaan>"
}

Regels:
- Als de gebruiker geen specifieke slide noemt, gebruik dan slideIndex ${activeSlideIndex}.
- Als de gebruiker zegt "deze slide" of "hier", gebruik ${activeSlideIndex}.
- Slide-nummers in commando's zijn 1-gebaseerd (slide 1 = index 0).
- Genereer betekenisvolle, professionele tekst op basis van het commando.
- Laat 'heading' of 'body' weg uit 'changes' als die niet aangepast worden.`

  const user = `Beschikbare slides:\n${slideSummary}\n\nSpraakcommando: "${transcript}"`

  try {
    const res = await callOpenRouter({
        model: 'anthropic/claude-3-5-haiku',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 512,
      }, jwt)
    const json = await res.json() as any
    const raw = json.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const action = JSON.parse(cleaned)
    return { ok: true, action }
  } catch (err: any) {
    return { ok: false, error: `Kon commando niet verwerken: ${err.message}` }
  }
})

ipcMain.handle('ai:transcribe-audio', async (_event, payload: {
  audioBuffer: ArrayBuffer
  mimeType: string
}) => {
  payload = parseIpcPayload('ai:transcribe-audio', z.object({
    audioBuffer: ArrayBufferSchema,
    mimeType: z.string().max(120),
  }), payload)
  const key = loadKey('groq')
  if (!key) return { ok: false, error: 'Groq API key niet ingesteld. Stel hem in via Admin → API sleutels.' }

  const { audioBuffer, mimeType } = payload
  const buffer = Buffer.from(audioBuffer)
  if (buffer.length < 1000) return { ok: true, text: '' }

  const ext = mimeType?.includes('mp4') ? 'mp4' : mimeType?.includes('ogg') ? 'ogg' : 'webm'
  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: mimeType ?? 'audio/webm' }), `audio.${ext}`)
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('language', 'nl')
  formData.append('response_format', 'text')

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: formData,
    })
    if (!res.ok) {
      const errText = await res.text()
      if (res.status === 400 && errText.includes('Audio file is too short')) return { ok: true, text: '' }
      return { ok: false, error: `Groq fout ${res.status}: ${errText.slice(0, 200)}` }
    }
    const text = await res.text()
    return { ok: true, text: text.trim() }
  } catch (err: any) {
    return { ok: false, error: `Transcriptie fout: ${err.message}` }
  }
})

ipcMain.handle('ai:meeting-notes', async (_event, payload: {
  chunks: Array<{ slideIdx: number; slideHeading: string; text: string; timestamp: string }>
}) => {
  payload = parseIpcPayload('ai:meeting-notes', z.object({
    chunks: z.array(z.object({
      slideIdx: z.number().int().min(0).max(10000),
      slideHeading: z.string().max(10000),
      text: z.string().max(50000),
      timestamp: z.string().max(120),
    })).max(1000),
  }), payload)
  const jwt = cachedJwt
  if (!jwt) return { ok: false, error: 'Niet ingelogd. Log eerst in om AI-functies te gebruiken.' }
  const { callOpenRouter } = await import('./lib/proxy')

  const { chunks } = payload
  if (!chunks?.length) return { ok: false, error: 'Geen chunks om samen te vatten.' }

  const bySlide = new Map<number, { heading: string; lines: string[] }>()
  for (const chunk of chunks) {
    if (!bySlide.has(chunk.slideIdx)) bySlide.set(chunk.slideIdx, { heading: chunk.slideHeading, lines: [] })
    bySlide.get(chunk.slideIdx)!.lines.push(chunk.text)
  }
  const grouped = [...bySlide.entries()]
    .sort(([a], [b]) => a - b)
    .map(([idx, { heading, lines }]) =>
      `### Slide ${idx + 1} — ${heading}\n${lines.map((line) => `- ${line}`).join('\n')}`
    )
    .join('\n\n')

  const system = `Je bent een professionele notulist. Je krijgt ruwe transcriptfragmenten van een vergadering, gegroepeerd per presentatie-slide. Zet deze om naar beknopte, heldere notulen.

Per slide geef je:
- Wat er besproken of toegelicht is
- Beslissingen die genomen zijn
- Wijzigingen die gevraagd zijn
- Actiepunten als die er zijn

Schrijf in de derde persoon, actieve stijl. Wees bondig — max 5 bullets per slide. Laat lege slides weg.

Retourneer UITSLUITEND geldig JSON (geen markdown, geen uitleg):
[
  {
    "slideIdx": <number 0-gebaseerd>,
    "slideHeading": "<heading>",
    "bullets": ["<bullet 1>", "<bullet 2>"]
  }
]`

  try {
    const res = await callOpenRouter({
        model: 'anthropic/claude-3-5-haiku',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: grouped },
        ],
        max_tokens: 1024,
      }, jwt)
    if (!res.ok) {
      const errText = await res.text()
      return { ok: false, error: `OpenRouter fout ${res.status}: ${errText.slice(0, 200)}` }
    }
    const data = await res.json() as any
    const raw = data.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const notes = JSON.parse(cleaned)
    return { ok: true, notes }
  } catch (err: any) {
    return { ok: false, error: `Samenvatten mislukt: ${err.message}` }
  }
})

ipcMain.handle('ai:resolve-tags', async (_event, payload: {
  items: Array<{
    blockId: string
    layoutName: string
    ambiguousFields: Array<{ fieldName: string; content: string }>
    availableSageTags: string[]
  }>
}) => {
  payload = parseIpcPayload('ai:resolve-tags', z.object({
    items: z.array(z.object({
      blockId: z.string().max(200),
      layoutName: z.string().max(200),
      ambiguousFields: z.array(z.object({
        fieldName: z.string().max(200),
        content: z.string().max(50000),
      })).max(200),
      availableSageTags: z.array(z.string().max(200)).max(500),
    })).max(500),
  }), payload)
  const jwt = cachedJwt
  if (!jwt) return { ok: false, error: 'Niet ingelogd. Log eerst in om AI-functies te gebruiken.' }
  const { callOpenRouter } = await import('./lib/proxy')

  const { items } = payload
  if (!items?.length) return { ok: true, resolutions: {} }

  const lines = items.map((item) => {
    const fields = item.ambiguousFields.map((f) => `  "${f.fieldName}": "${f.content.slice(0, 120)}"`).join('\n')
    return `Block "${item.blockId}" (layout: ${item.layoutName})\n  Beschikbare sageTags: [${item.availableSageTags.join(', ')}]\n  Velden:\n${fields}`
  }).join('\n\n')

  const system = `Je bent een assistent die tekstvelden koppelt aan de juiste sageTag-rollen in een presentatie-template.
Elk blok heeft een lijst beschikbare sageTags en velden met hun inhoud.
Kies voor elk veld de meest logische sageTag op basis van de inhoud en de semantische betekenis van de sageTag-naam.
Retourneer UITSLUITEND geldig JSON in dit formaat (geen uitleg, geen markdown):
{
  "<blockId>": { "<fieldName>": "<sageTagRole>", ... },
  ...
}`

  try {
    const res = await callOpenRouter({
        model: 'anthropic/claude-3-5-haiku',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: lines },
        ],
        max_tokens: 1024,
      }, jwt)
    const json = await res.json() as any
    const raw = json.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const resolutions = JSON.parse(cleaned)
    return { ok: true, resolutions }
  } catch (err: any) {
    return { ok: false, error: `Tag resolve mislukt: ${err.message}` }
  }
})

ipcMain.handle('doc:extract-text', async (_event, payload: { fileName: string; buffer: ArrayBuffer }) => {
  payload = parseIpcPayload('doc:extract-text', ImportPayloadSchema, payload)
  const { fileName, buffer } = payload
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext !== 'docx') return { ok: true, text: Buffer.from(buffer).toString('utf-8') }
  try {
    const zip = new AdmZip(Buffer.from(buffer))
    const entry = zip.getEntry('word/document.xml')
    if (!entry) return { ok: false, error: 'Geen document.xml gevonden in het .docx bestand.' }
    const xml = entry.getData().toString('utf-8')
    // Strip XML tags, collapse whitespace, preserve paragraph breaks
    const text = xml
      .replace(/<w:br[^/]*/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x[0-9A-Fa-f]+;/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { ok: true, text }
  } catch (err: any) {
    return { ok: false, error: `Kon .docx niet lezen: ${err.message}` }
  }
})

ipcMain.handle('ai:transform-text-to-slides', async (_event, rawText: string, availableLayouts: Array<{ name: string; hasHeading: boolean; hasBody: boolean; fieldNames: string[] }>) => {
  rawText = parseIpcPayload('ai:transform-text-to-slides/text', z.string().min(1).max(200000), rawText)
  availableLayouts = parseIpcPayload('ai:transform-text-to-slides/layouts', z.array(z.object({
    name: z.string().max(200),
    hasHeading: z.boolean(),
    hasBody: z.boolean(),
    fieldNames: z.array(z.string().max(200)).max(500),
  })).max(500), availableLayouts)
  const jwt = cachedJwt
  if (!jwt) return { ok: false, error: 'Niet ingelogd. Log eerst in om AI-functies te gebruiken.' }
  const { callOpenRouter } = await import('./lib/proxy')

  const layoutsDesc = availableLayouts
    .map((l) => {
      const parts = [`"${l.name}"`]
      if (l.hasHeading) parts.push('heading')
      if (l.hasBody) parts.push('body')
      if (l.fieldNames.length) parts.push(`velden: ${l.fieldNames.join(', ')}`)
      return `- ${parts.join(' · ')}`
    })
    .join('\n')

  const firstLayout = availableLayouts[0]?.name ?? 'Content'
  const system = `Je bent een expert in het maken van professionele presentaties.
Je krijgt ruwe aantekeningen of tekst en maakt hier heldere, goed geschreven presentatieslides van.

Beschikbare layouts (gebruik de naam EXACT zoals hieronder):
${layoutsDesc}

Geef je antwoord ALLEEN in dit formaat — geen markdown, geen uitleg, geen code blocks:

[${firstLayout}]
heading: Korte koptekst (max 8 woorden)
body: Beknopte bodytekst (max 2-3 zinnen, geen bullets)

[${firstLayout}]
heading: Volgende slide koptekst
body: Bodytekst voor deze slide

Regels:
- Gebruik EXACT de layout-naam zoals die hierboven staat, inclusief hoofdletters
- Maak 4-8 slides afhankelijk van de hoeveelheid inhoud
- Herschrijf ruwe aantekeningen naar vlotte, professionele presentatietaal
- Elke slide heeft een duidelijke boodschap
- Schrijf in dezelfde taal als de invoertekst
- Geen code blocks, geen markdown opmaak, geen extra tekst buiten het formaat`

  console.log('[ai:transform-text-to-slides] rawText (eerste 300 chars):\n', rawText.slice(0, 300))

  try {
    const res = await callOpenRouter({
        model: 'anthropic/claude-3-5-haiku',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: rawText.slice(0, 8000) },
        ],
        max_tokens: 2048,
      }, jwt)
    const json = (await res.json()) as any
    const raw: string = json.choices?.[0]?.message?.content ?? ''
    if (!raw.trim()) return { ok: false, error: 'AI gaf geen bruikbaar antwoord.' }
    // Strip markdown code fences if the model wraps output despite instructions
    const mdText = raw.replace(/^```[^\n]*\n?/m, '').replace(/\n?```$/m, '').trim()
    console.log('[ai:transform-text-to-slides] output:\n', mdText.slice(0, 500))
    return { ok: true, mdText }
  } catch (err: any) {
    return { ok: false, error: `AI tekst transformatie mislukt: ${err.message}` }
  }
})

ipcMain.handle('banner:generate', async (_event, project: BannerProject) => {
  try {
    project = parseIpcPayload('banner:generate', z.record(z.string(), z.unknown()), project) as BannerProject
    const formats = IAB_FORMATS.filter(f => project.enabledFormats.includes(f.id))
    const banners = formats.map(format => ({
      formatId: format.id,
      html: generateHtml5Banner(project, format),
    }))
    return { ok: true, banners }
  } catch (error: any) {
    return { ok: false, error: error.message ?? 'Banner genereren mislukt.' }
  }
})

ipcMain.handle('banner:export', async (_event, payload: { banners: { formatId: string; html: string }[]; title: string }) => {
  payload = parseIpcPayload('banner:export', z.object({
    banners: z.array(z.object({
      formatId: StorageIdSchema,
      html: z.string().max(5_000_000),
    })).max(100),
    title: z.string().max(160),
  }), payload)
  const { banners } = payload
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Kies exportmap' })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const exportDir = join(res.filePaths[0], `banners_${Date.now()}`)
  mkdirSync(exportDir, { recursive: true })
  for (const banner of banners) {
    const safeFormatId = basename(sanitizeStorageId(banner.formatId, 'formatId'))
    writeFileSync(join(exportDir, `${safeFormatId}.html`), banner.html, 'utf-8')
  }
  shell.openPath(exportDir)
  return { ok: true, folderPath: exportDir }
})

ipcMain.handle('print:generate', async (_event, payload: PrintPayload) => {
  try {
    payload = parseIpcPayload('print:generate', z.record(z.string(), z.unknown()), payload) as PrintPayload
    const ids = payload.formats?.length ? payload.formats : (payload.format ? [payload.format] : [])
    if (ids.length === 0) return { ok: false, error: 'Kies minimaal één mediaformaat.' }
    const formats = ids.map(id => PRINT_FORMATS.find(f => f.id === id))
    const missing = ids.find((id, index) => !formats[index])
    if (missing) return { ok: false, error: `Onbekend mediaformaat: ${missing}` }
    const prints = formats.map(format => ({
      formatId: format!.id,
      html: generateHtml5Print(payload, format!),
    }))
    return { ok: true, prints, print: prints[0] }
  } catch (error: any) {
    return { ok: false, error: error.message ?? 'Media genereren mislukt.' }
  }
})

ipcMain.handle('print:export', async (_event, payload: { print?: { formatId: string; html: string }; prints?: { formatId: string; html: string }[]; title: string }) => {
  payload = parseIpcPayload('print:export', z.object({
    print: z.object({ formatId: StorageIdSchema, html: z.string().max(5_000_000) }).optional(),
    prints: z.array(z.object({ formatId: StorageIdSchema, html: z.string().max(5_000_000) })).max(100).optional(),
    title: z.string().max(160),
  }), payload)
  const prints = payload.prints?.length ? payload.prints : (payload.print ? [payload.print] : [])
  if (prints.length === 0) return { ok: false, error: 'Geen media om te exporteren.' }
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Kies exportmap' })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const exportDir = join(res.filePaths[0], `media_${Date.now()}`)
  mkdirSync(exportDir, { recursive: true })
  for (const print of prints) {
    const safeFormatId = basename(sanitizeStorageId(print.formatId, 'formatId'))
    writeFileSync(join(exportDir, `${safeFormatId}.html`), print.html, 'utf-8')
  }
  shell.openPath(exportDir)
  return { ok: true, folderPath: exportDir }
})

ipcMain.handle('print:export-pdf', async (_event, payload: { html: string; title: string; formatId?: string }) => {
  payload = parseIpcPayload('print:export-pdf', z.object({
    html: z.string().max(5_000_000),
    title: z.string().max(160),
    formatId: z.string().max(120).optional(),
  }), payload)
  const hidden = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: true },
  })
  try {
    await hidden.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(rewriteLocalFileUrls(payload.html))}`)
    await new Promise(r => setTimeout(r, 600))
    const pdfBuffer = await hidden.webContents.printToPDF({
      printBackground: true,
      landscape: false,
    })
    const safeName = (payload.title || 'advertentie').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 80)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'PDF opslaan',
      defaultPath: `${safeName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    writeFileSync(filePath, pdfBuffer)
    shell.openPath(dirname(filePath))
    return { ok: true, filePath }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'PDF exporteren mislukt.' }
  } finally {
    hidden.destroy()
  }
})

ipcMain.handle('print:capture-preview', async (_event, payload: { html: string; width: number; height: number }) => {
  payload = parseIpcPayload('print:capture-preview', z.object({
    html: z.string().max(5_000_000),
    width: z.number().finite().min(1).max(10000),
    height: z.number().finite().min(1).max(10000),
  }), payload)
  const w = Math.max(100, Math.round(payload.width))
  const h = Math.max(100, Math.round(payload.height))
  const hidden = new BrowserWindow({
    show: false,
    width: w,
    height: h,
    webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: true },
  })
  try {
    await hidden.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(rewriteLocalFileUrls(payload.html))}`)
    await new Promise(r => setTimeout(r, 900))
    const image = await hidden.webContents.capturePage()
    const resized = image.resize({ width: Math.min(w, 800) })
    return { ok: true, base64: resized.toPNG().toString('base64') }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Screenshot mislukt.' }
  } finally {
    hidden.destroy()
  }
})

async function captureWebsite(url: string): Promise<string | null> {
  const hidden = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: true },
  })
  try {
    await Promise.race([
      hidden.loadURL(url),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ])
    await new Promise(r => setTimeout(r, 1500))
    const image = await hidden.webContents.capturePage()
    const resized = image.resize({ width: 1280 })
    return `data:image/jpeg;base64,${resized.toJPEG(75).toString('base64')}`
  } catch {
    return null
  } finally {
    hidden.destroy()
  }
}

ipcMain.handle('brand:research', async (_event, payload: { query: string; numImages?: number }) => {
  payload = parseIpcPayload('brand:research', z.object({
    query: z.string().trim().min(1).max(500),
    numImages: z.number().int().min(1).max(10).optional(),
  }), payload)
  const { query, numImages = 3 } = payload
  const apiKey = loadKey('serper')
  if (!apiKey) return { ok: false, error: 'Geen Serper API-sleutel ingesteld in Admin.' }
  try {
    // Run web search (for website screenshot) and image search in parallel
    const [websiteResult, imagesResult] = await Promise.allSettled([
      // Branch 1: find brand website and screenshot it
      (async () => {
        const webRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, num: 5, gl: 'nl' }),
        })
        if (!webRes.ok) return null
        const webData = await webRes.json() as { organic?: Array<{ link: string }> }
        const siteUrl = webData.organic?.[0]?.link
        if (!siteUrl) return null
        return captureWebsite(siteUrl)
      })(),
      // Branch 2: image search for ad references
      (async () => {
        const searchRes = await fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: `${query} advertisement campaign`, num: numImages + 4, gl: 'nl' }),
        })
        if (!searchRes.ok) return []
        const searchData = await searchRes.json() as { images?: Array<{ imageUrl: string }> }
        const imageUrls = (searchData.images ?? []).slice(0, numImages + 4).map(img => img.imageUrl)
        const results = await Promise.allSettled(
          imageUrls.map(async (url) => {
            const imgRes = await fetch(url, { signal: AbortSignal.timeout(6000) })
            if (!imgRes.ok) throw new Error('fetch failed')
            const mimeType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
            if (!mimeType.startsWith('image/')) throw new Error('not an image')
            const buffer = await imgRes.arrayBuffer()
            return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`
          })
        )
        return results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value)
          .slice(0, numImages)
      })(),
    ])

    const websiteScreenshot = websiteResult.status === 'fulfilled' ? (websiteResult.value ?? undefined) : undefined
    const images = imagesResult.status === 'fulfilled' ? imagesResult.value : []

    return { ok: true, websiteScreenshot, images }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Brand research mislukt.' }
  }
})

ipcMain.handle('deck:generate', () => {
  const command = `osascript -e '${KEYNOTE_SCRIPT.replace(/'/g, "'\\''")}'`
  console.log('[deck:generate] commando:', command)

  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error('[deck:generate] exec error:', err.message)
        console.error('[deck:generate] stderr:', stderr)
        resolve({ ok: false, error: err.message })
      } else {
        console.log('[deck:generate] geslaagd')
        if (stdout) console.log('[deck:generate] stdout:', stdout)
        if (stderr) console.log('[deck:generate] stderr:', stderr)
        resolve({ ok: true })
      }
    })
  })
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (app.isPackaged) {
      // Blokkeer devtools in productiebuilds
      mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools())
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
    if (pendingDeepLink) {
      mainWindow.webContents.send('auth:deep-link', pendingDeepLink)
      pendingDeepLink = null
    }
    // Huphe Code — start AI pipeline watcher and register IPC handlers
    registerHupheCodeIPC(mainWindow)
    // Engine Command Center — multi-agent chat + file watcher
    registerEngineIPC(mainWindow)
    // Pulse — autonoom reclamebureau orchestrator
    const supabaseUrl = (import.meta as any).env?.MAIN_VITE_SUPABASE_URL as string ?? ''
    const supabaseKey = (import.meta as any).env?.MAIN_VITE_SUPABASE_KEY as string ?? ''
    registerPulseIPC(loadKey, supabaseUrl, supabaseKey)
  })

  const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']
  const allowedRendererOrigin = rendererDevUrl ? new URL(rendererDevUrl).origin : null
  installRendererCsp(mainWindow)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const externalUrl = safeExternalUrl(details.url, ['hupheai.app', 'supabase.co', 'stripe.com'])
    if (externalUrl) shell.openExternal(externalUrl)
    else console.warn('[security] Geblokkeerde external URL:', details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = (() => { try { return new URL(url) } catch { return null } })()
    const isAllowed =
      parsed?.protocol === 'file:' ||
      (allowedRendererOrigin && parsed?.origin === allowedRendererOrigin) ||
      parsed?.protocol === 'hupheai:'
    if (!isAllowed) {
      console.warn('[security] Geblokkeerde renderer navigatie:', url)
      event.preventDefault()
    }
  })

  // Allow microphone access for Web Speech API
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || (permission as string) === 'microphone' || (permission as string) === 'audioCapture')
  })

  if (rendererDevUrl) {
    mainWindow.loadURL(rendererDevUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register hupheai:// as a custom protocol for auth callbacks (invite + password reset)
app.setAsDefaultProtocolClient('hupheai')

// macOS: deep link fires while app is running
app.on('open-url', (event, url) => {
  event.preventDefault()
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('auth:deep-link', url)
    if (win.isMinimized()) win.restore()
    win.focus()
  } else {
    pendingDeepLink = url
  }
})

function setupAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('updater:update-available', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update beschikbaar',
      message: `HupheAI ${info.version} is gedownload en wordt geïnstalleerd bij het afsluiten.`,
      buttons: ['Nu herstarten', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message)
  })

  // Check bij opstarten, daarna elke 4 uur
  autoUpdater.checkForUpdatesAndNotify()
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000)
}

function buildApplicationMenu(): Menu {
  const name = app.getName()
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // ── App menu (macOS only) ──────────────────────────────────────────────
    ...(isMac ? [{
      label: name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),

    // ── Bewerken ────────────────────────────────────────────────────────────
    {
      label: 'Bewerken',
      submenu: [
        { role: 'undo' as const, label: 'Ongedaan maken' },
        { role: 'redo' as const, label: 'Opnieuw' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: 'Knippen' },
        { role: 'copy' as const, label: 'Kopiëren' },
        { role: 'paste' as const, label: 'Plakken' },
        { role: 'pasteAndMatchStyle' as const, label: 'Plakken zonder opmaak' },
        { role: 'selectAll' as const, label: 'Alles selecteren' },
        ...(isMac ? [
          { type: 'separator' as const },
          {
            label: 'Zoek',
            submenu: [
              { role: 'startSpeaking' as const, label: 'Uitspreken' },
              { role: 'stopSpeaking' as const, label: 'Stop uitspreken' },
            ],
          },
        ] : []),
      ],
    },

    // ── Weergave ────────────────────────────────────────────────────────────
    {
      label: 'Weergave',
      submenu: [
        { role: 'reload' as const, label: 'Herladen' },
        { role: 'forceReload' as const, label: 'Geforceerd herladen' },
        { role: 'toggleDevTools' as const, label: 'Ontwikkelaarstools' },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: 'Standaard zoom' },
        { role: 'zoomIn' as const, label: 'Inzoomen' },
        { role: 'zoomOut' as const, label: 'Uitzoomen' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: 'Volledig scherm' },
        { type: 'separator' as const },
        {
          label: 'Raster tonen',
          click: (_item: Electron.MenuItem, win?: Electron.BrowserWindow) => {
            win?.webContents.send('atelier:view-command', 'toggle-grid')
          },
        },
        {
          label: 'Hulplijnen tonen',
          click: (_item: Electron.MenuItem, win?: Electron.BrowserWindow) => {
            win?.webContents.send('atelier:view-command', 'toggle-guides')
          },
        },
        {
          label: 'Horizontale hulplijn toevoegen',
          click: (_item: Electron.MenuItem, win?: Electron.BrowserWindow) => {
            win?.webContents.send('atelier:view-command', 'add-guide-h')
          },
        },
        {
          label: 'Verticale hulplijn toevoegen',
          click: (_item: Electron.MenuItem, win?: Electron.BrowserWindow) => {
            win?.webContents.send('atelier:view-command', 'add-guide-v')
          },
        },
        {
          label: 'Hulplijnen wissen',
          click: (_item: Electron.MenuItem, win?: Electron.BrowserWindow) => {
            win?.webContents.send('atelier:view-command', 'clear-guides')
          },
        },
      ],
    },

    // ── Venster ─────────────────────────────────────────────────────────────
    {
      label: 'Venster',
      submenu: [
        { role: 'minimize' as const, label: 'Minimaliseren' },
        { role: 'zoom' as const, label: 'Zoomen' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const, label: 'Alles naar voren' },
        ] : [
          { role: 'close' as const, label: 'Sluiten' },
        ]),
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

app.whenReady().then(async () => {
  await initSentry()
  registerHupheProtocol()
  Menu.setApplicationMenu(buildApplicationMenu())
  if (app.dock) {
    const iconPath = join(__dirname, '../../build/icon.png')
    if (existsSync(iconPath)) app.dock.setIcon(iconPath)
  }
  createWindow()
  setupAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Dev-only: herstart de app door npm run dev te spawnen en dan af te sluiten
if (!app.isPackaged) {
  ipcMain.handle('app:open-external', (_e, url: string) => {
    const externalUrl = safeExternalUrl(url)
    if (externalUrl) shell.openExternal(externalUrl)
    else console.warn('[security] Geblokkeerde dev external URL:', url)
  })

  ipcMain.handle('dev:restart', () => {
    const { spawn } = require('child_process') as typeof import('child_process')
    const child = spawn('npm', ['run', 'dev'], {
      cwd: join(__dirname, '..', '..'),
      detached: true,
      stdio: 'ignore',
      shell: true,
    })
    child.unref()
    setTimeout(() => app.quit(), 300)
    return { ok: true }
  })
}
