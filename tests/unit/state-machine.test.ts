import { describe, expect, it } from "vitest";

import {
  applyRunTransition,
  assertActionPlanMayBeGenerated,
} from "@/src/agent/state-machine";
import {
  ApprovalConflictError,
  InvalidTransitionError,
  RunInvariantError,
} from "@/src/domain/errors";
import { makeRun } from "@/tests/helpers/run-fixture";

const t1 = "2026-08-12T12:01:00.000Z";
const t2 = "2026-08-12T12:02:00.000Z";

function plannedRun() {
  return makeRun({
    status: "planning",
    plan: {
      objective:
        "Increase trial-to-paid conversion with a measurable experiment",
      assumptions: [],
      stepKeys: ["analyze_metrics", "create_experiments"],
    },
  });
}

function waitingRun() {
  return makeRun({
    status: "waiting_for_approval",
    approvals: [
      {
        id: "approval_1",
        stepId: "step_4",
        experimentId: "experiment_1",
        experimentTitle: "Guided activation checklist",
        status: "pending",
        requestedAt: t1,
      },
    ],
  });
}

describe("agent run state machine", () => {
  it("moves a planned run into execution", () => {
    const run = applyRunTransition(plannedRun(), {
      type: "PLAN_READY",
      at: t1,
    });

    expect(run.status).toBe("running");
    expect(run.version).toBe(1);
  });

  it("rejects invalid transitions", () => {
    expect(() =>
      applyRunTransition(makeRun(), { type: "PLAN_READY", at: t1 }),
    ).toThrow(InvalidTransitionError);
  });

  it("does not allow action plan generation before approval", () => {
    expect(() =>
      assertActionPlanMayBeGenerated(
        makeRun({ status: "running" }),
        "experiment_1",
      ),
    ).toThrow(RunInvariantError);
  });

  it("allows action plan generation only for the approved experiment", () => {
    const approvedRun = applyRunTransition(waitingRun(), {
      type: "APPROVE",
      at: t2,
      approvalId: "approval_1",
      decisionId: "decision_1",
    });

    expect(() =>
      assertActionPlanMayBeGenerated(approvedRun, "experiment_1"),
    ).not.toThrow();
    expect(() =>
      assertActionPlanMayBeGenerated(approvedRun, "experiment_2"),
    ).toThrow(RunInvariantError);
  });

  it("rejects a second decision for the same approval", () => {
    const approvedRun = applyRunTransition(waitingRun(), {
      type: "APPROVE",
      at: t2,
      approvalId: "approval_1",
      decisionId: "decision_1",
    });
    approvedRun.status = "waiting_for_approval";

    expect(() =>
      applyRunTransition(approvedRun, {
        type: "APPROVE",
        at: t2,
        approvalId: "approval_1",
        decisionId: "decision_2",
      }),
    ).toThrow(ApprovalConflictError);
  });

  it("keeps completed steps intact when retrying a failed run", () => {
    const run = makeRun({
      status: "failed",
      completedAt: t1,
      error: {
        code: "TOOL_TIMEOUT",
        message: "Metric analysis timed out.",
        retryable: true,
        failedStepKey: "analyze_metrics",
      },
    });
    run.steps[0] = {
      ...run.steps[0],
      status: "completed",
      completedAt: t1,
    };
    run.steps[1] = {
      ...run.steps[1],
      status: "failed",
      error: run.error,
      completedAt: t1,
    };

    const retried = applyRunTransition(run, { type: "RETRY", at: t2 });

    expect(retried.status).toBe("queued");
    expect(retried.attempt).toBe(2);
    expect(retried.steps[0].status).toBe("completed");
    expect(retried.steps[0].completedAt).toBe(t1);
    expect(retried.steps[1].status).toBe("pending");
    expect(retried.steps[1].attempt).toBe(2);
  });

  it("finishes without an action plan after the final candidate is rejected", () => {
    const rejected = applyRunTransition(waitingRun(), {
      type: "REJECT",
      at: t2,
      approvalId: "approval_1",
      decisionId: "decision_1",
      hasRemainingCandidate: false,
    });

    expect(rejected.status).toBe("completed");
    expect(rejected.outcome).toBe("no_experiment_approved");
    expect(rejected.artifacts.actionPlan).toBeUndefined();
  });
});
