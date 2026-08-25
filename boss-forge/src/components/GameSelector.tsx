"use client";

import { GAME_LIST } from "@/lib/games";
import type { GameId } from "@/types";
import { GameIcon } from "./GameIcon";

export function GameSelector({ onSelect }: { onSelect: (id: GameId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {GAME_LIST.map((game) => (
        <button
          key={game.id}
          type="button"
          data-game={game.id}
          onClick={() => onSelect(game.id)}
          className="panel group relative overflow-hidden p-6 text-left transition-transform hover:-translate-y-1 hover:glow-accent focus:outline-none focus:ring-2 focus:ring-accent"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="bg-vignette absolute inset-0 opacity-70 transition-opacity group-hover:opacity-100" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h3 className="font-heading text-2xl text-accent">{game.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{game.developer}</p>
            </div>
            <GameIcon gameId={game.id} className="h-10 w-10 shrink-0 text-accent" />
          </div>
          <p className="relative mt-4 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {game.tagline}
          </p>
          <div className="relative mt-4 flex flex-wrap gap-2">
            {game.styleTags.map((tag) => (
              <span key={tag} className="chip px-2.5 py-1 text-xs">
                {tag}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
