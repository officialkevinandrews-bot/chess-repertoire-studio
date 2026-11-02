/**
 * Type definitions for Universal Chess Interface (UCI) communication
 * and Stockfish multi-line engine analysis.
 */

export type ScoreType = "cp" | "mate";

export interface EvaluationScore {
  type: ScoreType;
  /**
   * Raw value from Stockfish (relative to side to move):
   * centipawns for 'cp', full moves for 'mate'.
   */
  value: number;
  /**
   * Normalized centipawns from White's perspective (+ = White advantage, - = Black advantage).
   * For mate scores, large synthetic values like +100000 or -100000 are used.
   */
  scoreCp: number;
  /**
   * Full moves to checkmate if applicable.
   * Positive = side to move delivers mate in N moves.
   * Negative = side to move is mated in N moves.
   */
  mateMoves: number | null;
}

export interface EnginePVLine {
  multipv: number;
  depth: number;
  seldepth: number;
  score: EvaluationScore;
  nodes: number;
  nps: number;
  timeMs: number;
  /** Predicted variation in LAN format (e.g., ["e2e4", "e7e5", "g1f3"]) */
  pv: string[];
  /** Predicted variation in SAN format (e.g., ["e4", "e5", "Nf3"]) */
  sanPv: string[];
  bestMove: string;
  bestMoveSan: string;
}

export type TacticalProfile = "forced_tactic" | "quiet_positional" | "balanced";

export interface ProfileDetails {
  profile: TacticalProfile;
  /** Gap in centipawns between top move (#1) and move #2 */
  topMoveGapCp: number;
  /** Spread in centipawns across top 3 moves */
  pv1To3SpreadCp: number;
  reasoning: string;
}

export type MotifType = "pin" | "fork" | "skewer" | "discovered_attack" | "deflection";

export interface TacticalMotif {
  type: MotifType;
  name: string;
  description: string;
  attackerSquare: string;
  targetSquares: string[];
  ray?: string[];
  isAbsolute?: boolean;
}

export type MateCategory = "mate_in_1" | "mate_in_2" | "mate_in_3_plus" | "none";

export interface MateAnalysisResult {
  hasMate: boolean;
  category: MateCategory;
  mateInMoves: number | null;
  sideMating: "white" | "black" | null;
  /** Whether the final board state of the PV line was legally confirmed as checkmate via chess.js */
  verifiedCheckmate: boolean;
  matingLineSan: string[];
}

export interface EngineAnalysisResult {
  fen: string;
  depth: number;
  lines: EnginePVLine[];
  profile: ProfileDetails;
  motifs: TacticalMotif[];
  mateAnalysis: MateAnalysisResult;
  /** SAN of the best move */
  bestMoveSan: string | null;
  /** Top evaluation from White's perspective */
  evalWhite: number;
}
