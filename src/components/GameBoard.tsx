import type { GameMode, GameResult, LogEntry, VoiceModeLevel } from "../types";
import { useEffect, useRef, useState } from "react";
import { Ear, Save } from "lucide-react";
import { saveGame } from "../gamePersistence";
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
  sessionId: string | null;
  voiceMode: VoiceModeLevel;
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
  sessionId,
  voiceMode,
  onToggleVoice,
  pendingFinalGuess,
  listenTrigger,
  startYouThinkQuestions
}: GameBoardProps) {
  const [actualAnswer, setActualAnswer] = useState("");
  const [footerHeight, setFooterHeight] = useState(0);
  const [showRevealInput, setShowRevealInput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "failed">("idle");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const disabled = isLoading || Boolean(result?.gameOver) || questionsLeft <= 0;
  const youThinkStarted = mode === "you-think" && questionsLeft < 20;
  const canSubmitReveal = actualAnswer.trim().length > 0;
  const currentQuestion = Math.min(MAX_Q, Math.max(1, MAX_Q - questionsLeft + 1));
  const canAnswerYouThink = mode === "you-think" && youThinkStarted && !isLoading && !result?.gameOver && !pendingFinalGuess;
  const voiceStatus =
    voiceMode === "off" ? "muted" : isSpeaking ? "speaking" : isListening ? "listening" : isLoading ? "thinking" : voiceMode;

  const handleCorrectGuess = () => {
    setShowRevealInput(false);
    setActualAnswer("");
    confirmGuess(true);
  };

  const handleIncorrectGuess = () => {
    if (!canSubmitReveal) return;
    confirmGuess(false, actualAnswer.trim());
  };

  const handleManualSave = () => {
    const ok = saveGame({
      sessionId,
      mode,
      log,
      questionsLeft,
      currentQuestion,
      voiceMode,
      result,
      pendingFinalGuess
    });
    setSaveStatus(ok ? "saved" : "failed");
    window.setTimeout(() => setSaveStatus("idle"), 2000);
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!canAnswerYouThink) return;

      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
      if (activeElement instanceof HTMLElement && activeElement.isContentEditable) return;

      const key = event.key.toLowerCase();
      if (key === "y") {
        event.preventDefault();
        answerYouThink("Yes");
      } else if (key === "k") {
        event.preventDefault();
        answerYouThink("Kind Of");
      } else if (key === "n") {
        event.preventDefault();
        answerYouThink("No");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answerYouThink, canAnswerYouThink]);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFooterHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (result?.gameOver) {
    return (
      <div className="game-container relative z-0 mx-auto flex h-dvh w-full max-w-5xl flex-col">
        <WinScreen
          currentQuestion={currentQuestion}
          log={log}
          mode={mode}
          pendingFinalGuess={pendingFinalGuess}
          questionsLeft={questionsLeft}
          result={result}
          voiceMode={voiceMode}
          onPlayAgain={newGame}
        />
      </div>
    );
  }

  return (
    <div className="game-container relative z-0 mx-auto flex h-dvh w-full max-w-5xl flex-col">
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
                voiceMode !== "off"
                  ? "border-signal/60 bg-signal/15 text-signal shadow-[0_0_16px_rgba(57,245,196,0.25)]"
                  : "border-slate-700 text-slate-400 hover:border-signal hover:text-signal"
              }`}
              title={`Voice mode: ${voiceMode}`}
              aria-label={`Voice mode: ${voiceMode}. Change voice mode`}
              aria-pressed={voiceMode !== "off"}
            >
              <Ear className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={!sessionId || Boolean(result?.gameOver)}
              className="grid h-9 w-9 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              title="Save game"
              aria-label="Save game"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
            </button>
            {saveStatus !== "idle" && (
              <span className={`absolute right-0 top-full mt-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] ${saveStatus === "saved" ? "text-signal" : "text-danger"}`}>
                {saveStatus === "saved" ? "Saved!" : "Save failed"}
              </span>
            )}
          </div>
          <QuestionCounter currentQuestion={currentQuestion} maximumQuestions={MAX_Q} />
        </div>
      </header>

      {/* Game HUD — scoreboard-style progress bar */}
      {log.length > 0 && !result?.gameOver && (
        <div className="sticky top-[73px] z-20 flex items-center gap-3 border-b border-slate-800 bg-void/80 px-4 py-1.5 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <span className="font-semibold text-signal">Q{currentQuestion}</span>
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
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: `calc(${footerHeight}px + var(--safe-area-inset-bottom) + 1rem)` }}
      >
        <QuestionLog entries={log} footerHeight={footerHeight} isLoading={isLoading} scrollContainerRef={chatScrollRef} />

        {error && (
          <div className="mx-4 mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-rose-100 sm:mx-6">
            {error}
          </div>
        )}
      </div>

      {!result?.gameOver && (
        <footer ref={footerRef} className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-void/94 p-3 pb-safe backdrop-blur sm:p-4">
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
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => answerYouThink("Yes")}
                      disabled={!canAnswerYouThink}
                      className="min-h-11 flex-1 rounded bg-signal px-4 py-3 font-display font-semibold text-void transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => answerYouThink("Kind Of")}
                      disabled={!canAnswerYouThink}
                      className="min-h-11 flex-1 rounded border border-warning/60 bg-warning/10 px-4 py-3 font-display font-semibold text-warning transition hover:bg-warning/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                    >
                      Kind Of
                    </button>
                    <button
                      type="button"
                      onClick={() => answerYouThink("No")}
                      disabled={!canAnswerYouThink}
                      className="min-h-11 flex-1 rounded border border-danger/60 bg-danger/10 px-4 py-3 font-display font-semibold text-rose-100 transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                    >
                      No
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
                  <QuestionInput
                    disabled={disabled}
                    onAsk={ask}
                    listenTrigger={listenTrigger}
                    voiceMode={voiceMode}
                    onListeningChange={setIsListening}
                  />
                </div>
                <GuessButton disabled={isLoading || Boolean(result?.gameOver)} onGuess={guess} />
              </div>
            )}
          </div>
        </footer>
      )}

      {!result?.gameOver && (
        <div
          className="pointer-events-none fixed left-1/2 z-20 -translate-x-1/2"
          style={{ bottom: `calc(${footerHeight}px + var(--safe-area-inset-bottom) + 0.75rem)` }}
        >
          <div className="flex items-center gap-2 rounded-full border border-signal/30 bg-void/80 px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-signal shadow-[0_0_20px_rgba(57,245,196,0.12)] backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${voiceMode === "off" ? "bg-slate-500" : "animate-pulse bg-signal"}`} />
            {voiceStatus}
          </div>
        </div>
      )}
    </div>
  );
}
