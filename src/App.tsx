import { GameBoard } from "./components/GameBoard";
import { StartScreen } from "./components/StartScreen";
import { useGame } from "./hooks/useGame";

export default function App() {
  const game = useGame();

  return (
    <main className="min-h-screen min-h-svh overflow-x-hidden overscroll-none bg-void text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(57,245,196,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(57,245,196,0.055)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(57,245,196,0.16),transparent_34%),linear-gradient(180deg,rgba(7,9,13,0)_0%,#07090d_88%)]" />
      {game.started ? (
        <GameBoard key={game.sessionId ?? "pending-game"} {...game} />
      ) : (
        <StartScreen onStart={game.start} voiceName={game.voiceName} setVoiceName={game.setVoiceName} />
      )}
    </main>
  );
}
