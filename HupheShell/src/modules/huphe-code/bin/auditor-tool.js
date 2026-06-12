/**
 * HUPHE CODE — Antigravity Tool Bridge (GLM-5 Auditor)
 *
 * This script allows Antigravity to invoke the GLM-5 Auditor node
 * directly from the CLI to perform codebase audits.
 */

'use strict';

const path = require('path');
const flowManager = require('../flow-manager');

async function run() {
  const task = process.argv[2];
  const projectRoot = process.argv[3] || path.resolve(__dirname, '../../../../');

  if (!task) {
    console.error('Usage: node auditor-tool.js "task description" [projectRoot]');
    process.exit(1);
  }

  console.error(`[ANTIGRAVITY TOOL] Starting GLM-5 Audit...`);
  console.error(`[ANTIGRAVITY TOOL] Project Root: ${projectRoot}`);
  console.error(`[ANTIGRAVITY TOOL] Task: "${task}"`);

  try {
    // 1. Build manifest
    const fileManifest = flowManager.buildFileManifest(projectRoot, task);
    console.error(`[ANTIGRAVITY TOOL] Found ${fileManifest.length} relevant files for scoring.`);

    // 2. Build context
    const state = { task, projectRoot };
    const contextPayload = flowManager.buildAuditorContext(state, fileManifest);

    // 3. Call GLM-5
    const auditResult = await flowManager.callGLM5(contextPayload);

    // 4. Validate
    if (!flowManager.isValidAudit(auditResult)) {
      throw new Error('GLM-5 returned an invalid audit schema.');
    }

    // 5. Output JSON to stdout (so Antigravity can read it)
    console.log(JSON.stringify(auditResult, null, 2));
    console.error(`[ANTIGRAVITY TOOL] Audit complete. ${auditResult.dependencyContracts.length} contracts generated.`);

  } catch (err) {
    console.error(`[ANTIGRAVITY TOOL] ERROR: ${err.message}`);
    process.exit(1);
  }
}

run();
