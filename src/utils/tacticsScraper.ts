import { Chess } from "chess.js";
import {
  type TacticsPuzzleItem,
  type TacticalMotif,
  type TacticalTierLevel,
  getStoredLichessToken,
} from "../services/repertoireStorage";
import { analyzeTacticalMotifs } from "./tacticsMotifEngine";
import { classifyTacticalTier } from "./tacticsTierMatrix";

/**
 * Mapping of canonical 16 tactical motifs to Lichess API theme angles.
 */
export const MOTIF_TO_LICHESS_THEME: Record<TacticalMotif, string> = {
  "Pin": "pin",
  "Fork / Double Attack": "fork",
  "Skewer": "skewer",
  "Discovered Attack": "discoveredAttack",
  "Deflection": "deflection",
  "Decoy / Attraction": "attraction",
  "Clearance Sacrifice": "clearance",
  "Interference": "interference",
  "Overloaded Piece": "overload",
  "X-Ray Attack": "xRayAttack",
  "Trapped Piece": "trappedPiece",
  "Advanced Pawn / Breakthrough": "advancedPawn",
  "Intermezzo (Zwischenzug / In-Between Move)": "intermezzo",
  "Windmill": "windmill",
  "Desperado": "desperado",
  "Removal of the Defender": "capturingDefender",
};

/**
 * Fetches verified tactical puzzles from Lichess's curated master database
 * for a specific motif and specific player perspective (White vs Black).
 *
 * STRICT RULES:
 * - When targetColor === "black", puzzles are strictly from Black's perspective
 *   (Black to move, Black winning material).
 * - When targetColor === "white", puzzles are strictly from White's perspective.
 * - Forced checkmates are strictly filtered out (isolated for Checkmate Suite).
 * - All UCI solution moves are verified through chess.js and converted to SAN and LAN.
 */
export async function fetchLichessThematicPuzzles(
  motif: TacticalMotif,
  count = 3,
  targetColor?: "white" | "black",
  openingVariationId?: string,
  openingName?: string,
): Promise<TacticsPuzzleItem[]> {
  const theme = MOTIF_TO_LICHESS_THEME[motif] || "fork";
  const token = getStoredLichessToken();
  const results: TacticsPuzzleItem[] = [];

  // 1. First attempt fast batch query for rich diversity
  try {
    const batchRes = await fetch(`https://lichess.org/api/puzzle/batch/${theme}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (batchRes.ok) {
      const data = await batchRes.json();
      const items = data.puzzles || [];

      for (const item of items) {
        if (results.length >= count) break;
        try {
          // Replay PGN using native chess.js parser
          const fullGame = new Chess();
          fullGame.loadPgn(item.game.pgn);
          const history = fullGame.history();
          const targetPly = item.puzzle.initialPly + 1;
          if (targetPly > history.length) continue;

          const posChess = new Chess();
          for (let i = 0; i < targetPly; i++) posChess.move(history[i]);

          const fen = posChess.fen();
          const turn = fen.includes(" w ") ? "white" : "black";

          // Strictly enforce perspective (Black vs White)
          if (targetColor && turn !== targetColor) continue;

          // Reject checkmate themes
          if ((item.puzzle.themes || []).some((t: string) => t.toLowerCase().includes("mate"))) {
            continue;
          }

          // Validate solution line
          const solChess = new Chess(fen);
          const sanMoves: string[] = [];
          const lanMoves: string[] = [];
          let endsInMate = false;

          for (const uci of item.puzzle.solution) {
            const from = uci.slice(0, 2);
            const to = uci.slice(2, 4);
            const promotion = uci.length > 4 ? uci[4] : undefined;
            let m;
            try {
              m = solChess.move({ from, to, promotion });
            } catch {
              break;
            }
            if (!m) break;
            sanMoves.push(m.san);
            lanMoves.push(`${from}${to}`);
            if (solChess.isCheckmate() || m.san.includes("#")) {
              endsInMate = true;
              break;
            }
          }

          if (endsInMate || sanMoves.length !== item.puzzle.solution.length) continue;

          const rating = item.puzzle.rating || 1500;
          const { tierLevel, tierName } = classifyTacticalTier(rating, sanMoves.length);

          const whitePlayer = item.game?.players?.[0]?.name || "White";
          const blackPlayer = item.game?.players?.[1]?.name || "Black";

          results.push({
            id: `lichess-${item.puzzle.id}`,
            fen,
            initialTurn: turn,
            solutionPv: sanMoves,
            solutionLanPv: lanMoves,
            primaryMotif: motif,
            secondaryMotifs: [],
            tierLevel,
            tierName,
            rating,
            moveLength: sanMoves.length,
            sourceGameId: item.game?.id || item.puzzle.id,
            players: `${whitePlayer} vs ${blackPlayer}`,
            openingVariationId,
            openingName,
            explanation: `Verified ${turn.toUpperCase()} ${motif} strike from ${whitePlayer} vs ${blackPlayer} (Rating ${rating}). Play the winning combination.`,
            isCheckmate: false,
          });
        } catch {
          // continue
        }
      }
    }
  } catch {
    // continue to next endpoint
  }

  // 2. If needed, supplement with individual next puzzle endpoint
  if (results.length < count) {
    for (let i = 0; i < 4 && results.length < count; i++) {
      try {
        const res = await fetch(`https://lichess.org/api/puzzle/next?angle=${theme}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;

        const data = await res.json();
        const p = data.puzzle;
        const g = data.game;
        if (!p || !p.fen || !p.solution) continue;

        const turn = p.fen.includes(" w ") ? "white" : "black";
        if (targetColor && turn !== targetColor) continue;
        if ((p.themes || []).some((t: string) => t.toLowerCase().includes("mate"))) continue;

        const chess = new Chess(p.fen);
        const sanMoves: string[] = [];
        const lanMoves: string[] = [];
        let endsInMate = false;

        for (const uci of p.solution) {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = uci.length > 4 ? uci[4] : undefined;
          const m = chess.move({ from, to, promotion });
          if (!m) break;
          sanMoves.push(m.san);
          lanMoves.push(`${from}${to}`);
          if (chess.isCheckmate() || m.san.includes("#")) {
            endsInMate = true;
            break;
          }
        }

        if (endsInMate || sanMoves.length !== p.solution.length) continue;

        const rating = p.rating || 1500;
        const { tierLevel, tierName } = classifyTacticalTier(rating, sanMoves.length);
        const whitePlayer = g?.players?.[0]?.name || "White";
        const blackPlayer = g?.players?.[1]?.name || "Black";

        results.push({
          id: `lichess-${p.id}`,
          fen: p.fen,
          initialTurn: turn,
          solutionPv: sanMoves,
          solutionLanPv: lanMoves,
          primaryMotif: motif,
          secondaryMotifs: [],
          tierLevel,
          tierName,
          rating,
          moveLength: sanMoves.length,
          sourceGameId: g?.id || p.id,
          players: `${whitePlayer} vs ${blackPlayer}`,
          openingVariationId,
          openingName,
          explanation: `Verified ${turn.toUpperCase()} ${motif} strike from ${whitePlayer} vs ${blackPlayer} (Rating ${rating}). Play the winning combination.`,
          isCheckmate: false,
        });
      } catch {
        // ignore
      }
    }
  }

  return results;
}

/**
 * Calculates raw material score for a given side.
 */
function getMaterialScore(fen: string, color: "white" | "black"): number {
  const chess = new Chess(fen);
  const board = chess.board();
  const c = color === "white" ? "w" : "b";
  const opp = color === "white" ? "b" : "w";
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  let myScore = 0;
  let oppScore = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece) {
        if (piece.color === c) myScore += values[piece.type] || 0;
        else if (piece.color === opp) oppScore += values[piece.type] || 0;
      }
    }
  }

  return myScore - oppScore;
}

/**
 * Extracts tactics from a played master game with strict perspective filtering.
 * Only accepts positions that yield a material gain (>= 2 pawns) for the target side.
 */
export function extractTacticsFromGame(
  gameId: string,
  players: string,
  movesSan: string[],
  openingVariationId?: string,
  openingName?: string,
  targetColor?: "white" | "black",
): TacticsPuzzleItem[] {
  const puzzles: TacticsPuzzleItem[] = [];
  if (!movesSan || movesSan.length < 10) return puzzles;

  const chess = new Chess();

  for (let i = 0; i < movesSan.length - 1; i++) {
    const isWhiteTurn = i % 2 === 0;
    const currentTurn: "white" | "black" = isWhiteTurn ? "white" : "black";
    const fenBefore = chess.fen();
    const moveSan = movesSan[i];

    // Strictly enforce player perspective
    if (targetColor && currentTurn !== targetColor) {
      try {
        chess.move(moveSan);
      } catch {
        break;
      }
      continue;
    }

    try {
      const moveObj = chess.move(moveSan);
      if (!moveObj) break;

      const moveNum = Math.floor(i / 2) + 1;
      const isInflectionPoint =
        moveNum >= 6 && (moveSan.includes("+") || moveSan.includes("x") || moveObj.piece === "n");

      if (isInflectionPoint) {
        const solutionSlice = movesSan.slice(i, Math.min(movesSan.length, i + 4));
        if (solutionSlice.length < 2) continue;

        // Verify solution legality and generate LAN
        const simChess = new Chess(fenBefore);
        const validSan: string[] = [];
        const validLan: string[] = [];
        let hasMate = false;

        for (const m of solutionSlice) {
          try {
            const res = simChess.move(m);
            if (!res) break;
            validSan.push(res.san);
            validLan.push(`${res.from}${res.to}`);
            if (simChess.isCheckmate() || res.san.includes("#")) {
              hasMate = true;
              break;
            }
          } catch {
            break;
          }
        }

        // Exclude checkmates
        if (hasMate || validSan.length !== solutionSlice.length) continue;

        // Check material difference before and after to ensure a true material win
        const matBefore = getMaterialScore(fenBefore, currentTurn);
        const matAfter = getMaterialScore(simChess.fen(), currentTurn);
        const netGain = matAfter - matBefore;

        // Only keep if the tactical sequence genuinely wins material (>= 2 pawns)
        if (netGain >= 2) {
          const motifAnalysis = analyzeTacticalMotifs(fenBefore, validSan);
          if (motifAnalysis && motifAnalysis.isValidTactics && !motifAnalysis.isCheckmate) {
            const estimatedRating = 1100 + Math.min(1300, moveNum * 30 + validSan.length * 100);
            const { tierLevel, tierName } = classifyTacticalTier(estimatedRating, validSan.length);

            puzzles.push({
              id: `tac-${gameId}-${i}`,
              fen: fenBefore,
              initialTurn: currentTurn,
              solutionPv: validSan,
              solutionLanPv: validLan,
              primaryMotif: motifAnalysis.primaryMotif,
              secondaryMotifs: motifAnalysis.secondaryMotifs,
              tierLevel,
              tierName,
              rating: estimatedRating,
              moveLength: validSan.length,
              sourceGameId: gameId,
              players,
              openingVariationId,
              openingName,
              explanation: motifAnalysis.explanation,
              isCheckmate: false,
            });

            i += 2; // skip forward
          }
        }
      }
    } catch {
      break;
    }
  }

  return puzzles;
}

/**
 * Seed database placeholder array (intentionally empty — all tactics are dynamically synced).
 */
export const SEED_TACTICS_PUZZLES: TacticsPuzzleItem[] = [];
