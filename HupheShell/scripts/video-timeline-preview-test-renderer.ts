import { TimelinePreviewController, previewAudioSchedule } from '../src/renderer/src/components/video-timeline/timeline-preview-controller'
import { newTimelineProject, visualClipRect, type TimelineAsset, type TimelineClip } from '../src/shared/video-timeline'

declare const PREVIEW_FIXTURES: Record<string, string>
declare global { interface Window { __previewResult?: unknown } }

const passes: string[] = []
const errors: string[] = []
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function until(test: () => boolean, label: string) {
  const deadline = performance.now() + 12000
  while (performance.now() < deadline) { if (test()) return; await wait(20) }
  throw new Error(`Timeout: ${label}`)
}
function closeColor(actual: number[], expected: number[], tolerance = 5) {
  return expected.every((value, index) => Math.abs(actual[index] - value) <= tolerance)
}

async function run() {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'width:960px;height:540px'
  const videos = [document.createElement('video'), document.createElement('video')] as [HTMLVideoElement, HTMLVideoElement]
  videos.forEach(video => { video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0' })
  host.append(canvas, ...videos)
  document.body.append(host)
  const controller = new TimelinePreviewController(canvas, videos, { onPosition: () => {}, onPlaying: () => {}, onError: message => errors.push(message) })
  try {
    const logoCanvas = document.createElement('canvas')
    logoCanvas.width = logoCanvas.height = 100
    const logoContext = logoCanvas.getContext('2d')!
    logoContext.fillStyle = '#ff0000'
    logoContext.fillRect(25, 25, 50, 50)
    const assets: TimelineAsset[] = [
      { id: 'A', kind: 'video', name: 'A', path: '', src: PREVIEW_FIXTURES.A, duration: 6, width: 1920, height: 1080 },
      { id: 'B', kind: 'video', name: 'B', path: '', src: PREVIEW_FIXTURES.B, duration: 5, width: 1920, height: 1080 },
      { id: 'logo', kind: 'image', name: 'logo', path: '', src: logoCanvas.toDataURL(), duration: 0, width: 100, height: 100 },
      { id: 'audio', kind: 'audio', name: 'audio', path: '', src: PREVIEW_FIXTURES.audio, duration: 7 },
    ]
    const makeClip = (id: string, assetId: string, track: 'video' | 'audio', trackId: string, start: number, duration: number): TimelineClip => ({
      id, label: id, track, trackId, start, duration, activeVariantId: id, variants: [{ id, assetId, inPoint: 0, createdAt: new Date().toISOString() }],
    })
    const baseA = makeClip('base-A', 'A', 'video', 'video-1', 0, 50)
    const baseB = makeClip('base-B', 'B', 'video', 'video-1', 50, 50)
    const upper = { ...makeClip('upper-B', 'B', 'video', 'video-2', 0, 75), transform: { scale: 0.5, x: 0.5, y: 0.5 }, opacity: 0.5 }
    const logo = { ...makeClip('logo', 'logo', 'video', 'video-3', 0, 100), transform: { scale: 0.25, x: 0.8, y: 0.2 }, opacity: 0.5 }
    const music = { ...makeClip('music', 'audio', 'audio', 'audio-1', 0, 100), gain: 0.25 }
    const voice = { ...makeClip('voice', 'audio', 'audio', 'audio-2', 0, 100), gain: 0.75 }
    const project = { ...newTimelineProject('Preview layers'), assets, clips: [baseA, baseB, upper, logo, music, voice], tracks: [
      { id: 'video-1', kind: 'video' as const, name: 'Video 1' }, { id: 'video-2', kind: 'video' as const, name: 'Video 2' },
      { id: 'video-3', kind: 'video' as const, name: 'Logo' }, { id: 'audio-1', kind: 'audio' as const, name: 'Music' },
      { id: 'audio-2', kind: 'audio' as const, name: 'Voice' },
    ] }
    const pixel = (x: number, y: number) => [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data].slice(0, 3)
    const blue = [21, 72, 106]
    const brown = [129, 80, 32]
    const half = (a: number[], b: number[]) => a.map((value, index) => (value + b[index]) / 2)
    controller.setProject(project)
    controller.syncPosition(0.5)
    await until(() => closeColor(pixel(600, 400), half(blue, brown)), 'two composited video sources')
    assert(document.querySelectorAll('video').length === 6, 'Each video track owns two slots')
    assert(closeColor(pixel(100, 100), blue), 'Base video remains visible outside the scaled upper video')
    const rect = visualClipRect(project, logo, assets[2])
    assert(closeColor(pixel(rect.x + 20, rect.y + 20), blue), 'Transparent PNG border reveals the base video')
    assert(closeColor(pixel(rect.x + rect.width / 2, rect.y + rect.height / 2), half(blue, [255, 0, 0])), 'PNG alpha and clip opacity both apply')
    passes.push('Two simultaneous video layers plus a transparent, positioned PNG use the shared export geometry and opacity')

    const schedule = previewAudioSchedule(project, 0.5)
    assert(schedule.length === 2 && schedule[0].gain === 0.25 && schedule[1].gain === 0.75, 'Both audio tracks retain their gains')
    assert(schedule.every(item => item.offset === 0.5 && item.delay === 0 && item.duration === 3.5), 'Both audio sources share the same montage position')
    controller.syncPosition(1.75)
    controller.setPlaying(true)
    await until(() => canvas.dataset.previewState === 'playing' && Number(canvas.dataset.timelineTime) > 2.2, 'shared playback across a base-track cut')
    assert(Number(canvas.dataset.audioSourceCount) === 2, 'Both audio sources are scheduled simultaneously')
    assert(closeColor(pixel(100, 100), brown), 'The base-track cut is visible during playback')
    assert(closeColor(pixel(rect.x + rect.width / 2, rect.y + rect.height / 2), half(brown, [255, 0, 0])), 'Logo remains composited across the lower-track cut')
    assert(Number(canvas.dataset.rebufferCount ?? 0) === 0, 'Each track preloads its next cut without rebuffering')
    passes.push('Shared Web Audio clock schedules both audio tracks with independent gain while video and PNG layers cross a preloaded cut')

    controller.setPlaying(false)
    controller.syncPosition(3.5)
    await until(() => canvas.dataset.layerCount === '2' && closeColor(pixel(100, 100), brown), 'upper video track is empty')
    assert(closeColor(pixel(600, 400), brown), 'Empty upper track does not cover the lower video')
    controller.syncPosition(0.5)
    await until(() => closeColor(pixel(600, 400), half(blue, brown)), 'seek back into overlapping tracks')
    const snapshots: number[][] = []
    for (const target of [0.8, 1.1, 1.4, 1.7, 1.2, 0.6]) {
      controller.syncPosition(target)
      snapshots.push(pixel(100, 100))
      await wait(12)
      snapshots.push(pixel(100, 100))
    }
    assert(snapshots.every(color => color.some(value => value > 10)), 'Scrubbing keeps decoded compositions instead of black frames')
    passes.push('Empty upper tracks are transparent; backward and rapid multi-layer seeking retains the visible composition')

    controller.setProject({ ...project, tracks: [project.tracks[0], project.tracks[3]], clips: [baseA, baseB, music] })
    await until(() => document.querySelectorAll('video').length === 2 && canvas.dataset.layerCount === '1' && closeColor(pixel(600, 400), blue), 'removed tracks release video slots and remove overlays')
    assert(!errors.length, `No preview errors: ${errors.join('; ')}`)
    passes.push('Removing tracks releases their video elements and overlays while the primary player remains usable')
  } finally {
    controller.dispose()
  }
  assert(document.querySelectorAll('video').length === 2 && videos.every(video => !video.hasAttribute('src')), 'Disposal removes owned players and releases primary media')
  return { ok: true, passed: passes, errors, paidCalls: 0 }
}

void run().then(result => { window.__previewResult = result }).catch(error => { window.__previewResult = { ok: false, passed: passes, errors, error: error.stack ?? String(error) } })
