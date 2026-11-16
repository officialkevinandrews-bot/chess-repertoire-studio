/**
 * PGN Studio helpers: parse uploaded PGN files and derive training material
 * (opening lines, tactics candidates, practical endgame targets) from a game.
 * Pure functions — no engine or storage access, so they are easy to test.
 */
import { Chess } from "chess.js";
import { isTechnicalEndgame } from "./endgameDetector";

export interface ParsedGame {
  id: string;
  headers: Record<string, string>;
  white: string;
  black: string;
  result: string;
  /** SAN moves in order */
  sans: string[];
  /** fens[0] = start position, fens[i] = position after ply i */
  fens: string[];
  /** from/to of ply i (index i-1) */
  moves: { from: string; to: string; lan: string }[];
  pgn: string;
}

/** Split a multi-game PGN file into individual game strings. */
export function splitPgnGames(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const chunks = normalized.split(/\n\s*\n(?=\[Event\s)/);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

export function parseGame(pgn: string, index = 0): ParsedGame | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return null;
  }
  const headers = chess.getHeaders() as Record<string, string>;
  const history = chess.history({ verbose: true });
  if (history.length === 0) return null;
  const startFen = headers.FEN || new Chess().fen();
  const fens = [startFen, ...history.map((m) => m.after)];
  return {
    id: `pgn-${index}-${Math.random().toString(36).slice(2, 8)}`,
    headers,
    white: headers.White || "White",
    black: headers.Black || "Black",
    result: headers.Result || "*",
    sans: history.map((m) => m.san),
    fens,
    moves: history.map((m) => ({ from: m.from, to: m.to, lan: m.lan })),
    pgn,
  };
}

export function parsePgnFile(text: string): ParsedGame[] {
  return splitPgnGames(text)
    .map((g, i) => parseGame(g, i))
    .filter((g): g is ParsedGame => g !== null);
}

/** Convert a side-to-move engine score (centipawns, mate as huge values) to White pawns, clamped to ±10. */
export function toWhitePawns(scoreCp: number, fen: string): number {
  const stm = fen.split(" ")[1] === "b" ? -1 : 1;
  const pawns = (scoreCp * stm) / 100;
  return Math.max(-10, Math.min(10, pawns));
}

export interface SwingMoment {
  /** Ply index of the position BEFORE the mistake (puzzle starts here for the opponent? no — for the side that could punish). */
  ply: number;
  swing: number;
  side: "white" | "black";
}

/**
 * Find tactical moments: plies where the mover's move dropped their evaluation by ≥ threshold pawns.
 * evals[i] = White-perspective eval of fens[i]. The puzzle position is fens[i+1]
 * (the opponent to move, able to punish), returned as `ply: i+1`.
 */
export function detectSwings(evals: (number | null)[], threshold = 1.5): SwingMoment[] {
  const out: SwingMoment[] = [];
  for (let i = 0; i + 1 < evals.length; i++) {
    const a = evals[i];
    const b = evals[i + 1];
    if (a == null || b == null) continue;
    const whiteMoved = i % 2 === 0; // assumes standard start (White to move at ply 0)
    const drop = whiteMoved ? a - b : b - a;
    if (drop >= threshold) {
      out.push({ ply: i + 1, swing: drop, side: whiteMoved ? "black" : "white" });
    }
  }
  return out;
}

/** First ply where the position becomes a technical endgame, or null. */
export function findEndgameStart(fens: string[]): number | null {
  for (let i = 0; i < fens.length; i++) {
    const r = isTechnicalEndgame(fens[i]);
    if (r.isEndgame && r.conditionMet !== "checkmate" && r.conditionMet !== "stalemate") return i;
  }
  return null;
}

export type EndgameGoal = "Convert the Win" | "Hold the Draw" | "Defend and Hold" | "Force a Draw";

/** Pick the practical goal for the side to train, from a White-perspective eval. */
export function endgameGoal(evalWhite: number, side: "white" | "black"): EndgameGoal {
  const forSide = side === "white" ? evalWhite : -evalWhite;
  if (forSide >= 1.5) return "Convert the Win";
  if (forSide <= -1.5) return "Defend and Hold";
  if (forSide < 0) return "Hold the Draw";
  return "Force a Draw";
}

/** "1. e4 e5 2. Nf3" formatting for the first `plies` moves. */
export function sansToPgn(sans: string[]): string {
  return sans
    .map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s))
    .join(" ");
}
