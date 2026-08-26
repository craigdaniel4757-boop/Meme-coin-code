const PLACEMENT_COPY: Record<number, { title: string; tone: string }> = {
  1: { title: "1st place — a clean win.", tone: "var(--status-good)" },
  2: { title: "2nd place — right at the door.", tone: "var(--status-good)" },
  3: { title: "3rd place — a solid finish.", tone: "var(--accent-gold)" },
  4: { title: "4th place — just inside the money.", tone: "var(--accent-gold)" },
};

export function GameOverBanner({ placement, archetype, roundsPlayed, onNewGame }: { placement: number; archetype: string; roundsPlayed: number; onNewGame: () => void }) {
  const copy = PLACEMENT_COPY[placement] ?? { title: `${placement}th place — a rough lobby.`, tone: "var(--accent-coral)" };

  return (
    <div className="animate-fade-in-up flex flex-col items-center gap-3 rounded-2xl border border-border bg-panel px-6 py-8 text-center">
      <span className="text-4xl font-display font-bold tabular" style={{ color: copy.tone }}>
        #{placement}
      </span>
      <p className="text-sm text-text-secondary">{copy.title}</p>
      <p className="text-xs text-text-faint">
        Ran a {archetype} board across {roundsPlayed} rounds. This result already fed the model &mdash; check the Lab to see it move.
      </p>
      <button
        onClick={onNewGame}
        className="mt-2 rounded-lg bg-gradient-to-r from-violet to-violet-strong px-5 py-2 text-sm font-semibold text-bg transition-transform hover:scale-[1.03] active:scale-95"
      >
        Play Another Game
      </button>
    </div>
  );
}
