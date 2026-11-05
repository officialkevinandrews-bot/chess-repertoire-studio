import { Chess, type Square } from "chess.js";
import { type TacticalMotif } from "../engine/stockfishTypes";
import { analyzePositionMotifs } from "./chessMotifs";

export interface McqOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface StrategicMcq {
  question: string;
  moveSan: string;
  options: McqOption[];
  correctOptionId: string;
  category:
    "tactic" | "recapture" | "pawn_structure" | "prophylaxis" | "piece_activity" | "king_safety";
  summary: string;
}

interface McqGenerationInput {
  fenBefore: string;
  fenAfter: string;
  moveSan: string;
  lastMoveUci?: { from: string; to: string };
  motifs?: TacticalMotif[];
  perspective: "white" | "black";
}

/**
 * Dynamically generates a strategic multiple-choice question (MCQ) for the played move.
 * Generates 1 authentic grandmaster rationale and 3 plausible, high-level chess distractors.
 */
export function generateStrategicMcq(input: McqGenerationInput): StrategicMcq {
  const { fenBefore, fenAfter, moveSan, lastMoveUci, perspective } = input;
  const chessBefore = new Chess(fenBefore);
  const chessAfter = new Chess(fenAfter);

  // Parse move details
  const legalMoves = chessBefore.moves({ verbose: true });
  const playedMove =
    legalMoves.find((m) => m.san === moveSan) ||
    legalMoves.find((m) => lastMoveUci && m.from === lastMoveUci.from && m.to === lastMoveUci.to) ||
    legalMoves[0];

  const motifs =
    input.motifs && input.motifs.length > 0
      ? input.motifs
      : analyzePositionMotifs(fenAfter, [], lastMoveUci);

  let category: StrategicMcq["category"] = "piece_activity";
  let correctText = "";
  let correctExplanation = "";

  // 1. Check for Castling (King Safety)
  if (moveSan === "O-O" || moveSan === "O-O-O") {
    category = "king_safety";
    correctText =
      moveSan === "O-O"
        ? "Tucks the King into kingside safety and connects the rooks for middlegame coordination."
        : "Castles queenside to safeguard the King while aggressively aiming the rook down the central files.";
    correctExplanation =
      "Castling safeguards your monarch from central tactics and activates your back-rank rooks.";
  }
  // 2. Check for Multiple Recaptures
  else if (playedMove?.captured) {
    category = "recapture";
    const targetSq = playedMove.to;
    // Check if other friendly pieces could also capture on the same square
    const otherRecaptures = legalMoves.filter((m) => m.to === targetSq && m.san !== moveSan);

    if (otherRecaptures.length > 0) {
      if (playedMove.piece === "n") {
        correctText = `Recapturing with the Knight centralizes an active minor piece without damaging pawn structure.`;
        correctExplanation = `Using the Knight preserves a pristine pawn structure and establishes a commanding central presence.`;
      } else if (playedMove.piece === "b") {
        correctText = `Recapturing with the Bishop keeps long-diagonal pressure without exposing the Queen early.`;
        correctExplanation = `Bishop recapture maintains piece fluidity and avoids presenting a tempo target for opposing pawns.`;
      } else if (playedMove.piece === "p") {
        correctText = `Recapturing with the pawn solidifies central space control and opens a file for piece play.`;
        correctExplanation = `Pawn recaptures towards the center maintain territorial integrity and open adjacent lines for rooks.`;
      } else if (playedMove.piece === "q") {
        correctText = `Recapturing with the Queen exerts immediate central dominance and attacks unguarded enemy points.`;
        correctExplanation = `Queen recapture seizes the center with maximum power and demands an immediate defensive response.`;
      } else {
        correctText = `Recapturing with the Rook activates heavy artillery on an open file.`;
        correctExplanation = `Rook recapture controls the open vertical file and prepares rook infiltration.`;
      }
    } else {
      correctText = `Restores immediate material balance by capturing the opposing piece on ${targetSq}.`;
      correctExplanation = `An essential tactical exchange that prevents falling behind in decisive material count.`;
    }
  }
  // 3. Tactical Motifs (Fork, Pin, Skewer, Discovery, Deflection)
  else if (motifs.length > 0) {
    category = "tactic";
    const primaryMotif = motifs[0];

    if (primaryMotif.type === "fork") {
      correctText = `Forks multiple enemy pieces simultaneously, forcing a winning material exchange.`;
      correctExplanation = `A direct double-attack creates two simultaneous threats that the opponent cannot resolve in a single tempo.`;
    } else if (primaryMotif.type === "pin") {
      correctText = `Pins an opposing piece against a higher-value target, immobilizing their defense.`;
      correctExplanation = `Pinning freezes the defending piece along the ray, making it an easy target to pile pressure on.`;
    } else if (primaryMotif.type === "skewer") {
      correctText = `Skewers a high-value piece, forcing it to vacate and allowing capture of the piece behind it.`;
      correctExplanation = `A skewer attacks through the frontline piece directly onto a vulnerable rear piece.`;
    } else if (primaryMotif.type === "discovered_attack") {
      correctText = `Unmasks a lethal discovered attack by stepping the front piece away with tempo.`;
      correctExplanation = `Moving the masking piece unleashes the hidden power of the long-range slider behind it.`;
    } else if (primaryMotif.type === "deflection") {
      correctText = `Deflects an essential defender away from guarding a critical square or piece.`;
      correctExplanation = `Overloading and deflecting the key guardian shatters the opponent's defensive perimeter.`;
    } else {
      correctText = `Creates immediate tactical threats that seize tempo and disrupt opposing plans.`;
      correctExplanation = `Active tactical pressure prevents the opponent from consolidating their position.`;
    }
  }
  // 4. Central Pawn Breaks and Structure
  else if (playedMove?.piece === "p") {
    category = "pawn_structure";
    const dest = playedMove.to;
    if (["d4", "d5", "e4", "e5", "c4", "c5", "f4", "f5"].includes(dest)) {
      correctText = `Strikes at the center to challenge the opponent's spatial grip and open lines of attack.`;
      correctExplanation = `Central pawn breaks are the primary vehicle to alter position dynamics and unleash piece activity.`;
    } else if (["a3", "h3", "a6", "h6"].includes(dest)) {
      category = "prophylaxis";
      correctText = `Creates a prophylactic flight square ('luft') for the King and neutralizes enemy piece outposts on the flank.`;
      correctExplanation = `Preventing annoying minor piece pins or back-rank mates before launching offensive maneuvers is hallmark grandmaster technique.`;
    } else {
      correctText = `Restructures the pawn chain to support central outposts and restrict enemy knight infiltration.`;
      correctExplanation = `Pawn pushes dictate the terrain and deny enemy pieces access to key forward squares.`;
    }
  }
  // 5. Piece Activation & Open File Domination
  else if (playedMove?.piece === "r") {
    category = "piece_activity";
    correctText = `Occupies an open or semi-open file to exert heavy pressure down the vertical board.`;
    correctExplanation = `Rooks belong on open files where their long-range scope cuts the board in half and pressures the 7th rank.`;
  }
  // 6. Knight / Bishop Outpost
  else if (playedMove?.piece === "n" || playedMove?.piece === "b") {
    category = "piece_activity";
    correctText = `Relocates the minor piece to an active, well-defended square with strong central influence.`;
    correctExplanation = `Piece harmonization ensures every piece works as a unified army targeting enemy weaknesses.`;
  }
  // 7. General Prophylactic / Improving Move
  else {
    category = "prophylaxis";
    correctText = `A deep prophylactic improvement that consolidates piece defense and prepares future piece coordination.`;
    correctExplanation = `Grandmasters prioritize eliminating subtle opponent resources before committing to irreversible pawn moves.`;
  }

  // Plausible Distractor Pool (filtered by context)
  const distractorPool: { text: string; explanation: string }[] = [
    {
      text: "Sacrifices an exchange to demolish the opponent's pawn shelter around the King.",
      explanation:
        "No material sacrifice was offered on this move; this is an over-aggressive tactical misconception.",
    },
    {
      text: "Launches an immediate minority attack on the queenside to isolate the c6/c3 pawn.",
      explanation:
        "A minority attack requires advancing flank pawns (a/b pawns) against a queenside pawn majority.",
    },
    {
      text: "Liquidates all active major pieces to seek an immediate dead-drawn endgame.",
      explanation:
        "This move is designed to heighten middlegame tension, not force peaceful liquidation.",
    },
    {
      text: "Prepares an immediate f4/f5 king hunt at the cost of abandoning central space.",
      explanation:
        "Flank attacks without adequate central security violate foundational opening principles.",
    },
    {
      text: "Sets up an ambush to trap the opponent's queen in the center.",
      explanation:
        "The queen is not in immediate danger of being surrounded or trapped on this file.",
    },
    {
      text: "Over-defends an unthreatened pawn to enter passive defense.",
      explanation:
        "Grandmaster play seeks dynamic activity and counter-punches rather than passive guarding.",
    },
    {
      text: "Pins the opponent's knight to win the exchange on the next move.",
      explanation: "There is no pin or skewer executed by this move.",
    },
    {
      text: "Rushes to trade off the dark-squared bishop to create opposite-colored bishop draws.",
      explanation:
        "Preserving piece complexity is preferable when holding initiative or positional advantage.",
    },
  ];

  // Pick 3 distractors that do not overlap with the correct text
  const selectedDistractors = distractorPool.filter((d) => d.text !== correctText).slice(0, 3);

  // Assemble and shuffle options
  const rawOptions: McqOption[] = [
    {
      id: "correct-opt",
      text: correctText,
      isCorrect: true,
      explanation: correctExplanation,
    },
    ...selectedDistractors.map((d, idx) => ({
      id: `distractor-${idx + 1}`,
      text: d.text,
      isCorrect: false,
      explanation: d.explanation,
    })),
  ];

  // Deterministic or pseudo-random shuffle
  const shuffled = rawOptions.sort(() => Math.random() - 0.5);

  return {
    question: `Why was ${moveSan} chosen here?`,
    moveSan,
    options: shuffled,
    correctOptionId: "correct-opt",
    category,
    summary: correctText,
  };
}
