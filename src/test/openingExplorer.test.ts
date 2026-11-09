import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeFenForExplorer,
  evaluateHiddenGem,
  enrichMovesWithStockfish,
  fetchOpeningExplorer,
  clearExplorerCache,
  type ExplorerMove,
  ALL_RATING_TIERS,
} from "@/services/openingExplorer";
import type { EngineLine } from "@/services/openingExplorer";

describe("Opening Explorer Service", () => {
  beforeEach(() => {
    clearExplorerCache();
    vi.restoreAllMocks();
  });

  describe("normalizeFenForExplorer", () => {
    it("formats standard starting FEN into 6-field explorer format", () => {
      const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const normalized = normalizeFenForExplorer(fen);
      expect(normalized).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    });

    it("cleans trailing or irregular spacing", () => {
      const irregular = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR   w   KQkq   -   4   12";
      const normalized = normalizeFenForExplorer(irregular);
      expect(normalized).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    });
  });

  describe("evaluateHiddenGem", () => {
    it("flags a move as Hidden Gem when Stockfish eval is strong and play frequency is low", () => {
      const move = {
        san: "c3",
        playedPercentage: 4.5, // Only 4.5% played
        whiteWinPct: 52.0,
        drawPct: 24.0,
        blackWinPct: 24.0,
        stockfishEval: 0.65, // Strong advantage for White
        stockfishRank: 1,
      };

      const result = evaluateHiddenGem(move, true); // White to move
      expect(result.isHiddenGem).toBe(true);
      expect(result.reason).toContain("Stockfish +0.65");
      expect(result.reason).toContain("4.5% played");
    });

    it("does not flag heavily booked main lines as Hidden Gems even if engine likes them", () => {
      const mainline = {
        san: "e4",
        playedPercentage: 48.0, // Overwhelming main choice (> 15%)
        whiteWinPct: 40.0,
        drawPct: 35.0,
        blackWinPct: 25.0,
        stockfishEval: 0.40,
        stockfishRank: 1,
      };

      const result = evaluateHiddenGem(mainline, true);
      expect(result.isHiddenGem).toBe(false);
    });

    it("does not flag dubious/losing rare moves as Hidden Gems", () => {
      const blunderingGambit = {
        san: "g4",
        playedPercentage: 1.2, // Rare
        whiteWinPct: 20.0,
        drawPct: 15.0,
        blackWinPct: 65.0,
        stockfishEval: -1.80, // Losing for White
        stockfishRank: 15,
      };

      const result = evaluateHiddenGem(blunderingGambit, true);
      expect(result.isHiddenGem).toBe(false);
    });

    it("flags Hidden Gem for Black when position is Black to move and move is advantageous", () => {
      const blackSurprise = {
        san: "c5",
        playedPercentage: 8.2, // Low frequency
        whiteWinPct: 25.0,
        drawPct: 30.0,
        blackWinPct: 45.0, // High practical score for Black (45 + 15 = 60%)
        stockfishEval: -0.45, // Evaluated -0.45 from White's perspective = +0.45 for Black
        stockfishRank: 1,
      };

      const result = evaluateHiddenGem(blackSurprise, false); // Black to move
      expect(result.isHiddenGem).toBe(true);
      expect(result.reason).toContain("Stockfish -0.45");
      expect(result.reason).toContain("8.2% played");
    });
  });

  describe("enrichMovesWithStockfish", () => {
    it("cross-references engine lines with database moves by UCI and SAN", () => {
      const baseMoves: ExplorerMove[] = [
        {
          uci: "g1f3",
          san: "Nf3",
          white: 1000,
          draws: 500,
          black: 300,
          total: 1800,
          playedPercentage: 60.0,
          whiteWinPct: 55.5,
          drawPct: 27.7,
          blackWinPct: 16.8,
        },
        {
          uci: "c2c4",
          san: "c4",
          white: 200,
          draws: 100,
          black: 50,
          total: 350,
          playedPercentage: 11.6,
          whiteWinPct: 57.1,
          drawPct: 28.6,
          blackWinPct: 14.3,
        },
      ];

      const engineLines: EngineLine[] = [
        {
          multipv: 1,
          depth: 25,
          score: 0.55,
          pv: ["c2c4", "g8f6"],
          bestMoveSan: "c4",
        },
        {
          multipv: 2,
          depth: 25,
          score: 0.40,
          pv: ["g1f3", "d7d5"],
          bestMoveSan: "Nf3",
        },
      ];

      const enriched = enrichMovesWithStockfish(
        baseMoves,
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        engineLines,
      );

      // c4 was ranked #1 by engine and has 11.6% frequency -> should be Hidden Gem!
      const c4Move = enriched.find((m) => m.san === "c4");
      expect(c4Move?.stockfishEval).toBe(0.55);
      expect(c4Move?.stockfishRank).toBe(1);
      expect(c4Move?.isStockfishBest).toBe(true);
      expect(c4Move?.isHiddenGem).toBe(true);

      // Nf3 was ranked #2 by engine and has 60% frequency -> not a Hidden Gem (main line)
      const nf3Move = enriched.find((m) => m.san === "Nf3");
      expect(nf3Move?.stockfishEval).toBe(0.40);
      expect(nf3Move?.stockfishRank).toBe(2);
      expect(nf3Move?.isStockfishBest).toBe(false);
      expect(nf3Move?.isHiddenGem).toBe(false);
    });
  });

  describe("fetchOpeningExplorer with mock API", () => {
    it("aggregates Masters and Lichess databases when mode is 'all'", async () => {
      const mockMastersResponse = {
        white: 100,
        draws: 50,
        black: 25,
        moves: [
          { uci: "g1f3", san: "Nf3", white: 80, draws: 40, black: 20 },
        ],
      };

      const mockLichessResponse = {
        white: 1000,
        draws: 200,
        black: 800,
        moves: [
          { uci: "g1f3", san: "Nf3", white: 600, draws: 100, black: 400, averageRating: 2100 },
          { uci: "e2e4", san: "e4", white: 400, draws: 100, black: 400, averageRating: 1950 },
        ],
      };

      // Mock global fetch
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/masters")) {
          return new Response(JSON.stringify(mockMastersResponse), { status: 200 });
        }
        if (url.includes("/lichess")) {
          return new Response(JSON.stringify(mockLichessResponse), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await fetchOpeningExplorer({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        mode: "all",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.mode).toBe("all");
      expect(result.totalGames).toBe(175 + 2000); // 175 masters + 2000 lichess = 2175
      expect(result.moves.length).toBe(2);

      // Nf3 merged across both databases
      const nf3 = result.moves.find((m) => m.san === "Nf3");
      expect(nf3).toBeDefined();
      expect(nf3?.white).toBe(80 + 600);
      expect(nf3?.draws).toBe(40 + 100);
      expect(nf3?.black).toBe(20 + 400);
      expect(nf3?.total).toBe(140 + 1100); // 1240
    });

    it("serves repeated requests from in-memory cache without hitting network", async () => {
      const mockMastersResponse = {
        white: 50,
        draws: 25,
        black: 25,
        moves: [{ uci: "e2e4", san: "e4", white: 50, draws: 25, black: 25 }],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockMastersResponse), { status: 200 }),
      );

      // First query
      const res1 = await fetchOpeningExplorer({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        mode: "masters",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res1.moves[0].san).toBe("e4");

      // Second query with same parameters
      const res2 = await fetchOpeningExplorer({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        mode: "masters",
      });

      // Fetch spy should still be 1 because cached!
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res2.moves[0].san).toBe("e4");
    });
  });
});
