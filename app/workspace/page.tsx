import { redirect } from "next/navigation";

import { WorkspaceClient } from "@/src/components/workspace/workspace-client";
import { createId, nowIso } from "@/src/domain/common";
import { DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { getAgentServices } from "@/src/server/services";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string | string[] }>;
}) {
  const { model, store } = await getAgentServices();
  const params = await searchParams;
  const conversationId =
    typeof params.conversation === "string" ? params.conversation : undefined;

  if (!conversationId) {
    const timestamp = nowIso();
    const conversation = await store.createConversation({
      id: createId("conversation"),
      workspaceId: DEMO_WORKSPACE_ID,
      title: "Trial conversion sprint",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    redirect(`/workspace?conversation=${encodeURIComponent(conversation.id)}`);
  }

  const [conversation, messages, workspaceRuns] = await Promise.all([
    store.getConversation(conversationId),
    store.listMessages(conversationId),
    store.listRuns({ workspaceId: DEMO_WORKSPACE_ID, limit: 100 }),
  ]);
  if (!conversation || conversation.workspaceId !== DEMO_WORKSPACE_ID) {
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
