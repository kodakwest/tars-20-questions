import { spawnSync } from "node:child_process";

type AnswerValue = "yes" | "no" | "kind_of" | "unknown";
type Recommendation = "pass" | "warn" | "fail";

type CliOptions = {
  games: number;
  domain?: string;
  dataset: string;
  json: boolean;
  verbose: boolean;
  remote: boolean;
  database: string;
  save: boolean;
};

type D1Value = string | number | null;
type D1Row = Record<string, D1Value>;

type Entity = {
  id: string;
  name: string;
  domain: string;
  attributes: Record<string, AnswerValue>;
};

type Question = {
  id: string;
  attributeId: string;
  attributeKey: string;
  template: string;
  qualityScore: number;
  appliesTo: string[];
};

type SimulationInput = {
  datasetVersionId: string;
  entities: Entity[];
  questions: Question[];
};

type GameResult = {
  targetId: string;
  targetName: string;
  domain: string;
  guessed: boolean;
  guessedEntityId?: string;
  guessedEntityName?: string;
  turns: number;
  candidatesRemaining: number;
  contradiction: boolean;
  deadEnd: boolean;
  initialCoverage: boolean;
  top5SurvivalTurns: number;
  badQuestionTurns: number;
  askedQuestions: number;
  prematureGuess: boolean;
};

type DomainMetrics = {
  games: number;
  wins: number;
  turns: number;
  winTurns: number;
};

type EntityMetrics = {
  entity: string;
  domain: string;
  games: number;
  wins: number;
  totalAssertions: number;
};

type SimulationReport = {
  datasetVersionId: string;
  entityCount: number;
  attributeCount: number;
  gamesSimulated: number;
  overallWinRate: number;
  avgQuestionsToWin: number;
  avgQuestionsAll: number;
  top5SurvivalRate: number;
  badQuestionRate: number;
  prematureGuessRate: number;
  contradictionRate: number;
  entityCoverage: number;
  byDomain: Record<string, { games: number; winRate: number; avgQuestions: number }>;
  outliers: Array<{ entity: string; domain: string; winRate: number; reason: string }>;
  recommendation: Recommendation;
  exitCode: number;
  games?: GameResult[];
};

const MAX_TURNS = 20;
const DEFAULT_GAMES = 200;
const RNG_SEED = 20260515;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runSimulation(options);

  if (options.save) saveSimulationReport(options, report);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, options.verbose);
  }

  process.exit(report.exitCode);
}

export function runSimulation(options: CliOptions): SimulationReport {
  const input = readSimulationInput(options);
  const targets = selectTargets(input.entities, options);
  const games = targets.map((target) => simulateGame(target, input.entities, input.questions));
  return buildReport(input, games, options.verbose);
}

function readSimulationInput(options: CliOptions): SimulationInput {
  const datasetVersionId = resolveDatasetVersionId(options);
  const version = literal(datasetVersionId);
  const domainFilter = options.domain ? ` AND domain = ${literal(options.domain)}` : "";

  const entities = readRows(options, `
    SELECT id, canonical_name, domain
    FROM entities
    WHERE dataset_version_id = ${version}${domainFilter}
    ORDER BY domain, canonical_name
  `).map(entityRow);

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const row of readRows(options, `
    SELECT aa.entity_id, a.key AS attribute_key, aa.value, aa.confidence
    FROM attribute_assertions aa
    JOIN attributes a ON aa.attribute_id = a.id
    WHERE aa.dataset_version_id = ${version}
      AND aa.value IN ('yes', 'no', 'kind_of', 'unknown')
      AND COALESCE(aa.review_status, 'unreviewed') != 'rejected'
    ORDER BY aa.entity_id, a.key, aa.confidence DESC
  `)) {
    const entity = entityById.get(stringValue(row.entity_id));
    if (!entity) continue;
    const key = stringValue(row.attribute_key);
    if (!key || entity.attributes[key]) continue;
    entity.attributes[key] = answerValue(row.value);
  }

  const questions = bestQuestionPerAttribute(
    readRows(options, `
      SELECT qt.id, qt.attribute_id, qt.template, qt.quality_score, a.key AS attribute_key, a.applies_to
      FROM question_templates qt
      JOIN attributes a ON qt.attribute_id = a.id
      ORDER BY qt.quality_score DESC, qt.id ASC
    `).map(questionRow)
  ).filter((question) => !options.domain || question.appliesTo.length === 0 || question.appliesTo.includes(options.domain ?? ""));

  return { datasetVersionId, entities, questions };
}

function resolveDatasetVersionId(options: CliOptions) {
  if (options.dataset !== "latest") return options.dataset;

  const rows = readRows(options, `
    SELECT id
    FROM dataset_versions
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const id = rows[0]?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("No dataset_versions rows found; cannot resolve --dataset latest.");
  }
  return id;
}

function simulateGame(target: Entity, allEntities: Entity[], allQuestions: Question[]): GameResult {
  let candidates = allEntities.filter((entity) => entity.domain === target.domain);
  const asked = new Set<string>();
  let guess: Entity | undefined;
  let contradiction = false;
  let deadEnd = false;
  let top5SurvivalTurns = 0;
  let badQuestionTurns = 0;
  let turns = 0;
  const initialCoverage = candidates.some((entity) => entity.id === target.id);

  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const bestQuestion = chooseBestQuestion(candidates, allQuestions, asked, target.domain);
    if (!bestQuestion) {
      deadEnd = true;
      break;
    }

    turns = turn;
    asked.add(bestQuestion.attributeKey);

    const split = answerSplit(candidates, bestQuestion.attributeKey);
    if (split.yes === 0 || split.no === 0) badQuestionTurns += 1;

    const targetValue = target.attributes[bestQuestion.attributeKey] ?? "unknown";
    candidates = candidates.filter((entity) => (entity.attributes[bestQuestion.attributeKey] ?? "unknown") === targetValue);

    if (topCandidates(candidates).some((entity) => entity.id === target.id)) {
      top5SurvivalTurns += 1;
    }

    if (candidates.length === 1) {
      guess = candidates[0];
      break;
    }

    if (candidates.length === 0) {
      contradiction = true;
      break;
    }
  }

  return {
    targetId: target.id,
    targetName: target.name,
    domain: target.domain,
    guessed: guess?.id === target.id,
    guessedEntityId: guess?.id,
    guessedEntityName: guess?.name,
    turns,
    candidatesRemaining: candidates.length,
    contradiction,
    deadEnd,
    initialCoverage,
    top5SurvivalTurns,
    badQuestionTurns,
    askedQuestions: asked.size,
    prematureGuess: Boolean(guess && turns < 10)
  };
}

function chooseBestQuestion(candidates: Entity[], questions: Question[], asked: Set<string>, domain: string) {
  let bestQuestion: Question | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const question of questions) {
    if (asked.has(question.attributeKey)) continue;
    if (question.appliesTo.length > 0 && !question.appliesTo.includes(domain)) continue;

    const split = answerSplit(candidates, question.attributeKey);
    if (split.yes === 0 || split.no === 0) continue;

    const splitDistance = Math.abs(split.yes - split.no) / candidates.length;
    const qualityBonus = question.qualityScore / 10000;
    const kindOfPenalty = split.kindOf / Math.max(candidates.length, 1) / 1000;
    const score = splitDistance - qualityBonus + kindOfPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestQuestion = question;
    }
  }

  return bestQuestion;
}

function answerSplit(candidates: Entity[], attributeKey: string) {
  let yes = 0;
  let no = 0;
  let kindOf = 0;
  let unknown = 0;

  for (const candidate of candidates) {
    const value = candidate.attributes[attributeKey] ?? "unknown";
    if (value === "yes") yes += 1;
    else if (value === "no") no += 1;
    else if (value === "kind_of") kindOf += 1;
    else unknown += 1;
  }

  return { yes, no, kindOf, unknown };
}

function topCandidates(candidates: Entity[]) {
  return [...candidates]
    .sort((left, right) => assertionCount(right) - assertionCount(left) || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function buildReport(input: SimulationInput, games: GameResult[], includeGames: boolean): SimulationReport {
  const wins = games.filter((game) => game.guessed);
  const guesses = games.filter((game) => game.guessedEntityId);
  const totalTurns = sum(games.map((game) => game.turns));
  const recommendation = recommendationFor(games.length === 0 ? 0 : wins.length / games.length);
  const byDomain = domainReport(games);
  const outliers = outlierReport(input.entities, games);

  return {
    datasetVersionId: input.datasetVersionId,
    entityCount: input.entities.length,
    attributeCount: new Set(input.questions.map((question) => question.attributeKey)).size,
    gamesSimulated: games.length,
    overallWinRate: ratio(wins.length, games.length),
    avgQuestionsToWin: average(wins.map((game) => game.turns)),
    avgQuestionsAll: average(games.map((game) => game.turns)),
    top5SurvivalRate: ratio(sum(games.map((game) => game.top5SurvivalTurns)), totalTurns),
    badQuestionRate: ratio(sum(games.map((game) => game.badQuestionTurns)), totalTurns),
    prematureGuessRate: ratio(games.filter((game) => game.prematureGuess).length, guesses.length),
    contradictionRate: ratio(games.filter((game) => game.contradiction).length, games.length),
    entityCoverage: ratio(games.filter((game) => game.initialCoverage).length, games.length),
    byDomain,
    outliers,
    recommendation,
    exitCode: exitCode(recommendation),
    ...(includeGames ? { games } : {})
  };
}

function domainReport(games: GameResult[]) {
  const byDomain = new Map<string, DomainMetrics>();

  for (const game of games) {
    const metrics = byDomain.get(game.domain) ?? { games: 0, wins: 0, turns: 0, winTurns: 0 };
    metrics.games += 1;
    metrics.turns += game.turns;
    if (game.guessed) {
      metrics.wins += 1;
      metrics.winTurns += game.turns;
    }
    byDomain.set(game.domain, metrics);
  }

  return Object.fromEntries(
    [...byDomain.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, metrics]) => [
        domain,
        {
          games: metrics.games,
          winRate: ratio(metrics.wins, metrics.games),
          avgQuestions: ratio(metrics.turns, metrics.games)
        }
      ])
  );
}

function outlierReport(entities: Entity[], games: GameResult[]) {
  const byEntity = new Map<string, EntityMetrics>();
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  for (const game of games) {
    const entity = entityById.get(game.targetId);
    if (!entity) continue;
    const metrics = byEntity.get(entity.id) ?? {
      entity: entity.name,
      domain: entity.domain,
      games: 0,
      wins: 0,
      totalAssertions: assertionCount(entity)
    };
    metrics.games += 1;
    if (game.guessed) metrics.wins += 1;
    byEntity.set(entity.id, metrics);
  }

  return [...byEntity.values()]
    .map((metrics) => {
      const winRate = ratio(metrics.wins, metrics.games);
      return {
        entity: metrics.entity,
        domain: metrics.domain,
        winRate,
        reason: metrics.totalAssertions < 5 ? "too few assertions" : "not uniquely separated by attributes"
      };
    })
    .filter((outlier) => outlier.winRate < 0.3)
    .sort((left, right) => left.winRate - right.winRate || left.entity.localeCompare(right.entity));
}

function selectTargets(entities: Entity[], options: CliOptions) {
  const eligible = options.domain ? entities.filter((entity) => entity.domain === options.domain) : entities;
  if (eligible.length === 0) {
    const scope = options.domain ? ` for domain "${options.domain}"` : "";
    throw new Error(`No entities found${scope}.`);
  }

  const rng = createRng(RNG_SEED);
  const targets: Entity[] = [];
  while (targets.length < options.games) {
    targets.push(...shuffle(eligible, rng).slice(0, options.games - targets.length));
  }
  return targets;
}

function saveSimulationReport(options: CliOptions, report: SimulationReport) {
  executeD1(options, `
    CREATE TABLE IF NOT EXISTS simulation_runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      dataset_version_id TEXT NOT NULL,
      games INTEGER NOT NULL,
      recommendation TEXT NOT NULL,
      report_json TEXT NOT NULL
    )
  `);

  executeD1(options, `
    INSERT INTO simulation_runs (id, created_at, dataset_version_id, games, recommendation, report_json)
    VALUES (
      ${literal(`sim:${new Date().toISOString()}`)},
      datetime('now'),
      ${literal(report.datasetVersionId)},
      ${report.gamesSimulated},
      ${literal(report.recommendation)},
      ${literal(JSON.stringify(report))}
    )
  `);
}

function readRows(options: CliOptions, command: string): D1Row[] {
  const output = executeD1(options, command, true);
  const parsed = JSON.parse(output) as unknown;
  return extractRows(parsed);
}

function executeD1(options: CliOptions, command: string, json = false) {
  const args = ["wrangler", "d1", "execute", options.database, "--command", command.trim()];
  if (json) args.push("--json");
  if (options.remote) args.push("--remote");

  let result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8" });
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "D1 command failed");
  }
  return result.stdout;
}

function extractRows(value: unknown): D1Row[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const first = value[0] as { results?: unknown };
    if (Array.isArray(first.results)) return first.results as D1Row[];
    if (value.every((row) => row && typeof row === "object" && !("results" in row))) return value as D1Row[];
  }

  if (value && typeof value === "object" && "results" in value) {
    const results = (value as { results?: unknown }).results;
    if (Array.isArray(results)) return results as D1Row[];
  }

  throw new Error("Unexpected wrangler JSON output shape.");
}

function entityRow(row: D1Row): Entity {
  return {
    id: stringValue(row.id),
    name: stringValue(row.canonical_name),
    domain: stringValue(row.domain),
    attributes: {}
  };
}

function questionRow(row: D1Row): Question {
  return {
    id: stringValue(row.id),
    attributeId: stringValue(row.attribute_id),
    attributeKey: stringValue(row.attribute_key),
    template: stringValue(row.template),
    qualityScore: numberValue(row.quality_score),
    appliesTo: parseStringArray(stringValue(row.applies_to))
  };
}

function bestQuestionPerAttribute(questions: Question[]) {
  const byAttribute = new Map<string, Question>();
  for (const question of questions) {
    const current = byAttribute.get(question.attributeKey);
    if (!current || question.qualityScore > current.qualityScore) {
      byAttribute.set(question.attributeKey, question);
    }
  }
  return [...byAttribute.values()].sort(
    (left, right) => right.qualityScore - left.qualityScore || left.attributeKey.localeCompare(right.attributeKey)
  );
}

function parseArgs(args: string[]): CliOptions {
  let games = DEFAULT_GAMES;
  let domain: string | undefined;
  let dataset = "latest";
  let json = false;
  let verbose = false;
  let remote = false;
  let save = false;
  let database = process.env.D1_DATABASE_NAME ?? "tars-games";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--games") games = positiveInteger(requiredValue(args[++index], "--games"), "--games");
    else if (arg === "--domain") domain = requiredValue(args[++index], "--domain");
    else if (arg === "--dataset") dataset = requiredValue(args[++index], "--dataset");
    else if (arg === "--json") json = true;
    else if (arg === "--verbose") verbose = true;
    else if (arg === "--remote") remote = true;
    else if (arg === "--save") save = true;
    else if (arg === "--database") database = requiredValue(args[++index], "--database");
    else if (arg === "--help") usageAndExit(0);
    else usageAndExit(1, `Unknown argument: ${arg}`);
  }

  return { games, domain, dataset, json, verbose, remote, database, save };
}

function printReport(report: SimulationReport, verbose: boolean) {
  console.log("Game Simulation Report");
  console.log("──────────────────────");
  console.log(`Dataset: ${report.datasetVersionId} (${report.entityCount} entities, ${report.attributeCount} attributes)`);
  console.log(`Games simulated: ${report.gamesSimulated}`);
  console.log("");

  console.log("Core Metrics:");
  console.log(`  Win rate:              ${formatPercent(report.overallWinRate)} (${Math.round(report.overallWinRate * report.gamesSimulated)}/${report.gamesSimulated})`);
  console.log(`  Avg questions to win:  ${formatNumber(report.avgQuestionsToWin)}`);
  console.log(`  Avg questions (all):   ${formatNumber(report.avgQuestionsAll)}`);
  console.log("");

  console.log("Quality Metrics:");
  console.log(`  Top-5 survival rate:   ${formatPercent(report.top5SurvivalRate)}`);
  console.log(`  Bad question rate:     ${formatPercent(report.badQuestionRate)}`);
  console.log(`  Premature guess rate:  ${formatPercent(report.prematureGuessRate)}`);
  console.log(`  Contradiction rate:    ${formatPercent(report.contradictionRate)}`);
  console.log(`  Entity coverage:       ${formatPercent(report.entityCoverage)}`);
  console.log("");

  console.log("By Domain:");
  for (const [domain, metrics] of Object.entries(report.byDomain)) {
    console.log(
      `  ${domain.padEnd(10)} win=${formatPercent(metrics.winRate).padStart(6)}  avg_q=${formatNumber(metrics.avgQuestions).padStart(4)}  (${metrics.games} games)`
    );
  }
  console.log("");

  if (report.outliers.length > 0) {
    console.log("Outliers:");
    for (const outlier of report.outliers.slice(0, verbose ? report.outliers.length : 20)) {
      console.log(`  ${outlier.entity} (${outlier.domain}): win=${formatPercent(outlier.winRate)} - ${outlier.reason}`);
    }
    if (!verbose && report.outliers.length > 20) console.log(`  ...${report.outliers.length - 20} more`);
    console.log("");
  }

  if (verbose && report.games) {
    console.log("Per-Game Results:");
    for (const game of report.games) {
      const guess = game.guessedEntityName ? `guess=${game.guessedEntityName}` : game.deadEnd ? "dead_end" : "no_guess";
      const status = game.guessed ? "win" : game.contradiction ? "contradiction" : "loss";
      console.log(`  ${game.targetName} (${game.domain}): ${status}, turns=${game.turns}, candidates=${game.candidatesRemaining}, ${guess}`);
    }
    console.log("");
  }

  console.log(`Recommendation: ${report.recommendation.toUpperCase()} - ${recommendationText(report)}`);
}

function recommendationFor(winRate: number): Recommendation {
  if (winRate > 0.7) return "pass";
  if (winRate >= 0.5) return "warn";
  return "fail";
}

function recommendationText(report: SimulationReport) {
  const weakDomain = Object.entries(report.byDomain)
    .filter(([, metrics]) => metrics.winRate < 0.7)
    .sort(([, left], [, right]) => left.winRate - right.winRate)[0]?.[0];
  if (report.recommendation === "pass") return "engine quality clears the win-rate threshold";
  if (weakDomain) return `${weakDomain} domain underperforms`;
  return "overall win rate underperforms";
}

function exitCode(recommendation: Recommendation) {
  if (recommendation === "fail") return 2;
  if (recommendation === "warn") return 1;
  return 0;
}

function requiredValue(value: string | undefined, flag: string) {
  if (!value) usageAndExit(1, `${flag} requires a value.`);
  return value;
}

function positiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) usageAndExit(1, `${flag} must be a positive integer.`);
  return parsed;
}

function usageAndExit(status: number, message?: string): never {
  if (message) console.error(message);
  console.log(`Usage:
  npx tsx scripts/simulate-games.ts
  npx tsx scripts/simulate-games.ts --games 500
  npx tsx scripts/simulate-games.ts --domain character
  npx tsx scripts/simulate-games.ts --json
  npx tsx scripts/simulate-games.ts --dataset ds:20260515-xxx
  npx tsx scripts/simulate-games.ts --verbose

Options:
  --games     Number of games to simulate (default: 200)
  --domain    Restrict to a single domain
  --dataset   Dataset version id (default: latest)
  --json      Print raw JSON report
  --verbose   Print per-game results
  --remote    Read from remote D1 instead of local D1
  --database  D1 database name (default: tars-games)
  --save      Persist report to simulation_runs`);
  process.exit(status);
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(items: T[], rng: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function assertionCount(entity: Entity) {
  return Object.values(entity.attributes).filter((value) => value !== "unknown").length;
}

function answerValue(value: D1Value | undefined): AnswerValue {
  if (value === "yes" || value === "no" || value === "kind_of" || value === "unknown") return value;
  return "unknown";
}

function stringValue(value: D1Value | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(value: D1Value | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function literal(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return ratio(sum(values), values.length);
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return value.toFixed(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(2);
});
