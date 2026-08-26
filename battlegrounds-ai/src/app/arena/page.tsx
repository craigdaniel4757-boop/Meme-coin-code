"use client";

import { useArenaSession, SPEED_MS } from "@/hooks/useArenaSession";
import { recruitActionsUpToRound } from "@/engine/replay";
import { ArenaControls } from "@/components/arena/ArenaControls";
import { HeroSpotlight } from "@/components/arena/HeroSpotlight";
import { OpponentRail } from "@/components/arena/OpponentRail";
import { CommentaryFeed } from "@/components/arena/CommentaryFeed";
import { CombatReplay } from "@/components/arena/CombatReplay";
import { GameOverBanner } from "@/components/arena/GameOverBanner";

export default function ArenaPage() {
  const session = useArenaSession();
  const { ready, summary, display, index, playing, togglePlaying, speed, setSpeed, deterministic, setDeterministic, startNewGame, stepForward, stepBackward, atEnd } = session;

  const learnerSeat = summary?.learnerSeat ?? null;
  const learnerPlayer = display && learnerSeat != null ? display.players[learnerSeat] : null;
  const otherPlayers = display ? Object.values(display.players).filter((p) => p.seat !== learnerSeat).sort((a, b) => a.seat - b.seat) : [];
  const currentEvent = display?.currentEvent ?? null;
  const isCombatNow = currentEvent?.type === "combatResult";

  const commentaryEntries = summary && learnerSeat != null ? recruitActionsUpToRound(summary.events, index, learnerSeat, 30) : [];
  const lastAction = commentaryEntries[0]?.commentary ?? null;
  const nameBySeat = display ? Object.fromEntries(Object.values(display.players).map((p) => [p.seat, p.name])) : {};

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Arena</h1>
        <p className="mt-1 text-sm text-text-muted">Watch Aurora play a full lobby live, turn by turn, with its reasoning alongside every move.</p>
      </div>

      <ArenaControls
        hasGame={Boolean(summary)}
        playing={playing}
        onTogglePlaying={togglePlaying}
        onNewGame={startNewGame}
        onStep={stepForward}
        onBack={stepBackward}
        atEnd={atEnd}
        speed={speed}
        setSpeed={setSpeed}
        deterministic={deterministic}
        setDeterministic={setDeterministic}
        round={display?.round ?? 0}
      />

      {!ready && <div className="mt-10 text-center text-sm text-text-faint">Loading Aurora&rsquo;s current model&hellip;</div>}

      {ready && !summary && (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-text-muted">No game running yet.</p>
          <p className="max-w-sm text-xs text-text-faint">
            Start a game to watch Aurora shop, upgrade, fight, and explain itself &mdash; using whatever it has learned from its
            training so far.
          </p>
        </div>
      )}

      {ready && summary && display && learnerPlayer && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {isCombatNow && currentEvent && currentEvent.type === "combatResult" ? (
              <CombatReplay key={index} event={currentEvent} speedMs={SPEED_MS[speed]} spotlightSeat={learnerSeat ?? 0} names={nameBySeat} />
            ) : (
              <HeroSpotlight player={learnerPlayer} lastActionLabel={lastAction} />
            )}

            {display.finished && (
              <GameOverBanner placement={summary.placement} archetype={summary.archetype} roundsPlayed={summary.roundsPlayed} onNewGame={startNewGame} />
            )}

            <OpponentRail players={otherPlayers} />
          </div>

          <CommentaryFeed entries={commentaryEntries} />
        </div>
      )}
    </div>
  );
}
