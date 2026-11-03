import { REFERENCE_RULES, SEEDANCE, VEO, WAN, KLING } from '../../../supabase/functions/_shared/video-generation-contract'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { z } from 'zod'
import type { TimelineAsset } from '../../shared/video-timeline'
import { probeTimelineMedia, type TimelineTools } from './video-timeline-media'
import { loadTimelineProject, timelineIdSchema } from './video-timeline-storage'

export const timelineReferencesSchema = z.object({ projectId: timelineIdSchema,
  assetIds: z.array(timelineIdSchema).max(50), modelId: z.enum([SEEDANCE, VEO, WAN, KLING]).optional(), task: z.enum(['auto', 'reference', 'editing', 'extension']).optional(), accessToken: z.string().min(10).max(10_000) })

export interface TimelineReferenceUrls { imageUrls: string[]; videoUrls: string[]; audioUrls: string[] }
export type TimelineReferenceUploader = (input: { buffer: Buffer; contentType: string; fileName: string; accessToken: string }) => Promise<string>

const limits = { image: { count: 30, bytes: 30 * 1024 ** 2 }, video: { count: 10, bytes: 200 * 1024 ** 2 }, audio: { count: 10, bytes: 15 * 1024 ** 2 } }
const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' }

/** Validate every owned source before uploading any bytes. URLs exist only for this request. */
export async function prepareTimelineReferences(root: string, input: unknown, upload: TimelineReferenceUploader,
  tools?: TimelineTools): Promise<TimelineReferenceUrls> {
  const request = timelineReferencesSchema.parse(input)
  if (new Set(request.assetIds).size !== request.assetIds.length) throw new Error('Een referentie mag maar één keer worden toegevoegd.')
  const project = await loadTimelineProject(root, request.projectId)
  const selected = request.assetIds.map(id => {
    const asset = project.assets.find(item => item.id === id)
    if (!asset) throw new Error('Een referentie behoort niet tot het opgeslagen project.')
    return asset
  })
  const modelRules = REFERENCE_RULES[request.modelId ?? SEEDANCE]
  const modelCounts = request.modelId === WAN ? { image: 0, video: 0, audio: 1 }
    : request.modelId === VEO ? request.task === 'extension' ? { image: 0, video: 1, audio: 0 } : { image: 3, video: 0, audio: 0 }
    : request.modelId === KLING ? { image: 0, video: 0, audio: 0 } : { image: 30, video: 10, audio: 10 }
  const counts = { image: 0, video: 0, audio: 0 }
  const durations = { video: 0, audio: 0 }
  for (const asset of selected) {
    if (++counts[asset.kind] > modelCounts[asset.kind]) throw new Error(`Maximaal ${modelCounts[asset.kind]} ${asset.kind}-referenties toegestaan.`)
  }
  for (const asset of selected) {
    const limit = { ...limits[asset.kind], bytes: modelRules?.[asset.kind]?.max_bytes ?? limits[asset.kind].bytes }
    const rule = modelRules?.[asset.kind] ?? {}
    if (rule.extensions && !rule.extensions.includes(extname(asset.path).toLowerCase())) throw new Error(`${asset.name}: gebruik ${rule.extensions.join(' of ')}.`)
    if ((await stat(asset.path)).size > limit.bytes) throw new Error(`${asset.name}: de referentie is groter dan ${limit.bytes / 1024 ** 2} MB.`)
    // Re-probe the durable source: imported metadata or a changed manifest is not sufficient.
    const metadata = await probeTimelineMedia(asset.path, asset.kind, tools)
    if (asset.kind !== 'image') {
      if (metadata.duration < (rule.min_duration ?? 0) || metadata.duration > (rule.max_duration ?? Infinity)) throw new Error(`${asset.name}: een ${asset.kind}-referentie moet tussen ${(rule.min_duration ?? 0).toLocaleString('nl-NL')} en ${rule.max_duration?.toLocaleString('nl-NL')} seconden duren.`)
      durations[asset.kind] += metadata.duration
      if (durations[asset.kind] > (rule.max_total_duration ?? Infinity) + 1e-6) throw new Error(`De totale duur van de ${asset.kind}-referenties mag maximaal ${rule.max_total_duration} seconden zijn.`)
    }
    if (request.modelId && asset.kind !== 'audio') {
      if (rule.min_dimension && Math.min(metadata.width ?? 0, metadata.height ?? 0) < rule.min_dimension) throw new Error(`${asset.name}: minimaal ${rule.min_dimension} pixels per zijde vereist.`)
      if (rule.max_dimension && Math.max(metadata.width ?? 0, metadata.height ?? 0) > rule.max_dimension) throw new Error(`${asset.name}: maximaal ${rule.max_dimension} pixels per zijde toegestaan.`)
      if (asset.kind === 'video' && metadata.fps && ((rule.min_fps && metadata.fps < rule.min_fps) || (rule.max_fps && metadata.fps > rule.max_fps))) throw new Error(`${asset.name}: ongeschikte framerate voor dit model.`)
    }
    if (!mimeTypes[extname(asset.path).toLowerCase()]?.startsWith(`${asset.kind}/`)) throw new Error(`${asset.name}: het referentieformaat wordt niet ondersteund.`)
  }
  const references: TimelineReferenceUrls = { imageUrls: [], videoUrls: [], audioUrls: [] }
  for (const asset of selected) {
    const buffer = await readFile(asset.path)
    if (buffer.length > (modelRules?.[asset.kind]?.max_bytes ?? limits[asset.kind].bytes)) throw new Error(`${asset.name}: de referentie is na controle te groot geworden.`)
    const url = await upload({ buffer, contentType: mimeTypes[extname(asset.path).toLowerCase()], fileName: basename(asset.path), accessToken: request.accessToken })
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('De referentie-upload gaf geen geldige URL terug.') }
    if (parsed.protocol !== 'https:') throw new Error('De referentie-upload gaf geen beveiligde URL terug.')
    references[`${asset.kind}Urls` as `${TimelineAsset['kind']}Urls`].push(url)
  }
  return references
}
