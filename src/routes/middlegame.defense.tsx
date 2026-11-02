import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  RotateCcw,
  Shield,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { defenseDrills, type DefenseDrill } from "@/lib/mock-data";

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
  const [drillIdx, setDrillIdx] = useState(0);
  const drill = defenseDrills[drillIdx] ?? defenseDrills[0];

  const chess = useMemo(() => new Chess(drill.fen), [drill.fen]);
  const [currentFen, setCurrentFen] = useState(drill.fen);
  const [showThreats, setShowThreats] = useState(true);
  const [status, setStatus] = useState<"idle" | "held" | "blunder">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const resetDrill = () => {
    chess.load(drill.fen);
    setCurrentFen(drill.fen);
    setStatus("idle");
    setFeedback(null);
  };

  const nextDrill = () => {
    const next = (drillIdx + 1) % defenseDrills.length;
    setDrillIdx(next);
    const nextD = defenseDrills[next];
    chess.load(nextD.fen);
    setCurrentFen(nextD.fen);
    setStatus("idle");
    setFeedback(null);
  };

  const onMove = (from: string, to: string) => {
    if (status === "held") return false;

    const attemptedLan = `${from}${to}`.toLowerCase();
    const legalMoves = chess.moves({ verbose: true });
    const isLegal = legalMoves.some((m) => m.from === from && m.to === to);
    if (!isLegal) return false;

    const isHolding = drill.holdingMovesLan.some((m) => m.toLowerCase() === attemptedLan);

    const moveRes = chess.move({ from, to });
    if (!moveRes) return false;

    setCurrentFen(chess.fen());

    if (isHolding) {
      setStatus("held");
      setFeedback("Threat successfully neutralized! Solid defensive vision.");
      return true;
    } else {
      // Blundered defense — check refutations
      setStatus("blunder");
      const refutationText =
        drill.blunderRefutations[attemptedLan] ||
        drill.blunderRefutations.default ||
        "That move fails to stop the primary threat!";
      setFeedback(refutationText);

      // Play automatic opponent punishing move if mate is threatened
      setTimeout(() => {
        const blkLegal = chess.moves({ verbose: true });
        const matingMove = blkLegal.find(
          (m) => m.san.includes("#") || m.to === "g2" || m.to === "d1",
        );
        if (matingMove) {
          chess.move({ from: matingMove.from, to: matingMove.to });
          setCurrentFen(chess.fen());
        }
      }, 500);

      return true;
    }
  };

  const highlights =
    showThreats && status !== "held"
      ? Object.fromEntries(drill.threats.map((t) => [t.square, "threat" as const]))
      : {};

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Middlegame · 3d"
        title="Defensive Drills"
        description="You're under pressure. Find the move that holds."
        right={
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-mistake/15 px-3 py-1.5 font-mono text-sm font-semibold text-mistake">
              {drill.evalDeficit}
            </span>
          </div>
        }
      />

      <TrainingLayout
        board={
          <div className="space-y-3">
            <ChessBoard fen={currentFen} highlights={highlights} onMove={onMove} />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={resetDrill}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Reset
              </Button>
              <Button variant="outline" size="sm" onClick={nextDrill}>
                Next Drill <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        }
      >
        <DataSourceBadge>
          {
            "// ANTIGRAVITY DATA SOURCE: Scrape puzzles and games within these openings where the player is worse, defending against an attack, or fighting for an equalizer."
          }
        </DataSourceBadge>

        {/* Drill Title Header */}
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <span className="font-semibold block text-foreground mb-1">
            Drill {drillIdx + 1}: {drill.title}
          </span>
          <span className="text-xs text-muted-foreground">
            Find White's defensive resource to neutralize Black's threats.
          </span>
        </div>

        {/* Status Feedback */}
        {status !== "idle" && (
          <div
            key={status}
            className={`flex items-start gap-3 rounded-xl border p-4 animate-in fade-in slide-in-from-right-2 ${
              status === "held"
                ? "border-success/40 bg-success/10 text-success"
                : "border-mistake/40 bg-mistake/10 text-mistake"
            }`}
          >
            {status === "held" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-semibold block">{feedback}</span>
              {status === "held" && (
                <p className="mt-2 text-xs text-foreground/80 leading-relaxed">
                  {drill.explanation}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Threat Tracker */}
        <section className="rounded-xl border border-mistake/50 bg-mistake/10 p-4 animate-in fade-in">
          <h2 className="mb-2.5 flex items-center gap-2 font-semibold text-sm text-mistake">
            <AlertTriangle className="h-4 w-4 animate-pulse" /> Threat Tracker
          </h2>
          <ul className="space-y-2">
            {drill.threats.map((t) => (
              <li
                key={t.square}
                className="flex items-center gap-3 rounded-md bg-background/60 p-2 text-xs"
              >
                <span className="rounded bg-mistake px-1.5 py-0.5 font-mono text-[11px] font-semibold text-mistake-foreground">
                  {t.square}
                </span>
                <span className="text-foreground/90">{t.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <Panel title="Defensive checklist" icon={<Shield className="h-4 w-4 text-primary" />}>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>What is the opponent's most forcing move?</li>
            <li>Can you capture or trade the key attacking piece?</li>
            <li>Is there a counter-threat or escape square (luft)?</li>
          </ul>
        </Panel>

        <Button variant="secondary" size="sm" onClick={() => setShowThreats((s) => !s)}>
          <Eye className="h-4 w-4 mr-1.5" /> {showThreats ? "Hide" : "Show"} threat squares
        </Button>
      </TrainingLayout>
    </div>
  );
}
