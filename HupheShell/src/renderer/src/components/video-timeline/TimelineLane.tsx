import { useEffect, useRef, useState, type PointerEvent, type DragEventHandler, type ReactNode } from 'react'
import { clipTrackId, type TimelineClip } from '../../../../shared/video-timeline'

export interface TimelineDrawRange { start: number; duration: number }

interface TimelineLaneProps {
  track: 'video' | 'audio'
  trackId: string
  clips: TimelineClip[]
  fps: number
  zoom: number
  disabled: boolean
  onDrawStart: () => void
  onCreate: (range: TimelineDrawRange) => void
  onDeselect: () => void
  onDragOver: DragEventHandler<HTMLDivElement>
  onDragLeave: DragEventHandler<HTMLDivElement>
  onDrop: DragEventHandler<HTMLDivElement>
  children: ReactNode
}

interface DrawGesture {
  pointerId: number
  anchor: number
  min: number
  max: number
  startX: number
  clientX: number
  moved: boolean
  lastTime: number
}

export function TimelineLane({ track, trackId, clips, fps, zoom, disabled, onDrawStart, onCreate, onDeselect, onDragOver, onDragLeave, onDrop, children }: TimelineLaneProps) {
  const lane = useRef<HTMLDivElement>(null)
  const gesture = useRef<DrawGesture | null>(null)
  const animation = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [draft, setDraft] = useState<TimelineDrawRange | null>(null)
  const settings = useRef({ fps, zoom })
  settings.current = { fps, zoom }
  const canDraw = track === 'video' && !disabled

  function frameAt(clientX: number) {
    const { fps, zoom } = settings.current
    return Math.round((clientX - lane.current!.getBoundingClientRect().left) / zoom * fps)
  }

  function updateDraft(): TimelineDrawRange | null {
    const drag = gesture.current
    if (!drag) return null
    drag.moved ||= Math.abs(drag.clientX - drag.startX) >= 4
    const frame = Math.max(drag.min, Math.min(drag.max, frameAt(drag.clientX)))
    const range = drag.moved && frame !== drag.anchor
      ? { start: Math.min(frame, drag.anchor), duration: Math.abs(frame - drag.anchor) } : null
    setDraft(previous => previous?.start === range?.start && previous?.duration === range?.duration ? previous : range)
    return range
  }

  function stop() {
    const drag = gesture.current
    gesture.current = null
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
    setDraft(null)
    if (drag && lane.current?.hasPointerCapture(drag.pointerId)) lane.current.releasePointerCapture(drag.pointerId)
  }

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return
      event.preventDefault()
      event.stopPropagation()
      suppressClick.current = true
      stop()
    }
    // Capture phase: the page's own Escape handler (clear selection) must not swallow the key while a block is being drawn.
    window.addEventListener('keydown', cancel, true)
    return () => {
      window.removeEventListener('keydown', cancel, true)
      if (animation.current !== null) cancelAnimationFrame(animation.current)
      gesture.current = null
    }
  }, [])

  useEffect(() => { if (disabled) stop() }, [disabled])

  function tick(now: number) {
    const drag = gesture.current
    if (!drag) return
    const scroll = lane.current?.closest<HTMLElement>('.vt-scroll')
    if (scroll && drag.moved) {
      const bounds = scroll.getBoundingClientRect()
      const left = bounds.left + 96 // Sticky track labels are outside the time scale.
      const edge = 28
      const speed = drag.clientX < left + edge ? -Math.min(1, (left + edge - drag.clientX) / edge)
        : drag.clientX > bounds.right - edge ? Math.min(1, (drag.clientX - bounds.right + edge) / edge) : 0
      scroll.scrollLeft += speed * 600 * Math.min(40, now - drag.lastTime) / 1000
    }
    drag.lastTime = now
    updateDraft()
    animation.current = requestAnimationFrame(tick)
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDraw || event.button !== 0 || !event.isPrimary || gesture.current || event.target !== event.currentTarget) return
    suppressClick.current = false
    const max = Math.floor(event.currentTarget.clientWidth / zoom * fps)
    const anchor = Math.max(0, Math.min(max, frameAt(event.clientX)))
    const occupied = clips.filter(clip => clipTrackId(clip) === trackId)
    // Empty vertical gutters around a clip still belong to its occupied time.
    if (occupied.some(clip => anchor >= clip.start && anchor < clip.start + clip.duration)) return
    const min = Math.max(0, ...occupied.filter(clip => clip.start + clip.duration <= anchor).map(clip => clip.start + clip.duration))
    const end = Math.min(max, ...occupied.filter(clip => clip.start > anchor).map(clip => clip.start))
    if (end <= min) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { pointerId: event.pointerId, anchor, min, max: end,
      startX: event.clientX, clientX: event.clientX, moved: false, lastTime: performance.now() }
    onDrawStart()
    animation.current = requestAnimationFrame(tick)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current.clientX = event.clientX
    updateDraft()
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current
    if (drag?.pointerId !== event.pointerId) return
    drag.clientX = event.clientX
    const range = updateDraft()
    suppressClick.current = drag.moved
    stop()
    if (range) onCreate(range)
  }

  function cancelPointer(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return
    suppressClick.current = true
    stop()
  }

  return <div ref={lane} data-track={track} data-track-id={trackId} className={`vt-lane${canDraw ? ' vt-lane-drawable' : ''}`}
    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
    onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } onDeselect() }}>
    {children}
    {draft && <div className="vt-block empty vt-block-draft" aria-hidden="true"
      style={{ left: draft.start / fps * zoom, width: Math.max(1, draft.duration / fps * zoom) }}>
      <b>Nieuw fragment</b><span>{Number((draft.duration / fps).toFixed(3))} s</span>
    </div>}
  </div>
}
