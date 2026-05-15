import { Volume2 } from "lucide-react";

type TarsResponseProps = {
  text: string;
  audioBase64?: string;
};

export function TarsResponse({ text, audioBase64 }: TarsResponseProps) {
  const play = () => {
    if (!audioBase64) return;
    void new Audio(`data:audio/mpeg;base64,${audioBase64}`).play();
  };

  return (
    <div className="flex max-w-[88%] items-start gap-2 sm:max-w-[74%]">
      <div className="mt-1 h-7 w-2 shrink-0 bg-signal" />
      <div className="rounded border border-slate-700 bg-hull/95 p-3 shadow-[0_0_30px_rgba(57,245,196,0.06)]">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">TARS</span>
          <button
            className="grid h-8 w-8 place-items-center rounded border border-slate-700 text-slate-300 transition hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={play}
            disabled={!audioBase64}
            title="Replay TARS audio"
            aria-label="Replay TARS audio"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm leading-6 text-slate-100">{text}</p>
      </div>
    </div>
  );
}
