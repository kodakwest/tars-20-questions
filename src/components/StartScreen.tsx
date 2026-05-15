import { useEffect, useState } from "react";
import type { GameMode } from "../types";

type StartScreenProps = {
  onStart: (mode: GameMode) => void;
  voiceName?: string;
  setVoiceName: (name: string | undefined) => void;
};

function prewarmSpeechSynthesis() {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

export function StartScreen({ onStart, voiceName, setVoiceName }: StartScreenProps) {
  const [mode, setMode] = useState<GameMode>("ai-thinks");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    try {
      if (!window.speechSynthesis) return;
      const update = () => {
        try {
          setVoices(window.speechSynthesis.getVoices());
        } catch {}
      };
      update();
      window.speechSynthesis.addEventListener("voiceschanged", update);
      return () => {
        try {
          window.speechSynthesis.removeEventListener("voiceschanged", update);
        } catch {}
      };
    } catch {}
  }, []);

  const handleStart = () => {
    prewarmSpeechSynthesis();
    onStart(mode);
  };

  // Previews the selected voice with a sample TARS line
  const previewVoice = (name: string) => {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("I am TARS. Honesty setting: maximum.");
      const voice = voices.find((v) => v.name === name);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.8;
      utterance.pitch = 0.4;
      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  return (
    <section className="relative z-10 grid min-h-screen min-h-svh place-items-center overflow-y-auto bg-void px-5 py-4 text-center text-slate-100 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(57,245,196,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(57,245,196,0.08)_1px,transparent_1px)] bg-[size:30px_30px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(57,245,196,0.22),transparent_30%),radial-gradient(circle_at_50%_72%,rgba(255,184,107,0.12),transparent_28%),linear-gradient(180deg,rgba(7,9,13,0.1)_0%,#07090d_82%)]" />

      <div className="relative flex w-full max-w-md flex-col items-center">
        <div className="relative rounded border border-signal/45 bg-hull p-3 shadow-[0_0_56px_rgba(57,245,196,0.2)] sm:p-4">
          <img src="/tars-avatar.svg" alt="TARS" className="h-20 w-20 rounded min-[390px]:h-24 min-[390px]:w-24 sm:h-40 sm:w-40" />
          <div className="pointer-events-none absolute inset-0 rounded border border-warning/20" />
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-warning sm:mt-7 sm:text-xs sm:tracking-[0.24em]">Voice interface locked</p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-none text-signal min-[390px]:text-5xl sm:mt-3 sm:text-6xl">
          TARS 20 Questions
        </h1>

        {/* Mode selector */}
        <div className="mt-5 grid w-full grid-cols-2 rounded border border-slate-700 bg-slate-950/80 p-1 sm:mt-7">
          <button
            type="button"
            onClick={() => setMode("ai-thinks")}
            className={`h-11 rounded font-display text-sm font-semibold transition ${
              mode === "ai-thinks" ? "bg-signal text-void" : "text-slate-300 hover:text-signal"
            }`}
            aria-pressed={mode === "ai-thinks"}
          >
            AI Thinks
          </button>
          <button
            type="button"
            onClick={() => setMode("you-think")}
            className={`h-11 rounded font-display text-sm font-semibold transition ${
              mode === "you-think" ? "bg-warning text-void" : "text-slate-300 hover:text-warning"
            }`}
            aria-pressed={mode === "you-think"}
          >
            You Think
          </button>
        </div>

        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300 sm:mt-4 sm:text-base">
          Confirm human intent to initialize the voice link and begin the game.
        </p>

        {/* Voice selector */}
        {voices.length > 0 && (
          <div className="mt-4 w-full">
            <label className="mb-1 block text-left font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
              TARS Voice
            </label>
            <div className="flex gap-2">
              <select
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                value={voiceName ?? ""}
                onChange={(e) => setVoiceName(e.target.value || undefined)}
              >
                <option value="">System default</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              {voiceName && (
                <button
                  type="button"
                  onClick={() => previewVoice(voiceName!)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded border border-slate-700 text-slate-300 hover:border-signal hover:text-signal"
                  title="Preview voice"
                  aria-label="Preview voice"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          className="mt-5 inline-flex h-14 min-w-52 items-center justify-center rounded border border-signal/60 bg-signal px-7 font-display text-lg font-bold text-void shadow-[0_0_28px_rgba(57,245,196,0.24)] transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 focus:ring-offset-void active:scale-[0.98] sm:mt-8"
        >
          Tap to Begin
        </button>

        <div className="mt-4 hidden items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-signal min-[390px]:flex sm:mt-5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          <span className="animate-pulse">Tap to begin</span>
        </div>
      </div>
    </section>
  );
}
