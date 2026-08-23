import { Card, CardContent } from "@/components/ui/card";
import { KeyStats } from "@/types/report";

interface StatOverviewProps {
  keyStats: KeyStats;
  mistakeCount: number;
  strengthCount: number;
}

export function StatOverview({ keyStats, mistakeCount, strengthCount }: StatOverviewProps) {
  const tiles = [
    { label: "Issues flagged", value: String(mistakeCount) },
    { label: "Strong turns", value: String(strengthCount) },
    { label: "Hero power usage", value: `${Math.round(keyStats.heroPowerUsageRate * 100)}%` },
    { label: "Avg. gold unspent / turn", value: keyStats.avgGoldUnspent.toFixed(1) },
    { label: "Turns above 25 health", value: String(keyStats.turnsAboveHealthThreshold) },
    { label: "Triples achieved", value: String(keyStats.tripleCount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tile.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
