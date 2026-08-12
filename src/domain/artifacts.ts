import { z } from "zod";

import { EntityIdSchema, IsoDateSchema } from "@/src/domain/common";

export const MetricNameSchema = z.literal("trial_to_paid");

export const FunnelStageSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  users: z.number().int().nonnegative(),
  conversionFromPrevious: z.number().min(0).max(1).nullable(),
});

export const MetricsAnalysisSchema = z.object({
  metric: MetricNameSchema,
  windowDays: z.number().int().positive().max(365),
  dataAsOf: IsoDateSchema,
  baseline: z.object({
    trialUsers: z.number().int().nonnegative(),
    paidUsers: z.number().int().nonnegative(),
    conversionRate: z.number().min(0).max(1),
  }),
  funnel: z.array(FunnelStageSchema).min(2),
  largestDropOff: z.object({
    fromStage: z.string().min(1),
    toStage: z.string().min(1),
    lostUsers: z.number().int().nonnegative(),
    dropOffRate: z.number().min(0).max(1),
  }),
  observations: z.array(z.string().min(1)).min(1),
});

export const ExperimentEffortSchema = z.enum(["low", "medium", "high"]);

export const ExperimentSchema = z.object({
  id: EntityIdSchema,
  title: z.string().min(3).max(120),
  hypothesis: z.string().min(10).max(600),
  targetSegment: z.string().min(2).max(160),
  mechanism: z.string().min(5).max(400),
  primaryMetric: MetricNameSchema,
  guardrails: z.array(z.string().min(2)).min(1).max(5),
  effort: ExperimentEffortSchema,
  estimatedDurationDays: z.number().int().positive().max(90),
});

export const ExperimentScoreSchema = z.object({
  experimentId: EntityIdSchema,
  impact: z.number().min(0).max(10),
  confidence: z.number().min(0).max(10),
  effort: z.number().min(0).max(10),
  learningValue: z.number().min(0).max(10),
  weightedScore: z.number().min(0).max(10),
  rationale: z.string().min(5).max(400),
  rank: z.number().int().positive(),
});

export const ScoredExperimentsSchema = z.object({
  formulaVersion: z.string().min(1),
  weights: z.object({
    impact: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    effort: z.number().min(0).max(1),
    learningValue: z.number().min(0).max(1),
  }),
  ranked: z.array(ExperimentScoreSchema).min(1),
  recommendedExperimentId: EntityIdSchema,
});

export const ActionPlanSchema = z.object({
  experimentId: EntityIdSchema,
  objective: z.string().min(5).max(300),
  owner: z.string().min(2).max(100),
  milestones: z
    .array(
      z.object({
        title: z.string().min(2).max(120),
        dueDay: z.number().int().positive().max(90),
        deliverable: z.string().min(3).max(300),
      }),
    )
    .min(2)
    .max(8),
  tasks: z
    .array(
      z.object({
        id: EntityIdSchema,
        title: z.string().min(2).max(160),
        owner: z.string().min(2).max(100),
        status: z.literal("planned"),
      }),
    )
    .min(3)
    .max(12),
  instrumentation: z.object({
    events: z.array(z.string().min(2)).min(1).max(8),
    successCriteria: z.array(z.string().min(3)).min(1).max(5),
    guardrails: z.array(z.string().min(3)).min(1).max(5),
  }),
  rollout: z.array(z.string().min(3)).min(2).max(6),
  rollbackTriggers: z.array(z.string().min(3)).min(1).max(5),
  risks: z.array(z.string().min(3)).min(1).max(6),
});

export const RunArtifactsSchema = z.object({
  metricsAnalysis: MetricsAnalysisSchema.optional(),
  experiments: z.array(ExperimentSchema).length(3).optional(),
  scoredExperiments: ScoredExperimentsSchema.optional(),
  actionPlan: ActionPlanSchema.optional(),
  finalSummary: z.string().min(1).optional(),
});

export type MetricsAnalysis = z.infer<typeof MetricsAnalysisSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;
export type ScoredExperiments = z.infer<typeof ScoredExperimentsSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type RunArtifacts = z.infer<typeof RunArtifactsSchema>;
