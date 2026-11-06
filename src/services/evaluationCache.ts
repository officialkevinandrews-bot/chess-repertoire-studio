import type { EngineAnalysisResult, EnginePVLine } from "../engine/stockfishTypes";
import type { EngineSource } from "../context/useChessTraining";

export interface CachedPositionEval {
  normalizedFen: string;
  fullFen: string;
  depth: number;
  evalWhite: number;
  bestMoveSan: string | null;
  lines: EnginePVLine[];
  source: EngineSource;
  timestamp: number;
}

const DB_NAME = "chess_repertoire_eval_cache";
const DB_VERSION = 1;
const STORE_NAME = "evaluations";

// Fast in-memory L1 cache for instant 0ms access
const memoryCache = new Map<string, CachedPositionEval>();

/**
 * Normalizes a FEN string to its canonical position key (pieces, active color, castling, en passant),
 * ignoring irrelevant move counters so transpositions match accurately.
 */
export function normalizeFen(fen: string): string {
  if (!fen) return "";
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(" ");
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "normalizedFen" });
            store.createIndex("depth", "depth", { unique: false });
            store.createIndex("timestamp", "timestamp", { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.warn("[EvalCache] IndexedDB open error, using memory cache only");
          resolve(null);
        };
      } catch (err) {
        console.warn("[EvalCache] Failed to initialize IndexedDB:", err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Retrieves a previously calculated deep evaluation from memory or IndexedDB.
 * Returns null if this position has not yet been analyzed.
 */
export async function getCachedEvaluation(fen: string): Promise<CachedPositionEval | null> {
  const key = normalizeFen(fen);
  if (!key) return null;

  // 1. Check L1 memory cache (instant 0ms)
  if (memoryCache.has(key)) {
    return memoryCache.get(key) || null;
  }

  // 2. Check IndexedDB persistent storage
  const db = await getDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as CachedPositionEval | undefined;
        if (result) {
          memoryCache.set(key, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Saves a completed or deep partial evaluation into the persistent cache.
 * Preserves the deepest depth reached (e.g. will not overwrite a depth 40 eval with depth 15).
 */
export async function saveEvaluationToCache(
  result: EngineAnalysisResult,
  source: EngineSource,
): Promise<void> {
  if (!result || !result.fen || !result.lines || result.lines.length === 0) {
    return;
  }

  const key = normalizeFen(result.fen);
  if (!key) return;

  const existing = memoryCache.get(key);
  // Never downgrade an existing deeper evaluation in the cache
  if (existing && existing.depth > result.depth) {
    return;
  }

  const entry: CachedPositionEval = {
    normalizedFen: key,
    fullFen: result.fen,
    depth: result.depth,
    evalWhite: result.evalWhite,
    bestMoveSan: result.bestMoveSan,
    lines: result.lines,
    source,
    timestamp: Date.now(),
  };

  // Update memory cache
  memoryCache.set(key, entry);

  // Update IndexedDB
  const db = await getDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
  } catch (err) {
    console.warn("[EvalCache] Failed to persist eval to IndexedDB:", err);
  }
}

/**
 * Returns the total number of unique positions stored in the deep evaluation cache.
 */
export async function getCachedEvalCount(): Promise<number> {
  const db = await getDb();
  if (!db) return memoryCache.size;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => resolve(memoryCache.size);
    } catch {
      resolve(memoryCache.size);
    }
  });
}
