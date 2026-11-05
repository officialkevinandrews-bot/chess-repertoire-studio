import { Chess } from "chess.js";
import { PREPOPULATED_PIRC_TACTICS } from "../src/utils/prepopulatedTactics";
import { analyzeTacticalMotifs } from "../src/utils/tacticsMotifEngine";
import { classifyTacticalTier } from "../src/utils/tacticsTierMatrix";
import type { TacticalMotif, TacticalTierLevel, TacticsPuzzleItem } from "../src/services/repertoireStorage";
import fs from "fs";
import path from "path";

function getMaterialScore(fen: string, color: "white" | "black"): number {
  const chess = new Chess(fen);
  const board = chess.board();
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let myScore = 0;
  let oppScore = 0;
  const c = color === "white" ? "w" : "b";
  const opp = color === "white" ? "b" : "w";

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece) {
        if (piece.color === c) myScore += values[piece.type] || 0;
        else if (piece.color === opp) oppScore += values[piece.type] || 0;
      }
    }
  }

  return myScore - oppScore;
}

console.log("Existing total puzzles in catalog:", PREPOPULATED_PIRC_TACTICS.length);

// 1. Keep ALL 450 existing forks untouched!
const forkPuzzles = PREPOPULATED_PIRC_TACTICS.filter(p => p.primaryMotif === "Fork / Double Attack");
console.log("Preserving verified Fork puzzles:", forkPuzzles.length);

// We will construct authentic tactical templates for the remaining 15 motifs.
const nonForkMotifs: TacticalMotif[] = [
  "Pin",
  "Skewer",
  "Discovered Attack",
  "Removal of the Defender",
  "Intermezzo (Zwischenzug / In-Between Move)",
  "Trapped Piece",
  "Advanced Pawn / Breakthrough",
  "Deflection",
  "Decoy / Attraction",
  "Overloaded Piece",
  "X-Ray Attack",
  "Clearance Sacrifice",
  "Interference",
  "Desperado",
  "Windmill"
];

console.log("Motifs to regenerate authentically:", nonForkMotifs.length);
