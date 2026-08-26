"use client";

import { useEffect, useState } from "react";
import type { GameEvent } from "@/engine/types";
import { MinionCard } from "@/components/arena/MinionCard";

type CombatEvent = Extract<GameEvent, { type: "combatResult" }>;

const RESULT_META = {
  win: { label: "Victory", color: "var(--status-good)" },
  loss: { label: "Defeat", color: "var(--accent-coral)" },
  tie: { label: "Standoff", color: "var(--status-warning)" },
} as const;

export function CombatReplay({
  event,
  speedMs,
  spotlightSeat,
  names,
}: {
  event: CombatEvent;
  speedMs: number;
  spotlightSeat: number;
  names: Record<number, string>;
}) {
  const [step, setStep] = useState(0);
  const log = event.log;
  const isSpotlight = event.seat === spotlightSeat;

  useEffect(() => {
    if (step >= log.length) return undefined;
    const t = setTimeout(() => setStep((s) => s + 1), Math.max(120, speedMs / 2));
    return () => clearTimeout(t);
  }, [step, log.length, speedMs]);

  const visibleLog = log.slice(0, step);
  const dead = new Set(visibleLog.filter((s) => s.kind === "death").map((s) => s.defenderIid).filter((v): v is string => Boolean(v)));
  const current = log[Math.min(step, log.length - 1)];
  const finished = step >= log.length;
  const meta = RESULT_META[event.result];

  const heroLabel = isSpotlight ? "Aurora" : names[event.seat] ?? `Seat ${event.seat + 1}`;
  const enemyLabel = event.opponentSeat == null ? "Ghost board" : (names[event.opponentSeat] ?? `Seat ${event.opponentSeat + 1}`);

  return (
    <div className="overflow-hidden rounded-2xl border border-violet/30 bg-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Combat &mdash; Round {event.round}</span>
        {finished && (
          <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `${meta.color}22`, color: meta.color }}>
            {meta.label}
            {event.damage > 0 ? ` · -${event.damage}` : ""}
          </span>
        )}
      </div>

      <div className="space-y-4 px-5 py-4">
        <BoardRow label={heroLabel} board={event.heroBoardBefore} dead={dead} current={current} />
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold text-text-faint">VS</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <BoardRow label={enemyLabel} board={event.enemyBoardBefore} dead={dead} current={current} />
      </div>

      <div className="scrollbar-thin max-h-32 overflow-y-auto border-t border-border bg-bg-elevated/40 px-5 py-3 text-xs text-text-muted">
        {visibleLog.length === 0 && <p className="text-text-faint">Combat is beginning&hellip;</p>}
        {visibleLog.map((s, i) => (
          <p key={i} className="py-0.5">
            {s.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function BoardRow({
  label,
  board,
  dead,
  current,
}: {
  label: string;
  board: CombatEvent["heroBoardBefore"];
  dead: Set<string>;
  current: CombatEvent["log"][number] | undefined;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium text-text-faint">{label}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {board.length === 0 && <span className="text-xs text-text-faint">No minions.</span>}
        {board.map((m) => (
          <MinionCard
            key={m.iid}
            minion={m}
            size="sm"
            dimmed={dead.has(m.iid)}
            highlighted={current?.attackerIid === m.iid || current?.defenderIid === m.iid}
          />
        ))}
      </div>
    </div>
  );
}
