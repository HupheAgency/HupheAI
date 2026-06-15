# Typewriter HTML Migration Plan

## 1. Doel
Bestaande documenten in de Supabase-database bevatten ongestructureerde HTML (gegenereerd door `contentEditable`). Omdat we overstappen naar TipTap (JSON), moeten deze oude documenten naadloos en zonder dataverlies geconverteerd worden bij het openen.

## 2. Het Conversieproces (Read-path)

Wanneer een gebruiker een bestaand document opent:
1. **Controle:** De applicatie (of TipTap editor) checkt of het document al een `content_json` veld heeft.
2. **On-the-fly conversie:** Als `content_json` leeg/null is, haalt de app de `content_html` op.
3. **Sanitization:** De `content_html` wordt ter extra beveiliging (hoewel al opgeslagen via DOMPurify) nog één keer geschoond.
4. **Parsing:** TipTap's `generateJSON(html, extensions)` wordt aangeroepen op de frontend om de HTML om te zetten naar de strikte TipTap JSON-structuur.
5. **Initialisatie:** De editor laadt de verse JSON.
6. **Lazy Save:** Bij de eerste 'autosave' (of debounced opslag) wordt zowel de nieuwe JSON als de resulterende opschoonde HTML naar Supabase weggeschreven. Oude legacy HTML wordt hierdoor overschreven met schone TipTap-HTML.

## 3. Oude Huphe-Links Behouden (Risico-mitigatie)

De lastigste taak is het behouden van de bestaande links (`data-huphe-link`).
In de huidige editor worden Huphe links opgeslagen in de HTML en via aparte `linkedSelections` (kopieën in de document state).

**Migratie-actie:**
We moeten een custom TipTap-extensie schrijven (`HupheLink`) met een specifieke `parseHTML` rule:
```javascript
parseHTML() {
  return [
    {
      tag: 'a[data-type="huphe-link"]',
      getAttrs: node => ({
        targetId: node.getAttribute('data-target-id'),
        targetType: node.getAttribute('data-target-type'),
        role: node.getAttribute('data-role'),
      }),
    },
  ]
}
```
Zonder deze rule zal TipTap de `<a>` tags strippen of degraderen naar gewone URL-hyperlinks.

## 4. Fallback & Rollback
Mocht de JSON parser crashen op extreem corrupte HTML:
- Sla nooit een leeg of beschadigd JSON object direct op.
- Toon een foutmelding "Document kan niet worden geconverteerd" en behoud de HTML read-only.
- Omdat we HTML in een aparte kolom (`content_html`) behouden, gaat ruwe data nooit verloren en kunnen we bugs in de parser later herstellen.
