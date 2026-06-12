import { useRef } from 'react'
import type { CSSProperties } from 'react'
import AnimatedPixelBackground from '../components/AnimatedPixelBackground'

export default function WelcomeHero() {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleHighlightRef = useRef<HTMLHeadingElement>(null)

  const titleStyle = {
    fontFamily: '"Baloo 2", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    fontSize: '72px',
    fontWeight: 400,
    letterSpacing: '0.05em',
    lineHeight: 0.92,
    color: '#ffffff',
    margin: 0,
  } as CSSProperties

  const titleHighlightStyle = {
    ...titleStyle,
    position: 'absolute',
    inset: 0,
    color: '#ffffff',
    pointerEvents: 'none',
    ['--mouse-x' as string]: '-999px',
    ['--mouse-y' as string]: '-999px',
    ['--highlight-center' as string]: 'rgba(0,0,0,0)',
    ['--highlight-mid' as string]: 'rgba(0,0,0,0)',
    WebkitMaskImage: 'radial-gradient(circle 110px at var(--mouse-x) var(--mouse-y), var(--highlight-center) 0%, var(--highlight-center) 45px, var(--highlight-mid) 80px, transparent 110px)',
    maskImage: 'radial-gradient(circle 110px at var(--mouse-x) var(--mouse-y), var(--highlight-center) 0%, var(--highlight-center) 45px, var(--highlight-mid) 80px, transparent 110px)',
  } as CSSProperties

  return (
    <div className="h-full relative select-none">
      <AnimatedPixelBackground maskTargetRef={titleRef} maskHighlightRef={titleHighlightRef} />

      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-8">
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
          <h1 ref={titleRef} style={titleStyle}>
            <span>Huphe</span><span style={{ color: '#facc15', fontWeight: 700 }}>AI</span>
          </h1>
          <h1 ref={titleHighlightRef} style={titleHighlightStyle} aria-hidden="true">
            <span>Huphe</span><span style={{ color: '#facc15', fontWeight: 700 }}>AI</span>
          </h1>
        </div>

        <p style={{
          maxWidth: 680,
          marginBottom: 14,
          color: 'rgba(244,241,232,0.72)',
          fontSize: 'clamp(17px, 1.9vw, 22px)',
          fontWeight: 600,
          lineHeight: 1.34,
        }}>
          The next generation of creative workflow.<br />
          <span style={{ fontWeight: 300 }}>From rough thinking to sharp execution.</span>
        </p>

      </div>
    </div>
  )
}
