import type { BuiltPrompt, GameId, ShotVariant } from "@/types";

/**
 * One detailed "style bible" per game. These encode rendering technique,
 * material/texture language, palette, lighting, anatomy conventions, and
 * mood for that game's bestiary specifically — not just "in the style of
 * [game]" — because that alone produces generic fantasy art. Every boss
 * generated is an original creature; the guides never name an existing
 * character, only the visual grammar the new design should follow.
 */
const STYLE_GUIDES: Record<GameId, string> = {
  "elden-ring": `Digital painterly game concept art in the visual language of FromSoftware's Elden Ring. Rendering: painterly brushwork with hyper-detailed metal reflections, soft edge blending, and atmospheric depth — not a flat illustration, not a photo. Materials: ornate armor built from tarnished gold leaf, engraved bronze and blackened iron plating layered over tattered noble cloth and fur trim; surfaces show centuries of wear, verdigris, and battle damage. Anatomy: a blend of the majestic and the grotesque — a once-noble bearing corrupted by rot, madness, or a divine/draconic transformation; asymmetry and unnatural growths (extra limbs, root-like tendrils, crystalline outgrowths, fused armor and flesh) are welcome when they serve the concept. Lighting: dramatic chiaroscuro, deep obsidian shadow cut by glowing particle effects appropriate to the boss's theme (golden Erdtree embers, cold blue frost motes, sickly purple scarlet-rot bloom, or holy white light). Environment: weathered stone ruins, moss, and root-choked architecture with volumetric fog and god-rays in the background, kept softly out of focus so the boss stays the clear subject. Palette: dominant obsidian black and antique gold with a single saturated accent color tied to the boss's power. Scale: composition implies monumental, towering size. Mood: tragic grandeur — equal parts awe and dread.`,

  "dark-souls-3": `Digital painterly game concept art in the visual language of FromSoftware's Dark Souls III. Rendering: heavy oil-painting brushwork, moody low-key lighting, coarse painterly texture on every surface — not clean digital illustration. Materials: soot-blackened plate armor, tattered burial cloth and cloaks, pitted and rusted iron weapons; cinder and ember particles drift through the air. Anatomy: tragic and monstrous — a noble figure twisted by the Curse of the Undead into something inhuman; asymmetric silhouettes, extra or fused limbs, armor melded directly into scarred flesh, or a body built from more than one corpse are all in keeping with the setting. Architecture: crumbling gothic cathedrals and castle ruins, worn stone arches, guttering torches. Lighting: a single dramatic light source — dying sunlight, torch flame, or pale magic — surrounded by heavy shadow and drifting haze; nothing is brightly or evenly lit. Palette: desaturated charcoal grey, bone white, and dying-ember orange; avoid bright saturated color entirely. Mood: despair, faded grandeur, quiet horror rather than spectacle.`,

  terraria: `2D pixel-art game sprite in the visual language of Terraria by Re-Logic. Rendering: crisp, deliberately-placed pixel art with clean hard edges and readable silhouette, exactly like an official Terraria boss sprite or wiki portrait — explicitly NOT a painterly, airbrushed, or 3D-rendered image, and NOT photorealistic. Line work: bold black or dark outlines separating every color region. Shading: flat cel-shaded color fields with limited, hand-placed dithered gradients for volume — no smooth photographic gradients. Palette: a tight set of vibrant, highly saturated colors (Terraria favors punchy primary and jewel tones) rather than muted realism. Anatomy: playful-but-menacing creature design — bulbous or segmented bodies, oversized glowing eyes, chunky exaggerated proportions, and for tougher bosses a mechanical/organic hybrid look (rivets, glass domes, exposed gears fused with flesh or slime). Composition: a clean three-quarter or side-on game-sprite pose, centered on a plain dark or subtly gradient backdrop so it reads like an isolated sprite asset, not a scene. Menace and scale are conveyed through bold silhouette and posture, not fine painted detail. Mood: whimsical but genuinely threatening, classic 16-bit-inspired indie charm.`,

  palworld: `Semi-realistic 3D creature render in the visual language of Palworld by Pocketpair, as if captured in Unreal Engine's photo mode. Rendering: physically-based materials with real subsurface scattering on skin and believable specular response on fur, scale, and horn — grounded and tactile, not a flat cartoon and not a pixel sprite. Silhouette: an appealing, rounded "creature-collector" body plan — big expressive eyes, friendly-yet-feral proportions — but the surface texture stays grounded: matted or wind-ruffled fur, scuffed scales, dirt, scars, and battle wear like a real animal that lives outdoors. Design language: elemental or survival-game motifs (fire, electric, ice, plant, or scavenged mechanical parts) integrated as if they grew there naturally, not bolted on. Lighting: soft natural outdoor lighting — open sky, golden-hour or overcast sun — with a shallow depth of field so the background grassland, ruins, or cliffs blur softly behind the in-focus creature, exactly like an in-game capture. Palette: natural earth tones (moss green, hide brown, stone grey) accented by one vivid elemental color. Mood: charismatic and wild — powerful enough to be a real threat, charming enough that a player would still want to tame it.`,
};

/**
 * Three deliberately different "shots" of the same design, mirroring how a
 * real concept-art pitch is presented: a hero action pose, a detail
 * portrait, and an in-context environmental shot. This is what gives the
 * three results actual variety instead of three near-duplicates.
 */
const SHOT_VARIANTS: ShotVariant[] = [
  {
    id: "action",
    label: "Full-body action pose",
    hint: "Full-body dynamic action shot: the boss mid-attack, mid-cast, or mid-roar, in a dramatic dynamic pose with its entire body and silhouette visible, showcasing its weapon, limbs, or signature ability in use.",
  },
  {
    id: "portrait",
    label: "Close-up character portrait",
    hint: "Close-up dramatic portrait: tight framing on the head, face, and upper body, emphasizing surface detail, eyes, and the single most distinctive or fearsome feature of the design.",
  },
  {
    id: "environment",
    label: "Environmental establishing shot",
    hint: "Wide establishing shot: the boss shown at a slight distance within its arena or habitat, smaller in frame to communicate true scale, with the environment and lighting reinforcing the mood.",
  },
];

const UNIVERSAL_GUARDRAILS =
  "This is an entirely original creature — do not depict, copy, or caption any existing named character, logo, or trademarked title from the game; invent a new design that simply looks like it belongs in this game's bestiary. Render only the creature and its immediate environment: no text, no watermark, no UI, no health bars, no borders.";

export function getStyleGuide(gameId: GameId): string {
  return STYLE_GUIDES[gameId];
}

export function getShotVariants(): ShotVariant[] {
  return SHOT_VARIANTS;
}

export function buildPrompts(gameId: GameId, bossIdea: string): BuiltPrompt[] {
  const styleGuide = STYLE_GUIDES[gameId];

  return SHOT_VARIANTS.map((shot) => ({
    shotId: shot.id,
    label: shot.label,
    prompt: [
      styleGuide,
      `Boss concept to design: ${bossIdea}.`,
      shot.hint,
      UNIVERSAL_GUARDRAILS,
    ].join("\n\n"),
  }));
}
