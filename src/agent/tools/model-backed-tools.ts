import type { ModelGateway } from "@/src/ai/model-gateway";
import type { AgentTool } from "@/src/agent/tool-registry";

export function createExperimentTool(
  modelGateway: ModelGateway,
): AgentTool<"create_experiments"> {
  return {
    name: "create_experiments",
    version: "1.0.0",
    async execute(input, context) {
      const result = await modelGateway.createExperiments({
        runId: context.runId,
        ...input,
      });
      context.recordModelUsage?.(result.usage);
      return result.data;
    },
  };
}

export function createActionPlanTool(
  modelGateway: ModelGateway,
): AgentTool<"generate_action_plan"> {
  return {
    name: "generate_action_plan",
    version: "1.0.0",
    async execute(input, context) {
      const result = await modelGateway.generateActionPlan({
        runId: context.runId,
        ...input,
      });
      context.recordModelUsage?.(result.usage);
      return result.data;
    },
  };
}
