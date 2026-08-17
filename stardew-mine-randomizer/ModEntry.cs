using System;
using System.Reflection;
using HarmonyLib;
using MineRandomizer.Patches;
using StardewModdingAPI;
using StardewModdingAPI.Events;
using StardewValley;
using StardewValley.Locations;

namespace MineRandomizer
{
    public class ModEntry : Mod
    {
        /// <summary>How many ticks to ignore Warped events for after we trigger our own redirect, so we don't mistake its own follow-on warp(s) for a new fresh entry. ~1.5 seconds at 60 ticks/sec.</summary>
        private const int EntryCooldownTicks = 90;

        public static ModConfig Config { get; private set; } = null!;
        public static IMonitor ModMonitor { get; private set; } = null!;

        private bool _pendingEntryWarp;
        private int _pendingTargetLevel;
        private int _ignoreEntryUntilTick;
        private bool _hasRandomizedEntryToday;

        public override void Entry(IModHelper helper)
        {
            Config = helper.ReadConfig<ModConfig>();
            ModMonitor = this.Monitor;

            this.ApplyHarmonyPatches();

            helper.Events.GameLoop.DayStarted += this.OnDayStarted;
            helper.Events.Player.Warped += this.OnWarped;
            helper.Events.GameLoop.UpdateTicked += this.OnUpdateTicked;

            helper.ConsoleCommands.Add(
                "mine_reroll_seed",
                "Rerolls Mine Randomizer's random seed, so floors/loot shuffle differently from now on.\n\nUsage: mine_reroll_seed",
                this.OnRerollSeedCommand
            );
        }

        private void ApplyHarmonyPatches()
        {
            var harmony = new Harmony(this.ModManifest.UniqueID);
            try
            {
                MethodInfo? target = AccessTools.Method(typeof(MineShaft), nameof(MineShaft.loadLevel));
                if (target == null)
                {
                    this.LogPatchFailure(null);
                    return;
                }

                harmony.Patch(
                    original: target,
                    prefix: new HarmonyMethod(typeof(MineShaftPatches), nameof(MineShaftPatches.LoadLevel_Prefix)),
                    postfix: new HarmonyMethod(typeof(MineShaftPatches), nameof(MineShaftPatches.LoadLevel_Postfix))
                );
            }
            catch (Exception ex)
            {
                this.LogPatchFailure(ex);
            }
        }

        private void LogPatchFailure(Exception? ex)
        {
            this.Monitor.Log(
                "Couldn't patch MineShaft.loadLevel - floor, ore, and chest-loot randomization will be disabled this session. " +
                "This usually means the game updated and the mod needs an update too." + (ex == null ? "" : "\n" + ex),
                LogLevel.Error
            );
        }

        private void OnDayStarted(object? sender, DayStartedEventArgs e)
        {
            this._hasRandomizedEntryToday = false;
        }

        private void OnWarped(object? sender, WarpedEventArgs e)
        {
            if (!e.IsLocalPlayer || !Config.EnableEntryFloorRandomization)
                return;

            // Ignore warps for a bit after we trigger our own redirect below - Game1.enterMine may
            // itself warp the player through one or more intermediate locations, and we don't want
            // to mistake any of those for a brand new fresh entry and redirect again.
            if (Game1.ticks < this._ignoreEntryUntilTick)
                return;

            // A "fresh entry" is walking into a mine shaft from anywhere that isn't already one -
            // that covers the entrance building, but not going down a ladder or riding the elevator
            // to a specific floor you picked on purpose.
            if (e.NewLocation is not MineShaft || e.OldLocation is MineShaft)
                return;

            if (!Config.RandomizeEveryEntry && this._hasRandomizedEntryToday)
                return;

            int target = ChooseEntryLevel();
            if (target <= 0)
                return;

            this._pendingTargetLevel = target;
            this._pendingEntryWarp = true;
            this._hasRandomizedEntryToday = true;
        }

        private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
        {
            if (!this._pendingEntryWarp)
                return;

            this._pendingEntryWarp = false;

            // Deferred to the next tick so we're not re-entering the warp system from inside
            // the event it just raised, which the game doesn't expect.
            this._ignoreEntryUntilTick = Game1.ticks + EntryCooldownTicks;
            try
            {
                Game1.enterMine(this._pendingTargetLevel);
            }
            catch (Exception ex)
            {
                this.Monitor.Log($"Failed to warp to randomized mine level {this._pendingTargetLevel}:\n{ex}", LogLevel.Error);
            }
        }

        private static int ChooseEntryLevel()
        {
            int deepest = Math.Max(1, Game1.player.deepestMineLevel);
            int upperBound = Config.AllowEntryBeyondDeepestLevel
                ? Config.MaxEntryFloorHardCap
                : Math.Min(Config.MaxEntryFloorHardCap, deepest + Config.EntryFloorBufferBeyondDeepest);
            upperBound = Math.Max(1, upperBound);

            var rng = new Random(unchecked(
                (int)Game1.uniqueIDForThisGame
                ^ (int)Game1.stats.DaysPlayed * 7919
                ^ Config.ExtraRandomSeed
                ^ Game1.ticks
            ));
            return rng.Next(1, upperBound + 1);
        }

        private void OnRerollSeedCommand(string command, string[] args)
        {
            Config.ExtraRandomSeed = new Random().Next();
            this.Helper.WriteConfig(Config);
            this.Monitor.Log(
                $"New random seed saved ({Config.ExtraRandomSeed}). Leave and re-enter mine floors to see the new layouts.",
                LogLevel.Info
            );
        }
    }
}
