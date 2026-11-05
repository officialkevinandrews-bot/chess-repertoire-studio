import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dna,
  Eye,
  Flame,
  Gauge,
  HelpCircle,
  Lightbulb,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Sword,
  Target,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { cn } from "@/lib/utils";
import { useChessTraining } from "@/context/useChessTraining";
import { stockfishEngine } from "@/engine/stockfishClient";
import {
  TACTICAL_MOTIFS,
  TACTICAL_TIERS,
  type TacticalMotif,
  type TacticalTierLevel,
  type TacticsGlobalProgress,
  type TacticsPuzzleItem,
  getDefaultTacticsProgress,
  getTacticsProgress,
  saveTacticsProgress,
  getTacticsPuzzles,
  saveTacticsPuzzles,
  recordTacticsAttempt,
  clearRemedialItem,
} from "@/services/repertoireStorage";
import {
  evaluateGlobalTierProgress,
  unlockNextGlobalTier,
  type GlobalTierProgressSummary,
} from "@/utils/tacticsProgression";
import { classifyTacticalTier, getMotifDisplayBadge } from "@/utils/tacticsTierMatrix";
import {
  extractTacticsFromGame,
  fetchLichessThematicPuzzles,
  SEED_TACTICS_PUZZLES,
} from "@/utils/tacticsScraper";

export const Route = createFileRoute("/middlegame/tactics")({
  head: () => ({
    meta: [
      { title: "Tactics Training — Chess Buddy" },
      {
        name: "description",
        content:
          "Progressive motif-specific tactics engine with 9-tier global progression and opening repertoire isolation.",
      },
      { property: "og:title", content: "Tactics Training — Chess Buddy" },
      {
        property: "og:description",
        content:
          "Progressive motif-specific tactics engine with 9-tier global progression and opening repertoire isolation.",
      },
    ],
  }),
  component: Tactics,
});

function Tactics() {
  const { savedVariations } = useChessTraining();

  // Selected Motif state (default: Fork / Double Attack)
  const [selectedMotif, setSelectedMotif] = useState<TacticalMotif>("Fork / Double Attack");
  const [isSyncing, setIsSyncing] = useState(false);

  // Global Progress & Puzzles state
  const [progress, setProgress] = useState<TacticsGlobalProgress>(getDefaultTacticsProgress());
  const [allPuzzles, setAllPuzzles] = useState<TacticsPuzzleItem[]>(SEED_TACTICS_PUZZLES);
  const [activePuzzleIndex, setActivePuzzleIndex] = useState(0);

  // Auto-advance & solution playback state
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [isPlayingSolution, setIsPlayingSolution] = useState(false);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hydrate progress and seed puzzles on mount
  useEffect(() => {
    getTacticsProgress().then((p) => setProgress(p));
    getTacticsPuzzles().then((saved) => {
      if (saved && saved.length > 0) {
        setAllPuzzles(saved);
      } else {
        saveTacticsPuzzles(SEED_TACTICS_PUZZLES);
        setAllPuzzles(SEED_TACTICS_PUZZLES);
      }
    });
  }, []);

  // Compute Global Tier Summary with Empty-Level Bypassing
  const tierSummary: GlobalTierProgressSummary = useMemo(() => {
    return evaluateGlobalTierProgress(progress, allPuzzles);
  }, [progress, allPuzzles]);

  // Filter puzzles matching the active selected motif
  const motifPuzzles = useMemo(() => {
    return allPuzzles.filter((p) => p.primaryMotif === selectedMotif && !p.isCheckmate);
  }, [allPuzzles, selectedMotif]);

  // Current active puzzle
  const currentPuzzle = useMemo<TacticsPuzzleItem>(() => {
    if (motifPuzzles.length > 0) {
      return motifPuzzles[activePuzzleIndex % motifPuzzles.length];
    }
    return SEED_TACTICS_PUZZLES[0];
  }, [motifPuzzles, activePuzzleIndex]);

  // Board execution state
  const chessRef = useRef(new Chess(currentPuzzle.fen));
  const [currentFen, setCurrentFen] = useState(currentPuzzle.fen);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "correct" | "completed" | "wrong">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: string; to: string } | null>(
    null,
  );

  // Check if current puzzle is in remedial queue
  const currentMotifData = progress.motifProgress[selectedMotif];
  const isInRemedialQueue = currentMotifData?.remedialQueue?.includes(currentPuzzle.id) || false;

  // Sync board when active puzzle changes
  useEffect(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setIsPlayingSolution(false);

    try {
      chessRef.current = new Chess(currentPuzzle.fen);
    } catch {
      chessRef.current = new Chess();
    }
    setCurrentFen(currentPuzzle.fen);
    setStepIndex(0);
    setStatus("idle");
    setFeedback(null);
    setShowHint(false);
    setLastMoveHighlight(null);
  }, [currentPuzzle]);

  const handleResetPuzzle = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setIsPlayingSolution(false);

    try {
      chessRef.current = new Chess(currentPuzzle.fen);
    } catch {
      chessRef.current = new Chess();
    }
    setCurrentFen(currentPuzzle.fen);
    setStepIndex(0);
    setStatus("idle");
    setFeedback(null);
    setShowHint(false);
    setLastMoveHighlight(null);
  }, [currentPuzzle]);

  const handleNextPuzzle = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setIsPlayingSolution(false);
    setActivePuzzleIndex((prev) => prev + 1);
  }, []);

  const handlePrevPuzzle = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setIsPlayingSolution(false);
    setActivePuzzleIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Show Solution: step-by-step playback on board
  const handleShowSolution = useCallback(() => {
    if (isPlayingSolution) return;
    setIsPlayingSolution(true);

    const playChess = new Chess(currentPuzzle.fen);
    setCurrentFen(playChess.fen());

    let i = 0;
    const interval = setInterval(() => {
      if (i >= currentPuzzle.solutionPv.length) {
        clearInterval(interval);
        setIsPlayingSolution(false);
        return;
      }
      const moveSan = currentPuzzle.solutionPv[i];
      try {
        const res = playChess.move(moveSan);
        if (res) {
          setCurrentFen(playChess.fen());
          setLastMoveHighlight({ from: res.from, to: res.to });
        }
      } catch {
        // ignore
      }
      i++;
    }, 700);
  }, [currentPuzzle, isPlayingSolution]);

  // Keyboard navigation support: Space or Enter advances to next, R retries, H hints
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " " || e.key === "Enter") {
        if (status === "completed" || status === "wrong") {
          e.preventDefault();
          handleNextPuzzle();
        }
      } else if (e.key === "r" || e.key === "R") {
        handleResetPuzzle();
      } else if (e.key === "h" || e.key === "H") {
        setShowHint((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, handleNextPuzzle, handleResetPuzzle]);

  // Periodic Incremental Sync: scans Lichess API & opening games
  const handleSyncNewTactics = async () => {
    setIsSyncing(true);
    toast.info("Syncing Tactics Library", {
      description: `Fetching verified Lichess ${selectedMotif} puzzles and indexing games...`,
    });

    try {
      const extracted: TacticsPuzzleItem[] = [];

      // 1. Fetch fresh verified puzzles from Lichess API using user's token
      try {
        const lichessPuzzles = await fetchLichessThematicPuzzles(selectedMotif, 3);
        if (lichessPuzzles.length > 0) {
          extracted.push(...lichessPuzzles);
        }
      } catch {
        // continue
      }

      // 2. Scan saved variation games
      for (const v of savedVariations) {
        if (v.games && v.games.length > 0) {
          for (const g of v.games) {
            const gameTactics = extractTacticsFromGame(
              g.id,
              `${g.white.name} vs ${g.black.name}`,
              g.movesSan,
              v.id,
              v.name,
            );
            extracted.push(...gameTactics);
          }
        }
      }

      if (extracted.length > 0) {
        await saveTacticsPuzzles(extracted);
        const updatedAll = await getTacticsPuzzles();
        setAllPuzzles(updatedAll);
        toast.success(`Tactics Database Updated!`, {
          description: `Added ${extracted.length} verified tactical combinations to your database.`,
        });
      } else {
        toast.success("Database Up to Date", {
          description: "All existing games and positions are fully indexed.",
        });
      }

      // Update sync timestamp
      const updatedProg = { ...progress, lastSyncTimestamp: new Date().toISOString() };
      await saveTacticsProgress(updatedProg);
      setProgress(updatedProg);
    } catch {
      toast.error("Sync Encountered an Issue", {
        description: "Cached positions preserved cleanly.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Unlock next global tier
  const handleUnlockNextTier = async () => {
    if (!tierSummary.canUnlockNextTier) return;
    const updated = unlockNextGlobalTier(progress, tierSummary);
    await saveTacticsProgress(updated);
    setProgress(updated);
    toast.success(`🎉 Level ${updated.activeGlobalTier} Unlocked!`, {
      description: `Welcome to ${TACTICAL_TIERS[updated.activeGlobalTier].name}.`,
    });
  };

  // Move handling with solution verification
  const onMove = (from: string, to: string) => {
    if (status === "completed" || isPlayingSolution) return false;

    const chess = chessRef.current;
    const expectedMoveSan = currentPuzzle.solutionPv[stepIndex];

    try {
      const legalMoves = chess.moves({ verbose: true });
      const moveCandidate = legalMoves.find((m) => m.from === from && m.to === to);
      if (!moveCandidate) return false;

      // Check if move matches solution SAN or LAN
      const isMatch =
        moveCandidate.san === expectedMoveSan ||
        moveCandidate.lan === currentPuzzle.solutionLanPv[stepIndex] ||
        moveCandidate.san.replace("+", "").replace("#", "") ===
          expectedMoveSan?.replace("+", "").replace("#", "");

      if (isMatch) {
        const moveRes = chess.move({ from, to, promotion: "q" });
        if (!moveRes) return false;

        setCurrentFen(chess.fen());
        setLastMoveHighlight({ from, to });
        const nextStep = stepIndex + 1;

        if (nextStep < currentPuzzle.solutionPv.length) {
          // Play opponent's automatic response
          setStatus("correct");
          setFeedback("Sharp move! Opponent is responding...");

          setTimeout(() => {
            try {
              const oppSan = currentPuzzle.solutionPv[nextStep];
              const oppMove = chess.move(oppSan);
              if (oppMove) {
                setCurrentFen(chess.fen());
                setLastMoveHighlight({ from: oppMove.from, to: oppMove.to });
                setStepIndex(nextStep + 1);

                if (nextStep + 1 >= currentPuzzle.solutionPv.length) {
                  handlePuzzleSuccess();
                } else {
                  setFeedback("Find the tactical follow-up!");
                }
              } else {
                handlePuzzleSuccess();
              }
            } catch {
              handlePuzzleSuccess();
            }
          }, 400);
        } else {
          handlePuzzleSuccess();
        }

        return true;
      } else {
        // STRICT STREAK RESET TO 0 ON ERROR
        setStatus("wrong");
        setFeedback("Incorrect move. The tactical sequence was broken.");
        recordTacticsAttempt(selectedMotif, currentPuzzle.id, false).then((updated) => {
          setProgress(updated);
        });
        toast.error("Streak Reset to 0", {
          description: "Puzzle sent to your Remedial Queue. Clear it to resume streak progression.",
        });
        return false;
      }
    } catch {
      return false;
    }
  };

  const handlePuzzleSuccess = () => {
    setStatus("completed");
    setFeedback("Tactical combination solved flawlessly!");

    // If clearing a remedial puzzle, remove from remedial queue
    if (isInRemedialQueue) {
      clearRemedialItem(selectedMotif, currentPuzzle.id).then((updated) => {
        setProgress(updated);
        toast.success("Remedial Puzzle Cleared!", {
          description: "One step closer to clearing your remedial queue.",
        });
      });
    } else {
      recordTacticsAttempt(selectedMotif, currentPuzzle.id, true).then((updated) => {
        setProgress(updated);
        const m = updated.motifProgress[selectedMotif];
        if (m.currentStreak === 20) {
          toast.success(`🏆 20-in-a-Row Streak Completed!`, {
            description: `${selectedMotif} cleared for Level ${progress.activeGlobalTier}!`,
          });
        }
      });
    }

    // Auto-advance if enabled
    if (autoAdvance) {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = setTimeout(() => {
        handleNextPuzzle();
      }, 1500);
    }
  };

  return (
    <div className="mx-auto max-w-6xl pb-12 space-y-6">
      <PageHeader
        eyebrow="Middlegame Component #1 · Tactical Pattern Engine"
        title="Progressive Tactics Laboratory"
        description="Master opening-specific material combinations across 16 enforced motifs and 9 progressive difficulty tiers."
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNewTactics}
            disabled={isSyncing}
            className="shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing Tactics..." : "Sync New Games & Puzzles"}
          </Button>
        }
      />

      {/* Global Tier Progression HUD */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-semibold block">
              Global Skill Matrix
            </span>
            <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Level {tierSummary.activeTier}: {tierSummary.tierName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active Tier Progress: {tierSummary.clearedMotifsCount} of{" "}
              {tierSummary.populatedMotifsCount} Populated Motifs Cleared (
              {tierSummary.exemptMotifsCount} Exempt / No Low-Level Puzzles)
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-2 text-center">
              <span className="text-[10px] font-mono uppercase text-muted-foreground block">
                Overall Rating
              </span>
              <span className="font-mono text-xl font-bold text-foreground">
                {progress.isCalibrated ? progress.overallRating : "Calibrating..."}
              </span>
            </div>

            {tierSummary.canUnlockNextTier && (
              <Button
                variant="default"
                size="sm"
                onClick={handleUnlockNextTier}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md font-semibold text-white animate-pulse"
              >
                Unlock Level {progress.activeGlobalTier + 1}
              </Button>
            )}
          </div>
        </div>

        <Progress value={tierSummary.progressPct} className="h-2.5" />
      </div>

      <TrainingLayout
        board={
          <div className="space-y-3">
            {/* Carousel & Auto-Advance Control Bar */}
            <div className="flex items-center justify-between gap-2 px-1 text-xs">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPuzzle}
                  disabled={activePuzzleIndex === 0}
                  className="h-7 px-2 text-xs"
                  title="Previous tactic"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPuzzle}
                  className="h-7 px-2 text-xs"
                  title="Next tactic"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
                <span className="font-mono text-muted-foreground ml-1">
                  Puzzle {motifPuzzles.length > 0 ? (activePuzzleIndex % motifPuzzles.length) + 1 : 1} of{" "}
                  {motifPuzzles.length || 1}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoAdvance((v) => !v)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-mono transition-colors flex items-center gap-1 cursor-pointer",
                    autoAdvance
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "border-border text-muted-foreground hover:bg-muted/30",
                  )}
                  title="Toggle auto-advance to next puzzle on solve"
                >
                  <span>Auto-Advance</span>
                  <span className="font-bold">{autoAdvance ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>

            {/* Active Motif & Remedial HUD Banner */}
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-xs font-bold text-primary">
                  {selectedMotif}
                </span>

                <span className="text-xs text-muted-foreground font-mono">
                  Level {currentPuzzle.tierLevel} · {currentPuzzle.tierName}
                </span>

                {currentPuzzle.secondaryMotifs.length > 0 && (
                  <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
                    · Secondary: {currentPuzzle.secondaryMotifs.join(", ")}
                  </span>
                )}
              </div>

              {/* Streak Meter */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <Flame className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="font-semibold text-foreground">
                  Streak: {currentMotifData?.currentStreak || 0} / 20
                </span>
              </div>
            </div>

            {/* Remedial Queue Alert Banner */}
            {isInRemedialQueue && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Remedial Clearance Phase:</strong> You missed this puzzle previously. Solve
                  it now to clear your remedial queue and resume normal streak progression!
                </span>
              </div>
            )}

            {/* Chessboard */}
            <div className="relative">
              <ChessBoard
                fen={currentFen}
                onMove={onMove}
                lastMoveHighlight={lastMoveHighlight}
              />

              {/* Quick Controls Overlay */}
              <div className="absolute right-3 top-3 flex items-center gap-1.5 z-10">
                <Button variant="secondary" size="sm" onClick={handleResetPuzzle} title="Retry position">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHint((h) => !h)}
                  title="Show tactical hint"
                >
                  <Lightbulb className="h-3.5 w-3.5 mr-1" /> {showHint ? "Hide Hint" : "Hint"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleNextPuzzle}
                  title="Skip to next tactic"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>

            {/* Feedback & Comprehensive Action Controls */}
            {status !== "idle" && (
              <div
                className={cn(
                  "rounded-xl border p-4 animate-in fade-in space-y-3",
                  status === "completed" || status === "correct"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                <div className="flex items-start gap-2.5">
                  {status === "completed" || status === "correct" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{feedback}</p>
                    {status === "completed" && (
                      <p className="mt-1 text-xs text-foreground/80 leading-relaxed font-mono">
                        {currentPuzzle.explanation}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons for both Completed and Wrong States */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-current/15">
                  {status === "completed" ? (
                    <div className="flex items-center justify-between w-full">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleNextPuzzle}
                        className="shadow font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Next Tactic <ChevronRight className="h-4 w-4 ml-1.5" />
                      </Button>
                      {autoAdvance && (
                        <span className="text-[11px] text-muted-foreground animate-pulse font-mono">
                          Advancing in 1.5s... (Space to skip)
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleResetPuzzle}
                        className="text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry Tactic
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShowSolution}
                        disabled={isPlayingSolution}
                        className="text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        {isPlayingSolution ? "Playing..." : "Show Solution"}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleNextPuzzle}
                        className="text-xs ml-auto"
                      >
                        Next Tactic <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Smart 2-Stage Hint */}
            {showHint && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-xs leading-relaxed text-muted-foreground animate-in fade-in space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Tactical Coach Hint:
                </div>
                <p>
                  Focus on the <strong>{selectedMotif.toLowerCase()}</strong> mechanism. Look for a
                  vulnerable, undefended, or overloaded enemy target.
                </p>
                <p className="font-mono text-[11px] text-primary">
                  Clue: Move starts with a <strong>{currentPuzzle.initialTurn}</strong> piece from{" "}
                  <strong>{currentPuzzle.solutionPv[0]?.slice(0, 2) || "starting square"}</strong>.
                </p>
              </div>
            )}
          </div>
        }
      >
        {/* 16-Motif Selection Panel */}
        <Panel
          title="The 16 Tactical Motifs"
          icon={<Target className="h-4 w-4 text-primary" />}
        >
          <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-1">
            {TACTICAL_MOTIFS.map((motif) => {
              const mData = progress.motifProgress[motif];
              const summary = tierSummary.motifs[motif];
              const isSelected = selectedMotif === motif;
              const badgeInfo = getMotifDisplayBadge(
                mData?.attempts || 0,
                mData?.rating || 1200,
                summary?.status === "exempt",
              );

              return (
                <button
                  key={motif}
                  onClick={() => {
                    setSelectedMotif(motif);
                    setActivePuzzleIndex(0);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-xl p-3 text-left transition-all border cursor-pointer",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border hover:bg-muted/30",
                  )}
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-foreground truncate block">
                        {motif}
                      </span>
                      {summary?.isPassed && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{summary?.statusLabel}</span>
                      <span>·</span>
                      <span className="font-mono">{summary?.puzzleCount || 0} puzzles</span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                      badgeInfo.tone,
                    )}
                  >
                    {badgeInfo.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      </TrainingLayout>
    </div>
  );
}
export default Tactics;
