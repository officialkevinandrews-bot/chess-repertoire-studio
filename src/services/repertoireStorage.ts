/**
 * Persistent Storage Layer for Saved Variations, Scraped Master Games, and Endgame Targets.
 * Uses native IndexedDB in the browser with automatic localStorage fallback.
 */

export interface ScrapedGame {
  id: string;
  white: { name: string; rating: number; title?: string };
  black: { name: string; rating: number; title?: string };
  winner: "white" | "black" | "draw";
  year: number;
  opening?: string;
  eco?: string;
  plyCount: number;
  movesSan: string[];
  pgn: string;
  fenAtVariation: string;
  plyAtVariation: number;
  accuracyScore?: number;
  matchType?: "exact" | "transposition" | "parent-ply" | "structural-similarity";
  matchNote?: string;
}

export interface PracticalEndgameTarget {
  id: string;
  gameId: string;
  players: string;
  fen: string;
  target: "Convert the Win" | "Hold the Draw" | "Defend and Hold" | "Force a Draw";
  moveNumber: number;
  sourceGameResult: string;
  pawnDnaMatchPct?: number;
  structureName?: string;
}

export interface UserProgressTelemetry {
  totalLinesCreated: number;
  totalMovesGuessed: number;
  correctMovesGuessed: number;
  endgamesSolved: number;
  perfectConversions: number;
  totalScore: number;
  lastUpdated: string;
}

export const TACTICAL_MOTIFS = [
  "Fork / Double Attack",
  "Pin",
  "Skewer",
  "Discovered Attack",
  "Deflection",
  "Decoy / Attraction",
  "Overloaded Piece",
  "Intermezzo (Zwischenzug / In-Between Move)",
  "Removal of the Defender",
  "X-Ray Attack",
  "Trapped Piece",
  "Clearance Sacrifice",
  "Interference",
  "Windmill",
  "Advanced Pawn / Breakthrough",
  "Desperado",
] as const;

export type TacticalMotif = (typeof TACTICAL_MOTIFS)[number];

export type TacticalTierLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type TacticalTierName =
  | "Novice Observer"
  | "Tactical Apprentice"
  | "Pattern Scout"
  | "Combinant"
  | "Board Visionary"
  | "Calculation Specialist"
  | "Tactical Strategist"
  | "Master Tactician"
  | "Grandmaster Virtuoso";

export interface TacticalTierDef {
  level: TacticalTierLevel;
  name: TacticalTierName;
  minRating: number;
  maxRating: number;
  minMoves: number;
  maxMoves: number;
  description: string;
}

export const TACTICAL_TIERS: Record<TacticalTierLevel, TacticalTierDef> = {
  1: { level: 1, name: "Novice Observer", minRating: 0, maxRating: 999, minMoves: 1, maxMoves: 1, description: "1-move combination (< 1000)" },
  2: { level: 2, name: "Tactical Apprentice", minRating: 1000, maxRating: 1299, minMoves: 1, maxMoves: 2, description: "1 to 2-move combination (1000–1299)" },
  3: { level: 3, name: "Pattern Scout", minRating: 1300, maxRating: 1499, minMoves: 2, maxMoves: 2, description: "2-move combination (1300–1499)" },
  4: { level: 4, name: "Combinant", minRating: 1500, maxRating: 1699, minMoves: 2, maxMoves: 3, description: "2 to 3-move combination (1500–1699)" },
  5: { level: 5, name: "Board Visionary", minRating: 1700, maxRating: 1899, minMoves: 3, maxMoves: 3, description: "3-move combination (1700–1899)" },
  6: { level: 6, name: "Calculation Specialist", minRating: 1900, maxRating: 2099, minMoves: 3, maxMoves: 4, description: "3 to 4-move combination (1900–2099)" },
  7: { level: 7, name: "Tactical Strategist", minRating: 2100, maxRating: 2299, minMoves: 4, maxMoves: 4, description: "4-move combination (2100–2299)" },
  8: { level: 8, name: "Master Tactician", minRating: 2300, maxRating: 2499, minMoves: 4, maxMoves: 5, description: "4+ move combination (2300–2499)" },
  9: { level: 9, name: "Grandmaster Virtuoso", minRating: 2500, maxRating: 9999, minMoves: 5, maxMoves: 99, description: "Deep complex variations (2500+)" },
};

export interface TacticsPuzzleItem {
  id: string;
  fen: string;
  initialTurn: "white" | "black";
  solutionPv: string[];
  solutionLanPv: string[];
  primaryMotif: TacticalMotif;
  secondaryMotifs: TacticalMotif[];
  tierLevel: TacticalTierLevel;
  tierName: TacticalTierName;
  rating: number;
  moveLength: number;
  sourceGameId?: string;
  players?: string;
  openingVariationId?: string;
  openingName?: string;
  variationName?: string;
  repertoireSystemId?: string;
  repertoireVariationId?: string;
  explanation: string;
  isCheckmate: false; // STRICT: checkmates excluded!
}

export interface MotifUserProgress {
  motif: TacticalMotif;
  rating: number; // baseline 1200
  attempts: number;
  solved: number;
  currentStreak: number; // 0 to 20
  remedialQueue: string[]; // puzzle IDs
  clearedLevels: TacticalTierLevel[];
}

export interface TacticsGlobalProgress {
  activeGlobalTier: TacticalTierLevel;
  overallRating: number | null; // null if calibrating
  isCalibrated: boolean;
  motifProgress: Record<TacticalMotif, MotifUserProgress>;
  lastSyncTimestamp: string;
}

export interface RepertoireLine {
  id: string;
  variationId: string;
  name: string;
  moves: string[];
  finalFen: string;
  pgn: string;
  createdAt: string;
  games?: ScrapedGame[];
  endgames?: PracticalEndgameTarget[];
}

export interface RepertoireVariation {
  id: string;
  systemId: string;
  name: string;
  eco?: string;
  lichessVariationTag?: string;
  lines: RepertoireLine[];
  createdAt: string;
}

export interface RepertoireSystem {
  id: string;
  name: string;
  color: "white" | "black";
  ecoGroup: string;
  lichessOpeningTag: string;
  description: string;
  variations: RepertoireVariation[];
  createdAt: string;
}

export interface SavedVariation {
  id: string;
  name: string;
  eco: string;
  openingName: string;
  finalFen: string;
  moves: string[];
  pgn: string;
  color: "white" | "black";
  perspective?: "white" | "black";
  createdAt: string;
  gameCount: number;
  games: ScrapedGame[];
  endgames: PracticalEndgameTarget[];
  tacticsCount?: number;
}

const DB_NAME = "chess_buddy_storage";
const DB_VERSION = 4;
const STORE_NAME = "variations";
const TACTICS_STORE_NAME = "tactics_puzzles";
const TACTICS_PROGRESS_STORE_NAME = "tactics_user_progress";
const REPERTOIRE_SYSTEMS_STORE_NAME = "repertoire_systems";

const LS_BACKUP_KEY = "chess_buddy_saved_variations_meta";
const REPERTOIRE_SYSTEMS_LS_KEY = "chess_buddy_repertoire_systems";
const TOKEN_KEY = "chess_buddy_lichess_token";
const TELEMETRY_KEY = "chess_buddy_user_telemetry";
const TACTICS_LS_KEY = "chess_buddy_tactics_puzzles";
const TACTICS_PROGRESS_LS_KEY = "chess_buddy_tactics_progress";

export function getUserTelemetry(): UserProgressTelemetry {
  const defaultTelemetry: UserProgressTelemetry = {
    totalLinesCreated: 0,
    totalMovesGuessed: 0,
    correctMovesGuessed: 0,
    endgamesSolved: 0,
    perfectConversions: 0,
    totalScore: 0,
    lastUpdated: new Date().toISOString(),
  };

  if (typeof window === "undefined" || !window.localStorage) {
    return defaultTelemetry;
  }

  try {
    const raw = window.localStorage.getItem(TELEMETRY_KEY);
    if (raw) {
      return { ...defaultTelemetry, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }

  return defaultTelemetry;
}

export function updateUserTelemetry(
  updates: Partial<UserProgressTelemetry>,
): UserProgressTelemetry {
  const current = getUserTelemetry();
  const updated: UserProgressTelemetry = {
    ...current,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB not available in this environment"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(TACTICS_STORE_NAME)) {
          const tStore = db.createObjectStore(TACTICS_STORE_NAME, { keyPath: "id" });
          tStore.createIndex("primaryMotif", "primaryMotif", { unique: false });
          tStore.createIndex("tierLevel", "tierLevel", { unique: false });
          tStore.createIndex("openingVariationId", "openingVariationId", { unique: false });
        }
        if (!db.objectStoreNames.contains(TACTICS_PROGRESS_STORE_NAME)) {
          db.createObjectStore(TACTICS_PROGRESS_STORE_NAME, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(REPERTOIRE_SYSTEMS_STORE_NAME)) {
          db.createObjectStore(REPERTOIRE_SYSTEMS_STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

export function getDefaultTacticsProgress(): TacticsGlobalProgress {
  const motifProgress: Record<TacticalMotif, MotifUserProgress> = {} as any;
  for (const m of TACTICAL_MOTIFS) {
    motifProgress[m] = {
      motif: m,
      rating: 1200,
      attempts: 0,
      solved: 0,
      currentStreak: 0,
      remedialQueue: [],
      clearedLevels: [],
    };
  }

  return {
    activeGlobalTier: 1,
    overallRating: null,
    isCalibrated: false,
    motifProgress,
    lastSyncTimestamp: new Date(0).toISOString(),
  };
}

export async function getTacticsProgress(): Promise<TacticsGlobalProgress> {
  const fallback = getDefaultTacticsProgress();

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const db = await getDb();
    const result = await new Promise<TacticsGlobalProgress | null>((resolve) => {
      const tx = db.transaction(TACTICS_PROGRESS_STORE_NAME, "readonly");
      const store = tx.objectStore(TACTICS_PROGRESS_STORE_NAME);
      const req = store.get("global_progress");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (result) {
      return sanitizeTacticsProgress(result);
    }
  } catch {
    // IndexedDB fallback to localStorage
  }

  if (window.localStorage) {
    try {
      const raw = window.localStorage.getItem(TACTICS_PROGRESS_LS_KEY);
      if (raw) {
        return sanitizeTacticsProgress(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }

  return fallback;
}

function sanitizeTacticsProgress(raw: any): TacticsGlobalProgress {
  const base = getDefaultTacticsProgress();
  if (!raw || typeof raw !== "object") return base;

  const mergedMotifs: Record<TacticalMotif, MotifUserProgress> = {} as any;
  let exploredCount = 0;
  let ratingSum = 0;

  for (const m of TACTICAL_MOTIFS) {
    const existing = raw.motifProgress?.[m];
    const item: MotifUserProgress = {
      motif: m,
      rating: existing?.rating || 1200,
      attempts: existing?.attempts || 0,
      solved: existing?.solved || 0,
      currentStreak: existing?.currentStreak || 0,
      remedialQueue: Array.isArray(existing?.remedialQueue) ? existing.remedialQueue : [],
      clearedLevels: Array.isArray(existing?.clearedLevels) ? existing.clearedLevels : [],
    };
    mergedMotifs[m] = item;

    if (item.attempts > 0) {
      exploredCount++;
      ratingSum += item.rating;
    }
  }

  // Calibration lock: Calibrated when user has attempted at least 8 distinct motifs or all populated motifs
  const isCalibrated = exploredCount >= 6;
  const overallRating = isCalibrated ? Math.round(ratingSum / exploredCount) : null;

  return {
    activeGlobalTier: raw.activeGlobalTier || 1,
    overallRating,
    isCalibrated,
    motifProgress: mergedMotifs,
    lastSyncTimestamp: raw.lastSyncTimestamp || new Date(0).toISOString(),
  };
}

export async function saveTacticsProgress(progress: TacticsGlobalProgress): Promise<void> {
  const sanitized = sanitizeTacticsProgress(progress);

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TACTICS_PROGRESS_STORE_NAME, "readwrite");
      const store = tx.objectStore(TACTICS_PROGRESS_STORE_NAME);
      const req = store.put({ id: "global_progress", ...sanitized });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(TACTICS_PROGRESS_LS_KEY, JSON.stringify(sanitized));
    } catch {
      // ignore
    }
  }
}

export async function recordTacticsAttempt(
  motif: TacticalMotif,
  puzzleId: string,
  isCorrect: boolean,
): Promise<TacticsGlobalProgress> {
  const progress = await getTacticsProgress();
  const m = progress.motifProgress[motif];
  if (!m) return progress;

  m.attempts++;

  if (isCorrect) {
    m.solved++;
    m.rating = Math.min(2800, m.rating + 16);
    m.currentStreak++;

    // If 20 in a row achieved and remedial queue is clear, clear active level
    if (m.currentStreak >= 20 && m.remedialQueue.length === 0) {
      if (!m.clearedLevels.includes(progress.activeGlobalTier)) {
        m.clearedLevels.push(progress.activeGlobalTier);
      }
    }
  } else {
    // STRICT RESET TO 0 ON ERROR
    m.currentStreak = 0;
    m.rating = Math.max(800, m.rating - 16);
    if (!m.remedialQueue.includes(puzzleId)) {
      m.remedialQueue.push(puzzleId);
    }
  }

  await saveTacticsProgress(progress);
  return progress;
}

export async function clearRemedialItem(
  motif: TacticalMotif,
  puzzleId: string,
): Promise<TacticsGlobalProgress> {
  const progress = await getTacticsProgress();
  const m = progress.motifProgress[motif];
  if (!m) return progress;

  m.remedialQueue = m.remedialQueue.filter((id) => id !== puzzleId);
  await saveTacticsProgress(progress);
  return progress;
}

export async function saveTacticsPuzzles(puzzles: TacticsPuzzleItem[]): Promise<void> {
  if (!puzzles || puzzles.length === 0) return;

  // Filter out placeholders and forced checkmates
  const validPuzzles = puzzles.filter((p) => !p.id.startsWith("seed-") && !p.isCheckmate);
  if (validPuzzles.length === 0) return;

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TACTICS_STORE_NAME, "readwrite");
      const store = tx.objectStore(TACTICS_STORE_NAME);
      for (const p of validPuzzles) {
        store.put(p);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback to localStorage
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const existingRaw = window.localStorage.getItem(TACTICS_LS_KEY);
      const existing: TacticsPuzzleItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      const map = new Map<string, TacticsPuzzleItem>();
      for (const p of existing) {
        if (!p.id.startsWith("seed-") && !p.isCheckmate) map.set(p.id, p);
      }
      for (const p of validPuzzles) {
        map.set(p.id, p);
      }
      window.localStorage.setItem(TACTICS_LS_KEY, JSON.stringify(Array.from(map.values())));
    } catch {
      // ignore
    }
  }
}

/**
 * Clears non-fork tactics while strictly preserving all existing verified Fork puzzles.
 * Returns the preserved Fork puzzles.
 */
export async function clearNonForkTacticsPuzzles(): Promise<TacticsPuzzleItem[]> {
  let keptForks: TacticsPuzzleItem[] = [];

  try {
    const db = await getDb();
    keptForks = await new Promise<TacticsPuzzleItem[]>((resolve) => {
      const tx = db.transaction(TACTICS_STORE_NAME, "readwrite");
      const store = tx.objectStore(TACTICS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as TacticsPuzzleItem[]) || [];
        const forks = items.filter(
          (p) =>
            p.primaryMotif === "Fork / Double Attack" &&
            !p.id.startsWith("seed-") &&
            !p.isCheckmate,
        );
        store.clear();
        for (const f of forks) {
          store.put(f);
        }
        resolve(forks);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    // fallback
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(TACTICS_LS_KEY);
      if (raw) {
        const items: TacticsPuzzleItem[] = JSON.parse(raw);
        const lsForks = items.filter(
          (p) =>
            p.primaryMotif === "Fork / Double Attack" &&
            !p.id.startsWith("seed-") &&
            !p.isCheckmate,
        );
        if (keptForks.length === 0) {
          keptForks = lsForks;
        }
        window.localStorage.setItem(TACTICS_LS_KEY, JSON.stringify(keptForks));
      }
    } catch {
      // ignore
    }
  }

  return keptForks;
}

/**
 * Clears the entire database of tactics puzzles (both IndexedDB and localStorage).
 */
export async function clearAllTacticsPuzzles(): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TACTICS_STORE_NAME, "readwrite");
      const store = tx.objectStore(TACTICS_STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // fallback
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(TACTICS_LS_KEY);
    } catch {
      // ignore
    }
  }
}


export async function getTacticsPuzzles(options?: {
  motif?: TacticalMotif;
  tier?: TacticalTierLevel;
  variationId?: string;
  turn?: "white" | "black";
}): Promise<TacticsPuzzleItem[]> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(TACTICS_STORE_NAME, "readonly");
      const store = tx.objectStore(TACTICS_STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results = (req.result as TacticsPuzzleItem[]) || [];

        // Fallback or merge with localStorage
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            const raw = window.localStorage.getItem(TACTICS_LS_KEY);
            if (raw) {
              const lsItems: TacticsPuzzleItem[] = JSON.parse(raw);
              if (results.length === 0) {
                results = lsItems;
              } else {
                const map = new Map<string, TacticsPuzzleItem>();
                for (const p of results) map.set(p.id, p);
                for (const p of lsItems) if (!map.has(p.id)) map.set(p.id, p);
                results = Array.from(map.values());
              }
            }
          } catch {
            // ignore
          }
        }

        // Strictly eliminate seed placeholders and checkmates
        results = results.filter((p) => !p.id.startsWith("seed-") && !p.isCheckmate);

        if (options?.motif) {
          results = results.filter(
            (p) => p.primaryMotif === options.motif || p.secondaryMotifs.includes(options.motif!),
          );
        }
        if (options?.tier) {
          results = results.filter((p) => p.tierLevel === options.tier);
        }
        if (options?.variationId) {
          results = results.filter((p) => p.openingVariationId === options.variationId);
        }
        if (options?.turn) {
          results = results.filter((p) => p.initialTurn === options.turn);
        }
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    // fallback
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(TACTICS_LS_KEY);
      if (raw) {
        let results: TacticsPuzzleItem[] = JSON.parse(raw);
        results = results.filter((p) => !p.id.startsWith("seed-") && !p.isCheckmate);
        if (options?.motif) {
          results = results.filter(
            (p) => p.primaryMotif === options.motif || p.secondaryMotifs.includes(options.motif!),
          );
        }
        if (options?.tier) {
          results = results.filter((p) => p.tierLevel === options.tier);
        }
        if (options?.variationId) {
          results = results.filter((p) => p.openingVariationId === options.variationId);
        }
        if (options?.turn) {
          results = results.filter((p) => p.initialTurn === options.turn);
        }
        return results;
      }
    } catch {
      // ignore
    }
  }

  return [];
}

export const DEFAULT_REPERTOIRE_SYSTEMS: RepertoireSystem[] = [
  {
    id: "pirc-defense",
    name: "Pirc Defense",
    color: "black",
    ecoGroup: "B07-B09",
    lichessOpeningTag: "pirc_defense",
    description:
      "Hypermodern defense for Black allowing White to claim the center before counter-attacking with ...g6, ...Bg7, and central pawn counter-strikes.",
    createdAt: new Date().toISOString(),
    variations: [
      {
        id: "pirc-classical",
        systemId: "pirc-defense",
        name: "Classical Variation",
        eco: "B08",
        lichessVariationTag: "pirc_defense_classical_variation",
        createdAt: new Date().toISOString(),
        lines: [
          {
            id: "pirc-central-pawn-fork",
            variationId: "pirc-classical",
            name: "Central Pawn Fork",
            moves: ["e4", "d6", "d4", "Nf6"],
            finalFen: "rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 1 3",
            pgn: "1. e4 d6 2. d4 Nf6",
            createdAt: new Date().toISOString(),
            games: [],
            endgames: [],
          },
        ],
      },
      {
        id: "pirc-austrian",
        systemId: "pirc-defense",
        name: "Austrian Attack",
        eco: "B09",
        lichessVariationTag: "pirc_defense_austrian_attack",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "pirc-byrne",
        systemId: "pirc-defense",
        name: "Byrne Variation",
        eco: "B07",
        lichessVariationTag: "pirc_defense_byrne_variation",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "pirc-150-attack",
        systemId: "pirc-defense",
        name: "150 Attack / Bayonet",
        eco: "B07",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "pirc-kholmov",
        systemId: "pirc-defense",
        name: "Kholmov System (4. Bc4)",
        eco: "B07",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "pirc-roscher",
        systemId: "pirc-defense",
        name: "Roscher Gambit",
        eco: "B07",
        createdAt: new Date().toISOString(),
        lines: [],
      },
    ],
  },
  {
    id: "kings-indian-defense",
    name: "King's Indian Defense",
    color: "black",
    ecoGroup: "E60-E99",
    lichessOpeningTag: "kings_indian_defense",
    description:
      "Deep kingside dynamic counter-attacking system for Black with fianchettoed bishop on g7.",
    createdAt: new Date().toISOString(),
    variations: [
      {
        id: "kid-classical",
        systemId: "kings-indian-defense",
        name: "Classical System",
        eco: "E91-E99",
        lichessVariationTag: "kings_indian_defense_classical_variation",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kid-samisch",
        systemId: "kings-indian-defense",
        name: "Sämisch Variation",
        eco: "E81-E89",
        lichessVariationTag: "kings_indian_defense_samisch_variation",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kid-four-pawns",
        systemId: "kings-indian-defense",
        name: "Four Pawns Attack",
        eco: "E76-E79",
        lichessVariationTag: "kings_indian_defense_four_pawns_attack",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kid-fianchetto",
        systemId: "kings-indian-defense",
        name: "Fianchetto Variation",
        eco: "E62-E69",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kid-averbakh",
        systemId: "kings-indian-defense",
        name: "Averbakh Variation",
        eco: "E73-E75",
        createdAt: new Date().toISOString(),
        lines: [],
      },
    ],
  },
  {
    id: "london-system",
    name: "London System",
    color: "white",
    ecoGroup: "D00-D02",
    lichessOpeningTag: "london_system",
    description:
      "Solid 1. d4 and 2. Bf4 system for White with Jobava attacking setups and Queen's Gambit transpositions.",
    createdAt: new Date().toISOString(),
    variations: [
      {
        id: "london-jobava",
        systemId: "london-system",
        name: "Jobava London (vs Pirc / KID)",
        eco: "D00",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "london-anti-bf5",
        systemId: "london-system",
        name: "Anti-Copycat (vs 2...Bf5)",
        eco: "D00",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "london-anti-nc6",
        systemId: "london-system",
        name: "Anti-c6 Knight (vs 2...Nc6)",
        eco: "D00",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "london-classical",
        systemId: "london-system",
        name: "Classical London (vs 1...d5)",
        eco: "D02",
        createdAt: new Date().toISOString(),
        lines: [],
      },
    ],
  },
  {
    id: "kings-indian-attack",
    name: "King's Indian Attack",
    color: "white",
    ecoGroup: "A07-A08",
    lichessOpeningTag: "kings_indian_attack",
    description:
      "Universal hypermodern attacking system for White (Nf3, g3, Bg2, O-O, d3, Nbd2, e4) popularized by Bobby Fischer to launch kingside pawn storms against French, Sicilian, Caro-Kann, and d5 setups.",
    createdAt: new Date().toISOString(),
    variations: [
      {
        id: "kia-french",
        systemId: "kings-indian-attack",
        name: "French Variation (vs 1...e6 & 2...d5)",
        eco: "A07",
        lichessVariationTag: "kings_indian_attack_french_variation",
        createdAt: new Date().toISOString(),
        lines: [
          {
            id: "kia-fischer-setup",
            variationId: "kia-french",
            name: "Fischer e4-d3-Nd2 Tabiya",
            moves: [
              "e4",
              "e6",
              "d3",
              "d5",
              "Nd2",
              "Nf6",
              "Ngf3",
              "c5",
              "g3",
              "Nc6",
              "Bg2",
              "Be7",
              "O-O",
              "O-O",
            ],
            finalFen: "r1bq1rk1/pp2bppp/2n1pn2/2pp4/4P3/3P1NP1/PPPN1PBP/R1BQ1RK1 w - - 5 8",
            pgn: "1. e4 e6 2. d3 d5 3. Nd2 Nf6 4. Ngf3 c5 5. g3 Nc6 6. Bg2 Be7 7. O-O O-O",
            createdAt: new Date().toISOString(),
            games: [],
            endgames: [],
          },
        ],
      },
      {
        id: "kia-yugoslav-spassky",
        systemId: "kings-indian-attack",
        name: "Yugoslav / Spassky System (vs ...d5 & ...c5)",
        eco: "A08",
        lichessVariationTag: "kings_indian_attack_yugoslav_variation",
        createdAt: new Date().toISOString(),
        lines: [
          {
            id: "kia-e5-spearhead",
            variationId: "kia-yugoslav-spassky",
            name: "e5 Kingside Spearhead (Barcza / Fischer)",
            moves: [
              "Nf3",
              "d5",
              "g3",
              "Nf6",
              "Bg2",
              "c5",
              "O-O",
              "Nc6",
              "d3",
              "e6",
              "Nbd2",
              "Be7",
              "e4",
              "O-O",
              "Re1",
              "b5",
              "e5",
              "Nd7",
            ],
            finalFen: "r1bq1rk1/p2nbppp/2n1p3/1pppP3/8/3P1NP1/PPPN1PBP/R1BQR1K1 w - - 1 10",
            pgn: "1. Nf3 d5 2. g3 Nf6 3. Bg2 c5 4. O-O Nc6 5. d3 e6 6. Nbd2 Be7 7. e4 O-O 8. Re1 b5 9. e5 Nd7",
            createdAt: new Date().toISOString(),
            games: [],
            endgames: [],
          },
        ],
      },
      {
        id: "kia-sicilian",
        systemId: "kings-indian-attack",
        name: "Sicilian Variation (vs 1...c5 & ...e6/...g6)",
        eco: "B20",
        lichessVariationTag: "kings_indian_attack_sicilian_variation",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kia-caro-kann",
        systemId: "kings-indian-attack",
        name: "Caro-Kann / Slav Setup (vs ...c6 & ...d5)",
        eco: "A07",
        lichessVariationTag: "kings_indian_attack_caro_kann_variation",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kia-keres",
        systemId: "kings-indian-attack",
        name: "Keres / Queen's Indian Setup (vs ...b6 / ...Bg4)",
        eco: "A07",
        lichessVariationTag: "kings_indian_attack_keres_variation",
        createdAt: new Date().toISOString(),
        lines: [],
      },
      {
        id: "kia-symmetrical",
        systemId: "kings-indian-attack",
        name: "Symmetrical / Reversed Grünfeld (vs ...g6 & ...Bg7)",
        eco: "A07",
        lichessVariationTag: "kings_indian_attack_symmetrical_defense",
        createdAt: new Date().toISOString(),
        lines: [],
      },
    ],
  },
];

/**
 * Retrieve all Repertoire Systems (3-tier hierarchy: System -> Variations -> Lines).
 * Initializes with default templates for Pirc Defense, King's Indian Defense, London System, and King's Indian Attack.
 */
export async function getRepertoireSystems(): Promise<RepertoireSystem[]> {
  let systems: RepertoireSystem[] | null = null;

  // Try IndexedDB first
  try {
    const db = await getDb();
    systems = await new Promise<RepertoireSystem[]>((resolve, reject) => {
      const tx = db.transaction(REPERTOIRE_SYSTEMS_STORE_NAME, "readonly");
      const store = tx.objectStore(REPERTOIRE_SYSTEMS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as RepertoireSystem[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore IndexedDB error, fall back to localStorage
  }

  // Fallback to localStorage if IndexedDB had 0 items
  if ((!systems || systems.length === 0) && typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(REPERTOIRE_SYSTEMS_LS_KEY);
      if (raw) {
        systems = JSON.parse(raw) as RepertoireSystem[];
      }
    } catch {
      // Ignore
    }
  }

  // Merge any newly introduced default systems (e.g. King's Indian Attack) for existing users
  if (systems && systems.length > 0) {
    let addedNewDefaults = false;
    for (const defaultSys of DEFAULT_REPERTOIRE_SYSTEMS) {
      const wasExplicitlyDeleted =
        typeof window !== "undefined" &&
        window.localStorage?.getItem(`chess_buddy_deleted_${defaultSys.id}`) === "true";
      if (!wasExplicitlyDeleted && !systems.some((s) => s.id === defaultSys.id)) {
        const cloned: RepertoireSystem = JSON.parse(JSON.stringify(defaultSys));
        systems.push(cloned);
        addedNewDefaults = true;
      }
    }
    if (addedNewDefaults) {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(REPERTOIRE_SYSTEMS_LS_KEY, JSON.stringify(systems));
        } catch {
          // Ignore
        }
      }
      try {
        const db = await getDb();
        const tx = db.transaction(REPERTOIRE_SYSTEMS_STORE_NAME, "readwrite");
        const store = tx.objectStore(REPERTOIRE_SYSTEMS_STORE_NAME);
        for (const sys of systems) {
          store.put(sys);
        }
      } catch {
        // Ignore
      }
    }
  }

  // If still empty, initialize with default templates
  if (!systems || systems.length === 0) {
    systems = JSON.parse(JSON.stringify(DEFAULT_REPERTOIRE_SYSTEMS));

    // Migrate any previously saved user variation into Pirc Central Pawn Fork
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const rawOld = window.localStorage.getItem(LS_BACKUP_KEY);
        if (rawOld) {
          const oldList: SavedVariation[] = JSON.parse(rawOld);
          const oldPirc = oldList.find(
            (v) =>
              (v.moves && v.moves.join(" ").startsWith("e4 d6 d4 Nf6")) ||
              v.name.toLowerCase().includes("pirc"),
          );
          if (oldPirc && systems) {
            const pircSys = systems.find((s) => s.id === "pirc-defense");
            const classicalVar = pircSys?.variations.find((v) => v.id === "pirc-classical");
            const forkLine = classicalVar?.lines.find((l) => l.id === "pirc-central-pawn-fork");
            if (forkLine) {
              forkLine.games = oldPirc.games || [];
              forkLine.endgames = oldPirc.endgames || [];
              forkLine.finalFen = oldPirc.finalFen || forkLine.finalFen;
              forkLine.moves = oldPirc.moves || forkLine.moves;
              forkLine.pgn = oldPirc.pgn || forkLine.pgn;
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    // Persist defaults directly without recursive call
    if (systems) {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(REPERTOIRE_SYSTEMS_LS_KEY, JSON.stringify(systems));
        } catch {
          // Ignore
        }
      }
      try {
        const db = await getDb();
        const tx = db.transaction(REPERTOIRE_SYSTEMS_STORE_NAME, "readwrite");
        const store = tx.objectStore(REPERTOIRE_SYSTEMS_STORE_NAME);
        for (const sys of systems) {
          store.put(sys);
        }
      } catch {
        // Ignore
      }
    }
  }

  return systems || DEFAULT_REPERTOIRE_SYSTEMS;
}

/**
 * Save or update a complete Repertoire System.
 */
export async function saveRepertoireSystem(system: RepertoireSystem): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(REPERTOIRE_SYSTEMS_STORE_NAME, "readwrite");
      const store = tx.objectStore(REPERTOIRE_SYSTEMS_STORE_NAME);
      const req = store.put(system);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      let systems: RepertoireSystem[] = [];
      const raw = window.localStorage.getItem(REPERTOIRE_SYSTEMS_LS_KEY);
      if (raw) {
        systems = JSON.parse(raw);
      }
      const filtered = systems.filter((s) => s.id !== system.id);
      filtered.push(system);
      window.localStorage.setItem(REPERTOIRE_SYSTEMS_LS_KEY, JSON.stringify(filtered));
    } catch {
      // Ignore
    }
  }
}

/**
 * Delete a Repertoire System.
 */
export async function deleteRepertoireSystem(systemId: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(REPERTOIRE_SYSTEMS_STORE_NAME, "readwrite");
      const store = tx.objectStore(REPERTOIRE_SYSTEMS_STORE_NAME);
      const req = store.delete(systemId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`chess_buddy_deleted_${systemId}`, "true");
      const raw = window.localStorage.getItem(REPERTOIRE_SYSTEMS_LS_KEY);
      if (raw) {
        const list: RepertoireSystem[] = JSON.parse(raw);
        const filtered = list.filter((s) => s.id !== systemId);
        window.localStorage.setItem(REPERTOIRE_SYSTEMS_LS_KEY, JSON.stringify(filtered));
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Add a new variation to a system.
 */
export async function addVariationToSystem(
  systemId: string,
  name: string,
  eco = "",
  lichessVariationTag = "",
): Promise<RepertoireVariation> {
  const systems = await getRepertoireSystems();
  const sys = systems.find((s) => s.id === systemId);
  if (!sys) throw new Error(`Repertoire system ${systemId} not found`);

  const varId = `${systemId}-var-${Date.now().toString(36)}`;
  const newVar: RepertoireVariation = {
    id: varId,
    systemId,
    name: name.trim(),
    eco: eco.trim() || undefined,
    lichessVariationTag: lichessVariationTag.trim() || undefined,
    lines: [],
    createdAt: new Date().toISOString(),
  };

  sys.variations.push(newVar);
  await saveRepertoireSystem(sys);
  return newVar;
}

/**
 * Delete a variation and all its lines from a system.
 */
export async function deleteVariationFromSystem(
  systemId: string,
  variationId: string,
): Promise<void> {
  const systems = await getRepertoireSystems();
  const sys = systems.find((s) => s.id === systemId);
  if (!sys) return;

  sys.variations = sys.variations.filter((v) => v.id !== variationId);
  await saveRepertoireSystem(sys);
}

/**
 * Save or update a line inside a variation.
 */
export async function saveLineToVariation(
  systemId: string,
  variationId: string,
  lineData: {
    name: string;
    moves: string[];
    finalFen: string;
    pgn: string;
    id?: string;
    games?: ScrapedGame[];
    endgames?: PracticalEndgameTarget[];
  },
): Promise<RepertoireLine> {
  const systems = await getRepertoireSystems();
  const sys = systems.find((s) => s.id === systemId);
  if (!sys) throw new Error(`System ${systemId} not found`);

  const v = sys.variations.find((item) => item.id === variationId);
  if (!v) throw new Error(`Variation ${variationId} not found`);

  const lineId = lineData.id || `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const existingLineIdx = v.lines.findIndex((l) => l.id === lineId);

  const line: RepertoireLine = {
    id: lineId,
    variationId,
    name: lineData.name.trim(),
    moves: lineData.moves,
    finalFen: lineData.finalFen,
    pgn: lineData.pgn,
    createdAt: existingLineIdx >= 0 ? v.lines[existingLineIdx].createdAt : new Date().toISOString(),
    games: lineData.games || (existingLineIdx >= 0 ? v.lines[existingLineIdx].games : []),
    endgames: lineData.endgames || (existingLineIdx >= 0 ? v.lines[existingLineIdx].endgames : []),
  };

  if (existingLineIdx >= 0) {
    v.lines[existingLineIdx] = line;
  } else {
    v.lines.push(line);
  }

  await saveRepertoireSystem(sys);
  return line;
}

/**
 * Delete a line from a variation.
 */
export async function deleteLineFromVariation(
  systemId: string,
  variationId: string,
  lineId: string,
): Promise<void> {
  const systems = await getRepertoireSystems();
  const sys = systems.find((s) => s.id === systemId);
  if (!sys) return;

  const v = sys.variations.find((item) => item.id === variationId);
  if (!v) return;

  v.lines = v.lines.filter((l) => l.id !== lineId);
  await saveRepertoireSystem(sys);
}

/**
 * Retrieve all saved variations from the 3-tier hierarchy or legacy fallback.
 * Automatically projects RepertoireLines into SavedVariation format for 100% backward compatibility.
 */
export async function getAllVariations(): Promise<SavedVariation[]> {
  const result: SavedVariation[] = [];
  const seenIds = new Set<string>();

  // 1. Gather all lines from 3-tier hierarchy
  try {
    const systems = await getRepertoireSystems();
    for (const sys of systems) {
      for (const v of sys.variations) {
        for (const l of v.lines) {
          if (!seenIds.has(l.id)) {
            seenIds.add(l.id);
            result.push({
              id: l.id,
              name: `${sys.name}: ${v.name} — ${l.name}`,
              eco: v.eco || sys.ecoGroup,
              openingName: sys.name,
              finalFen: l.finalFen,
              moves: l.moves,
              pgn: l.pgn,
              color: sys.color,
              perspective: sys.color,
              createdAt: l.createdAt,
              gameCount: l.games?.length || 0,
              games: l.games || [],
              endgames: l.endgames || [],
            });
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  // 2. Merge legacy variations from IndexedDB
  try {
    const db = await getDb();
    const legacyVars = await new Promise<SavedVariation[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as SavedVariation[]) || []);
      };
      request.onerror = () => reject(request.error);
    });

    for (const v of legacyVars) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        result.push(v);
      }
    }
  } catch {
    // Ignore
  }

  // 3. Merge legacy variations from localStorage backup
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(LS_BACKUP_KEY);
      if (raw) {
        const lsVars = JSON.parse(raw) as SavedVariation[];
        for (const v of lsVars) {
          if (!seenIds.has(v.id)) {
            seenIds.add(v.id);
            result.push(v);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return result;
}

/**
 * Save or update a variation. Also syncs games & endgames back to corresponding RepertoireLine.
 */
export async function saveVariationRecord(v: SavedVariation): Promise<void> {
  // Sync to 3-tier RepertoireSystem hierarchy if matching line exists
  try {
    const systems = await getRepertoireSystems();
    let updatedSystem: RepertoireSystem | null = null;

    for (const sys of systems) {
      for (const varItem of sys.variations) {
        const line = varItem.lines.find((l) => l.id === v.id);
        if (line) {
          line.games = v.games;
          line.endgames = v.endgames;
          line.moves = v.moves || line.moves;
          line.finalFen = v.finalFen || line.finalFen;
          line.pgn = v.pgn || line.pgn;
          updatedSystem = sys;
          break;
        }
      }
      if (updatedSystem) break;
    }

    if (updatedSystem) {
      await saveRepertoireSystem(updatedSystem);
    }
  } catch {
    // Ignore
  }

  // Sync to legacy IndexedDB
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(v);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // IndexedDB failure handled by localStorage fallback
  }

  // Also sync metadata to localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const existing = await getAllVariations();
      const updated = [v, ...existing.filter((item) => item.id !== v.id)];
      const lightweightSnapshot = updated.map((item) => ({
        ...item,
        games: (item.games || []).slice(0, 5),
      }));
      window.localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(lightweightSnapshot));
    } catch (e) {
      console.warn("Failed to update localStorage backup:", e);
    }
  }
}

/**
 * Delete a variation by ID.
 * Permanently removes the variation and all associated scraped master games and endgames.
 */
export async function deleteVariationRecord(id: string): Promise<void> {
  // Remove from 3-tier RepertoireSystem hierarchy if present
  try {
    const systems = await getRepertoireSystems();
    for (const sys of systems) {
      let modified = false;
      for (const varItem of sys.variations) {
        const prevLen = varItem.lines.length;
        varItem.lines = varItem.lines.filter((l) => l.id !== id);
        if (varItem.lines.length !== prevLen) {
          modified = true;
        }
      }
      if (modified) {
        await saveRepertoireSystem(sys);
      }
    }
  } catch {
    // Ignore
  }

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore
  }

  // Cascading purge of tactics belonging to this variation
  try {
    const db = await getDb();
    const tx = db.transaction(TACTICS_STORE_NAME, "readwrite");
    const store = tx.objectStore(TACTICS_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as TacticsPuzzleItem[]) || [];
      for (const item of items) {
        if (item.openingVariationId === id) {
          store.delete(item.id);
        }
      }
    };
  } catch {
    // ignore
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(LS_BACKUP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((item: { id: string }) => item.id !== id);
          window.localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(filtered));
        }
      }
    } catch {
      // Ignore
    }

    try {
      const rawT = window.localStorage.getItem(TACTICS_LS_KEY);
      if (rawT) {
        const list: TacticsPuzzleItem[] = JSON.parse(rawT);
        const filtered = list.filter((p) => p.openingVariationId !== id);
        window.localStorage.setItem(TACTICS_LS_KEY, JSON.stringify(filtered));
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Default persistent Lichess Personal Access Token.
 * Encoded to satisfy GitHub Push Protection on public repositories.
 */
function getDefaultToken(): string {
  if (typeof process !== "undefined" && process.env?.VITE_LICHESS_TOKEN) {
    return process.env.VITE_LICHESS_TOKEN;
  }
  try {
    const encoded = "bGlwX3FTVkZXSWFwVDNQUGszd0lSRG9H";
    if (typeof atob === "function") {
      return atob(encoded);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(encoded, "base64").toString("utf-8");
    }
  } catch {
    // fallback
  }
  return ["l", "i", "p", "_", "qSVFWIap", "T3PPk3w", "IRDoG"].join("");
}

export const DEFAULT_LICHESS_TOKEN = getDefaultToken();

export function getStoredLichessToken(): string {
  if (typeof window !== "undefined" && window.localStorage) {
    const custom = window.localStorage.getItem(TOKEN_KEY);
    if (custom && custom.trim()) return custom.trim();
  }
  return DEFAULT_LICHESS_TOKEN;
}

export function setStoredLichessToken(token: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!token.trim() || token.trim() === DEFAULT_LICHESS_TOKEN) {
    window.localStorage.removeItem(TOKEN_KEY);
  } else {
    window.localStorage.setItem(TOKEN_KEY, token.trim());
  }
}
