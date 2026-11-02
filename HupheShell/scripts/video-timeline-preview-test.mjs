/** Isolated Electron compositor checks; local fixtures only, no provider calls. */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const work = join(root, '.local', 'timeline-preview-multitrack')
await mkdir(work, { recursive: true })
const fixtures = join(root, '.local', 'video-timeline-fixtures')
const sources = Object.fromEntries(await Promise.all([
  ['A', 'source-A.mp4', 'video/mp4'], ['B', 'source-B.mp4', 'video/mp4'], ['audio', 'baseline.wav', 'audio/wav'],
].map(async ([key, name, mime]) => [key, `data:${mime};base64,${(await readFile(join(fixtures, name))).toString('base64')}`])))
await writeFile(join(work, 'fixtures.json'), JSON.stringify(sources))
await build({ entryPoints: [join(root, 'scripts/video-timeline-preview-test-renderer.ts')], bundle: true, platform: 'browser',
  format: 'iife', outfile: join(work, 'renderer.js'), define: { PREVIEW_FIXTURES: JSON.stringify(sources) }, logLevel: 'warning' })
await writeFile(join(work, 'index.html'), '<!doctype html><html><body style="margin:0"><script src="renderer.js"></script></body></html>')
await writeFile(join(work, 'main.cjs'), `
const {app,BrowserWindow}=require('electron');
app.setPath('userData', ${JSON.stringify(join(work, 'user-data'))});
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{backgroundThrottling:false}});
 await win.loadFile(${JSON.stringify(join(work, 'index.html'))});
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
   const result=await win.webContents.executeJavaScript('window.__previewResult');
   if(result){console.log(JSON.stringify(result,null,2));app.exit(result.ok?0:1);return;}
   await new Promise(resolve=>setTimeout(resolve,50));
 }
 console.error('Preview test timed out');app.exit(1);
}).catch(error=>{console.error(error);app.exit(1)});
`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [join(work, 'main.cjs')], { env, stdio: 'inherit' })
process.exitCode = await new Promise(resolve => { child.on('exit', code => resolve(Number(code ?? 1))); child.on('error', error => { console.error(error); resolve(1) }) })
