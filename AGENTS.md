<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture

- All board state/moves/evals go through `src/context/useChessTraining.ts`; engine/API work is injected there (marked `ANTIGRAVITY HOOK`) so pages stay presentational.
- Placeholder data lives in `src/lib/mock-data.ts`; replace exports with real sources without changing their shapes.
- react-chessboard is lazy-loaded behind ClientOnly in `src/components/chess/ChessBoard.tsx` because it is browser-only.
