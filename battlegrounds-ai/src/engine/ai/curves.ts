const EXPECTED_TIER_BY_ROUND = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];

export function expectedTierForRound(round: number): number {
  const idx = Math.min(EXPECTED_TIER_BY_ROUND.length - 1, Math.max(0, round - 1));
  return EXPECTED_TIER_BY_ROUND[idx];
}

export function expectedStatsForRound(round: number): number {
  return 1.5 + round * 3.1;
}
