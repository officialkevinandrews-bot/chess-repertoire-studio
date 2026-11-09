import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { Orientation } from "@/context/useChessTraining";

// react-chessboard is browser-only; load it after hydration.
const LazyBoard = lazy(() => import("react-chessboard").then((m) => ({ default: m.Chessboard })));

export interface BoardArrow {
  startSquare: string;
  endSquare: string;
  color: string;
}

interface Props {
  fen: string;
  orientation?: Orientation;
  /** Return true if the move was accepted. Omit for a read-only board. */
  onMove?: (from: string, to: string) => boolean | Promise<boolean>;
  /** Optional last-move highlight. */
  lastMoveHighlight?: { from: string; to: string } | null;
  /** Squares to highlight, e.g. { e4: "threat" }. */
  highlights?: Record<string, "threat" | "good" | "info">;
  /** Colored candidate move arrows (e.g. MultiPV engine analysis) */
  arrows?: BoardArrow[];
  onSquareClick?: (square: string) => void;
}

const HL = {
  threat: "color-mix(in oklab, var(--mistake) 55%, transparent)",
  good: "color-mix(in oklab, var(--success) 55%, transparent)",
  info: "color-mix(in oklab, var(--primary) 50%, transparent)",
};

export function ChessBoard({
  fen,
  orientation = "white",
  onMove,
  highlights = {},
  arrows = [],
  onSquareClick,
  lastMoveHighlight,
}: Props) {
  const squareStyles: Record<string, { background: string }> = Object.fromEntries(
    Object.entries(highlights).map(([sq, k]) => [sq, { background: HL[k] }]),
  );
  if (lastMoveHighlight) {
    const bg = "color-mix(in oklab, var(--primary) 30%, transparent)";
    squareStyles[lastMoveHighlight.from] ??= { background: bg };
    squareStyles[lastMoveHighlight.to] ??= { background: bg };
  }
  const placeholder = <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />;
  return (
    <div className="w-full overflow-hidden rounded-xl shadow-[var(--shadow-board)] ring-1 ring-border">
      <ClientOnly fallback={placeholder}>
        <Suspense fallback={placeholder}>
          <LazyBoard
            options={{
              position: fen,
              boardOrientation: orientation,
              allowDragging: !!onMove,
              squareStyles,
              arrows,
              darkSquareStyle: { backgroundColor: "var(--board-dark)" },
              lightSquareStyle: { backgroundColor: "var(--board-light)" },
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                {
                if (!onMove || !targetSquare) return false;
                const r = onMove(sourceSquare, targetSquare);
                return typeof r === "boolean" ? r : true;
              },
              onSquareClick: onSquareClick ? ({ square }) => onSquareClick(square) : undefined,
            }}
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
