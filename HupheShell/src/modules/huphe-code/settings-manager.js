/**
 * ============================================================
 *  HUPHE CODE — Settings Manager
 *  src/modules/huphe-code/settings-manager.js
 * ============================================================
 *
 *  Manages the dual-mode configuration for the Huphe pipeline:
 *
 *    "antigravity"  — routes requests via the local MCP server
 *    "api"          — calls cloud AI APIs directly with stored keys
 *
 *  Key storage follows the existing Electron pattern:
 *  keys are encrypted via safeStorage and stored as .enc files
 *  in userData.  This manager receives a keyLoader and keySaver
 *  injected by the IPC registration layer — it never touches
 *  safeStorage directly.
 *
 *  Register in huphe-code-ipc.ts:
 *    import { registerSettingsIPC } from './settings-ipc'
 *    registerSettingsIPC(win, { keyLoader, keySaver, userData })
 * ============================================================
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// ---------------------------------------------------------------------------
//  Config schema
//
//  Stored at: {userData}/huphe-settings.json
//
//  {
//    "mode": "api" | "antigravity",
//    "antigravity": {
//      "mcpServerPath": "/abs/path/to/mcp-server.js",
//      "connectionStatus": "connected" | "disconnected" | "error",
//      "lastChecked": "<ISO timestamp>"
//    },
//    "api": {
//      "defaultProvider": "claude" | "openai" | "google",
//      "claudeModel":  "claude-opus-4-6",
//      "openaiModel":  "gpt-4o",
//      "googleModel":  "gemini-2.0-flash"
//    },
//    "updatedAt": "<ISO timestamp>"
//  }
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  mode: 'api',
  antigravity: {
    mcpServerPath:    path.resolve(__dirname, 'mcp-server.js'),
    connectionStatus: 'disconnected',
    lastChecked:      null,
  },
  api: {
    defaultProvider: 'claude',
    claudeModel:     'claude-opus-4-6',
    openaiModel:     'gpt-4o',
    googleModel:     'gemini-2.0-flash',
  },
  activeProjectPath: null,
  updatedAt: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
//  Module-level state
// ---------------------------------------------------------------------------

let _configPath  = null   // set by init()
let _keyLoader   = null   // (name: string) => string | null
let _keySaver    = null   // (name: string, value: string) => void
let _onStateChange = null // (config) => void  — called on mode/status changes

// ---------------------------------------------------------------------------
//  Config I/O
// ---------------------------------------------------------------------------

function readConfig() {
  try {
    if (fs.existsSync(_configPath)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(_configPath, 'utf8')) }
    }
  } catch {}
  return { ...DEFAULT_CONFIG }
}

function writeConfig(patch) {
  const current = readConfig()
  const next = deepMerge(current, patch)
  next.updatedAt = new Date().toISOString()
  fs.writeFileSync(_configPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function deepMerge(base, patch) {
  const result = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object') {
      result[k] = deepMerge(base[k], v)
    } else {
      result[k] = v
    }
  }
  return result
}

// ---------------------------------------------------------------------------
//  MCP connection probe
//
//  Spawns mcp-server.js, sends a JSON-RPC tools/list request via stdin,
//  and expects a valid response on stdout within PROBE_TIMEOUT_MS.
//  Returns 'connected' or 'error'.
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 5000

function probeAntigravity(mcpServerPath) {
  return new Promise((resolve) => {
    const serverPath = mcpServerPath || path.resolve(__dirname, 'mcp-server.js')

    if (!fs.existsSync(serverPath)) {
      return resolve({ status: 'error', error: `MCP server not found: ${serverPath}` })
    }

    let settled = false
    const settle = (result) => {
      if (settled) return
      settled = true
      if (child && !child.killed) {
        try { child.kill() } catch {}
      }
      clearTimeout(timer)
      resolve(result)
    }

    let child
    try {
      child = spawn(process.execPath, [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   { ...process.env, HUPHE_CODE_MOCK: 'true' },
      })
    } catch (err) {
      return settle({ status: 'error', error: `spawn failed: ${err.message}` })
    }

    // Timeout guard
    const timer = setTimeout(() => {
      settle({ status: 'error', error: 'MCP probe timed out' })
    }, PROBE_TIMEOUT_MS)

    // Collect stdout and scan for a valid JSON-RPC response
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      // MCP messages are newline-delimited JSON
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed)
          // A valid tools/list response has result.tools array
          if (msg.id === 1 && msg.result && Array.isArray(msg.result.tools)) {
            settle({ status: 'connected', toolCount: msg.result.tools.length })
            return
          }
        } catch {
          // Not JSON — ignore
        }
      }
    })

    child.stderr.on('data', () => {
      // stderr output means the server started — now send our probe request
      const probe = JSON.stringify({
        jsonrpc: '2.0',
        id:      1,
        method:  'tools/list',
        params:  {},
      }) + '\n'
      try { child.stdin.write(probe) } catch {}
    })

    child.on('error', (err) => {
      settle({ status: 'error', error: err.message })
    })

    child.on('close', (code) => {
      if (!settled) {
        settle({ status: 'error', error: `MCP process exited with code ${code}` })
      }
    })
  })
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the SettingsManager.
 * Must be called once before any other method.
 *
 * @param {object} opts
 * @param {string}   opts.userData       — Electron app.getPath('userData')
 * @param {Function} opts.keyLoader      — (name) => string|null
 * @param {Function} opts.keySaver       — (name, value) => void
 * @param {Function} opts.onStateChange  — (config) => void  (called after mode/status changes)
 */
function init({ userData, keyLoader, keySaver, onStateChange }) {
  _configPath    = path.join(userData, 'huphe-settings.json')
  _keyLoader     = keyLoader
  _keySaver      = keySaver
  _onStateChange = onStateChange || (() => {})

  // Ensure config file exists with defaults
  if (!fs.existsSync(_configPath)) {
    writeConfig({})
  }
}

/** Return the full current config object. */
function getConfig() {
  return readConfig()
}

/** Return only the non-secret parts safe to send to the renderer. */
function getPublicConfig() {
  const config = readConfig()
  return {
    mode:              config.mode,
    antigravity:       config.antigravity,
    api:               config.api,
    activeProjectPath: config.activeProjectPath ?? null,
    updatedAt:         config.updatedAt,
    keys: {
      claude:      !!_keyLoader?.('claude'),
      openai:      !!_keyLoader?.('openai'),
      openrouter:  !!_keyLoader?.('openrouter'),
      google:      !!_keyLoader?.('google'),
    },
  }
}

/**
 * Return the active project path, or null if none is set.
 * Safe to call before init() — reads directly from disk.
 */
function getActiveProjectPath() {
  if (!_configPath) return null
  try {
    const raw = fs.readFileSync(_configPath, 'utf8')
    return JSON.parse(raw).activeProjectPath ?? null
  } catch {
    return null
  }
}

/**
 * Persist the active project working directory.
 * Pass null to clear it.
 * @param {string|null} projectPath
 */
function setActiveProjectPath(projectPath) {
  writeConfig({ activeProjectPath: projectPath ?? null })
  _onStateChange(getPublicConfig())
}

/**
 * Switch operation mode.
 *
 * When switching to 'antigravity', automatically probes the MCP server.
 * Updates connectionStatus in config and broadcasts the change.
 *
 * @param {'api'|'antigravity'} mode
 * @returns {Promise<object>} Updated public config
 */
async function setMode(mode) {
  if (mode !== 'api' && mode !== 'antigravity') {
    throw new Error(`Invalid mode "${mode}". Must be "api" or "antigravity".`)
  }

  let config = writeConfig({ mode })

  if (mode === 'antigravity') {
    // Update status to 'connecting' so the UI can show a spinner
    config = writeConfig({ antigravity: { connectionStatus: 'connecting', lastChecked: new Date().toISOString() } })
    _onStateChange(getPublicConfig())

    const result = await probeAntigravity(config.antigravity.mcpServerPath)
    config = writeConfig({
      antigravity: {
        connectionStatus: result.status === 'connected' ? 'connected' : 'error',
        lastChecked:      new Date().toISOString(),
      },
    })
  }

  const pub = getPublicConfig()
  _onStateChange(pub)
  return pub
}

/**
 * Patch non-secret config fields.
 * Pass { api: { defaultProvider: 'openai' } } etc.
 */
function patchConfig(patch) {
  // Disallow accidental status overrides from renderer
  const safePatch = { ...patch }
  delete safePatch.mode          // use setMode() for mode changes
  delete safePatch.updatedAt

  writeConfig(safePatch)
  const pub = getPublicConfig()
  _onStateChange(pub)
  return pub
}

/**
 * Save an API key via the injected keySaver (safeStorage).
 * @param {'claude'|'openai'|'openrouter'|'google'} name
 * @param {string} value
 */
function saveKey(name, value) {
  const allowed = ['claude', 'openai', 'openrouter', 'google']
  if (!allowed.includes(name)) {
    throw new Error(`Unknown key name "${name}". Allowed: ${allowed.join(', ')}`)
  }
  if (!_keySaver) throw new Error('SettingsManager not initialised — call init() first.')
  _keySaver(name, value)
  _onStateChange(getPublicConfig())
}

/**
 * Manually re-probe the Antigravity MCP connection.
 * @returns {Promise<object>} Updated public config
 */
async function recheckAntigravity() {
  const config = readConfig()
  writeConfig({ antigravity: { connectionStatus: 'connecting', lastChecked: new Date().toISOString() } })
  _onStateChange(getPublicConfig())

  const result = await probeAntigravity(config.antigravity.mcpServerPath)
  writeConfig({
    antigravity: {
      connectionStatus: result.status === 'connected' ? 'connected' : 'error',
      lastChecked:      new Date().toISOString(),
    },
  })

  const pub = getPublicConfig()
  _onStateChange(pub)
  return pub
}

// ---------------------------------------------------------------------------
//  getMode() — fast read without going through getPublicConfig()
//  Safe to call before init() — returns 'direct' as safe default.
// ---------------------------------------------------------------------------

function getMode() {
  if (!_configPath) return 'direct'
  try {
    const raw = fs.readFileSync(_configPath, 'utf8')
    return JSON.parse(raw).mode ?? 'direct'
  } catch {
    return 'direct'
  }
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = {
  init,
  getConfig,
  getPublicConfig,
  getMode,
  setMode,
  patchConfig,
  saveKey,
  recheckAntigravity,
  getActiveProjectPath,
  setActiveProjectPath,
}
