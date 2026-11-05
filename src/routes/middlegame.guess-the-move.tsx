import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Flame,
  GraduationCap,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  Sword,
  Target,
  Trash2,
  Trophy,
  Undo2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { guessTheMove } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useChessTraining } from "@/context/useChessTraining";
import { stockfishEngine } from "@/engine/stockfishClient";
import { evaluateUserMoveRelative, type RelativeScoreEvaluation } from "@/utils/relativeScoring";
import { generateStrategicMcq, type StrategicMcq } from "@/utils/strategicMcqGenerator";
import { isTechnicalEndgame, type EndgameCheckResult } from "@/utils/endgameDetector";

export const Route = createFileRoute("/middlegame/guess-the-move")({
  head: () => ({
    meta: [
      { title: "Guess the Move — Chess Buddy" },
      {
        name: "description",
        content:
          "Interactive Middlegame Trainer: guess master moves, master strategic reasoning with MCQs, and convert historical resignations against Stockfish.",
      },
    ],
  }),
  component: GuessTheMove,
});

function GuessTheMove() {
  const {
    savedVariations,
    activeVariation,
    setActiveVariation,
    deleteVariation,
    recordTrainingResult,
  } = useChessTraining();

  // Active variation priority: selected active, or first with games, or first saved
  const currentVar =
    activeVariation?.games && activeVariation.games.length > 0
      ? activeVariation
      : savedVariations.find((v) => v.games && v.games.length > 0) || savedVariations[0] || null;

  const perspective: "white" | "black" = currentVar?.perspective || currentVar?.color || "white";

  const [gameIdx, setGameIdx] = useState(0);

  // Clamped active game
  const activeGame =
    currentVar?.games?.[Math.min(gameIdx, Math.max(0, (currentVar.games?.length || 1) - 1))];

  // Game moves and terminal opening ply
  const historicalMoves: string[] = useMemo(() => {
    if (activeGame?.movesSan && activeGame.movesSan.length > 0) {
      return activeGame.movesSan;
    }
    return [
      "d4",
      "d5",
      "c4",
      "e6",
      "Nf3",
      "Nf6",
      "Nc3",
      "Be7",
      "Bg5",
      "O-O",
      "e3",
      "h6",
      "Bh4",
      "b6",
      "cxd5",
      "Nxd5",
      "Bxe7",
      "Qxe7",
      "Nxd5",
      "exd5",
      "Be2",
      "b6",
      "O-O",
      "Bb7",
      "Rfd1",
      "Rac8",
      "Qa4",
      "a6",
      "dxc5",
      "bxc5",
      "Qa5",
      "Nf6",
      "Rac1",
      "Rfd8",
      "Qa3",
      "Ne4",
      "Nd2",
      "Nf6",
      "Bf3",
      "Qe5",
      "b3",
      "Qe7",
    ];
  }, [activeGame]);

  const openingTerminalPly = useMemo(() => {
    if (activeGame?.plyAtVariation && activeGame.plyAtVariation > 0) {
      return Math.min(activeGame.plyAtVariation, historicalMoves.length - 1);
    }
    if (currentVar?.moves && currentVar.moves.length > 0) {
      return Math.min(currentVar.moves.length, historicalMoves.length - 1);
    }
    return 10;
  }, [activeGame, currentVar, historicalMoves]);

  // Current board state and ply index
  const [currentPly, setCurrentPly] = useState(openingTerminalPly);
  const [boardFen, setBoardFen] = useState("");
  const [isOpponentThinking, setIsOpponentThinking] = useState(false);
  const [isEvaluatingMove, setIsEvaluatingMove] = useState(false);

  // Stockfish Handover status (when master game ended historically by resignation)
  const [isStockfishHandover, setIsStockfishHandover] = useState(false);

  // Turn evaluation and MCQ phase
  const [pendingEval, setPendingEval] = useState<RelativeScoreEvaluation | null>(null);
  const [activeMcq, setActiveMcq] = useState<StrategicMcq | null>(null);
  const [selectedMcqId, setSelectedMcqId] = useState<string | null>(null);
  const [mcqResolved, setMcqResolved] = useState(false);
  const [stagedBasePoints, setStagedBasePoints] = useState(0);

  // Turn state & alerts
  const [lastPlayedUserMove, setLastPlayedUserMove] = useState<string | null>(null);
  const [turnFeedback, setTurnFeedback] = useState<{
    type: "success" | "warning" | "blunder" | "info";
    title: string;
    message: string;
  } | null>(null);

  // Endgame Celebration Modal state
  const [endgameResult, setEndgameResult] = useState<EndgameCheckResult | null>(null);

  // Scoring HUD state
  const [totalScore, setTotalScore] = useState(0);
  const [correctMoveAttempts, setCorrectMoveAttempts] = useState(0);
  const [totalMoveAttempts, setTotalMoveAttempts] = useState(0);
  const [masterMatchesCount, setMasterMatchesCount] = useState(0);
  const [pointsPopup, setPointsPopup] = useState<string | null>(null);

  // Initialize or reset board up to current target ply
  const setupBoardAtPly = useCallback(
    (ply: number) => {
      const c = new Chess();
      for (let i = 0; i < ply && i < historicalMoves.length; i++) {
        try {
          c.move(historicalMoves[i]);
        } catch {
          break;
        }
      }
      setBoardFen(c.fen());
      return c;
    },
    [historicalMoves],
  );

  // Reset entire session when game changes
  const resetGame = useCallback(() => {
    setCurrentPly(openingTerminalPly);
    setupBoardAtPly(openingTerminalPly);
    setPendingEval(null);
    setActiveMcq(null);
    setSelectedMcqId(null);
    setMcqResolved(false);
    setStagedBasePoints(0);
    setTurnFeedback(null);
    setEndgameResult(null);
    setIsStockfishHandover(false);
    setIsOpponentThinking(false);
  }, [openingTerminalPly, setupBoardAtPly]);

  useEffect(() => {
    resetGame();
  }, [resetGame, activeGame?.id]);

  // Determine whose turn it is relative to repertoire perspective
  const currentTurnColor: "white" | "black" = useMemo(() => {
    if (!boardFen) return "white";
    const parts = boardFen.split(" ");
    return parts[1] === "w" ? "white" : "black";
  }, [boardFen]);

  const isUserTurn = currentTurnColor === perspective;

  // Trigger Opponent Move (Historical master or Stockfish handover)
  const triggerOpponentMove = useCallback(
    async (fromPly: number, currentBoardFen: string) => {
      if (isOpponentThinking) return;
      setIsOpponentThinking(true);

      const chess = new Chess(currentBoardFen);

      // 1. Check if technical endgame already reached
      const eg = isTechnicalEndgame(chess);
      if (eg.isEndgame) {
        setIsOpponentThinking(false);
        setEndgameResult(eg);
        return;
      }

      // 2. Historical Move Available
      if (fromPly < historicalMoves.length && !isStockfishHandover) {
        const nextOpponentMoveSan = historicalMoves[fromPly];
        setTimeout(() => {
          try {
            chess.move(nextOpponentMoveSan);
            const newFen = chess.fen();
            setBoardFen(newFen);
            setCurrentPly(fromPly + 1);
            setIsOpponentThinking(false);

            // Check if opponent's move triggered endgame or checkmate
            const checkAfter = isTechnicalEndgame(chess);
            if (checkAfter.isEndgame) {
              setEndgameResult(checkAfter);
            }
          } catch (e) {
            console.warn("Failed to execute historical opponent move:", e);
            setIsOpponentThinking(false);
          }
        }, 500);
        return;
      }

      // 3. Stockfish Resignation Handover: historical moves exhausted
      setIsStockfishHandover(true);
      try {
        const analysis = await stockfishEngine.evaluate(currentBoardFen, {
          depth: 13,
          movetime: 800,
        });

        const bestMoveSan = analysis.bestMoveSan;
        setTimeout(() => {
          try {
            if (bestMoveSan) {
              chess.move(bestMoveSan);
            } else {
              const legals = chess.moves();
              if (legals.length > 0) chess.move(legals[0]);
            }
            const newFen = chess.fen();
            setBoardFen(newFen);
            setCurrentPly(fromPly + 1);
            setIsOpponentThinking(false);

            const egCheck = isTechnicalEndgame(chess);
            if (egCheck.isEndgame) {
              setEndgameResult(egCheck);
            }
          } catch (e) {
            console.warn("Stockfish move play failed:", e);
            setIsOpponentThinking(false);
          }
        }, 600);
      } catch (e) {
        console.warn("Stockfish evaluation error during handover:", e);
        setIsOpponentThinking(false);
      }
    },
    [historicalMoves, isStockfishHandover, isOpponentThinking],
  );

  // Automatically trigger opponent's move if board lands on opponent turn and not awaiting MCQ
  useEffect(() => {
    if (!isUserTurn && !pendingEval && !endgameResult && boardFen && !isOpponentThinking) {
      triggerOpponentMove(currentPly, boardFen);
    }
  }, [
    isUserTurn,
    pendingEval,
    endgameResult,
    boardFen,
    currentPly,
    triggerOpponentMove,
    isOpponentThinking,
  ]);

  // Handle User Move Attempt
  const handleBoardMove = async (from: string, to: string) => {
    if (!isUserTurn || isOpponentThinking || isEvaluatingMove || pendingEval) {
      return false;
    }

    try {
      const chess = new Chess(boardFen);
      const move = chess.move({ from, to, promotion: "q" });
      if (!move) return false;

      setIsEvaluatingMove(true);
      setLastPlayedUserMove(move.san);
      setTotalMoveAttempts((prev) => prev + 1);

      // Expected master move at current ply
      const expectedMasterSan =
        currentPly < historicalMoves.length ? historicalMoves[currentPly] : move.san;

      // Evaluate position after user's move and compute relative score
      const fenAfterUser = chess.fen();
      const userAnalysis = await stockfishEngine.evaluate(fenAfterUser, {
        depth: 13,
        movetime: 600,
        lastMove: { from, to },
      });

      // Master move evaluation (simulated by executing master move in parallel)
      let masterEvalPawns = userAnalysis.evalWhite;
      try {
        const masterChess = new Chess(boardFen);
        masterChess.move(expectedMasterSan);
        const masterAnalysis = await stockfishEngine.evaluate(masterChess.fen(), {
          depth: 13,
          movetime: 600,
        });
        masterEvalPawns = masterAnalysis.evalWhite;
      } catch {
        // Fallback
      }

      const relativeEval = evaluateUserMoveRelative({
        userMoveSan: move.san,
        masterMoveSan: expectedMasterSan,
        bestEngineMoveSan: userAnalysis.bestMoveSan || expectedMasterSan,
        userEvalWhitePawns: userAnalysis.evalWhite,
        masterEvalWhitePawns: masterEvalPawns,
        userPerspective: perspective,
      });

      setIsEvaluatingMove(false);

      // Case 1: Acceptable Move (Exact Master Match, Super-GM find, Engine equivalent)
      if (relativeEval.isAcceptableMove) {
        setCorrectMoveAttempts((prev) => prev + 1);
        if (relativeEval.tier === "exact_master") {
          setMasterMatchesCount((prev) => prev + 1);
        }

        setPendingEval(relativeEval);
        setStagedBasePoints(relativeEval.baseScore);

        // Generate Dynamic Strategic MCQ
        const mcq = generateStrategicMcq({
          fenBefore: boardFen,
          fenAfter: fenAfterUser,
          moveSan: move.san,
          lastMoveUci: { from, to },
          perspective,
        });

        setActiveMcq(mcq);
        setSelectedMcqId(null);
        setMcqResolved(false);

        setTurnFeedback({
          type: "success",
          title: relativeEval.title,
          message: relativeEval.explanation,
        });

        setBoardFen(fenAfterUser);
        return true;
      }

      // Case 2: Suboptimal Move (Inaccuracy, Mistake, or Blunder)
      // Option A: Feedback provided, allow retry or reveal master move
      setTurnFeedback({
        type: relativeEval.tier === "blunder" ? "blunder" : "warning",
        title: relativeEval.title,
        message: `${relativeEval.explanation} Try again or click "Reveal Master Move" to advance.`,
      });

      recordTrainingResult(1, 0, 0);

      // Snap board back so user can retry
      setBoardFen(boardFen);
      return false;
    } catch {
      setIsEvaluatingMove(false);
      return false;
    }
  };

  // Resolve MCQ Selection
  const handleSelectMcq = (optionId: string) => {
    if (mcqResolved || !activeMcq) return;

    setSelectedMcqId(optionId);
    setMcqResolved(true);

    const isCorrect = optionId === activeMcq.correctOptionId;
    const mcqPoints = isCorrect ? 10 : 0;
    const earnedThisTurn = stagedBasePoints + mcqPoints;

    setTotalScore((prev) => prev + earnedThisTurn);
    setPointsPopup(`+${earnedThisTurn} pts!`);
    setTimeout(() => setPointsPopup(null), 2500);

    recordTrainingResult(1, 1, earnedThisTurn);

    if (isCorrect) {
      toast.success("Strategic Rationale Correct! (+10 pts)", {
        description: activeMcq.summary,
      });
    } else {
      toast.error("Incorrect Rationale (0 MCQ pts)", {
        description: "The grandmaster strategic justification is highlighted in green.",
      });
    }
  };

  // Advance to Next Turn (Option A: Resumes from the Master's Move position)
  const handleAdvanceToNextTurn = () => {
    if (!pendingEval) return;

    // Reset turn staging
    const targetPly = currentPly + 1;
    setPendingEval(null);
    setActiveMcq(null);
    setSelectedMcqId(null);
    setMcqResolved(false);
    setTurnFeedback(null);

    // Option A: Board resumes from the historical Master move position
    const c = setupBoardAtPly(targetPly);
    setCurrentPly(targetPly);

    // Check if technical endgame reached
    const eg = isTechnicalEndgame(c);
    if (eg.isEndgame) {
      setEndgameResult(eg);
      return;
    }

    // Trigger opponent's reply
    triggerOpponentMove(targetPly, c.fen());
  };

  // Reveal Master Move on blunder/mistake
  const handleRevealMasterMove = () => {
    if (currentPly >= historicalMoves.length) return;
    const masterMove = historicalMoves[currentPly];

    toast.info(`Master played ${masterMove}`, {
      description: "Advancing to strategic rationale check.",
    });

    // Advance directly with 0 base score for this attempt
    setStagedBasePoints(0);
    const c = new Chess(boardFen);
    try {
      c.move(masterMove);
      const fenAfter = c.fen();
      const mcq = generateStrategicMcq({
        fenBefore: boardFen,
        fenAfter,
        moveSan: masterMove,
        perspective,
      });

      setBoardFen(fenAfter);
      setActiveMcq(mcq);
      setPendingEval({
        tier: "exact_master",
        title: "Master Move Revealed",
        baseScore: 0,
        deltaPawns: 0,
        isAcceptableMove: true,
        userEvalNormalized: 0,
        masterEvalNormalized: 0,
        explanation: `Grandmaster played ${masterMove}. Study the strategic objective below.`,
      });
      setSelectedMcqId(null);
      setMcqResolved(false);
      setTurnFeedback(null);
    } catch {
      // Fallback
    }
  };

  // Switch to Next Model Game
  const handleNextGame = () => {
    if (currentVar?.games && currentVar.games.length > 1) {
      const nextIdx = (gameIdx + 1) % currentVar.games.length;
      setGameIdx(nextIdx);
    }
    resetGame();
  };

  // Live HUD Metrics
  const accuracyPct =
    totalMoveAttempts > 0 ? Math.round((correctMoveAttempts / totalMoveAttempts) * 100) : 100;

  const masterAlignmentPct =
    correctMoveAttempts > 0 ? Math.round((masterMatchesCount / correctMoveAttempts) * 100) : 100;

  const currentMoveNumber = Math.floor(currentPly / 2) + 1;
  const totalGameMoves = Math.floor(historicalMoves.length / 2);

  const gameHeaderTitle = activeGame
    ? `${activeGame.white.name} (${activeGame.white.rating}) – ${activeGame.black.name} (${activeGame.black.rating}), ${activeGame.year}`
    : guessTheMove.game;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in">
      {/* Page Header with Repertoire Switcher and Deletion */}
      <PageHeader
        eyebrow="Middlegame Master Trainer"
        title="Guess the Move"
        description={`${gameHeaderTitle} — Playing as ${perspective.toUpperCase()}`}
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
                    {v.name} ({v.games?.length || 0} games · {v.perspective || v.color})
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

            {currentVar?.games && currentVar.games.length > 1 && (
              <Button size="sm" variant="outline" onClick={handleNextGame}>
                Next GM Game <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        }
      />

      {/* Live Performance HUD */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative rounded-xl border border-border bg-card p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Total Score
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-primary">{totalScore}</span>
              <span className="text-xs text-muted-foreground">pts</span>
            </div>
          </div>
          <Trophy className="h-5 w-5 text-primary opacity-80" />
          {pointsPopup && (
            <span className="absolute top-2 right-2 animate-bounce rounded-full bg-success/20 border border-success/40 px-2 py-0.5 font-mono text-xs font-bold text-success">
              {pointsPopup}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Accuracy
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-foreground">{accuracyPct}%</span>
              <span className="text-xs text-muted-foreground">
                ({correctMoveAttempts}/{totalMoveAttempts || 1})
              </span>
            </div>
          </div>
          <Target className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Master Alignment
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-success">
                {masterAlignmentPct}%
              </span>
              <span className="text-xs text-muted-foreground">matches</span>
            </div>
          </div>
          <Flame className="h-5 w-5 text-success opacity-80" />
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Move Progress
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold">
                {currentMoveNumber}
                <span className="text-sm text-muted-foreground font-normal">/{totalGameMoves}</span>
              </span>
              {isStockfishHandover && (
                <span className="rounded bg-amber-500/15 text-amber-500 px-1.5 py-0.2 text-[10px] font-bold font-mono">
                  Engine Defense
                </span>
              )}
            </div>
          </div>
          <Sword className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>

      {/* Stockfish Handover Banner */}
      {isStockfishHandover && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-500 font-semibold">
            <Zap className="h-4 w-4 animate-pulse" />
            <span>Grandmaster Historical Resignation Handover</span>
          </div>
          <span className="text-muted-foreground">
            Stockfish Engine Defending (Skill 20) · Convert the win!
          </span>
        </div>
      )}

      {/* Main Training Interactive Board Layout */}
      <TrainingLayout
        board={
          <div className="space-y-3">
            <div className="relative">
              <ChessBoard fen={boardFen} orientation={perspective} onMove={handleBoardMove} />

              {/* Opponent Thinking Spinner Overlay */}
              {isOpponentThinking && (
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 shadow-md text-xs font-medium animate-in fade-in">
                  <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                  <span>
                    {isStockfishHandover
                      ? "Stockfish calculating defense..."
                      : "Opponent moving..."}
                  </span>
                </div>
              )}

              {/* User Evaluating Spinner */}
              {isEvaluatingMove && (
                <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 shadow-md text-xs font-medium animate-in fade-in">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Evaluating move vs Master...</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>
                {isUserTurn
                  ? `Your turn (${perspective}) — drag your piece to guess the move.`
                  : "Opponent is replying..."}
              </span>
              <Button variant="ghost" size="sm" onClick={resetGame}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to Opening Terminal
              </Button>
            </div>
          </div>
        }
      >
        {/* Dynamic Turn Result & Alert Banner */}
        {turnFeedback && (
          <div
            className={cn(
              "rounded-xl border p-4 space-y-2 animate-in fade-in",
              turnFeedback.type === "success" && "border-success/40 bg-success/10 text-foreground",
              turnFeedback.type === "warning" &&
                "border-amber-500/40 bg-amber-500/10 text-foreground",
              turnFeedback.type === "blunder" &&
                "border-destructive/40 bg-destructive/10 text-foreground",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                {turnFeedback.type === "success" && (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                {turnFeedback.type === "warning" && (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                {turnFeedback.type === "blunder" && (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <span>{turnFeedback.title}</span>
              </div>
              {pendingEval && (
                <span className="rounded bg-primary/20 text-primary px-2 py-0.5 font-mono text-xs font-bold">
                  +{stagedBasePoints} Base Pts
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed opacity-90">{turnFeedback.message}</p>

            {/* If Inaccuracy or Blunder, provide Try Again and Reveal options */}
            {!pendingEval && turnFeedback.type !== "success" && (
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={resetGame}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Try Move Again
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                  onClick={handleRevealMasterMove}
                >
                  <HelpCircle className="h-3.5 w-3.5 mr-1" /> Reveal Master Move
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Strategic MCQ Section */}
        {activeMcq && (
          <Panel
            title="Strategic Rationale Exam (+10 pts)"
            icon={<GraduationCap className="h-4 w-4 text-primary" />}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-foreground">
                  Why was <span className="text-primary font-mono">{activeMcq.moveSan}</span> played
                  here?
                </p>
                <span className="rounded bg-secondary border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                  {activeMcq.category.replace("_", " ")}
                </span>
              </div>

              <div className="grid gap-2">
                {activeMcq.options.map((option, idx) => {
                  const isSelected = selectedMcqId === option.id;
                  const isCorrect = option.isCorrect;

                  let optionStyle =
                    "border-border bg-secondary hover:border-primary/60 hover:bg-accent text-foreground";
                  if (mcqResolved) {
                    if (isCorrect) {
                      optionStyle = "border-success bg-success/20 text-success font-medium";
                    } else if (isSelected) {
                      optionStyle =
                        "border-destructive bg-destructive/20 text-destructive line-through";
                    } else {
                      optionStyle =
                        "border-border/50 bg-secondary/50 opacity-40 text-muted-foreground";
                    }
                  }

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={mcqResolved}
                      onClick={() => handleSelectMcq(option.id)}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-lg border p-3 text-left text-xs transition-all",
                        optionStyle,
                      )}
                    >
                      <span className="font-mono font-bold uppercase shrink-0 mt-0.5">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      <div className="space-y-1">
                        <span>{option.text}</span>
                        {mcqResolved && isCorrect && (
                          <p className="text-[11px] text-success/90 font-normal leading-relaxed pt-1">
                            ✓ {option.explanation}
                          </p>
                        )}
                        {mcqResolved && isSelected && !isCorrect && (
                          <p className="text-[11px] text-destructive/90 font-normal leading-relaxed pt-1">
                            ✗ {option.explanation}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Next Move Button once MCQ is answered */}
              {mcqResolved && (
                <div className="pt-2 animate-in fade-in">
                  <Button
                    size="lg"
                    className="w-full h-11 text-sm font-semibold shadow-md"
                    onClick={handleAdvanceToNextTurn}
                  >
                    Next Move in Master Line <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Current Game Details Panel */}
        {activeGame && (
          <Panel title="Grandmaster Model Game">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Match Fidelity</span>
                <span className="font-semibold text-primary capitalize">
                  {activeGame.matchType?.replace("-", " ") || "Exact"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ECO & Opening</span>
                <span className="font-mono font-medium">
                  {activeGame.eco || "ECO"} · {activeGame.opening || currentVar?.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Historical Result</span>
                <span className="font-mono font-bold text-success">
                  {activeGame.winner === "white"
                    ? "1-0 (White Win)"
                    : activeGame.winner === "black"
                      ? "0-1 (Black Win)"
                      : "1/2-1/2 (Draw)"}
                </span>
              </div>
            </div>
          </Panel>
        )}
      </TrainingLayout>

      {/* Endgame Transition Celebration Dialog */}
      {endgameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-primary/40 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/20 p-2.5 text-primary">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">
                  {endgameResult.conditionMet === "checkmate"
                    ? "Checkmate Delivered!"
                    : "Technical Endgame Reached!"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {endgameResult.description ||
                    "The position has reached technical endgame status."}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Session Score:</span>
                <span className="font-mono text-primary font-bold text-sm">{totalScore} pts</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Accuracy:</span>
                <span className="font-mono">{accuracyPct}%</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Master Alignment:</span>
                <span className="font-mono text-success">{masterAlignmentPct}%</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button asChild size="lg" className="w-full font-semibold">
                <Link to="/endgame">
                  Practice Position in Endgame Lab <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleNextGame}>
                Load Next Master Game
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
