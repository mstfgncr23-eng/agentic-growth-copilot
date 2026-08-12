import { beforeEach, describe, expect, it } from "vitest";

import type {
  Conversation,
  ConversationMessage,
} from "@/src/domain/conversation";
import {
  IdempotencyMismatchError,
  PersistenceConflictError,
} from "@/src/domain/errors";
import type { AgentRun } from "@/src/domain/run";
import { InMemoryAgentStore } from "@/src/persistence/in-memory-agent-store";
import { makeRun } from "@/tests/helpers/run-fixture";

const timestamp = "2026-08-12T12:00:00.000Z";

function makeConversation(): Conversation {
  return {
    id: "conversation_test",
    workspaceId: "workspace_demo",
    title: "Trial conversion",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeMessage(run: AgentRun): ConversationMessage {
  return {
    id: run.triggerMessageId,
    workspaceId: run.workspaceId,
    conversationId: run.conversationId,
    runId: run.id,
    role: "user",
    status: "completed",
    content: run.goal,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("in-memory agent store contract", () => {
  let store: InMemoryAgentStore;

  beforeEach(async () => {
    store = new InMemoryAgentStore();
    await store.createConversation(makeConversation());
  });

  it("returns the existing run for a duplicate idempotent request", async () => {
    const firstRun = makeRun();
    const first = await store.createRunWithMessage(
      firstRun,
      makeMessage(firstRun),
    );
    const duplicateRun = makeRun({ id: "run_duplicate" });
    const duplicate = await store.createRunWithMessage(
      duplicateRun,
      makeMessage(duplicateRun),
    );

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.run.id).toBe(first.run.id);
  });

  it("rejects idempotency-key reuse with a different goal", async () => {
    const firstRun = makeRun();
    await store.createRunWithMessage(firstRun, makeMessage(firstRun));
    const conflicting = makeRun({
      id: "run_conflict",
      goal: "Reduce churn instead",
    });

    await expect(
      store.createRunWithMessage(conflicting, makeMessage(conflicting)),
    ).rejects.toBeInstanceOf(IdempotencyMismatchError);
  });

  it("enforces optimistic concurrency for run updates", async () => {
    const run = makeRun();
    await store.createRunWithMessage(run, makeMessage(run));
    const updated = { ...run, status: "planning" as const, version: 1 };
    await store.saveRun(updated, 0);

    await expect(
      store.saveRun({ ...updated, version: 2 }, 0),
    ).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it("retains waiting approval state across independent reads", async () => {
    const run = makeRun();
    await store.createRunWithMessage(run, makeMessage(run));
    const waiting: AgentRun = {
      ...run,
      status: "waiting_for_approval",
      version: 1,
      approvals: [
        {
          id: "approval_1",
          stepId: "step_4",
          experimentId: "experiment_1",
          experimentTitle: "Guided activation checklist",
          status: "pending",
          requestedAt: timestamp,
        },
      ],
    };
    await store.saveRun(waiting, 0);

    const reloaded = await store.getRun(run.id);

    expect(reloaded?.status).toBe("waiting_for_approval");
    expect(reloaded?.approvals[0].status).toBe("pending");
  });
});
