import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Check,
  Database,
  ExternalLink,
  FlipVertical2,
  KeyRound,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
} from "lucide-react";
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
import { getStoredLichessToken, setStoredLichessToken } from "@/services/repertoireStorage";

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
    saveVariation,
    updateVariationGames,
    analysis,
    isEngineThinking,
    explanation,
  } = useChessTraining();

  const [name, setName] = useState("");
  const [exported, setExported] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<ScraperProgress | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [lichessToken, setLichessToken] = useState(getStoredLichessToken() || "");

  // Auto-detect opening and ECO from moves played
  const recognized = useMemo(() => identifyOpening(history), [history]);

  const handleSaveToken = () => {
    setStoredLichessToken(lichessToken);
    toast.success("Lichess token updated", {
      description: lichessToken
        ? "Live explorer queries enabled."
        : "Using offline model database.",
    });
    setShowTokenInput(false);
  };

  const handleSaveVariation = async () => {
    setIsScraping(true);
    setScraperStatus({
      stage: "connecting",
      message: "Saving variation and querying master games...",
      gamesFound: 0,
    });

    try {
      const finalName = name.trim() || `${recognized.name} (${history.length} moves)`;
      const v = await saveVariation(finalName);
      setExported(v.finalFen);

      toast.info("Variation saved!", { description: "Scraping Grandmaster game pool..." });

      // Run live Lichess / Model scraper pipeline
      const scrapeResult = await scrapeGamesForVariation(v.finalFen, v.moves, {
        targetGameCount: 50,
        userColor: orientation,
        onProgress: (p) => setScraperStatus(p),
      });

      // Link games and endgames to this variation
      await updateVariationGames(v.id, scrapeResult.games, scrapeResult.endgames);

      setIsScraping(false);
      toast.success("Training Loop Ready!", {
        description: `Loaded ${scrapeResult.games.length} high-level games and ${scrapeResult.endgames.length} practical endgames.`,
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTokenInput((s) => !s)}
            className="text-xs font-mono"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1 text-primary" />
            {getStoredLichessToken() ? "Lichess Token: Connected" : "Lichess Token: Optional"}
          </Button>
        }
      />

      {/* Lichess Token Configuration Drawer */}
      {showTokenInput && (
        <div className="mb-6 rounded-xl border border-primary/40 bg-card p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm flex items-center gap-1.5">
              <Database className="h-4 w-4 text-primary" /> Lichess Personal Access Token
            </span>
            <a
              href="https://lichess.org/account/oauth/token/create"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Get free token <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Lichess Opening Explorer queries require authentication. If no token is provided, Chess
            Buddy automatically uses its built-in Grandmaster model games database.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Paste your Lichess Personal Access Token (lip_...)"
              value={lichessToken}
              onChange={(e) => setLichessToken(e.target.value)}
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={handleSaveToken}>
              <Check className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}

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
