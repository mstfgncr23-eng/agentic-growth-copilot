import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createToolRegistry } from "@/src/agent/create-tool-registry";
import { AgentOrchestrator } from "@/src/agent/orchestrator";
import { MockModelGateway } from "@/src/ai/mock-model-gateway";
import {
  DEMO_CONVERSATION_ID,
  DEMO_PROJECT_ID,
  DEMO_WORKSPACE_ID,
  ensureDemoSeed,
} from "@/src/demo/seed-data";
import { MongoAgentStore } from "@/src/persistence/mongodb/mongo-agent-store";

const mongoUri = process.env.TEST_MONGODB_URI;
const describeWithMongo = mongoUri ? describe : describe.skip;

describeWithMongo("Mongo agent store acceptance", () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    client = new MongoClient(mongoUri!, {
      serverSelectionTimeoutMS: 5_000,
      ignoreUndefined: true,
    });

    await client.connect();

    database = client.db(`agc_test_${process.pid}_${Date.now()}`);
  });

  afterAll(async () => {
    if (database) await database.dropDatabase();
    if (client) await client.close();
  });

  it("persists an approval pause and resumes the same run from a new store instance", async () => {
    const firstStore = new MongoAgentStore(database);
    await firstStore.initialize();
    await ensureDemoSeed(firstStore);

    const firstModel = new MockModelGateway();
    const firstOrchestrator = new AgentOrchestrator(
      firstStore,
      firstModel,
      createToolRegistry(firstModel),
    );

    const started = await firstOrchestrator.startRun({
      workspaceId: DEMO_WORKSPACE_ID,
      projectId: DEMO_PROJECT_ID,
      conversationId: DEMO_CONVERSATION_ID,
      goal: "Increase trial-to-paid conversion with three experiments",
      idempotencyKey: "mongo_acceptance_request_1234",
      mode: "mock",
      demoScenario: "happy_path",
    });

    expect(started.run.status).toBe("waiting_for_approval");
    expect(started.run.artifacts.actionPlan).toBeUndefined();

    const secondStore = new MongoAgentStore(database);
    await secondStore.initialize();

    const reloaded = await secondStore.getRun(started.run.id);
    expect(reloaded).toEqual(started.run);

    const secondModel = new MockModelGateway();
    const secondOrchestrator = new AgentOrchestrator(
      secondStore,
      secondModel,
      createToolRegistry(secondModel),
    );

    const completed = await secondOrchestrator.resolveApproval({
      runId: started.run.id,
      approvalId: started.run.approvals[0].id,
      decision: "approve",
      decisionId: "mongo_acceptance_decision_1234",
    });

    const events = await secondStore.listRunEvents(started.run.id);

    expect(completed.run.status).toBe("completed");
    expect(completed.run.artifacts.actionPlan?.experimentId).toBe(
      started.run.approvals[0].experimentId,
    );

    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_, index) => index + 1),
    );
  }, 20_000);
});
