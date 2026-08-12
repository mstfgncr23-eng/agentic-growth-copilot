import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, ExternalLink, Sparkles } from "lucide-react";

import { RunArtifacts } from "@/src/components/run-artifacts";
import { RunTimeline } from "@/src/components/run-timeline";
import { StatusBadge } from "@/src/components/status-badge";
import { formatDuration, formatTimestamp, runDuration } from "@/src/lib/format";
import { getAgentServices } from "@/src/server/services";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const { store } = await getAgentServices();
  const run = await store.getRun(runId);
  if (!run) notFound();
  const events = await store.listRunEvents(runId);

  return (
    <main className="run-detail-page">
      <header className="operations-header">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link className="brand-lockup" href="/">
            <span className="brand-mark">
              <Sparkles size={17} />
            </span>
            <span>
              <strong>Growth Copilot</strong>
              <small>Run inspector</small>
            </span>
          </Link>
          <Link className="secondary-button" href="/internal/runs">
            <ArrowLeft size={15} /> All runs
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-5 border-b border-white/8 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <StatusBadge status={run.status} />
              <span className="font-mono text-[11px] text-slate-700">
                attempt {run.attempt}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-3xl">
              {run.goal}
            </h1>
            <p className="mt-3 font-mono text-[11px] text-slate-600">
              {run.id}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <InspectorStat
              label="Duration"
              value={formatDuration(runDuration(run))}
            />
            <InspectorStat label="Events" value={events.length.toString()} />
            <InspectorStat
              label="Steps"
              value={`${run.steps.filter((step) => step.status === "completed").length}/${run.steps.length}`}
            />
            <InspectorStat label="Mode" value={run.mode} />
          </div>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            {run.artifacts.finalSummary ? (
              <section className="artifact-section">
                <p className="section-kicker">Decision summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {run.artifacts.finalSummary}
                </p>
              </section>
            ) : null}
            <RunArtifacts run={run} />
            <section className="operations-table-card">
              <div className="border-b border-white/8 px-5 py-4">
                <p className="section-kicker">Audit trail</p>
                <h2 className="mt-1 text-sm font-semibold text-white">
                  Semantic events
                </h2>
              </div>
              <div className="max-h-[30rem] divide-y divide-white/6 overflow-y-auto">
                {events.map((event) => (
                  <div
                    className="grid grid-cols-[2.5rem_1fr_auto] gap-3 px-5 py-3 text-xs"
                    key={event.id}
                  >
                    <span className="font-mono text-slate-700">
                      #{event.sequence}
                    </span>
                    <div>
                      <p className="font-medium text-slate-300">{event.type}</p>
                      <p className="mt-1 max-w-2xl truncate font-mono text-[10px] text-slate-700">
                        {JSON.stringify(event.payload)}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-slate-600">
                      {formatTimestamp(event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="space-y-5">
            <div className="overflow-hidden rounded-xl border border-white/8">
              <RunTimeline liveEvents={[]} run={run} />
            </div>
            <section className="artifact-section">
              <div className="flex items-center gap-2 text-slate-400">
                <Database size={15} />
                <h2 className="text-xs font-semibold uppercase tracking-[0.09em]">
                  Execution metadata
                </h2>
              </div>
              <dl className="mt-4 space-y-3 text-xs">
                <Meta
                  label="Provider"
                  value={run.modelUsage?.provider ?? "—"}
                />
                <Meta label="Model" value={run.modelUsage?.model ?? "—"} />
                <Meta
                  label="Input tokens"
                  value={(run.modelUsage?.inputTokens ?? 0).toLocaleString()}
                />
                <Meta
                  label="Output tokens"
                  value={(run.modelUsage?.outputTokens ?? 0).toLocaleString()}
                />
                <Meta label="Created" value={formatTimestamp(run.createdAt)} />
                <Meta label="Updated" value={formatTimestamp(run.updatedAt)} />
              </dl>
              <Link
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-200"
                href="/workspace"
              >
                Open in workspace <ExternalLink size={13} />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function InspectorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.09em] text-slate-700">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-semibold capitalize text-slate-300">
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="max-w-44 truncate font-mono text-slate-300">{value}</dd>
    </div>
  );
}
