import { z } from "zod";

import { EntityIdSchema, IsoDateSchema } from "@/src/domain/common";
import {
  ApprovalSchema,
  AgentRunSchema,
  type AgentRun,
} from "@/src/domain/run";
import {
  ApprovalConflictError,
  InvalidTransitionError,
  RunInvariantError,
} from "@/src/domain/errors";

const RunTransitionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START_PLANNING"), at: IsoDateSchema }),
  z.object({ type: z.literal("PLAN_READY"), at: IsoDateSchema }),
  z.object({
    type: z.literal("REQUEST_APPROVAL"),
    at: IsoDateSchema,
    approval: ApprovalSchema,
  }),
  z.object({
    type: z.literal("APPROVE"),
    at: IsoDateSchema,
    approvalId: EntityIdSchema,
    decisionId: EntityIdSchema,
    feedback: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    type: z.literal("REJECT"),
    at: IsoDateSchema,
    approvalId: EntityIdSchema,
    decisionId: EntityIdSchema,
    hasRemainingCandidate: z.boolean(),
    feedback: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    type: z.literal("COMPLETE"),
    at: IsoDateSchema,
    outcome: z.literal("action_plan_created"),
  }),
  z.object({
    type: z.literal("FAIL"),
    at: IsoDateSchema,
    error: AgentRunSchema.shape.error.unwrap(),
  }),
  z.object({ type: z.literal("RETRY"), at: IsoDateSchema }),
]);

export type RunTransitionEvent = z.infer<typeof RunTransitionEventSchema>;

export function applyRunTransition(
  currentRun: AgentRun,
  rawEvent: RunTransitionEvent,
): AgentRun {
  const run = AgentRunSchema.parse(currentRun);
  const event = RunTransitionEventSchema.parse(rawEvent);

  const next = structuredClone(run);
  next.version += 1;
  next.updatedAt = event.at;

  switch (event.type) {
    case "START_PLANNING": {
      requireStatus(run, event.type, "queued");
      next.status = "planning";
      next.startedAt ??= event.at;
      break;
    }
    case "PLAN_READY": {
      requireStatus(run, event.type, "planning");
      if (!run.plan) {
        throw new RunInvariantError(
          "A run needs a validated plan before execution.",
        );
      }
      next.status = "running";
      break;
    }
    case "REQUEST_APPROVAL": {
      requireStatus(run, event.type, "running");
      if (run.approvals.some((approval) => approval.status === "pending")) {
        throw new RunInvariantError(
          "A run can have only one pending approval.",
        );
      }
      if (event.approval.status !== "pending") {
        throw new RunInvariantError("A new approval must be pending.");
      }
      next.approvals.push(event.approval);
      const approvalStep = next.steps.find(
        (step) => step.id === event.approval.stepId,
      );
      if (!approvalStep || approvalStep.key !== "request_approval") {
        throw new RunInvariantError(
          "Approval must reference the approval step.",
        );
      }
      approvalStep.status = "waiting";
      approvalStep.startedAt ??= event.at;
      next.status = "waiting_for_approval";
      break;
    }
    case "APPROVE": {
      requireStatus(run, event.type, "waiting_for_approval");
      decideApproval(next, event.approvalId, "approved", event);
      finishApprovalStep(next, event.approvalId, event.at, false);
      next.status = "running";
      break;
    }
    case "REJECT": {
      requireStatus(run, event.type, "waiting_for_approval");
      decideApproval(next, event.approvalId, "rejected", event);
      if (event.hasRemainingCandidate) {
        finishApprovalStep(next, event.approvalId, event.at, true);
        next.status = "running";
      } else {
        finishApprovalStep(next, event.approvalId, event.at, false);
        next.status = "completed";
        next.outcome = "no_experiment_approved";
        next.completedAt = event.at;
      }
      break;
    }
    case "COMPLETE": {
      requireStatus(run, event.type, "running");
      assertActionPlanMayComplete(run);
      next.status = "completed";
      next.outcome = event.outcome;
      next.completedAt = event.at;
      break;
    }
    case "FAIL": {
      requireStatus(run, event.type, "planning", "running");
      next.status = "failed";
      next.error = event.error;
      next.completedAt = event.at;
      if (event.error.failedStepKey) {
        const failedStep = next.steps.find(
          (step) => step.key === event.error.failedStepKey,
        );
        if (failedStep && failedStep.status !== "completed") {
          failedStep.status = "failed";
          failedStep.error = event.error;
          failedStep.completedAt = event.at;
        }
      }
      break;
    }
    case "RETRY": {
      requireStatus(run, event.type, "failed");
      if (!run.error?.retryable) {
        throw new RunInvariantError("A non-retryable run cannot be retried.");
      }
      next.status = "queued";
      next.attempt += 1;
      next.error = undefined;
      next.outcome = undefined;
      next.completedAt = undefined;
      next.steps = next.steps.map((step) => {
        if (step.status !== "failed") {
          return step;
        }
        return {
          ...step,
          status: "pending",
          attempt: step.attempt + 1,
          error: undefined,
          startedAt: undefined,
          completedAt: undefined,
          durationMs: undefined,
        };
      });
      break;
    }
  }

  assertRunInvariants(next);
  return AgentRunSchema.parse(next);
}

export function assertActionPlanMayBeGenerated(
  run: AgentRun,
  experimentId: string,
): void {
  if (run.status !== "running") {
    throw new RunInvariantError(
      "Action plan generation requires a running run.",
    );
  }
  const approved = run.approvals.some(
    (approval) =>
      approval.status === "approved" && approval.experimentId === experimentId,
  );
  if (!approved) {
    throw new RunInvariantError(
      "Action plan generation requires explicit approval for this experiment.",
    );
  }
  if (run.artifacts.actionPlan) {
    throw new RunInvariantError("This run already has an action plan.");
  }
}

export function assertRunInvariants(run: AgentRun): void {
  const pendingApprovals = run.approvals.filter(
    (approval) => approval.status === "pending",
  );

  if (run.status === "waiting_for_approval" && pendingApprovals.length !== 1) {
    throw new RunInvariantError(
      "A waiting run must have exactly one pending approval.",
    );
  }
  if (run.status !== "waiting_for_approval" && pendingApprovals.length > 0) {
    throw new RunInvariantError(
      "Pending approvals are only valid while the run is waiting for approval.",
    );
  }
  if (run.artifacts.actionPlan) {
    const hasMatchingApproval = run.approvals.some(
      (approval) =>
        approval.status === "approved" &&
        approval.experimentId === run.artifacts.actionPlan?.experimentId,
    );
    if (!hasMatchingApproval) {
      throw new RunInvariantError(
        "An action plan cannot exist without a matching approved experiment.",
      );
    }
  }
  if (run.status === "failed" && !run.error) {
    throw new RunInvariantError("A failed run must include an error.");
  }
  if (run.status === "completed" && !run.completedAt) {
    throw new RunInvariantError(
      "A completed run must include a completion time.",
    );
  }
}

function requireStatus(
  run: AgentRun,
  event: string,
  ...allowed: AgentRun["status"][]
): void {
  if (!allowed.includes(run.status)) {
    throw new InvalidTransitionError(run.status, event);
  }
}

function decideApproval(
  run: AgentRun,
  approvalId: string,
  status: "approved" | "rejected",
  decision: { at: string; decisionId: string; feedback?: string },
): void {
  const approval = run.approvals.find(
    (candidate) => candidate.id === approvalId,
  );
  if (!approval) {
    throw new RunInvariantError("Approval does not belong to this run.");
  }
  if (approval.status !== "pending") {
    throw new ApprovalConflictError();
  }
  approval.status = status;
  approval.decidedAt = decision.at;
  approval.decisionId = decision.decisionId;
  approval.feedback = decision.feedback;
}

function assertActionPlanMayComplete(run: AgentRun): void {
  const actionPlan = run.artifacts.actionPlan;
  if (!actionPlan) {
    throw new RunInvariantError(
      "A successful run needs a persisted action plan.",
    );
  }
  const approved = run.approvals.some(
    (approval) =>
      approval.status === "approved" &&
      approval.experimentId === actionPlan.experimentId,
  );
  if (!approved) {
    throw new RunInvariantError(
      "A run cannot complete an action plan without matching approval.",
    );
  }
}

function finishApprovalStep(
  run: AgentRun,
  approvalId: string,
  at: string,
  resetForNextCandidate: boolean,
): void {
  const approval = run.approvals.find(
    (candidate) => candidate.id === approvalId,
  );
  const step = approval
    ? run.steps.find((candidate) => candidate.id === approval.stepId)
    : undefined;
  if (!step) {
    throw new RunInvariantError("Approval step could not be resolved.");
  }
  if (resetForNextCandidate) {
    step.status = "pending";
    step.startedAt = undefined;
    step.completedAt = undefined;
    step.durationMs = undefined;
    return;
  }
  step.status = "completed";
  step.completedAt = at;
  if (step.startedAt) {
    step.durationMs = Math.max(
      0,
      new Date(at).getTime() - new Date(step.startedAt).getTime(),
    );
  }
}
