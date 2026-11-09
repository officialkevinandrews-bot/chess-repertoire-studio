/**
 * Opening Explorer Service
 * Queries Lichess Masters & Online Opening Explorer databases with real-time Stockfish cross-referencing,
 * customizable rating/speed filters, and automatic "Hidden Gem" candidate detection.
 */

import type { EngineLine } from "@/engine/stockfishTypes";
import { getStoredLichessToken } from "./repertoireStorage";

export type DatabaseMode = "all" | "masters" | "lichess";

export const ALL_RATING_TIERS = [
  "400",
  "1000",
  "1200",
  "1400",
  "1600",
  "1800",
  "2000",
  "2200",
  "2500",
] as const;

export type RatingTier = (typeof ALL_RATING_TIERS)[number];

export const ALL_SPEEDS = ["blitz", "rapid", "classical"] as const;
export type GameSpeed = (typeof ALL_SPEEDS)[number];

export interface RawExplorerMove {
  uci: string;
  san: string;
  averageRating?: number;
  white: number;
  draws: number;
  black: number;
  game?: unknown;
}

export interface RawExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: RawExplorerMove[];
  topGames?: unknown[];
  opening?: {
    eco: string;
    name: string;
  } | null;
}

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  total: number;
  playedPercentage: number;
  whiteWinPct: number;
  drawPct: number;
  blackWinPct: number;
  averageRating?: number;
  // Stockfish integration
  stockfishEval?: number;
  stockfishRank?: number;
  isStockfishBest?: boolean;
  isStockfishCandidate?: boolean;
  // Hidden Gem Detection
  isHiddenGem?: boolean;
  hiddenGemReason?: string;
}

export interface ExplorerPositionResult {
  fen: string;
  mode: DatabaseMode;
  totalGames: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  moves: ExplorerMove[];
  opening?: {
    eco: string;
    name: string;
  } | null;
  fetchedAt: number;
}

export interface ExplorerQueryOptions {
  fen: string;
  mode: DatabaseMode;
  ratings?: RatingTier[];
  speeds?: GameSpeed[];
  engineLines?: EngineLine[];
  signal?: AbortSignal;
}

// In-memory cache for ultra-fast instant lookups across moves
const cache = new Map<string, ExplorerPositionResult>();

function buildCacheKey(fen: string, mode: DatabaseMode, ratings?: RatingTier[], speeds?: GameSpeed[]): string {
  const normFen = fen.trim();
  const sortedRatings = (ratings || ALL_RATING_TIERS).slice().sort().join(",");
  const sortedSpeeds = (speeds || ALL_SPEEDS).slice().sort().join(",");
  return `${normFen}|${mode}|${sortedRatings}|${sortedSpeeds}`;
}

/**
 * Clean FEN string for Lichess Explorer (ensures proper spacing and URL encoding)
 */
export function normalizeFenForExplorer(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} 0 1`;
  }
  return fen.trim();
}

/**
 * Fetch raw data from either Masters or Online Lichess Explorer
 */
async function fetchEndpoint(
  endpoint: "masters" | "lichess",
  fen: string,
  ratings?: RatingTier[],
  speeds?: GameSpeed[],
  signal?: AbortSignal,
): Promise<RawExplorerResponse | null> {
  const normFen = normalizeFenForExplorer(fen);
  let url = `https://explorer.lichess.ovh/${endpoint}?fen=${encodeURIComponent(normFen)}&topGames=15`;

  if (endpoint === "lichess") {
    const r = (ratings && ratings.length > 0 ? ratings : ALL_RATING_TIERS).join(",");
    const s = (speeds && speeds.length > 0 ? speeds : ALL_SPEEDS).join(",");
    url += `&ratings=${r}&speeds=${s}`;
  }

  try {
    const token = getStoredLichessToken();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal,
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("Lichess Explorer Rate Limited (429)");
      }
      return null;
    }

    const data: RawExplorerResponse = await res.json();
    return data;
  } catch (err) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`Error querying ${endpoint} explorer:`, err);
    return null;
  }
}

/**
 * Detects whether a move qualifies as a "Hidden Gem":
 * - Good Stockfish evaluation (advantageous or sound)
 * - Low database play frequency (<= 15%)
 * - Healthy practical score percentage (>= 45%)
 */
export function evaluateHiddenGem(
  move: {
    san: string;
    playedPercentage: number;
    whiteWinPct: number;
    drawPct: number;
    blackWinPct: number;
    stockfishEval?: number;
    stockfishRank?: number;
  },
  isWhiteTurn: boolean,
): { isHiddenGem: boolean; reason?: string } {
  if (move.stockfishEval === undefined) {
    return { isHiddenGem: false };
  }

  const evalForMover = isWhiteTurn ? move.stockfishEval : -move.stockfishEval;
  const practicalScore = isWhiteTurn
    ? move.whiteWinPct + move.drawPct * 0.5
    : move.blackWinPct + move.drawPct * 0.5;

  // Criteria:
  // 1. Played <= 15% of the time (not the standard heavily booked response)
  // 2. Favorable Stockfish evaluation: >= +0.30 advantage, OR in top 2 engine choices with sound eval >= -0.15
  // 3. Decent practical score (>= 45%)
  const isSurprise = move.playedPercentage <= 15.0;
  const isEngineApproved = evalForMover >= 0.30 || ((move.stockfishRank ?? 99) <= 2 && evalForMover >= -0.15);
  const isPlayablePractically = practicalScore >= 45.0;

  if (isSurprise && isEngineApproved && isPlayablePractically) {
    const sign = move.stockfishEval > 0 ? "+" : "";
    return {
      isHiddenGem: true,
      reason: `Stockfish ${sign}${move.stockfishEval.toFixed(2)} · Only ${move.playedPercentage.toFixed(1)}% played · ${practicalScore.toFixed(0)}% score rate`,
    };
  }

  return { isHiddenGem: false };
}

/**
 * Match Stockfish candidate lines with database moves
 */
export function enrichMovesWithStockfish(
  moves: ExplorerMove[],
  fen: string,
  engineLines?: EngineLine[],
): ExplorerMove[] {
  const isWhiteTurn = !fen.includes(" b ");

  return moves.map((m) => {
    let evalVal: number | undefined;
    let rank: number | undefined;
    let isBest = false;
    let isCandidate = false;

    if (engineLines && engineLines.length > 0) {
      const idx = engineLines.findIndex((line) => {
        const lineLan = line.pv?.[0];
        const lineSan = line.bestMoveSan || line.sanPv?.[0];
        return (lineLan && lineLan.toLowerCase() === m.uci.toLowerCase()) || (lineSan && lineSan === m.san);
      });

      if (idx !== -1) {
        const foundLine = engineLines[idx];
        evalVal = foundLine.score;
        rank = idx + 1;
        isBest = idx === 0;
        isCandidate = true;
      }
    }

    const { isHiddenGem, reason } = evaluateHiddenGem(
      {
        san: m.san,
        playedPercentage: m.playedPercentage,
        whiteWinPct: m.whiteWinPct,
        drawPct: m.drawPct,
        blackWinPct: m.blackWinPct,
        stockfishEval: evalVal,
        stockfishRank: rank,
      },
      isWhiteTurn,
    );

    return {
      ...m,
      stockfishEval: evalVal,
      stockfishRank: rank,
      isStockfishBest: isBest,
      isStockfishCandidate: isCandidate,
      isHiddenGem,
      hiddenGemReason: reason,
    };
  });
}

/**
 * Fetch Opening Explorer statistics with database combining, filters, and caching
 */
export async function fetchOpeningExplorer(options: ExplorerQueryOptions): Promise<ExplorerPositionResult> {
  const { fen, mode, ratings = ALL_RATING_TIERS as unknown as RatingTier[], speeds = ALL_SPEEDS as unknown as GameSpeed[], engineLines, signal } = options;
  const cacheKey = buildCacheKey(fen, mode, ratings, speeds);

  // Return from in-memory cache if available, but re-enrich with current engineLines
  const cached = cache.get(cacheKey);
  if (cached) {
    const reEnrichedMoves = enrichMovesWithStockfish(cached.moves, fen, engineLines);
    return {
      ...cached,
      moves: reEnrichedMoves,
    };
  }

  let mastersData: RawExplorerResponse | null = null;
  let lichessData: RawExplorerResponse | null = null;

  if (mode === "masters") {
    mastersData = await fetchEndpoint("masters", fen, undefined, undefined, signal);
  } else if (mode === "lichess") {
    lichessData = await fetchEndpoint("lichess", fen, ratings, speeds, signal);
  } else {
    // "all" mode: Query both concurrently
    const [mRes, lRes] = await Promise.all([
      fetchEndpoint("masters", fen, undefined, undefined, signal),
      fetchEndpoint("lichess", fen, ratings, speeds, signal),
    ]);
    mastersData = mRes;
    lichessData = lRes;
  }

  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  // Aggregate results
  const moveMap = new Map<
    string,
    {
      uci: string;
      san: string;
      white: number;
      draws: number;
      black: number;
      ratingWeightedTotal?: number;
      ratingCount?: number;
    }
  >();

  let totalWhiteWins = 0;
  let totalDraws = 0;
  let totalBlackWins = 0;
  let openingInfo: { eco: string; name: string } | null = null;

  const processResponse = (data: RawExplorerResponse | null) => {
    if (!data) return;
    totalWhiteWins += data.white || 0;
    totalDraws += data.draws || 0;
    totalBlackWins += data.black || 0;

    if (!openingInfo && data.opening) {
      openingInfo = data.opening;
    }

    for (const rawMove of data.moves || []) {
      const existing = moveMap.get(rawMove.san) || {
        uci: rawMove.uci,
        san: rawMove.san,
        white: 0,
        draws: 0,
        black: 0,
        ratingWeightedTotal: 0,
        ratingCount: 0,
      };

      existing.white += rawMove.white || 0;
      existing.draws += rawMove.draws || 0;
      existing.black += rawMove.black || 0;

      if (rawMove.averageRating) {
        const count = rawMove.white + rawMove.draws + rawMove.black;
        existing.ratingWeightedTotal = (existing.ratingWeightedTotal || 0) + rawMove.averageRating * count;
        existing.ratingCount = (existing.ratingCount || 0) + count;
      }

      moveMap.set(rawMove.san, existing);
    }
  };

  processResponse(mastersData);
  processResponse(lichessData);

  const totalGamesInPosition = totalWhiteWins + totalDraws + totalBlackWins;

  // Calculate move totals and percentages
  let sumAllMoves = 0;
  const rawMerged = Array.from(moveMap.values()).map((item) => {
    const total = item.white + item.draws + item.black;
    sumAllMoves += total;
    return { ...item, total };
  });

  const parsedMoves: ExplorerMove[] = rawMerged.map((item) => {
    const total = item.total;
    const playedPercentage = sumAllMoves > 0 ? (total / sumAllMoves) * 100 : 0;
    const whiteWinPct = total > 0 ? (item.white / total) * 100 : 0;
    const drawPct = total > 0 ? (item.draws / total) * 100 : 0;
    const blackWinPct = total > 0 ? (item.black / total) * 100 : 0;
    const avgRating = item.ratingCount && item.ratingCount > 0
      ? Math.round((item.ratingWeightedTotal || 0) / item.ratingCount)
      : undefined;

    return {
      uci: item.uci,
      san: item.san,
      white: item.white,
      draws: item.draws,
      black: item.black,
      total,
      playedPercentage,
      whiteWinPct,
      drawPct,
      blackWinPct,
      averageRating: avgRating,
    };
  });

  // Sort by play count descending initially
  parsedMoves.sort((a, b) => b.total - a.total);

  // Cross-reference with Stockfish and evaluate Hidden Gems
  const enrichedMoves = enrichMovesWithStockfish(parsedMoves, fen, engineLines);

  const result: ExplorerPositionResult = {
    fen,
    mode,
    totalGames: totalGamesInPosition,
    whiteWins: totalWhiteWins,
    draws: totalDraws,
    blackWins: totalBlackWins,
    moves: enrichedMoves,
    opening: openingInfo,
    fetchedAt: Date.now(),
  };

  cache.set(cacheKey, result);
  return result;
}

/**
 * Clear explorer cache
 */
export function clearExplorerCache(): void {
  cache.clear();
}
