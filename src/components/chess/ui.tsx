import type { ReactNode } from "react";
import { Database, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

/** Visible marker showing where Antigravity must inject real data. */
export function DataSourceBadge({
  children,
  kind = "source",
}: {
  children: ReactNode;
  kind?: "source" | "hook";
}) {
  const Icon = kind === "source" ? Database : Plug;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/10 p-3 font-mono text-xs leading-relaxed text-primary">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <code className="whitespace-pre-wrap">{children}</code>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      </div>
      {right}
    </header>
  );
}

export function Panel({
  title,
  icon,
  children,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-5 animate-in fade-in duration-500",
        className,
      )}
    >
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Two-column board + sidebar shell used by every training page. */
export function TrainingLayout({ board, children }: { board: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,1fr)]">
      <div className="mx-auto w-full max-w-[640px] animate-in fade-in zoom-in-95 duration-500">
        {board}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function MoveList({ moves, className }: { moves: string[]; className?: string }) {
  const pairs: [number, string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([i / 2 + 1, moves[i] ?? "", moves[i + 1]]);
  if (!pairs.length)
    return <p className="text-sm text-muted-foreground">No moves yet — drag a piece to start.</p>;
  return (
    <ol
      className={cn(
        "grid max-h-64 grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 overflow-auto font-mono text-sm",
        className,
      )}
    >
      {pairs.map(([n, w, b]) => (
        <li key={n} className="contents">
          <span className="text-muted-foreground">{n}.</span>
          <span>{w}</span>
          <span>{b ?? ""}</span>
        </li>
      ))}
    </ol>
  );
}

/** Vertical evaluation bar showing White vs Black advantage via winning probability */
export function EvaluationBar({
  evalWhite,
  isThinking,
  className,
}: {
  evalWhite: number;
  isThinking?: boolean;
  className?: string;
}) {
  // Convert centipawns to win percentage using standard logistic function
  const cp = evalWhite * 100;
  const clampedCp = Math.max(-1000, Math.min(1000, cp));
  const whitePercent = Math.max(
    5,
    Math.min(95, 50 + (2 / (1 + Math.exp(-0.004 * clampedCp)) - 1) * 50),
  );

  const displayScore =
    Math.abs(evalWhite) >= 900 ? `#` : `${evalWhite > 0 ? "+" : ""}${evalWhite.toFixed(1)}`;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className="relative h-48 w-3 overflow-hidden rounded-full bg-slate-900 ring-1 ring-border shadow-inner">
        <div
          className="absolute bottom-0 w-full bg-slate-100 transition-all duration-300 ease-out"
          style={{ height: `${whitePercent}%` }}
        />
        {isThinking && <div className="absolute inset-0 animate-pulse bg-primary/25" />}
      </div>
      <span className="font-mono text-[11px] font-semibold tracking-tight text-muted-foreground">
        {displayScore}
      </span>
    </div>
  );
}

export interface ArrowColorDef {
  rank: number;
  color: string;
  rgb: string;
  label: string;
  sublabel: string;
  badgeClass: string;
}

export const ENGINE_ARROW_COLORS: ArrowColorDef[] = [
  {
    rank: 1,
    color: "#10b981",
    rgb: "rgb(16, 185, 129)",
    label: "Best Move (#1)",
    sublabel: "Optimal Engine Move",
    badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  {
    rank: 2,
    color: "#3b82f6",
    rgb: "rgb(59, 130, 246)",
    label: "Alternative (#2)",
    sublabel: "Strongest Candidate",
    badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  },
  {
    rank: 3,
    color: "#8b5cf6",
    rgb: "rgb(139, 92, 246)",
    label: "Alternative (#3)",
    sublabel: "Viable Tactical Plan",
    badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  },
  {
    rank: 4,
    color: "#f59e0b",
    rgb: "rgb(245, 158, 11)",
    label: "Alternative (#4)",
    sublabel: "Dynamic Choice",
    badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  {
    rank: 5,
    color: "#f43f5e",
    rgb: "rgb(244, 63, 94)",
    label: "Alternative (#5)",
    sublabel: "Sideline Option",
    badgeClass: "bg-rose-500/20 text-rose-400 border-rose-500/40",
  },
];

/** Comprehensive Grandmaster Engine Analysis Panel displaying MultiPV 3/5, Motifs, Engine Modes, and Arrows Legend */
export function EngineAnalysisPanel({
  analysis,
  isThinking,
  explanation,
  engineMode = "super-gm",
  onSelectMode,
  candidateLinesCount = 5,
  onSelectLinesCount,
  engineSource = "cloud",
  isInfinitePaused = false,
  onPauseInfinite,
  onResumeInfinite,
  infiniteElapsedSeconds = 0,
  selectedLineIndex,
  onSelectLine,
  showArrows = true,
  onToggleArrows,
}: {
  analysis: import("@/engine/stockfishTypes").EngineAnalysisResult | null;
  isThinking?: boolean;
  explanation?: string | null;
  engineMode?: "super-gm" | "grandmaster" | "quick" | "infinite";
  onSelectMode?: (mode: "super-gm" | "grandmaster" | "quick" | "infinite") => void;
  candidateLinesCount?: 3 | 5;
  onSelectLinesCount?: (count: 3 | 5) => void;
  engineSource?: "cloud" | "local" | "infinite" | "cache";
  isInfinitePaused?: boolean;
  onPauseInfinite?: () => void;
  onResumeInfinite?: () => void;
  infiniteElapsedSeconds?: number;
  selectedLineIndex?: number | null;
  onSelectLine?: (index: number) => void;
  showArrows?: boolean;
  onToggleArrows?: () => void;
}) {
  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const modeButtons = [
    { id: "super-gm", label: "Super-GM", icon: "👑", desc: "Depth 40-60+ (Cloud + Local)" },
    { id: "grandmaster", label: "Grandmaster", icon: "🏆", desc: "Depth 25 (Local Engine)" },
    { id: "quick", label: "Quick", icon: "⚡", desc: "Depth 18 (Fast Check)" },
    { id: "infinite", label: "Infinite", icon: "♾️", desc: "Continuous Deep Search" },
  ] as const;

  return (
    <Panel title={`Grandmaster Stockfish Brain (Top ${candidateLinesCount} Moves)`} className="space-y-3.5">
      {/* Engine Mode Switcher */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
            Engine Depth &amp; Mode
          </span>
          <span className="text-[11px] font-mono text-primary font-medium">
            {engineMode === "super-gm" && "👑 Super-GM (Depth 40–60+ Default)"}
            {engineMode === "grandmaster" && "🏆 Grandmaster (Depth 25)"}
            {engineMode === "quick" && "⚡ Quick Analysis (Depth 18)"}
            {engineMode === "infinite" && "♾️ Infinite Continuous Search"}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {modeButtons.map((btn) => {
            const isActive = engineMode === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onSelectMode?.(btn.id)}
                title={btn.desc}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all",
                  isActive
                    ? "border-primary bg-primary/15 text-primary font-bold shadow-sm"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className="text-base leading-none mb-1">{btn.icon}</span>
                <span className="text-[11px] font-semibold tracking-tight">{btn.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Infinite Analysis Running / Paused Toolbar */}
      {engineMode === "infinite" && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 p-2 text-xs font-mono animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {!isInfinitePaused && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              )}
              <span className={cn("relative inline-flex rounded-full h-2 w-2", isInfinitePaused ? "bg-amber-400" : "bg-purple-500")}></span>
            </span>
            <span className="text-foreground font-semibold">
              {isInfinitePaused ? "Analysis Paused" : "Calculating Deep..."}
            </span>
            <span className="text-muted-foreground">⏱️ {formatTime(infiniteElapsedSeconds)}</span>
          </div>

          <div>
            {isInfinitePaused ? (
              <button
                type="button"
                onClick={onResumeInfinite}
                className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
              >
                ▶️ Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={onPauseInfinite}
                className="rounded bg-secondary border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary/80"
              >
                ⏸️ Pause
              </button>
            )}
          </div>
        </div>
      )}

      {/* Engine Status / Data Source Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs">
        <div className="flex items-center gap-2">
          {engineSource === "cloud" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400">
              ☁️ Cloud Cluster (Depth 60)
            </span>
          ) : engineSource === "cache" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
              💾 Instant Memory Cache (Depth {analysis?.depth || 0})
            </span>
          ) : engineSource === "infinite" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-purple-400">
              ♾️ Deep Infinite Search
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              ⚡ Stockfish 19 WASM (NNUE)
            </span>
          )}

          <span className="font-mono text-muted-foreground text-xs font-medium">
            Depth {analysis?.depth || 0}
          </span>
          {isThinking && (
            <span className="text-[11px] text-primary animate-pulse font-medium">
              Searching...
            </span>
          )}
        </div>

        <span className="font-mono text-xs font-bold text-foreground">
          Eval: {analysis ? (analysis.evalWhite > 0 ? "+" : "") + analysis.evalWhite.toFixed(2) : "0.00"}
        </span>
      </div>

      {!analysis ? (
        <p className="text-xs text-muted-foreground">
          {isThinking
            ? `Grandmaster engine is calculating top ${candidateLinesCount} candidate lines...`
            : "Make a move or choose an opening line to start analysis."}
        </p>
      ) : (
        <>
          {/* Tactical Profile Badge */}
          <div className="flex items-center justify-between text-xs">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                analysis.profile.profile === "forced_tactic" &&
                  "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                analysis.profile.profile === "quiet_positional" &&
                  "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                analysis.profile.profile === "balanced" &&
                  "bg-blue-500/20 text-blue-400 border border-blue-500/30",
              )}
            >
              {analysis.profile.profile.replace("_", " ")}
            </span>
            <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
              {analysis.profile.reasoning}
            </span>
          </div>

          {/* Grandmaster AI Coach Explanation */}
          {explanation && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-xs leading-relaxed text-foreground animate-in fade-in">
              <span className="font-semibold text-primary block mb-0.5">Coach Insight:</span>
              {explanation}
            </div>
          )}

          {/* Tactical Motifs */}
          {analysis.motifs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.motifs.map((m, i) => (
                <span
                  key={i}
                  title={m.description}
                  className="rounded-md bg-secondary border border-border px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {m.name}
                </span>
              ))}
            </div>
          )}

          {/* Top Engine Candidate Lines */}
          <div className="space-y-1.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Top {candidateLinesCount} Candidate Moves (Click line to step through)
              </span>
              <div className="flex items-center gap-1.5">
                {onSelectLinesCount && (
                  <div className="flex items-center rounded border border-border bg-secondary/80 p-0.5 text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => onSelectLinesCount(3)}
                      className={cn(
                        "px-2 py-0.5 rounded transition-all",
                        candidateLinesCount === 3
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title="3 Lines: ~2x faster search speed, prioritizes main lines"
                    >
                      3 Lines ⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectLinesCount(5)}
                      className={cn(
                        "px-2 py-0.5 rounded transition-all",
                        candidateLinesCount === 5
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title="5 Lines: Exhaustive candidate search (Super-GM default)"
                    >
                      5 Lines 🔬
                    </button>
                  </div>
                )}
                {onToggleArrows && (
                  <button
                    type="button"
                    onClick={onToggleArrows}
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors",
                      showArrows
                        ? "bg-primary/20 text-primary border-primary/40 font-bold"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground",
                    )}
                  >
                    🎯 Arrows: {showArrows ? "ON" : "OFF"}
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-border/60 rounded-lg border border-border bg-secondary/30 font-mono text-xs overflow-hidden">
              {analysis.lines.slice(0, candidateLinesCount).map((line, idx) => {
                const colorDef = ENGINE_ARROW_COLORS[idx] || ENGINE_ARROW_COLORS[0];
                const isSelected = selectedLineIndex === idx;
                const evalText =
                  line.score.type === "mate"
                    ? `#${line.score.mateMoves}`
                    : `${line.score.scoreCp > 0 ? "+" : ""}${(line.score.scoreCp / 100).toFixed(2)}`;

                return (
                  <button
                    key={line.multipv}
                    type="button"
                    onClick={() => onSelectLine?.(idx)}
                    title={`Click to step through move-by-move: ${line.sanPv.join(" ")}`}
                    className={cn(
                      "w-full text-left flex items-center justify-between p-2 transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary/20 border-l-4 border-l-primary"
                        : "hover:bg-secondary/70",
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                      {/* Color Rank Dot */}
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: colorDef.color }}
                        title={colorDef.label}
                      />
                      <span className="font-bold text-foreground">
                        #{idx + 1} {line.bestMoveSan}
                      </span>
                      <span className="text-muted-foreground text-[11px] overflow-hidden text-ellipsis">
                        {line.sanPv.slice(1, 6).join(" ")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-bold border",
                          colorDef.badgeClass,
                        )}
                      >
                        {evalText}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Colored Arrows Legend */}
          <div className="rounded-lg border border-border bg-card/60 p-2.5 text-[11px] space-y-1.5">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[10px] block">
              Arrow Color Key
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-medium">
              {ENGINE_ARROW_COLORS.slice(0, candidateLinesCount).map((c) => {
                const line = analysis.lines[c.rank - 1];
                return (
                  <div key={c.rank} className="flex items-center gap-1.5 text-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate">
                      <span className="font-bold">#{c.rank}:</span>{" "}
                      {line?.bestMoveSan || c.label.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
