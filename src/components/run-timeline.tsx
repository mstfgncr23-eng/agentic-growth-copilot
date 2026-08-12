import {
  Check,
  Circle,
  Clock3,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import type { AgentRun, RunStep, StepKey } from "@/src/domain/run";
import type { RunEvent } from "@/src/domain/run-event";
import { formatDuration } from "@/src/lib/format";
import { StatusBadge } from "@/src/components/status-badge";

type TimelineStep = Pick<RunStep, "key" | "label" | "status" | "attempt"> &
  Partial<Pick<RunStep, "durationMs" | "error">>;

const fallbackSteps: TimelineStep[] = [
  {
    key: "analyze_goal",
    label: "Analyzing goal",
    status: "pending",
    attempt: 1,
  },
  {
    key: "analyze_metrics",
    label: "Reading product metrics",
    status: "pending",
    attempt: 1,
  },
  {
    key: "create_experiments",
    label: "Generating experiments",
    status: "pending",
    attempt: 1,
  },
  {
    key: "score_experiments",
    label: "Scoring experiments",
    status: "pending",
    attempt: 1,
  },
  {
    key: "request_approval",
    label: "Waiting for approval",
    status: "pending",
    attempt: 1,
  },
  {
    key: "generate_action_plan",
    label: "Building action plan",
    status: "pending",
    attempt: 1,
  },
  {
    key: "compose_summary",
    label: "Writing decision summary",
    status: "pending",
    attempt: 1,
  },
];

export function RunTimeline({
  run,
  liveEvents,
  liveRunId,
}: {
  run?: AgentRun;
  liveEvents: RunEvent[];
  liveRunId?: string;
}) {
  const relevantEvents = liveEvents.filter(
    (event) => !liveRunId || event.runId === liveRunId,
  );
  const liveStatus = [...relevantEvents]
    .reverse()
    .find((event) => event.type === "run.status");
  const status =
    liveStatus?.type === "run.status" ? liveStatus.payload.status : run?.status;
  const baseSteps: TimelineStep[] = run?.steps ?? fallbackSteps;
  const steps: TimelineStep[] = baseSteps.map((step) => {
    const event = [...relevantEvents]
      .reverse()
      .find(
        (candidate) =>
          candidate.type === "step.status" &&
          candidate.payload.stepKey === step.key,
      );
    return event?.type === "step.status"
      ? { ...step, status: event.payload.status, error: event.payload.error }
      : step;
  });

  return (
    <aside className="timeline-panel">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <p className="section-kicker">Live execution</p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            Run timeline
          </h2>
        </div>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <ol className="timeline-list">
        {steps.map((step, index) => (
          <li className="timeline-item" key={step.key}>
            <div className="timeline-rail" aria-hidden="true">
              <StepIcon status={step.status} />
              {index < steps.length - 1 ? <span /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {step.status.replaceAll("_", " ")}
                    {step.attempt > 1 ? ` · attempt ${step.attempt}` : ""}
                  </p>
                </div>
                {step.durationMs !== undefined ? (
                  <span className="font-mono text-[11px] text-slate-500">
                    {formatDuration(step.durationMs)}
                  </span>
                ) : null}
              </div>
              {step.error ? (
                <p className="mt-2 rounded-lg border border-rose-400/15 bg-rose-400/6 px-3 py-2 text-xs leading-5 text-rose-200">
                  {step.error.message}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="mx-5 mb-5 rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-3 text-xs leading-5 text-slate-500">
        Every completed step is checkpointed. A retry resumes from the first
        failed step.
      </div>
    </aside>
  );
}

function StepIcon({ status }: { status: RunStep["status"] }) {
  const className = "h-7 w-7 rounded-full border p-1.5";
  if (status === "completed") {
    return (
      <Check
        className={`${className} border-emerald-300/25 bg-emerald-300/10 text-emerald-300`}
      />
    );
  }
  if (status === "running") {
    return (
      <LoaderCircle
        className={`${className} animate-spin border-sky-300/25 bg-sky-300/10 text-sky-300`}
      />
    );
  }
  if (status === "waiting") {
    return (
      <Clock3
        className={`${className} border-amber-300/30 bg-amber-300/10 text-amber-300`}
      />
    );
  }
  if (status === "failed") {
    return (
      <TriangleAlert
        className={`${className} border-rose-300/30 bg-rose-300/10 text-rose-300`}
      />
    );
  }
  if (status === "skipped") {
    return (
      <RotateCcw
        className={`${className} border-slate-500/30 bg-slate-500/10 text-slate-500`}
      />
    );
  }
  return (
    <Circle
      className={`${className} border-slate-700 bg-slate-900 text-slate-600`}
    />
  );
}

export type TimelineStepKey = StepKey;
