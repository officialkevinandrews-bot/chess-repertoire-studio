import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Flame,
  Lightbulb,
  RotateCcw,
  Skull,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { checkmatePuzzles, type CheckmatePuzzle } from "@/lib/mock-data";
import { formatMateCategoryTitle, verifyUserCheckmateAttempt } from "@/utils/mateFilter";
import type { MateCategory } from "@/engine/stockfishTypes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/middlegame/checkmates")({
  head: () => ({
    meta: [
      { title: "Forced Checkmates — Chess Buddy" },
      {
        name: "description",
        content: "Solve forced checkmate sequences originating from your openings.",
      },
      { property: "og:title", content: "Forced Checkmates — Chess Buddy" },
      {
        property: "og:description",
        content: "Solve forced checkmate sequences originating from your openings.",
      },
    ],
  }),
  component: CheckmatesPage,
});

type FilterType = "all" | MateCategory;

function CheckmatesPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "correct" | "wrong">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const filteredPuzzles = checkmatePuzzles.filter((p) =>
    filter === "all" ? true : p.category === filter,
  );

  const activePuzzle: CheckmatePuzzle =
    filteredPuzzles[puzzleIndex % Math.max(1, filteredPuzzles.length)] || checkmatePuzzles[0];
  const currentBoardFen = boardFen ?? activePuzzle.fen;

  const handleMove = (from: string, to: string) => {
    const result = verifyUserCheckmateAttempt(currentBoardFen, { from, to }, activePuzzle.pv);

    if (result.isCorrect) {
      setStatus("correct");
      setFeedback(result.feedback);
      return true;
    } else {
      setStatus("wrong");
      setFeedback(result.feedback);
      return false;
    }
  };

  const handleNext = () => {
    setStatus("idle");
    setFeedback(null);
    setShowSolution(false);
    setBoardFen(null);
    setPuzzleIndex((prev) => (prev + 1) % filteredPuzzles.length);
  };

  const handleReset = () => {
    setStatus("idle");
    setFeedback(null);
    setShowSolution(false);
    setBoardFen(activePuzzle.fen);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Middlegame · 3e"
        title="Checkmates Laboratory"
        description="Calculate forcing checkmate lines from custom openings. Even winning material is wrong if mate is missed."
        right={
          <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs">
            {(["all", "mate_in_1", "mate_in_2", "mate_in_3_plus"] as FilterType[]).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setFilter(cat);
                  setPuzzleIndex(0);
                  setStatus("idle");
                  setFeedback(null);
                  setShowSolution(false);
                  setBoardFen(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-all",
                  filter === cat
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {cat === "all" ? "All Mates" : formatMateCategoryTitle(cat)}
              </button>
            ))}
          </div>
        }
      />

      <TrainingLayout
        board={
          <div className="relative">
            <ChessBoard fen={currentBoardFen} onMove={handleMove} />
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <Badge variant="destructive" className="flex items-center gap-1 shadow-md">
                <Skull className="h-3.5 w-3.5" />
                <span>{formatMateCategoryTitle(activePuzzle.category)}</span>
              </Badge>
            </div>
          </div>
        }
      >
        <DataSourceBadge kind="hook">
          {
            "// ANTIGRAVITY HOOK: Engine filter parses Stockfish 'score mate X' and enforces 100% checkmate line verification."
          }
        </DataSourceBadge>

        <Panel title="Checkmate Objective" icon={<Flame className="h-4 w-4 text-mistake" />}>
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-foreground text-base">{activePuzzle.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Opening: {activePuzzle.opening}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/60 p-3 text-sm border border-border">
              <p className="text-muted-foreground">{activePuzzle.theme}</p>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-1">
              <span>Depth Target: 18</span>
              <span className="text-mistake font-semibold">
                Evaluation: #{activePuzzle.movesToMate}
              </span>
            </div>
          </div>
        </Panel>

        {status !== "idle" && (
          <div
            key={status}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-4 animate-in fade-in slide-in-from-right-2 text-sm",
              status === "correct"
                ? "border-success/40 bg-success/10 text-success"
                : "border-mistake/40 bg-mistake/10 text-mistake",
            )}
          >
            <div className="flex items-center gap-2 font-semibold">
              {status === "correct" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span>
                {status === "correct" ? "Checkmate Line Verified!" : "Incorrect Sequence"}
              </span>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{feedback}</p>
          </div>
        )}

        {showSolution && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs space-y-1 animate-in fade-in">
            <span className="font-semibold text-primary">Forced Solution Line:</span>
            <p className="font-mono text-foreground font-medium">
              {activePuzzle.sanMoves.join(" → ")}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => setShowSolution((s) => !s)}>
            <Lightbulb className="h-4 w-4" /> {showSolution ? "Hide" : "Solution"}
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button variant="default" onClick={handleNext}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </TrainingLayout>
    </div>
  );
}
