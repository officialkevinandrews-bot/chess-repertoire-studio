import { describe, expect, it } from "vitest";
import { fetchLichessCloudEval } from "../engine/cloudEvalService";
import { stockfishEngine } from "../engine/stockfishClient";
import { ENGINE_ARROW_COLORS } from "../components/chess/ui";
import { Chess } from "chess.js";

describe("Super-GM MultiPV 5 Engine & Arrows", () => {
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("ENGINE_ARROW_COLORS defines 5 distinct color ranks with proper metadata", () => {
    expect(ENGINE_ARROW_COLORS).toHaveLength(5);
    const colors = ENGINE_ARROW_COLORS.map((c) => c.color);
    // Ensure all 5 colors are unique
    expect(new Set(colors).size).toBe(5);

    // Verify Rank 1 is Green/Emerald, Rank 2 is Blue
    expect(ENGINE_ARROW_COLORS[0].rank).toBe(1);
    expect(ENGINE_ARROW_COLORS[0].color).toBe("#10b981");
    expect(ENGINE_ARROW_COLORS[1].rank).toBe(2);
    expect(ENGINE_ARROW_COLORS[1].color).toBe("#3b82f6");
    expect(ENGINE_ARROW_COLORS[2].rank).toBe(3);
    expect(ENGINE_ARROW_COLORS[2].color).toBe("#8b5cf6");
    expect(ENGINE_ARROW_COLORS[3].rank).toBe(4);
    expect(ENGINE_ARROW_COLORS[3].color).toBe("#f59e0b");
    expect(ENGINE_ARROW_COLORS[4].rank).toBe(5);
    expect(ENGINE_ARROW_COLORS[4].color).toBe("#f43f5e");
  });

  it("fetchLichessCloudEval respects test environment guard and returns null gracefully in Vitest", async () => {
    // Under vitest, fetchLichessCloudEval returns null without making network requests
    const result = await fetchLichessCloudEval(startFen, 5);
    expect(result).toBeNull();
  });

  it("stockfishEngine fallback evaluation provides 5 candidate lines (MultiPV 5)", async () => {
    // Calling evaluate in node environment triggers fallback evaluation
    const analysis = await stockfishEngine.evaluate(startFen, {
      depth: 25,
      multiPv: 5,
    });

    expect(analysis).toBeDefined();
    expect(analysis.lines.length).toBe(5);
    expect(analysis.depth).toBe(25);

    // Verify each line has multipv 1 to 5
    for (let i = 0; i < 5; i++) {
      expect(analysis.lines[i].multipv).toBe(i + 1);
      expect(analysis.lines[i].pv.length).toBeGreaterThan(0);
      expect(analysis.lines[i].bestMoveSan).toBeTruthy();
    }
  });

  it("verifies line move stepping replaying LAN moves correctly into SAN", () => {
    const fen = startFen;
    const sim = new Chess(fen);
    const pvLan = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"];
    const sans: string[] = [];

    for (const lan of pvLan) {
      const from = lan.slice(0, 2);
      const to = lan.slice(2, 4);
      const res = sim.move({ from, to });
      expect(res).not.toBeNull();
      sans.push(res.san);
    }

    expect(sans).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4"]);
  });
});
