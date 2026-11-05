const WIDTH = 160, HEIGHT = 90
const cache = new Map<string, Promise<string | null>>()
let queue: Promise<unknown> = Promise.resolve()
let shared: { src: string; video: HTMLVideoElement } | null = null

const once = (target: HTMLVideoElement, event: string, ms: number) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, ms)
  const done = () => { cleanup(); resolve() }
  const fail = () => { cleanup(); reject(new Error('error')) }
  const cleanup = () => { clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener('error', fail) }
  target.addEventListener(event, done); target.addEventListener('error', fail)
})

async function capture(src: string, time: number): Promise<string | null> {
  try {
    if (!shared || shared.src !== src) {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'auto'; video.src = src
      shared = { src, video }
      await once(video, 'loadeddata', 15000)
    }
    const { video } = shared
    video.currentTime = Math.max(0, Math.min(time, (video.duration || time) - 0.05))
    await once(video, 'seeked', 8000)
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH; canvas.height = HEIGHT
    const context = canvas.getContext('2d')
    if (!context || !video.videoWidth) return null
    const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight)
    const w = video.videoWidth * scale, h = video.videoHeight * scale
    context.drawImage(video, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch { shared = null; return null }
}

/** A small JPEG of a video at a time (seconds), made once per source and half-second and kept for the session. Frames are made one at a time. */
export function thumbnailAt(src: string, seconds: number): Promise<string | null> {
  const time = Math.round(seconds * 2) / 2
  const key = `${src}|${time}`
  let found = cache.get(key)
  if (!found) {
    found = new Promise<string | null>(resolve => { queue = queue.then(() => capture(src, time)).then(resolve, () => resolve(null)) })
    cache.set(key, found)
  }
  return found
}
