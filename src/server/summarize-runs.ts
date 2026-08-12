import type { AgentRun } from "@/src/domain/run";

export interface RunMetrics {
  total: number;
  completed: number;
  failed: number;
  waitingForApproval: number;
  successRate: number;
  averageDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function summarizeRuns(runs: AgentRun[]): RunMetrics {
  const completed = runs.filter((run) => run.status === "completed").length;
  const durations = runs
    .map(durationFor)
    .filter((duration): duration is number => duration !== null);
  return {
    total: runs.length,
    completed,
    failed: runs.filter((run) => run.status === "failed").length,
    waitingForApproval: runs.filter(
      (run) => run.status === "waiting_for_approval",
    ).length,
    successRate: runs.length === 0 ? 0 : completed / runs.length,
    averageDurationMs:
      durations.length === 0
        ? 0
        : Math.round(
            durations.reduce((total, duration) => total + duration, 0) /
              durations.length,
          ),
    totalInputTokens: runs.reduce(
      (total, run) => total + (run.modelUsage?.inputTokens ?? 0),
      0,
    ),
    totalOutputTokens: runs.reduce(
      (total, run) => total + (run.modelUsage?.outputTokens ?? 0),
      0,
    ),
  };
}

function durationFor(run: AgentRun): number | null {
  if (!run.startedAt) return null;
  const end = run.completedAt ?? run.updatedAt;
  return Math.max(
    0,
    new Date(end).getTime() - new Date(run.startedAt).getTime(),
  );
}
