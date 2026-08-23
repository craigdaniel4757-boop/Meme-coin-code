import { useState } from "react";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/utils";
import { TurnSnapshot } from "@/types/report";

interface TurnTimelineProps {
  turns: TurnSnapshot[];
  onSeek: (timestampSec: number) => void;
}

export function TurnTimeline({ turns, onSeek }: TurnTimelineProps) {
  const [selected, setSelected] = useState<TurnSnapshot | null>(null);

  return (
    <>
      <div className="scrollbar-thin max-h-[600px] space-y-2 overflow-y-auto pr-1">
        {turns.map((turn) => (
          <button
            key={turn.turn}
            onClick={() => {
              setSelected(turn);
              onSeek(turn.timestampSec);
            }}
            className="flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-bold">
              {turn.turn}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">Tier {turn.tavernTier}</span>
                <span className="text-muted-foreground">
                  {turn.goldSpent}/{turn.goldAvailable} gold
                </span>
                <span className="text-muted-foreground">{turn.board.length} minions</span>
                <span className="text-muted-foreground">{formatTimestamp(turn.timestampSec)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {turn.board.map((m) => m.name).join(", ") || "Empty board"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{turn.health} HP</span>
              <CombatIcon result={turn.combatResult} />
            </div>
          </button>
        ))}
      </div>

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Turn {selected.turn}</DialogTitle>
                <DialogDescription>{formatTimestamp(selected.timestampSec)} into the video</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Tavern Tier" value={String(selected.tavernTier)} />
                <Stat label="Gold" value={`${selected.goldSpent}/${selected.goldAvailable}`} />
                <Stat
                  label="Health"
                  value={`${selected.health} (${selected.healthDelta >= 0 ? "+" : ""}${selected.healthDelta})`}
                />
                <Stat label="Hero Power" value={selected.heroPowerUsed ? "Used" : "Not used"} />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Board</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.board.length === 0 && <p className="text-sm text-muted-foreground">Empty board</p>}
                  {selected.board.map((minion) => (
                    <Badge key={`${minion.name}-${minion.position}`} variant={minion.golden ? "warning" : "secondary"}>
                      {minion.name} {minion.attack ?? "?"}/{minion.health ?? "?"}
                      {minion.keywords.length > 0 ? ` · ${minion.keywords.join(", ")}` : ""}
                    </Badge>
                  ))}
                </div>
              </div>

              {selected.shopOffers.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shop</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.shopOffers.map((offer) => (
                      <Badge key={offer} variant="outline">
                        {offer}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CombatIcon({ result }: { result: TurnSnapshot["combatResult"] }) {
  if (result === "loss") return <XCircle className="h-4 w-4 text-destructive" />;
  if (result === "win" || result === "tie") return <CheckCircle2 className="h-4 w-4 text-success" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}
