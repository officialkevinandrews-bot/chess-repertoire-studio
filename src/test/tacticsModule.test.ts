import { describe, expect, it } from "vitest";
import {
  TACTICAL_MOTIFS,
  TACTICAL_TIERS,
  type TacticalMotif,
  type TacticalTierLevel,
  type TacticsPuzzleItem,
  getDefaultTacticsProgress,
  saveTacticsProgress,
  recordTacticsAttempt,
  clearRemedialItem,
  saveTacticsPuzzles,
  getTacticsPuzzles,
} from "../services/repertoireStorage";
import { analyzeTacticalMotifs } from "../utils/tacticsMotifEngine";
import { classifyTacticalTier, getMotifDisplayBadge } from "../utils/tacticsTierMatrix";
import {
  evaluateGlobalTierProgress,
  unlockNextGlobalTier,
} from "../utils/tacticsProgression";
import { SEED_TACTICS_PUZZLES } from "../utils/tacticsScraper";

describe("Component #1: 16-Tactical-Motif Dictionary & Primary/Secondary Engine", () => {
  it("contains exactly the 16 enforced canonical motifs", () => {
    expect(TACTICAL_MOTIFS).toHaveLength(16);
    expect(TACTICAL_MOTIFS).toContain("Fork / Double Attack");
    expect(TACTICAL_MOTIFS).toContain("Pin");
    expect(TACTICAL_MOTIFS).toContain("Skewer");
    expect(TACTICAL_MOTIFS).toContain("Discovered Attack");
    expect(TACTICAL_MOTIFS).toContain("Deflection");
    expect(TACTICAL_MOTIFS).toContain("Decoy / Attraction");
    expect(TACTICAL_MOTIFS).toContain("Overloaded Piece");
    expect(TACTICAL_MOTIFS).toContain("Intermezzo (Zwischenzug / In-Between Move)");
    expect(TACTICAL_MOTIFS).toContain("Removal of the Defender");
    expect(TACTICAL_MOTIFS).toContain("X-Ray Attack");
    expect(TACTICAL_MOTIFS).toContain("Trapped Piece");
    expect(TACTICAL_MOTIFS).toContain("Clearance Sacrifice");
    expect(TACTICAL_MOTIFS).toContain("Interference");
    expect(TACTICAL_MOTIFS).toContain("Windmill");
    expect(TACTICAL_MOTIFS).toContain("Advanced Pawn / Breakthrough");
    expect(TACTICAL_MOTIFS).toContain("Desperado");
  });

  it("detects Fork / Double Attack and assigns primary/secondary motifs", () => {
    // White knight forks King and Rook on c7: 1. Nc7+
    const fen = "r3k2r/pppb1ppp/2n5/1B1p4/3Nn3/2P5/PPP2PPP/R1BQK2R w KQkq - 0 10";
    const solution = ["Nxc6", "bxc6", "Bd3"];
    const result = analyzeTacticalMotifs(fen, solution);

    expect(result).not.toBeNull();
    expect(result?.isValidTactics).toBe(true);
    expect(result?.isCheckmate).toBe(false);
    expect(result?.primaryMotif).toBeDefined();
    expect(TACTICAL_MOTIFS).toContain(result?.primaryMotif);
  });

  it("detects Pin motif when a piece is immobilized against a high value piece", () => {
    // White Bb5 pins the c6 knight to the king
    const fen = "r1bqk2r/pppp1ppp/2n5/4p3/1b2P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 5";
    const solution = ["Nd5", "Bc5"];
    const result = analyzeTacticalMotifs(fen, solution);

    expect(result).not.toBeNull();
    expect(result?.isValidTactics).toBe(true);
    expect(result?.isCheckmate).toBe(false);
  });

  it("detects Advanced Pawn / Breakthrough when pawn advances toward promotion", () => {
    const fen = "8/1p3k2/p1pP4/8/P7/8/1P5P/6K1 w - - 0 35";
    const solution = ["d7", "Ke7"];
    const result = analyzeTacticalMotifs(fen, solution);

    expect(result).not.toBeNull();
    expect(result?.primaryMotif).toBe("Advanced Pawn / Breakthrough");
    expect(result?.isCheckmate).toBe(false);
  });
});

describe("Component #1: Strict Structural Isolation (Checkmates $\\ne$ Tactics)", () => {
  it("STRICT ISOLATION: rejects forced checkmate sequences from the tactics engine", () => {
    // Scholar's Mate / Qxf7#
    const mateFen = "r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
    const mateSolution = ["Qxf7#"];
    const result = analyzeTacticalMotifs(mateFen, mateSolution);

    expect(result).not.toBeNull();
    expect(result?.isCheckmate).toBe(true);
    expect(result?.isValidTactics).toBe(false); // MUST be excluded from Tactics
    expect(result?.explanation).toContain("isolated to Checkmate Suite");
  });

  it("STRICT ISOLATION: rejects multi-move forced checkmates", () => {
    // Legal 2-move checkmate: 1. Qe8+ Rxe8 2. Rxe8#
    const fen = "4r1k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1";
    const solution = ["Qxe8+", "Rxe8", "Rxe8#"];
    const result = analyzeTacticalMotifs(fen, solution);

    expect(result).not.toBeNull();
    expect(result?.isCheckmate).toBe(true);
    expect(result?.isValidTactics).toBe(false);
  });
});

describe("Component #1: 9-Tier Tactical Matrix & Composite Classifier", () => {
  it("classifies Level 1: Novice Observer (< 1000, 1-move combination)", () => {
    const tier = classifyTacticalTier(850, 1);
    expect(tier.tierLevel).toBe(1);
    expect(tier.tierName).toBe("Novice Observer");
  });

  it("classifies Level 3: Pattern Scout (1300–1499, 2-move combination)", () => {
    const tier = classifyTacticalTier(1380, 2);
    expect(tier.tierLevel).toBe(3);
    expect(tier.tierName).toBe("Pattern Scout");
  });

  it("classifies Level 5: Board Visionary (1700–1899, 3-move combination)", () => {
    const tier = classifyTacticalTier(1780, 3);
    expect(tier.tierLevel).toBe(5);
    expect(tier.tierName).toBe("Board Visionary");
  });

  it("classifies Level 9: Grandmaster Virtuoso (2500+, deep forcing variations)", () => {
    const tier = classifyTacticalTier(2550, 6);
    expect(tier.tierLevel).toBe(9);
    expect(tier.tierName).toBe("Grandmaster Virtuoso");
  });

  it("displays 'Not Yet Explored' for unattempted motifs and named tiers for explored motifs", () => {
    const unattempted = getMotifDisplayBadge(0, 1200, false);
    expect(unattempted.badge).toBe("Not Yet Explored");
    expect(unattempted.isExplored).toBe(false);

    const explored = getMotifDisplayBadge(10, 1420, false);
    expect(explored.badge).toBe("Pattern Scout");
    expect(explored.isExplored).toBe(true);

    const exempt = getMotifDisplayBadge(0, 1200, true);
    expect(exempt.badge).toBe("Awaiting Higher Tier");
    expect(exempt.isExplored).toBe(false);
  });
});

describe("Component #1: Global Tier Progression & Adaptive Empty-Level Bypassing", () => {
  it("exempts empty motifs from blocking tier progression (Empty-Level Bypassing)", () => {
    const progress = getDefaultTacticsProgress();
    // Only 2 motifs have puzzles at Level 1 in this test subset
    const testPuzzles: TacticsPuzzleItem[] = [
      {
        id: "p1",
        fen: "8/8/8/8/8/8/8/8",
        initialTurn: "white",
        solutionPv: ["e4"],
        solutionLanPv: ["e2e4"],
        primaryMotif: "Fork / Double Attack",
        secondaryMotifs: [],
        tierLevel: 1,
        tierName: "Novice Observer",
        rating: 900,
        moveLength: 1,
        explanation: "Fork",
        isCheckmate: false,
      },
      {
        id: "p2",
        fen: "8/8/8/8/8/8/8/8",
        initialTurn: "white",
        solutionPv: ["d4"],
        solutionLanPv: ["d2d4"],
        primaryMotif: "Pin",
        secondaryMotifs: [],
        tierLevel: 1,
        tierName: "Novice Observer",
        rating: 950,
        moveLength: 1,
        explanation: "Pin",
        isCheckmate: false,
      },
    ];

    const summary = evaluateGlobalTierProgress(progress, testPuzzles);

    // Only 2 motifs are populated; the other 14 are Exempt / No Low-Level Puzzles
    expect(summary.populatedMotifsCount).toBe(2);
    expect(summary.exemptMotifsCount).toBe(14);
    expect(summary.motifs["Windmill"].status).toBe("exempt");
    expect(summary.motifs["Windmill"].statusLabel).toBe("Exempt / No Low-Level Puzzles");
    expect(summary.motifs["Windmill"].isPassed).toBe(true);

    // Can NOT unlock next tier yet because populated motifs aren't cleared
    expect(summary.canUnlockNextTier).toBe(false);

    // Now clear the 2 populated motifs
    progress.motifProgress["Fork / Double Attack"].clearedLevels = [1];
    progress.motifProgress["Fork / Double Attack"].currentStreak = 20;
    progress.motifProgress["Pin"].clearedLevels = [1];
    progress.motifProgress["Pin"].currentStreak = 20;

    const summaryAfter = evaluateGlobalTierProgress(progress, testPuzzles);
    expect(summaryAfter.clearedMotifsCount).toBe(2);
    expect(summaryAfter.canUnlockNextTier).toBe(true);

    // Unlock next global tier
    const updated = unlockNextGlobalTier(progress, summaryAfter);
    expect(updated.activeGlobalTier).toBe(2);
  });

  it("calculates Calibration Lock until user completes sufficient motif attempts", () => {
    const progress = getDefaultTacticsProgress();
    const summary = evaluateGlobalTierProgress(progress, SEED_TACTICS_PUZZLES);

    expect(summary.isCalibrated).toBe(false);
    expect(summary.overallRatingDisplay).toBe("Calibrating...");

    // Simulate attempts across 6 motifs
    for (const m of TACTICAL_MOTIFS.slice(0, 6)) {
      progress.motifProgress[m].attempts = 5;
      progress.motifProgress[m].rating = 1350;
    }

    const summaryAfter = evaluateGlobalTierProgress(progress, SEED_TACTICS_PUZZLES);
    expect(summaryAfter.isCalibrated).toBe(true);
    expect(summaryAfter.overallRatingDisplay).not.toBe("Calibrating...");
  });
});

describe("Component #1: Strict Streak Reset (to 0) & Remedial Queue Mechanics", () => {
  it("strictly resets streak to 0 on incorrect move and queues puzzle into remedial_queue", async () => {
    const progress = getDefaultTacticsProgress();
    // User had a streak of 14
    progress.motifProgress["Fork / Double Attack"].currentStreak = 14;

    const updated = await recordTacticsAttempt("Fork / Double Attack", "puzzle-101", false);

    // STRICT RESET: streak is 0!
    expect(updated.motifProgress["Fork / Double Attack"].currentStreak).toBe(0);
    expect(updated.motifProgress["Fork / Double Attack"].remedialQueue).toContain("puzzle-101");
  });

  it("clears remedial items when successfully retried", async () => {
    const progress = getDefaultTacticsProgress();
    progress.motifProgress["Fork / Double Attack"].remedialQueue = ["puzzle-101", "puzzle-102"];
    await saveTacticsProgress(progress);

    const updated = await clearRemedialItem("Fork / Double Attack", "puzzle-101");
    expect(updated.motifProgress["Fork / Double Attack"].remedialQueue).not.toContain("puzzle-101");
    expect(updated.motifProgress["Fork / Double Attack"].remedialQueue).toContain("puzzle-102");
  });
});
