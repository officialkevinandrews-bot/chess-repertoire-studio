/**
 * useChessTraining — centralized chess state for Chess Buddy.
 *
 * Every board in the app reads and writes through this context so a backend
 * layer (Antigravity) can plug in engines, APIs and persistence in ONE place.
 *
 * Current behavior: local-only. chess.js validates moves; evaluations,
 * puzzles, master games and tablebase lookups are MOCK placeholders.
 */
import { Chess, type Square } from "chess.js";
import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Orientation = "white" | "black";

/** Placeholder engine evaluation shape (centipawns from White's view). */
export interface EngineEval {
  score: number; // e.g. +0.35
  bestMove: string | null; // SAN
  depth: number;
}

/** Saved repertoire line — shape intended for backend persistence. */
export interface SavedVariation {
  id: string;
  name: string;
  pgn: string;
  finalFen: string;
  moves: string[];
  createdAt: string;
}

interface ChessTrainingContextValue {
  fen: string;
  history: string[];
  orientation: Orientation;
  evaluation: EngineEval;
  savedVariations: SavedVariation[];
  makeMove: (from: string, to: string) => boolean;
  undo: () => void;
  reset: (fen?: string) => void;
  flip: () => void;
  loadFen: (fen: string) => void;
  getPgn: () => string;
  saveVariation: (name: string) => SavedVariation;
  requestEvaluation: () => Promise<EngineEval>;
}

const ChessTrainingContext = createContext<ChessTrainingContextValue | null>(null);

export function ChessTrainingProvider({ children }: { children: ReactNode }) {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(START_FEN);
  const [history, setHistory] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<Orientation>("white");
  // PLACEHOLDER: static eval until an engine is wired in.
  const [evaluation, setEvaluation] = useState<EngineEval>({ score: 0.2, bestMove: null, depth: 0 });
  const [savedVariations, setSavedVariations] = useState<SavedVariation[]>([]);

  const sync = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
  }, []);

  const makeMove = useCallback(
    (from: string, to: string) => {
      try {
        gameRef.current.move({ from: from as Square, to: to as Square, promotion: "q" });
        sync();
        // ANTIGRAVITY HOOK: Inject Stockfish UCI / Lichess API integration here.
        // e.g. postMessage(`position fen ${fen}`) → `go depth 18` → setEvaluation(...)
        return true;
      } catch {
        return false;
      }
    },
    [sync],
  );

  const undo = useCallback(() => {
    gameRef.current.undo();
    sync();
  }, [sync]);

  const reset = useCallback(
    (startFen?: string) => {
      gameRef.current = new Chess(startFen ?? START_FEN);
      sync();
    },
    [sync],
  );

  const loadFen = useCallback((f: string) => reset(f), [reset]);
  const flip = useCallback(() => setOrientation((o) => (o === "white" ? "black" : "white")), []);
  const getPgn = useCallback(() => gameRef.current.pgn(), []);

  const saveVariation = useCallback((name: string) => {
    const v: SavedVariation = {
      id: crypto.randomUUID(),
      name,
      pgn: gameRef.current.pgn(),
      finalFen: gameRef.current.fen(),
      moves: gameRef.current.history(),
      createdAt: new Date().toISOString(),
    };
    // ANTIGRAVITY HOOK: Persist variation + kick off scraper loop using v.finalFen
    // (Lichess puzzles, master games, endgames that pass through this FEN).
    setSavedVariations((prev) => [v, ...prev]);
    return v;
  }, []);

  const requestEvaluation = useCallback(async () => {
    // ANTIGRAVITY HOOK: Inject Stockfish UCI / Lichess API integration here.
    const mock: EngineEval = { score: Math.round((Math.random() * 2 - 1) * 100) / 100, bestMove: null, depth: 0 };
    setEvaluation(mock);
    return mock;
  }, []);

  const value = useMemo(
    () => ({ fen, history, orientation, evaluation, savedVariations, makeMove, undo, reset, flip, loadFen, getPgn, saveVariation, requestEvaluation }),
    [fen, history, orientation, evaluation, savedVariations, makeMove, undo, reset, flip, loadFen, getPgn, saveVariation, requestEvaluation],
  );

  return createElement(ChessTrainingContext.Provider, { value }, children);
}

export function useChessTraining() {
  const ctx = useContext(ChessTrainingContext);
  if (!ctx) throw new Error("useChessTraining must be used inside <ChessTrainingProvider>");
  return ctx;
}
