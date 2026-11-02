import type { EngineAnalysisResult, TacticalMotif } from "../engine/stockfishTypes";

export type MoveClassification =
  "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface ExplanationContext {
  fenBefore: string;
  fenAfter: string;
  userMoveSan: string;
  userMoveFromTo: { from: string; to: string };
  bestMoveSan: string;
  bestMoveFromTo?: { from: string; to: string };
  analysis: EngineAnalysisResult;
  evalDiffPawns: number; // e.g. -1.5 if user blundered 1.5 pawns
  classification: MoveClassification;
}

export function classifyMoveQuality(
  evalDiffPawns: number,
  isBestMove: boolean,
): MoveClassification {
  if (isBestMove || Math.abs(evalDiffPawns) <= 0.1) return "best";
  if (evalDiffPawns >= -0.3) return "excellent";
  if (evalDiffPawns >= -0.7) return "good";
  if (evalDiffPawns >= -1.5) return "inaccuracy";
  if (evalDiffPawns >= -2.5) return "mistake";
  return "blunder";
}

export interface PromptTemplateResult {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Builds a structured, high-context prompt for an LLM to generate plain-English
 * Grandmaster coaching feedback explaining why a move is good or bad.
 */
export function buildExplanationPrompt(ctx: ExplanationContext): PromptTemplateResult {
  const motifsSummary =
    ctx.analysis.motifs.length > 0
      ? ctx.analysis.motifs.map((m: TacticalMotif) => `- ${m.name}: ${m.description}`).join("\n")
      : "No immediate tactical motifs detected; play is positional.";

  const mateSummary = ctx.analysis.mateAnalysis.hasMate
    ? `Forced Checkmate: ${ctx.analysis.mateAnalysis.sideMating} has forced mate in ${ctx.analysis.mateAnalysis.mateInMoves} moves along line: ${ctx.analysis.mateAnalysis.matingLineSan.join(" ")}.`
    : "No forced checkmate in top engine lines.";

  const top3Lines = ctx.analysis.lines
    .slice(0, 3)
    .map(
      (l, i) =>
        `#${i + 1}: ${l.sanPv.slice(0, 4).join(" ")} (${l.score.type === "mate" ? `Mate in ${l.score.mateMoves}` : `${(l.score.scoreCp / 100).toFixed(2)}`})`,
    )
    .join(" | ");

  const systemPrompt = `You are a supportive, high-level Chess Grandmaster and coach.
Your job is to explain chess positions and moves in accessible, educational plain English.
Never recite raw centipawns or engine math. Instead, translate engine calculations into concrete chess concepts:
center control, king safety, piece coordination, tactical motifs (pins, forks, skewers, discovered attacks, deflections), and pawn structure.
Keep explanations concise (2 to 3 sentences maximum), engaging, and encouraging.`;

  const userPrompt = `Position Context:
- FEN: ${ctx.fenBefore}
- User played: ${ctx.userMoveSan} (Quality: ${ctx.classification.toUpperCase()})
- Engine Best Move: ${ctx.bestMoveSan}
- Evaluation Swing: ${ctx.evalDiffPawns > 0 ? "+" : ""}${ctx.evalDiffPawns.toFixed(2)} pawns
- Tactical Profile: ${ctx.analysis.profile.profile.toUpperCase()} (${ctx.analysis.profile.reasoning})
- Tactical Motifs Found:
${motifsSummary}
- Checkmate Status: ${mateSummary}
- Engine Top 3 Recommendations: ${top3Lines}

Task:
Explain to the player why ${ctx.userMoveSan} was a ${ctx.classification} compared to the recommended move ${ctx.bestMoveSan}.
Highlight any tactical motif or strategic plan they executed or overlooked.`;

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * Generates an instant, client-side, zero-latency plain-English explanation
 * using deterministic chess logic and motif analysis when no external LLM API is available.
 */
export function generateLocalExplanation(ctx: ExplanationContext): string {
  const { userMoveSan, bestMoveSan, classification, analysis, evalDiffPawns } = ctx;
  const isMate = analysis.mateAnalysis.hasMate;
  const motifs = analysis.motifs;

  if (classification === "best") {
    if (isMate && analysis.mateAnalysis.mateInMoves) {
      return `Outstanding move! ${userMoveSan} initiates the forced checkmate sequence (mate in ${analysis.mateAnalysis.mateInMoves}).`;
    }
    if (motifs.length > 0) {
      return `Excellent precision! ${userMoveSan} creates an active ${motifs[0].name.toLowerCase()} that immediately puts pressure on your opponent.`;
    }
    if (analysis.profile.profile === "quiet_positional") {
      return `Great positional move. ${userMoveSan} quietly optimizes your piece harmony in a calm, strategic position.`;
    }
    return `Strong, accurate move! ${userMoveSan} preserves your initiative and aligns with the best Grandmaster lines.`;
  }

  // If user played a move that missed a mate
  if (isMate && analysis.mateAnalysis.sideMating) {
    const mateIn = analysis.mateAnalysis.mateInMoves;
    return `${userMoveSan} is an oversight (${classification}). You had a forced checkmate in ${mateIn} move${mateIn === 1 ? "" : "s"} starting with ${bestMoveSan}! Always look for forcing checks when the enemy king is vulnerable.`;
  }

  // If a tactical motif was overlooked
  if (motifs.length > 0) {
    const topMotif = motifs[0];
    return `${userMoveSan} allows a tactical counter (${classification}, ${evalDiffPawns.toFixed(1)} pawns). The position contained a ${topMotif.name}: ${topMotif.description}. The engine preferred ${bestMoveSan} to maintain control.`;
  }

  // Positional inaccuracies
  if (classification === "inaccuracy") {
    return `${userMoveSan} is slightly inaccurate. While playable, ${bestMoveSan} gives you better piece activity and centralized control.`;
  }

  if (classification === "mistake" || classification === "blunder") {
    return `${userMoveSan} is a ${classification} (${evalDiffPawns.toFixed(1)} pawns). It concedes key squares or leaves an attack open. Finding ${bestMoveSan} would have preserved your advantage.`;
  }

  return `${userMoveSan} is decent, but ${bestMoveSan} was slightly more precise for piece activity.`;
}
