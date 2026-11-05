export type MoveQualityTier =
  "exact_master" | "super_gm_find" | "engine_equivalent" | "inaccuracy" | "blunder";

export interface RelativeScoreEvaluation {
  tier: MoveQualityTier;
  title: string;
  baseScore: number;
  deltaPawns: number;
  isAcceptableMove: boolean;
  userEvalNormalized: number;
  masterEvalNormalized: number;
  explanation: string;
}

export interface ScoreInputParams {
  userMoveSan: string;
  masterMoveSan: string;
  bestEngineMoveSan: string;
  userEvalWhitePawns: number;
  masterEvalWhitePawns: number;
  bestEngineEvalWhitePawns?: number;
  userPerspective: "white" | "black";
}

/**
 * Normalizes centipawn/pawn evaluations so higher is always better for the user's color.
 */
export function normalizeEvalToPerspective(
  evalWhitePawns: number,
  perspective: "white" | "black",
): number {
  return perspective === "white" ? evalWhitePawns : -evalWhitePawns;
}

/**
 * Intelligent Evaluation Matrix & Relative Scoring:
 * Compares the user's move evaluation to the historical master move from the perspective of the user.
 */
export function evaluateUserMoveRelative(params: ScoreInputParams): RelativeScoreEvaluation {
  const {
    userMoveSan,
    masterMoveSan,
    bestEngineMoveSan,
    userEvalWhitePawns,
    masterEvalWhitePawns,
    userPerspective,
  } = params;

  const userEvalNorm = normalizeEvalToPerspective(userEvalWhitePawns, userPerspective);
  const masterEvalNorm = normalizeEvalToPerspective(masterEvalWhitePawns, userPerspective);
  const delta = Number((userEvalNorm - masterEvalNorm).toFixed(2));

  // Clean SAN representation comparison (e.g. "Nf3" vs "Nf3+", "O-O" vs "0-0")
  const cleanUser = userMoveSan.replace(/[+#x]/g, "").trim();
  const cleanMaster = masterMoveSan.replace(/[+#x]/g, "").trim();
  const cleanEngine = bestEngineMoveSan.replace(/[+#x]/g, "").trim();

  // Tier 1: Exact Master Match (+10 pts)
  if (cleanUser === cleanMaster) {
    return {
      tier: "exact_master",
      title: "Master Move!",
      baseScore: 10,
      deltaPawns: 0,
      isAcceptableMove: true,
      userEvalNormalized: userEvalNorm,
      masterEvalNormalized: masterEvalNorm,
      explanation: `You matched the historical grandmaster move ${masterMoveSan}.`,
    };
  }

  // Tier 2: Super-Grandmaster Find (> +0.50 pawns superior) (+15 pts)
  if (delta >= 0.5) {
    return {
      tier: "super_gm_find",
      title: "Super-GM Find!",
      baseScore: 15,
      deltaPawns: delta,
      isAcceptableMove: true,
      userEvalNormalized: userEvalNorm,
      masterEvalNormalized: masterEvalNorm,
      explanation: `Outstanding! Your move ${userMoveSan} is evaluated +${delta.toFixed(2)} pawns stronger than the master's ${masterMoveSan}.`,
    };
  }

  // Tier 3: Engine Equivalent (+/- 0.15 pawns or top engine line) (+10 pts)
  const isClose = Math.abs(delta) <= 0.15;
  const isTopEngine = cleanUser === cleanEngine && delta >= -0.25;
  const bothDecisivelyWinning = userEvalNorm >= 4.0 && masterEvalNorm >= 4.0 && delta >= -0.5;

  if (isClose || isTopEngine || bothDecisivelyWinning) {
    return {
      tier: "engine_equivalent",
      title: "Engine Equivalent!",
      baseScore: 10,
      deltaPawns: delta,
      isAcceptableMove: true,
      userEvalNormalized: userEvalNorm,
      masterEvalNormalized: masterEvalNorm,
      explanation: `Excellent choice! ${userMoveSan} maintains optimal engine evaluation (${delta >= 0 ? "+" : ""}${delta.toFixed(2)} vs master move ${masterMoveSan}).`,
    };
  }

  // Tier 4: Inaccuracy / Mistake (-0.50 to -1.50 pawns drop) (+3 pts)
  if (delta > -1.5) {
    return {
      tier: "inaccuracy",
      title: "Inaccuracy / Mistake",
      baseScore: 3,
      deltaPawns: delta,
      isAcceptableMove: false,
      userEvalNormalized: userEvalNorm,
      masterEvalNormalized: masterEvalNorm,
      explanation: `${userMoveSan} drops ${Math.abs(delta).toFixed(2)} pawns compared to the master's ${masterMoveSan}. Review the tactical drawback.`,
    };
  }

  // Tier 5: Blunder (> -1.50 pawns drop) (0 pts)
  return {
    tier: "blunder",
    title: "Blunder",
    baseScore: 0,
    deltaPawns: delta,
    isAcceptableMove: false,
    userEvalNormalized: userEvalNorm,
    masterEvalNormalized: masterEvalNorm,
    explanation: `${userMoveSan} loses ${Math.abs(delta).toFixed(2)} pawns of evaluation. The master played ${masterMoveSan}.`,
  };
}
