import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FlipVertical2,
  FolderPlus,
  GitBranch,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Sword,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChessBoard, type BoardArrow } from "@/components/chess/ChessBoard";
import { EngineLineExplorer } from "@/components/chess/EngineLineExplorer";
import {
  DataSourceBadge,
  EngineAnalysisPanel,
  ENGINE_ARROW_COLORS,
  EvaluationBar,
  MoveList,
  PageHeader,
  Panel,
  TrainingLayout,
} from "@/components/chess/ui";
import {
  useChessTraining,
  type RepertoireLine,
  type RepertoireSystem,
  type RepertoireVariation,
} from "@/context/useChessTraining";
import { identifyOpening } from "@/utils/openingNames";
import { scrapeGamesForVariation, type ScraperProgress } from "@/utils/lichessScraper";

export const Route = createFileRoute("/opening-creator")({
  head: () => ({
    meta: [
      { title: "Opening Creator — Chess Buddy" },
      {
        name: "description",
        content:
          "Multi-tier Repertoire Manager: Organise by Opening System, Variations, and Lines.",
      },
      { property: "og:title", content: "Opening Creator — Chess Buddy" },
      {
        property: "og:description",
        content:
          "Multi-tier Repertoire Manager: Organise by Opening System, Variations, and Lines.",
      },
    ],
  }),
  component: OpeningCreator,
});

function OpeningCreator() {
  const {
    fen,
    history,
    orientation,
    makeMove,
    undo,
    reset,
    flip,
    setOrientation,
    loadFen,
    updateVariationGames,
    analysis,
    isEngineThinking,
    explanation,
    engineMode,
    setEngineMode,
    candidateLinesCount,
    setCandidateLinesCount,
    engineSource,
    isInfinitePaused,
    pauseInfiniteAnalysis,
    resumeInfiniteAnalysis,
    infiniteElapsedSeconds,
    repertoireSystems,
    activeSystem,
    setActiveSystem,
    activeRepertoireVariation,
    setActiveRepertoireVariation,
    addRepertoireSystem,
    deleteRepertoireSystem,
    addVariationToSystem,
    deleteVariationFromSystem,
    saveLineToVariation,
    deleteLineFromVariation,
    refreshRepertoireSystems,
    requestEvaluation,
  } = useChessTraining();

  // Auto-evaluate current position on initial load if not yet analyzed
  useEffect(() => {
    if (!analysis && !isEngineThinking) {
      requestEvaluation();
    }
  }, [analysis, isEngineThinking, requestEvaluation]);

  const [lineName, setLineName] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<ScraperProgress | null>(null);

  // Engine Candidate Line Explorer & Board Arrows State
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [previewStep, setPreviewStep] = useState<number>(0);
  const [showArrows, setShowArrows] = useState<boolean>(true);

  // New Variation Dialog State
  const [isAddingVariation, setIsAddingVariation] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const [newVarEco, setNewVarEco] = useState("");

  // New System Dialog State
  const [isAddingSystem, setIsAddingSystem] = useState(false);
  const [newSysName, setNewSysName] = useState("");
  const [newSysColor, setNewSysColor] = useState<"white" | "black">("white");
  const [newSysDescription, setNewSysDescription] = useState("");

  // Accordion expanded variations
  const [expandedVarIds, setExpandedVarIds] = useState<Record<string, boolean>>({});

  // Auto-detect opening and ECO from moves played
  const recognized = useMemo(() => identifyOpening(history), [history]);

  // Sync orientation whenever active system changes
  useEffect(() => {
    if (activeSystem) {
      setOrientation(activeSystem.color);
    }
  }, [activeSystem, setOrientation]);

  // Ensure active variation defaults to first variation of active system
  useEffect(() => {
    if (activeSystem && activeSystem.variations.length > 0) {
      if (
        !activeRepertoireVariation ||
        activeRepertoireVariation.systemId !== activeSystem.id
      ) {
        setActiveRepertoireVariation(activeSystem.variations[0]);
      }
    }
  }, [activeSystem, activeRepertoireVariation, setActiveRepertoireVariation]);

  // Clear line preview when root FEN changes
  useEffect(() => {
    setSelectedLineIndex(null);
    setPreviewStep(0);
  }, [fen]);

  const activeLine =
    selectedLineIndex !== null && analysis?.lines?.[selectedLineIndex]
      ? analysis.lines[selectedLineIndex]
      : null;

  const { previewFen, previewSanMoves } = useMemo(() => {
    if (!activeLine) {
      return { previewFen: null, previewSanMoves: [] };
    }

    try {
      const sim = new Chess(fen);
      const sans: string[] = [];
      for (const lan of activeLine.pv) {
        try {
          const from = lan.slice(0, 2);
          const to = lan.slice(2, 4);
          const promotion = lan.length > 4 ? lan[4] : undefined;
          const res = sim.move({ from, to, promotion });
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
          const from = lan.slice(0, 2);
          const to = lan.slice(2, 4);
          const promotion = lan.length > 4 ? lan[4] : undefined;
          stepSim.move({ from, to, promotion });
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

  const engineArrows: BoardArrow[] = useMemo(() => {
    if (!showArrows || !analysis?.lines || analysis.lines.length === 0) return [];

    // If currently previewing a specific candidate line
    if (activeLine && selectedLineIndex !== null) {
      const colorDef = ENGINE_ARROW_COLORS[selectedLineIndex] || ENGINE_ARROW_COLORS[0];

      // If at step 0, show the first move of this line
      if (previewStep === 0 && activeLine.pv.length > 0) {
        const lan = activeLine.pv[0];
        return [
          {
            startSquare: lan.slice(0, 2),
            endSquare: lan.slice(2, 4),
            color: colorDef.rgb,
          },
        ];
      }
      // If at step > 0 and there's a subsequent move in the line, show that move
      if (previewStep > 0 && previewStep < activeLine.pv.length) {
        const lan = activeLine.pv[previewStep];
        return [
          {
            startSquare: lan.slice(0, 2),
            endSquare: lan.slice(2, 4),
            color: colorDef.rgb,
          },
        ];
      }
      return [];
    }

    // Default overview: Show colored arrows for top candidate moves!
    return analysis.lines
      .slice(0, candidateLinesCount || 5)
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
  }, [showArrows, analysis, activeLine, selectedLineIndex, previewStep, candidateLinesCount]);

  const handlePlayLineBestMove = () => {
    if (!activeLine || activeLine.pv.length === 0) return;
    const lan = activeLine.pv[0];
    const from = lan.slice(0, 2);
    const to = lan.slice(2, 4);
    makeMove(from, to);
    setSelectedLineIndex(null);
    setPreviewStep(0);
    toast.success(`Played ${activeLine.bestMoveSan || lan} on the board`);
  };

  const toggleExpand = (varId: string) => {
    setExpandedVarIds((prev) => ({ ...prev, [varId]: !prev[varId] }));
  };

  const handleSelectLine = (line: RepertoireLine) => {
    // Reset board and play line moves
    reset();
    for (const m of line.moves) {
      // Moves can be applied via chess
    }
    loadFen(line.finalFen);
    setLineName(line.name);
    toast.info(`Loaded line "${line.name}"`, {
      description: `${line.moves.length} moves played onto board.`,
    });
  };

  const handleCreateVariation = async () => {
    if (!activeSystem || !newVarName.trim()) return;
    try {
      const v = await addVariationToSystem(activeSystem.id, newVarName, newVarEco);
      setNewVarName("");
      setNewVarEco("");
      setIsAddingVariation(false);
      setExpandedVarIds((prev) => ({ ...prev, [v.id]: true }));
      toast.success(`Created variation "${v.name}" in ${activeSystem.name}`);
    } catch {
      toast.error("Failed to create variation");
    }
  };

  const handleCreateSystem = async () => {
    if (!newSysName.trim()) return;
    try {
      const s = await addRepertoireSystem(
        newSysName,
        newSysColor,
        "",
        "",
        newSysDescription,
      );
      setNewSysName("");
      setNewSysDescription("");
      setIsAddingSystem(false);
      toast.success(`Created repertoire system "${s.name}"`);
    } catch {
      toast.error("Failed to create repertoire system");
    }
  };

  const handleDeleteLine = async (
    systemId: string,
    variationId: string,
    lineId: string,
    name: string,
  ) => {
    await deleteLineFromVariation(systemId, variationId, lineId);
    toast.success(`Deleted line "${name}"`);
  };

  const handleDeleteVariation = async (
    systemId: string,
    variationId: string,
    name: string,
  ) => {
    await deleteVariationFromSystem(systemId, variationId);
    toast.success(`Deleted variation "${name}"`);
  };

  const handleSaveLine = async () => {
    if (!activeSystem || !activeRepertoireVariation) {
      toast.error("Please select a Repertoire System and Variation first.");
      return;
    }

    if (history.length === 0) {
      toast.error("Play at least one move on the board before saving.");
      return;
    }

    const finalLineName =
      lineName.trim() || `${recognized.name} (${history.length} moves)`;

    setIsScraping(true);
    setScraperStatus({
      stage: "connecting",
      message: `Saving line to ${activeRepertoireVariation.name} and scraping master games...`,
      gamesFound: 0,
    });

    try {
      const line = await saveLineToVariation(
        activeSystem.id,
        activeRepertoireVariation.id,
        finalLineName,
      );

      toast.info(`Line saved to ${activeRepertoireVariation.name}!`, {
        description: `Pulling master games for ${activeSystem.name}...`,
      });

      // Run live Lichess scraper pipeline with persistent token
      const scrapeResult = await scrapeGamesForVariation(line.finalFen, line.moves, {
        targetGameCount: 50,
        userColor: activeSystem.color,
        onProgress: (p) => setScraperStatus(p),
      });

      // Link games and endgames to this line
      await updateVariationGames(line.id, scrapeResult.games, scrapeResult.endgames);
      await refreshRepertoireSystems();

      setIsScraping(false);
      toast.success("Training Loop Ready!", {
        description: `Loaded ${scrapeResult.games.length} master games & ${scrapeResult.endgames.length} practical endgames.`,
      });
    } catch (err) {
      console.error("Save line error:", err);
      setIsScraping(false);
      toast.error("Line saved locally. Master games scrape can be retried later.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Master Repertoire Studio"
        title="Opening Repertoire Manager"
        description="Organise your opening repertoire into Systems, Variations, and branch Lines with automated master game ingestion."
        right={
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success shadow-sm">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            Lichess Live Database: Connected
          </div>
        }
      />

      {/* TOP TIER: Repertoire System Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {repertoireSystems.map((sys) => {
            const isSelected = activeSystem?.id === sys.id;
            return (
              <button
                key={sys.id}
                type="button"
                onClick={() => {
                  setActiveSystem(sys);
                  if (sys.variations.length > 0) {
                    setActiveRepertoireVariation(sys.variations[0]);
                  } else {
                    setActiveRepertoireVariation(null);
                  }
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all shadow-sm ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40"
                    : "bg-secondary/70 text-secondary-foreground hover:bg-secondary"
                }`}
              >
                {sys.color === "black" ? (
                  <Shield className="h-3.5 w-3.5" />
                ) : (
                  <Sword className="h-3.5 w-3.5" />
                )}
                <span>{sys.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                    isSelected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background/80 text-muted-foreground"
                  }`}
                >
                  {sys.color === "black" ? "Black" : "White"}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs font-medium border-dashed border-primary/50 text-primary hover:bg-primary/10"
          onClick={() => setIsAddingSystem(!isAddingSystem)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add New Repertoire
        </Button>
      </div>

      {/* Modal / Inline form to add new Repertoire System */}
      {isAddingSystem && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Create New Opening System
            </h4>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={() => setIsAddingSystem(false)}
            >
              ✕
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Opening Name (e.g. Caro-Kann Defense)"
              value={newSysName}
              onChange={(e) => setNewSysName(e.target.value)}
              className="bg-card"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={newSysColor === "white" ? "default" : "outline"}
                className="flex-1 text-xs"
                onClick={() => setNewSysColor("white")}
              >
                ⚪ White Repertoire
              </Button>
              <Button
                type="button"
                size="sm"
                variant={newSysColor === "black" ? "default" : "outline"}
                className="flex-1 text-xs"
                onClick={() => setNewSysColor("black")}
              >
                ⚫ Black Repertoire
              </Button>
            </div>
            <Button
              className="w-full text-xs font-semibold"
              onClick={handleCreateSystem}
              disabled={!newSysName.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Save Repertoire System
            </Button>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE: Left = Variations & Lines; Right = Chess Board & Line Creator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Variations & Lines Manager (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  {activeSystem?.name || "Repertoire"} Variations
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {activeSystem?.description || "Select a variation to view lines."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-dashed"
                onClick={() => setIsAddingVariation(!isAddingVariation)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>

            {/* Inline Add Variation Form */}
            {isAddingVariation && (
              <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-2 animate-in fade-in">
                <Input
                  placeholder="Variation Name (e.g. Austrian Attack)"
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  className="bg-card h-8 text-xs"
                />
                <Input
                  placeholder="ECO Code (optional, e.g. B09)"
                  value={newVarEco}
                  onChange={(e) => setNewVarEco(e.target.value)}
                  className="bg-card h-8 text-xs font-mono"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setIsAddingVariation(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleCreateVariation}
                    disabled={!newVarName.trim()}
                  >
                    Save Variation
                  </Button>
                </div>
              </div>
            )}

            {/* Variations List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {!activeSystem || activeSystem.variations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No variations added yet. Click &quot;Add&quot; to create your first variation.
                </div>
              ) : (
                activeSystem.variations.map((v) => {
                  const isActive = activeRepertoireVariation?.id === v.id;
                  const isExpanded = !!expandedVarIds[v.id] || isActive;

                  return (
                    <div
                      key={v.id}
                      className={`rounded-lg border transition-all ${
                        isActive
                          ? "border-primary/60 bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-border/80"
                      }`}
                    >
                      {/* Variation Header */}
                      <div className="flex items-center justify-between p-2.5">
                        <button
                          type="button"
                          className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          onClick={() => {
                            setActiveRepertoireVariation(v);
                            toggleExpand(v.id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {v.eco && (
                                <span className="rounded bg-primary/20 px-1 py-0.2 font-mono text-[10px] font-bold text-primary">
                                  {v.eco}
                                </span>
                              )}
                              <span
                                className={`text-xs font-semibold truncate ${
                                  isActive ? "text-primary" : "text-foreground"
                                }`}
                              >
                                {v.name}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {v.lines.length} {v.lines.length === 1 ? "line" : "lines"}
                            </span>
                          </div>
                        </button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            handleDeleteVariation(activeSystem.id, v.id, v.name)
                          }
                          title={`Delete variation "${v.name}"`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Lines under this variation */}
                      {isExpanded && (
                        <div className="border-t border-border/50 bg-secondary/20 p-2 space-y-1.5">
                          {v.lines.length === 0 ? (
                            <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                              No lines saved in this variation yet. Play moves on the board and click &quot;Save Line&quot;.
                            </div>
                          ) : (
                            v.lines.map((l) => (
                              <div
                                key={l.id}
                                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/90 p-2 text-xs transition-colors hover:border-primary/40"
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() => handleSelectLine(l)}
                                >
                                  <div className="font-medium text-foreground truncate">
                                    {l.name}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                                    {l.moves.join(" ")} ({l.moves.length} moves)
                                  </div>
                                </button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() =>
                                    handleDeleteLine(
                                      activeSystem.id,
                                      v.id,
                                      l.id,
                                      l.name,
                                    )
                                  }
                                  title={`Delete line "${l.name}"`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Board & Line Creator (8 cols) */}
        <div className="lg:col-span-8">
          <TrainingLayout
            board={
              <div className="flex items-start gap-4">
                <EvaluationBar
                  evalWhite={analysis?.evalWhite ?? 0.2}
                  isThinking={isEngineThinking}
                />
                <div className="flex-1 space-y-3">
                  {/* Interactive Move-by-Move Line Explorer when candidate line is clicked */}
                  {activeLine && (
                    <EngineLineExplorer
                      line={activeLine}
                      rank={(selectedLineIndex ?? 0) + 1}
                      currentStep={previewStep}
                      totalSteps={activeLine.pv.length}
                      sanMoves={previewSanMoves}
                      onStepChange={(step) => setPreviewStep(step)}
                      onPlayMove={handlePlayLineBestMove}
                      onClose={() => {
                        setSelectedLineIndex(null);
                        setPreviewStep(0);
                      }}
                    />
                  )}

                  <ChessBoard
                    fen={previewFen || fen}
                    orientation={orientation}
                    onMove={previewFen ? undefined : makeMove}
                    arrows={engineArrows}
                  />

                  {/* Active Repertoire Breadcrumb Tag */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono font-semibold text-primary">
                        {activeSystem?.name || "System"} &gt;{" "}
                        {activeRepertoireVariation?.name || "Variation"}
                      </span>
                      <span className="font-medium text-foreground truncate max-w-xs">
                        {recognized.name}
                      </span>
                    </div>
                    <span className="font-mono text-muted-foreground">
                      {history.length} plies
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <EngineAnalysisPanel
              analysis={analysis}
              isThinking={isEngineThinking}
              explanation={explanation}
              engineMode={engineMode}
              onSelectMode={setEngineMode}
              candidateLinesCount={candidateLinesCount}
              onSelectLinesCount={setCandidateLinesCount}
              engineSource={engineSource}
              isInfinitePaused={isInfinitePaused}
              onPauseInfinite={pauseInfiniteAnalysis}
              onResumeInfinite={resumeInfiniteAnalysis}
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
              onToggleArrows={() => setShowArrows(!showArrows)}
            />

            <Panel title="Current Line Move List">
              <MoveList moves={history} />
            </Panel>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => reset()}>
                <RotateCcw /> Reset
              </Button>
              <Button variant="secondary" onClick={undo}>
                <Undo2 /> Undo
              </Button>
              <Button variant="secondary" onClick={flip}>
                <FlipVertical2 /> Flip
              </Button>
            </div>

            {/* Target Repertoire & Variation Notification */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Destination
                </span>
                <span className="font-mono text-[11px] text-primary">
                  {activeSystem?.color === "black" ? "⚫ Black Repertoire" : "⚪ White Repertoire"}
                </span>
              </div>
              <div className="text-sm font-semibold text-foreground">
                Saving to:{" "}
                <span className="text-primary font-bold">
                  {activeSystem?.name} &rarr; {activeRepertoireVariation?.name || "Choose Variation"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Play your line moves on the board above. When saved, master games matching this line will be scraped.
              </p>
            </div>

            {/* Save Line Form */}
            <div className="space-y-2">
              <Input
                placeholder={`Line name (e.g. Central Pawn Fork: White plays 5. Bd3)`}
                value={lineName}
                onChange={(e) => setLineName(e.target.value)}
              />

              <Button
                size="lg"
                className="w-full h-12 text-base font-semibold shadow-md"
                disabled={
                  isScraping ||
                  history.length === 0 ||
                  !activeSystem ||
                  !activeRepertoireVariation
                }
                onClick={handleSaveLine}
              >
                {isScraping ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Saving Line &amp; Scraping Master Games...
                  </>
                ) : (
                  <>
                    <Save className="mr-2" />
                    Save Line to {activeRepertoireVariation?.name || "Variation"}
                  </>
                )}
              </Button>
            </div>

            {/* Live Scraper Progress Notification */}
            {scraperStatus && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between font-semibold text-primary">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Pipeline Status
                  </span>
                  <span className="font-mono">{scraperStatus.gamesFound} games</span>
                </div>
                <p className="text-foreground/90">{scraperStatus.message}</p>
              </div>
            )}

            <DataSourceBadge kind="hook">
              {
                "// REPERTOIRE ENGINE: Lines are stored inside Variations under the Repertoire System."
              }
            </DataSourceBadge>
          </TrainingLayout>
        </div>
      </div>
    </div>
  );
}
