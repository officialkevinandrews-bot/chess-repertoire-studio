import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Bot, ChevronDown, Play, PlayCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { demonstrationSteps, practicalEndgames, theoreticalEndgames } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/endgame")({
  head: () => ({
    meta: [
      { title: "Endgame Laboratory — Chess Buddy" },
      {
        name: "description",
        content: "Master theoretical endgames and practical endings from your repertoire.",
      },
      { property: "og:title", content: "Endgame Laboratory — Chess Buddy" },
      {
        property: "og:description",
        content: "Master theoretical endgames and practical endings from your repertoire.",
      },
    ],
  }),
  component: Endgame,
});

type Mode = "theoretical" | "practical";

function Endgame() {
  const [mode, setMode] = useState<Mode>("theoretical");
  const [theoId, setTheoId] = useState(theoreticalEndgames[1]?.id ?? "kp");
  const [pracId, setPracId] = useState(practicalEndgames[0]?.id ?? "p1");
  const [demoOpen, setDemoOpen] = useState(false); // ANTIGRAVITY HOOK: set true when the user fails a position.

  const initialFen =
    mode === "theoretical"
      ? (theoreticalEndgames.find((e) => e.id === theoId)?.fen ?? "")
      : (practicalEndgames.find((e) => e.id === pracId)?.fen ?? "");

  const [currentFen, setCurrentFen] = useState(initialFen);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [botMessage, setBotMessage] = useState<string | null>(null);

  // Sync board when selection changes
  useEffect(() => {
    setCurrentFen(initialFen);
    setBotMessage(null);
  }, [initialFen]);

  const chess = useMemo(() => {
    const c = new Chess();
    try {
      c.load(initialFen);
    } catch {
      // fallback
    }
    return c;
  }, [initialFen]);

  const handleReset = () => {
    chess.load(initialFen);
    setCurrentFen(initialFen);
    setBotMessage(null);
  };

  const onMove = (from: string, to: string) => {
    if (isBotThinking) return false;

    try {
      const legalMoves = chess.moves({ verbose: true });
      const isLegal = legalMoves.some((m) => m.from === from && m.to === to);
      if (!isLegal) return false;

      const userMove = chess.move({ from, to });
      if (!userMove) return false;

      setCurrentFen(chess.fen());

      if (chess.isGameOver()) {
        if (chess.isCheckmate()) {
          setBotMessage("Checkmate! Flawless endgame execution.");
        } else if (chess.isDraw()) {
          setBotMessage("Draw achieved! Theoretical hold.");
        }
        return true;
      }

      // Trigger Stockfish bot defense
      setIsBotThinking(true);
      setBotMessage("Bot is calculating defense...");

      import("@/engine/stockfishClient")
        .then(({ StockfishClient }) => StockfishClient.getInstance())
        .then((client) => client.evaluatePosition(chess.fen(), 10, 1))
        .then((analysis) => {
          const bestMoveLan = analysis.bestMove;
          if (bestMoveLan && bestMoveLan.length >= 4) {
            const bFrom = bestMoveLan.slice(0, 2);
            const bTo = bestMoveLan.slice(2, 4);
            const promo = bestMoveLan.length > 4 ? bestMoveLan[4] : undefined;

            setTimeout(() => {
              const botMoveRes = chess.move({ from: bFrom, to: bTo, promotion: promo });
              if (botMoveRes) {
                setCurrentFen(chess.fen());
                setBotMessage(`Bot played ${botMoveRes.san}. Your turn.`);
              }
              setIsBotThinking(false);
            }, 400);
          } else {
            setIsBotThinking(false);
            setBotMessage("Your turn.");
          }
        })
        .catch(() => {
          setIsBotThinking(false);
          setBotMessage("Your turn.");
        });

      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Section 5"
        title="Endgame Laboratory"
        description="Theory you must know, and real endings from your own openings."
        right={
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {(["theoretical", "practical"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setBotMessage(null);
                }}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m} Endgames
              </button>
            ))}
          </div>
        }
      />
      <TrainingLayout
        board={
          <div className="space-y-3">
            <div className="relative">
              <ChessBoard fen={currentFen} onMove={onMove} />
              <div className="absolute right-3 top-3 flex items-center gap-1.5">
                <Button variant="secondary" size="sm" onClick={handleReset}>
                  Reset
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDemoOpen(true)}>
                  Demonstration
                </Button>
              </div>
            </div>

            {botMessage && (
              <div className="rounded-lg border border-border bg-card p-2.5 text-xs font-mono text-muted-foreground flex items-center gap-2 animate-in fade-in">
                <Bot className="h-4 w-4 text-primary shrink-0" />
                <span>{botMessage}</span>
              </div>
            )}
          </div>
        }
      >
        <div
          key={mode}
          className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-3 duration-300"
        >
          {mode === "theoretical" ? (
            <>
              <DataSourceBadge kind="hook">
                {
                  "// ANTIGRAVITY HOOK: Connect to Syzygy Tablebase API for perfect endgame evaluation and Stockfish bot defense."
                }
              </DataSourceBadge>
              <Panel title="Classic positions">
                <ul className="space-y-1">
                  {theoreticalEndgames.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => setTheoId(e.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-accent",
                          theoId === e.id && "bg-accent ring-1 ring-primary/50",
                        )}
                      >
                        <span>
                          <span className="block font-medium">{e.name}</span>
                          <span className="text-xs text-muted-foreground">{e.desc}</span>
                        </span>
                        <Bot className="h-4 w-4 text-primary" />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button className="mt-4 w-full">
                  <Play /> Play vs. Bot
                </Button>
              </Panel>
            </>
          ) : (
            <>
              <DataSourceBadge>
                {
                  "// ANTIGRAVITY DATA SOURCE: Real endings from master games that passed through my openings."
                }
              </DataSourceBadge>
              <Panel title="Playlist">
                <ul className="space-y-2">
                  {practicalEndgames.map((e, i) => (
                    <li key={e.id}>
                      <button
                        onClick={() => setPracId(e.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent",
                          pracId === e.id && "bg-accent ring-1 ring-primary/50",
                        )}
                      >
                        <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                        <PlayCircle className="h-5 w-5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{e.title}</span>
                          <span className="text-xs text-muted-foreground">{e.players}</span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-2 py-0.5 text-xs",
                            e.target === "Force a Draw"
                              ? "bg-primary/15 text-primary"
                              : "bg-success/15 text-success",
                          )}
                        >
                          Target: {e.target}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </div>
      </TrainingLayout>

      {/* Demonstration Mode — collapsible overlay shown after a failed attempt. */}
      {demoOpen && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-2xl rounded-xl border border-primary/40 bg-popover shadow-2xl animate-in slide-in-from-bottom-6 fade-in duration-300 md:left-[calc(var(--sidebar-width)+1rem)]">
          <Collapsible defaultOpen>
            <div className="flex items-center justify-between border-b border-border p-4">
              <CollapsibleTrigger className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Demonstration Mode{" "}
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDemoOpen(false)}
                aria-label="Close"
              >
                <X />
              </Button>
            </div>
            <CollapsibleContent>
              {/* ANTIGRAVITY HOOK: Replace demonstrationSteps with tablebase-optimal line + generated annotations. */}
              <ol className="max-h-72 space-y-3 overflow-auto p-4">
                {demonstrationSteps.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-3 animate-in fade-in"
                    style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
                  >
                    <span className="w-20 shrink-0 font-mono text-sm text-success">{s.move}</span>
                    <span className="text-sm text-muted-foreground">{s.note}</span>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
