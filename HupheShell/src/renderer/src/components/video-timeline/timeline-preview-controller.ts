import { activeMedia, clipTrackId, timelineEnd, timelineTracks, visualClipRect, type TimelineProject } from '../../../../shared/video-timeline'

export interface PreviewCallbacks {
  onPosition: (seconds: number) => void
  onPlaying: (playing: boolean) => void
  onError?: (message: string) => void
}

interface VideoSegment {
  key: string
  trackId: string
  kind: 'video' | 'image'
  src: string
  start: number
  end: number
  inPoint: number
  rect: { x: number; y: number; width: number; height: number }
  opacity: number
}

interface ImageResource {
  image: HTMLImageElement
  ready: boolean
  error: string | null
  waiters: Set<{ resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>
  cleanup: () => void
}

interface PreviewLayer {
  segment: VideoSegment
  slot: VideoSlot | null
  image: ImageResource | null
}

interface VideoSlot {
  video: HTMLVideoElement
  key: string
  pendingSeek: number | null
  ready: boolean
  error: string | null
  frame: ImageBitmap | null
  captureVersion: number
  presentedVersion: number
  mediaTime: number | null
  seekStarted: number
  lastCorrection: number
  playPending: boolean
  frameCallback: number | null
  waiters: Set<{ resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>
  cleanup: () => void
}

export function previewAudioSchedule(project: TimelineProject, position: number) {
  return project.clips.filter(clip => clip.track === 'audio').flatMap(clip => {
    const { asset, variant } = activeMedia(project, clip)
    const start = clip.start / project.fps
    const end = (clip.start + clip.duration) / project.fps
    if (!asset || !variant || end <= position || clip.duration <= 0) return []
    const elapsed = Math.max(0, position - start)
    return [{ src: asset.src, offset: variant.inPoint + elapsed,
      delay: Math.max(0, start - position), duration: end - Math.max(position, start), gain: clip.gain ?? 1 }]
  })
}

/** Owns transport state; React position updates are acknowledgements, not a second clock. */
export class TimelinePreviewController {
  private project: TimelineProject | null = null
  private projectSignature = ''
  private segments: VideoSegment[] = []
  private slots: VideoSlot[]
  private baseSlots: VideoSlot[]
  private trackSlots = new Map<string, VideoSlot[]>()
  private images = new Map<string, ImageResource>()
  private activeLayers: PreviewLayer[] = []
  private callbacks: PreviewCallbacks
  private context: AudioContext | null = null
  private buffers = new Map<string, Promise<AudioBuffer>>()
  private audioSources = new Map<AudioBufferSourceNode, GainNode>()
  private abort = new AbortController()
  private position = 0
  private anchorPosition = 0
  private anchorContextTime = 0
  private actualPlaying = false
  private wantedPlaying = false
  private disposed = false
  private epoch = 0
  private animationFrame: number | null = null
  private emittedPositions: number[] = []
  private lastPublishedFrame = -1
  private activeSlots = new Set<VideoSlot>()

  constructor(private canvas: HTMLCanvasElement, videos: [HTMLVideoElement, HTMLVideoElement], callbacks: PreviewCallbacks) {
    this.callbacks = callbacks
    this.baseSlots = videos.map(video => this.createSlot(video))
    this.slots = this.baseSlots
    this.draw()
  }

  setCallbacks(callbacks: PreviewCallbacks) { this.callbacks = callbacks }

  setProject(project: TimelineProject) {
    const signature = JSON.stringify({ id: project.id, width: project.width, height: project.height,
      fps: project.fps, assets: project.assets, tracks: project.tracks, clips: project.clips })
    this.project = project
    if (signature === this.projectSignature) return
    this.projectSignature = signature
    this.freeze()
    this.segments = project.clips.filter(clip => clip.track === 'video').flatMap(clip => {
      const { asset, variant } = activeMedia(project, clip)
      if (!asset || !variant || (asset.kind !== 'video' && asset.kind !== 'image') || clip.duration <= 0) return []
      return [{ key: `${clip.id}:${variant.id}:${(asset.previewSrc ?? asset.src)}:${variant.inPoint}`, src: asset.previewSrc ?? asset.src,
        trackId: clipTrackId(clip), kind: asset.kind,
        start: clip.start / project.fps, end: (clip.start + clip.duration) / project.fps, inPoint: variant.inPoint,
        rect: visualClipRect(project, clip, asset), opacity: clip.opacity ?? 1 }]
    }).sort((a, b) => a.start - b.start)
    this.reconcileTracks(timelineTracks(project).filter(track => track.kind === 'video').map(track => track.id))
    const imageUrls = new Set(this.segments.filter(segment => segment.kind === 'image').map(segment => segment.src))
    for (const [src, image] of this.images) if (!imageUrls.has(src)) { image.cleanup(); this.images.delete(src) }
    for (const src of imageUrls) if (!this.images.has(src)) this.images.set(src, this.createImage(src))
    this.position = this.clamp(this.position)
    const width = Math.max(1, project.width)
    const height = Math.max(1, project.height)
    // Reassigning even the same dimensions clears the displayed frame.
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    const audioUrls = new Set(previewAudioSchedule(project, 0).map(item => item.src))
    for (const url of this.buffers.keys()) if (!audioUrls.has(url)) this.buffers.delete(url)
    this.configure(this.position, true)
    this.draw()
    if (this.wantedPlaying) void this.beginPlayback()
  }

  syncPosition(seconds: number) {
    if (!Number.isFinite(seconds)) return
    // A parent render can lag several animation frames. Consume any matching echo.
    const echo = this.emittedPositions.findIndex(value => Math.abs(value - seconds) < 0.000001)
    if (echo >= 0) { this.emittedPositions.splice(0, echo + 1); return }
    const target = this.clamp(seconds)
    if (Math.abs(target - this.position) < 0.000001 && !this.actualPlaying) return
    this.emittedPositions = []
    this.freeze()
    this.position = target
    this.configure(target, true)
    this.draw()
    if (this.wantedPlaying) void this.beginPlayback()
  }

  setPlaying(playing: boolean) {
    if (this.wantedPlaying === playing) return
    this.wantedPlaying = playing
    if (playing) void this.beginPlayback()
    else { this.freeze(); this.configure(this.position, true); this.draw(); this.publish(true) }
  }

  private getContext() {
    if (!this.context) this.context = new AudioContext({ latencyHint: 'interactive' })
    return this.context
  }

  private async audioBuffer(src: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(src)
    if (cached) return cached
    const promise = (async () => {
      const response = await fetch(src, { signal: this.abort.signal })
      if (!response.ok) throw new Error(`Audio laden mislukt (${response.status}).`)
      return this.getContext().decodeAudioData(await response.arrayBuffer())
    })()
    this.buffers.set(src, promise)
    try { return await promise } catch (error) { this.buffers.delete(src); throw error }
  }

  private async beginPlayback() {
    this.freeze()
    const epoch = this.epoch
    if (!this.project || !this.wantedPlaying || this.disposed) return
    if (this.position >= this.end) {
      this.wantedPlaying = false
      this.callbacks.onPlaying(false)
      return
    }
    try {
      const context = this.getContext()
      // Resume immediately, before network/decoding awaits, after the play interaction.
      const resumed = context.resume()
      const plan = previewAudioSchedule(this.project, this.position)
      const layers = this.configure(this.position, true)
      const [decoded] = await Promise.all([
        Promise.all(plan.map(async item => ({ ...item, buffer: await this.audioBuffer(item.src) }))),
        resumed,
        Promise.all(layers.map(layer => layer.slot ? this.waitForSlot(layer.slot)
          : layer.image ? this.waitForImage(layer.image) : Promise.resolve())),
      ])
      if (epoch !== this.epoch || !this.wantedPlaying || this.disposed) return
      this.anchorPosition = this.position
      this.anchorContextTime = context.currentTime + 0.04
      for (const item of decoded) {
        const duration = Math.min(item.duration, item.buffer.duration - item.offset)
        if (duration <= 0) continue
        const source = context.createBufferSource()
        const gain = context.createGain()
        source.buffer = item.buffer
        gain.gain.value = item.gain
        source.connect(gain)
        gain.connect(context.destination)
        source.onended = () => { this.audioSources.delete(source); source.disconnect(); gain.disconnect() }
        this.audioSources.set(source, gain)
        source.start(this.anchorContextTime + item.delay, item.offset, duration)
      }
      this.actualPlaying = true
      this.lastPublishedFrame = -1
      this.tick()
    } catch (error) {
      if (epoch === this.epoch && !this.disposed) this.fail(error)
    }
  }

  private get end() { return this.project ? timelineEnd(this.project) / this.project.fps : 0 }
  private clamp(value: number) { return Math.max(0, Math.min(this.end, value)) }

  private audibleContextTime() {
    if (!this.context) return 0
    const timestamp = this.context.getOutputTimestamp?.()
    if (timestamp && timestamp.contextTime != null && timestamp.performanceTime != null && timestamp.contextTime > 0 && timestamp.performanceTime > 0) {
      return Math.min(this.context.currentTime,
        timestamp.contextTime + Math.max(0, performance.now() - timestamp.performanceTime) / 1000)
    }
    return Math.max(0, this.context.currentTime - (this.context.outputLatency || this.context.baseLatency || 0))
  }

  private clockPosition() {
    return this.clamp(this.anchorPosition + Math.max(0, this.audibleContextTime() - this.anchorContextTime))
  }

  private tick = () => {
    if (!this.actualPlaying || this.disposed) return
    this.position = this.clockPosition()
    if (this.position >= this.end) {
      this.freeze()
      this.position = this.end
      this.wantedPlaying = false
      this.configure(this.position, false)
      this.draw()
      this.publish(true)
      this.callbacks.onPlaying(false)
      return
    }
    const layers = this.configure(this.position, false)
    if (layers.some(layer => layer.slot ? !layer.slot.ready : layer.image && !layer.image.ready)) {
      this.canvas.dataset.rebufferCount = String(Number(this.canvas.dataset.rebufferCount || '0') + 1)
      // A missed preload pauses the common clock/audio, rather than losing sync.
      this.publish(true)
      void this.beginPlayback()
      return
    }
    for (const { segment, slot } of layers) if (slot && this.audibleContextTime() >= this.anchorContextTime) {
      const desired = segment.inPoint + this.position - segment.start
      const drift = desired - slot.video.currentTime
      const now = performance.now()
      if (!slot.video.seeking && Math.abs(drift) > 0.16 && now - slot.lastCorrection > 750) {
        slot.lastCorrection = now
        // A bounded correction, never currentTime assignment on every frame.
        this.seekSlot(slot, desired)
      } else if (!slot.video.seeking) {
        slot.video.playbackRate = Math.abs(drift) > 0.02 ? Math.max(0.95, Math.min(1.05, 1 + drift * 0.5)) : 1
      }
      this.playSlot(slot)
    }
    this.draw()
    this.publish(false)
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private freeze() {
    if (this.actualPlaying) {
      this.position = this.clockPosition()
      for (const slot of this.activeSlots) {
        // The paused snapshot may predate playback. Preserve the canvas while
        // replacing it with the current frame, rather than jumping backwards.
        this.releaseFrame(slot)
        this.captureFrame(slot, slot.video.currentTime)
      }
    }
    this.actualPlaying = false
    this.epoch++
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    for (const [source, gain] of this.audioSources) {
      source.onended = null
      try { source.stop() } catch { /* Already ended. */ }
      source.disconnect()
      gain.disconnect()
    }
    this.audioSources.clear()
    for (const slot of this.slots) { slot.video.pause(); slot.video.playbackRate = 1 }
  }

  private reconcileTracks(trackIds: string[]) {
    for (const [trackId, slots] of this.trackSlots) if (!trackIds.includes(trackId)) {
      this.trackSlots.delete(trackId)
      const usesBase = slots === this.baseSlots
      for (const slot of slots) {
        slot.cleanup()
        if (!usesBase) slot.video.remove()
      }
      if (usesBase) this.baseSlots = slots.map(slot => this.createSlot(slot.video))
    }
    for (const trackId of trackIds) if (!this.trackSlots.has(trackId)) {
      const baseInUse = [...this.trackSlots.values()].includes(this.baseSlots)
      const slots = baseInUse ? [0, 1].map(() => {
        const video = document.createElement('video')
        video.className = 'pointer-events-none absolute h-px w-px opacity-0'
        video.setAttribute('aria-hidden', 'true')
        video.tabIndex = -1
        this.canvas.parentElement?.appendChild(video)
        return this.createSlot(video)
      }) : this.baseSlots
      for (const slot of slots) slot.video.dataset.previewTrack = trackId
      this.trackSlots.set(trackId, slots)
    }
    // Map order is compositing order, including after track reordering.
    this.trackSlots = new Map(trackIds.map(id => [id, this.trackSlots.get(id)!]))
    this.slots = [...new Set([...this.baseSlots, ...this.trackSlots.values()].flat())]
  }

  private createImage(src: string): ImageResource {
    const image = new Image()
    image.decoding = 'async'
    const resource: ImageResource = { image, ready: false, error: null, waiters: new Set(), cleanup: () => {} }
    image.onload = () => {
      resource.ready = true
      for (const waiter of resource.waiters) { clearTimeout(waiter.timer); waiter.resolve() }
      resource.waiters.clear()
      this.draw()
    }
    image.onerror = () => {
      resource.error = 'Deze afbeelding kan niet worden geladen.'
      for (const waiter of resource.waiters) { clearTimeout(waiter.timer); waiter.reject(new Error(resource.error)) }
      resource.waiters.clear()
      if (this.activeLayers.some(layer => layer.image === resource)) {
        if (this.actualPlaying) this.fail(new Error(resource.error))
        else this.callbacks.onError?.(resource.error)
      }
      this.draw()
    }
    resource.cleanup = () => {
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
      for (const waiter of resource.waiters) { clearTimeout(waiter.timer); waiter.reject(new Error('Afbeelding gesloten.')) }
      resource.waiters.clear()
    }
    image.src = src
    return resource
  }

  private waitForImage(image: ImageResource): Promise<void> {
    if (image.error) return Promise.reject(new Error(image.error))
    if (image.ready) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: setTimeout(() => {
        image.waiters.delete(waiter)
        reject(new Error('De afbeelding is niet op tijd klaar voor afspelen.'))
      }, 15000) }
      image.waiters.add(waiter)
    })
  }

  private configure(position: number, seek: boolean): PreviewLayer[] {
    const layers: PreviewLayer[] = []
    const activeSlots = new Set<VideoSlot>()
    for (const [trackId, slots] of this.trackSlots) {
      const segments = this.segments.filter(segment => segment.trackId === trackId)
      const current = segments.find(item => position >= item.start && position < item.end)
      const next = segments.find(item => item.kind === 'video' && item.start >= (current?.end ?? position) && item !== current)
      let active: VideoSlot | null = null
      if (current?.kind === 'video') {
        active = slots.find(slot => slot.key === current.key)
          ?? slots.find(slot => slot.key !== next?.key) ?? slots[0]
        const changed = active.key !== current.key
        if (changed) this.assign(active, current, current.inPoint + position - current.start)
        else if (seek) this.seekSlot(active, current.inPoint + position - current.start)
        activeSlots.add(active)
      }
      if (current) layers.push({ segment: current, slot: active, image: current.kind === 'image' ? this.images.get(current.src) ?? null : null })
      for (const slot of slots) if (slot !== active) { slot.video.pause(); slot.video.playbackRate = 1 }
      if (next) {
        const standby = slots.find(slot => slot !== active && slot.key === next.key)
          ?? slots.find(slot => slot !== active)!
        if (standby.key !== next.key) this.assign(standby, next, next.inPoint)
        else if (Math.abs((standby.pendingSeek ?? standby.video.currentTime) - next.inPoint) > 0.002) {
          // Each track preloads its next cut independently on the common clock.
          this.seekSlot(standby, next.inPoint)
        }
      }
    }
    this.activeSlots = activeSlots
    this.activeLayers = layers
    return layers
  }

  private assign(slot: VideoSlot, segment: VideoSegment, position: number) {
    this.rejectWaiters(slot, new Error('Videoselectie gewijzigd.'))
    this.releaseFrame(slot)
    slot.video.pause()
    slot.key = segment.key
    slot.ready = false
    slot.error = null
    slot.mediaTime = null
    slot.lastCorrection = -Infinity
    if (slot.video.getAttribute('src') !== segment.src) {
      slot.pendingSeek = position
      slot.video.src = segment.src
      slot.video.load()
    }
    this.seekSlot(slot, position)
  }

  private seekSlot(slot: VideoSlot, position: number) {
    const target = Math.max(0, position)
    if (slot.pendingSeek === null && !slot.video.seeking && slot.video.readyState >= 2 && Math.abs(slot.video.currentTime - target) < 0.002) {
      slot.ready = true
      if (!slot.frame) this.captureFrame(slot, slot.video.currentTime)
      return
    }
    slot.pendingSeek = target
    slot.ready = false
    slot.seekStarted = performance.now()
    this.completeSeek(slot)
  }

  private completeSeek(slot: VideoSlot, presentDecodedFrame = false) {
    if (slot.video.readyState < 1 || slot.video.seeking) return
    // Snapshot a completed seek before starting the latest queued seek. Drawing
    // the live video and then seeking it again can invalidate its decoder image.
    if (presentDecodedFrame) this.captureFrame(slot, slot.video.currentTime)
    if (slot.pendingSeek !== null && Math.abs(slot.video.currentTime - slot.pendingSeek) > 0.002) {
      try { slot.video.currentTime = slot.pendingSeek } catch { return }
      return
    }
    if (slot.video.readyState < 2) return
    slot.pendingSeek = null
    slot.ready = true
    if (!presentDecodedFrame) this.captureFrame(slot, slot.video.currentTime)
    if (slot.seekStarted) this.canvas.dataset.seekMs = (performance.now() - slot.seekStarted).toFixed(1)
    slot.seekStarted = 0
    for (const waiter of slot.waiters) { clearTimeout(waiter.timer); waiter.resolve() }
    slot.waiters.clear()
    if (this.activeSlots.has(slot)) this.draw()
  }

  private captureFrame(slot: VideoSlot, mediaTime: number) {
    if (this.disposed || slot.error || slot.video.seeking || slot.video.readyState < 2
      || !slot.video.videoWidth || !slot.video.videoHeight) return
    const version = ++slot.captureVersion
    // createImageBitmap snapshots the current frame before its promise resolves.
    // It also supports our local media origin without pixel readback or relaxed CORS.
    void createImageBitmap(slot.video).then(frame => {
      if (this.disposed || version <= slot.presentedVersion) { frame.close(); return }
      slot.frame?.close()
      slot.frame = frame
      slot.presentedVersion = version
      slot.mediaTime = mediaTime
      if (this.activeSlots.has(slot)) this.draw()
    }).catch(error => {
      // A seek can temporarily have no drawable frame. Keep the retained image;
      // seeked/the next video-frame callback will supply the next one.
      if (this.disposed || version <= slot.presentedVersion || error?.name === 'InvalidStateError') return
      this.callbacks.onError?.(`Videovoorbeeld bijwerken mislukt: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  private releaseFrame(slot: VideoSlot) {
    // Invalidate outstanding snapshots, including ones from a previous source.
    slot.presentedVersion = ++slot.captureVersion
    slot.frame?.close()
    slot.frame = null
    slot.mediaTime = null
  }

  private waitForSlot(slot: VideoSlot): Promise<void> {
    if (slot.error) return Promise.reject(new Error(slot.error))
    if (slot.ready) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: setTimeout(() => {
        slot.waiters.delete(waiter)
        reject(new Error('De video is niet op tijd klaar voor afspelen.'))
      }, 15000) }
      slot.waiters.add(waiter)
    })
  }

  private rejectWaiters(slot: VideoSlot, error: Error) {
    for (const waiter of slot.waiters) { clearTimeout(waiter.timer); waiter.reject(error) }
    slot.waiters.clear()
  }

  private playSlot(slot: VideoSlot) {
    if (!slot.video.paused || slot.playPending || slot.video.seeking) return
    slot.playPending = true
    void slot.video.play().catch(error => {
      if (error?.name !== 'AbortError' && this.activeSlots.has(slot) && this.actualPlaying) this.fail(error)
    }).finally(() => { slot.playPending = false })
  }

  private createSlot(video: HTMLVideoElement): VideoSlot {
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.preload = 'auto'
    const slot: VideoSlot = { video, key: '', pendingSeek: null, ready: false, error: null,
      frame: null, captureVersion: 0, presentedVersion: 0,
      mediaTime: null, seekStarted: 0, lastCorrection: -Infinity, playPending: false,
      frameCallback: null, waiters: new Set(), cleanup: () => {} }
    const onReady = (event: Event) => this.completeSeek(slot, event.type === 'seeked')
    const onError = () => {
      slot.error = 'Deze video kan niet worden geladen of gedecodeerd.'
      slot.ready = false
      this.rejectWaiters(slot, new Error(slot.error))
      if (this.activeSlots.has(slot) && this.actualPlaying) this.fail(new Error(slot.error))
      else if (this.activeSlots.has(slot)) this.callbacks.onError?.(slot.error)
    }
    for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.addEventListener(event, onReady)
    video.addEventListener('error', onError)
    // Playback draws directly on the montage clock. Snapshot only paused frames:
    // copying every playing frame adds unnecessary work and can delay a cut.
    const measureFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (this.actualPlaying) slot.mediaTime = metadata.mediaTime
      else this.captureFrame(slot, metadata.mediaTime)
      if (!this.disposed) slot.frameCallback = video.requestVideoFrameCallback(measureFrame)
    }
    if (typeof video.requestVideoFrameCallback === 'function') slot.frameCallback = video.requestVideoFrameCallback(measureFrame)
    slot.cleanup = () => {
      for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.removeEventListener(event, onReady)
      video.removeEventListener('error', onError)
      if (slot.frameCallback !== null) video.cancelVideoFrameCallback(slot.frameCallback)
      this.releaseFrame(slot)
      this.rejectWaiters(slot, new Error('Preview gesloten.'))
      video.removeAttribute('src')
      video.load()
    }
    return slot
  }

  private draw() {
    const context = this.canvas.getContext('2d')
    if (!context) return
    const { width, height } = this.canvas
    const layers = this.activeLayers.map(layer => {
      const { slot, image } = layer
      const live = this.actualPlaying && slot && !slot.error && slot.ready && !slot.video.seeking
        && slot.video.readyState >= 2 && slot.video.videoWidth > 0 && slot.video.videoHeight > 0
      return { ...layer, error: slot?.error ?? image?.error,
        source: image?.ready ? image.image : slot && !slot.error ? (live ? slot.video : slot.frame) : null }
    })
    // Retain the complete last composition until every visible layer has a
    // decoded frame. Otherwise a pending seek on one track would flash black or
    // expose the lower track between frames. Empty regions still clear at once.
    if (layers.every(layer => layer.source || layer.error || layer.segment.opacity === 0)) {
      context.globalAlpha = 1
      context.fillStyle = '#000'
      context.fillRect(0, 0, width, height)
      for (const layer of layers) if (layer.source && !layer.error) {
        const { x, y, width: drawWidth, height: drawHeight } = layer.segment.rect
        context.globalAlpha = layer.segment.opacity
        context.drawImage(layer.source, x, y, drawWidth, drawHeight)
      }
      context.globalAlpha = 1
    }
    this.canvas.dataset.timelineTime = this.position.toFixed(6)
    this.canvas.dataset.previewState = this.actualPlaying ? 'playing' : this.wantedPlaying ? 'loading' : 'paused'
    const videoLayers = layers.filter(layer => layer.slot)
    this.canvas.dataset.mediaTime = videoLayers[0]?.slot?.mediaTime?.toFixed(6) ?? ''
    const drifts = videoLayers.flatMap(({ segment, slot }) => slot?.mediaTime != null
      ? [(segment.inPoint + this.position - segment.start - slot.mediaTime) * 1000] : [])
    this.canvas.dataset.videoDriftMs = drifts.length ? drifts.reduce((a, b) => Math.abs(a) > Math.abs(b) ? a : b).toFixed(1) : ''
    this.canvas.dataset.layerCount = String(layers.length)
    this.canvas.dataset.audioSourceCount = String(this.audioSources.size)
  }

  private publish(force: boolean) {
    const frame = Math.floor(this.position * (this.project?.fps ?? 25))
    if (!force && frame === this.lastPublishedFrame) return
    this.lastPublishedFrame = frame
    this.emittedPositions.push(this.position)
    if (this.emittedPositions.length > 32) this.emittedPositions.shift()
    this.callbacks.onPosition(this.position)
  }

  private fail(error: unknown) {
    this.freeze()
    this.wantedPlaying = false
    this.draw()
    this.publish(true)
    this.callbacks.onPlaying(false)
    this.callbacks.onError?.(error instanceof Error ? error.message : 'Afspelen mislukt.')
  }

  dispose() {
    this.disposed = true
    this.wantedPlaying = false
    this.freeze()
    this.abort.abort()
    for (const slot of this.slots) slot.cleanup()
    for (const slot of this.slots) if (!this.baseSlots.includes(slot)) slot.video.remove()
    for (const image of this.images.values()) image.cleanup()
    this.images.clear()
    this.activeLayers = []
    this.activeSlots.clear()
    this.trackSlots.clear()
    this.buffers.clear()
    void this.context?.close().catch(() => {})
  }
}
