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
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  isSoundEnabled,
  toggleSound,
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playSuccessSound,
  playErrorSound,
  playCelebrationSound,
} from "@/utils/chessAudio";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { cn } from "@/lib/utils";
import { useChessTraining } from "@/context/useChessTraining";
import {
  TACTICAL_MOTIFS,
  TACTICAL_TIERS,
  type TacticalMotif,
  type TacticalTierLevel,
  type TacticsGlobalProgress,
  type TacticsPuzzleItem,
  type RepertoireSystem,
  getDefaultTacticsProgress,
  getTacticsProgress,
  saveTacticsProgress,
  getTacticsPuzzles,
  saveTacticsPuzzles,
  clearNonForkTacticsPuzzles,
  clearAllTacticsPuzzles,
  recordTacticsAttempt,
  clearRemedialItem,
} from "@/services/repertoireStorage";
import { PREPOPULATED_PIRC_TACTICS } from "@/utils/prepopulatedTactics";
import {
  evaluateGlobalTierProgress,
  unlockNextGlobalTier,
  type GlobalTierProgressSummary,
} from "@/utils/tacticsProgression";
import { classifyTacticalTier, getMotifDisplayBadge } from "@/utils/tacticsTierMatrix";
import {
  extractTacticsFromGame,
  fetchLichessThematicPuzzles,
  syncMotifTacticsBatch,
  type MotifSyncProgress,
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
  const { savedVariations, activeVariation, repertoireSystems, activeSystem } = useChessTraining();

  // Selected Repertoire System ('all' or specific system ID like 'sys-pirc', 'sys-kid', 'sys-london')
  const [selectedSystemId, setSelectedSystemId] = useState<string>(() => {
    return activeSystem?.id || (repertoireSystems.length > 0 ? repertoireSystems[0].id : "sys-pirc");
  });

  const selectedSystem = useMemo(() => {
    if (selectedSystemId === "all") return null;
    return repertoireSystems.find((s) => s.id === selectedSystemId) || null;
  }, [repertoireSystems, selectedSystemId]);

  // Selected Variation inside System ('all' or specific variation ID)
  const [selectedVariationId, setSelectedVariationId] = useState<string>("all");

  const availableVariations = useMemo(() => {
    if (!selectedSystem) return [];
    return selectedSystem.variations;
  }, [selectedSystem]);

  const selectedVariation = useMemo(() => {
    if (!selectedSystem || selectedVariationId === "all") return null;
    return selectedSystem.variations.find((v) => v.id === selectedVariationId) || null;
  }, [selectedSystem, selectedVariationId]);

  // Perspective: strictly "white" | "black"
  // Auto-locks to system's perspective (Black for Pirc/KID, White for London System)
  const [perspective, setPerspective] = useState<"white" | "black">(() => {
    if (selectedSystem) return selectedSystem.color;
    if (activeVariation?.color) return activeVariation.color;
    return "black";
  });

  // Selected Motif state (default: Fork / Double Attack)
  const [selectedMotif, setSelectedMotif] = useState<TacticalMotif>("Fork / Double Attack");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<MotifSyncProgress | null>(null);

  // Global Progress & Puzzles state (clean initial state — NO placeholder seed tactics!)
  const [progress, setProgress] = useState<TacticsGlobalProgress>(getDefaultTacticsProgress());
  const [allPuzzles, setAllPuzzles] = useState<TacticsPuzzleItem[]>([]);
  const [activePuzzleIndex, setActivePuzzleIndex] = useState(0);

  // Auto-advance & solution playback state
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [isPlayingSolution, setIsPlayingSolution] = useState(false);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hydrate progress and stored puzzles on mount (strictly filter out legacy seed- placeholders)
  useEffect(() => {
    getTacticsProgress().then((p) => setProgress(p));
    getTacticsPuzzles().then((saved) => {
      const realPuzzles = (saved || []).filter((p) => !p.id.startsWith("seed-") && !p.isCheckmate);
      setAllPuzzles(realPuzzles);
    });
  }, []);

  // System selection changes: auto-lock perspective to system color!
  const handleSelectSystem = (sysId: string) => {
    setSelectedSystemId(sysId);
    setSelectedVariationId("all");
    if (sysId !== "all") {
      const sys = repertoireSystems.find((s) => s.id === sysId);
      if (sys) setPerspective(sys.color);
    }
    setActivePuzzleIndex(0);
    setIsRemedialFilterActive(false);
  };

  const handleSelectVariation = (varId: string) => {
    setSelectedVariationId(varId);
    setActivePuzzleIndex(0);
    setIsRemedialFilterActive(false);
  };

  const handlePerspectiveToggle = (newPersp: "white" | "black") => {
    setPerspective(newPersp);
    setActivePuzzleIndex(0);
    setIsRemedialFilterActive(false);
  };

  const handleClearDatabase = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear the entire tactics database? All stored tactics will be wiped so you can sync fresh, authentic puzzles for your repertoire.",
      )
    ) {
      return;
    }
    await clearAllTacticsPuzzles();
    const resetProg = getDefaultTacticsProgress();
    await saveTacticsProgress(resetProg);
    setProgress(resetProg);
    setAllPuzzles([]);
    setActivePuzzleIndex(0);
    setIsRemedialFilterActive(false);
    toast.success("Tactics Database Cleared", {
      description: "Database reset. You can now ingest fresh authentic tactics.",
    });
  };

  // Filter puzzles by perspective, repertoire system, and variation
  const perspectivePuzzles = useMemo(() => {
    return allPuzzles.filter((p) => {
      // Perspective isolation: Black puzzles MUST have Black to move and winning
      if (p.initialTurn !== perspective) return false;
      if (p.isCheckmate) return false;

      // Filter by repertoire system
      if (selectedSystem) {
        const sysNameLower = selectedSystem.name.toLowerCase();
        const pOpName = (p.openingName || "").toLowerCase();
        const isSystemMatch =
          !p.openingName ||
          pOpName.includes(sysNameLower) ||
          (sysNameLower.includes("pirc") && (pOpName.includes("pirc") || p.id.startsWith("pirc-"))) ||
          (sysNameLower.includes("king") && (pOpName.includes("indian") || p.id.startsWith("kid-"))) ||
          (sysNameLower.includes("london") && (pOpName.includes("london") || p.id.startsWith("london-")));

        if (!isSystemMatch) return false;

        // Filter by variation inside the system
        if (selectedVariation) {
          const varNameLower = selectedVariation.name.toLowerCase();
          const isVarMatch =
            p.openingVariationId === selectedVariation.id ||
            pOpName.includes(varNameLower);
          if (!isVarMatch) return false;
        }
      }

      return true;
    });
  }, [allPuzzles, perspective, selectedSystem, selectedVariation]);

  // Compute counts per motif for active perspective
  const puzzleCountsByMotif = useMemo(() => {
    const counts: Record<TacticalMotif, number> = {} as any;
    for (const m of TACTICAL_MOTIFS) counts[m] = 0;
    for (const p of perspectivePuzzles) {
      counts[p.primaryMotif] = (counts[p.primaryMotif] || 0) + 1;
    }
    return counts;
  }, [perspectivePuzzles]);

  // Motifs that have at least 1 puzzle for quick-jump pills in empty states
  const availableMotifPills = useMemo(() => {
    return TACTICAL_MOTIFS.filter((m) => (puzzleCountsByMotif[m] || 0) > 0).map((m) => ({
      motif: m,
      count: puzzleCountsByMotif[m],
    }));
  }, [puzzleCountsByMotif]);

  // Finds next motif that has not yet reached full 450 target
  const nextIncompleteMotif = useMemo(() => {
    const currentIndex = TACTICAL_MOTIFS.indexOf(selectedMotif);
    for (let i = 1; i <= TACTICAL_MOTIFS.length; i++) {
      const nextIdx = (currentIndex + i) % TACTICAL_MOTIFS.length;
      const m = TACTICAL_MOTIFS[nextIdx];
      const count = puzzleCountsByMotif[m] || 0;
      if (count < 450) return m;
    }
    return null;
  }, [selectedMotif, puzzleCountsByMotif]);

  // Remedial Drill Mode state & audio state
  const [isRemedialFilterActive, setIsRemedialFilterActive] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundEnabled());

  // Current motif's missed tactic IDs in remedial queue
  const currentMotifRemedialIds = useMemo(() => {
    return progress.motifProgress[selectedMotif]?.remedialQueue || [];
  }, [progress, selectedMotif]);

  // All puzzles matching active selected motif, ordered strictly by Tier Level ascending (L1 -> L9)
  const baseMotifPuzzles = useMemo(() => {
    return perspectivePuzzles
      .filter((p) => p.primaryMotif === selectedMotif)
      .sort((a, b) => a.tierLevel - b.tierLevel || a.rating - b.rating);
  }, [perspectivePuzzles, selectedMotif]);

  // Missed puzzles for the active motif
  const missedPuzzlesInMotif = useMemo(() => {
    return baseMotifPuzzles.filter((p) => currentMotifRemedialIds.includes(p.id));
  }, [baseMotifPuzzles, currentMotifRemedialIds]);

  // When Remedial Drill Mode is active, restrict to only missed puzzles!
  const motifPuzzles = useMemo(() => {
    if (isRemedialFilterActive && missedPuzzlesInMotif.length > 0) {
      return missedPuzzlesInMotif;
    }
    return baseMotifPuzzles;
  }, [baseMotifPuzzles, isRemedialFilterActive, missedPuzzlesInMotif]);

  // Current active puzzle (null if unsynced or 0 puzzles for this motif)
  const currentPuzzle = useMemo<TacticsPuzzleItem | null>(() => {
    if (motifPuzzles.length > 0) {
      return motifPuzzles[activePuzzleIndex % motifPuzzles.length];
    }
    return null;
  }, [motifPuzzles, activePuzzleIndex]);

  // Compute Global Tier Summary with Empty-Level Bypassing
  const tierSummary: GlobalTierProgressSummary = useMemo(() => {
    return evaluateGlobalTierProgress(progress, perspectivePuzzles);
  }, [progress, perspectivePuzzles]);

  // Board execution state
  const chessRef = useRef(new Chess());
  const [currentFen, setCurrentFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "correct" | "completed" | "wrong">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: string; to: string } | null>(
    null,
  );

  // Check if current puzzle is in remedial queue
  const currentMotifData = progress.motifProgress[selectedMotif];
  const isInRemedialQueue =
    currentPuzzle && currentMotifData?.remedialQueue?.includes(currentPuzzle.id)
      ? true
      : false;

  // Sync board when active puzzle changes
  useEffect(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setIsPlayingSolution(false);

    if (currentPuzzle) {
      try {
        chessRef.current = new Chess(currentPuzzle.fen);
      } catch {
        chessRef.current = new Chess();
      }
      setCurrentFen(currentPuzzle.fen);
    }
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

    if (currentPuzzle) {
      try {
        chessRef.current = new Chess(currentPuzzle.fen);
      } catch {
        chessRef.current = new Chess();
      }
      setCurrentFen(currentPuzzle.fen);
    }
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
    if (!currentPuzzle || isPlayingSolution) return;
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

  // Motif-by-Motif Ingestion Pipeline: up to 450 puzzles per motif (50 per level, L1 to L9)
  const handleSyncSingleMotif = async (targetMotif: TacticalMotif = selectedMotif) => {
    setIsSyncing(true);
    setIsSyncModalOpen(true);
    setSelectedMotif(targetMotif);

    try {
      const { newPuzzles, progress: finalProgress } = await syncMotifTacticsBatch(
        targetMotif,
        selectedVariation ? ({ id: selectedVariation.id, name: selectedVariation.name, color: perspective } as any) : null,
        perspective,
        allPuzzles,
        (prog) => setSyncProgress({ ...prog }),
        50,
        selectedSystem?.name,
        selectedVariation?.name,
      );

      if (newPuzzles.length > 0) {
        await saveTacticsPuzzles(newPuzzles);
        const updatedAll = await getTacticsPuzzles();
        const clean = updatedAll.filter((p) => !p.id.startsWith("seed-") && !p.isCheckmate);
        setAllPuzzles(clean);
        setActivePuzzleIndex(0);
        toast.success(`${targetMotif} Library Updated!`, {
          description: `Added ${newPuzzles.length} verified ${perspective.toUpperCase()} tactics for ${selectedVariation ? selectedVariation.name : (selectedSystem?.name || "your repertoire")}.`,
        });
      } else {
        toast.info("Database Up to Date", {
          description: `All available tactics for ${targetMotif} are already indexed.`,
        });
      }

      setSyncProgress(finalProgress);

      // Update sync timestamp
      const updatedProg = { ...progress, lastSyncTimestamp: new Date().toISOString() };
      await saveTacticsProgress(updatedProg);
      setProgress(updatedProg);
    } catch {
      toast.error("Sync Encountered an Issue", {
        description: "Existing database tactics preserved safely.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync all 16 canonical motifs sequentially for the selected variation/system
  const handleSyncAllMotifs = async () => {
    setIsSyncing(true);
    setIsSyncModalOpen(true);

    try {
      let currentPool = [...allPuzzles];
      let totalNew = 0;

      for (const motif of TACTICAL_MOTIFS) {
        setSelectedMotif(motif);
        const { newPuzzles, progress: finalProgress } = await syncMotifTacticsBatch(
          motif,
          selectedVariation ? ({ id: selectedVariation.id, name: selectedVariation.name, color: perspective } as any) : null,
          perspective,
          currentPool,
          (prog) => setSyncProgress({ ...prog }),
          50,
          selectedSystem?.name,
          selectedVariation?.name,
        );

        if (newPuzzles.length > 0) {
          await saveTacticsPuzzles(newPuzzles);
          currentPool = [...currentPool, ...newPuzzles];
          setAllPuzzles(currentPool);
          totalNew += newPuzzles.length;
        }
        setSyncProgress(finalProgress);
      }

      toast.success("All 16 Motifs Synced!", {
        description: `Successfully synchronized ${totalNew} verified tactics for ${selectedVariation ? selectedVariation.name : (selectedSystem?.name || "your repertoire")}.`,
      });

      const updatedProg = { ...progress, lastSyncTimestamp: new Date().toISOString() };
      await saveTacticsProgress(updatedProg);
      setProgress(updatedProg);
    } catch {
      toast.error("Batch Sync Encountered an Issue", {
        description: "Existing database tactics preserved safely.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNewTactics = () => handleSyncSingleMotif(selectedMotif);

  // Unlock next global tier
  const handleUnlockNextTier = async () => {
    if (!tierSummary.canUnlockNextTier) return;
    const updated = unlockNextGlobalTier(progress, tierSummary);
    await saveTacticsProgress(updated);
    setProgress(updated);
    playCelebrationSound();
    toast.success(`🎉 Level ${updated.activeGlobalTier} Unlocked!`, {
      description: `Welcome to ${TACTICAL_TIERS[updated.activeGlobalTier].name}.`,
    });
  };

  // Move handling with solution verification
  const onMove = (from: string, to: string) => {
    if (!currentPuzzle || status === "completed" || isPlayingSolution) return false;

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

        if (moveCandidate.captured) {
          playCaptureSound();
        } else {
          playMoveSound();
        }

        setCurrentFen(chess.fen());
        setLastMoveHighlight({ from, to });
        const nextStep = stepIndex + 1;

        if (nextStep < currentPuzzle.solutionPv.length) {
          // Play opponent's automatic response
          setStatus("correct");
          setFeedback("Sharp strike! Opponent is defending...");

          setTimeout(() => {
            try {
              const oppSan = currentPuzzle.solutionPv[nextStep];
              const oppMove = chess.move(oppSan);
              if (oppMove) {
                if (oppMove.captured) {
                  playCaptureSound();
                } else if (oppMove.san.includes("+")) {
                  playCheckSound();
                } else {
                  playMoveSound();
                }

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
        // STRICT STREAK RESET TO 0 ON ERROR (User Rule: Always reset to 0)
        playErrorSound();
        setStatus("wrong");
        setFeedback("Incorrect move. The tactical sequence was broken.");
        recordTacticsAttempt(selectedMotif, currentPuzzle.id, false).then((updated) => {
          setProgress(updated);
        });
        toast.error("Streak Reset to 0", {
          description: "Tactical combination failed. Puzzle sent to Remedial Queue.",
        });
        return false;
      }
    } catch {
      return false;
    }
  };

  const handlePuzzleSuccess = () => {
    if (!currentPuzzle) return;
    setStatus("completed");
    setFeedback("Tactical combination solved flawlessly!");
    playSuccessSound();

    // If clearing a remedial puzzle, remove from remedial queue
    if (isInRemedialQueue) {
      clearRemedialItem(selectedMotif, currentPuzzle.id).then((updated) => {
        setProgress(updated);
        const remainingMissed = updated.motifProgress[selectedMotif]?.remedialQueue?.length || 0;
        if (remainingMissed === 0) {
          playCelebrationSound();
          toast.success("🎉 All Missed Tactics Cleared!", {
            description: `You have successfully cleared every missed tactic for ${selectedMotif}!`,
          });
          setIsRemedialFilterActive(false);
        } else {
          toast.success("Remedial Puzzle Cleared!", {
            description: `${remainingMissed} missed tactic${remainingMissed > 1 ? "s" : ""} remaining for ${selectedMotif}.`,
          });
        }
      });
    } else {
      recordTacticsAttempt(selectedMotif, currentPuzzle.id, true).then((updated) => {
        setProgress(updated);
        const m = updated.motifProgress[selectedMotif];
        if (m.currentStreak === 20) {
          playCelebrationSound();
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => handleSyncSingleMotif(selectedMotif)}
              disabled={isSyncing}
              className="shadow-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Zap className={cn("h-4 w-4 mr-1.5", isSyncing && "animate-spin")} />
              {isSyncing
                ? "Syncing Motif..."
                : `Sync "${selectedMotif}" (${puzzleCountsByMotif[selectedMotif] || 0}/450)`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAllMotifs}
              disabled={isSyncing}
              className="shadow-sm font-semibold border-primary/40 hover:bg-primary/10"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", isSyncing && "animate-spin")} />
              Sync All 16 Motifs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearDatabase}
              disabled={isSyncing}
              className="shadow-sm font-semibold border-destructive/40 text-destructive hover:bg-destructive/10"
              title="Clear all stored tactics to sync fresh authentic library"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear Database
            </Button>
            {syncProgress && !isSyncing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSyncModalOpen(true)}
                className="text-xs font-semibold"
              >
                View Sync HUD
              </Button>
            )}
          </div>
        }
      />

      {/* Opening Repertoire & Perspective Control Bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Repertoire System Selector */}
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Opening:
            </span>
            <select
              value={selectedSystemId}
              onChange={(e) => handleSelectSystem(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary shadow-sm"
            >
              <option value="all">All Repertoires</option>
              {repertoireSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.color === "black" ? "🛡️" : "👑"} {s.name} ({s.color.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Variation Selector (inside System) */}
          {selectedSystem && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Variation:
              </span>
              <select
                value={selectedVariationId}
                onChange={(e) => handleSelectVariation(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary shadow-sm"
              >
                <option value="all">All {selectedSystem.name} Variations</option>
                {availableVariations.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Perspective Toggle: White vs Black */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => handlePerspectiveToggle("white")}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                perspective === "white"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>♙</span> White Tactics
            </button>
            <button
              type="button"
              onClick={() => handlePerspectiveToggle("black")}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                perspective === "black"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>♟</span> Black Tactics
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-bold">
            {perspectivePuzzles.length} Tactics Loaded
          </span>
          {perspective === "black" ? (
            <span className="text-emerald-500 font-semibold">● Black to Move</span>
          ) : (
            <span className="text-sky-500 font-semibold">○ White to Move</span>
          )}
        </div>
      </div>

      {/* Global Tier Progression HUD */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-semibold block">
              Global Skill Matrix ({perspective.toUpperCase()} Repertoire)
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
            {currentPuzzle ? (
              <>
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
                      Puzzle {(activePuzzleIndex % motifPuzzles.length) + 1} of{" "}
                      {motifPuzzles.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {missedPuzzlesInMotif.length > 0 && (
                      <Button
                        variant={isRemedialFilterActive ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => {
                          setIsRemedialFilterActive((prev) => !prev);
                          setActivePuzzleIndex(0);
                        }}
                        className={cn(
                          "h-7 text-xs font-semibold transition-all",
                          isRemedialFilterActive
                            ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-sm"
                            : "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
                        )}
                        title="Filter strictly to missed tactics for this motif"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {isRemedialFilterActive
                          ? `Exit Drill (${missedPuzzlesInMotif.length} left)`
                          : `Retry Missed (${missedPuzzlesInMotif.length})`}
                      </Button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const next = toggleSound();
                        setSoundEnabledState(next);
                        if (next) playSuccessSound();
                      }}
                      className={cn(
                        "rounded-md border p-1 text-[11px] font-mono transition-colors flex items-center justify-center cursor-pointer",
                        soundEnabled
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/30",
                      )}
                      title={
                        soundEnabled
                          ? "Sound Effects Enabled (Click to Mute)"
                          : "Sound Effects Muted (Click to Unmute)"
                      }
                    >
                      {soundEnabled ? (
                        <Volume2 className="h-3.5 w-3.5" />
                      ) : (
                        <VolumeX className="h-3.5 w-3.5 opacity-60" />
                      )}
                    </button>

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

                {/* Remedial Drill Mode Active Banner */}
                {isRemedialFilterActive && (
                  <div className="rounded-xl border border-amber-500/50 bg-amber-500/15 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      <span>
                        <strong>Missed Tactics Drill Active:</strong> Drilling{" "}
                        {missedPuzzlesInMotif.length} tactic
                        {missedPuzzlesInMotif.length > 1 ? "s" : ""} you missed in{" "}
                        <strong>{selectedMotif}</strong>. Solve each one to clear your review queue!
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/20"
                      onClick={() => {
                        setIsRemedialFilterActive(false);
                        setActivePuzzleIndex(0);
                      }}
                    >
                      Exit Drill
                    </Button>
                  </div>
                )}

                {/* Active Motif & Remedial HUD Banner */}
                <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-xs font-bold text-primary">
                      {selectedMotif}
                    </span>

                    <span className="text-xs text-muted-foreground font-mono">
                      Level {currentPuzzle.tierLevel} · {currentPuzzle.tierName}
                    </span>

                    <span className="text-xs font-mono font-semibold text-primary">
                      {perspective === "black" ? "♟ Black to Move & Win" : "♙ White to Move & Win"}
                    </span>
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
                {isInRemedialQueue && !isRemedialFilterActive && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2 animate-in fade-in">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      <strong>Remedial Clearance Phase:</strong> You missed this puzzle previously. Solve
                      it now to clear your remedial queue and resume normal streak progression!
                    </span>
                  </div>
                )}

                {/* Chessboard with perspective orientation */}
                <div className="relative">
                  <ChessBoard
                    fen={currentFen}
                    orientation={perspective}
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
                      Clue: Strike with a <strong>{currentPuzzle.initialTurn}</strong> piece from{" "}
                      <strong>{currentPuzzle.solutionPv[0]?.slice(0, 2) || "starting square"}</strong>.
                    </p>
                  </div>
                )}
              </>
            ) : (
              /* Interactive Empty State (No Seed Placeholders) */
              <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-5 shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                  <Target className="h-7 w-7" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {perspectivePuzzles.length === 0
                      ? `No ${perspective.toUpperCase()} Tactics Synced Yet`
                      : `No ${selectedMotif} Puzzles in this ${perspective.toUpperCase()} Repertoire`}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {perspectivePuzzles.length === 0
                      ? `Placeholder tactics have been removed. Click below to fetch verified ${perspective.toUpperCase()} tactical strikes from Lichess and your ${selectedVariation?.name || "opening"} games.`
                      : `You have ${perspectivePuzzles.length} other ${perspective} tactics in your library. Jump to an active motif below or sync ${selectedMotif} puzzles.`}
                  </p>
                </div>

                {/* Available Motifs with Puzzles */}
                {availableMotifPills.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-2">
                      Available {perspective.toUpperCase()} Motifs
                    </span>
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                      {availableMotifPills.map(({ motif, count }) => (
                        <Button
                          key={motif}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMotif(motif);
                            setActivePuzzleIndex(0);
                          }}
                          className="text-xs h-7 px-2.5 font-medium border-primary/30 hover:bg-primary/10"
                        >
                          {motif} <span className="ml-1.5 font-mono text-[10px] text-primary font-bold">({count})</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="default"
                    onClick={() => handleSyncSingleMotif(selectedMotif)}
                    disabled={isSyncing}
                    className="font-semibold shadow-md px-5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Zap className={cn("h-4 w-4 mr-2", isSyncing && "animate-spin")} />
                    {isSyncing ? "Syncing Motif..." : `Sync "${selectedMotif}" (Target: 450)`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSyncAllMotifs}
                    disabled={isSyncing}
                    className="font-semibold shadow-sm border-primary/40 hover:bg-primary/10"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isSyncing && "animate-spin")} />
                    Sync All 16 Motifs
                  </Button>
                </div>
              </div>
            )}
          </div>
        }
      >
        {/* 16-Motif Selection Panel */}
        <Panel
          title={`The 16 Motifs (${perspective.toUpperCase()})`}
          icon={<Target className="h-4 w-4 text-primary" />}
        >
          <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-1">
            {TACTICAL_MOTIFS.map((motif) => {
              const mData = progress.motifProgress[motif];
              const summary = tierSummary.motifs[motif];
              const isSelected = selectedMotif === motif;
              const count = puzzleCountsByMotif[motif] || 0;
              const badgeInfo = getMotifDisplayBadge(
                mData?.attempts || 0,
                mData?.rating || 1200,
                count === 0,
              );

              return (
                <div
                  key={motif}
                  onClick={() => {
                    setSelectedMotif(motif);
                    setActivePuzzleIndex(0);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-xl p-3 text-left transition-all border cursor-pointer group",
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
                      <span className="font-mono font-semibold text-primary">
                        {count} / 450
                      </span>
                      <span>·</span>
                      <span className="font-mono">{summary?.statusLabel}</span>
                      {(mData?.remedialQueue?.length || 0) > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-md">
                            {mData.remedialQueue.length} missed
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                        badgeInfo.tone,
                      )}
                    >
                      {badgeInfo.badge}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSyncSingleMotif(motif);
                      }}
                      disabled={isSyncing}
                      title={`Sync 450 puzzles for ${motif}`}
                      className="rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary p-1.5 transition-colors cursor-pointer"
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </TrainingLayout>

      {/* Motif Batch Ingestion HUD & Progress Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/15 text-primary text-[10px] font-mono uppercase font-bold px-2.5 py-0.5">
                    Motif Batch Ingestion · 450 Target
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {perspective.toUpperCase()} Repertoire
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold text-foreground mt-1.5 flex items-center gap-2">
                  <Zap className={cn("h-5 w-5 text-primary", isSyncing && "animate-spin")} />
                  {syncProgress?.motif || selectedMotif}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedVariation ? selectedVariation.name : "All Repertoire Lines"} · 50 puzzles per level
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Overall Progress Bar */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">
                  Total Ingestion Progress
                </span>
                <span className="font-mono text-primary font-bold">
                  {syncProgress?.totalPuzzlesCollected || (puzzleCountsByMotif[selectedMotif] || 0)} / {syncProgress?.totalTarget || 450} Puzzles
                </span>
              </div>
              <Progress
                value={
                  syncProgress?.totalTarget
                    ? Math.min(100, (syncProgress.totalPuzzlesCollected / syncProgress.totalTarget) * 100)
                    : Math.min(100, ((puzzleCountsByMotif[selectedMotif] || 0) / 450) * 100)
                }
                className="h-2.5"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-semibold text-emerald-400">
                  Starts at Level 1 (50 puzzles/level across all 9 levels)
                </span>
                <span>Target: 450 total</span>
              </div>
            </div>

            {/* 9-Tier Level Breakdown Grid */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold block">
                9-Tier Level Progression
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {([1, 2, 3, 4, 5, 6, 7, 8, 9] as TacticalTierLevel[]).map((lvl) => {
                  const count = syncProgress?.levelCounts[lvl] ?? 0;
                  const target = syncProgress?.levelTargets[lvl] ?? 50;
                  const isExempt = syncProgress?.exemptLevels.includes(lvl);
                  const isDone = count >= target && !isExempt;
                  const isCurrent = syncProgress?.currentLevel === lvl && isSyncing;

                  return (
                    <div
                      key={lvl}
                      className={cn(
                        "rounded-xl border p-2.5 transition-all flex items-center justify-between gap-2",
                        isCurrent
                          ? "border-primary bg-primary/10 shadow-xs"
                          : isDone
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : isExempt
                              ? "border-border/50 bg-muted/20 opacity-60"
                              : "border-border bg-card",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-foreground">
                            L{lvl}: {TACTICAL_TIERS[lvl].name}
                          </span>
                          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                          {isCurrent && <RefreshCw className="h-3 w-3 text-primary animate-spin shrink-0" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground block font-mono">
                          {TACTICAL_TIERS[lvl].description}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        {isExempt ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                            Exempt
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "font-mono font-bold text-xs",
                              isDone ? "text-emerald-500" : isCurrent ? "text-primary" : "text-muted-foreground",
                            )}
                          >
                            {count} / {target}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Status Message */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs font-mono text-muted-foreground flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw className="h-4 w-4 text-primary animate-spin shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
              <span className="truncate">
                {syncProgress?.statusMessage || (isSyncing ? "Syncing in progress..." : "Ready")}
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsSyncModalOpen(false)}
              >
                {isSyncing ? "Run in Background" : "Close"}
              </Button>

              <div className="flex items-center gap-2 ml-auto">
                {!isSyncing && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setIsSyncModalOpen(false);
                      setActivePuzzleIndex(0);
                      toast.success(`Testing ${syncProgress?.motif || selectedMotif}!`, {
                        description: "Board positioned for Puzzle 1 (Level 1).",
                      });
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                  >
                    <Play className="h-4 w-4 mr-1.5" />
                    Test {syncProgress?.motif || selectedMotif} Now
                  </Button>
                )}

                {!isSyncing && nextIncompleteMotif && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncSingleMotif(nextIncompleteMotif)}
                    className="border-primary/40 text-primary hover:bg-primary/10 font-semibold"
                  >
                    Sync Next: {nextIncompleteMotif} <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Tactics;
