/** Real Electron UI + local media. Provider calls are replaced with a local fixture. */
import { build } from 'esbuild'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const rifeOnly = !!process.env.TEST_RIFE_ONLY
const runId = String(Date.now())
const work = join(root, '.local', rifeOnly ? 'rife-timeline-ui' : 'timeline-ui-smoke')
await mkdir(work, { recursive: true })
const fixtureDir = join(root, '.local', 'video-timeline-fixtures')
if (!rifeOnly) await readFile(join(fixtureDir, 'manifest.json'))
await writeFile(join(work, 'index.html'), '<html><head><style>html,body,#root{margin:0;width:100%;height:100%}</style></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>')
await writeFile(join(work, 'entry.tsx'), rifeOnly
  ? `import React from 'react'; import {createRoot} from 'react-dom/client'; import VideoTimelinePage from '/src/renderer/src/pages/VideoTimelinePage.tsx'; import '/src/renderer/src/index.css'; localStorage.setItem('huphe:timeline:last-project','rife-ui-fixture'); createRoot(document.getElementById('root')!).render(<React.StrictMode><VideoTimelinePage/></React.StrictMode>);`
  : `import React from 'react'; import {createRoot} from 'react-dom/client'; import {AtelierMediaCreationPanel} from '/src/renderer/src/components/AtelierMediaPanel.tsx'; import '/src/renderer/src/index.css'; createRoot(document.getElementById('root')!).render(<React.StrictMode><AtelierMediaCreationPanel type="video" onCreationTypeSelect={()=>{}}/></React.StrictMode>);`)
const server = await createServer({ configFile: false, root: work, logLevel: 'warn',
  plugins: [{ name: 'local-only-auth', enforce: 'pre', resolveId(id) { if (/(^|\/)supabase(?:\.ts)?$/.test(id)) return '\0timeline-local-auth' },
    load(id) { if (id === '\0timeline-local-auth') return `export const supabaseConfigured = false; export const supabase = {auth:{getSession:async()=>({data:{session:{access_token:'local-fixture-only',user:{id:'fixture'}}}})},from:table=>{if(table!=='modules')throw Error('Unexpected fixture query: '+table);return {select:()=>({like:async()=>({data:[]})})}}};` } }, react()],
  resolve: { alias: { '/src': join(root, 'src') } }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } })
await server.listen()
const address = server.httpServer.address()
const url = `http://127.0.0.1:${address.port}`
const preload = join(work, 'preload.cjs')
await writeFile(preload, `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('api',{
 timeline:{list:()=>ipcRenderer.invoke('timeline:list'),save:p=>ipcRenderer.invoke('timeline:save',p),importMedia:p=>ipcRenderer.invoke('timeline:import',p),export:p=>ipcRenderer.invoke('timeline:export',p),tools:()=>ipcRenderer.invoke('timeline:tools'),prepareReferences:p=>ipcRenderer.invoke('test:prepare-references',p),extractAudio:p=>ipcRenderer.invoke('timeline:extract-audio',p),captureTransition:p=>ipcRenderer.invoke('timeline:capture-transition',p)},
 engine:{listOpenRouterModelsByModality:async()=>({ok:true,models:[]}),searchOpenRouterModels:async()=>({ok:true,models:[]})},
 getVideoCapabilities:()=>ipcRenderer.invoke('test:capabilities'),generateAtelierVideo:(...args)=>ipcRenderer.invoke('test:generate',args),renderVideoDraftFinal:(...args)=>ipcRenderer.invoke('test:finalize',args)
});`)

const main = join(work, 'main.cjs')
await build({ entryPoints: [join(root, rifeOnly ? 'scripts/rife-timeline-ui-electron.ts' : 'scripts/video-timeline-ui-electron.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: main, logLevel: 'warning' })
const env = { ...process.env, TEST_RUN_ID: runId, TEST_WORK: work, TEST_FIXTURES: fixtureDir, TEST_PRELOAD: preload, TEST_URL: url, HUPHE_TIMELINE_ROOT: join(work, rifeOnly ? `projects-${runId}` : 'projects') }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [main], { env, stdio: 'inherit' })
const code = await new Promise(resolve => { child.on('exit', resolve); child.on('error', e => { console.error(e); resolve(1) }) })
await server.close()
process.exitCode = Number(code ?? 1)
