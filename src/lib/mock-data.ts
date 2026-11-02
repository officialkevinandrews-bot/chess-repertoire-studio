/**
 * MOCK DATA — every export here is a placeholder to be replaced by Antigravity
 * with real scraped/engine data. Shapes are the contract the UI expects.
 */

export const dashboardStats = { masteryScore: 72, linesTrained: 148, endgamesSolved: 37 };

export const repertoire = [
  { name: "Ruy Lopez — Closed", color: "white", lines: 24, mastery: 86 },
  { name: "Sicilian Najdorf — English Attack", color: "black", lines: 31, mastery: 64 },
  { name: "Queen's Gambit Declined", color: "white", lines: 18, mastery: 78 },
  { name: "Caro-Kann — Advance", color: "black", lines: 12, mastery: 41 },
];

export const tacticsPuzzle = {
  id: "lichess-0001",
  fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
  theme: "Fork",
  rating: 1640,
  opening: "Italian Game",
};

export const guessTheMove = {
  game: "Carlsen – Caruana, Stavanger 2023",
  fen: "r2q1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 11",
  moveNumber: 11,
  question: "What is the strategic idea behind White's move cxd5?",
  options: [
    { id: "a", text: "Create an isolated queen's pawn for Black to target", correct: false },
    { id: "b", text: "Fix Black's structure and open the c-file for the rooks", correct: true },
    { id: "c", text: "Prepare an immediate kingside pawn storm", correct: false },
    { id: "d", text: "Win material by force on d5", correct: false },
  ],
  insight:
    "Grandmasters exchange on d5 here to define the pawn structure early. With the c-file half-open, White's rooks gain a natural target on c7, and Black's light-squared bishop remains passive behind the e6 pawn.",
};

export const simplification = {
  fen: "3r2k1/pp3ppp/2n5/8/3R4/2P2N2/PP3PPP/6K1 w - - 0 24",
  eval: 2.1,
  reasons: [
    "Trade Black's only active piece — the rook on d8 controls the open file.",
    "Removing rooks kills counterplay against your queenside pawns.",
    "The resulting knight endgame with a queenside majority is a technical win.",
  ],
  target: "Knight endgame, +2 pawns majority",
};

export const defense = {
  fen: "r4rk1/pp3ppp/2p5/4q3/2P1n3/1P2P2b/PB1QBPPP/R4RK1 w - - 0 18",
  threats: [
    { square: "g2", label: "Qxg2# — mate threat on g2" },
    { square: "f2", label: "Nxf2 forks rook and king" },
  ],
};

export const theoreticalEndgames = [
  { id: "kp", name: "King & Pawn", desc: "Opposition, key squares, rule of the square", fen: "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1" },
  { id: "lucena", name: "Lucena Position", desc: "Build a bridge to promote", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1" },
  { id: "philidor", name: "Philidor Position", desc: "Third-rank defense to hold the draw", fen: "4k3/8/r7/4PK2/8/8/8/4R3 b - - 0 1" },
  { id: "vancura", name: "Vancura Position", desc: "Side-attack vs. rook pawn", fen: "8/8/R7/P7/5k2/8/r7/6K1 b - - 0 1" },
  { id: "bn", name: "Bishop & Knight Mate", desc: "Drive the king to the right corner", fen: "8/8/8/4k3/8/8/8/4KBN1 w - - 0 1" },
];

export const practicalEndgames = [
  { id: "p1", title: "Ruy Lopez → Rook endgame", players: "Anand – Kramnik, 2008", target: "Convert the Win", fen: "8/5pk1/6p1/R7/5P2/6P1/r5K1/8 w - - 0 45" },
  { id: "p2", title: "Najdorf → Opposite bishops", players: "Topalov – Giri, 2016", target: "Force a Draw", fen: "8/5k2/4bp2/p7/P1B2K2/8/8/8 b - - 0 52" },
  { id: "p3", title: "QGD → Minor piece ending", players: "Ding – Nepomniachtchi, 2023", target: "Convert the Win", fen: "8/p4k2/1p2n3/8/1P2N3/P4K2/8/8 w - - 0 40" },
  { id: "p4", title: "Caro-Kann → Pawn race", players: "Karpov – Kasparov, 1985", target: "Force a Draw", fen: "8/8/1p6/1Pk5/8/4K3/7p/8 w - - 0 60" },
];

export const demonstrationSteps = [
  { move: "1. Rd1+", note: "Check first — push the defending king off the queening file." },
  { move: "1... Ke7", note: "Forced. The king steps away from the promotion square." },
  { move: "2. Rd4!", note: "Build the bridge: the rook goes to the 4th rank to shield against checks." },
  { move: "2... Rc2", note: "Black waits; checks from behind will run out." },
  { move: "3. Kc7", note: "The king emerges; the rook on d4 will block the next checks." },
];
