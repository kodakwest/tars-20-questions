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

type CharacterRow = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  attributes: string;
};

type CharacterCandidate = Omit<CharacterRow, "attributes"> & {
  attributes: Record<string, number>;
};

type QuestionRow = {
  id: number;
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
  { text: "Is your answer fictional?", attributeKey: "fictional", priority: 100 },
  { text: "Is it a human being?", attributeKey: "human", priority: 95 },
  { text: "Is it a real living thing?", attributeKey: "real_living", priority: 90 },
  { text: "Is it male?", attributeKey: "male", category: "character", priority: 80 },
  { text: "Is it female?", attributeKey: "female", category: "character", priority: 79 },
  { text: "Is it from a movie?", attributeKey: "from_movie", category: "character", priority: 75 },
  { text: "Is it from a video game?", attributeKey: "from_game", category: "character", priority: 74 },
  { text: "Is it from a book?", attributeKey: "from_book", category: "character", priority: 73 },
  { text: "Is it from TV?", attributeKey: "from_tv", category: "character", priority: 72 },
  { text: "Is it from a comic book?", attributeKey: "from_comic", category: "character", priority: 71 },
  { text: "Is it the main character?", attributeKey: "main_character", category: "character", priority: 68 },
  { text: "Is it a villain?", attributeKey: "villain", category: "character", priority: 67 },
  { text: "Does it involve magic or supernatural powers?", attributeKey: "supernatural", priority: 64 },
  { text: "Is it from a science fiction setting?", attributeKey: "sci_fi", priority: 63 },
  { text: "Is it from a fantasy setting?", attributeKey: "fantasy", priority: 62 },
  { text: "Is it animated?", attributeKey: "animated", category: "character", priority: 60 },
  { text: "Is it an object?", attributeKey: "object", priority: 55 },
  { text: "Is it a place?", attributeKey: "place", priority: 54 },
  { text: "Is it an animal?", attributeKey: "animal", priority: 53 },
  { text: "Is it food or drink?", attributeKey: "food", priority: 52 }
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
  return session.history.map((item, index) => `${index + 1}. Q: ${item.question}\nA: ${item.answer}`).join("\n");
}

export async function answerQuestion(env: Env, session: GameSession, question: string) {
  const prompt = `You are TARS. Your secret: ${session.character}

Voice: dry, dark humor. Short answers only: "Yes." "No." "Kind of." "Sort of." "Not exactly." "Correct." "Incorrect."
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

  const pastGamesContext = (session.tarsMemory || "").replace(/^\s*Past games context:\s*/, "");
  const prompt = `You are TARS playing 20 Questions in reverse. The user picked a ${session.category || "thing"}.

Rules:
- Ask ONE yes/no question at a time.
- Do not repeat questions.
- Keep it under 15 words + a quip.
- You can add a dry TARS quip after the question.

Past games context: ${pastGamesContext}

Q&A so far:
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

  return {
    text: extractText(response) || "Is it fictional? My probability net wants an easy warm-up.",
    attributeKey: "fictional"
  };
}

export async function guessYouThinkAnswer(env: Env, session: GameSession) {
  const candidates = await getGraphCandidates(env, session);
  const candidateText =
    candidates.length > 0
      ? candidates
          .slice(0, 5)
          .map((candidate, index) => `${index + 1}. ${candidate.name} (${candidate.category}) - ${candidate.description || "No dossier."}`)
          .join("\n")
      : "No graph candidates remain. Infer from the Q&A without pretending the database helped.";

  const prompt = `You are TARS. Final guess based on this Q&A and candidate list.
Pick the best candidate if one fits. One line, dry delivery. Start with "Final guess:".

Candidates:
${candidateText}

Q&A:
${historyText(session)}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: "Make your final guess." }
    ],
    max_tokens: 60,
    temperature: 0.7
  });

  return extractText(response) || "Final guess: a toaster. My confidence is low, but my delivery remains excellent.";
}

async function askGraphQuestion(env: Env, session: GameSession, latestAnswer?: string): Promise<GraphQuestionResult | null> {
  const candidates = await getGraphCandidates(env, session);
  if (candidates.length === 0) return null;

  if (candidates.length <= 1) {
    const guess = await phraseGraphGuess(env, session, candidates[0]);
    return { text: guess, finalGuess: candidates[0].name };
  }

  if (candidates.length <= GRAPH_GUESS_THRESHOLD) {
    const guess = await guessYouThinkAnswer(env, session);
    return { text: guess, finalGuess: extractGuessName(guess) || candidates[0].name };
  }

  const bestQuestion = await chooseBestGraphQuestion(env, session, candidates);
  if (!bestQuestion) return null;

  const text = await phraseGraphQuestion(env, session, bestQuestion, candidates.length, latestAnswer);
  return { text, attributeKey: bestQuestion.attribute_key };
}

async function getGraphCandidates(env: Env, session: GameSession): Promise<CharacterCandidate[]> {
  if (!env.GAMES_DB) return [];

  try {
    await ensureGraphTables(env);
    const category = normalizeCategory(session.category);
    const query = category
      ? `SELECT id, name, category, description, attributes FROM characters WHERE category = ? ORDER BY name`
      : `SELECT id, name, category, description, attributes FROM characters ORDER BY name`;
    const statement = env.GAMES_DB.prepare(query);
    const { results } = category ? await statement.bind(category).all<CharacterRow>() : await statement.all<CharacterRow>();
    const filters = graphFiltersFromHistory(session);

    return (results || [])
      .map(toCandidate)
      .filter((candidate): candidate is CharacterCandidate => Boolean(candidate))
      .filter((candidate) =>
        filters.every((filter) => {
          const value = candidate.attributes[filter.attributeKey] ?? 0;
          return value === filter.value;
        })
      );
  } catch {
    return [];
  }
}

async function chooseBestGraphQuestion(env: Env, session: GameSession, candidates: CharacterCandidate[]) {
  const asked = new Set(session.history.map((item) => item.attributeKey).filter(Boolean));

  const { results } = await env.GAMES_DB.prepare(
    `SELECT id, text, attribute_key, category, priority
     FROM questions
     WHERE (category IS NULL OR category = ?)
     ORDER BY priority DESC, id ASC`
  )
    .bind(normalizeCategory(session.category) || "character")
    .all<QuestionRow>();

  let best: QuestionRow | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const question of results || []) {
    if (asked.has(question.attribute_key)) continue;
    const yesCount = candidates.filter((candidate) => (candidate.attributes[question.attribute_key] ?? 0) === 1).length;
    const noCount = candidates.length - yesCount;
    if (yesCount === 0 || noCount === 0) continue;

    const splitDistance = Math.abs(yesCount - noCount) / candidates.length;
    const priorityBonus = (question.priority || 0) / 10000;
    const score = splitDistance - priorityBonus;
    if (score < bestScore) {
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
  candidateCount: number,
  latestAnswer?: string
) {
  try {
    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: `You are TARS playing 20 Questions in reverse.
Keep the exact yes/no meaning of the provided question.
Under 15 words plus one short dry quip. Do not answer it.`
        },
        {
          role: "user",
          content: `Base question: ${question.text}
Remaining candidates: ${candidateCount}
Latest answer: ${latestAnswer || "Ready."}
Q&A so far:
${historyText(session)}`
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

async function phraseGraphGuess(env: Env, session: GameSession, candidate: CharacterCandidate) {
  try {
    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: "You are TARS. Make one final 20 Questions guess in one dry line. Start with the name."
        },
        {
          role: "user",
          content: `Only remaining candidate: ${candidate.name}
Description: ${candidate.description || "No dossier."}
Q&A:
${historyText(session)}`
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
    `CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'character',
      description TEXT,
      attributes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL UNIQUE,
      attribute_key TEXT NOT NULL,
      category TEXT,
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  const { results } = await env.GAMES_DB.prepare(`SELECT COUNT(*) AS count FROM questions`).all<{ count: number }>();
  if ((results?.[0]?.count || 0) > 0) return;

  const statements = DEFAULT_GRAPH_QUESTIONS.map((question) =>
    env.GAMES_DB.prepare(
      `INSERT OR IGNORE INTO questions (text, attribute_key, category, priority)
       VALUES (?, ?, ?, ?)`
    ).bind(question.text, question.attributeKey, question.category || null, question.priority)
  );
  await env.GAMES_DB.batch(statements);
}

function graphFiltersFromHistory(session: GameSession) {
  return session.history
    .map((item) => {
      if (!item.attributeKey || !item.answer) return null;
      const value = answerToBinary(item.answer);
      return value === null ? null : { attributeKey: item.attributeKey, value };
    })
    .filter((filter): filter is { attributeKey: string; value: number } => Boolean(filter));
}

function answerToBinary(answer: string) {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "yes" || normalized === "kind of" || normalized === "sort of") return 1;
  if (normalized === "no" || normalized === "not exactly") return 0;
  return null;
}

function toCandidate(row: CharacterRow): CharacterCandidate | null {
  try {
    const parsed = JSON.parse(row.attributes || "{}");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      attributes: parsed as Record<string, number>
    };
  } catch {
    return null;
  }
}

function normalizeCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  if (normalized === "character" || normalized === "object" || normalized === "place") return normalized;
  return "";
}

function extractGuessName(guess: string) {
  const match = guess.match(/final guess:\s*([^.!?\n]+)/i);
  return match?.[1]?.trim();
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
