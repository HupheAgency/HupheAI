import { useEffect, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'

interface Point {
  x: number
  y: number
  r: number
  g: number
  b: number
  intensity: number
  pulseIntensity: number
}

interface Ripple {
  startTime: number
  cx: number
  cy: number
  maxRadius: number
  peakIntensity: number
  duration: number
  bandWidth: number
  persist: boolean
  wavefront?: number
}

interface AnimatedPixelBackgroundProps {
  className?: string
  style?: CSSProperties
  maskTargetRef?: RefObject<HTMLElement | null>
  maskHighlightRef?: RefObject<HTMLElement | null>
}

export default function AnimatedPixelBackground({
  className = 'fixed inset-0 block pointer-events-none',
  style,
  maskTargetRef,
  maskHighlightRef,
}: AnimatedPixelBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const texture = document.createElement('canvas')
    const textureCtx = texture.getContext('2d', { willReadFrequently: true })
    if (!textureCtx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarsePointer = window.matchMedia('(pointer: coarse)')

    const config = {
      baseOpacity: 0.15,
      breathOpacityLift: 0.05,
      breathCycleMs: 7600,
      pixelFadeMs: 10400,
      pulseFadeMs: 1100,
      maskFadeMs: 1400,
      gridStep: 8,
      hoverRadius: 24,
      pixelSize: 1.35,
      twinkleCount: 3,
      twinkleMax: 0.2,
      sweepDuration: 2200,
      sweepBandWidth: 130,
      sweepPeakIntensity: 0.9,
      heartbeatCycleMs: 12800,
      heartbeatIdleDelay: 3000,
      heartbeatBeatGap: 1400,
      velocityScale: 1.65,
      velocityMaxExtra: 180,
      velocitySmoothing: 0.64,
    }

    const state = {
      width: 0,
      height: 0,
      dpr: 1,
      points: [] as Point[],
      animationFrame: 0,
      lastTime: performance.now(),
      reduced: reduceMotion.matches,
      coarse: coarsePointer.matches,
      ripples: [] as Ripple[],
      hasSwept: false,
      lastInteractionTime: 0,
      nextHeartbeatTime: 0,
      prevMouseX: -1,
      prevMouseY: -1,
      mouseVelocity: 0,
      maskIntensity: 0,
    }

    function easeOutCubic(t: number) {
      return 1 - Math.pow(1 - t, 3)
    }

    function waveBandFalloff(offset: number, band: number) {
      const lead = band * 0.42
      if (offset > lead || offset < -band) return 0
      if (offset >= 0) return easeOutCubic(1 - offset / lead)
      return Math.pow(1 + offset / band, 1.45)
    }

    function getBreathingOpacity(now: number) {
      if (state.reduced) return config.baseOpacity
      const phase = (Math.sin((now / config.breathCycleMs) * Math.PI * 2 - Math.PI / 2) + 1) / 2
      const eased = phase * phase * (3 - 2 * phase)
      return config.baseOpacity + eased * config.breathOpacityLift
    }

    function buildTexture(w: number, h: number) {
      texture.width = Math.max(1, Math.ceil(w))
      texture.height = Math.max(1, Math.ceil(h))
      textureCtx.setTransform(1, 0, 0, 1, 0, 0)
      textureCtx.clearRect(0, 0, w, h)
      const grad = textureCtx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#ff4a00')
      grad.addColorStop(0.28, '#ffd84d')
      grad.addColorStop(0.55, '#5fe58c')
      grad.addColorStop(0.78, '#1aa7ff')
      grad.addColorStop(1, '#5526ff')
      textureCtx.fillStyle = grad
      textureCtx.fillRect(0, 0, w, h)
    }

    function sampleTexture() {
      const data = textureCtx.getImageData(0, 0, texture.width, texture.height).data
      const points: Point[] = []
      const inset = config.gridStep / 2
      for (let y = inset; y < state.height; y += config.gridStep) {
        for (let x = inset; x < state.width; x += config.gridStep) {
          const sx = Math.min(texture.width - 1, Math.max(0, Math.floor(x)))
          const sy = Math.min(texture.height - 1, Math.max(0, Math.floor(y)))
          const i = (sy * texture.width + sx) * 4
          points.push({
            x,
            y,
            r: Math.max(data[i], 36),
            g: Math.max(data[i + 1], 33),
            b: Math.max(data[i + 2], 23),
            intensity: 0,
            pulseIntensity: 0,
          })
        }
      }
      state.points = points
    }

    function spawnRipple(
      startTime: number,
      cx: number,
      cy: number,
      peakIntensity: number,
      duration: number,
      bandWidth: number,
      persist = true,
    ) {
      state.ripples.push({ startTime, cx, cy, maxRadius: Math.hypot(cx, cy), peakIntensity, duration, bandWidth, persist })
    }

    function fireHeartbeat(now: number) {
      const cx = state.width / 2
      const cy = state.height / 2
      spawnRipple(now, cx, cy, config.sweepPeakIntensity, config.sweepDuration, config.sweepBandWidth)
      spawnRipple(now + config.heartbeatBeatGap, cx, cy, config.sweepPeakIntensity, config.sweepDuration, config.sweepBandWidth)
    }

    function drawFrame(deltaMs: number, now: number) {
      const decay = Math.exp((-deltaMs * 3) / config.pixelFadeMs)
      const pulseDecay = Math.exp((-deltaMs * 3) / config.pulseFadeMs)

      if (!state.reduced && state.points.length > 0) {
        for (let i = 0; i < config.twinkleCount; i += 1) {
          const p = state.points[Math.floor(Math.random() * state.points.length)]
          const t = Math.random() * config.twinkleMax
          if (t > p.pulseIntensity) p.pulseIntensity = t
        }
      }

      const activeRipples: Ripple[] = []
      const keepRipples: Ripple[] = []
      for (const ripple of state.ripples) {
        const elapsed = now - ripple.startTime
        if (elapsed < 0) {
          keepRipples.push(ripple)
          continue
        }
        const progress = elapsed / ripple.duration
        if (progress >= 1) continue
        ripple.wavefront = easeOutCubic(progress) * (ripple.maxRadius + ripple.bandWidth)
        activeRipples.push(ripple)
        keepRipples.push(ripple)
      }
      state.ripples = keepRipples

      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, state.width, state.height)
      const restingOpacity = getBreathingOpacity(now)

      for (const point of state.points) {
        let rippleIntensity = 0
        for (const ripple of activeRipples) {
          const dx = point.x - ripple.cx
          const dy = point.y - ripple.cy
          const dist = Math.sqrt(dx * dx + dy * dy)
          const falloff = waveBandFalloff(dist - (ripple.wavefront ?? 0), ripple.bandWidth)
          if (falloff > 0) {
            const intensity = falloff * ripple.peakIntensity
            if (ripple.persist) {
              if (intensity > point.pulseIntensity) point.pulseIntensity = intensity
            } else if (intensity > rippleIntensity) {
              rippleIntensity = intensity
            }
          }
        }
        if (point.intensity > 0.002) point.intensity *= decay
        else point.intensity = 0
        if (point.pulseIntensity > 0.002) point.pulseIntensity *= pulseDecay
        else point.pulseIntensity = 0
        const hoverAlpha = point.intensity * 0.9
        const pulseAlpha = Math.max(point.pulseIntensity, rippleIntensity) * 0.78
        const alpha = Math.min(1, restingOpacity + Math.max(hoverAlpha, pulseAlpha))
        ctx.fillStyle = `rgba(${point.r},${point.g},${point.b},${alpha.toFixed(3)})`
        ctx.fillRect(Math.round(point.x - config.pixelSize / 2), Math.round(point.y - config.pixelSize / 2), config.pixelSize, config.pixelSize)
      }
    }

    function updateMaskStyles() {
      const highlightEl = maskHighlightRef?.current
      if (!highlightEl) return
      const centerAlpha = state.maskIntensity.toFixed(3)
      const midAlpha = Math.min(1, state.maskIntensity * 0.55).toFixed(3)
      highlightEl.style.setProperty('--highlight-center', `rgba(0,0,0,${centerAlpha})`)
      highlightEl.style.setProperty('--highlight-mid', `rgba(0,0,0,${midAlpha})`)
    }

    function tick(now: number) {
      const deltaMs = Math.min(48, now - state.lastTime)
      state.lastTime = now

      if (!state.reduced && now - state.lastInteractionTime > config.heartbeatIdleDelay && now >= state.nextHeartbeatTime) {
        fireHeartbeat(now)
        state.nextHeartbeatTime = now + config.heartbeatCycleMs
      }

      drawFrame(deltaMs, now)

      if (state.maskIntensity > 0.001) {
        state.maskIntensity *= Math.exp((-deltaMs * 3) / config.maskFadeMs)
      } else {
        state.maskIntensity = 0
      }
      updateMaskStyles()

      if (!state.reduced) {
        state.animationFrame = requestAnimationFrame(tick)
      } else {
        const hasActive = state.points.some((p) => p.intensity > 0.002 || p.pulseIntensity > 0.002) || state.maskIntensity > 0.001
        state.animationFrame = hasActive ? requestAnimationFrame(tick) : 0
      }
    }

    function ensureAnimation() {
      if (!state.animationFrame && !document.hidden) {
        state.lastTime = performance.now()
        state.animationFrame = requestAnimationFrame(tick)
      }
    }

    function activatePixels(clientX: number, clientY: number, radius = config.hoverRadius) {
      const r2 = radius * radius
      for (const p of state.points) {
        const dx = p.x - clientX
        const dy = p.y - clientY
        const d2 = dx * dx + dy * dy
        if (d2 <= r2) {
          const falloff = 1 - Math.sqrt(d2) / radius
          const intensity = 0.22 + easeOutCubic(falloff) * 0.98
          if (intensity > p.intensity) p.intensity = intensity
        }
      }
      state.lastInteractionTime = performance.now()
      ensureAnimation()
    }

    function updateMaskPosition(clientX: number, clientY: number) {
      const targetEl = maskTargetRef?.current
      const highlightEl = maskHighlightRef?.current
      if (!targetEl || !highlightEl) return
      const rect = targetEl.getBoundingClientRect()
      highlightEl.style.setProperty('--mouse-x', `${clientX - rect.left}px`)
      highlightEl.style.setProperty('--mouse-y', `${clientY - rect.top}px`)
      state.maskIntensity = 1.0
      ensureAnimation()
    }

    function resize() {
      state.width = window.innerWidth
      state.height = window.innerHeight
      state.dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.ceil(state.width * state.dpr)
      canvas.height = Math.ceil(state.height * state.dpr)
      canvas.style.width = `${state.width}px`
      canvas.style.height = `${state.height}px`
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
      buildTexture(state.width, state.height)
      sampleTexture()
      drawFrame(0, performance.now())
      if (!state.hasSwept && !state.reduced) {
        state.hasSwept = true
        spawnRipple(performance.now(), state.width / 2, state.height / 2, config.sweepPeakIntensity, config.sweepDuration, config.sweepBandWidth)
      }
      if (!state.reduced) ensureAnimation()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (state.reduced || e.pointerType === 'touch') return
      const dx = state.prevMouseX < 0 ? 0 : e.clientX - state.prevMouseX
      const dy = state.prevMouseY < 0 ? 0 : e.clientY - state.prevMouseY
      state.mouseVelocity = state.mouseVelocity * config.velocitySmoothing + Math.sqrt(dx * dx + dy * dy) * (1 - config.velocitySmoothing)
      state.prevMouseX = e.clientX
      state.prevMouseY = e.clientY
      activatePixels(e.clientX, e.clientY, config.hoverRadius + Math.min(state.mouseVelocity * config.velocityScale, config.velocityMaxExtra))
      updateMaskPosition(e.clientX, e.clientY)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (state.reduced) return
      activatePixels(e.clientX, e.clientY, state.coarse ? 96 : config.hoverRadius)
      updateMaskPosition(e.clientX, e.clientY)
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (state.animationFrame) {
          cancelAnimationFrame(state.animationFrame)
          state.animationFrame = 0
        }
      } else if (!state.reduced) {
        ensureAnimation()
      }
    }

    const onReduceMotion = (e: MediaQueryListEvent) => {
      state.reduced = e.matches
      if (state.reduced && state.animationFrame) {
        cancelAnimationFrame(state.animationFrame)
        state.animationFrame = 0
      } else if (!state.reduced) {
        ensureAnimation()
      }
      resize()
    }

    const onCoarsePointer = (e: MediaQueryListEvent) => {
      state.coarse = e.matches
    }

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    reduceMotion.addEventListener('change', onReduceMotion)
    coarsePointer.addEventListener('change', onCoarsePointer)

    resize()

    return () => {
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisibility)
      reduceMotion.removeEventListener('change', onReduceMotion)
      coarsePointer.removeEventListener('change', onCoarsePointer)
    }
  }, [maskHighlightRef, maskTargetRef])

  return <canvas ref={canvasRef} className={className} style={{ zIndex: 0, ...style }} aria-hidden="true" />
}
