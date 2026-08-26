import type { ReactNode } from "react";
import type { PlayerSnapshot } from "@/engine/types";
import { MinionCard, EmptySlot } from "@/components/arena/MinionCard";
import { MAX_BOARD_SIZE } from "@/engine/data/constants";

export function HeroSpotlight({ player, lastActionLabel }: { player: PlayerSnapshot; lastActionLabel: string | null }) {
  const healthPct = Math.max(0, Math.min(100, (player.health / 30) * 100));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet/30 bg-panel">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet/10 via-transparent to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet to-violet-strong text-lg font-bold text-bg font-display">
            A
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-semibold text-text">Aurora</span>
              <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-strong">
                Learning agent
              </span>
            </div>
            <div className="text-xs text-text-muted">{player.heroName}</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Stat label="Health">
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${healthPct}%`, background: healthPct > 40 ? "var(--status-good)" : "var(--accent-coral)" }}
                />
              </div>
              <span className="tabular text-sm font-semibold text-text">{Math.max(0, player.health)}</span>
            </div>
          </Stat>
          <Stat label="Tier">
            <span className="tabular text-sm font-semibold text-text">{player.tavernTier}</span>
          </Stat>
          <Stat label="Gold">
            <span className="tabular text-sm font-semibold text-gold">{player.gold}g</span>
          </Stat>
        </div>
      </div>

      <div className="relative px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Board</span>
          <span className="text-[11px] text-text-faint">
            {player.board.length}/{MAX_BOARD_SIZE}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {player.board.map((m) => (
            <MinionCard key={m.iid} minion={m} size="md" />
          ))}
          {Array.from({ length: Math.max(0, MAX_BOARD_SIZE - player.board.length) }).map((_, i) => (
            <EmptySlot key={i} size="md" />
          ))}
        </div>
      </div>

      <div className="relative border-t border-border bg-bg-elevated/40 px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
            Tavern {player.frozen ? "(frozen)" : ""}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {player.shop.map((m) => (
            <MinionCard key={m.iid} minion={m} size="sm" />
          ))}
          {player.shop.length === 0 && <span className="text-xs text-text-faint">Empty this turn.</span>}
        </div>
      </div>

      {lastActionLabel && (
        <div className="relative border-t border-border px-5 py-2.5 text-xs text-text-muted">
          <span className="text-violet-strong">Latest:</span> {lastActionLabel}
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
      {children}
    </div>
  );
}
