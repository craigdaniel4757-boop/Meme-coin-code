namespace MineRandomizer
{
    /// <summary>Controls how often floor content (theme/ore/monsters/treasure) gets reshuffled.</summary>
    public enum FloorShuffleMode
    {
        /// <summary>Every time you step onto a floor, it's reshuffled again.</summary>
        PerVisit,

        /// <summary>A floor keeps the same shuffled identity for the whole in-game day.</summary>
        PerDay,

        /// <summary>A floor's shuffled identity is fixed for the entire save file.</summary>
        PerSave
    }

    public sealed class ModConfig
    {
        // --- Floor content randomization (theme / ore / monsters / treasure floors) ---

        /// <summary>Master switch for randomizing what each floor generates as (ore mix, tileset, monster/treasure chance).</summary>
        public bool EnableFloorRandomization { get; set; } = true;

        /// <summary>How often a floor's shuffled identity changes.</summary>
        public FloorShuffleMode ShuffleMode { get; set; } = FloorShuffleMode.PerDay;

        /// <summary>
        /// Max levels a regular mine floor (1-120) can be shuffled away from its real depth.
        /// 0 means fully random across the whole 1-120 range.
        /// </summary>
        public int MaxFloorDrift { get; set; } = 0;

        /// <summary>Whether Skull Cavern floors (121+) are also shuffled.</summary>
        public bool RandomizeSkullCavern { get; set; } = true;

        /// <summary>How far a Skull Cavern floor can be shuffled away from its real depth, in either direction.</summary>
        public int SkullCavernDriftRange { get; set; } = 25;

        // --- Entry floor randomization (which floor you spawn on when you walk into the mine) ---

        /// <summary>Master switch for sending you to a random floor when you enter the mine fresh.</summary>
        public bool EnableEntryFloorRandomization { get; set; } = true;

        /// <summary>If true, every fresh entry is re-rolled. If false, only the first entry each day is randomized.</summary>
        public bool RandomizeEveryEntry { get; set; } = true;

        /// <summary>If true, you can be sent deeper than any floor you've actually reached before.</summary>
        public bool AllowEntryBeyondDeepestLevel { get; set; } = false;

        /// <summary>How far past your deepest-reached floor you can spawn, when <see cref="AllowEntryBeyondDeepestLevel"/> is false.</summary>
        public int EntryFloorBufferBeyondDeepest { get; set; } = 5;

        /// <summary>Absolute ceiling for a randomized entry floor, regardless of other settings.</summary>
        public int MaxEntryFloorHardCap { get; set; } = 120;

        // --- Chest loot randomization ---

        /// <summary>Master switch for re-rolling what's inside chests found on mine floors.</summary>
        public bool EnableChestLootRandomization { get; set; } = true;

        /// <summary>Chance (0.0-1.0) that any given chest has its contents re-rolled.</summary>
        public double ChestRerollChance { get; set; } = 0.5;

        /// <summary>How far (in either direction) the "depth" used to pick loot can wander from the floor's real depth.</summary>
        public int ChestLootDepthVariance { get; set; } = 40;

        // --- Misc ---

        /// <summary>Extra number mixed into every random seed this mod uses. Change it (or use the console command) to get a completely different shuffle.</summary>
        public int ExtraRandomSeed { get; set; } = 0;
    }
}
