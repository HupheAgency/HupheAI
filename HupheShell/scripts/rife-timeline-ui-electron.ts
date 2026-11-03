/** Isolated Electron UI + real managed media/captures. Only the paid provider is simulated. */
import { app, BrowserWindow, protocol, ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { registerVideoTimelineIPC } from '../src/main/video-timeline-ipc'
import { serveLocalMedia } from '../src/main/lib/local-media-response'
import { importTimelineSources, loadTimelineProject, saveTimelineProject } from '../src/main/lib/video-timeline-storage'
import { requireTimelineTools, runTimelineTool, timelineFileUrl, type TimelineTools } from '../src/main/lib/video-timeline-media'
import { timelineEnd, type TimelineProject } from '../src/shared/video-timeline'
import { transitionCaptureIsCurrent, transitionVariantIsCurrent } from '../src/shared/video-timeline-transition'
import { RIFE_CAPABILITY, RIFE_MODEL, buildRifeTransitionRequest } from '../supabase/functions/_shared/rife-transition-contract'

const work = process.env.TEST_WORK!, root = process.env.HUPHE_TIMELINE_ROOT!, projectId = 'rife-ui-fixture'
const artifacts = join(work, 'artifacts')
app.setPath('userData', join(work, `user-data-${process.env.TEST_RUN_ID}`))
protocol.registerSchemesAsPrivileged([{ scheme: 'huphe', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
let window: BrowserWindow
let tools: TimelineTools
let generated = 0
let generationAttempts = 0
let includeRifeCapability = true
const passes: string[] = [], rendererErrors: string[] = []
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const js = (code: string) => window.webContents.executeJavaScript(code, true)
async function until(code: string, label: string, timeout = 20_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await js(code)) return; await sleep(70) }
  throw new Error(`Timeout: ${label}\n${await js('document.body.innerText')}`)
}
const LABELS: Record<string, string> = { '⏮': 'Naar begin', '▶': 'Afspelen', '＋ Videospoor': 'Videospoor toevoegen', '＋ Audiospoor': 'Audiospoor toevoegen', '＋ Leeg blok': 'Leeg blok', '＋ Video toevoegen': 'Video toevoegen', '♫ Audio toevoegen': 'Audio toevoegen', '＋ Afbeelding toevoegen': 'Afbeelding toevoegen', Nieuw: 'Nieuw project', 'Exporteer film ↗': 'Film exporteren' }
async function click(text: string) {
  text = LABELS[text] || text.replace(/^Varianten \(\d+\)$/, 'Varianten')
  const point = await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>(e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)})&&e.getClientRects().length);if(!e)throw Error('Button missing: '+${JSON.stringify(text)});if(e.disabled)throw Error('Button disabled: '+${JSON.stringify(text)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  await sleep(130)
}
async function input(selector: string, value: string | number) {
  await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Input missing: '+${JSON.stringify(selector)});const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await sleep(140)
}
async function selectClip(id: string, tab: string) {
  await js(`document.querySelector('[data-clip-id=${JSON.stringify(id)}]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
  await click(tab)
}
async function savedWhen(predicate: (project: TimelineProject) => boolean, label: string): Promise<TimelineProject> {
  for (let step = 0; step < 150; step++) {
    const value = await loadTimelineProject(root, projectId)
    if (predicate(value)) return value
    await sleep(80)
  }
  throw new Error(`Saved project timeout: ${label}`)
}
const ffmpeg = (...args: string[]) => runTimelineTool(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])

async function prepareProject() {
  const a = join(work, 'A.mp4'), b = join(work, 'B.mp4')
  await ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', a)
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', b)
  const assets = await importTimelineSources(root, projectId, 'video', [{ src: a }, { src: b }], tools)
  const now = new Date().toISOString()
  const project: TimelineProject = { schemaVersion: 1, id: projectId, name: 'RIFE UI fixture', createdAt: now, updatedAt: now, width: 1920, height: 1080,
    fps: 25, targetDuration: 4, assets, tracks: [{ id: 'video-1', kind: 'video', name: 'Film' }, { id: 'audio-1', kind: 'audio', name: 'Audio' }],
    clips: assets.map((asset, index) => ({ id: `source-${index}`, track: 'video', trackId: 'video-1', label: `Scène ${index + 1}`,
      start: index * 50, duration: 50, activeVariantId: `variant-${index}`, variants: [{ id: `variant-${index}`, assetId: asset.id, createdAt: now, inPoint: index ? 0.2 : 0.4 }] })) }
  await saveTimelineProject(root, project)
  return project
}

async function drawEmpty(trackId: string, from: number, to: number) {
  await click('⏮') // Keep the playhead handle outside the drawing gesture.
  const points = await js(`(()=>{const lane=document.querySelector('.vt-lane[data-track-id=${JSON.stringify(trackId)}]');lane.scrollIntoView({block:'nearest'});const r=lane.getBoundingClientRect(),zoom=Number(document.querySelector('[aria-label="Tijdlijnzoom"]').value);return{start:{x:Math.round(r.left+${from}*zoom),y:Math.round(r.top+r.height/2)},end:{x:Math.round(r.left+${to}*zoom),y:Math.round(r.top+r.height/2)}}})()`)
  assert.equal(await js(`!!document.elementFromPoint(${points.start.x},${points.start.y}).closest('[data-clip-id]')`), false, 'drawing begins on the empty upper track')
  assert.equal(await js(`!!document.elementFromPoint(${points.end.x},${points.end.y}).closest('[data-clip-id]')`), false, 'drawing ends on the empty upper track')
  window.webContents.sendInputEvent({ type: 'mouseMove', ...points.start })
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...points.start })
  for (let i = 1; i <= 8; i++) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(points.start.x + (points.end.x - points.start.x) * i / 8), y: points.end.y, modifiers: ['leftbuttondown'] })
    await sleep(35)
  }
  assert.equal(await js("!!document.querySelector('.vt-block-draft') && !document.querySelector('.vt-block-draft.vt-rife-block')"), true, 'ordinary drawing creates a plain empty block')
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...points.end })
  await until("!!document.querySelector('[data-clip-id].selected') && !document.querySelector('.vt-block-draft') && !!document.querySelector('[aria-label=Videomodel]') && !document.querySelector('[aria-label=Videomodel]').disabled", 'plain block selected')
  const id = await js("document.querySelector('[data-clip-id].selected').dataset.clipId")
  const plain = await savedWhen(project => project.clips.some(clip => clip.id === id), 'plain drawn block persisted')
  const clip = plain.clips.find(clip => clip.id === id)!
  assert.equal(clip.transition, undefined)
  assert.equal(clip.start, Math.round(from * plain.fps)); assert.equal(clip.duration, Math.round((to - from) * plain.fps))
  assert.equal(clip.trackId, trackId)
  return { project: plain, clip }
}

async function drawTransition() {
  assert.equal(await js("!!document.querySelector('.vt-rife-tool') || [...document.querySelectorAll('.vt-timeline-toolbar button')].some(e=>e.textContent.includes('RIFE'))"), false, 'RIFE has no separate toolbar tool')
  await click('＋ Videospoor')
  const expanded = await savedWhen(project => project.tracks?.length === 3, 'new empty video track')
  const track = expanded.tracks!.find(item => item.kind === 'video' && item.id !== 'video-1')!
  const { clip } = await drawEmpty(track.id, 1.6, 2.4)
  assert.equal(await js("!!document.querySelector('[aria-label=Videomodel] option[value=\"fal-ai/rife\"]') && !!document.querySelector('[aria-label=Videomodel] option[value=\"bytedance/seedance-2.5\"]')"), true, 'RIFE and regular models share one dropdown')
  await input('[aria-label="Videomodel"]', RIFE_MODEL)
  await until("document.querySelectorAll('[data-transition-kind=rife]').length===1 && document.querySelector('[data-testid=rife-start-frame]')?.naturalWidth===1920 && document.querySelector('[data-testid=rife-end-frame]')?.naturalWidth===1920 && !document.querySelector('.vt-rife-controls .vt-primary').disabled", 'real capture images ready', 30_000)
  const captured = await savedWhen(project => !!project.clips.find(item => item.id === clip.id)?.transition?.startFrameAssetId, 'capture attached')
  const converted = captured.clips.find(item => item.id === clip.id)!
  assert.equal(converted.start, clip.start); assert.equal(converted.duration, clip.duration); assert.equal(converted.trackId, clip.trackId)
  assert.equal(captured.tracks!.length, expanded.tracks!.length, 'choosing RIFE does not add or replace a track')
  assert.equal(await js("document.querySelector('[aria-label=Videomodel]').value"), RIFE_MODEL)
  assert.equal(await js("document.querySelector('[aria-label=Videomodel]').getClientRects().length>0"), true, 'model selector remains visible in RIFE mode')
  return captured
}

async function rifeFrameControls(project: TimelineProject, id: string): Promise<TimelineProject> {
  const original = project.clips.find(clip => clip.id === id)!
  const selector = '[aria-label="Aantal frames RIFE"]'
  const bounds = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {type:e.type,min:Number(e.min),max:Number(e.max),step:Number(e.step),value:Number(e.value)}})()`)
  assert.deepEqual(bounds, { type: 'range', min: 2, max: 65, step: 1, value: 20 }, 'RIFE slider exposes total block frames in integer steps')
  const key = async (keyCode: string) => {
    await js(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await sleep(120)
  }
  const geometry = async (frames: number) => {
    const actual = await js(`(()=>{const e=document.querySelector('[data-clip-id=${JSON.stringify(id)}]'),zoom=Number(document.querySelector('[aria-label="Tijdlijnzoom"]').value);return {left:parseFloat(e.style.left),width:parseFloat(e.style.width),zoom,frames:Number(document.querySelector(${JSON.stringify(selector)}).value)}})()`)
    assert.equal(actual.frames, frames)
    assert.equal(actual.left, original.start / project.fps * actual.zoom, 'changing frame count preserves the left edge')
    assert.equal(actual.width, Math.max(6, frames / project.fps * actual.zoom), 'timeline width follows the slider immediately')
    const saved = await savedWhen(value => value.clips.find(clip => clip.id === id)?.duration === frames, 'slider frame count persisted')
    const clip = saved.clips.find(item => item.id === id)!
    assert.equal(clip.start, original.start); assert.equal(clip.trackId, original.trackId)
    assert.deepEqual(saved.clips.filter(item => item.id !== id), project.clips.filter(item => item.id !== id), 'slider preserves all underlying clips and their trims')
    return saved
  }
  const pointer = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.left+8+(Number(e.value)-Number(e.min))/(Number(e.max)-Number(e.min))*(r.width-16)),y:Math.round(r.top+r.height/2)}})()`)
  window.webContents.sendInputEvent({ type: 'mouseMove', ...pointer })
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...pointer })
  for (let step = 1; step <= 5; step++) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: pointer.x + step * 3, y: pointer.y, modifiers: ['leftbuttondown'] })
    await sleep(40)
  }
  const heldFrames = await js(`Number(document.querySelector(${JSON.stringify(selector)}).value)`)
  assert.ok(heldFrames > 20 && heldFrames < 65, 'actual slider drag changes the frame count while the mouse remains held')
  await geometry(heldFrames) // Deliberately assert DOM width and saved duration before mouseUp.
  await sleep(180)
  await writeFile(join(artifacts, 'rife-slider-drag.png'), (await window.webContents.capturePage()).toPNG())
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: pointer.x + 15, y: pointer.y })
  await input(selector, 20); await geometry(20)
  await key('Right'); await geometry(21)
  assert.equal(await js("document.querySelector('.vt-rife-controls .vt-primary').disabled"), true, 'one-frame resize invalidates endpoint captures')
  assert.match(await js("document.querySelector('.vt-rife-controls').innerText"), /De balk of de bronbeelden zijn veranderd/)
  await key('Home'); await geometry(2)
  await key('End'); await geometry(65)
  assert.match(await js("document.querySelector('.vt-rife-controls').innerText"), /geen zichtbaar bronbeeld/i, 'max frame count stays selectable even when source coverage is insufficient')
  assert.equal(await js("document.querySelector('.vt-rife-controls .vt-primary').disabled"), true)
  await click('Fragment'); await input('[aria-label="Lengte fragment"]', 0.88); await click('Genereren')
  await geometry(22)
  assert.equal(await js(`Number(document.querySelector(${JSON.stringify(selector)}).value)`), 22, 'editing timeline duration updates the RIFE slider')
  await input(selector, 21); await geometry(21)
  await click('Begin- en eindframe vernieuwen')
  await until("!document.querySelector('.vt-rife-controls .vt-primary').disabled", 'resized endpoints refreshed', 30_000)
  const refreshed = await savedWhen(value => value.clips.find(clip => clip.id === id)?.transition?.capturedEnd === original.start + 21, 'resized endpoint metadata')
  assert.notEqual(refreshed.clips.find(clip => clip.id === id)!.transition!.endFrameAssetId, original.transition!.endFrameAssetId)
  await input(selector, 20); await geometry(20)
  assert.equal(await js("document.querySelector('.vt-rife-controls .vt-primary').disabled"), true, 'restoring duration requires matching captures after capturing another length')
  await click('Begin- en eindframe vernieuwen')
  await until("!document.querySelector('.vt-rife-controls .vt-primary').disabled", 'original 20 frames restored and recaptured', 30_000)
  const restored = await savedWhen(value => value.clips.find(clip => clip.id === id)?.transition?.capturedEnd === original.start + 20, 'restored endpoint metadata')
  assert.equal(timelineEnd(restored), timelineEnd(project)); assert.equal(generated, 0)
  passes.push('RIFE frame slider uses 2–65 whole frames, mouse dragging resizes the timeline before release, keyboard changes one frame, duration inputs stay synchronized, uncovered endpoints show errors and changed captures must be refreshed')
  return restored
}

async function run() {
  await app.whenReady()
  await mkdir(artifacts, { recursive: true })
  tools = await requireTimelineTools()
  const original = await prepareProject()
  registerVideoTimelineIPC()
  protocol.handle('huphe', request => serveLocalMedia(request, decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))))
  ipcMain.handle('test:capabilities', () => ({ ok: true, models: [...(includeRifeCapability ? [{ ...RIFE_CAPABILITY, provider: 'fal', markup_pct: 0, video_cost_estimate: 1, max_reservation: 15600 }] : []),
    { model_id: 'bytedance/seedance-2.5', provider: 'fal', supported_durations: [4], supported_resolutions: ['480p'], supported_aspect_ratios: ['16:9'], pricing_skus: { duration_seconds: '0.01' }, markup_pct: 0, video_cost_estimate: 10000 }] }))
  ipcMain.handle('test:generate', async (_event, args) => {
    assert.equal(args[0], ''); assert.equal(args[1], RIFE_MODEL); assert.equal(args[3], 'local-fixture-only')
    assert.equal(args[5].duration, undefined, 'RIFE does not submit duration: frame count controls it')
    assert.equal(args[5].extraParams.fps, 25); assert.equal(args[6], 'fal')
    const project = await loadTimelineProject(root, projectId)
    const clip = project.clips.find(item => item.transition?.kind === 'rife')!
    const start = project.assets.find(item => item.id === clip.transition!.startFrameAssetId)!
    const end = project.assets.find(item => item.id === clip.transition!.endFrameAssetId)!
    assert.equal(args[4], start.src); assert.equal(args[9], end.src)
    assert.equal(args[5].extraParams.num_frames, clip.duration - 1)
    const rawProject = JSON.parse(await readFile(join(root, projectId, 'project.json'), 'utf8'))
    const job = rawProject.jobs.find(item => item.id === args[8])
    assert.equal(job.status, 'running'); assert.equal(job.clipId, clip.id)
    assert.equal(job.generation.referenceAssetId, start.id); assert.equal(job.generation.endImageAssetId, end.id)
    assert.equal(job.generation.requestedDuration, clip.duration / project.fps)
    const contract = buildRifeTransitionRequest({ prompt: '', image_url: `https://local.invalid/${start.id}.png`, end_image_url: `https://local.invalid/${end.id}.png`, extra_params: args[5].extraParams })
    assert.equal(contract.outputFrames, clip.duration); assert.equal(contract.body.include_start, true); assert.equal(contract.body.include_end, false)
    if (++generationAttempts === 1) return { ok: false, error: 'Onvoldoende credits voor deze overgang.', code: 'insufficient_balance', definitiveFailure: true }
    const output = join(work, `simulated-rife-${++generated}.mp4`)
    await ffmpeg('-loop', '1', '-framerate', '25', '-i', start.path, '-frames:v', String(clip.duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', output)
    return { ok: true, filePath: timelineFileUrl(output) }
  })
  window = new BrowserWindow({ width: 1680, height: 1100, show: false, webPreferences: { preload: process.env.TEST_PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) rendererErrors.push(message) })
  await window.loadURL(process.env.TEST_URL!)
  await until("document.querySelectorAll('[data-clip-id]').length===2 && !document.querySelector('[data-new-track=video]').disabled", 'prepared timeline')
  let drawn = await drawTransition()
  let transition = drawn.clips.find(clip => clip.transition)!
  assert.equal(transition.start, 40); assert.equal(transition.duration, 20)
  assert.equal(drawn.tracks!.find(track => track.id === transition.trackId)?.kind, 'video')
  assert.notEqual(transition.trackId, 'video-1')
  assert.deepEqual(drawn.clips.filter(clip => !clip.transition), original.clips, 'original positions, trims and variants remain unchanged')
  assert.equal(timelineEnd(drawn), timelineEnd(original)); assert.equal(generated, 0, 'drawing captures endpoints without starting a paid job')
  assert.equal(transitionCaptureIsCurrent(drawn, transition), true)
  for (const id of [transition.transition!.startFrameAssetId, transition.transition!.endFrameAssetId]) {
    const image = drawn.assets.find(asset => asset.id === id)!
    assert.equal(image.kind, 'image'); assert.equal(image.width, 1920); assert.equal(image.height, 1080)
    assert.equal((await readFile(image.path)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  }
  drawn = await rifeFrameControls(drawn, transition.id)
  transition = drawn.clips.find(clip => clip.id === transition.id)!
  await sleep(250) // Let Electron composite the newly decoded PNG thumbnails before capturing evidence.
  await writeFile(join(artifacts, 'rife-captured.png'), (await window.webContents.capturePage()).toPNG())
  passes.push('An ordinary block is drawn on an added video track; choosing RIFE in the shared model dropdown captures both endpoints in 1080p PNG without changing its ID, track, timing or the underlying clips')
  await click('Genereer overgang')
  await until("document.body.innerText.includes('Onvoldoende credits voor deze overgang.') && !document.querySelector('.vt-rife-controls .vt-primary').disabled", 'definitive rejection allows retry')
  const rejected = await savedWhen(project => project.jobs?.length === 1 && project.jobs[0].status === 'failed', 'definitively failed job')
  assert.equal(rejected.jobs!.some(job => job.status === 'unknown'), false)
  assert.equal(await js("document.body.innerText.includes('Een eerdere generatie heeft een onbekende uitkomst')"), false, 'definitive rejection never shows an unknown-outcome warning')
  assert.equal(rejected.clips.find(clip => clip.id === transition.id)!.variants.length, 0)
  assert.equal(generated, 0, 'insufficient balance never creates a video')
  passes.push('Insufficient-balance rejection becomes a failed job, preserves captures and enables retry without an unknown-outcome warning')
  await click('Genereer overgang')
  await until("document.querySelectorAll('.vt-variant').length===1 && [...document.querySelectorAll('button')].some(e=>e.textContent==='Gebruik deze variant'&&!e.disabled)", 'generated variant ready', 30_000)
  let generatedProject = await savedWhen(project => project.clips.find(clip => clip.id === transition.id)?.variants.length === 1, 'generated snapshot')
  let generatedClip = generatedProject.clips.find(clip => clip.id === transition.id)!
  assert.equal(generatedClip.activeVariantId, undefined, 'generated transition waits for explicit selection')
  assert.deepEqual(generatedClip.variants[0].transition, transition.transition)
  assert.equal(generatedClip.variants[0].generation!.extraParams!.num_frames, 19)
  const generatedAsset = generatedProject.assets.find(asset => asset.id === generatedClip.variants[0].assetId)!
  assert.equal(generatedAsset.duration, 0.8); assert.equal(generatedAsset.fps, 25)
  await click('Gebruik deze variant')
  generatedProject = await savedWhen(project => !!project.clips.find(clip => clip.id === transition.id)?.activeVariantId, 'explicit active selection')
  generatedClip = generatedProject.clips.find(clip => clip.id === transition.id)!
  assert.equal(transitionVariantIsCurrent(generatedProject, generatedClip, generatedClip.variants[0]), true)
  assert.deepEqual(generatedProject.clips.filter(clip => !clip.transition), original.clips)
  assert.equal(timelineEnd(generatedProject), 100, 'using a transition does not extend the film')
  passes.push('Explicit generation submits matching endpoints, N−1 intermediate frames and fps; a new immutable variant is offered and selected without changing film duration')

  await click('Genereren')
  await input('[aria-label="Aantal frames RIFE"]', 21)
  const resizedHistory = await savedWhen(project => project.clips.find(clip => clip.id === transition.id)?.duration === 21, 'generated transition resized by one frame')
  assert.deepEqual(resizedHistory.clips.find(clip => clip.id === transition.id)!.variants, generatedClip.variants, 'frame slider preserves immutable existing generation/capture snapshots')
  assert.equal(await js("document.querySelector('.vt-rife-controls .vt-primary').disabled"), true)
  await input('[aria-label="Aantal frames RIFE"]', 20)
  await until("!document.querySelector('.vt-rife-controls .vt-primary').disabled", 'existing 20-frame capture valid again')
  await input('[aria-label="Videomodel"]', 'bytedance/seedance-2.5')
  await until("document.querySelector('[aria-label=Videomodel]').value==='bytedance/seedance-2.5' && !document.querySelector('.vt-rife-controls') && !!document.querySelector('[aria-label=Generatieduur]')", 'switch to regular generator')
  const switchedAway = await savedWhen(project => project.clips.find(clip => clip.id === transition.id)?.generation?.modelId === 'bytedance/seedance-2.5', 'regular model saved')
  const awayClip = switchedAway.clips.find(clip => clip.id === transition.id)!
  assert.deepEqual(awayClip.variants, generatedClip.variants, 'switching to Seedance preserves all RIFE variants')
  assert.equal(awayClip.start, transition.start); assert.equal(awayClip.duration, transition.duration); assert.equal(awayClip.trackId, transition.trackId)
  await input('[aria-label="Videomodel"]', RIFE_MODEL)
  await until("document.querySelector('[aria-label=Videomodel]').value==='fal-ai/rife' && document.querySelector('[data-testid=rife-start-frame]')?.naturalWidth===1920 && !document.querySelector('.vt-rife-controls .vt-primary').disabled", 'switch back to RIFE with captures ready', 30_000)
  const switchedBack = await savedWhen(project => !!project.clips.find(clip => clip.id === transition.id)?.transition?.startFrameAssetId, 'RIFE mode saved again')
  assert.deepEqual(switchedBack.clips.find(clip => clip.id === transition.id)!.variants, generatedClip.variants, 'returning to RIFE preserves immutable variant history')
  assert.equal(generated, 1, 'switching models never generates automatically')
  passes.push('RIFE → Seedance → RIFE keeps the same block, frame geometry and immutable variants while the shared model dropdown remains available')

  await click('Fragment'); await input('[aria-label="Start fragment"]', 1.64); await click('Genereren')
  await until("document.querySelector('.vt-rife-controls .vt-primary').disabled && document.querySelector('.vt-rife-controls').innerText.includes('De balk of de bronbeelden zijn veranderd')", 'moved bar becomes stale')
  await click('Begin- en eindframe vernieuwen')
  await until("!document.querySelector('.vt-rife-controls .vt-primary').disabled", 'recapture after move', 30_000)
  let moved = await savedWhen(project => project.clips.find(clip => clip.id === transition.id)?.transition?.capturedStart === 41, 'new captured position')
  let movedClip = moved.clips.find(clip => clip.id === transition.id)!
  assert.notEqual(movedClip.transition!.startFrameAssetId, transition.transition!.startFrameAssetId)
  assert.equal(movedClip.variants.length, 1); assert.deepEqual(movedClip.variants[0].transition, transition.transition, 'recapturing retains historical variant snapshot')
  await click('Varianten (1)')
  assert.equal(await js("document.querySelector('.vt-variant button').disabled"), true, 'older variant cannot be selected after moving the bar')
  await selectClip('source-0', 'Fragment'); await input('[aria-label="Begin in bron"]', 0.44)
  await selectClip(transition.id, 'Genereren')
  await until("document.querySelector('.vt-rife-controls .vt-primary').disabled && document.querySelector('.vt-rife-controls').innerText.includes('De balk of de bronbeelden zijn veranderd')", 'source trim change becomes stale')
  assert.equal(await js("[...document.querySelectorAll('.vt-rife-controls button')].find(e=>e.textContent==='Begin- en eindframe vernieuwen').disabled"), false)
  await sleep(250)
  await writeFile(join(artifacts, 'rife-stale.png'), (await window.webContents.capturePage()).toPNG())
  passes.push('Moving the bar or trimming underlying footage invalidates captures and disables generation; recapture is available and historical variants remain intact')
  await click('Begin- en eindframe vernieuwen')
  await until("!document.querySelector('.vt-rife-controls .vt-primary').disabled", 'source change recaptured', 30_000)
  await click('Opslaan'); await sleep(200)
  await window.webContents.reload()
  await until("document.querySelectorAll('[data-clip-id]').length===3", 'saved transition reopened')
  await selectClip(transition.id, 'Genereren')
  await until("document.querySelector('[data-testid=rife-start-frame]')?.naturalWidth===1920 && !document.querySelector('.vt-rife-controls .vt-primary').disabled", 'captures and generation readiness survive reopen')
  assert.equal(generated, 1, 'refresh and reopening do not regenerate automatically')
  passes.push('Project reopen retains the transition, endpoint assets and history without automatic provider calls')
  const invalid = await drawEmpty(transition.trackId!, 5, 5.8)
  await input('[aria-label="Videomodel"]', RIFE_MODEL)
  await until("document.querySelector('[aria-label=Videomodel]').value==='fal-ai/rife' && !!document.querySelector('.vt-rife-controls [role=alert]') && document.querySelector('.vt-rife-controls .vt-primary').disabled", 'invalid placement shows source warning')
  assert.match(await js("document.querySelector('.vt-rife-controls').innerText"), /geen zichtbaar bronbeeld/i)
  const invalidSaved = await savedWhen(project => project.clips.find(clip => clip.id === invalid.clip.id)?.transition?.kind === 'rife', 'invalid RIFE choice saved visibly')
  const invalidClip = invalidSaved.clips.find(clip => clip.id === invalid.clip.id)!
  assert.equal(invalidClip.start, 125); assert.equal(invalidClip.duration, 20); assert.equal(invalidClip.trackId, transition.trackId)
  assert.equal(invalidClip.transition!.startFrameAssetId, undefined, 'invalid placement never creates fake endpoint captures')
  assert.equal(generationAttempts, 2, 'invalid placement never starts provider generation')
  await click('Fragment'); await click('Blok verwijderen')
  await until("document.querySelectorAll('[data-clip-id]').length===3", 'invalid test block removed')
  passes.push('Selecting RIFE where underlying footage is missing preserves the chosen block, explains the missing frames and disables generation')

  await click('Opslaan')
  const beforeOffline = await savedWhen(project => project.clips.length === 3, 'clean project before offline catalog check')
  includeRifeCapability = false
  await window.webContents.reload()
  await until("document.querySelectorAll('[data-clip-id]').length===3 && !document.querySelector('[data-new-track=video]').disabled", 'catalog without server RIFE capability')
  await click('＋ Videospoor')
  const offlineTracks = await savedWhen(project => project.tracks?.length === beforeOffline.tracks!.length + 1, 'extra video track for local-only RIFE')
  const offlineTrack = offlineTracks.tracks!.find(track => !beforeOffline.tracks!.some(before => before.id === track.id))!
  const offline = await drawEmpty(offlineTrack.id, 1.6, 2.4)
  assert.equal(await js("!!document.querySelector('[aria-label=Videomodel] option[value=\"fal-ai/rife\"]')"), true, 'RIFE remains selectable when its server capability is absent')
  await input('[aria-label="Videomodel"]', RIFE_MODEL)
  await until("document.querySelector('[data-testid=rife-start-frame]')?.naturalWidth===1920 && document.querySelector('[data-testid=rife-end-frame]')?.naturalWidth===1920 && document.querySelector('.vt-rife-controls').innerText.includes('RIFE is nog niet beschikbaar op de server') && document.querySelector('.vt-rife-controls .vt-primary').disabled", 'local captures ready with server unavailable', 30_000)
  const localOnly = await savedWhen(project => !!project.clips.find(clip => clip.id === offline.clip.id)?.transition?.startFrameAssetId, 'local-only endpoint capture saved')
  assert.equal(transitionCaptureIsCurrent(localOnly, localOnly.clips.find(clip => clip.id === offline.clip.id)!), true)
  assert.equal(await js("document.querySelector('[aria-label=Videomodel]').value"), RIFE_MODEL)
  assert.equal(generationAttempts, 2, 'server-unavailable mode never invokes generation')
  passes.push('Without a server RIFE capability the dropdown still offers RIFE and local endpoint capture works; generation stays disabled with a clear availability notice')
  await click('Fragment'); await click('Blok verwijderen'); await click('Opslaan')
  await savedWhen(project => project.clips.length === 3, 'local-only test block removed')
  assert.deepEqual(rendererErrors, [], 'renderer runs without uncaught errors')
  assert.equal(generationAttempts, 2)
  const report = { passed: passes, localSimulatedGenerations: generated, localSimulatedRejections: 1, paidProviderCalls: 0, rendererErrors }
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

run().then(() => app.exit(0)).catch(async error => {
  console.error(error)
  if (window && !window.isDestroyed()) {
    await writeFile(join(artifacts, 'failure.png'), (await window.webContents.capturePage()).toPNG()).catch(() => {})
    await writeFile(join(artifacts, 'failure.txt'), String(await js('document.body.innerText'))).catch(() => {})
  }
  app.exit(1)
})
