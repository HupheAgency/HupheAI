import { useEffect, useRef, useState, type RefObject } from 'react'

const DELAY_MS = 600

/** One shared tooltip: hovering anything with a title or data-tip shows its label after a pause. Native titles are moved to data-tip so they do not double up. */
export function TimelineTooltip({ root }: { root: RefObject<HTMLElement | null> }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean }>()
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const node = root.current
    if (!node) return
    const hide = () => { window.clearTimeout(timer.current); setTip(undefined) }
    const over = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[title],[data-tip]')
      if (!target || !node.contains(target)) return
      const native = target.getAttribute('title')
      if (native) { target.setAttribute('data-tip', native); target.removeAttribute('title'); if (!target.getAttribute('aria-label') && !target.textContent?.trim()) target.setAttribute('aria-label', native) }
      const text = target.getAttribute('data-tip')
      hide()
      if (!text) return
      timer.current = window.setTimeout(() => {
        const box = target.getBoundingClientRect()
        setTip({ text, x: Math.min(Math.max(box.left + box.width / 2, 130), window.innerWidth - 130), above: box.bottom + 40 > window.innerHeight, y: box.bottom + 40 > window.innerHeight ? box.top - 8 : box.bottom + 8 })
      }, DELAY_MS)
    }
    node.addEventListener('mouseover', over)
    node.addEventListener('mouseleave', hide)
    node.addEventListener('pointerdown', hide, true)
    node.addEventListener('keydown', hide, true)
    return () => { hide(); node.removeEventListener('mouseover', over); node.removeEventListener('mouseleave', hide); node.removeEventListener('pointerdown', hide, true); node.removeEventListener('keydown', hide, true) }
  }, [root])
  return tip ? <div className="vt-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.above ? '-100%' : '0'})` }}>{tip.text}</div> : null
}
