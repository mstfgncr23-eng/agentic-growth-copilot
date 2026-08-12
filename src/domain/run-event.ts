import { z } from "zod";

import { EntityIdSchema, IsoDateSchema } from "@/src/domain/common";
import {
  ApprovalStatusSchema,
  RunErrorSchema,
  RunStatusSchema,
  StepKeySchema,
  StepStatusSchema,
} from "@/src/domain/run";

const RunEventBaseSchema = z.object({
  id: EntityIdSchema,
  workspaceId: EntityIdSchema,
  runId: EntityIdSchema,
  sequence: z.number().int().positive(),
  createdAt: IsoDateSchema,
});

export const RunEventSchema = z.discriminatedUnion("type", [
  RunEventBaseSchema.extend({
    type: z.literal("run.status"),
    payload: z.object({ status: RunStatusSchema }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("plan.ready"),
    payload: z.object({ objective: z.string().min(1) }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("step.status"),
    payload: z.object({
      stepKey: StepKeySchema,
      status: StepStatusSchema,
      label: z.string().min(1),
      error: RunErrorSchema.optional(),
    }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("approval.requested"),
    payload: z.object({
      approvalId: EntityIdSchema,
      experimentId: EntityIdSchema,
      experimentTitle: z.string().min(1),
    }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("approval.decided"),
    payload: z.object({
      approvalId: EntityIdSchema,
      status: ApprovalStatusSchema.exclude(["pending"]),
    }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("artifact.ready"),
    payload: z.object({
      artifact: z.enum([
        "metrics_analysis",
        "experiments",
        "scores",
        "action_plan",
        "final_summary",
      ]),
    }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("message.delta"),
    payload: z.object({
      messageId: EntityIdSchema,
      delta: z.string(),
    }),
  }),
  RunEventBaseSchema.extend({
    type: z.literal("stream.end"),
    payload: z.object({ reason: z.enum(["approval", "completed", "failed"]) }),
  }),
]);

export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunEventType = RunEvent["type"];
export type AppendRunEventInput = RunEvent extends infer Event
  ? Event extends RunEvent
    ? Omit<Event, "id" | "sequence">
    : never
  : never;
