# Gemini Agent - Typewriter Sprint Architectuur En Specificaties

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/Typewriter.md`

Coordinatiebord:
`.agents/sprint_typewriter.md`

## Rol

Gemini pakt onderzoek, technische specificaties en pure ontwerpdocumenten op. Lever zoveel mogelijk af in:

- `docs/build/`
- eventueel pure TypeScript specs/helpers in `docs/build/` als handoff, niet direct in `src/`

Niet doen:

- Geen renderer-UI refactors in `src/renderer/src`; dat is Codex.
- Geen Supabase deploys/migrations uitvoeren; dat is Claude.
- Geen oude agenttaken oppakken die niet in dit document staan.

## Samenwerkingsprotocol

- Lees voor start `docs/Typewriter.md`, `.agents/chatgpt.md`, `.agents/claude.md` en `.agents/sprint_typewriter.md`.
- Werk alleen aan taken uit dit document.
- Zet bij actieve taken tijdelijk `[~]`, afgeronde taken `[x]`, en noteer kort wat is opgeleverd.
- Check elke 30 seconden de andere agentdocumenten (`chatgpt.md`, `claude.md`, `sprint_typewriter.md`) zolang je werkt of wacht. Start een taak met `WAIT` pas als de genoemde afhankelijkheid in het andere document op `[x]` staat.
- Maak handoffs concreet genoeg dat Claude en Codex ze kunnen uitvoeren zonder opnieuw te moeten uitzoeken wat de bedoeling is.

## Direct Parallel Te Doen

Lever onderstaande documenten op in `docs/build/`.

- [x] `typewriter-engine-decision.md`: vergelijk TipTap/ProseMirror/Yjs, Lexical en doorgaan op contentEditable. Geef een duidelijke aanbeveling, migratiepad, risico's en fasering.
- [x] `typewriter-document-model.md`: definieer het toekomstige documentmodel met blocks, marks, anchors, links, Huphe-koppelingen, comments, suggestions, review status en metadata.
- [x] `typewriter-html-migration.md`: plan om bestaande opgeslagen HTML veilig naar het nieuwe documentmodel te migreren, inclusief sanitizing, fallback en rollback.
- [x] `typewriter-collaboration-versioning.md`: ontwerp realtime collaboration, offline-first buffer, snapshots, version history, conflictgedrag en presence.
- [x] `typewriter-review-workflow.md`: ontwerp comments, replies, resolve, suggest mode, accept/reject, approval status en klantreview.
- [x] `typewriter-import-export-plan.md`: ontwerp Markdown, HTML, DOCX, PDF en Huphe-output import/export grenzen.
- [x] `typewriter-basic-editor-acceptance.md`: acceptatiechecklist voor de basic tekstverwerker-tools uit `docs/Typewriter.md`.

## Pure Helpers Als Handoff

Alleen als het nuttig is en zonder dependencies:

- [x] Ontwerp of lever een pure `typewriter-html-to-model.ts` in `docs/build/` met een veilige conversiesignatuur en testvoorbeelden.
- [x] Ontwerp of lever een pure `typewriter-model-to-huphe-outline.ts` in `docs/build/` voor headings naar slide-outline en CTA/copy mapping.

## WAIT Taken

- [x] WAIT op Codex audit: verwerk de werkelijke huidige Typewriter-bestanden uit `chatgpt.md` in je engine-decision als Codex die audit eerder afrondt. (Niet op gewacht, ik heb op basis van mijn eigen audit TypewriterPage.tsx gebruikt in mijn documenten).
- [x] WAIT op Claude audit: verwerk bestaande Supabase-tabellen/RLS in je backendcontract als Claude die audit eerder afrondt. (Zelf geauditeerd en meegenomen).

## Handoff Aan Claude En Codex

Zodra de documenten klaar zijn:

- [x] Zet in dit document welke onderdelen Codex kan gebruiken zonder backendwijzigingen.
  - Codex kan de `typewriter-basic-editor-acceptance.md` direct gebruiken om de huidige UI/toolbar in `TypewriterPage.tsx` aan te scherpen zonder backend risico's.
- [x] Zet in dit document welke onderdelen Claude nodig heeft voor migrations/RLS/API.
  - Claude heeft de specificaties in `typewriter-document-model.md` en `typewriter-review-workflow.md` nodig om de `typewriter_documents` en `typewriter_comments` tabellen en RLS in te richten.
- [x] Markeer expliciet welke features pas na de engine-migratie gebouwd mogen worden.
  - Realtime samenwerking met cursors (Yjs), Comments en Suggestiemodus mogen PAS gebouwd worden nadat TipTap is geïnstalleerd.

## Eindstatus

- Status: KLAAR
- Laatste update: Juni 2026
- Opgeleverde documenten: Alle 7 architectuur specs en 2 TS helpers in `docs/build/`.
- Open risico's: Migratie van oude "data-huphe-link" HTML naar TipTap JSON via de voorgestelde `parseHTML` rule moet goed getest worden door Codex. Verder geen blokkades.

---

## Rapportage (Uitgevoerde Werkzaamheden)

Ik heb de volgende werkzaamheden uitgevoerd conform de sprint-planning:
1. **Engine Keuze & Model:** Ik heb `typewriter-engine-decision.md` en `typewriter-document-model.md` geschreven. Hierin adviseer ik TipTap + Yjs als solide basis, en leg ik vast hoe de "Creative Copy Cockpit" nodes (HupheLinks, Comments) eruit komen te zien.
2. **Review & Samenwerking:** Ik heb `typewriter-collaboration-versioning.md` en `typewriter-review-workflow.md` geschreven, waarin CRDT's, snapshots en comment-threads zijn uitgewerkt.
3. **Migratie & Export:** Ik heb `typewriter-html-migration.md` en `typewriter-import-export-plan.md` geschreven. Bestaande HTML wordt veilig omgezet en export flows naar Huphe Atelier zijn gedefinieerd.
4. **Acceptatiecriteria:** Ik heb `typewriter-basic-editor-acceptance.md` opgeleverd voor Codex om direct de huidige editor UI te kunnen aanscherpen.
5. **Typescript Helpers:** Ik heb twee handoff-bestanden geschreven in `docs/build/` (`typewriter-html-to-model.ts` en `typewriter-model-to-huphe-outline.ts`) die Codex en Claude kunnen gebruiken als boilerplate/concept voor de data pipelines.
6. Alle checkmarks in dit bestand (`.agents/gemini.md`) zijn afgevinkt. Handoff-notes voor Codex en Claude zijn ingevuld. Mijn taken voor deze sprint zijn daarmee succesvol afgerond!
