import { createSession, getTarsMemory, greeting, json, readBody, saveSession, tts, type Env, type GameMode } from "./_game";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readBody<{ mode?: unknown; category?: unknown }>(request);
  const mode: GameMode = body.mode === "you-think" ? "you-think" : "ai-thinks";
  const category = typeof body.category === "string" ? body.category : "something";
  const session = await createSession(env, mode, category);
  session.domain = session.mode === "you-think" && ["character", "object", "place"].includes(session.category) ? session.category : "";
  session.tarsMemory = await getTarsMemory(env);
  await saveSession(env, session);
  const message = greeting(session);
  const audioBase64 = await tts(env, message);

  return json({
    sessionId: session.sessionId,
    greeting: message,
    audioBase64,
    questionsLeft: session.questionsLeft,
    mode: session.mode,
    domain: session.domain
  });
};
