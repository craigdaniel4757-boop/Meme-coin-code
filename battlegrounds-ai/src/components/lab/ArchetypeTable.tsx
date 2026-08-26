import type { LearnerModel } from "@/engine/persistence/storage";

export function ArchetypeTable({ model }: { model: LearnerModel }) {
  const rows = Object.entries(model.archetypeStats)
    .map(([archetype, stat]) => ({
      archetype,
      games: stat.games,
      avgPlacement: stat.placementSum / stat.games,
      winRate: stat.wins / stat.games,
    }))
    .filter((r) => r.games >= 2)
    .sort((a, b) => a.avgPlacement - b.avgPlacement)
    .slice(0, 10);

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text">Archetypes that have worked</h3>
        <p className="text-xs text-text-faint">Board identities Aurora has actually finished games with, best average placement first</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-28 items-center justify-center text-xs text-text-faint">Needs a few more games with a consistent archetype.</div>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-text-faint">
              <th className="pb-2 font-medium">Archetype</th>
              <th className="pb-2 text-right font-medium">Games</th>
              <th className="pb-2 text-right font-medium">Avg. place</th>
              <th className="pb-2 text-right font-medium">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.archetype} className="border-t border-border/60">
                <td className="py-2 font-medium text-text-secondary">{r.archetype}</td>
                <td className="tabular py-2 text-right text-text-muted">{r.games}</td>
                <td className="tabular py-2 text-right text-text">{r.avgPlacement.toFixed(2)}</td>
                <td className="tabular py-2 text-right text-text-muted">{(r.winRate * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
