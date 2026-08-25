import type { BuiltPrompt, GameId, ShotVariant } from "@/types";

/**
 * One detailed "style bible" per game. These encode rendering technique,
 * material/texture language, palette, lighting, anatomy conventions, and
 * mood for that game's bestiary specifically — not just "in the style of
 * [game]" — because that alone produces generic fantasy art. Each guide
 * names the archetypal *category* of design a real boss from that game
 * falls into (a gold-armored demigod, a segmented burrowing worm) as a
 * technique touchstone, but never an existing named character — every
 * generated boss is a new, original design.
 */
const STYLE_GUIDES: Record<GameId, string> = {
  "elden-ring": `Digital painterly game concept art in the exact visual language of FromSoftware's Elden Ring (dir. Hidetaka Miyazaki), whose creature and armor design leans on the grotesque-yet-majestic anatomy popularized by Kentaro Miura's Berserk manga — tragedy and beauty before horror. Rendering: painterly gouache-and-oil digital brushwork with hyper-detailed metal specular highlights and soft atmospheric edge blending — never a flat vector illustration, never a photograph, never smooth 3D-render shading. Materials: hammered and gilded gold leaf, engraved bronze, blackened or verdigris-streaked iron plate layered over tattered noble silk, fur mantles, and bone or antler ornamentation; every surface shows centuries of wear — chips, tarnish, dried blood, drifting dust. Anatomy: a once-noble or divine bearing corrupted by rot, madness, or draconic transformation; favor an asymmetric silhouette — one oversized weapon, limb, or wing set against a smaller frame — over even, symmetrical bulk; root-like tendrils, crystalline outgrowths, or armor fused directly into flesh are all in keeping with the setting. Lighting: dramatic chiaroscuro — deep obsidian shadow cut by exactly one glowing accent tied to the boss's power (golden Erdtree embers, pale frost motes, sickly scarlet-rot bloom, holy white radiance, or a madness-red glow), with soft halo bloom around any magic. Environment: weathered stone ruins, moss, and root-choked ornate architecture, kept softly out of focus so the boss reads as the clear subject. Palette: dominant obsidian black and antique gold, with exactly one saturated accent color per boss, never a rainbow of competing hues. Scale: composition implies monumental, towering size, often from a heroic low camera angle. Use the rendering technique and material logic of archetypes like a gold-armored demigod knight, a rot-corrupted fallen deity, or a frost-crystal ancient spirit as your technique touchstone — never their exact likeness. Mood: tragic grandeur, awe before dread.`,

  "dark-souls-3": `Digital painterly game concept art in the exact visual language of FromSoftware's Dark Souls III (dir. Hidetaka Miyazaki), made in the shadow of Bloodborne — it shares that game's oppressive dread and painterly asset DNA but keeps Dark Souls' epic-fantasy skeleton. Setting logic: Lothric is a kingdom at the literal end of fire, so architecture is late-medieval Gothic cathedral and castle, narrower and more repetitive than Dark Souls I's biome variety on purpose — the world itself is dying and shrinking. Rendering: heavy oil-painting brushwork with visible impasto-like texture on every surface, moody low-key lighting — never clean digital illustration, never bright or evenly lit. Materials: soot-blackened plate armor, tarnished pewter and rusted iron, tattered burial shrouds and cloaks; a constant drift of ash and cinder particulate hangs in the air like falling snow. Anatomy: a once-noble figure twisted by the Curse of the Undead around exactly one point of corruption — a fused weapon-limb, an extra arm, a hollowed chest, two bodies sharing one soul — rather than a full beast transformation. Lighting: a single dramatic source (dying sunlight, torch flame, or pale magic) surrounded by heavy shadow and drifting haze. Palette: soot grey, bone white, and dying-ember orange dominate; allow one moment of sickly, acid-amber sky-light breaking through the grey, the way Lothric's castle wall does, but keep saturated color otherwise absent. Use the rendering technique of archetypes like a soot-crowned fallen prelate, twin knights fused into one fate, or an ash-mound serpent-lord as your technique touchstone — never their exact likeness. Explicitly avoid: Elden Ring's gold grandeur, Dark Souls I's biome variety, Bloodborne's ornate Victorian trim. Mood: despair, faded grandeur, quiet funereal horror rather than spectacle.`,

  terraria: `2D pixel-art game sprite in the exact visual language of Terraria by Re-Logic. Rendering: crisp, deliberately hand-placed pixel art with clean hard edges — explicitly NOT painterly, NOT airbrushed, NOT a 3D render, NOT photorealistic, and NOT smoothly anti-aliased. Line work: a bold black or dark outline separates every color region. Shading: flat color fields with limited, hand-placed dithered banding for volume — no smooth photographic gradients anywhere. Palette: bright, highly saturated jewel tones (Terraria's signature blues, greens, purples, and gem-bright accents) set against the earthier browns and stone-greys of its biomes; give the boss exactly one loud "signal" color so its silhouette reads instantly against any backdrop. Anatomy: built from clean geometric primitives — circles, ovals, blockish segments — rather than organic musculature; oversized glowing eyes are the default emotional focal point since faces are otherwise minimal. Many Terraria bosses are multi-part rather than one solid body: a segmented burrowing worm-train, a giant veined floating eye trailing minions, or a mechanical rebuild of an organic creature (rivets, glass domes, exposed gears fused with flesh or slime) are all valid structural approaches — pick whichever best fits the boss concept. Composition adapts to the shot: an isolated sprite portrait centered on a plain or subtly gradient backdrop for close-in shots, exactly like an official wiki boss portrait; or the boss placed within a simplified, equally flat-shaded pixel-art biome scene for wider shots. Menace and scale come from bold silhouette and posture, never fine painted detail. Mood: whimsical but genuinely threatening, poster-flat and instantly legible at a glance, classic 16-bit-inspired indie charm.`,

  palworld: `3D creature render in the exact visual language of Palworld by Pocketpair, built in Unreal Engine 5 and captured as if in its photo mode. The signature Palworld look is a deliberate collision of two things at once: a cartoon-simplified silhouette (oversized head-to-body ratio, rounded proportions, big expressive eyes — the same simplification logic as a creature-collector franchise) wrapped in fully photoreal, physically-based surface rendering (accurate fur, feather, or scale shading with real subsurface scattering, real-time global illumination, dirt, scars, and battle-wear grime like a living animal). The simplification lives only in the proportions and silhouette — the surface shading itself is never flat or cel-toon anywhere on the model. Material detail: some Pals carry or wear crude survival gear — weathered leather straps, scavenged metal plating, rope harnesses — bolted naturally onto their bodies as though built by whoever tamed them. Design language: elemental or survival motifs (fire, electric, ice, leaf, or scavenged mechanical parts) integrated as if they grew there naturally, not glued on. Lighting: soft natural outdoor sun, open sky, golden-hour or overcast light, with a shallow depth of field blurring the grassland, ruins, or cliffs behind the in-focus creature — a game screenshot, not a studio render. Palette: natural earth tones (moss green, hide brown, stone grey) accented by exactly one vivid elemental color. Explicitly avoid: flat toon cel-shading like a mobile monster-collector app, and fully photorealistic nature-documentary rendering with no stylization at all — the target is precisely the collision of both. Mood: charismatic and wild, powerful enough to be a real threat, charming enough that a player would still want to tame it.`,
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
  "This is an entirely original creature — do not depict, copy, or caption any existing named character, logo, or trademarked title from the game. Any archetypes described above are technique and material references only, not a likeness to copy; invent a new design built around the stated boss concept that simply looks like it belongs in this game's bestiary. Render only the creature and its immediate environment: no text, no watermark, no UI, no health bars, no borders.";

/**
 * Condensed, comma-separated descriptor tags per game — for classic
 * text-to-image diffusion models (Pollinations' flux), not the LLM-native
 * image models above. Diffusion models don't read and reason about
 * instructions the way GPT-image-1 or Gemini do; they condition on the
 * prompt as a bag of tokens, so a long paragraph full of meta-instructions
 * ("don't copy existing characters") is pure noise that dilutes the actual
 * visual signal. These keep only concrete visual descriptors — no
 * instructional sentences, no in-universe lineage trivia.
 */
const DIFFUSION_STYLE_TAGS: Record<GameId, string> = {
  "elden-ring":
    "FromSoftware Elden Ring concept art style, painterly digital oil and gouache brushwork, ornate gilded gold-leaf armor over blackened iron plate and tattered noble cloth, grotesque yet majestic asymmetric anatomy, dramatic chiaroscuro lighting with glowing magic particles, weathered stone ruins background, monumental epic scale, obsidian black and antique gold color palette, highly detailed dark fantasy game boss",
  "dark-souls-3":
    "FromSoftware Dark Souls III concept art style, heavy oil painting brushwork, soot-blackened plate armor, tattered burial shrouds, drifting ash and cinder particles, gothic cathedral ruins, single dramatic torchlight, heavy fog, desaturated soot grey bone white and dying-ember orange palette, tragic monstrous anatomy, highly detailed grim dark fantasy game boss",
  terraria:
    "Terraria pixel art sprite style, 2D retro 16-bit pixel art, bold dark outline around every shape, flat cel-shaded color fields, no smooth gradients, no anti-aliasing, vibrant saturated jewel-tone colors, chunky exaggerated proportions, oversized glowing eyes, clean hard-edged silhouette, indie game boss sprite",
  palworld:
    "Palworld style 3D creature render, Unreal Engine 5 photoreal PBR shading, physically accurate fur and scale texture, cartoon-rounded simplified proportions, big expressive eyes, natural outdoor sunlight, shallow depth of field, game photo-mode screenshot, earthy color palette with one vivid elemental accent color, survival game creature",
};

const DIFFUSION_SHOT_HINTS: Record<string, string> = {
  action: "dynamic action pose, full body, mid-attack",
  portrait: "close-up portrait, detailed face and head, upper body",
  environment: "wide shot, small in frame, shown within its environment",
};

export function getStyleGuide(gameId: GameId): string {
  return STYLE_GUIDES[gameId];
}

export function getShotVariants(): ShotVariant[] {
  return SHOT_VARIANTS;
}

/** For LLM-native image models (Gemini, gpt-image-1) that read and follow instructions. */
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

/** For classic diffusion models (Pollinations' flux): short, tag-based, subject-first. */
export function buildDiffusionPrompts(gameId: GameId, bossIdea: string): BuiltPrompt[] {
  const styleTags = DIFFUSION_STYLE_TAGS[gameId];

  return SHOT_VARIANTS.map((shot) => ({
    shotId: shot.id,
    label: shot.label,
    prompt: `${bossIdea}, ${styleTags}, ${DIFFUSION_SHOT_HINTS[shot.id]}, original creature, no text, no watermark`,
  }));
}
