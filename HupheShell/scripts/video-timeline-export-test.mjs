#!/usr/bin/env node
/** M1a integration check: decode exported pixels/audio; never trust frame counts alone. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile, copyFile, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { run, probe, loadFixtures, generateFixtures, defaultFixtureDirectory } from './video-timeline-fixtures.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = flag => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
const directory = resolve(option('--fixtures') ?? defaultFixtureDirectory)
const testDirectory = join(directory, 'export tests with spaces')
const tools = { ffmpeg: option('--ffmpeg') ?? '/opt/homebrew/bin/ffmpeg', ffprobe: option('--ffprobe') ?? '/opt/homebrew/bin/ffprobe' }
const encoder = option('--encoder') ?? 'h264_videotoolbox'
const report = { generatedAt: new Date().toISOString(), encoder, profile: '1920×1080 / 25 fps / 48 kHz H.264 + AAC', tests: [], limitations: [
  'Local development binaries; packaged LGPL binaries, signing and notarization are not tested here.',
  'These are export tests. Browser presentation, audible-device latency and seeking are separate preview measurements.',
] }

function expected(source, first, count) {
  return Array.from({ length: count }, (_,n) => ({ source, frame: first + n }))
}

async function decodeBarcodes(file) {
  const pixels = await run(tools.ffmpeg, ['-v', 'error', '-i', file, '-an', '-vf',
    'crop=1280:2:160:958,scale=16:1:flags=neighbor,format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], { binaryOutput: true })
  assert.equal(pixels.length % 16, 0, 'A decoded barcode contains exactly 16 cells')
  return Array.from({ length: pixels.length / 16 }, (_, index) => {
    let code = 0
    for (let bit = 0; bit < 16; bit++) {
      const luma = pixels[index * 16 + bit]
      assert.ok(luma < 60 || luma > 190, `Frame ${index}: unreadable barcode bit ${bit} (${luma})`)
      code += (luma > 128 ? 1 : 0) << bit
    }
    return { source: code >> 8, frame: code & 255 }
  })
}

async function decodeMarkers(file) {
  const pixels = await run(tools.ffmpeg, ['-v', 'error', '-i', file, '-an', '-vf',
    'crop=2:2:10:10,scale=1:1,format=rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], { binaryOutput: true })
  return Array.from({ length: pixels.length / 3 }, (_, i) => i)
    .filter(i => pixels[i * 3] > 160 && pixels[i * 3 + 1] < 90 && pixels[i * 3 + 2] > 160)
}

async function decodeAudio(file, expectedPeaks) {
  const data = await run(tools.ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { binaryOutput: true })
  const count = data.length / 4
  const energy = new Float64Array(Math.ceil(count / 48))
  for (let n = 0; n < count; n++) energy[Math.floor(n / 48)] += data.readFloatLE(n * 4) ** 2
  const measurements = expectedPeaks.map(time => {
    const start = Math.max(0, Math.round(time * 1000) - 30)
    const end = Math.min(energy.length - 1, Math.round(time * 1000) + 30)
    let peak = start
    for (let n = start + 1; n <= end; n++) if (energy[n] > energy[peak]) peak = n
    assert.ok(energy[peak] > 0.01, `Audio marker missing around ${time}s`)
    const measured = peak / 1000
    assert.ok(Math.abs(measured - time) <= 0.01, `Audio marker ${time}s shifted to ${measured}s`)
    return { expectedSeconds: time, measuredEnergyPeakSeconds: measured, deviationMs: Number(((measured - time) * 1000).toFixed(3)) }
  })
  const allowed = n => expectedPeaks.some(t => Math.abs(n / 1000 - t) < 0.04)
  const max = energy.reduce((a,b) => Math.max(a,b), 0)
  const unexpected = Array.from(energy.entries()).filter(([n,value]) => !allowed(n) && value > max * 0.02)
  assert.equal(unexpected.length, 0, 'Unexpected audio energy outside the marker windows')
  return measurements
}

/** @returns {Promise<import('../src/shared/video-timeline.ts').TimelineProject>} */
async function makeProject(id, videos, audio) {
  const originals = join(testDirectory, id, 'media', 'originals')
  await mkdir(originals, { recursive: true })
  const names = [...new Set([...videos, ...audio].map(c => c.filename))]
  const assets = []
  for (const [index, filename] of names.entries()) {
    const path = join(originals, filename)
    await copyFile(join(directory, filename), path)
    const metadata = await probe(path, tools.ffprobe)
    const stream = metadata.streams.find(s => s.codec_type === (filename.endsWith('.wav') ? 'audio' : 'video'))
    const fps = stream.avg_frame_rate?.split('/').map(Number)
    assets.push({ id: `asset-${index}`, kind: filename.endsWith('.wav') ? 'audio' : 'video', name: filename,
      path, src: `huphe://file/${encodeURIComponent(path)}`, duration: Number(stream.duration ?? metadata.format.duration),
      width: stream.width, height: stream.height, fps: fps && fps[1] ? fps[0] / fps[1] : undefined,
      sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined })
  }
  const now = new Date().toISOString()
  const clips = [...videos.map(c => ({ ...c, track: 'video' })), ...audio.map(c => ({ ...c, track: 'audio' }))].map((c, i) => {
    const variantId = `variant-${i}`
    return { id: `clip-${i}`, label: c.filename, track: c.track, start: c.start, duration: c.duration,
      activeVariantId: variantId, variants: [{ id: variantId, assetId: assets.find(a => a.name === c.filename).id, createdAt: now, inPoint: c.inPoint }] }
  })
  const project = { schemaVersion: 1, id, name: id, createdAt: now, updatedAt: now,
    width: 1920, height: 1080, fps: 25, targetDuration: Math.max(...clips.map(c => c.start + c.duration)) / 25, assets, clips }
  await writeFile(join(testDirectory, id, 'fixture-project.json'), JSON.stringify(project, null, 2) + '\n')
  return project
}

async function testMultitrack(renderTimelineProject) {
  const id = 'multitrack-logo-audio'
  const originals = join(testDirectory, id, 'media', 'originals')
  await mkdir(originals, { recursive: true })
  const ffmpeg = (...args) => run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
  const videoPath = join(originals, 'blue.mp4')
  const imagePath = join(originals, 'transparent-logo.png')
  const rawImage = join(testDirectory, id, 'logo.rgba')
  const rgba = Buffer.alloc(64 * 64 * 4)
  for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) {
    const index = (y * 64 + x) * 4
    rgba[index] = 255
    rgba[index + 3] = x >= 24 && x < 40 && y >= 24 && y < 40 ? 128 : 255
  }
  await writeFile(rawImage, rgba)
  await ffmpeg('-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '64x64', '-i', rawImage, '-frames:v', '1', imagePath)
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=0x204080:s=320x180:r=25', '-t', '3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath)
  const tone = (frequency, from, until) => {
    const count = 3 * 48000
    const wav = Buffer.alloc(44 + count * 2)
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(count * 2, 40)
    for (let n = 0; n < count; n++) if (n / 48000 >= from && n / 48000 < until)
      wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * n / 48000) * 0.2 * 32767), 44 + n * 2)
    return wav
  }
  const musicPath = join(originals, 'music.wav')
  const voicePath = join(originals, 'voice.wav')
  await writeFile(musicPath, tone(450, 0, 3))
  await writeFile(voicePath, tone(900, 0.75, 1.25))
  const now = new Date().toISOString()
  const assets = [{ id: 'video', kind: 'video', path: videoPath, duration: 3, width: 320, height: 180, fps: 25 },
    { id: 'image', kind: 'image', path: imagePath, duration: 0, width: 64, height: 64 },
    { id: 'music', kind: 'audio', path: musicPath, duration: 3, sampleRate: 48000 },
    { id: 'voice', kind: 'audio', path: voicePath, duration: 3, sampleRate: 48000 }]
    .map(asset => ({ ...asset, name: asset.id, src: `huphe://file/${encodeURIComponent(asset.path)}` }))
  const clip = (assetId, trackId, start, duration, inPoint = 0, extra = {}) => ({ id: assetId, label: assetId,
    track: assetId === 'video' || assetId === 'image' ? 'video' : 'audio', trackId, start, duration,
    activeVariantId: assetId, variants: [{ id: assetId, assetId, createdAt: now, inPoint }], ...extra })
  const project = { schemaVersion: 1, id, name: id, createdAt: now, updatedAt: now,
    width: 320, height: 180, fps: 25, targetDuration: 3, assets,
    tracks: [{ id: 'video-1', kind: 'video', name: 'Film' }, { id: 'video-2', kind: 'video', name: 'Logo' },
      { id: 'audio-1', kind: 'audio', name: 'Muziek' }, { id: 'audio-2', kind: 'audio', name: 'Stem' }],
    clips: [clip('video', 'video-1', 0, 75), clip('image', 'video-2', 25, 25, 0, { opacity: 0.5, transform: { scale: 0.25, x: 0.75, y: 0.25 } }),
      clip('music', 'audio-1', 0, 75, 0, { gain: 0.5 }), clip('voice', 'audio-2', 25, 25, 0.5, { gain: 1.5 })] }
  const originalsBefore = await Promise.all(assets.map(async asset => createHash('sha256').update(await readFile(asset.path)).digest('hex')))
  const outputPath = join(testDirectory, id, 'exports', 'layered.mp4')
  await renderTimelineProject(project, { root: testDirectory, outputPath, tools, encoder })
  const metadata = await probe(outputPath, tools.ffprobe, true)
  assert.equal(metadata.frames.length, 75)
  const pixels = await run(tools.ffmpeg, ['-v', 'error', '-i', outputPath, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { binaryOutput: true })
  const pixel = (frame, x, y) => Array.from(pixels.subarray(((frame * 180 + y) * 320 + x) * 3, ((frame * 180 + y) * 320 + x) * 3 + 3))
  const near = (actual, wanted, label) => actual.forEach((value, channel) => assert.ok(Math.abs(value - wanted[channel]) <= 14, `${label}, channel ${channel}: ${value} versus ${wanted[channel]}`))
  const blue = pixel(0, 10, 10)
  near(blue, [32, 64, 128], 'base video color')
  for (const frame of [0, 24, 50, 74]) near(pixel(frame, 232, 36), blue, `overlay absent on frame ${frame}`)
  for (const frame of [25, 35, 49]) {
    near(pixel(frame, 10, 10), blue, `outside overlay stays visible on frame ${frame}`)
    near(pixel(frame, 220, 25), blue, `transparent logo border on frame ${frame}`)
    near(pixel(frame, 232, 36), blue.map((v, i) => v * 0.5 + (i === 0 ? 255 : 0) * 0.5), `clip opacity on frame ${frame}`)
    near(pixel(frame, 240, 45), blue.map((v, i) => v * 0.75 + (i === 0 ? 255 : 0) * 0.25), `source alpha multiplied by opacity on frame ${frame}`)
  }
  const audio = await run(tools.ffmpeg, ['-v', 'error', '-i', outputPath, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { binaryOutput: true })
  const amplitude = (frequency, start, length = 0.1) => {
    let real = 0, imaginary = 0
    const count = Math.round(length * 48000), first = Math.round(start * 48000)
    for (let n = 0; n < count; n++) {
      const value = audio.readFloatLE((first + n) * 4), phase = 2 * Math.PI * frequency * (first + n) / 48000
      real += value * Math.cos(phase); imaginary += value * Math.sin(phase)
    }
    return 2 * Math.hypot(real, imaginary) / count
  }
  const music = [0.5, 1.1, 1.4, 1.8, 2.5].map(time => ({ time, amplitude: amplitude(450, time) }))
  for (const sample of music) assert.ok(Math.abs(sample.amplitude - 0.1) < 0.012, `music gain stays .5 at ${sample.time}: ${sample.amplitude}`)
  assert.ok(Math.abs(amplitude(900, 1.4) - 0.3) < 0.025, 'voice gain 1.5 mixes with music instead of replacing or normalizing it')
  for (const time of [0.5, 1.1, 1.8, 2.5]) assert.ok(amplitude(900, time) < 0.01, `voice absent at ${time}`)
  const bins = Array.from({ length: 300 }, (_, n) => amplitude(900, n / 100, 0.01))
  const voiceBins = bins.map((value, index) => value > 0.1 ? index : -1).filter(index => index >= 0)
  assert.ok(Math.abs(voiceBins[0] - 125) <= 1, `trimmed voice begins at 1.25s: ${voiceBins[0]}`)
  assert.ok(Math.abs(voiceBins.at(-1) - 174) <= 1, `trimmed voice ends at 1.75s: ${voiceBins.at(-1)}`)
  assert.deepEqual(await Promise.all(assets.map(async asset => createHash('sha256').update(await readFile(asset.path)).digest('hex'))), originalsBefore)
  report.tests.push({ id, passed: true, frames: 75, transparentImageAndOpacity: true, overlayFrames: [25, 49],
    musicAmplitude: music, voiceAmplitude: amplitude(900, 1.4), voiceStartMs: voiceBins[0] * 10, voiceEndMs: (voiceBins.at(-1) + 1) * 10, outputPath })
  console.log('PASS multitrack-logo-audio: 75 frames, transparent PNG/opacity/position and frame-accurate overlay edges, two simultaneous tones with independent gains, trimmed voice timing, originals unchanged')
}

async function testTitleAndRange(renderTimelineProject) {
  const id = 'title-and-range'
  const originals = join(testDirectory, id, 'media', 'originals')
  await mkdir(originals, { recursive: true })
  const ffmpeg = (...args) => run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
  const videoPath = join(originals, 'blue.mp4')
  const titlePath = join(originals, 'title.png')
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=0x204080:s=320x180:r=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoPath)
  // Opaque red block in the middle, transparent elsewhere: stands in for a rasterised title.
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=0xff0000:s=100x40,format=rgba', '-vf', 'pad=320:180:110:70:color=0x00000000', '-frames:v', '1', titlePath)
  const now = new Date().toISOString()
  const asset = { id: 'video', kind: 'video', name: 'video', path: videoPath, duration: 3, width: 320, height: 180, fps: 25,
    src: `huphe://file/${encodeURIComponent(videoPath)}` }
  const project = { schemaVersion: 1, id, name: id, createdAt: now, updatedAt: now, width: 320, height: 180, fps: 25, targetDuration: 3, assets: [asset],
    tracks: [{ id: 'video-1', kind: 'video', name: 'Film' }, { id: 'video-2', kind: 'video', name: 'Titels' }],
    clips: [{ id: 'video', label: 'video', track: 'video', trackId: 'video-1', start: 0, duration: 75, activeVariantId: 'video', variants: [{ id: 'video', assetId: 'video', createdAt: now, inPoint: 0 }] },
      { id: 'title', label: 'Titel', track: 'video', trackId: 'video-2', start: 25, duration: 25, variants: [], text: { content: 'Titel', size: 0.07, color: '#ffffff', x: 0.5, y: 0.5 } }],
    range: { start: 10, end: 60 } }
  const titleImages = { title: `data:image/png;base64,${(await readFile(titlePath)).toString('base64')}` }
  const rgbFrames = async file => {
    const data = await run(tools.ffmpeg, ['-v', 'error', '-i', file, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { binaryOutput: true })
    return { count: data.length / (320 * 180 * 3), center: n => Array.from(data.subarray(((n * 180 + 90) * 320 + 160) * 3, ((n * 180 + 90) * 320 + 160) * 3 + 3)) }
  }
  const isRed = pixel => pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60
  const isBlue = pixel => pixel[0] < 70 && pixel[2] > 100

  const full = join(testDirectory, id, 'exports', 'full.mp4')
  await mkdir(dirname(full), { recursive: true })
  await renderTimelineProject(project, { root: testDirectory, outputPath: full, tools, encoder, titleImages, useRange: false })
  const whole = await rgbFrames(full)
  assert.equal(whole.count, 75)
  for (let n = 0; n < 75; n++) assert.equal(isRed(whole.center(n)), n >= 25 && n < 50, `title visible exactly on frames 25–49 (frame ${n}: ${whole.center(n)})`)

  const part = join(testDirectory, id, 'exports', 'range.mp4')
  await renderTimelineProject(project, { root: testDirectory, outputPath: part, tools, encoder, titleImages, useRange: true })
  const cut = await rgbFrames(part)
  assert.equal(cut.count, 50, 'range export has exactly the range length')
  for (let n = 0; n < 50; n++) assert.equal(isRed(cut.center(n)), n >= 15 && n < 40, `range: title visible on output frames 15–39 (frame ${n}: ${cut.center(n)})`)
  assert.ok(isBlue(cut.center(0)) && isBlue(cut.center(49)))
  const metadata = await probe(part, tools.ffprobe)
  const audio = metadata.streams.find(s => s.codec_type === 'audio')
  assert.ok(Math.abs(Number(audio.duration) - 2) < 0.1, `range audio is about 2 s long: ${audio.duration}`)
  report.tests.push({ id, passed: true, frames: 50, titleFrames: [25, 49] })
  console.log('PASS title-and-range: title overlay only in its window, range export has 50 frames, titles shift with the range, audio trimmed to 2 s')
}

async function main() {
  if (process.argv.includes('--generate')) await generateFixtures({ directory, ...tools, encoder })
  const manifest = await loadFixtures(directory)
  assert.equal(manifest.version, 1)
  const ffmpegVersion = await run(tools.ffmpeg, ['-version'])
  report.tooling = { ffmpeg: ffmpegVersion, ffprobe: await run(tools.ffprobe, ['-version']), executablePaths: tools }
  await mkdir(testDirectory, { recursive: true })
  const bundle = join(testDirectory, 'export-helper.cjs')
  await build({ entryPoints: [join(appRoot, 'src/main/lib/video-timeline-export.ts')], outfile: bundle,
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning' })
  const { renderTimelineProject } = await import(pathToFileURL(bundle).href)
  const baselineVideo = [
    { filename: 'source-A.mp4', inPoint: 2, start: 0, duration: 75 },
    { filename: 'source-B.mp4', inPoint: 1, start: 75, duration: 100 },
  ]
  const baselineAudio = [{ filename: 'baseline.wav', inPoint: 0, start: 0, duration: 175 }]
  const cFrames = Array.from({ length: 100 }, (_, n) => ({ source: 3, frame: 24 + Math.floor(n * 24 / 25) }))
  const dFrames = inPoint => Array.from({ length: inPoint ? 50 : 100 }, (_, n) => {
    const timestamp = inPoint + n / 25
    let frame = 0
    for (let i = 0; i < 90; i++) {
      const pts = i < 30 ? i / 15 : 2 + (i - 30) / 30
      if (pts <= timestamp + 1e-9) frame = i
    }
    return { source: 4, frame }
  })
  const cases = [
    { id: 'baseline-ab', videos: baselineVideo, audio: baselineAudio, expected: [...expected(1, 50, 75), ...expected(2, 25, 100)], peaks: [0.5, 3, 6.5], markers: [] },
    { id: 'mixed-abc', videos: [...baselineVideo, { filename: 'source-C.mp4', inPoint: 1, start: 175, duration: 100 }],
      audio: [...baselineAudio, { filename: 'source-C.wav', inPoint: 1, start: 175, duration: 100 }],
      expected: [...expected(1, 50, 75), ...expected(2, 25, 100), ...cFrames], peaks: [0.5, 3, 6.5, 7, 10.5], markers: [175, 176, 263] },
    { id: 'vfr-d', videos: [{ filename: 'source-D.mp4', inPoint: 0, start: 0, duration: 100 }],
      audio: [{ filename: 'source-D.wav', inPoint: 0, start: 0, duration: 100 }], expected: dFrames(0), peaks: [2], markers: [50] },
    { id: 'vfr-non-keyframe', videos: [{ filename: 'source-D.mp4', inPoint: 0.76, start: 0, duration: 50 }],
      audio: [{ filename: 'source-D.wav', inPoint: 0.76, start: 0, duration: 50 }], expected: dFrames(0.76), peaks: [1.24], markers: [31] },
    { id: 'sixty-seconds-c', videos: Array.from({ length: 15 }, (_, i) => ({ filename: 'source-C.mp4', inPoint: 1, start: i * 100, duration: 100 })),
      audio: Array.from({ length: 15 }, (_, i) => ({ filename: 'source-C.wav', inPoint: 1, start: i * 100, duration: 100 })),
      expected: Array.from({ length: 15 }, () => cFrames).flat(), peaks: Array.from({ length: 15 }, (_,i) => [i * 4, i * 4 + 3.5]).flat(),
      markers: Array.from({ length: 15 }, (_,i) => [i * 100, i * 100 + 1, i * 100 + 88]).flat() },
  ]
  const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex')
  const inputHashes = await Promise.all(manifest.contract.sources.map(s => hash(join(directory, `source-${s.id}.mp4`))))
  for (const scenario of cases) {
    const project = await makeProject(scenario.id, scenario.videos, scenario.audio)
    const outputPath = join(testDirectory, scenario.id, 'exports', 'verified montage.mp4')
    await mkdir(dirname(outputPath), { recursive: true })
    const projectSourceHashes = await Promise.all(project.assets.map(asset => hash(asset.path)))
    console.log(`Rendering ${scenario.id}...`)
    const startedAt = performance.now()
    await renderTimelineProject(project, { root: testDirectory, outputPath, tools, encoder })
    const renderMs = Math.round(performance.now() - startedAt)
    assert.deepEqual(await Promise.all(project.assets.map(asset => hash(asset.path))), projectSourceHashes,
      `${scenario.id}: managed original files remain unchanged`)
    const metadata = await probe(outputPath, tools.ffprobe, true)
    const stream = metadata.streams.find(s => s.codec_type === 'video')
    assert.equal(stream.width, 1920); assert.equal(stream.height, 1080)
    assert.equal(stream.avg_frame_rate, '25/1')
    assert.equal(metadata.frames.length, scenario.expected.length)
    assert.ok(Math.abs(Number(stream.duration) - scenario.expected.length / 25) < 0.001)
    const decoded = await decodeBarcodes(outputPath)
    assert.deepEqual(decoded, scenario.expected, `${scenario.id}: every decoded frame must show the expected original frame`)
    const markers = await decodeMarkers(outputPath)
    assert.deepEqual(markers, scenario.markers, `${scenario.id}: actual magenta image markers`)
    const peaks = await decodeAudio(outputPath, scenario.peaks)
    const cuts = decoded.flatMap((frame, i) => i && frame.source !== decoded[i - 1].source ? [i] : [])
    const repeats = decoded.filter((frame, i) => i && frame.source === decoded[i - 1].source && frame.frame === decoded[i - 1].frame).length
    report.tests.push({ id: scenario.id, passed: true, frames: decoded.length, duration: Number(stream.duration), cuts,
      repeatedFrames: repeats, markerFrames: markers, audioPeaks: peaks, renderMs, bytes: (await stat(outputPath)).size, outputPath })
    await writeFile(join(directory, 'export-test-results.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`PASS ${scenario.id}: ${decoded.length} decoded source IDs, cuts ${cuts.join(', ') || '—'}, ${peaks.length} audio markers`)
  }
  await testMultitrack(renderTimelineProject)
  await testTitleAndRange(renderTimelineProject)
  const hashesAfter = await Promise.all(manifest.contract.sources.map(s => hash(join(directory, `source-${s.id}.mp4`))))
  assert.deepEqual(hashesAfter, inputHashes, 'Original source files unchanged')
  report.originalsUnchanged = true
  await writeFile(join(directory, 'export-test-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`All export scenarios passed. Evidence: ${join(directory, 'export-test-results.json')}`)
}

main().catch(async error => {
  report.failure = { message: error.message, stack: error.stack }
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'export-test-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.error(error)
  process.exitCode = 1
})
