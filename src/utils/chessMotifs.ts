import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { TacticalMotif } from "../engine/stockfishTypes";

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 1000,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

export const ALL_SQUARES: Square[] = FILES.flatMap((f) => RANKS.map((r) => `${f}${r}` as Square));

/**
 * Checks whether an enemy piece on `targetSquare` is defended by another friendly piece.
 */
export function isPieceDefended(chess: Chess, targetSquare: Square): boolean {
  const piece = chess.get(targetSquare);
  if (!piece) return false;

  const fen = chess.fen();
  const tokens = fen.split(" ");
  // Flip active turn to target piece's color to check if their pieces can reach targetSquare
  tokens[1] = piece.color;
  tokens[3] = "-"; // clear en-passant

  try {
    const flippedChess = new Chess(tokens.join(" "));
    // Temporarily replace piece on targetSquare with enemy pawn to test defense
    const enemyColor: Color = piece.color === "w" ? "b" : "w";
    flippedChess.put({ type: "p", color: enemyColor }, targetSquare);
    const moves = flippedChess.moves({ verbose: true });
    return moves.some((m) => m.to === targetSquare);
  } catch {
    return false;
  }
}

/**
 * Returns all squares attacked by a piece on `square`.
 */
export function getAttackedSquares(chess: Chess, square: Square): Square[] {
  const piece = chess.get(square);
  if (!piece) return [];

  // Generate legal and pseudo-legal attacks
  const fen = chess.fen();
  const tokens = fen.split(" ");
  tokens[1] = piece.color;
  tokens[3] = "-";

  const attacked: Square[] = [];
  try {
    const testGame = new Chess(tokens.join(" "));
    const moves = testGame.moves({ square, verbose: true });
    for (const m of moves) {
      attacked.push(m.to);
    }
  } catch {
    // fallback
  }
  return attacked;
}

/**
 * Detects pins on the board.
 * A pin occurs when an enemy piece cannot move off a ray without exposing a higher-value
 * piece or King behind it to an attack from a sliding piece (Bishop, Rook, Queen).
 */
export function detectPins(chess: Chess): TacticalMotif[] {
  const motifs: TacticalMotif[] = [];
  const turn = chess.turn();
  const enemyColor: Color = turn === "w" ? "b" : "w";

  // Check every sliding piece of the player whose turn just moved or is moving
  for (const sq of ALL_SQUARES) {
    const attacker = chess.get(sq);
    if (!attacker || attacker.color !== turn) continue;
    if (!["b", "r", "q"].includes(attacker.type)) continue;

    // Examine straight or diagonal rays originating from this slider
    const directions = getRayDirections(attacker.type);
    for (const [df, dr] of directions) {
      const raySquares = getRayPath(sq, df, dr);
      if (raySquares.length < 2) continue;

      let firstObstacle: { sq: Square; type: PieceSymbol; color: Color } | null = null;
      let secondObstacle: { sq: Square; type: PieceSymbol; color: Color } | null = null;

      for (const rSq of raySquares) {
        const piece = chess.get(rSq);
        if (piece) {
          if (!firstObstacle) {
            firstObstacle = { sq: rSq, type: piece.type, color: piece.color };
          } else if (!secondObstacle) {
            secondObstacle = { sq: rSq, type: piece.type, color: piece.color };
            break;
          }
        }
      }

      // Pin condition: first obstacle is enemy piece, second obstacle is enemy King or higher-value piece
      if (
        firstObstacle &&
        secondObstacle &&
        firstObstacle.color === enemyColor &&
        secondObstacle.color === enemyColor
      ) {
        const isAbsolute = secondObstacle.type === "k";
        const isRelative = PIECE_VALUES[secondObstacle.type] > PIECE_VALUES[firstObstacle.type];

        if (isAbsolute || isRelative) {
          motifs.push({
            type: "pin",
            name: isAbsolute ? "Absolute Pin" : "Relative Pin",
            description: isAbsolute
              ? `${firstObstacle.type.toUpperCase()} on ${firstObstacle.sq} is pinned to the King by ${attacker.type.toUpperCase()} on ${sq}. Moving it is illegal.`
              : `${firstObstacle.type.toUpperCase()} on ${firstObstacle.sq} is pinned to the ${secondObstacle.type.toUpperCase()} on ${secondObstacle.sq} by ${attacker.type.toUpperCase()} on ${sq}.`,
            attackerSquare: sq,
            targetSquares: [firstObstacle.sq, secondObstacle.sq],
            isAbsolute,
          });
        }
      }
    }
  }

  return motifs;
}

/**
 * Detects forks / double attacks created by a move.
 * A fork occurs when one piece simultaneously attacks two or more enemy targets,
 * where each target is undefended, of higher/equal value, or the King (check).
 */
export function detectFork(chess: Chess, movedSquare: Square): TacticalMotif | null {
  const piece = chess.get(movedSquare);
  if (!piece) return null;

  const enemyColor: Color = piece.color === "w" ? "b" : "w";
  const attackedSquares = getAttackedSquares(chess, movedSquare);
  const targets: {
    square: Square;
    piece: PieceSymbol;
    value: number;
    isKing: boolean;
    defended: boolean;
  }[] = [];

  for (const sq of attackedSquares) {
    const targetPiece = chess.get(sq);
    if (targetPiece && targetPiece.color === enemyColor) {
      const isKing = targetPiece.type === "k";
      const defended = isPieceDefended(chess, sq);
      const pieceVal = PIECE_VALUES[targetPiece.type];
      const attackerVal = PIECE_VALUES[piece.type];

      // A genuine fork target is:
      // 1) The King (check)
      // 2) An undefended piece
      // 3) A piece of greater or equal value than the attacker
      if (isKing || !defended || pieceVal >= attackerVal) {
        targets.push({
          square: sq,
          piece: targetPiece.type,
          value: pieceVal,
          isKing,
          defended,
        });
      }
    }
  }

  if (targets.length >= 2) {
    const hasKing = targets.some((t) => t.isKing);
    const targetDesc = targets.map((t) => `${t.piece.toUpperCase()} on ${t.square}`).join(" and ");
    return {
      type: "fork",
      name: hasKing ? "Royal Fork / Check-Fork" : "Fork / Double Attack",
      description: `${piece.type.toUpperCase()} on ${movedSquare} simultaneously attacks ${targetDesc}.`,
      attackerSquare: movedSquare,
      targetSquares: targets.map((t) => t.square),
    };
  }

  return null;
}

/**
 * Detects skewers.
 * A skewer is an attack through a higher-value piece (King/Queen) where moving it
 * exposes a lower-value or undefended piece behind it on the same ray.
 */
export function detectSkewers(chess: Chess): TacticalMotif[] {
  const motifs: TacticalMotif[] = [];
  const turn = chess.turn();
  const enemyColor: Color = turn === "w" ? "b" : "w";

  for (const sq of ALL_SQUARES) {
    const attacker = chess.get(sq);
    if (!attacker || attacker.color !== turn) continue;
    if (!["b", "r", "q"].includes(attacker.type)) continue;

    const directions = getRayDirections(attacker.type);
    for (const [df, dr] of directions) {
      const raySquares = getRayPath(sq, df, dr);
      if (raySquares.length < 2) continue;

      let firstObstacle: { sq: Square; type: PieceSymbol; color: Color } | null = null;
      let secondObstacle: { sq: Square; type: PieceSymbol; color: Color } | null = null;

      for (const rSq of raySquares) {
        const piece = chess.get(rSq);
        if (piece) {
          if (!firstObstacle) {
            firstObstacle = { sq: rSq, type: piece.type, color: piece.color };
          } else if (!secondObstacle) {
            secondObstacle = { sq: rSq, type: piece.type, color: piece.color };
            break;
          }
        }
      }

      // Skewer condition: first obstacle is high value (K, Q), second is lower value or undefended
      if (
        firstObstacle &&
        secondObstacle &&
        firstObstacle.color === enemyColor &&
        secondObstacle.color === enemyColor
      ) {
        const isSkewer =
          firstObstacle.type === "k" ||
          (firstObstacle.type === "q" && ["r", "b", "n", "p"].includes(secondObstacle.type)) ||
          (firstObstacle.type === "r" && ["b", "n", "p"].includes(secondObstacle.type));

        if (isSkewer) {
          motifs.push({
            type: "skewer",
            name: "Skewer",
            description: `${attacker.type.toUpperCase()} on ${sq} skewers ${firstObstacle.type.toUpperCase()} on ${firstObstacle.sq}, exposing ${secondObstacle.type.toUpperCase()} on ${secondObstacle.sq}.`,
            attackerSquare: sq,
            targetSquares: [firstObstacle.sq, secondObstacle.sq],
          });
        }
      }
    }
  }

  return motifs;
}

/**
 * Detects discovered attacks.
 * Moving a piece from `fromSq` to `toSq` opens a ray for a friendly sliding piece
 * (Bishop, Rook, Queen) to strike an enemy piece.
 */
export function detectDiscoveredAttack(
  fenBefore: string,
  fenAfter: string,
  fromSq: Square,
  toSq: Square,
): TacticalMotif | null {
  try {
    const before = new Chess(fenBefore);
    const after = new Chess(fenAfter);
    const mover = after.get(toSq);
    if (!mover) return null;

    const friendlyColor = mover.color;
    const enemyColor: Color = friendlyColor === "w" ? "b" : "w";

    // Scan all friendly sliding pieces (excluding the piece that moved)
    for (const sq of ALL_SQUARES) {
      if (sq === toSq) continue;
      const slider = after.get(sq);
      if (!slider || slider.color !== friendlyColor) continue;
      if (!["b", "r", "q"].includes(slider.type)) continue;

      // Check if `fromSq` was along a ray of this slider
      const directions = getRayDirections(slider.type);
      for (const [df, dr] of directions) {
        const raySquares = getRayPath(sq, df, dr);
        const vacatedIndex = raySquares.indexOf(fromSq);
        if (vacatedIndex === -1) continue;

        // Check if the ray now hits an enemy target after the move that it couldn't hit before
        let targetSq: Square | null = null;
        for (const rSq of raySquares) {
          const piece = after.get(rSq);
          if (piece) {
            if (piece.color === enemyColor) {
              targetSq = rSq;
            }
            break;
          }
        }

        if (targetSq) {
          // Verify that in the 'before' position, the slider was NOT attacking this target
          const pieceBeforeAtTarget = before.get(targetSq);
          if (pieceBeforeAtTarget && pieceBeforeAtTarget.color === enemyColor) {
            const attackedBefore = getAttackedSquares(before, sq);
            if (!attackedBefore.includes(targetSq)) {
              const targetPiece = after.get(targetSq);
              const isCheck = targetPiece?.type === "k";
              return {
                type: "discovered_attack",
                name: isCheck ? "Discovered Check" : "Discovered Attack",
                description: `Moving ${mover.type.toUpperCase()} to ${toSq} unmasks a discovered attack from ${slider.type.toUpperCase()} on ${sq} against ${targetPiece?.type.toUpperCase()} on ${targetSq}.`,
                attackerSquare: sq,
                targetSquares: [targetSq],
              };
            }
          }
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Detects deflection / decoy motifs along the engine's predicted line.
 * Move 1 lures or forces an enemy piece away from guarding a critical square,
 * enabling Move 2 to strike.
 */
export function detectDeflection(fen: string, lanPv: string[]): TacticalMotif | null {
  if (lanPv.length < 3) return null;

  try {
    const game = new Chess(fen);
    const m1Lan = lanPv[0];
    const m2Lan = lanPv[1];
    const m3Lan = lanPv[2];

    const m1From = m1Lan.substring(0, 2) as Square;
    const m1To = m1Lan.substring(2, 4) as Square;
    const m1Move = game.move({ from: m1From, to: m1To, promotion: "q" });
    if (!m1Move) return null;

    const m2From = m2Lan.substring(0, 2) as Square;
    const m2To = m2Lan.substring(2, 4) as Square;
    const m2Move = game.move({ from: m2From, to: m2To, promotion: "q" });
    if (!m2Move) return null;

    // Check if m2 was forced or lured away from m2From
    const m3From = m3Lan.substring(0, 2) as Square;
    const m3To = m3Lan.substring(2, 4) as Square;

    // If move 3 strikes a square that was previously defended or contested by m2From
    const m3Move = game.move({ from: m3From, to: m3To, promotion: "q" });
    if (m3Move && (m3Move.captured || game.isCheckmate())) {
      return {
        type: "deflection",
        name: "Deflection / Decoy",
        description: `Move ${m1Move.san} deflects the opponent's piece from ${m2From}, allowing ${m3Move.san} to break through.`,
        attackerSquare: m1To,
        targetSquares: [m2From, m3To],
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Master motif analyzer combining all tactical detectors for a board position and move line.
 */
export function analyzePositionMotifs(
  currentFen: string,
  lanPv: string[] = [],
  lastMove?: { from: string; to: string },
): TacticalMotif[] {
  const motifs: TacticalMotif[] = [];
  try {
    const chess = new Chess(currentFen);

    // 1. Check for Pins
    motifs.push(...detectPins(chess));

    // 2. Check for Skewers
    motifs.push(...detectSkewers(chess));

    // 3. If a move was just played or PV move is provided, check for Fork and Discovered Attack
    const targetMove =
      lastMove ||
      (lanPv[0] ? { from: lanPv[0].substring(0, 2), to: lanPv[0].substring(2, 4) } : undefined);
    if (targetMove) {
      const from = targetMove.from as Square;
      const to = targetMove.to as Square;

      // Detect fork on the board after the move
      const fork = detectFork(chess, to);
      if (fork) motifs.push(fork);

      // Detect discovered attack
      if (lastMove) {
        // Find previous FEN by undoing in a clone if possible
        const historyChess = new Chess(currentFen);
        const undone = historyChess.undo();
        if (undone) {
          const disc = detectDiscoveredAttack(historyChess.fen(), currentFen, from, to);
          if (disc) motifs.push(disc);
        }
      }
    }

    // 4. Check for Deflection along the PV line
    if (lanPv.length >= 3) {
      const defl = detectDeflection(currentFen, lanPv);
      if (defl) motifs.push(defl);
    }
  } catch {
    // Return any motifs found before error
  }

  // Deduplicate motifs by attackerSquare + targetSquares
  const unique = new Map<string, TacticalMotif>();
  for (const m of motifs) {
    const key = `${m.type}-${m.attackerSquare}-${m.targetSquares.sort().join(",")}`;
    if (!unique.has(key)) {
      unique.set(key, m);
    }
  }

  return Array.from(unique.values());
}

/* ---------------- Helper ray geometry ---------------- */

function getRayDirections(type: PieceSymbol): [number, number][] {
  if (type === "b") {
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  }
  if (type === "r") {
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  }
  if (type === "q") {
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

function getRayPath(from: Square, df: number, dr: number): Square[] {
  const fIdx = FILES.indexOf(from[0]);
  const rIdx = RANKS.indexOf(from[1]);
  const path: Square[] = [];

  let curF = fIdx + df;
  let curR = rIdx + dr;

  while (curF >= 0 && curF < 8 && curR >= 0 && curR < 8) {
    path.push(`${FILES[curF]}${RANKS[curR]}` as Square);
    curF += df;
    curR += dr;
  }

  return path;
}
