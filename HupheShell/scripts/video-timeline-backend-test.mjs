#!/usr/bin/env node
/** Local storage and media-boundary checks. No network or generation API. */
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'huphe-timeline-backend-'))
try {
  const bundle = join(temporary, 'backend.mjs')
  await build({ stdin: { contents: `export * from './src/main/lib/video-timeline-media'; export * from './src/main/lib/video-timeline-storage'; export * from './src/main/lib/video-timeline-export'; export * from './src/main/lib/video-timeline-references'; export * from './src/shared/video-timeline'`, resolveDir: appRoot },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' })
  const backend = await import(pathToFileURL(bundle).href)
  const tools = await backend.requireTimelineTools()
  const root = join(temporary, 'projects')
  const original = join(temporary, 'source.wav')
  const wav = Buffer.alloc(44 + 48000 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
  await writeFile(original, wav)
  const audio = await backend.importTimelineSources(root, 'project-1', 'audio', [{ src: pathToFileURL(original).href }], tools)
  assert.equal(audio.length, 1)
  assert.equal(audio[0].duration, 1)
  assert.equal(audio[0].sampleRate, 48000)
  assert.deepEqual(await readFile(audio[0].path), wav)
  assert.deepEqual(await readFile(original), wav, 'original remains unchanged')
  assert.equal(backend.localTimelineSource(audio[0].src), audio[0].path)
  for (const src of ['https://example.com/video.mp4', 'data:video/mp4;base64,AAAA', 'relative.mp4', 'huphe://other/%2Ftmp%2Fa.mp4'])
    assert.throws(() => backend.localTimelineSource(src))
  const now = new Date().toISOString()
  const generation = { prompt: 'Local test only', modelId: 'test-model', provider: 'fal', resolution: '1080p', aspectRatio: '16:9', requestedDuration: 5 }
  const project = { schemaVersion: 1, id: 'project-1', name: 'Storage test', createdAt: now, updatedAt: now,
    width: 1920, height: 1080, fps: 25, targetDuration: 30, assets: audio, clips: [],
    jobs: [{ id: 'job-1', clipId: 'clip-1', createdAt: now, generation, status: 'running' }] }
  const saved = await backend.saveTimelineProject(root, project)
  assert.equal(saved.jobs[0].status, 'running')
  const loaded = await backend.loadTimelineProject(root, project.id)
  assert.equal(loaded.jobs[0].status, 'unknown', 'restart cannot imply a paid job is still running')
  assert.deepEqual(loaded.jobs[0].generation, generation)
  const operations = []
  for (let n = 0; n < 8; n++) operations.push(backend.saveTimelineProject(root, { ...project, name: `Version ${n}` }))
  await Promise.all(operations)
  assert.equal((await backend.loadTimelineProject(root, project.id)).name, 'Version 7', 'concurrent saves retain invocation order')
  const manifestPath = join(root, project.id, 'project.json')
  const onDisk = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.ok(onDisk.assets[0].path.startsWith('media/originals/'), 'disk manifest uses portable relative paths')
  const backup = JSON.parse(await readFile(join(root, project.id, 'project.previous.json'), 'utf8'))
  assert.equal(backup.name, 'Version 6')
  const movedRoot = join(temporary, 'moved-projects')
  await cp(join(root, project.id), join(movedRoot, project.id), { recursive: true })
  const moved = await backend.loadTimelineProject(movedRoot, project.id)
  assert.ok(moved.assets[0].path.startsWith(await realpath(movedRoot)))
  assert.deepEqual(await readFile(moved.assets[0].path), wav)
  await writeFile(manifestPath, '{truncated')
  const recovered = await backend.listTimelineProjects(root)
  assert.equal(recovered.projects[0].name, 'Version 6')
  assert.match(recovered.errors[0], /vorige geldige versie is hersteld/)
  assert.equal((await backend.loadTimelineProject(root, project.id)).name, 'Version 6')
  const listing = await backend.listTimelineProjects(root)
  assert.equal(listing.projects.length, 1)
  assert.deepEqual(listing.errors, [])
  assert.ok(!(await readdir(join(root, project.id))).some(name => name.endsWith('.tmp')))
  await assert.rejects(backend.saveTimelineProject(root, { ...project, id: '../escape' }))
  await assert.rejects(backend.saveTimelineProject(root, { ...project, assets: [{ ...audio[0], path: original }] }), /behoort niet/)
  const originals = join(root, project.id, 'media', 'originals')
  const link = join(originals, 'escape.wav')
  await symlink(original, link)
  await assert.rejects(backend.saveTimelineProject(root, { ...project, assets: [{ ...audio[0], path: link }] }), /behoort niet/)
  const outside = join(temporary, 'outside')
  await mkdir(outside)
  await symlink(outside, join(root, 'project-escape'))
  await assert.rejects(backend.timelineProjectDirectory(root, 'project-escape'), /buiten/)
  const bad = join(temporary, 'invalid.wav')
  await writeFile(bad, 'not audio')
  const before = await readdir(originals)
  await assert.rejects(backend.importTimelineSources(root, project.id, 'audio', [{ src: original }, { src: bad }], tools))
  assert.deepEqual(await readdir(originals), before, 'failed batch cleans its own partial and completed copies')
  const existing = join(temporary, 'existing.mp4')
  await writeFile(existing, 'keep this existing export')
  await assert.rejects(backend.renderTimelineProject(project, { root, outputPath: existing, tools }), /videofragment/)
  assert.equal(await readFile(existing, 'utf8'), 'keep this existing export')
  assert.doesNotThrow(() => backend.parseTimelineProject({ ...project, clips: [{ id: 'empty', track: 'video', label: 'Draft', start: 0, duration: 25, variants: [], generation: { ...generation, modelId: '' } }] }))

  const extendedGeneration = { ...generation, requestedDuration: 'auto', referenceAssetId: 'start-image', endImageAssetId: 'end-image',
    referenceAssetIds: ['video-reference', 'audio-reference'], task: 'extension', draft: true, generateAudio: true,
    seed: 123, bitrateMode: 'high', codec: 'H265' }
  const extended = { ...project, clips: [{ id: 'clip-1', track: 'video', label: 'Draft', start: 0, duration: 100,
    generation: extendedGeneration, activeVariantId: 'final', variants: [{ id: 'draft', assetId: audio[0].id, createdAt: now, inPoint: 0,
      generation: extendedGeneration, draftId: 'provider-draft-1', draftDuration: 5.04 },
    { id: 'final', assetId: audio[0].id, createdAt: now, inPoint: 0, finalizedFromVariantId: 'draft', generation: extendedGeneration }] }],
    jobs: [{ id: 'job-final', clipId: 'clip-1', createdAt: now, generation: extendedGeneration, status: 'completed', kind: 'finalize', sourceVariantId: 'draft' }] }
  await backend.saveTimelineProject(root, extended)
  const extendedLoaded = await backend.loadTimelineProject(root, extended.id)
  assert.deepEqual(extendedLoaded.clips, extended.clips, 'all generation options and draft/final links survive restart')
  assert.deepEqual(extendedLoaded.jobs, extended.jobs, 'finalization snapshot survives restart')
  for (const patch of [{ requestedDuration: 'invalid' }, { seed: 0.5 }, { codec: 'AV1' }, { task: 'unknown' }])
    assert.throws(() => backend.parseTimelineProject({ ...extended, clips: [{ ...extended.clips[0], generation: { ...extendedGeneration, ...patch } }] }))

  // Real tiny files exercise decoded audio, HEVC preview conversion and upload boundaries locally.
  const videoSource = join(temporary, 'with-audio.mp4')
  const silentSource = join(temporary, 'silent.mp4')
  const hevcSource = join(temporary, 'hevc.mp4')
  const hevcSilentSource = join(temporary, 'hevc-silent.mp4')
  const tenBitSource = join(temporary, '10bit.mp4')
  const imageSource = join(temporary, 'reference.png')
  const longAudioSource = join(temporary, 'long.wav')
  const ffmpeg = async (...args) => backend.runTimelineTool(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=green:s=128x72:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoSource)
  await ffmpeg('-i', videoSource, '-an', '-c:v', 'copy', silentSource)
  await ffmpeg('-i', videoSource, '-c:v', 'libx265', '-x265-params', 'log-level=error:pools=1', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-tag:v', 'hvc1', hevcSource)
  await ffmpeg('-i', hevcSource, '-an', '-c:v', 'copy', hevcSilentSource)
  await ffmpeg('-i', silentSource, '-c:v', 'libx265', '-x265-params', 'log-level=error:pools=1', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', tenBitSource)
  await ffmpeg('-i', videoSource, '-frames:v', '1', imageSource)
  await ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '16', '-c:a', 'pcm_s16le', longAudioSource)
  const videoAssets = await backend.importTimelineSources(root, 'media-tests', 'video', [{ src: videoSource }, { src: silentSource }, { src: hevcSource }, { src: hevcSilentSource }], tools)
  const images = await backend.importTimelineSources(root, 'media-tests', 'image', [{ src: imageSource }], tools)
  const longAudio = await backend.importTimelineSources(root, 'media-tests', 'audio', [{ src: longAudioSource }], tools)
  const mediaProject = { ...project, id: 'media-tests', assets: [...videoAssets, ...images, ...longAudio], jobs: [] }
  await backend.saveTimelineProject(root, mediaProject)
  assert.deepEqual(backend.timelineTracks(project).map(track => track.id), ['video-1', 'audio-1'], 'legacy projects keep their original implicit tracks')
  const tracks = [{ id: 'video-1', kind: 'video', name: 'Film' }, { id: 'logo', kind: 'video', name: 'Logo' },
    { id: 'audio-1', kind: 'audio', name: 'Muziek' }, { id: 'voice', kind: 'audio', name: 'Voice-over' }, { id: 'empty-audio', kind: 'audio', name: 'Leeg spoor' }]
  const makeClip = (id, track, trackId, asset, extra = {}) => ({ id, track, trackId, label: id, start: 0, duration: 25,
    activeVariantId: id, variants: [{ id, assetId: asset.id, createdAt: now, inPoint: 0 }], ...extra })
  const layered = { ...mediaProject, tracks, clips: [makeClip('film', 'video', 'video-1', videoAssets[0]),
    makeClip('logo', 'video', 'logo', images[0], { duration: 100, transform: { scale: 0.25, x: 0.8, y: 0.2 }, opacity: 0.7 }),
    makeClip('music', 'audio', 'audio-1', longAudio[0], { gain: 0.4 }), makeClip('voice', 'audio', 'voice', longAudio[0], { gain: 1.2 })] }
  assert.deepEqual(backend.timelineProblems(layered), [], 'different tracks overlap; still image duration is independent of source duration')
  await backend.saveTimelineProject(root, layered)
  const layeredLoaded = await backend.loadTimelineProject(root, layered.id)
  assert.deepEqual(layeredLoaded.tracks, tracks, 'empty tracks and layer order survive save/reload')
  assert.deepEqual(layeredLoaded.clips, layered.clips, 'track assignment, geometry, opacity and gain survive save/reload')
  const overlapping = { ...layered, clips: [...layered.clips, { ...layered.clips[0], id: 'collision', start: 10 }] }
  assert.ok(backend.timelineProblems(overlapping).some(problem => problem.includes('overlap')), 'same-track overlap blocks export')
  assert.throws(() => backend.parseTimelineProject({ ...layered, tracks: [...tracks, tracks[0]] }), /Dubbele/)
  assert.throws(() => backend.parseTimelineProject({ ...layered, clips: [{ ...layered.clips[0], trackId: 'voice' }] }), /ander type/)
  assert.throws(() => backend.parseTimelineProject({ ...layered, clips: [{ ...layered.clips[0], trackId: 'missing' }] }), /bestaat niet/)
  for (const extra of [{ gain: 2.1 }, { opacity: -0.1 }, { transform: { scale: 0, x: 0.5, y: 0.5 } }])
    assert.throws(() => backend.parseTimelineProject({ ...layered, clips: [{ ...layered.clips[0], ...extra }] }))
  assert.deepEqual(backend.visualClipRect(layered, layered.clips[1], images[0]), { width: 480, height: 270, x: 1296, y: 81 })
  await backend.saveTimelineProject(root, mediaProject)
  const hevc = videoAssets[2]
  assert.ok(hevc.previewPath && hevc.previewSrc, 'HEVC gets a separate browser preview')
  assert.notEqual(hevc.path, hevc.previewPath)
  assert.deepEqual(await readFile(hevc.path), await readFile(hevcSource), 'HEVC original remains byte-for-byte intact')
  const previewInfo = JSON.parse(await backend.runTimelineTool(tools.ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', hevc.previewPath]))
  assert.equal(previewInfo.streams[0].codec_name, 'h264')
  assert.equal(Number(previewInfo.streams[0].duration), hevc.duration)
  const previewAudio = previewInfo.streams.find(stream => stream.codec_type === 'audio')
  assert.equal(previewAudio?.codec_name, 'aac', 'HEVC variant preview retains audible audio')
  assert.equal(previewAudio.channels, 1)
  assert.ok(Math.abs(Number(previewAudio.duration) - hevc.duration) < 0.05, 'preview audio keeps the source duration')
  const silentPreviewInfo = JSON.parse(await backend.runTimelineTool(tools.ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', videoAssets[3].previewPath]))
  assert.equal(silentPreviewInfo.streams[0].codec_name, 'h264')
  assert.equal(silentPreviewInfo.streams.some(stream => stream.codec_type === 'audio'), false, 'HEVC without audio remains supported')
  await assert.rejects(backend.importTimelineSources(root, 'media-tests', 'video', [{ src: tenBitSource }], tools), /HDR, 10-bit/)
  const previewManifest = JSON.parse(await readFile(join(root, 'media-tests', 'project.json'), 'utf8'))
  assert.ok(previewManifest.assets[2].previewPath.startsWith('media/previews/'))
  assert.equal(previewManifest.assets[2].previewSrc, '')
  await cp(join(root, 'media-tests'), join(movedRoot, 'media-tests'), { recursive: true })
  const movedMedia = await backend.loadTimelineProject(movedRoot, 'media-tests')
  assert.ok(movedMedia.assets[2].previewPath.startsWith(await realpath(movedRoot)))
  assert.equal(backend.localTimelineSource(movedMedia.assets[2].previewSrc), movedMedia.assets[2].previewPath)
  await assert.rejects(backend.saveTimelineProject(root, { ...mediaProject, assets: [{ ...hevc, previewPath: hevc.path }] }), /previewkopie behoort niet/)
  const previewLink = join(root, 'media-tests', 'media', 'previews', 'escape.mp4')
  await symlink(silentSource, previewLink)
  await assert.rejects(backend.saveTimelineProject(root, { ...mediaProject, assets: [{ ...hevc, previewPath: previewLink }] }), /previewkopie behoort niet/)

  const extracted = await backend.extractTimelineAudio(root, { projectId: 'media-tests', assetId: videoAssets[0].id }, tools)
  assert.equal(extracted.kind, 'audio')
  assert.equal(extracted.sampleRate, 48000)
  assert.ok(Math.abs(extracted.duration - 2) < 0.05)
  assert.deepEqual(await readFile(videoAssets[0].path), await readFile(videoSource), 'audio extraction preserves original video')
  const expectedPcm = join(temporary, 'expected.pcm')
  const actualPcm = join(temporary, 'actual.pcm')
  await ffmpeg('-i', videoSource, '-map', '0:a:0', '-f', 'f32le', '-c:a', 'pcm_f32le', expectedPcm)
  await ffmpeg('-i', extracted.path, '-f', 'f32le', '-c:a', 'pcm_f32le', actualPcm)
  assert.deepEqual(await readFile(actualPcm), await readFile(expectedPcm), 'extracted WAV preserves decoded samples exactly')
  const beforeNoAudio = await readdir(join(root, 'media-tests', 'media', 'originals'))
  await assert.rejects(backend.extractTimelineAudio(root, { projectId: 'media-tests', assetId: videoAssets[1].id }, tools), /geen bruikbaar geluid/)
  assert.deepEqual(await readdir(join(root, 'media-tests', 'media', 'originals')), beforeNoAudio, 'no-audio failure leaves no copies')
  await assert.rejects(backend.extractTimelineAudio(root, { projectId: 'media-tests', assetId: 'missing' }, tools), /opgeslagen videobron/)

  mediaProject.assets.push(extracted)
  await backend.saveTimelineProject(root, mediaProject)
  const uploads = []
  const uploader = async input => { uploads.push(input); return `https://test.invalid/reference-${uploads.length}` }
  const uploadRequest = { projectId: 'media-tests', assetIds: [images[0].id, videoAssets[0].id, extracted.id], accessToken: 'test-access-token' }
  const references = await backend.prepareTimelineReferences(root, uploadRequest, uploader, tools)
  assert.deepEqual(references, { imageUrls: ['https://test.invalid/reference-1'], videoUrls: ['https://test.invalid/reference-2'], audioUrls: ['https://test.invalid/reference-3'] })
  assert.equal(uploads[0].contentType, 'image/png')
  assert.deepEqual(uploads[1].buffer, await readFile(videoAssets[0].path))
  assert.equal(uploads[2].contentType, 'audio/wav')
  assert.ok(uploads.every(upload => upload.accessToken === uploadRequest.accessToken))
  const fresh = await backend.prepareTimelineReferences(root, uploadRequest, uploader, tools)
  assert.notDeepEqual(fresh, references, 'every job gets freshly uploaded URLs')
  assert.ok(!(await readFile(join(root, 'media-tests', 'project.json'), 'utf8')).includes('https://test.invalid'), 'ephemeral upload URLs never persist')
  // The same owned media takes different routes and constraints per model.
  const wanAudio = await backend.prepareTimelineReferences(root, { ...uploadRequest, modelId: 'fal-ai/wan-25-preview', assetIds: [longAudio[0].id] }, uploader, tools)
  assert.equal(wanAudio.audioUrls.length, 1, 'Wan accepts its own 3–30 s WAV reference range')
  const veoExtension = await backend.prepareTimelineReferences(root, { ...uploadRequest, modelId: 'fal-ai/veo3.1', task: 'extension', assetIds: [videoAssets[0].id] }, uploader, tools)
  assert.equal(veoExtension.videoUrls.length, 1)
  const veoImage = await backend.prepareTimelineReferences(root, { ...uploadRequest, modelId: 'fal-ai/veo3.1', task: 'reference', assetIds: [images[0].id] }, uploader, tools)
  assert.equal(veoImage.imageUrls.length, 1)
  const uploadCount = uploads.length
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, assetIds: ['missing'] }, uploader, tools), /behoort niet/)
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, assetIds: [images[0].id, images[0].id] }, uploader, tools), /één keer/)
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, projectId: 'project-1', assetIds: [audio[0].id] }, uploader, tools), /1,8 en 30,2/)
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, modelId: 'fal-ai/wan-25-preview', assetIds: [extracted.id] }, uploader, tools), /tussen 3 en 30/)
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, modelId: 'fal-ai/veo3.1', task: 'reference', assetIds: [videoAssets[0].id] }, uploader, tools), /Maximaal 0 video/)
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, modelId: 'fal-ai/wan-25-preview', assetIds: [images[0].id] }, uploader, tools), /Maximaal 0 image/)
  for (const [kind, base, count, mb] of [['image', images[0], 31, 30], ['video', videoAssets[0], 11, 200], ['audio', extracted, 11, 15]]) {
    const duplicates = Array.from({ length: count }, (_, i) => ({ ...base, id: `limit-${kind}-${i}` }))
    await backend.saveTimelineProject(root, { ...mediaProject, assets: duplicates })
    await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, assetIds: duplicates.map(item => item.id) }, uploader, tools), /Maximaal/)
    const bytes = await readFile(base.path)
    await backend.saveTimelineProject(root, { ...mediaProject, assets: [base] })
    await truncate(base.path, mb * 1024 ** 2 + 1)
    await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, assetIds: [base.id] }, uploader, tools), /groter dan/)
    await writeFile(base.path, bytes)
  }
  const duplicateLong = { ...longAudio[0], id: 'second-long-audio' }
  await backend.saveTimelineProject(root, { ...mediaProject, assets: [...mediaProject.assets, duplicateLong] })
  await assert.rejects(backend.prepareTimelineReferences(root, { ...uploadRequest, assetIds: [longAudio[0].id, duplicateLong.id] }, uploader, tools), /totale duur/)
  assert.equal(uploads.length, uploadCount, 'invalid references reject before any upload')
  console.log('PASS: durable import, real probing, original preservation, safe paths/symlinks, batch rollback, atomic ordered saves, portable project copy, damaged-manifest recovery, draft model, job recovery and failed-export preservation.')
  console.log('PASS: all Seedance option snapshots, draft/final provenance, safe fresh reference uploads and limits, exact decoded audio extraction, HEVC-to-H264 preview copy, portable preview paths and HDR/10-bit rejection. No network or paid calls.')
  console.log('PASS: legacy tracks, multiple tracks and empty-track persistence, image overlays, shared pixel geometry, overlap rules, duplicate/mismatched track rejection, opacity and audio gain persistence.')
} finally { await rm(temporary, { recursive: true, force: true }) }
