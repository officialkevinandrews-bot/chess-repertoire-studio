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

function coordsFromSquare(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1];
}

function squareFromCoords(f: number, r: number): Square {
  return `${String.fromCharCode(97 + f)}${r + 1}` as Square;
}

function getRayDirections(pieceType: PieceSymbol): [number, number][] {
  if (pieceType === "b") {
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  }
  if (pieceType === "r") {
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  }
  if (pieceType === "q") {
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  }
  return [];
}

/**
 * Evaluates whether a move sequence constitutes a material-winning tactic
 * and identifies the Primary Motif and any Secondary Motifs according to the 16-motif dictionary.
 *
 * CRITICAL RULE: Rejects forced checkmates (which are routed to the Checkmate Suite).
 */
export function analyzeTacticalMotifs(
  fenBefore: string,
  solutionMovesSan: string[],
  targetMotif?: TacticalMotif,
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
      primaryMotif: "Fork / Double Attack",
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

  const detectedMotifs: TacticalMotif[] = [];

  const fromSq = firstMoveObj.from as Square;
  const toSq = firstMoveObj.to as Square;
  const movedPiece = firstMoveObj.piece as PieceSymbol;
  const capturedPiece = firstMoveObj.captured as PieceSymbol | undefined;
  const isCheck = firstMoveSan.includes("+");

  // 1. Ray-Casting Pin & Skewer Detection
  const pinSkewer = detectRayPinAndSkewer(chess, toSq, userColor, opponentColor, fenBefore, solutionMovesSan);
  if (pinSkewer.hasPin) detectedMotifs.push("Pin");
  if (pinSkewer.hasSkewer) detectedMotifs.push("Skewer");

  // 2. Discovered Attack Detection
  const discAttack = detectDiscoveredAttack(fenBefore, fromSq, toSq, userColor, opponentColor);
  if (discAttack.hasDiscovered) {
    detectedMotifs.push("Discovered Attack");
  }

  // 3. Fork / Double Attack Detection
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
  if (isCheck && solutionMovesSan.length >= 3 && !capturedPiece) {
    detectedMotifs.push("Intermezzo (Zwischenzug / In-Between Move)");
  }

  // 6. Removal of the Defender Detection
  if (capturedPiece && solutionMovesSan.length >= 2) {
    if (detectRemovalOfDefender(fenBefore, toSq, opponentColor, solutionMovesSan)) {
      detectedMotifs.push("Removal of the Defender");
    }
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
    if (detectXRayAttack(chess, toSq, userColor, opponentColor)) {
      detectedMotifs.push("X-Ray Attack");
    }
  }

  // 12. Overloaded Piece Detection
  if (detectOverloadedPiece(fenBefore, opponentColor)) {
    detectedMotifs.push("Overloaded Piece");
  }

  // 13. Interference Detection
  if (detectInterference(fenBefore, toSq, userColor, opponentColor)) {
    detectedMotifs.push("Interference");
  }

  // 14. Windmill Detection
  if (detectWindmillPattern(solutionMovesSan)) {
    detectedMotifs.push("Windmill");
  }

  // Fallback if no specific geometric detector triggered
  if (detectedMotifs.length === 0) {
    if (capturedPiece) {
      detectedMotifs.push("Removal of the Defender");
    } else {
      detectedMotifs.push("Fork / Double Attack");
    }
  }

  // Primary motif is the requested motif if detected, otherwise the initial forcing tactical trigger
  const primaryMotif =
    targetMotif && detectedMotifs.includes(targetMotif) ? targetMotif : detectedMotifs[0];
  const secondaryMotifs = detectedMotifs.filter((m) => m !== primaryMotif);

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
  const userColor = chess.turn() === "w" ? "b" : "w";

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece && piece.color === opponentColor) {
        const sq = piece.square;
        if (chess.isAttacked(sq, userColor)) {
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
 * Real Ray-Casting Pin and Skewer Detector.
 * Traces lines of sight from sliding pieces to identify genuine pins and skewers.
 */
function detectRayPinAndSkewer(
  chess: Chess,
  attackerSq: Square,
  userColor: Color,
  opponentColor: Color,
  fenBefore: string,
  solutionMovesSan: string[],
): { hasPin: boolean; hasSkewer: boolean } {
  let hasPin = false;
  let hasSkewer = false;

  // Check 1: Did the attacker square itself deliver a pin or skewer?
  const piece = chess.get(attackerSq);
  if (piece && piece.color === userColor && (piece.type === "b" || piece.type === "r" || piece.type === "q")) {
    const directions = getRayDirections(piece.type);
    const [f0, r0] = coordsFromSquare(attackerSq);

    for (const [df, dr] of directions) {
      let f = f0 + df;
      let r = r0 + dr;
      const hits: { sq: Square; type: PieceSymbol; color: Color }[] = [];

      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const sq = squareFromCoords(f, r);
        const p = chess.get(sq);
        if (p) {
          hits.push({ sq, type: p.type, color: p.color });
          if (hits.length >= 2) break;
        }
        f += df;
        r += dr;
      }

      if (hits.length === 2 && hits[0].color === opponentColor && hits[1].color === opponentColor) {
        const [front, rear] = hits;

        // Pin: front piece cannot move because rear piece is King (absolute) or higher value (relative)
        if (front.type !== "k" && (rear.type === "k" || PIECE_VALUES[rear.type] > PIECE_VALUES[front.type])) {
          hasPin = true;
        }

        // Skewer: front piece is King or higher value, forcing it to move and exposing rear piece
        if (
          (front.type === "k" || PIECE_VALUES[front.type] > PIECE_VALUES[rear.type]) &&
          rear.type !== "k"
        ) {
          hasSkewer = true;
        }
      }
    }
  }

  // Check 2: Did Black exploit an EXISTING pin by attacking or capturing the pinned piece?
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.color === userColor && (p.type === "b" || p.type === "r" || p.type === "q")) {
        const directions = getRayDirections(p.type);
        const [f0, r0] = coordsFromSquare(p.square);

        for (const [df, dr] of directions) {
          let currF = f0 + df;
          let currR = r0 + dr;
          const hits: { sq: Square; type: PieceSymbol; color: Color }[] = [];

          while (currF >= 0 && currF < 8 && currR >= 0 && currR < 8) {
            const sq = squareFromCoords(currF, currR);
            const targetP = chess.get(sq);
            if (targetP) {
              hits.push({ sq, type: targetP.type, color: targetP.color });
              if (hits.length >= 2) break;
            }
            currF += df;
            currR += dr;
          }

          if (hits.length === 2 && hits[0].color === opponentColor && hits[1].color === opponentColor) {
            if (hits[0].type !== "k" && (hits[1].type === "k" || PIECE_VALUES[hits[1].type] > PIECE_VALUES[hits[0].type])) {
              // The piece on hits[0].sq is pinned!
              // If Black's move attacked or captured this pinned piece, it is a Pin tactic
              if (attackerSq === hits[0].sq || chess.isAttacked(hits[0].sq, userColor)) {
                hasPin = true;
              }
            }
          }
        }
      }
    }
  }

  return { hasPin, hasSkewer };
}

/**
 * Detects discovered attacks unmasked by vacating fromSq.
 */
function detectDiscoveredAttack(
  fenBefore: string,
  fromSq: Square,
  toSq: Square,
  userColor: Color,
  opponentColor: Color,
): { hasDiscovered: boolean; targets: Square[] } {
  const cBefore = new Chess(fenBefore);
  const targets: Square[] = [];
  const [fromF, fromR] = coordsFromSquare(fromSq);

  const board = cBefore.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const slider = board[r][f];
      if (
        slider &&
        slider.color === userColor &&
        slider.square !== fromSq &&
        (slider.type === "r" || slider.type === "b" || slider.type === "q")
      ) {
        const [sf, sr] = coordsFromSquare(slider.square);
        const df = Math.sign(fromF - sf);
        const dr = Math.sign(fromR - sr);

        // Check if slider aligns with fromSq
        const isAligned =
          (df === 0 && dr !== 0) ||
          (df !== 0 && dr === 0) ||
          (Math.abs(fromF - sf) === Math.abs(fromR - sr) && df !== 0 && dr !== 0);

        if (!isAligned) continue;

        // Verify piece type can move in this direction
        const isDiag = df !== 0 && dr !== 0;
        if (isDiag && slider.type === "r") continue;
        if (!isDiag && slider.type === "b") continue;

        // Check if path between slider and fromSq was completely clear
        let stepF = sf + df;
        let stepR = sr + dr;
        let pathClear = true;
        while (stepF !== fromF || stepR !== fromR) {
          if (cBefore.get(squareFromCoords(stepF, stepR))) {
            pathClear = false;
            break;
          }
          stepF += df;
          stepR += dr;
        }

        if (!pathClear) continue;

        // Continue ray past fromSq in fenBefore to find what it was aiming at
        stepF = fromF + df;
        stepR = fromR + dr;
        while (stepF >= 0 && stepF < 8 && stepR >= 0 && stepR < 8) {
          const targetSq = squareFromCoords(stepF, stepR);
          const targetP = cBefore.get(targetSq);
          if (targetP) {
            if (targetP.color === opponentColor) {
              targets.push(targetSq);
            }
            break;
          }
          stepF += df;
          stepR += dr;
        }
      }
    }
  }

  return { hasDiscovered: targets.length > 0, targets };
}

function detectRemovalOfDefender(
  fenBefore: string,
  toSq: Square,
  opponentColor: Color,
  solutionMovesSan: string[],
): boolean {
  if (solutionMovesSan.length < 2) return false;
  // If move 1 captured a piece on toSq, and move 2 or 3 also captured an enemy piece
  return solutionMovesSan.slice(1).some((m) => m.includes("x"));
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
        const pieceMoves = moves.filter((m) => m.from === p.square && m.color === opponentColor);
        if (pieceMoves.length <= 1) {
          trapped.push(p.square);
        }
      }
    }
  }

  return trapped;
}

function detectXRayAttack(
  chess: Chess,
  square: Square,
  userColor: Color,
  opponentColor: Color,
): boolean {
  const piece = chess.get(square);
  if (!piece || (piece.type !== "r" && piece.type !== "b" && piece.type !== "q")) return false;

  const directions = getRayDirections(piece.type);
  const [f0, r0] = coordsFromSquare(square);

  for (const [df, dr] of directions) {
    let f = f0 + df;
    let r = r0 + dr;
    let enemyCount = 0;

    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = chess.get(squareFromCoords(f, r));
      if (p) {
        if (p.color === opponentColor) {
          enemyCount++;
        } else if (p.color === userColor && enemyCount >= 1) {
          // Defending a friendly piece through an enemy piece
          return true;
        }
      }
      f += df;
      r += dr;
    }
  }

  return false;
}

function detectOverloadedPiece(fen: string, opponentColor: Color): boolean {
  const chess = new Chess(fen);
  const board = chess.board();
  let overloaded = false;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.color === opponentColor && (p.type === "q" || p.type === "r" || p.type === "n")) {
        let defendedCount = 0;
        for (let r2 = 0; r2 < 8; r2++) {
          for (let f2 = 0; f2 < 8; f2++) {
            const p2 = board[r2][f2];
            if (p2 && p2.color === opponentColor && p2.square !== p.square) {
              if (chess.isAttacked(p2.square, opponentColor)) defendedCount++;
            }
          }
        }
        if (defendedCount >= 2) overloaded = true;
      }
    }
  }

  return overloaded;
}

function detectInterference(
  fen: string,
  toSq: Square,
  userColor: Color,
  opponentColor: Color,
): boolean {
  const chess = new Chess(fen);
  const board = chess.board();
  const [toF, toR] = coordsFromSquare(toSq);

  // Check if toSq lies between two communicating enemy sliding pieces
  const enemySliders: Square[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.color === opponentColor && (p.type === "r" || p.type === "b" || p.type === "q")) {
        enemySliders.push(p.square);
      }
    }
  }

  for (let i = 0; i < enemySliders.length; i++) {
    for (let j = i + 1; j < enemySliders.length; j++) {
      const [f1, r1] = coordsFromSquare(enemySliders[i]);
      const [f2, r2] = coordsFromSquare(enemySliders[j]);

      // Check if toSq is between sq1 and sq2
      if (
        (f1 === f2 && f1 === toF && ((r1 < toR && toR < r2) || (r2 < toR && toR < r1))) ||
        (r1 === r2 && r1 === toR && ((f1 < toF && toF < f2) || (f2 < toF && toF < f1))) ||
        (Math.abs(f1 - f2) === Math.abs(r1 - r2) &&
          Math.abs(f1 - toF) === Math.abs(r1 - toR) &&
          Math.abs(f2 - toF) === Math.abs(r2 - toR))
      ) {
        return true;
      }
    }
  }

  return false;
}

function detectWindmillPattern(moves: string[]): boolean {
  if (moves.length < 5) return false;
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
    case "X-Ray Attack":
      return `Move ${moveSan} controls key squares through opposing pieces to secure decisive advantage.${secText}`;
    case "Overloaded Piece":
      return `Move ${moveSan} exploits an enemy piece burdened with multiple simultaneous defensive tasks.${secText}`;
    case "Interference":
      return `Move ${moveSan} severs communication lines between enemy defending pieces.${secText}`;
    case "Clearance Sacrifice":
      return `Move ${moveSan} vacates a vital square or line for a follow-up decisive strike.${secText}`;
    case "Windmill":
      return `Move ${moveSan} executes a devastating recurring discovered check sequence.${secText}`;
    default:
      return `Move ${moveSan} initiates a decisive tactical breakthrough winning decisive material.${secText}`;
  }
}
