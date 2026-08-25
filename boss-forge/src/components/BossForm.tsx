"use client";

import { useId } from "react";
import type { GameDefinition } from "@/types";

const MAX_LENGTH = 600;

interface BossFormProps {
  game: GameDefinition;
  bossIdea: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isGenerating: boolean;
}

export function BossForm({ game, bossIdea, onChange, onSubmit, isGenerating }: BossFormProps) {
  const textareaId = useId();

  return (
    <form
      className="panel p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isGenerating && bossIdea.trim()) onSubmit();
      }}
    >
      <label htmlFor={textareaId} className="font-heading text-lg text-accent">
        Describe your boss idea
      </label>
      <p className="mt-1 text-sm text-ink-muted">
        A creature, a twist, a theme — a sentence or two is plenty. We&apos;ll handle the {game.name}{" "}
        art direction.
      </p>

      <textarea
        id={textareaId}
        value={bossIdea}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={game.examplePrompts[0]}
        rows={4}
        maxLength={MAX_LENGTH}
        className="mt-4 w-full resize-none rounded-xl border bg-transparent p-4 text-base outline-none transition-colors focus:border-accent"
        style={{ borderColor: "var(--border)", color: "var(--text)" }}
      />
      <div className="mt-1 text-right text-xs text-ink-muted">
        {bossIdea.length}/{MAX_LENGTH}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {game.examplePrompts.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onChange(example)}
            className="chip px-3 py-1.5 text-left text-xs"
            disabled={isGenerating}
          >
            {example}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={isGenerating || !bossIdea.trim()}
        className="btn-accent mt-5 w-full rounded-xl py-3 text-base sm:w-auto sm:px-8"
      >
        {isGenerating ? "Forging concept art…" : `Generate 3 ${game.bestiaryNoun} renders`}
      </button>
    </form>
  );
}
