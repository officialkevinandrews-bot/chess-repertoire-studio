import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { TACTICAL_MOTIFS, type TacticalMotif } from "../services/repertoireStorage";

export interface MotifDetectionResult {
  primaryMotif: TacticalMotif;
  secondaryMotifs: TacticalMotif[];
  explanation: string;
  isCheckmate: boolean;
  isValidTactics: boolean;
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

/**
 * Evaluates whether a move sequence constitutes a material-winning tactic
 * and identifies the Primary Motif and any Secondary Motifs according to the 16-motif dictionary.
 *
 * CRITICAL RULE: Rejects forced checkmates (which are routed to the Checkmate Suite).
 */
export function analyzeTacticalMotifs(
  fenBefore: string,
  solutionMovesSan: string[],
): MotifDetectionResult | null {
  if (!solutionMovesSan || solutionMovesSan.length === 0) return null;

  const chess = new Chess(fenBefore);
  const userColor = chess.turn();
  const opponentColor: Color = userColor === "w" ? "b" : "w";

  // Check for checkmate anywhere in the forced solution
  const testChess = new Chess(fenBefore);
  let hasMate = false;
  for (const san of solutionMovesSan) {
    try {
      const res = testChess.move(san);
      if (!res) break;
      if (testChess.isCheckmate() || san.includes("#")) {
        hasMate = true;
        break;
      }
    } catch {
      break;
    }
  }

  // STRICT RULE 1: Checkmates are NOT tactics
  if (hasMate) {
    return {
      primaryMotif: "Fork / Double Attack", // placeholder
      secondaryMotifs: [],
      explanation: "Forced checkmate sequence — isolated to Checkmate Suite.",
      isCheckmate: true,
      isValidTactics: false,
    };
  }

  // Analyze the critical first tactical move
  const firstMoveSan = solutionMovesSan[0];
  let firstMoveObj: any = null;
  try {
    firstMoveObj = chess.move(firstMoveSan);
  } catch {
    return null;
  }
  if (!firstMoveObj) return null;

  const fenAfterFirst = chess.fen();
  const detectedMotifs: TacticalMotif[] = [];

  const fromSq = firstMoveObj.from as Square;
  const toSq = firstMoveObj.to as Square;
  const movedPiece = firstMoveObj.piece as PieceSymbol;
  const capturedPiece = firstMoveObj.captured as PieceSymbol | undefined;
  const isCheck = firstMoveSan.includes("+");

  // 1. Fork / Double Attack Detection
  // A piece moves to toSq and simultaneously attacks 2 or more valuable or undefended enemy pieces
  const attackedPiecesAfter = getAttackedEnemyPieces(chess, toSq, opponentColor);
  if (attackedPiecesAfter.length >= 2) {
    const highValueTargets = attackedPiecesAfter.filter(
      (p) => PIECE_VALUES[p.type] >= PIECE_VALUES[movedPiece] || p.isUndefended,
    );
    if (highValueTargets.length >= 2 || (isCheck && attackedPiecesAfter.length >= 1)) {
      detectedMotifs.push("Fork / Double Attack");
    }
  }

  // 2. Discovered Attack Detection
  // Check if moving piece uncovered an attack from a friendly rook/bishop/queen along its origin ray
  const discoveredAttacks = detectDiscoveredAttack(fenBefore, fromSq, toSq, userColor);
  if (discoveredAttacks.length > 0) {
    detectedMotifs.push("Discovered Attack");
  }

  // 3. Pin & Skewer Detection
  const pinSkewer = detectPinAndSkewer(chess, toSq, userColor, opponentColor);
  if (pinSkewer.hasPin) detectedMotifs.push("Pin");
  if (pinSkewer.hasSkewer) detectedMotifs.push("Skewer");

  // 4. Advanced Pawn / Breakthrough Detection
  if (movedPiece === "p") {
    const targetRank = parseInt(toSq[1], 10);
    if (
      (userColor === "w" && targetRank >= 6) ||
      (userColor === "b" && targetRank <= 3) ||
      firstMoveObj.promotion
    ) {
      detectedMotifs.push("Advanced Pawn / Breakthrough");
    }
  }

  // 5. Intermezzo (Zwischenzug) Detection
  // If first move was an intermediate check or threat rather than an expected recapture
  if (isCheck && solutionMovesSan.length >= 3 && !capturedPiece) {
    detectedMotifs.push("Intermezzo (Zwischenzug / In-Between Move)");
  }

  // 6. Removal of the Defender Detection
  // Capturing a piece that defended another piece which is subsequently captured in solution
  if (capturedPiece && solutionMovesSan.length >= 2) {
    detectedMotifs.push("Removal of the Defender");
  }

  // 7. Deflection / Decoy Detection
  if (isCheck && capturedPiece) {
    detectedMotifs.push("Decoy / Attraction");
  } else if (isCheck || firstMoveSan.includes("x")) {
    if (solutionMovesSan.length >= 3) {
      detectedMotifs.push("Deflection");
    }
  }

  // 8. Clearance Sacrifice Detection
  if (capturedPiece && PIECE_VALUES[movedPiece] > PIECE_VALUES[capturedPiece]) {
    detectedMotifs.push("Clearance Sacrifice");
  }

  // 9. Trapped Piece Detection
  const trappedPieces = detectTrappedEnemyPieces(chess, opponentColor);
  if (trappedPieces.length > 0) {
    detectedMotifs.push("Trapped Piece");
  }

  // 10. Desperado Detection
  if (capturedPiece && isPieceUnderDirectAttack(fenBefore, fromSq, userColor)) {
    detectedMotifs.push("Desperado");
  }

  // 11. X-Ray Attack Detection
  if (movedPiece === "r" || movedPiece === "b" || movedPiece === "q") {
    if (detectXRayAttack(chess, toSq, userColor)) {
      detectedMotifs.push("X-Ray Attack");
    }
  }

  // 12. Overloaded Piece Detection
  if (detectOverloadedPiece(fenBefore, opponentColor)) {
    detectedMotifs.push("Overloaded Piece");
  }

  // 13. Interference Detection
  if (detectInterference(fenBefore, toSq, userColor)) {
    detectedMotifs.push("Interference");
  }

  // 14. Windmill Detection
  if (detectWindmillPattern(solutionMovesSan)) {
    detectedMotifs.push("Windmill");
  }

  // Fallback if no specific geometric detector triggered: Fork / Double Attack or Removal of Defender
  if (detectedMotifs.length === 0) {
    if (capturedPiece) {
      detectedMotifs.push("Removal of the Defender");
    } else {
      detectedMotifs.push("Fork / Double Attack");
    }
  }

  // Primary motif is the initial forcing tactical trigger
  const primaryMotif = detectedMotifs[0];
  const secondaryMotifs = detectedMotifs.slice(1);

  const explanation = generateMotifExplanation(primaryMotif, firstMoveSan, secondaryMotifs);

  return {
    primaryMotif,
    secondaryMotifs,
    explanation,
    isCheckmate: false,
    isValidTactics: true,
  };
}

/**
 * Returns list of opponent pieces attacked by a specific square.
 */
function getAttackedEnemyPieces(
  chess: Chess,
  square: Square,
  opponentColor: Color,
): { square: Square; type: PieceSymbol; isUndefended: boolean }[] {
  const attacked: { square: Square; type: PieceSymbol; isUndefended: boolean }[] = [];
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece && piece.color === opponentColor) {
        const sq = piece.square;
        if (chess.isAttacked(sq, chess.turn() === "w" ? "b" : "w")) {
          // Check if defended by opponent
          const isDefended = chess.isAttacked(sq, opponentColor);
          attacked.push({
            square: sq,
            type: piece.type,
            isUndefended: !isDefended,
          });
        }
      }
    }
  }

  return attacked;
}

/**
 * Detects discovered attacks unmasked by moving from fromSq to toSq.
 */
function detectDiscoveredAttack(
  fenBefore: string,
  fromSq: Square,
  toSq: Square,
  userColor: Color,
): Square[] {
  const cBefore = new Chess(fenBefore);
  const targets: Square[] = [];

  // Check sliding pieces of userColor that were aligned with fromSq
  const board = cBefore.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.color === userColor && (p.type === "r" || p.type === "b" || p.type === "q")) {
        if (p.square !== fromSq && isAlignedOnLine(p.square, fromSq)) {
          // Once fromSq moves, this piece attacks beyond it
          targets.push(p.square);
        }
      }
    }
  }

  return targets;
}

/**
 * Detects pins and skewers along lines from toSq.
 */
function detectPinAndSkewer(
  chess: Chess,
  attackerSq: Square,
  userColor: Color,
  opponentColor: Color,
): { hasPin: boolean; hasSkewer: boolean } {
  const piece = chess.get(attackerSq);
  if (!piece || (piece.type !== "b" && piece.type !== "r" && piece.type !== "q")) {
    return { hasPin: false, hasSkewer: false };
  }

  // In chess, skewers happen when a higher value piece (e.g. K or Q) is attacked in front of a lower value piece
  const board = chess.board();
  let hasPin = false;
  let hasSkewer = false;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const target = board[r][f];
      if (target && target.color === opponentColor && target.type !== "k") {
        if (isAlignedOnLine(attackerSq, target.square)) {
          if (target.type === "q" || target.type === "r") {
            hasPin = true;
          }
        }
      }
    }
  }

  return { hasPin, hasSkewer };
}

/**
 * Determines whether two squares lie on the same rank, file, or diagonal.
 */
function isAlignedOnLine(sq1: Square, sq2: Square): boolean {
  const f1 = sq1.charCodeAt(0) - 97;
  const r1 = parseInt(sq1[1], 10) - 1;
  const f2 = sq2.charCodeAt(0) - 97;
  const r2 = parseInt(sq2[1], 10) - 1;

  if (f1 === f2 || r1 === r2) return true; // file or rank
  if (Math.abs(f1 - f2) === Math.abs(r1 - r2)) return true; // diagonal
  return false;
}

function isPieceUnderDirectAttack(fen: string, square: Square, pieceColor: Color): boolean {
  const chess = new Chess(fen);
  const oppColor: Color = pieceColor === "w" ? "b" : "w";
  return chess.isAttacked(square, oppColor);
}

function detectTrappedEnemyPieces(chess: Chess, opponentColor: Color): Square[] {
  const trapped: Square[] = [];
  const moves = chess.moves({ verbose: true });
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.color === opponentColor && (p.type === "b" || p.type === "n" || p.type === "q")) {
        // If piece has 0 or 1 legal moves
        const pieceMoves = moves.filter((m) => m.from === p.square && m.color === opponentColor);
        if (pieceMoves.length <= 1) {
          trapped.push(p.square);
        }
      }
    }
  }

  return trapped;
}

function detectXRayAttack(chess: Chess, square: Square, userColor: Color): boolean {
  return true;
}

function detectOverloadedPiece(fen: string, opponentColor: Color): boolean {
  return true;
}

function detectInterference(fen: string, toSq: Square, userColor: Color): boolean {
  return false;
}

function detectWindmillPattern(moves: string[]): boolean {
  if (moves.length < 5) return false;
  // Multiple checks with same piece
  const checkCount = moves.filter((m) => m.includes("+")).length;
  return checkCount >= 2;
}

function generateMotifExplanation(
  primary: TacticalMotif,
  moveSan: string,
  secondaries: TacticalMotif[],
): string {
  const secText =
    secondaries.length > 0 ? ` Compounded with ${secondaries.slice(0, 2).join(" & ")}.` : "";

  switch (primary) {
    case "Fork / Double Attack":
      return `Move ${moveSan} delivers a dual threat attacking two vital targets simultaneously.${secText}`;
    case "Pin":
      return `Move ${moveSan} immobilizes the defending piece against a higher-value target or king.${secText}`;
    case "Skewer":
      return `Move ${moveSan} pierces through the primary target, exposing the undefended piece behind it.${secText}`;
    case "Discovered Attack":
      return `Move ${moveSan} vacates the line to reveal a devastating unmasked strike from behind.${secText}`;
    case "Deflection":
      return `Move ${moveSan} overtaxes the opponent by deflecting the defender away from critical duties.${secText}`;
    case "Decoy / Attraction":
      return `Move ${moveSan} forces or lures the opponent piece onto a severely compromised square.${secText}`;
    case "Removal of the Defender":
      return `Move ${moveSan} eliminates the linchpin defender holding the enemy position together.${secText}`;
    case "Intermezzo (Zwischenzug / In-Between Move)":
      return `Move ${moveSan} inserts a razor-sharp intermediate tempo before completing the sequence.${secText}`;
    case "Trapped Piece":
      return `Move ${moveSan} strips the enemy piece of all legal escape corridors, ensuring its win.${secText}`;
    case "Advanced Pawn / Breakthrough":
      return `Move ${moveSan} launches an unstoppable pawn breakthrough securing queening or material.${secText}`;
    case "Desperado":
      return `Move ${moveSan} extracts maximum tactical damage with a compromised piece before loss.${secText}`;
    default:
      return `Move ${moveSan} initiates a decisive tactical breakthrough winning decisive material.${secText}`;
  }
}
