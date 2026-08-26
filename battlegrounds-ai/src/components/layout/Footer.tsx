import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <div className="font-display text-sm font-semibold text-text">TavernIQ</div>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              A self-learning auto-battler mind, built from scratch: an original card pool and rules engine inspired by
              Hearthstone Battlegrounds&rsquo; tribes, tiers, and economy, played entirely by a from-scratch reinforcement
              learning agent that explains its reasoning as it plays.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            <Link href="/arena" className="text-text-muted transition-colors hover:text-text">
              Watch the Arena
            </Link>
            <Link href="/lab" className="text-text-muted transition-colors hover:text-text">
              Training Lab
            </Link>
            <Link href="/#how-it-thinks" className="text-text-muted transition-colors hover:text-text">
              How it thinks
            </Link>
            <Link href="/#cards" className="text-text-muted transition-colors hover:text-text">
              Card pool
            </Link>
          </div>
        </div>
        <p className="mt-8 border-t border-border pt-6 text-xs leading-relaxed text-text-faint">
          Fan project, unaffiliated with and not endorsed by Blizzard Entertainment. &ldquo;Battlegrounds&rdquo; refers to
          Hearthstone&rsquo;s auto-battler mode only as context for the ruleset this project reimplements; every hero,
          minion, and piece of card text here is an original design, not Blizzard&rsquo;s. Nothing here is financial or
          game-balance advice &mdash; it&rsquo;s a simulator for watching a small learning system improve at a game.
        </p>
      </div>
    </footer>
  );
}
