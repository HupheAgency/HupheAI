/**
 * ============================================================
 *  HUPHE CODE — Electron IPC wiring
 *  src/main/huphe-code-ipc.ts
 * ============================================================
 *
 *  Register this in src/main/index.ts:
 *
 *    import { registerHupheCodeIPC } from './huphe-code-ipc'
 *    // Inside app.whenReady():
 *    registerHupheCodeIPC(mainWindow)
 *
 * ============================================================
 */

import { app, ipcMain, BrowserWindow, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { registerSettingsIPC } from './settings-ipc'
import { z } from 'zod'

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    console.warn(`[security] Ongeldige IPC payload geblokkeerd voor ${channel}:`, result.error.issues)
    throw new Error(`Ongeldige payload voor ${channel}`)
  }
  return result.data
}

const OrchestratorTaskSchema = z.string().trim().min(1).max(20000)
const OrchestratorOptionsSchema = z.object({
  cwd: z.string().max(4096).optional(),
  permissionMode: z.string().max(80).optional(),
  sessionId: z.string().max(200).optional(),
  systemPrompt: z.string().max(20000).optional(),
  maxTurns: z.number().int().min(1).max(100).optional(),
}).default({})
const ModeSchema = z.string().trim().min(1).max(80)
const HupheSubmitOptionsSchema = z.object({
  screenshotPath: z.string().max(4096).optional(),
  designSpecPath: z.string().max(4096).optional(),
  projectPath: z.string().max(4096).optional(),
}).default({})
const JsonPatchSchema = z.record(z.string(), z.unknown())

// ---------------------------------------------------------------------------
//  Resolve orchestrator.js at runtime (same strategy as flow-manager)
// ---------------------------------------------------------------------------

function resolveOrchestrator(): string {
  const relativePath = 'src/modules/huphe-code/orchestrator.js'
  const devPath = join(app.getAppPath(), relativePath)
  if (existsSync(devPath)) return devPath
  if (app.isPackaged) {
    const prodPath = join(process.resourcesPath, 'modules/huphe-code/orchestrator.js')
    if (existsSync(prodPath)) return prodPath
  }
  return resolve(__dirname, '../../src/modules/huphe-code/orchestrator.js')
}

type Orchestrator = {
  run:          (task: string, opts?: { cwd?: string; permissionMode?: string; sessionId?: string; systemPrompt?: string; maxTurns?: number }) => Promise<{ text: string; session_id: string; cost_usd: number; is_error: boolean }>
  cancel:       () => boolean
  isRunning:    () => boolean
  getBinaryInfo:() => { found: boolean; path?: string; version?: string }
  setBroadcast: (fn: (event: unknown) => void) => void
}

let orchestrator: Orchestrator | null = null

function getOrchestrator(): Orchestrator {
  if (!orchestrator) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    orchestrator = require(resolveOrchestrator()) as Orchestrator
  }
  return orchestrator
}

// ---------------------------------------------------------------------------
//  Resolve settings-manager.js at runtime (same strategy as other modules)
// ---------------------------------------------------------------------------

function resolveSettingsManager(): string {
  const relativePath = 'src/modules/huphe-code/settings-manager.js'
  const devPath = join(app.getAppPath(), relativePath)
  if (existsSync(devPath)) return devPath
  if (app.isPackaged) {
    const prodPath = join(process.resourcesPath, 'modules/huphe-code/settings-manager.js')
    if (existsSync(prodPath)) return prodPath
  }
  return resolve(__dirname, '../../src/modules/huphe-code/settings-manager.js')
}

// ---------------------------------------------------------------------------
//  Resolve flow-manager.js at runtime.
//
//  electron-vite compiles src/main → out/main but does NOT copy src/modules.
//  So a static relative require('../modules/...') would look in out/modules/ ❌
//
//  Strategy:
//   • Dev  : app.getAppPath() = project root → src/modules/.../flow-manager.js ✅
//   • Prod : electron-builder copies src/modules/ via extraResources →
//            process.resourcesPath/modules/.../flow-manager.js ✅
// ---------------------------------------------------------------------------

function resolveFlowManager(): string {
  const relativePath = 'src/modules/huphe-code/flow-manager.js'

  // 1. Dev / unpackaged: app.getAppPath() is the project root
  const devPath = join(app.getAppPath(), relativePath)
  if (existsSync(devPath)) return devPath

  // 2. Packaged app: electron-builder puts extraResources next to app.asar
  if (app.isPackaged) {
    const prodPath = join(process.resourcesPath, 'modules/huphe-code/flow-manager.js')
    if (existsSync(prodPath)) return prodPath
  }

  // 3. Fallback: resolve relative to __dirname (out/main → ../../src/modules)
  return resolve(__dirname, '../../src/modules/huphe-code/flow-manager.js')
}

type FlowManager = {
  start:       (opts: { window: BrowserWindow; keyLoader: (name: string) => string | null; projectRoot: string; configPath?: string }) => { close: () => void }
  submitTask:  (task: string, opts?: { projectRoot?: string; screenshotPath?: string; designSpecPath?: string }) => void
  writeState:  (patch: Record<string, unknown>) => void
  readState:   () => Record<string, unknown> | null
  PIPELINE_DIR: string
}

let flowManager: FlowManager | null = null

function getFlowManager(): FlowManager {
  if (!flowManager) {
    // We use require() here so the flow-manager stays a plain CJS module
    // (no TypeScript compilation needed for rapid iteration).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    flowManager = require(resolveFlowManager()) as FlowManager
  }
  return flowManager
}

let watcher: { close: () => void } | null = null
let registered = false  // guard: ipcMain.handle throws if called twice for the same channel

/**
 * Key loader bridge — reads encrypted keys stored by safeStorage.
 * Allows flow-manager.js to access API keys without knowing about
 * the Electron internals.
 */
function makeKeyLoader(userData: string) {
  return (name: string): string | null => {
    const p = join(userData, `${name}.enc`)
    if (!existsSync(p)) return null
    try {
      return safeStorage.decryptString(readFileSync(p))
    } catch {
      return null
    }
  }
}

export function registerHupheCodeIPC(win: BrowserWindow): void {
  const projectRoot = join(__dirname, '..', '..') // → HupheShell root
  const flowManager = getFlowManager()
  const orchestrator = getOrchestrator()

  // Always update the window reference so IPC broadcasts reach the current window
  if ((global as any).__hupheCodeWindow !== undefined) {
    ;(global as any).__hupheCodeWindow = win
  }

  // Start or reconnect the pipeline watcher
  if (!watcher) {
    watcher = flowManager.start({
      window:      win,
      keyLoader:   makeKeyLoader(app.getPath('userData')),
      projectRoot,
      configPath:  join(app.getPath('userData'), 'huphe-code-config.json'),
    })
  }

  // Register settings IPC (idempotent — safe to call on every window reconnect)
  registerSettingsIPC(win)

  // Wire orchestrator broadcast to the current window
  orchestrator.setBroadcast((event: unknown) => {
    if (!win.isDestroyed()) win.webContents.send('orchestrator:event', event)
  })

  // ipcMain.handle throws ERR_IPC_HANDLER_ALREADY_REGISTERED on duplicate calls.
  // Skip registration entirely after the first successful call.
  if (registered) return
  registered = true

  // -----------------------------------------------------------------------
  //  IPC: Orchestrator — run a task via Claude Code in Antigravity
  // -----------------------------------------------------------------------
  ipcMain.handle('orchestrator:run', async (_event, task: string, opts: {
    cwd?:            string
    permissionMode?: string
    sessionId?:      string
    systemPrompt?:   string
    maxTurns?:       number
  } = {}) => {
    try {
      task = parseIpcPayload('orchestrator:run/task', OrchestratorTaskSchema, task)
      opts = parseIpcPayload('orchestrator:run/options', OrchestratorOptionsSchema, opts)
      const result = await orchestrator.run(task, opts)
      return { ok: true, ...result }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('orchestrator:cancel', () => {
    return { cancelled: orchestrator.cancel() }
  })

  ipcMain.handle('orchestrator:status', () => {
    return {
      running:    orchestrator.isRunning(),
      binaryInfo: orchestrator.getBinaryInfo(),
    }
  })

  // -----------------------------------------------------------------------
  //  IPC: settings:getMode / settings:setMode — shorthand kanalen
  //  Compleet kanaalset zit in settings-ipc.ts (settings:get-config etc.)
  //  Deze twee zijn de snelle lees/schrijf shorthand voor de orchestrator UI.
  // -----------------------------------------------------------------------
  ipcMain.handle('settings:getMode', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sm = require(resolveSettingsManager()) as { getMode: () => string }
    return { mode: sm.getMode() }
  })

  ipcMain.handle('settings:setMode', async (_event, mode: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sm = require(resolveSettingsManager()) as { setMode: (m: string) => Promise<unknown> }
    try {
      mode = parseIpcPayload('settings:setMode', ModeSchema, mode)
      const config = await sm.setMode(mode)
      return { ok: true, config }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // -----------------------------------------------------------------------
  //  IPC: Submit a new task → kick off the pipeline from AUDITING
  // -----------------------------------------------------------------------
  ipcMain.handle('huphe-code:submit-task', (_event, task: string, opts: {
    screenshotPath?: string
    designSpecPath?: string
    projectPath?: string
  } = {}) => {
    try {
      task = parseIpcPayload('huphe-code:submit-task/task', OrchestratorTaskSchema, task)
      opts = parseIpcPayload('huphe-code:submit-task/options', HupheSubmitOptionsSchema, opts)
      flowManager.submitTask(task, { projectRoot, ...opts })
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // -----------------------------------------------------------------------
  //  IPC: Read current pipeline state
  // -----------------------------------------------------------------------
  ipcMain.handle('huphe-code:get-state', () => {
    return flowManager.readState() ?? { status: 'IDLE' }
  })

  // -----------------------------------------------------------------------
  //  IPC: Manually advance or reset the pipeline state
  // -----------------------------------------------------------------------
  ipcMain.handle('huphe-code:set-state', (_event, patch: Record<string, unknown>) => {
    try {
      patch = parseIpcPayload('huphe-code:set-state', JsonPatchSchema, patch)
      flowManager.writeState(patch)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // -----------------------------------------------------------------------
  //  IPC: Get pipeline dir path (for opening in Finder etc.)
  // -----------------------------------------------------------------------
  ipcMain.handle('huphe-code:pipeline-dir', () => flowManager.PIPELINE_DIR)

  // -----------------------------------------------------------------------
  //  IPC: Config (projectPath — stored as plain text, not encrypted)
  //       API keys use the existing key:set / key:has handlers.
  // -----------------------------------------------------------------------
  const configPath = join(app.getPath('userData'), 'huphe-code-config.json')

  ipcMain.handle('huphe-code:get-config', () => {
    try {
      if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, 'utf8'))
    } catch {}
    return {}
  })

  ipcMain.handle('huphe-code:set-config', (_event, patch: Record<string, unknown>) => {
    try {
      patch = parseIpcPayload('huphe-code:set-config', JsonPatchSchema, patch)
      let current: Record<string, unknown> = {}
      try { if (existsSync(configPath)) current = JSON.parse(readFileSync(configPath, 'utf8')) } catch {}
      const next = { ...current, ...patch }
      const { writeFileSync } = require('fs') as typeof import('fs')
      writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // -----------------------------------------------------------------------
  //  Cleanup: close watcher when window closes
  // -----------------------------------------------------------------------
  win.on('closed', () => {
    watcher?.close()
    watcher = null
  })
}
