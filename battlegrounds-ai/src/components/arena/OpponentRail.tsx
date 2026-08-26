import type { PlayerSnapshot } from "@/engine/types";
import { tribeMeta } from "@/engine/data/tribes";

export function OpponentRail({ players }: { players: PlayerSnapshot[] }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">The Lobby</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {players.map((p) => (
          <div
            key={p.seat}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-opacity ${
              p.alive ? "border-border" : "border-border opacity-40"
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-text-secondary">
              {p.tavernTier}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-text">{p.name}</span>
                <span className="tabular text-xs text-text-muted">{p.alive ? `${p.health} hp` : `#${p.placement}`}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                {p.board.length === 0 ? (
                  <span className="text-[10px] text-text-faint">Empty board</span>
                ) : (
                  p.board.map((m) => (
                    <span
                      key={m.iid}
                      title={`${m.name} (${m.attack}/${m.health})`}
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-white/10"
                      style={{ background: tribeMeta(m.tribe).color }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
