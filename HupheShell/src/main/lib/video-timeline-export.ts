import { mkdir, realpath, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { activeMedia, clipFades, clipSpeed, clipTrackId, renderableProject, timelineEnd, timelineProblems, timelineTracks, visualClipRect, type TimelineProject } from '../../shared/video-timeline'
import { transitionPlaybackProblems } from '../../shared/video-timeline-transition'
import { pickTimelineEncoder, probeTimelineMedia, requireTimelineTools, runTimelineTool, timelineEncoderArgs, type TimelineTools } from './video-timeline-media'
import { isWithinTimelineDirectory, parseTimelineProject, validateOwnedAssets } from './video-timeline-storage'

export interface TimelineRenderOptions {
  root: string
  outputPath: string
  tools?: TimelineTools
  /** Explicit override for tests; normally the best encoder the FFmpeg build offers is detected. */
  encoder?: 'h264_videotoolbox' | 'libx264' | 'mpeg4'
  quality?: TimelineExportQuality
  /** 'prores' = ProRes 422 in a .mov for further editing (Media Encoder, Premiere); default H.264 in an .mp4. */
  format?: TimelineExportFormat
  /** Output height in pixels; the width follows the project's aspect ratio. Omitted = project size. */
  outputHeight?: number
}

export type TimelineExportQuality = 'draft' | 'standard' | 'high'
export type TimelineExportFormat = 'mp4' | 'prores'
/** prores_ks profiles: 1 = LT, 2 = 422, 3 = 422 HQ. */
const PRORES_PROFILE = { draft: '1', standard: '2', high: '3' } as const
const QUALITY = {
  draft: { bitrate: '4M', crf: '26', audio: '128k' },
  standard: { bitrate: '12M', crf: '18', audio: '192k' },
  high: { bitrate: '24M', crf: '14', audio: '256k' },
} as const

/** Settings arrive from the renderer, so unknown values fall back to the defaults instead of reaching FFmpeg. */
export function parseTimelineExportOptions(input: unknown): Pick<TimelineRenderOptions, 'quality' | 'outputHeight' | 'format'> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const quality = raw.quality === 'draft' || raw.quality === 'high' ? raw.quality : 'standard'
  const height = Number(raw.outputHeight)
  return { quality, format: raw.format === 'prores' ? 'prores' : 'mp4', outputHeight: Number.isInteger(height) && height >= 144 && height <= 4320 ? height : undefined }
}

const seconds = (frames: number, fps: number) => (frames / fps).toFixed(9)

export async function renderTimelineProject(input: TimelineProject, options: TimelineRenderOptions): Promise<{ path: string; duration: number; frames: number }> {
  // Zod creates a separate snapshot before the first asynchronous operation.
  const project = renderableProject(parseTimelineProject(input))
  const tools = await requireTimelineTools(options.tools)
  await validateOwnedAssets(options.root, project)
  const used = new Set(project.clips.flatMap(clip => clip.variants.filter(v => v.id === clip.activeVariantId).map(v => v.assetId)))
  for (const asset of project.assets.filter(a => used.has(a.id))) Object.assign(asset, await probeTimelineMedia(asset.path, asset.kind, tools))
  const problems = [...timelineProblems(project), ...transitionPlaybackProblems(project)]
  if (problems.length) throw new Error(problems.join('\n'))
  const frames = timelineEnd(project)
  const duration = frames / project.fps
  if (frames <= 0 || duration > 3600) throw new Error('Exporteer een tijdlijn van maximaal één uur met minimaal één videofragment.')
  const prores = options.format === 'prores'
  const extension = prores ? '.mov' : '.mp4'
  if (extname(options.outputPath).toLowerCase() !== extension) throw new Error(`Kies een uitvoerbestand met de extensie ${extension}.`)
  const outputPath = resolve(options.outputPath)
  await mkdir(dirname(outputPath), { recursive: true })
  const outputDirectory = await realpath(dirname(outputPath))
  const managedRoot = await realpath(options.root)
  // Protect managed originals and preview copies, including those of other projects.
  if (isWithinTimelineDirectory(managedRoot, outputDirectory) && outputDirectory.split(/[\\/]/).some(part => part === 'originals' || part === 'previews'))
    throw new Error('Bewaar de export buiten de mappen met originele media en previewkopieën.')
  if (project.assets.some(asset => (asset.path === join(outputDirectory, basename(outputPath)) || asset.previewPath === join(outputDirectory, basename(outputPath))))) throw new Error('Een export mag geen bronbestand vervangen.')
  const temporary = join(outputDirectory, `huphe-export-${randomUUID()}.partial${extension}`)
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y']
  const filters: string[] = []
  let inputIndex = 0
  let segmentId = 0
  const size = `${project.width}x${project.height}`

  const videoLayers: string[] = []
  const audioLayers: string[] = []
  for (const track of timelineTracks(project)) {
    const clips = project.clips.filter(clip => clipTrackId(clip) === track.id).sort((a, b) => a.start - b.start)
    if (!clips.length) continue
    const segments: string[] = []
    const video = track.kind === 'video'
    let cursor = 0
    let previous: (typeof clips)[number] | undefined
    const addGap = (length: number) => {
      if (length <= 0) return
      const label = `segment${segmentId++}`
      if (video) filters.push(`color=c=black@0:s=${size}:r=${project.fps},format=rgba,trim=end_frame=${length},setpts=PTS-STARTPTS,setsar=1[${label}]`)
      else filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(length, project.fps)},asetpts=PTS-STARTPTS[${label}]`)
      segments.push(`[${label}]`)
    }
    for (const clip of clips) {
      if (clip.start > cursor) previous = undefined
      addGap(clip.start - cursor)
      const { asset, variant } = activeMedia(project, clip)
      if (!asset || !variant) throw new Error('Een fragment mist zijn bronbestand.')
      if (asset.kind === 'image') args.push('-loop', '1', '-framerate', String(project.fps))
      args.push('-protocol_whitelist', 'file,pipe', '-i', asset.path)
      const label = `segment${segmentId++}`
      const speed = asset.kind === 'image' ? 1 : clipSpeed(clip)
      const fades = clipFades(project, clip)
      if (video) {
        const rect = visualClipRect(project, clip, asset)
        const source = asset.kind === 'image'
          ? `[${inputIndex}:v:0]trim=end_frame=${clip.duration},setpts=PTS-STARTPTS`
          // Keep the frame immediately before a fractional in-point. Rounding
          // source timestamps up implements preceding-frame sampling, also for VFR.
          // Speed divides the timestamps after the in-point shift, so frames are picked from the faster or slower source.
          : `[${inputIndex}:v:0]setpts=(PTS-STARTPTS-${variant.inPoint.toFixed(9)}/TB)/${speed},fps=fps=${project.fps}:start_time=0:round=up,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${clip.duration},setpts=PTS-STARTPTS`
        const fadeInFrames = Math.max(fades.fadeIn, fades.crossfade)
        const fadeFilters = [fadeInFrames ? `fade=t=in:s=0:n=${fadeInFrames}:alpha=1` : '',
          fades.fadeOut ? `fade=t=out:s=${clip.duration - fades.fadeOut}:n=${fades.fadeOut}:alpha=1` : ''].filter(Boolean)
        filters.push(`${[source, `scale=${rect.width}:${rect.height}`, 'setsar=1', 'format=rgba', `colorchannelmixer=aa=${clip.opacity ?? 1}`, ...fadeFilters].join(',')}[${label}source]`)
        if (rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= project.width && rect.y + rect.height <= project.height) {
          filters.push(`[${label}source]pad=${project.width}:${project.height}:${rect.x}:${rect.y}:color=black@0[${label}]`)
        } else {
          // Overlay on a transparent frame handles negative offsets and enlarged
          // elements without changing their requested geometry.
          filters.push(`color=c=black@0:s=${size}:r=${project.fps},format=rgba,trim=end_frame=${clip.duration},setpts=PTS-STARTPTS[${label}canvas]`)
          filters.push(`[${label}canvas][${label}source]overlay=x=${rect.x}:y=${rect.y}:shortest=1:format=auto[${label}]`)
        }
      } else {
        const sourceLength = (clip.duration / project.fps * speed).toFixed(9)
        // atempo is only guaranteed between 0.5 and 2 per stage, so larger changes chain two stages.
        const tempo = speed === 1 ? '' : speed < 0.5 ? `,atempo=0.5,atempo=${(speed / 0.5).toFixed(9)}` : speed > 2 ? `,atempo=2,atempo=${(speed / 2).toFixed(9)}` : `,atempo=${speed}`
        const fadeSeconds = (frames: number) => seconds(frames, project.fps)
        const audioFades = `${fades.fadeIn ? `,afade=t=in:st=0:d=${fadeSeconds(fades.fadeIn)}` : ''}${fades.fadeOut ? `,afade=t=out:st=${fadeSeconds(clip.duration - fades.fadeOut)}:d=${fadeSeconds(fades.fadeOut)}` : ''}`
        filters.push(`[${inputIndex}:a:0]atrim=start=${variant.inPoint.toFixed(9)}:duration=${sourceLength},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${tempo},volume=${clip.gain ?? 1},apad,atrim=duration=${seconds(clip.duration, project.fps)}${audioFades}[${label}]`)
      }
      inputIndex++
      let outLabel = label
      if (video && fades.crossfade && previous && cursor === clip.start && segments.length) {
        // Dissolve in over the frozen last frame of the preceding clip; no extra source material is needed.
        const tail = segments.pop()!
        const name = `${label}x`
        const n = fades.crossfade, last = previous.duration
        filters.push(`${tail}split[${name}keep][${name}tail]`)
        filters.push(`[${name}tail]trim=start_frame=${last - 1}:end_frame=${last},setpts=PTS-STARTPTS,loop=loop=${n - 1}:size=1:start=0,trim=end_frame=${n},setpts=PTS-STARTPTS${clip.duration > n ? `,tpad=stop_mode=add:stop_duration=${clip.duration - n}:color=black@0` : ''}[${name}under]`)
        filters.push(`[${name}under][${label}]overlay=shortest=1:format=auto[${name}]`)
        segments.push(`[${name}keep]`)
        outLabel = name
      }
      segments.push(`[${outLabel}]`)
      previous = clip
      cursor = clip.start + clip.duration
    }
    addGap(frames - cursor)
    const output = `layer${video ? 'v' : 'a'}${video ? videoLayers.length : audioLayers.length}`
    if (segments.length === 1) filters.push(`${segments[0]}${video ? 'null' : 'anull'}[${output}]`)
    else filters.push(`${segments.join('')}concat=n=${segments.length}:v=${video ? 1 : 0}:a=${video ? 0 : 1}[${output}]`)
    ;(video ? videoLayers : audioLayers).push(`[${output}]`)
  }
  filters.push(`color=c=black:s=${size}:r=${project.fps},trim=end_frame=${frames},setpts=PTS-STARTPTS,setsar=1,format=rgba[background]`)
  let composite = '[background]'
  videoLayers.forEach((layer, index) => {
    const output = `composite${index}`
    filters.push(`${composite}${layer}overlay=shortest=1:format=auto[${output}]`)
    composite = `[${output}]`
  })
  // Even dimensions only: yuv420p cannot hold odd sizes.
  const outputHeight = options.outputHeight ? Math.max(2, Math.round(options.outputHeight / 2) * 2) : undefined
  const outputWidth = outputHeight ? Math.max(2, Math.round(project.width * outputHeight / project.height / 2) * 2) : undefined
  filters.push(`${composite}${outputHeight && outputHeight !== project.height ? `scale=${outputWidth}:${outputHeight}:flags=lanczos,` : ''}format=${prores ? 'yuv422p10le' : 'yuv420p'}[vout]`)
  if (!audioLayers.length) filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(frames, project.fps)}[aout]`)
  else if (audioLayers.length === 1) filters.push(`${audioLayers[0]}anull[aout]`)
  // Do not automatically attenuate one track when another track is added.
  else filters.push(`${audioLayers.join('')}amix=inputs=${audioLayers.length}:duration=longest:normalize=0[aout]`)
  const quality = QUALITY[options.quality ?? 'standard']
  // ProRes (LGPL-safe, built into FFmpeg) is for editing onwards: little loss, big files, PCM audio.
  const video = prores ? ['-c:v', 'prores_ks', '-profile:v', PRORES_PROFILE[options.quality ?? 'standard'], '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le']
    : [...timelineEncoderArgs(options.encoder || await pickTimelineEncoder(tools.ffmpeg), quality.bitrate, quality.crf), '-pix_fmt', 'yuv420p']
  const audio = prores ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', quality.audio]
  args.push('-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-frames:v', String(frames), '-t', seconds(frames, project.fps), '-r', String(project.fps), '-fps_mode', 'cfr',
    ...video, ...audio, '-ar', '48000', '-ac', '2', ...(prores ? [] : ['-movflags', '+faststart']), temporary)
  try {
    await runTimelineTool(tools.ffmpeg, args, 30 * 60_000)
    if ((await stat(temporary)).size === 0) throw new Error('De export heeft geen bestand opgeleverd.')
    await rename(temporary, outputPath)
    // Finder hides files with the macOS "hidden" flag; an export must always be visible (seen on iCloud-synced folders).
    if (process.platform === 'darwin') await new Promise<void>(done => execFile('/usr/bin/chflags', ['nohidden', outputPath], () => done()))
    return { path: outputPath, duration, frames }
  } finally { await unlink(temporary).catch(() => {}) }
}
