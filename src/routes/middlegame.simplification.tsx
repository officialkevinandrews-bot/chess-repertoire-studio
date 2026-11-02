import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ArrowRightLeft, CheckCircle2, ChevronRight, Info, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, PageHeader, Panel } from "@/components/chess/ui";
import { simplificationScenarios, type SimplificationScenario } from "@/lib/mock-data";

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

interface TrackedMove {
  san: string;
  ok: boolean;
  note: string;
}

// ANTIGRAVITY DATA SOURCE: Scan Master games that passed through my openings, filter for moments where one side achieves a clear advantage (+1.5 to +3.0) and executes a forced series of trades/simplifications to liquidize into a winning endgame.
function Simplification() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = simplificationScenarios[scenarioIdx] ?? simplificationScenarios[0];

  const chess = useMemo(() => new Chess(scenario.fen), [scenario.fen]);
  const [currentFen, setCurrentFen] = useState(scenario.fen);
  const [isCompleted, setIsCompleted] = useState(false);
  const [moves, setMoves] = useState<TrackedMove[]>([]);

  const resetPosition = () => {
    chess.load(scenario.fen);
    setCurrentFen(scenario.fen);
    setIsCompleted(false);
    setMoves([]);
  };

  const nextScenario = () => {
    const next = (scenarioIdx + 1) % simplificationScenarios.length;
    setScenarioIdx(next);
    const nextS = simplificationScenarios[next];
    chess.load(nextS.fen);
    setCurrentFen(nextS.fen);
    setIsCompleted(false);
    setMoves([]);
  };

  const onMove = (from: string, to: string) => {
    if (isCompleted) return false;

    const attemptedLan = `${from}${to}`;
    const legalMoves = chess.moves({ verbose: true });
    const matchingMove = legalMoves.find((m) => m.from === from && m.to === to);
    if (!matchingMove) return false;

    const isSimplifyingTrade =
      attemptedLan.toLowerCase() === scenario.expectedMoveLan.toLowerCase();

    if (isSimplifyingTrade) {
      const result = chess.move({ from, to });
      if (!result) return false;

      setCurrentFen(chess.fen());
      setMoves((m) => [...m, { san: result.san, ok: true, note: "forces simplification" }]);

      // Automatically play opponent's forced recapture
      setTimeout(() => {
        const replyFrom = scenario.blackReplyLan.slice(0, 2);
        const replyTo = scenario.blackReplyLan.slice(2, 4);

        const replyResult = chess.move({ from: replyFrom, to: replyTo });
        if (replyResult) {
          setCurrentFen(chess.fen());
          setMoves((m) => [
            ...m,
            { san: replyResult.san, ok: true, note: "forced trade response" },
          ]);
          setIsCompleted(true);
        }
      }, 400);

      return true;
    } else {
      // Non-simplifying move or misses the trade
      const result = chess.move({ from, to });
      if (!result) return false;

      setCurrentFen(chess.fen());
      setMoves((m) => [
        ...m,
        { san: result.san, ok: false, note: "keeps complexity / misses trade" },
      ]);
      return true;
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Middlegame · 3c"
        title="Simplification Training"
        description="You're winning. Now trade into an endgame you can't lose."
        right={
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-success/15 px-3 py-1.5 font-mono text-sm font-semibold text-success">
              +{scenario.eval.toFixed(1)}
            </span>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[600px] space-y-3">
          <ChessBoard fen={currentFen} onMove={onMove} />

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={resetPosition}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Reset
            </Button>
            <Button variant="outline" size="sm" onClick={nextScenario}>
              Next Scenario <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <DataSourceBadge>
            {
              "// ANTIGRAVITY DATA SOURCE: Scan Master games that passed through my openings, filter for moments where one side achieves a clear advantage (+1.5 to +3.0) and executes a forced series of trades/simplifications to liquidize into a winning endgame."
            }
          </DataSourceBadge>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Why simplify?" icon={<Info className="h-4 w-4 text-primary" />}>
              <div className="mb-3 text-xs font-semibold text-foreground">{scenario.title}</div>
              <ul className="space-y-3 text-sm">
                {scenario.reasons.map((r) => (
                  <li
                    key={r}
                    className="border-l-2 border-primary pl-3 text-xs text-muted-foreground"
                  >
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-md bg-secondary p-2 text-xs text-muted-foreground font-mono">
                Target: {scenario.target}
              </p>
            </Panel>

            <Panel title="Trade tracker" icon={<ArrowRightLeft className="h-4 w-4 text-success" />}>
              {moves.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4">
                  Make a move on the board to initiate the liquidation sequence.
                </p>
              ) : (
                <ol className="space-y-2 font-mono text-sm">
                  {moves.map((m, i) => (
                    <li
                      key={i}
                      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs animate-in fade-in ${
                        m.ok ? "bg-success/10 text-success" : "bg-mistake/10 text-mistake"
                      }`}
                    >
                      <span className="font-semibold">{m.san}</span>
                      <span className="text-[11px] opacity-90">{m.note}</span>
                    </li>
                  ))}
                </ol>
              )}

              {isCompleted ? (
                <div className="mt-4 flex items-center gap-2 rounded-md bg-success/15 p-2.5 text-xs font-semibold text-success animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Target endgame reached! Clean
                  conversion.
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" /> Goal: trade into the target endgame.
                </p>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
