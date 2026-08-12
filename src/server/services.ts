import { z } from "zod";

import { createToolRegistry } from "@/src/agent/create-tool-registry";
import { AgentOrchestrator } from "@/src/agent/orchestrator";
import { createLiveModelGatewayFromEnvironment } from "@/src/ai/live-model-gateway";
import { MockModelGateway } from "@/src/ai/mock-model-gateway";
import type { ModelGateway } from "@/src/ai/model-gateway";
import { ensureDemoSeed } from "@/src/demo/seed-data";
import type { AgentStore } from "@/src/persistence/agent-store";
import { getAgentStore } from "@/src/persistence/store-provider";

export interface AgentServices {
  store: AgentStore;
  model: ModelGateway;
  orchestrator: AgentOrchestrator;
}

const AiModeSchema = z.enum(["mock", "live"]);

declare global {
  var agenticGrowthServicesPromise: Promise<AgentServices> | undefined;
}

export async function getAgentServices(): Promise<AgentServices> {
  if (!globalThis.agenticGrowthServicesPromise) {
    globalThis.agenticGrowthServicesPromise = createServices();
  }
  return globalThis.agenticGrowthServicesPromise;
}

async function createServices(): Promise<AgentServices> {
  const store = await getAgentStore();
  await ensureDemoSeed(store);
  const mode = AiModeSchema.parse(process.env.AI_MODE ?? "mock");
  const model =
    mode === "live"
      ? createLiveModelGatewayFromEnvironment()
      : new MockModelGateway({
          chunkDelayMs: process.env.NODE_ENV === "test" ? 0 : 24,
        });
  const orchestrator = new AgentOrchestrator(
    store,
    model,
    createToolRegistry(model),
  );
  return { store, model, orchestrator };
}
