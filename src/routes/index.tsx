import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Dna,
  Flame,
  PlayCircle,
  Plus,
  Shield,
  Sparkles,
  Sword,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader, Panel } from "@/components/chess/ui";
import { dashboardStats, repertoire } from "@/lib/mock-data";
import { useChessTraining } from "@/context/useChessTraining";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Chess Buddy" },
      {
        name: "description",
        content:
          "Track mastery, trained lines, scraped master games and practical endgames across your repertoire.",
      },
      { property: "og:title", content: "Dashboard — Chess Buddy" },
      {
        property: "og:description",
        content:
          "Track mastery, trained lines, scraped master games and practical endgames across your repertoire.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { savedVariations, deleteVariation, setActiveVariation, telemetry } = useChessTraining();

  const handleDeleteLine = async (id: string, lineName: string) => {
    await deleteVariation(id);
    toast.success(`Deleted line "${lineName}"`, {
      description: "All scraped master games and practical endgames were purged from storage.",
    });
  };

  const handleTrainLine = (variation: (typeof savedVariations)[0]) => {
    setActiveVariation(variation);
    navigate({ to: "/middlegame/guess-the-move" });
  };

  const handleTrainEndgames = (variation: (typeof savedVariations)[0]) => {
    setActiveVariation(variation);
    navigate({ to: "/endgame" });
  };

  // Dynamic telemetry metrics
  const totalMasterGames = savedVariations.reduce(
    (acc, v) => acc + (v.games?.length || v.gameCount || 0),
    0,
  );

  const totalPracticalEndgames = savedVariations.reduce(
    (acc, v) => acc + (v.endgames?.length || 0),
    0,
  );

  const dynamicMasteryScore =
    telemetry.totalMovesGuessed > 0
      ? Math.min(
          100,
          Math.round(
            (telemetry.correctMovesGuessed / telemetry.totalMovesGuessed) * 80 +
              (telemetry.endgamesSolved > 0 ? 20 : 0),
          ),
        )
      : savedVariations.length > 0
        ? 85
        : 78;

  const stats = [
    {
      label: "Mastery Score",
      value: `${dynamicMasteryScore}%`,
      subtitle:
        telemetry.totalMovesGuessed > 0
          ? `${telemetry.correctMovesGuessed}/${telemetry.totalMovesGuessed} moves verified`
          : "Based on repertoire readiness",
      icon: TrendingUp,
      tone: "text-primary",
      bgTone: "bg-primary/10",
    },
    {
      label: "Lines in Repertoire",
      value: savedVariations.length,
      subtitle: `${totalMasterGames} master games scraped`,
      icon: Target,
      tone: "text-emerald-500",
      bgTone: "bg-emerald-500/10",
    },
    {
      label: "Endgames Solved",
      value: telemetry.endgamesSolved,
      subtitle: `${telemetry.perfectConversions} perfect conversions`,
      icon: Flame,
      tone: "text-amber-500",
      bgTone: "bg-amber-500/10",
    },
    {
      label: "Training Points",
      value: `${telemetry.totalScore} pts`,
      subtitle: `${totalPracticalEndgames} practical drills available`,
      icon: Trophy,
      tone: "text-sky-500",
      bgTone: "bg-sky-500/10",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <PageHeader
        eyebrow="Repertoire Command Center"
        title="Welcome back"
        description="Your personalized opening repertoire, live master game databases, and structural endgame drills."
        right={
          <Button asChild className="shadow-lg">
            <Link to="/opening-creator">
              <Plus className="h-4 w-4 mr-1.5" /> New Opening Line
            </Link>
          </Button>
        }
      />

      {/* Real-time Telemetry Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-3 duration-500"
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{s.label}</span>
              <div className={cn("p-2 rounded-lg", s.bgTone)}>
                <s.icon className={`h-4 w-4 ${s.tone}`} />
              </div>
            </div>
            <p className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{s.subtitle}</p>
          </div>
        ))}
      </div>

      {/* User Repertoire Variations Panel */}
      <Panel
        title={`Your Saved Variations (${savedVariations.length})`}
        icon={<BookOpen className="h-4 w-4 text-primary" />}
      >
        {savedVariations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              No Opening Lines Created Yet
            </h3>
            <p className="max-w-md mx-auto text-sm text-muted-foreground">
              Build your custom repertoire lines, extract final FEN states, and automatically scrape
              real Grandmaster games from Lichess.
            </p>
            <Button asChild className="mt-2">
              <Link to="/opening-creator">
                <Plus className="h-4 w-4 mr-1" /> Create First Line
              </Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {savedVariations.map((v) => {
              const perspective = v.perspective || v.color || "white";
              const gamesCount = v.games?.length || v.gameCount || 0;
              const endgamesCount = v.endgames?.length || 0;

              return (
                <div
                  key={v.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 transition-colors hover:bg-muted/10 rounded-lg px-2"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {v.eco && (
                        <span className="rounded bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                          {v.eco}
                        </span>
                      )}
                      <h4 className="font-semibold text-foreground text-sm truncate">{v.name}</h4>

                      {/* Perspective Color Badge */}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                          perspective === "white"
                            ? "bg-stone-100 text-stone-900 border-stone-300 dark:bg-stone-200 dark:text-stone-900"
                            : "bg-stone-800 text-stone-100 border-stone-700 dark:bg-stone-900 dark:text-stone-100",
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            perspective === "white"
                              ? "bg-stone-400 border border-stone-500"
                              : "bg-stone-300",
                          )}
                        />
                        Playing as {perspective === "white" ? "White" : "Black"}
                      </span>
                    </div>

                    <p className="font-mono text-xs text-muted-foreground">
                      {v.moves.slice(0, 8).join(" ")}
                      {v.moves.length > 8 ? "..." : ""} ({v.moves.length} ply)
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-0.5">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Sword className="h-3.5 w-3.5 text-primary" />
                        {gamesCount} GM Games
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Dna className="h-3.5 w-3.5 text-emerald-500" />
                        {endgamesCount} Practical Endgames
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="text-xs shadow-sm"
                      onClick={() => handleTrainLine(v)}
                    >
                      <PlayCircle className="h-3.5 w-3.5 mr-1" /> Train Line
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handleTrainEndgames(v)}
                      title="Drill practical endgames clipped from this opening"
                    >
                      <Dna className="h-3.5 w-3.5 mr-1" /> Endgames
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => handleDeleteLine(v.id, v.name)}
                      title="Delete opening line and associated master games & endgames"
                      aria-label={`Delete ${v.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Classical Repertoire Benchmarks Panel */}
      <Panel
        title="Classical Master Repertoires (Curated Benchmarks)"
        icon={<Sparkles className="h-4 w-4 text-primary" />}
      >
        <div className="divide-y divide-border">
          {repertoire.map((r) => (
            <div
              key={r.name}
              className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 sm:grid-cols-[1fr_100px_200px]"
            >
              <div>
                <p className="font-medium text-sm text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  Curated Model · Playing as {r.color}
                </p>
              </div>
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">
                {r.lines} lines
              </span>
              <div className="flex items-center gap-3">
                <Progress value={r.mastery} className="h-2 flex-1" />
                <span className="w-10 text-right font-mono text-xs font-semibold text-primary">
                  {r.mastery}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
