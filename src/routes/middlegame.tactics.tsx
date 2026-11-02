import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Lightbulb, SkipForward, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { tacticsPuzzle } from "@/lib/mock-data";

export const Route = createFileRoute("/middlegame/tactics")({
  head: () => ({
    meta: [
      { title: "Tactics Training — Chess Buddy" },
      {
        name: "description",
        content: "Solve tactics puzzles drawn from the openings you actually play.",
      },
      { property: "og:title", content: "Tactics Training — Chess Buddy" },
      {
        property: "og:description",
        content: "Solve tactics puzzles drawn from the openings you actually play.",
      },
    ],
  }),
  component: Tactics,
});

// ANTIGRAVITY DATA SOURCE: Filter Lichess open-source puzzle database by matching Opening Tags or target FEN positions.
function Tactics() {
  const [status, setStatus] = useState<"idle" | "correct" | "wrong">("idle");
  const [streak, setStreak] = useState(4);
  // MOCK: any move toggles feedback. ANTIGRAVITY HOOK: validate against puzzle solution line.
  const onMove = () => {
    const ok = Math.random() > 0.5;
    setStatus(ok ? "correct" : "wrong");
    setStreak((s) => (ok ? s + 1 : 0));
    return false;
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Middlegame · 3a"
        title="Tactics Training"
        description="Find the best move. Puzzles come from your own openings."
      />
      <TrainingLayout board={<ChessBoard fen={tacticsPuzzle.fen} onMove={onMove} />}>
        <DataSourceBadge>
          {
            "// ANTIGRAVITY DATA SOURCE: Filter Lichess open-source puzzle database by matching Opening Tags or target FEN positions."
          }
        </DataSourceBadge>
        <Panel title="Puzzle">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Theme</dt>
              <dd className="font-medium">{tacticsPuzzle.theme}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rating</dt>
              <dd className="font-mono">{tacticsPuzzle.rating}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Streak</dt>
              <dd className="font-mono text-success">{streak}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Opening: {tacticsPuzzle.opening}</p>
        </Panel>
        {status !== "idle" && (
          <div
            key={status + streak}
            className={`flex items-center gap-3 rounded-xl border p-4 animate-in fade-in slide-in-from-right-2 ${status === "correct" ? "border-success/40 bg-success/10 text-success" : "border-mistake/40 bg-mistake/10 text-mistake"}`}
          >
            {status === "correct" ? <CheckCircle2 /> : <XCircle />}
            <span className="font-medium">
              {status === "correct" ? "Correct — keep going!" : "Not quite. Try again."}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary">
            <Lightbulb /> Hint
          </Button>
          <Button variant="secondary" onClick={() => setStatus("idle")}>
            <SkipForward /> Next puzzle
          </Button>
        </div>
      </TrainingLayout>
    </div>
  );
}
