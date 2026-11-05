import { useEffect, useRef, useState, type PointerEvent } from 'react'

/** Label steps in frames, from whole minutes down to single frames, so zooming in goes from seconds to frames. */
const RULER_STEPS = [1, 2, 5, 10, 25, 50, 125, 250, 750, 1500, 3000]

export function rulerTicks(extent: number, zoom: number, fps: number): { frame: number; label: string }[] {
  const perFrame = zoom / fps
  const unit = fps / 25
  const step = Math.max(1, Math.round(RULER_STEPS.map(n => n * unit).find(n => n * perFrame >= 64) ?? RULER_STEPS[RULER_STEPS.length - 1] * unit))
  const out: { frame: number; label: string }[] = []
  for (let frame = 0; frame <= extent * fps; frame += step) {
    const whole = Math.floor(frame / fps), rest = frame - whole * fps
    out.push({ frame, label: rest === 0 ? `${whole}s` : step < fps ? `${whole}s ${rest}f` : `${(frame / fps).toFixed(1)}s` })
  }
  return out
}

interface TimelineScrubberProps {
  position: number
  duration: number
  extent: number
  zoom: number
  fps: number
  onSeek: (seconds: number) => void
  markers?: { id: string; frame: number; label?: string }[]
  range?: { start: number; end: number }
  /** Click on a marker jumps to it; Alt-click removes it. */
  onMarker?: (id: string, remove: boolean) => void
}

export function TimelineScrubber({ position, duration, extent, zoom, fps, onSeek, markers, range, onMarker }: TimelineScrubberProps) {
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
      {range && <div className="vt-range" aria-label="Bereik" style={{ left: range.start / fps * zoom, width: Math.max(2, (range.end - range.start) / fps * zoom) }} />}
      {markers?.map(m => <button key={m.id} className="vt-marker" aria-label={`Merker ${(m.frame / fps).toFixed(2)} s`} title={`Merker ${(m.frame / fps).toFixed(2)} s · klik om erheen te gaan · Alt-klik verwijdert`}
        style={{ left: m.frame / fps * zoom }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onMarker?.(m.id, e.altKey) }} />)}
      {rulerTicks(extent, zoom, fps).map(({ frame, label }) => <span key={frame} style={{ left: frame / fps * zoom }}>{label}</span>)}
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
