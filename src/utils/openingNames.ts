/**
 * Opening Names and ECO Code Detector
 * Maps initial move sequences to standard chess opening names and ECO codes.
 */

export interface RecognizedOpening {
  eco: string;
  name: string;
  variation?: string;
}

const OPENING_DATABASE: { moves: string[]; eco: string; name: string }[] = [
  // Sicilian Defense
  {
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
    eco: "B90",
    name: "Sicilian Defense: Najdorf Variation",
  },
  {
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"],
    eco: "B70",
    name: "Sicilian Defense: Dragon Variation",
  },
  {
    moves: ["e4", "c5", "Nf3", "e6", "d4", "cxd4", "Nxd4", "a6"],
    eco: "B41",
    name: "Sicilian Defense: Kan Variation",
  },
  {
    moves: ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4"],
    eco: "B32",
    name: "Sicilian Defense: Open",
  },
  { moves: ["e4", "c5", "c3"], eco: "B22", name: "Sicilian Defense: Alapin Variation" },
  { moves: ["e4", "c5", "Nc3"], eco: "B23", name: "Sicilian Defense: Closed" },
  { moves: ["e4", "c5"], eco: "B20", name: "Sicilian Defense" },

  // Ruy Lopez & Italian Game
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"],
    eco: "C84",
    name: "Ruy Lopez: Closed",
  },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], eco: "C70", name: "Ruy Lopez: Morphy Defense" },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"],
    eco: "C65",
    name: "Ruy Lopez: Berlin Defense",
  },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"], eco: "C60", name: "Ruy Lopez" },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
    eco: "C50",
    name: "Giuoco Piano (Italian Game)",
  },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
    eco: "C55",
    name: "Italian Game: Two Knights Defense",
  },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"], eco: "C50", name: "Italian Game" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "d4"], eco: "C44", name: "Scotch Game" },
  { moves: ["e4", "e5", "Nf3", "Nf6"], eco: "C42", name: "Petrov's Defense" },
  { moves: ["e4", "e5"], eco: "C20", name: "Open Game (King's Pawn)" },

  // French & Caro-Kann
  { moves: ["e4", "e6", "d4", "d5", "e5"], eco: "C02", name: "French Defense: Advance Variation" },
  { moves: ["e4", "e6", "d4", "d5", "Nc3"], eco: "C10", name: "French Defense: Paulsen Variation" },
  {
    moves: ["e4", "e6", "d4", "d5", "Nd2"],
    eco: "C03",
    name: "French Defense: Tarrasch Variation",
  },
  { moves: ["e4", "e6"], eco: "C00", name: "French Defense" },
  {
    moves: ["e4", "c6", "d4", "d5", "e5"],
    eco: "B12",
    name: "Caro-Kann Defense: Advance Variation",
  },
  {
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4"],
    eco: "B18",
    name: "Caro-Kann Defense: Classical",
  },
  { moves: ["e4", "c6"], eco: "B10", name: "Caro-Kann Defense" },

  // Queen's Gambit & Indian Defenses
  { moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6"], eco: "D30", name: "Queen's Gambit Declined" },
  { moves: ["d4", "d5", "c4", "c6"], eco: "D10", name: "Slav Defense" },
  { moves: ["d4", "d5", "c4", "dxc4"], eco: "D20", name: "Queen's Gambit Accepted" },
  { moves: ["d4", "d5", "c4"], eco: "D06", name: "Queen's Gambit" },
  { moves: ["d4", "d5", "Nf3", "Nf6", "Bf4"], eco: "D02", name: "London System" },
  { moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"], eco: "E60", name: "King's Indian Defense" },
  { moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"], eco: "E20", name: "Nimzo-Indian Defense" },
  { moves: ["d4", "Nf6", "c4", "c5", "d5"], eco: "A56", name: "Benoni Defense" },
  { moves: ["d4", "Nf6"], eco: "A45", name: "Indian Defense" },
  { moves: ["d4", "d5"], eco: "D00", name: "Queen's Pawn Game" },

  // Pirc Defense
  {
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "f4"],
    eco: "B09",
    name: "Pirc Defense: Austrian Attack",
  },
  {
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7"],
    eco: "B08",
    name: "Pirc Defense: Classical Variation",
  },
  {
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Bg5"],
    eco: "B07",
    name: "Pirc Defense: Byrne Variation",
  },
  {
    moves: ["e4", "d6", "d4", "Nf6"],
    eco: "B07",
    name: "Pirc Defense",
  },

  // King's Indian Attack (via 1. e4 and 1. Nf3 move orders)
  {
    moves: ["e4", "e6", "d3", "d5", "Nd2", "Nf6", "Ngf3", "c5", "g3"],
    eco: "A08",
    name: "King's Indian Attack: French / Fischer Variation",
  },
  {
    moves: ["e4", "e6", "d3", "d5", "Nd2"],
    eco: "C00",
    name: "King's Indian Attack: French Variation",
  },
  {
    moves: ["e4", "e6", "d3"],
    eco: "C00",
    name: "King's Indian Attack: vs French Setup",
  },
  {
    moves: ["e4", "c5", "Nf3", "e6", "d3"],
    eco: "B20",
    name: "King's Indian Attack: Sicilian Variation",
  },
  {
    moves: ["e4", "c5", "d3"],
    eco: "B20",
    name: "King's Indian Attack: vs Sicilian Setup",
  },
  {
    moves: ["e4", "c6", "d3", "d5", "Nd2"],
    eco: "B10",
    name: "King's Indian Attack: Caro-Kann Variation",
  },
  {
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "c5", "O-O", "Nc6", "d3", "e6", "Nbd2", "Be7", "e4", "O-O", "Re1", "b5", "e5", "Nd7", "Nf1", "a5", "h4"],
    eco: "A08",
    name: "King's Indian Attack: Fischer Kingside Storm",
  },
  {
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "c5", "O-O", "Nc6", "d3", "e6", "Nbd2"],
    eco: "A08",
    name: "King's Indian Attack: Yugoslav / Spassky Variation",
  },
  {
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O", "Be7", "d3", "O-O", "Nbd2", "c5", "e4"],
    eco: "A07",
    name: "King's Indian Attack: French Setup (1. Nf3)",
  },
  {
    moves: ["Nf3", "d5", "g3", "c5", "Bg2"],
    eco: "A08",
    name: "King's Indian Attack: Sicilian / Spassky Variation",
  },
  {
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "Bg4", "O-O", "Nbd7", "d3", "e6", "Nbd2", "Bd6", "h3"],
    eco: "A07",
    name: "King's Indian Attack: Keres Variation (Active h3 Plan)",
  },
  {
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "Bg4", "O-O", "Nbd7", "d3", "e6", "Nbd2", "Bd6", "c3"],
    eco: "A07",
    name: "King's Indian Attack: Keres Variation (Solid c3 Plan)",
  },
  {
    moves: ["Nf3", "d5", "g3", "Bg4"],
    eco: "A07",
    name: "King's Indian Attack: Keres Variation",
  },
  {
    moves: ["Nf3", "d5", "g3", "Bf5"],
    eco: "A07",
    name: "King's Indian Attack: vs ...Bf5 Setup",
  },
  {
    moves: ["Nf3", "Nf6", "g3", "g6", "Bg2", "Bg7", "O-O", "O-O", "d3"],
    eco: "A07",
    name: "King's Indian Attack: Symmetrical Variation",
  },
  {
    moves: ["Nf3", "Nf6", "g3", "b6", "Bg2", "Bb7"],
    eco: "A07",
    name: "King's Indian Attack: Queen's Indian Setup",
  },
  {
    moves: ["Nf3", "d5", "g3"],
    eco: "A07",
    name: "King's Indian Attack (Barcza System)",
  },
  {
    moves: ["Nf3", "Nf6", "g3"],
    eco: "A04",
    name: "King's Indian Attack: Flexible Fianchetto",
  },

  // Flank Openings
  { moves: ["c4", "e5"], eco: "A20", name: "English Opening: King's English" },
  { moves: ["c4"], eco: "A10", name: "English Opening" },
  { moves: ["Nf3"], eco: "A04", name: "Réti / King's Indian Attack" },
];

/**
 * Identify the closest opening name and ECO code from a list of SAN moves.
 */
export function identifyOpening(moves: string[]): RecognizedOpening {
  if (!moves || moves.length === 0) {
    return { eco: "A00", name: "Starting Position" };
  }

  // Find longest matching prefix
  let bestMatch: { moves: string[]; eco: string; name: string } | null = null;
  let maxMatched = 0;

  for (const entry of OPENING_DATABASE) {
    if (entry.moves.length <= moves.length) {
      const matches = entry.moves.every((m, idx) => m.toLowerCase() === moves[idx].toLowerCase());
      if (matches && entry.moves.length > maxMatched) {
        bestMatch = entry;
        maxMatched = entry.moves.length;
      }
    }
  }

  if (bestMatch) {
    return {
      eco: bestMatch.eco,
      name: bestMatch.name,
    };
  }

  return {
    eco: "A00",
    name: `Custom Line (${moves.slice(0, 3).join(" ")})`,
  };
}
