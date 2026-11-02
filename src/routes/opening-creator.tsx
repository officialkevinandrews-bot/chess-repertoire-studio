import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FlipVertical2, RotateCcw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { DataSourceBadge, MoveList, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { useChessTraining } from "@/context/useChessTraining";

export const Route = createFileRoute("/opening-creator")({
  head: () => ({
    meta: [
      { title: "Opening Creator — Chess Buddy" },
      { name: "description", content: "Build repertoire lines move by move and save them as training loops." },
      { property: "og:title", content: "Opening Creator — Chess Buddy" },
      { property: "og:description", content: "Build repertoire lines move by move and save them as training loops." },
    ],
  }),
  component: OpeningCreator,
});

function OpeningCreator() {
  const { fen, history, orientation, makeMove, undo, reset, flip, saveVariation } = useChessTraining();
  const [name, setName] = useState("");
  const [exported, setExported] = useState<string | null>(null);

  const save = () => {
    const v = saveVariation(name || `Line ${new Date().toLocaleTimeString()}`);
    setExported(v.finalFen); // Final FEN handed to Antigravity's scrapers.
    toast.success("Variation saved", { description: "Training loop queued." });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Workshop" title="Opening Creator" description="Play out your line on the board. Every move is recorded." />
      <TrainingLayout board={<ChessBoard fen={fen} orientation={orientation} onMove={makeMove} />}>
        <Panel title="Move list"><MoveList moves={history} /></Panel>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => reset()}><RotateCcw /> Reset</Button>
          <Button variant="secondary" onClick={undo}><Undo2 /> Undo</Button>
          <Button variant="secondary" onClick={flip}><FlipVertical2 /> Flip</Button>
        </div>
        <Input placeholder="Variation name (e.g. Najdorf 6.Be3)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="lg" className="h-12 text-base" onClick={save}><Save /> Save Variation & Generate Loop</Button>
        {exported && (
          <Panel title="Exported FEN">
            <code className="block break-all font-mono text-xs text-success">{exported}</code>
          </Panel>
        )}
        <DataSourceBadge kind="hook">{"// ANTIGRAVITY HOOK: On save, send finalFen to scrapers (puzzles, master games, endgames)."}</DataSourceBadge>
      </TrainingLayout>
    </div>
  );
}
