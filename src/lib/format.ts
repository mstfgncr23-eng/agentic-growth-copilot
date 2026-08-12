export function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return "—";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round(
    (milliseconds % 60_000) / 1_000,
  )}s`;
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function runDuration(run: {
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}): number | undefined {
  if (!run.startedAt) return undefined;
  return Math.max(
    0,
    new Date(run.completedAt ?? run.updatedAt).getTime() -
      new Date(run.startedAt).getTime(),
  );
}
