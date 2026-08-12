import type { Conversation } from "@/src/domain/conversation";
import type { AgentRun } from "@/src/domain/run";
import type { AgentStore } from "@/src/persistence/agent-store";

export async function buildRunContext(
  store: AgentStore,
  conversation: Conversation,
): Promise<AgentRun["contextSnapshot"]> {
  const [messages, previousRun] = await Promise.all([
    store.listMessages(conversation.id, 12),
    conversation.lastRunId ? store.getRun(conversation.lastRunId) : null,
  ]);
  const previousRunSummary = previousRun
    ? summarizePreviousRun(previousRun)
    : undefined;
  return {
    messageIds: messages.map((message) => message.id),
    previousRunId: previousRun?.id,
    previousRunSummary,
  };
}

function summarizePreviousRun(run: AgentRun): string {
  if (run.artifacts.finalSummary) {
    return run.artifacts.finalSummary;
  }
  if (run.outcome === "no_experiment_approved") {
    return "The previous run ended after every proposed experiment was rejected.";
  }
  const approved = run.approvals.find(
    (approval) => approval.status === "approved",
  );
  if (approved) {
    return `The previous run approved “${approved.experimentTitle}” but did not complete its final summary.`;
  }
  return `The previous run is currently ${run.status}.`;
}
