import { useEffect, useRef, useState, type PointerEvent } from 'react'

interface TimelineScrubberProps {
  position: number
  duration: number
  extent: number
  zoom: number
  fps: number
  onSeek: (seconds: number) => void
}

export function TimelineScrubber({ position, duration, extent, zoom, fps, onSeek }: TimelineScrubberProps) {
  const ruler = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointerId: number; clientX: number; lastTime: number } | null>(null)
  const animation = useRef<number | null>(null)
  const lastPosition = useRef<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const limit = duration || extent
  const settings = useRef({ zoom, fps, limit, onSeek })
  settings.current = { zoom, fps, limit, onSeek }

  useEffect(() => () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    gesture.current = null
  }, [])

  function seek(seconds: number, force = false) {
    const { fps, limit, onSeek } = settings.current
    const next = Math.max(0, Math.min(limit, Math.round(seconds * fps) / fps))
    if (force || next !== lastPosition.current) {
      lastPosition.current = next
      onSeek(next)
    }
  }

  function seekAt(clientX: number, force = false) {
    if (!ruler.current) return
    seek((clientX - ruler.current.getBoundingClientRect().left) / settings.current.zoom, force)
  }

  function tick(now: number) {
    const drag = gesture.current
    if (!drag) return
    const scroll = ruler.current?.closest<HTMLElement>('.vt-scroll')
    if (scroll) {
      const bounds = scroll.getBoundingClientRect()
      const left = bounds.left + 96 // Sticky track labels are outside the time scale.
      const edge = 28
      const speed = drag.clientX < left + edge
        ? -Math.min(1, (left + edge - drag.clientX) / edge)
        : drag.clientX > bounds.right - edge
          ? Math.min(1, (drag.clientX - bounds.right + edge) / edge) : 0
      scroll.scrollLeft += speed * 600 * Math.min(40, now - drag.lastTime) / 1000
    }
    drag.lastTime = now
    seekAt(drag.clientX)
    animation.current = requestAnimationFrame(tick)
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return
    event.preventDefault()
    event.stopPropagation()
    ruler.current?.parentElement?.querySelector<HTMLElement>('.vt-playhead')?.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { pointerId: event.pointerId, clientX: event.clientX, lastTime: performance.now() }
    setScrubbing(true)
    seekAt(event.clientX, true)
    animation.current = requestAnimationFrame(tick)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId === event.pointerId) gesture.current.clientX = event.clientX
  }

  function stop(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    if (gesture.current?.pointerId !== event.pointerId) return
    if (commit) seekAt(event.clientX, true)
    gesture.current = null
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
    setScrubbing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const pointerHandlers = {
    onPointerDown: pointerDown,
    onPointerMove: pointerMove,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => stop(event, true),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => stop(event, false),
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => stop(event, false),
  }

  return <>
    <div ref={ruler} className={`vt-ruler${scrubbing ? ' scrubbing' : ''}`} style={{ marginLeft: 96 }} {...pointerHandlers}>
      {Array.from({ length: Math.ceil(extent) + 1 }, (_, i) => i % (zoom < 25 ? 5 : 1) === 0 && <span key={i} style={{ left: i * zoom }}>{i}s</span>)}
    </div>
    <div className={`vt-playhead${scrubbing ? ' scrubbing' : ''}`} style={{ left: 96 + position * zoom }}
      role="slider" tabIndex={0} aria-label="Afspeelpositie" aria-orientation="horizontal"
      aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Number(position.toFixed(3))}
      aria-valuetext={`${position.toFixed(2)} seconden`}
      title="Sleep om door de video te zoeken · ←/→ per frame"
      {...pointerHandlers}
      onKeyDown={event => {
        let next: number
        if (event.key === 'ArrowLeft') next = position - (event.shiftKey ? 10 : 1) / fps
        else if (event.key === 'ArrowRight') next = position + (event.shiftKey ? 10 : 1) / fps
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = limit
        else return
        event.preventDefault()
        event.stopPropagation()
        seek(next, true)
      }}
    ><span /></div>
  </>
}
