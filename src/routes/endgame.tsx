import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Dna,
  Flame,
  Gauge,
  Info,
  Play,
  PlayCircle,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { demonstrationSteps, practicalEndgames, theoreticalEndgames } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useChessTraining } from "@/context/useChessTraining";
import { stockfishEngine } from "@/engine/stockfishClient";
import {
  calculatePawnDnaSimilarity,
  extractPawnDna,
  type PawnDnaComparisonResult,
} from "@/utils/pawnStructureDna";

export const Route = createFileRoute("/endgame")({
  head: () => ({
    meta: [
      { title: "Endgame Laboratory — Chess Buddy" },
      {
        name: "description",
        content:
          "Master theoretical endgames and practical endings filtered by Pawn Structure DNA from your repertoire.",
      },
      { property: "og:title", content: "Endgame Laboratory — Chess Buddy" },
      {
        property: "og:description",
        content:
          "Master theoretical endgames and practical endings filtered by Pawn Structure DNA from your repertoire.",
      },
    ],
  }),
  component: Endgame,
});

type Mode = "theoretical" | "practical";
type SessionStatus = "playing" | "won" | "resigned" | "drawn" | "failed";

interface PracticalListItem {
  id: string;
  title: string;
  players: string;
  target: "Convert the Win" | "Hold the Draw" | "Defend and Hold" | "Force a Draw";
  fen: string;
  isRepertoire?: boolean;
  repertoireName?: string;
  variationId?: string;
  perspective?: "white" | "black";
  pawnDnaMatchPct?: number;
  structureName?: string;
  moveNumber?: number;
}

function Endgame() {
  const { savedVariations, activeVariation, setActiveVariation, recordEndgameSolved, telemetry } =
    useChessTraining();
  const [mode, setMode] = useState<Mode>("practical");
  const [theoId, setTheoId] = useState(theoreticalEndgames[1]?.id ?? "kp");
  const [selectedVarFilter, setSelectedVarFilter] = useState<string>("all");

  // Merge dynamic practical endgames extracted from saved repertoire with curated defaults
  const practicalList = useMemo<PracticalListItem[]>(() => {
    const repertoireItems: PracticalListItem[] = [];

    for (const v of savedVariations) {
      if (v.endgames && v.endgames.length > 0) {
        for (const eg of v.endgames) {
          repertoireItems.push({
            id: eg.id,
            title: `Move ${eg.moveNumber} · ${eg.target}`,
            players: `${eg.players}`,
            target: eg.target,
            fen: eg.fen,
            isRepertoire: true,
            repertoireName: v.name,
            variationId: v.id,
            perspective: v.perspective || "white",
            pawnDnaMatchPct: eg.pawnDnaMatchPct ?? 88,
            structureName: eg.structureName ?? "Dynamic Pawn Skeleton",
            moveNumber: eg.moveNumber,
          });
        }
      }
    }

    const curated: PracticalListItem[] = practicalEndgames.map((e) => ({
      id: e.id,
      title: e.title,
      players: e.players,
      target: e.target as PracticalListItem["target"],
      fen: e.fen,
      isRepertoire: false,
      repertoireName: "Curated Classic",
      perspective: "white",
      pawnDnaMatchPct: 82,
      structureName: "Open / Semi-Open Center",
      moveNumber: 45,
    }));

    return [...repertoireItems, ...curated];
  }, [savedVariations]);

  // Filter practical items if specific variation is selected
  const filteredPracticalList = useMemo(() => {
    if (selectedVarFilter === "all") return practicalList;
    return practicalList.filter(
      (item) => item.variationId === selectedVarFilter || !item.isRepertoire,
    );
  }, [practicalList, selectedVarFilter]);

  const [pracId, setPracId] = useState<string>(() => practicalList[0]?.id ?? "p1");
  const [demoOpen, setDemoOpen] = useState(false);

  // Active endgame item
  const activeItem = useMemo(() => {
    if (mode === "theoretical") {
      const theo = theoreticalEndgames.find((e) => e.id === theoId) ?? theoreticalEndgames[0];
      return {
        id: theo.id,
        title: theo.name,
        players: theo.desc,
        target: "Convert the Win" as const,
        fen: theo.fen,
        isRepertoire: false,
        perspective: "white" as const,
        pawnDnaMatchPct: 100,
        structureName: "Theoretical Geometry",
      };
    }
    return (
      filteredPracticalList.find((e) => e.id === pracId) ??
      filteredPracticalList[0] ??
      practicalList[0]
    );
  }, [mode, theoId, pracId, filteredPracticalList, practicalList]);

  const initialFen = activeItem?.fen ?? practicalEndgames[0]?.fen;

  // Board and session state
  const chessRef = useRef(new Chess(initialFen));
  const [currentFen, setCurrentFen] = useState(initialFen);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [botMessage, setBotMessage] = useState<string | null>(null);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: string; to: string } | null>(
    null,
  );

  // Engine evaluation & Resignation streak
  const [evalScoreCp, setEvalScoreCp] = useState<number>(0);
  const [winningMovesStreak, setWinningMovesStreak] = useState<number>(0);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("playing");
  const [outcomeMessage, setOutcomeMessage] = useState<string>("");
  const [userOrientation, setUserOrientation] = useState<"white" | "black">("white");

  // Pawn DNA Calculation for active endgame
  const pawnDnaResult = useMemo<PawnDnaComparisonResult | null>(() => {
    if (!initialFen) return null;
    const egDna = extractPawnDna(initialFen);
    if (activeVariation?.finalFen) {
      const openDna = extractPawnDna(activeVariation.finalFen);
      return calculatePawnDnaSimilarity(openDna, egDna);
    }
    return {
      similarityPct: activeItem?.pawnDnaMatchPct ?? 85,
      isMatch: true,
      centralMatch: true,
      fileDeviationCount: 1,
      structureName: activeItem?.structureName ?? egDna.structureName,
      details: `Pawn Skeleton: ${activeItem?.structureName ?? egDna.structureName}`,
    };
  }, [initialFen, activeVariation, activeItem]);

  // Keep board in sync when item changes
  useEffect(() => {
    try {
      chessRef.current = new Chess(initialFen);
    } catch {
      chessRef.current = new Chess();
    }
    setCurrentFen(initialFen);
    setBotMessage(null);
    setLastMoveHighlight(null);
    setSessionStatus("playing");
    setWinningMovesStreak(0);
    setOutcomeMessage("");

    // Set board perspective
    const targetPersp = activeItem?.perspective || activeVariation?.perspective || "white";
    setUserOrientation(targetPersp);

    // If opponent starts to move first, let bot play
    const userTurnChar = targetPersp === "white" ? "w" : "b";
    if (chessRef.current.turn() !== userTurnChar && !chessRef.current.isGameOver()) {
      triggerBotMove(chessRef.current);
    }
  }, [initialFen, activeItem, activeVariation]);

  // Reset current endgame
  const handleReset = useCallback(() => {
    try {
      chessRef.current = new Chess(initialFen);
    } catch {
      chessRef.current = new Chess();
    }
    setCurrentFen(initialFen);
    setBotMessage(null);
    setLastMoveHighlight(null);
    setSessionStatus("playing");
    setWinningMovesStreak(0);
    setOutcomeMessage("");

    const targetPersp = activeItem?.perspective || activeVariation?.perspective || "white";
    const userTurnChar = targetPersp === "white" ? "w" : "b";
    if (chessRef.current.turn() !== userTurnChar && !chessRef.current.isGameOver()) {
      triggerBotMove(chessRef.current);
    }
  }, [initialFen, activeItem, activeVariation]);

  // Advance to next position
  const handleNextPosition = useCallback(() => {
    if (mode === "theoretical") {
      const idx = theoreticalEndgames.findIndex((e) => e.id === theoId);
      const nextIdx = (idx + 1) % theoreticalEndgames.length;
      setTheoId(theoreticalEndgames[nextIdx].id);
    } else {
      const idx = filteredPracticalList.findIndex((e) => e.id === pracId);
      const nextIdx = (idx + 1) % filteredPracticalList.length;
      setPracId(filteredPracticalList[nextIdx].id);
    }
    toast.info("Loaded Next Endgame Drill");
  }, [mode, theoId, pracId, filteredPracticalList]);

  // Handle Game Over termination checks
  const handleTerminationCheck = useCallback(
    (chess: Chess, userColor: "white" | "black", target: PracticalListItem["target"]) => {
      const isTargetWin = target === "Convert the Win";

      if (chess.isCheckmate()) {
        const winner = chess.turn() === "w" ? "black" : "white";
        if (winner === userColor) {
          setSessionStatus("won");
          setOutcomeMessage("Checkmate! Perfect endgame conversion (+50 pts).");
          toast.success("Checkmate Delivered! (+50 pts)", {
            description: "Flawless technical execution.",
          });
          recordEndgameSolved(true, 50);
        } else {
          setSessionStatus("failed");
          setOutcomeMessage("Checkmate by Stockfish. Technical loss.");
          toast.error("Defeated by Checkmate", {
            description: "Stockfish capitalized on the structural weakness.",
          });
        }
        return true;
      }

      if (chess.isDraw()) {
        if (!isTargetWin) {
          setSessionStatus("won");
          setOutcomeMessage("Theoretical Draw Held! Outstanding defense (+30 pts).");
          toast.success("Draw Held! (+30 pts)", {
            description: "You successfully defended the position against Stockfish Level 20.",
          });
          recordEndgameSolved(true, 30);
        } else {
          setSessionStatus("drawn");
          setOutcomeMessage("Draw reached. The winning technical advantage was lost (0 pts).");
          toast.info("Escaped Draw (0 pts)", {
            description: "The win slipped away into a theoretical draw.",
          });
          recordEndgameSolved(false, 0);
        }
        return true;
      }

      return false;
    },
    [recordEndgameSolved],
  );

  // Trigger Stockfish engine defense
  const triggerBotMove = useCallback(
    async (chess: Chess) => {
      if (chess.isGameOver()) return;

      setIsBotThinking(true);
      setBotMessage("Stockfish Level 20 is calculating defense (Depth 16)...");

      try {
        const analysis = await stockfishEngine.evaluate(chess.fen(), {
          depth: 16,
          movetime: 650,
        });

        const bestMoveLan = analysis.bestMove;
        if (bestMoveLan && bestMoveLan.length >= 4) {
          const bFrom = bestMoveLan.slice(0, 2);
          const bTo = bestMoveLan.slice(2, 4);
          const promo = bestMoveLan.length > 4 ? bestMoveLan[4] : undefined;

          setTimeout(() => {
            try {
              const botMoveRes = chess.move({ from: bFrom, to: bTo, promotion: promo });
              if (botMoveRes) {
                setCurrentFen(chess.fen());
                setLastMoveHighlight({ from: bFrom, to: bTo });
                setBotMessage(`Stockfish played ${botMoveRes.san}. Your turn.`);

                // Check termination after bot move
                const target = activeItem?.target || "Convert the Win";
                handleTerminationCheck(chess, userOrientation, target);
              }
            } catch (err) {
              console.warn("Bot move error:", err);
            }
            setIsBotThinking(false);
          }, 450);
        } else {
          setIsBotThinking(false);
          setBotMessage("Your turn.");
        }
      } catch (err) {
        setIsBotThinking(false);
        setBotMessage("Your turn.");
      }
    },
    [activeItem, userOrientation, handleTerminationCheck],
  );

  // User Move Handler
  const onMove = useCallback(
    (from: string, to: string) => {
      if (isBotThinking || sessionStatus !== "playing") return false;

      const chess = chessRef.current;
      const userTurnChar = userOrientation === "white" ? "w" : "b";

      if (chess.turn() !== userTurnChar) {
        return false;
      }

      try {
        const legalMoves = chess.moves({ verbose: true });
        const isLegal = legalMoves.some((m) => m.from === from && m.to === to);
        if (!isLegal) return false;

        const userMove = chess.move({ from, to, promotion: "q" });
        if (!userMove) return false;

        setCurrentFen(chess.fen());
        setLastMoveHighlight({ from, to });

        const target = activeItem?.target || "Convert the Win";
        const isTargetWin = target === "Convert the Win";

        // 1. Check immediate game over (Checkmate / Stalemate)
        if (chess.isGameOver()) {
          handleTerminationCheck(chess, userOrientation, target);
          return true;
        }

        // 2. Evaluate with Stockfish for Resignation Meter and Blunder detection
        setIsBotThinking(true);
        setBotMessage("Stockfish is calculating defense...");

        stockfishEngine
          .evaluate(chess.fen(), { depth: 16, movetime: 700, lastMove: { from, to } })
          .then((analysis) => {
            // User advantage in pawns (positive = user winning)
            const userAdvantage =
              userOrientation === "white" ? analysis.evalWhite : -analysis.evalWhite;
            setEvalScoreCp(Math.round(userAdvantage * 100));

            const isForcedMateForUser =
              analysis.mateAnalysis?.isMateInX &&
              ((userOrientation === "white" && (analysis.mateAnalysis.mateMoves || 0) > 0) ||
                (userOrientation === "black" && (analysis.mateAnalysis.mateMoves || 0) < 0));

            // Resignation Handover: sustained > +8.0 or #Mate in X for 3 moves
            if (isTargetWin && (userAdvantage >= 8.0 || isForcedMateForUser)) {
              setWinningMovesStreak((prev) => {
                const next = prev + 1;
                if (next >= 3) {
                  setIsBotThinking(false);
                  setSessionStatus("resigned");
                  setOutcomeMessage("Stockfish resigns. Winning technical advantage demonstrated!");
                  toast.success("Stockfish Resigns! (+50 pts)", {
                    description:
                      "Sustained overwhelming advantage. Stockfish yielded the position.",
                  });
                  recordEndgameSolved(true, 50);
                }
                return next;
              });

              if (winningMovesStreak + 1 >= 3) {
                return;
              }
            } else {
              setWinningMovesStreak(0);
            }

            // Blunder Detection
            if (isTargetWin && userAdvantage < -2.5) {
              setIsBotThinking(false);
              setSessionStatus("failed");
              setOutcomeMessage("Inaccuracy/Blunder. Technical advantage surrendered.");
              toast.error("Advantage Lost", {
                description:
                  "Evaluation slipped into a lost position. Click Retry to master the line.",
              });
              return;
            } else if (!isTargetWin && userAdvantage < -3.5) {
              setIsBotThinking(false);
              setSessionStatus("failed");
              setOutcomeMessage("Defense collapsed. Stockfish broke through the fortress.");
              toast.error("Defense Collapsed", {
                description: "Stockfish penetrated your defense. Click Retry to rebuild the hold.",
              });
              return;
            }

            // 3. Trigger Bot reply move
            const bestMoveLan = analysis.bestMove;
            if (bestMoveLan && bestMoveLan.length >= 4) {
              const bFrom = bestMoveLan.slice(0, 2);
              const bTo = bestMoveLan.slice(2, 4);
              const promo = bestMoveLan.length > 4 ? bestMoveLan[4] : undefined;

              setTimeout(() => {
                try {
                  const botMove = chess.move({ from: bFrom, to: bTo, promotion: promo });
                  if (botMove) {
                    setCurrentFen(chess.fen());
                    setLastMoveHighlight({ from: bFrom, to: bTo });
                    setBotMessage(`Stockfish played ${botMove.san}. Your turn.`);

                    handleTerminationCheck(chess, userOrientation, target);
                  }
                } catch (e) {
                  console.warn("Engine reply error:", e);
                }
                setIsBotThinking(false);
              }, 450);
            } else {
              setIsBotThinking(false);
              setBotMessage("Your turn.");
            }
          })
          .catch(() => {
            setIsBotThinking(false);
            setBotMessage("Your turn.");
          });

        return true;
      } catch {
        return false;
      }
    },
    [
      isBotThinking,
      sessionStatus,
      userOrientation,
      activeItem,
      winningMovesStreak,
      handleTerminationCheck,
      recordEndgameSolved,
    ],
  );

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <PageHeader
        eyebrow="Section 5 · Practical Endgame Suite"
        title="Endgame Laboratory"
        description="Master practical endings filtered by Pawn Structure DNA from your repertoire lines and theoretical classical geometries."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              {(["practical", "theoretical"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setBotMessage(null);
                    setWinningMovesStreak(0);
                    setSessionStatus("playing");
                  }}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all",
                    mode === m
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m} Endgames
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUserOrientation((prev) => (prev === "white" ? "black" : "white"))}
              title="Flip Board Orientation"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Flip ({userOrientation})
            </Button>
          </div>
        }
      />

      <TrainingLayout
        board={
          <div className="space-y-3">
            {/* Target & DNA Header Banner */}
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                    activeItem?.target === "Convert the Win"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30",
                  )}
                >
                  {activeItem?.target === "Convert the Win" ? (
                    <Trophy className="h-3.5 w-3.5" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  Objective: {activeItem?.target}
                </span>

                {activeItem?.isRepertoire && (
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Repertoire Line
                  </span>
                )}
              </div>

              {/* Pawn DNA Badge */}
              {pawnDnaResult && (
                <div
                  className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  title={pawnDnaResult.details}
                >
                  <Dna className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-semibold">
                    Pawn DNA: {pawnDnaResult.similarityPct}% Match
                  </span>
                  <span className="hidden sm:inline text-muted-foreground">
                    ({pawnDnaResult.structureName})
                  </span>
                </div>
              )}
            </div>

            {/* Chessboard Container */}
            <div className="relative">
              <ChessBoard
                fen={currentFen}
                orientation={userOrientation}
                onMove={onMove}
                lastMoveHighlight={lastMoveHighlight}
              />

              {/* Top Controls Overlay */}
              <div className="absolute right-3 top-3 flex items-center gap-1.5 z-10">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReset}
                  title="Restart position"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDemoOpen(true)}
                  title="View step-by-step master technique"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Demonstration
                </Button>
              </div>

              {/* Victory / Defeat Modal Overlay */}
              {sessionStatus !== "playing" && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-sm p-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-2xl text-center space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      {sessionStatus === "won" || sessionStatus === "resigned" ? (
                        <Trophy className="h-8 w-8 text-primary animate-bounce" />
                      ) : sessionStatus === "drawn" ? (
                        <Shield className="h-8 w-8 text-sky-500" />
                      ) : (
                        <XCircle className="h-8 w-8 text-destructive" />
                      )}
                    </div>

                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">
                        {sessionStatus === "won"
                          ? "Drill Completed!"
                          : sessionStatus === "resigned"
                            ? "Stockfish Resigned!"
                            : sessionStatus === "drawn"
                              ? "Draw Reached"
                              : "Drill Incomplete"}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{outcomeMessage}</p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/50 p-3 text-xs font-mono flex items-center justify-around">
                      <div>
                        <span className="text-muted-foreground block">Mastery Points</span>
                        <span className="font-bold text-base text-primary">
                          {sessionStatus === "won" || sessionStatus === "resigned"
                            ? "+50 pts"
                            : sessionStatus === "drawn" && activeItem?.target !== "Convert the Win"
                              ? "+30 pts"
                              : "0 pts"}
                        </span>
                      </div>
                      <div className="h-8 w-px bg-border" />
                      <div>
                        <span className="text-muted-foreground block">Opponent</span>
                        <span className="font-bold text-base text-foreground">Stockfish 20</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button variant="outline" onClick={handleReset} className="w-full">
                        <RotateCcw className="h-4 w-4 mr-1.5" /> Retry
                      </Button>
                      <Button onClick={handleNextPosition} className="w-full">
                        Next Drill <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Resignation Pressure Meter */}
            {activeItem?.target === "Convert the Win" && (
              <div className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Gauge className="h-4 w-4 text-primary" />
                    Resignation Pressure Gauge (Stockfish Skill 20)
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {winningMovesStreak} / 3 Decisive Moves
                  </span>
                </div>
                <Progress value={(winningMovesStreak / 3) * 100} className="h-2" />
                <p className="text-[11px] text-muted-foreground">
                  Maintain an overwhelming advantage (&gt;+8.0 pawns or forced checkmate) for 3
                  consecutive moves to force Stockfish resignation.
                </p>
              </div>
            )}

            {/* Bot Status & Thinking Banner */}
            {botMessage && (
              <div className="rounded-lg border border-border bg-card p-2.5 text-xs font-mono text-muted-foreground flex items-center gap-2 animate-in fade-in">
                <Bot
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isBotThinking ? "text-primary animate-spin" : "text-primary",
                  )}
                />
                <span className="truncate">{botMessage}</span>
              </div>
            )}
          </div>
        }
      >
        <div
          key={mode}
          className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-3 duration-300"
        >
          {mode === "theoretical" ? (
            <>
              <DataSourceBadge kind="hook">
                {
                  "// SYZYGY TABLEBASE INTEGRATION: Stockfish 20 defense tuned for theoretical precision."
                }
              </DataSourceBadge>
              <Panel title="Theoretical Master Geometry">
                <ul className="space-y-1">
                  {theoreticalEndgames.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => {
                          setTheoId(e.id);
                          setSessionStatus("playing");
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-accent",
                          theoId === e.id && "bg-accent ring-1 ring-primary/50",
                        )}
                      >
                        <span>
                          <span className="block font-medium">{e.name}</span>
                          <span className="text-xs text-muted-foreground">{e.desc}</span>
                        </span>
                        <Bot className="h-4 w-4 text-primary" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          ) : (
            <>
              <DataSourceBadge>
                {
                  "// PAWN STRUCTURE DNA MATCH: Endgames clipped from master games passing through your openings."
                }
              </DataSourceBadge>

              {/* Repertoire Line Filter */}
              {savedVariations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium shrink-0">
                    Filter by Line:
                  </span>
                  <select
                    value={selectedVarFilter}
                    onChange={(e) => setSelectedVarFilter(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">All Repertoire Endgames ({practicalList.length})</option>
                    {savedVariations.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.endgames?.length || 0} endgames)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Panel title={`Practical Playlist (${filteredPracticalList.length} positions)`}>
                <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                  {filteredPracticalList.map((e, i) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setPracId(e.id);
                        setSessionStatus("playing");
                        setWinningMovesStreak(0);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent border border-transparent",
                        pracId === e.id && "bg-accent ring-1 ring-primary/50 border-primary/30",
                      )}
                    >
                      <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <PlayCircle className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="block truncate font-medium text-sm">{e.title}</span>
                          {e.isRepertoire && (
                            <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-semibold text-primary shrink-0">
                              Repertoire
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate block">
                          {e.players}
                        </span>
                        {e.structureName && (
                          <span className="text-[11px] text-primary/80 font-mono truncate block">
                            {e.structureName}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                          e.target === "Convert the Win"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                        )}
                      >
                        {e.target}
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>
            </>
          )}

          {/* Quick Mastery Summary Card */}
          <Panel title="Laboratory Telemetry">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                <span className="text-xs text-muted-foreground block">Endgames Solved</span>
                <span className="font-display text-2xl font-bold text-foreground">
                  {telemetry.endgamesSolved}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                <span className="text-xs text-muted-foreground block">Perfect Conversions</span>
                <span className="font-display text-2xl font-bold text-primary">
                  {telemetry.perfectConversions}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </TrainingLayout>

      {/* Demonstration Mode Modal */}
      {demoOpen && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-2xl rounded-xl border border-primary/40 bg-popover shadow-2xl animate-in slide-in-from-bottom-6 fade-in duration-300 md:left-[calc(var(--sidebar-width)+1rem)]">
          <Collapsible defaultOpen>
            <div className="flex items-center justify-between border-b border-border p-4">
              <CollapsibleTrigger className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Demonstration Mode{" "}
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDemoOpen(false)}
                aria-label="Close"
              >
                <X />
              </Button>
            </div>
            <CollapsibleContent>
              <div className="p-4 space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground block mb-1">
                    Grandmaster Technique & Structure Blueprint:
                  </span>
                  {pawnDnaResult?.structureName
                    ? `This position features the ${pawnDnaResult.structureName}. Maintain king activity, preserve pawn levers, and restrict counterplay.`
                    : "Preserve the key central files and activate the king before pushing passed pawns."}
                </div>
                <ol className="max-h-64 space-y-2.5 overflow-auto pr-1">
                  {demonstrationSteps.map((s, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-xs animate-in fade-in"
                      style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
                    >
                      <span className="w-16 shrink-0 font-mono font-semibold text-primary">
                        {s.move}
                      </span>
                      <span className="text-muted-foreground">{s.note}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
