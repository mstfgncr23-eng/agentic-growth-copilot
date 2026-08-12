import { describe, expect, it } from "vitest";

import { createQueuedRun } from "@/src/agent/run-factory";

describe("queued run factory", () => {
  it("creates the complete bounded workflow and durable failure injection", () => {
    const { run, userMessage } = createQueuedRun({
      workspaceId: "workspace_demo",
      projectId: "project_demo",
      conversationId: "conversation_demo",
      goal: "Increase trial conversion",
      idempotencyKey: "request_12345678",
      mode: "mock",
      demoScenario: "fail_once_at_scoring",
      contextSnapshot: { messageIds: [] },
      createdAt: "2026-08-12T12:00:00.000Z",
    });

    expect(run.steps.map((step) => step.key)).toEqual([
      "analyze_goal",
      "analyze_metrics",
      "create_experiments",
      "score_experiments",
      "request_approval",
      "generate_action_plan",
      "compose_summary",
    ]);
    expect(run.failureInjection).toEqual({
      stepKey: "score_experiments",
      consumed: false,
    });
    expect(run.contextSnapshot.messageIds).toContain(userMessage.id);
  });
});
