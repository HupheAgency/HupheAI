import { mkdir, realpath, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { activeMedia, clipTrackId, renderableProject, timelineEnd, timelineProblems, timelineTracks, visualClipRect, type TimelineProject } from '../../shared/video-timeline'
import { transitionPlaybackProblems } from '../../shared/video-timeline-transition'
import { probeTimelineMedia, requireTimelineTools, runTimelineTool, type TimelineTools } from './video-timeline-media'
import { isWithinTimelineDirectory, parseTimelineProject, validateOwnedAssets } from './video-timeline-storage'

export interface TimelineRenderOptions {
  root: string
  outputPath: string
  tools?: TimelineTools
  /** Explicit override for local test fixtures; the macOS app uses VideoToolbox. */
  encoder?: 'h264_videotoolbox' | 'libx264' | 'mpeg4'
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
  if (extname(options.outputPath).toLowerCase() !== '.mp4') throw new Error('Kies een uitvoerbestand met de extensie .mp4.')
  const outputPath = resolve(options.outputPath)
  await mkdir(dirname(outputPath), { recursive: true })
  const outputDirectory = await realpath(dirname(outputPath))
  const managedRoot = await realpath(options.root)
  // Protect managed originals and preview copies, including those of other projects.
  if (isWithinTimelineDirectory(managedRoot, outputDirectory) && outputDirectory.split(/[\\/]/).some(part => part === 'originals' || part === 'previews'))
    throw new Error('Bewaar de export buiten de mappen met originele media en previewkopieën.')
  if (project.assets.some(asset => (asset.path === join(outputDirectory, basename(outputPath)) || asset.previewPath === join(outputDirectory, basename(outputPath))))) throw new Error('Een export mag geen bronbestand vervangen.')
  const temporary = join(outputDirectory, `.huphe-export-${randomUUID()}.mp4`)
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
    const addGap = (length: number) => {
      if (length <= 0) return
      const label = `segment${segmentId++}`
      if (video) filters.push(`color=c=black@0:s=${size}:r=${project.fps},format=rgba,trim=end_frame=${length},setpts=PTS-STARTPTS,setsar=1[${label}]`)
      else filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(length, project.fps)},asetpts=PTS-STARTPTS[${label}]`)
      segments.push(`[${label}]`)
    }
    for (const clip of clips) {
      addGap(clip.start - cursor)
      const { asset, variant } = activeMedia(project, clip)
      if (!asset || !variant) throw new Error('Een fragment mist zijn bronbestand.')
      if (asset.kind === 'image') args.push('-loop', '1', '-framerate', String(project.fps))
      args.push('-protocol_whitelist', 'file,pipe', '-i', asset.path)
      const label = `segment${segmentId++}`
      if (video) {
        const rect = visualClipRect(project, clip, asset)
        const source = asset.kind === 'image'
          ? `[${inputIndex}:v:0]trim=end_frame=${clip.duration},setpts=PTS-STARTPTS`
          // Keep the frame immediately before a fractional in-point. Rounding
          // source timestamps up implements preceding-frame sampling, also for VFR.
          : `[${inputIndex}:v:0]setpts=PTS-STARTPTS-${variant.inPoint.toFixed(9)}/TB,fps=fps=${project.fps}:start_time=0:round=up,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${clip.duration},setpts=PTS-STARTPTS`
        filters.push(`${source},scale=${rect.width}:${rect.height},setsar=1,format=rgba,colorchannelmixer=aa=${clip.opacity ?? 1}[${label}source]`)
        if (rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= project.width && rect.y + rect.height <= project.height) {
          filters.push(`[${label}source]pad=${project.width}:${project.height}:${rect.x}:${rect.y}:color=black@0[${label}]`)
        } else {
          // Overlay on a transparent frame handles negative offsets and enlarged
          // elements without changing their requested geometry.
          filters.push(`color=c=black@0:s=${size}:r=${project.fps},format=rgba,trim=end_frame=${clip.duration},setpts=PTS-STARTPTS[${label}canvas]`)
          filters.push(`[${label}canvas][${label}source]overlay=x=${rect.x}:y=${rect.y}:shortest=1:format=auto[${label}]`)
        }
      } else {
        filters.push(`[${inputIndex}:a:0]atrim=start=${variant.inPoint.toFixed(9)}:duration=${seconds(clip.duration, project.fps)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${clip.gain ?? 1},apad,atrim=duration=${seconds(clip.duration, project.fps)}[${label}]`)
      }
      inputIndex++
      segments.push(`[${label}]`)
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
  filters.push(`${composite}format=yuv420p[vout]`)
  if (!audioLayers.length) filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(frames, project.fps)}[aout]`)
  else if (audioLayers.length === 1) filters.push(`${audioLayers[0]}anull[aout]`)
  // Do not automatically attenuate one track when another track is added.
  else filters.push(`${audioLayers.join('')}amix=inputs=${audioLayers.length}:duration=longest:normalize=0[aout]`)
  const encoder = options.encoder || (process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264')
  args.push('-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-frames:v', String(frames), '-t', seconds(frames, project.fps), '-r', String(project.fps), '-fps_mode', 'cfr', '-c:v', encoder,
    ...(encoder === 'h264_videotoolbox' ? ['-b:v', '12M'] : encoder === 'libx264' ? ['-preset', 'veryfast', '-crf', '18'] : ['-q:v', '2']),
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', temporary)
  try {
    await runTimelineTool(tools.ffmpeg, args, 30 * 60_000)
    if ((await stat(temporary)).size === 0) throw new Error('De export heeft geen bestand opgeleverd.')
    await rename(temporary, outputPath)
    return { path: outputPath, duration, frames }
  } finally { await unlink(temporary).catch(() => {}) }
}
