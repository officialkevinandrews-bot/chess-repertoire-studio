import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { guessTheMove } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useChessTraining } from "@/context/useChessTraining";

export const Route = createFileRoute("/middlegame/guess-the-move")({
  head: () => ({
    meta: [
      { title: "Guess the Move — Chess Buddy" },
      {
        name: "description",
        content:
          "Replay grandmaster games from your openings and test your strategic understanding.",
      },
      { property: "og:title", content: "Guess the Move — Chess Buddy" },
      {
        property: "og:description",
        content:
          "Replay grandmaster games from your openings and test your strategic understanding.",
      },
    ],
  }),
  component: GuessTheMove,
});

// ANTIGRAVITY DATA SOURCE: Pull full Grandmaster games matching the Opening Creator's FEN, starting the guess-the-move loop from move 10-12 onward.
function GuessTheMove() {
  const { savedVariations, activeVariation, setActiveVariation, deleteVariation } =
    useChessTraining();

  // Find variation with games, or active variation, or fallback
  const currentVar =
    activeVariation?.games && activeVariation.games.length > 0
      ? activeVariation
      : savedVariations.find((v) => v.games && v.games.length > 0) || null;

  const [gameIdx, setGameIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [playedMoveSan, setPlayedMoveSan] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState<"idle" | "correct" | "alternative">("idle");

  // Determine active game with index clamping
  const activeGame =
    currentVar?.games?.[Math.min(gameIdx, Math.max(0, (currentVar.games.length || 1) - 1))];

  // Replay game up to the variation's terminal ply
  const { initialFen, expectedMoveSan, currentFen, chess } = useMemo(() => {
    if (!activeGame || !activeGame.movesSan || activeGame.movesSan.length === 0) {
      return {
        initialFen: guessTheMove.fen,
        expectedMoveSan: "cxd5",
        currentFen: guessTheMove.fen,
        chess: new Chess(guessTheMove.fen),
      };
    }

    const c = new Chess();
    const targetPly = Math.min(activeGame.plyAtVariation || 20, activeGame.movesSan.length - 1);

    for (let i = 0; i < targetPly; i++) {
      try {
        c.move(activeGame.movesSan[i]);
      } catch {
        break;
      }
    }

    const startFen = c.fen();
    const expected = activeGame.movesSan[targetPly] || "cxd5";

    return {
      initialFen: startFen,
      expectedMoveSan: expected,
      currentFen: startFen,
      chess: c,
    };
  }, [activeGame]);

  const [boardFen, setBoardFen] = useState(initialFen);

  const resetGame = () => {
    setBoardFen(initialFen);
    setPicked(null);
    setPlayedMoveSan(null);
    setMoveStatus("idle");
  };

  const nextGame = () => {
    if (currentVar?.games && currentVar.games.length > 1) {
      const nextIdx = (gameIdx + 1) % currentVar.games.length;
      setGameIdx(nextIdx);
    }
    resetGame();
  };

  const handleBoardMove = (from: string, to: string) => {
    if (moveStatus === "correct") return false;

    try {
      const c = new Chess(boardFen);
      const legal = c.moves({ verbose: true });
      const m = legal.find((mv) => mv.from === from && mv.to === to);
      if (!m) return false;

      const res = c.move({ from, to });
      if (!res) return false;

      setBoardFen(c.fen());
      setPlayedMoveSan(res.san);

      if (res.san.toLowerCase() === expectedMoveSan.toLowerCase()) {
        setMoveStatus("correct");
        setPicked("b"); // highlight correct option
      } else {
        setMoveStatus("alternative");
      }
      return true;
    } catch {
      return false;
    }
  };

  const gameTitle = activeGame
    ? `${activeGame.white.name} (${activeGame.white.rating}) – ${activeGame.black.name} (${activeGame.black.rating}), ${activeGame.year}`
    : guessTheMove.game;

  const moveNum = activeGame
    ? Math.floor((activeGame.plyAtVariation || 20) / 2) + 1
    : guessTheMove.moveNumber;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Middlegame · 3b"
        title="Guess the Move"
        description={`${gameTitle} — from move ${moveNum}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {savedVariations.length > 1 && (
              <select
                value={currentVar?.id || ""}
                onChange={(e) => {
                  const target = savedVariations.find((v) => v.id === e.target.value);
                  if (target) {
                    setActiveVariation(target);
                    setGameIdx(0);
                    resetGame();
                  }
                }}
                className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium"
              >
                {savedVariations.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.games?.length || 0} games)
                  </option>
                ))}
              </select>
            )}

            {currentVar && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  const name = currentVar.name;
                  await deleteVariation(currentVar.id);
                  toast.success(`Deleted line "${name}"`, {
                    description: "All scraped master games and practical endgames were removed.",
                  });
                  setGameIdx(0);
                  resetGame();
                }}
                title="Delete this opening line and its games"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Line
              </Button>
            )}

            {currentVar?.games && currentVar.games.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  Game {Math.min(gameIdx, currentVar.games.length - 1) + 1} of{" "}
                  {currentVar.games.length}
                </span>
                <Button size="sm" variant="outline" onClick={nextGame}>
                  Next GM Game <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            ) : undefined}
          </div>
        }
      />

      <TrainingLayout
        board={
          <div className="space-y-3">
            <ChessBoard fen={boardFen} onMove={handleBoardMove} />

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Drag pieces on the board to guess, or select a concept below.</span>
              <Button variant="ghost" size="sm" onClick={resetGame}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Position
              </Button>
            </div>
          </div>
        }
      >
        {activeGame && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-bold font-mono text-primary">
                  {activeGame.white.title || "GM"}
                </span>
                <span className="font-semibold text-sm">{activeGame.white.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  ({activeGame.white.rating})
                </span>
                <span className="text-xs text-muted-foreground">vs</span>
                <span className="font-semibold text-sm">{activeGame.black.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  ({activeGame.black.rating})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {activeGame.accuracyScore && (
                  <span className="rounded bg-success/15 border border-success/30 px-2 py-0.5 font-mono text-xs font-semibold text-success">
                    {activeGame.accuracyScore}% Accuracy
                  </span>
                )}
                {activeGame.matchType && (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs font-medium",
                      activeGame.matchType === "exact" &&
                        "border-success/40 bg-success/10 text-success",
                      activeGame.matchType === "transposition" &&
                        "border-primary/40 bg-primary/10 text-primary",
                      activeGame.matchType === "parent-ply" &&
                        "border-amber-500/40 bg-amber-500/10 text-amber-500",
                      activeGame.matchType === "structural-similarity" &&
                        "border-border bg-secondary text-muted-foreground",
                    )}
                  >
                    {activeGame.matchType === "exact"
                      ? "Exact Match"
                      : activeGame.matchType === "transposition"
                        ? "Transposition"
                        : activeGame.matchType === "parent-ply"
                          ? "Closest Sibling Line"
                          : "Structural Model"}
                  </span>
                )}
              </div>
            </div>

            {activeGame.matchNote && (
              <p className="text-xs text-muted-foreground font-mono">
                {activeGame.matchNote} · {activeGame.year} · ECO {activeGame.eco || "N/A"}
              </p>
            )}
          </div>
        )}

        <DataSourceBadge>
          {
            "// ANTIGRAVITY DATA SOURCE: Pull full Grandmaster games matching the Opening Creator's FEN, starting the guess-the-move loop from move 10-12 onward."
          }
        </DataSourceBadge>

        {/* Move Result Banner */}
        {moveStatus !== "idle" && (
          <div
            className={cn(
              "rounded-xl border p-4 animate-in fade-in flex items-start gap-3",
              moveStatus === "correct"
                ? "border-success/40 bg-success/10 text-success"
                : "border-primary/40 bg-primary/10 text-foreground",
            )}
          >
            {moveStatus === "correct" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-success" />
            ) : (
              <Sparkles className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
            )}
            <div className="space-y-1">
              <span className="font-semibold block text-sm">
                {moveStatus === "correct"
                  ? `Grandmaster Match! You played ${playedMoveSan} — exactly what was played.`
                  : `You played ${playedMoveSan}. The Grandmaster chose ${expectedMoveSan}.`}
              </span>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {activeGame
                  ? `In this position, ${activeGame.white.name} executed the strategic plan of the opening with high accuracy.`
                  : guessTheMove.insight}
              </p>
            </div>
          </div>
        )}

        {/* Concept Check Options */}
        <Panel title="Strategic Concept Check">
          <p className="mb-4 font-medium text-sm">
            {activeGame
              ? `What is the primary strategic idea for White at move ${moveNum}?`
              : guessTheMove.question}
          </p>

          <div className="grid gap-2">
            {guessTheMove.options.map((o) => {
              const state =
                picked === null
                  ? "idle"
                  : o.correct
                    ? "correct"
                    : picked === o.id
                      ? "wrong"
                      : "dim";
              return (
                <button
                  key={o.id}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(o.id);
                    if (o.correct) {
                      setMoveStatus("correct");
                    }
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-secondary p-3 text-left text-sm transition-all hover:border-primary/60 hover:bg-accent",
                    state === "correct" && "border-success bg-success/15 text-success",
                    state === "wrong" && "border-mistake bg-mistake/15 text-mistake",
                    state === "dim" && "opacity-50",
                  )}
                >
                  <span className="font-mono uppercase text-xs font-semibold">{o.id}</span>
                  <span className="text-xs">{o.text}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Grandmaster Insights & Feedback"
          icon={<GraduationCap className="h-4 w-4 text-primary" />}
        >
          {picked || moveStatus !== "idle" ? (
            <p className="text-sm leading-relaxed animate-in fade-in">
              {activeGame
                ? `Grandmaster ${activeGame.white.name} opted for ${expectedMoveSan} to maintain center control, pressure Black's pawn chain, and transition toward a favorable endgame.`
                : guessTheMove.insight}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Make a move on the board or answer the concept check to reveal the Grandmaster
              analysis.
            </p>
          )}
        </Panel>
      </TrainingLayout>
    </div>
  );
}
