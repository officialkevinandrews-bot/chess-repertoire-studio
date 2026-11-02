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

/** Comprehensive Engine Analysis Panel displaying MultiPV 3, Motifs, and Coach Feedback */
export function EngineAnalysisPanel({
  analysis,
  isThinking,
  explanation,
}: {
  analysis: import("@/engine/stockfishTypes").EngineAnalysisResult | null;
  isThinking?: boolean;
  explanation?: string | null;
}) {
  if (!analysis) {
    return (
      <Panel title="Stockfish Brain (MultiPV 3)">
        <p className="text-sm text-muted-foreground">
          {isThinking
            ? "Engine is analyzing position..."
            : "Make a move to trigger multi-line engine analysis."}
        </p>
      </Panel>
    );
  }

  const profile = analysis.profile;
  const isTactic = profile.profile === "forced_tactic";
  const isPositional = profile.profile === "quiet_positional";

  return (
    <Panel title="Stockfish Engine Analysis (MultiPV 3)" className="space-y-4">
      {/* Tactical Profile Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
              isTactic && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
              isPositional && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
              !isTactic &&
                !isPositional &&
                "bg-blue-500/20 text-blue-400 border border-blue-500/30",
            )}
          >
            {profile.profile.replace("_", " ")}
          </span>
          <span className="text-xs text-muted-foreground font-mono">Depth {analysis.depth}</span>
        </div>
        <span className="font-mono text-xs font-medium text-foreground">
          Eval: {analysis.evalWhite > 0 ? "+" : ""}
          {analysis.evalWhite.toFixed(2)}
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{profile.reasoning}</p>

      {/* Grandmaster AI Coach Explanation */}
      {explanation && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed text-foreground animate-in fade-in">
          <span className="font-semibold text-primary block mb-1">Coach Insight:</span>
          {explanation}
        </div>
      )}

      {/* Tactical Motifs Detected */}
      {analysis.motifs.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detected Motifs
          </span>
          <div className="flex flex-wrap gap-1.5">
            {analysis.motifs.map((m, i) => (
              <span
                key={i}
                title={m.description}
                className="rounded-md bg-secondary border border-border px-2 py-1 text-xs font-medium text-foreground"
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top 3 Engine Variation Lines */}
      <div className="space-y-1.5 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Top Variations (MultiPV 3)
        </span>
        <div className="divide-y divide-border/60 rounded-lg border border-border bg-secondary/40 font-mono text-xs">
          {analysis.lines.slice(0, 3).map((line) => (
            <div key={line.multipv} className="flex items-center justify-between p-2">
              <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                <span className="text-muted-foreground font-semibold">#{line.multipv}</span>
                <span className="text-foreground">
                  {line.sanPv.slice(0, 5).join(" ") || line.bestMoveSan}
                </span>
              </div>
              <span className="text-muted-foreground font-semibold shrink-0 ml-2">
                {line.score.type === "mate"
                  ? `#${line.score.mateMoves}`
                  : `${(line.score.scoreCp / 100).toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
