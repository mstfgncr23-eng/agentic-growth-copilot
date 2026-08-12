import { type AgentRun, type RunStep, StepKeySchema } from "@/src/domain/run";

const timestamp = "2026-08-12T12:00:00.000Z";

export function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  const stepKeys = StepKeySchema.options;
  const steps: RunStep[] = stepKeys.map((key, index) => ({
    id: `step_${index}`,
    key,
    label: key.replaceAll("_", " "),
    status: "pending",
    attempt: 1,
  }));

  return {
    id: "run_test",
    workspaceId: "workspace_demo",
    projectId: "project_demo",
    conversationId: "conversation_test",
    triggerMessageId: "message_test",
    idempotencyKey: "idem_test_123",
    goal: "Increase trial to paid conversion",
    status: "queued",
    mode: "mock",
    demoScenario: "happy_path",
    version: 0,
    attempt: 1,
    contextSnapshot: { messageIds: ["message_test"] },
    steps,
    approvals: [],
    artifacts: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
