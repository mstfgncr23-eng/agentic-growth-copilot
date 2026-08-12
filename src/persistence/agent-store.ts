import type {
  Conversation,
  ConversationMessage,
} from "@/src/domain/conversation";
import type { Project } from "@/src/domain/project";
import type { AgentRun, RunStatus } from "@/src/domain/run";
import type { AppendRunEventInput, RunEvent } from "@/src/domain/run-event";

export interface CreateRunResult {
  created: boolean;
  message: ConversationMessage;
  run: AgentRun;
}

export interface RunListFilter {
  workspaceId: string;
  status?: RunStatus;
  limit?: number;
}

export interface AgentStore {
  initialize(): Promise<void>;
  createConversation(conversation: Conversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(
    workspaceId: string,
    limit?: number,
  ): Promise<Conversation[]>;
  saveConversation(conversation: Conversation): Promise<Conversation>;
  createRunWithMessage(
    run: AgentRun,
    message: ConversationMessage,
  ): Promise<CreateRunResult>;
  getRun(id: string): Promise<AgentRun | null>;
  saveRun(run: AgentRun, expectedVersion: number): Promise<AgentRun>;
  listRuns(filter: RunListFilter): Promise<AgentRun[]>;
  getMessage(id: string): Promise<ConversationMessage | null>;
  createMessage(message: ConversationMessage): Promise<ConversationMessage>;
  saveMessage(message: ConversationMessage): Promise<ConversationMessage>;
  listMessages(
    conversationId: string,
    limit?: number,
  ): Promise<ConversationMessage[]>;
  appendRunEvent(input: AppendRunEventInput): Promise<RunEvent>;
  listRunEvents(runId: string, afterSequence?: number): Promise<RunEvent[]>;
  upsertProject(project: Project): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
}
