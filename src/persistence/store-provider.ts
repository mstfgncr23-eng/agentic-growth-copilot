import { z } from "zod";

import type { AgentStore } from "@/src/persistence/agent-store";
import { InMemoryAgentStore } from "@/src/persistence/in-memory-agent-store";
import { getMongoDatabase } from "@/src/persistence/mongodb/client";
import { MongoAgentStore } from "@/src/persistence/mongodb/mongo-agent-store";

const PersistenceDriverSchema = z.enum(["memory", "mongodb"]);

declare global {
  var agenticGrowthStorePromise: Promise<AgentStore> | undefined;
}

export function getPersistenceDriver(): "memory" | "mongodb" {
  const configured =
    process.env.PERSISTENCE_DRIVER ??
    (process.env.MONGODB_URI ? "mongodb" : "memory");
  return PersistenceDriverSchema.parse(configured);
}

export async function getAgentStore(): Promise<AgentStore> {
  if (!globalThis.agenticGrowthStorePromise) {
    globalThis.agenticGrowthStorePromise = createStore();
  }
  return globalThis.agenticGrowthStorePromise;
}

async function createStore(): Promise<AgentStore> {
  const store: AgentStore =
    getPersistenceDriver() === "mongodb"
      ? new MongoAgentStore(await getMongoDatabase())
      : new InMemoryAgentStore();
  await store.initialize();
  return store;
}
