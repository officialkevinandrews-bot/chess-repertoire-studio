import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRightLeft, CheckCircle2, Info } from "lucide-react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel } from "@/components/chess/ui";
import { simplification } from "@/lib/mock-data";

export const Route = createFileRoute("/middlegame/simplification")({
  head: () => ({
    meta: [
      { title: "Simplification Training — Chess Buddy" },
      {
        name: "description",
        content: "Learn to trade down from a winning middlegame into a winning endgame.",
      },
      { property: "og:title", content: "Simplification Training — Chess Buddy" },
      {
        property: "og:description",
        content: "Learn to trade down from a winning middlegame into a winning endgame.",
      },
    ],
  }),
  component: Simplification,
});

// ANTIGRAVITY DATA SOURCE: Scan Master games that passed through my openings, filter for moments where one side achieves a clear advantage (+1.5 to +3.0) and executes a forced series of trades/simplifications to liquidize into a winning endgame.
function Simplification() {
  // MOCK move tracker. ANTIGRAVITY HOOK: evaluate each move — does it keep eval >= +1.5 and reduce material?
  const [moves, setMoves] = useState([
    { san: "Rxd8+", ok: true },
    { san: "Nxd8", ok: true },
  ]);
  const onMove = (from: string, to: string) => {
    setMoves((m) => [...m, { san: `${from}-${to}`, ok: Math.random() > 0.3 }]);
    return false;
  };
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Middlegame · 3c"
        title="Simplification Training"
        description="You're winning. Now trade into an endgame you can't lose."
        right={
          <span className="rounded-lg bg-success/15 px-3 py-1.5 font-mono text-success">
            +{simplification.eval.toFixed(1)}
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[600px]">
          <ChessBoard fen={simplification.fen} onMove={onMove} />
        </div>
        <div className="flex flex-col gap-4">
          <DataSourceBadge>
            {
              "// ANTIGRAVITY DATA SOURCE: Scan Master games that passed through my openings, filter for moments where one side achieves a clear advantage (+1.5 to +3.0) and executes a forced series of trades/simplifications to liquidize into a winning endgame."
            }
          </DataSourceBadge>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Why simplify?" icon={<Info className="h-4 w-4 text-primary" />}>
              <ul className="space-y-3 text-sm">
                {simplification.reasons.map((r) => (
                  <li key={r} className="border-l-2 border-primary pl-3">
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                Target: {simplification.target}
              </p>
            </Panel>
            <Panel title="Trade tracker" icon={<ArrowRightLeft className="h-4 w-4 text-success" />}>
              <ol className="space-y-2 font-mono text-sm">
                {moves.map((m, i) => (
                  <li
                    key={i}
                    className={`flex items-center justify-between rounded-md px-2 py-1 animate-in fade-in ${m.ok ? "bg-success/10 text-success" : "bg-mistake/10 text-mistake"}`}
                  >
                    {m.san}
                    <span className="text-xs">
                      {m.ok ? "steers to endgame" : "keeps complexity"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" /> Goal: reach the target endgame.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
