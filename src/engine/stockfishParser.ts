import { Chess, type Square } from "chess.js";
import type { EnginePVLine, EvaluationScore } from "./stockfishTypes";

/**
 * Parses a single UCI 'info' line from Stockfish.
 * Example line:
 * "info depth 15 seldepth 22 multipv 1 score cp 45 nodes 12345 nps 50000 time 246 pv e2e4 e7e5 g1f3"
 */
export function parseUciInfoLine(line: string, currentFen: string): EnginePVLine | null {
  if (!line.startsWith("info ") || !line.includes("score ") || !line.includes(" pv ")) {
    return null;
  }

  const tokens = line.trim().split(/\s+/);
  let depth = 0;
  let seldepth = 0;
  let multipv = 1;
  let scoreType: "cp" | "mate" = "cp";
  let scoreValue = 0;
  let nodes = 0;
  let nps = 0;
  let timeMs = 0;
  const pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "depth" && i + 1 < tokens.length) {
      depth = parseInt(tokens[++i], 10) || 0;
    } else if (token === "seldepth" && i + 1 < tokens.length) {
      seldepth = parseInt(tokens[++i], 10) || 0;
    } else if (token === "multipv" && i + 1 < tokens.length) {
      multipv = parseInt(tokens[++i], 10) || 1;
    } else if (token === "score" && i + 2 < tokens.length) {
      const type = tokens[++i];
      const val = parseInt(tokens[++i], 10) || 0;
      if (type === "cp" || type === "mate") {
        scoreType = type;
        scoreValue = val;
      }
    } else if (token === "nodes" && i + 1 < tokens.length) {
      nodes = parseInt(tokens[++i], 10) || 0;
    } else if (token === "nps" && i + 1 < tokens.length) {
      nps = parseInt(tokens[++i], 10) || 0;
    } else if (token === "time" && i + 1 < tokens.length) {
      timeMs = parseInt(tokens[++i], 10) || 0;
    } else if (token === "pv") {
      // Everything after "pv" constitutes the move sequence
      for (let j = i + 1; j < tokens.length; j++) {
        // Stop if another UCI keyword appears
        if (["bmc", "refutation"].includes(tokens[j])) break;
        pv.push(tokens[j]);
      }
      break;
    }
  }

  if (pv.length === 0) {
    return null;
  }

  // Determine side to move from FEN to normalize score to White's view
  let isWhiteTurn = true;
  try {
    const game = new Chess(currentFen);
    isWhiteTurn = game.turn() === "w";
  } catch {
    isWhiteTurn = true;
  }

  let normalizedScoreCp = 0;
  let mateMoves: number | null = null;

  if (scoreType === "cp") {
    // UCI score cp is relative to the side whose turn it is
    normalizedScoreCp = isWhiteTurn ? scoreValue : -scoreValue;
  } else if (scoreType === "mate") {
    mateMoves = scoreValue; // e.g. +2 means side to move mates in 2, -2 means mated
    const isMating = scoreValue > 0;
    const absMoves = Math.max(1, Math.abs(scoreValue));
    const rawVal = 100000 - absMoves * 100;

    if (isWhiteTurn) {
      normalizedScoreCp = isMating ? rawVal : -rawVal;
    } else {
      normalizedScoreCp = isMating ? -rawVal : rawVal;
    }
  }

  const score: EvaluationScore = {
    type: scoreType,
    value: scoreValue,
    scoreCp: normalizedScoreCp,
    mateMoves,
  };

  // Convert LAN pv line (e.g. ["e2e4", "e7e5"]) to SAN (["e4", "e5"])
  const sanPv = convertLanPvToSan(currentFen, pv);
  const bestMove = pv[0] || "";
  const bestMoveSan = sanPv[0] || bestMove;

  return {
    multipv,
    depth,
    seldepth,
    score,
    nodes,
    nps,
    timeMs,
    pv,
    sanPv,
    bestMove,
    bestMoveSan,
  };
}

/**
 * Converts a sequence of UCI Long Algebraic Notation moves (e.g. ["e2e4", "e7e5"])
 * into Standard Algebraic Notation (SAN) moves using chess.js.
 */
export function convertLanPvToSan(fen: string, lanMoves: string[]): string[] {
  const sanMoves: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const lan of lanMoves) {
      if (!lan || lan.length < 4) break;
      const from = lan.substring(0, 2) as Square;
      const to = lan.substring(2, 4) as Square;
      const promotion = lan.length > 4 ? lan[4].toLowerCase() : undefined;

      try {
        const move = chess.move({ from, to, promotion });
        if (move) {
          sanMoves.push(move.san);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  } catch {
    return lanMoves;
  }
  return sanMoves;
}

/**
 * Parses the 'bestmove' output line from Stockfish.
 * Format: "bestmove e2e4 [ponder e7e5]"
 */
export function parseBestMove(line: string): { bestMove: string; ponder?: string } | null {
  const match = line.match(
    /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)(?:\s+ponder\s+([a-h][1-8][a-h][1-8][qrbn]?))?/i,
  );
  if (!match) return null;
  return {
    bestMove: match[1],
    ponder: match[2],
  };
}
