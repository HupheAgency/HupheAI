import type { HtmlPresentationTemplate } from '../../lib/html-presentation-templates'
import { colourGaloreTemplate } from './colour-galore'
import { studioCleanTemplate } from './studio-clean'

// roorda-2026 is ~36 MB — load as a separate chunk so it doesn't block app startup.
// The array is populated asynchronously; components listen to 'huphe:html-templates-changed'.
export const systemHtmlPresentationTemplates: HtmlPresentationTemplate[] = [
  studioCleanTemplate,
  colourGaloreTemplate,
]

import('./roorda-2026').then(({ roorda2026Template }) => {
  systemHtmlPresentationTemplates.unshift(roorda2026Template)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('huphe:html-templates-changed'))
  }
})
