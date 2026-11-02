#!/usr/bin/env node
/** Pure timeline insertion checks; no Electron, media generation or network. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'huphe-timeline-editing-'))
try {
  const bundle = join(temporary, 'editing.mjs')
  await build({ stdin: { contents: `export * from './src/renderer/src/components/video-timeline/timeline-editing'; export * from './src/shared/video-timeline'`, resolveDir: appRoot },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' })
  const { planAssetDrop, placeAsset, assetClip, assetTrackKind, editSnapshot, mergeGesture, newTrack, timelineTracks, clipTrackId } = await import(pathToFileURL(bundle).href)
  const now = '2026-11-02T12:00:00.000Z'
  const video = { id: 'video-source', kind: 'video', name: 'Film.mp4', path: '/test/film.mp4', src: 'huphe://file/test', duration: 2.4, width: 1920, height: 1080 }
  const image = { id: 'logo-source', kind: 'image', name: 'Logo.png', path: '/test/logo.png', src: 'huphe://file/logo', duration: 0, width: 400, height: 200 }
  const audio = { id: 'audio-source', kind: 'audio', name: 'Stem.wav', path: '/test/stem.wav', src: 'huphe://file/audio', duration: 3.01 }
  const tracks = [{ id: 'video-1', kind: 'video', name: 'Video 1' }, { id: 'video-2', kind: 'video', name: 'Video 2' },
    { id: 'audio-1', kind: 'audio', name: 'Audio 1' }, { id: 'audio-2', kind: 'audio', name: 'Audio 2' }]
  const existing = (id, track, start, duration, trackId) => ({ id, track, ...(trackId ? { trackId } : {}), label: id, start, duration,
    activeVariantId: id, variants: [{ id, assetId: track === 'video' ? video.id : audio.id, inPoint: 0.2, createdAt: now }] })
  const project = { schemaVersion: 1, id: 'editing', name: 'Editing', createdAt: now, updatedAt: now,
    width: 1920, height: 1080, fps: 25, targetDuration: 30, tracks, assets: [video, image, audio],
    clips: [existing('first', 'video', 0, 100), existing('second', 'video', 100, 100),
      existing('overlay', 'video', 75, 125, 'video-2'), existing('music', 'audio', 0, 200)] }
  const original = structuredClone(project)
  let checks = 0

  const between = planAssetDrop(project, video, tracks[0], 99, 3)
  assert.deepEqual(between, { trackId: 'video-1', start: 100, duration: 60, insert: true, valid: true })
  const inserted = placeAsset(project, video, tracks[0], between)
  assert.equal(inserted.project.clips.find(clip => clip.id === 'first').start, 0)
  assert.equal(inserted.project.clips.find(clip => clip.id === 'second').start, 160)
  assert.equal(inserted.project.clips.find(clip => clip.id === 'overlay').start, 75, 'an overlapping upper video layer retains its time')
  assert.equal(inserted.project.clips.find(clip => clip.id === 'music').start, 0, 'music on another track does not move')
  assert.equal(inserted.clip.start, 100); assert.equal(inserted.clip.duration, 60)
  assert.equal(inserted.clip.variants[0].inPoint, 0)
  assert.equal(inserted.clip.variants[0].assetId, video.id)
  assert.equal(inserted.clip.activeVariantId, inserted.clip.variants[0].id)
  assert.deepEqual(inserted.project.assets, project.assets, 'dragging adds an instance, not a replacement source')
  assert.deepEqual(project, original, 'drop planning/placement does not mutate the original project')
  checks++

  const prepend = planAssetDrop(project, video, tracks[0], -4, 3)
  assert.equal(prepend.start, 0); assert.equal(prepend.insert, true); assert.equal(prepend.valid, true)
  const prepended = placeAsset(project, video, tracks[0], prepend)
  assert.deepEqual(prepended.project.clips.filter(clip => ['first', 'second'].includes(clip.id)).map(clip => clip.start), [60, 160])
  assert.equal(prepended.project.clips.find(clip => clip.id === 'overlay').start, 75)
  checks++

  const inside = planAssetDrop(project, video, tracks[0], 50, 2)
  assert.equal(inside.valid, false, 'dropping inside existing video is rejected, not overwritten')
  assert.equal(inside.insert, false)
  checks++

  const gapProject = { ...project, clips: project.clips.map(clip => clip.id === 'second' ? { ...clip, start: 200 } : clip) }
  const free = planAssetDrop(gapProject, video, tracks[0], 130.4, 2)
  assert.deepEqual(free, { trackId: 'video-1', start: 130, duration: 60, insert: false, valid: true })
  const placed = placeAsset(gapProject, video, tracks[0], free)
  assert.equal(placed.project.clips.find(clip => clip.id === 'second').start, 200, 'free-space placement leaves following clips fixed')
  assert.equal(planAssetDrop(gapProject, video, tracks[0], 150, 2).valid, false, 'insufficient free space cannot overlap the next clip')
  assert.equal(planAssetDrop(gapProject, video, tracks[0], 300, 2).valid, true, 'placement exactly after the last clip is valid')
  checks++

  for (const [asset, track] of [[video, tracks[2]], [image, tracks[2]], [audio, tracks[0]]])
    assert.equal(planAssetDrop({ ...project, clips: [] }, asset, track, 0, 0).valid, false, `${asset.kind} cannot drop onto ${track.kind}`)
  assert.equal(assetTrackKind(image), 'video'); assert.equal(assetTrackKind(audio), 'audio')
  checks++

  const voiceDrop = planAssetDrop(project, audio, tracks[3], 100, 0)
  assert.equal(voiceDrop.valid, true, 'an empty second audio track permits overlap with music')
  assert.equal(voiceDrop.duration, 75, 'source duration rounds down to whole usable frames')
  const voice = placeAsset(project, audio, tracks[3], voiceDrop)
  assert.deepEqual(voice.project.clips.slice(0, -1), project.clips)
  assert.equal(voice.clip.trackId, 'audio-2')
  checks++

  const emptyUpper = { ...project, clips: project.clips.filter(clip => clip.id !== 'overlay') }
  const logoDrop = planAssetDrop(emptyUpper, image, tracks[1], 25, 0)
  assert.equal(logoDrop.valid, true); assert.equal(logoDrop.duration, 100, 'still images have four seconds of initial timeline duration')
  const logo = placeAsset(emptyUpper, image, tracks[1], logoDrop).clip
  assert.deepEqual(logo.transform, { scale: 0.25, x: 0.5, y: 0.5 }, 'an upper-layer image starts at logo size')
  assert.equal(logo.variants[0].inPoint, 0)
  assert.equal(assetClip(project, image, tracks[0], 0).transform, undefined, 'base-layer image starts fitted to the frame')
  checks++

  const legacy = { ...project, tracks: undefined, clips: project.clips.filter(clip => !clip.trackId) }
  const [legacyVideo, legacyAudio] = timelineTracks(legacy)
  assert.equal(legacyVideo.id, 'video-1'); assert.equal(legacyAudio.id, 'audio-1')
  assert.equal(clipTrackId(legacy.clips[0]), 'video-1')
  const legacyDrop = planAssetDrop(legacy, video, legacyVideo, 100, 0)
  assert.equal(legacyDrop.valid, true)
  assert.equal(placeAsset(legacy, video, legacyVideo, legacyDrop).project.clips.find(clip => clip.id === 'second').start, 160)
  assert.equal(newTrack(legacy, 'video').name, 'Video 2')
  assert.equal(newTrack(legacy, 'audio').name, 'Audio 2')
  checks++

  const extraTrack = newTrack(project, 'video')
  assert.equal(extraTrack.name, 'Video 3')
  assert.ok(!tracks.some(track => track.id === extraTrack.id))
  const withExtra = { ...project, tracks: [...tracks, extraTrack] }
  const extraDrop = planAssetDrop(withExtra, image, extraTrack, 50, 0)
  assert.equal(extraDrop.valid, true)
  assert.equal(placeAsset(withExtra, image, extraTrack, extraDrop).clip.trackId, extraTrack.id)
  checks++

  const snapshot = editSnapshot(project)
  snapshot.clips[0].variants[0].inPoint = 999
  snapshot.tracks[0].name = 'Changed'
  assert.deepEqual(project, original, 'undo snapshots own clip variants and track metadata')
  const repeated = assetClip(project, video, tracks[0], 0)
  assert.notEqual(repeated.id, inserted.clip.id)
  assert.notEqual(repeated.variants[0].id, inserted.clip.variants[0].id)
  checks++
  const nearLimit = { ...project, clips: [existing('last', 'video', 89_900, 100)] }
  assert.equal(planAssetDrop(nearLimit, video, tracks[0], 89_900, 0).valid, false, 'insertion cannot shift existing media past the one-hour storage limit')
  assert.equal(planAssetDrop({ ...project, clips: [] }, video, tracks[0], 89_941, 0).valid, false, 'a new clip cannot end past one hour')
  assert.equal(planAssetDrop({ ...project, clips: [] }, video, tracks[0], 89_940, 0).valid, true, 'a clip ending exactly at one hour is allowed')
  for (const frame of [Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(planAssetDrop(project, video, tracks[0], frame, 0).valid, false, 'non-finite pointer coordinates cannot produce a valid edit')
  checks++

  const gesture = structuredClone(project)
  const gestureClip = gesture.clips.find(clip => clip.id === 'first')
  gestureClip.start = 30; gestureClip.duration = 70; gestureClip.trackId = 'video-2'
  gestureClip.variants[0].inPoint = 0.6
  const completion = { prompt: 'A finished generation', modelId: 'seedance-test', provider: 'fal', resolution: '720p', aspectRatio: '16:9', requestedDuration: 4 }
  const completedAsset = { ...video, id: 'completed-source', name: 'Completed.mp4', duration: 4.04 }
  const completedVariant = { id: 'completed-variant', assetId: completedAsset.id, createdAt: now, inPoint: 0.12, generation: completion, requestId: 'provider-request' }
  const live = structuredClone(project)
  live.name = 'Saved while dragging'
  live.assets.push(completedAsset)
  live.jobs = [{ id: 'completed-job', clipId: 'first', createdAt: now, generation: completion, status: 'completed', assetId: completedAsset.id }]
  live.tracks.push({ id: 'new-audio', kind: 'audio', name: 'New live track' })
  const liveFirst = live.clips.find(clip => clip.id === 'first')
  liveFirst.variants[0].requestId = 'metadata-updated-during-gesture'
  liveFirst.variants.push(completedVariant)
  liveFirst.activeVariantId = completedVariant.id
  liveFirst.generation = completion
  liveFirst.label = 'Name updated while dragging'
  const newLiveClip = existing('new-live-clip', 'audio', 250, 25, 'new-audio')
  live.clips.push(newLiveClip)
  live.clips = live.clips.filter(clip => clip.id !== 'overlay')
  const liveBefore = structuredClone(live)
  const gestureBefore = structuredClone(gesture)
  const merged = mergeGesture(live, gesture)
  const mergedFirst = merged.clips.find(clip => clip.id === 'first')
  assert.equal(mergedFirst.start, 30); assert.equal(mergedFirst.duration, 70); assert.equal(mergedFirst.trackId, 'video-2')
  assert.equal(mergedFirst.variants[0].inPoint, 0.6, 'the gesture still applies the requested source trim')
  assert.equal(mergedFirst.variants[0].requestId, 'metadata-updated-during-gesture', 'editing an existing variant trim preserves its newly received metadata')
  assert.deepEqual(mergedFirst.variants.find(variant => variant.id === completedVariant.id), completedVariant, 'completed variant and its source in-point survive an older gesture snapshot')
  assert.equal(mergedFirst.activeVariantId, completedVariant.id, 'the current active variant survives')
  assert.equal(mergedFirst.label, liveFirst.label)
  assert.deepEqual(mergedFirst.generation, completion)
  assert.deepEqual(merged.assets, live.assets); assert.deepEqual(merged.jobs, live.jobs); assert.deepEqual(merged.tracks, live.tracks)
  assert.equal(merged.name, live.name)
  assert.deepEqual(merged.clips.find(clip => clip.id === newLiveClip.id), newLiveClip, 'new live clips are retained')
  assert.equal(merged.clips.some(clip => clip.id === 'overlay'), false, 'an old gesture cannot resurrect a clip deleted from live state')
  assert.deepEqual(live, liveBefore); assert.deepEqual(gesture, gestureBefore)
  checks++
  console.log(`PASS: ${checks} timeline editing scenarios — boundary insertion, target-track isolation, occupied/free space, media type, image defaults, audio overlap, legacy/new tracks, undo snapshots, duration limit and concurrent generation preservation.`)
} finally { await rm(temporary, { recursive: true, force: true }) }
