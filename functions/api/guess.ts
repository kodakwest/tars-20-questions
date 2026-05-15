import { getSession, isCorrectGuess, json, logGame, readBody, saveSession, tts, type Env } from "./_game";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readBody<{ guess?: unknown; sessionId?: unknown }>(request);
  const guess = typeof body.guess === "string" ? body.guess.trim() : "";
  const session = await getSession(env, body.sessionId);

  if (!session) return json({ error: "Unknown session. Start a new game." }, 404);
  if (!guess) return json({ error: "Guess is required." }, 400);

  const correct = isCorrectGuess(guess, session.character);
  session.gameOver = true;
  session.won = correct;

  const message = correct
    ? `Correct. It was ${session.character}. Against all probability, you used the questions effectively.`
    : `No. It was ${session.character}. Here's why that guess is wrong: it is not the correct answer. Brutal, but efficient.`;
  
  await logGame(env, session);
  await saveSession(env, session);
  const audioBase64 = await tts(env, message);

  return json({
    correct,
    character: session.character,
    audioBase64,
    gameOver: true,
    message
  });
};
