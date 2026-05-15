export type Env = {
  AI: {
    run: (model: string, input: unknown) => Promise<unknown>;
  };
  GAMES_DB: D1Database;
  tars_sessions: KVNamespace;
  LLM_MODEL?: string;
  TTS_MODEL?: string;
};

export type HistoryItem = {
  question: string;
  answer: string;
  attributeKey?: string;
};

export type GameMode = "ai-thinks" | "you-think";

export type GameSession = {
  sessionId: string;
  mode: GameMode;
  character: string;
  category: string;
  domain: string;
  history: HistoryItem[];
  questionsLeft: number;
  gameOver: boolean;
  won: boolean;
  tarsMemory?: string;
  actualAnswer?: string;
  finalGuess?: string;
};

const MAX_QUESTIONS = 20;
const LLM_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const TTS_MODEL = "@cf/deepgram/aura-2-en";
const TARS_PERSONA = "You are TARS. Dry, dark humor. Short answers. Clipped. Efficient. Never use 'Q:' or 'A:' format.";

const AI_THINKS_CHARACTERS = [
  "Ellen Ripley",
  "Sherlock Holmes",
  "Princess Leia",
  "Indiana Jones",
  "Hermione Granger",
  "James Bond",
  "Katniss Everdeen",
  "Luke Skywalker",
  "Darth Vader",
  "Wonder Woman",
  "Tony Stark",
  "Spider-Man",
  "Batman",
  "Frodo Baggins",
  "Wednesday Addams",
  "Jean-Luc Picard",
  "Sarah Connor",
  "Rocky Balboa",
  "Mulan",
  "Willy Wonka"
];

const YOU_THINK_CATEGORIES = ["character", "object", "place"];
const GRAPH_GUESS_THRESHOLD = 3;
const MIN_GRAPH_QUESTIONS_BEFORE_GUESS = 10;

type EntityRow = {
  id: string;
  canonical_name: string;
  domain: string;
  description: string | null;
};

type AssertionRow = {
  entity_id: string;
  attribute_id: string;
  attribute_key: string;
  value: string;
  numeric_value: number | null;
  confidence: number;
};

type EntityCandidate = EntityRow & {
  name: string;
  attributes: Record<string, number>;
};

type QuestionRow = {
  id: string;
  text: string;
  attribute_key: string;
  category: string | null;
  priority: number | null;
};

type GraphQuestionResult = {
  text: string;
  attributeKey?: string;
  finalGuess?: string;
};

const DEFAULT_GRAPH_QUESTIONS: Array<{ text: string; attributeKey: string; category?: string; priority: number }> = [
  { text: "Is it fictional?", attributeKey: "is_fictional", priority: 100 },
  { text: "Is it real?", attributeKey: "is_real", priority: 98 },
  { text: "Is it human?", attributeKey: "is_human", category: "character", priority: 95 },
  { text: "Is it a character?", attributeKey: "is_character", category: "character", priority: 90 },
  { text: "Is it an object?", attributeKey: "is_object", category: "object", priority: 90 },
  { text: "Is it a place?", attributeKey: "is_place", category: "place", priority: 90 },
  { text: "Is it from a movie?", attributeKey: "from_movie", priority: 75 },
  { text: "Is it from a video game?", attributeKey: "from_video_game", priority: 74 },
  { text: "Is it from a book?", attributeKey: "from_book", priority: 73 },
  { text: "Is it from TV?", attributeKey: "from_tv", priority: 72 },
  { text: "Is it from a comic book?", attributeKey: "from_comic", priority: 71 },
  { text: "Does it involve magic or supernatural powers?", attributeKey: "is_supernatural", priority: 64 },
  { text: "Is it from a science fiction setting?", attributeKey: "is_scifi", priority: 63 },
  { text: "Is it from a fantasy setting?", attributeKey: "is_fantasy", priority: 62 },
  { text: "Is it animated?", attributeKey: "is_animated", priority: 60 },
  { text: "Is it an animal?", attributeKey: "is_animal", priority: 53 },
  { text: "Is it food or drink?", attributeKey: "is_food_or_drink", category: "object", priority: 52 },
  { text: "Is it a tool or device?", attributeKey: "is_tool_or_device", category: "object", priority: 51 },
  { text: "Is it a natural place?", attributeKey: "is_natural_place", category: "place", priority: 50 },
  { text: "Is it a city or settlement?", attributeKey: "is_city_or_settlement", category: "place", priority: 49 }
];


export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

export async function readBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function createSession(env: Env, mode: GameMode = "ai-thinks", category = "something") {
  const sessionId = crypto.randomUUID();
  const safeMode: GameMode = mode === "you-think" ? "you-think" : "ai-thinks";
  const character = AI_THINKS_CHARACTERS[Math.floor(Math.random() * AI_THINKS_CHARACTERS.length)];
  const safeCategory = YOU_THINK_CATEGORIES.includes(category) ? category : "character, object, or place";
  const session: GameSession = {
    sessionId,
    mode: safeMode,
    character,
    category: safeMode === "you-think" ? safeCategory : "",
    domain: safeMode === "you-think" ? normalizeCategory(safeCategory) : "",
    history: [],
    questionsLeft: MAX_QUESTIONS,
    gameOver: false,
    won: false
  };
  await env.tars_sessions.put(sessionId, JSON.stringify(session), { expirationTtl: 1800 }); // 30 min
  return session;
}

export async function getSession(env: Env, sessionId: unknown): Promise<GameSession | null> {
  if (typeof sessionId !== "string") return null;
  try {
    const raw = await env.tars_sessions.get(sessionId);
    if (!raw) return null;
    const session = JSON.parse(raw) as GameSession;
    return {
      ...session,
      mode: session.mode ?? "ai-thinks",
      category: session.category ?? "",
      domain: session.domain ?? normalizeCategory(session.category ?? ""),
      tarsMemory: session.tarsMemory ?? "",
      actualAnswer: session.actualAnswer ?? undefined,
      finalGuess: session.finalGuess ?? undefined
    };
  } catch {
    return null;
  }
}

async function saveSession(env: Env, session: GameSession) {
  await env.tars_sessions.put(session.sessionId, JSON.stringify(session), { expirationTtl: 1800 });
}

export async function getTarsMemory(env: Env): Promise<string> {
  if (!env.GAMES_DB) return "";

  try {
    const { results } = await env.GAMES_DB.prepare(
      `SELECT mode, character, won, questions_used, history, created_at
       FROM games
       ORDER BY created_at DESC
       LIMIT 15`
    ).all();

    if (!results || results.length === 0) return "";

    const prompt = `You are TARS reviewing past 20 Questions games with a player.
A one-sentence observation about these games. Data only, no psychoanalysis. Dry and brief.
No character analysis. Do not latch onto a single repeated phrase. Here are the last ${results.length} games:

${results
  .map(
    (r: any, i: number) =>
      `Game ${i + 1}: mode=${r.mode}, character=${r.character || "N/A"}, won=${r.won ? "Yes" : "No"}, questions=${r.questions_used}`
  )
  .join("\n")}

Your memory summary (one sentence, observational only):`;

    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        { role: "system", content: "You are TARS. You have a dry, deadpan delivery. Summarize briefly." },
        { role: "user", content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.5
    });

    const memory = extractText(response);
    return memory
      ? `\n\nPast games context: ${memory}`
      : "";
  } catch {
    return "";
  }
}

function historyText(session: GameSession) {
  if (session.history.length === 0) return "No questions asked yet.";
  return session.history.map((item, index) => `[${index + 1}] ${item.question} → ${item.answer || "Pending"}`).join("\n");
}

export async function answerQuestion(env: Env, session: GameSession, question: string) {
  const prompt = `${TARS_PERSONA}
Your secret: ${session.character}

Short answers only: "Yes." "No." "Kind of." "Sort of." "Not exactly." "Correct." "Incorrect."
You may add ONE short quip. No explanations. No apologies.

HISTORY: ${historyText(session)}${session.tarsMemory || ""}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: question }
    ],
    max_tokens: 60,
    temperature: 0.7
  });

  return extractText(response) || fallbackAnswer(question);
}

export async function askYouThinkQuestion(env: Env, session: GameSession, latestAnswer?: string) {
  const graphQuestion = await askGraphQuestion(env, session, latestAnswer);
  if (graphQuestion) return graphQuestion;

  const prompt = `${TARS_PERSONA}
You are playing 20 Questions in reverse. The user picked a ${session.category || "thing"}.

Rules:
- Ask ONE yes/no question at a time.
- Do not repeat questions.
- Keep it under 15 words, plus one short quip if useful.
- Sound conversational, not like a form.

History:
${historyText(session)}

Latest answer: ${latestAnswer || "Ready."}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: "Your turn." }
    ],
    max_tokens: 60,
    temperature: 0.8
  });

  const text = extractText(response);
  if (text) {
    return { text };
  }

  return {
    text: "Is it fictional? My probability net wants an easy warm-up.",
    attributeKey: "fictional"
  };
}

export async function guessYouThinkAnswer(env: Env, session: GameSession) {
  const candidates = await getGraphCandidates(env, session);
  const candidateNames = candidates.map(c => `${c.name} (${c.domain || "unknown"})`).join(", ");
  const prompt = `${TARS_PERSONA}
You are playing 20 Questions in reverse. Make a final guess from these remaining candidates.

Remaining candidates in the database: ${candidateNames || "General knowledge"}

Rules:
- If several candidates are brands or models of the same general thing (e.g. different wireless headset brands), guess the general thing -- NOT a specific brand.
- Only guess a specific brand/model if the user's answers clearly point to it (they said "yes" to brand-specific questions).
- If the remaining candidates are diverse (not sub-types of the same thing), pick the most likely one.
- Start with the guess. One dry line.

History:
${historyText(session)}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: "Make your final guess." }
    ],
    max_tokens: 60,
    temperature: 0.7
  });

  const guess = extractText(response) || "A toaster. My confidence is low, but my delivery remains excellent.";
  return verifyGraphGuess(guess, candidates);
}

export async function hasViableGraphCandidates(env: Env, session: GameSession) {
  return (await getGraphCandidates(env, session)).length > 0;
}

async function askGraphQuestion(env: Env, session: GameSession, latestAnswer?: string): Promise<GraphQuestionResult | null> {
  const candidates = await getGraphCandidates(env, session);
  if (candidates.length === 0) return null;
  const answeredGraphQuestions = countAnsweredGraphQuestions(session);
  const canGuess = answeredGraphQuestions >= MIN_GRAPH_QUESTIONS_BEFORE_GUESS;

  if (canGuess && candidates.length <= 1) {
    const guess = await phraseGraphGuess(env, session, candidates[0]);
    return { text: guess, finalGuess: candidates[0].name };
  }

  if (canGuess && candidates.length <= GRAPH_GUESS_THRESHOLD) {
    const guess = await guessYouThinkAnswer(env, session);
    return { text: guess, finalGuess: extractGuessName(guess) || candidates[0].name };
  }

  const bestQuestion = await chooseBestGraphQuestion(env, session, candidates);
  if (!bestQuestion) return null;

  const text = await phraseGraphQuestion(env, session, bestQuestion, candidates.length, latestAnswer);
  return { text, attributeKey: bestQuestion.attribute_key };
}

async function getGraphCandidates(env: Env, session: GameSession): Promise<EntityCandidate[]> {
  if (!env.GAMES_DB) return [];

  try {
    await ensureGraphTables(env);
    const domain = normalizeCategory(session.domain || session.category);
    const { results } = await env.GAMES_DB.prepare(
      `SELECT e.id, e.canonical_name, e.domain, e.description
       FROM entities e
       WHERE e.domain = ? OR ? = ''
       ORDER BY e.canonical_name`
    )
      .bind(domain, domain)
      .all<EntityRow>();

    const filters = graphFiltersFromHistory(session);
    const candidates = await Promise.all((results || []).map((row) => toCandidate(env, row)));

    return candidates
      .filter((candidate): candidate is EntityCandidate => Boolean(candidate))
      .filter((candidate) => filters.every((filter) => assertionMatchesAnswer(candidate.attributes[filter.attributeKey], filter.value)));
  } catch {
    return [];
  }
}

async function chooseBestGraphQuestion(env: Env, session: GameSession, candidates: EntityCandidate[]) {
  const asked = new Set(session.history.map((item) => item.attributeKey).filter(Boolean));
  const domain = normalizeCategory(session.domain || session.category);
  const candidateIds = candidates.map((candidate) => candidate.id);
  if (candidateIds.length === 0) return null;

  const placeholders = candidateIds.map(() => "?").join(", ");
  const { results: distributionRows } = await env.GAMES_DB.prepare(
    `SELECT a.key AS attribute_key,
       SUM(CASE WHEN aa.value = 'yes' THEN 1 ELSE 0 END) AS yes_count,
       SUM(CASE WHEN aa.value = 'no' THEN 1 ELSE 0 END) AS no_count,
       SUM(CASE WHEN aa.value = 'kind_of' THEN 1 ELSE 0 END) AS kind_of_count
     FROM attribute_assertions aa
     JOIN attributes a ON aa.attribute_id = a.id
     WHERE aa.entity_id IN (${placeholders})
       AND aa.value IN ('yes', 'no', 'kind_of')
     GROUP BY a.key`
  )
    .bind(...candidateIds)
    .all<{ attribute_key: string; yes_count: number; no_count: number; kind_of_count: number }>();

  const distributions = new Map(
    (distributionRows || []).map((row) => [
      row.attribute_key,
      {
        yes: Number(row.yes_count || 0),
        no: Number(row.no_count || 0),
        kindOf: Number(row.kind_of_count || 0)
      }
    ])
  );

  const statement = env.GAMES_DB.prepare(
    `SELECT qt.id, qt.template AS text, a.key AS attribute_key, a.applies_to AS category, qt.quality_score AS priority
     FROM question_templates qt
     JOIN attributes a ON qt.attribute_id = a.id
     WHERE ? = ''
       OR a.applies_to = '[]'
       OR a.applies_to LIKE ?
     ORDER BY qt.quality_score DESC, qt.id ASC`
  );
  const { results } = await statement.bind(domain, `%"${domain}"%`).all<QuestionRow>();

  let best: QuestionRow | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const question of results || []) {
    if (asked.has(question.attribute_key)) continue;
    const distribution = distributions.get(question.attribute_key);
    if (!distribution) continue;

    const yesWeight = distribution.yes + distribution.kindOf * 0.5;
    const noWeight = distribution.no + distribution.kindOf * 0.5;
    if (yesWeight <= 0 || noWeight <= 0) continue;

    const score = entropy(yesWeight, noWeight) + Number(question.priority || 0) / 100;
    if (score > bestScore) {
      best = question;
      bestScore = score;
    }
  }

  return best;
}

async function phraseGraphQuestion(
  env: Env,
  session: GameSession,
  question: QuestionRow,
  _candidateCount: number,
  latestAnswer?: string
) {
  try {
    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: `${TARS_PERSONA}
You are playing 20 Questions in reverse. Ask a natural yes/no question to narrow down what the player is thinking of.
You need to figure out: ${question.text}
Narrow it down.
History: ${historyText(session)}
Keep it under 15 words plus one short dry quip.`
        },
        {
          role: "user",
          content: `Latest answer: ${latestAnswer || "Ready."}
Ask the next question.`
        }
      ],
      max_tokens: 60,
      temperature: 0.7
    });

    return extractText(response) || question.text;
  } catch {
    return question.text;
  }
}

async function phraseGraphGuess(env: Env, session: GameSession, candidate: EntityCandidate) {
  try {
    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: `${TARS_PERSONA}
You are making a 20 Questions guess. The database has narrowed to one candidate, but that candidate may be a specific model or brand of a more general thing the user has in mind.

Rules:
- If the candidate is a specific model, brand, or variant (e.g. "SteelSeries Arctis Nova Pro Wireless"), check if a more general category would be a better guess.
- If the user's answers don't specifically point to a brand (they never said "yes" to brand-specific questions), guess the general category (e.g. "wireless gaming headset", not "SteelSeries Arctis").
- If the user answered "yes" to specific brand/model questions, go with the specific name.
- The candidate is already generic (e.g. "headset", "chair"), guess it as-is.
- Start with the guess. One dry line.`
        },
        {
          role: "user",
          content: `Database candidate: ${candidate.name} (${candidate.domain || "unknown"})
Description: ${candidate.description || "No dossier."}
History:
${historyText(session)}

Your guess:`
        }
      ],
      max_tokens: 60,
      temperature: 0.6
    });

    return extractText(response) || `Final guess: ${candidate.name}. The database has spoken. Mildly ominous.`;
  } catch {
    return `Final guess: ${candidate.name}. The database has spoken. Mildly ominous.`;
  }
}

async function ensureGraphTables(env: Env) {
  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS dataset_versions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      source_summary TEXT,
      entity_count INTEGER NOT NULL,
      assertion_count INTEGER NOT NULL,
      question_count INTEGER NOT NULL,
      validation_status TEXT NOT NULL,
      validation_report_json TEXT,
      notes TEXT
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      domain TEXT NOT NULL,
      description TEXT,
      popularity_prior REAL DEFAULT 0.5,
      source_refs_json TEXT DEFAULT '{}',
      dataset_version_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS aliases (
      entity_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      source TEXT,
      PRIMARY KEY (entity_id, alias)
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      parent_id TEXT,
      source_refs_json TEXT DEFAULT '{}'
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS entity_categories (
      entity_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      PRIMARY KEY (entity_id, category_id)
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS attributes (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      applies_to TEXT NOT NULL DEFAULT '[]',
      answer_type TEXT DEFAULT 'yes_no_kind_of',
      ambiguity_risk TEXT DEFAULT 'low'
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS attribute_assertions (
      entity_id TEXT NOT NULL,
      attribute_id TEXT NOT NULL,
      value TEXT NOT NULL,
      numeric_value REAL,
      confidence REAL DEFAULT 0.5,
      source_type TEXT NOT NULL,
      source_refs_json TEXT DEFAULT '{}',
      review_status TEXT DEFAULT 'unreviewed',
      user_truth_distribution_json TEXT,
      dataset_version_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_id, attribute_id, source_type)
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS question_templates (
      id TEXT PRIMARY KEY,
      attribute_id TEXT NOT NULL,
      template TEXT NOT NULL,
      ask_stage TEXT DEFAULT '["mid_game"]',
      quality_score REAL DEFAULT 0.5
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS game_observations (
      game_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      entity_id TEXT,
      attribute_id TEXT,
      user_answer TEXT,
      confidence_before REAL,
      confidence_after REAL,
      PRIMARY KEY (game_id, turn_number)
    )`
  ).run();

  const attributeStatements = DEFAULT_GRAPH_QUESTIONS.map((question) =>
    env.GAMES_DB.prepare(
      `INSERT OR IGNORE INTO attributes (id, key, display_name, applies_to, answer_type, ambiguity_risk)
       VALUES (?, ?, ?, ?, 'yes_no_kind_of', 'low')`
    ).bind(`attr:${question.attributeKey}`, question.attributeKey, attributeDisplayName(question.attributeKey), JSON.stringify(question.category ? [question.category] : []))
  );
  await env.GAMES_DB.batch(attributeStatements);

  const { results } = await env.GAMES_DB.prepare(`SELECT COUNT(*) AS count FROM question_templates`).all<{ count: number }>();
  if ((results?.[0]?.count || 0) > 0) return;

  const statements = DEFAULT_GRAPH_QUESTIONS.map((question) =>
    env.GAMES_DB.prepare(
      `INSERT OR IGNORE INTO question_templates (id, attribute_id, template, ask_stage, quality_score)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      `qt:${question.attributeKey}:fallback`,
      `attr:${question.attributeKey}`,
      question.text,
      JSON.stringify(["mid_game"]),
      question.priority / 100
    )
  );
  await env.GAMES_DB.batch(statements);
}

function graphFiltersFromHistory(session: GameSession) {
  return session.history
    .map((item) => {
      if (!item.attributeKey || !item.answer) return null;
      const value = answerToNumeric(item.answer);
      return value === null ? null : { attributeKey: item.attributeKey, value };
    })
    .filter((filter): filter is { attributeKey: string; value: number } => Boolean(filter));
}

function countAnsweredGraphQuestions(session: GameSession) {
  return session.history.filter((item) => item.attributeKey && item.answer).length;
}

export function answerToNumeric(answer: string) {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "yes") return 1;
  if (normalized === "kind of" || normalized === "sort of") return 0.5;
  if (normalized === "no" || normalized === "not exactly") return 0;
  return null;
}

async function toCandidate(env: Env, row: EntityRow): Promise<EntityCandidate | null> {
  const { results } = await env.GAMES_DB.prepare(
    `SELECT aa.entity_id, aa.attribute_id, a.key AS attribute_key, aa.value, aa.numeric_value, aa.confidence
     FROM attribute_assertions aa
     JOIN attributes a ON aa.attribute_id = a.id
     WHERE aa.entity_id = ?
       AND aa.value != 'unknown'`
  )
    .bind(row.id)
    .all<AssertionRow>();

  const attributes = Object.fromEntries(
    (results || [])
      .map((assertion) => [assertion.attribute_key, assertion.numeric_value ?? assertionValueToNumeric(assertion.value)])
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );

  return {
    ...row,
    name: row.canonical_name,
    attributes
  };
}

function assertionValueToNumeric(value: string) {
  if (value === "yes") return 1;
  if (value === "kind_of") return 0.5;
  if (value === "no") return 0;
  return null;
}

function assertionMatchesAnswer(assertionValue: number | undefined, answerValue: number) {
  if (answerValue === 0.5) return assertionValue === 1 || assertionValue === 0.5;
  if (answerValue === 1) return assertionValue === 1 || assertionValue === 0.5;
  return assertionValue === 0 || assertionValue === undefined;
}

function entropy(yesWeight: number, noWeight: number) {
  const total = yesWeight + noWeight;
  if (total <= 0) return 0;
  const yesProbability = yesWeight / total;
  const noProbability = noWeight / total;
  return [yesProbability, noProbability].reduce((sum, probability) => {
    if (probability <= 0) return sum;
    return sum - probability * Math.log2(probability);
  }, 0);
}

function attributeDisplayName(attributeKey: string) {
  return attributeKey
    .replace(/^is_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  if (normalized === "character" || normalized === "object" || normalized === "place") return normalized;
  if (normalized.includes("character") && normalized.includes("object") && normalized.includes("place")) return "";
  return "";
}

function extractGuessName(guess: string) {
  const match = guess.match(/final guess:\s*([^.!?\n]+)/i);
  if (match?.[1]) return match[1].trim();
  return guess.split(/[.!?\n]/)[0]?.trim();
}

function verifyGraphGuess(guess: string, candidates: EntityCandidate[]) {
  if (candidates.length === 0) return guess;

  const guessedName = normalize(extractGuessName(guess) || "");
  if (!guessedName) return guess;
  const verified = candidates.find((candidate) => {
    const candidateName = normalize(candidate.name);
    return candidateName === guessedName || candidateName.includes(guessedName) || guessedName.includes(candidateName);
  });
  if (!verified) return guess;

  const trailing = guess.replace(/^final guess:\s*/i, "").replace(new RegExp(`^${escapeRegExp(extractGuessName(guess) || "")}\\s*`, "i"), "").trim();
  return trailing ? `${verified.name} ${trailing}` : verified.name;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function logGame(env: Env, session: GameSession) {
  if (!env.GAMES_DB) return;

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      character TEXT,
      category TEXT,
      won BOOLEAN NOT NULL,
      questions_used INTEGER NOT NULL,
      total_questions INTEGER NOT NULL DEFAULT 20,
      history TEXT NOT NULL,
      voice_mode_used BOOLEAN DEFAULT false,
      created_at TEXT NOT NULL
    )`
  ).run();

  const questionsUsed = Math.max(0, MAX_QUESTIONS - session.questionsLeft);
  const character = session.mode === "you-think" ? session.actualAnswer ?? session.finalGuess ?? "" : session.character;

  await env.GAMES_DB.prepare(
    `INSERT OR REPLACE INTO games (
      id,
      mode,
      character,
      category,
      won,
      questions_used,
      total_questions,
      history,
      voice_mode_used,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      session.sessionId,
      session.mode,
      character,
      session.mode === "you-think" ? session.category : "",
      session.won ? 1 : 0,
      questionsUsed,
      MAX_QUESTIONS,
      JSON.stringify(session.history),
      0,
      new Date().toISOString()
    )
    .run();
}

export async function tts(env: Env, text: string) {
  try {
    const response = await env.AI.run(env.TTS_MODEL ?? TTS_MODEL, { text });
    return extractAudio(response);
  } catch {
    return "";
  }
}

export function isCorrectGuess(guess: string, character: string) {
  return normalize(guess) === normalize(character);
}

export function lossMessage(session: GameSession) {
  return `That was question twenty. The character was ${session.character}. I would say this was close, but my honesty setting is unfortunately enabled.`;
}

export function greeting(session?: GameSession) {
  if (session?.mode === "you-think") {
    return "Think of a character, object, or place. Lock it in your skull vault, then hit ready. I will ask the questions. Disturbing, but efficient.";
  }
  return "I am TARS. I have selected a character. You have twenty yes-or-no questions and one fragile human ego. Begin.";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractText(response: unknown): string {
  if (typeof response === "string") return response.trim();
  if (!response || typeof response !== "object") return "";
  const record = response as Record<string, unknown>;
  const candidates = [record.response, record.result, record.text, record.output];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function extractAudio(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const record = response as Record<string, unknown>;
  const candidates = [record.audio, record.audioBase64, record.result, record.response];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "";
}

function fallbackAnswer(question: string) {
  const lower = question.toLowerCase();
  if (lower.startsWith("is ") || lower.startsWith("are ") || lower.startsWith("was ")) {
    return "Unknown. My higher reasoning module is temporarily admiring its own reflection.";
  }
  return "Ask that as a yes-or-no question. I have limits, even if they are mostly your fault.";
}

// Re-export for use in handler files
export { saveSession };
