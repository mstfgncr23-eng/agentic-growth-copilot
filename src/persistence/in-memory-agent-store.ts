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
import { AgentRunSchema, type AgentRun } from "@/src/domain/run";
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

export class InMemoryAgentStore implements AgentStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ConversationMessage>();
  private readonly runs = new Map<string, AgentRun>();
  private readonly runEvents = new Map<string, RunEvent[]>();
  private readonly projects = new Map<string, Project>();
  private readonly idempotencyIndex = new Map<string, string>();

  async initialize(): Promise<void> {}

  async createConversation(conversation: Conversation): Promise<Conversation> {
    const parsed = ConversationSchema.parse(conversation);
    const existing = this.conversations.get(parsed.id);
    if (existing) {
      return clone(existing);
    }
    this.conversations.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return cloneOrNull(this.conversations.get(id));
  }

  async listConversations(
    workspaceId: string,
    limit = 50,
  ): Promise<Conversation[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    const parsed = ConversationSchema.parse(conversation);
    if (!this.conversations.has(parsed.id)) {
      throw new EntityNotFoundError("Conversation", parsed.id);
    }
    this.conversations.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async createRunWithMessage(
    run: AgentRun,
    message: ConversationMessage,
  ): Promise<CreateRunResult> {
    const parsedRun = AgentRunSchema.parse(run);
    const parsedMessage = ConversationMessageSchema.parse(message);
    const indexKey = `${parsedRun.workspaceId}:${parsedRun.conversationId}:${parsedRun.idempotencyKey}`;
    const existingRunId = this.idempotencyIndex.get(indexKey);

    if (existingRunId) {
      const existingRun = this.runs.get(existingRunId);
      if (!existingRun) {
        throw new EntityNotFoundError("Run", existingRunId);
      }
      if (existingRun.goal !== parsedRun.goal) {
        throw new IdempotencyMismatchError();
      }
      const existingMessage = this.messages.get(existingRun.triggerMessageId);
      if (!existingMessage) {
        throw new EntityNotFoundError("Message", existingRun.triggerMessageId);
      }
      return {
        created: false,
        run: clone(existingRun),
        message: clone(existingMessage),
      };
    }

    if (!this.conversations.has(parsedRun.conversationId)) {
      throw new EntityNotFoundError("Conversation", parsedRun.conversationId);
    }

    this.runs.set(parsedRun.id, clone(parsedRun));
    this.messages.set(parsedMessage.id, clone(parsedMessage));
    this.idempotencyIndex.set(indexKey, parsedRun.id);

    const conversation = this.conversations.get(parsedRun.conversationId)!;
    this.conversations.set(conversation.id, {
      ...conversation,
      lastRunId: parsedRun.id,
      updatedAt: parsedRun.updatedAt,
    });

    return {
      created: true,
      run: clone(parsedRun),
      message: clone(parsedMessage),
    };
  }

  async getRun(id: string): Promise<AgentRun | null> {
    return cloneOrNull(this.runs.get(id));
  }

  async saveRun(run: AgentRun, expectedVersion: number): Promise<AgentRun> {
    const parsed = AgentRunSchema.parse(run);
    const existing = this.runs.get(parsed.id);
    if (!existing) {
      throw new EntityNotFoundError("Run", parsed.id);
    }
    if (
      existing.version !== expectedVersion ||
      parsed.version !== expectedVersion + 1
    ) {
      throw new PersistenceConflictError();
    }
    this.runs.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async listRuns(filter: RunListFilter): Promise<AgentRun[]> {
    return [...this.runs.values()]
      .filter(
        (run) =>
          run.workspaceId === filter.workspaceId &&
          (!filter.status || run.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 100)
      .map(clone);
  }

  async getMessage(id: string): Promise<ConversationMessage | null> {
    return cloneOrNull(this.messages.get(id));
  }

  async createMessage(
    message: ConversationMessage,
  ): Promise<ConversationMessage> {
    const parsed = ConversationMessageSchema.parse(message);
    const existing = this.messages.get(parsed.id);
    if (existing) {
      return clone(existing);
    }
    this.messages.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async saveMessage(
    message: ConversationMessage,
  ): Promise<ConversationMessage> {
    const parsed = ConversationMessageSchema.parse(message);
    if (!this.messages.has(parsed.id)) {
      throw new EntityNotFoundError("Message", parsed.id);
    }
    this.messages.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async listMessages(
    conversationId: string,
    limit = 100,
  ): Promise<ConversationMessage[]> {
    return [...this.messages.values()]
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-limit)
      .map(clone);
  }

  async appendRunEvent(input: AppendRunEventInput): Promise<RunEvent> {
    const events = this.runEvents.get(input.runId) ?? [];
    const event = RunEventSchema.parse({
      ...input,
      id: createId("event"),
      sequence: events.length + 1,
    });
    events.push(clone(event));
    this.runEvents.set(input.runId, events);
    return clone(event);
  }

  async listRunEvents(runId: string, afterSequence = 0): Promise<RunEvent[]> {
    return (this.runEvents.get(runId) ?? [])
      .filter((event) => event.sequence > afterSequence)
      .map(clone);
  }

  async upsertProject(project: Project): Promise<Project> {
    const parsed = ProjectSchema.parse(project);
    this.projects.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async getProject(id: string): Promise<Project | null> {
    return cloneOrNull(this.projects.get(id));
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : clone(value);
}
