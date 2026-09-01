import type { Plan } from '@/lib/types';

export default function PlanSteps({ plan }: { plan: Plan }) {
  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-slate-100">{plan.headline}</h3>
      <p className="mb-4 text-xs text-muted">
        Step-by-step {plan.horizon === 'short' ? 'short-term' : 'long-term'} walkthrough — each
        step is derived from the numbers above, in order.
      </p>
      <ol className="space-y-3">
        {plan.steps.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-lg border border-border bg-panel2 p-3.5">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-100">{step.title}</div>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
