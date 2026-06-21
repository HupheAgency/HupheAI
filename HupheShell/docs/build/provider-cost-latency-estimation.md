# Provider Cost & Latency Estimation per Product Category

*Let op: Dit zijn gesimuleerde/verwachte waarden. Zodra we echte logging uit Claude's end-to-end integratie hebben, werken we dit document bij.*

| Product Categorie | Verwachte Uitdaging | Reference Views (A1) | Reconstructie (C1) | Final Render (E1) | Totale MVP Latency | Totale MVP Kosten (millicredits) |
|---|---|---|---|---|---|---|
| **Eenvoudige Verpakkingen** (Doosjes, Blikjes) | Makkelijk. Geen complexe vormen of reflecties. | 4.5s | 4s | 5s | ~13.5s | ~3200 mcr |
| **Organische Vormen** (Schoenen, Tassen) | Gemiddeld. Texturen zijn belangrijk, vormen lastig voorspelbaar aan achterkant. | 5s | 6s | 8s | ~19s | ~3500 mcr |
| **Complexe Geometrie** (Fietsen, Stoelen met spijlen) | Moeilijk. TRELLIS.2 kan moeite hebben met gaten in meshes. | 6s (vaak 1x retry) | 8s | 8s | ~22s | ~4200 mcr |
| **Transparant / Glas** (Flessen, Vazen) | Zeer moeilijk. Diffusion worstelt met transparantie vs. achtergrond. | 7s (retry nodig) | proxy aanbevolen | 10s | ~17s (proxy) | ~3000 mcr |

**Kostenberekening gebaseerd op fal.ai API (gesimuleerd):**
- Contact sheet: ~700 mcr
- TRELLIS.2: ~2000 mcr
- Qwen Image-Edit: ~500 mcr
*(1 EUR = 100.000 millicredits)*

## Conclusie voor Fase 2
Zodra we 5 objecten per categorie door de pijplijn hebben gehaald, kunnen we beslissen of we voor complexe geometrie automatisch overschakelen op een duurdere multi-view provider.
