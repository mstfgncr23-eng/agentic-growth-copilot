import { describe, expect, it } from "vitest";

import {
  applyRunTransition,
  type RunTransitionEvent,
} from "@/src/agent/state-machine";
import type { AgentRun } from "@/src/domain/run";
import { makeRun } from "@/tests/helpers/run-fixture";

const timestamp = "2026-08-12T13:00:00.000Z";
const pendingApproval = {
  id: "approval_table",
  stepId: "step_4",
  experimentId: "experiment_table",
  experimentTitle: "Outcome checklist",
  status: "pending" as const,
  requestedAt: timestamp,
};

function waitingRun(): AgentRun {
  return makeRun({
    status: "waiting_for_approval",
    approvals: [pendingApproval],
  });
}

function completableRun(): AgentRun {
  return makeRun({
    status: "running",
    approvals: [
      {
        ...pendingApproval,
        status: "approved",
        decisionId: "decision_table",
        decidedAt: timestamp,
      },
    ],
    artifacts: {
      actionPlan: {
        experimentId: pendingApproval.experimentId,
        objective: "Validate the approved conversion experiment.",
        owner: "Growth squad",
        milestones: [
          {
            title: "Instrumentation ready",
            dueDay: 2,
            deliverable: "Events and guardrail queries validated.",
          },
          {
            title: "Treatment launched",
            dueDay: 8,
            deliverable: "Controlled rollout is running.",
          },
        ],
        tasks: [
          {
            id: "task_1",
            title: "Define events",
            owner: "Analytics",
            status: "planned",
          },
          {
            id: "task_2",
            title: "Build treatment",
            owner: "Engineering",
            status: "planned",
          },
          {
            id: "task_3",
            title: "Run launch QA",
            owner: "Growth",
            status: "planned",
          },
        ],
        instrumentation: {
          events: ["experiment_exposed"],
          successCriteria: ["Conversion improves"],
          guardrails: ["Activation does not decline"],
        },
        rollout: ["Validate internally", "Launch to eligible users"],
        rollbackTriggers: ["Guardrail threshold is breached"],
        risks: ["Segment mix may bias the result"],
      },
    },
  });
}

const cases: Array<{
  name: string;
  from: () => AgentRun;
  event: RunTransitionEvent;
  expected: AgentRun["status"];
}> = [
  {
    name: "queued → planning",
    from: () => makeRun(),
    event: { type: "START_PLANNING", at: timestamp },
    expected: "planning",
  },
  {
    name: "planning → running",
    from: () =>
      makeRun({
        status: "planning",
        plan: {
          objective: "Improve conversion with a measurable experiment",
          assumptions: [],
          stepKeys: ["analyze_metrics"],
        },
      }),
    event: { type: "PLAN_READY", at: timestamp },
    expected: "running",
  },
  {
    name: "running → waiting_for_approval",
    from: () => makeRun({ status: "running" }),
    event: {
      type: "REQUEST_APPROVAL",
      at: timestamp,
      approval: pendingApproval,
    },
    expected: "waiting_for_approval",
  },
  {
    name: "waiting_for_approval → running on approve",
    from: waitingRun,
    event: {
      type: "APPROVE",
      at: timestamp,
      approvalId: pendingApproval.id,
      decisionId: "decision_approve_table",
    },
    expected: "running",
  },
  {
    name: "waiting_for_approval → running on reject with another candidate",
    from: waitingRun,
    event: {
      type: "REJECT",
      at: timestamp,
      approvalId: pendingApproval.id,
      decisionId: "decision_reject_table",
      hasRemainingCandidate: true,
    },
    expected: "running",
  },
  {
    name: "waiting_for_approval → completed on final reject",
    from: waitingRun,
    event: {
      type: "REJECT",
      at: timestamp,
      approvalId: pendingApproval.id,
      decisionId: "decision_final_table",
      hasRemainingCandidate: false,
    },
    expected: "completed",
  },
  {
    name: "running → completed",
    from: completableRun,
    event: {
      type: "COMPLETE",
      at: timestamp,
      outcome: "action_plan_created",
    },
    expected: "completed",
  },
  {
    name: "running → failed",
    from: () => makeRun({ status: "running" }),
    event: {
      type: "FAIL",
      at: timestamp,
      error: {
        code: "TOOL_TIMEOUT",
        message: "The tool timed out.",
        retryable: true,
        failedStepKey: "analyze_metrics",
      },
    },
    expected: "failed",
  },
  {
    name: "failed → queued",
    from: () =>
      makeRun({
        status: "failed",
        completedAt: timestamp,
        error: {
          code: "TOOL_TIMEOUT",
          message: "The tool timed out.",
          retryable: true,
          failedStepKey: "analyze_metrics",
        },
      }),
    event: { type: "RETRY", at: timestamp },
    expected: "queued",
  },
];

describe("run transition table", () => {
  it.each(cases)("accepts $name", ({ from, event, expected }) => {
    expect(applyRunTransition(from(), event).status).toBe(expected);
  });
});
