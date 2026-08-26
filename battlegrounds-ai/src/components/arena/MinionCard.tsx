import type { MinionInstance } from "@/engine/types";
import { tribeMeta } from "@/engine/data/tribes";
import { KEYWORD_META } from "@/engine/data/keywords";

const SIZE_CLASSES = {
  sm: { card: "w-16 min-h-24", name: "text-[9px]", stat: "text-[10px] h-4 min-w-4 px-1", glyph: "text-[10px]" },
  md: { card: "w-20 min-h-28", name: "text-[10px]", stat: "text-xs h-5 min-w-5 px-1", glyph: "text-xs" },
  lg: { card: "w-24 min-h-32", name: "text-xs", stat: "text-sm h-6 min-w-6 px-1.5", glyph: "text-sm" },
} as const;

export function MinionCard({
  minion,
  size = "md",
  highlighted = false,
  dimmed = false,
  flash = null,
}: {
  minion: MinionInstance;
  size?: "sm" | "md" | "lg";
  highlighted?: boolean;
  dimmed?: boolean;
  flash?: "attack" | "damage" | "death" | null;
}) {
  const meta = tribeMeta(minion.tribe);
  const s = SIZE_CLASSES[size];
  const keywords = minion.keywords;

  return (
    <div
      title={`${minion.name}${minion.golden ? " (Golden)" : ""} — ${minion.text}`}
      className={[
        s.card,
        "group relative flex shrink-0 flex-col overflow-hidden rounded-lg border transition-all duration-150",
        dimmed ? "opacity-35 grayscale" : "opacity-100",
        highlighted ? "-translate-y-1 shadow-lg" : "",
        flash === "attack" ? "scale-110" : "",
        flash === "damage" ? "animate-[shake_0.3s]" : "",
        flash === "death" ? "opacity-0 scale-75" : "",
      ].join(" ")}
      style={{
        borderColor: highlighted ? meta.color : "var(--border)",
        background: `linear-gradient(160deg, ${meta.bg}, var(--panel))`,
        boxShadow: highlighted ? `0 0 0 1px ${meta.color}, 0 8px 20px -6px ${meta.color}88` : undefined,
      }}
    >
      {minion.golden && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "linear-gradient(120deg, transparent 30%, #fff6d0 48%, transparent 66%)" }}
        />
      )}
      <div className="h-1 w-full shrink-0" style={{ background: meta.color }} />
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-center">
        <span className={`${s.glyph} leading-none`}>{meta.glyph}</span>
        <span className={`${s.name} font-medium leading-tight text-text-secondary line-clamp-2`}>
          {minion.name}
          {minion.golden ? " ★" : ""}
        </span>
      </div>
      {keywords.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-0.5 px-1 pb-1">
          {keywords.map((k) => (
            <span key={k} title={KEYWORD_META[k].label} className="text-[9px] leading-none opacity-90">
              {KEYWORD_META[k].glyph}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-1 pb-1">
        <span className={`${s.stat} flex items-center justify-center rounded-full bg-gold-chart font-bold text-bg tabular`}>
          {minion.attack}
        </span>
        <span className={`${s.stat} flex items-center justify-center rounded-full bg-coral font-bold text-bg tabular`}>
          {minion.health}
        </span>
      </div>
    </div>
  );
}

export function EmptySlot({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = SIZE_CLASSES[size];
  return <div className={`${s.card} aspect-[2/3] shrink-0 rounded-lg border border-dashed border-border`} />;
}
