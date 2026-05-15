# Dataset Architecture — GPT Synthesis

## Core Insight
Use a **graph-seed schema** as the canonical dataset model. Not flat tables.

## Data Sources Stack

| Priority | Source | Use | License |
|---|---|---|---|
| 1 | **Wikidata** | Backbone — entities, categories, hierarchy, aliases, work links | CC0 structured data |
| 2 | **LLM enrichment** | Soft gameplay attributes (wears_red, fits_in_hand, is_scary) | Generated |
| 3 | **Gameplay feedback** | User answer truth distribution — how humans ACTUALLY answer | Proprietary |
| 4 | GeoNames / OSM | Places and geography | ODbL (caution) |
| 5 | TMDb / IMDb | Media metadata, popularity priors only | Non-commercial / limited |

## Three Layers of Truth

```
Source Truth → What Wikidata/IMDb says
Game Truth  → What the engine uses during play
User Truth  → What real players answer (learn over time)
```

Batman doesn't have superpowers (source truth = no). But many players might say "kind of" (user truth). The engine should use **game truth** informed by **user truth**, not just source truth.

## Recommended Entity Model

```yaml
entity:
  id: entity:mario
  name: Mario
  domain: character
  categories: [fictional_character, video_game_character]
  aliases: [Super Mario]
  popularity_prior: 0.98
  source_refs: { wikidata: Q132 }
  assertions:
    - attribute: from_video_game
      value: yes
      confidence: 0.95
      source: wikidata
    - attribute: wears_red
      value: yes
      confidence: 0.92
      source: llm_enriched + human_review
```

## Attribute Assertion (the core unit)

```yaml
assertion:
  entity_id: entity:mario
  attribute_id: attr:wears_red
  value: yes
  numeric_value: 1.0
  confidence: 0.92
  provenance:
    method: llm_enriched
    reviewed_by: human
  user_truth_distribution:
    yes: 0.85
    kind_of: 0.10
    no: 0.05
```

## Storage Recommendation

> **Postgres first, graph-shaped data model** — D1 (SQLite on CF) works similarly.
> Don't start with Neo4j or RDF. Use relational tables with JSONB for flexible attributes, then export to graph DB later if needed.

Key tables we'd need:
- `entities` — canonical name, domain, popularity, source refs
- `aliases` — entity_id, alias, language
- `categories` — type hierarchy (fictional_character > video_game_character)
- `entity_categories` — bridge with confidence
- `attributes` — key, display_name, applies_to, answer_type
- `attribute_assertions` — entity_id, attribute_id, value, confidence, source, user_truth_distribution
- `question_templates` — attribute_id, template, ask_stage, quality_score
- `game_observations` — game_id, entity_id, attribute_id, user_answer, turn, confidence_before/after

## What This Means For Our Current D1 Schema

Our current `characters` table stores attributes as JSON string:
```sql
attributes = '{"fictional":1,"human":1,"male":1,"from_movie":1}'
```

New model would normalize this into `attribute_assertions` table with per-assertion confidence, source tracking, and user truth distribution. More work upfront, but enables:
- Source trust weighting (Wikidata=0.85, LLM=0.55, gameplay=0.8)
- Confidence-based guessing instead of hard binary filters
- "Kind of" support (0.5 values)
- Contradiction detection with provenance-aware resolution
- Learning from gameplay over time

## Quick Wins From Current Schema

Even without the full graph model, we can improve immediately:
1. ✅ Add confidence scoring to existing attribute JSON (numeric 0-1 instead of binary 0/1)
2. ✅ Track user answers per game (already in `games.history`)
3. ✅ Add `user_truth_distribution` as a new table keyed on (entity_id, attribute_id)
4. ✅ Use gameplay-confirmed answers to boost assertion confidence

---

Full analysis saved alongside plan. Ready when your dataset is.
