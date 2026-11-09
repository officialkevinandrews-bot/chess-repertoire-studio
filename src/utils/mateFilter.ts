import { Chess, type Square } from "chess.js";
import type { EnginePVLine, MateAnalysisResult, MateCategory } from "../engine/stockfishTypes";

/**
 * Categorizes a forced checkmate count into granular UI filters:
 * - "Mate in 1"
 * - "Mate in 2"
 * - "Mate in 3+"
 */
export function categorizeMateMoves(moves: number | null): MateCategory {
  if (moves === null || moves <= 0) return "none";
  if (moves === 1) return "mate_in_1";
  if (moves === 2) return "mate_in_2";
  return "mate_in_3_plus";
}

export function formatMateCategoryTitle(category: MateCategory): string {
  switch (category) {
    case "mate_in_1":
      return "Mate in 1";
    case "mate_in_2":
      return "Mate in 2";
    case "mate_in_3_plus":
      return "Mate in 3+";
    default:
      return "No Mate";
  }
}

/**
 * Plays out the predicted engine variation line from the given FEN
 * and verifies using chess.js that the final board state is an absolute legal checkmate.
 */
export function verifyCheckmateLine(
  fen: string,
  lanPv: string[],
): {
  verified: boolean;
  movesSan: string[];
  finalFen: string;
  isCheckmate: boolean;
  reason?: string;
} {
  const result = {
    verified: false,
    movesSan: [] as string[],
    finalFen: fen,
    isCheckmate: false,
    reason: undefined as string | undefined,
  };

  if (!lanPv || lanPv.length === 0) {
    result.reason = "Empty PV line";
    return result;
  }

  try {
    const chess = new Chess(fen);
    for (let i = 0; i < lanPv.length; i++) {
      const lan = lanPv[i];
      const from = lan.substring(0, 2) as Square;
      const to = lan.substring(2, 4) as Square;
      const promotion = lan.length > 4 ? lan[4].toLowerCase() : "q";

      const legalMoves = chess.moves();
      if (legalMoves.length === 0) {
        break;
      }

      const move = chess.move({ from, to, promotion });
      if (!move) {
        result.reason = `Illegal move encountered at ply ${i + 1}: ${lan}`;
        return result;
      }
      result.movesSan.push(move.san);
    }

    result.finalFen = chess.fen();
    result.isCheckmate = chess.isCheckmate();
    result.verified = result.isCheckmate;

    if (!result.isCheckmate) {
      result.reason = "Line ended without an absolute checkmate state";
    }
  } catch (err) {
    result.reason = `Simulation error: ${String(err)}`;
  }

  return result;
}

/**
 * Extracts and constructs a comprehensive MateAnalysisResult from the top Stockfish engine line.
 */
export function analyzeMateFromLine(fen: string, topLine?: EnginePVLine): MateAnalysisResult {
  if (!topLine || topLine.score.type !== "mate" || topLine.score.mateMoves === null) {
    return {
      hasMate: false,
      category: "none",
      mateInMoves: null,
      sideMating: null,
      verifiedCheckmate: false,
      matingLineSan: [],
    };
  }

  const rawMate = topLine.score.mateMoves;
  const isPositive = rawMate > 0;
  const movesCount = Math.abs(rawMate);

  let sideMating: "white" | "black" = "white";
  try {
    const game = new Chess(fen);
    const turn = game.turn();
    if (isPositive) {
      sideMating = turn === "w" ? "white" : "black";
    } else {
      sideMating = turn === "w" ? "black" : "white";
    }
  } catch {
    sideMating = "white";
  }

  // Only consider positive mates where the attacking side to move is delivering mate
  if (!isPositive) {
    return {
      hasMate: true,
      category: "none",
      mateInMoves: -movesCount,
      sideMating,
      verifiedCheckmate: false,
      matingLineSan: topLine.sanPv,
    };
  }

  const category = categorizeMateMoves(movesCount);
  const verification = verifyCheckmateLine(fen, topLine.pv);

  return {
    hasMate: true,
    category,
    mateInMoves: movesCount,
    sideMating,
    verifiedCheckmate: verification.verified,
    matingLineSan: verification.movesSan.length > 0 ? verification.movesSan : topLine.sanPv,
  };
}

/**
 * Validates a user's attempted move against a forced checkmate problem.
 * Mandatory Rule: Any move that fails to achieve the forced checkmate is flagged as incorrect,
 * even if it wins material or creates a strong advantage.
 */
export function verifyUserCheckmateAttempt(
  currentFen: string,
  userMove: { from: string; to: string; promotion?: string },
  correctMatingPv: string[],
): {
  isCorrect: boolean;
  userMoveSan: string;
  expectedMoveSan: string;
  feedback: string;
  remainingLinePv: string[];
} {
  const userLan = `${userMove.from}${userMove.to}${userMove.promotion || ""}`.toLowerCase();
  const expectedLan = (correctMatingPv[0] || "").toLowerCase();

  let userMoveSan = userLan;
  let expectedMoveSan = expectedLan;

  try {
    const c1 = new Chess(currentFen);
    const mUser = c1.move({
      from: userMove.from as Square,
      to: userMove.to as Square,
      promotion: userMove.promotion || "q",
    });
    if (mUser) userMoveSan = mUser.san;
  } catch {
    //
  }

  try {
    const c2 = new Chess(currentFen);
    const from = expectedLan.substring(0, 2) as Square;
    const to = expectedLan.substring(2, 4) as Square;
    const promo = expectedLan.length > 4 ? expectedLan[4] : "q";
    const mExp = c2.move({ from, to, promotion: promo });
    if (mExp) expectedMoveSan = mExp.san;
  } catch {
    //
  }

  // Check if user played the exact critical winning move
  const match =
    userLan.startsWith(expectedLan.substring(0, 4)) &&
    (!expectedLan[4] || userLan[4] === expectedLan[4]);

  if (match) {
    return {
      isCorrect: true,
      userMoveSan,
      expectedMoveSan,
      feedback: `Correct! ${userMoveSan} continues the forced checkmate sequence.`,
      remainingLinePv: correctMatingPv.slice(1),
    };
  }

  return {
    isCorrect: false,
    userMoveSan,
    expectedMoveSan,
    feedback: `Incorrect. ${userMoveSan} does not maintain the forced checkmate sequence. Even moves that win material are incorrect when a forced mate is available (${expectedMoveSan} was required).`,
    remainingLinePv: correctMatingPv,
  };
}
