import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { guessTheMove } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/middlegame/guess-the-move")({
  head: () => ({
    meta: [
      { title: "Guess the Move — Chess Buddy" },
      { name: "description", content: "Replay grandmaster games from your openings and test your strategic understanding." },
      { property: "og:title", content: "Guess the Move — Chess Buddy" },
      { property: "og:description", content: "Replay grandmaster games from your openings and test your strategic understanding." },
    ],
  }),
  component: GuessTheMove,
});

// ANTIGRAVITY DATA SOURCE: Pull full Grandmaster games matching the Opening Creator's FEN, starting the guess-the-move loop from move 10-12 onward.
function GuessTheMove() {
  const [picked, setPicked] = useState<string | null>(null);
  const g = guessTheMove;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Middlegame · 3b" title="Guess the Move" description={`${g.game} — from move ${g.moveNumber}`} />
      <TrainingLayout board={<ChessBoard fen={g.fen} onMove={() => false /* ANTIGRAVITY HOOK: compare with GM move */} />}>
        <DataSourceBadge>{"// ANTIGRAVITY DATA SOURCE: Pull full Grandmaster games matching the Opening Creator's FEN, starting the guess-the-move loop from move 10-12 onward."}</DataSourceBadge>
        <Panel title="Concept check">
          <p className="mb-4 font-medium">{g.question}</p>
          <div className="grid gap-2">
            {g.options.map((o) => {
              const state = picked === null ? "idle" : o.correct ? "correct" : picked === o.id ? "wrong" : "dim";
              return (
                <button
                  key={o.id}
                  disabled={picked !== null}
                  onClick={() => setPicked(o.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-secondary p-3 text-left text-sm transition-all hover:border-primary/60 hover:bg-accent",
                    state === "correct" && "border-success bg-success/15 text-success",
                    state === "wrong" && "border-mistake bg-mistake/15 text-mistake",
                    state === "dim" && "opacity-50",
                  )}
                >
                  <span className="font-mono uppercase">{o.id}</span>
                  {o.text}
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel title="Grandmaster Insights & Feedback" icon={<GraduationCap className="h-4 w-4 text-primary" />}>
          {picked ? (
            <p className="text-sm leading-relaxed animate-in fade-in">{g.insight}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Answer the concept check to reveal the explanation.</p>
          )}
        </Panel>
      </TrainingLayout>
    </div>
  );
}
