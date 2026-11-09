/**
 * Opening Explorer & Game Frequency Database Panel
 * Displays move frequency stats from Lichess Masters & Online databases,
 * cross-referenced with Stockfish 19 Multi-PV analysis and ⚡ Hidden Gem surprise weapon detection.
 */

import { useState, useMemo } from "react";
import {
  Database,
  Globe,
  Trophy,
  Zap,
  GitBranch,
  Layers,
  ArrowUpDown,
  Play,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/chess/ui";
import { cn } from "@/lib/utils";
import {
  ALL_RATING_TIERS,
  ALL_SPEEDS,
  type DatabaseMode,
  type ExplorerMove,
  type ExplorerPositionResult,
  type GameSpeed,
  type RatingTier,
} from "@/services/openingExplorer";

export interface OpeningExplorerPanelProps {
  explorerData: ExplorerPositionResult | null;
  isLoading?: boolean;
  activeMode: DatabaseMode;
  onSelectMode: (mode: DatabaseMode) => void;
  selectedRatings: RatingTier[];
  onToggleRating: (tier: RatingTier) => void;
  onSelectAllRatings: () => void;
  selectedSpeeds: GameSpeed[];
  onToggleSpeed: (speed: GameSpeed) => void;
  onPlayMove: (san: string, uci: string) => void;
  onSaveBranch?: (san: string, uci: string) => void;
  onRefresh?: () => void;
  layoutView?: "split" | "engine" | "explorer";
  onSelectLayoutView?: (view: "split" | "engine" | "explorer") => void;
}

export function OpeningExplorerPanel({
  explorerData,
  isLoading = false,
  activeMode,
  onSelectMode,
  selectedRatings,
  onToggleRating,
  onSelectAllRatings,
  selectedSpeeds,
  onToggleSpeed,
  onPlayMove,
  onSaveBranch,
  onRefresh,
  layoutView = "split",
  onSelectLayoutView,
}: OpeningExplorerPanelProps) {
  // Feature Toggles
  const [onlyHiddenGems, setOnlyHiddenGems] = useState(false);
  const [showWinLossBar, setShowWinLossBar] = useState(true);
  const [showStockfishColumn, setShowStockfishColumn] = useState(true);
  const [sortBy, setSortBy] = useState<"frequency" | "eval" | "winRate">("frequency");
  const [showFiltersAccordion, setShowFiltersAccordion] = useState(false);

  const formatNumber = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}k`;
    return num.toLocaleString();
  };

  // Filter and sort moves
  const displayedMoves = useMemo(() => {
    if (!explorerData?.moves) return [];
    let list = [...explorerData.moves];

    if (onlyHiddenGems) {
      list = list.filter((m) => m.isHiddenGem);
    }

    if (sortBy === "frequency") {
      list.sort((a, b) => b.total - a.total);
    } else if (sortBy === "eval") {
      list.sort((a, b) => (b.stockfishEval ?? -999) - (a.stockfishEval ?? -999));
    } else if (sortBy === "winRate") {
      list.sort((a, b) => {
        const scoreA = a.whiteWinPct + a.drawPct * 0.5;
        const scoreB = b.whiteWinPct + b.drawPct * 0.5;
        return scoreB - scoreA;
      });
    }

    return list;
  }, [explorerData?.moves, onlyHiddenGems, sortBy]);

  const hiddenGemsCount = useMemo(() => {
    return explorerData?.moves?.filter((m) => m.isHiddenGem).length || 0;
  }, [explorerData?.moves]);

  const isAllRatingsSelected = selectedRatings.length === ALL_RATING_TIERS.length;

  return (
    <Panel
      title="Opening Frequency Explorer"
      icon={<Database className="h-4 w-4 text-primary" />}
      className="space-y-3.5"
    >
      {/* Top Controls: Layout Mode View Switcher + Total Games Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex items-center gap-1.5">
          {onSelectLayoutView && (
            <div className="flex items-center rounded-lg border border-border bg-secondary/60 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => onSelectLayoutView("split")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 transition-all",
                  layoutView === "split"
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Split Layout: View both Stockfish Engine and Explorer Frequency"
              >
                <Layers className="h-3 w-3" />
                <span>Split View</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectLayoutView("explorer")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 transition-all",
                  layoutView === "explorer"
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Explorer Focus: Expand opening database frequency"
              >
                <Database className="h-3 w-3" />
                <span>Explorer Focus</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectLayoutView("engine")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 transition-all",
                  layoutView === "engine"
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Engine Focus: Expand Stockfish 19 Grandmaster analysis"
              >
                <Zap className="h-3 w-3" />
                <span>Engine Focus</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-primary animate-pulse font-medium">
              <RotateCcw className="h-3 w-3 animate-spin" /> Querying...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {explorerData ? formatNumber(explorerData.totalGames) : "0"} games
            </span>
          )}

          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={onRefresh}
              title="Refresh database frequency stats"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Database Mode Switcher (All Games / Masters Only / Online Only) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
            Database Source
          </span>
          {explorerData?.opening && (
            <span className="text-[11px] font-mono text-primary font-medium truncate max-w-[200px]">
              {explorerData.opening.eco}: {explorerData.opening.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onSelectMode("all")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border p-1.5 text-xs font-semibold transition-all",
              activeMode === "all"
                ? "border-primary bg-primary/15 text-primary font-bold shadow-sm"
                : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>All Games (Both)</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode("masters")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border p-1.5 text-xs font-semibold transition-all",
              activeMode === "masters"
                ? "border-primary bg-primary/15 text-primary font-bold shadow-sm"
                : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span>Masters Only</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode("lichess")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border p-1.5 text-xs font-semibold transition-all",
              activeMode === "lichess"
                ? "border-primary bg-primary/15 text-primary font-bold shadow-sm"
                : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Globe className="h-3.5 w-3.5 text-blue-400" />
            <span>Online Only</span>
          </button>
        </div>
      </div>

      {/* Filter Toggles Bar */}
      <div className="rounded-lg border border-border bg-card/60 p-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* ⚡ Hidden Gem Toggle Button */}
          <button
            type="button"
            onClick={() => setOnlyHiddenGems(!onlyHiddenGems)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
              onlyHiddenGems
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm"
                : "bg-secondary border border-border text-muted-foreground hover:text-foreground",
            )}
            title="Filter to surprise weapons: Sound Stockfish evaluation with low database play frequency"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            <span>⚡ Hidden Gems Only</span>
            {hiddenGemsCount > 0 && (
              <span className="rounded-full bg-amber-500/30 px-1.5 py-0.2 text-[10px] font-bold text-amber-300">
                {hiddenGemsCount}
              </span>
            )}
          </button>

          {/* Sort By Toggle */}
          <div className="flex items-center gap-1 text-[11px]">
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Sort:</span>
            <button
              type="button"
              onClick={() => {
                if (sortBy === "frequency") setSortBy("eval");
                else if (sortBy === "eval") setSortBy("winRate");
                else setSortBy("frequency");
              }}
              className="font-semibold text-primary hover:underline cursor-pointer"
            >
              {sortBy === "frequency" && "Most Played"}
              {sortBy === "eval" && "Stockfish Eval"}
              {sortBy === "winRate" && "Win Rate %"}
            </button>
          </div>

          {/* Expand Filters Accordion Toggle */}
          <button
            type="button"
            onClick={() => setShowFiltersAccordion(!showFiltersAccordion)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Filter Ratings & Speeds</span>
            {showFiltersAccordion ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>

        {/* Collapsible Ratings & Speeds Filters */}
        {showFiltersAccordion && (
          <div className="pt-2 border-t border-border/60 space-y-2.5 animate-in fade-in">
            {/* Speeds / Time Controls Toggles */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Time Controls
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {ALL_SPEEDS.map((speed) => {
                  const isChecked = selectedSpeeds.includes(speed);
                  return (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => onToggleSpeed(speed)}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-medium capitalize border transition-all",
                        isChecked
                          ? "bg-primary/20 border-primary/40 text-primary font-semibold"
                          : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {isChecked ? "✓ " : ""}
                      {speed}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ratings Range Toggles */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="uppercase font-semibold text-muted-foreground">
                  Opponent Rating Brackets
                </span>
                <button
                  type="button"
                  onClick={onSelectAllRatings}
                  className="text-primary hover:underline font-semibold"
                >
                  {isAllRatingsSelected ? "Deselect Others" : "All Ratings (0 - 2500+)"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {/* Default All Ratings Button */}
                <button
                  type="button"
                  onClick={onSelectAllRatings}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium border transition-all",
                    isAllRatingsSelected
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  All (0 - 2500+)
                </button>

                {/* Individual Rating Tiers */}
                {ALL_RATING_TIERS.map((tier) => {
                  const isChecked = selectedRatings.includes(tier);
                  const label = tier === "2500" ? "2500+" : tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => onToggleRating(tier)}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-mono border transition-all",
                        isChecked
                          ? "bg-primary/20 border-primary/40 text-primary font-semibold"
                          : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {isChecked ? "✓ " : ""}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* View Column Toggles */}
            <div className="flex items-center gap-3 pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showWinLossBar}
                  onChange={(e) => setShowWinLossBar(e.target.checked)}
                  className="rounded text-primary focus:ring-0"
                />
                <span>Win/Draw/Loss Bars</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStockfishColumn}
                  onChange={(e) => setShowStockfishColumn(e.target.checked)}
                  className="rounded text-primary focus:ring-0"
                />
                <span>Stockfish Evaluation</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Move Frequency Table */}
      <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
        {displayedMoves.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {isLoading
              ? "Querying database for candidate moves..."
              : onlyHiddenGems
                ? "No hidden gems in this position (all top moves are well-booked main lines). Toggle off 'Hidden Gems Only' to see all moves."
                : "No games found in the selected database/rating filter for this position."}
          </div>
        ) : (
          displayedMoves.map((m: ExplorerMove) => {
            const practicalScore = (m.whiteWinPct + m.drawPct * 0.5).toFixed(0);

            return (
              <div
                key={m.san}
                className={cn(
                  "group relative flex items-center justify-between gap-2 rounded-lg border p-2 transition-all text-xs",
                  m.isHiddenGem
                    ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/70 shadow-xs"
                    : m.isStockfishBest
                      ? "border-primary/40 bg-primary/5 hover:border-primary/70"
                      : "border-border/70 bg-card/80 hover:border-border hover:bg-secondary/40",
                )}
              >
                {/* Left: Move SAN + Badges */}
                <div className="flex items-center gap-2 min-w-[90px]">
                  <button
                    type="button"
                    onClick={() => onPlayMove(m.san, m.uci)}
                    className="font-mono font-bold text-sm text-foreground hover:text-primary transition-colors text-left"
                    title={`Play ${m.san} on board`}
                  >
                    {m.san}
                  </button>

                  {m.isHiddenGem && (
                    <span
                      title={m.hiddenGemReason || "High engine score + low database frequency"}
                      className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.2 text-[9px] font-bold text-amber-300"
                    >
                      <Zap className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                      Gem
                    </span>
                  )}

                  {m.isStockfishBest && !m.isHiddenGem && (
                    <span className="rounded-full bg-primary/20 border border-primary/30 px-1.5 py-0.2 text-[9px] font-semibold text-primary">
                      Top 1
                    </span>
                  )}
                </div>

                {/* Center: Games Count & Win/Draw/Loss Distribution */}
                <div className="flex-1 flex flex-col justify-center min-w-0 px-1">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-mono text-muted-foreground truncate">
                      {formatNumber(m.total)}{" "}
                      <span className="text-[10px] text-muted-foreground/80">
                        ({m.playedPercentage.toFixed(1)}%)
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Score: {practicalScore}%
                    </span>
                  </div>

                  {showWinLossBar && (
                    <div
                      className="flex h-2 w-full overflow-hidden rounded-full bg-secondary/80 text-[8px] font-mono"
                      title={`White: ${m.whiteWinPct.toFixed(1)}% (${m.white}) | Draws: ${m.drawPct.toFixed(1)}% (${m.draws}) | Black: ${m.blackWinPct.toFixed(1)}% (${m.black})`}
                    >
                      <div
                        style={{ width: `${m.whiteWinPct}%` }}
                        className="bg-emerald-500 transition-all duration-300"
                      />
                      <div
                        style={{ width: `${m.drawPct}%` }}
                        className="bg-zinc-400 transition-all duration-300"
                      />
                      <div
                        style={{ width: `${m.blackWinPct}%` }}
                        className="bg-zinc-800 transition-all duration-300"
                      />
                    </div>
                  )}
                </div>

                {/* Right: Stockfish Evaluation Column */}
                {showStockfishColumn && (
                  <div className="w-16 text-right font-mono text-xs">
                    {m.stockfishEval !== undefined ? (
                      <span
                        className={cn(
                          "font-bold",
                          m.stockfishEval > 0
                            ? "text-emerald-400"
                            : m.stockfishEval < 0
                              ? "text-rose-400"
                              : "text-muted-foreground",
                        )}
                        title={`Stockfish 19 Multi-PV Rank #${m.stockfishRank}`}
                      >
                        {m.stockfishEval > 0 ? "+" : ""}
                        {m.stockfishEval.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60">—</span>
                    )}
                  </div>
                )}

                {/* Actions: Play & Branch Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs hover:bg-primary/20 hover:text-primary"
                    onClick={() => onPlayMove(m.san, m.uci)}
                    title={`Play ${m.san} on board`}
                  >
                    <Play className="h-3 w-3" />
                  </Button>

                  {onSaveBranch && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary"
                      onClick={() => onSaveBranch(m.san, m.uci)}
                      title={`Save ${m.san} as a new branch line under this variation`}
                    >
                      <GitBranch className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Legend & Stats Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>White Win</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-zinc-400" />
            <span>Draw</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-zinc-800" />
            <span>Black Win</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          <span>Click move to play</span>
          <span>·</span>
          <span>Click <GitBranch className="inline h-2.5 w-2.5" /> to branch</span>
        </div>
      </div>
    </Panel>
  );
}
