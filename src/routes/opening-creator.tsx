import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FlipVertical2, Loader2, RotateCcw, Save, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChessBoard } from "@/components/chess/ChessBoard";
import {
  DataSourceBadge,
  EngineAnalysisPanel,
  EvaluationBar,
  MoveList,
  PageHeader,
  Panel,
  TrainingLayout,
} from "@/components/chess/ui";
import { useChessTraining } from "@/context/useChessTraining";
import { identifyOpening } from "@/utils/openingNames";
import { scrapeGamesForVariation, type ScraperProgress } from "@/utils/lichessScraper";

export const Route = createFileRoute("/opening-creator")({
  head: () => ({
    meta: [
      { title: "Opening Creator — Chess Buddy" },
      {
        name: "description",
        content: "Build repertoire lines move by move and save them as training loops.",
      },
      { property: "og:title", content: "Opening Creator — Chess Buddy" },
      {
        property: "og:description",
        content: "Build repertoire lines move by move and save them as training loops.",
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
    saveVariation,
    deleteVariation,
    savedVariations,
    updateVariationGames,
    analysis,
    isEngineThinking,
    explanation,
  } = useChessTraining();

  const [perspective, setPerspective] = useState<"white" | "black">(orientation);
  const [name, setName] = useState("");
  const [exported, setExported] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<ScraperProgress | null>(null);

  const handleDeleteSavedLine = async (id: string, lineName: string) => {
    await deleteVariation(id);
    toast.success(`Deleted line "${lineName}"`, {
      description: "All scraped master games and practical endgames were removed.",
    });
  };

  // Auto-detect opening and ECO from moves played
  const recognized = useMemo(() => identifyOpening(history), [history]);

  const handleSaveVariation = async () => {
    setIsScraping(true);
    setScraperStatus({
      stage: "connecting",
      message: "Saving variation and querying real Lichess master games...",
      gamesFound: 0,
    });

    try {
      const finalName = name.trim() || `${recognized.name} (${history.length} moves)`;
      const v = await saveVariation(finalName, perspective);
      setExported(v.finalFen);

      toast.info("Variation saved!", {
        description: `Pulling actual ${perspective} victory games played from Lichess database...`,
      });

      // Run live Lichess scraper pipeline with persistent token and perspective prioritization
      const scrapeResult = await scrapeGamesForVariation(v.finalFen, v.moves, {
        targetGameCount: 50,
        userColor: perspective,
        onProgress: (p) => setScraperStatus(p),
      });

      // Link games and endgames to this variation
      await updateVariationGames(v.id, scrapeResult.games, scrapeResult.endgames);

      setIsScraping(false);
      toast.success("Training Loop Ready!", {
        description: `Loaded ${scrapeResult.games.length} actual master games and ${scrapeResult.endgames.length} practical endgames.`,
      });
    } catch (err) {
      console.error("Save & Scrape failed:", err);
      setIsScraping(false);
      toast.error("Failed to complete scrape", {
        description: "Variation was saved locally. You can re-scrape later.",
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Workshop"
        title="Opening Creator"
        description="Play out your line on the board. Every move is recorded."
        right={
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success shadow-sm">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            Lichess Live Database: Connected
          </div>
        }
      />

      <TrainingLayout
        board={
          <div className="flex items-start gap-4">
            <EvaluationBar evalWhite={analysis?.evalWhite ?? 0.2} isThinking={isEngineThinking} />
            <div className="flex-1 space-y-3">
              <ChessBoard fen={fen} orientation={orientation} onMove={makeMove} />

              {/* Detected Opening Tag */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono font-semibold text-primary">
                    {recognized.eco}
                  </span>
                  <span className="font-medium text-foreground">{recognized.name}</span>
                </div>
                <span className="font-mono text-muted-foreground">{history.length} ply</span>
              </div>
            </div>
          </div>
        }
      >
        <EngineAnalysisPanel
          analysis={analysis}
          isThinking={isEngineThinking}
          explanation={explanation}
        />

        <Panel title="Move list">
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

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Repertoire Perspective
            </span>
            <p className="text-[11px] text-muted-foreground">
              Configure which color you are building this line for
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/60 p-1">
            <Button
              type="button"
              size="sm"
              variant={perspective === "white" ? "default" : "ghost"}
              className="h-7 text-xs font-semibold px-3"
              onClick={() => {
                setPerspective("white");
                setOrientation("white");
              }}
            >
              ⚪ White
            </Button>
            <Button
              type="button"
              size="sm"
              variant={perspective === "black" ? "default" : "ghost"}
              className="h-7 text-xs font-semibold px-3"
              onClick={() => {
                setPerspective("black");
                setOrientation("black");
              }}
            >
              ⚫ Black
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Input
            placeholder={`Variation name (e.g. ${recognized.name})`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Button
            size="lg"
            className="w-full h-12 text-base font-semibold"
            disabled={isScraping || history.length === 0}
            onClick={handleSaveVariation}
          >
            {isScraping ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Scraping Games & Endgames...
              </>
            ) : (
              <>
                <Save className="mr-2" />
                Save Variation & Generate Loop
              </>
            )}
          </Button>
        </div>

        {/* Saved Repertoire Lines Manager */}
        {savedVariations.length > 0 && (
          <Panel title={`My Saved Repertoire (${savedVariations.length} lines)`}>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {savedVariations.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5 text-xs animate-in fade-in"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-primary/20 px-1 py-0.2 font-mono text-[10px] font-bold text-primary">
                        {v.eco || "ECO"}
                      </span>
                      <span className="font-medium truncate">{v.name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {v.games?.length || 0} master games · {v.endgames?.length || 0} endgames
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteSavedLine(v.id, v.name)}
                    title="Delete opening line and associated games"
                    aria-label={`Delete ${v.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Scraper Progress Notification */}
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

        {exported && (
          <Panel title="Exported FEN">
            <code className="block break-all font-mono text-xs text-success">{exported}</code>
          </Panel>
        )}

        <DataSourceBadge kind="hook">
          {
            "// ANTIGRAVITY HOOK: On save, send finalFen to scrapers (puzzles, master games, endgames)."
          }
        </DataSourceBadge>
      </TrainingLayout>
    </div>
  );
}
