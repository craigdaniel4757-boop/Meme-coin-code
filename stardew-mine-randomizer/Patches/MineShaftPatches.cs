using System;
using StardewModdingAPI;
using StardewValley;
using StardewValley.Locations;
using StardewValley.Objects;

namespace MineRandomizer.Patches
{
    /// <summary>
    /// Harmony patches around <see cref="MineShaft.loadLevel(int)"/>, the vanilla method that
    /// generates a mine floor's tileset, ore nodes, monster/treasure rolls, and chests.
    ///
    /// Instead of re-implementing any of that generation logic (which would mean hard-coding a
    /// pile of internal item IDs we can't verify from outside the game), we hand the original
    /// method a "virtual" depth instead of the real one for the duration of the call. Vanilla
    /// code picks the tileset, ore mix, monster chance, and treasure/chest odds purely from that
    /// depth value, so feeding it a shuffled number makes all of those vary together, using
    /// entirely vanilla logic. The real depth is restored immediately afterward so progression,
    /// the elevator, the on-screen floor counter, and ladder-down math are unaffected.
    /// </summary>
    internal static class MineShaftPatches
    {
        private const int RegularMineMax = 120;
        private const int SkullCavernStart = 121;

        /// <summary>Sanity bound - anything outside this range is treated as a special/one-off mine variant and left untouched.</summary>
        private const int MaxPlausibleLevel = 200;

        internal static void LoadLevel_Prefix(MineShaft __instance, ref int level, out int __state)
        {
            __state = level;

            if (!ModEntry.Config.EnableFloorRandomization || level <= 0 || level > MaxPlausibleLevel)
                return;

            try
            {
                int virtualLevel = GetVirtualLevel(level);
                if (virtualLevel != level)
                {
                    level = virtualLevel;
                    __instance.mineLevel = virtualLevel;
                }
            }
            catch (Exception ex)
            {
                ModEntry.ModMonitor.Log($"Floor randomization skipped for level {level}: {ex}", LogLevel.Trace);
            }
        }

        internal static void LoadLevel_Postfix(MineShaft __instance, int __state)
        {
            try
            {
                // Restore the real depth so the elevator, floor counter, and "go down a ladder"
                // math all key off the player's true progress rather than the shuffled one.
                if (__instance.mineLevel != __state)
                    __instance.mineLevel = __state;

                if (ModEntry.Config.EnableChestLootRandomization)
                    RerollChestLoot(__instance, __state);
            }
            catch (Exception ex)
            {
                ModEntry.ModMonitor.Log($"Post-generation cleanup failed for level {__state}: {ex}", LogLevel.Trace);
            }
        }

        private static int GetVirtualLevel(int realLevel)
        {
            ModConfig config = ModEntry.Config;
            Random rng = CreateSeededRandom(realLevel, "floor");

            bool isSkullCavern = realLevel >= SkullCavernStart;
            if (isSkullCavern)
            {
                if (!config.RandomizeSkullCavern)
                    return realLevel;

                int drift = Math.Max(0, config.SkullCavernDriftRange);
                int min = Math.Max(SkullCavernStart, realLevel - drift);
                int max = realLevel + drift;
                return min >= max ? realLevel : rng.Next(min, max + 1);
            }

            int lo = 1;
            int hi = RegularMineMax;
            if (config.MaxFloorDrift > 0)
            {
                lo = Math.Max(1, realLevel - config.MaxFloorDrift);
                hi = Math.Min(RegularMineMax, realLevel + config.MaxFloorDrift);
            }

            return lo >= hi ? realLevel : rng.Next(lo, hi + 1);
        }

        private static void RerollChestLoot(MineShaft mine, int realLevel)
        {
            ModConfig config = ModEntry.Config;
            if (config.ChestRerollChance <= 0)
                return;

            Random rng = CreateSeededRandom(realLevel, "chest");
            int variance = Math.Max(0, config.ChestLootDepthVariance);
            int upperClamp = realLevel >= SkullCavernStart ? realLevel + variance : RegularMineMax;

            foreach (var pair in mine.Objects.Pairs)
            {
                if (pair.Value is not Chest chest)
                    continue;

                if (rng.NextDouble() > config.ChestRerollChance)
                    continue;

                int lootLevel = Math.Clamp(realLevel + rng.Next(-variance, variance + 1), 1, upperClamp);

                Item? newItem = rng.NextDouble() < 0.15
                    ? MineShaft.getTreasureRoomItem()
                    : MineShaft.getSpecialItemForThisMineLevel(lootLevel, (int)pair.Key.X, (int)pair.Key.Y);

                if (newItem == null)
                    continue;

                chest.items.Clear();
                chest.items.Add(newItem);
            }
        }

        private static Random CreateSeededRandom(int realLevel, string salt)
        {
            ModConfig config = ModEntry.Config;

            int daySeed = config.ShuffleMode == FloorShuffleMode.PerSave ? 0 : (int)Game1.stats.DaysPlayed;
            int visitSeed = config.ShuffleMode == FloorShuffleMode.PerVisit ? Game1.ticks : 0;

            unchecked
            {
                int seed = (int)Game1.uniqueIDForThisGame;
                seed = seed * 397 ^ realLevel;
                seed = seed * 397 ^ daySeed;
                seed = seed * 397 ^ visitSeed;
                seed = seed * 397 ^ config.ExtraRandomSeed;
                seed = seed * 397 ^ salt.GetHashCode();
                return new Random(seed);
            }
        }
    }
}
