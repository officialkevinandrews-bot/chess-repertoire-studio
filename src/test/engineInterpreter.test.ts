import { describe, expect, it } from "vitest";
import { parseBestMove, parseUciInfoLine } from "../engine/stockfishParser";
import {
  analyzePositionMotifs,
  detectDiscoveredAttack,
  detectFork,
  detectPins,
  detectSkewers,
} from "../utils/chessMotifs";
import {
  analyzeMateFromLine,
  categorizeMateMoves,
  verifyCheckmateLine,
  verifyUserCheckmateAttempt,
} from "../utils/mateFilter";
import { evaluateTacticalProfile, interpretEngineAnalysis } from "../utils/engineInterpreter";
import {
  buildExplanationPrompt,
  classifyMoveQuality,
  generateLocalExplanation,
} from "../services/explanationPrompt";
import { Chess } from "chess.js";
import type { EnginePVLine } from "../engine/stockfishTypes";
import {
  validateCachedEntry,
  normalizeFen,
  clearAllCachedEvaluations,
  saveEvaluationToCache,
  getCachedEvaluation,
  type CachedPositionEval,
} from "../services/evaluationCache";

describe("Stockfish UCI Parser", () => {
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("parses standard MultiPV info lines and normalizes score", () => {
    const rawLine =
      "info depth 15 seldepth 22 multipv 1 score cp 45 nodes 12345 nps 50000 time 246 pv e2e4 e7e5 g1f3 b8c6";
    const parsed = parseUciInfoLine(rawLine, startFen);

    expect(parsed).not.toBeNull();
    expect(parsed?.depth).toBe(15);
    expect(parsed?.multipv).toBe(1);
    expect(parsed?.score.type).toBe("cp");
    expect(parsed?.score.value).toBe(45);
    expect(parsed?.score.scoreCp).toBe(45);
    expect(parsed?.bestMove).toBe("e2e4");
    expect(parsed?.bestMoveSan).toBe("e4");
    expect(parsed?.sanPv).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("normalizes Black perspective score to White evaluation convention", () => {
    // Black to move in Sicilian: 1. e4 c5 2. Nf3 d6
    const blackTurnFen = "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
    // Stockfish says cp 80 (meaning Black is +0.80)
    const rawLine = "info depth 12 multipv 1 score cp 80 pv g8f6 d2d4";
    const parsed = parseUciInfoLine(rawLine, blackTurnFen);

    expect(parsed).not.toBeNull();
    expect(parsed?.score.scoreCp).toBe(-80); // White is -0.80
  });

  it("parses forced mate score correctly", () => {
    const mateFen = "r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
    const rawLine = "info depth 18 multipv 1 score mate 1 pv h5f7";
    const parsed = parseUciInfoLine(rawLine, mateFen);

    expect(parsed).not.toBeNull();
    expect(parsed?.score.type).toBe("mate");
    expect(parsed?.score.mateMoves).toBe(1);
    expect(parsed?.score.scoreCp).toBeGreaterThan(90000);
    expect(parsed?.bestMoveSan).toBe("Qxf7#");
  });

  it("parses bestmove line", () => {
    const bestLine = "bestmove e2e4 ponder e7e5";
    const parsed = parseBestMove(bestLine);
    expect(parsed?.bestMove).toBe("e2e4");
    expect(parsed?.ponder).toBe("e7e5");
  });
});

describe("Tactical Motif Engine", () => {
  it("detects Absolute Pin to the King", () => {
    // White Bishop on b5 pins Black Knight on c6 to King on e8 (d7 is open because d-pawn moved to d6)
    const pinFen = "r1bqk2r/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5";
    const chess = new Chess(pinFen);
    const pins = detectPins(chess);

    expect(pins.length).toBeGreaterThan(0);
    const pin = pins.find((p) => p.attackerSquare === "b5");
    expect(pin).toBeDefined();
    expect(pin?.type).toBe("pin");
    expect(pin?.isAbsolute).toBe(true);
    expect(pin?.targetSquares).toContain("c6");
    expect(pin?.targetSquares).toContain("e8");
  });

  it("detects Fork / Double Attack", () => {
    // Black King on e8 and Rook on c8; White Knight on d6 forks both
    const forkFen = "2r1k3/8/3N4/8/8/8/8/4K3 b - - 0 1";
    const chess = new Chess(forkFen);
    const fork = detectFork(chess, "d6");

    expect(fork).not.toBeNull();
    expect(fork?.type).toBe("fork");
    expect(fork?.targetSquares).toContain("e8");
    expect(fork?.targetSquares).toContain("c8");
  });

  it("detects Skewer", () => {
    // White Rook on e1 skewers Black King on e5, exposing Black Queen on e8
    const skewerFen = "4q3/8/8/4k3/8/8/8/4R1K1 w - - 0 1";
    const chess = new Chess(skewerFen);
    const skewers = detectSkewers(chess);

    expect(skewers.length).toBeGreaterThan(0);
    const skewer = skewers.find((s) => s.attackerSquare === "e1");
    expect(skewer).toBeDefined();
    expect(skewer?.type).toBe("skewer");
    expect(skewer?.targetSquares).toEqual(["e5", "e8"]);
  });

  it("detects Discovered Attack", () => {
    // White Bishop on d2, White Knight on c3, Black Queen on a5.
    // When Knight moves from c3 to d5, the d2-Bishop discovers an attack against a5-Queen.
    const fenBefore = "4k3/8/8/q7/8/2N5/3B4/4K3 w - - 0 1";
    const chessBefore = new Chess(fenBefore);
    chessBefore.move({ from: "c3", to: "d5" });
    const fenAfter = chessBefore.fen();

    const discovered = detectDiscoveredAttack(fenBefore, fenAfter, "c3", "d5");

    expect(discovered).not.toBeNull();
    expect(discovered?.type).toBe("discovered_attack");
    expect(discovered?.attackerSquare).toBe("d2");
    expect(discovered?.targetSquares).toContain("a5");
  });
});

describe("Checkmates Section Engine", () => {
  it("categorizes mate in 1, 2, and 3+", () => {
    expect(categorizeMateMoves(1)).toBe("mate_in_1");
    expect(categorizeMateMoves(2)).toBe("mate_in_2");
    expect(categorizeMateMoves(3)).toBe("mate_in_3_plus");
    expect(categorizeMateMoves(5)).toBe("mate_in_3_plus");
    expect(categorizeMateMoves(null)).toBe("none");
  });

  it("verifies absolute checkmate line with chess.js", () => {
    // Scholar's Mate: 1. Qxf7#
    const scholarsFen = "r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
    const result = verifyCheckmateLine(scholarsFen, ["h5f7"]);

    expect(result.verified).toBe(true);
    expect(result.isCheckmate).toBe(true);
    expect(result.movesSan).toEqual(["Qxf7#"]);
  });

  it("rejects non-mating line verification", () => {
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = verifyCheckmateLine(startFen, ["e2e4", "e7e5"]);

    expect(result.verified).toBe(false);
    expect(result.isCheckmate).toBe(false);
  });

  it("flags user alternative moves as incorrect when mate is missed", () => {
    const mateFen = "r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
    // Correct is h5f7 (Qxf7#). Suppose user captures c5 bishop with d3:
    const checkUser = verifyUserCheckmateAttempt(mateFen, { from: "c4", to: "f7" }, ["h5f7"]);
    expect(checkUser.isCorrect).toBe(false);
    expect(checkUser.feedback).toContain("does not maintain the forced checkmate");

    // Correct move played:
    const correctUser = verifyUserCheckmateAttempt(mateFen, { from: "h5", to: "f7" }, ["h5f7"]);
    expect(correctUser.isCorrect).toBe(true);
    expect(correctUser.feedback).toContain("Correct!");
  });
});

describe("Engine Translation Layer & Tactical Profiles", () => {
  const dummyLine = (multipv: number, cp: number, bestSan: string): EnginePVLine => ({
    multipv,
    depth: 15,
    seldepth: 18,
    score: { type: "cp", value: cp, scoreCp: cp, mateMoves: null },
    nodes: 1000,
    nps: 10000,
    timeMs: 100,
    pv: [bestSan],
    sanPv: [bestSan],
    bestMove: bestSan,
    bestMoveSan: bestSan,
  });

  it("flags forced_tactic when Move #1 is vastly superior to Move #2 (> 1.5 pawns)", () => {
    const lines = [
      dummyLine(1, 300, "Qxf7#"), // +3.00
      dummyLine(2, 50, "Nf3"), // +0.50 (gap = 250 cp > 150 cp)
      dummyLine(3, 40, "d3"),
    ];

    const profile = evaluateTacticalProfile(lines);
    expect(profile.profile).toBe("forced_tactic");
    expect(profile.topMoveGapCp).toBe(250);
  });

  it("flags quiet_positional when top 3 lines are within 0.25 pawns", () => {
    const lines = [
      dummyLine(1, 30, "Nf3"), // +0.30
      dummyLine(2, 20, "d4"), // +0.20
      dummyLine(3, 15, "c4"), // +0.15 (spread = 15 cp <= 25 cp)
    ];

    const profile = evaluateTacticalProfile(lines);
    expect(profile.profile).toBe("quiet_positional");
    expect(profile.pv1To3SpreadCp).toBeLessThanOrEqual(25);
  });

  it("interprets complete engine analysis result", () => {
    const fen = "r1bqk2r/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5";
    const lines = [dummyLine(1, 40, "Bxc6"), dummyLine(2, 25, "O-O"), dummyLine(3, 20, "c3")];

    const analysis = interpretEngineAnalysis(fen, lines);
    expect(analysis.fen).toBe(fen);
    expect(analysis.profile).toBeDefined();
    expect(analysis.motifs.length).toBeGreaterThan(0); // Pin on c6 Knight
    expect(analysis.evalWhite).toBe(0.4);
  });
});

describe("AI Explanation Framework", () => {
  it("builds structured prompt with motifs and coach persona", () => {
    const dummyAnalysis = interpretEngineAnalysis(
      "r1bqk2r/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5",
      [
        {
          multipv: 1,
          depth: 15,
          seldepth: 18,
          score: { type: "cp", value: 45, scoreCp: 45, mateMoves: null },
          nodes: 1000,
          nps: 10000,
          timeMs: 100,
          pv: ["b5c6"],
          sanPv: ["Bxc6"],
          bestMove: "b5c6",
          bestMoveSan: "Bxc6",
        },
      ],
    );

    const prompt = buildExplanationPrompt({
      fenBefore: dummyAnalysis.fen,
      fenAfter: dummyAnalysis.fen,
      userMoveSan: "h3",
      userMoveFromTo: { from: "h2", to: "h3" },
      bestMoveSan: "Bxc6",
      analysis: dummyAnalysis,
      evalDiffPawns: -1.2,
      classification: "inaccuracy",
    });

    expect(prompt.systemPrompt).toContain("Chess Grandmaster");
    expect(prompt.userPrompt).toContain("User played: h3");
    expect(prompt.userPrompt).toContain("Engine Best Move: Bxc6");
    expect(prompt.userPrompt).toContain("Pin");
  });

  it("generates deterministic local explanations without crashing", () => {
    const dummyAnalysis = interpretEngineAnalysis(
      "r1bqk2r/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
      [
        {
          multipv: 1,
          depth: 15,
          seldepth: 18,
          score: { type: "cp", value: 45, scoreCp: 45, mateMoves: null },
          nodes: 1000,
          nps: 10000,
          timeMs: 100,
          pv: ["b5c6"],
          sanPv: ["Bxc6"],
          bestMove: "b5c6",
          bestMoveSan: "Bxc6",
        },
      ],
    );

    const exp = generateLocalExplanation({
      fenBefore: dummyAnalysis.fen,
      fenAfter: dummyAnalysis.fen,
      userMoveSan: "Bxc6",
      userMoveFromTo: { from: "b5", to: "c6" },
      bestMoveSan: "Bxc6",
      analysis: dummyAnalysis,
      evalDiffPawns: 0,
      classification: "best",
    });

    expect(exp).toContain("move");
  });
});

describe("Strict Move Legality & Cache Self-Healing", () => {
  // Position where both White and Black have already castled kingside:
  // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O
  const bothCastledFen = "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 2 6";

  it("filters out impossible castling moves if engine output had stale pre-castling moves", () => {
    // Stale lines from before castling that proposed O-O (e1g1) as best move
    const staleLines: EnginePVLine[] = [
      {
        multipv: 1,
        depth: 25,
        seldepth: 30,
        score: { type: "cp", value: 35, scoreCp: 35, mateMoves: null },
        nodes: 50000,
        nps: 100000,
        timeMs: 500,
        pv: ["e1g1", "f8e8"],
        sanPv: ["O-O", "Re8"],
        bestMove: "e1g1",
        bestMoveSan: "O-O",
      },
      {
        multipv: 2,
        depth: 25,
        seldepth: 30,
        score: { type: "cp", value: 30, scoreCp: 30, mateMoves: null },
        nodes: 50000,
        nps: 100000,
        timeMs: 500,
        pv: ["b1c3", "h7h6"],
        sanPv: ["Nc3", "h6"],
        bestMove: "b1c3",
        bestMoveSan: "Nc3",
      },
    ];

    const result = interpretEngineAnalysis(bothCastledFen, staleLines);

    // Castling O-O MUST be filtered out because White's king is already on g1
    expect(result.bestMoveSan).not.toBe("O-O");
    expect(result.bestMoveSan).toBe("Nc3");
    expect(result.lines.some((l) => l.bestMoveSan === "O-O" || l.bestMove === "e1g1")).toBe(false);
  });

  it("identifies corrupted cached entries that propose illegal castling and rejects them", () => {
    const corruptedEntry: CachedPositionEval = {
      normalizedFen: normalizeFen(bothCastledFen),
      fullFen: bothCastledFen,
      depth: 30,
      evalWhite: 0.45,
      bestMoveSan: "O-O",
      lines: [
        {
          multipv: 1,
          depth: 30,
          seldepth: 35,
          score: { type: "cp", value: 45, scoreCp: 45, mateMoves: null },
          nodes: 100000,
          nps: 200000,
          timeMs: 500,
          pv: ["e1g1"],
          sanPv: ["O-O"],
          bestMove: "e1g1",
          bestMoveSan: "O-O",
        },
      ],
      source: "local",
      timestamp: Date.now(),
    };

    const isValid = validateCachedEntry(bothCastledFen, corruptedEntry);
    expect(isValid).toBe(false);
  });

  it("validates genuine legal moves in cache correctly", () => {
    const validEntry: CachedPositionEval = {
      normalizedFen: normalizeFen(bothCastledFen),
      fullFen: bothCastledFen,
      depth: 30,
      evalWhite: 0.35,
      bestMoveSan: "Nc3",
      lines: [
        {
          multipv: 1,
          depth: 30,
          seldepth: 35,
          score: { type: "cp", value: 35, scoreCp: 35, mateMoves: null },
          nodes: 100000,
          nps: 200000,
          timeMs: 500,
          pv: ["b1c3"],
          sanPv: ["Nc3"],
          bestMove: "b1c3",
          bestMoveSan: "Nc3",
        },
      ],
      source: "local",
      timestamp: Date.now(),
    };

    const isValid = validateCachedEntry(bothCastledFen, validEntry);
    expect(isValid).toBe(true);
  });

  it("clears all cached evaluations completely from memory and storage", async () => {
    const testFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    await saveEvaluationToCache(
      {
        fen: testFen,
        depth: 25,
        lines: [
          {
            multipv: 1,
            depth: 25,
            seldepth: 30,
            score: { type: "cp", value: 20, scoreCp: 20, mateMoves: null },
            nodes: 10000,
            nps: 20000,
            timeMs: 100,
            pv: ["c7c5"],
            sanPv: ["c5"],
            bestMove: "c7c5",
            bestMoveSan: "c5",
          },
        ],
        profile: {
          profile: "balanced",
          topMoveGapCp: 0,
          pv1To3SpreadCp: 0,
          reasoning: "Test",
        },
        motifs: [],
        mateAnalysis: { isMate: false, mateInMoves: null, isMating: false },
        bestMoveSan: "c5",
        evalWhite: 0.2,
      },
      "local",
    );

    const beforeClear = await getCachedEvaluation(testFen);
    expect(beforeClear).not.toBeNull();

    await clearAllCachedEvaluations();

    const afterClear = await getCachedEvaluation(testFen);
    expect(afterClear).toBeNull();
  });
});

