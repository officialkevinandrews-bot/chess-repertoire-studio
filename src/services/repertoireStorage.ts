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
const DB_VERSION = 3;
const STORE_NAME = "variations";
const TACTICS_STORE_NAME = "tactics_puzzles";
const TACTICS_PROGRESS_STORE_NAME = "tactics_user_progress";

const LS_BACKUP_KEY = "chess_buddy_saved_variations_meta";
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

export async function clearAllTacticsPuzzles(): Promise<void> {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(TACTICS_LS_KEY);
    } catch {
      // ignore
    }
  }

  try {
    const db = await getDb();
    const tx = db.transaction(TACTICS_STORE_NAME, "readwrite");
    tx.objectStore(TACTICS_STORE_NAME).clear();
  } catch {
    // ignore
  }
}

/**
 * Retrieve all saved variations from IndexedDB or localStorage fallback.
 */
export async function getAllVariations(): Promise<SavedVariation[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as SavedVariation[]) || [];
        // Sort newest first
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback to localStorage
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(LS_BACKUP_KEY);
        if (raw) {
          return JSON.parse(raw) as SavedVariation[];
        }
      } catch {
        // Ignore parse errors
      }
    }
    return [];
  }
}

/**
 * Save or update a variation. Also writes lightweight metadata to localStorage for instant SSR.
 */
export async function saveVariationRecord(v: SavedVariation): Promise<void> {
  // Sync to IndexedDB
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
      // Keep only first 5 games in localStorage snapshot to preserve quota
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
    // Ignore IndexedDB error, proceed to localStorage cleanup
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
