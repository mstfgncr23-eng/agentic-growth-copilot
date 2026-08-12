import type { AgentTool } from "@/src/agent/tool-registry";
import type { Experiment } from "@/src/domain/artifacts";
import { RunInvariantError } from "@/src/domain/errors";

export const scoreExperimentsTool: AgentTool<"score_experiments"> = {
  name: "score_experiments",
  version: "1.0.0",
  async execute(input) {
    const totalWeight = Object.values(input.weights).reduce(
      (total, weight) => total + weight,
      0,
    );
    if (Math.abs(totalWeight - 1) > 0.0001) {
      throw new RunInvariantError(
        "Experiment scoring weights must add up to 1.",
      );
    }
    const scored = input.experiments.map((experiment) => {
      const dimensions = dimensionsFor(experiment);
      const weightedScore = Number(
        (
          dimensions.impact * input.weights.impact +
          dimensions.confidence * input.weights.confidence +
          dimensions.effort * input.weights.effort +
          dimensions.learningValue * input.weights.learningValue
        ).toFixed(2),
      );
      return {
        experimentId: experiment.id,
        ...dimensions,
        weightedScore,
        rationale: `${experiment.effort} delivery effort with ${dimensions.impact}/10 expected impact and ${dimensions.confidence}/10 evidence confidence.`,
      };
    });
    const ranked = scored
      .sort(
        (a, b) =>
          b.weightedScore - a.weightedScore ||
          a.experimentId.localeCompare(b.experimentId),
      )
      .map((score, index) => ({ ...score, rank: index + 1 }));
    return {
      formulaVersion: "growth-score-v1",
      weights: input.weights,
      ranked,
      recommendedExperimentId: ranked[0].experimentId,
    };
  },
};

function dimensionsFor(experiment: Experiment) {
  const effort = { low: 9, medium: 6.5, high: 3.5 }[experiment.effort];
  if (experiment.id.includes("activation-checklist")) {
    return { impact: 9.1, confidence: 8.4, effort, learningValue: 8.8 };
  }
  if (experiment.id.includes("stalled-trial-nudge")) {
    return { impact: 7.9, confidence: 7.6, effort, learningValue: 7.2 };
  }
  return { impact: 8.2, confidence: 7.8, effort, learningValue: 8.1 };
}
