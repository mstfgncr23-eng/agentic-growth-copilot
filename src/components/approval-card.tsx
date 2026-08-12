import { ArrowRight, Check, ShieldCheck, X } from "lucide-react";

import type { AgentRun } from "@/src/domain/run";

export function ApprovalCard({
  run,
  disabled,
  onDecision,
}: {
  run: AgentRun;
  disabled: boolean;
  onDecision: (decision: "approve" | "reject") => void;
}) {
  const approval = run.approvals.find((item) => item.status === "pending");
  const experiment = run.artifacts.experiments?.find(
    (item) => item.id === approval?.experimentId,
  );
  const score = run.artifacts.scoredExperiments?.ranked.find(
    (item) => item.experimentId === approval?.experimentId,
  );
  if (!approval || !experiment) return null;

  return (
    <section className="approval-card" aria-labelledby="approval-title">
      <div className="flex items-center gap-2 text-amber-200">
        <ShieldCheck aria-hidden="true" size={17} />
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
          Human approval required
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h3 id="approval-title" className="text-lg font-semibold text-white">
            {experiment.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {experiment.hypothesis}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Metric
              label="Score"
              value={score ? score.weightedScore.toFixed(2) : "—"}
            />
            <Metric label="Effort" value={experiment.effort} />
            <Metric
              label="Window"
              value={`${experiment.estimatedDurationDays} days`}
            />
          </div>
        </div>
        <div className="min-w-36 rounded-xl border border-amber-200/15 bg-black/15 p-3 text-xs leading-5 text-amber-100/70">
          The action-plan tool is blocked server-side until this decision is
          persisted.
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-amber-200/10 pt-4">
        <button
          className="approve-button"
          disabled={disabled}
          onClick={() => onDecision("approve")}
          type="button"
        >
          <Check aria-hidden="true" size={16} />
          Approve & continue
          <ArrowRight aria-hidden="true" size={15} />
        </button>
        <button
          className="reject-button"
          disabled={disabled}
          onClick={() => onDecision("reject")}
          type="button"
        >
          <X aria-hidden="true" size={16} />
          Reject & review next
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.035] px-2.5 py-1.5 text-xs text-slate-300">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium capitalize text-slate-200">{value}</span>
    </span>
  );
}
