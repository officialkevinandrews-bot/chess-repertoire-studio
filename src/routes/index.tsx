import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Flame, Target, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader, Panel } from "@/components/chess/ui";
import { dashboardStats, repertoire } from "@/lib/mock-data";
import { useChessTraining } from "@/context/useChessTraining";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Chess Buddy" },
      {
        name: "description",
        content: "Track mastery, trained lines and solved endgames across your chess repertoire.",
      },
      { property: "og:title", content: "Dashboard — Chess Buddy" },
      {
        property: "og:description",
        content: "Track mastery, trained lines and solved endgames across your chess repertoire.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  // ANTIGRAVITY HOOK: replace dashboardStats/repertoire with persisted user progress.
  const { savedVariations, deleteVariation, setActiveVariation } = useChessTraining();

  const handleDeleteLine = async (id: string, lineName: string) => {
    await deleteVariation(id);
    toast.success(`Deleted line "${lineName}"`, {
      description: "All scraped master games and practical endgames were removed.",
    });
  };

  const stats = [
    {
      label: "Mastery Score",
      value: `${dashboardStats.masteryScore}%`,
      icon: TrendingUp,
      tone: "text-primary",
    },
    {
      label: "Lines Trained",
      value: dashboardStats.linesTrained + savedVariations.length,
      icon: Target,
      tone: "text-success",
    },
    {
      label: "Endgames Solved",
      value: dashboardStats.endgamesSolved,
      icon: Flame,
      tone: "text-mistake",
    },
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Repertoire Manager"
        title="Welcome back"
        description="Your openings, your weak spots, and what to train next."
        right={
          <Button asChild>
            <Link to="/opening-creator">
              <BookOpen /> New line
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-3 duration-500"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {s.label}
              <s.icon className={`h-4 w-4 ${s.tone}`} />
            </div>
            <p className="mt-3 font-display text-4xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
      <Panel title="Variations" className="mt-6">
        <div className="divide-y divide-border">
          {savedVariations.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {v.eco && (
                    <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                      {v.eco}
                    </span>
                  )}
                  <p className="font-semibold text-foreground text-sm">{v.name}</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {v.moves.slice(0, 6).join(" ")}
                  {v.moves.length > 6 ? "..." : ""} ({v.moves.length} ply)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-md bg-secondary border border-border px-2 py-1 font-mono text-xs text-muted-foreground">
                  {v.games?.length || v.gameCount || 0} GM games
                </span>
                <Button
                  asChild
                  size="sm"
                  variant="default"
                  className="text-xs"
                  onClick={() => setActiveVariation(v)}
                >
                  <Link to="/middlegame/guess-the-move">Train Line</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleDeleteLine(v.id, v.name)}
                  title="Delete opening line and associated games"
                  aria-label={`Delete ${v.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {repertoire.map((r) => (
            <div
              key={r.name}
              className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 sm:grid-cols-[1fr_80px_200px]"
            >
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Playing as {r.color}</p>
              </div>
              <span className="hidden font-mono text-sm text-muted-foreground sm:block">
                {r.lines} lines
              </span>
              <div className="flex items-center gap-3">
                <Progress value={r.mastery} className="h-2" />
                <span className="w-10 text-right font-mono text-sm">{r.mastery}%</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
