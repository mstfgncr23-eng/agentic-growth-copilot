import type { ModelUsageSchema } from "@/src/domain/run";
import type { AgentStore } from "@/src/persistence/agent-store";
import {
  ToolContractSchemas,
  type ToolInputMap,
  type ToolName,
  type ToolOutputMap,
} from "@/src/agent/tool-contracts";
import type { z } from "zod";

export interface ToolContext {
  runId: string;
  workspaceId: string;
  store: AgentStore;
  signal?: AbortSignal;
  recordModelUsage?: (usage: z.infer<typeof ModelUsageSchema>) => void;
}

export interface AgentTool<Name extends ToolName> {
  readonly name: Name;
  readonly version: string;
  execute(
    input: ToolInputMap[Name],
    context: ToolContext,
  ): Promise<ToolOutputMap[Name]>;
}

export type ToolImplementationMap = {
  [Name in ToolName]: AgentTool<Name>;
};

export interface ToolExecutionResult<Name extends ToolName> {
  name: Name;
  version: string;
  durationMs: number;
  output: ToolOutputMap[Name];
}

export class ToolRegistry {
  constructor(private readonly tools: ToolImplementationMap) {}

  async execute<Name extends ToolName>(
    name: Name,
    rawInput: ToolInputMap[Name],
    context: ToolContext,
  ): Promise<ToolExecutionResult<Name>> {
    const contract = ToolContractSchemas[name];
    const tool = this.tools[name] as AgentTool<Name>;
    const input = contract.input.parse(rawInput) as ToolInputMap[Name];
    const startedAt = performance.now();
    const rawOutput = await tool.execute(input, context);
    const output = contract.output.parse(rawOutput) as ToolOutputMap[Name];
    return {
      name,
      version: tool.version,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      output,
    };
  }
}
