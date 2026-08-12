import type { RunStatus } from "@/src/domain/run";

const statusLabels: Record<RunStatus, string> = {
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  waiting_for_approval: "Needs approval",
  completed: "Completed",
  failed: "Failed",
};

const statusClasses: Record<RunStatus, string> = {
  queued: "status-neutral",
  planning: "status-active",
  running: "status-active",
  waiting_for_approval: "status-warning",
  completed: "status-success",
  failed: "status-danger",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`status-badge ${statusClasses[status]}`}>
      <span className="status-dot" aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
