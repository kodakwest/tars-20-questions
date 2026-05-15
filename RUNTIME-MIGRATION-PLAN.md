# Runtime Migration: Old Engine → New Schema

**Prerequisite:** Tag `pre-migration-v1` marks the state before this work begins.
**Context saved:** This plan is the handoff for the next session.

## Goal
Swap the live game engine (`_game.ts`, `ask.ts`, `confirm-guess.ts`, `guess.ts`) from the old `characters`/`questions` tables to the new schema (`entities`, `attribute_assertions`, `attributes`, `question_templates`).

## No-Go: Don't touch the frontend
The frontend (`useGame.ts`, `GameBoard.tsx`, etc.) doesn't change — only the backend API functions.

## What Must Change

### 1. `functions/api/_game.ts` — Core engine

Current: reads `characters` table (id, name, category, description, attributes JSON blob) and `questions` table.
New: reads `entities`, `attribute_assertions`, `attributes`, `question_templates`.

Key types to update:
- `GameSession.character` → keep as string (the entity name), but resolve from `entities` table
- `GameSession.category` → keep as-is
- The `DEFAULT_GRAPH_CHARACTERS` and `DEFAULT_GRAPH_QUESTIONS` constants can be deprecated — data comes from new tables now

Key functions to rewrite:
- `ensureGraphTables()` → create new tables if not exist, seed from new schema defaults
- `getGraphCandidates()` → query `entities` + `attribute_assertions` instead of `characters` + JSON parse
- `chooseBestGraphQuestion()` → query `attribute_assertions` for actual yes/no/kind_of distributions instead of binary attribute JSON
- `answerToBinary()` → needs to handle `kind_of` as 0.5 (soft), not just 0 or 1
- `graphFiltersFromHistory()` → use new assertion value model

### 2. `functions/api/ask.ts` — you-think question loop
- The `answerToBinary()` logic for filtering candidates needs to account for `kind_of` answers
- Contradiction detection should use new schema (already planned in Phase 2 of engine plan)

### 3. `functions/api/confirm-guess.ts`
- `logGame()` already writes to `games` table — that's fine
- May need to also write observations to `game_observations` for learning

## New Engine Architecture

```
Entity Graph (attribute_assertions):
  entity_id | attribute_id | value | numeric_value | confidence

Instead of:
  characters.attributes = '{"fictional":1,"male":1}'
```

The engine should:
1. Load entities by domain → build candidate set
2. For each candidate, load all attribute assertions → build attribute profile
3. For question selection, compute entropy across ACTUAL value distributions (including kind_of), not just binary splits
4. When filtering, support soft filtering (kind_of matches both yes and no partially)
5. Track contradictions explicitly using the new schema's assertion provenance

## Migration Strategy

**Phase A — Parallel read (safe, no downtime)**
1. Add new table reads alongside old reads
2. Compare results in tests
3. Verify simulation metrics match between old and new paths

**Phase B — Cutover**
1. Remove old `characters`/`questions` table reads
2. Remove `DEFAULT_GRAPH_CHARACTERS` and `DEFAULT_GRAPH_QUESTIONS` fallback code
3. Run `simulate-games.ts` against new path → verify metrics

**Phase C — Cleanup**
1. Drop old tables if no rollback needed
2. Update `ensureGraphTables()` to only create new-style tables

## Files to Modify
- `functions/api/_game.ts` — major rewrite of graph functions
- `functions/api/ask.ts` — adjust answer handling
- `functions/api/confirm-guess.ts` — add game_observations logging (bonus)
- `functions/api/guess.ts` — verify it still works with new types
- `functions/api/new-game.ts` — verify session creation

## Files NOT to Touch
- `src/` (frontend) — unchanged
- `scripts/` — already migrated
- `src/dataset/` — already using new schema
- `migrations/` — tables already exist

## Rollback
```bash
git checkout pre-migration-v1
npx wrangler pages deploy dist --project-name tars-20q --branch main
```

## Verification Before Cutover
```bash
# 1. Run simulation against BOTH old and new paths
npx tsx scripts/simulate-games.ts --games 500 --json > old-metrics.json
# ...after Phase A parallel read...
npx tsx scripts/simulate-games.ts --games 500 --json > new-metrics.json
# Compare: win rate, avg questions, contradiction rate should be similar or better

# 2. Run validation on new dataset
npx tsx scripts/validate-dataset.ts --json

# 3. Manual playtest: 3 games each mode
```

## Key Risks
- `kind_of` support changes candidate filtering behavior — may need a toggle during Phase A
- Performance: new schema has JOINs instead of JSON.parse — should be faster but needs measurement
- The old `DEFAULT_GRAPH_CHARACTERS` seed data (85 characters) won't be in the new schema initially — need to either migrate it or accept that new builds overwrite it
