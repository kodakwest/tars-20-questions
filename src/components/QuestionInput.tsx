import { FormEvent, useEffect, useRef, useState } from "react";
import { Mic, SendHorizontal } from "lucide-react";
import type { VoiceModeLevel } from "../types";

type QuestionInputProps = {
  disabled: boolean;
  onAsk: (question: string) => void;
  listenTrigger: number;
  voiceMode: VoiceModeLevel;
  onListeningChange?: (listening: boolean) => void;
};

type SpeechRecognitionConstructor = new () => AppSpeechRecognition;

type AppSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: AppSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: AppSpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type AppSpeechRecognitionErrorEvent = Event & {
  error: string;
};

type AppSpeechRecognitionResultEvent = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

export function QuestionInput({ disabled, onAsk, listenTrigger, voiceMode, onListeningChange }: QuestionInputProps) {
  const [question, setQuestion] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<AppSpeechRecognition | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));

    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
      stopCurrentRecognition();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  // Auto-listen when listenTrigger changes (full voice mode continuous loop)
  useEffect(() => {
    if (voiceMode !== "full" || !speechSupported || disabled) return;
    const timeout = setTimeout(() => startListening(), 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenTrigger, voiceMode]);

  // Auto-start listening only when full voice mode is enabled.
  useEffect(() => {
    if (voiceMode !== "full" || !speechSupported || disabled) return;
    const timeout = setTimeout(() => startListening(), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode]);

  useEffect(() => {
    if (disabled && isListening) {
      stopCurrentRecognition();
      setIsListening(false);
    }
  }, [disabled, isListening]);

  useEffect(() => {
    if (!isListening) return;
    const timeout = window.setTimeout(() => {
      setIsListening(false);
      stopCurrentRecognition();
      recognitionRef.current = null;
      showSpeechError("I didn't catch that. Could you say it again?");
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [isListening]);

  function stopCurrentRecognition() {
    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current = null;
    }
  }

  function showSpeechError(message: string) {
    setSpeechError(message);
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setSpeechError(null);
      errorTimerRef.current = null;
    }, 2600);
  }

  function askQuestion(value: string) {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onAsk(trimmed);
    setQuestion("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    askQuestion(question);
  }

  function startListening() {
    if (disabled) return;

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setSpeechSupported(false);
      return;
    }

    stopCurrentRecognition();
    recognitionRef.current = null;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript ?? "";
        if (event.results[index].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const finalValue = finalTranscript.trim();
      if (finalValue) {
        setQuestion(finalValue);
        setIsListening(false);
        try {
          recognition.stop();
        } catch {
          recognitionRef.current = null;
        }
        askQuestion(finalValue);
        return;
      }

      setQuestion(interimTranscript.trimStart());
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showSpeechError("Microphone access denied. Use the keyboard instead.");
      } else if (event.error === "no-speech" || event.error === "audio-capture" || event.error === "network") {
        showSpeechError("I didn't catch that. Could you say it again?");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    setSpeechError(null);
    setQuestion("");
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
    }
  }

  return (
    <form className="relative flex gap-2" onSubmit={submit}>
      <label className="sr-only" htmlFor="question">
        Ask a yes or no question
      </label>
      <input
        id="question"
        className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950/85 px-4 py-3 text-base text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-signal focus:ring-2 focus:ring-signal/20 disabled:cursor-not-allowed disabled:opacity-60"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={isListening ? "Listening..." : "Ask a yes/no question..."}
        disabled={disabled}
        autoComplete="off"
      />
      {speechSupported && (
        <button
          className={`grid h-12 w-12 shrink-0 place-items-center rounded border transition disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600 ${
            isListening
              ? "animate-pulse border-danger/70 bg-danger/15 text-danger shadow-[0_0_22px_rgba(255,93,115,0.45)]"
              : "border-slate-700 bg-slate-950/85 text-slate-300 hover:border-signal hover:text-signal"
          }`}
          type="button"
          disabled={disabled}
          title={isListening ? "Listening" : "Speak question"}
          aria-label={isListening ? "Listening" : "Speak question"}
          aria-pressed={isListening}
          onClick={startListening}
        >
          <Mic className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <button
        className="grid h-12 w-12 shrink-0 place-items-center rounded bg-signal text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        type="submit"
        disabled={disabled || !question.trim()}
        title="Send question"
        aria-label="Send question"
      >
        <SendHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {speechError && (
        <div
          className="absolute bottom-full right-0 mb-2 max-w-72 rounded border border-danger/40 bg-slate-950 px-3 py-2 text-sm text-rose-100 shadow-[0_0_22px_rgba(255,93,115,0.18)]"
          role="status"
          aria-live="polite"
        >
          {speechError}
        </div>
      )}
    </form>
  );
}
