import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EnginePVLine } from "@/engine/stockfishTypes";
import { ENGINE_ARROW_COLORS } from "./ui";

interface EngineLineExplorerProps {
  line: EnginePVLine;
  rank: number;
  currentStep: number;
  totalSteps: number;
  sanMoves: string[];
  onStepChange: (step: number) => void;
  onPlayMove: () => void;
  onClose: () => void;
}

export function EngineLineExplorer({
  line,
  rank,
  currentStep,
  totalSteps,
  sanMoves,
  onStepChange,
  onPlayMove,
  onClose,
}: EngineLineExplorerProps) {
  const colorDef = ENGINE_ARROW_COLORS[rank - 1] || ENGINE_ARROW_COLORS[0];
  const evalFormatted =
    line.score.type === "mate"
      ? `#${line.score.mateMoves}`
      : `${line.score.scoreCp > 0 ? "+" : ""}${(line.score.scoreCp / 100).toFixed(2)}`;

  return (
    <div className="rounded-xl border border-primary/40 bg-card/95 p-3.5 shadow-lg backdrop-blur space-y-3 animate-in fade-in slide-in-from-top-2">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-bold border",
              colorDef.badgeClass,
            )}
          >
            Line #{rank}
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            Eval: {evalFormatted}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title="Exit Line Preview"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Move-by-Move Clickable Chips */}
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto py-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => onStepChange(0)}
          className={cn(
            "rounded px-2 py-1 text-xs font-semibold transition-colors",
            currentStep === 0
              ? "bg-primary text-primary-foreground shadow"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          Start
        </button>
        {sanMoves.map((san, idx) => {
          const stepNum = idx + 1;
          const isWhiteMove = idx % 2 === 0;
          const moveNumber = Math.floor(idx / 2) + 1;
          const isCurrent = currentStep === stepNum;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onStepChange(stepNum)}
              className={cn(
                "rounded px-2 py-1 text-xs font-semibold transition-colors flex items-center gap-1",
                isCurrent
                  ? "bg-primary text-primary-foreground shadow ring-1 ring-primary-foreground/30 font-bold"
                  : "bg-secondary/60 text-secondary-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {isWhiteMove && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  {moveNumber}.
                </span>
              )}
              {!isWhiteMove && idx === 0 && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  {moveNumber}...
                </span>
              )}
              {san}
            </button>
          );
        })}
      </div>

      {/* Stepping Navigation Bar */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={currentStep <= 0}
            onClick={() => onStepChange(0)}
            title="First Move"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            disabled={currentStep <= 0}
            onClick={() => onStepChange(Math.max(0, currentStep - 1))}
            title="Previous Move"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            disabled={currentStep >= totalSteps}
            onClick={() => onStepChange(Math.min(totalSteps, currentStep + 1))}
            title="Next Move"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={currentStep >= totalSteps}
            onClick={() => onStepChange(totalSteps)}
            title="Last Move"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3 text-xs font-semibold shadow-sm"
            onClick={onPlayMove}
            title={`Play ${line.bestMoveSan} on the board`}
          >
            <Play className="h-3 w-3 mr-1 fill-current" /> Play {line.bestMoveSan}
          </Button>
        </div>
      </div>
    </div>
  );
}
