import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Gauge,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { StatusBadge } from "@/src/components/status-badge";
import {
  RunStatusSchema,
  type AgentRun,
  type RunStatus,
} from "@/src/domain/run";
import { DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { formatDuration, formatTimestamp, runDuration } from "@/src/lib/format";
import { getAgentServices } from "@/src/server/services";
import { summarizeRuns } from "@/src/server/summarize-runs";

export const dynamic = "force-dynamic";

export default async function InternalRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const parsedStatus = query.status
    ? RunStatusSchema.safeParse(query.status)
    : undefined;
  const status = parsedStatus?.success ? parsedStatus.data : undefined;
  const { store } = await getAgentServices();
  const allRuns = await store.listRuns({
    workspaceId: DEMO_WORKSPACE_ID,
    limit: 500,
  });
  const runs = status
    ? allRuns.filter((run) => run.status === status)
    : allRuns;
  const metrics = summarizeRuns(allRuns);

  return (
    <main className="operations-page">
      <header className="operations-header">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link className="brand-lockup" href="/">
            <span className="brand-mark">
              <Sparkles size={17} />
            </span>
            <span>
              <strong>Growth Copilot</strong>
              <small>Mission control</small>
            </span>
          </Link>
          <Link className="secondary-button" href="/workspace">
            <ArrowLeft size={15} /> Back to workspace
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Internal operations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">
              Agent run monitoring
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Inspect execution state, approval backlog, failures, timing, and
              simulated model usage.
            </p>
          </div>
          <span className="mode-badge inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Live
            data
          </span>
        </div>

        <section className="metrics-grid" aria-label="Run metrics">
          <MetricCard
            icon={<Activity size={16} />}
            label="Total runs"
            value={metrics.total.toString()}
            detail="All recorded runs"
          />
          <MetricCard
            icon={<CheckCircle2 size={16} />}
            label="Success rate"
            value={`${Math.round(metrics.successRate * 100)}%`}
            detail={`${metrics.completed} completed`}
            tone="success"
          />
          <MetricCard
            icon={<Clock3 size={16} />}
            label="Avg. duration"
            value={formatDuration(metrics.averageDurationMs)}
            detail="Across started runs"
          />
          <MetricCard
            icon={<Gauge size={16} />}
            label="Awaiting approval"
            value={metrics.waitingForApproval.toString()}
            detail="Human action required"
            tone="warning"
          />
          <MetricCard
            icon={<TriangleAlert size={16} />}
            label="Failed"
            value={metrics.failed.toString()}
            detail="Retryable and terminal"
            tone="danger"
          />
        </section>

        <section className="operations-table-card">
          <div className="flex flex-col gap-4 border-b border-white/8 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Runs</h2>
              <p className="mt-1 text-xs text-slate-600">
                {runs.length} matching records
              </p>
            </div>
            <StatusFilters active={status} />
          </div>
          <div className="overflow-x-auto">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Steps</th>
                  <th>Mode / model / tokens</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td
                      className="py-12 text-center text-sm text-slate-600"
                      colSpan={6}
                    >
                      No runs match this filter.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => <RunRow key={run.id} run={run} />)
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-700">
          <span>Mock token counts are explicitly marked as simulated.</span>
          <span>All timestamps stored as UTC ISO-8601.</span>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <p className="mt-4 font-mono text-2xl font-semibold text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-600">{detail}</p>
    </div>
  );
}

function StatusFilters({ active }: { active?: RunStatus }) {
  const filters: Array<{ label: string; value?: RunStatus }> = [
    { label: "All" },
    { label: "Running", value: "running" },
    { label: "Approval", value: "waiting_for_approval" },
    { label: "Completed", value: "completed" },
    { label: "Failed", value: "failed" },
  ];
  return (
    <nav className="filter-pills" aria-label="Filter runs by status">
      {filters.map((filter) => (
        <Link
          className={active === filter.value ? "filter-active" : ""}
          href={
            filter.value
              ? `/internal/runs?status=${filter.value}`
              : "/internal/runs"
          }
          key={filter.label}
        >
          {filter.label}
        </Link>
      ))}
    </nav>
  );
}

function RunRow({ run }: { run: AgentRun }) {
  const completedSteps = run.steps.filter(
    (step) => step.status === "completed",
  ).length;
  const totalTokens =
    (run.modelUsage?.inputTokens ?? 0) + (run.modelUsage?.outputTokens ?? 0);
  return (
    <tr>
      <td>
        <Link className="run-table-link" href={`/runs/${run.id}`}>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-slate-500">
            <Bot size={14} />
          </span>
          <span className="min-w-0">
            <strong>{run.goal}</strong>
            <small>{run.id.slice(0, 22)}…</small>
          </span>
        </Link>
      </td>
      <td>
        <StatusBadge status={run.status} />
      </td>
      <td className="font-mono text-xs text-slate-400">
        {formatDuration(runDuration(run))}
      </td>
      <td>
        <span className="text-sm text-slate-300">{completedSteps}</span>
        <span className="text-xs text-slate-600"> / {run.steps.length}</span>
      </td>
      <td>
        <p className="text-xs capitalize text-slate-400">
          {run.mode} · {run.modelUsage?.model ?? "—"}
        </p>
        <p className="mt-1 font-mono text-[11px] text-slate-600">
          {totalTokens.toLocaleString()}{" "}
          {run.modelUsage?.simulated ? "sim." : "tokens"}
        </p>
      </td>
      <td className="whitespace-nowrap text-xs text-slate-500">
        {formatTimestamp(run.updatedAt)}
      </td>
    </tr>
  );
}
