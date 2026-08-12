import { BarChart3, CheckCircle2, Flag, Gauge, RotateCcw } from "lucide-react";

import type { AgentRun } from "@/src/domain/run";
import { formatPercent } from "@/src/lib/format";

export function RunArtifacts({ run }: { run: AgentRun }) {
  const analysis = run.artifacts.metricsAnalysis;
  const experiments = run.artifacts.experiments;
  const scores = run.artifacts.scoredExperiments;
  const actionPlan = run.artifacts.actionPlan;

  if (!analysis && !experiments && !actionPlan) return null;

  return (
    <div className="space-y-5">
      {analysis ? (
        <section className="artifact-section">
          <div className="artifact-heading">
            <Gauge aria-hidden="true" size={16} />
            <h3>Metric diagnosis</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Trial users"
              value={analysis.baseline.trialUsers.toLocaleString()}
            />
            <Stat
              label="Paid users"
              value={analysis.baseline.paidUsers.toLocaleString()}
            />
            <Stat
              label="Conversion"
              value={formatPercent(analysis.baseline.conversionRate)}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Largest drop-off: {analysis.largestDropOff.fromStage} →{" "}
            {analysis.largestDropOff.toStage} (
            {formatPercent(analysis.largestDropOff.dropOffRate)}).
          </p>
        </section>
      ) : null}

      {experiments && scores ? (
        <section className="artifact-section">
          <div className="artifact-heading">
            <BarChart3 aria-hidden="true" size={16} />
            <h3>Ranked experiments</h3>
          </div>
          <div className="mt-4 divide-y divide-white/7">
            {scores.ranked.map((score) => {
              const experiment = experiments.find(
                (candidate) => candidate.id === score.experimentId,
              );
              if (!experiment) return null;
              const approval = run.approvals.find(
                (candidate) => candidate.experimentId === experiment.id,
              );
              return (
                <div
                  className="grid gap-3 py-4 sm:grid-cols-[2rem_1fr_auto]"
                  key={experiment.id}
                >
                  <span className="rank-number">{score.rank}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {experiment.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {score.rationale}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {approval ? (
                      <span
                        className={`decision-chip decision-${approval.status}`}
                      >
                        {approval.status}
                      </span>
                    ) : null}
                    <span className="font-mono text-sm font-semibold text-emerald-200">
                      {score.weightedScore.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {actionPlan ? (
        <section className="artifact-section border-emerald-300/15">
          <div className="artifact-heading text-emerald-200">
            <Flag aria-hidden="true" size={16} />
            <h3>Approved action plan</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {actionPlan.objective}
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="section-kicker">Milestones</p>
              <ol className="mt-3 space-y-3">
                {actionPlan.milestones.map((milestone) => (
                  <li
                    className="flex gap-3"
                    key={`${milestone.dueDay}-${milestone.title}`}
                  >
                    <span className="day-chip">D{milestone.dueDay}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {milestone.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {milestone.deliverable}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="section-kicker">Execution tasks</p>
              <ul className="mt-3 space-y-2">
                {actionPlan.tasks.map((task) => (
                  <li
                    className="flex items-start gap-2.5 text-sm text-slate-300"
                    key={task.id}
                  >
                    <CheckCircle2
                      className="mt-0.5 shrink-0 text-emerald-300"
                      size={15}
                    />
                    <span>
                      {task.title}
                      <span className="block text-xs text-slate-600">
                        {task.owner}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-rose-300/10 bg-rose-300/[0.035] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-rose-200">
              <RotateCcw size={14} /> Rollback triggers
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
              {actionPlan.rollbackTriggers.map((trigger) => (
                <li key={trigger}>• {trigger}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/7 bg-black/10 px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.09em] text-slate-600">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold text-slate-200">
        {value}
      </p>
    </div>
  );
}
