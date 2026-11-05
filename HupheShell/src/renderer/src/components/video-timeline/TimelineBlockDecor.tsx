import { useEffect, useState } from 'react'
import { thumbnailAt } from './timeline-thumbnails'
import { clipFades, clipSpeed, sourceSeconds, type TimelineAsset, type TimelineClip, type TimelineProject } from '../../../../shared/video-timeline'

const PEAKS_PER_SECOND = 100
const MAX_SECONDS = 1800
const cache = new Map<string, Promise<Float32Array | null>>()

/** Loudest sample per 10 ms of an audio file, decoded once per source and kept for the session. */
function loadPeaks(asset: TimelineAsset): Promise<Float32Array | null> {
  const known = cache.get(asset.src)
  if (known) return known
  const promise = (async () => {
    if (asset.duration > MAX_SECONDS) return null
    try {
      const response = await fetch(asset.src)
      if (!response.ok) return null
      const context = new OfflineAudioContext(1, 1, asset.sampleRate || 48000)
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      const size = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SECOND))
      const peaks = new Float32Array(Math.ceil(buffer.length / size))
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel)
        for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > peaks[(i / size) | 0]) peaks[(i / size) | 0] = v }
      }
      return peaks
    } catch { return null }
  })()
  cache.set(asset.src, promise)
  return promise
}

function Waveform({ asset, inPoint, length, width, gain }: { asset: TimelineAsset; inPoint: number; length: number; width: number; gain: number }) {
  const [peaks, setPeaks] = useState<Float32Array | null>()
  useEffect(() => { let live = true; void loadPeaks(asset).then(p => { if (live) setPeaks(p) }); return () => { live = false } }, [asset])
  if (!peaks || width < 8) return null
  const bars = Math.min(1200, Math.max(8, Math.floor(width / 2)))
  let d = ''
  for (let bar = 0; bar < bars; bar++) {
    const from = Math.floor((inPoint + length * bar / bars) * PEAKS_PER_SECOND), to = Math.max(from + 1, Math.floor((inPoint + length * (bar + 1) / bars) * PEAKS_PER_SECOND))
    let max = 0
    for (let i = from; i < to && i < peaks.length; i++) if (peaks[i] > max) max = peaks[i]
    const half = Math.max(0.5, Math.min(1, max * gain) * 46)
    d += `M${bar + 0.5} ${50 - half}V${50 + half}`
  }
  return <svg className="vt-wave" viewBox={`0 0 ${bars} 100`} preserveAspectRatio="none" aria-hidden="true"><path d={d} /></svg>
}

const FRAME_WIDTH = 90

/** A strip of frames behind the block's label so a clip can be recognised and cut at the right moment. */
function Filmstrip({ project, clip, asset, inPoint, width }: { project: TimelineProject; clip: TimelineClip; asset: TimelineAsset; inPoint: number; width: number }) {
  const count = Math.max(1, Math.min(14, Math.ceil(width / FRAME_WIDTH)))
  const src = asset.previewSrc ?? asset.src
  const length = sourceSeconds(clip, clip.duration, project.fps)
  const [frames, setFrames] = useState<(string | null)[]>([])
  useEffect(() => {
    if (asset.kind === 'image') { setFrames([asset.src]); return }
    let live = true
    // Wait until a trim or zoom gesture settles; the thumbnails are made one at a time.
    const timer = setTimeout(() => {
      void Promise.all(Array.from({ length: count }, (_, i) => thumbnailAt(src, inPoint + (i + 0.5) / count * length))).then(urls => { if (live) setFrames(urls) })
    }, 200)
    return () => { live = false; clearTimeout(timer) }
  }, [asset.kind, asset.src, src, inPoint, length, count])
  if (!frames.some(Boolean)) return null
  return <div className="vt-strip" aria-hidden="true">{frames.map((url, i) => url ? <img key={i} src={url} alt="" draggable={false} /> : <span key={i} style={{ flex: '1 1 0' }} />)}</div>
}

/** Waveform, fade ramps, crossfade marker and speed badge drawn inside a timeline block. */
export function TimelineBlockDecor({ project, clip, asset, inPoint, width }: { project: TimelineProject; clip: TimelineClip; asset?: TimelineAsset; inPoint: number; width: number }) {
  const fades = clipFades(project, clip)
  const px = (frames: number) => (clip.duration ? frames / clip.duration : 0) * width
  const speed = clipSpeed(clip)
  return <>
    {clip.track === 'video' && !clip.text && asset && (asset.kind === 'video' || asset.kind === 'image') && <Filmstrip project={project} clip={clip} asset={asset} inPoint={inPoint} width={width} />}
    {clip.track === 'audio' && asset?.kind === 'audio' && <Waveform asset={asset} inPoint={inPoint} length={sourceSeconds(clip, clip.duration, project.fps)} width={width} gain={clip.gain ?? 1} />}
    {fades.fadeIn > 0 && <svg className="vt-fade in" style={{ width: px(fades.fadeIn) }} viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10L10 0V10Z" /></svg>}
    {fades.fadeOut > 0 && <svg className="vt-fade out" style={{ width: px(fades.fadeOut) }} viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0L10 10H0Z" /></svg>}
    {fades.crossfade > 0 && <svg className="vt-fade cross" style={{ width: px(fades.crossfade) }} viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10L10 0M0 0L10 10" /></svg>}
    {speed !== 1 && <i className="vt-speed">{speed}×</i>}
  </>
}
