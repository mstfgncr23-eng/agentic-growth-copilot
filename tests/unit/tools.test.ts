import { beforeEach, describe, expect, it } from "vitest";

import { createToolRegistry } from "@/src/agent/create-tool-registry";
import { MockModelGateway } from "@/src/ai/mock-model-gateway";
import {
  DEMO_PROJECT_ID,
  DEMO_WORKSPACE_ID,
  ensureDemoSeed,
} from "@/src/demo/seed-data";
import { InMemoryAgentStore } from "@/src/persistence/in-memory-agent-store";

describe("typed tool registry", () => {
  const model = new MockModelGateway();
  const registry = createToolRegistry(model);
  let store: InMemoryAgentStore;

  beforeEach(async () => {
    store = new InMemoryAgentStore();
    await ensureDemoSeed(store);
  });

  it("analyzes the persisted product metrics deterministically", async () => {
    const result = await registry.execute(
      "analyze_metrics",
      { projectId: DEMO_PROJECT_ID, metric: "trial_to_paid", windowDays: 30 },
      { runId: "run_tools", workspaceId: DEMO_WORKSPACE_ID, store },
    );

    expect(result.output.baseline).toEqual({
      trialUsers: 3_200,
      paidUsers: 352,
      conversionRate: 0.11,
    });
    expect(result.output.largestDropOff.fromStage).toBe("Upgrade viewed");
  });

  it("creates and ranks exactly three structured experiments", async () => {
    const analysis = (
      await registry.execute(
        "analyze_metrics",
        { projectId: DEMO_PROJECT_ID, metric: "trial_to_paid", windowDays: 30 },
        { runId: "run_tools", workspaceId: DEMO_WORKSPACE_ID, store },
      )
    ).output;
    const experiments = (
      await registry.execute(
        "create_experiments",
        {
          goal: "Increase trial-to-paid conversion",
          analysis,
          constraints: ["Keep the experiment reversible"],
        },
        { runId: "run_tools", workspaceId: DEMO_WORKSPACE_ID, store },
      )
    ).output.experiments;
    const scores = (
      await registry.execute(
        "score_experiments",
        {
          experiments,
          weights: {
            impact: 0.35,
            confidence: 0.3,
            effort: 0.2,
            learningValue: 0.15,
          },
        },
        { runId: "run_tools", workspaceId: DEMO_WORKSPACE_ID, store },
      )
    ).output;

    expect(experiments).toHaveLength(3);
    expect(scores.ranked).toHaveLength(3);
    expect(scores.ranked[0].rank).toBe(1);
    expect(scores.recommendedExperimentId).toBe(scores.ranked[0].experimentId);
  });

  it("rejects invalid tool inputs before execution", async () => {
    await expect(
      registry.execute(
        "analyze_metrics",
        { projectId: DEMO_PROJECT_ID, metric: "trial_to_paid", windowDays: 0 },
        { runId: "run_tools", workspaceId: DEMO_WORKSPACE_ID, store },
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});
