#!/usr/bin/env node
/** Fades, crossfade and speed: render with FFmpeg and measure decoded pixels/audio. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { run, probe } from './video-timeline-fixtures.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tools = { ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe' }
const root = await mkdtemp(join(tmpdir(), 'huphe-effects-'))
const originals = join(root, 'fx', 'media', 'originals')
await mkdir(originals, { recursive: true })
const ff = (...args) => run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
try {
  const bundle = join(root, 'export-helper.cjs')
  await build({ entryPoints: [join(appRoot, 'src/main/lib/video-timeline-export.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning' })
  const { renderTimelineProject, parseTimelineExportOptions } = await import(pathToFileURL(bundle).href)
  const media = {
    red: ['color=c=red:s=320x180:r=25', 'sine=frequency=440:sample_rate=48000'],
    blue: ['color=c=blue:s=320x180:r=25', 'sine=frequency=440:sample_rate=48000'],
    ramp: ["color=c=white:s=320x180:r=25,geq=lum='255*T/4':cb=128:cr=128", 'sine=frequency=440:sample_rate=48000'],
  }
  const assets = []
  for (const [name, [video, audio]] of Object.entries(media)) {
    const path = join(originals, `${name}.mp4`)
    await ff('-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio, '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path)
    const metadata = await probe(path, tools.ffprobe)
    const stream = metadata.streams.find(s => s.codec_type === 'video')
    assets.push({ id: name, kind: 'video', name, path, src: `huphe://file/${name}`, duration: Number(metadata.format.duration), width: stream.width, height: stream.height, fps: 25 })
  }
  const tone = join(originals, 'tone.wav')
  await ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', tone)
  assets.push({ id: 'tone', kind: 'audio', name: 'tone', path: tone, src: 'huphe://file/tone', duration: 4, sampleRate: 48000 })

  const now = new Date().toISOString()
  const clip = (id, assetId, start, duration, extra = {}) => ({ id, label: id, track: assets.find(a => a.id === assetId).kind, start, duration, activeVariantId: `v-${id}`,
    variants: [{ id: `v-${id}`, assetId, createdAt: now, inPoint: 0 }], ...extra })
  const project = clips => ({ schemaVersion: 1, id: 'fx', name: 'fx', createdAt: now, updatedAt: now, width: 320, height: 180, fps: 25, targetDuration: 10,
    assets, clips, tracks: [{ id: 'video-1', kind: 'video', name: 'V' }, { id: 'audio-1', kind: 'audio', name: 'A' }] })
  const render = async (name, clips) => {
    const outputPath = join(root, `${name}.mp4`)
    await renderTimelineProject(project(clips), { root, outputPath, tools, encoder: 'libx264' })
    return outputPath
  }
  const pixels = async file => {
    const data = await run(tools.ffmpeg, ['-v', 'error', '-i', file, '-an', '-vf', 'crop=2:2:100:80,scale=1:1,format=rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], { binaryOutput: true })
    return Array.from({ length: data.length / 3 }, (_, i) => ({ r: data[i * 3], g: data[i * 3 + 1], b: data[i * 3 + 2] }))
  }
  const samples = async file => {
    const data = await run(tools.ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { binaryOutput: true })
    return Array.from({ length: data.length / 4 }, (_, i) => data.readFloatLE(i * 4))
  }
  const rms = (s, from, to) => Math.sqrt(s.slice(Math.floor(from * 48000), Math.floor(to * 48000)).reduce((a, b) => a + b * b, 0) / Math.max(1, (to - from) * 48000))

  // Fade in / out on video and audio
  const fade = await render('fade', [clip('a', 'red', 0, 50, { fadeIn: 10, fadeOut: 10 }), clip('sound', 'tone', 0, 50, { fadeIn: 25, fadeOut: 25 })])
  const f = await pixels(fade)
  assert.equal(f.length, 50)
  assert.ok(f[0].r < 40, `frame 0 starts dark (${f[0].r})`)
  assert.ok(f[5].r > f[0].r + 40 && f[5].r < f[15].r - 40, `frame 5 is half-way (${f[5].r})`)
  assert.ok(f[20].r > 200, 'middle is fully visible')
  assert.ok(f[49].r < 60 && f[44].r > f[49].r + 40, `fade out ends dark (${f[44].r} → ${f[49].r})`)
  const a = await samples(fade)
  assert.ok(rms(a, 0, 0.05) < rms(a, 0.8, 1.0) * 0.3, 'audio fades in')
  assert.ok(rms(a, 1.95, 2) < rms(a, 0.8, 1.0) * 0.3, 'audio fades out')
  console.log('PASS fades (video + audio)')

  // Crossfade: red → blue, dissolving over the frozen last red frame
  const cross = await pixels(await render('cross', [clip('a', 'red', 0, 50), clip('b', 'blue', 50, 50, { crossfade: 10 })]))
  assert.equal(cross.length, 100)
  assert.ok(cross[49].r > 200 && cross[49].b < 60, 'before the cut is red')
  assert.ok(cross[50].r > 150 && cross[50].b < 90, `cut frame is still mostly red (${JSON.stringify(cross[50])})`)
  assert.ok(cross[55].r > 60 && cross[55].b > 60, `mid-dissolve mixes both (${JSON.stringify(cross[55])})`)
  assert.ok(cross[65].b > 150 && cross[65].r < 60, `after the dissolve is blue (${JSON.stringify(cross[65])})`)
  console.log('PASS crossfade')

  // Speed: a ramp whose brightness equals the source time
  const level = async speed => (await pixels(await render(`speed-${speed}`, [clip('r', 'ramp', 0, 50, speed === 1 ? {} : { speed })])))
  const normal = await level(1), fast = await level(2)
  assert.equal(fast.length, 50)
  assert.ok(fast[25].r > normal[25].r + 40, `2× reaches later source time (${fast[25].r} vs ${normal[25].r})`)
  assert.ok(fast[49].r > 200 && normal[49].r < 140, `end of the 2× clip is near the end of the source (${fast[49].r})`)
  const slow = await level(0.5)
  assert.ok(slow[49].r < normal[49].r - 30, 'half speed shows earlier source time')
  const doubled = await samples(await render('speed-audio', [clip('v', 'red', 0, 50), clip('s', 'tone', 0, 50, { speed: 2 })]))
  let crossings = 0
  for (let i = 1; i < 96000; i++) if (doubled[i - 1] < 0 && doubled[i] >= 0) crossings++
  assert.ok(Math.abs(crossings / 2 - 440) < 25, `audio keeps its pitch while playing 2× (${crossings / 2} Hz)`)
  assert.ok(rms(doubled, 1.8, 1.99) > 0.03, 'sped-up audio fills the clip')
  console.log('PASS speed (video + audio)')

  // Export settings: output size follows the aspect ratio, quality changes the file size
  const sized = join(root, 'sized.mp4')
  await renderTimelineProject(project([clip('a', 'ramp', 0, 50)]), { root, outputPath: sized, tools, encoder: 'libx264', outputHeight: 90, quality: 'draft' })
  const info = (await probe(sized, tools.ffprobe)).streams.find(x => x.codec_type === 'video')
  assert.deepEqual([info.width, info.height], [160, 90], 'output is scaled to the requested height')
  assert.deepEqual(parseTimelineExportOptions({ quality: 'bogus', outputHeight: 'x' }), { quality: 'standard', outputHeight: undefined })
  assert.deepEqual(parseTimelineExportOptions({ quality: 'high', outputHeight: 1080 }), { quality: 'high', outputHeight: 1080 })
  console.log('PASS export settings')

  // Encoder choice: a GPL build (libx264) is used when present, an LGPL-style build falls back to VideoToolbox
  const { pickTimelineEncoder } = await import(pathToFileURL(await (async () => {
    const out = join(root, 'media-helper.cjs')
    await build({ entryPoints: [join(appRoot, 'src/main/lib/video-timeline-media.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning' })
    return out
  })()).href)
  const lgpl = join(root, 'ffmpeg-lgpl')
  await writeFile(lgpl, `#!/bin/sh\nif [ "$2" = "-encoders" ]; then ${tools.ffmpeg} "$@" | grep -v libx264; else exec ${tools.ffmpeg} "$@"; fi\n`)
  await chmod(lgpl, 0o755)
  assert.equal(await pickTimelineEncoder(tools.ffmpeg), 'libx264', 'GPL build picks libx264')
  assert.equal(await pickTimelineEncoder(lgpl), 'h264_videotoolbox', 'LGPL-style build falls back to the hardware encoder')
  const gplOut = join(root, 'gpl.mp4'), lgplOut = join(root, 'lgpl.mp4')
  await renderTimelineProject(project([clip('a', 'ramp', 0, 25)]), { root, outputPath: gplOut, tools })
  await renderTimelineProject(project([clip('a', 'ramp', 0, 25)]), { root, outputPath: lgplOut, tools: { ffmpeg: lgpl, ffprobe: tools.ffprobe } })
  assert.ok((await readFile(gplOut)).includes('x264 - core'), 'default export with a GPL build is encoded by x264')
  assert.ok(!(await readFile(lgplOut)).includes('x264 - core'), 'export with an LGPL-style build is not encoded by x264')
  for (const file of [gplOut, lgplOut]) {
    const v = (await probe(file, tools.ffprobe)).streams.find(x => x.codec_type === 'video')
    assert.equal(v.codec_name, 'h264'); assert.equal(v.nb_frames ?? '25', '25')
  }
  console.log('PASS encoder choice (x264 vs hardware fallback)')
} finally { await rm(root, { recursive: true, force: true }) }
