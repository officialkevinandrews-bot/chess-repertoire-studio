import { describe, expect, it } from "vitest";
import { detectSwings, endgameGoal, findEndgameStart, parsePgnFile, toWhitePawns } from "../utils/pgnStudio";

const TWO = `[Event "A"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "B"]
[White "Carl"]
[Black "Dee"]
[Result "0-1"]

1. d4 d5 0-1`;

describe("pgnStudio", () => {
  it("parses multiple games from one file", () => {
    const g = parsePgnFile(TWO);
    expect(g).toHaveLength(2);
    expect(g[0].white).toBe("Alice");
    expect(g[0].sans).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(g[0].fens).toHaveLength(5);
    expect(g[1].black).toBe("Dee");
  });
  it("flags a drop of 1.5 pawns as a tactic for the opponent", () => {
    // White blunders on ply 2 (index 2 -> 3): +0.3 -> -2.0
    const s = detectSwings([0.2, 0.3, 0.3, -2.0, -1.9]);
    expect(s).toHaveLength(1);
    expect(s[0].side).toBe("white");
    expect(s[0].ply).toBe(3);
    expect(detectSwings([0, 0.3, 0, -1.0])).toHaveLength(0);
  });
  it("normalises black-to-move scores to White perspective", () => {
    expect(toWhitePawns(150, "8/8/8/8/8/8/8/8 b - - 0 1")).toBe(-1.5);
    expect(toWhitePawns(100000, "8/8/8/8/8/8/8/8 w - - 0 1")).toBe(10);
  });
  it("finds endgame start and goal", () => {
    expect(findEndgameStart(["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "4k3/8/8/8/8/8/4P3/4K2R w - - 0 1"])).toBe(1);
    expect(endgameGoal(2, "white")).toBe("Convert the Win");
    expect(endgameGoal(2, "black")).toBe("Defend and Hold");
  });
});
