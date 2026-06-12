/**
 * ============================================================
 *  HUPHE CODE — AI Provider abstraction
 *  src/modules/huphe-code/engine/provider.js
 * ============================================================
 *
 *  Provides a single interface for AI completions regardless of
 *  whether the app is running in Antigravity Mode (local MCP) or
 *  API Mode (direct cloud calls).
 *
 *  Usage:
 *    const { createProvider } = require('./engine/provider')
 *    const provider = createProvider(mode, { keyLoader })
 *    const reply = await provider.complete([
 *      { role: 'user', content: 'Hello' }
 *    ])
 *
 *  Both providers expose an identical interface so call sites
 *  never need to know which backend is active.
 * ============================================================
 */

'use strict'

const { spawn } = require('child_process')
const path      = require('path')
const fs        = require('fs')

// ---------------------------------------------------------------------------
//  Base class (interface contract)
// ---------------------------------------------------------------------------

class AIProvider {
  /**
   * @param {string} mode  'antigravity' | 'api'
   * @param {object} opts
   */
  constructor(mode, opts = {}) {
    this.mode = mode
    this.opts = opts
  }

  /**
   * Generate a completion.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [callOpts]
   * @param {string} [callOpts.model]         — override default model
   * @param {number} [callOpts.maxTokens]     — max output tokens
   * @param {number} [callOpts.temperature]   — 0.0–1.0
   * @returns {Promise<{text: string, model: string, provider: string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async complete(messages, callOpts = {}) {
    throw new Error(`AIProvider.complete() is abstract — implement in subclass`)
  }

  /**
   * Optional: trigger a specific pipeline tool by name.
   * Only AntigravityProvider implements this fully.
   *
   * @param {string} toolName
   * @param {object} toolArgs
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async callTool(toolName, toolArgs = {}) {
    throw new Error(`callTool() is not supported in mode "${this.mode}"`)
  }
}

// ---------------------------------------------------------------------------
//  AntigravityProvider
//  Routes requests through the local mcp-server.js via JSON-RPC over stdio.
//  For each call a fresh mcp-server process is spawned and immediately closed.
//  This keeps the provider stateless and avoids managing long-lived processes
//  from the main process.
// ---------------------------------------------------------------------------

const MCP_SERVER_PATH = path.resolve(__dirname, '..', 'mcp-server.js')
const MCP_TIMEOUT_MS  = 30_000

class AntigravityProvider extends AIProvider {
  constructor(opts = {}) {
    super('antigravity', opts)
    this._serverPath = opts.mcpServerPath || MCP_SERVER_PATH
  }

  /**
   * Send a JSON-RPC request to the mcp-server and return the parsed result.
   * @private
   */
  _rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this._serverPath)) {
        return reject(new Error(`MCP server not found: ${this._serverPath}`))
      }

      let child
      try {
        child = spawn(process.execPath, [this._serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env:   { ...process.env, HUPHE_CODE_MOCK: 'true' },
        })
      } catch (err) {
        return reject(new Error(`Failed to spawn MCP server: ${err.message}`))
      }

      let settled = false
      let buffer  = ''
      let stderrReady = false

      const settle = (err, result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { child.kill() } catch {}
        if (err) reject(err)
        else resolve(result)
      }

      const timer = setTimeout(
        () => settle(new Error(`MCP RPC "${method}" timed out after ${MCP_TIMEOUT_MS}ms`)),
        MCP_TIMEOUT_MS
      )

      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const msg = JSON.parse(trimmed)
            if (msg.id === 1) {
              if (msg.error) settle(new Error(`MCP error: ${msg.error.message}`), null)
              else settle(null, msg.result)
            }
          } catch {}
        }
      })

      // Wait for the server's startup message on stderr before sending request
      child.stderr.on('data', () => {
        if (stderrReady) return
        stderrReady = true
        const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'
        try { child.stdin.write(request) } catch (err) { settle(err, null) }
      })

      child.on('error', (err) => settle(err, null))
      child.on('close', (code) => {
        if (!settled) settle(new Error(`MCP process closed unexpectedly (code ${code})`), null)
      })
    })
  }

  /**
   * Call a named MCP tool (run_pipeline, get_pipeline_status, read_logs).
   */
  async callTool(toolName, toolArgs = {}) {
    const result = await this._rpc('tools/call', { name: toolName, arguments: toolArgs })
    const raw = result?.content?.[0]?.text
    if (!raw) throw new Error(`MCP tool "${toolName}" returned empty content`)
    return JSON.parse(raw)
  }

  /**
   * Antigravity completion — routes the request via the pipeline.
   * Submits a task to run_pipeline and polls get_pipeline_status until DONE/FAILED.
   * For lightweight conversational use, pass useDirectModel: true in opts.
   */
  async complete(messages, callOpts = {}) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const task = lastUserMsg?.content ?? messages.map((m) => m.content).join('\n')

    if (callOpts.useDirectModel) {
      // Antigravity can proxy to a model directly via MCP — future extension point.
      // For now, fall through to pipeline.
    }

    // Submit to pipeline
    await this.callTool('run_pipeline', { task })

    // Poll until terminal state (max 60 iterations × 3s = 3 min)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const status = await this.callTool('get_pipeline_status')
      if (status.status === 'DONE') {
        return {
          text:     `Pipeline completed for task: "${status.task}"`,
          model:    'huphe-pipeline',
          provider: 'antigravity',
          state:    status,
        }
      }
      if (status.status === 'FAILED') {
        throw new Error(`Pipeline failed: ${status.error || 'unknown error'}`)
      }
    }
    throw new Error('Pipeline polling timed out after 3 minutes')
  }
}

// ---------------------------------------------------------------------------
//  DirectAPIProvider
//  Calls cloud AI APIs directly using fetch + safeStorage keys.
//  Supports Claude (Anthropic), OpenAI, and Google Gemini.
// ---------------------------------------------------------------------------

const ENDPOINTS = {
  claude:  'https://api.anthropic.com/v1/messages',
  openai:  'https://api.openai.com/v1/chat/completions',
  google:  'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
}

class DirectAPIProvider extends AIProvider {
  constructor(opts = {}) {
    super('api', opts)
    this._keyLoader      = opts.keyLoader || (() => null)
    this._defaultProvider = opts.defaultProvider || 'claude'
    this._models = {
      claude:  opts.claudeModel  || 'claude-opus-4-6',
      openai:  opts.openaiModel  || 'gpt-4o',
      google:  opts.googleModel  || 'gemini-2.0-flash',
    }
  }

  _key(name) {
    const val = this._keyLoader(name)
    if (!val) throw new Error(`API key for "${name}" is not configured. Set it in Huphe Code → Settings.`)
    return val
  }

  async _callClaude(messages, callOpts) {
    const apiKey = this._key('claude')
    const model  = callOpts.model || this._models.claude

    const response = await fetch(ENDPOINTS.claude, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens:  callOpts.maxTokens   || 4096,
        temperature: callOpts.temperature ?? 0.7,
        messages,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Claude API ${response.status}: ${text.slice(0, 300)}`)
    }

    const data = await response.json()
    return {
      text:     data.content?.[0]?.text ?? '',
      model,
      provider: 'claude',
    }
  }

  async _callOpenAI(messages, callOpts) {
    const apiKey = this._key('openai')
    const model  = callOpts.model || this._models.openai

    const response = await fetch(ENDPOINTS.openai, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens:  callOpts.maxTokens   || 4096,
        temperature: callOpts.temperature ?? 0.7,
        messages,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI API ${response.status}: ${text.slice(0, 300)}`)
    }

    const data = await response.json()
    return {
      text:     data.choices?.[0]?.message?.content ?? '',
      model,
      provider: 'openai',
    }
  }

  async _callGoogle(messages, callOpts) {
    const apiKey = this._key('google')
    const model  = callOpts.model || this._models.google
    const url    = `${ENDPOINTS.google.replace('{model}', model)}?key=${apiKey}`

    // Convert OpenAI-style messages to Gemini format
    const contents = messages.map((m) => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: callOpts.maxTokens   || 4096,
          temperature:     callOpts.temperature ?? 0.7,
        },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Google Gemini API ${response.status}: ${text.slice(0, 300)}`)
    }

    const data = await response.json()
    return {
      text:     data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      model,
      provider: 'google',
    }
  }

  async complete(messages, callOpts = {}) {
    const provider = callOpts.provider || this._defaultProvider
    switch (provider) {
      case 'claude':  return this._callClaude(messages, callOpts)
      case 'openai':  return this._callOpenAI(messages, callOpts)
      case 'google':  return this._callGoogle(messages, callOpts)
      default:
        throw new Error(`Unknown provider "${provider}". Use "claude", "openai", or "google".`)
    }
  }

  /** callTool is not supported in direct API mode */
  async callTool(toolName) {
    throw new Error(`callTool("${toolName}") is not available in API Mode. Switch to Antigravity Mode.`)
  }
}

// ---------------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------------

/**
 * Create the correct provider based on the current mode.
 *
 * @param {'api'|'antigravity'} mode
 * @param {object} opts
 * @param {Function} opts.keyLoader         — (name) => string|null  (from Electron safeStorage)
 * @param {string}  [opts.mcpServerPath]    — override mcp-server.js path
 * @param {string}  [opts.defaultProvider]  — 'claude'|'openai'|'google'
 * @param {string}  [opts.claudeModel]
 * @param {string}  [opts.openaiModel]
 * @param {string}  [opts.googleModel]
 * @returns {AIProvider}
 */
function createProvider(mode, opts = {}) {
  if (mode === 'antigravity') return new AntigravityProvider(opts)
  return new DirectAPIProvider(opts)
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = { AIProvider, AntigravityProvider, DirectAPIProvider, createProvider }
