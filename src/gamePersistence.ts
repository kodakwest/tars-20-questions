import type { GameMode, GameResult, LogEntry, VoiceModeLevel } from "./types";

const STORAGE_KEY = "tars20q.activeGame.v1";
const STORAGE_VERSION = 1;
const SESSION_TTL_MS = 30 * 60 * 1000;

export type GameState = {
  sessionId: string | null;
  mode: GameMode;
  log: LogEntry[];
  questionsLeft: number;
  currentQuestion: number;
  voiceMode: VoiceModeLevel;
  voiceName?: string;
  result: GameResult | null;
  pendingFinalGuess: boolean;
};

export interface PersistedGame {
  version: 1;
  savedAt: string;
  expiresAt: string;
  sessionId: string;
  mode: GameMode;
  log: Array<{
    id: string;
    speaker: "user" | "tars";
    text: string;
    audioBase64?: string;
  }>;
  questionsLeft: number;
  currentQuestion: number;
  voiceMode: VoiceModeLevel;
  voiceName?: string;
  result: GameResult | null;
  pendingFinalGuess: boolean;
}

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPersistedGame(value: unknown): value is PersistedGame {
  if (!value || typeof value !== "object") return false;
  const game = value as Partial<PersistedGame>;
  return (
    game.version === STORAGE_VERSION &&
    typeof game.savedAt === "string" &&
    typeof game.expiresAt === "string" &&
    typeof game.sessionId === "string" &&
    (game.mode === "ai-thinks" || game.mode === "you-think") &&
    Array.isArray(game.log) &&
    typeof game.questionsLeft === "number" &&
    typeof game.currentQuestion === "number" &&
    (game.voiceMode === "off" || game.voiceMode === "minimal" || game.voiceMode === "full") &&
    typeof game.pendingFinalGuess === "boolean"
  );
}

export function saveGame(state: GameState): boolean {
  if (!state.sessionId) return false;

  const storage = getStorage();
  if (!storage) return false;

  const savedAt = new Date();
  const game: PersistedGame = {
    version: STORAGE_VERSION,
    savedAt: savedAt.toISOString(),
    expiresAt: new Date(savedAt.getTime() + SESSION_TTL_MS).toISOString(),
    sessionId: state.sessionId,
    mode: state.mode,
    log: state.log,
    questionsLeft: state.questionsLeft,
    currentQuestion: state.currentQuestion,
    voiceMode: state.voiceMode,
    voiceName: state.voiceName,
    result: state.result,
    pendingFinalGuess: state.pendingFinalGuess
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedGame(): PersistedGame | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedGame(parsed)) return null;

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearSavedGame();
      return null;
    }

    return parsed;
  } catch {
    clearSavedGame();
    return null;
  }
}

export function clearSavedGame(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {}
}

export function isSavedGameStorageEvent(event: StorageEvent): boolean {
  return event.key === STORAGE_KEY;
}

export function formatGameLog(game: PersistedGame): string {
  const modeLabel = game.mode === "you-think" ? "You Think" : "AI Thinks";
  const lines = [
    "TARS 20 Questions Game Log",
    `Mode: ${modeLabel}`,
    `Saved: ${new Date(game.savedAt).toLocaleString()}`,
    `Question: ${game.currentQuestion} of 20`,
    `Questions left: ${game.questionsLeft}`,
    ""
  ];

  if (game.result?.gameOver) {
    const playerWon = game.mode === "you-think" ? !game.result.won : game.result.won;
    lines.push(`Result: ${playerWon ? "You won" : "You lost"}`);
    if (game.result.character) lines.push(`Answer: ${game.result.character}`);
    if (game.result.message) lines.push(`Message: ${game.result.message}`);
    lines.push("");
  }

  lines.push("Transcript:");
  if (game.log.length === 0) {
    lines.push("No log entries recorded.");
  } else {
    for (const entry of game.log) {
      lines.push(`${entry.speaker === "tars" ? "TARS" : "Pilot"}: ${entry.text}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
