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
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { stockfishEngine } from "../engine/stockfishClient";
import type { EngineAnalysisResult } from "../engine/stockfishTypes";
import { fetchLichessCloudEval } from "../engine/cloudEvalService";
import {
  getCachedEvaluation,
  saveEvaluationToCache,
} from "../services/evaluationCache";
import { evaluateTacticalProfile } from "../utils/engineInterpreter";
import { analyzePositionMotifs } from "../utils/chessMotifs";
import { analyzeMateFromLine } from "../utils/mateFilter";
import {
  classifyMoveQuality,
  generateLocalExplanation,
  type MoveClassification,
} from "../services/explanationPrompt";
import {
  deleteVariationRecord,
  getAllVariations,
  getUserTelemetry,
  saveVariationRecord,
  updateUserTelemetry,
  getRepertoireSystems,
  saveRepertoireSystem,
  deleteRepertoireSystem,
  addVariationToSystem as addVarToSysStorage,
  deleteVariationFromSystem as delVarFromSysStorage,
  saveLineToVariation as saveLineToVarStorage,
  deleteLineFromVariation as delLineFromVarStorage,
  type PracticalEndgameTarget,
  type SavedVariation,
  type ScrapedGame,
  type UserProgressTelemetry,
  type RepertoireSystem,
  type RepertoireVariation,
  type RepertoireLine,
} from "../services/repertoireStorage";
import { identifyOpening } from "../utils/openingNames";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Orientation = "white" | "black";
export type EngineMode = "super-gm" | "grandmaster" | "quick" | "infinite";
export type EngineSource = "cloud" | "local" | "infinite" | "cache";

export interface EngineEval {
  score: number; // Centipawns from White's perspective (+1.00 = +1 pawn)
  bestMove: string | null; // SAN
  depth: number;
}

export type {
  PracticalEndgameTarget,
  SavedVariation,
  ScrapedGame,
  UserProgressTelemetry,
  RepertoireSystem,
  RepertoireVariation,
  RepertoireLine,
};

interface ChessTrainingContextValue {
  telemetry: UserProgressTelemetry;
  recordTrainingResult: (
    movesAttempted: number,
    correctMoves: number,
    pointsEarned: number,
  ) => void;
  recordEndgameSolved: (isPerfect: boolean, points: number) => void;
  fen: string;
  history: string[];
  orientation: Orientation;
  evaluation: EngineEval;
  analysis: EngineAnalysisResult | null;
  isEngineThinking: boolean;
  explanation: string | null;
  lastClassification: MoveClassification | null;
  engineMode: EngineMode;
  setEngineMode: (mode: EngineMode) => void;
  candidateLinesCount: 3 | 5;
  setCandidateLinesCount: (count: 3 | 5) => void;
  engineSource: EngineSource;
  isInfinitePaused: boolean;
  pauseInfiniteAnalysis: () => void;
  resumeInfiniteAnalysis: () => void;
  infiniteElapsedSeconds: number;
  savedVariations: SavedVariation[];
  activeVariation: SavedVariation | null;
  setActiveVariation: (v: SavedVariation | null) => void;
  repertoireSystems: RepertoireSystem[];
  activeSystem: RepertoireSystem | null;
  setActiveSystem: (s: RepertoireSystem | null) => void;
  activeRepertoireVariation: RepertoireVariation | null;
  setActiveRepertoireVariation: (v: RepertoireVariation | null) => void;
  addRepertoireSystem: (
    name: string,
    color: "white" | "black",
    ecoGroup?: string,
    lichessTag?: string,
    description?: string,
  ) => Promise<RepertoireSystem>;
  deleteRepertoireSystem: (systemId: string) => Promise<void>;
  addVariationToSystem: (
    systemId: string,
    name: string,
    eco?: string,
    tag?: string,
  ) => Promise<RepertoireVariation>;
  deleteVariationFromSystem: (systemId: string, variationId: string) => Promise<void>;
  saveLineToVariation: (
    systemId: string,
    variationId: string,
    lineName: string,
    customFen?: string,
    customMoves?: string[],
    customPgn?: string,
  ) => Promise<RepertoireLine>;
  deleteLineFromVariation: (
    systemId: string,
    variationId: string,
    lineId: string,
  ) => Promise<void>;
  refreshRepertoireSystems: () => Promise<void>;
  makeMove: (from: string, to: string) => boolean;
  undo: () => void;
  reset: (fen?: string) => void;
  flip: () => void;
  setOrientation: (o: Orientation) => void;
  loadFen: (fen: string) => void;
  getPgn: () => string;
  saveVariation: (
    name?: string,
    perspectiveOverride?: "white" | "black",
  ) => Promise<SavedVariation>;
  deleteVariation: (id: string) => Promise<void>;
  updateVariationGames: (
    id: string,
    games: ScrapedGame[],
    endgames: PracticalEndgameTarget[],
  ) => Promise<void>;
  refreshVariations: () => Promise<void>;
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
  const [engineMode, setEngineMode] = useState<EngineMode>("super-gm");
  const [candidateLinesCount, setCandidateLinesCountState] = useState<3 | 5>(5);
  const [engineSource, setEngineSource] = useState<EngineSource>("cloud");
  const [isInfinitePaused, setIsInfinitePaused] = useState(false);
  const [infiniteElapsedSeconds, setInfiniteElapsedSeconds] = useState(0);
  const [savedVariations, setSavedVariations] = useState<SavedVariation[]>([]);
  const [activeVariation, setActiveVariation] = useState<SavedVariation | null>(null);
  const [repertoireSystems, setRepertoireSystems] = useState<RepertoireSystem[]>([]);
  const [activeSystem, setActiveSystem] = useState<RepertoireSystem | null>(null);
  const [activeRepertoireVariation, setActiveRepertoireVariation] = useState<RepertoireVariation | null>(null);
  const [telemetry, setTelemetry] = useState<UserProgressTelemetry>(getUserTelemetry());

  // Timer for Infinite Analysis search duration
  useEffect(() => {
    let timer: any = null;
    if (engineMode === "infinite" && isEngineThinking && !isInfinitePaused) {
      timer = setInterval(() => {
        setInfiniteElapsedSeconds((s) => s + 1);
      }, 1000);
    } else if (engineMode !== "infinite") {
      setInfiniteElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [engineMode, isEngineThinking, isInfinitePaused]);

  // Hydrate saved variations, repertoire systems & telemetry from IndexedDB / localStorage on client mount
  useEffect(() => {
    setTelemetry(getUserTelemetry());
    getRepertoireSystems()
      .then((systems) => {
        setRepertoireSystems(systems);
        if (systems.length > 0) {
          setActiveSystem(systems[0]);
          if (systems[0].variations.length > 0) {
            setActiveRepertoireVariation(systems[0].variations[0]);
          }
        }
      })
      .catch((err) => {
        console.warn("Could not load repertoire systems from storage:", err);
      });

    getAllVariations()
      .then((vars) => {
        setSavedVariations(vars);
        if (vars.length > 0) {
          setActiveVariation(vars[0]);
        }
      })
      .catch((err) => {
        console.warn("Could not load saved variations from storage:", err);
      });
  }, []);

  const recordTrainingResult = useCallback(
    (movesAttempted: number, correctMoves: number, pointsEarned: number) => {
      setTelemetry((prev) => {
        const updated = updateUserTelemetry({
          totalMovesGuessed: (prev.totalMovesGuessed || 0) + movesAttempted,
          correctMovesGuessed: (prev.correctMovesGuessed || 0) + correctMoves,
          totalScore: (prev.totalScore || 0) + pointsEarned,
        });
        return updated;
      });
    },
    [],
  );

  const recordEndgameSolved = useCallback((isPerfect: boolean, points: number) => {
    setTelemetry((prev) => {
      const updated = updateUserTelemetry({
        endgamesSolved: (prev.endgamesSolved || 0) + 1,
        perfectConversions: (prev.perfectConversions || 0) + (isPerfect ? 1 : 0),
        totalScore: (prev.totalScore || 0) + points,
      });
      return updated;
    });
  }, []);

  const refreshVariations = useCallback(async () => {
    const vars = await getAllVariations();
    setSavedVariations(vars);
  }, []);

  const sync = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
  }, []);

  const pauseInfiniteAnalysis = useCallback(() => {
    stockfishEngine.pause();
    setIsInfinitePaused(true);
    setIsEngineThinking(false);
  }, []);

  const resumeInfiniteAnalysis = useCallback(() => {
    setIsInfinitePaused(false);
    setIsEngineThinking(true);
    stockfishEngine.resume();
  }, []);

  const runAnalysis = useCallback(
    async (
      targetFen: string,
      lastMove?: { from: string; to: string },
      overrideMode?: EngineMode,
      overrideLinesCount?: 3 | 5,
    ) => {
      const activeMode = overrideMode || engineMode;
      const linesCount = overrideLinesCount || candidateLinesCount || 5;
      setIsEngineThinking(true);

      const handleCompletedResult = (res: EngineAnalysisResult, source: EngineSource) => {
        setAnalysis(res);
        setEngineSource(source);
        const evalObj: EngineEval = {
          score: res.evalWhite,
          bestMove: res.bestMoveSan,
          depth: res.depth,
        };
        setEvaluation(evalObj);

        // Persist deep evaluation to persistent IndexedDB cache
        saveEvaluationToCache(res, source);

        // If a move was just played, compute move classification and plain-English explanation
        if (lastMove && analysis) {
          const playedSan = gameRef.current.history().slice(-1)[0] || "";
          const isBest = res.bestMoveSan === playedSan;
          const evalDiff = res.evalWhite - analysis.evalWhite;
          const classification = classifyMoveQuality(evalDiff, isBest);
          setLastClassification(classification);

          const exp = generateLocalExplanation({
            fenBefore: analysis.fen,
            fenAfter: targetFen,
            userMoveSan: playedSan,
            userMoveFromTo: lastMove,
            bestMoveSan: analysis.bestMoveSan || playedSan,
            analysis: res,
            evalDiffPawns: evalDiff,
            classification,
          });
          setExplanation(exp);
        }

        return evalObj;
      };

      try {
        // 0. Check persistent evaluation cache for this position (instant 0ms)
        const cached = await getCachedEvaluation(targetFen);
        if (cached && cached.depth >= 15) {
          const cachedLines = cached.lines.slice(0, linesCount);
          const cachedAnalysis: EngineAnalysisResult = {
            fen: targetFen,
            depth: cached.depth,
            lines: cachedLines,
            profile: evaluateTacticalProfile(cachedLines),
            motifs: analyzePositionMotifs(targetFen, cachedLines[0]?.pv || [], lastMove),
            mateAnalysis: analyzeMateFromLine(targetFen, cachedLines[0]),
            bestMoveSan: cached.bestMoveSan,
            evalWhite: cached.evalWhite,
          };

          handleCompletedResult(cachedAnalysis, "cache");

          const targetDepth = activeMode === "quick" ? 18 : 25;
          if (activeMode !== "infinite" && cached.depth >= targetDepth) {
            setIsEngineThinking(false);
            return {
              score: cached.evalWhite,
              bestMove: cached.bestMoveSan,
              depth: cached.depth,
            };
          }
        }

        if (activeMode === "super-gm") {
          // 1. Try Lichess Cloud Cluster first (Depth 40-60+, 50M-100M+ nodes, Stockfish 16/17/19 NNUE)
          const cloudRes = await fetchLichessCloudEval(targetFen, linesCount);
          if (cloudRes && cloudRes.lines.length > 0 && cloudRes.depth >= 25) {
            setIsEngineThinking(false);
            return handleCompletedResult(cloudRes, "cloud");
          }

          // 2. Fallback to Local Deep Stockfish 19 at Depth 25 with progressive depth streaming
          const localRes = await stockfishEngine.evaluate(targetFen, {
            depth: 25,
            multiPv: linesCount,
            lastMove,
            onProgress: (partial) => {
              setAnalysis(partial);
              setEngineSource("local");
              setEvaluation({
                score: partial.evalWhite,
                bestMove: partial.bestMoveSan,
                depth: partial.depth,
              });
              if (partial.depth >= 16) {
                saveEvaluationToCache(partial, "local");
              }
            },
          });
          setIsEngineThinking(false);
          return handleCompletedResult(localRes, "local");
        } else if (activeMode === "grandmaster") {
          const localRes = await stockfishEngine.evaluate(targetFen, {
            depth: 25,
            multiPv: linesCount,
            lastMove,
            onProgress: (partial) => {
              setAnalysis(partial);
              setEngineSource("local");
              setEvaluation({
                score: partial.evalWhite,
                bestMove: partial.bestMoveSan,
                depth: partial.depth,
              });
              if (partial.depth >= 16) {
                saveEvaluationToCache(partial, "local");
              }
            },
          });
          setIsEngineThinking(false);
          return handleCompletedResult(localRes, "local");
        } else if (activeMode === "quick") {
          const localRes = await stockfishEngine.evaluate(targetFen, {
            depth: 18,
            movetime: 1500,
            multiPv: linesCount,
            lastMove,
            onProgress: (partial) => {
              setAnalysis(partial);
              setEngineSource("local");
              setEvaluation({
                score: partial.evalWhite,
                bestMove: partial.bestMoveSan,
                depth: partial.depth,
              });
              if (partial.depth >= 16) {
                saveEvaluationToCache(partial, "local");
              }
            },
          });
          setIsEngineThinking(false);
          return handleCompletedResult(localRes, "local");
        } else if (activeMode === "infinite") {
          setEngineSource("infinite");
          setIsInfinitePaused(false);
          setInfiniteElapsedSeconds(0);
          stockfishEngine.startInfinite(targetFen, {
            multiPv: linesCount,
            lastMove,
            onProgress: (partial) => {
              setAnalysis(partial);
              setEvaluation({
                score: partial.evalWhite,
                bestMove: partial.bestMoveSan,
                depth: partial.depth,
              });
              if (partial.depth >= 18) {
                saveEvaluationToCache(partial, "infinite");
              }
            },
          });
          return evaluation;
        }
      } catch (err) {
        console.warn("Stockfish evaluation error:", err);
        setIsEngineThinking(false);
        return evaluation;
      }
      return evaluation;
    },
    [analysis, candidateLinesCount, engineMode, evaluation],
  );

  const setCandidateLinesCount = useCallback(
    (count: 3 | 5) => {
      setCandidateLinesCountState(count);
      runAnalysis(gameRef.current.fen(), undefined, undefined, count);
    },
    [runAnalysis],
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

  const saveVariation = useCallback(
    async (customName?: string, perspectiveOverride?: "white" | "black") => {
      const historyMoves = gameRef.current.history();
      const opening = identifyOpening(historyMoves);
      const finalName = customName?.trim() || `${opening.name} (${historyMoves.length} moves)`;
      const chosenPerspective = perspectiveOverride || orientation;

      const v: SavedVariation = {
        id: crypto.randomUUID(),
        name: finalName,
        eco: opening.eco,
        openingName: opening.name,
        pgn: gameRef.current.pgn(),
        finalFen: gameRef.current.fen(),
        moves: historyMoves,
        color: chosenPerspective,
        perspective: chosenPerspective,
        createdAt: new Date().toISOString(),
        gameCount: 0,
        games: [],
        endgames: [],
      };

      await saveVariationRecord(v);
      setSavedVariations((prev) => [v, ...prev.filter((i) => i.id !== v.id)]);
      setActiveVariation(v);
      return v;
    },
    [orientation],
  );

  const deleteVariation = useCallback(async (id: string) => {
    await deleteVariationRecord(id);
    setSavedVariations((prev) => prev.filter((item) => item.id !== id));
    setActiveVariation((current) => (current?.id === id ? null : current));
  }, []);

  const updateVariationGames = useCallback(
    async (id: string, games: ScrapedGame[], endgames: PracticalEndgameTarget[]) => {
      setSavedVariations((prev) => {
        const updatedList = prev.map((item) => {
          if (item.id === id) {
            const updated = {
              ...item,
              gameCount: games.length,
              games,
              endgames,
            };
            saveVariationRecord(updated);
            return updated;
          }
          return item;
        });
        return updatedList;
      });

      setActiveVariation((current) => {
        if (current && current.id === id) {
          return {
            ...current,
            gameCount: games.length,
            games,
            endgames,
          };
        }
        return current;
      });
    },
    [],
  );

  const refreshRepertoireSystems = useCallback(async () => {
    const systems = await getRepertoireSystems();
    setRepertoireSystems(systems);
    const vars = await getAllVariations();
    setSavedVariations(vars);
  }, []);

  const addRepertoireSystem = useCallback(
    async (
      name: string,
      color: "white" | "black",
      ecoGroup = "",
      lichessTag = "",
      description = "",
    ) => {
      const newSys: RepertoireSystem = {
        id: `sys-${Date.now().toString(36)}`,
        name: name.trim(),
        color,
        ecoGroup: ecoGroup.trim(),
        lichessOpeningTag: lichessTag.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        description: description.trim(),
        variations: [],
        createdAt: new Date().toISOString(),
      };
      await saveRepertoireSystem(newSys);
      await refreshRepertoireSystems();
      setActiveSystem(newSys);
      return newSys;
    },
    [refreshRepertoireSystems],
  );

  const deleteRepertoireSystemCallback = useCallback(
    async (systemId: string) => {
      await deleteRepertoireSystem(systemId);
      await refreshRepertoireSystems();
      setActiveSystem((curr) => (curr?.id === systemId ? null : curr));
    },
    [refreshRepertoireSystems],
  );

  const addVariationToSystem = useCallback(
    async (systemId: string, name: string, eco?: string, tag?: string) => {
      const v = await addVarToSysStorage(systemId, name, eco, tag);
      await refreshRepertoireSystems();
      setActiveRepertoireVariation(v);
      return v;
    },
    [refreshRepertoireSystems],
  );

  const deleteVariationFromSystem = useCallback(
    async (systemId: string, variationId: string) => {
      await delVarFromSysStorage(systemId, variationId);
      await refreshRepertoireSystems();
      setActiveRepertoireVariation((curr) => (curr?.id === variationId ? null : curr));
    },
    [refreshRepertoireSystems],
  );

  const saveLineToVariation = useCallback(
    async (
      systemId: string,
      variationId: string,
      lineName: string,
      customFen?: string,
      customMoves?: string[],
      customPgn?: string,
    ) => {
      const moves = customMoves || gameRef.current.history();
      const finalFen = customFen || gameRef.current.fen();
      const pgn = customPgn || gameRef.current.pgn();
      const line = await saveLineToVarStorage(systemId, variationId, {
        name: lineName,
        moves,
        finalFen,
        pgn,
      });
      await refreshRepertoireSystems();
      return line;
    },
    [refreshRepertoireSystems],
  );

  const deleteLineFromVariation = useCallback(
    async (systemId: string, variationId: string, lineId: string) => {
      await delLineFromVarStorage(systemId, variationId, lineId);
      await refreshRepertoireSystems();
    },
    [refreshRepertoireSystems],
  );

  const requestEvaluation = useCallback(async () => {
    return runAnalysis(gameRef.current.fen());
  }, [runAnalysis]);

  const value = useMemo(
    () => ({
      telemetry,
      recordTrainingResult,
      recordEndgameSolved,
      fen,
      history,
      orientation,
      evaluation,
      analysis,
      isEngineThinking,
      explanation,
      lastClassification,
      engineMode,
      setEngineMode,
      candidateLinesCount,
      setCandidateLinesCount,
      engineSource,
      isInfinitePaused,
      pauseInfiniteAnalysis,
      resumeInfiniteAnalysis,
      infiniteElapsedSeconds,
      savedVariations,
      activeVariation,
      setActiveVariation,
      repertoireSystems,
      activeSystem,
      setActiveSystem,
      activeRepertoireVariation,
      setActiveRepertoireVariation,
      addRepertoireSystem,
      deleteRepertoireSystem: deleteRepertoireSystemCallback,
      addVariationToSystem,
      deleteVariationFromSystem,
      saveLineToVariation,
      deleteLineFromVariation,
      refreshRepertoireSystems,
      makeMove,
      undo,
      reset,
      flip,
      setOrientation,
      loadFen,
      getPgn,
      saveVariation,
      deleteVariation,
      updateVariationGames,
      refreshVariations,
      requestEvaluation,
    }),
    [
      telemetry,
      recordTrainingResult,
      recordEndgameSolved,
      fen,
      history,
      orientation,
      evaluation,
      analysis,
      isEngineThinking,
      explanation,
      lastClassification,
      engineMode,
      candidateLinesCount,
      setCandidateLinesCount,
      engineSource,
      isInfinitePaused,
      pauseInfiniteAnalysis,
      resumeInfiniteAnalysis,
      infiniteElapsedSeconds,
      savedVariations,
      activeVariation,
      repertoireSystems,
      activeSystem,
      activeRepertoireVariation,
      addRepertoireSystem,
      deleteRepertoireSystemCallback,
      addVariationToSystem,
      deleteVariationFromSystem,
      saveLineToVariation,
      deleteLineFromVariation,
      refreshRepertoireSystems,
      makeMove,
      undo,
      reset,
      flip,
      setOrientation,
      loadFen,
      getPgn,
      saveVariation,
      deleteVariation,
      updateVariationGames,
      refreshVariations,
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
