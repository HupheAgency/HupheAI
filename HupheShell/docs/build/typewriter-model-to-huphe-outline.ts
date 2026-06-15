/**
 * Handoff voor Codex/Claude:
 * Dit is een PURE HELPER (geen dependencies, geen react).
 * Doel: De nieuwe strikte TipTap JSON itereren om er een presentatie-outline of 
 * banner-copy set van te maken.
 */

// Simpel mock model gebaseerd op TipTap JSON
interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  attrs?: Record<string, any>;
}

interface TipTapJSON {
  type: 'doc';
  content?: TipTapNode[];
}

export interface HupheSlideOutline {
  title: string;
  body: string; // Plain text of markdown van paragrafen onder deze titel
}

/**
 * Converteert een JSON document boom naar een Huphe Presentatie Outline.
 * Logica: Elke H1 of H2 begint een nieuwe slide. Alles wat eronder valt
 * (tot de volgende H1/H2) wordt de body text van die slide.
 * 
 * @param json De TipTap document JSON
 */
export function extractPresentationOutline(json: TipTapJSON): HupheSlideOutline[] {
  if (!json.content || json.content.length === 0) return [];

  const slides: HupheSlideOutline[] = [];
  let currentSlide: HupheSlideOutline | null = null;

  for (const node of json.content) {
    if (node.type === 'heading' && node.attrs && (node.attrs.level === 1 || node.attrs.level === 2)) {
      // Sluit vorige slide af indien nodig
      if (currentSlide) {
        slides.push(currentSlide);
      }
      
      // Start nieuwe slide
      const titleText = extractPlainText(node);
      currentSlide = { title: titleText, body: '' };
    } 
    else if (node.type === 'paragraph' || node.type === 'bulletList' || node.type === 'orderedList') {
      // Voeg toe aan huidige slide
      if (!currentSlide) {
        // Als er tekst staat vóór de eerste kop, maak een default slide
        currentSlide = { title: 'Introductie', body: '' };
      }
      const paragraphText = extractPlainText(node);
      currentSlide.body += paragraphText + '\n\n';
    }
  }

  // Voeg laatste slide toe
  if (currentSlide) {
    currentSlide.body = currentSlide.body.trim(); // clean up trailing enters
    slides.push(currentSlide);
  }

  return slides;
}

/**
 * Hulpfunctie om alle `text` elementen recursief uit een node te halen, 
 * negeert marks (bold/italic) voor een simpele plain-text export.
 */
function extractPlainText(node: TipTapNode): string {
  if (node.type === 'text' && node.text) {
    return node.text;
  }
  
  if (node.content && node.content.length > 0) {
    return node.content.map(extractPlainText).join('');
  }
  
  return '';
}
