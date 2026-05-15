type QuestionCounterProps = {
  currentQuestion: number;
  maximumQuestions?: number;
};

export function QuestionCounter({ currentQuestion, maximumQuestions = 20 }: QuestionCounterProps) {
  const clampedCurrent = Math.min(Math.max(currentQuestion, 1), maximumQuestions);
  const urgent = maximumQuestions - clampedCurrent < 5;
  const exhausted = clampedCurrent >= maximumQuestions;

  return (
    <div className="min-w-36 rounded border border-slate-700 bg-slate-950/70 px-3 py-2 text-right shadow-[0_0_28px_rgba(57,245,196,0.08)]">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Questions</div>
      <div
        className={`font-display text-xl font-bold sm:text-2xl ${
          exhausted ? "text-danger" : urgent ? "text-warning" : "text-signal"
        }`}
      >
        Question {clampedCurrent} / {maximumQuestions}
      </div>
    </div>
  );
}
