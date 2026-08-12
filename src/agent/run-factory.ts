import { z } from "zod";

import { createId, EntityIdSchema, IsoDateSchema } from "@/src/domain/common";
import {
  ConversationMessageSchema,
  type ConversationMessage,
} from "@/src/domain/conversation";
import {
  AgentRunSchema,
  DemoScenarioSchema,
  RunContextSnapshotSchema,
  RunModeSchema,
  type AgentRun,
  type RunStep,
  type StepKey,
} from "@/src/domain/run";

export const CreateQueuedRunInputSchema = z.object({
  workspaceId: EntityIdSchema,
  projectId: EntityIdSchema,
  conversationId: EntityIdSchema,
  goal: z.string().trim().min(3).max(4_000),
  idempotencyKey: z.string().trim().min(8).max(160),
  mode: RunModeSchema,
  demoScenario: DemoScenarioSchema,
  contextSnapshot: RunContextSnapshotSchema.extend({
    messageIds: z.array(EntityIdSchema),
  }),
  createdAt: IsoDateSchema,
});

const stepDefinitions: Array<{
  key: StepKey;
  label: string;
  toolName?: string;
}> = [
  { key: "analyze_goal", label: "Analyzing goal" },
  {
    key: "analyze_metrics",
    label: "Reading product metrics",
    toolName: "analyze_metrics",
  },
  {
    key: "create_experiments",
    label: "Generating experiments",
    toolName: "create_experiments",
  },
  {
    key: "score_experiments",
    label: "Scoring experiments",
    toolName: "score_experiments",
  },
  { key: "request_approval", label: "Waiting for approval" },
  {
    key: "generate_action_plan",
    label: "Building action plan",
    toolName: "generate_action_plan",
  },
  { key: "compose_summary", label: "Writing decision summary" },
];

export function createQueuedRun(
  rawInput: z.input<typeof CreateQueuedRunInputSchema>,
): { run: AgentRun; userMessage: ConversationMessage } {
  const input = CreateQueuedRunInputSchema.parse(rawInput);
  const runId = createId("run");
  const triggerMessageId = createId("message");
  const steps: RunStep[] = stepDefinitions.map((definition) => ({
    id: createId("step"),
    key: definition.key,
    label: definition.label,
    toolName: definition.toolName,
    status: "pending",
    attempt: 1,
  }));
  const failureInjection =
    input.demoScenario === "fail_once_at_scoring"
      ? {
          stepKey: "score_experiments" as const,
          consumed: false,
        }
      : undefined;
  const run = AgentRunSchema.parse({
    id: runId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    triggerMessageId,
    idempotencyKey: input.idempotencyKey,
    goal: input.goal,
    status: "queued",
    mode: input.mode,
    demoScenario: input.demoScenario,
    failureInjection,
    version: 0,
    attempt: 1,
    contextSnapshot: {
      ...input.contextSnapshot,
      messageIds: [...input.contextSnapshot.messageIds, triggerMessageId],
    },
    steps,
    approvals: [],
    artifacts: {},
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  const userMessage = ConversationMessageSchema.parse({
    id: triggerMessageId,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    runId,
    role: "user",
    status: "completed",
    content: input.goal,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  return { run, userMessage };
}
