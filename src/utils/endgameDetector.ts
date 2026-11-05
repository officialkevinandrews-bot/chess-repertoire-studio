import { Chess, type Square } from "chess.js";

export interface EndgameCheckResult {
  isEndgame: boolean;
  conditionMet?: "no_queens" | "with_queens" | "checkmate" | "stalemate";
  whitePieces: { queens: number; minorsAndRooks: number };
  blackPieces: { queens: number; minorsAndRooks: number };
  description?: string;
}

/**
 * Checks whether a chess position satisfies the strict technical endgame definition:
 *
 * (Kings and Pawns are completely ignored)
 *
 * Condition 1 (No Queens):
 *  - 0 Queens remaining on the board (White = 0, Black = 0).
 *  - White has <= 2 pieces remaining from {Rook, Knight, Bishop}.
 *  - Black has <= 2 pieces remaining from {Rook, Knight, Bishop}.
 *
 * Condition 2 (With Queens):
 *  - Queens are present on the board.
 *  - White has <= 1 other piece remaining from {Rook, Knight, Bishop}.
 *  - Black has <= 1 other piece remaining from {Rook, Knight, Bishop}.
 */
export function isTechnicalEndgame(chessOrFen: Chess | string): EndgameCheckResult {
  const chess = typeof chessOrFen === "string" ? new Chess(chessOrFen) : chessOrFen;

  // Immediate game-over states
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) {
      return {
        isEndgame: true,
        conditionMet: "checkmate",
        whitePieces: { queens: 0, minorsAndRooks: 0 },
        blackPieces: { queens: 0, minorsAndRooks: 0 },
        description: "Checkmate reached",
      };
    }
    if (chess.isStalemate() || chess.isDraw()) {
      return {
        isEndgame: true,
        conditionMet: "stalemate",
        whitePieces: { queens: 0, minorsAndRooks: 0 },
        blackPieces: { queens: 0, minorsAndRooks: 0 },
        description: "Draw / Stalemate reached",
      };
    }
  }

  const board = chess.board();
  let whiteQueens = 0;
  let blackQueens = 0;
  let whiteMinorsAndRooks = 0;
  let blackMinorsAndRooks = 0;

  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      // Completely ignore kings ('k') and pawns ('p')
      if (piece.type === "k" || piece.type === "p") continue;

      if (piece.type === "q") {
        if (piece.color === "w") whiteQueens++;
        else blackQueens++;
      } else if (piece.type === "r" || piece.type === "b" || piece.type === "n") {
        if (piece.color === "w") whiteMinorsAndRooks++;
        else blackMinorsAndRooks++;
      }
    }
  }

  const whitePieces = { queens: whiteQueens, minorsAndRooks: whiteMinorsAndRooks };
  const blackPieces = { queens: blackQueens, minorsAndRooks: blackMinorsAndRooks };
  const totalQueens = whiteQueens + blackQueens;

  // Condition 1: No Queens
  if (totalQueens === 0) {
    if (whiteMinorsAndRooks <= 2 && blackMinorsAndRooks <= 2) {
      return {
        isEndgame: true,
        conditionMet: "no_queens",
        whitePieces,
        blackPieces,
        description: `Technical Endgame (No Queens): White has ${whiteMinorsAndRooks} pieces, Black has ${blackMinorsAndRooks} pieces`,
      };
    }
  }

  // Condition 2: With Queens
  if (totalQueens > 0) {
    if (whiteMinorsAndRooks <= 1 && blackMinorsAndRooks <= 1) {
      return {
        isEndgame: true,
        conditionMet: "with_queens",
        whitePieces,
        blackPieces,
        description: `Technical Endgame (Queen + Minor/Rook): White has Queen + ${whiteMinorsAndRooks} pieces, Black has Queen + ${blackMinorsAndRooks} pieces`,
      };
    }
  }

  return {
    isEndgame: false,
    whitePieces,
    blackPieces,
  };
}
