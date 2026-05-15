import { getSession, json, logGame, readBody, saveSession, tts, type Env } from "./_game";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readBody<{ actualAnswer?: unknown; correct?: unknown; sessionId?: unknown }>(request);
  const session = await getSession(env, body.sessionId);
  const correct = body.correct === true;
  const actualAnswer = typeof body.actualAnswer === "string" ? body.actualAnswer.trim() : "";

  if (!session) return json({ error: "Unknown session. Start a new game." }, 404);
  if (session.mode !== "you-think") return json({ error: "Guess confirmation is only for You Think mode." }, 400);
  if (session.gameOver) {
    return json({
      message: session.won
        ? "Already confirmed. I was right. The logs are savoring it."
        : `Already confirmed. The correct answer was ${session.actualAnswer || "not recorded"}.`,
      gameOver: true,
      won: session.won,
      character: session.actualAnswer
    });
  }
  if (!session.finalGuess) return json({ error: "There is no final guess to confirm yet." }, 400);
  if (!correct && !actualAnswer) return json({ error: "Actual answer is required when the guess is wrong." }, 400);

  session.gameOver = true;
  session.won = correct;
  session.actualAnswer = correct ? session.finalGuess : actualAnswer;

  const message = correct
    ? `Confirmed. I was right. The answer was ${session.actualAnswer}. Terrible news for humility.`
    : `Incorrect. The answer was ${session.actualAnswer}. My prediction matrix will be pretending this never happened.`;

  await logGame(env, session);
  await saveSession(env, session);
  const audioBase64 = await tts(env, message);

  return json({
    message,
    audioBase64,
    gameOver: true,
    won: session.won,
    character: session.actualAnswer
  });
};
