import { describe, expect, it } from "vitest";

import { summarizeRuns } from "@/src/server/summarize-runs";
import { makeRun } from "@/tests/helpers/run-fixture";

describe("internal run metrics", () => {
  it("summarizes status, duration, and model usage", () => {
    const metrics = summarizeRuns([
      makeRun({
        id: "run_completed",
        status: "completed",
        outcome: "no_experiment_approved",
        startedAt: "2026-08-12T12:00:00.000Z",
        completedAt: "2026-08-12T12:00:02.000Z",
        modelUsage: {
          provider: "mock",
          model: "growth-copilot-v1",
          inputTokens: 100,
          outputTokens: 50,
          simulated: true,
        },
      }),
      makeRun({
        id: "run_failed",
        status: "failed",
        startedAt: "2026-08-12T12:00:00.000Z",
        completedAt: "2026-08-12T12:00:04.000Z",
        error: {
          code: "TOOL_TIMEOUT",
          message: "The tool timed out.",
          retryable: true,
        },
        modelUsage: {
          provider: "mock",
          model: "growth-copilot-v1",
          inputTokens: 25,
          outputTokens: 10,
          simulated: true,
        },
      }),
      makeRun({
        id: "run_waiting",
        status: "waiting_for_approval",
        approvals: [
          {
            id: "approval_metrics",
            stepId: "step_4",
            experimentId: "experiment_metrics",
            experimentTitle: "Outcome checklist",
            status: "pending",
            requestedAt: "2026-08-12T12:00:01.000Z",
          },
        ],
      }),
    ]);

    expect(metrics).toEqual({
      total: 3,
      completed: 1,
      failed: 1,
      waitingForApproval: 1,
      successRate: 1 / 3,
      averageDurationMs: 3_000,
      totalInputTokens: 125,
      totalOutputTokens: 60,
    });
  });
});
