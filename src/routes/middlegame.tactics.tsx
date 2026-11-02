import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  SkipForward,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { tacticsPuzzles, type TacticsPuzzle } from "@/lib/mock-data";

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
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const puzzle = tacticsPuzzles[puzzleIndex] ?? tacticsPuzzles[0];

  const [currentFen, setCurrentFen] = useState(puzzle.fen);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "correct" | "completed" | "wrong">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [streak, setStreak] = useState(4);

  // Initialize or reset game on puzzle change
  const chess = useMemo(() => new Chess(puzzle.fen), [puzzle.fen]);

  const resetCurrentPuzzle = () => {
    chess.load(puzzle.fen);
    setCurrentFen(puzzle.fen);
    setStepIndex(0);
    setStatus("idle");
    setFeedback(null);
    setShowHint(false);
  };

  const nextPuzzle = () => {
    const nextIdx = (puzzleIndex + 1) % tacticsPuzzles.length;
    setPuzzleIndex(nextIdx);
    const nextP = tacticsPuzzles[nextIdx];
    chess.load(nextP.fen);
    setCurrentFen(nextP.fen);
    setStepIndex(0);
    setStatus("idle");
    setFeedback(null);
    setShowHint(false);
  };

  const onMove = (from: string, to: string) => {
    if (status === "completed") return false;

    const attemptedLan = `${from}${to}`;
    const expectedLan = puzzle.solutionMovesLan[stepIndex];

    try {
      const legalMoves = chess.moves({ verbose: true });
      const isLegal = legalMoves.some((m) => m.from === from && m.to === to);
      if (!isLegal) {
        return false;
      }

      // Check if move matches puzzle solution
      const isCorrectSolutionMove =
        attemptedLan.toLowerCase() === expectedLan.toLowerCase() ||
        // Check for promotion format if any
        attemptedLan.slice(0, 4).toLowerCase() === expectedLan.slice(0, 4).toLowerCase();

      if (isCorrectSolutionMove) {
        const moveResult = chess.move({ from, to });
        if (!moveResult) return false;

        const nextStep = stepIndex + 1;
        setCurrentFen(chess.fen());

        // Check if there is an automatic opponent response
        if (nextStep < puzzle.solutionMovesLan.length) {
          const opponentLan = puzzle.solutionMovesLan[nextStep];
          const opponentFrom = opponentLan.slice(0, 2);
          const opponentTo = opponentLan.slice(2, 4);

          setStatus("correct");
          setFeedback("Excellent move! Opponent is responding...");

          setTimeout(() => {
            chess.move({ from: opponentFrom, to: opponentTo });
            setCurrentFen(chess.fen());
            setStepIndex(nextStep + 1);

            if (nextStep + 1 >= puzzle.solutionMovesLan.length) {
              setStatus("completed");
              setFeedback("Puzzle solved! Brilliant tactical vision.");
              setStreak((s) => s + 1);
            } else {
              setFeedback("Find the continuation move.");
            }
          }, 350);
        } else {
          setStatus("completed");
          setFeedback("Puzzle solved! Brilliant tactical vision.");
          setStreak((s) => s + 1);
        }
        return true;
      } else {
        // Wrong solution move
        setStatus("wrong");
        setFeedback("Not the best move in this position. Look for forcing lines!");
        setStreak(0);
        return false;
      }
    } catch {
      return false;
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Middlegame · 3a"
        title="Tactics Training"
        description="Find the best move. Puzzles come from your own openings."
      />
      <TrainingLayout board={<ChessBoard fen={currentFen} onMove={onMove} />}>
        <DataSourceBadge>
          {
            "// ANTIGRAVITY DATA SOURCE: Filter Lichess open-source puzzle database by matching Opening Tags or target FEN positions."
          }
        </DataSourceBadge>

        <Panel title={`Puzzle ${puzzleIndex + 1} of ${tacticsPuzzles.length}`}>
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
            <span className="font-semibold text-foreground text-sm">{puzzle.title}</span>
            <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {puzzle.theme}
            </span>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Opening</dt>
              <dd className="font-medium text-xs truncate" title={puzzle.opening}>
                {puzzle.opening}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Rating</dt>
              <dd className="font-mono text-xs">{puzzle.rating}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Streak</dt>
              <dd className="font-mono text-xs text-success font-semibold">{streak}</dd>
            </div>
          </dl>
        </Panel>

        {/* Feedback Banner */}
        {status !== "idle" && (
          <div
            key={status + stepIndex}
            className={`flex items-start gap-3 rounded-xl border p-4 animate-in fade-in slide-in-from-right-2 ${
              status === "completed" || status === "correct"
                ? "border-success/40 bg-success/10 text-success"
                : "border-mistake/40 bg-mistake/10 text-mistake"
            }`}
          >
            {status === "completed" || status === "correct" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-medium block">{feedback}</span>
              {status === "completed" && (
                <p className="mt-2 text-xs text-foreground/80 leading-relaxed">
                  {puzzle.explanation}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Hint Display */}
        {showHint && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed text-foreground animate-in fade-in">
            <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
              <Sparkles className="h-3.5 w-3.5" /> Coach Hint
            </div>
            {puzzle.hint}
          </div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowHint((s) => !s)}>
            <Lightbulb className="h-4 w-4" /> {showHint ? "Hide Hint" : "Hint"}
          </Button>

          <Button variant="secondary" size="sm" onClick={resetCurrentPuzzle}>
            <RotateCcw className="h-4 w-4" /> Retry
          </Button>

          <Button variant="default" size="sm" onClick={nextPuzzle}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </TrainingLayout>
    </div>
  );
}
