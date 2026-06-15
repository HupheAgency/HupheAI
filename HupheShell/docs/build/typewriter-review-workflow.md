# Typewriter Review Workflow

## 1. Doel
Specificatie voor "Review Workflow", essentieel om Typewriter geschikt te maken voor klantcontact, strategen en copywriters in de iteratiefase (Fase 3). 

## 2. Comments (Opmerkingen)

**Interactiemodel:**
1. Gebruiker selecteert een stuk tekst en klikt "Voeg opmerking toe".
2. De TipTap editor pakt de huidige selectie en wikkelt daar een onzichtbare of subtiel geel gemarkeerde `CommentMark` omheen met een unieke `threadId`.
3. Er wordt een entry gemaakt in Supabase `typewriter_comments` met dit `threadId`, referentie naar het document, en de initiële comment-tekst.

**Zijbalk UI:**
- Naast de editor staat een comment sidebar.
- Als een gebruiker op een gearceerde `CommentMark` klikt, scrollt de zijbalk naar de juiste thread en licht deze op.
- Features: Reply to thread, Resolve thread (mark wordt verwijderd of verrijkt met "resolved" styling), Delete thread.

## 3. Suggestiemodus (Track Changes)

Voor het controleren van copy zonder direct te overschrijven.

**Mechanisme:**
Wanneer Suggestiemodus 'aan' staat:
- **Deletions:** Gebruiker drukt op backspace op tekst. In plaats van de Node te verwijderen, krijgt de node een `SuggestionDeletionMark` (rood, doorstreept, met userId en datum).
- **Additions:** Gebruiker typt nieuwe tekst. Deze tekst krijgt een `SuggestionAdditionMark` (groen, onderstreept).

**Reviewen (Accept/Reject):**
- De documenteigenaar of reviewer kan de suggestie aanklikken en kiezen voor 'Accepteer' (Mark wordt verwijderd voor additions, tekst wordt verwijderd voor deletions) of 'Weiger' (Tekst wordt verwijderd voor additions, Mark wordt verwijderd voor deletions).

## 4. Document Statussen & Draft Locking

Om workflow overzichtelijk te houden krijgt het document metadata stempels in Supabase (`review_status`):
- `Draft`: Vrij bewerkbaar voor copywriter.
- `In Review`: (Optioneel) Draft Lock. De originele copywriter kan niet zomaar tekst wijzigen zonder expliciete suggestiemodus in te schakelen, zodat reviewers geen bewegend doelwit reviewen.
- `Approved`: Goedgekeurd voor gebruik in Huphe banners/presentaties.
- `Final`: Bevroren versie voor archief.
