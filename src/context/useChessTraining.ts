/**
 * useChessTraining — centralized chess state for Chess Buddy.
 *
 * Fully integrated with client-side WebAssembly Stockfish (MultiPV 3),
 * the Engine Translation Layer, tactical motif tagging, and plain-English AI explanations.
 */
import { Chess, type Square } from "chess.js";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { stockfishEngine } from "../engine/stockfishClient";
import type { EngineAnalysisResult } from "../engine/stockfishTypes";
import {
  classifyMoveQuality,
  generateLocalExplanation,
  type MoveClassification,
} from "../services/explanationPrompt";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Orientation = "white" | "black";

export interface EngineEval {
  score: number; // Centipawns from White's perspective (+1.00 = +1 pawn)
  bestMove: string | null; // SAN
  depth: number;
}

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
  analysis: EngineAnalysisResult | null;
  isEngineThinking: boolean;
  explanation: string | null;
  lastClassification: MoveClassification | null;
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
  const [evaluation, setEvaluation] = useState<EngineEval>({
    score: 0.2,
    bestMove: null,
    depth: 0,
  });
  const [analysis, setAnalysis] = useState<EngineAnalysisResult | null>(null);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [lastClassification, setLastClassification] = useState<MoveClassification | null>(null);
  const [savedVariations, setSavedVariations] = useState<SavedVariation[]>([]);

  const sync = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
  }, []);

  const runAnalysis = useCallback(
    async (targetFen: string, lastMove?: { from: string; to: string }) => {
      setIsEngineThinking(true);
      try {
        const prevAnalysis = analysis;
        const res = await stockfishEngine.evaluate(targetFen, {
          depth: 15,
          movetime: 800,
          lastMove,
        });

        setAnalysis(res);
        const evalObj: EngineEval = {
          score: res.evalWhite,
          bestMove: res.bestMoveSan,
          depth: res.depth,
        };
        setEvaluation(evalObj);

        // If a move was just played, compute move classification and plain-English explanation
        if (lastMove && prevAnalysis) {
          const playedSan = gameRef.current.history().slice(-1)[0] || "";
          const isBest = res.bestMoveSan === playedSan;
          const evalDiff = res.evalWhite - prevAnalysis.evalWhite;
          const classification = classifyMoveQuality(evalDiff, isBest);
          setLastClassification(classification);

          const exp = generateLocalExplanation({
            fenBefore: prevAnalysis.fen,
            fenAfter: targetFen,
            userMoveSan: playedSan,
            userMoveFromTo: lastMove,
            bestMoveSan: prevAnalysis.bestMoveSan || playedSan,
            analysis: res,
            evalDiffPawns: evalDiff,
            classification,
          });
          setExplanation(exp);
        }

        setIsEngineThinking(false);
        return evalObj;
      } catch (err) {
        console.warn("Stockfish evaluation error:", err);
        setIsEngineThinking(false);
        return evaluation;
      }
    },
    [analysis, evaluation],
  );

  const makeMove = useCallback(
    (from: string, to: string) => {
      try {
        const move = gameRef.current.move({
          from: from as Square,
          to: to as Square,
          promotion: "q",
        });
        if (!move) return false;

        const newFen = gameRef.current.fen();
        sync();

        // ANTIGRAVITY HOOK: Client-side Stockfish evaluation & AI Translation Layer
        runAnalysis(newFen, { from, to });
        return true;
      } catch {
        return false;
      }
    },
    [sync, runAnalysis],
  );

  const undo = useCallback(() => {
    gameRef.current.undo();
    const newFen = gameRef.current.fen();
    sync();
    setExplanation(null);
    setLastClassification(null);
    runAnalysis(newFen);
  }, [sync, runAnalysis]);

  const reset = useCallback(
    (startFen?: string) => {
      gameRef.current = new Chess(startFen ?? START_FEN);
      const newFen = gameRef.current.fen();
      sync();
      setExplanation(null);
      setLastClassification(null);
      runAnalysis(newFen);
    },
    [sync, runAnalysis],
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
    setSavedVariations((prev) => [v, ...prev]);
    return v;
  }, []);

  const requestEvaluation = useCallback(async () => {
    return runAnalysis(gameRef.current.fen());
  }, [runAnalysis]);

  const value = useMemo(
    () => ({
      fen,
      history,
      orientation,
      evaluation,
      analysis,
      isEngineThinking,
      explanation,
      lastClassification,
      savedVariations,
      makeMove,
      undo,
      reset,
      flip,
      loadFen,
      getPgn,
      saveVariation,
      requestEvaluation,
    }),
    [
      fen,
      history,
      orientation,
      evaluation,
      analysis,
      isEngineThinking,
      explanation,
      lastClassification,
      savedVariations,
      makeMove,
      undo,
      reset,
      flip,
      loadFen,
      getPgn,
      saveVariation,
      requestEvaluation,
    ],
  );

  return createElement(ChessTrainingContext.Provider, { value }, children);
}

export function useChessTraining() {
  const ctx = useContext(ChessTrainingContext);
  if (!ctx) throw new Error("useChessTraining must be used inside <ChessTrainingProvider>");
  return ctx;
}
