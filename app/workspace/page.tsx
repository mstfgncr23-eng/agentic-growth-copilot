import { WorkspaceClient } from "@/src/components/workspace/workspace-client";
import { DEMO_CONVERSATION_ID, DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { getAgentServices } from "@/src/server/services";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const { model, store } = await getAgentServices();
  const [conversation, messages, workspaceRuns] = await Promise.all([
    store.getConversation(DEMO_CONVERSATION_ID),
    store.listMessages(DEMO_CONVERSATION_ID),
    store.listRuns({ workspaceId: DEMO_WORKSPACE_ID, limit: 100 }),
  ]);
  if (!conversation) {
    throw new Error("The demo conversation could not be initialized.");
  }

  return (
    <WorkspaceClient
      initialConversation={conversation}
      initialMessages={messages}
      initialRuns={workspaceRuns.filter(
        (run) => run.conversationId === conversation.id,
      )}
      mode={model.mode}
    />
  );
}
