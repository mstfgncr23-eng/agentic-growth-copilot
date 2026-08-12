import type { ModelGateway } from "@/src/ai/model-gateway";
import { ToolRegistry } from "@/src/agent/tool-registry";
import { analyzeMetricsTool } from "@/src/agent/tools/analyze-metrics";
import {
  createActionPlanTool,
  createExperimentTool,
} from "@/src/agent/tools/model-backed-tools";
import { scoreExperimentsTool } from "@/src/agent/tools/score-experiments";

export function createToolRegistry(modelGateway: ModelGateway): ToolRegistry {
  return new ToolRegistry({
    analyze_metrics: analyzeMetricsTool,
    create_experiments: createExperimentTool(modelGateway),
    score_experiments: scoreExperimentsTool,
    generate_action_plan: createActionPlanTool(modelGateway),
  });
}
