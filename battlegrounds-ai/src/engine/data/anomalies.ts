import type { AnomalyDef } from "@/engine/types";

export const ANOMALY_DEFS: AnomalyDef[] = [
  {
    id: "anomaly-bountiful-tavern",
    name: "Bountiful Tavern",
    text: "Refreshing the Tavern is always free.",
    refreshFree: true,
  },
  {
    id: "anomaly-rising-costs",
    name: "Rising Costs",
    text: "Minions cost 1 more Gold.",
    buyCostDelta: 1,
  },
  {
    id: "anomaly-discount-tavern",
    name: "Discount Tavern",
    text: "Minions cost 1 less Gold.",
    buyCostDelta: -1,
  },
  {
    id: "anomaly-eager-apprentices",
    name: "Eager Apprentices",
    text: "Everyone starts the game at Tavern Tier 2.",
    startingTier: 2,
  },
  {
    id: "anomaly-overflowing-coffers",
    name: "Overflowing Coffers",
    text: "Your maximum Gold each turn is 1 higher than usual.",
    goldCapDelta: 1,
  },
  {
    id: "anomaly-steep-ambition",
    name: "Steep Ambition",
    text: "Upgrading your Tavern costs 2 more Gold.",
    upgradeCostDelta: 2,
  },
  {
    id: "anomaly-apprentice-rates",
    name: "Apprentice Rates",
    text: "Upgrading your Tavern costs 2 less Gold.",
    upgradeCostDelta: -2,
  },
  {
    id: "anomaly-calm-waters",
    name: "Calm Waters",
    text: "No unusual magic is in the air tonight — a standard lobby.",
  },
];

export function pickAnomaly(rngInt: (n: number) => number): AnomalyDef {
  return ANOMALY_DEFS[rngInt(ANOMALY_DEFS.length)];
}
