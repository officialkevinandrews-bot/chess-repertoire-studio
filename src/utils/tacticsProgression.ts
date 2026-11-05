import {
  TACTICAL_MOTIFS,
  TACTICAL_TIERS,
  type TacticalMotif,
  type TacticalTierLevel,
  type TacticsGlobalProgress,
  type TacticsPuzzleItem,
} from "../services/repertoireStorage";

export type MotifTierStatus =
  | "cleared"
  | "in_progress"
  | "in_remedial"
  | "exempt" // Exempt / No Low-Level Puzzles
  | "awaiting_higher_tier";

export interface MotifStatusSummary {
  motif: TacticalMotif;
  tier: TacticalTierLevel;
  status: MotifTierStatus;
  statusLabel: string;
  puzzleCount: number;
  currentStreak: number;
  remedialCount: number;
  isPassed: boolean;
  canTrainNow: boolean;
}

export interface GlobalTierProgressSummary {
  activeTier: TacticalTierLevel;
  tierName: string;
  totalMotifsCount: number;
  populatedMotifsCount: number;
  exemptMotifsCount: number;
  clearedMotifsCount: number;
  canUnlockNextTier: boolean;
  progressPct: number;
  overallRatingDisplay: string;
  isCalibrated: boolean;
  motifs: Record<TacticalMotif, MotifStatusSummary>;
}

/**
 * Evaluates the Global Tier status and Empty-Level Bypassing across all 16 motifs.
 */
export function evaluateGlobalTierProgress(
  progress: TacticsGlobalProgress,
  availablePuzzles: TacticsPuzzleItem[],
): GlobalTierProgressSummary {
  const activeTier = progress.activeGlobalTier;
  const tierDef = TACTICAL_TIERS[activeTier];

  // Count available puzzles per motif at the active global tier
  const puzzleCountsByMotif: Record<TacticalMotif, number> = {} as any;
  for (const m of TACTICAL_MOTIFS) {
    puzzleCountsByMotif[m] = 0;
  }
  for (const p of availablePuzzles) {
    if (p.tierLevel === activeTier) {
      puzzleCountsByMotif[p.primaryMotif] = (puzzleCountsByMotif[p.primaryMotif] || 0) + 1;
    }
  }

  const motifSummaries: Record<TacticalMotif, MotifStatusSummary> = {} as any;
  let populatedCount = 0;
  let exemptCount = 0;
  let clearedCount = 0;

  for (const m of TACTICAL_MOTIFS) {
    const userM = progress.motifProgress[m];
    const pCount = puzzleCountsByMotif[m] || 0;
    const isCleared = userM?.clearedLevels?.includes(activeTier) || false;
    const hasRemedial = (userM?.remedialQueue?.length || 0) > 0;

    let status: MotifTierStatus = "in_progress";
    let statusLabel = `${userM?.currentStreak || 0}/20 Streak`;
    let isPassed = false;
    let canTrainNow = true;

    if (pCount === 0) {
      // ADAPTIVE EMPTY-LEVEL BYPASSING:
      // If a complex motif has 0 puzzles at this level, exempt it and count as passed!
      status = "exempt";
      statusLabel = "Exempt / No Low-Level Puzzles";
      isPassed = true;
      canTrainNow = false;
      exemptCount++;
    } else {
      populatedCount++;
      if (isCleared || (userM?.currentStreak >= 20 && !hasRemedial)) {
        status = "cleared";
        statusLabel = "Level Cleared (20/20)";
        isPassed = true;
        clearedCount++;
      } else if (hasRemedial) {
        status = "in_remedial";
        statusLabel = `Remedial Queue (${userM.remedialQueue.length} left)`;
        isPassed = false;
      } else {
        status = "in_progress";
        statusLabel = `${userM?.currentStreak || 0}/20 Streak`;
        isPassed = false;
      }
    }

    motifSummaries[m] = {
      motif: m,
      tier: activeTier,
      status,
      statusLabel,
      puzzleCount: pCount,
      currentStreak: userM?.currentStreak || 0,
      remedialCount: userM?.remedialQueue?.length || 0,
      isPassed,
      canTrainNow,
    };
  }

  // Next tier is unlocked when ALL populated (non-exempt) motifs are cleared
  const totalRequiredToClear = Math.max(populatedCount, 1);
  const canUnlockNextTier = clearedCount >= totalRequiredToClear && activeTier < 9;
  const progressPct = Math.min(100, Math.round((clearedCount / totalRequiredToClear) * 100));

  // Overall rating calculation: average of all 16 motif ratings
  let sumRatings = 0;
  let exploredCount = 0;
  for (const m of TACTICAL_MOTIFS) {
    const userM = progress.motifProgress[m];
    sumRatings += userM?.rating || 1200;
    if ((userM?.attempts || 0) > 0) {
      exploredCount++;
    }
  }

  const averageRating = Math.round(sumRatings / 16);
  // Calibration rule: calibrated when user has completed at least 1 cycle in active motifs
  const isCalibrated = exploredCount >= Math.min(populatedCount, 4);
  const overallRatingDisplay = isCalibrated ? `${averageRating}` : "Calibrating...";

  return {
    activeTier,
    tierName: tierDef.name,
    totalMotifsCount: 16,
    populatedMotifsCount: populatedCount,
    exemptMotifsCount: exemptCount,
    clearedMotifsCount: clearedCount,
    canUnlockNextTier,
    progressPct,
    overallRatingDisplay,
    isCalibrated,
    motifs: motifSummaries,
  };
}

/**
 * Advances the user's active tier to the next level if qualified.
 */
export function unlockNextGlobalTier(
  progress: TacticsGlobalProgress,
  summary: GlobalTierProgressSummary,
): TacticsGlobalProgress {
  if (!summary.canUnlockNextTier) return progress;

  const nextTier = (progress.activeGlobalTier + 1) as TacticalTierLevel;
  return {
    ...progress,
    activeGlobalTier: Math.min(9, nextTier) as TacticalTierLevel,
  };
}
