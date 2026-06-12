/**
 * ============================================================
 *  HUPHE CODE — Settings IPC registration
 *  src/main/settings-ipc.ts
 * ============================================================
 *
 *  Wires the SettingsManager to Electron IPC.
 *
 *  Renderer → Main channels (ipcMain.handle):
 *    settings:get-config           → PublicConfig
 *    settings:set-mode             → PublicConfig  (probes MCP if antigravity)
 *    settings:patch-config         → PublicConfig
 *    settings:save-key             → { ok: boolean }
 *    settings:recheck-antigravity  → PublicConfig
 *
 *  Main → Renderer push (win.webContents.send):
 *    huphe:mode-changed            → PublicConfig   (on every state change)
 *
 *  Register from huphe-code-ipc.ts:
 *    import { registerSettingsIPC } from './settings-ipc'
 *    registerSettingsIPC(win)
 * ============================================================
 */

import { app, ipcMain, safeStorage, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync }    from 'fs'
import { join, resolve }                              from 'path'
import { z } from 'zod'

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    console.warn(`[security] Ongeldige IPC payload geblokkeerd voor ${channel}:`, result.error.issues)
    throw new Error(`Ongeldige payload voor ${channel}`)
  }
  return result.data
}

const SettingsModeSchema = z.string().trim().min(1).max(80)
const SettingsPatchSchema = z.record(z.string(), z.unknown())
const KeyNameSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/)
const KeyValueSchema = z.string().max(20000)
const ProjectPathSchema = z.string().min(1).max(4096).nullable()

// ---------------------------------------------------------------------------
//  Resolve settings-manager.js at runtime.
//  electron-vite compiles src/main → out/main but does NOT copy src/modules.
//  Mirror the same strategy used by huphe-code-ipc.ts for flow-manager.js.
// ---------------------------------------------------------------------------

function resolveSettingsManager(): string {
  const relativePath = 'src/modules/huphe-code/settings-manager.js'

  // 1. Dev / unpackaged: app.getAppPath() is the project root
  const devPath = join(app.getAppPath(), relativePath)
  if (existsSync(devPath)) return devPath

  // 2. Packaged: electron-builder copies src/modules/ via extraResources
  if (app.isPackaged) {
    const prodPath = join(process.resourcesPath, 'modules/huphe-code/settings-manager.js')
    if (existsSync(prodPath)) return prodPath
  }

  // 3. Fallback: relative to __dirname (out/main → ../../src/modules)
  return resolve(__dirname, '../../src/modules/huphe-code/settings-manager.js')
}

type SettingsManager = {
  init:                  (opts: { userData: string; keyLoader: (n: string) => string | null; keySaver: (n: string, v: string) => void; onStateChange: (c: unknown) => void }) => void
  getPublicConfig:       () => unknown
  setMode:               (mode: string) => Promise<unknown>
  patchConfig:           (patch: Record<string, unknown>) => unknown
  saveKey:               (name: string, value: string) => void
  recheckAntigravity:    () => Promise<unknown>
  getActiveProjectPath:  () => string | null
  setActiveProjectPath:  (path: string | null) => void
}

let settingsManager: SettingsManager | null = null

function getSettingsManager(): SettingsManager {
  if (!settingsManager) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    settingsManager = require(resolveSettingsManager()) as SettingsManager
  }
  return settingsManager
}

// ---------------------------------------------------------------------------
//  Key storage helpers (same pattern as index.ts)
// ---------------------------------------------------------------------------

function keyPath(name: string): string {
  return join(app.getPath('userData'), `${name}.enc`)
}

function loadKey(name: string): string | null {
  const p = keyPath(name)
  if (!existsSync(p)) return null
  try { return safeStorage.decryptString(readFileSync(p)) } catch { return null }
}

function storeKey(name: string, value: string): void {
  writeFileSync(keyPath(name), safeStorage.encryptString(value))
}

// ---------------------------------------------------------------------------
//  Registration
// ---------------------------------------------------------------------------

let _settingsRegistered = false

export function registerSettingsIPC(win: BrowserWindow): void {
  const settingsManager = getSettingsManager()

  // Initialise the manager once, re-pointing the window reference on reconnect
  settingsManager.init({
    userData:      app.getPath('userData'),
    keyLoader:     loadKey,
    keySaver:      storeKey,
    onStateChange: (config: unknown) => {
      // Push live updates to the renderer whenever mode or connection status changes
      if (win && !win.isDestroyed()) {
        win.webContents.send('huphe:mode-changed', config)
      }
    },
  })

  if (_settingsRegistered) return
  _settingsRegistered = true

  // ── Get current config ─────────────────────────────────────────────────
  ipcMain.handle('settings:get-config', () => {
    return settingsManager.getPublicConfig()
  })

  // ── Switch mode (probes MCP if switching to antigravity) ───────────────
  ipcMain.handle('settings:set-mode', async (_event, mode: string) => {
    try {
      mode = parseIpcPayload('settings:set-mode', SettingsModeSchema, mode)
      return await settingsManager.setMode(mode)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Patch non-secret config fields ────────────────────────────────────
  ipcMain.handle('settings:patch-config', (_event, patch: Record<string, unknown>) => {
    try {
      patch = parseIpcPayload('settings:patch-config', SettingsPatchSchema, patch)
      return settingsManager.patchConfig(patch)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Save an API key (encrypted via safeStorage) ───────────────────────
  ipcMain.handle('settings:save-key', (_event, name: string, value: string) => {
    try {
      name = parseIpcPayload('settings:save-key/name', KeyNameSchema, name)
      value = parseIpcPayload('settings:save-key/value', KeyValueSchema, value)
      settingsManager.saveKey(name, value)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // ── Re-probe Antigravity connection manually ───────────────────────────
  ipcMain.handle('settings:recheck-antigravity', async () => {
    try {
      return await settingsManager.recheckAntigravity()
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Active project path ────────────────────────────────────────────────
  ipcMain.handle('settings:get-project-path', () => {
    return { path: settingsManager.getActiveProjectPath() }
  })

  ipcMain.handle('settings:set-project-path', (_event, path: string | null) => {
    try {
      path = parseIpcPayload('settings:set-project-path', ProjectPathSchema, path)
      settingsManager.setActiveProjectPath(path)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}
