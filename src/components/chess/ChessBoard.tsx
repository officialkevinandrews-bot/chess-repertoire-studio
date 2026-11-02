import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { Orientation } from "@/context/useChessTraining";

// react-chessboard is browser-only; load it after hydration.
const LazyBoard = lazy(() => import("react-chessboard").then((m) => ({ default: m.Chessboard })));

interface Props {
  fen: string;
  orientation?: Orientation;
  /** Return true if the move was accepted. Omit for a read-only board. */
  onMove?: (from: string, to: string) => boolean;
  /** Squares to highlight, e.g. { e4: "threat" }. */
  highlights?: Record<string, "threat" | "good" | "info">;
}

const HL = {
  threat: "color-mix(in oklab, var(--mistake) 55%, transparent)",
  good: "color-mix(in oklab, var(--success) 55%, transparent)",
  info: "color-mix(in oklab, var(--primary) 50%, transparent)",
};

export function ChessBoard({ fen, orientation = "white", onMove, highlights = {} }: Props) {
  const squareStyles = Object.fromEntries(
    Object.entries(highlights).map(([sq, k]) => [sq, { background: HL[k] }]),
  );
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
              darkSquareStyle: { backgroundColor: "var(--board-dark)" },
              lightSquareStyle: { backgroundColor: "var(--board-light)" },
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                onMove && targetSquare ? onMove(sourceSquare, targetSquare) : false,
            }}
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
