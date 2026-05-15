# TARS 20 Questions — Engine Upgrade Plan

## Phase 0: D1 Data Import Tool
**Before we touch the engine, we need a way to load your dataset.**

### A — Character import API
New endpoint: `POST /api/import-characters`
- Accepts JSON array of `{ name, category, description, attributes }`
- Uses `INSERT OR IGNORE` — safe to re-run
- Returns count of new rows added

```typescript
// functions/api/import-characters.ts
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json() as CharacterInput[];
  await ensureGraphTables(env);
  const stmts = body.map(c => env.GAMES_DB.prepare(
    `INSERT OR IGNORE INTO characters (name, category, description, attributes)
     VALUES (?, ?, ?, ?)`
  ).bind(c.name, c.category, c.description, JSON.stringify(c.attributes)));
  const results = await env.GAMES_DB.batch(stmts);
  return json({ imported: results.filter(r => r.success).length });
};
```

### B — Question import API
New endpoint: `POST /api/import-questions`
- Same pattern — bulk insert questions with attribute_key, category, priority

### C — CLI import script
A local script (`scripts/seed-from-json.ts`) that reads a JSON file and POSTs to the API:
```bash
# Usage
npx wrangler pages functions build
node scripts/import-characters.js my-dataset.json
```

**Files to create:**
- `functions/api/import-characters.ts`
- `functions/api/import-questions.ts`
- `scripts/import-from-json.ts` (local runner)

---

## Phase 1: Question Rejection Guard
**Before asking a question, validate it against the game state.**

Add a `validateQuestion()` function in `_game.ts`:

```typescript
function validateQuestion(
  question: { text: string; attributeKey: string },
  session: GameSession,
  candidates: CharacterCandidate[]
): { valid: boolean; reason?: string } {
  // 1. Already asked?
  if (session.history.some(h => h.attributeKey === question.attributeKey))
    return { valid: false, reason: "already asked" };

  // 2. Maps to an attribute candidates have?
  const hasAttr = candidates.some(c => c.attributes[question.attributeKey] !== undefined);
  if (!hasAttr) return { valid: false, reason: "no candidate has this attribute" };

  // 3. Would eliminate all candidates?
  const yesCount = candidates.filter(c => (c.attributes[question.attributeKey] ?? 0) === 1).length;
  const noCount = candidates.length - yesCount;
  if (yesCount === 0 || noCount === 0) return { valid: false, reason: "doesn't split candidates" };

  return { valid: true };
}
```

Apply in `askGraphQuestion()` before returning a question:
```typescript
const bestQuestion = await chooseBestGraphQuestion(env, session, candidates);
if (!bestQuestion) return null;
if (!validateQuestion(bestQuestion, session, candidates).valid) return null;
```

**File to modify:** `functions/api/_game.ts`

---

## Phase 2: Contradiction Detection
**Catch inconsistent answers and ask clarifying questions.**

Add to `ask.ts` (you-think path, after user answers):

```typescript
function detectContradictions(
  session: GameSession,
  candidates: CharacterCandidate[]
): { hasContradiction: boolean; question?: string } {
  const filters = graphFiltersFromHistory(session);
  const remaining = candidates.filter(c =>
    filters.every(f => (c.attributes[f.attributeKey] ?? 0) === f.value)
  );
  // If filtering eliminated ALL candidates, there's a contradiction
  if (remaining.length === 0 && filters.length > 0) {
    return {
      hasContradiction: true,
      question: "That combination doesn't match anything I know. Let me re-check: ${previousQuestion}?"
    };
  }
  return { hasContradiction: false };
}
```

**File to modify:** `functions/api/ask.ts`

---

## Phase 3: Metrics Harness
**Track game quality without building a dashboard.**

Add to `logGame()` — already logs to `games` table. Add a simple analysis endpoint:

New endpoint: `GET /api/stats`
```typescript
// functions/api/stats.ts
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.GAMES_DB.prepare(`
    SELECT mode, COUNT(*) as games,
           AVG(CASE WHEN won THEN 1 ELSE 0 END) * 100 as win_rate,
           AVG(questions_used) as avg_questions
    FROM games GROUP BY mode
  `).all();
  return json(results);
};
```

**File to create:** `functions/api/stats.ts`

---

## Phase 4: Confidence-Based Guessing
**Replace `MIN_GRAPH_QUESTIONS_BEFORE_GUESS = 10` with a confidence threshold.**

```typescript
const GUESS_CONFIDENCE_THRESHOLD = 0.75;
const MAX_QUESTIONS_FORCED_GUESS = 18;  // Must guess by 18 if confident enough

function shouldGuess(candidates: CharacterCandidate[], questionsAsked: number): boolean {
  if (candidates.length === 0) return true;  // Nothing left, guess anyway
  if (candidates.length === 1) return true;  // Only one candidate
  if (questionsAsked >= MAX_QUESTIONS_FORCED_GUESS) return true;

  // Confidence = 1 - (candidate_count_ratio)
  // When few candidates remain, confidence is high
  const confidence = 1 - (candidates.length / 103);  // 103 = total characters
  return confidence >= GUESS_CONFIDENCE_THRESHOLD;
}
```

**File to modify:** `functions/api/_game.ts`

---

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `functions/api/import-characters.ts` | **New** | Bulk character upload |
| `functions/api/import-questions.ts` | **New** | Bulk question upload |
| `functions/api/stats.ts` | **New** | Game metrics endpoint |
| `scripts/import-from-json.ts` | **New** | CLI runner for imports |
| `functions/api/_game.ts` | Modify | Question rejection, confidence guessing |
| `functions/api/ask.ts` | Modify | Contradiction detection |

---

## Order of Execution
1. **Phase 0** (import tools) — so you can load your dataset immediately
2. **Phase 1** (question rejection) — quick win, prevents wasted turns
3. **Phase 2** (contradiction detection) — handles edge cases
4. **Phase 3** (metrics) — measure if changes help
5. **Phase 4** (confidence guessing) — smarter guess timing

---

**Paused for review.** Ready when your dataset is.
