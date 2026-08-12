import { z } from "zod";

import {
  ActionPlanSchema,
  ExperimentSchema,
  MetricsAnalysisSchema,
  ScoredExperimentsSchema,
} from "@/src/domain/artifacts";
import { EntityIdSchema } from "@/src/domain/common";

export const ToolNameSchema = z.enum([
  "analyze_metrics",
  "create_experiments",
  "score_experiments",
  "generate_action_plan",
]);

export const AnalyzeMetricsInputSchema = z.object({
  projectId: EntityIdSchema,
  metric: z.literal("trial_to_paid"),
  windowDays: z.number().int().positive().max(365),
});

export const CreateExperimentsInputSchema = z.object({
  goal: z.string().min(3).max(4_000),
  analysis: MetricsAnalysisSchema,
  constraints: z.array(z.string().min(1)).max(8),
  previousRunSummary: z.string().max(4_000).optional(),
});

export const CreateExperimentsOutputSchema = z.object({
  experiments: z.array(ExperimentSchema).length(3),
});

export const ScoreExperimentsInputSchema = z.object({
  experiments: z.array(ExperimentSchema).length(3),
  weights: z.object({
    impact: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    effort: z.number().min(0).max(1),
    learningValue: z.number().min(0).max(1),
  }),
});

export const GenerateActionPlanInputSchema = z.object({
  experiment: ExperimentSchema,
  analysis: MetricsAnalysisSchema,
});

export const ToolContractSchemas = {
  analyze_metrics: {
    input: AnalyzeMetricsInputSchema,
    output: MetricsAnalysisSchema,
  },
  create_experiments: {
    input: CreateExperimentsInputSchema,
    output: CreateExperimentsOutputSchema,
  },
  score_experiments: {
    input: ScoreExperimentsInputSchema,
    output: ScoredExperimentsSchema,
  },
  generate_action_plan: {
    input: GenerateActionPlanInputSchema,
    output: ActionPlanSchema,
  },
} as const;

export type ToolName = z.infer<typeof ToolNameSchema>;
export type ToolInputMap = {
  [Name in ToolName]: z.input<(typeof ToolContractSchemas)[Name]["input"]>;
};
export type ToolOutputMap = {
  [Name in ToolName]: z.output<(typeof ToolContractSchemas)[Name]["output"]>;
};
