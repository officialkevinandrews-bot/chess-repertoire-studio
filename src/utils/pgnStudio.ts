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

/**
 * Convert an already White-normalized centipawn score (from parseUciInfoLine)
 * to White-perspective pawns clamped to [-10, 10], without re-flipping on Black's turn.
 */
export function clampWhiteScoreCp(normalizedWhiteScoreCp: number): number {
  const pawns = normalizedWhiteScoreCp / 100;
  return Math.max(-10, Math.min(10, pawns));
}

export type MoveQualityAnnotation = null | "??" | "?" | "?!";

export interface GameAccuracySummary {
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteBlunders: number;
  blackBlunders: number;
  whiteMistakes: number;
  blackMistakes: number;
  moveAnnotations: MoveQualityAnnotation[];
}

function winProbabilityPct(pawnsForMover: number): number {
  const clamped = Math.max(-10, Math.min(10, pawnsForMover));
  return 50 + 50 * (2 / (1 + Math.exp(-0.4 * clamped)) - 1);
}

/**
 * Compute White & Black accuracy % and per-ply mistake/blunder annotations
 * from White-perspective evaluations (evals[i] = eval before ply i).
 */
export function calculateGameAccuracy(evals: (number | null)[]): GameAccuracySummary {
  const moveAnnotations: MoveQualityAnnotation[] = new Array(Math.max(0, evals.length - 1)).fill(null);
  let whiteSum = 0;
  let whiteCount = 0;
  let blackSum = 0;
  let blackCount = 0;
  let whiteBlunders = 0;
  let blackBlunders = 0;
  let whiteMistakes = 0;
  let blackMistakes = 0;

  for (let i = 0; i + 1 < evals.length; i++) {
    const a = evals[i];
    const b = evals[i + 1];
    if (a == null || b == null) continue;

    const whiteMoved = i % 2 === 0;
    const drop = Math.max(0, whiteMoved ? a - b : b - a);

    if (drop >= 2.0) {
      moveAnnotations[i] = "??";
      if (whiteMoved) whiteBlunders++;
      else blackBlunders++;
    } else if (drop >= 1.0) {
      moveAnnotations[i] = "?";
      if (whiteMoved) whiteMistakes++;
      else blackMistakes++;
    } else if (drop >= 0.5) {
      moveAnnotations[i] = "?!";
    }

    const winBefore = winProbabilityPct(whiteMoved ? a : -a);
    const winAfter = winProbabilityPct(whiteMoved ? b : -b);
    const winLoss = Math.max(0, winBefore - winAfter);
    const moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669));

    if (whiteMoved) {
      whiteSum += moveAcc;
      whiteCount++;
    } else {
      blackSum += moveAcc;
      blackCount++;
    }
  }

  return {
    whiteAccuracy: whiteCount > 0 ? Math.round((whiteSum / whiteCount) * 10) / 10 : 0,
    blackAccuracy: blackCount > 0 ? Math.round((blackSum / blackCount) * 10) / 10 : 0,
    whiteBlunders,
    blackBlunders,
    whiteMistakes,
    blackMistakes,
    moveAnnotations,
  };
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

export const PGN_STUDIO_SESSION_KEY = "chess_buddy_pgn_studio_session_v1";

export interface PgnStudioSession {
  games: ParsedGame[];
  activeIdx: number;
  ply: number;
  evalsByGameId: Record<string, (number | null)[]>;
  bestMovesByGameId: Record<string, ({ pv: string[]; lan: string[] } | null)[]>;
  updatedAt: string;
}

export function savePgnStudioSession(session: PgnStudioSession): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(PGN_STUDIO_SESSION_KEY, JSON.stringify(session));
  } catch {
    // If multi-game upload exceeds localStorage quota, store only the active game
    try {
      const activeGame = session.games[session.activeIdx];
      if (!activeGame) return;
      const trimmed: PgnStudioSession = {
        games: [activeGame],
        activeIdx: 0,
        ply: session.ply,
        evalsByGameId: session.evalsByGameId[activeGame.id]
          ? { [activeGame.id]: session.evalsByGameId[activeGame.id] }
          : {},
        bestMovesByGameId: session.bestMovesByGameId[activeGame.id]
          ? { [activeGame.id]: session.bestMovesByGameId[activeGame.id] }
          : {},
        updatedAt: session.updatedAt,
      };
      window.localStorage.setItem(PGN_STUDIO_SESSION_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage failures
    }
  }
}

export function loadPgnStudioSession(): PgnStudioSession | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PGN_STUDIO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PgnStudioSession;
    if (!parsed || !Array.isArray(parsed.games) || parsed.games.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPgnStudioSession(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(PGN_STUDIO_SESSION_KEY);
  } catch {
    // Ignore storage failures
  }
}
