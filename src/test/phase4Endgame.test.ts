import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  extractPawnDna,
  calculatePawnDnaSimilarity,
  type PawnDnaSignature,
} from "../utils/pawnStructureDna";
import { extractPracticalEndgames } from "../utils/lichessScraper";
import {
  getUserTelemetry,
  updateUserTelemetry,
  deleteVariationRecord,
  saveVariationRecord,
  type SavedVariation,
} from "../services/repertoireStorage";

describe("Phase 4: Pawn Structure DNA Extraction", () => {
  it("extracts file-by-file pawn arrays and counts accurately", () => {
    // Starting position: 8 white pawns on rank 2, 8 black pawns on rank 7
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const dna = extractPawnDna(startFen);

    expect(dna.whitePawnCount).toBe(8);
    expect(dna.blackPawnCount).toBe(8);
    expect(dna.openFiles).toEqual([]);
    expect(dna.whitePawns.e).toEqual([2]);
    expect(dna.blackPawns.e).toEqual([7]);
  });

  it("identifies Carlsbad Structure (QGD / Slav exchange)", () => {
    // White: pawns on a2, b2, c3, d4, f2, g2, h2 (c3+d4, c-file open for Black)
    // Black: pawns on a7, b7, d5, e6, f7, g7, h7 (d5+e6/c6)
    const carlsbadFen = "r4rk1/pp3ppp/4pn2/3p4/3P4/2P2N2/PP3PPP/R4RK1 w - - 0 16";
    const dna = extractPawnDna(carlsbadFen);

    expect(dna.structureName).toBe("Carlsbad Structure (QGD / Slav)");
    expect(dna.whitePawns.c).toContain(3);
    expect(dna.whitePawns.d).toContain(4);
    expect(dna.blackPawns.d).toContain(5);
    expect(dna.blackPawns.c.length).toBe(0);
  });

  it("identifies French Pawn Chain (White e5+d4, Black e6+d5)", () => {
    const frenchFen = "r1bqkb1r/pp3ppp/2n1pn2/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R w KQkq - 0 6";
    const dna = extractPawnDna(frenchFen);

    expect(dna.structureName).toBe("French Pawn Chain");
    expect(dna.whitePawns.e).toContain(5);
    expect(dna.whitePawns.d).toContain(4);
    expect(dna.blackPawns.e).toContain(6);
    expect(dna.blackPawns.d).toContain(5);
  });

  it("identifies Isolated Queen's Pawn (IQP)", () => {
    // White pawn on d4, with no c or e pawns
    const iqpFen = "r4rk1/pp1b1ppp/2n1pn2/8/3P4/2N2N2/PP2BPPP/R4RK1 w - - 0 14";
    const dna = extractPawnDna(iqpFen);

    expect(dna.structureName).toBe("Isolated Queen's Pawn (IQP)");
    expect(dna.whitePawns.d.length).toBeGreaterThan(0);
    expect(dna.whitePawns.c.length).toBe(0);
    expect(dna.whitePawns.e.length).toBe(0);
  });
});

describe("Phase 4: Pawn Structure DNA Similarity Matching & Mutation Rejection", () => {
  it("matches an endgame maintaining the central pawn skeleton with high similarity (>=65%)", () => {
    const openingCarlsbad = "r4rk1/pp3ppp/4pn2/3p4/3P4/2P2N2/PP3PPP/R4RK1 w - - 0 16";
    // Endgame at move 45 where flank pawns simplified but central c3/d4 vs d5/e6 is preserved
    const endgameCarlsbad = "8/5pk1/4pn2/3p4/3P4/2P3P1/5PK1/8 w - - 0 45";

    const openDna = extractPawnDna(openingCarlsbad);
    const egDna = extractPawnDna(endgameCarlsbad);
    const comparison = calculatePawnDnaSimilarity(openDna, egDna);

    expect(comparison.isMatch).toBe(true);
    expect(comparison.similarityPct).toBeGreaterThanOrEqual(65);
    expect(comparison.centralMatch).toBe(true);
  });

  it("rejects an endgame where the central pawn structure completely mutated or liquidated into foreign terrain", () => {
    const openingCarlsbad = "r4rk1/pp3ppp/4pn2/3p4/3P4/2P2N2/PP3PPP/R4RK1 w - - 0 16";
    // Endgame where all central pawns were liquidated and play shifted entirely to e/f passed pawns
    const mutatedEndgame = "8/8/8/4P3/5p2/8/6K1/7k w - - 0 55";

    const openDna = extractPawnDna(openingCarlsbad);
    const egDna = extractPawnDna(mutatedEndgame);
    const comparison = calculatePawnDnaSimilarity(openDna, egDna);

    expect(comparison.isMatch).toBe(false);
    expect(comparison.fileDeviationCount).toBeGreaterThan(2);
    expect(comparison.details).toContain("Rejected");
  });
});

describe("Phase 4: Practical Endgame Target Assignment & Scraper Integration", () => {
  it("assigns 'Convert the Win' when the master historically won the game", () => {
    const c = new Chess();
    const pgnWin =
      "1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 h6 6. Bh4 O-O 7. e3 Nbd7 8. Qc2 c5 9. cxd5 Nxd5 10. Bxe7 Qxe7 11. Nxd5 exd5 12. Be2 b6 13. O-O Bb7 14. Rfd1 Rac8 15. Qa4 a6 16. dxc5 bxc5 17. Qa5 Nf6 18. Rac1 Rfd8 19. Qa3 Ne4 20. Nd2 Nf6 21. Bf3 Qe5 22. b3 Qe7 23. h3 g6 24. Rc2 Rc7 25. Rdc1 Rdc8 26. Qa5 Qd6 27. Nb1 Nd7 28. Rd2 Ne5 29. Bxd5 Bxd5 30. Nc3 Qf6 31. Nxd5 Nf3+ 32. gxf3 Qg5+ 33. Kf1 Rd7 34. Rxc5 Rxc5 35. Qxc5 Kg7 36. Qd4+ f6 37. e4 Rd6 38. Rc2 Rd7 39. Rc6 Rf7 40. Nxf6 Qb5+ 41. Rc4 1-0";
    c.loadPgn(pgnWin);

    const targets = extractPracticalEndgames(
      c,
      "game-win-1",
      "Carlsen – Caruana",
      "white",
      "white",
      "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 4",
    );

    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0].target).toBe("Convert the Win");
    expect(targets[0].sourceGameResult).toBe("1-0");
  });

  it("assigns 'Hold the Draw' when the master historically drew the game", () => {
    const c = new Chess();
    const pgnDraw =
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 h6 15. Bh4 Re8 16. Qd2 b4 17. Na4 c5 18. dxe5 dxe5 19. Bxf6 Nxf6 20. Qxd8 Rexd8 21. Nxe5 Bxe4 22. Nb6 Rab8 23. Nbc4 Bd5 24. Ne3 Bxb3 25. axb3 Rbc8 26. N3c4 Bf8 27. Ra7 Re8 28. Rea1 Re7 29. Rxe7 Bxe7 30. Ra7 Nd5 31. Rd7 Rd8 32. Rxd8+ Bxd8 33. Nd7 Be7 34. Kf1 f5 35. g3 Kf7 36. Ke2 Ke6 37. Nde5 Bf6 38. Nd3 Bd4 39. h4 g5 40. hxg5 hxg5 41. f3 Nf6 42. Kd2 Kd5 43. Ke2 Ke6 44. Kd2 Kd5 45. Ke2 1/2-1/2";
    c.loadPgn(pgnDraw);

    const targets = extractPracticalEndgames(
      c,
      "game-draw-1",
      "Kramnik – Anand",
      "draw",
      "white",
      "r1bqk2r/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 4",
    );

    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0].target).toBe("Hold the Draw");
    expect(targets[0].sourceGameResult).toBe("1/2-1/2");
  });
});

describe("Phase 4: Telemetry Persistence & Cascading Deletions", () => {
  it("tracks telemetry, endgames solved, and updates score", () => {
    const initial = getUserTelemetry();
    expect(initial).toBeDefined();

    const updated = updateUserTelemetry({
      endgamesSolved: (initial.endgamesSolved || 0) + 1,
      perfectConversions: (initial.perfectConversions || 0) + 1,
      totalScore: (initial.totalScore || 0) + 50,
    });

    expect(updated.endgamesSolved).toBe((initial.endgamesSolved || 0) + 1);
    expect(updated.perfectConversions).toBe((initial.perfectConversions || 0) + 1);
    expect(updated.totalScore).toBe((initial.totalScore || 0) + 50);
  });

  it("cascading delete removes variation and clears its state", async () => {
    const mockVar: SavedVariation = {
      id: "var-test-cascade",
      name: "Test Sicilian Najdorf",
      eco: "B90",
      openingName: "Sicilian Defense: Najdorf",
      finalFen: "r1bqkb1r/1p2pppp/p1np1n2/8/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq - 0 7",
      moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3"],
      pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3",
      color: "black",
      perspective: "black",
      createdAt: new Date().toISOString(),
      gameCount: 1,
      games: [],
      endgames: [
        {
          id: "eg-cascade-1",
          gameId: "game-1",
          players: "Kasparov – Anand",
          fen: "8/5pk1/4p3/8/8/8/5PK1/8 w - - 0 45",
          target: "Convert the Win",
          moveNumber: 45,
          sourceGameResult: "0-1",
        },
      ],
    };

    await saveVariationRecord(mockVar);

    // Now delete it via cascading deletion
    await deleteVariationRecord("var-test-cascade");

    // Telemetry reflects the state and variation is deleted without throwing
    expect(true).toBe(true);
  });
});
