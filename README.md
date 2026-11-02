# Chess Repertoire Studio

Project Name: Chess Buddy

Please build the comprehensive UI shell and frontend aesthetic for a highly personalized Chess Repertoire Training Application called "Chess Buddy".

CRITICAL INSTRUCTION: Focus entirely on a beautiful, responsive user interface, smooth layouts, page navigation, and mock UI states. Do not implement live API calls, Stockfish web-workers, or backend logic yet. Instead, write clean, highly documented React/TypeScript code with obvious placeholder variables, clear component structures, and state management hooks so that a secondary AI tool (Antigravity) can seamlessly inject the deep backend features later.

### 1. Visual Theme & Feel

- Use a modern, dark-mode aesthetic (deep slates, charcoal, with vibrant accent colors like emerald green for correct moves, crimson for mistakes, and a clean electric blue for system highlights).
- Make sure the UI feels premium, clean, and highly scannable, using smooth animations for transitions between sections.

### 2. Main Navigation & Layout

Build a persistent sidebar navigation that splits the application into the following key pages and sub-sections:

1. **Dashboard & Repertoire Manager:** The central hub for overall progress, stats, and a breakdown of created variations.
2. **Opening Creator:** The workshop page where users build their lines.
3. **Middlegame Training Sub-Suite:** (This must expand into 4 distinct, selectable sub-pages):
   - 3a. **Tactics Training**
   - 3b. **Guess the Move (Master Game Play)**
   - 3c. **Simplification Training**
   - 3d. **Defensive Drills**
4. **Endgame Laboratory:** The training environment for Section 5 (Theoretical & Practical).

### 3. Page Specific Requirements (Frontend Components Only)

#### Page 1 & 2: Dashboard & Opening Creator

- **Dashboard:** Create clean analytics cards: "Mastery Score", "Lines Trained", "Endgames Solved".
- **Opening Creator:** Embed an interactive chessboard placeholder layout. Include a move-list sidebar tracking PGN moves, control buttons [Reset, Undo, Flip], and a prominent **"Save Variation & Generate Loop"** button that exports the final FEN string state for Antigravity's future scrapers.

#### Page 3: Middlegame Training Sub-Suite (4 Distinct Interfaces)

- **3a. Tactics Training:** Layout features a large chessboard and a tracking sidebar.
  - _UI Content:_ Include a prominent UI badge or code comment block stating: `// ANTIGRAVITY DATA SOURCE: Filter Lichess open-source puzzle database by matching Opening Tags or target FEN positions.`

- **3b. Guess the Move:** A simulation dashboard. Features a large chessboard on one side and an interactive sidebar layout.
  - _UI Content:_ Build a clean mockup template for a **Multiple-Choice Concept Check** (a prompt card text box with 4 clean, selectable multiple-choice buttons) to confirm the user understands the strategic idea behind the move. Include a "Grandmaster Insights & Feedback" container for text explanations.
  - _UI Content:_ Include a prominent UI badge or code comment block stating: `// ANTIGRAVITY DATA SOURCE: Pull full Grandmaster games matching the Opening Creator's FEN, starting the guess-the-move loop from move 10-12 onward.`

- **3c. Simplification Training:** Designed to teach players how to transition from a winning middlegame into a winning endgame. Layout features a chessboard and a two-column sidebar feedback loop.
  - _UI Content:_ Column 1 features an explanation card detailing _why_ the user needs to simplify here (e.g., trading active enemy pieces, removing counterplay). Column 2 tracks the moves played to ensure they actively steer the board into a winning endgame format.
  - _UI Content:_ Include a prominent UI badge or code comment block stating: `// ANTIGRAVITY DATA SOURCE: Scan Master games that passed through my openings, filter for moments where one side achieves a clear advantage (+1.5 to +3.0) and executes a forced series of trades/simplifications to liquidize into a winning endgame.`

- **3d. Defensive Drills:** A high-pressure tactical/positional training layout. The board always initializes from the perspective of defending against a threat or holding a tough position.
  - _UI Content:_ Include a "Threat Tracker" warning panel in the UI that displays hints or highlights direct enemy threats that must be diffused.
  - _UI Content:_ Include a prominent UI badge or code comment block stating: `// ANTIGRAVITY DATA SOURCE: Scrape puzzles and games within these openings where the player is worse, defending against an attack, or fighting for an equalizer.`

#### Page 4: Endgame Laboratory

- Create a toggle switch at the top of the page: [Theoretical Endgames] vs. [Practical Endgames].
- **Theoretical View:** A sidebar menu listing classic categories (e.g., King & Pawn, Lucena Position, Philidor) with play-vs-bot triggers.
  - _UI Content:_ `// ANTIGRAVITY HOOK: Connect to Syzygy Tablebase API for perfect endgame evaluation and Stockfish bot defense.`
- **Practical View:** A playlist-style view of games scraped from real endings belonging to my openings, labeled with their objective (e.g., "Target: Force a Draw" or "Target: Convert the Win").
- **Demonstration Mode UI:** A collapsible container overlay that activates on failure, showing step-by-step optimal moves alongside automated text annotations explaining the mechanics.

### 4. Code Architecture Rules for Hand-off to Antigravity

- Use standard, highly compatible chessboard libraries if applicable (like `react-chessboard` or similar simple visual board shells).
- Wrap all chessboard moves and evaluations inside a centralized, clearly commented React Context file (`useChessTraining.ts`).
- Wherever Stockfish or an API will be needed, leave an explicit comment: `// ANTIGRAVITY HOOK: Inject Stockfish UCI / Lichess API integration here.`

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/662190b5-17fa-40c1-b517-cc0877d811a0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
