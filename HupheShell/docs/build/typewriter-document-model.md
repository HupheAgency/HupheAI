# Typewriter Document Model (JSON)

## 1. Doel
Dit document definieert het nieuwe structurele documentmodel voor Typewriter. We stappen af van ongestructureerde HTML strings en gaan naar een strikte TipTap/ProseMirror JSON boom (Abstract Syntax Tree). Dit garandeert data-integriteit, stelt ons in staat om betrouwbare comments/anchors te plaatsen, en maakt mapping naar Huphe-output (slides, banners) veel robuuster.

## 2. De Basisstructuur
Elk Typewriter document bestaat uit een root `doc` Node met een array van blok-elementen (`content`).

```typescript
interface TypewriterJSON {
  type: 'doc';
  content: BlockNode[];
}

type BlockNode = 
  | ParagraphNode 
  | HeadingNode 
  | BulletListNode 
  | OrderedListNode 
  | QuoteNode 
  | CTANode; // Custom Huphe block
```

## 3. Custom Nodes & Marks

Om de "Creative Copy Cockpit" visie te ondersteunen, moeten we enkele custom elementen definiëren.

### A. HupheLink (Mark)
Vervangt de huidige `<a data-type="huphe-link">` functionaliteit. Dit markeert tekst die gelinkt is aan een output-veld in Atelier.

```typescript
interface HupheLinkMark {
  type: 'hupheLink';
  attrs: {
    targetId: string;       // ID van project of document
    targetType: 'banners' | 'print' | 'document' | 'media';
    role: string;           // Bijv. 'banner-heading'
    copyBlockId?: string;   // Optionele referentie naar copy library
  };
}
```

### B. CommentAnchor (Mark of Node)
Cruciaal voor de review-workflow. Een onzichtbare anchor of een mark die tekst arceert, gekoppeld aan een discussie-thread.

```typescript
interface CommentMark {
  type: 'comment';
  attrs: {
    threadId: string; // Verwijst naar een Supabase 'typewriter_comments' tabel
  };
}
```

### C. Suggestion / Track Changes (Marks)
Voor de iteratiefase met klanten/collega's.

```typescript
interface SuggestionAdditionMark {
  type: 'suggestionAddition';
  attrs: { userId: string; timestamp: string };
}
interface SuggestionDeletionMark {
  type: 'suggestionDeletion';
  attrs: { userId: string; timestamp: string };
}
```

## 4. Metadata in Database (Supabase)

Naast de ruwe JSON-content, heeft het document extra metadata nodig op tabel-niveau in Supabase (`typewriter_documents`):

```typescript
interface TypewriterDocumentDB {
  id: string;
  owner_id: string;
  title: string;
  content_json: any;           // De TipTap JSON
  content_html: string;        // Gekompileerde veilige HTML voor fallbacks en quick reads
  review_status: 'draft' | 'in_review' | 'approved' | 'final';
  created_at: string;
  updated_at: string;
  // Live delen
  is_live: boolean;
  share_code: string | null;
}
```

## 5. Mappen naar Huphe Output (Concepts)
Omdat we een JSON structuur hebben, kunnen we makkelijk itereren:
- Elke `HeadingNode` (H1, H2) kan dienen als trigger voor een nieuwe Slide in Atelier.
- Paragrafen daaronder worden de body-text van de slide.
- Blokken met de mark `hupheLink` en role `banner-cta` worden via een export-functie direct doorgeschoten naar het `CTANode` veld in een geselecteerde Bannerset.
