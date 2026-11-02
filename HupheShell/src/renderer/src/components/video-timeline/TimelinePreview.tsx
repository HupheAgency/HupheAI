import { useEffect, useRef } from 'react'
import type { TimelineProject } from '../../../../shared/video-timeline'
import { TimelinePreviewController } from './timeline-preview-controller'

export interface TimelinePreviewProps {
  project: TimelineProject
  position: number
  playing: boolean
  generating?: boolean
  onPosition: (seconds: number) => void
  onPlaying: (playing: boolean) => void
  onError?: (message: string) => void
}

export function TimelinePreview({ project, position, playing, generating = false, onPosition, onPlaying, onError }: TimelinePreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const firstVideo = useRef<HTMLVideoElement>(null)
  const secondVideo = useRef<HTMLVideoElement>(null)
  const controller = useRef<TimelinePreviewController | null>(null)
  const callbacks = useRef({ onPosition, onPlaying, onError })
  callbacks.current = { onPosition, onPlaying, onError }

  useEffect(() => {
    const preview = new TimelinePreviewController(canvas.current!, [firstVideo.current!, secondVideo.current!], {
      onPosition: seconds => callbacks.current.onPosition(seconds),
      onPlaying: value => callbacks.current.onPlaying(value),
      onError: message => callbacks.current.onError?.(message),
    })
    controller.current = preview
    return () => { preview.dispose(); controller.current = null }
  }, [])
  useEffect(() => { controller.current?.setProject(project) }, [project])
  useEffect(() => { controller.current?.syncPosition(position) }, [position])
  useEffect(() => { controller.current?.setPlaying(playing) }, [playing])

  return (
    <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black">
      <canvas ref={canvas} aria-label="Montagevoorbeeld" role="img" aria-busy={generating}
        className="block max-h-full max-w-full object-contain"
        style={{ aspectRatio: `${project.width} / ${project.height}` }} />
      <video ref={firstVideo} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1}
        className="pointer-events-none absolute h-px w-px opacity-0" />
      <video ref={secondVideo} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1}
        className="pointer-events-none absolute h-px w-px opacity-0" />
      {generating && (
        <div role="status" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/65 text-center">
          <svg aria-hidden="true" className="h-10 w-10 animate-spin text-[#facc15] motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" opacity="0.2" />
            <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
          </svg>
          <span className="px-4 text-sm font-medium text-white/85">Video wordt gegenereerd…</span>
        </div>
      )}
    </div>
  )
}

export default TimelinePreview
