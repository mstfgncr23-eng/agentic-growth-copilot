import { ActionPlanSchema, ExperimentSchema } from "@/src/domain/artifacts";
import { AgentPlanSchema, type AgentRun } from "@/src/domain/run";
import {
  ActionPlanRequestSchema,
  ExperimentRequestSchema,
  PlanRequestSchema,
  SummaryRequestSchema,
  type ModelGateway,
  type ModelResult,
  type ModelStreamChunk,
} from "@/src/ai/model-gateway";

export interface MockModelOptions {
  chunkDelayMs?: number;
}

export class MockModelGateway implements ModelGateway {
  readonly mode = "mock" as const;
  readonly provider = "mock";
  readonly model = "growth-copilot-v1";
  private readonly chunkDelayMs: number;

  constructor(options: MockModelOptions = {}) {
    this.chunkDelayMs = options.chunkDelayMs ?? 0;
  }

  async plan(rawRequest: Parameters<ModelGateway["plan"]>[0]) {
    const request = PlanRequestSchema.parse(rawRequest);
    const assumptions = [
      "The primary goal is measurable trial-to-paid lift without harming activation quality.",
      "Experiments must be reversible and instrumented before rollout.",
    ];
    if (request.previousRunSummary) {
      assumptions.push(
        `Prior run context applied: ${trimTo(request.previousRunSummary, 180)}`,
      );
    }
    const data = AgentPlanSchema.parse({
      objective: request.goal,
      assumptions,
      stepKeys: [
        "analyze_metrics",
        "create_experiments",
        "score_experiments",
        "request_approval",
        "generate_action_plan",
        "compose_summary",
      ],
    });
    return modelResult(data, JSON.stringify(request), JSON.stringify(data));
  }

  async createExperiments(
    rawRequest: Parameters<ModelGateway["createExperiments"]>[0],
  ) {
    const request = ExperimentRequestSchema.parse(rawRequest);
    const dropOff = request.analysis.largestDropOff;
    const contextSuffix = request.previousRunSummary
      ? " It incorporates the constraints recorded in the previous run."
      : "";
    const experiments = [
      {
        id: `${request.runId}:experiment:activation-checklist`,
        title: "Outcome-led activation checklist",
        hypothesis: `If trial users receive a checklist framed around their first measurable outcome, more will reach the upgrade moment because the ${dropOff.fromStage} to ${dropOff.toStage} gap becomes actionable.${contextSuffix}`,
        targetSegment:
          "New trial accounts that have not reached the first value milestone",
        mechanism:
          "Show a three-step checklist with progress persistence, contextual guidance, and a clear value milestone.",
        primaryMetric: "trial_to_paid" as const,
        guardrails: [
          "Activation completion rate must not decline",
          "Support contacts per trial must not increase by more than 5%",
        ],
        effort: "medium" as const,
        estimatedDurationDays: 14,
      },
      {
        id: `${request.runId}:experiment:stalled-trial-nudge`,
        title: "Behavior-triggered trial rescue",
        hypothesis:
          "If stalled trial users receive a contextual nudge tied to their last incomplete action, more will return and experience product value before the trial expires.",
        targetSegment:
          "Trial users inactive for 24 hours after starting activation",
        mechanism:
          "Trigger one in-product message and one lifecycle email based on the last incomplete activation step.",
        primaryMetric: "trial_to_paid" as const,
        guardrails: [
          "Unsubscribe rate must remain below 1%",
          "Notification dismissal rate must remain below 35%",
        ],
        effort: "low" as const,
        estimatedDurationDays: 10,
      },
      {
        id: `${request.runId}:experiment:value-recap`,
        title: "Personalized value recap at upgrade",
        hypothesis:
          "If activated users see a recap of the value they already created before the paywall, upgrade intent will rise because the purchase is anchored to their own outcomes.",
        targetSegment:
          "Activated trial users who reached the pricing or upgrade surface",
        mechanism:
          "Summarize completed actions, time saved, and unlocked next steps directly above the primary upgrade action.",
        primaryMetric: "trial_to_paid" as const,
        guardrails: [
          "Checkout start-to-complete conversion must not decline",
          "Page performance p75 must remain under 1.5 seconds",
        ],
        effort: "medium" as const,
        estimatedDurationDays: 12,
      },
    ].map((experiment) => ExperimentSchema.parse(experiment));

    return modelResult(
      { experiments },
      JSON.stringify(request),
      JSON.stringify(experiments),
    );
  }

  async generateActionPlan(
    rawRequest: Parameters<ModelGateway["generateActionPlan"]>[0],
  ) {
    const request = ActionPlanRequestSchema.parse(rawRequest);
    const experiment = request.experiment;
    const data = ActionPlanSchema.parse({
      experimentId: experiment.id,
      objective: `Validate whether “${experiment.title}” improves trial-to-paid conversion from the current ${(request.analysis.baseline.conversionRate * 100).toFixed(1)}% baseline.`,
      owner: "Growth squad",
      milestones: [
        {
          title: "Instrumentation ready",
          dueDay: 2,
          deliverable:
            "Event taxonomy, exposure event, and guardrail queries reviewed.",
        },
        {
          title: "Treatment ready",
          dueDay: 6,
          deliverable:
            "Responsive treatment implemented behind a server-controlled flag.",
        },
        {
          title: "Experiment launched",
          dueDay: 8,
          deliverable:
            "50/50 eligible-user rollout with monitoring and rollback owner.",
        },
        {
          title: "Decision review",
          dueDay: experiment.estimatedDurationDays,
          deliverable:
            "Primary metric, guardrails, segments, and decision memo completed.",
        },
      ],
      tasks: [
        {
          id: `${request.runId}:task:event-contract`,
          title: "Define exposure and conversion event contracts",
          owner: "Product analytics",
          status: "planned",
        },
        {
          id: `${request.runId}:task:treatment`,
          title: `Build ${experiment.title.toLowerCase()} treatment`,
          owner: "Product engineering",
          status: "planned",
        },
        {
          id: `${request.runId}:task:qa`,
          title: "Run eligibility, event, and responsive UX QA",
          owner: "Product engineering",
          status: "planned",
        },
        {
          id: `${request.runId}:task:launch`,
          title: "Launch controlled rollout and monitor guardrails",
          owner: "Growth lead",
          status: "planned",
        },
      ],
      instrumentation: {
        events: [
          "experiment_exposed",
          "activation_milestone_completed",
          "upgrade_started",
          "subscription_started",
        ],
        successCriteria: [
          "At least 10% relative lift in trial-to-paid conversion",
          "95% confidence interval excludes a material negative effect",
        ],
        guardrails: experiment.guardrails,
      },
      rollout: [
        "Validate event payloads in an internal-only cohort",
        "Launch to 50% of eligible new trials",
        "Hold exposure stable until the minimum sample window closes",
      ],
      rollbackTriggers: [
        "Any guardrail crosses its predefined threshold for two consecutive checks",
        "Exposure or conversion event mismatch exceeds 2%",
      ],
      risks: [
        "Novelty may create a short-lived lift",
        "Segment mix may hide different effects for high-intent users",
      ],
    });
    return modelResult(data, JSON.stringify(request), JSON.stringify(data));
  }

  async *streamSummary(
    rawRequest: Parameters<ModelGateway["streamSummary"]>[0],
  ): AsyncIterable<ModelStreamChunk> {
    const request = SummaryRequestSchema.parse(rawRequest);
    const summary = [
      `Approved direction: ${request.experiment.title}. `,
      `The current trial-to-paid baseline is ${(request.analysis.baseline.conversionRate * 100).toFixed(1)}%, and the largest observed drop-off is between ${request.analysis.largestDropOff.fromStage} and ${request.analysis.largestDropOff.toStage}. `,
      `The action plan contains ${request.actionPlan.tasks.length} owned tasks, a staged rollout, explicit success criteria, and rollback triggers. `,
      "The recommendation is evidence-backed, reversible, and ready for implementation review.",
    ].join("");
    const chunks = summary.match(/.{1,32}(?:\s|$)/g) ?? [summary];
    for (const [index, delta] of chunks.entries()) {
      if (this.chunkDelayMs > 0) {
        await delay(this.chunkDelayMs);
      }
      yield {
        delta,
        usage:
          index === chunks.length - 1
            ? usageFor(JSON.stringify(request), summary)
            : undefined,
      };
    }
  }
}

function modelResult<T>(
  data: T,
  input: string,
  output: string,
): ModelResult<T> {
  return { data, usage: usageFor(input, output) };
}

function usageFor(
  input: string,
  output: string,
): NonNullable<AgentRun["modelUsage"]> {
  return {
    provider: "mock",
    model: "growth-copilot-v1",
    inputTokens: estimateTokens(input),
    outputTokens: estimateTokens(output),
    simulated: true,
  };
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function trimTo(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
