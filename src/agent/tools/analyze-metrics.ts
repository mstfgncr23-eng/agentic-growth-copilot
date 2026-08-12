import type { AgentTool } from "@/src/agent/tool-registry";
import { EntityNotFoundError, RunInvariantError } from "@/src/domain/errors";

export const analyzeMetricsTool: AgentTool<"analyze_metrics"> = {
  name: "analyze_metrics",
  version: "1.0.0",
  async execute(input, context) {
    const project = await context.store.getProject(input.projectId);
    if (!project) {
      throw new EntityNotFoundError("Project", input.projectId);
    }
    if (project.workspaceId !== context.workspaceId) {
      throw new EntityNotFoundError("Project", input.projectId);
    }
    const snapshot = project.metricsSnapshot;
    if (input.windowDays !== snapshot.windowDays) {
      throw new RunInvariantError(
        `The demo project has a ${snapshot.windowDays}-day metrics snapshot.`,
      );
    }
    const trialStage = snapshot.funnel.find(
      (stage) => stage.key === "trial_started",
    );
    const paidStage = snapshot.funnel.find((stage) => stage.key === "paid");
    if (!trialStage || !paidStage || trialStage.users === 0) {
      throw new RunInvariantError(
        "The project snapshot is missing trial or paid data.",
      );
    }

    const funnel = snapshot.funnel.map((stage, index) => ({
      ...stage,
      conversionFromPrevious:
        index === 0
          ? null
          : ratio(stage.users, snapshot.funnel[index - 1].users),
    }));
    const transitions = snapshot.funnel.slice(1).map((stage, index) => {
      const previous = snapshot.funnel[index];
      const lostUsers = previous.users - stage.users;
      return {
        fromStage: previous.label,
        toStage: stage.label,
        lostUsers,
        dropOffRate: ratio(lostUsers, previous.users),
      };
    });
    const largestDropOff = transitions.sort(
      (a, b) => b.dropOffRate - a.dropOffRate,
    )[0];
    const baselineRate = ratio(paidStage.users, trialStage.users);
    const weakestSegment = [...snapshot.segments]
      .filter((segment) => segment.trialUsers > 0)
      .sort(
        (a, b) =>
          ratio(a.paidUsers, a.trialUsers) - ratio(b.paidUsers, b.trialUsers),
      )[0];

    return {
      metric: input.metric,
      windowDays: input.windowDays,
      dataAsOf: snapshot.dataAsOf,
      baseline: {
        trialUsers: trialStage.users,
        paidUsers: paidStage.users,
        conversionRate: baselineRate,
      },
      funnel,
      largestDropOff,
      observations: [
        `Trial-to-paid conversion is ${(baselineRate * 100).toFixed(1)}% over the last ${input.windowDays} days.`,
        `${largestDropOff.fromStage} → ${largestDropOff.toStage} is the largest funnel loss at ${(largestDropOff.dropOffRate * 100).toFixed(1)}%.`,
        weakestSegment
          ? `${weakestSegment.label} is the weakest segment at ${(ratio(weakestSegment.paidUsers, weakestSegment.trialUsers) * 100).toFixed(1)}%.`
          : "No segment comparison is available.",
      ],
    };
  },
};

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}
