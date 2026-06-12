import DOMPurify from 'dompurify'

// ─── Inline rich-text sanitizer (Typewriter, RichTextEditor) ────────────────
// Strikte whitelist: alleen structurele inline tags, geen attributen.
// Gebruikt de DOM-walker aanpak zodat het ook zonder DOMPurify werkt
// in omgevingen zonder window (bijv. unit tests).

function encodeTextEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const ALLOWED_INLINE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
  'p', 'div', 'br', 'span', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return encodeTextEntities(html)

  const doc = new DOMParser().parseFromString(html, 'text/html')

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return encodeTextEntities(node.textContent ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const kids = Array.from(el.childNodes).map(walk).join('')

    if (!ALLOWED_INLINE_TAGS.has(tag)) return kids
    if (tag === 'br') return '<br>'
    if (tag === 'div') return kids ? `<p>${kids}</p>` : ''
    if (tag === 'strike' || tag === 'del') return `<s>${kids}</s>`
    if (tag.startsWith('h')) return `<p><strong>${kids}</strong></p>`
    return `<${tag}>${kids}</${tag}>`
  }

  return Array.from(doc.body.childNodes).map(walk).join('')
}

// ─── Full HTML sanitizer (WebSlidePreview, banner/print previews) ────────────
// Presentaties bevatten volledige HTML inclusief stijlen en afbeeldingen.
// DOMPurify verwijdert scripts, event handlers en gevaarlijke attributen,
// maar behoudt layout-relevante elementen en CSS.

const PRESENTATION_CONFIG: DOMPurify.Config = {
  // Scripts en event handlers worden altijd verwijderd door DOMPurify.
  // Aanvullend: geen externe resources laden, geen navigatie.
  FORBID_TAGS: ['script', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onkeydown', 'onkeyup', 'onkeypress', 'onsubmit', 'onchange', 'action', 'formaction'],
  ALLOW_DATA_ATTR: true,
  // Behoud href voor ankertags maar alleen voor veilige protocols
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  FORCE_BODY: true,
}

export function sanitizeFullHtml(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, PRESENTATION_CONFIG) as string
}

// ─── Inline markdown renderer (ongewijzigd, uitsluitend voor labels/tekst) ──
// Wordt gebruikt in WebSlidePreview voor korte tekstvelden.
// Geen externe input; output gaat via dangerouslySetInnerHTML.
// Gebruik sanitizeInlineMarkdown() als wrapper voor vertrouwde inputs.

export function sanitizeInlineMarkdown(html: string): string {
  if (!html) return ''
  // Korte tekstvelden bevatten geen volledige HTML; enkelvoudige DOMPurify pass
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span'],
    ALLOWED_ATTR: [],
  }) as string
}
