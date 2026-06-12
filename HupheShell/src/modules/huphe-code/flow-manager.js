/**
 * ============================================================
 *  HUPHE CODE — Flow Manager
 *  src/modules/huphe-code/flow-manager.js
 * ============================================================
 *
 *  State-driven pipeline orchestrator that watches pipeline/state.json
 *  and dispatches work to the correct AI node based on the current status.
 *
 *  Pipeline stages (in order):
 *    IDLE        → waiting for a new task
 *    AUDITING    → GLM-5 Auditor scans codebase, produces audit.json
 *    BUILDING    → Claude Builder reads audit.json, writes code diffs
 *    TESTING     → OpenClaw Operator runs tests, produces test_log.json
 *    REVIEWING   → ChatGPT/GPT-5 QA checks UI, produces review_status.json
 *    DONE / FAILED
 *
 *  IPC bridge: when running inside Electron main process, set
 *  global.__hupheCodeIPC = require('electron').ipcMain  (or a mock)
 *  and a BrowserWindow reference via global.__hupheCodeWindow so the
 *  manager can push live status updates to the renderer.
 * ============================================================
 */

'use strict'

const fs      = require('fs')
const path    = require('path')
const chokidar = require('chokidar')
const settingsManager = require('./settings-manager')

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const PIPELINE_DIR  = path.resolve(__dirname, '..', '..', '..', 'pipeline')
const STATE_FILE    = path.join(PIPELINE_DIR, 'state.json')
const AUDIT_FILE    = path.join(PIPELINE_DIR, 'audit.json')
const TEST_LOG_FILE = path.join(PIPELINE_DIR, 'test_log.json')
const REVIEW_FILE   = path.join(PIPELINE_DIR, 'review_status.json')

const MAX_PATCH_LOOPS = 3   // max Builder→Operator retry cycles before FAILED
const DEBOUNCE_MS     = 300 // fs debounce to avoid double-fires

// ---------------------------------------------------------------------------
//  Ensure pipeline directory exists
// ---------------------------------------------------------------------------

fs.mkdirSync(PIPELINE_DIR, { recursive: true })

// ---------------------------------------------------------------------------
//  State helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse state.json.
 * @returns {object} Parsed state object, or null on error.
 */
function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Atomically write a new state.json.
 * @param {object} patch  Fields to merge into the current state.
 */
function writeState(patch) {
  const current = readState() || {}
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8')
  broadcastState(next)
}

// ---------------------------------------------------------------------------
//  Electron IPC bridge (optional — works in standalone Node.js too)
// ---------------------------------------------------------------------------

/**
 * Push a state update to the Electron renderer via IPC.
 * Only active when __hupheCodeWindow is set in the global scope
 * by the Electron main process.
 * @param {object} state
 */
function broadcastState(state) {
  try {
    const win = global.__hupheCodeWindow
    if (win && !win.isDestroyed()) {
      win.webContents.send('huphe-code:state-update', state)
    }
  } catch (e) {
    // Renderer might not be ready — silently ignore
  }
}

/**
 * Log a pipeline event and broadcast it to the renderer.
 * @param {string} tag  Short label, e.g. '[AUDITOR]'
 * @param {string} msg
 */
function log(tag, msg) {
  const ts = new Date().toISOString()
  const line = `${ts} ${tag} ${msg}`
  console.log(line)
  try {
    const win = global.__hupheCodeWindow
    if (win && !win.isDestroyed()) {
      win.webContents.send('huphe-code:log', { ts, tag, msg })
    }
  } catch {}
}

// ---------------------------------------------------------------------------
//  JSON read helpers
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  Node: AUDITOR (GLM-5)
//
//  Receives the full app "state" + user instruction.
//  Scans the relevant portion of the codebase.
//  Writes audit.json with Dependency Contracts.
// ---------------------------------------------------------------------------

async function runAuditorNode(state) {
  log('[AUDITOR]', `Starting audit for task: "${state.task}"`)
  writeState({ status: 'AUDITING', currentNode: 'GLM-5 Auditor' })

  // 1. Collect the minimal file manifest
  const projectRoot = state.projectRoot || path.resolve(__dirname, '..', '..', '..')
  const fileManifest = buildFileManifest(projectRoot, state.task)

  // 2. Build a token-minimal context payload for GLM-5
  //    GLM-5 ONLY receives: task description + file list + targeted snippets
  const contextPayload = buildAuditorContext(state, fileManifest)

  // 3. Call GLM-5 API
  let auditResult
  try {
    auditResult = await callGLM5(contextPayload)
  } catch (err) {
    log('[AUDITOR]', `GLM-5 call failed: ${err.message}`)
    writeState({ status: 'FAILED', error: `Auditor failed: ${err.message}` })
    return
  }

  // 4. Validate & persist audit.json
  if (!isValidAudit(auditResult)) {
    log('[AUDITOR]', 'Invalid audit.json schema returned by GLM-5')
    writeState({ status: 'FAILED', error: 'Auditor returned invalid schema.' })
    return
  }

  fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditResult, null, 2), 'utf8')
  log('[AUDITOR]', `audit.json written — ${auditResult.dependencyContracts.length} contracts`)

  // 5. Advance to BUILDING
  writeState({ status: 'BUILDING', patchLoop: 0 })
}

// ---------------------------------------------------------------------------
//  Node: BUILDER (Claude Opus)
//
//  Reads audit.json + only the code snippets flagged as critical.
//  Produces diffs/files and writes them to pipeline/build_output.json.
// ---------------------------------------------------------------------------

async function runBuilderNode(state) {
  const patchLoop = state.patchLoop || 0
  log('[BUILDER]', `Starting build (patch loop ${patchLoop})`)
  writeState({ status: 'BUILDING', currentNode: 'Claude Builder' })

  // 1. Load audit.json
  const audit = readJSON(AUDIT_FILE)
  if (!audit) {
    writeState({ status: 'FAILED', error: 'Builder: audit.json missing or corrupt.' })
    return
  }

  // 2. Hydrate only the critical snippets identified by the Auditor
  const criticalSnippets = hydrateCriticalSnippets(audit)

  // 3. Build a payload FOR Claude.
  //    Includes the full current content of every flagged file so Claude
  //    knows exactly what it is modifying.
  const projectRoot = state.projectRoot || path.resolve(__dirname, '..', '..', '..')
  const builderPayload = {
    task:                state.task,
    projectRoot,
    dependencyContracts: audit.dependencyContracts,
    criticalSnippets,
    ...(state.testLog ? { patchContext: state.testLog } : {}),
  }

  // 4. Call Claude API
  let buildOutput
  try {
    buildOutput = await callClaude(builderPayload)
  } catch (err) {
    log('[BUILDER]', `Claude call failed: ${err.message}`)
    writeState({ status: 'FAILED', error: `Builder failed: ${err.message}` })
    return
  }

  // 5. Apply the diffs to the filesystem
  try {
    applyBuildOutput(buildOutput, state.projectRoot)
    log('[BUILDER]', `${buildOutput.files.length} file(s) written`)
  } catch (err) {
    log('[BUILDER]', `Applying diffs failed: ${err.message}`)
    writeState({ status: 'FAILED', error: `Builder apply failed: ${err.message}` })
    return
  }

  // 6. Persist build output for downstream nodes
  const buildFile = path.join(PIPELINE_DIR, 'build_output.json')
  fs.writeFileSync(buildFile, JSON.stringify(buildOutput, null, 2), 'utf8')

  // 7. Advance to TESTING
  writeState({ status: 'TESTING' })
}

// ---------------------------------------------------------------------------
//  Node: OPERATOR (OpenClaw)
//
//  Runs automated tests.
//  Writes test_log.json.
//  On failure: loops back to Builder (up to MAX_PATCH_LOOPS).
// ---------------------------------------------------------------------------

async function runOperatorNode(state) {
  log('[OPERATOR]', 'Starting test run')
  writeState({ status: 'TESTING', currentNode: 'Operator (npm test)' })

  const buildOutput = readJSON(path.join(PIPELINE_DIR, 'build_output.json'))
  const projectPath = state.projectPath || state.projectRoot || ''

  let testLog
  try {
    testLog = await runLocalTests({
      projectPath,
      modifiedFiles: buildOutput ? buildOutput.files.map(f => f.path) : [],
    })
  } catch (err) {
    log('[OPERATOR]', `Test runner failed: ${err.message}`)
    writeState({ status: 'FAILED', error: `Operator failed: ${err.message}` })
    return
  }

  fs.writeFileSync(TEST_LOG_FILE, JSON.stringify(testLog, null, 2), 'utf8')
  log('[OPERATOR]', `test_log.json written — passed: ${testLog.passed}`)

  if (!testLog.passed) {
    const patchLoop = (state.patchLoop || 0) + 1
    if (patchLoop > MAX_PATCH_LOOPS) {
      log('[OPERATOR]', `Max patch loops (${MAX_PATCH_LOOPS}) reached — FAILED`)
      writeState({ status: 'FAILED', error: 'Max patch loops exceeded.', testLog })
      return
    }
    log('[OPERATOR]', `Tests failed — looping back to Builder (attempt ${patchLoop})`)
    // Send only the stderr/stdout summary — not the full output
    writeState({
      status: 'BUILDING',
      patchLoop,
      testLog: { exitCode: testLog.exitCode, stderr: testLog.stderr.slice(0, 2000) },
    })
    return
  }

  writeState({ status: 'REVIEWING', testLog: null })
}

// ---------------------------------------------------------------------------
//  Node: QA & DESIGN (ChatGPT / GPT-5)
//
//  Receives a screenshot + original task/design spec.
//  Returns review_status.json.
//  On failure: triggers a targeted correction prompt back to Builder.
// ---------------------------------------------------------------------------

const MAX_QA_LOOPS = 2

async function runQANode(state) {
  log('[QA]', 'Starting visual review')
  writeState({ status: 'REVIEWING', currentNode: 'ChatGPT QA' })

  // Without a screenshot there is nothing to visually compare — auto-approve.
  if (!state.screenshotPath) {
    log('[QA]', 'No screenshot provided — auto-approving and marking DONE')
    writeState({ status: 'DONE' })
    return
  }

  // The QA node receives ONLY visual artifacts + the task spec
  // Never source code — pixel-perfect comparison only
  const qaPayload = {
    task:           state.task,
    screenshotPath: state.screenshotPath,
    designSpecPath: state.designSpecPath || null,
  }

  let reviewStatus
  try {
    reviewStatus = await callGPT5QA(qaPayload)
  } catch (err) {
    log('[QA]', `GPT-5 QA call failed: ${err.message}`)
    writeState({ status: 'FAILED', error: `QA failed: ${err.message}` })
    return
  }

  fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewStatus, null, 2), 'utf8')
  log('[QA]', `review_status.json written — approved: ${reviewStatus.approved}`)

  if (!reviewStatus.approved) {
    const qaLoop = (state.qaLoop || 0) + 1
    if (qaLoop > MAX_QA_LOOPS) {
      log('[QA]', `Max QA loops (${MAX_QA_LOOPS}) reached — forcing DONE`)
      writeState({ status: 'DONE' })
      return
    }
    log('[QA]', `Visual deviations detected — QA correction loop ${qaLoop}/${MAX_QA_LOOPS}`)
    writeState({
      status:  'BUILDING',
      qaLoop,
      task:    reviewStatus.correctionPrompt || state.task,
    })
    return
  }

  writeState({ status: 'DONE' })
  log('[QA]', '✅ Pipeline complete — all nodes passed')
}

// ---------------------------------------------------------------------------
//  File manifest builder
//  Produces a lightweight map of {path, exports, interfaces} for GLM-5.
//  Uses static analysis — no AST: just regex over TypeScript/JS exports.
// ---------------------------------------------------------------------------

function buildFileManifest(projectRoot, task) {
  const relevant = []
  const srcDir = path.join(projectRoot, 'src')
  if (!fs.existsSync(srcDir)) return relevant

  collectFiles(srcDir, ['.ts', '.tsx', '.js', '.jsx'], relevant)

  // Score relevance of each file against keywords in the task
  const keywords = extractKeywords(task)
  return relevant
    .map(filePath => ({
      path:       path.relative(projectRoot, filePath),
      absPath:    filePath,
      relevance:  scoreFileRelevance(filePath, keywords),
      exports:    extractExports(filePath),
    }))
    .filter(f => f.relevance > 0 || f.exports.length > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 30) // hard cap: max 30 files sent to auditor
}

function collectFiles(dir, exts, results) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !['node_modules', '.git', 'out', 'dist'].includes(entry.name)) {
        collectFiles(full, exts, results)
      } else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) {
        results.push(full)
      }
    }
  } catch {}
}

function extractKeywords(task) {
  return task
    .toLowerCase()
    .split(/[\s,.(\)[\]{};:]+/)
    .filter(w => w.length > 3)
}

function scoreFileRelevance(filePath, keywords) {
  const lower = filePath.toLowerCase()
  return keywords.filter(k => lower.includes(k)).length
}

function extractExports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const exports = []
    // Match: export function Foo, export const bar, export class Baz, export type T, export interface I
    const regex = /^export\s+(default\s+)?(function|const|class|type|interface|enum)\s+(\w+)/gm
    let m
    while ((m = regex.exec(content)) !== null) {
      exports.push(m[3])
    }
    // Match: export { foo, bar }
    const namedRegex = /^export\s+\{([^}]+)\}/gm
    while ((m = namedRegex.exec(content)) !== null) {
      m[1].split(',').forEach(n => {
        const name = n.trim().split(/\s+as\s+/).pop().trim()
        if (name) exports.push(name)
      })
    }
    return [...new Set(exports)]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
//  Context payload builder for the Auditor node
// ---------------------------------------------------------------------------

function buildAuditorContext(state, fileManifest) {
  return {
    // ONLY what GLM-5 needs to determine dependency impact
    task:       state.task,
    appState:   stripAppState(state),
    fileMap:    fileManifest.map(f => ({
      path:    f.path,
      exports: f.exports,
      // Note: NO full source code — just exports and path
    })),
    instructions: [
      'You are the Auditor node in the Huphe Code pipeline.',
      'Your output MUST be a valid audit.json following the Dependency Contract schema.',
      'List ONLY the files that the Builder node must read to complete the task.',
      'For each file, specify exactly which exported names are required.',
      'Do NOT include full source code snippets — only export names and interfaces.',
      'Token efficiency is critical. Every unnecessary file = wasted build tokens.',
    ],
  }
}

/**
 * Strip sensitive/large keys from app state before sending to any AI node.
 */
function stripAppState(state) {
  const { task, projectRoot, screenshotPath, designSpecPath, status, patchLoop, updatedAt } = state
  return { task, projectRoot, screenshotPath, designSpecPath, status, patchLoop, updatedAt }
}

// ---------------------------------------------------------------------------
//  Critical snippet hydrator
//  Reads ONLY the exports/interfaces that GLM-5 flagged as required.
// ---------------------------------------------------------------------------

function hydrateCriticalSnippets(audit) {
  const snippets = {}
  for (const contract of audit.dependencyContracts) {
    if (!contract.requiredExports || contract.requiredExports.length === 0) continue
    try {
      const content = fs.readFileSync(contract.absPath, 'utf8')
      snippets[contract.path] = extractNamedExportBodies(content, contract.requiredExports)
    } catch {
      snippets[contract.path] = '// [File not readable]'
    }
  }
  return snippets
}

/**
 * Extract only the body of named exports from a source file.
 * This keeps Claude's context surgical — it sees only what it needs.
 */
function extractNamedExportBodies(source, names) {
  const lines = source.split('\n')
  const result = []
  const nameSet = new Set(names)

  let capturing = false
  let braceDepth = 0
  let buffer = []

  for (const line of lines) {
    const exportMatch = line.match(/^export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)/)
    if (exportMatch && nameSet.has(exportMatch[1])) {
      capturing = true
      braceDepth = 0
      buffer = []
    }

    if (capturing) {
      buffer.push(line)
      for (const ch of line) {
        if (ch === '{') braceDepth++
        else if (ch === '}') braceDepth--
      }
      if (braceDepth === 0 && buffer.length > 1) {
        result.push(buffer.join('\n'))
        capturing = false
        buffer = []
      }
    }
  }
  return result.join('\n\n')
}

// ---------------------------------------------------------------------------
//  Audit schema validator
// ---------------------------------------------------------------------------

function isValidAudit(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.auditId === 'string' &&
    typeof obj.task === 'string' &&
    Array.isArray(obj.dependencyContracts) &&
    obj.dependencyContracts.every(c =>
      typeof c.path === 'string' &&
      Array.isArray(c.requiredExports)
    )
  )
}

// ---------------------------------------------------------------------------
//  Build output applier — writes files from Claude's diff output
// ---------------------------------------------------------------------------

function applyBuildOutput(buildOutput, projectRoot) {
  const root = projectRoot || path.resolve(__dirname, '..', '..', '..')
  for (const file of buildOutput.files || []) {
    const absPath = path.join(root, file.path)
    fs.mkdirSync(path.dirname(absPath), { recursive: true })
    fs.writeFileSync(absPath, file.content, 'utf8')
  }
}

// ---------------------------------------------------------------------------
//  AI API adapters
//  These are thin wrappers — swap out the HTTP calls for your actual clients.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Node Adapters — Real API implementations
// ---------------------------------------------------------------------------

/**
 * AUDITOR — GLM-4 via lokale Ollama API
 * Ollama draait op http://localhost:11434.
 * Geen API key nodig.
 */
async function callGLM5(payload) {
  if (isMockMode()) return mockGLM5(payload)

  const systemPrompt = [
    ...payload.instructions,
    '',
    'Respond ONLY with valid JSON in this exact schema, no other text:',
    '{',
    '  "auditId": "<unique string>",',
    '  "task": "<the task description>",',
    '  "dependencyContracts": [',
    '    { "path": "<file path>", "requiredExports": ["<export name>"] }',
    '  ]',
    '}',
    'Do NOT wrap the JSON in markdown code fences. Do NOT add any explanation before or after the JSON.',
  ].join('\n')

  const userContent = JSON.stringify({
    task:     payload.task,
    appState: payload.appState,
    fileMap:  payload.fileMap,
  })

  let response
  try {
    response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    'glm4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent },
        ],
        stream: false,
      }),
    })
  } catch (err) {
    throw new Error(`Ollama niet bereikbaar op localhost:11434 — is Ollama actief? (${err.message})`)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Ollama/GLM-4 ${response.status}: ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  const raw = data.message?.content
  if (!raw) throw new Error('Ollama/GLM-4: lege response — controleer of het glm4 model geladen is')

  console.log('[AUDITOR] Raw GLM4 response:', raw)

  // Strip optional markdown code fence if the model wraps JSON in ```json ... ```
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  console.log('[AUDITOR] Cleaned:', cleaned)

  const expectedSchema = {
    auditId:              'string',
    task:                 'string',
    dependencyContracts:  'Array<{ path: string, requiredExports: string[] }>',
  }
  console.log('[AUDITOR] Expected schema:', JSON.stringify(expectedSchema))

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Ollama/GLM-4: response is geen geldig JSON: ${cleaned.slice(0, 200)}`)
  }

  console.log('[AUDITOR] Parsed top-level keys:', Object.keys(parsed))

  // Fallback: GLM4 sometimes returns { fileMap: [...] } instead of the expected schema.
  // Normalise it so the pipeline doesn't fail on a schema mismatch.
  if (!parsed.dependencyContracts && parsed.fileMap) {
    console.log('[AUDITOR] Fallback: mapping fileMap → dependencyContracts')
    parsed.dependencyContracts = parsed.fileMap.map(f => ({
      path:            f.path ?? f,
      requiredExports: f.exports ?? f.requiredExports ?? [],
    }))
  }
  if (!parsed.auditId) parsed.auditId = `audit_${Date.now()}`
  if (!parsed.task)    parsed.task    = payload.task

  return parsed
}

/**
 * BUILDER — entry point
 * Routes to CLI (Antigravity mode) or Anthropic API (direct mode).
 */
const CLAUDE_BIN         = '/Users/tom.zwarts/.local/bin/claude'
const BUILDER_TIMEOUT_MS = 5 * 60 * 1000

function builderPrompt(payload) {
  const { task, projectRoot, dependencyContracts = [], criticalSnippets = {}, patchContext } = payload

  // Read the full current content of every flagged file from disk.
  // This gives Claude the exact text it must modify — no guessing required.
  const fileSections = dependencyContracts.map(contract => {
    const absPath = path.isAbsolute(contract.path)
      ? contract.path
      : path.join(projectRoot || '', contract.path)

    let currentContent
    try {
      currentContent = fs.readFileSync(absPath, 'utf8')
    } catch {
      currentContent = '// [File does not exist yet — create it]'
    }

    return [
      `=== FILE: ${contract.path} ===`,
      `Absolute path: ${absPath}`,
      `Required exports to implement/modify: ${(contract.requiredExports || []).join(', ') || '(none specified)'}`,
      '--- CURRENT CONTENT ---',
      currentContent,
      '--- END OF FILE ---',
    ].join('\n')
  })

  const lines = [
    'You are the Builder node in the Huphe Code pipeline.',
    '',
    'TASK:',
    task,
    '',
    'PROJECT ROOT:',
    projectRoot || '(unknown)',
    '',
    'OUTPUT FORMAT — respond with ONLY this JSON object, no other text:',
    '{',
    '  "files": [',
    '    { "path": "<relative path from project root>", "content": "<FULL file content after your changes>" }',
    '  ]',
    '}',
    '',
    'RULES:',
    '- Output the COMPLETE file content, not a diff or partial snippet.',
    '- Use the exact relative path shown in the === FILE: ... === header.',
    '- Write minimal, surgical changes — only what is needed for the task.',
    '- Never hallucinate imports or dependencies that are not already in the file.',
    '- Do NOT wrap the JSON in markdown code fences.',
    '- Do NOT add explanation before or after the JSON.',
  ]

  if (fileSections.length > 0) {
    lines.push('', '=== FILES TO MODIFY ===', ...fileSections)
  }

  if (Object.keys(criticalSnippets).length > 0) {
    lines.push('', '=== CRITICAL SNIPPETS (focused context) ===')
    for (const [filePath, snippet] of Object.entries(criticalSnippets)) {
      lines.push(`--- ${filePath} ---`, snippet)
    }
  }

  if (patchContext) {
    lines.push(
      '',
      '=== PREVIOUS TEST FAILURE (patch this) ===',
      typeof patchContext === 'string' ? patchContext : JSON.stringify(patchContext, null, 2),
    )
  }

  return lines.join('\n')
}

async function callClaude(payload) {
  if (isMockMode()) return mockClaude(payload)
  return isAntigravityMode()
    ? callClaudeViaCLI(payload)
    : callClaudeViaAPI(payload)
}

/**
 * BUILDER — Antigravity route
 * Spawns the local Claude Code CLI binary via child_process.
 * No API key required — uses the local subscription via the CLI.
 */
function callClaudeViaCLI(payload) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const prompt = builderPrompt(payload)

    log('[BUILDER]', `[CLI] Spawning Claude Code CLI: ${CLAUDE_BIN}`)

    let child
    try {
      child = spawn(CLAUDE_BIN, ['--print', '--output-format', 'text'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   { ...process.env },
      })
    } catch (err) {
      return reject(new Error(`Claude Code CLI spawn mislukt: ${err.message}`))
    }

    try {
      child.stdin.write(prompt)
      child.stdin.end()
    } catch (err) {
      return reject(new Error(`Claude Code CLI stdin schrijven mislukt: ${err.message}`))
    }

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => {
      const line = chunk.toString().replace(/\x1B\[[0-9;]*m/g, '').trim()
      if (line) {
        stderr += line + '\n'
        log('[BUILDER]', `[stderr] ${line}`)
      }
    })

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch {}
      reject(new Error('Claude Code CLI timed out na 5 minuten'))
    }, BUILDER_TIMEOUT_MS)

    child.on('error', err => {
      clearTimeout(timer)
      reject(new Error(`Claude Code CLI fout: ${err.message}`))
    })

    child.on('close', code => {
      clearTimeout(timer)

      if (!stdout.trim()) {
        return reject(new Error(
          `Claude Code CLI gaf geen output (exit ${code}). Stderr: ${stderr.slice(0, 300)}`
        ))
      }

      log('[BUILDER]', `[CLI] klaar (exit ${code}), output: ${stdout.length} tekens`)
      console.log('[BUILDER] Raw CLI output:', stdout)

      const cleaned = stdout.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

      try {
        resolve(JSON.parse(cleaned))
      } catch {
        reject(new Error(`Claude Code CLI output is geen geldig JSON: ${cleaned.slice(0, 300)}`))
      }
    })
  })
}

/**
 * BUILDER — API route
 * Calls the Anthropic Messages API directly with the stored claude API key.
 * Active when Antigravity mode is disabled.
 */
async function callClaudeViaAPI(payload) {
  const apiKey = getAPIKey('claude')
  const prompt = builderPrompt(payload)

  log('[BUILDER]', '[API] Calling Anthropic Messages API (claude-opus-4-6)…')

  const https = require('https')
  const body = JSON.stringify({
    model:      'claude-opus-4-6',
    max_tokens: 8192,
    messages:   [{ role: 'user', content: prompt }],
  })

  const raw = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length':    Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve(data))
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })

  let parsed
  try { parsed = JSON.parse(raw) } catch {
    throw new Error(`Anthropic API: ongeldig JSON antwoord: ${raw.slice(0, 200)}`)
  }

  if (parsed.error) {
    throw new Error(`Anthropic API fout: ${parsed.error.message ?? JSON.stringify(parsed.error)}`)
  }

  const text = parsed.content?.[0]?.text
  if (!text) throw new Error(`Anthropic API: leeg antwoord (geen content[0].text)`)

  log('[BUILDER]', `[API] Antwoord ontvangen (${text.length} tekens)`)
  console.log('[BUILDER] Raw API output:', text)

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error(`Anthropic API output is geen geldig JSON: ${cleaned.slice(0, 300)}`)
  }
}

/**
 * OPERATOR — Local child_process
 * Runs `npm test` in the project directory.
 * No external API. Exit code 0 = passed.
 */
function runLocalTests({ projectPath, modifiedFiles }) {
  return new Promise((resolve, reject) => {
    if (isMockMode()) return resolve(mockOpenClaw({ modifiedFiles }))

    if (!projectPath || !fs.existsSync(projectPath)) {
      return reject(new Error(
        `Project path "${projectPath}" does not exist. Set it in Huphe Code settings.`
      ))
    }

    log('[OPERATOR]', `Running npm test in: ${projectPath}`)

    const { spawn } = require('child_process')
    const proc = spawn('npm', ['test'], {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', chunk => {
      const line = chunk.toString()
      stdout += line
      log('[OPERATOR]', line.trimEnd())
    })
    proc.stderr.on('data', chunk => {
      const line = chunk.toString()
      stderr += line
      log('[OPERATOR]', `[stderr] ${line.trimEnd()}`)
    })

    proc.on('close', exitCode => {
      const passed = exitCode === 0
      resolve({
        passed,
        exitCode,
        stdout: stdout.slice(-4000),  // last 4k chars
        stderr: stderr.slice(-2000),
        modifiedFiles,
        ranAt: new Date().toISOString(),
      })
    })

    proc.on('error', err => reject(err))

    // Safety timeout: 3 minutes
    setTimeout(() => {
      proc.kill()
      reject(new Error('npm test timed out after 3 minutes'))
    }, 180_000)
  })
}

/**
 * QA & DESIGN — GPT-4o Vision via OpenAI
 * Receives screenshot as base64 + task description.
 * Returns { approved, feedback, correctionPrompt }.
 */
async function callGPT5QA(payload) {
  if (isMockMode()) return mockGPT5QA(payload)
  const apiKey = getAPIKey('openai')

  const userContent = [
    {
      type: 'text',
      text: [
        `Task: ${payload.task}`,
        '',
        'Review the screenshot and determine if the UI matches the task description.',
        'Return ONLY a JSON object with these exact keys:',
        '  { "approved": boolean, "feedback": string, "correctionPrompt": string }',
        '- approved: true if the implementation looks correct, false if there are visible issues.',
        '- feedback: concise description of what you see.',
        '- correctionPrompt: if not approved, an actionable instruction for the Builder node. Empty string if approved.',
      ].join('\n'),
    },
  ]

  // Attach screenshot if available
  if (payload.screenshotPath && fs.existsSync(payload.screenshotPath)) {
    const ext = payload.screenshotPath.split('.').pop()?.toLowerCase() || 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    const b64 = fs.readFileSync(payload.screenshotPath).toString('base64')
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' },
    })
    log('[QA]', `Screenshot attached: ${payload.screenshotPath}`)
  } else {
    log('[QA]', 'No screenshot provided — text-only QA review')
    userContent[0].text += '\n\n[No screenshot provided. Approve based on task description only.]'
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are the QA & Design node in the Huphe Code AI pipeline. You review UI screenshots and return structured JSON feedback. Never include markdown or explanation outside the JSON.',
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GPT-4o QA ${response.status}: ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) throw new Error('GPT-4o: empty response')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`GPT-4o: response is not valid JSON: ${raw.slice(0, 200)}`)
  }
}

// ---------------------------------------------------------------------------
//  API key resolver
//  In Electron: reads from safeStorage (via encrypted .enc files in userData).
//  In standalone Node: reads from environment variables.
// ---------------------------------------------------------------------------

/**
 * DEV MOCK MODE
 * Controlled via the "Test modus" toggle in Huphe Code → Instellingen.
 * Writes { "mockMode": true/false } to userData/huphe-code-config.json.
 * Reads the config on every pipeline run so the toggle takes effect immediately.
 * Fallback: HUPHE_CODE_MOCK env var still works for CI / headless usage.
 */

// Config path is set once when start() is called via global.__hupheCodeConfigPath.
// Falls back to a sibling userData path for standalone Node usage.
const os = require('os')
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'HupheAI', 'huphe-code-config.json')

function isMockMode() {
  // Environment variable override (CI / legacy)
  if (process.env.HUPHE_CODE_MOCK === 'true' || process.env.HUPHE_CODE_MOCK === '1') return true

  // Read from config file (set by Electron userData path via global bridge)
  const configPath = global.__hupheCodeConfigPath || DEFAULT_CONFIG_PATH
  try {
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      return !!cfg.mockMode
    }
  } catch {}
  return false
}

/**
 * Returns true when the user has enabled Antigravity mode in Settings.
 * Reads live from huphe-settings.json on every call so the toggle takes
 * effect immediately without restarting the pipeline.
 */
function isAntigravityMode() {
  return settingsManager.getMode() === 'antigravity'
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function mockGLM5(payload) {
  log('[AUDITOR]', '🧪 Mock mode — simulating GLM-5 audit (2s)…')
  await delay(2000)
  const files = payload.fileMap.slice(0, 4)
  return {
    auditId: `audit_mock_${Date.now()}`,
    task: payload.task,
    createdAt: new Date().toISOString(),
    auditorModel: 'glm-4-mock',
    impactScope: {
      level: 'MODERATE',
      description: '[MOCK] Simulated impact scope voor test-run',
      touchedLayers: ['renderer', 'preload'],
    },
    dependencyContracts: files.map((f, i) => ({
      contractId: `dc_mock_${i + 1}`,
      path: f.path,
      absPath: '',
      role: i === 0 ? 'MODIFY' : 'READ_ONLY',
      priority: i < 2 ? 'CRITICAL' : 'MEDIUM',
      reason: `[MOCK] Gesimuleerd contract voor ${f.path}`,
      requiredExports: f.exports.slice(0, 3),
      requiredInterfaces: [],
      requiredTypes: [],
    })),
    excludedFiles: payload.fileMap.slice(4).map(f => ({
      path: f.path,
      reason: '[MOCK] Niet relevant voor de gesimuleerde taak',
    })),
    tokenBudget: {
      estimatedContextTokens: 3200,
      maxAllowed: 8000,
      filesExcluded: payload.fileMap.length - 4,
      filesIncluded: 4,
      savingsPercent: Math.round((1 - 4 / Math.max(payload.fileMap.length, 1)) * 100),
    },
    riskFlags: [{ level: 'LOW', message: '[MOCK] Dit is een gesimuleerde test-run — geen echte code gewijzigd' }],
  }
}

async function mockClaude(payload) {
  log('[BUILDER]', '🧪 Mock mode — simulating Claude build (3s)…')
  await delay(3000)
  return {
    files: [
      {
        path: 'pipeline/mock_output.txt',
        content: `// [MOCK BUILD OUTPUT]\n// Task: ${payload.task}\n// Generated at: ${new Date().toISOString()}\n// This is a simulated build result — no real code was written.\nconsole.log("Huphe Code mock build complete")\n`,
      },
    ],
  }
}

async function mockOpenClaw(payload) {
  log('[OPERATOR]', '🧪 Mock mode — simulating OpenClaw tests (2s)…')
  await delay(2000)
  return {
    passed: true,
    duration: 1847,
    totalTests: 12,
    passedTests: 12,
    failures: [],
    summary: '[MOCK] Alle 12 tests geslaagd (gesimuleerd)',
    modifiedFiles: payload.modifiedFiles,
  }
}

async function mockGPT5QA(payload) {
  log('[QA]', '🧪 Mock mode — simulating GPT-5 visual review (2s)…')
  await delay(2000)
  return {
    approved: true,
    deviations: [],
    correctionPrompt: '',
    summary: '[MOCK] UI ziet er pixel-perfect uit (gesimuleerd — geen screenshot geanalyseerd)',
  }
}

function getAPIKey(name) {
  // In mock mode: keys are not needed
  if (isMockMode()) return 'MOCK_KEY'

  // Try env first (CI / dev override)
  const envMap = {
    claude: 'ANTHROPIC_API_KEY',  // Builder (API route)
    openai: 'OPENAI_API_KEY',     // QA (GPT-4o)
  }
  if (process.env[envMap[name]]) return process.env[envMap[name]]

  // Try Electron safeStorage via global bridge
  const loader = global.__hupheCodeKeyLoader
  if (loader) {
    const key = loader(name)
    if (key) return key
  }

  throw new Error(`API key for "${name}" not configured. Set it in Huphe Code → Settings.`)
}

// ---------------------------------------------------------------------------
//  Pipeline dispatcher
//  Called every time state.json changes.
// ---------------------------------------------------------------------------

// Guard: prevent concurrent/duplicate dispatch when a node writes state
// (e.g. `writeState({ status: 'AUDITING', currentNode: '…' })` at the start
// of runAuditorNode triggers another chokidar change event for the same status).
// isRunning is set to false in the finally block before the next chokidar
// event can fire (debounce is 300 ms + awaitWriteFinish 100 ms = ~450 ms,
// always longer than the synchronous return of any node function).
let isRunning = false

async function dispatch(state) {
  if (!state || !state.status) return
  if (isRunning) {
    log('[PIPELINE]', `[guard] Pipeline already running — skipping duplicate ${state.status} trigger`)
    return
  }

  isRunning = true
  try {
    switch (state.status) {
      case 'AUDITING':  return await runAuditorNode(state)
      case 'BUILDING':  return await runBuilderNode(state)
      case 'TESTING':   return await runOperatorNode(state)
      case 'REVIEWING': return await runQANode(state)
      case 'DONE':
        log('[PIPELINE]', '✅ Pipeline complete')
        return
      case 'FAILED':
        log('[PIPELINE]', `❌ Pipeline failed: ${state.error}`)
        return
      // IDLE — do nothing, wait for a new task
    }
  } catch (err) {
    log('[PIPELINE]', `Unhandled dispatch error: ${err.message}`)
    writeState({ status: 'FAILED', error: err.message })
  } finally {
    isRunning = false
  }
}

// ---------------------------------------------------------------------------
//  Watcher bootstrap
// ---------------------------------------------------------------------------

let dispatchTimer = null

function onStateChange() {
  // Debounce to avoid double-fires from atomic writes
  clearTimeout(dispatchTimer)
  dispatchTimer = setTimeout(() => {
    const state = readState()
    dispatch(state)
  }, DEBOUNCE_MS)
}

/**
 * Start the flow manager.
 * Call this from the Electron main process after app.whenReady().
 *
 * @param {object} [opts]
 * @param {BrowserWindow} [opts.window]  Electron BrowserWindow for IPC broadcasts.
 * @param {Function}      [opts.keyLoader] fn(name) → string|null for safe API key loading.
 * @returns {FSWatcher} chokidar watcher (call .close() to stop).
 */
function start(opts = {}) {
  if (opts.window)     global.__hupheCodeWindow     = opts.window
  if (opts.keyLoader)  global.__hupheCodeKeyLoader  = opts.keyLoader
  if (opts.configPath) global.__hupheCodeConfigPath = opts.configPath

  // Ensure a default IDLE state exists
  if (!fs.existsSync(STATE_FILE)) {
    writeState({ status: 'IDLE', task: '', patchLoop: 0, projectRoot: opts.projectRoot || '' })
  }

  log('[PIPELINE]', `Flow manager started — watching ${STATE_FILE}`)

  const watcher = chokidar.watch(STATE_FILE, {
    persistent:  true,
    ignoreInitial: true,  // don't re-dispatch on startup; only react to live writes
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher.on('change', onStateChange)

  return watcher
}

/**
 * Convenience: write a new task and kick off the pipeline from AUDITING.
 * @param {string} task  Human-readable instruction for the AI pipeline.
 * @param {object} [opts]
 */
function submitTask(task, opts = {}) {
  writeState({
    status:         'AUDITING',
    task,
    patchLoop:      0,
    projectRoot:    opts.projectRoot || '',
    projectPath:    opts.projectPath || opts.projectRoot || '',
    screenshotPath: opts.screenshotPath || null,
    designSpecPath: opts.designSpecPath || null,
    submittedAt:    new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = {
  start,
  submitTask,
  writeState,
  readState,
  PIPELINE_DIR,
  // Exported for Antigravity tool activation:
  buildFileManifest,
  buildAuditorContext,
  callGLM5,
  isValidAudit,
}
