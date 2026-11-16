import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  BookOpen,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Flame,
  FlipVertical2,
  Loader2,
  Pause,
  Play,
  Puzzle,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChessBoard, type BoardArrow } from "@/components/chess/ChessBoard";
import { EngineLineExplorer } from "@/components/chess/EngineLineExplorer";
import {
  EngineAnalysisPanel,
  ENGINE_ARROW_COLORS,
  EvaluationBar,
  PageHeader,
  Panel,
  TrainingLayout,
} from "@/components/chess/ui";
import { cn } from "@/lib/utils";
import { stockfishEngine } from "@/engine/stockfishClient";
import { fetchLichessCloudEval } from "@/engine/cloudEvalService";
import type { EngineAnalysisResult } from "@/engine/stockfishTypes";
import {
  getCachedEvaluation,
  normalizeFen,
  saveEvaluationToCache,
} from "@/services/evaluationCache";
import { evaluateTacticalProfile } from "@/utils/engineInterpreter";
import { analyzePositionMotifs } from "@/utils/chessMotifs";
import { analyzeMateFromLine } from "@/utils/mateFilter";
import { identifyOpening } from "@/utils/openingNames";
import { analyzeTacticalMotifs } from "@/utils/tacticsMotifEngine";
import { extractPawnDna } from "@/utils/pawnStructureDna";
import { isTechnicalEndgame } from "@/utils/endgameDetector";
import { useChessTraining, type EngineMode, type EngineSource } from "@/context/useChessTraining";
import {
  calculateGameAccuracy,
  clampWhiteScoreCp,
  clearPgnStudioSession,
  detectSwings,
  endgameGoal,
  findEndgameStart,
  loadPgnStudioSession,
  parsePgnFile,
  sansToPgn,
  savePgnStudioSession,
  type EndgameGoal,
  type ParsedGame,
} from "@/utils/pgnStudio";
import {
  TACTICAL_MOTIFS,
  TACTICAL_TIERS,
  getAllVariations,
  saveTacticsPuzzles,
  saveVariationRecord,
  type PracticalEndgameTarget,
  type RepertoireSystem,
  type RepertoireVariation,
  type SavedVariation,
  type ScrapedGame,
  type TacticalMotif,
  type TacticalTierLevel,
  type TacticsPuzzleItem,
} from "@/services/repertoireStorage";

export const Route = createFileRoute("/pgn-studio")({
  head: () => ({
    meta: [
      { title: "PGN Studio — Chess Buddy" },
      {
        name: "description",
        content:
          "Upload your PGN games, analyse them with Stockfish and turn them into model games, opening lines, tactics and practical endgames.",
      },
      { property: "og:title", content: "PGN Studio — Chess Buddy" },
      {
        property: "og:description",
        content: "Turn your own games into opening lines, tactics puzzles and practical endgames.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PgnStudioPage,
});

/** General library record used when saving without a specific repertoire variation. */
const LIBRARY_ID = "pgn-studio-library";

type StoredBestMove = { pv: string[]; lan: string[] } | null;

function toScrapedGame(g: ParsedGame): ScrapedGame {
  const r = g.result;
  const op = identifyOpening(g.sans);
  return {
    id: g.id,
    white: { name: g.white, rating: Number(g.headers.WhiteElo) || 0 },
    black: { name: g.black, rating: Number(g.headers.BlackElo) || 0 },
    winner: r === "1-0" ? "white" : r === "0-1" ? "black" : "draw",
    year: Number((g.headers.Date || "").slice(0, 4)) || new Date().getFullYear(),
    opening: g.headers.Opening || op?.name,
    eco: g.headers.ECO || op?.eco,
    plyCount: g.sans.length,
    movesSan: g.sans,
    pgn: g.pgn,
    fenAtVariation: g.fens[0],
    plyAtVariation: 0,
  };
}

/**
 * Save a model game or practical endgame target into either a specific Repertoire
 * Variation (represented cleanly in SavedVariation store) or the general PGN Studio Library.
 */
async function saveToTargetVariationStorage(params: {
  targetSystem: RepertoireSystem | null;
  targetVariation: RepertoireVariation | null;
  mutate: (v: SavedVariation) => void;
}): Promise<SavedVariation> {
  const { targetSystem, targetVariation, mutate } = params;
  const targetId = targetVariation
    ? targetVariation.id
    : targetSystem
      ? `pgn-sys-${targetSystem.id}`
      : LIBRARY_ID;

  const all = await getAllVariations();
  const existing = all.find((v) => v.id === targetId);

  const firstLine = targetVariation?.lines?.[0];
  const record: SavedVariation = existing ?? {
    id: targetId,
    name: targetVariation
      ? `${targetSystem?.name ?? "Repertoire"} — ${targetVariation.name}`
      : targetSystem
        ? `${targetSystem.name} (PGN Imports)`
        : "PGN Studio Imports",
    eco: targetVariation?.eco || targetSystem?.ecoGroup || "",
    openingName: targetSystem?.name || "My Imported Games",
    finalFen: firstLine?.finalFen || new Chess().fen(),
    moves: firstLine?.moves || [],
    pgn: firstLine?.pgn || "",
    color: targetSystem?.color || "white",
    perspective: targetSystem?.color || "white",
    createdAt: new Date().toISOString(),
    gameCount: 0,
    games: [],
    endgames: [],
  };

  mutate(record);
  record.gameCount = record.games.length;
  await saveVariationRecord(record);
  return record;
}

/** Shared Repertoire System + Variation destination selector used across extractors. */
function RepertoireDestinationFields({
  systems,
  systemId,
  variationId,
  onSystemChange,
  onVariationChange,
  generalLabel = "General PGN Library (All Systems)",
  allVariationsLabel = "All Variations in System",
}: {
  systems: RepertoireSystem[];
  systemId: string;
  variationId: string;
  onSystemChange: (id: string) => void;
  onVariationChange: (id: string) => void;
  generalLabel?: string;
  allVariationsLabel?: string;
}) {
  const selectedSys = systems.find((s) => s.id === systemId) ?? null;
  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Repertoire System
        </label>
        <select
          className="w-full rounded-md border border-border bg-background p-2 text-xs"
          value={systemId}
          onChange={(e) => {
            onSystemChange(e.target.value);
            onVariationChange("");
          }}
        >
          <option value="general">{generalLabel}</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.color === "white" ? "White" : "Black"})
            </option>
          ))}
        </select>
      </div>

      {selectedSys && selectedSys.variations.length > 0 && (
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Variation
          </label>
          <select
            className="w-full rounded-md border border-border bg-background p-2 text-xs"
            value={variationId}
            onChange={(e) => onVariationChange(e.target.value)}
          >
            <option value="">{allVariationsLabel}</option>
            {selectedSys.variations.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.eco ? `(${v.eco})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function PgnStudioPage() {
  const {
    repertoireSystems,
    refreshRepertoireSystems,
    refreshVariations,
    setActiveVariation,
  } = useChessTraining();

  const [games, setGames] = useState<ParsedGame[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [ply, setPly] = useState(0);
  const [pasted, setPasted] = useState("");
  const [sessionHydrated, setSessionHydrated] = useState(false);

  // Per-game batch scan results persisted cleanly across switches
  const [evalsByGameId, setEvalsByGameId] = useState<Record<string, (number | null)[]>>({});
  const [bestMovesByGameId, setBestMovesByGameId] = useState<Record<string, StoredBestMove[]>>({});

  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [depth, setDepth] = useState(12);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  // Live Opening-Creator-style Stockfish state
  const [liveAnalysis, setLiveAnalysis] = useState<EngineAnalysisResult | null>(null);
  const [isLiveThinking, setIsLiveThinking] = useState(false);
  const [liveEngineMode, setLiveEngineMode] = useState<EngineMode>("quick");
  const [candidateLinesCount, setCandidateLinesCount] = useState<3 | 5>(5);
  const [liveEngineSource, setLiveEngineSource] = useState<EngineSource>("local");
  const [isInfinitePaused, setIsInfinitePaused] = useState(false);
  const [infiniteElapsedSeconds, setInfiniteElapsedSeconds] = useState(0);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [previewStep, setPreviewStep] = useState(0);
  const [showArrows, setShowArrows] = useState(true);

  const cancelRef = useRef(false);
  const analysingRef = useRef(false);
  const liveRunIdRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore saved session on mount (client-only to keep SSR hydration deterministic)
  useEffect(() => {
    const saved = loadPgnStudioSession();
    if (saved) {
      setGames(saved.games);
      setActiveIdx(Math.min(saved.activeIdx, Math.max(0, saved.games.length - 1)));
      setPly(saved.ply || 0);
      setEvalsByGameId(saved.evalsByGameId || {});
      setBestMovesByGameId(saved.bestMovesByGameId || {});
    }
    setSessionHydrated(true);
  }, []);

  // Persist session whenever uploaded games or evaluations change
  useEffect(() => {
    if (!sessionHydrated || games.length === 0) return;
    savePgnStudioSession({
      games,
      activeIdx,
      ply,
      evalsByGameId,
      bestMovesByGameId,
      updatedAt: new Date().toISOString(),
    });
  }, [sessionHydrated, games, activeIdx, ply, evalsByGameId, bestMovesByGameId]);

  // Cancel any in-flight scan when unmounting PGN Studio
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      analysingRef.current = false;
      liveRunIdRef.current++;
      stockfishEngine.stop();
    };
  }, []);

  const game = games[activeIdx] ?? null;
  const safePly = game ? Math.min(Math.max(0, ply), game.fens.length - 1) : 0;
  const fen = game ? game.fens[safePly] : new Chess().fen();
  const lastMove = game && safePly > 0 ? game.moves[safePly - 1] : null;

  const evals = game ? evalsByGameId[game.id] ?? [] : [];
  const bestMoves = game ? bestMovesByGameId[game.id] ?? [] : [];

  const loadText = (text: string) => {
    const parsed = parsePgnFile(text);
    if (parsed.length === 0) {
      toast.error("No valid games found in that PGN.");
      return;
    }
    cancelRef.current = true;
    analysingRef.current = false;
    setAnalysing(false);
    setIsAutoPlaying(false);
    setGames(parsed);
    setActiveIdx(0);
    setPly(0);
    setEvalsByGameId({});
    setBestMovesByGameId({});
    setLiveAnalysis(null);
    toast.success(`Loaded ${parsed.length} game${parsed.length > 1 ? "s" : ""}.`);
  };

  const handleClearSession = () => {
    cancelRef.current = true;
    analysingRef.current = false;
    stockfishEngine.stop();
    setAnalysing(false);
    setIsAutoPlaying(false);
    setGames([]);
    setActiveIdx(0);
    setPly(0);
    setEvalsByGameId({});
    setBestMovesByGameId({});
    setLiveAnalysis(null);
    clearPgnStudioSession();
    toast.info("Cleared PGN Studio workspace.");
  };

  // Clear preview & pause infinite timer reset whenever FEN changes
  useEffect(() => {
    setSelectedLineIndex(null);
    setPreviewStep(0);
    setIsInfinitePaused(false);
    setInfiniteElapsedSeconds(0);
  }, [fen]);

  // Stop auto-play during batch scan or when no game is loaded
  useEffect(() => {
    if (!game || analysing) {
      setIsAutoPlaying(false);
    }
  }, [game, analysing]);

  // Auto-play playback timer (advances 1 ply every 1.2s)
  useEffect(() => {
    if (!isAutoPlaying || !game) return;
    const timer = setInterval(() => {
      setPly((p) => {
        if (p >= game.sans.length) {
          setIsAutoPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [isAutoPlaying, game]);

  // Keyboard navigation (Left/Right/Home/End)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!game || tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        setIsAutoPlaying(false);
        setPly((p) => Math.max(0, p - 1));
      } else if (e.key === "ArrowRight") {
        setIsAutoPlaying(false);
        setPly((p) => Math.min(game.sans.length, p + 1));
      } else if (e.key === "Home") {
        setIsAutoPlaying(false);
        setPly(0);
      } else if (e.key === "End") {
        setIsAutoPlaying(false);
        setPly(game.sans.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  // Infinite elapsed timer
  useEffect(() => {
    if (liveEngineMode !== "infinite" || isInfinitePaused || !isLiveThinking) return;
    const timer = setInterval(() => setInfiniteElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [liveEngineMode, isInfinitePaused, isLiveThinking]);

  // Live Opening-Creator-style Stockfish evaluation on current board FEN
  const runLiveEvaluation = useCallback(
    async (targetFen: string, targetLastMove?: { from: string; to: string } | null) => {
      if (analysingRef.current) return;
      const runId = ++liveRunIdRef.current;
      setIsLiveThinking(true);

      const moveObj = targetLastMove ? { from: targetLastMove.from, to: targetLastMove.to } : undefined;
      const isStale = () => liveRunIdRef.current !== runId || analysingRef.current;

      try {
        // 1. Check cache first (instant 0ms)
        const cached = await getCachedEvaluation(targetFen);
        if (!isStale() && cached && cached.depth >= 15) {
          const cachedLines = cached.lines.slice(0, candidateLinesCount);
          const cachedResult: EngineAnalysisResult = {
            fen: targetFen,
            depth: cached.depth,
            lines: cachedLines,
            profile: evaluateTacticalProfile(cachedLines),
            motifs: analyzePositionMotifs(targetFen, cachedLines[0]?.pv || [], moveObj),
            mateAnalysis: analyzeMateFromLine(targetFen, cachedLines[0]),
            bestMoveSan: cached.bestMoveSan,
            evalWhite: cached.evalWhite,
          };
          setLiveAnalysis(cachedResult);
          setLiveEngineSource("cache");
          const targetDepth = liveEngineMode === "quick" ? 18 : liveEngineMode === "grandmaster" ? 35 : 50;
          if (liveEngineMode !== "infinite" && cached.depth >= targetDepth) {
            setIsLiveThinking(false);
            return;
          }
        }

        if (liveEngineMode === "super-gm") {
          const cloudRes = await fetchLichessCloudEval(targetFen, candidateLinesCount);
          if (!isStale() && cloudRes && cloudRes.lines.length > 0 && cloudRes.depth >= 40) {
            setLiveAnalysis(cloudRes);
            setLiveEngineSource("cloud");
            saveEvaluationToCache(cloudRes, "cloud");
            setIsLiveThinking(false);
            return;
          }
        }

        if (isStale()) return;

        if (liveEngineMode === "infinite") {
          setLiveEngineSource("infinite");
          await stockfishEngine.startInfinite(targetFen, {
            multiPv: candidateLinesCount,
            lastMove: moveObj,
            onProgress: (partial) => {
              if (isStale() || normalizeFen(partial.fen) !== normalizeFen(targetFen)) return;
              setLiveAnalysis(partial);
              setLiveEngineSource("infinite");
              if (partial.depth >= 16) saveEvaluationToCache(partial, "infinite");
            },
          });
          return;
        }

        const targetDepth = liveEngineMode === "quick" ? 18 : liveEngineMode === "grandmaster" ? 35 : 50;
        const movetime = liveEngineMode === "quick" ? 1200 : undefined;

        const res = await stockfishEngine.evaluate(targetFen, {
          depth: targetDepth,
          movetime,
          multiPv: candidateLinesCount,
          lastMove: moveObj,
          onProgress: (partial) => {
            if (isStale() || normalizeFen(partial.fen) !== normalizeFen(targetFen)) return;
            setLiveAnalysis(partial);
            setLiveEngineSource("local");
            if (partial.depth >= 16) saveEvaluationToCache(partial, "local");
          },
        });

        if (!isStale()) {
          setLiveAnalysis(res);
          setLiveEngineSource("local");
          setIsLiveThinking(false);
          if (res.depth >= 16) saveEvaluationToCache(res, "local");
        }
      } catch {
        if (!isStale()) setIsLiveThinking(false);
      }
    },
    [candidateLinesCount, liveEngineMode],
  );

  // Trigger live evaluation whenever game position changes (and not during auto-play/batch scan)
  useEffect(() => {
    if (!game || analysing) return;
    const lm = game && safePly > 0 ? game.moves[safePly - 1] : null;
    const timer = setTimeout(() => {
      runLiveEvaluation(fen, lm);
    }, isAutoPlaying ? 400 : 120);
    return () => clearTimeout(timer);
  }, [game, fen, safePly, analysing, isAutoPlaying, runLiveEvaluation]);

  const pauseLiveInfinite = () => {
    stockfishEngine.pause();
    setIsInfinitePaused(true);
    setIsLiveThinking(false);
  };

  const resumeLiveInfinite = () => {
    setIsInfinitePaused(false);
    setIsLiveThinking(true);
    stockfishEngine.resume(fen);
  };

  // Full-game batch scan
  const analyse = async (overrideDepth?: number) => {
    if (!game) return;
    const scanDepth = overrideDepth ?? depth;
    if (overrideDepth !== undefined) setDepth(overrideDepth);

    cancelRef.current = false;
    analysingRef.current = true;
    liveRunIdRef.current++;
    setIsAutoPlaying(false);
    setIsLiveThinking(false);
    setAnalysing(true);
    setProgress(0);

    await stockfishEngine.init();
    const targetGameId = game.id;
    const ev: (number | null)[] = new Array(game.fens.length).fill(null);
    const bm: StoredBestMove[] = new Array(game.fens.length).fill(null);

    for (let i = 0; i < game.fens.length; i++) {
      if (cancelRef.current) break;
      const f = game.fens[i];
      const c = new Chess(f);
      if (c.isCheckmate()) {
        ev[i] = c.turn() === "w" ? -10 : 10;
      } else if (c.isDraw() || c.isStalemate()) {
        ev[i] = 0;
      } else {
        try {
          const r = await stockfishEngine.evaluate(f, { depth: scanDepth, multiPv: 1 });
          const top = r.lines[0];
          if (top) {
            // top.score.scoreCp is ALREADY normalized to White's perspective by stockfishParser.ts
            ev[i] = clampWhiteScoreCp(top.score.scoreCp);
            bm[i] = { pv: top.sanPv ?? [], lan: top.pv ?? [] };
          }
        } catch {
          ev[i] = null;
        }
      }
      setEvalsByGameId((prev) => ({ ...prev, [targetGameId]: [...ev] }));
      setBestMovesByGameId((prev) => ({ ...prev, [targetGameId]: [...bm] }));
      setProgress(Math.round(((i + 1) / game.fens.length) * 100));
    }

    analysingRef.current = false;
    setAnalysing(false);
    if (!cancelRef.current) toast.success("Full-game Stockfish analysis complete.");
  };

  const swings = useMemo(() => (evals.length ? detectSwings(evals) : []), [evals]);
  const accuracySummary = useMemo(
    () => (evals.length ? calculateGameAccuracy(evals) : null),
    [evals],
  );
  const endgamePly = useMemo(() => (game ? findEndgameStart(game.fens) : null), [game]);

  // Multi-PV Engine Line Preview (identical UX to Opening Creator)
  const activeLine =
    selectedLineIndex !== null && liveAnalysis?.lines?.[selectedLineIndex]
      ? liveAnalysis.lines[selectedLineIndex]
      : null;

  const { previewFen, previewSanMoves } = useMemo(() => {
    if (!activeLine) return { previewFen: null, previewSanMoves: [] };
    try {
      const sim = new Chess(fen);
      const sans: string[] = [];
      for (const lan of activeLine.pv) {
        try {
          const res = sim.move({
            from: lan.slice(0, 2),
            to: lan.slice(2, 4),
            promotion: lan.length > 4 ? lan[4] : undefined,
          });
          if (!res) break;
          sans.push(res.san);
        } catch {
          break;
        }
      }

      let stepFen: string | null = null;
      if (previewStep > 0) {
        const stepSim = new Chess(fen);
        const steps = Math.min(previewStep, activeLine.pv.length);
        for (let i = 0; i < steps; i++) {
          const lan = activeLine.pv[i];
          stepSim.move({
            from: lan.slice(0, 2),
            to: lan.slice(2, 4),
            promotion: lan.length > 4 ? lan[4] : undefined,
          });
        }
        stepFen = stepSim.fen();
      }
      return {
        previewFen: stepFen,
        previewSanMoves: sans.length > 0 ? sans : activeLine.sanPv,
      };
    } catch {
      return { previewFen: null, previewSanMoves: activeLine.sanPv || [] };
    }
  }, [activeLine, fen, previewStep]);

  const boardArrows: BoardArrow[] = useMemo(() => {
    if (!showArrows) return [];

    if (activeLine && selectedLineIndex !== null) {
      const colorDef = ENGINE_ARROW_COLORS[selectedLineIndex] || ENGINE_ARROW_COLORS[0];
      const targetIdx = previewStep === 0 ? 0 : previewStep;
      if (targetIdx < activeLine.pv.length) {
        const lan = activeLine.pv[targetIdx];
        return [{ startSquare: lan.slice(0, 2), endSquare: lan.slice(2, 4), color: colorDef.rgb }];
      }
      return [];
    }

    if (liveAnalysis?.lines?.length) {
      return liveAnalysis.lines
        .slice(0, candidateLinesCount)
        .map((line, idx) => {
          const colorDef = ENGINE_ARROW_COLORS[idx] || ENGINE_ARROW_COLORS[0];
          const lan = line.pv[0];
          if (!lan || lan.length < 4) return null;
          return {
            startSquare: lan.slice(0, 2),
            endSquare: lan.slice(2, 4),
            color: colorDef.rgb,
          };
        })
        .filter((a): a is BoardArrow => a !== null);
    }

    const batchBest = bestMoves[safePly];
    if (batchBest?.lan?.[0]) {
      return [
        {
          startSquare: batchBest.lan[0].slice(0, 2),
          endSquare: batchBest.lan[0].slice(2, 4),
          color: ENGINE_ARROW_COLORS[0].rgb,
        },
      ];
    }
    return [];
  }, [showArrows, activeLine, selectedLineIndex, previewStep, liveAnalysis, candidateLinesCount, bestMoves, safePly]);

  const currentEvalWhite = liveAnalysis?.evalWhite ?? evals[safePly] ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <PageHeader
        eyebrow="Game Import & Extractor"
        title="PGN Studio"
        description="Upload your PGN games, inspect live Multi-PV Stockfish analysis, scan for blunders and convert key moments into repertoire lines, tactics puzzles, practical endgames and model games."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) loadText(await f.text());
                e.target.value = "";
              }}
            />
            {game && (
              <Button variant="outline" size="sm" onClick={handleClearSession}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear Workspace
              </Button>
            )}
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload PGN
            </Button>
          </div>
        }
      />

      {!game ? (
        <Panel title="Import a PGN Game or Database" icon={<Upload className="h-4 w-4" />}>
          <div
            className="mb-4 grid place-items-center rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground transition-colors hover:border-primary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) loadText(await f.text());
            }}
          >
            <Upload className="mb-2 h-8 w-8 text-primary" />
            <p className="font-medium text-foreground">
              Drag &amp; drop a .pgn file here (supports single or multi-game files)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your games and evaluations stay saved when switching between modules.
            </p>
          </div>
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="…or paste raw PGN text here (e.g. [Event &quot;...&quot;] 1. Nf3 d5 2. g3 ...)"
            className="min-h-40 font-mono text-xs"
          />
          <Button className="mt-3" disabled={!pasted.trim()} onClick={() => loadText(pasted)}>
            Load Pasted PGN
          </Button>
        </Panel>
      ) : (
        <TrainingLayout
          board={
            <div className="flex items-start gap-3">
              <EvaluationBar evalWhite={currentEvalWhite} isThinking={isLiveThinking || analysing} />
              <div className="flex-1 space-y-3">
                {activeLine && (
                  <EngineLineExplorer
                    line={activeLine}
                    rank={(selectedLineIndex ?? 0) + 1}
                    currentStep={previewStep}
                    totalSteps={activeLine.pv.length}
                    sanMoves={previewSanMoves}
                    onStepChange={setPreviewStep}
                    onPlayMove={() => {
                      if (safePly < game.sans.length && game.sans[safePly] === activeLine.bestMoveSan) {
                        setPly(safePly + 1);
                      }
                      setSelectedLineIndex(null);
                      setPreviewStep(0);
                    }}
                    onClose={() => {
                      setSelectedLineIndex(null);
                      setPreviewStep(0);
                    }}
                  />
                )}

                <ChessBoard
                  fen={previewFen || fen}
                  orientation={orientation}
                  lastMoveHighlight={previewFen ? null : lastMove}
                  arrows={boardArrows}
                />

                {/* Board Playback Bar */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-border bg-card p-2 shadow-sm">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsAutoPlaying(false);
                      setPly(0);
                    }}
                    disabled={safePly === 0}
                    aria-label="First move"
                    title="First move (Home)"
                  >
                    <ChevronFirst className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsAutoPlaying(false);
                      setPly((p) => Math.max(0, p - 1));
                    }}
                    disabled={safePly === 0}
                    aria-label="Previous move"
                    title="Previous move (Left Arrow)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={isAutoPlaying ? "default" : "outline"}
                    className="h-8 px-2.5 text-xs"
                    disabled={analysing || safePly >= game.sans.length}
                    onClick={() => setIsAutoPlaying((v) => !v)}
                    title="Auto-play moves"
                  >
                    {isAutoPlaying ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                    {isAutoPlaying ? "Pause" : "Auto"}
                  </Button>
                  <span className="min-w-[96px] text-center font-mono text-xs font-semibold">
                    {safePly === 0
                      ? "Start pos"
                      : `${Math.ceil(safePly / 2)}${safePly % 2 ? "." : "..."} ${game.sans[safePly - 1]}`}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsAutoPlaying(false);
                      setPly((p) => Math.min(game.sans.length, p + 1));
                    }}
                    disabled={safePly >= game.sans.length}
                    aria-label="Next move"
                    title="Next move (Right Arrow)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsAutoPlaying(false);
                      setPly(game.sans.length);
                    }}
                    disabled={safePly >= game.sans.length}
                    aria-label="Last move"
                    title="Last move (End)"
                  >
                    <ChevronLast className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
                  >
                    <FlipVertical2 className="mr-1 h-3.5 w-3.5" /> Flip
                  </Button>
                </div>

                {/* Clickable Evaluation Graph */}
                <EvalGraph
                  evals={evals}
                  ply={safePly}
                  onSelect={(p) => {
                    setIsAutoPlaying(false);
                    setPly(p);
                  }}
                  swings={swings.map((s) => s.ply)}
                />
              </div>
            </div>
          }
        >
          {/* Multi-game file switcher */}
          {games.length > 1 && (
            <Panel title={`Loaded Games (${games.length})`}>
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                {games.map((g, i) => {
                  const hasScan = Boolean(evalsByGameId[g.id]?.length);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        cancelRef.current = true;
                        analysingRef.current = false;
                        setAnalysing(false);
                        setIsAutoPlaying(false);
                        setActiveIdx(i);
                        setPly(0);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                        i === activeIdx && "bg-primary/15 font-semibold text-primary ring-1 ring-primary/30",
                      )}
                    >
                      <span className="truncate">
                        {i + 1}. {g.white} – {g.black}
                      </span>
                      <span className="ml-2 flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                        {hasScan && <span className="rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-400">Scanned</span>}
                        {g.result}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Full-Game Batch Scanner + Accuracy + Annotated Move List */}
          <Panel title={`${game.white} vs ${game.black}`} icon={<Cpu className="h-4 w-4 text-primary" />}>
            <p className="mb-3 text-xs text-muted-foreground">
              {[game.headers.Event, game.headers.Date, game.headers.ECO, game.result].filter(Boolean).join(" · ")}
            </p>

            {/* Quick preset scan buttons */}
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={depth === 12 ? "default" : "outline"}
                className="text-xs"
                disabled={analysing}
                onClick={() => analyse(12)}
              >
                Fast Scan (Depth 12)
              </Button>
              <Button
                size="sm"
                variant={depth >= 18 ? "default" : "outline"}
                className="text-xs"
                disabled={analysing}
                onClick={() => analyse(18)}
              >
                Deep Scan (Depth 18)
              </Button>
            </div>

            <div className="mb-3 flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Scan Depth</span>
              <Slider
                className="flex-1"
                min={8}
                max={22}
                step={1}
                value={[depth]}
                onValueChange={([d]) => setDepth(d)}
                disabled={analysing}
              />
              <span className="w-6 text-right font-mono font-semibold">{depth}</span>
            </div>

            {analysing ? (
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all duration-150" style={{ width: `${progress}%` }} />
                </div>
                <span className="w-9 font-mono text-xs text-muted-foreground">{progress}%</span>
                <Button size="sm" variant="outline" onClick={() => (cancelRef.current = true)}>
                  Stop
                </Button>
              </div>
            ) : (
              <Button className="w-full" variant="secondary" onClick={() => analyse()}>
                <Cpu className="mr-2 h-4 w-4" /> {evals.length ? "Re-scan Entire Game" : "Scan Full Game for Blunders"}
              </Button>
            )}

            {/* White & Black Accuracy Summary */}
            {accuracySummary && !analysing && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/40 p-2.5 text-xs">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    White Accuracy
                  </span>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-mono text-base font-bold text-foreground">
                      {accuracySummary.whiteAccuracy.toFixed(1)}%
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {accuracySummary.whiteBlunders}?? · {accuracySummary.whiteMistakes}?
                    </span>
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Black Accuracy
                  </span>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-mono text-base font-bold text-foreground">
                      {accuracySummary.blackAccuracy.toFixed(1)}%
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {accuracySummary.blackBlunders}?? · {accuracySummary.blackMistakes}?
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Clickable Annotated Move List */}
            <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-2 font-mono text-xs leading-7">
              {game.sans.map((s, i) => {
                const ann = accuracySummary?.moveAnnotations?.[i] ?? null;
                const plyIdx = i + 1;
                const moveEval = evals[plyIdx];
                return (
                  <span key={i}>
                    {i % 2 === 0 && <span className="mr-1 text-muted-foreground">{i / 2 + 1}.</span>}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAutoPlaying(false);
                        setPly(plyIdx);
                      }}
                      title={moveEval != null ? `Eval: ${moveEval > 0 ? "+" : ""}${moveEval.toFixed(2)}` : undefined}
                      className={cn(
                        "mr-1.5 rounded px-1 py-0.5 transition-colors hover:bg-muted",
                        safePly === plyIdx && "bg-primary font-bold text-primary-foreground",
                        safePly !== plyIdx && ann === "??" && "bg-destructive/15 text-destructive font-semibold",
                        safePly !== plyIdx && ann === "?" && "bg-amber-500/15 text-amber-400 font-semibold",
                        safePly !== plyIdx && ann === "?!" && "text-sky-400",
                      )}
                    >
                      {s}
                      {ann}
                    </button>
                  </span>
                );
              })}
            </div>
          </Panel>

          {/* 4 Conversion Extractors */}
          <Tabs defaultValue="opening">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="opening" className="gap-1 text-xs">
                <BookOpen className="h-3.5 w-3.5" /> Opening
              </TabsTrigger>
              <TabsTrigger value="tactics" className="gap-1 text-xs">
                <Puzzle className="h-3.5 w-3.5" /> Tactics
              </TabsTrigger>
              <TabsTrigger value="endgame" className="gap-1 text-xs">
                <Flame className="h-3.5 w-3.5" /> Endgame
              </TabsTrigger>
              <TabsTrigger value="model" className="gap-1 text-xs">
                <Star className="h-3.5 w-3.5" /> Model
              </TabsTrigger>
            </TabsList>
            <TabsContent value="opening">
              <OpeningExtractor
                game={game}
                ply={safePly}
                setPly={(p) => {
                  setIsAutoPlaying(false);
                  setPly(p);
                }}
              />
            </TabsContent>
            <TabsContent value="tactics">
              <TacticsExtractor
                game={game}
                ply={safePly}
                setPly={(p) => {
                  setIsAutoPlaying(false);
                  setPly(p);
                }}
                swings={swings}
                bestMoves={bestMoves}
                evals={evals}
                liveAnalysis={liveAnalysis}
                repertoireSystems={repertoireSystems}
              />
            </TabsContent>
            <TabsContent value="endgame">
              <EndgameExtractor
                game={game}
                ply={safePly}
                setPly={(p) => {
                  setIsAutoPlaying(false);
                  setPly(p);
                }}
                endgamePly={endgamePly}
                evals={evals}
                repertoireSystems={repertoireSystems}
                refreshVariations={refreshVariations}
                refreshRepertoireSystems={refreshRepertoireSystems}
                setActiveVariation={setActiveVariation}
              />
            </TabsContent>
            <TabsContent value="model">
              <ModelGameSaver
                game={game}
                repertoireSystems={repertoireSystems}
                refreshVariations={refreshVariations}
                refreshRepertoireSystems={refreshRepertoireSystems}
                setActiveVariation={setActiveVariation}
              />
            </TabsContent>
          </Tabs>

          {/* Live Opening-Creator-style Stockfish Analysis Panel */}
          <EngineAnalysisPanel
            analysis={liveAnalysis}
            isThinking={isLiveThinking}
            engineMode={liveEngineMode}
            onSelectMode={setLiveEngineMode}
            candidateLinesCount={candidateLinesCount}
            onSelectLinesCount={setCandidateLinesCount}
            engineSource={liveEngineSource}
            isInfinitePaused={isInfinitePaused}
            onPauseInfinite={pauseLiveInfinite}
            onResumeInfinite={resumeLiveInfinite}
            infiniteElapsedSeconds={infiniteElapsedSeconds}
            selectedLineIndex={selectedLineIndex}
            onSelectLine={(idx) => {
              if (selectedLineIndex === idx) {
                setSelectedLineIndex(null);
                setPreviewStep(0);
              } else {
                setSelectedLineIndex(idx);
                setPreviewStep(0);
              }
            }}
            showArrows={showArrows}
            onToggleArrows={() => setShowArrows((s) => !s)}
          />
        </TrainingLayout>
      )}
    </div>
  );
}

function EvalGraph({
  evals,
  ply,
  onSelect,
  swings,
}: {
  evals: (number | null)[];
  ply: number;
  onSelect: (p: number) => void;
  swings: number[];
}) {
  if (!evals.length) return null;
  const n = Math.max(1, evals.length - 1);
  const pts = evals.map((e, i) => `${(i / n) * 100},${50 - ((e ?? 0) / 10) * 50}`).join(" ");
  const curr = evals[ply];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>Evaluation Graph (click to jump)</span>
        <span>
          Current eval:{" "}
          <span className="font-bold text-foreground">
            {curr != null ? `${curr > 0 ? "+" : ""}${curr.toFixed(2)}` : "—"}
          </span>
        </span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-20 w-full cursor-pointer rounded-md border border-border bg-muted/60"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSelect(Math.round(((e.clientX - r.left) / r.width) * n));
        }}
      >
        <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border)" strokeWidth="0.6" />
        <polyline
          points={pts}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {swings.map((s) => (
          <circle
            key={s}
            cx={(s / n) * 100}
            cy={50 - ((evals[s] ?? 0) / 10) * 50}
            r="1.8"
            fill="var(--destructive)"
          />
        ))}
        <line
          x1={(ply / n) * 100}
          y1="0"
          x2={(ply / n) * 100}
          y2="100"
          stroke="var(--foreground)"
          strokeWidth="0.6"
        />
      </svg>
    </div>
  );
}

type NavProps = { game: ParsedGame; ply: number; setPly: (p: number) => void };

function OpeningExtractor({ game, ply, setPly }: NavProps) {
  const {
    repertoireSystems,
    addVariationToSystem,
    saveLineToVariation,
    refreshRepertoireSystems,
    refreshVariations,
  } = useChessTraining();

  const [color, setColor] = useState<"white" | "black">("white");
  const [systemId, setSystemId] = useState("");
  const [variationId, setVariationId] = useState("");
  const [newVar, setNewVar] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const maxPlies = Math.max(1, Math.min(game.sans.length, 60));
  const cutoff = Math.max(1, Math.min(ply || 1, maxPlies));
  const sans = game.sans.slice(0, cutoff);
  const op = identifyOpening(sans);
  const cutoffSan = game.sans[cutoff - 1] ?? "";
  const moveNumber = Math.ceil(cutoff / 2);
  const isWhiteCutoff = cutoff % 2 === 1;

  const filtered = repertoireSystems.filter((s) => s.color === color);
  const sys = filtered.find((s) => s.id === systemId) ?? filtered[0];
  const variation = sys?.variations.find((v) => v.id === variationId);

  const save = async () => {
    if (!sys) {
      toast.error("Create a repertoire system in Opening Creator first.");
      return;
    }
    setIsSaving(true);
    try {
      let vId = variation?.id;
      if (!vId) {
        const v = await addVariationToSystem(
          sys.id,
          newVar.trim() || op?.name || "Imported line",
          op?.eco || "",
        );
        vId = v.id;
      }
      const lineTitle = name.trim() || `${game.white} – ${game.black}, move ${moveNumber}`;
      const basePgn = sansToPgn(sans);
      const pgnWithNotes = notes.trim() ? `${basePgn} { ${notes.trim()} }` : basePgn;

      await saveLineToVariation(sys.id, vId, lineTitle, game.fens[cutoff], sans, pgnWithNotes);
      await refreshRepertoireSystems();
      await refreshVariations();
      toast.success(`Added "${lineTitle}" to ${sys.name}.`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel title="Create opening line" icon={<BookOpen className="h-4 w-4 text-primary" />}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Cutoff slider:</span>
        <span className="font-mono font-semibold text-primary">
          Stop at Move {moveNumber} ({isWhiteCutoff ? "White" : "Black"}): {moveNumber}
          {isWhiteCutoff ? "." : "..."} {cutoffSan} — {cutoff} {cutoff === 1 ? "ply" : "plies"}
        </span>
      </div>
      <Slider
        min={1}
        max={maxPlies}
        step={1}
        value={[cutoff]}
        onValueChange={([v]) => setPly(v)}
      />
      <p className="mt-2 max-h-20 overflow-y-auto rounded bg-secondary/40 p-2 font-mono text-[11px]">
        {sansToPgn(sans)}
      </p>
      {op?.name && (
        <p className="mt-1.5 text-xs font-medium text-primary">
          Detected: {op.eco ? `${op.eco} · ` : ""}{op.name}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["white", "black"] as const).map((c) => (
          <Button
            key={c}
            variant={color === c ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setColor(c);
              setSystemId("");
              setVariationId("");
            }}
          >
            {c === "white" ? "White repertoire" : "Black repertoire"}
          </Button>
        ))}
      </div>
      <select
        className="mt-3 w-full rounded-md border border-border bg-background p-2 text-xs"
        value={sys?.id ?? ""}
        onChange={(e) => {
          setSystemId(e.target.value);
          setVariationId("");
        }}
      >
        {filtered.length === 0 && <option value="">No systems for this colour</option>}
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        className="mt-2 w-full rounded-md border border-border bg-background p-2 text-xs"
        value={variationId}
        onChange={(e) => setVariationId(e.target.value)}
      >
        <option value="">+ New variation</option>
        {sys?.variations.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} {v.eco ? `(${v.eco})` : ""}
          </option>
        ))}
      </select>
      {!variation && (
        <Input
          className="mt-2 h-8 text-xs"
          placeholder={op?.name || "New variation name"}
          value={newVar}
          onChange={(e) => setNewVar(e.target.value)}
        />
      )}
      <Input
        className="mt-2 h-8 text-xs"
        placeholder="Line name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className="mt-2 h-8 text-xs"
        placeholder="Study notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Button className="mt-3 w-full" disabled={isSaving || !sys} onClick={save}>
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save to Repertoire
      </Button>
    </Panel>
  );
}

function TacticsExtractor({
  game,
  ply,
  setPly,
  swings,
  bestMoves,
  evals,
  liveAnalysis,
  repertoireSystems,
}: NavProps & {
  swings: ReturnType<typeof detectSwings>;
  bestMoves: StoredBestMove[];
  evals: (number | null)[];
  liveAnalysis: EngineAnalysisResult | null;
  repertoireSystems: RepertoireSystem[];
}) {
  const [tierLevel, setTierLevel] = useState<TacticalTierLevel>(1);
  const [selectedMotif, setSelectedMotif] = useState<TacticalMotif>("Fork / Double Attack");
  const [motifWasAutoDetected, setMotifWasAutoDetected] = useState(false);
  const [targetSystemId, setTargetSystemId] = useState<string>("general");
  const [targetVariationId, setTargetVariationId] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);

  const selectedSys = repertoireSystems.find((s) => s.id === targetSystemId) ?? null;
  const selectedVar = selectedSys?.variations.find((v) => v.id === targetVariationId) ?? null;
  const currentTurn: "white" | "black" =
    game.fens[ply]?.split(" ")[1] === "b" ? "black" : "white";

  // Auto-detect tactical motif for current ply whenever best moves / live analysis update
  useEffect(() => {
    const posFen = game.fens[ply];
    const batchBm = bestMoves[ply];
    const pv =
      batchBm?.pv && batchBm.pv.length > 0
        ? batchBm.pv
        : liveAnalysis && normalizeFen(liveAnalysis.fen) === normalizeFen(posFen)
          ? liveAnalysis.lines[0]?.sanPv ?? []
          : [];

    if (!posFen || pv.length === 0) {
      setMotifWasAutoDetected(false);
      return;
    }

    const detected = analyzeTacticalMotifs(posFen, pv);
    if (detected && !detected.isCheckmate) {
      setSelectedMotif(detected.primaryMotif);
      setMotifWasAutoDetected(true);
    } else {
      setMotifWasAutoDetected(false);
    }
  }, [game, ply, bestMoves, liveAnalysis]);

  const computeRatingForTier = (lvl: TacticalTierLevel): number => {
    const def = TACTICAL_TIERS[lvl];
    if (lvl === 1) return 800;
    if (lvl === 9) return 2550;
    return Math.round((def.minRating + def.maxRating) / 2);
  };

  const buildPuzzle = (
    p: number,
    pvSan: string[],
    pvLan: string[],
    overrideMotif: TacticalMotif,
    autoDetectMotifPerPosition: boolean,
  ): TacticsPuzzleItem | null => {
    if (pvSan.length === 0) return null;
    const posFen = game.fens[p];
    const turn: "white" | "black" = posFen.split(" ")[1] === "b" ? "black" : "white";

    // Strict odd solution length <= pvSan.length so solver always makes the final move
    const maxLen = Math.min(pvSan.length, 5);
    const len = maxLen % 2 === 1 ? maxLen : Math.max(1, maxLen - 1);
    const sliceSan = pvSan.slice(0, len);
    const sliceLan = pvLan.slice(0, len);

    const detected = analyzeTacticalMotifs(posFen, sliceSan);
    const finalMotif =
      autoDetectMotifPerPosition && detected && !detected.isCheckmate
        ? detected.primaryMotif
        : overrideMotif;

    const tierDef = TACTICAL_TIERS[tierLevel];
    const swing = swings.find((s) => s.ply === p)?.swing;

    return {
      id: `pgn-tactic-${game.id}-${p}-L${tierLevel}`,
      fen: posFen,
      initialTurn: turn,
      solutionPv: sliceSan,
      solutionLanPv: sliceLan,
      primaryMotif: finalMotif,
      secondaryMotifs: detected?.secondaryMotifs ?? [],
      tierLevel,
      tierName: tierDef.name,
      rating: computeRatingForTier(tierLevel),
      moveLength: Math.ceil(len / 2),
      sourceGameId: game.id,
      players: `${game.white} vs ${game.black}`,
      repertoireSystemId: selectedSys ? selectedSys.id : "general",
      repertoireVariationId: selectedVar?.id,
      openingVariationId: selectedVar?.id,
      openingName: selectedSys ? selectedSys.name : undefined,
      variationName: selectedVar ? selectedVar.name : undefined,
      explanation: swing
        ? `From ${game.white} vs ${game.black}: the previous move dropped ${swing.toFixed(1)} pawns (${finalMotif}). Find the punishment.`
        : detected?.explanation && !detected.isCheckmate
          ? detected.explanation
          : `From ${game.white} vs ${game.black} (${finalMotif}). Find the best continuation.`,
      isCheckmate: false,
    };
  };

  const saveSwingsBatch = async () => {
    const items = swings
      .map((s) => {
        const bm = bestMoves[s.ply];
        if (!bm || bm.pv.length === 0) return null;
        return buildPuzzle(s.ply, bm.pv, bm.lan, selectedMotif, true);
      })
      .filter((x): x is TacticsPuzzleItem => x !== null);

    if (!items.length) {
      toast.error("Scan the game first so Stockfish can compute punishment lines for the swings.");
      return;
    }

    await saveTacticsPuzzles(items);
    toast.success(`Saved ${items.length} Level ${tierLevel} puzzle${items.length > 1 ? "s" : ""} to Tactics Training.`, {
      description: selectedSys
        ? `Filed under ${selectedSys.name}${selectedVar ? ` → ${selectedVar.name}` : ""}.`
        : "Filed under General / All Repertoires.",
    });
  };

  const saveCurrentPosition = async () => {
    const posFen = game.fens[ply];
    try {
      const check = new Chess(posFen);
      if (check.isGameOver()) {
        toast.error("The game is already over at this move — step back to a playable position.");
        return;
      }
    } catch {
      toast.error("Invalid board position.");
      return;
    }

    setIsExporting(true);
    try {
      let pvSan: string[] = bestMoves[ply]?.pv ?? [];
      let pvLan: string[] = bestMoves[ply]?.lan ?? [];

      if (
        pvSan.length === 0 &&
        liveAnalysis &&
        normalizeFen(liveAnalysis.fen) === normalizeFen(posFen) &&
        liveAnalysis.lines[0]?.sanPv?.length
      ) {
        pvSan = liveAnalysis.lines[0].sanPv;
        pvLan = liveAnalysis.lines[0].pv;
      }

      // On-the-fly evaluation if no cached/scanned solution exists yet
      if (pvSan.length === 0) {
        await stockfishEngine.init();
        const res = await stockfishEngine.evaluate(posFen, { depth: 16, multiPv: 1 });
        const top = res.lines[0];
        if (top) {
          pvSan = top.sanPv ?? [];
          pvLan = top.pv ?? [];
        }
      }

      const item = buildPuzzle(ply, pvSan, pvLan, selectedMotif, false);
      if (!item) {
        toast.error("Stockfish could not find a candidate continuation at this position.");
        return;
      }

      await saveTacticsPuzzles([item]);
      toast.success(`Saved Level ${tierLevel} "${selectedMotif}" puzzle!`, {
        description: selectedSys
          ? `Filed under ${selectedSys.name}${selectedVar ? ` → ${selectedVar.name}` : ""} (${item.initialTurn} to move).`
          : `Filed under General Tactics (${item.initialTurn} to move).`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to evaluate and save puzzle.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Panel title="Create tactics puzzles" icon={<Puzzle className="h-4 w-4 text-primary" />}>
      {/* Solver turn & difficulty & destination pickers */}
      <div className="mb-3 space-y-2.5 rounded-lg border border-border bg-secondary/30 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-muted-foreground">Side to Solve (Move {Math.ceil(ply / 2) || 1}):</span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold",
              currentTurn === "white"
                ? "border-stone-300 bg-stone-100 text-stone-900"
                : "border-stone-700 bg-stone-900 text-stone-100",
            )}
          >
            {currentTurn === "white" ? "⚪ White to move" : "⚫ Black to move"}
          </span>
        </div>

        {/* Tier Level Selector (1-9) */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Difficulty Level
          </label>
          <select
            className="w-full rounded-md border border-border bg-background p-2 text-xs"
            value={tierLevel}
            onChange={(e) => setTierLevel(Number(e.target.value) as TacticalTierLevel)}
          >
            {(Object.keys(TACTICAL_TIERS) as unknown as TacticalTierLevel[]).map((lvl) => {
              const def = TACTICAL_TIERS[lvl];
              return (
                <option key={lvl} value={lvl}>
                  Level {def.level} — {def.name} ({def.description})
                </option>
              );
            })}
          </select>
        </div>

        {/* Tactical Motif Selector */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tactical Motif
            </label>
            {motifWasAutoDetected && (
              <span className="text-[10px] font-medium text-primary">Auto-detected</span>
            )}
          </div>
          <select
            className="w-full rounded-md border border-border bg-background p-2 text-xs"
            value={selectedMotif}
            onChange={(e) => {
              setSelectedMotif(e.target.value as TacticalMotif);
              setMotifWasAutoDetected(false);
            }}
          >
            {TACTICAL_MOTIFS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Destination System & Variation */}
        <RepertoireDestinationFields
          systems={repertoireSystems}
          systemId={targetSystemId}
          variationId={targetVariationId}
          onSystemChange={setTargetSystemId}
          onVariationChange={setTargetVariationId}
          generalLabel="All Systems (General Tactics)"
        />

        {selectedSys && selectedSys.color !== currentTurn && (
          <p className="text-[11px] text-amber-400">
            Note: This position is <strong>{currentTurn} to move</strong> while {selectedSys.name} trains as{" "}
            <strong>{selectedSys.color}</strong> — switch perspective in Tactics Training to view it.
          </p>
        )}
      </div>

      {/* Auto-detected swing list */}
      {!evals.length ? (
        <p className="text-xs text-muted-foreground">
          Run the Stockfish scan above to auto-detect tactical blunders/swings, or turn the current position into a puzzle directly below.
        </p>
      ) : swings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No major tactical swings (1.5+ pawns) detected in this game.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detected Blunder / Tactical Moments ({swings.length})
          </p>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {swings.map((s) => (
              <button
                key={s.ply}
                type="button"
                onClick={() => setPly(s.ply)}
                className={cn(
                  "flex w-full justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  ply === s.ply && "bg-primary/15 font-semibold text-primary ring-1 ring-primary/30",
                )}
              >
                <span>
                  After {Math.ceil(s.ply / 2)}
                  {s.ply % 2 ? "." : "..."} {game.sans[s.ply - 1]} — {s.side} to punish
                </span>
                <span className="font-mono text-destructive">−{s.swing.toFixed(1)}</span>
              </button>
            ))}
          </div>
          <Button className="mt-2 w-full" size="sm" onClick={saveSwingsBatch}>
            Save All {swings.length} Swings (Level {tierLevel})
          </Button>
        </div>
      )}

      <Button
        variant="outline"
        className="mt-3 w-full"
        disabled={isExporting}
        onClick={saveCurrentPosition}
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Evaluating &amp; Saving...
          </>
        ) : (
          `Turn Current Position into Level ${tierLevel} Puzzle`
        )}
      </Button>
    </Panel>
  );
}

function EndgameExtractor({
  game,
  ply,
  setPly,
  endgamePly,
  evals,
  repertoireSystems,
  refreshVariations,
  refreshRepertoireSystems,
  setActiveVariation,
}: NavProps & {
  endgamePly: number | null;
  evals: (number | null)[];
  repertoireSystems: RepertoireSystem[];
  refreshVariations: () => Promise<void>;
  refreshRepertoireSystems: () => Promise<void>;
  setActiveVariation: (v: SavedVariation | null) => void;
}) {
  const navigate = useNavigate();
  const [side, setSide] = useState<"white" | "black">("white");
  const [targetSystemId, setTargetSystemId] = useState<string>("general");
  const [targetVariationId, setTargetVariationId] = useState<string>("");

  const currentInEndgame = useMemo(() => {
    const res = isTechnicalEndgame(game.fens[ply]);
    return res.isEndgame && res.conditionMet !== "checkmate" && res.conditionMet !== "stalemate";
  }, [game.fens, ply]);

  const target = currentInEndgame ? ply : endgamePly ?? ply;
  const targetFen = game.fens[target];
  const ev = evals[target];
  const suggestedGoal = endgameGoal(
    ev ?? (game.result === "1-0" ? 2 : game.result === "0-1" ? -2 : 0),
    side,
  );
  const [goalOverride, setGoalOverride] = useState<EndgameGoal | null>(null);
  const activeGoal = goalOverride ?? suggestedGoal;

  const pawnDna = useMemo(() => extractPawnDna(targetFen), [targetFen]);
  const selectedSys = repertoireSystems.find((s) => s.id === targetSystemId) ?? null;
  const selectedVar = selectedSys?.variations.find((v) => v.id === targetVariationId) ?? null;

  const saveEndgame = async (andOpenLab = false) => {
    // Endgame Lab plays the side to move, so align to the requested training side when possible
    let p = target;
    const turnAt = (i: number) => (game.fens[i].split(" ")[1] === "b" ? "black" : "white");
    if (turnAt(p) !== side && p + 1 < game.fens.length) p += 1;

    const eg: PracticalEndgameTarget = {
      id: `pgn-eg-${game.id}-${p}-${side}`,
      gameId: game.id,
      players: `${game.white} vs ${game.black}`,
      fen: game.fens[p],
      target: activeGoal,
      moveNumber: Math.ceil(p / 2) || 1,
      sourceGameResult: game.result,
      pawnDnaMatchPct: 92,
      structureName: pawnDna.structureName,
    };

    const updatedRecord = await saveToTargetVariationStorage({
      targetSystem: selectedSys,
      targetVariation: selectedVar,
      mutate: (lib) => {
        lib.endgames = [...lib.endgames.filter((e) => e.id !== eg.id), eg];
      },
    });

    await refreshVariations();
    await refreshRepertoireSystems();
    toast.success("Practical endgame saved to Endgame Laboratory!");

    if (andOpenLab) {
      setActiveVariation(updatedRecord);
      navigate({ to: "/endgame" });
    }
  };

  return (
    <Panel title="Practical endgame" icon={<Flame className="h-4 w-4 text-primary" />}>
      {endgamePly != null ? (
        <p className="text-xs text-foreground">
          Technical endgame reached at move {Math.ceil(endgamePly / 2)}.{" "}
          <button
            type="button"
            className="font-semibold text-primary underline"
            onClick={() => setPly(endgamePly)}
          >
            Jump to move {Math.ceil(endgamePly / 2)}
          </button>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No automatic endgame transition detected — using your current board position (Move{" "}
          {Math.ceil(target / 2) || 1}).
        </p>
      )}

      <div className="mt-2 rounded bg-secondary/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        Pawn Structure DNA: <span className="font-semibold text-foreground">{pawnDna.structureName}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["white", "black"] as const).map((c) => (
          <Button
            key={c}
            size="sm"
            variant={side === c ? "default" : "outline"}
            onClick={() => {
              setSide(c);
              setGoalOverride(null);
            }}
          >
            Play as {c}
          </Button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Training Goal
          </label>
          <select
            className="w-full rounded-md border border-border bg-background p-2 text-xs"
            value={activeGoal}
            onChange={(e) => setGoalOverride(e.target.value as EndgameGoal)}
          >
            <option value="Convert the Win">Convert the Win</option>
            <option value="Hold the Draw">Hold the Draw</option>
            <option value="Defend and Hold">Defend and Hold</option>
            <option value="Force a Draw">Force a Draw</option>
          </select>
        </div>

        <RepertoireDestinationFields
          systems={repertoireSystems}
          systemId={targetSystemId}
          variationId={targetVariationId}
          onSystemChange={setTargetSystemId}
          onVariationChange={setTargetVariationId}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => saveEndgame(false)}>
          Save Endgame
        </Button>
        <Button onClick={() => saveEndgame(true)}>Save &amp; Open Lab</Button>
      </div>
    </Panel>
  );
}

function ModelGameSaver({
  game,
  repertoireSystems,
  refreshVariations,
  refreshRepertoireSystems,
  setActiveVariation,
}: {
  game: ParsedGame;
  repertoireSystems: RepertoireSystem[];
  refreshVariations: () => Promise<void>;
  refreshRepertoireSystems: () => Promise<void>;
  setActiveVariation: (v: SavedVariation | null) => void;
}) {
  const navigate = useNavigate();
  const [targetSystemId, setTargetSystemId] = useState<string>("general");
  const [targetVariationId, setTargetVariationId] = useState<string>("");

  const op = useMemo(() => identifyOpening(game.sans), [game.sans]);
  const selectedSys = repertoireSystems.find((s) => s.id === targetSystemId) ?? null;
  const selectedVar = selectedSys?.variations.find((v) => v.id === targetVariationId) ?? null;

  const saveModelGame = async (andTrain = false) => {
    const scraped = toScrapedGame(game);
    const updatedRecord = await saveToTargetVariationStorage({
      targetSystem: selectedSys,
      targetVariation: selectedVar,
      mutate: (lib) => {
        lib.games = [...lib.games.filter((g) => g.id !== scraped.id), scraped];
      },
    });

    await refreshVariations();
    await refreshRepertoireSystems();
    toast.success("Model game saved — ready in Guess the Move!");

    if (andTrain) {
      setActiveVariation(updatedRecord);
      navigate({ to: "/middlegame/guess-the-move" });
    }
  };

  return (
    <Panel title="Model game" icon={<Star className="h-4 w-4 text-primary" />}>
      <div className="mb-3 space-y-1 rounded-lg border border-border bg-secondary/30 p-2.5 text-xs">
        <div className="font-semibold text-foreground">
          {game.white} ({game.headers.WhiteElo || "?"}) vs {game.black} ({game.headers.BlackElo || "?"})
        </div>
        <div className="text-[11px] text-muted-foreground">
          {game.headers.Event || "Imported Game"} · {game.sans.length} plies · {game.result}
        </div>
        {(game.headers.Opening || op?.name) && (
          <div className="text-[11px] font-medium text-primary">
            {game.headers.ECO || op?.eco ? `${game.headers.ECO || op?.eco} · ` : ""}
            {game.headers.Opening || op?.name}
          </div>
        )}
      </div>

      <RepertoireDestinationFields
        systems={repertoireSystems}
        systemId={targetSystemId}
        variationId={targetVariationId}
        onSystemChange={setTargetSystemId}
        onVariationChange={setTargetVariationId}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => saveModelGame(false)}>
          Save Model Game
        </Button>
        <Button onClick={() => saveModelGame(true)}>Save &amp; Train Move</Button>
      </div>
    </Panel>
  );
}
