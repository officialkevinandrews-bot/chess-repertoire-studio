import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { isTechnicalEndgame, type EndgameCheckResult } from "../utils/endgameDetector";
import { evaluateUserMoveRelative, normalizeEvalToPerspective } from "../utils/relativeScoring";
import { generateStrategicMcq } from "../utils/strategicMcqGenerator";
import { rankModelGames } from "../utils/lichessScraper";
import type { ScrapedGame } from "../services/repertoireStorage";

describe("Phase 3: Endgame Detection (Conditions 1 & 2)", () => {
  it("detects Condition 1 (No Queens, <= 2 minors/rooks each)", () => {
    // White: K + R + N (2 pieces), Black: K + B + N (2 pieces), Pawns on board, No Queens
    const fen = "8/5pk1/4pnp1/8/8/5NP1/4PRK1/8 w - - 0 35";
    const result = isTechnicalEndgame(fen);
    expect(result.isEndgame).toBe(true);
    expect(result.conditionMet).toBe("no_queens");
    expect(result.whitePieces.queens).toBe(0);
    expect(result.blackPieces.queens).toBe(0);
    expect(result.whitePieces.minorsAndRooks).toBeLessThanOrEqual(2);
    expect(result.blackPieces.minorsAndRooks).toBeLessThanOrEqual(2);
  });

  it("detects Condition 2 (With Queens, <= 1 minor/rook each)", () => {
    // White: K + Q + B (1 minor), Black: K + Q + N (1 minor), Pawns on board
    const fen = "8/5pk1/4p1p1/1q6/2B5/6P1/4Q1K1/8 w - - 0 40";
    const result = isTechnicalEndgame(fen);
    expect(result.isEndgame).toBe(true);
    expect(result.conditionMet).toBe("with_queens");
    expect(result.whitePieces.queens).toBe(1);
    expect(result.blackPieces.queens).toBe(1);
    expect(result.whitePieces.minorsAndRooks).toBeLessThanOrEqual(1);
    expect(result.blackPieces.minorsAndRooks).toBeLessThanOrEqual(1);
  });

  it("returns isEndgame: false during complex middlegame (multiple pieces)", () => {
    // Standard starting position / middlegame
    const startFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const result = isTechnicalEndgame(startFen);
    expect(result.isEndgame).toBe(false);
  });

  it("detects checkmate as immediate endgame", () => {
    // Fool's mate
    const checkmateFen = "rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const result = isTechnicalEndgame(checkmateFen);
    expect(result.isEndgame).toBe(true);
    expect(result.conditionMet).toBe("checkmate");
  });
});

describe("Phase 3: Perspective-Normalized Relative Scoring Matrix", () => {
  it("normalizes evaluations correctly for White and Black perspectives", () => {
    // +1.5 for White
    expect(normalizeEvalToPerspective(1.5, "white")).toBe(1.5);
    // +1.5 for White means -1.5 for Black
    expect(normalizeEvalToPerspective(1.5, "black")).toBe(-1.5);
    // -2.0 for White means +2.0 for Black
    expect(normalizeEvalToPerspective(-2.0, "black")).toBe(2.0);
  });

  it("awards +10 base points for Exact Master Match", () => {
    const res = evaluateUserMoveRelative({
      userMoveSan: "Nf3",
      masterMoveSan: "Nf3",
      bestEngineMoveSan: "Nf3",
      userEvalWhitePawns: 0.4,
      masterEvalWhitePawns: 0.4,
      userPerspective: "white",
    });
    expect(res.tier).toBe("exact_master");
    expect(res.baseScore).toBe(10);
    expect(res.isAcceptableMove).toBe(true);
  });

  it("awards +15 base points for Super-GM Find (> +0.50 pawns better)", () => {
    const res = evaluateUserMoveRelative({
      userMoveSan: "Bxf7+",
      masterMoveSan: "Be2",
      bestEngineMoveSan: "Bxf7+",
      userEvalWhitePawns: 2.2, // User finds tactical shot +2.2
      masterEvalWhitePawns: 1.4, // Master played quiet move +1.4
      userPerspective: "white",
    });
    expect(res.tier).toBe("super_gm_find");
    expect(res.baseScore).toBe(15);
    expect(res.deltaPawns).toBeGreaterThanOrEqual(0.5);
    expect(res.isAcceptableMove).toBe(true);
  });

  it("awards +10 base points for Engine Equivalent (+/- 0.15 pawns)", () => {
    const res = evaluateUserMoveRelative({
      userMoveSan: "O-O",
      masterMoveSan: "h3",
      bestEngineMoveSan: "O-O",
      userEvalWhitePawns: 0.45,
      masterEvalWhitePawns: 0.4,
      userPerspective: "white",
    });
    expect(res.tier).toBe("engine_equivalent");
    expect(res.baseScore).toBe(10);
    expect(res.isAcceptableMove).toBe(true);
  });

  it("scores Inaccuracy (-0.50 to -1.50) with +3 points and requires retry", () => {
    const res = evaluateUserMoveRelative({
      userMoveSan: "a3",
      masterMoveSan: "d4",
      bestEngineMoveSan: "d4",
      userEvalWhitePawns: -0.4,
      masterEvalWhitePawns: 0.5, // 0.9 drop
      userPerspective: "white",
    });
    expect(res.tier).toBe("inaccuracy");
    expect(res.baseScore).toBe(3);
    expect(res.isAcceptableMove).toBe(false);
  });

  it("scores Blunder (> -1.50 drop) with 0 points and requires retry", () => {
    const res = evaluateUserMoveRelative({
      userMoveSan: "g4??",
      masterMoveSan: "d4",
      bestEngineMoveSan: "d4",
      userEvalWhitePawns: -2.5,
      masterEvalWhitePawns: 0.5,
      userPerspective: "white",
    });
    expect(res.tier).toBe("blunder");
    expect(res.baseScore).toBe(0);
    expect(res.isAcceptableMove).toBe(false);
  });
});

describe("Phase 3: Dynamic Strategic MCQ Generator", () => {
  it("generates 4 choices with exactly 1 correct option and 3 plausible distractors", () => {
    const fenBefore = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 5";
    const c = new Chess(fenBefore);
    c.move("O-O");
    const fenAfter = c.fen();

    const mcq = generateStrategicMcq({
      fenBefore,
      fenAfter,
      moveSan: "O-O",
      perspective: "white",
    });

    expect(mcq.options.length).toBe(4);
    const correctOptions = mcq.options.filter((o) => o.isCorrect);
    expect(correctOptions.length).toBe(1);
    expect(correctOptions[0].id).toBe(mcq.correctOptionId);
    expect(mcq.category).toBe("king_safety");
  });

  it("identifies multiple recaptures and explains piece selection rationale", () => {
    // Black played ...cxd4, White can recapture with Nxd4 or Qxd4
    const fenBefore = "r1bqkbnr/pp1ppppp/2n5/8/3p4/4PN2/PPP2PPP/RNBQKB1R w KQkq - 0 4";
    const c = new Chess(fenBefore);
    c.move("Nxd4");
    const fenAfter = c.fen();

    const mcq = generateStrategicMcq({
      fenBefore,
      fenAfter,
      moveSan: "Nxd4",
      perspective: "white",
    });

    expect(mcq.category).toBe("recapture");
    expect(mcq.summary).toContain("Knight");
    expect(mcq.options.length).toBe(4);
  });
});

describe("Phase 3: Repertoire Perspective Prioritization in Scraper", () => {
  it("prioritizes games where the repertoire perspective was victorious", () => {
    const sampleGames: ScrapedGame[] = [
      {
        id: "loss-game",
        white: { name: "Player A", rating: 2600, title: "GM" },
        black: { name: "Player B", rating: 2620, title: "GM" },
        winner: "black",
        year: 2021,
        plyCount: 40,
        movesSan: [],
        pgn: "",
        fenAtVariation: "",
        plyAtVariation: 10,
        accuracyScore: 95,
        matchType: "exact",
      },
      {
        id: "win-game",
        white: { name: "Player C", rating: 2590, title: "GM" },
        black: { name: "Player D", rating: 2580, title: "GM" },
        winner: "white",
        year: 2022,
        plyCount: 42,
        movesSan: [],
        pgn: "",
        fenAtVariation: "",
        plyAtVariation: 10,
        accuracyScore: 94,
        matchType: "exact",
      },
    ];

    // For White perspective, the White victory game must be ranked #1
    const rankedForWhite = rankModelGames(sampleGames, "white");
    expect(rankedForWhite[0].id).toBe("win-game");

    // For Black perspective, the Black victory game must be ranked #1
    const rankedForBlack = rankModelGames(sampleGames, "black");
    expect(rankedForBlack[0].id).toBe("loss-game");
  });
});
