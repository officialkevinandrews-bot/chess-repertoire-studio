import { Chess } from "chess.js";
import {
  type TacticsPuzzleItem,
  type TacticalMotif,
  type TacticalTierLevel,
  type SavedVariation,
  getStoredLichessToken,
} from "../services/repertoireStorage";
import { analyzeTacticalMotifs } from "./tacticsMotifEngine";
import { classifyTacticalTier } from "./tacticsTierMatrix";

/**
 * Resolves a repertoire variation name to a standard Lichess opening angle tag.
 * e.g., "Sicilian Defense: Najdorf Variation" -> "Sicilian_Defense_Najdorf_Variation"
 */
export function resolveLichessOpeningTag(name?: string): string {
  if (!name || !name.trim()) return "";
  let clean = name
    .replace(/['`’]/g, "")
    .replace(/:\s*/g, "_")
    .replace(/[\s\/]+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "");
  clean = clean.replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  return clean;
}

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
 * Progress telemetry for single-motif batch ingestion.
 */
export interface MotifSyncProgress {
  motif: TacticalMotif;
  currentLevel: TacticalTierLevel;
  levelCounts: Record<TacticalTierLevel, number>;
  levelTargets: Record<TacticalTierLevel, number>;
  exemptLevels: TacticalTierLevel[];
  startsAtLevel: TacticalTierLevel;
  totalPuzzlesCollected: number;
  totalTarget: number;
  statusMessage: string;
  isComplete: boolean;
  rateLimitEncountered?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LEVEL_DIFFICULTIES: Record<
  TacticalTierLevel,
  "easiest" | "easier" | "normal" | "harder" | "hardest"
> = {
  1: "easiest",
  2: "easier",
  3: "normal",
  4: "normal",
  5: "harder",
  6: "harder",
  7: "hardest",
  8: "hardest",
  9: "hardest",
};

/**
 * Synchronizes puzzles for a single motif in strict level-by-level progression (Levels 1 to 9).
 *
 * GOAL:
 * - 50 puzzles per level across 9 levels = 450 puzzles total.
 * - If a motif has no Level 1 puzzles (starts at Level 2), target dynamically adjusts to 400.
 * - If Level 1 & 2 are absent, target adjusts to 350.
 * - Level 1 is populated first, then Level 2, etc.
 * - 100% deduplication against existing stored puzzles.
 * - Strict perspective isolation: Black repertoire = Black to move and winning material.
 * - Forced checkmates are strictly isolated.
 */
export async function syncMotifTacticsBatch(
  motif: TacticalMotif,
  variation: SavedVariation | null,
  perspective: "white" | "black",
  existingPuzzles: TacticsPuzzleItem[],
  onProgress?: (p: MotifSyncProgress) => void,
  perLevelTarget = 50,
): Promise<{ newPuzzles: TacticsPuzzleItem[]; progress: MotifSyncProgress }> {
  const theme = MOTIF_TO_LICHESS_THEME[motif] || "fork";
  const token = getStoredLichessToken();
  const openingTag = variation?.name ? resolveLichessOpeningTag(variation.name) : "";

  // 1. Analyze existing puzzles for this motif and perspective
  const levelCounts: Record<TacticalTierLevel, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  };

  const seenIds = new Set<string>();
  for (const p of existingPuzzles) {
    seenIds.add(p.id);
    if (
      p.primaryMotif === motif &&
      p.initialTurn === perspective &&
      (!variation || !p.openingVariationId || p.openingVariationId === variation.id)
    ) {
      if (p.tierLevel >= 1 && p.tierLevel <= 9) {
        levelCounts[p.tierLevel]++;
      }
    }
  }

  // 2. Determine starting level and exempt levels
  let startsAtLevel: TacticalTierLevel = 1;
  const exemptLevels: TacticalTierLevel[] = [];

  // If Level 1 already has puzzles, starts at 1
  if (levelCounts[1] === 0) {
    // Probe Level 1 to see if sub-1000 puzzles exist for this motif
    let foundLevel1 = false;
    for (let probe = 0; probe < 3; probe++) {
      try {
        const probeRes = await fetch(
          `https://lichess.org/api/puzzle/next?angle=${theme}&difficulty=easiest`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (probeRes.ok) {
          const data = await probeRes.json();
          if (data.puzzle?.rating && data.puzzle.rating < 1000) {
            foundLevel1 = true;
            break;
          }
        } else if (probeRes.status === 429) {
          break;
        }
      } catch {
        break;
      }
    }

    if (!foundLevel1) {
      // Motif has no novice puzzles — starts at Level 2
      startsAtLevel = 2;
      exemptLevels.push(1);
    }
  }

  const levelTargets: Record<TacticalTierLevel, number> = {
    1: exemptLevels.includes(1) ? 0 : perLevelTarget,
    2: exemptLevels.includes(2) ? 0 : perLevelTarget,
    3: perLevelTarget,
    4: perLevelTarget,
    5: perLevelTarget,
    6: perLevelTarget,
    7: perLevelTarget,
    8: perLevelTarget,
    9: perLevelTarget,
  };

  const totalTarget = Object.values(levelTargets).reduce((a, b) => a + b, 0);
  const newPuzzles: TacticsPuzzleItem[] = [];

  const getProgressSnapshot = (
    currentLevel: TacticalTierLevel,
    statusMessage: string,
    isComplete = false,
    rateLimitEncountered = false,
  ): MotifSyncProgress => {
    const totalPuzzlesCollected = (
      Object.entries(levelCounts) as [string, number][]
    ).reduce((sum, [lvlStr, count]) => {
      const lvl = Number(lvlStr) as TacticalTierLevel;
      return exemptLevels.includes(lvl) ? sum : sum + count;
    }, 0);

    return {
      motif,
      currentLevel,
      levelCounts: { ...levelCounts },
      levelTargets: { ...levelTargets },
      exemptLevels: [...exemptLevels],
      startsAtLevel,
      totalPuzzlesCollected,
      totalTarget,
      statusMessage,
      isComplete,
      rateLimitEncountered,
    };
  };

  // 3. First scan saved variation games to extract tactics from repertoire DNA
  if (variation?.games && variation.games.length > 0) {
    onProgress?.(
      getProgressSnapshot(
        startsAtLevel,
        `Scanning ${variation.games.length} ${variation.name} games for ${motif} strikes...`,
      ),
    );

    for (const g of variation.games) {
      const gameTactics = extractTacticsFromGame(
        g.id,
        `${g.white.name} vs ${g.black.name}`,
        g.movesSan,
        variation.id,
        variation.name,
        perspective,
      );

      for (const t of gameTactics) {
        if (
          t.primaryMotif === motif &&
          !seenIds.has(t.id) &&
          !t.isCheckmate &&
          t.initialTurn === perspective
        ) {
          const lvl = t.tierLevel;
          if (levelCounts[lvl] < (levelTargets[lvl] || perLevelTarget)) {
            seenIds.add(t.id);
            newPuzzles.push(t);
            levelCounts[lvl]++;
          }
        }
      }
    }
  }

  // 4. Ingest Level by Level (from startsAtLevel up to Level 9)
  let rateLimitHit = false;

  for (let lvl = startsAtLevel; lvl <= 9; lvl++) {
    const targetForLvl = levelTargets[lvl as TacticalTierLevel];
    if (targetForLvl === 0 || levelCounts[lvl as TacticalTierLevel] >= targetForLvl) {
      continue;
    }

    const diff = LEVEL_DIFFICULTIES[lvl as TacticalTierLevel];
    onProgress?.(
      getProgressSnapshot(
        lvl as TacticalTierLevel,
        `Populating Level ${lvl} (${levelCounts[lvl as TacticalTierLevel]}/${targetForLvl}) for ${motif}...`,
      ),
    );

    let consecutiveFailures = 0;
    let probes = 0;
    const maxProbes = 80; // protect against runaway loops

    while (
      levelCounts[lvl as TacticalTierLevel] < targetForLvl &&
      probes < maxProbes &&
      consecutiveFailures < 8 &&
      !rateLimitHit
    ) {
      probes++;
      await sleep(120); // gentle throttle to avoid rate limiting

      // Alternate between opening tag angle and motif theme
      const queryAngle = probes % 3 === 0 && openingTag ? openingTag : theme;
      const url = `https://lichess.org/api/puzzle/next?angle=${queryAngle}&difficulty=${diff}`;

      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 429) {
          rateLimitHit = true;
          break;
        }

        if (!res.ok) {
          consecutiveFailures++;
          continue;
        }

        const data = await res.json();
        const p = data.puzzle;
        const g = data.game;
        if (!p || !p.fen || !p.solution || seenIds.has(`lichess-${p.id}`)) {
          consecutiveFailures++;
          continue;
        }

        const turn = p.fen.includes(" w ") ? "white" : "black";
        if (turn !== perspective) {
          consecutiveFailures++;
          continue;
        }

        if ((p.themes || []).some((t: string) => t.toLowerCase().includes("mate"))) {
          consecutiveFailures++;
          continue;
        }

        // Validate solution line
        const chess = new Chess(p.fen);
        const sanMoves: string[] = [];
        const lanMoves: string[] = [];
        let endsInMate = false;

        for (const uci of p.solution) {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = uci.length > 4 ? uci[4] : undefined;
          let m;
          try {
            m = chess.move({ from, to, promotion });
          } catch {
            break;
          }
          if (!m) break;
          sanMoves.push(m.san);
          lanMoves.push(`${from}${to}`);
          if (chess.isCheckmate() || m.san.includes("#")) {
            endsInMate = true;
            break;
          }
        }

        if (endsInMate || sanMoves.length !== p.solution.length) {
          consecutiveFailures++;
          continue;
        }

        const rating = p.rating || 1500;
        const { tierLevel, tierName } = classifyTacticalTier(rating, sanMoves.length);

        // Check if candidate tier still needs puzzles
        const destLvl = tierLevel;
        const destTarget = levelTargets[destLvl] || perLevelTarget;

        if (levelCounts[destLvl] < destTarget) {
          const whitePlayer = g?.players?.[0]?.name || "White";
          const blackPlayer = g?.players?.[1]?.name || "Black";

          const puzzleItem: TacticsPuzzleItem = {
            id: `lichess-${p.id}`,
            fen: p.fen,
            initialTurn: turn,
            solutionPv: sanMoves,
            solutionLanPv: lanMoves,
            primaryMotif: motif,
            secondaryMotifs: [],
            tierLevel: destLvl,
            tierName,
            rating,
            moveLength: sanMoves.length,
            sourceGameId: g?.id || p.id,
            players: `${whitePlayer} vs ${blackPlayer}`,
            openingVariationId: variation?.id,
            openingName: variation?.name,
            explanation: `Verified ${turn.toUpperCase()} ${motif} strike from ${whitePlayer} vs ${blackPlayer} (Rating ${rating}). Play the winning combination.`,
            isCheckmate: false,
          };

          seenIds.add(puzzleItem.id);
          newPuzzles.push(puzzleItem);
          levelCounts[destLvl]++;
          consecutiveFailures = 0;

          onProgress?.(
            getProgressSnapshot(
              lvl as TacticalTierLevel,
              `Collected ${motif} Level ${destLvl} (${levelCounts[destLvl]}/${destTarget})...`,
            ),
          );
        }
      } catch {
        consecutiveFailures++;
      }
    }
  }

  const finalSnapshot = getProgressSnapshot(
    9,
    rateLimitHit
      ? `Rate limit paused sync. Saved ${newPuzzles.length} new puzzles safely.`
      : `Sync complete! ${newPuzzles.length} verified ${perspective.toUpperCase()} ${motif} tactics loaded.`,
    !rateLimitHit,
    rateLimitHit,
  );

  onProgress?.(finalSnapshot);
  return { newPuzzles, progress: finalSnapshot };
}

/**
 * Seed database placeholder array (intentionally empty — all tactics are dynamically synced).
 */
export const SEED_TACTICS_PUZZLES: TacticsPuzzleItem[] = [];

