import type { GameDefinition, GameId } from "@/types";

export const GAMES: Record<GameId, GameDefinition> = {
  "elden-ring": {
    id: "elden-ring",
    name: "Elden Ring",
    developer: "FromSoftware",
    tagline: "Tarnished gold, grand ruin, and grace gone wrong",
    description:
      "Painterly dark-fantasy grandeur — gilded armor, colossal scale, and beauty curdled into dread.",
    styleTags: ["Painterly", "Gothic-fantasy", "Monumental scale", "Golden decay"],
    examplePrompts: [
      "A blind astrologer who fused with a fallen star, robes still smoldering",
      "A knight who made a pact with a swarm of golden fireflies",
      "The last root-shepherd of a drowned Erdtree sapling",
      "A dead god's herald, stitched together from broken statues",
    ],
    bestiaryNoun: "demigod",
  },
  "dark-souls-3": {
    id: "dark-souls-3",
    name: "Dark Souls III",
    developer: "FromSoftware",
    tagline: "Ash, ember, and the last embers of a dying age",
    description:
      "Soot-choked tragedy — noble figures twisted by the Curse, rendered in heavy oil-painted gloom.",
    styleTags: ["Ashen palette", "Gothic cathedral", "Tragic monstrosity", "Low-key lighting"],
    examplePrompts: [
      "A gravedigger who inherited the strength of every corpse he buried",
      "A choir of three conjoined ash maidens who share one scream",
      "A castellan knight fused at the waist with his own castle gate",
      "The keeper of an extinguished bonfire, still guarding cold ash",
    ],
    bestiaryNoun: "lord of cinder",
  },
  terraria: {
    id: "terraria",
    name: "Terraria",
    developer: "Re-Logic",
    tagline: "Bold pixels, bright colors, cheerfully lethal",
    description:
      "Crisp 2D sprite art — chunky silhouettes, saturated color, and playful menace on a clean backdrop.",
    styleTags: ["Pixel art", "16-bit charm", "High saturation", "Bold silhouette"],
    examplePrompts: [
      "A colossal clockwork mimic disguised as a chest the size of a house",
      "A living meteor swarm held together by pure hatred",
      "The rotted king of the slimes, ruler of the underground",
      "A three-headed garden gnome awakened by a corrupted seed",
    ],
    bestiaryNoun: "boss",
  },
  palworld: {
    id: "palworld",
    name: "Palworld",
    developer: "Pocketpair",
    tagline: "Creature-collector charm with grounded survival-game texture",
    description:
      "Semi-realistic 3D creature rendering — big expressive eyes and believable fur, scale, and scars.",
    styleTags: ["PBR 3D render", "Creature design", "Open-world lighting", "Elemental fusion"],
    examplePrompts: [
      "An ancient stag Pal made of living lightning and driftwood",
      "A colossal armored Pal that camouflages as abandoned ruins",
      "A feral alpha Pal that leads its pack across the wasteland at night",
      "A bioluminescent deep-cave Pal that hasn't seen sunlight in generations",
    ],
    bestiaryNoun: "Pal",
  },
};

export const GAME_LIST: GameDefinition[] = Object.values(GAMES);

export function isValidGameId(value: string): value is GameId {
  return Object.prototype.hasOwnProperty.call(GAMES, value);
}
