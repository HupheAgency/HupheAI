/**
 * Handoff voor Codex/Claude:
 * Dit is een PURE HELPER (geen dependencies, geen react).
 * Doel: Oude opgeslagen HTML (geproduceerd door contentEditable) veilig 
 * converteren naar het nieuwe TipTap JSON Node model.
 */

import { generateJSON } from '@tiptap/html';
// Let op: Bij implementatie moeten hier de actuele TipTap extensions geïmporteerd worden!
// import Document from '@tiptap/extension-document'
// import Paragraph from '@tiptap/extension-paragraph'
// import Text from '@tiptap/extension-text'
// import Heading from '@tiptap/extension-heading'
// import Bold from '@tiptap/extension-bold'

/**
 * Zorg dat je alle extensies die je editor gebruikt hier ook definieert,
 * anders worden die tags gestript tijdens de HTML parsing!
 */
const migrationExtensions = [
  // Document, Paragraph, Text, Heading, Bold, etc.
];

/**
 * Converteert ruwe legacy HTML naar het strikte TipTap JSON format.
 * Voordat je dit aanroept, ZORG ERVOOR dat `rawHtml` door DOMPurify is gegaan
 * (hoewel generateJSON zelf ook redelijk strikt is, is dubbel veiliger).
 * 
 * @param rawHtml De oude opgeslagen Huphe Typewriter HTML
 * @returns JSON Record compatibel met TipTap EditorContent
 */
export function migrateLegacyHtmlToTipTapJson(rawHtml: string): Record<string, any> {
  if (!rawHtml || rawHtml.trim() === '') {
    return {
      type: 'doc',
      content: [
        { type: 'paragraph' }
      ]
    };
  }

  try {
    // GenerateJSON parseert de HTML synchroon op basis van de meegegeven extensie regels.
    // Tags of attributen die niet in migrationExtensions staan, worden gestript.
    const json = generateJSON(rawHtml, migrationExtensions);
    return json;
  } catch (err) {
    console.error('[Typewriter Migration] Fout bij parsen HTML', err);
    // Veilige fallback om crashes van de editor te voorkomen
    return {
      type: 'doc',
      content: [
        { 
          type: 'paragraph', 
          content: [
            { type: 'text', text: 'Document kon niet automatisch geconverteerd worden. Neem contact op met support.' }
          ] 
        }
      ]
    };
  }
}

/**
 * Concept voor de custom HupheLink extensie die we nodig hebben om oude 
 * <a data-type="huphe-link"> tags succesvol door de migrateLegacyHtmlToTipTapJson heen te loodsen.
 * 
 * Bij implementatie: maak een echte TipTap Mark extensie op basis van dit concept.
 */
export const CONCEPT_HupheLinkExtension = {
  name: 'hupheLink',
  // ... andere tiptap configuratie
  parseHTML() {
    return [
      {
        tag: 'a[data-type="huphe-link"]',
        getAttrs: (element: HTMLElement) => ({
          targetId: element.getAttribute('data-target-id'),
          targetType: element.getAttribute('data-target-type'),
          role: element.getAttribute('data-role'),
        }),
      },
    ]
  }
};
