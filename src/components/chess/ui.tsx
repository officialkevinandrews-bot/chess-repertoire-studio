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
