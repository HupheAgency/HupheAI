# Reference View Generation Contract

Doel: aanvullende productviews genereren zonder de originele bronfoto ooit gelijk te stellen aan AI-output.

## Input

```ts
type GenerateReferenceViewsInput = {
  projectId: string
  sourceImageUrl: string
  targetViews: Array<'left' | 'right' | 'rear' | 'top'>
  existingViews?: Array<{
    angle: 'front' | 'left' | 'right' | 'rear' | 'top' | 'custom'
    assetUrl: string
    provenance: 'observed' | 'inferred' | 'user-approved' | 'user-edited'
  }>
  productNotes?: string
  consistencyMode: 'turnaround' | 'single-view-repair'
}
```

## Output

```ts
type GenerateReferenceViewsOutput = {
  providerRunId: string
  mode: 'contact-sheet' | 'single-views'
  views: Array<{
    angle: 'left' | 'right' | 'rear' | 'top'
    imageUrl: string
    prompt: string
    provenance: 'inferred'
    confidence?: number
    warnings?: string[]
  }>
}
```

## Statusregels

- Originele upload: `observed`.
- Nieuwe provideroutput: `inferred`.
- Gebruiker accepteert view: `user-approved`.
- Gebruiker vervangt of bewerkt view: `user-edited`.
- Slechte view: `rejected` of `superseded`.

## UI-Verplichtingen

- Toon per view altijd herkomst.
- AI-views mogen niet automatisch canoniek worden.
- De gebruiker moet elke inferred view expliciet accepteren.
- Een canonical set mag pas worden gemaakt als minimaal front + een bruikbare aanvullende view aanwezig is.

## Failure Cases

- Provider levert geen image.
- Contact sheet heeft verkeerde volgorde.
- View wijkt sterk af van bronidentiteit.
- Product is afgesneden.
- Logo/tekst wordt veranderd.
- Kostenlimiet of rate limit.

## Handoff Aan Claude

Sla per run op:
- provider name;
- model name;
- input manifest;
- output manifest;
- latency;
- cost estimate;
- retry count;
- error details.

## Handoff Aan ChatGPT/Codex

Frontend verwacht:
- views met `angle`, `imageUrl`, `provenance`, `confidence`, `warnings`;
- accept/reject/replace acties;
- duidelijke statuslabels: echt, AI voorstel, goedgekeurd, aangepast.

