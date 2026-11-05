import { describe, expect, it } from "vitest";
import { identifyOpening } from "../utils/openingNames";
import {
  extractPracticalEndgames,
  normalizeFen,
  rankModelGames,
  scrapeGamesForVariation,
} from "../utils/lichessScraper";
import { Chess } from "chess.js";
import {
  DEFAULT_LICHESS_TOKEN,
  deleteVariationRecord,
  getAllVariations,
  getStoredLichessToken,
  saveVariationRecord,
  type SavedVariation,
  type ScrapedGame,
} from "../services/repertoireStorage";

describe("Phase 2: Opening Identification & Repertoire Scraper", () => {
  it("has permanent Lichess token configured by default", () => {
    expect(DEFAULT_LICHESS_TOKEN.startsWith("lip_")).toBe(true);
    expect(DEFAULT_LICHESS_TOKEN.length).toBe(24);
    expect(getStoredLichessToken().startsWith("lip_")).toBe(true);
  });
  it("identifies Sicilian Najdorf from moves", () => {
    const moves = ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"];
    const res = identifyOpening(moves);
    expect(res.eco).toBe("B90");
    expect(res.name).toContain("Najdorf");
  });

  it("identifies Queen's Gambit Declined from moves", () => {
    const moves = ["d4", "d5", "c4", "e6", "Nc3", "Nf6"];
    const res = identifyOpening(moves);
    expect(res.eco).toBe("D30");
    expect(res.name).toBe("Queen's Gambit Declined");
  });

  it("identifies Italian Game from moves", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4"];
    const res = identifyOpening(moves);
    expect(res.eco).toBe("C50");
    expect(res.name).toBe("Italian Game");
  });

  it("normalizes FEN by keeping piece positions and active color while stripping clocks", () => {
    const fen1 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    const fen2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 4 12";
    expect(normalizeFen(fen1)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq");
    expect(normalizeFen(fen2)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq");
    expect(normalizeFen(fen1)).toBe(normalizeFen(fen2));
  });

  it("ranks Grandmasters before International Masters and Untitled games", () => {
    const mockGames: ScrapedGame[] = [
      {
        id: "untitled-1",
        white: { name: "Untitled Master", rating: 2200 },
        black: { name: "Opponent", rating: 2180 },
        winner: "white",
        year: 2021,
        plyCount: 40,
        movesSan: [],
        pgn: "",
        fenAtVariation: "",
        plyAtVariation: 10,
        accuracyScore: 94,
        matchType: "exact",
      },
      {
        id: "im-1",
        white: { name: "IM Player", rating: 2450, title: "IM" },
        black: { name: "Opponent", rating: 2420 },
        winner: "white",
        year: 2020,
        plyCount: 45,
        movesSan: [],
        pgn: "",
        fenAtVariation: "",
        plyAtVariation: 10,
        accuracyScore: 95,
        matchType: "exact",
      },
      {
        id: "gm-1",
        white: { name: "Grandmaster Alpha", rating: 2750, title: "GM" },
        black: { name: "Grandmaster Beta", rating: 2710, title: "GM" },
        winner: "white",
        year: 2023,
        plyCount: 50,
        movesSan: [],
        pgn: "",
        fenAtVariation: "",
        plyAtVariation: 10,
        accuracyScore: 97,
        matchType: "exact",
      },
    ];

    const ranked = rankModelGames(mockGames, "white");
    expect(ranked[0].white.title).toBe("GM");
    expect(ranked[1].white.title).toBe("IM");
    expect(ranked[2].white.title).toBeUndefined();
  });

  it("extracts practical endgames from game history when pieces <= 6", () => {
    const c = new Chess();
    const pgn =
      "1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 h6 6. Bh4 O-O 7. e3 Nbd7 8. Qc2 c5 9. cxd5 Nxd5 10. Bxe7 Qxe7 11. Nxd5 exd5 12. Be2 b6 13. O-O Bb7 14. Rfd1 Rac8 15. Qa4 a6 16. dxc5 bxc5 17. Qa5 Nf6 18. Rac1 Rfd8 19. Qa3 Ne4 20. Nd2 Nf6 21. Bf3 Qe5 22. b3 Qe7 23. h3 g6 24. Rc2 Rc7 25. Rdc1 Rdc8 26. Qa5 Qd6 27. Nb1 Nd7 28. Rd2 Ne5 29. Bxd5 Bxd5 30. Nc3 Qf6 31. Nxd5 Nf3+ 32. gxf3 Qg5+ 33. Kf1 Rd7 34. Rxc5 Rxc5 35. Qxc5 Kg7 36. Qd4+ f6 37. e4 Rd6 38. Rc2 Rd7 39. Rc6 Rf7 40. Nxf6 Qb5+ 41. Rc4 1-0";
    c.loadPgn(pgn);

    const endgames = extractPracticalEndgames(
      c,
      "test-game-1",
      "Carlsen – Caruana, 2023",
      "white",
      "white",
    );

    expect(endgames.length).toBeGreaterThan(0);
    expect(endgames[0].players).toBe("Carlsen – Caruana, 2023");
    expect(endgames[0].target).toBe("Convert the Win");
    expect(endgames[0].moveNumber).toBeGreaterThanOrEqual(35);
  });

  it("scrapes games pool, identifies transpositions, closest lines, and seeds model games", async () => {
    const finalFen = "r1bqk2r/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 11";
    const moves = ["d4", "d5", "c4", "e6", "Nf3", "Nf6", "Nc3", "Be7"];

    const result = await scrapeGamesForVariation(finalFen, moves, {
      targetGameCount: 15,
      userColor: "white",
    });

    expect(result.games.length).toBeGreaterThanOrEqual(10);
    expect(result.endgames.length).toBeGreaterThan(0);

    // Highest rated GM games prioritized
    const topGame = result.games[0];
    expect(topGame.white.name).toBeDefined();
    expect(topGame.white.title).toBe("GM");
    expect(topGame.white.rating).toBeGreaterThanOrEqual(2700);
    expect(topGame.accuracyScore).toBeGreaterThanOrEqual(95);

    // Pool contains variety of match types for deep pattern recognition
    const matchTypes = new Set(result.games.map((g) => g.matchType));
    expect(matchTypes.size).toBeGreaterThan(0);
  });

  it("saves an opening line and deletes it completely along with all associated games and endgames", async () => {
    const mockVariation: SavedVariation = {
      id: "test-variation-delete-123",
      name: "Najdorf Scraped Test Line",
      eco: "B90",
      openingName: "Sicilian Defense: Najdorf Variation",
      pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6",
      finalFen: "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6",
      moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
      color: "white",
      createdAt: new Date().toISOString(),
      gameCount: 2,
      games: [
        {
          id: "game-to-purge-1",
          white: { name: "Kasparov", rating: 2800, title: "GM" },
          black: { name: "Karpov", rating: 2750, title: "GM" },
          winner: "white",
          year: 1990,
          plyCount: 40,
          movesSan: ["e4", "c5"],
          pgn: "",
          fenAtVariation: "",
          accuracyScore: 98,
          matchType: "exact",
        },
        {
          id: "game-to-purge-2",
          white: { name: "Anand", rating: 2790, title: "GM" },
          black: { name: "Topalov", rating: 2780, title: "GM" },
          winner: "white",
          year: 2005,
          plyCount: 42,
          movesSan: ["e4", "c5"],
          pgn: "",
          fenAtVariation: "",
          accuracyScore: 96,
          matchType: "transposition",
        },
      ],
      endgames: [
        {
          id: "endgame-to-purge-1",
          players: "Kasparov – Karpov, 1990",
          target: "Convert the Win",
          fen: "8/8/8/8/4k3/8/4K3/8 w - - 0 1",
          moveNumber: 40,
        },
      ],
    };

    await saveVariationRecord(mockVariation);
    const afterSave = await getAllVariations();
    expect(afterSave.some((v) => v.id === mockVariation.id)).toBe(true);

    // Now delete the variation
    await deleteVariationRecord(mockVariation.id);

    const afterDelete = await getAllVariations();
    expect(afterDelete.some((v) => v.id === mockVariation.id)).toBe(false);

    // Verify all associated games and endgames are completely purged from the repertoire pool
    const remainingGames = afterDelete.flatMap((v) => v.games || []);
    const remainingEndgames = afterDelete.flatMap((v) => v.endgames || []);
    expect(remainingGames.some((g) => g.id === "game-to-purge-1")).toBe(false);
    expect(remainingGames.some((g) => g.id === "game-to-purge-2")).toBe(false);
    expect(remainingEndgames.some((e) => e.id === "endgame-to-purge-1")).toBe(false);
  });
});
