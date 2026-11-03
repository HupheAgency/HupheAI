import { resolveVideoMode, videoExtraParamErrors, videoExtraParams } from '../../../../shared/video-model-capabilities'
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
  const mode = cap && resolveVideoMode(cap, { imageCount: references.filter(a => a.kind === 'image').length,
    videoCount: references.filter(a => a.kind === 'video').length, audioCount: references.filter(a => a.kind === 'audio').length,
    hasStart: !!g.referenceAssetId, hasEnd: !!g.endImageAssetId, task, resolution: g.resolution, extraParams: g.extraParams })
  const effective = mode?.capability ?? cap
  const forcedAuto = mode?.forceAutoDuration ?? false
  const forcedAspect = mode?.forceAutoAspect ?? false
  const start = (!hasReferences || mode?.allowsStartImage) ? assets.find(a => a.id === g.referenceAssetId) : undefined
  const end = start && effective?.supports_end_image ? assets.find(a => a.id === g.endImageAssetId) : undefined
  const draft = !!effective?.supports_draft && (!hasReferences || !!effective.supports_reference_draft) && !!g.draft
  const fixedDuration = effective?.api_contract_version && effective.supported_durations.length === 1 ? effective.supported_durations[0] : undefined
  const snapshot: TimelineGeneration = {
    ...g, requestedDuration: forcedAuto ? 'auto' : fixedDuration ?? g.requestedDuration,
    resolution: draft ? '480p' : effective?.api_contract_version && effective.supported_resolutions.length === 1 ? effective.supported_resolutions[0] : g.resolution,
    aspectRatio: forcedAspect ? 'auto' : g.aspectRatio,
    referenceAssetId: start?.id, endImageAssetId: end?.id, referenceAssetIds: ids,
    task, draft, generateAudio: !!effective?.generate_audio && !!g.generateAudio,
    seed: effective?.seed && (!(effective.seed_requires_references ?? true) || hasReferences) ? g.seed : undefined,
    bitrateMode: effective?.bitrate_mode ? g.bitrateMode ?? 'standard' : undefined,
    codec: effective?.codec ? g.codec ?? 'auto' : undefined,
    extraParams: videoExtraParams(effective?.extra_fields, g.extraParams),
  }
  const errors: string[] = []
  if (!effective) errors.push('Kies een videomodel.')
  else {
    if (snapshot.requestedDuration === 'auto' ? !effective.supports_auto_duration : !generationDurations(effective).includes(snapshot.requestedDuration)) errors.push('Kies een ondersteunde generatieduur.')
    if (!effective.supported_resolutions.includes(snapshot.resolution)) errors.push('Kies een ondersteunde resolutie.')
    if (!(snapshot.aspectRatio === 'auto' && forcedAspect) && !effective.supported_aspect_ratios.includes(snapshot.aspectRatio)) errors.push('Kies een ondersteunde beeldverhouding.')
    if (references.length !== ids.length) errors.push('Een geselecteerde referentie ontbreekt in dit project.')
    if (mode?.allowsStartImage && g.referenceAssetId && start?.kind !== 'image') errors.push('Het startbeeld ontbreekt in dit project.')
    if (start && effective.supports_end_image && g.endImageAssetId && end?.kind !== 'image') errors.push('Het eindbeeld ontbreekt in dit project.')
    if (hasReferences && !mode?.tasks.includes(task)) errors.push('Kies een ondersteunde referentiemodus.')
    if (hasReferences && ['editing', 'extension'].includes(task) && !references.some(a => a.kind === 'video')) errors.push('Deze modus vereist een videoreferentie.')
    const limits = effective.reference_limits ?? { image: 30, video: 10, audio: 10 }
    for (const kind of ['image', 'video', 'audio'] as const) {
      const items = references.filter(a => a.kind === kind)
      const rule = effective.reference_constraints?.[kind] ?? (effective.api_contract_version ? {} : { min_duration: 1.8, max_duration: 30.2, max_total_duration: 30.2 })
      if (items.length > limits[kind]) errors.push(`Dit model ondersteunt in deze modus maximaal ${limits[kind]} ${kind}-referenties.`)
      if (kind !== 'image' && items.some(a => a.duration < (rule.min_duration ?? 0) || a.duration > (rule.max_duration ?? Infinity))) errors.push(`De ${kind}-referentie moet tussen ${rule.min_duration ?? 0} en ${rule.max_duration} seconden duren.`)
      if (kind !== 'image' && items.reduce((sum, a) => sum + a.duration, 0) > (rule.max_total_duration ?? Infinity) + 0.00001) errors.push(`De ${kind}-referenties mogen samen maximaal ${rule.max_total_duration} seconden duren.`)
      if (rule.extensions && items.some(a => !rule.extensions!.some(ext => a.path.toLowerCase().endsWith(ext)))) errors.push(`Gebruik voor ${kind}-referenties ${rule.extensions.join(' of ')}.`)
    }
    if (snapshot.seed !== undefined && !Number.isSafeInteger(snapshot.seed)) errors.push('Seed moet een geheel getal zijn.')
    errors.push(...videoExtraParamErrors(effective.extra_fields, g.extraParams))
  }
  if (Array.isArray(snapshot.extraParams?.elements) && snapshot.extraParams.elements.some(e => e?.voice_id) && !snapshot.generateAudio) errors.push('Een stem-ID vereist gegenereerde audio.')
  const hasShots = Array.isArray(snapshot.extraParams?.multi_prompt) && snapshot.extraParams.multi_prompt.length > 0
  const promptReady = !!g.prompt.trim() || hasShots || (!!effective?.prompt_optional && !!start && !effective.extra_fields?.multi_prompt)
  if (hasShots) {
    if (g.prompt.trim()) errors.push('Gebruik de shotprompts en maak de algemene prompt leeg.')
    if ((snapshot.extraParams!.multi_prompt as any[]).reduce((sum, shot) => sum + Number(shot.duration), 0) !== snapshot.requestedDuration) errors.push('De shotduren moeten samen gelijk zijn aan de generatieduur.')
  }
  if (effective?.prompt_max_length && g.prompt.length > effective.prompt_max_length) errors.push(`De prompt mag maximaal ${effective.prompt_max_length} tekens bevatten.`)
  return { snapshot, references, hasReferences, forcedAuto, forcedAspect, start, end, errors, promptReady, capability: effective, mode }
}

export function timelineGenerationCredits(cap: AtelierVideoCapability | undefined, g: TimelineGeneration, hasVideoReference = false): number | null {
  if (!cap) return null
  const duration = typeof g.requestedDuration === 'number' ? g.requestedDuration : 5
  const skus = (g.extraParams?.variant === 'fast' ? cap.fast_pricing_skus : undefined) ?? cap.pricing_skus ?? {}
  const audio = g.generateAudio ? 'with_audio' : 'without_audio'
  const rate = [`duration_seconds_${audio}_${g.resolution.toLowerCase()}`, `duration_seconds_${audio}`, `duration_seconds_${g.resolution.toLowerCase()}`, 'duration_seconds', `per-video-second-${g.resolution}`, 'per-video-second']
    .map(k => Number.parseFloat(skus[k])).find(n => Number.isFinite(n))
  const voiceControl = cap.model_id === 'fal-ai/kling-video/v3/pro' && Array.isArray(g.extraParams?.elements) && g.extraParams.elements.some(e => e?.voice_id)
  const audioMultiplier = voiceControl ? 0.196 / 0.112 : cap.audio_rate_multiplier ?? 1
  const usd = g.draft && cap.draft_rate_per_second != null ? cap.draft_rate_per_second * duration
    : rate != null ? rate * duration * (g.generateAudio ? audioMultiplier : 1) * (hasVideoReference && cap.model_id === 'bytedance/seedance-2.5' ? 0.6 : 1)
    : cap.video_cost_estimate / 100000 * duration / 5
  return Number.isFinite(usd) && usd > 0 ? Math.ceil(Math.ceil(usd * 100000 * (1 + (cap.markup_pct ?? 0) / 100)) / 100) : null
}

export function timelineFinalizeCredits(cap: AtelierVideoCapability | undefined, duration: number): number | null {
  const usd = (cap?.draft_finalize_rate_per_second ?? 0) * duration
  return usd > 0 ? Math.ceil(Math.ceil(usd * 100000 * (1 + (cap?.markup_pct ?? 0) / 100)) / 100) : null
}
