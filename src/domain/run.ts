import { z } from "zod";

import { RunArtifactsSchema } from "@/src/domain/artifacts";
import { EntityIdSchema, IsoDateSchema } from "@/src/domain/common";

export const RunStatusSchema = z.enum([
  "queued",
  "planning",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
]);

export const RunOutcomeSchema = z.enum([
  "action_plan_created",
  "no_experiment_approved",
]);

export const RunModeSchema = z.enum(["mock", "live"]);

export const DemoScenarioSchema = z.enum([
  "happy_path",
  "fail_once_at_scoring",
]);

export const StepKeySchema = z.enum([
  "analyze_goal",
  "analyze_metrics",
  "create_experiments",
  "score_experiments",
  "request_approval",
  "generate_action_plan",
  "compose_summary",
]);

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "skipped",
]);

export const RunErrorSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
  failedStepKey: StepKeySchema.optional(),
  requestId: EntityIdSchema.optional(),
});

export const RunStepSchema = z.object({
  id: EntityIdSchema,
  key: StepKeySchema,
  label: z.string().min(1).max(120),
  status: StepStatusSchema,
  toolName: z.string().min(1).max(80).optional(),
  attempt: z.number().int().positive(),
  startedAt: IsoDateSchema.optional(),
  completedAt: IsoDateSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  error: RunErrorSchema.optional(),
});

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const ApprovalSchema = z.object({
  id: EntityIdSchema,
  stepId: EntityIdSchema,
  experimentId: EntityIdSchema,
  experimentTitle: z.string().min(1).max(120),
  status: ApprovalStatusSchema,
  requestedAt: IsoDateSchema,
  decidedAt: IsoDateSchema.optional(),
  decisionId: EntityIdSchema.optional(),
  feedback: z.string().trim().max(1_000).optional(),
});

export const AgentPlanSchema = z.object({
  objective: z.string().min(5).max(500),
  assumptions: z.array(z.string().min(2)).max(8),
  stepKeys: z.array(StepKeySchema).min(1),
});

export const ModelUsageSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  simulated: z.boolean(),
});

export const RunContextSnapshotSchema = z.object({
  messageIds: z.array(EntityIdSchema).min(1),
  previousRunId: EntityIdSchema.optional(),
  previousRunSummary: z.string().max(4_000).optional(),
});

export const AgentRunSchema = z.object({
  id: EntityIdSchema,
  workspaceId: EntityIdSchema,
  projectId: EntityIdSchema,
  conversationId: EntityIdSchema,
  triggerMessageId: EntityIdSchema,
  idempotencyKey: z.string().min(8).max(160),
  goal: z.string().min(3).max(4_000),
  status: RunStatusSchema,
  outcome: RunOutcomeSchema.optional(),
  mode: RunModeSchema,
  demoScenario: DemoScenarioSchema,
  failureInjection: z
    .object({
      stepKey: StepKeySchema,
      consumed: z.boolean(),
      consumedAt: IsoDateSchema.optional(),
    })
    .optional(),
  version: z.number().int().nonnegative(),
  attempt: z.number().int().positive(),
  contextSnapshot: RunContextSnapshotSchema,
  plan: AgentPlanSchema.optional(),
  steps: z.array(RunStepSchema).min(1),
  approvals: z.array(ApprovalSchema),
  artifacts: RunArtifactsSchema,
  modelUsage: ModelUsageSchema.optional(),
  error: RunErrorSchema.optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  startedAt: IsoDateSchema.optional(),
  completedAt: IsoDateSchema.optional(),
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;
export type StepKey = z.infer<typeof StepKeySchema>;
export type RunStep = z.infer<typeof RunStepSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type RunError = z.infer<typeof RunErrorSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
