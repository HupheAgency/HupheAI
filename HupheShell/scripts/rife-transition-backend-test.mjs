#!/usr/bin/env node
/** Real local endpoint capture tests. No network, provider calls, or hardware encoder. */
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'huphe-rife-capture-'))
try {
  const bundle = join(temporary, 'backend.mjs')
  await build({ stdin: { contents: `export * from './src/main/lib/video-timeline-media'; export * from './src/main/lib/video-timeline-storage'; export * from './src/main/lib/video-timeline-transition'; export * from './src/main/lib/video-timeline-export'; export * from './src/shared/video-timeline'; export * from './src/shared/video-timeline-transition'`, resolveDir: appRoot },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' })
  const api = await import(pathToFileURL(bundle).href)
  const tools = await api.requireTimelineTools()
  const root = join(temporary, 'projects')
  const projectId = 'capture-test'
  const now = new Date().toISOString()
  const ffmpeg = (...args) => api.runTimelineTool(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
  const sourceA = join(temporary, 'numbered.mp4')
  const sourceB = join(temporary, 'blue.mp4')
  const overlaySource = join(temporary, 'red.png')
  const vfrSource = join(temporary, 'vfr.mp4')
  await ffmpeg('-f', 'lavfi', '-i', 'nullsrc=s=192x108:r=25,geq=lum=20+N*2:cb=128:cr=128', '-frames:v', '75', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', sourceA)
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=blue:s=192x108:r=25', '-frames:v', '75', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', sourceB)
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=192x108', '-frames:v', '1', '-update', '1', overlaySource)
  await ffmpeg('-i', sourceA, '-vf', 'select=not(eq(mod(n\\,3)\\,1))', '-fps_mode', 'vfr', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', vfrSource)
  const [a, b, vfr] = await api.importTimelineSources(root, projectId, 'video', [{ src: sourceA }, { src: sourceB }, { src: vfrSource }], tools)
  const [logo] = await api.importTimelineSources(root, projectId, 'image', [{ src: overlaySource }], tools)
  const makeClip = (id, trackId, asset, start, duration, inPoint = 0, extra = {}) => ({ id, track: 'video', trackId, label: id, start, duration,
    activeVariantId: id, variants: [{ id, assetId: asset.id, createdAt: now, inPoint }], ...extra })
  const transition = { id: 'transition', track: 'video', trackId: 'transition-track', label: 'RIFE', start: 25, duration: 40, variants: [], transition: { kind: 'rife' } }
  const project = { schemaVersion: 1, id: projectId, name: 'RIFE capture', createdAt: now, updatedAt: now, width: 1920, height: 1080, fps: 25, targetDuration: 4,
    assets: [a, b, vfr, logo], tracks: [{ id: 'base', kind: 'video', name: 'Film' }, { id: 'overlay', kind: 'video', name: 'Onderliggend beeld' },
      { id: 'transition-track', kind: 'video', name: 'Overgang' }, { id: 'upper', kind: 'video', name: 'Bovenliggend logo' }],
    clips: [makeClip('first', 'base', a, 0, 50, 0.42), makeClip('second', 'base', b, 50, 50), transition] }
  const capture = async (value = project) => {
    await api.saveTimelineProject(root, value)
    return api.captureTimelineTransition(root, { projectId, clipId: transition.id }, tools)
  }
  let serial = 0
  const raw = async (path, filter = 'format=rgb24') => {
    const output = join(temporary, `rgb-${serial++}.raw`)
    await ffmpeg('-i', path, '-vf', filter, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', output)
    return readFile(output)
  }
  const pixel = (bytes, x, y, width = 1920) => [...bytes.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)]
  const closePixel = (actual, expected, message) => assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) <= 2), `${message}: ${actual} / ${expected}`)
  assert.deepEqual(api.validateTransitionRange(project, transition), [])
  const beforeManifest = JSON.stringify(await api.saveTimelineProject(root, project))
  const result = await api.captureTimelineTransition(root, { projectId, clipId: transition.id }, tools)
  assert.equal(JSON.stringify(await api.loadTimelineProject(root, projectId)), beforeManifest, 'capture never edits the project manifest')
  assert.equal(result.assets.length, 2)
  for (const asset of result.assets) {
    assert.equal(asset.kind, 'image')
    assert.equal(asset.width, 1920); assert.equal(asset.height, 1080)
    const metadata = await api.probeTimelineMedia(asset.path, 'image', tools)
    assert.equal(metadata.width, 1920); assert.equal(metadata.height, 1080)
    assert.equal((await readFile(asset.path)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'lossless PNG, not a browser screenshot')
  }
  const left = await raw(result.assets[0].path)
  const expected35 = await raw(a.path, 'select=eq(n\\,35),scale=1920:1080,format=rgb24')
  closePixel(pixel(left, 960, 540), pixel(expected35, 960, 540), 'fractional trim selects original frame 35 at left endpoint')
  const right = await raw(result.assets[1].path)
  assert.ok(pixel(right, 960, 540)[2] > 245 && pixel(right, 960, 540)[0] < 5, 'right endpoint samples the next clip across the cut')
  assert.equal(result.transition.capturedStart, 25); assert.equal(result.transition.capturedEnd, 65)
  assert.equal(result.transition.sourceSignature, api.transitionSourceSignature(project, transition))
  assert.deepEqual(await readFile(a.path), await readFile(sourceA), 'original source is unchanged')

  const withOwnResult = { ...project, clips: [...project.clips.slice(0, 2), { ...transition, activeVariantId: 'own', variants: [{ id: 'own', assetId: logo.id, inPoint: 0, createdAt: now }] },
    makeClip('upper-logo', 'upper', logo, 0, 100)] }
  const selfExcluded = await capture(withOwnResult)
  assert.deepEqual(await raw(selfExcluded.assets[0].path), left, 'own transition and higher logo are excluded from captures')
  assert.equal(api.transitionSourceSignature(withOwnResult, withOwnResult.clips[2]), result.transition.sourceSignature, 'own variant and upper layer do not stale the capture')

  const lowerOutputPath = join(temporary, 'lower-rife.mp4')
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:r=25', '-frames:v', '65', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-pix_fmt', 'yuv420p', lowerOutputPath)
  const [lowerOutput] = await api.importTimelineSources(root, projectId, 'video', [{ src: lowerOutputPath }], tools)
  const lowerRife = makeClip('lower-rife', 'overlay', lowerOutput, 15, 65, 0, { transition: { kind: 'rife' } })
  lowerRife.variants[0].transition = { ...result.transition, capturedStart: 15, capturedEnd: 80, sourceSignature: 'stale-source' }
  const withStaleLower = { ...project, assets: [...project.assets, ...result.assets, lowerOutput], clips: [...project.clips, lowerRife] }
  const staleLowerCapture = await capture(withStaleLower)
  assert.deepEqual(await raw(staleLowerCapture.assets[0].path), left, 'hidden stale lower RIFE does not appear in left capture')
  assert.deepEqual(await raw(staleLowerCapture.assets[1].path), right, 'hidden stale lower RIFE does not appear in right capture')
  assert.equal(api.transitionSourceSignature(withStaleLower, transition), result.transition.sourceSignature, 'hidden stale lower RIFE does not change source signature')
  const lowerCapture = await api.captureTimelineTransition(root, { projectId, clipId: lowerRife.id }, tools)
  const freshLower = { ...lowerRife, transition: lowerCapture.transition, variants: [{ ...lowerRife.variants[0], transition: lowerCapture.transition }] }
  const withFreshLower = { ...project, assets: [...project.assets, ...result.assets, ...lowerCapture.assets, lowerOutput], clips: [...project.clips, freshLower] }
  assert.equal(api.transitionVariantIsCurrent(withFreshLower, freshLower, freshLower.variants[0]), true)
  assert.notEqual(api.transitionSourceSignature(withFreshLower, transition), result.transition.sourceSignature, 'valid lower RIFE changes the upper source signature')
  const freshLowerCapture = await capture(withFreshLower)
  const lowerRed = pixel(await raw(freshLowerCapture.assets[0].path), 960, 540)
  assert.ok(lowerRed[0] > 245 && lowerRed[2] < 5, 'valid lower RIFE remains part of the visible montage')
  const changedBelow = { ...withFreshLower, clips: withFreshLower.clips.map(clip => clip.id === 'first' ? { ...clip, opacity: 0.9 } : clip) }
  assert.equal(api.transitionVariantIsCurrent(changedBelow, freshLower, freshLower.variants[0]), false, 'source edit stales a lower transition recursively')
  assert.equal(api.transitionSourceClips(changedBelow, transition, 25).some(clip => clip.id === lowerRife.id), false, 'recursive stale lower transition is excluded without cycles')

  const layered = { ...project, clips: [...project.clips, makeClip('lower-logo', 'overlay', logo, 0, 100, 0,
    { opacity: 0.5, transform: { scale: 0.25, x: 0.75, y: 0.25 } })] }
  const layeredCapture = await capture(layered)
  const layeredRight = await raw(layeredCapture.assets[1].path)
  closePixel(pixel(layeredRight, 100, 900), pixel(right, 100, 900), 'outside transformed overlay retains base image')
  const mixed = pixel(layeredRight, 1440, 270)
  assert.ok(mixed[0] > 115 && mixed[0] < 140 && mixed[2] > 115 && mixed[2] < 140, `lower overlay geometry and 50% opacity are composited (${mixed})`)

  const vfrProject = { ...project, clips: [{ ...project.clips[0], variants: [{ ...project.clips[0].variants[0], assetId: vfr.id, inPoint: 0.06 }] }, project.clips[1], { ...transition, start: 1, duration: 64 }] }
  const vfrCapture = await capture(vfrProject)
  // At 0.10 s the VFR source's latest original timestamp is 0.08 s (source frame 2).
  const expectedVfr = await raw(sourceA, 'select=eq(n\\,2),scale=1920:1080,format=rgb24')
  closePixel(pixel(await raw(vfrCapture.assets[0].path), 960, 540), pixel(expectedVfr, 960, 540), 'VFR timestamp sampling retains the preceding source frame')

  const atCut = await capture({ ...project, clips: [project.clips[0], project.clips[1], { ...transition, start: 25, duration: 25 }] })
  closePixel(pixel(await raw(atCut.assets[1].path), 960, 540), pixel(right, 960, 540), 'end exactly on cut selects first frame of following original clip')
  const boundary = { ...project, clips: [project.clips[0], project.clips[1], { ...transition, start: 60, duration: 40 }] }
  await api.saveTimelineProject(root, boundary)
  const directory = await api.timelineOriginalsDirectory(root, projectId)
  const beforeFailure = (await readdir(directory)).sort()
  await assert.rejects(api.captureTimelineTransition(root, { projectId, clipId: transition.id }, tools), /geen zichtbaar bronbeeld/)
  assert.deepEqual((await readdir(directory)).sort(), beforeFailure, 'invalid endpoint creates no partial assets')
  // Force the second render to fail after the first PNG has been completed.
  const failingEncoder = join(temporary, 'fail-second-frame.cjs')
  await writeFile(failingEncoder, `#!/usr/bin/env node\nconst { spawnSync } = require('node:child_process'); const args = process.argv.slice(2); if (args.includes(${JSON.stringify(b.path)})) process.exit(42); const result = spawnSync(${JSON.stringify(tools.ffmpeg)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1);\n`)
  await chmod(failingEncoder, 0o700)
  await api.saveTimelineProject(root, project)
  await assert.rejects(api.captureTimelineTransition(root, { projectId, clipId: transition.id }, { ...tools, ffmpeg: failingEncoder }), /Mediaverwerking mislukt/)
  assert.deepEqual((await readdir(directory)).sort(), beforeFailure, 'failure on right endpoint removes the already completed left PNG as well')
  for (const duration of [1, 66]) assert.ok(api.validateTransitionRange(project, { ...transition, duration }).some(message => message.includes('frames')))
  assert.ok(api.validateTransitionRange(project, { ...transition, trackId: 'base' }).some(message => message.includes('boven')))
  assert.ok(api.validateTransitionRange(project, { ...transition, track: 'audio' }).some(message => message.includes('videospoor')))
  const damagedTrim = { ...project, clips: [{ ...project.clips[0], variants: [{ ...project.clips[0].variants[0], inPoint: 2.5 }] }, project.clips[1], transition] }
  assert.ok(api.validateTransitionRange(damagedTrim, transition).some(message => message.includes('buiten de videobron')))

  const signature = api.transitionSourceSignature(project, transition)
  assert.equal(signature, api.transitionSourceSignature({ ...project, name: 'Renamed', updatedAt: new Date().toISOString(), jobs: [], assets: [...project.assets, { ...logo, id: 'unused' }] }, transition), 'unrelated project edits retain captures')
  for (const patch of [{ start: 24 }, { duration: 39 }]) assert.notEqual(signature, api.transitionSourceSignature(project, { ...transition, ...patch }), 'moving/resizing stales captures')
  for (const change of [{ ...project.clips[0], opacity: 0.9 }, { ...project.clips[0], variants: [{ ...project.clips[0].variants[0], inPoint: 0.4 }] }])
    assert.notEqual(signature, api.transitionSourceSignature({ ...project, clips: [change, project.clips[1], transition] }, transition), 'underlying source edits stale captures')

  const persistent = { ...project, assets: [...project.assets, ...result.assets], clips: [project.clips[0], project.clips[1],
    { ...transition, transition: result.transition, variants: [{ id: 'result', assetId: a.id, createdAt: now, inPoint: 0, transition: result.transition }] }] }
  await api.saveTimelineProject(root, persistent)
  const loaded = await api.loadTimelineProject(root, projectId)
  assert.deepEqual(loaded.clips[2].transition, result.transition)
  assert.deepEqual(loaded.clips[2].variants[0].transition, result.transition, 'capture provenance survives save/reopen on clip and variant')
  assert.equal(api.transitionCaptureIsCurrent(loaded, loaded.clips[2]), true)
  assert.equal(api.transitionVariantIsCurrent(loaded, loaded.clips[2], loaded.clips[2].variants[0]), true)
  assert.equal(api.transitionCaptureIsCurrent(loaded, { ...loaded.clips[2], start: 24 }), false)
  assert.equal(api.transitionCaptureIsCurrent({ ...loaded, assets: loaded.assets.filter(asset => asset.id !== result.transition.endFrameAssetId) }, loaded.clips[2]), false, 'missing captured image is stale')
  assert.equal(api.transitionCaptureIsCurrent({ ...loaded, width: 1280 }, loaded.clips[2]), false, 'project format change is stale')
  const active = { ...loaded.clips[2], activeVariantId: 'result' }
  // Pure output metadata validation: capture provenance alone cannot authorize a wrong-sized provider result.
  loaded.assets = loaded.assets.map(asset => asset.id === a.id ? { ...asset, width: 1920, height: 1080, duration: 40 / 25, fps: 25 } : asset)
  // Keep the underlying source signature stable by giving the generated result its own asset.
  const output = { ...loaded.assets.find(asset => asset.id === a.id), id: 'generated-output' }
  loaded.assets = loaded.assets.map(asset => asset.id === a.id ? a : asset).concat(output)
  active.variants = [{ ...active.variants[0], assetId: output.id }]
  assert.equal(api.transitionOutputProblem(loaded, active, active.variants[0]), undefined)
  for (const patch of [{ fps: 24 }, { width: 1280 }, { duration: 1.56 }]) assert.ok(api.transitionOutputProblem({ ...loaded, assets: loaded.assets.map(asset => asset.id === output.id ? { ...asset, ...patch } : asset) }, active, active.variants[0]))
  assert.deepEqual(api.transitionPlaybackProblems({ ...loaded, clips: [loaded.clips[0], loaded.clips[1], active] }), [])
  assert.ok(api.transitionPlaybackProblems({ ...loaded, clips: [loaded.clips[0], loaded.clips[1], { ...active, start: 24 }] }).some(error => error.includes('eerdere positie')))
  const anotherGenerator = { ...active, transition: undefined, generation: { prompt: 'next version', modelId: 'bytedance/seedance-2.5', provider: 'fal', resolution: '720p', aspectRatio: '16:9', requestedDuration: 4 } }
  assert.deepEqual(api.transitionPlaybackProblems({ ...loaded, clips: [loaded.clips[0], loaded.clips[1], anotherGenerator] }), [], 'changing the generator preserves a valid active transition')
  assert.ok(api.transitionPlaybackProblems({ ...loaded, clips: [loaded.clips[0], loaded.clips[1], { ...anotherGenerator, start: 24 }] }).some(error => error.includes('eerdere positie')), 'model choice cannot bypass active RIFE provenance')
  const lowerWithAnotherGenerator = { ...changedBelow, clips: changedBelow.clips.map(clip => clip.id === lowerRife.id ? { ...clip, transition: undefined } : clip) }
  assert.equal(api.transitionSourceClips(lowerWithAnotherGenerator, transition, 25).some(clip => clip.id === lowerRife.id), false, 'choosing another generator does not reveal a stale active lower transition')
  const pendingRife = { ...loaded.clips[0], transition: { kind: 'rife' } }
  assert.deepEqual(api.transitionPlaybackProblems({ ...loaded, clips: [pendingRife, loaded.clips[1]] }), [], 'choosing RIFE does not invalidate an existing normal active variant')


  // Render an actual owned result over the original montage, including both boundary frames.
  const redResult = join(temporary, 'rife-generated.mp4')
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:r=25', '-frames:v', '40', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', redResult)
  const [renderedAsset] = await api.importTimelineSources(root, projectId, 'video', [{ src: redResult }], tools)
  assert.equal(renderedAsset.duration, 40 / 25)
  const renderClip = { ...transition, transition: result.transition, activeVariantId: 'render-result',
    variants: [{ id: 'render-result', assetId: renderedAsset.id, createdAt: now, inPoint: 0, transition: result.transition }] }
  const renderProject = { ...persistent, assets: [...persistent.assets, renderedAsset], clips: [project.clips[0], project.clips[1], renderClip] }
  const renderedPath = join(temporary, 'montage-with-rife.mp4')
  const rendered = await api.renderTimelineProject(renderProject, { root, outputPath: renderedPath, tools, encoder: 'libx264' })
  assert.equal(rendered.frames, 100); assert.equal(rendered.duration, 4, 'RIFE overlays preserve the complete film duration')
  const renderedInfo = JSON.parse(await api.runTimelineTool(tools.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_streams', '-of', 'json', renderedPath]))
  assert.equal(Number(renderedInfo.streams[0].nb_read_frames), 100)
  assert.equal(renderedInfo.streams[0].width, 1920); assert.equal(renderedInfo.streams[0].height, 1080)
  const beforeTransition = await raw(renderedPath, 'select=eq(n\\,24),format=rgb24')
  const expectedBefore = await raw(sourceA, 'select=eq(n\\,34),scale=1920:1080,format=rgb24')
  closePixel(pixel(beforeTransition, 960, 540), pixel(expectedBefore, 960, 540), 'export frame 24 retains the trimmed underlying A frame')
  const transitionPixels = join(temporary, 'transition-pixels.rgb')
  await ffmpeg('-i', renderedPath, '-vf', 'select=between(n\\,25\\,64),format=rgb24,crop=1:1:960:540', '-frames:v', '40', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', transitionPixels)
  const reds = await readFile(transitionPixels)
  assert.equal(reds.length, 40 * 3)
  for (let frame = 0; frame < 40; frame++) assert.ok(reds[frame * 3] > 245 && reds[frame * 3 + 1] < 8 && reds[frame * 3 + 2] < 8,
    `export frame ${frame + 25} uses the active upper RIFE result`)
  const afterTransition = pixel(await raw(renderedPath, 'select=eq(n\\,65),format=rgb24'), 960, 540)
  assert.ok(afterTransition[2] > 245 && afterTransition[0] < 8 && afterTransition[1] < 8, 'export frame 65 resumes underlying B without an extra endpoint frame')
  const protectedExport = join(temporary, 'stale-output.mp4')
  await writeFile(protectedExport, 'existing export remains intact')
  await assert.rejects(api.renderTimelineProject({ ...renderProject, clips: [project.clips[0], project.clips[1], { ...renderClip, start: 24 }] },
    { root, outputPath: protectedExport, tools: { ...tools, ffmpeg: '/usr/bin/false' }, encoder: 'libx264' }), /eerdere positie/,
    'a stale active transition is rejected by its provenance before invoking the encoder')
  assert.equal(await readFile(protectedExport, 'utf8'), 'existing export remains intact')
  const manifest = JSON.parse(await readFile(join(root, projectId, 'project.json'), 'utf8'))
  assert.ok(manifest.assets.at(-1).path.startsWith('media/originals/'))
  assert.ok(!(await readdir(directory)).some(name => name.includes('.partial.')))
  await assert.rejects(api.captureTimelineTransition(root, { projectId: '../escape', clipId: transition.id }, tools))
  console.log('PASS: RIFE lossless 1080p endpoint captures; fractional trims, exact cut boundaries, VFR timestamps, transformed/transparent lower layers, self/upper exclusion, original preservation, range validation, stale capture signatures and persisted provenance. No provider calls.')
  console.log('PASS: actual 100-frame montage export with a 40-frame RIFE overlay; frame 24 retains trimmed A, frames 25–64 show RIFE, frame 65 resumes B, and stale active results reject before encoding.')
} finally { await rm(temporary, { recursive: true, force: true }) }
