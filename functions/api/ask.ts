import { answerQuestion, askYouThinkQuestion, getSession, guessYouThinkAnswer, json, logGame, lossMessage, readBody, saveSession, tts, type Env } from "./_game";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readBody<{ action?: unknown; answer?: unknown; question?: unknown; sessionId?: unknown }>(request);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const userAnswer = typeof body.answer === "string" ? body.answer.trim().toLowerCase() : "";
  const session = await getSession(env, body.sessionId);

  if (!session) return json({ error: "Unknown session. Start a new game." }, 404);
  if (session.gameOver) {
    if (session.mode === "you-think") {
      if (session.finalGuess) {
        await logGame(env, session);
      }

      return json({
        answer: "Game over. My final guess already left the airlock.",
        audioBase64: "",
        questionsLeft: session.questionsLeft,
        gameOver: true,
        won: session.won
      });
    }

    return json({
      answer: `Game over. The character was ${session.character}. Try to keep up.`,
      audioBase64: "",
      questionsLeft: session.questionsLeft,
      gameOver: true,
      won: session.won,
      character: session.character
    });
  }

  if (session.mode === "you-think") {
    const isStart = body.action === "start" || session.history.length === 0;
    if (!isStart && !["yes", "no", "kind of", "sort of", "not exactly"].includes(userAnswer)) {
      return json({ error: "Answer must be yes or no." }, 400);
    }

    if (!isStart) {
      const previous = session.history[session.history.length - 1];
      if (previous && !previous.answer) {
        previous.answer = userAnswer;
      }
    }

    let answer: string;
    if (!isStart && session.questionsLeft <= 0) {
      if (!session.finalGuess) {
        answer = await guessYouThinkAnswer(env, session);
        session.finalGuess = extractFinalGuess(answer);
      } else {
        answer = `Final guess: ${session.finalGuess}`;
      }
    } else {
      session.questionsLeft -= 1;
      const graphQuestion = await askYouThinkQuestion(env, session, isStart ? undefined : userAnswer);
      answer = graphQuestion.text;
      if (graphQuestion.finalGuess) {
        session.finalGuess = graphQuestion.finalGuess;
      } else {
        session.history.push({ question: answer, answer: "", attributeKey: graphQuestion.attributeKey });
      }
    }

    await saveSession(env, session);
    const audioBase64 = await tts(env, answer);

    return json({
      answer,
      audioBase64,
      questionsLeft: session.questionsLeft,
      gameOver: session.gameOver,
      won: session.won,
      pendingGuessConfirmation: Boolean(session.finalGuess && !session.gameOver)
    });
  }

  if (!question) return json({ error: "Question is required." }, 400);

  session.questionsLeft -= 1;
  let answer = await answerQuestion(env, session, question);

  if (session.questionsLeft <= 0) {
    session.gameOver = true;
    session.won = false;
    answer = `${answer} ${lossMessage(session)}`;
  }

  session.history.push({ question, answer });
  if (session.gameOver) {
    await logGame(env, session);
  }
  await saveSession(env, session);
  const audioBase64 = await tts(env, answer);

  return json({
    answer,
    audioBase64,
    questionsLeft: session.questionsLeft,
    gameOver: session.gameOver,
    won: session.won,
    character: session.gameOver ? session.character : undefined
  });
};

function extractFinalGuess(answer: string) {
  const withoutPrefix = answer.replace(/^final guess:\s*/i, "").trim();
  return withoutPrefix.split(/[.!?\n]/)[0]?.trim() || answer;
}
