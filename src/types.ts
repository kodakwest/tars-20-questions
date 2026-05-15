export type Speaker = "user" | "tars";

export type GameMode = "ai-thinks" | "you-think";

export type LogEntry = {
  id: string;
  speaker: Speaker;
  text: string;
  audioBase64?: string;
};

export type GameResult = {
  gameOver: boolean;
  won: boolean;
  character?: string;
  message?: string;
};

export type AskResponse = {
  answer: string;
  audioBase64: string;
  questionsLeft: number;
  gameOver: boolean;
  won: boolean;
  character?: string;
  pendingGuessConfirmation?: boolean;
};

export type GuessResponse = {
  correct: boolean;
  character: string;
  audioBase64: string;
  gameOver: boolean;
  message?: string;
};

export type ConfirmGuessResponse = {
  message: string;
  audioBase64?: string;
  gameOver: true;
  won: boolean;
  character?: string;
};

export type NewGameResponse = {
  sessionId: string;
  greeting: string;
  audioBase64: string;
  questionsLeft?: number;
  mode?: GameMode;
};
