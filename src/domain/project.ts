import { z } from "zod";

import { EntityIdSchema, IsoDateSchema } from "@/src/domain/common";

export const ProjectSchema = z.object({
  id: EntityIdSchema,
  workspaceId: EntityIdSchema,
  name: z.string().min(1).max(120),
  metricsSnapshot: z.object({
    dataAsOf: IsoDateSchema,
    windowDays: z.number().int().positive().max(365),
    funnel: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          users: z.number().int().nonnegative(),
        }),
      )
      .min(2),
    segments: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        trialUsers: z.number().int().nonnegative(),
        paidUsers: z.number().int().nonnegative(),
      }),
    ),
  }),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export type Project = z.infer<typeof ProjectSchema>;
