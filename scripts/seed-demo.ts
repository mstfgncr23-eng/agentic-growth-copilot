import { MongoClient } from "mongodb";
import { z } from "zod";

import { ensureDemoSeed } from "@/src/demo/seed-data";
import { MongoAgentStore } from "@/src/persistence/mongodb/mongo-agent-store";

const EnvironmentSchema = z.object({
  MONGODB_URI: z.string().trim().min(1),
  MONGODB_DB: z.string().trim().min(1).default("agentic_growth_copilot"),
});

async function main() {
  const environment = EnvironmentSchema.parse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB: process.env.MONGODB_DB,
  });
  const client = new MongoClient(environment.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    const store = new MongoAgentStore(client.db(environment.MONGODB_DB));
    await store.initialize();
    await ensureDemoSeed(store);
    console.log(`Demo data is ready in database ${environment.MONGODB_DB}.`);
  } finally {
    await client.close();
  }
}

await main();
