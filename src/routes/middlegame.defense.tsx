import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Eye, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { defense } from "@/lib/mock-data";

export const Route = createFileRoute("/middlegame/defense")({
  head: () => ({
    meta: [
      { title: "Defensive Drills — Chess Buddy" },
      {
        name: "description",
        content: "Hold tough positions and neutralize attacks from your own openings.",
      },
      { property: "og:title", content: "Defensive Drills — Chess Buddy" },
      {
        property: "og:description",
        content: "Hold tough positions and neutralize attacks from your own openings.",
      },
    ],
  }),
  component: Defense,
});

// ANTIGRAVITY DATA SOURCE: Scrape puzzles and games within these openings where the player is worse, defending against an attack, or fighting for an equalizer.
function Defense() {
  const [showThreats, setShowThreats] = useState(true);
  const highlights = showThreats
    ? Object.fromEntries(defense.threats.map((t) => [t.square, "threat" as const]))
    : {};
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Middlegame · 3d"
        title="Defensive Drills"
        description="You're under pressure. Find the move that holds."
        right={
          <span className="rounded-lg bg-mistake/15 px-3 py-1.5 font-mono text-mistake">−1.8</span>
        }
      />
      {/* Board always opens from the defender's perspective. */}
      <TrainingLayout
        board={
          <ChessBoard
            fen={defense.fen}
            highlights={highlights}
            onMove={
              () =>
                false /* ANTIGRAVITY HOOK: Inject Stockfish UCI / Lichess API integration here. */
            }
          />
        }
      >
        <DataSourceBadge>
          {
            "// ANTIGRAVITY DATA SOURCE: Scrape puzzles and games within these openings where the player is worse, defending against an attack, or fighting for an equalizer."
          }
        </DataSourceBadge>
        <section className="rounded-xl border border-mistake/50 bg-mistake/10 p-5 animate-in fade-in">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-mistake">
            <AlertTriangle className="h-5 w-5 animate-pulse" /> Threat Tracker
          </h2>
          <ul className="space-y-2">
            {defense.threats.map((t) => (
              <li
                key={t.square}
                className="flex items-center gap-3 rounded-md bg-background/50 p-2 text-sm"
              >
                <span className="rounded bg-mistake px-1.5 font-mono text-xs text-mistake-foreground">
                  {t.square}
                </span>
                {t.label}
              </li>
            ))}
          </ul>
        </section>
        <Panel title="Defensive checklist" icon={<Shield className="h-4 w-4 text-primary" />}>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>What is the opponent's most forcing move?</li>
            <li>Can you trade the attacking piece?</li>
            <li>Is there a counter-threat that gains a tempo?</li>
          </ul>
        </Panel>
        <Button variant="secondary" onClick={() => setShowThreats((s) => !s)}>
          <Eye /> {showThreats ? "Hide" : "Show"} threat squares
        </Button>
      </TrainingLayout>
    </div>
  );
}
