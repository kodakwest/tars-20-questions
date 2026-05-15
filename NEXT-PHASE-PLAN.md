# TARS 20 Questions — Next Phase Plan

## Problem: Questions wasted on category discovery

Currently, "You Think" mode starts without knowing if the user is thinking of a character, object, or place. The first 4-6 questions go to establishing this ("Is it fictional?", "Is it a character?", "Is it an object?", "Is it a place?"). With only 20 questions total, that's 20-30% of the budget burned before meaningful narrowing begins.

## Phase A: Category Selection Before Start

Add a category picker to StartScreen when in "You Think" mode. The user picks one of: Character, Object, Place.

### Frontend changes (`src/components/StartScreen.tsx`)
- When mode is "you-think", show a category selector below the mode toggle
- Three pill buttons: Character, Object, Place
- Default: none selected (user must pick one to start)
- Pass `category` to `onStart(mode, category)`

### API changes (`functions/api/start.ts` or existing start flow)
- Accept `category` parameter in the create session API call
- Pass it to `createSession(env, mode, category)` which already supports categories
- The domain filter in `getGraphCandidates` will then only query that category's entities

### Game state (`src/hooks/useGame.ts`)
- Accept `category` in the start function
- Send category with the start API call
- Restore category from saved game on resume

### Edge cases
- Saved game resume: category was already set, skip picker
- Category has no entities in DB: fall back to general "thing" query
- User changes mode from "you-think" to "ai-thinks": hide category picker, clear selection
- Category not selected: "Tap to Begin" disabled until picked

### Files to modify
- `src/components/StartScreen.tsx` — add category pills
- `src/hooks/useGame.ts` — pass category through start API call
- `functions/api/start.ts` (or `_game.ts` session creation) — accept category param
- `src/types.ts` — add `Category` type if needed

## Phase B: Import More Knowledge Graph Data

Current entities are limited. Need to expand for better coverage across all three categories.

### Approach
- Use the existing dataset pipeline (`scripts/build-dataset.ts`)
- Expand Wikidata SPARQL queries to pull more entities per category
- Run `dataset:build` to fetch, enrich, and upsert
- Run `dataset:validate` to verify quality
- Run `dataset:simulate` to verify win rate

### Target counts
- Characters: 50+ (current, expand to 100+)
- Objects: 30+ (current, expand to 100+)
- Places: 20+ (current, expand to 50+)

### Files to modify
- `src/dataset/seed-config.ts` — expand seed queries
- `scripts/build-dataset.ts` — if query limits need adjustment

### Edge cases
- Wikidata SPARQL rate limits: add query delays
- Entity enrichment LLM calls: monitor cost
- Duplicate entities: handled by ON CONFLICT upsert
- Entities with no attributes: filtered out by validation

## Phase C: TARS Animated Avatar Design (Proofs)

See separate spec — Codex dispatched to create standalone HTML design concept showing all avatar states with CSS animations.

### States to concept
1. **idle** — soft scan line, subtle pulse
2. **thinking** — rotating orbit nodes, brightness ramp
3. **speaking** — voice bars, active glow
4. **listening** — microphone pulse ring
5. **guessing** — charge-up sweep, tension
6. **celebrating** — burst animation
7. **commiserating** — dim flicker

### Delivery
- Standalone HTML file at `/mnt/s/Projects/tars-20-questions/design/avatar-states.html`
- Dark theme, matches existing color palette (--color-signal, --color-warning, --color-danger)
- All states toggleable via buttons or cycle
- CSS-only animations (no JS animation libs)
- Mobile viewport tested

## Deployment Order

1. **Phase A first** — biggest gameplay impact, smallest code change (~4 files)
2. **Phase C next** — user-facing visual polish, independent of Phase B
3. **Phase B last** — data work, can run in parallel with other work

## Acceptance Criteria

- Category selection saves 4-6 questions per game
- "You Think" games consistently identify the thing with 3+ questions to spare
- Avatar design approved before implementation begins
- Knowledge graph has 250+ entities across 3 categories
- `npm run check` passes, `npm run build` passes
