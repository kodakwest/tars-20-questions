import { Download, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatGameLog, type PersistedGame } from "../gamePersistence";
import type { GameMode, GameResult, LogEntry, VoiceModeLevel } from "../types";

type WinScreenProps = {
  currentQuestion: number;
  log: LogEntry[];
  mode: GameMode;
  pendingFinalGuess: boolean;
  questionsLeft: number;
  result: GameResult;
  voiceMode: VoiceModeLevel;
  onPlayAgain: () => void;
};

export function WinScreen({
  currentQuestion,
  log,
  mode,
  pendingFinalGuess,
  questionsLeft,
  result,
  voiceMode,
  onPlayAgain
}: WinScreenProps) {
  const [exportStatus, setExportStatus] = useState<"idle" | "copied">("idle");
  // In "You Think" mode: TARS guesses wrong = you win, TARS guesses right = you lose
  const playerWon = mode === "you-think" ? !result.won : result.won;
  const title = playerWon ? "You Win" : "You Lose";
  const titleColor = playerWon ? "text-signal" : "text-danger";
  const targetLabel = mode === "you-think" ? "Your Answer" : "Target";
  const reviewEntries = log.filter((entry) => entry.speaker === "user" || entry.speaker === "tars");

  const handleExport = async () => {
    const now = new Date();
    const game: PersistedGame = {
      version: 1,
      savedAt: now.toISOString(),
      expiresAt: now.toISOString(),
      sessionId: "completed-game",
      mode,
      log,
      questionsLeft,
      currentQuestion,
      voiceMode,
      result,
      pendingFinalGuess
    };
    const text = formatGameLog(game);

    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tars-20-questions-${now.toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setExportStatus("copied");
        window.setTimeout(() => setExportStatus("idle"), 2000);
      } catch {}
    }
  };

  return (
    <section className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-void/86 p-4">
      <div className="w-full max-w-2xl rounded border border-signal/40 bg-slate-950 p-5 text-center shadow-[0_0_48px_rgba(57,245,196,0.16)]">
        <div className={`font-display text-4xl font-bold ${titleColor}`}>
          {title}
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">{result.message}</p>
        {result.character && <p className="mt-3 font-mono text-sm text-warning">{targetLabel}: {result.character}</p>}
        <details className="mt-5 rounded border border-slate-800 bg-void/60 text-left" open>
          <summary className="cursor-pointer px-3 py-2 font-display text-sm font-semibold uppercase tracking-[0.16em] text-signal">
            Game Log (Q&A)
          </summary>
          <div className="max-h-72 space-y-3 overflow-y-auto border-t border-slate-800 p-3">
            {reviewEntries.length > 0 ? (
              reviewEntries.map((entry, index) => (
                <div key={entry.id} className="rounded border border-slate-800 bg-slate-900/70 p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                      Q{index + 1}
                    </span>
                    <span className={entry.speaker === "tars" ? "font-mono text-[10px] uppercase tracking-[0.16em] text-signal" : "font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200"}>
                      {entry.speaker === "tars" ? "TARS" : "Pilot"}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{entry.text}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">No log entries recorded.</p>
            )}
          </div>
        </details>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded border border-slate-700 px-5 font-display font-semibold text-slate-200 transition hover:border-signal hover:text-signal"
            type="button"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {exportStatus === "copied" ? "Copied Log" : "Export Log"}
          </button>
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded bg-signal px-5 font-display font-semibold text-slate-950 hover:bg-emerald-200"
            type="button"
            onClick={() => onPlayAgain()}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Play Again
          </button>
        </div>
      </div>
    </section>
  );
}
