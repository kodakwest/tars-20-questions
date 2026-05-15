import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AskResponse, ConfirmGuessResponse, GameMode, GameResult, GuessResponse, LogEntry, NewGameResponse } from "../types";

const MAX_QUESTIONS = 20;

function id() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function speakText(text: string, voiceName?: string) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8;
    utterance.pitch = 0.4;
    utterance.volume = 1;
    utterance.lang = "en-US";
    // Use selected voice if available and still loaded
    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find(v => v.name === voiceName);
      if (selected) utterance.voice = selected;
    }
    window.speechSynthesis.speak(utterance);
  } catch {}
}

function playAudio(audioBase64?: string) {
  if (!audioBase64) return;
  const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
  audio.play().catch(() => {});
}

export function useGame() {
  const [started, setStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [questionsLeft, setQuestionsLeft] = useState(MAX_QUESTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listenTrigger, setListenTrigger] = useState(0);
  const [mode, setMode] = useState<GameMode>("ai-thinks");
  const [voiceName, setVoiceName] = useState<string | undefined>(undefined);
  const [pendingFinalGuess, setPendingFinalGuess] = useState(false);
  const latestAudio = useRef<string | undefined>(undefined);

  const onToggleVoice = useCallback(() => {
    setVoiceMode((prev) => !prev);
  }, []);

  // Voice mode continuous loop: when TARS finishes speaking, trigger next listen
  const wasSpeaking = useRef(false);
  useEffect(() => {
    if (!voiceMode) return;
    if (wasSpeaking.current && !isSpeaking && !isLoading && !result?.gameOver) {
      const t = setTimeout(() => setListenTrigger((n) => n + 1), 1000);
      return () => clearTimeout(t);
    }
    wasSpeaking.current = isSpeaking;
  }, [isSpeaking, voiceMode, isLoading, result?.gameOver]);

  const speak = useCallback((audioBase64?: string, text?: string) => {
    latestAudio.current = audioBase64 || text;
    const selectedVoice = voiceName;
    if (audioBase64) {
      setIsSpeaking(true);
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audio.addEventListener("ended", () => setIsSpeaking(false), { once: true });
      audio.addEventListener("error", () => {
        setIsSpeaking(false);
        if (text) speakText(text, selectedVoice);
      }, { once: true });
      audio.play().catch(() => {
        setIsSpeaking(false);
        if (text) speakText(text, selectedVoice);
      });
    } else if (text) {
      setIsSpeaking(true);
      speakText(text, selectedVoice);
      setTimeout(() => setIsSpeaking(false), text.length * 60);
    }
  }, [voiceName]);

  const newGame = useCallback(async (nextMode = mode) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setPendingFinalGuess(false);
    setLog([]);
    setQuestionsLeft(MAX_QUESTIONS);
    setMode(nextMode);

    try {
      const data = await postJson<NewGameResponse>("/api/new-game", { mode: nextMode });
      setSessionId(data.sessionId);
      setMode(data.mode ?? nextMode);
      setQuestionsLeft(data.questionsLeft ?? MAX_QUESTIONS);
      setLog([{ id: id(), speaker: "tars", text: data.greeting, audioBase64: data.audioBase64 }]);
      speak(data.audioBase64, data.greeting);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TARS failed to boot. Typical.");
    } finally {
      setIsLoading(false);
    }
  }, [mode, speak]);

  const start = useCallback((nextMode: GameMode) => {
    setStarted(true);
    void newGame(nextMode);
  }, [newGame]);

  const ask = useCallback(
    async (question: string) => {
      if (!sessionId || !question.trim() || result?.gameOver) return;
      const userEntry: LogEntry = { id: id(), speaker: "user", text: question.trim() };
      setLog((entries) => [...entries, userEntry]);
      setIsLoading(true);
      setError(null);

      try {
        const data = await postJson<AskResponse>("/api/ask", { question: question.trim(), sessionId });
        setQuestionsLeft(data.questionsLeft);
        setLog((entries) => [
          ...entries,
          { id: id(), speaker: "tars", text: data.answer, audioBase64: data.audioBase64 }
        ]);
        speak(data.audioBase64, data.answer);
        if (data.gameOver) {
          setResult({
            gameOver: true,
            won: data.won,
            character: data.character,
            message: data.answer
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "TARS misplaced the answer in a black hole.");
      } finally {
        setIsLoading(false);
      }
    },
    [result?.gameOver, sessionId, speak]
  );

  const startYouThinkQuestions = useCallback(async () => {
    if (!sessionId || result?.gameOver || mode !== "you-think") return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await postJson<AskResponse>("/api/ask", { action: "start", sessionId });
      setQuestionsLeft(data.questionsLeft);
      setLog((entries) => [
        ...entries,
        { id: id(), speaker: "tars", text: data.answer, audioBase64: data.audioBase64 }
      ]);
      speak(data.audioBase64, data.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TARS failed to form a question. Troubling, for a question game.");
    } finally {
      setIsLoading(false);
    }
  }, [mode, result?.gameOver, sessionId, speak]);

  const answerYouThink = useCallback(
    async (answer: string) => {
      if (!sessionId || result?.gameOver || mode !== "you-think") return;
      setLog((entries) => [...entries, { id: id(), speaker: "user", text: answer }]);
      setIsLoading(true);
      setError(null);

      try {
        const data = await postJson<AskResponse>("/api/ask", { answer: answer.toLowerCase(), sessionId });
        setQuestionsLeft(data.questionsLeft);
        setLog((entries) => [
          ...entries,
          { id: id(), speaker: "tars", text: data.answer, audioBase64: data.audioBase64 }
        ]);
        speak(data.audioBase64, data.answer);
        if (data.pendingGuessConfirmation) {
          setPendingFinalGuess(true);
        } else if (data.gameOver) {
          setResult({
            gameOver: true,
            won: data.won,
            message: data.answer
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "TARS misfiled your answer. Very human of it.");
      } finally {
        setIsLoading(false);
      }
    },
    [mode, result?.gameOver, sessionId, speak]
  );

  const confirmGuess = useCallback(
    async (correct: boolean, actualAnswer?: string) => {
      if (!sessionId || result?.gameOver || mode !== "you-think" || !pendingFinalGuess) return;
      setIsLoading(true);
      setError(null);

      try {
        const data = await postJson<ConfirmGuessResponse>("/api/confirm-guess", {
          sessionId,
          correct,
          actualAnswer
        });
        setPendingFinalGuess(false);
        setLog((entries) => [
          ...entries,
          { id: id(), speaker: "user", text: correct ? "Yes, you were right." : `No, it was ${actualAnswer?.trim()}.` },
          { id: id(), speaker: "tars", text: data.message, audioBase64: data.audioBase64 }
        ]);
        speak(data.audioBase64, data.message);
        setResult({
          gameOver: true,
          won: data.won,
          character: data.character,
          message: data.message
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "TARS failed to record the verdict.");
      } finally {
        setIsLoading(false);
      }
    },
    [mode, pendingFinalGuess, result?.gameOver, sessionId, speak]
  );

  const guess = useCallback(
    async (guessText: string) => {
      if (!sessionId || !guessText.trim() || result?.gameOver) return;
      setLog((entries) => [...entries, { id: id(), speaker: "user", text: `Guess: ${guessText.trim()}` }]);
      setIsLoading(true);
      setError(null);

      try {
        const data = await postJson<GuessResponse>("/api/guess", { guess: guessText.trim(), sessionId });
        const message =
          data.message ??
          (data.correct
            ? `Correct. It was ${data.character}. Humanity stumbles into competence.`
            : `No. It was ${data.character}. We will pretend this was a learning exercise.`);
        setLog((entries) => [...entries, { id: id(), speaker: "tars", text: message, audioBase64: data.audioBase64 }]);
        speak(data.audioBase64, message);
        setResult({ gameOver: true, won: data.correct, character: data.character, message });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Guess processing failed. Bold strategy.");
      } finally {
        setIsLoading(false);
      }
    },
    [result?.gameOver, sessionId, speak]
  );

  const replayLastAudio = useCallback(() => {
    playAudio(latestAudio.current);
  }, []);

  return useMemo(
    () => ({
      answerYouThink,
      ask,
      error,
      guess,
      confirmGuess,
      isLoading,
      isSpeaking,
      listenTrigger,
      log,
      mode,
      newGame,
      onToggleVoice,
      pendingFinalGuess,
      questionsLeft,
      replayLastAudio,
      result,
      sessionId,
      setVoiceName,
      start,
      startYouThinkQuestions,
      started,
      voiceMode,
      voiceName
    }),
    [answerYouThink, ask, error, guess, confirmGuess, isLoading, isSpeaking, listenTrigger, log, mode, newGame, onToggleVoice, pendingFinalGuess, questionsLeft, replayLastAudio, result, sessionId, start, startYouThinkQuestions, started, voiceMode, voiceName]
  );
}
