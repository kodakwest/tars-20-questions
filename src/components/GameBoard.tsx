import type { GameMode, GameResult, LogEntry } from "../types";
import { useState } from "react";
import { Ear } from "lucide-react";
import { GuessButton } from "./GuessButton";
import { QuestionCounter } from "./QuestionCounter";
import { QuestionInput } from "./QuestionInput";
import { QuestionLog } from "./QuestionLog";
import { TarsAvatar } from "./TarsAvatar";
import { WinScreen } from "./WinScreen";

const MAX_Q = 20;

type GameBoardProps = {
  answerYouThink: (answer: string) => void;
  ask: (question: string) => void;
  confirmGuess: (correct: boolean, actualAnswer?: string) => void;
  error: string | null;
  guess: (guess: string) => void;
  isLoading: boolean;
  isSpeaking: boolean;
  log: LogEntry[];
  newGame: () => void;
  questionsLeft: number;
  result: GameResult | null;
  voiceMode: boolean;
  onToggleVoice: () => void;
  listenTrigger: number;
  mode: GameMode;
  pendingFinalGuess: boolean;
  startYouThinkQuestions: () => void;
};

export function GameBoard({
  answerYouThink,
  ask,
  confirmGuess,
  error,
  guess,
  isLoading,
  isSpeaking,
  log,
  mode,
  newGame,
  questionsLeft,
  result,
  voiceMode,
  onToggleVoice,
  pendingFinalGuess,
  listenTrigger,
  startYouThinkQuestions
}: GameBoardProps) {
  const [actualAnswer, setActualAnswer] = useState("");
  const [showRevealInput, setShowRevealInput] = useState(false);
  const disabled = isLoading || Boolean(result?.gameOver) || questionsLeft <= 0;
  const youThinkStarted = mode === "you-think" && questionsLeft < 20;
  const canSubmitReveal = actualAnswer.trim().length > 0;

  const handleCorrectGuess = () => {
    setShowRevealInput(false);
    setActualAnswer("");
    confirmGuess(true);
  };

  const handleIncorrectGuess = () => {
    if (!canSubmitReveal) return;
    confirmGuess(false, actualAnswer.trim());
  };

  return (
    <div className="relative z-0 mx-auto flex min-h-screen w-full max-w-5xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-800 bg-void/86 px-4 py-4 backdrop-blur sm:px-6">
        <TarsAvatar speaking={isSpeaking} />
        <div className="flex items-center gap-3">
          <div className="rounded border border-slate-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-300">
            {mode === "you-think" ? "You Think" : "AI Thinks"}
          </div>
          {mode === "ai-thinks" && (
            <button
              type="button"
              onClick={onToggleVoice}
              disabled={Boolean(result?.gameOver)}
              className={`grid h-9 w-9 place-items-center rounded border transition ${
                voiceMode
                  ? "border-signal/60 bg-signal/15 text-signal shadow-[0_0_16px_rgba(57,245,196,0.25)]"
                  : "border-slate-700 text-slate-400 hover:border-signal hover:text-signal"
              }`}
              title={voiceMode ? "Voice mode on - hands-free" : "Voice mode off"}
              aria-label={voiceMode ? "Disable voice mode" : "Enable voice mode"}
              aria-pressed={voiceMode}
            >
              <Ear className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <QuestionCounter questionsLeft={questionsLeft} />
        </div>
      </header>

      {/* Game HUD — scoreboard-style progress bar */}
      {log.length > 0 && !result?.gameOver && (
        <div className="sticky top-[73px] z-20 flex items-center gap-3 border-b border-slate-800 bg-void/80 px-4 py-1.5 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <span className="font-semibold text-signal">Q{MAX_Q - questionsLeft + 1}</span>
            <span className="text-slate-600">of {MAX_Q}</span>
          </div>
          <div className="flex h-1 flex-1 gap-[3px] overflow-hidden rounded-full bg-slate-800">
            {Array.from({ length: MAX_Q }).map((_, i) => (
              <span
                key={i}
                className={`h-full flex-1 rounded-full transition-colors duration-300 ${
                  i < MAX_Q - questionsLeft ? "bg-signal" : "bg-slate-700/50"
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
            <span className={questionsLeft <= 5 ? "text-warning" : "text-signal"}>{questionsLeft}</span>
            <span className="text-slate-600"> left</span>
          </div>
        </div>
      )}

      {/* Scrollable chat — takes remaining space, footer never pushes it */}
      <div className="flex-1 overflow-y-auto pb-28">
        <QuestionLog entries={log} isLoading={isLoading} />

        {error && (
          <div className="mx-4 mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-rose-100 sm:mx-6">
            {error}
          </div>
        )}
      </div>

      {/* Fixed footer — always on screen */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-void/94 p-3 backdrop-blur sm:p-4">
        <div className="mx-auto max-w-5xl">
        {mode === "you-think" ? (
          <div className="mx-auto max-w-3xl">
            {pendingFinalGuess ? (
              <div className="rounded border border-signal/30 bg-slate-950/95 p-3">
                <div className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.16em] text-signal">
                  Was I Right?
                </div>
                {showRevealInput ? (
                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleIncorrectGuess();
                    }}
                  >
                    <input
                      value={actualAnswer}
                      onChange={(event) => setActualAnswer(event.target.value)}
                      disabled={isLoading}
                      placeholder="What were you thinking of?"
                      className="h-12 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-signal"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !canSubmitReveal}
                      className="h-12 rounded bg-signal px-5 font-display font-semibold text-void transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      Reveal
                    </button>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCorrectGuess}
                      disabled={isLoading}
                      className="h-12 flex-1 rounded bg-signal font-display font-semibold text-void transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRevealInput(true)}
                      disabled={isLoading}
                      className="h-12 flex-1 rounded border border-danger/60 bg-danger/10 font-display font-semibold text-rose-100 transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            ) : youThinkStarted ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => answerYouThink("Yes")}
                  disabled={isLoading || Boolean(result?.gameOver) || pendingFinalGuess}
                  className="h-12 flex-1 rounded bg-signal font-display font-semibold text-void transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => answerYouThink("No")}
                  disabled={isLoading || Boolean(result?.gameOver) || pendingFinalGuess}
                  className="h-12 flex-1 rounded border border-danger/60 bg-danger/10 font-display font-semibold text-rose-100 transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => answerYouThink("Kind of")}
                  disabled={isLoading || Boolean(result?.gameOver) || pendingFinalGuess}
                  className="h-12 flex-1 rounded border border-warning/60 bg-warning/10 font-display font-semibold text-warning transition hover:bg-warning/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  Kind Of
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startYouThinkQuestions}
                disabled={isLoading || Boolean(result?.gameOver)}
                className="h-12 w-full rounded bg-warning font-display font-semibold text-void transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                Ready
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl gap-2">
            <div className="min-w-0 flex-1">
              <QuestionInput disabled={disabled} onAsk={ask} listenTrigger={listenTrigger} voiceMode={voiceMode} />
            </div>
            <GuessButton disabled={isLoading || Boolean(result?.gameOver)} onGuess={guess} />
          </div>
        )}
      </div>
      </footer>

      {voiceMode && !result?.gameOver && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-20 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-signal/30 bg-void/80 px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-signal shadow-[0_0_20px_rgba(57,245,196,0.12)] backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
            voice mode active
          </div>
        </div>
      )}

      {result?.gameOver && <WinScreen log={log} mode={mode} result={result} onPlayAgain={newGame} />}
    </div>
  );
}
