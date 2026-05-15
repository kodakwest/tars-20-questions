import { RotateCcw, Trash2 } from "lucide-react";
import type { PersistedGame } from "../gamePersistence";

type ResumeGamePromptProps = {
  game: PersistedGame;
  onDiscard: () => void;
  onResume: (game: PersistedGame) => void;
};

function timeSince(iso: string) {
  const elapsedMs = Math.max(0, Date.now() - Date.parse(iso));
  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

export function ResumeGamePrompt({ game, onDiscard, onResume }: ResumeGamePromptProps) {
  const modeLabel = game.mode === "you-think" ? "You Think" : "AI Thinks";

  return (
    <div className="mt-4 w-full rounded border border-warning/40 bg-slate-950/86 p-3 text-left shadow-[0_0_24px_rgba(255,184,107,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-warning">Resume Game</div>
          <div className="mt-1 text-xs leading-5 text-slate-300">
            {modeLabel} · Q{game.currentQuestion}/20 · saved {timeSince(game.savedAt)}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onResume(game)}
            className="grid h-9 w-9 place-items-center rounded bg-warning text-void transition hover:bg-amber-200"
            title="Resume saved game"
            aria-label="Resume saved game"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="grid h-9 w-9 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-danger hover:text-danger"
            title="Discard saved game"
            aria-label="Discard saved game"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
