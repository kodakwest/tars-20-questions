import { FormEvent, useState } from "react";
import { Crosshair, X } from "lucide-react";

type GuessButtonProps = {
  disabled: boolean;
  onGuess: (guess: string) => void;
};

export function GuessButton({ disabled, onGuess }: GuessButtonProps) {
  const [open, setOpen] = useState(false);
  const [guess, setGuess] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = guess.trim();
    if (!value || disabled) return;
    onGuess(value);
    setGuess("");
    setOpen(false);
  }

  return (
    <>
      <button
        className="inline-flex h-12 items-center justify-center gap-2 rounded border border-warning/60 bg-warning/10 px-4 font-display text-sm font-semibold text-warning transition hover:bg-warning/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Crosshair className="h-4 w-4" aria-hidden="true" />
        Guess
      </button>

      {open && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <form className="w-full max-w-sm rounded border border-slate-700 bg-slate-950 p-4 shadow-2xl" onSubmit={submit}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-slate-100">Make a Guess</h2>
              <button
                className="grid h-9 w-9 place-items-center rounded border border-slate-700 text-slate-300 hover:border-signal hover:text-signal"
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <label className="sr-only" htmlFor="guess">
              Character guess
            </label>
            <input
              id="guess"
              className="mb-3 w-full rounded border border-slate-700 bg-void px-4 py-3 text-base text-slate-100 outline-none focus:border-warning focus:ring-2 focus:ring-warning/20"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              placeholder="Character name"
              autoFocus
            />
            <button
              className="h-11 w-full rounded bg-warning font-display font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              type="submit"
              disabled={!guess.trim()}
            >
              Lock Guess
            </button>
          </form>
        </div>
      )}
    </>
  );
}
