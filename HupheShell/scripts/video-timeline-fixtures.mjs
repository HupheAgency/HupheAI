#!/usr/bin/env node
/** Local M0 media. No provider calls. Generated media belongs in .local/, not git. */
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const defaultFixtureDirectory = join(appRoot, '.local', 'video-timeline-fixtures')
export const fixtureContract = {
  width: 1920, height: 1080, fps: 25, sampleRate: 48000,
  // A 16-cell barcode below the visible counter encodes source identity and frame.
  barcode: { x: 160, y: 920, cellWidth: 80, height: 80, cells: 16 },
  sources: [
    { id: 'A', code: 1, frames: 150, fps: 25, duration: 6, color: '0x15486a', markers: [] },
    { id: 'B', code: 2, frames: 125, fps: 25, duration: 5, color: '0x815020', markers: [] },
    { id: 'C', code: 3, frames: 144, fps: 24, duration: 6, color: '0x315c35', markers: [24, 108] },
    { id: 'D', code: 4, frames: 90, fps: null, duration: 4, color: '0x653664', markers: [30] },
  ],
  expected: {
    baseline: { frames: 175, duration: 7, cuts: [75], audioPeaks: [0.5, 3, 6.5] },
    mixed: { frames: 275, duration: 11, cuts: [75, 175], markers: [175, 263], audioPeaks: [0.5, 3, 6.5, 7, 10.5] },
    vfr: { frames: 100, duration: 4, markers: [50], audioPeaks: [2] },
    repeated: { frames: 1500, duration: 60, repeats: 15, repeatedFrames: 60 },
  },
}

export function run(binary, args, { binaryOutput = false, maxBytes = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const output = []; const errors = []; let size = 0; let overflow = false
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) { overflow = true; child.kill(); return }
      output.push(chunk)
    })
    child.stderr.on('data', chunk => errors.push(chunk))
    child.on('error', reject)
    child.on('close', code => {
      if (overflow) return reject(new Error(`${binary}: output exceeded ${maxBytes} bytes`))
      if (code !== 0) return reject(new Error(`${binary} exited ${code}: ${Buffer.concat(errors).toString().slice(-12000)}`))
      const data = Buffer.concat(output)
      resolveResult(binaryOutput ? data : data.toString())
    })
  })
}

export async function probe(file, ffprobe = 'ffprobe', frames = false) {
  return JSON.parse(await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format',
    ...(frames ? ['-select_streams', 'v:0', '-show_frames'] : []), '-of', 'json', file]))
}

function videoFilter(source) {
  const filters = []
  if (source.id === 'D') filters.push('settb=1/30000', "setpts=if(lt(N\\,30)\\,N*2000\\,60000+(N-30)*1000)")
  filters.push(`drawtext=text='SOURCE ${source.id}':fontsize=100:fontcolor=white:x=160:y=140`)
  filters.push("drawtext=text='FRAME %{n}   TIME %{pts\\:flt}':fontsize=64:fontcolor=white:x=160:y=300")
  filters.push('drawtext=text=LOCAL TIMELINE TEST - ORIGINAL PRESERVED:fontsize=36:fontcolor=white:x=160:y=420')
  for (let bit = 0; bit < 16; bit++) {
    const x = fixtureContract.barcode.x + bit * fixtureContract.barcode.cellWidth
    const value = bit < 8 ? `mod(floor(n/${2 ** bit}),2)` : String((source.code >> (bit - 8)) & 1)
    filters.push(`drawbox=x=${x}:y=920:w=80:h=80:color=black:t=fill`)
    filters.push(`drawbox=x=${x}:y=920:w=80:h=80:color=white:t=fill:enable='${value}'`)
  }
  if (source.markers.length) filters.push(`drawbox=x=0:y=0:w=iw:h=80:color=magenta:t=fill:enable='${source.markers.map(n => `eq(n,${n})`).join('+')}'`)
  return filters.join(',')
}

function wav(duration, peaks, sampleRate = 48000) {
  const count = Math.round(duration * sampleRate)
  const result = Buffer.alloc(44 + count * 2)
  result.write('RIFF'); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8)
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22)
  result.writeUInt32LE(sampleRate, 24); result.writeUInt32LE(sampleRate * 2, 28)
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write('data', 36)
  result.writeUInt32LE(count * 2, 40)
  for (const peak of peaks) {
    const start = Math.round(peak * sampleRate)
    for (let n = 0; n < 480 && start + n < count; n++) {
      // 10 ms tone with its maximum energy close to the named marker.
      const value = Math.sin(2 * Math.PI * 1000 * n / sampleRate) * (1 - n / 480) * 28000
      result.writeInt16LE(Math.round(value), 44 + (start + n) * 2)
    }
  }
  return result
}

export async function generateFixtures({ directory = defaultFixtureDirectory, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', encoder = 'h264_videotoolbox' } = {}) {
  const output = resolve(directory)
  await mkdir(output, { recursive: true })
  const version = await run(ffmpeg, ['-version'])
  const generatedAt = new Date().toISOString()
  const files = {}
  for (const source of fixtureContract.sources) {
    const file = join(output, `source-${source.id}.mp4`)
    console.log(`Creating source ${source.id} (${source.frames} source frames)...`)
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      `color=c=${source.color}:s=1920x1080:r=${source.fps ?? 30}`,
      '-vf', videoFilter(source), '-frames:v', String(source.frames), '-an',
      '-c:v', encoder, '-b:v', '8M', '-pix_fmt', 'yuv420p', '-g', '120',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      ...(source.id === 'D' ? ['-fps_mode', 'vfr'] : []), '-movflags', '+faststart', file])
    const metadata = await probe(file, ffprobe, true)
    const stream = metadata.streams.find(s => s.codec_type === 'video')
    const timestamps = metadata.frames.map(f => Number(f.best_effort_timestamp_time))
    const expectedTime = i => source.id === 'D' ? (i < 30 ? i / 15 : 2 + (i - 30) / 30) : i / source.fps
    if (timestamps.length !== source.frames || timestamps.some((t, i) => Math.abs(t - expectedTime(i)) > 0.0001)) {
      throw new Error(`Source ${source.id}: decoded frame timestamps do not match fixture contract`)
    }
    if (Math.abs(Number(stream.duration) - source.duration) > 0.001) throw new Error(`Source ${source.id}: duration ${stream.duration}`)
    files[source.id] = { filename: `source-${source.id}.mp4`, metadata: stream, timestamps }
  }
  const sounds = [
    ['baseline.wav', 7, [0.5, 3, 6.5]], ['source-C.wav', 6, [1, 4.5]], ['source-D.wav', 4, [2]],
  ]
  for (const [name, duration, peaks] of sounds) await writeFile(join(output, name), wav(duration, peaks))
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(output, 'source-A.mp4'), '-frames:v', '1', join(output, 'reference.png')])
  // These are deliberately visibly different candidates for a single timeline block.
  files.variants = ['source-A.mp4', 'source-B.mp4']
  const manifest = { version: 1, generatedAt, contract: fixtureContract, files,
    audio: sounds.map(([filename, duration, peaks]) => ({ filename, duration, peaks, sampleRate: 48000 })),
    tooling: { ffmpeg: version, ffprobe: await run(ffprobe, ['-version']), encoder,
      purpose: 'Local development only; installed binary is not a packaged/distribution license claim.' } }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`M0 fixtures verified: ${join(output, 'manifest.json')}`)
  return manifest
}

export async function loadFixtures(directory = defaultFixtureDirectory) {
  return JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = flag => {
    const index = process.argv.indexOf(flag)
    if (index === -1) return undefined
    if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`)
    return process.argv[index + 1]
  }
  generateFixtures({ directory: value('--output'), ffmpeg: value('--ffmpeg'), ffprobe: value('--ffprobe'), encoder: value('--encoder') })
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
