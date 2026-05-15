type TarsAvatarProps = {
  speaking: boolean;
};

export function TarsAvatar({ speaking }: TarsAvatarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`relative shrink-0 rounded transition-all duration-500 ${speaking ? "ring-2 ring-warning shadow-[0_0_20px_rgba(255,184,107,0.3)]" : "ring-1 ring-signal/50 shadow-[0_0_12px_rgba(57,245,196,0.12)]"}`}>
        <img
          src="/tars-avatar.svg"
          alt="TARS"
          className={`block h-14 w-14 rounded transition-all duration-300 ${speaking ? "scale-105 brightness-110" : ""}`}
        />
        {/* Speaking animation overlay */}
        {speaking && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center gap-[3px] pb-2">
            <span className="h-2 w-[3px] animate-pulse rounded-full bg-warning" style={{ animationDelay: "0ms" }} />
            <span className="h-3 w-[3px] animate-pulse rounded-full bg-warning" style={{ animationDelay: "150ms" }} />
            <span className="h-2 w-[3px] animate-pulse rounded-full bg-warning" style={{ animationDelay: "300ms" }} />
            <span className="h-4 w-[3px] animate-pulse rounded-full bg-warning" style={{ animationDelay: "100ms" }} />
            <span className="h-2 w-[3px] animate-pulse rounded-full bg-warning" style={{ animationDelay: "250ms" }} />
          </div>
        )}
      </div>
      <div>
        <div className="font-display text-xl font-semibold tracking-normal text-signal">TARS</div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          <span className={`h-2 w-2 rounded-full ${speaking ? "animate-pulse bg-warning" : "bg-signal"}`} />
          {speaking ? "voice link active" : "standing by"}
        </div>
      </div>
    </div>
  );
}
