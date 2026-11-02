import type {
  EngineAnalysisResult,
  EnginePVLine,
  ProfileDetails,
  TacticalProfile,
} from "../engine/stockfishTypes";
import { analyzePositionMotifs } from "./chessMotifs";
import { analyzeMateFromLine } from "./mateFilter";

/**
 * Calculates the Tactical vs. Strategic Profile for a position based on
 * the evaluation spread across Stockfish's MultiPV lines.
 *
 * Rules:
 * - If Move #1 is vastly superior to Move #2 (gap > 1.5 pawns / 150 cp), or is a forced mate:
 *   Flagged as 'forced_tactic'.
 * - If top 3 choices evaluate within 0.25 pawns (25 cp) of each other, and no forced tactics exist:
 *   Flagged as 'quiet_positional'.
 * - Otherwise:
 *   Flagged as 'balanced'.
 */
export function evaluateTacticalProfile(lines: EnginePVLine[]): ProfileDetails {
  if (!lines || lines.length === 0) {
    return {
      profile: "quiet_positional",
      topMoveGapCp: 0,
      pv1To3SpreadCp: 0,
      reasoning: "Awaiting engine calculation lines.",
    };
  }

  const sorted = [...lines].sort((a, b) => a.multipv - b.multipv);
  const line1 = sorted[0];
  const line2 = sorted[1];
  const line3 = sorted[2];

  // If top line is a forced checkmate
  if (line1.score.type === "mate" && (line1.score.mateMoves ?? 0) > 0) {
    const mateMoves = line1.score.mateMoves;
    return {
      profile: "forced_tactic",
      topMoveGapCp: 9999,
      pv1To3SpreadCp: 9999,
      reasoning: `Forced checkmate in ${mateMoves} move${mateMoves === 1 ? "" : "s"} found. Only one critical sequence converts the win.`,
    };
  }

  // Calculate gap between Move 1 and Move 2
  let topMoveGapCp = 0;
  if (line2) {
    // Both lines compared using absolute advantage for the side whose turn it is
    const val1 = Math.abs(line1.score.scoreCp);
    const val2 = Math.abs(line2.score.scoreCp);
    topMoveGapCp = Math.abs(line1.score.scoreCp - line2.score.scoreCp);

    // If Move 1 is winning (+1.50) while Move 2 is not
    if (topMoveGapCp >= 150) {
      const pawnDiff = (topMoveGapCp / 100).toFixed(1);
      return {
        profile: "forced_tactic",
        topMoveGapCp,
        pv1To3SpreadCp: line3 ? Math.abs(line1.score.scoreCp - line3.score.scoreCp) : topMoveGapCp,
        reasoning: `Move ${line1.bestMoveSan} is vastly superior to the 2nd choice (${pawnDiff} pawns better). There is a direct tactical solution.`,
      };
    }
  }

  // Calculate spread across top 3 lines
  let pv1To3SpreadCp = 0;
  if (line1 && line2 && line3) {
    const scores = [line1.score.scoreCp, line2.score.scoreCp, line3.score.scoreCp];
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    pv1To3SpreadCp = Math.abs(maxScore - minScore);

    if (pv1To3SpreadCp <= 25) {
      return {
        profile: "quiet_positional",
        topMoveGapCp,
        pv1To3SpreadCp,
        reasoning: `Top 3 moves are within 0.25 pawns of each other. This is a quiet, positional decision where multiple plans are viable.`,
      };
    }
  }

  return {
    profile: "balanced",
    topMoveGapCp,
    pv1To3SpreadCp,
    reasoning: `Position has active dynamic play without an immediately decisive tactical gap.`,
  };
}

/**
 * Translates raw Stockfish MultiPV lines into a complete human-accessible
 * tactical, strategic, and checkmate profile.
 */
export function interpretEngineAnalysis(
  fen: string,
  lines: EnginePVLine[],
  lastMove?: { from: string; to: string },
): EngineAnalysisResult {
  const sortedLines = [...lines].sort((a, b) => a.multipv - b.multipv);
  const topLine = sortedLines[0];

  const profile = evaluateTacticalProfile(sortedLines);
  const motifs = analyzePositionMotifs(fen, topLine?.pv || [], lastMove);
  const mateAnalysis = analyzeMateFromLine(fen, topLine);

  const evalWhite = topLine ? topLine.score.scoreCp / 100 : 0;
  const bestMoveSan = topLine?.bestMoveSan || null;
  const depth = topLine?.depth || 0;

  return {
    fen,
    depth,
    lines: sortedLines,
    profile,
    motifs,
    mateAnalysis,
    bestMoveSan,
    evalWhite,
  };
}
