import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { z } from 'zod'
import type { TimelineAsset } from '../../shared/video-timeline'
import { probeTimelineMedia, type TimelineTools } from './video-timeline-media'
import { loadTimelineProject, timelineIdSchema } from './video-timeline-storage'

export const timelineReferencesSchema = z.object({ projectId: timelineIdSchema,
  assetIds: z.array(timelineIdSchema).max(50), accessToken: z.string().min(10).max(10_000) })

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
  const counts = { image: 0, video: 0, audio: 0 }
  const durations = { video: 0, audio: 0 }
  for (const asset of selected) {
    const limit = limits[asset.kind]
    if (++counts[asset.kind] > limit.count) throw new Error(`Maximaal ${limit.count} ${asset.kind}-referenties toegestaan.`)
  }
  for (const asset of selected) {
    const limit = limits[asset.kind]
    if ((await stat(asset.path)).size > limit.bytes) throw new Error(`${asset.name}: de referentie is groter dan ${limit.bytes / 1024 ** 2} MB.`)
    // Re-probe the durable source: imported metadata or a changed manifest is not sufficient.
    const metadata = await probeTimelineMedia(asset.path, asset.kind, tools)
    if (asset.kind !== 'image') {
      if (metadata.duration < 1.8 || metadata.duration > 30.2) throw new Error(`${asset.name}: een ${asset.kind}-referentie moet tussen 1,8 en 30,2 seconden duren.`)
      durations[asset.kind] += metadata.duration
      if (durations[asset.kind] > 30.2 + 1e-6) throw new Error(`De totale duur van de ${asset.kind}-referenties mag maximaal 30,2 seconden zijn.`)
    }
    if (!mimeTypes[extname(asset.path).toLowerCase()]?.startsWith(`${asset.kind}/`)) throw new Error(`${asset.name}: het referentieformaat wordt niet ondersteund.`)
  }
  const references: TimelineReferenceUrls = { imageUrls: [], videoUrls: [], audioUrls: [] }
  for (const asset of selected) {
    const buffer = await readFile(asset.path)
    if (buffer.length > limits[asset.kind].bytes) throw new Error(`${asset.name}: de referentie is na controle te groot geworden.`)
    const url = await upload({ buffer, contentType: mimeTypes[extname(asset.path).toLowerCase()], fileName: basename(asset.path), accessToken: request.accessToken })
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('De referentie-upload gaf geen geldige URL terug.') }
    if (parsed.protocol !== 'https:') throw new Error('De referentie-upload gaf geen beveiligde URL terug.')
    references[`${asset.kind}Urls` as `${TimelineAsset['kind']}Urls`].push(url)
  }
  return references
}
