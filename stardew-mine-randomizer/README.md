# Mine Randomizer

A [SMAPI](https://smapi.io/) mod for Stardew Valley 1.6 that randomizes the mines:

- **Floor identity is shuffled.** Each floor's tileset (dirt/frost/lava/desert), ore-node mix, monster-infested chance, and treasure-floor chance all normally depend purely on how deep you are. This mod feeds the game's own floor generator a randomized "virtual" depth instead of your real depth, so floor 3 might generate like vanilla floor 90 while floor 40 might generate like vanilla floor 12. Your real progress (elevator unlocks, the floor counter, ladder-down math, Skull Cavern access) is untouched — only what gets *generated* is shuffled.
- **Chest loot is re-rolled.** Chests found on mine floors have a configurable chance to have their contents replaced with a different depth-appropriate vanilla reward.
- **You can spawn on a random floor.** Walking into the mine entrance can drop you on a random floor instead of always floor 1 (or your last elevator stop).

## How it works (and why it's safe)

Rather than reimplementing the game's ore/loot tables — which would mean hard-coding a pile of internal item IDs that are impossible to verify from outside the game — this mod uses [Harmony](https://harmony.pardeike.net/) to wrap `MineShaft.loadLevel`, the vanilla method that generates a floor, and temporarily substitutes a randomized depth value before handing control to the original vanilla code. Vanilla decides the tileset, ore mix, monsters, and treasure chance from that depth exactly as it always does — it just believes it's generating a different floor than it really is. The real depth is restored the instant generation finishes, so anything depending on your true progress is unaffected. Chest re-rolling similarly calls the game's own `MineShaft.getSpecialItemForThisMineLevel` / `getTreasureRoomItem` methods rather than picking from a hard-coded item list.

The one exception is spawn-floor randomization, which uses the same `Game1.enterMine(level)` call SMAPI's own built-in `world_setminelevel` console command uses.

## Building

This project isn't a standalone program — it compiles against your Stardew Valley install via [`Pathoschild.Stardew.ModBuildConfig`](https://www.nuget.org/packages/Pathoschild.Stardew.ModBuildConfig), which auto-detects the game folder (or reads a `GamePath` from a `.env`/MSBuild property if it can't). You'll need:

- [SMAPI](https://smapi.io/) installed
- .NET 6 SDK
- Stardew Valley 1.6+

Then, from this folder:

```sh
dotnet build
```

This restores the NuGet packages (including Harmony, via `EnableHarmony`), compiles the mod, and copies it into your `Mods` folder automatically. Launch the game through SMAPI as usual.

> **Note on verification:** this was written and cross-checked against publicly available decompiled 1.6 source and real published mods' source (to confirm method names/signatures like `MineShaft.loadLevel`, `Game1.enterMine`, `Chest.items`, etc.), and the C# itself was compiled clean against hand-written stubs matching those signatures. It has **not** been compiled or run against the real game — this environment doesn't have a Stardew Valley install to build or test against. Please do a test build and a short in-game playtest before trusting it in a save you care about; if any Harmony patch target has moved in a newer game version, the mod is written to log a clear SMAPI error and disable itself gracefully rather than crash.

## Config

SMAPI generates `config.json` next to the DLL the first time you run the mod. All options:

| Option | Default | What it does |
|---|---|---|
| `EnableFloorRandomization` | `true` | Master switch for shuffled floor generation (theme/ore/monsters/treasure). |
| `ShuffleMode` | `PerDay` | `PerVisit` reshuffles a floor every time you step on it; `PerDay` keeps a floor consistent for the in-game day; `PerSave` fixes it for the whole save. |
| `MaxFloorDrift` | `0` | How many levels a regular floor (1-120) can be shuffled away from its real depth. `0` = fully random across 1-120. |
| `RandomizeSkullCavern` | `true` | Whether Skull Cavern floors (121+) are shuffled too. |
| `SkullCavernDriftRange` | `25` | How far (either direction) a Skull Cavern floor can drift from its real depth. |
| `EnableEntryFloorRandomization` | `true` | Master switch for spawning on a random floor when you walk into the mine. |
| `RandomizeEveryEntry` | `true` | If `false`, only the first entry each day is randomized. |
| `AllowEntryBeyondDeepestLevel` | `false` | If `true`, you can spawn deeper than any floor you've actually reached. |
| `EntryFloorBufferBeyondDeepest` | `5` | How far past your deepest floor you can spawn when the option above is `false`. |
| `MaxEntryFloorHardCap` | `120` | Absolute ceiling for a randomized entry floor. |
| `EnableChestLootRandomization` | `true` | Master switch for re-rolling chest contents. |
| `ChestRerollChance` | `0.5` | Chance (0.0-1.0) any given chest gets re-rolled. |
| `ChestLootDepthVariance` | `40` | How far the "depth" used to pick loot can wander from the chest's real floor. |
| `ExtraRandomSeed` | `0` | Mixed into every random roll this mod makes. Change it for a completely different shuffle. |

## Console command

- `mine_reroll_seed` — picks a new `ExtraRandomSeed`, saves it to `config.json`, and logs the new value. Floors you re-enter afterward will shuffle differently.

## Multiplayer

Stardew Valley's mine floors are generated by the host, so this mod's floor/loot randomization only needs to run there to take effect — but for consistent behavior, install it for every player.
