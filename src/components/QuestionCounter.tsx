type QuestionCounterProps = {
  questionsLeft: number;
};

export function QuestionCounter({ questionsLeft }: QuestionCounterProps) {
  const urgent = questionsLeft <= 5;
  const exhausted = questionsLeft <= 0;

  return (
    <div className="min-w-24 rounded border border-slate-700 bg-slate-950/70 px-3 py-2 text-right shadow-[0_0_28px_rgba(57,245,196,0.08)]">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Questions</div>
      <div className={`font-display text-3xl font-bold ${exhausted ? "text-danger" : urgent ? "text-warning" : "text-signal"}`}>
        {questionsLeft}
      </div>
    </div>
  );
}
