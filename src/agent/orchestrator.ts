import { z } from "zod";

import { buildRunContext } from "@/src/agent/context-builder";
import { createQueuedRun } from "@/src/agent/run-factory";
import {
  applyRunTransition,
  assertActionPlanMayBeGenerated,
  assertRunInvariants,
} from "@/src/agent/state-machine";
import type { ToolRegistry } from "@/src/agent/tool-registry";
import type { ModelGateway } from "@/src/ai/model-gateway";
import { createId, nowIso } from "@/src/domain/common";
import {
  ApprovalConflictError,
  DomainError,
  EntityNotFoundError,
  PersistenceConflictError,
  RunInvariantError,
  SimulatedTransientError,
} from "@/src/domain/errors";
import {
  AgentRunSchema,
  DemoScenarioSchema,
  RunModeSchema,
  type AgentRun,
  type ModelUsageSchema,
  type RunError,
  type StepKey,
} from "@/src/domain/run";
import type { AppendRunEventInput, RunEvent } from "@/src/domain/run-event";
import type { AgentStore } from "@/src/persistence/agent-store";

const StartRunCommandSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  conversationId: z.string().min(1),
  goal: z.string().trim().min(3).max(4_000),
  idempotencyKey: z.string().trim().min(8).max(160),
  mode: RunModeSchema,
  demoScenario: DemoScenarioSchema.default("happy_path"),
});

const ResolveApprovalCommandSchema = z.object({
  runId: z.string().min(1),
  approvalId: z.string().min(1),
  decisionId: z.string().min(8).max(160),
  decision: z.enum(["approve", "reject"]),
  feedback: z.string().trim().max(1_000).optional(),
});

export type StartRunCommand = z.input<typeof StartRunCommandSchema>;
export type ResolveApprovalCommand = z.input<
  typeof ResolveApprovalCommandSchema
>;
export type RunEventListener = (event: RunEvent) => void | Promise<void>;

export interface StartRunResult {
  created: boolean;
  run: AgentRun;
}

export interface ResolveApprovalResult {
  duplicate: boolean;
  run: AgentRun;
}

type ModelUsage = z.infer<typeof ModelUsageSchema>;

export class AgentOrchestrator {
  constructor(
    private readonly store: AgentStore,
    private readonly modelGateway: ModelGateway,
    private readonly tools: ToolRegistry,
    private readonly clock: () => string = nowIso,
  ) {}

  async startRun(
    rawCommand: StartRunCommand,
    listener?: RunEventListener,
  ): Promise<StartRunResult> {
    const command = StartRunCommandSchema.parse(rawCommand);
    const [conversation, project] = await Promise.all([
      this.store.getConversation(command.conversationId),
      this.store.getProject(command.projectId),
    ]);
    if (!conversation || conversation.workspaceId !== command.workspaceId) {
      throw new EntityNotFoundError("Conversation", command.conversationId);
    }
    if (!project || project.workspaceId !== command.workspaceId) {
      throw new EntityNotFoundError("Project", command.projectId);
    }

    const contextSnapshot = await buildRunContext(this.store, conversation);
    const { run, userMessage } = createQueuedRun({
      ...command,
      contextSnapshot,
      createdAt: this.clock(),
    });
    const created = await this.store.createRunWithMessage(run, userMessage);
    const active = ["queued", "planning", "running"].includes(
      created.run.status,
    )
      ? await this.executeUntilPause(created.run.id, listener)
      : created.run;
    return { created: created.created, run: active };
  }

  async resolveApproval(
    rawCommand: ResolveApprovalCommand,
    listener?: RunEventListener,
  ): Promise<ResolveApprovalResult> {
    const command = ResolveApprovalCommandSchema.parse(rawCommand);
    const run = await this.requireRun(command.runId);
    const approval = run.approvals.find(
      (candidate) => candidate.id === command.approvalId,
    );
    if (!approval) {
      throw new EntityNotFoundError("Approval", command.approvalId);
    }
    if (approval.status !== "pending") {
      if (
        approval.decisionId === command.decisionId &&
        approval.status === approvalStatusFor(command.decision)
      ) {
        return { duplicate: true, run };
      }
      throw new ApprovalConflictError();
    }

    const at = this.clock();
    const reviewedIds = new Set(run.approvals.map((item) => item.experimentId));
    const hasRemainingCandidate =
      run.artifacts.scoredExperiments?.ranked.some(
        (score) => !reviewedIds.has(score.experimentId),
      ) ?? false;
    const transition =
      command.decision === "approve"
        ? ({
            type: "APPROVE",
            at,
            approvalId: command.approvalId,
            decisionId: command.decisionId,
            feedback: command.feedback,
          } as const)
        : ({
            type: "REJECT",
            at,
            approvalId: command.approvalId,
            decisionId: command.decisionId,
            feedback: command.feedback,
            hasRemainingCandidate,
          } as const);
    const decided = applyRunTransition(run, transition);

    try {
      await this.store.saveRun(decided, run.version);
    } catch (error) {
      if (error instanceof PersistenceConflictError) {
        const latest = await this.requireRun(run.id);
        const latestApproval = latest.approvals.find(
          (candidate) => candidate.id === command.approvalId,
        );
        if (
          latestApproval?.decisionId === command.decisionId &&
          latestApproval.status === approvalStatusFor(command.decision)
        ) {
          return { duplicate: true, run: latest };
        }
      }
      throw error;
    }

    await this.emit(
      {
        type: "approval.decided",
        workspaceId: decided.workspaceId,
        runId: decided.id,
        createdAt: at,
        payload: {
          approvalId: approval.id,
          status: command.decision === "approve" ? "approved" : "rejected",
        },
      },
      listener,
    );
    await this.emitRunStatus(decided, at, listener);
    const approvalStep = decided.steps.find(
      (step) => step.key === "request_approval",
    );
    if (approvalStep) {
      await this.emitStepStatus(decided, approvalStep.key, at, listener);
    }

    if (decided.status === "completed") {
      await this.emitStreamEnd(decided, "completed", at, listener);
      return { duplicate: false, run: decided };
    }
    return {
      duplicate: false,
      run: await this.executeUntilPause(decided.id, listener),
    };
  }

  async retryRun(
    runId: string,
    listener?: RunEventListener,
  ): Promise<AgentRun> {
    const run = await this.requireRun(runId);
    const at = this.clock();
    const retried = applyRunTransition(run, { type: "RETRY", at });
    await this.store.saveRun(retried, run.version);
    await this.emitRunStatus(retried, at, listener);
    const resetStep = retried.steps.find((step) => step.status === "pending");
    if (resetStep) {
      await this.emitStepStatus(retried, resetStep.key, at, listener);
    }
    return this.executeUntilPause(retried.id, listener);
  }

  async executeUntilPause(
    runId: string,
    listener?: RunEventListener,
  ): Promise<AgentRun> {
    let currentStep: StepKey | undefined;
    try {
      let run = await this.requireRun(runId);
      if (
        ["waiting_for_approval", "completed", "failed"].includes(run.status)
      ) {
        return run;
      }
      if (run.status === "queued") {
        const at = this.clock();
        const planning = applyRunTransition(run, {
          type: "START_PLANNING",
          at,
        });
        run = await this.store.saveRun(planning, run.version);
        await this.emitRunStatus(run, at, listener);
      }
      if (run.status === "planning") {
        currentStep = "analyze_goal";
        const planned = await this.ensurePlan(run, listener);
        if (!planned) {
          return this.requireRun(runId);
        }
        run = planned;
      }

      while (run.status === "running") {
        if (!isStepCompleted(run, "analyze_metrics")) {
          currentStep = "analyze_metrics";
          const result = await this.executeMetrics(run, listener);
          if (!result) return this.requireRun(runId);
          run = result;
          continue;
        }
        if (!isStepCompleted(run, "create_experiments")) {
          currentStep = "create_experiments";
          const result = await this.executeExperiments(run, listener);
          if (!result) return this.requireRun(runId);
          run = result;
          continue;
        }
        if (!isStepCompleted(run, "score_experiments")) {
          currentStep = "score_experiments";
          const result = await this.executeScoring(run, listener);
          if (!result) return this.requireRun(runId);
          run = result;
          continue;
        }
        if (!run.approvals.some((approval) => approval.status === "approved")) {
          currentStep = "request_approval";
          return this.requestApproval(run, listener);
        }
        if (!isStepCompleted(run, "generate_action_plan")) {
          currentStep = "generate_action_plan";
          const result = await this.executeActionPlan(run, listener);
          if (!result) return this.requireRun(runId);
          run = result;
          continue;
        }
        if (!isStepCompleted(run, "compose_summary")) {
          currentStep = "compose_summary";
          const result = await this.executeSummary(run, listener);
          if (!result) return this.requireRun(runId);
          run = result;
          continue;
        }
        if (run.status === "running") {
          const at = this.clock();
          const completed = applyRunTransition(run, {
            type: "COMPLETE",
            outcome: "action_plan_created",
            at,
          });
          run = await this.store.saveRun(completed, run.version);
          await this.emitRunStatus(run, at, listener);
          await this.emitStreamEnd(run, "completed", at, listener);
        }
      }
      return run;
    } catch (error) {
      if (error instanceof PersistenceConflictError) {
        return this.requireRun(runId);
      }
      return this.failRun(runId, currentStep, error, listener);
    }
  }

  private async ensurePlan(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    let working = run;
    if (!isStepCompleted(working, "analyze_goal")) {
      const claimed = await this.claimStep(working, "analyze_goal", listener);
      if (!claimed) return null;
      working = claimed;
      const result = await this.modelGateway.plan({
        goal: working.goal,
        previousRunSummary: working.contextSnapshot.previousRunSummary,
      });
      const at = this.clock();
      working = await this.updateRun(working, at, (next) => {
        next.plan = result.data;
        next.modelUsage = mergeUsage(next.modelUsage, result.usage);
        completeStep(next, "analyze_goal", at);
      });
      await this.emitStepStatus(working, "analyze_goal", at, listener);
      await this.emit(
        {
          type: "plan.ready",
          workspaceId: working.workspaceId,
          runId: working.id,
          createdAt: at,
          payload: { objective: result.data.objective },
        },
        listener,
      );
    }
    const at = this.clock();
    const running = applyRunTransition(working, { type: "PLAN_READY", at });
    const saved = await this.store.saveRun(running, working.version);
    await this.emitRunStatus(saved, at, listener);
    return saved;
  }

  private async executeMetrics(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    let working = await this.claimStep(run, "analyze_metrics", listener);
    if (!working) return null;
    working = await this.consumeInjectedFailure(working, "analyze_metrics");
    const result = await this.tools.execute(
      "analyze_metrics",
      { projectId: working.projectId, metric: "trial_to_paid", windowDays: 30 },
      this.toolContext(working),
    );
    const at = this.clock();
    working = await this.updateRun(working, at, (next) => {
      next.artifacts.metricsAnalysis = result.output;
      completeStep(next, "analyze_metrics", at, result.durationMs);
    });
    await this.emitStepStatus(working, "analyze_metrics", at, listener);
    await this.emitArtifact(working, "metrics_analysis", at, listener);
    return working;
  }

  private async executeExperiments(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    const analysis = run.artifacts.metricsAnalysis;
    if (!analysis) throw new RunInvariantError("Metrics analysis is required.");
    let working = await this.claimStep(run, "create_experiments", listener);
    if (!working) return null;
    working = await this.consumeInjectedFailure(working, "create_experiments");
    let usage: ModelUsage | undefined;
    const result = await this.tools.execute(
      "create_experiments",
      {
        goal: working.goal,
        analysis,
        constraints: [
          "Keep every experiment reversible",
          "Define measurable guardrails",
        ],
        previousRunSummary: working.contextSnapshot.previousRunSummary,
      },
      this.toolContext(working, (value) => {
        usage = mergeUsage(usage, value);
      }),
    );
    const at = this.clock();
    working = await this.updateRun(working, at, (next) => {
      next.artifacts.experiments = result.output.experiments;
      next.modelUsage = mergeUsage(next.modelUsage, usage);
      completeStep(next, "create_experiments", at, result.durationMs);
    });
    await this.emitStepStatus(working, "create_experiments", at, listener);
    await this.emitArtifact(working, "experiments", at, listener);
    return working;
  }

  private async executeScoring(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    const experiments = run.artifacts.experiments;
    if (!experiments) throw new RunInvariantError("Experiments are required.");
    let working = await this.claimStep(run, "score_experiments", listener);
    if (!working) return null;
    working = await this.consumeInjectedFailure(working, "score_experiments");
    const result = await this.tools.execute(
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
      this.toolContext(working),
    );
    const at = this.clock();
    working = await this.updateRun(working, at, (next) => {
      next.artifacts.scoredExperiments = result.output;
      completeStep(next, "score_experiments", at, result.durationMs);
    });
    await this.emitStepStatus(working, "score_experiments", at, listener);
    await this.emitArtifact(working, "scores", at, listener);
    return working;
  }

  private async requestApproval(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun> {
    const experiments = run.artifacts.experiments;
    const scores = run.artifacts.scoredExperiments;
    if (!experiments || !scores) {
      throw new RunInvariantError(
        "Scored experiments are required for approval.",
      );
    }
    const reviewed = new Set(
      run.approvals.map((approval) => approval.experimentId),
    );
    const nextScore = scores.ranked.find(
      (score) => !reviewed.has(score.experimentId),
    );
    const experiment = nextScore
      ? experiments.find((candidate) => candidate.id === nextScore.experimentId)
      : undefined;
    if (!experiment) {
      throw new RunInvariantError("No unreviewed experiment remains.");
    }
    const claimed = await this.claimStep(run, "request_approval", listener);
    if (!claimed) return this.requireRun(run.id);
    const step = getStep(claimed, "request_approval");
    const at = this.clock();
    const approval = {
      id: createId("approval"),
      stepId: step.id,
      experimentId: experiment.id,
      experimentTitle: experiment.title,
      status: "pending" as const,
      requestedAt: at,
    };
    const waiting = applyRunTransition(claimed, {
      type: "REQUEST_APPROVAL",
      at,
      approval,
    });
    const saved = await this.store.saveRun(waiting, claimed.version);
    await this.emitStepStatus(saved, "request_approval", at, listener);
    await this.emit(
      {
        type: "approval.requested",
        workspaceId: saved.workspaceId,
        runId: saved.id,
        createdAt: at,
        payload: {
          approvalId: approval.id,
          experimentId: experiment.id,
          experimentTitle: experiment.title,
        },
      },
      listener,
    );
    await this.emitRunStatus(saved, at, listener);
    await this.emitStreamEnd(saved, "approval", at, listener);
    return saved;
  }

  private async executeActionPlan(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    const analysis = run.artifacts.metricsAnalysis;
    const experiments = run.artifacts.experiments;
    const approval = run.approvals.find((item) => item.status === "approved");
    const experiment = approval
      ? experiments?.find((item) => item.id === approval.experimentId)
      : undefined;
    if (!analysis || !approval || !experiment) {
      throw new RunInvariantError("Approved experiment context is incomplete.");
    }
    assertActionPlanMayBeGenerated(run, experiment.id);
    let working = await this.claimStep(run, "generate_action_plan", listener);
    if (!working) return null;
    working = await this.consumeInjectedFailure(
      working,
      "generate_action_plan",
    );
    assertActionPlanMayBeGenerated(working, experiment.id);
    let usage: ModelUsage | undefined;
    const result = await this.tools.execute(
      "generate_action_plan",
      { experiment, analysis },
      this.toolContext(working, (value) => {
        usage = mergeUsage(usage, value);
      }),
    );
    const at = this.clock();
    working = await this.updateRun(working, at, (next) => {
      next.artifacts.actionPlan = result.output;
      next.modelUsage = mergeUsage(next.modelUsage, usage);
      completeStep(next, "generate_action_plan", at, result.durationMs);
    });
    await this.emitStepStatus(working, "generate_action_plan", at, listener);
    await this.emitArtifact(working, "action_plan", at, listener);
    return working;
  }

  private async executeSummary(
    run: AgentRun,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    const analysis = run.artifacts.metricsAnalysis;
    const experiments = run.artifacts.experiments;
    const actionPlan = run.artifacts.actionPlan;
    const approved = run.approvals.find(
      (approval) => approval.status === "approved",
    );
    const experiment = approved
      ? experiments?.find((item) => item.id === approved.experimentId)
      : undefined;
    if (!analysis || !actionPlan || !experiment) {
      throw new RunInvariantError("Final summary context is incomplete.");
    }
    const working = await this.claimStep(run, "compose_summary", listener);
    if (!working) return null;
    const at = this.clock();
    const messageId = assistantMessageId(working.id);
    let message = await this.store.createMessage({
      id: messageId,
      workspaceId: working.workspaceId,
      conversationId: working.conversationId,
      runId: working.id,
      role: "assistant",
      status: "streaming",
      content: "",
      createdAt: at,
      updatedAt: at,
    });
    message = await this.store.saveMessage({
      ...message,
      status: "streaming",
      content: "",
      updatedAt: at,
    });

    let content = "";
    let usage: ModelUsage | undefined;
    let chunkCount = 0;
    for await (const chunk of this.modelGateway.streamSummary({
      goal: working.goal,
      experiment,
      analysis,
      actionPlan,
    })) {
      content += chunk.delta;
      usage = mergeUsage(usage, chunk.usage);
      chunkCount += 1;
      await this.emit(
        {
          type: "message.delta",
          workspaceId: working.workspaceId,
          runId: working.id,
          createdAt: this.clock(),
          payload: { messageId, delta: chunk.delta },
        },
        listener,
      );
      if (chunkCount % 3 === 0) {
        message = await this.store.saveMessage({
          ...message,
          content,
          updatedAt: this.clock(),
        });
      }
    }
    const completedAt = this.clock();
    await this.store.saveMessage({
      ...message,
      status: "completed",
      content,
      updatedAt: completedAt,
    });
    const completed = await this.updateRun(working, completedAt, (next) => {
      next.artifacts.finalSummary = content;
      next.modelUsage = mergeUsage(next.modelUsage, usage);
      completeStep(next, "compose_summary", completedAt);
    });
    await this.emitStepStatus(
      completed,
      "compose_summary",
      completedAt,
      listener,
    );
    await this.emitArtifact(completed, "final_summary", completedAt, listener);
    return completed;
  }

  private async claimStep(
    run: AgentRun,
    stepKey: StepKey,
    listener?: RunEventListener,
  ): Promise<AgentRun | null> {
    const step = getStep(run, stepKey);
    if (step.status === "completed") return run;
    if (step.status === "running" || step.status === "waiting") return null;
    if (step.status !== "pending") {
      throw new RunInvariantError(
        `Step ${stepKey} cannot start from ${step.status}.`,
      );
    }
    const at = this.clock();
    const claimed = await this.updateRun(run, at, (next) => {
      const nextStep = getStep(next, stepKey);
      nextStep.status = "running";
      nextStep.startedAt = at;
      nextStep.completedAt = undefined;
      nextStep.error = undefined;
    });
    await this.emitStepStatus(claimed, stepKey, at, listener);
    return claimed;
  }

  private async consumeInjectedFailure(
    run: AgentRun,
    stepKey: StepKey,
  ): Promise<AgentRun> {
    if (
      run.failureInjection?.stepKey !== stepKey ||
      run.failureInjection.consumed
    ) {
      return run;
    }
    await this.updateRun(run, this.clock(), (next) => {
      if (next.failureInjection) {
        next.failureInjection.consumed = true;
        next.failureInjection.consumedAt = this.clock();
      }
    });
    throw new SimulatedTransientError(stepKey);
  }

  private async failRun(
    runId: string,
    stepKey: StepKey | undefined,
    error: unknown,
    listener?: RunEventListener,
  ): Promise<AgentRun> {
    const run = await this.requireRun(runId);
    if (run.status !== "planning" && run.status !== "running") {
      return run;
    }
    const at = this.clock();
    const runError = normalizeError(error, stepKey);
    const failed = applyRunTransition(run, {
      type: "FAIL",
      at,
      error: runError,
    });
    const saved = await this.store.saveRun(failed, run.version);
    if (stepKey) {
      await this.emitStepStatus(saved, stepKey, at, listener);
    }
    const assistantMessage = await this.store.getMessage(
      assistantMessageId(run.id),
    );
    if (assistantMessage?.status === "streaming") {
      await this.store.saveMessage({
        ...assistantMessage,
        status: "failed",
        updatedAt: at,
      });
    }
    await this.emitRunStatus(saved, at, listener);
    await this.emitStreamEnd(saved, "failed", at, listener);
    return saved;
  }

  private async updateRun(
    run: AgentRun,
    at: string,
    update: (next: AgentRun) => void,
  ): Promise<AgentRun> {
    const next = structuredClone(run);
    update(next);
    next.version += 1;
    next.updatedAt = at;
    assertRunInvariants(next);
    const parsed = AgentRunSchema.parse(next);
    return this.store.saveRun(parsed, run.version);
  }

  private toolContext(
    run: AgentRun,
    recordModelUsage?: (usage: ModelUsage) => void,
  ) {
    return {
      runId: run.id,
      workspaceId: run.workspaceId,
      store: this.store,
      recordModelUsage,
    };
  }

  private async requireRun(id: string): Promise<AgentRun> {
    const run = await this.store.getRun(id);
    if (!run) throw new EntityNotFoundError("Run", id);
    return run;
  }

  private async emit(
    input: AppendRunEventInput,
    listener?: RunEventListener,
  ): Promise<RunEvent> {
    const event = await this.store.appendRunEvent(input);
    await listener?.(event);
    return event;
  }

  private async emitRunStatus(
    run: AgentRun,
    at: string,
    listener?: RunEventListener,
  ) {
    return this.emit(
      {
        type: "run.status",
        workspaceId: run.workspaceId,
        runId: run.id,
        createdAt: at,
        payload: { status: run.status },
      },
      listener,
    );
  }

  private async emitStepStatus(
    run: AgentRun,
    stepKey: StepKey,
    at: string,
    listener?: RunEventListener,
  ) {
    const step = getStep(run, stepKey);
    return this.emit(
      {
        type: "step.status",
        workspaceId: run.workspaceId,
        runId: run.id,
        createdAt: at,
        payload: {
          stepKey,
          status: step.status,
          label: step.label,
          error: step.error,
        },
      },
      listener,
    );
  }

  private async emitArtifact(
    run: AgentRun,
    artifact:
      | "metrics_analysis"
      | "experiments"
      | "scores"
      | "action_plan"
      | "final_summary",
    at: string,
    listener?: RunEventListener,
  ) {
    return this.emit(
      {
        type: "artifact.ready",
        workspaceId: run.workspaceId,
        runId: run.id,
        createdAt: at,
        payload: { artifact },
      },
      listener,
    );
  }

  private async emitStreamEnd(
    run: AgentRun,
    reason: "approval" | "completed" | "failed",
    at: string,
    listener?: RunEventListener,
  ) {
    return this.emit(
      {
        type: "stream.end",
        workspaceId: run.workspaceId,
        runId: run.id,
        createdAt: at,
        payload: { reason },
      },
      listener,
    );
  }
}

function isStepCompleted(run: AgentRun, key: StepKey): boolean {
  return getStep(run, key).status === "completed";
}

function getStep(run: AgentRun, key: StepKey) {
  const step = run.steps.find((candidate) => candidate.key === key);
  if (!step) throw new RunInvariantError(`Run is missing step ${key}.`);
  return step;
}

function completeStep(
  run: AgentRun,
  key: StepKey,
  at: string,
  measuredDurationMs?: number,
): void {
  const step = getStep(run, key);
  step.status = "completed";
  step.completedAt = at;
  step.durationMs =
    measuredDurationMs ??
    (step.startedAt
      ? Math.max(0, new Date(at).getTime() - new Date(step.startedAt).getTime())
      : 0);
  step.error = undefined;
}

function mergeUsage(
  current: ModelUsage | undefined,
  incoming: ModelUsage | undefined,
): ModelUsage | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  return {
    provider: incoming.provider,
    model: incoming.model,
    inputTokens: current.inputTokens + incoming.inputTokens,
    outputTokens: current.outputTokens + incoming.outputTokens,
    simulated: current.simulated && incoming.simulated,
  };
}

function normalizeError(error: unknown, failedStepKey?: StepKey): RunError {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      failedStepKey,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "SCHEMA_VALIDATION_FAILED",
      message: "A model or tool returned data that did not match its contract.",
      retryable: false,
      failedStepKey,
    };
  }
  return {
    code: "UNEXPECTED_EXECUTION_ERROR",
    message: "The agent encountered a temporary execution error.",
    retryable: true,
    failedStepKey,
  };
}

function assistantMessageId(runId: string): string {
  return `message_assistant_${runId}`;
}

function approvalStatusFor(decision: "approve" | "reject") {
  return decision === "approve" ? "approved" : "rejected";
}
