import { beforeEach, describe, expect, it } from "vitest";

import { createToolRegistry } from "@/src/agent/create-tool-registry";
import { AgentOrchestrator } from "@/src/agent/orchestrator";
import { MockModelGateway } from "@/src/ai/mock-model-gateway";
import {
  DEMO_CONVERSATION_ID,
  DEMO_PROJECT_ID,
  DEMO_WORKSPACE_ID,
  ensureDemoSeed,
} from "@/src/demo/seed-data";
import { InMemoryAgentStore } from "@/src/persistence/in-memory-agent-store";

describe("agent orchestrator", () => {
  let store: InMemoryAgentStore;
  let orchestrator: AgentOrchestrator;

  beforeEach(async () => {
    store = new InMemoryAgentStore();
    await ensureDemoSeed(store);
    const model = new MockModelGateway();
    orchestrator = new AgentOrchestrator(
      store,
      model,
      createToolRegistry(model),
    );
  });

  it("pauses durably before creating an action plan", async () => {
    const result = await start("request_pause_123456");
    const reloaded = await store.getRun(result.run.id);

    expect(result.run.status).toBe("waiting_for_approval");
    expect(result.run.artifacts.actionPlan).toBeUndefined();
    expect(result.run.approvals).toHaveLength(1);
    expect(result.run.approvals[0].status).toBe("pending");
    expect(reloaded).toEqual(result.run);
  });

  it("resumes after approval and treats a duplicate decision as a no-op", async () => {
    const started = await start("request_approve_1234");
    const approval = started.run.approvals[0];
    const first = await orchestrator.resolveApproval({
      runId: started.run.id,
      approvalId: approval.id,
      decision: "approve",
      decisionId: "decision_approve_1234",
    });
    const versionAfterFirstDecision = first.run.version;
    const duplicate = await orchestrator.resolveApproval({
      runId: started.run.id,
      approvalId: approval.id,
      decision: "approve",
      decisionId: "decision_approve_1234",
    });
    const events = await store.listRunEvents(started.run.id);

    expect(first.run.status).toBe("completed");
    expect(first.run.artifacts.actionPlan?.experimentId).toBe(
      approval.experimentId,
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.run.version).toBe(versionAfterFirstDecision);
    expect(
      events.filter(
        (event) =>
          event.type === "artifact.ready" &&
          event.payload.artifact === "action_plan",
      ),
    ).toHaveLength(1);
  });

  it("retries from the failed checkpoint without rerunning completed steps", async () => {
    const started = await start(
      "request_failure_1234",
      "Increase trial-to-paid conversion",
      "fail_once_at_scoring",
    );
    const beforeRetry = started.run;
    const completedBeforeRetry = beforeRetry.steps
      .filter((step) => step.status === "completed")
      .map((step) => ({ key: step.key, attempt: step.attempt }));
    const retried = await orchestrator.retryRun(beforeRetry.id);

    expect(beforeRetry.status).toBe("failed");
    expect(beforeRetry.error?.failedStepKey).toBe("score_experiments");
    expect(retried.status).toBe("waiting_for_approval");
    expect(retried.attempt).toBe(2);
    for (const completed of completedBeforeRetry) {
      expect(
        retried.steps.find((step) => step.key === completed.key)?.attempt,
      ).toBe(completed.attempt);
    }
    expect(
      retried.steps.find((step) => step.key === "score_experiments")?.attempt,
    ).toBe(2);
  });

  it("completes the fail-once scenario after retry and approval", async () => {
    const failed = await start(
      "request_failure_complete_1234",
      "Increase trial-to-paid conversion",
      "fail_once_at_scoring",
    );
    const completedAttempts = new Map(
      failed.run.steps
        .filter((step) => step.status === "completed")
        .map((step) => [step.key, step.attempt]),
    );
    const waiting = await orchestrator.retryRun(failed.run.id);
    const approval = waiting.approvals.find(
      (candidate) => candidate.status === "pending",
    );
    expect(approval).toBeDefined();

    const completed = await orchestrator.resolveApproval({
      runId: waiting.id,
      approvalId: approval!.id,
      decision: "approve",
      decisionId: "decision_failure_complete_1234",
    });

    expect(completed.run.status).toBe("completed");
    expect(completed.run.outcome).toBe("action_plan_created");
    expect(completed.run.attempt).toBe(2);
    expect(completed.run.artifacts.actionPlan).toBeDefined();
    for (const [key, attempt] of completedAttempts) {
      expect(
        completed.run.steps.find((step) => step.key === key)?.attempt,
      ).toBe(attempt);
    }
  });

  it("moves through each ranked candidate and completes after three rejects", async () => {
    let run = (await start("request_reject_all_1234")).run;
    const reviewedExperimentIds: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const approval = run.approvals.find(
        (candidate) => candidate.status === "pending",
      );
      expect(approval).toBeDefined();
      reviewedExperimentIds.push(approval!.experimentId);
      const result = await orchestrator.resolveApproval({
        runId: run.id,
        approvalId: approval!.id,
        decision: "reject",
        decisionId: `decision_reject_${index}_1234`,
      });
      run = result.run;

      if (index < 2) {
        expect(run.status).toBe("waiting_for_approval");
        expect(run.artifacts.actionPlan).toBeUndefined();
      }
    }

    expect(new Set(reviewedExperimentIds).size).toBe(3);
    expect(run.status).toBe("completed");
    expect(run.outcome).toBe("no_experiment_approved");
    expect(run.approvals.map((approval) => approval.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(run.artifacts.actionPlan).toBeUndefined();
  });

  it("uses the previous completed run summary in a follow-up run", async () => {
    const first = await start("request_context_1234");
    const completed = await orchestrator.resolveApproval({
      runId: first.run.id,
      approvalId: first.run.approvals[0].id,
      decision: "approve",
      decisionId: "decision_context_1234",
    });
    const followUp = await start(
      "request_followup_1234",
      "Rework the recommendation for a lower-effort launch",
    );

    expect(completed.run.artifacts.finalSummary).toBeTruthy();
    expect(followUp.run.contextSnapshot.previousRunId).toBe(completed.run.id);
    expect(followUp.run.contextSnapshot.previousRunSummary).toBe(
      completed.run.artifacts.finalSummary,
    );
    expect(followUp.run.plan?.assumptions.join(" ")).toContain(
      "Prior run context applied",
    );
  });

  it("returns the same waiting run for a duplicate start request", async () => {
    const first = await start("request_idempotent_1234");
    const duplicate = await start("request_idempotent_1234");

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.run.id).toBe(first.run.id);
    expect(duplicate.run.approvals).toHaveLength(1);
  });

  function start(
    idempotencyKey: string,
    goal = "Increase trial-to-paid conversion with three experiments",
    demoScenario: "happy_path" | "fail_once_at_scoring" = "happy_path",
  ) {
    return orchestrator.startRun({
      workspaceId: DEMO_WORKSPACE_ID,
      projectId: DEMO_PROJECT_ID,
      conversationId: DEMO_CONVERSATION_ID,
      goal,
      idempotencyKey,
      mode: "mock",
      demoScenario,
    });
  }
});
