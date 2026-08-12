import {
  type Collection,
  type Db,
  type Filter,
  MongoServerError,
} from "mongodb";

import { createId } from "@/src/domain/common";
import {
  ConversationMessageSchema,
  ConversationSchema,
  type Conversation,
  type ConversationMessage,
} from "@/src/domain/conversation";
import {
  EntityNotFoundError,
  IdempotencyMismatchError,
  PersistenceConflictError,
} from "@/src/domain/errors";
import { ProjectSchema, type Project } from "@/src/domain/project";
import {
  AgentRunSchema,
  type AgentRun,
  type RunStatus,
} from "@/src/domain/run";
import {
  RunEventSchema,
  type AppendRunEventInput,
  type RunEvent,
} from "@/src/domain/run-event";
import type {
  AgentStore,
  CreateRunResult,
  RunListFilter,
} from "@/src/persistence/agent-store";

type Stored<T extends { id: string }> = T & { _id: string };
type StoredRunEvent = Stored<RunEvent>;
type RunEventCounter = { _id: string; sequence: number };

export class MongoAgentStore implements AgentStore {
  private readonly conversations: Collection<Stored<Conversation>>;
  private readonly messages: Collection<Stored<ConversationMessage>>;
  private readonly runs: Collection<Stored<AgentRun>>;
  private readonly runEvents: Collection<StoredRunEvent>;
  private readonly runEventCounters: Collection<RunEventCounter>;
  private readonly projects: Collection<Stored<Project>>;

  constructor(private readonly database: Db) {
    this.conversations = database.collection("conversations");
    this.messages = database.collection("messages");
    this.runs = database.collection("runs");
    this.runEvents = database.collection("run_events");
    this.runEventCounters = database.collection("run_event_counters");
    this.projects = database.collection("projects");
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.conversations.createIndex({ workspaceId: 1, updatedAt: -1 }),
      this.messages.createIndex({ conversationId: 1, createdAt: 1 }),
      this.runs.createIndex(
        { workspaceId: 1, conversationId: 1, idempotencyKey: 1 },
        { unique: true },
      ),
      this.runs.createIndex({ workspaceId: 1, status: 1, createdAt: -1 }),
      this.runEvents.createIndex({ runId: 1, sequence: 1 }, { unique: true }),
      this.projects.createIndex({ workspaceId: 1, name: 1 }),
    ]);
  }

  async createConversation(conversation: Conversation): Promise<Conversation> {
    const parsed = ConversationSchema.parse(conversation);
    await this.conversations.updateOne(
      { _id: parsed.id },
      { $setOnInsert: toStored(parsed) },
      { upsert: true },
    );
    const stored = await this.conversations.findOne({ _id: parsed.id });
    return ConversationSchema.parse(stored);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const stored = await this.conversations.findOne({ _id: id });
    return stored ? ConversationSchema.parse(stored) : null;
  }

  async listConversations(
    workspaceId: string,
    limit = 50,
  ): Promise<Conversation[]> {
    const stored = await this.conversations
      .find({ workspaceId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return stored.map((conversation) => ConversationSchema.parse(conversation));
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    const parsed = ConversationSchema.parse(conversation);
    const result = await this.conversations.replaceOne(
      { _id: parsed.id },
      toStored(parsed),
    );
    if (result.matchedCount !== 1) {
      throw new EntityNotFoundError("Conversation", parsed.id);
    }
    return parsed;
  }

  async createRunWithMessage(
    run: AgentRun,
    message: ConversationMessage,
  ): Promise<CreateRunResult> {
    const parsedRun = AgentRunSchema.parse(run);
    const parsedMessage = ConversationMessageSchema.parse(message);

    try {
      await this.runs.insertOne(toStored(parsedRun));
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) {
        throw error;
      }
      return this.loadIdempotentRun(parsedRun, parsedMessage);
    }

    await this.messages.updateOne(
      { _id: parsedMessage.id },
      { $setOnInsert: toStored(parsedMessage) },
      { upsert: true },
    );
    await this.conversations.updateOne(
      { _id: parsedRun.conversationId },
      {
        $set: {
          lastRunId: parsedRun.id,
          updatedAt: parsedRun.updatedAt,
        },
      },
    );

    return { created: true, run: parsedRun, message: parsedMessage };
  }

  async getRun(id: string): Promise<AgentRun | null> {
    const stored = await this.runs.findOne({ _id: id });
    return stored ? AgentRunSchema.parse(stored) : null;
  }

  async saveRun(run: AgentRun, expectedVersion: number): Promise<AgentRun> {
    const parsed = AgentRunSchema.parse(run);
    if (parsed.version !== expectedVersion + 1) {
      throw new PersistenceConflictError();
    }
    const result = await this.runs.replaceOne(
      { _id: parsed.id, version: expectedVersion },
      toStored(parsed),
    );
    if (result.modifiedCount !== 1) {
      throw new PersistenceConflictError();
    }
    return parsed;
  }

  async listRuns(filter: RunListFilter): Promise<AgentRun[]> {
    const query: Filter<Stored<AgentRun>> = { workspaceId: filter.workspaceId };
    if (filter.status) {
      query.status = filter.status as RunStatus;
    }
    const stored = await this.runs
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filter.limit ?? 100)
      .toArray();
    return stored.map((run) => AgentRunSchema.parse(run));
  }

  async getMessage(id: string): Promise<ConversationMessage | null> {
    const stored = await this.messages.findOne({ _id: id });
    return stored ? ConversationMessageSchema.parse(stored) : null;
  }

  async createMessage(
    message: ConversationMessage,
  ): Promise<ConversationMessage> {
    const parsed = ConversationMessageSchema.parse(message);
    await this.messages.updateOne(
      { _id: parsed.id },
      { $setOnInsert: toStored(parsed) },
      { upsert: true },
    );
    const stored = await this.messages.findOne({ _id: parsed.id });
    return ConversationMessageSchema.parse(stored);
  }

  async saveMessage(
    message: ConversationMessage,
  ): Promise<ConversationMessage> {
    const parsed = ConversationMessageSchema.parse(message);
    const result = await this.messages.replaceOne(
      { _id: parsed.id },
      toStored(parsed),
    );
    if (result.matchedCount !== 1) {
      throw new EntityNotFoundError("Message", parsed.id);
    }
    return parsed;
  }

  async listMessages(
    conversationId: string,
    limit = 100,
  ): Promise<ConversationMessage[]> {
    const stored = await this.messages
      .find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return stored
      .reverse()
      .map((message) => ConversationMessageSchema.parse(message));
  }

  async appendRunEvent(input: AppendRunEventInput): Promise<RunEvent> {
    const counter = await this.runEventCounters.findOneAndUpdate(
      { _id: input.runId },
      { $inc: { sequence: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    if (!counter) {
      throw new PersistenceConflictError(
        "Could not reserve a run event sequence.",
      );
    }
    const event = RunEventSchema.parse({
      ...input,
      id: createId("event"),
      sequence: counter.sequence,
    });
    await this.runEvents.insertOne(toStored(event));
    return event;
  }

  async listRunEvents(runId: string, afterSequence = 0): Promise<RunEvent[]> {
    const stored = await this.runEvents
      .find({ runId, sequence: { $gt: afterSequence } })
      .sort({ sequence: 1 })
      .toArray();
    return stored.map((event) => RunEventSchema.parse(event));
  }

  async upsertProject(project: Project): Promise<Project> {
    const parsed = ProjectSchema.parse(project);
    await this.projects.replaceOne({ _id: parsed.id }, toStored(parsed), {
      upsert: true,
    });
    return parsed;
  }

  async getProject(id: string): Promise<Project | null> {
    const stored = await this.projects.findOne({ _id: id });
    return stored ? ProjectSchema.parse(stored) : null;
  }

  private async loadIdempotentRun(
    requestedRun: AgentRun,
    requestedMessage: ConversationMessage,
  ): Promise<CreateRunResult> {
    const existingDocument = await this.runs.findOne({
      workspaceId: requestedRun.workspaceId,
      conversationId: requestedRun.conversationId,
      idempotencyKey: requestedRun.idempotencyKey,
    });
    if (!existingDocument) {
      throw new PersistenceConflictError(
        "A conflicting run ID already exists.",
      );
    }
    const existingRun = AgentRunSchema.parse(existingDocument);
    if (existingRun.goal !== requestedRun.goal) {
      throw new IdempotencyMismatchError();
    }

    const repairedMessage = ConversationMessageSchema.parse({
      ...requestedMessage,
      id: existingRun.triggerMessageId,
      runId: existingRun.id,
      content: existingRun.goal,
      createdAt: existingRun.createdAt,
      updatedAt: existingRun.createdAt,
    });
    await this.messages.updateOne(
      { _id: repairedMessage.id },
      { $setOnInsert: toStored(repairedMessage) },
      { upsert: true },
    );
    const storedMessage = await this.messages.findOne({
      _id: existingRun.triggerMessageId,
    });
    return {
      created: false,
      run: existingRun,
      message: ConversationMessageSchema.parse(storedMessage),
    };
  }
}

function toStored<T extends { id: string }>(value: T): Stored<T> {
  return { ...value, _id: value.id };
}
