import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { ActionPlanSchema, ExperimentSchema } from "@/src/domain/artifacts";
import {
  ModelConfigurationError,
  ModelOutputError,
  ModelProviderError,
} from "@/src/domain/errors";
import { AgentPlanSchema, ModelUsageSchema } from "@/src/domain/run";
import {
  ActionPlanRequestSchema,
  ExperimentRequestSchema,
  PlanRequestSchema,
  SummaryRequestSchema,
  type ModelGateway,
  type ModelResult,
  type ModelStreamChunk,
} from "@/src/ai/model-gateway";

const LiveEnvironmentSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.6"),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(45_000),
});

const ExperimentDraftSchema = ExperimentSchema.omit({ id: true });
const ExperimentDraftsSchema = z.object({
  experiments: z.array(ExperimentDraftSchema).length(3),
});
const ActionPlanTaskDraftSchema = ActionPlanSchema.shape.tasks.element.omit({
  id: true,
  status: true,
});
const ActionPlanDraftSchema = ActionPlanSchema.omit({
  experimentId: true,
  tasks: true,
}).extend({
  tasks: z.array(ActionPlanTaskDraftSchema).min(3).max(12),
});

const boundedStepKeys = [
  "analyze_metrics",
  "create_experiments",
  "score_experiments",
  "request_approval",
  "generate_action_plan",
  "compose_summary",
] as const;

export interface LiveModelGatewayOptions {
  apiKey?: string;
  client?: OpenAI;
  model?: string;
  timeoutMs?: number;
}

export class LiveModelGateway implements ModelGateway {
  readonly mode = "live" as const;
  readonly provider = "openai";
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: LiveModelGatewayOptions = {}) {
    this.model = options.model?.trim() || "gpt-5.6";
    if (options.client) {
      this.client = options.client;
      return;
    }
    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new ModelConfigurationError(
        "OPENAI_API_KEY is required only when AI_MODE=live.",
      );
    }
    this.client = new OpenAI({
      apiKey,
      maxRetries: 2,
      timeout: options.timeoutMs ?? 45_000,
    });
  }

  async plan(rawRequest: Parameters<ModelGateway["plan"]>[0]) {
    const request = PlanRequestSchema.parse(rawRequest);
    const result = await this.parseStructured(
      AgentPlanSchema,
      "growth_agent_plan",
      [
        "Create bounded planning metadata for a growth experiment workflow.",
        "State concise assumptions, do not expose private chain-of-thought, and do not add tools or steps.",
      ].join(" "),
      request,
      1_500,
    );
    return {
      ...result,
      data: AgentPlanSchema.parse({
        ...result.data,
        stepKeys: boundedStepKeys,
      }),
    };
  }

  async createExperiments(
    rawRequest: Parameters<ModelGateway["createExperiments"]>[0],
  ) {
    const request = ExperimentRequestSchema.parse(rawRequest);
    const result = await this.parseStructured(
      ExperimentDraftsSchema,
      "growth_experiments",
      [
        "Design exactly three distinct trial-to-paid experiments grounded in the supplied metric analysis.",
        "Every proposal must be measurable, reversible, and include explicit guardrails.",
        "Return decision-ready fields only; do not expose chain-of-thought.",
      ].join(" "),
      request,
      3_500,
    );
    const experiments = result.data.experiments.map((experiment, index) =>
      ExperimentSchema.parse({
        ...experiment,
        id: `${request.runId}:experiment:${index + 1}`,
      }),
    );
    return { data: { experiments }, usage: result.usage };
  }

  async generateActionPlan(
    rawRequest: Parameters<ModelGateway["generateActionPlan"]>[0],
  ) {
    const request = ActionPlanRequestSchema.parse(rawRequest);
    const result = await this.parseStructured(
      ActionPlanDraftSchema,
      "growth_action_plan",
      [
        "Create an implementation-ready plan only for the supplied, already-approved experiment.",
        "Include owned milestones, instrumentation, rollout, rollback triggers, and risks.",
        "Do not change the selected experiment and do not expose chain-of-thought.",
      ].join(" "),
      request,
      4_500,
    );
    const data = ActionPlanSchema.parse({
      ...result.data,
      experimentId: request.experiment.id,
      tasks: result.data.tasks.map((task, index) => ({
        ...task,
        id: `${request.runId}:task:${index + 1}`,
        status: "planned" as const,
      })),
    });
    return { data, usage: result.usage };
  }

  async *streamSummary(
    rawRequest: Parameters<ModelGateway["streamSummary"]>[0],
  ): AsyncIterable<ModelStreamChunk> {
    const request = SummaryRequestSchema.parse(rawRequest);
    const stream = await this.client.responses.create({
      model: this.model,
      store: false,
      stream: true,
      instructions: [
        "Write a concise decision summary for the user.",
        "Use only the supplied evidence, approved experiment, and action plan.",
        "The approved experiment was selected after a completed three-experiment generation and scoring workflow; focus on the approved option and never claim that the other experiments were missing, unavailable, or not supplied.",
        "Mention assumptions and rollback readiness without revealing chain-of-thought.",
      ].join(" "),
      input: JSON.stringify(request),
      max_output_tokens: 1_200,
    });

    let bufferedDelta: string | undefined;
    let usage: ReturnType<typeof toModelUsage> | undefined;
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        if (bufferedDelta !== undefined) {
          yield { delta: bufferedDelta };
        }
        bufferedDelta = event.delta;
        continue;
      }
      if (event.type === "response.completed") {
        usage = toModelUsage(
          event.response.usage,
          event.response.model ?? this.model,
        );
        continue;
      }
      if (
        event.type === "error" ||
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      ) {
        throw new ModelProviderError();
      }
    }

    if (bufferedDelta === undefined) {
      throw new ModelOutputError("The live model returned no summary text.");
    }
    yield {
      delta: bufferedDelta,
      usage: usage ?? emptyUsage(this.model),
    };
  }

  private async parseStructured<Schema extends z.ZodType>(
    schema: Schema,
    formatName: string,
    instructions: string,
    input: unknown,
    maxOutputTokens: number,
  ): Promise<ModelResult<z.output<Schema>>> {
    const response = await this.client.responses.parse({
      model: this.model,
      store: false,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: maxOutputTokens,
      text: { format: zodTextFormat(schema, formatName) },
    });
    const parsed = schema.safeParse(response.output_parsed);
    if (!parsed.success) {
      throw new ModelOutputError(
        "The live model response did not match the required contract.",
      );
    }
    return {
      data: parsed.data,
      usage: toModelUsage(response.usage, response.model ?? this.model),
    };
  }
}

export function createLiveModelGatewayFromEnvironment(): LiveModelGateway {
  const parsed = LiveEnvironmentSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_TIMEOUT_MS: process.env.OPENAI_TIMEOUT_MS,
  });
  if (!parsed.success) {
    throw new ModelConfigurationError(
      "Live model configuration is incomplete. Mock mode remains available without an API key.",
    );
  }
  return new LiveModelGateway({
    apiKey: parsed.data.OPENAI_API_KEY,
    model: parsed.data.OPENAI_MODEL,
    timeoutMs: parsed.data.OPENAI_TIMEOUT_MS,
  });
}

function toModelUsage(
  usage: { input_tokens: number; output_tokens: number } | null | undefined,
  model: string,
) {
  return ModelUsageSchema.parse({
    provider: "openai",
    model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    simulated: false,
  });
}

function emptyUsage(model: string) {
  return toModelUsage(undefined, model);
}
