import {
  TACTICAL_TIERS,
  type TacticalTierDef,
  type TacticalTierLevel,
  type TacticalTierName,
} from "../services/repertoireStorage";

/**
 * Classifies a tactical combination into exactly one of the 9 named difficulty levels
 * based on composite scoring between Lichess rating difficulty and forcing move depth.
 */
export function classifyTacticalTier(
  rating: number,
  moveCountOrPlies: number,
): { tierLevel: TacticalTierLevel; tierName: TacticalTierName; tierDef: TacticalTierDef } {
  // Normalize plies to full moves (e.g. 2 plies = 1 full move)
  const fullMoves = moveCountOrPlies > 6 ? Math.round(moveCountOrPlies / 2) : moveCountOrPlies;

  let level: TacticalTierLevel = 1;

  if (rating < 1000 && fullMoves <= 1) {
    level = 1;
  } else if (rating < 1300 && fullMoves <= 2) {
    level = 2;
  } else if (rating < 1500 && fullMoves <= 2) {
    level = 3;
  } else if (rating < 1700 && fullMoves <= 3) {
    level = 4;
  } else if (rating < 1900 && fullMoves <= 3) {
    level = 5;
  } else if (rating < 2100 && fullMoves <= 4) {
    level = 6;
  } else if (rating < 2300 && fullMoves <= 4) {
    level = 7;
  } else if (rating < 2500 && fullMoves <= 5) {
    level = 8;
  } else {
    level = 9;
  }

  // Fallback rating boundaries if moves diverge
  if (rating >= 2500) level = 9;
  else if (rating >= 2300 && level < 8) level = 8;
  else if (rating >= 2100 && level < 7) level = 7;
  else if (rating >= 1900 && level < 6) level = 6;
  else if (rating >= 1700 && level < 5) level = 5;
  else if (rating >= 1500 && level < 4) level = 4;
  else if (rating >= 1300 && level < 3) level = 3;
  else if (rating >= 1000 && level < 2) level = 2;

  const def = TACTICAL_TIERS[level];
  return {
    tierLevel: level,
    tierName: def.name,
    tierDef: def,
  };
}

/**
 * Returns user descriptive badge for a motif's rating or attempts status.
 */
export function getMotifDisplayBadge(
  attempts: number,
  rating: number,
  isAwaitingHigherTier: boolean,
): { badge: string; isExplored: boolean; tone: string } {
  if (isAwaitingHigherTier) {
    return {
      badge: "Awaiting Higher Tier",
      isExplored: false,
      tone: "bg-muted text-muted-foreground border-border",
    };
  }

  if (attempts === 0) {
    return {
      badge: "Not Yet Explored",
      isExplored: false,
      tone: "bg-secondary text-muted-foreground border-border",
    };
  }

  // If explored, map current rating to its named skill tier
  const { tierName } = classifyTacticalTier(rating, 2);
  return {
    badge: tierName,
    isExplored: true,
    tone: "bg-primary/15 text-primary border-primary/30",
  };
}
