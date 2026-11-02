import type { TimelineAsset, TimelineGeneration } from '../../../../shared/video-timeline'
import type { AtelierVideoCapability } from '../../hooks/useAtelierMedia'

export function generationDurations(capability?: AtelierVideoCapability): number[] {
  return [...new Set(capability?.supported_durations ?? [])].filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
}

/** Resolve the actual provider settings without discarding the user's other saved inputs. */
export function timelineGenerationState(g: TimelineGeneration, cap: AtelierVideoCapability | undefined, assets: TimelineAsset[]) {
  const ids = cap?.supports_references ? g.referenceAssetIds ?? [] : []
  const references = ids.flatMap(id => assets.find(a => a.id === id) ?? [])
  const hasReferences = ids.length > 0
  const task = hasReferences ? g.task ?? 'reference' : 'reference'
  const forcedAuto = hasReferences && task !== 'reference'
  const start = !hasReferences ? assets.find(a => a.id === g.referenceAssetId) : undefined
  const end = start && cap?.supports_end_image ? assets.find(a => a.id === g.endImageAssetId) : undefined
  const draft = !!cap?.supports_draft && !hasReferences && !!g.draft
  const snapshot: TimelineGeneration = {
    ...g, requestedDuration: forcedAuto ? 'auto' : g.requestedDuration,
    resolution: draft ? '480p' : g.resolution,
    aspectRatio: forcedAuto || (g.provider === 'fal' && start) ? 'auto' : g.aspectRatio,
    referenceAssetId: start?.id, endImageAssetId: end?.id, referenceAssetIds: ids,
    task, draft, generateAudio: !!cap?.generate_audio && !!g.generateAudio,
    seed: cap?.seed && hasReferences ? g.seed : undefined,
    bitrateMode: cap?.bitrate_mode ? g.bitrateMode ?? 'standard' : undefined,
    codec: cap?.codec ? g.codec ?? 'auto' : undefined,
  }
  const errors: string[] = []
  if (!cap) errors.push('Kies een videomodel.')
  else {
    if (snapshot.requestedDuration === 'auto' ? !cap.supports_auto_duration : !generationDurations(cap).includes(snapshot.requestedDuration)) errors.push('Kies een ondersteunde generatieduur.')
    if (!cap.supported_resolutions.includes(snapshot.resolution)) errors.push('Kies een ondersteunde resolutie.')
    if (snapshot.aspectRatio !== 'auto' && !cap.supported_aspect_ratios.includes(snapshot.aspectRatio)) errors.push('Kies een ondersteunde beeldverhouding.')
    if (references.length !== ids.length) errors.push('Een geselecteerde referentie ontbreekt in dit project.')
    if (!hasReferences && g.referenceAssetId && start?.kind !== 'image') errors.push('Het startbeeld ontbreekt in dit project.')
    if (start && cap.supports_end_image && g.endImageAssetId && end?.kind !== 'image') errors.push('Het eindbeeld ontbreekt in dit project.')
    const limits = cap.reference_limits ?? { image: 30, video: 10, audio: 10 }
    for (const kind of ['image', 'video', 'audio'] as const) {
      const items = references.filter(a => a.kind === kind)
      if (items.length > limits[kind]) errors.push(`Dit model ondersteunt maximaal ${limits[kind]} ${kind}-referenties.`)
      if (kind !== 'image' && items.some(a => a.duration < 1.8 || a.duration > 30.2)) errors.push('Video- en audioreferenties moeten elk tussen 1,8 en 30,2 seconden duren.')
      if (kind !== 'image' && items.reduce((sum, a) => sum + a.duration, 0) > 30.2 + 0.00001) errors.push(`De ${kind}-referenties mogen samen maximaal 30,2 seconden duren.`)
    }
    if (snapshot.seed !== undefined && !Number.isSafeInteger(snapshot.seed)) errors.push('Seed moet een geheel getal zijn.')
  }
  return { snapshot, references, hasReferences, forcedAuto, start, end, errors }
}

export function timelineGenerationCredits(cap: AtelierVideoCapability | undefined, g: TimelineGeneration, hasVideoReference = false): number | null {
  if (!cap) return null
  const duration = typeof g.requestedDuration === 'number' ? g.requestedDuration : 5
  const skus = cap.pricing_skus ?? {}
  const audio = g.generateAudio ? 'with_audio' : 'without_audio'
  const rate = [`duration_seconds_${audio}_${g.resolution.toLowerCase()}`, `duration_seconds_${audio}`, `duration_seconds_${g.resolution.toLowerCase()}`, 'duration_seconds', `per-video-second-${g.resolution}`, 'per-video-second']
    .map(k => Number.parseFloat(skus[k])).find(n => Number.isFinite(n))
  const usd = g.draft && cap.draft_rate_per_second != null ? cap.draft_rate_per_second * duration
    : rate != null ? rate * duration * (g.generateAudio ? cap.audio_rate_multiplier ?? 1 : 1) * (hasVideoReference ? 0.6 : 1)
    : cap.video_cost_estimate / 100000 * duration / 5
  return Number.isFinite(usd) && usd > 0 ? Math.ceil(Math.ceil(usd * 100000 * (1 + (cap.markup_pct ?? 0) / 100)) / 100) : null
}

export function timelineFinalizeCredits(cap: AtelierVideoCapability | undefined, duration: number): number | null {
  const usd = (cap?.draft_finalize_rate_per_second ?? 0) * duration
  return usd > 0 ? Math.ceil(Math.ceil(usd * 100000 * (1 + (cap?.markup_pct ?? 0) / 100)) / 100) : null
}
