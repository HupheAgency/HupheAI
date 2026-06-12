/**
 * ============================================================
 *  HUPHE CODE — MCP Server
 *  src/modules/huphe-code/mcp-server.js
 * ============================================================
 *
 *  Exposes the Huphe Code pipeline as MCP tools so that
 *  Antigravity (or any MCP-compatible client) can invoke them.
 *
 *  Transport: stdio  (Antigravity spawns this process and
 *             communicates over stdin/stdout)
 *
 *  Tools:
 *    run_pipeline       — start a new pipeline task
 *    get_pipeline_status — read current state.json
 *    read_logs          — read pipeline artifact files
 *
 *  Security boundary: only the pipeline/ directory and the
 *  huphe-code module itself are ever read or written.
 *  No other src/modules/* paths are accessible.
 *
 *  Usage (standalone, no Electron):
 *    node src/modules/huphe-code/mcp-server.js
 * ============================================================
 */

'use strict'

const fs   = require('fs')
const path = require('path')

// MCP SDK — stdio transport
const { Server }              = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js')

// ---------------------------------------------------------------------------
//  Path boundaries
//  The MCP server only ever touches PIPELINE_DIR and MODULE_DIR.
//  Any path that escapes these roots is rejected.
// ---------------------------------------------------------------------------

const MODULE_DIR  = __dirname                                       // …/src/modules/huphe-code
const PIPELINE_DIR = path.resolve(MODULE_DIR, '..', '..', '..', 'pipeline')

const STATE_FILE   = path.join(PIPELINE_DIR, 'state.json')
const LOGS_DIR     = path.join(PIPELINE_DIR, 'logs')               // created on demand

// Artifact files the pipeline writes during normal operation
const ARTIFACTS = {
  state:        path.join(PIPELINE_DIR, 'state.json'),
  audit:        path.join(PIPELINE_DIR, 'audit.json'),
  build_output: path.join(PIPELINE_DIR, 'build_output.json'),
  test_log:     path.join(PIPELINE_DIR, 'test_log.json'),
  review:       path.join(PIPELINE_DIR, 'review_status.json'),
}

// ---------------------------------------------------------------------------
//  Security helper: reject any path that escapes the allowed roots
// ---------------------------------------------------------------------------

function assertSafePath(filePath, ...allowedRoots) {
  const resolved = path.resolve(filePath)
  const safe = allowedRoots.some(root => resolved.startsWith(path.resolve(root) + path.sep)
    || resolved === path.resolve(root))
  if (!safe) {
    throw new McpError(ErrorCode.InvalidParams, `Path "${filePath}" is outside the allowed boundary.`)
  }
  return resolved
}

// ---------------------------------------------------------------------------
//  Pipeline helpers (thin wrappers — no chokidar / Electron needed)
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function readState() {
  return readJSON(STATE_FILE) ?? { status: 'IDLE', task: '' }
}

/**
 * Write a state patch and ensure PIPELINE_DIR exists.
 * Mirror of flow-manager.writeState() but without the IPC broadcast
 * (no Electron window in MCP context).
 */
function writeState(patch) {
  fs.mkdirSync(PIPELINE_DIR, { recursive: true })
  const current = readState()
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/**
 * Submit a new task — sets status → AUDITING so the flow-manager
 * (running inside Electron) picks it up via its chokidar watcher.
 */
function submitTask(task, opts = {}) {
  return writeState({
    status:         'AUDITING',
    task,
    patchLoop:      0,
    projectRoot:    opts.projectRoot  ?? '',
    projectPath:    opts.projectPath  ?? opts.projectRoot ?? '',
    screenshotPath: opts.screenshotPath ?? null,
    designSpecPath: opts.designSpecPath ?? null,
    submittedAt:    new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------------
//  Tool implementations
// ---------------------------------------------------------------------------

/**
 * TOOL: run_pipeline
 *
 * Writes AUDITING to state.json.  The flow-manager.js watcher running
 * inside the Electron main process detects the change and executes the
 * full pipeline automatically.  The MCP server itself does not run the
 * AI nodes — it only sets the state trigger.
 */
function tool_run_pipeline({ task, project_path, screenshot_path, design_spec_path }) {
  if (!task || typeof task !== 'string' || !task.trim()) {
    throw new McpError(ErrorCode.InvalidParams, '"task" is required and must be a non-empty string.')
  }

  const state = submitTask(task.trim(), {
    projectPath:    project_path    ?? '',
    screenshotPath: screenshot_path ?? null,
    designSpecPath: design_spec_path ?? null,
  })

  return {
    ok:      true,
    message: `Pipeline started. Status set to AUDITING.`,
    state,
  }
}

/**
 * TOOL: get_pipeline_status
 *
 * Reads state.json and returns the current pipeline state together
 * with a human-readable summary of what each field means.
 */
function tool_get_pipeline_status() {
  const state = readState()

  const statusDescriptions = {
    IDLE:      'Waiting for a new task.',
    AUDITING:  'GLM-4 Auditor is scanning the codebase and producing audit.json.',
    BUILDING:  'Claude Builder is applying code changes based on audit.json.',
    TESTING:   'Operator is running `npm test` in the target project.',
    REVIEWING: 'GPT-4o QA is reviewing the result (optionally with a screenshot).',
    DONE:      'All pipeline nodes completed successfully.',
    FAILED:    'Pipeline stopped due to an error. See the `error` field.',
  }

  return {
    ...state,
    status_description: statusDescriptions[state.status] ?? 'Unknown status.',
  }
}

/**
 * TOOL: read_logs
 *
 * Returns the contents of pipeline artifact files.  Pass a specific
 * artifact name ("state" | "audit" | "build_output" | "test_log" | "review")
 * or omit / pass "all" to get a summary of everything available.
 *
 * If the dedicated logs/ directory exists (future feature), individual
 * log files can be retrieved by task_id.
 */
function tool_read_logs({ artifact = 'all', task_id } = {}) {
  // ── Per-task log file (future-proof) ──────────────────────────────────
  if (task_id) {
    const logFile = path.join(LOGS_DIR, `${task_id}.json`)
    assertSafePath(logFile, LOGS_DIR)
    if (!fs.existsSync(logFile)) {
      return { ok: false, message: `No log file found for task_id "${task_id}".` }
    }
    return { ok: true, task_id, log: readJSON(logFile) }
  }

  // ── Named artifact ────────────────────────────────────────────────────
  if (artifact !== 'all') {
    if (!ARTIFACTS[artifact]) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown artifact "${artifact}". Valid values: ${Object.keys(ARTIFACTS).join(', ')}, all.`
      )
    }
    const filePath = ARTIFACTS[artifact]
    if (!fs.existsSync(filePath)) {
      return { ok: false, artifact, message: `"${artifact}" does not exist yet.` }
    }
    return { ok: true, artifact, data: readJSON(filePath) }
  }

  // ── All artifacts (summary) ───────────────────────────────────────────
  const result = { ok: true, artifacts: {} }
  for (const [name, filePath] of Object.entries(ARTIFACTS)) {
    if (fs.existsSync(filePath)) {
      const data = readJSON(filePath)
      // Avoid sending huge payloads: summarise build_output
      if (name === 'build_output' && data?.files) {
        result.artifacts[name] = {
          fileCount: data.files.length,
          files: data.files.map(f => ({ path: f.path, byteLength: f.content?.length ?? 0 })),
        }
      } else {
        result.artifacts[name] = data
      }
    } else {
      result.artifacts[name] = null
    }
  }
  return result
}

// ---------------------------------------------------------------------------
//  MCP Server wiring
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name:        'run_pipeline',
    description: 'Submit a new task to the Huphe Code pipeline. Sets state to AUDITING so the flow-manager (running in Electron) picks it up automatically. Returns the new state object.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type:        'string',
          description: 'Human-readable description of the code change the pipeline should execute.',
        },
        project_path: {
          type:        'string',
          description: '(Optional) Absolute path to the target project where `npm test` will be run by the Operator node.',
        },
        screenshot_path: {
          type:        'string',
          description: '(Optional) Absolute path to a screenshot PNG/JPEG for the QA node to review.',
        },
        design_spec_path: {
          type:        'string',
          description: '(Optional) Absolute path to a design-spec file for the QA node.',
        },
      },
      required: ['task'],
    },
  },
  {
    name:        'get_pipeline_status',
    description: 'Read the current Huphe Code pipeline state (status, active node, task description, patch loop count, error if any). Useful for polling progress after calling run_pipeline.',
    inputSchema: {
      type:       'object',
      properties: {},
      required:   [],
    },
  },
  {
    name:        'read_logs',
    description: 'Read pipeline artifact files. Pass `artifact` to read a specific file ("state" | "audit" | "build_output" | "test_log" | "review") or omit for a summary of all. Pass `task_id` to read a per-task log file from pipeline/logs/{task_id}.json.',
    inputSchema: {
      type: 'object',
      properties: {
        artifact: {
          type:        'string',
          enum:        ['all', 'state', 'audit', 'build_output', 'test_log', 'review'],
          description: 'Which pipeline artifact to read. Defaults to "all" (summary).',
          default:     'all',
        },
        task_id: {
          type:        'string',
          description: '(Optional) If set, reads pipeline/logs/{task_id}.json instead of the shared artifact files.',
        },
      },
      required: [],
    },
  },
]

async function main() {
  const server = new Server(
    { name: 'huphe-code', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  // ── List tools ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  // ── Call tool ────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    let result
    try {
      switch (name) {
        case 'run_pipeline':
          result = tool_run_pipeline(args)
          break
        case 'get_pipeline_status':
          result = tool_get_pipeline_status()
          break
        case 'read_logs':
          result = tool_read_logs(args)
          break
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: "${name}"`)
      }
    } catch (err) {
      if (err instanceof McpError) throw err
      throw new McpError(ErrorCode.InternalError, err.message)
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  })

  // ── Connect transport ────────────────────────────────────────────────────
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Write startup confirmation to stderr (not stdout — stdout is the MCP channel)
  process.stderr.write(`[huphe-code MCP] Server ready. PIPELINE_DIR=${PIPELINE_DIR}\n`)
}

main().catch(err => {
  process.stderr.write(`[huphe-code MCP] Fatal: ${err.message}\n`)
  process.exit(1)
})
