import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import type { TimelineAsset } from '../../shared/video-timeline'

export interface TimelineTools { ffmpeg: string; ffprobe: string }
export type TimelineMediaKind = TimelineAsset['kind']
export type TimelineMediaMetadata = Pick<TimelineAsset, 'duration' | 'width' | 'height' | 'fps' | 'sampleRate'> & { needsPreview?: boolean }

const extensions = {
  video: ['mp4', 'mov', 'm4v', 'webm'],
  audio: ['wav', 'mp3', 'm4a', 'ogg'],
  image: ['png', 'jpg', 'jpeg', 'webp'],
}
export function timelineExtensions(kind: TimelineMediaKind): string[] { return [...extensions[kind]] }

export async function findTimelineTools(): Promise<Partial<TimelineTools>> {
  // Binaries shipped with the app (Resources/bin, see extraResources) win over whatever is installed on the machine.
  const bundled = typeof process.resourcesPath === 'string' && process.resourcesPath ? [join(process.resourcesPath, 'bin')] : []
  const dirs = [...bundled, ...(process.env.PATH || '').split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
  const result: Partial<TimelineTools> = {}
  for (const name of ['ffmpeg', 'ffprobe'] as const) {
    const configured = process.env[`HUPHE_TIMELINE_${name.toUpperCase()}`]
    for (const candidate of [...(configured ? [configured] : []), ...dirs.filter(Boolean).map(dir => join(dir, name))]) {
      if (!isAbsolute(candidate)) continue
      try { await access(candidate, constants.X_OK); result[name] = candidate; break } catch { /* next location */ }
    }
  }
  return result
}

export async function requireTimelineTools(tools?: TimelineTools): Promise<TimelineTools> {
  const found = tools || await findTimelineTools()
  if (!found.ffmpeg || !found.ffprobe) throw new Error('FFmpeg en FFprobe ontbreken. Installeer beide lokale mediagereedschappen (bijvoorbeeld met Homebrew) en herstart de app.')
  return found as TimelineTools
}

/** Arguments are passed directly to the executable; no shell, URL input or interpolation. */
export function runTimelineTool(executable: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    let stdoutBytes = 0
    let stderr = ''
    let failure: Error | undefined
    const stop = (message: string) => { failure ||= new Error(message); child.kill('SIGKILL') }
    const timer = setTimeout(() => stop('Het lokale mediaproces duurde te lang en is gestopt.'), timeoutMs)
    child.stdout.on('data', (data: Buffer) => {
      stdoutBytes += data.length
      if (stdoutBytes > 16 * 1024 * 1024) stop('Het mediaproces gaf onverwacht veel uitvoer.')
      else stdout.push(data)
    })
    child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-12_000) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => {
      clearTimeout(timer)
      if (failure) reject(failure)
      else if (code !== 0) reject(new Error(`Mediaverwerking mislukt (${code}): ${stderr.trim().slice(-3000) || 'onbekende fout'}`))
      else resolve(Buffer.concat(stdout).toString('utf8'))
    })
  })
}

export function localTimelineSource(src: string): string {
  if (src.startsWith('huphe://')) {
    const url = new URL(src)
    if (url.hostname !== 'file') throw new Error('Dit is geen lokaal Huphe-bestand.')
    const path = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!isAbsolute(path) || path.includes('\0')) throw new Error('Ongeldig lokaal bestandspad.')
    return path
  }
  if (src.startsWith('file:')) {
    const url = new URL(src)
    if (url.hostname && url.hostname !== 'localhost') throw new Error('Alleen lokale bestanden zijn toegestaan.')
    return fileURLToPath(url)
  }
  if (!isAbsolute(src) || src.includes('\0')) throw new Error('Importeer een lokaal bestand; internetlinks en data-URL’s worden niet geaccepteerd.')
  return src
}

export function timelineFileUrl(path: string): string { return `huphe://file/${encodeURIComponent(path)}` }

function rate(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const [a, b = '1'] = value.split('/')
  const result = Number(a) / Number(b)
  return Number.isFinite(result) && result > 0 ? result : undefined
}

export async function probeTimelineMedia(path: string, kind: TimelineMediaKind, tools?: TimelineTools): Promise<TimelineMediaMetadata> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error('Selecteer een mediabestand, geen map.')
  if (info.size > 8 * 1024 ** 3) throw new Error('Dit bestand is groter dan de limiet van 8 GB voor deze eerste tijdlijn.')
  const bins = await requireTimelineTools(tools)
  const raw = await runTimelineTool(bins.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', path], 30_000)
  const data = JSON.parse(raw) as { streams?: Array<Record<string, any>>; format?: Record<string, any> }
  const streams = data.streams || []
  const stream = streams.find(s => s.codec_type === (kind === 'audio' ? 'audio' : 'video') && !s.disposition?.attached_pic)
    || (kind === 'image' ? streams.find(s => s.codec_type === 'video') : undefined)
  if (!stream) throw new Error(`Het bestand bevat geen bruikbaar ${kind === 'audio' ? 'geluid' : kind === 'image' ? 'beeld' : 'videobeeld'}.`)
  const duration = Number(stream.duration || data.format?.duration || 0)
  if (kind !== 'image' && (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 3600))
    throw new Error('De speelduur van dit bestand kon niet betrouwbaar worden bepaald.')
  if (kind === 'audio') {
    if (!/^(pcm_|aac$|mp3$|flac$|vorbis$|opus$)/.test(stream.codec_name || ''))
      throw new Error(`Audiocodec ${stream.codec_name || 'onbekend'} wordt nog niet ondersteund. Gebruik WAV (PCM), AAC of MP3.`)
    const sampleRate = Number(stream.sample_rate)
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Deze audio heeft een niet-ondersteunde samplefrequentie.')
    return { duration, sampleRate }
  }
  if (kind === 'video') {
    if (!['h264', 'hevc', 'vp8', 'vp9'].includes(stream.codec_name || ''))
      throw new Error(`Videocodec ${stream.codec_name || 'onbekend'} wordt nog niet ondersteund. Gebruik een SDR MP4 met H.264/H.265 of een 8-bit WebM.`)
    if (!['yuv420p', 'yuvj420p', 'nv12'].includes(stream.pix_fmt || '') || ['smpte2084', 'arib-std-b67'].includes(stream.color_transfer))
      throw new Error('HDR, 10-bit en afwijkende kleursampling zijn nog niet ondersteund. Gebruik een 8-bit SDR-video.')
    if (stream.field_order && !['unknown', 'progressive'].includes(stream.field_order)) throw new Error('Interlaced video wordt nog niet ondersteund. Gebruik progressieve video.')
    if (stream.sample_aspect_ratio && !['N/A', '0:1', '1:1'].includes(stream.sample_aspect_ratio)) throw new Error('Anamorfische video wordt nog niet ondersteund. Gebruik vierkante pixels.')
  }
  let width = Number(stream.width)
  let height = Number(stream.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 8192 || height > 8192)
    throw new Error('Deze beeldafmetingen worden nog niet ondersteund (maximaal 8192 × 8192).')
  const rotation = Number(stream.side_data_list?.find((s: Record<string, any>) => s.rotation !== undefined)?.rotation || stream.tags?.rotate || 0)
  if (Math.abs(rotation % 180) === 90) [width, height] = [height, width]
  return { duration: kind === 'image' ? 0 : duration, width, height,
    ...(kind === 'video' ? { fps: rate(stream.avg_frame_rate) || rate(stream.r_frame_rate), ...(stream.codec_name === 'hevc' ? { needsPreview: true } : {}) } : {}) }
}

/** Retain the source timestamps and original file; only the browser preview is encoded. */
export async function createTimelineVideoPreview(source: string, output: string, tools?: TimelineTools): Promise<void> {
  const bins = await requireTimelineTools(tools)
  const encoder = process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264'
  await runTimelineTool(bins.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-protocol_whitelist', 'file,pipe', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-fps_mode', 'passthrough',
    '-c:v', encoder, ...(encoder === 'h264_videotoolbox' ? ['-b:v', '12M'] : ['-preset', 'veryfast', '-crf', '18']),
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output], 30 * 60_000)
}

/** Decode audio into PCM without changing source bytes, timing, sample rate or channel layout. */
export async function createTimelineAudioCopy(source: string, output: string, tools?: TimelineTools): Promise<TimelineMediaMetadata> {
  const bins = await requireTimelineTools(tools)
  await probeTimelineMedia(source, 'audio', bins)
  await runTimelineTool(bins.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-protocol_whitelist', 'file,pipe', '-i', source, '-map', '0:a:0', '-vn', '-c:a', 'pcm_f32le', output], 30 * 60_000)
  return probeTimelineMedia(output, 'audio', bins)
}
