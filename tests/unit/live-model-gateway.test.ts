import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { LiveModelGateway } from "@/src/ai/live-model-gateway";
import { ModelConfigurationError } from "@/src/domain/errors";

const usage = {
  input_tokens: 120,
  output_tokens: 45,
};

const analysis = {
  metric: "trial_to_paid" as const,
  windowDays: 30,
  dataAsOf: "2026-08-01T00:00:00.000Z",
  baseline: {
    trialUsers: 1_000,
    paidUsers: 100,
    conversionRate: 0.1,
  },
  funnel: [
    {
      key: "trial_started",
      label: "Trial started",
      users: 1_000,
      conversionFromPrevious: null,
    },
    {
      key: "paid",
      label: "Paid",
      users: 100,
      conversionFromPrevious: 0.1,
    },
  ],
  largestDropOff: {
    fromStage: "Trial started",
    toStage: "Paid",
    lostUsers: 900,
    dropOffRate: 0.9,
  },
  observations: ["The paid conversion rate is 10%."],
};

const experimentDrafts = [
  {
    title: "Outcome checklist",
    hypothesis:
      "If new trials see an outcome checklist, more of them will reach the upgrade moment.",
    targetSegment: "New trial accounts",
    mechanism: "Persist a short outcome-led checklist.",
    primaryMetric: "trial_to_paid" as const,
    guardrails: ["Activation must not decline"],
    effort: "medium" as const,
    estimatedDurationDays: 14,
  },
  {
    title: "Trial rescue",
    hypothesis:
      "If stalled users receive a contextual rescue message, more of them will return to the product.",
    targetSegment: "Stalled trial accounts",
    mechanism: "Send one behavior-triggered rescue message.",
    primaryMetric: "trial_to_paid" as const,
    guardrails: ["Unsubscribes must remain below 1%"],
    effort: "low" as const,
    estimatedDurationDays: 10,
  },
  {
    title: "Value recap",
    hypothesis:
      "If activated users see their achieved value before checkout, more of them will upgrade.",
    targetSegment: "Activated trial accounts",
    mechanism: "Show a personalized value recap before upgrade.",
    primaryMetric: "trial_to_paid" as const,
    guardrails: ["Checkout completion must not decline"],
    effort: "medium" as const,
    estimatedDurationDays: 12,
  },
];

const actionPlanDraft = {
  objective: "Validate the approved experiment against the current baseline.",
  owner: "Growth squad",
  milestones: [
    {
      title: "Instrumentation ready",
      dueDay: 2,
      deliverable: "Exposure and conversion events validated.",
    },
    {
      title: "Treatment launched",
      dueDay: 8,
      deliverable: "Controlled rollout started with monitoring.",
    },
  ],
  tasks: [
    { title: "Define event contracts", owner: "Analytics" },
    { title: "Build the treatment", owner: "Engineering" },
    { title: "Run launch QA", owner: "Growth" },
  ],
  instrumentation: {
    events: ["experiment_exposed", "subscription_started"],
    successCriteria: ["Trial-to-paid conversion improves by 10%"],
    guardrails: ["Activation must not decline"],
  },
  rollout: ["Validate internally", "Launch to half of eligible users"],
  rollbackTriggers: ["A guardrail breaches its threshold"],
  risks: ["Novelty may create a temporary lift"],
};

describe("live model gateway", () => {
  it("requires credentials only when a real client is constructed", () => {
    expect(() => new LiveModelGateway()).toThrow(ModelConfigurationError);
  });

  it("uses structured Responses calls and assigns server-owned identifiers", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({
        output_parsed: {
          objective: "Improve conversion",
          assumptions: ["The experiment must be reversible"],
          stepKeys: ["analyze_metrics"],
        },
        usage,
        model: "gpt-5.6-test",
      })
      .mockResolvedValueOnce({
        output_parsed: { experiments: experimentDrafts },
        usage,
        model: "gpt-5.6-test",
      })
      .mockResolvedValueOnce({
        output_parsed: actionPlanDraft,
        usage,
        model: "gpt-5.6-test",
      });
    const client = {
      responses: { parse, create: vi.fn() },
    } as unknown as OpenAI;
    const gateway = new LiveModelGateway({
      client,
      model: "gpt-5.6-test",
    });

    const plan = await gateway.plan({ goal: "Improve conversion" });
    const experiments = await gateway.createExperiments({
      runId: "run_live_test",
      goal: "Improve conversion",
      analysis,
      constraints: ["Keep changes reversible"],
    });
    const actionPlan = await gateway.generateActionPlan({
      runId: "run_live_test",
      experiment: experiments.data.experiments[0],
      analysis,
    });

    expect(plan.data.stepKeys).toEqual([
      "analyze_metrics",
      "create_experiments",
      "score_experiments",
      "request_approval",
      "generate_action_plan",
      "compose_summary",
    ]);
    expect(experiments.data.experiments.map((item) => item.id)).toEqual([
      "run_live_test:experiment:1",
      "run_live_test:experiment:2",
      "run_live_test:experiment:3",
    ]);
    expect(actionPlan.data.experimentId).toBe(
      experiments.data.experiments[0].id,
    );
    expect(actionPlan.data.tasks[0]).toMatchObject({
      id: "run_live_test:task:1",
      status: "planned",
    });
    expect(actionPlan.usage).toEqual({
      provider: "openai",
      model: "gpt-5.6-test",
      inputTokens: 120,
      outputTokens: 45,
      simulated: false,
    });
    expect(parse).toHaveBeenCalledTimes(3);
    for (const [request] of parse.mock.calls) {
      expect(request).toMatchObject({
        model: "gpt-5.6-test",
        store: false,
      });
      expect(request.text.format.type).toBe("json_schema");
    }
  });

  it("streams typed text deltas and attaches usage to the final chunk", async () => {
    async function* responseEvents() {
      yield { type: "response.output_text.delta", delta: "Approved " };
      yield { type: "response.output_text.delta", delta: "direction." };
      yield {
        type: "response.completed",
        response: { usage, model: "gpt-5.6-test" },
      };
    }
    const create = vi.fn().mockResolvedValue(responseEvents());
    const client = {
      responses: { parse: vi.fn(), create },
    } as unknown as OpenAI;
    const gateway = new LiveModelGateway({
      client,
      model: "gpt-5.6-test",
    });
    const chunks = [];

    for await (const chunk of gateway.streamSummary({
      goal: "Improve conversion",
      experiment: {
        id: "experiment_1",
        ...experimentDrafts[0],
      },
      analysis,
      actionPlan: {
        experimentId: "experiment_1",
        ...actionPlanDraft,
        tasks: actionPlanDraft.tasks.map((task, index) => ({
          ...task,
          id: `task_${index + 1}`,
          status: "planned" as const,
        })),
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: "Approved " },
      {
        delta: "direction.",
        usage: {
          provider: "openai",
          model: "gpt-5.6-test",
          inputTokens: 120,
          outputTokens: 45,
          simulated: false,
        },
      },
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ store: false, stream: true }),
    );
  });
});
