import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";
import { TarsResponse } from "./TarsResponse";

type QuestionLogProps = {
  entries: LogEntry[];
  isLoading: boolean;
};

export function QuestionLog({ entries, isLoading }: QuestionLogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [entries, isLoading]);

  return (
    <section className="min-h-0 flex-1 px-4 py-5 sm:px-6" aria-label="Question history">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {entries.map((entry) =>
          entry.speaker === "tars" ? (
            <TarsResponse key={entry.id} text={entry.text} audioBase64={entry.audioBase64} />
          ) : (
            <div key={entry.id} className="ml-auto max-w-[88%] rounded border border-cyan-500/30 bg-cyan-950/40 p-3 text-right sm:max-w-[72%]">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200">Pilot</div>
              <p className="text-sm leading-6 text-slate-100">{entry.text}</p>
            </div>
          )
        )}
        {isLoading && (
          <div className="flex items-center gap-2 pl-1 text-sm text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
            TARS is judging the phrasing.
          </div>
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
