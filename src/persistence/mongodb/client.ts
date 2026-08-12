import { MongoClient, type Db } from "mongodb";
import { z } from "zod";

const MongoEnvironmentSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default("agentic_growth_copilot"),
});

declare global {
  var agenticGrowthMongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getMongoDatabase(): Promise<Db> {
  const environment = MongoEnvironmentSchema.parse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB: process.env.MONGODB_DB,
  });

  if (!globalThis.agenticGrowthMongoClientPromise) {
    const client = new MongoClient(environment.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5_000,
      ignoreUndefined: true,
    });
    globalThis.agenticGrowthMongoClientPromise = client.connect();
  }

  const client = await globalThis.agenticGrowthMongoClientPromise;
  return client.db(environment.MONGODB_DB);
}
