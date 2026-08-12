import { z } from "zod";

import { AgentRunSchema } from "@/src/domain/run";
import { RunEventSchema } from "@/src/domain/run-event";
import { ApiErrorSchema } from "@/src/server/api-error";

export const StreamFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run.event"), event: RunEventSchema }),
  z.object({
    type: z.literal("run.snapshot"),
    run: AgentRunSchema,
    created: z.boolean().optional(),
    duplicate: z.boolean().optional(),
  }),
  z.object({ type: z.literal("error"), error: ApiErrorSchema }),
]);

export type StreamFrame = z.infer<typeof StreamFrameSchema>;
