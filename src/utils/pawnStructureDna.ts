import { Chess, type Square } from "chess.js";

export type ChessFile = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
const FILES: ChessFile[] = ["a", "b", "c", "d", "e", "f", "g", "h"];

export interface PawnDnaSignature {
  whitePawns: Record<ChessFile, number[]>;
  blackPawns: Record<ChessFile, number[]>;
  whitePawnCount: number;
  blackPawnCount: number;
  openFiles: ChessFile[];
  semiOpenWhiteFiles: ChessFile[];
  semiOpenBlackFiles: ChessFile[];
  lockedCentralFiles: ChessFile[];
  structureName: string;
}

export interface PawnDnaComparisonResult {
  similarityPct: number;
  isMatch: boolean;
  centralMatch: boolean;
  fileDeviationCount: number;
  structureName: string;
  details: string;
}

/**
 * Extracts a Pawn Structure DNA Signature from any FEN or Chess instance.
 * Captures file-by-file distribution, central lock status, and opening structural taxonomy.
 */
export function extractPawnDna(chessOrFen: Chess | string): PawnDnaSignature {
  const chess = typeof chessOrFen === "string" ? new Chess(chessOrFen) : chessOrFen;
  const board = chess.board();

  const whitePawns: Record<ChessFile, number[]> = {
    a: [],
    b: [],
    c: [],
    d: [],
    e: [],
    f: [],
    g: [],
    h: [],
  };
  const blackPawns: Record<ChessFile, number[]> = {
    a: [],
    b: [],
    c: [],
    d: [],
    e: [],
    f: [],
    g: [],
    h: [],
  };

  let whiteCount = 0;
  let blackCount = 0;

  for (let r = 0; r < 8; r++) {
    const rankNum = 8 - r;
    for (let f = 0; f < 8; f++) {
      const file = FILES[f];
      const piece = board[r][f];
      if (piece && piece.type === "p") {
        if (piece.color === "w") {
          whitePawns[file].push(rankNum);
          whiteCount++;
        } else {
          blackPawns[file].push(rankNum);
          blackCount++;
        }
      }
    }
  }

  const openFiles: ChessFile[] = [];
  const semiOpenWhiteFiles: ChessFile[] = [];
  const semiOpenBlackFiles: ChessFile[] = [];
  const lockedCentralFiles: ChessFile[] = [];

  for (const f of FILES) {
    const w = whitePawns[f].length;
    const b = blackPawns[f].length;

    if (w === 0 && b === 0) {
      openFiles.push(f);
    } else if (w === 0 && b > 0) {
      semiOpenWhiteFiles.push(f);
    } else if (b === 0 && w > 0) {
      semiOpenBlackFiles.push(f);
    }

    // Check central lock on d and e files
    if (f === "d" || f === "e") {
      const wRanks = whitePawns[f];
      const bRanks = blackPawns[f];
      if (wRanks.length === 1 && bRanks.length === 1) {
        if (wRanks[0] + 1 === bRanks[0]) {
          lockedCentralFiles.push(f);
        }
      }
    }
  }

  // Identify high-level structural name
  const structureName = identifyStructureType(whitePawns, blackPawns, openFiles);

  return {
    whitePawns,
    blackPawns,
    whitePawnCount: whiteCount,
    blackPawnCount: blackCount,
    openFiles,
    semiOpenWhiteFiles,
    semiOpenBlackFiles,
    lockedCentralFiles,
    structureName,
  };
}

/**
 * Classifies the pawn skeleton into recognized classical chess structures.
 */
function identifyStructureType(
  w: Record<ChessFile, number[]>,
  b: Record<ChessFile, number[]>,
  openFiles: ChessFile[],
): string {
  // Carlsbad Structure (White c3+d4, Black d5, semi-open c-file for Black)
  if (w.c.includes(3) && w.d.includes(4) && b.d.includes(5) && b.c.length === 0) {
    return "Carlsbad Structure (QGD / Slav)";
  }

  // Maroczy Bind (White c4 + e4, Black d6 + e7/e6)
  if (w.c.includes(4) && w.e.includes(4) && b.d.includes(6)) {
    return "Maroczy Bind Structure";
  }

  // French Pawn Chain (White e5 + d4, Black e6 + d5)
  if (w.e.includes(5) && w.d.includes(4) && b.e.includes(6) && b.d.includes(5)) {
    return "French Pawn Chain";
  }

  // King's Indian Attack Spearhead (White e5 + d3 + g3, Black d5/e6)
  if (w.e.includes(5) && w.d.includes(3) && w.g.includes(3) && (b.d.includes(5) || b.e.includes(6))) {
    return "King's Indian Attack Spearhead (e5 Wedge)";
  }

  // King's Indian Attack / Reversed Indian Structure (White d3 + e4 + g3)
  if (w.d.includes(3) && w.e.includes(4) && w.g.includes(3)) {
    return "King's Indian Attack / Reversed Indian Structure";
  }

  // Isolated Queen's Pawn (White d4 with no c or e pawns)
  if (w.d.length > 0 && w.c.length === 0 && w.e.length === 0) {
    return "Isolated Queen's Pawn (IQP)";
  }

  // Closed Central Structure (locked d and e pawns)
  if (
    w.d.includes(4) &&
    b.d.includes(5) &&
    ((w.e.includes(4) && b.e.includes(5)) || (w.e.includes(3) && b.e.includes(6)))
  ) {
    return "Classical Closed Center";
  }

  // Open Central Files
  if (openFiles.includes("d") || openFiles.includes("e")) {
    return "Open / Semi-Open Center";
  }

  return "Dynamic Asymmetrical Structure";
}

/**
 * Compares opening pawn DNA against candidate endgame pawn DNA.
 * Strict Match Rule:
 * 1. Preserves critical central pawn files (c, d, e, f).
 * 2. Allows standard flank piece/pawn liquidation typical of master endgame transitions.
 * 3. Rejects endgames where central structure completely mutated or liquidated into foreign terrain.
 */
export function calculatePawnDnaSimilarity(
  openingDna: PawnDnaSignature,
  endgameDna: PawnDnaSignature,
): PawnDnaComparisonResult {
  const centralFiles: ChessFile[] = ["c", "d", "e", "f"];
  let centralMatches = 0;
  let centralDeviations = 0;

  // 1. Central Files Integrity (Weight 45%)
  for (const f of centralFiles) {
    const oWhite = openingDna.whitePawns[f].length > 0;
    const oBlack = openingDna.blackPawns[f].length > 0;
    const eWhite = endgameDna.whitePawns[f].length > 0;
    const eBlack = endgameDna.blackPawns[f].length > 0;

    // Both maintained pawn presence or both legitimately liquidated this specific file
    if (oWhite === eWhite && oBlack === eBlack) {
      centralMatches++;
    } else if (oWhite === eWhite || oBlack === eBlack) {
      centralMatches += 0.5;
      centralDeviations += 0.5;
    } else {
      centralDeviations++;
    }
  }

  const centralScore = (centralMatches / centralFiles.length) * 45;

  // 2. Open / Semi-Open Files Correlation (Weight 30%)
  let openFilesScore = 0;
  const oOpenSet = new Set(openingDna.openFiles);
  const eOpenSet = new Set(endgameDna.openFiles);
  let sharedOpenCount = 0;
  for (const f of oOpenSet) {
    if (eOpenSet.has(f)) sharedOpenCount++;
  }
  openFilesScore = oOpenSet.size === 0 ? 30 : (sharedOpenCount / Math.max(oOpenSet.size, 1)) * 30;

  // 3. Flank Pawn Maintenance (Weight 25%)
  const flankFiles: ChessFile[] = ["a", "b", "g", "h"];
  let flankMatches = 0;
  let flankDeviations = 0;
  for (const f of flankFiles) {
    const oTotal = openingDna.whitePawns[f].length + openingDna.blackPawns[f].length;
    const eTotal = endgameDna.whitePawns[f].length + endgameDna.blackPawns[f].length;
    if (Math.abs(oTotal - eTotal) <= 1) {
      flankMatches++;
    } else {
      flankDeviations++;
    }
  }
  const flankScore = (flankMatches / flankFiles.length) * 25;

  const similarityPct = Math.round(centralScore + openFilesScore + flankScore);
  const centralMatch = centralMatches >= 2.5 && centralDeviations <= 1.5;
  const isMatch =
    (similarityPct >= 65 && centralDeviations <= 1.5) ||
    (centralMatches >= 3 && similarityPct >= 60);

  let details = `Pawn DNA: ${similarityPct}% similarity. ${endgameDna.structureName}.`;
  if (!isMatch) {
    details = `Rejected: Central structure mutated (${centralDeviations} central deviations).`;
  }

  return {
    similarityPct,
    isMatch,
    centralMatch,
    fileDeviationCount: centralDeviations + flankDeviations,
    structureName: endgameDna.structureName,
    details,
  };
}
