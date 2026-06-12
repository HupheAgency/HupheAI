/**
 * ============================================================
 *  HUPHE CODE — Orchestrator
 *  src/modules/huphe-code/orchestrator.js
 * ============================================================
 *
 *  Spawns the Claude Code CLI (bundled inside Antigravity) as a
 *  subprocess and streams its JSON output back to the Huphe renderer.
 *
 *  Flow:
 *    Huphe UI → orchestrator:run(task, opts)
 *      → spawns: claude --print --output-format stream-json --verbose
 *      → parses newline-delimited JSON from stdout
 *      → broadcasts each event via win.webContents.send('orchestrator:event')
 *      → resolves when result message arrives
 *
 *  Permission modes (--permission-mode flag):
 *    'default'          — claude asks before editing files (safe)
 *    'acceptEdits'      — auto-accepts file edits, asks for shell commands
 *    'bypassPermissions'— fully autonomous, no prompts (use with care)
 *
 *  The claude binary is discovered from ~/.antigravity/extensions/
 *  picking the highest version installed.
 * ============================================================
 */

'use strict'

const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const { spawn } = require('child_process')

// settings-manager lives next to this file — same directory
const settingsManager = require('./settings-manager')

// ---------------------------------------------------------------------------
//  Binary discovery
// ---------------------------------------------------------------------------

const ANTIGRAVITY_EXTENSIONS = path.join(os.homedir(), '.antigravity', 'extensions')

/**
 * Find the latest Claude Code binary installed in Antigravity extensions.
 * Returns the absolute path or null if not found.
 */
function findClaudeBinary() {
  try {
    const entries = fs.readdirSync(ANTIGRAVITY_EXTENSIONS)
    const claudeDirs = entries
      .filter(e => e.startsWith('anthropic.claude-code-'))
      .sort()
      .reverse() // highest version first

    for (const dir of claudeDirs) {
      const bin = path.join(ANTIGRAVITY_EXTENSIONS, dir, 'resources', 'native-binary', 'claude')
      if (fs.existsSync(bin)) return bin
    }
  } catch {}
  return null
}

// Cache the binary path — it won't change at runtime
let _claudeBin = null
function getClaudeBinary() {
  if (!_claudeBin) _claudeBin = findClaudeBinary()
  return _claudeBin
}

// ---------------------------------------------------------------------------
//  Event types emitted to the renderer
//
//  { type: 'init',      session_id, tools, model, cwd }
//  { type: 'text',      text }                          ← assistant text chunk
//  { type: 'tool_use',  name, input }                   ← claude using a tool
//  { type: 'tool_result', tool_use_id, content }        ← tool output
//  { type: 'result',    text, cost_usd, duration_ms }   ← final answer
//  { type: 'error',     message }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Active run state (one run at a time)
// ---------------------------------------------------------------------------

let _activeChild = null
let _broadcastFn = null   // set by init()

function setBroadcast(fn) {
  _broadcastFn = fn
}

function broadcast(event) {
  try {
    if (_broadcastFn) _broadcastFn(event)
  } catch {}
}

// ---------------------------------------------------------------------------
//  Stream-JSON parser
//  The claude CLI emits newline-delimited JSON objects on stdout.
//  Each object has a `type` field.
// ---------------------------------------------------------------------------

function parseClaudeEvent(raw) {
  try {
    const msg = JSON.parse(raw)

    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          return {
            type:       'init',
            session_id: msg.session_id,
            tools:      msg.tools,
            model:      msg.model,
            cwd:        msg.cwd,
          }
        }
        return null

      case 'assistant': {
        const content = msg.message?.content ?? []
        const events = []
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            events.push({ type: 'text', text: block.text, session_id: msg.session_id })
          } else if (block.type === 'tool_use') {
            events.push({
              type:       'tool_use',
              id:         block.id,
              name:       block.name,
              input:      block.input,
              session_id: msg.session_id,
            })
          }
        }
        return events.length === 1 ? events[0] : events.length > 1 ? events : null
      }

      case 'tool_result':
        return {
          type:        'tool_result',
          tool_use_id: msg.tool_use_id,
          content:     msg.content,
          session_id:  msg.session_id,
        }

      case 'result':
        return {
          type:        'result',
          text:        msg.result,
          is_error:    msg.is_error,
          cost_usd:    msg.total_cost_usd,
          duration_ms: msg.duration_ms,
          session_id:  msg.session_id,
        }

      case 'rate_limit_event':
      case 'debug':
        return null   // silently ignore

      default:
        return null
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  run() — dual-mode entry point
//
//  Checks settings-manager for the current ai_mode and routes to either:
//    'antigravity' → mcp-server.js pipeline (run_pipeline tool)
//    'direct'      → Claude Code CLI spawn (default)
//
//  Both paths emit identical orchestrator:event shapes and resolve with
//  { text, session_id, cost_usd, is_error, mode } so the React UI never
//  needs to know which backend was active.
// ---------------------------------------------------------------------------

/**
 * @param {string} task
 * @param {object} opts
 * @param {string} opts.cwd             Working directory for Claude Code CLI
 * @param {string} opts.permissionMode  'default'|'acceptEdits'|'bypassPermissions'
 * @param {string} opts.sessionId       Resume a previous Claude Code session
 * @param {string} opts.systemPrompt    Extra context prepended to the task
 * @param {number} opts.maxTurns        Max agent turns (default 20, direct mode only)
 * @returns {Promise<{ text, session_id, cost_usd, is_error, mode }>}
 */
async function run(task, opts = {}) {
  if (_activeChild) {
    throw new Error('Orchestrator already has an active run. Call cancel() first.')
  }

  // Auto-fill cwd from the persisted active project path when the caller
  // doesn't provide an explicit working directory.
  const effectiveCwd = opts.cwd ?? settingsManager.getActiveProjectPath() ?? undefined

  const mode = settingsManager.getMode()

  if (mode === 'antigravity') {
    return runViaAntigravity(task, { ...opts, cwd: effectiveCwd })
  }
  return runViaCLI(task, { ...opts, cwd: effectiveCwd })
}

// ---------------------------------------------------------------------------
//  runViaAntigravity — MCP pipeline route
//
//  1. Spawns mcp-server.js
//  2. Sends tools/call → run_pipeline with the task
//  3. Polls get_pipeline_status until DONE or FAILED (every 2 s, max 3 min)
//  4. Broadcasts orchestrator:event for each status change
// ---------------------------------------------------------------------------

const MCP_SERVER_PATH  = path.resolve(__dirname, 'mcp-server.js')
const MCP_TIMEOUT_MS   = 10_000
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_TRIES   = 90   // 90 × 2 s = 3 min

function mcpRpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(process.execPath, [MCP_SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   { ...process.env, HUPHE_CODE_MOCK: process.env.HUPHE_CODE_MOCK ?? 'false' },
      })
    } catch (err) {
      return reject(new Error(`Failed to spawn MCP server: ${err.message}`))
    }

    let settled = false
    let buf = ''
    let serverReady = false

    const settle = (err, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child.kill() } catch {}
      if (err) reject(err)
      else resolve(result)
    }

    const timer = setTimeout(
      () => settle(new Error(`MCP RPC "${method}" timed out`)),
      MCP_TIMEOUT_MS
    )

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        try {
          const msg = JSON.parse(t)
          if (msg.id === 1) {
            if (msg.error) settle(new Error(`MCP error: ${msg.error.message}`), null)
            else settle(null, msg.result)
          }
        } catch {}
      }
    })

    child.stderr.on('data', () => {
      if (serverReady) return
      serverReady = true
      const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'
      try { child.stdin.write(req) } catch (err) { settle(err, null) }
    })

    child.on('error', (err) => settle(err, null))
    child.on('close', (code) => {
      if (!settled) settle(new Error(`MCP process closed (code ${code})`), null)
    })
  })
}

async function mcpCallTool(toolName, toolArgs = {}) {
  const result = await mcpRpc('tools/call', { name: toolName, arguments: toolArgs })
  const raw = result?.content?.[0]?.text
  if (!raw) throw new Error(`MCP tool "${toolName}" returned empty content`)
  return JSON.parse(raw)
}

async function runViaAntigravity(task, opts) {
  broadcast({ type: 'starting', mode: 'antigravity', task })

  // 1. Submit to pipeline
  broadcast({ type: 'text', text: '⚡ Antigravity: pipeline starten via MCP…' })
  await mcpCallTool('run_pipeline', {
    task,
    project_path: opts.cwd ?? undefined,
  })

  // 2. Poll until terminal state
  let lastStatus = ''
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    let status
    try {
      status = await mcpCallTool('get_pipeline_status')
    } catch (err) {
      broadcast({ type: 'error', message: `Status poll fout: ${err.message}` })
      throw err
    }

    // Only broadcast when status changes to avoid log spam
    if (status.status !== lastStatus) {
      lastStatus = status.status
      broadcast({
        type:        'tool_use',
        name:        'get_pipeline_status',
        input:       {},
        result:      status,
        mode:        'antigravity',
      })
      broadcast({
        type: 'text',
        text: `[${status.status}] ${status.status_description ?? ''}`,
      })
    }

    if (status.status === 'DONE') {
      const text = `✅ Pipeline klaar voor taak: "${status.task}"`
      broadcast({ type: 'result', text, mode: 'antigravity' })
      return {
        text,
        session_id: `pipeline-${Date.now()}`,
        cost_usd:   0,
        is_error:   false,
        mode:       'antigravity',
      }
    }

    if (status.status === 'FAILED') {
      const msg = status.error ?? 'Pipeline mislukt zonder foutmelding'
      broadcast({ type: 'error', message: msg })
      return {
        text:       msg,
        session_id: `pipeline-${Date.now()}`,
        cost_usd:   0,
        is_error:   true,
        mode:       'antigravity',
      }
    }
  }

  throw new Error('Antigravity pipeline polling timed out na 3 minuten')
}

// ---------------------------------------------------------------------------
//  runViaCLI — Claude Code CLI spawn route (direct mode)
// ---------------------------------------------------------------------------

function runViaCLI(task, opts) {
  return new Promise((resolve, reject) => {
    const claudeBin = getClaudeBinary()
    if (!claudeBin) {
      return reject(new Error(
        'Claude Code binary niet gevonden in ~/.antigravity/extensions/. ' +
        'Zorg dat Antigravity geïnstalleerd is en de Claude Code extensie actief is.'
      ))
    }

    const cwd            = opts.cwd            ?? process.cwd()
    const permissionMode = opts.permissionMode ?? 'acceptEdits'
    const maxTurns       = opts.maxTurns       ?? 20
    const fullTask       = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n---\n\n${task}`
      : task

    const args = [
      '--output-format', 'stream-json',
      '--verbose',
      '--print',
      '--max-turns',      String(maxTurns),
      '--permission-mode', permissionMode,
    ]
    if (opts.sessionId) args.push('--resume', opts.sessionId)

    broadcast({ type: 'starting', mode: 'direct', cwd, permissionMode, task })

    let child
    try {
      child = spawn(claudeBin, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   { ...process.env },
      })
    } catch (err) {
      return reject(new Error(`Spawn Claude Code mislukt: ${err.message}`))
    }

    _activeChild = child

    try {
      child.stdin.write(fullTask + '\n')
      child.stdin.end()
    } catch (err) {
      _activeChild = null
      return reject(new Error(`Schrijven naar Claude Code stdin mislukt: ${err.message}`))
    }

    let stdoutBuf = ''
    let stderrBuf = ''
    let finalResult = null

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop()

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        const parsed = parseClaudeEvent(trimmed)
        if (!parsed) continue

        const events = Array.isArray(parsed) ? parsed : [parsed]
        for (const event of events) {
          broadcast({ ...event, mode: 'direct' })
          if (event.type === 'result') finalResult = event
        }
      }
    })

    // Emit stderr lines as log events so the UI can show raw output
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderrBuf += text
      // Strip ANSI codes for clean display
      const clean = text.replace(/\x1B\[[0-9;]*m/g, '').trim()
      if (clean) broadcast({ type: 'stderr', text: clean, mode: 'direct' })
    })

    child.on('error', (err) => {
      _activeChild = null
      broadcast({ type: 'error', message: err.message, mode: 'direct' })
      reject(err)
    })

    child.on('close', (code) => {
      _activeChild = null

      if (finalResult) {
        resolve({
          text:       finalResult.text,
          session_id: finalResult.session_id,
          cost_usd:   finalResult.cost_usd,
          is_error:   finalResult.is_error,
          mode:       'direct',
        })
        return
      }

      const errMsg = stderrBuf.trim() || `Claude Code afgesloten met code ${code}`
      broadcast({ type: 'error', message: errMsg, mode: 'direct' })
      reject(new Error(errMsg))
    })
  })
}

// ---------------------------------------------------------------------------
//  cancel() — kill the active run
// ---------------------------------------------------------------------------

function cancel() {
  if (!_activeChild) return false
  try {
    _activeChild.kill('SIGTERM')
  } catch {}
  _activeChild = null
  broadcast({ type: 'cancelled' })
  return true
}

// ---------------------------------------------------------------------------
//  isRunning()
// ---------------------------------------------------------------------------

function isRunning() {
  return _activeChild !== null
}

// ---------------------------------------------------------------------------
//  getBinaryInfo() — for UI status display
// ---------------------------------------------------------------------------

function getBinaryInfo() {
  const bin = getClaudeBinary()
  if (!bin) return { found: false }

  // Extract version from directory name
  const parts = bin.split(path.sep)
  const extDir = parts.find(p => p.startsWith('anthropic.claude-code-')) ?? ''
  const version = extDir.replace('anthropic.claude-code-', '').replace(/-darwin.*/, '')

  return { found: true, path: bin, version }
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = { run, cancel, isRunning, getBinaryInfo, setBroadcast }
