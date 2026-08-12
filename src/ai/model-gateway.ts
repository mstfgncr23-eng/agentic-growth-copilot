import { z } from "zod";

import {
  ActionPlanSchema,
  ExperimentSchema,
  MetricsAnalysisSchema,
} from "@/src/domain/artifacts";
import { AgentPlanSchema, ModelUsageSchema } from "@/src/domain/run";

export const PlanRequestSchema = z.object({
  goal: z.string().min(3).max(4_000),
  previousRunSummary: z.string().max(4_000).optional(),
});

export const ExperimentRequestSchema = z.object({
  runId: z.string().min(1),
  goal: z.string().min(3).max(4_000),
  analysis: MetricsAnalysisSchema,
  constraints: z.array(z.string().min(1)).max(8),
  previousRunSummary: z.string().max(4_000).optional(),
});

export const ActionPlanRequestSchema = z.object({
  runId: z.string().min(1),
  experiment: ExperimentSchema,
  analysis: MetricsAnalysisSchema,
});

export const SummaryRequestSchema = z.object({
  goal: z.string().min(3).max(4_000),
  experiment: ExperimentSchema,
  analysis: MetricsAnalysisSchema,
  actionPlan: ActionPlanSchema,
});

export interface ModelResult<T> {
  data: T;
  usage: z.infer<typeof ModelUsageSchema>;
}

export interface ModelStreamChunk {
  delta: string;
  usage?: z.infer<typeof ModelUsageSchema>;
}

export interface ModelGateway {
  readonly mode: "mock" | "live";
  readonly provider: string;
  readonly model: string;
  plan(
    request: z.infer<typeof PlanRequestSchema>,
  ): Promise<ModelResult<z.infer<typeof AgentPlanSchema>>>;
  createExperiments(
    request: z.infer<typeof ExperimentRequestSchema>,
  ): Promise<ModelResult<{ experiments: z.infer<typeof ExperimentSchema>[] }>>;
  generateActionPlan(
    request: z.infer<typeof ActionPlanRequestSchema>,
  ): Promise<ModelResult<z.infer<typeof ActionPlanSchema>>>;
  streamSummary(
    request: z.infer<typeof SummaryRequestSchema>,
  ): AsyncIterable<ModelStreamChunk>;
}
