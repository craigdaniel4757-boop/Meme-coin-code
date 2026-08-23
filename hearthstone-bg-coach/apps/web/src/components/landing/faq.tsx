const FAQS = [
  {
    q: "What video formats are supported?",
    a: "MP4, MOV, and WebM recordings work best. Make sure the in-game HUD (tavern tier, gold, board, shop) is visible and not obstructed by other overlays.",
  },
  {
    q: "How long does analysis take?",
    a: "Most games are processed in a few minutes, depending on video length. Longer games with more turns take a bit longer since more frames need to be read.",
  },
  {
    q: "Do I need to record the whole game?",
    a: "For the most accurate placement and full-game grading, yes - but a partial recording still gets analyzed for whatever turns it covers.",
  },
  {
    q: "Is my video stored or shared?",
    a: "Uploaded videos and reports are only used to generate your analysis. See the project README for exactly how storage is handled in this deployment.",
  },
  {
    q: "What skill level is this for?",
    a: "Any level. The benchmarks TavernIQ checks against - tavern curve, positioning fundamentals, hero power usage - matter from your first lobby through high Legend.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="scroll-mt-16 border-t border-border/60 py-20">
      <div className="container max-w-3xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
        </div>
        <div className="mt-12 divide-y divide-border rounded-lg border border-border bg-card">
          {FAQS.map((item) => (
            <details key={item.q} className="group p-6 open:bg-secondary/20">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium marker:content-none">
                {item.q}
                <span className="ml-4 shrink-0 text-xl leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
