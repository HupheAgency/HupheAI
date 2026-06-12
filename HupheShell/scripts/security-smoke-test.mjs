import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const checks = []
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail })
}

const main = read('src/main/index.ts')
const pkg = JSON.parse(read('package.json'))
const safety = read('docs/safety.md')

check('Electron windows do not enable nodeIntegration', !/nodeIntegration:\s*true/.test(main))
check('Electron windows keep contextIsolation enabled', !/contextIsolation:\s*false/.test(main))
check('Electron windows keep webSecurity enabled', !/webSecurity:\s*false/.test(main))
check('No shell-template exec calls remain in main process', !/exec\s*\(\s*`/.test(main))
check('Renderer CSP helper is installed', /function buildRendererCsp\(\)/.test(main) && /installRendererCsp\(mainWindow\)/.test(main))
check('Local assets use custom huphe protocol', /protocol\.registerSchemesAsPrivileged/.test(main) && /protocol\.handle\('huphe'/.test(main))
check('IPC zod dependency is explicit', Boolean(pkg.dependencies?.zod))
check('IPC payload parser exists', /function parseIpcPayload/.test(main) && /z\.object/.test(main))
check('Sensitive IPC routes use payload parsing', [
  'key:set',
  'credits:checkout',
  'image:generate-ai',
  'video:generate-ai',
  'fs:read-file-buffer',
  'project:save',
  'project:load',
  'project:delete',
].every((channel) => main.includes(`parseIpcPayload('${channel}`) || main.includes(`parseIpcPayload('${channel}/`)))
check('Safety document heading is clean', safety.startsWith('# HupheAI Veiligheidsanalyse'))

const failed = checks.filter((item) => !item.pass)
for (const item of checks) {
  const status = item.pass ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
}

if (failed.length) {
  console.error(`\n${failed.length} security smoke check(s) failed.`)
  process.exit(1)
}

console.log('\nSecurity smoke checks passed.')
