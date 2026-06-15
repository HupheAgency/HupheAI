# Typewriter Engine Decision

## 1. Context & Doel
Huphe Typewriter gebruikt momenteel native `contentEditable` en `document.execCommand()` (o.a. in `TypewriterPage.tsx`). Hoewel dit voldoende is voor basis tekstbewerking, vormt het een hard plafond voor de roadmap uit `docs/Typewriter.md`. Geavanceerde functies zoals review-workflows (comments/suggesties), stabiele Huphe-linking (anchors) en robuuste realtime collaboration zijn berucht moeilijk te bouwen bovenop de native DOM-mutaties van browsers. 

De nieuwe engine moet de basis vormen voor de "Creative Copy Cockpit" van Huphe.

## 2. Opties vergeleken

### Optie 1: Doorgaan op `contentEditable`
- **Voordelen:** Geen migratie nodig, kleinste bundelgrootte, geen nieuwe dependencies.
- **Nadelen:** `execCommand` is deprecated. Bugs met cursorposities en HTML-inconsistenties tussen browsers. Onmogelijk om robuuste conflictresolutie (gelijktijdig typen) of stabiele comments met anchors te bouwen zonder de halve browser opnieuw te engineeren.
- **Conclusie:** Niet doen. Dit blokkeert de gehele roadmap.

### Optie 2: Lexical (Meta)
- **Voordelen:** Extreem snel, modern, native React integratie, state-of-the-art virtualisatie voor grote documenten.
- **Nadelen:** Steilere leercurve, de collaboration via Yjs en review-tools vereisen meer eigen werk in vergelijking met TipTap. Minder "out-of-the-box" oplossingen voor opmaak en anchors.

### Optie 3: TipTap / ProseMirror + Yjs
- **Voordelen:** De absolute industriestandaard voor moderne (headless) text-editors.
  - **Headless:** Wij bepalen 100% de clean UI.
  - **ProseMirror fundament:** Biedt een uiterst strikt en onbreekbaar JSON documentmodel.
  - **Yjs:** Officieel ondersteunde module (via Hocuspocus/Supabase) voor foutloze realtime collaboration via CRDT's.
  - **Uitbreidbaarheid:** Custom Huphe-links (anchors) en block-styles zijn makkelijk toe te voegen als custom Nodes/Marks.
- **Nadelen:** Zwaardere dependency, vereist een migratie van bestaande HTML naar TipTap JSON.

## 3. Besluit
**De aanbeveling is TipTap (gebaseerd op ProseMirror) met Yjs.**
Dit biedt de snelste, meest stabiele route naar de benodigde review-tools en Huphe-linking anchors, zonder in te leveren op de gewenste "clean typewriter" UI.

## 4. Fasering & Migratiepad

1. **Setup:** Installeer `@tiptap/react`, `@tiptap/starter-kit`, en de vereiste extensies voor headings, formatting en collaboration.
2. **Custom Nodes:** Ontwikkel custom Marks/Nodes voor `HupheLink` (ter vervanging van de huidige koppeling-logica).
3. **Conversie:** Implementeer een HTML-parser (of gebruik TipTap's ingebouwde `generateJSON`) om opgeslagen HTML van oude documenten (uit Supabase) *on the fly* om te zetten naar TipTap's JSON structuur bij het openen.
4. **Data opslag:** Vanaf dan wordt het document opgeslagen als het strikte JSON-model (en eventueel HTML voor simpele export-views).
5. **Vervanging:** `TypewriterPage.tsx` krijgt de `<EditorContent>` in plaats van de native `<div contentEditable>`.

## 5. Risico's
- **Huphe-Koppelingen (Links):** Bestaande links (bijv. naar banner headings) in opgeslagen HTML moeten correct overgenomen worden door TipTap's HTML-parser. Dit vereist een custom TipTap-extensie die de specifieke `data-huphe-link` attributen herkent.
- **Supabase Realtime vs Yjs:** TipTap Collaboration gebruikt standaard een WebSockets server (Hocuspocus). We moeten dit laten praten over Supabase Realtime of een losse provider inrichten (via `y-supabase` of `y-webrtc`). Dit is een technisch integratierisico voor Claude.
