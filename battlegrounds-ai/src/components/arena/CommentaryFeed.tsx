import type { GameEvent } from "@/engine/types";

type RecruitEvent = Extract<GameEvent, { type: "recruitAction" }>;

export function CommentaryFeed({ entries }: { entries: RecruitEvent[] }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="h-1.5 w-1.5 rounded-full bg-violet" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Aurora&rsquo;s Reasoning</span>
      </div>
      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3" style={{ maxHeight: 560 }}>
        {entries.length === 0 && <p className="text-xs text-text-faint">Decisions will appear here as the game plays.</p>}
        {entries.map((e, i) => (
          <div key={`${e.round}-${e.seat}-${i}-${e.action.kind}`} className="animate-fade-in-up border-b border-border/60 pb-3 last:border-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium text-text-faint">R{e.round}</span>
              {e.reasoning?.winProbEstimate != null && (
                <span className="text-[10px] tabular text-text-faint">{Math.round(e.reasoning.winProbEstimate * 100)}% win read</span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-text-secondary [&>strong]:font-semibold [&>strong]:text-text">
              {renderBold(e.commentary ?? "")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
