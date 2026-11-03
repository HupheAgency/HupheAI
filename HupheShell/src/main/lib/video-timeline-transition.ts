import { randomUUID } from 'node:crypto'
import { rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { activeMedia, visualClipRect, type TimelineAsset, type TimelineClip, type TimelineProject, type TimelineTransition } from '../../shared/video-timeline'
import { transitionSourceClips, transitionSourceSignature, validateTransitionRange } from '../../shared/video-timeline-transition'
import { probeTimelineMedia, requireTimelineTools, runTimelineTool, timelineFileUrl, type TimelineTools } from './video-timeline-media'
import { loadTimelineProject, timelineIdSchema, timelineOriginalsDirectory } from './video-timeline-storage'

export const timelineCaptureTransitionSchema = z.object({ projectId: timelineIdSchema, clipId: timelineIdSchema })

async function captureFrame(project: TimelineProject, transition: TimelineClip, frame: number, output: string, tools: TimelineTools): Promise<void> {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n']
  const filters: string[] = [`color=c=black:s=${project.width}x${project.height}:r=${project.fps},trim=end_frame=1,setpts=PTS-STARTPTS,setsar=1,format=rgba[background]`]
  let composite = '[background]'
  let index = 0
  for (const clip of transitionSourceClips(project, transition, frame)) {
    const { asset, variant } = activeMedia(project, clip)
    if (!asset || !variant || !['image', 'video'].includes(asset.kind) || (clip.opacity ?? 1) <= 0) continue
    const rect = visualClipRect(project, clip, asset)
    if (rect.x >= project.width || rect.y >= project.height || rect.x + rect.width <= 0 || rect.y + rect.height <= 0) continue
    if (asset.kind === 'image') args.push('-loop', '1', '-framerate', String(project.fps))
    // Read only the managed original. Do not seek a browser preview or round a VFR source time.
    args.push('-protocol_whitelist', 'file,pipe', '-i', asset.path)
    const source = asset.kind === 'image'
      ? `[${index}:v:0]trim=end_frame=1,setpts=PTS-STARTPTS`
      // This is the exporter's preceding-frame sampling including a fractional source in-point.
      : `[${index}:v:0]setpts=PTS-STARTPTS-${variant.inPoint.toFixed(9)}/TB,fps=fps=${project.fps}:start_time=0:round=up,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${clip.duration},select=eq(n\\,${frame - clip.start}),setpts=PTS-STARTPTS`
    filters.push(`${source},scale=${rect.width}:${rect.height},setsar=1,format=rgba,colorchannelmixer=aa=${clip.opacity ?? 1}[source${index}]`)
    if (rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= project.width && rect.y + rect.height <= project.height) {
      filters.push(`[source${index}]pad=${project.width}:${project.height}:${rect.x}:${rect.y}:color=black@0[layer${index}]`)
    } else {
      filters.push(`color=c=black@0:s=${project.width}x${project.height}:r=${project.fps},format=rgba,trim=end_frame=1,setpts=PTS-STARTPTS[canvas${index}]`)
      filters.push(`[canvas${index}][source${index}]overlay=x=${rect.x}:y=${rect.y}:shortest=1:format=auto[layer${index}]`)
    }
    filters.push(`${composite}[layer${index}]overlay=shortest=1:format=auto[composite${index}]`)
    composite = `[composite${index++}]`
  }
  if (!index) throw new Error('Op dit tijdstip staat geen zichtbaar bronbeeld onder de overgang.')
  filters.push(`${composite}format=rgb24[image]`)
  args.push('-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[image]', '-frames:v', '1',
    '-c:v', 'png', '-compression_level', '3', '-update', '1', output)
  await runTimelineTool(tools.ffmpeg, args, 5 * 60_000)
  if (!(await stat(output)).size) throw new Error('Het vastleggen van het overgangsframe heeft geen afbeelding opgeleverd.')
  const metadata = await probeTimelineMedia(output, 'image', tools)
  if (metadata.width !== project.width || metadata.height !== project.height)
    throw new Error('Het vastgelegde overgangsframe heeft niet het ingestelde filmformaat.')
}

/** Save lossless endpoint images, never changing source media, clips, or the project manifest. */
export async function captureTimelineTransition(root: string, input: unknown, tools?: TimelineTools): Promise<{
  assets: [TimelineAsset, TimelineAsset]; transition: TimelineTransition
}> {
  const request = timelineCaptureTransitionSchema.parse(input)
  const project = await loadTimelineProject(root, request.projectId)
  const clip = project.clips.find(item => item.id === request.clipId)
  if (!clip) throw new Error('De overgang bestaat niet in dit opgeslagen project.')
  const problems = validateTransitionRange(project, clip)
  if (problems.length) throw new Error(problems.join('\n'))
  const signature = transitionSourceSignature(project, clip)
  const bins = await requireTimelineTools(tools)
  const used = new Set([clip.start, clip.start + clip.duration].flatMap(frame =>
    transitionSourceClips(project, clip, frame).flatMap(source => {
      const { asset } = activeMedia(project, source)
      return asset && ['image', 'video'].includes(asset.kind) ? [asset.id] : []
    })))
  for (const asset of project.assets.filter(item => used.has(item.id))) Object.assign(asset, await probeTimelineMedia(asset.path, asset.kind, bins))
  const actualProblems = validateTransitionRange(project, clip)
  if (actualProblems.length) throw new Error(actualProblems.join('\n'))
  const directory = await timelineOriginalsDirectory(root, project.id)
  const created: string[] = []
  const assets: TimelineAsset[] = []
  try {
    for (const [label, frame] of [['begin', clip.start], ['eind', clip.start + clip.duration]] as const) {
      const id = randomUUID()
      const path = join(directory, `${id}.png`)
      const temporary = join(directory, `${id}.partial.png`)
      created.push(temporary, path)
      await captureFrame(project, clip, frame, temporary, bins)
      await rename(temporary, path)
      assets.push({ id, kind: 'image', name: `${clip.label.slice(0, 240)} · ${label}frame.png`, path, src: timelineFileUrl(path),
        duration: 0, width: project.width, height: project.height })
    }
    return { assets: assets as [TimelineAsset, TimelineAsset], transition: { kind: 'rife', startFrameAssetId: assets[0].id,
      endFrameAssetId: assets[1].id, sourceSignature: signature, capturedStart: clip.start, capturedEnd: clip.start + clip.duration,
      capturedAt: new Date().toISOString() } }
  } catch (error) {
    await Promise.all(created.map(path => unlink(path).catch(() => {})))
    throw error
  }
}
