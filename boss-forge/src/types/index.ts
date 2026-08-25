export type GameId = "elden-ring" | "dark-souls-3" | "terraria" | "palworld";

export interface GameDefinition {
  id: GameId;
  name: string;
  developer: string;
  tagline: string;
  description: string;
  styleTags: string[];
  examplePrompts: string[];
  /** Accent word used in a couple of UI microcopy strings. */
  bestiaryNoun: string;
}

export interface ShotVariant {
  id: string;
  label: string;
  hint: string;
}

export interface BuiltPrompt {
  shotId: string;
  label: string;
  prompt: string;
}

export interface GeneratedImageResult {
  shotId: string;
  shotLabel: string;
  prompt: string;
  imageDataUrl?: string;
  error?: string;
}

export interface GenerateRequestBody {
  gameId: GameId;
  bossIdea: string;
}

export interface GenerateResponseBody {
  gameId: GameId;
  bossIdea: string;
  images: GeneratedImageResult[];
  error?: string;
}
