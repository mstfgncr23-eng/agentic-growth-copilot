import { createId } from "@/src/domain/common";
import { DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { EntityNotFoundError } from "@/src/domain/errors";
import { errorResponse } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const requestId = createId("request");
  try {
    const { conversationId } = await params;
    const { store } = await getAgentServices();
    const [conversation, messages, workspaceRuns] = await Promise.all([
      store.getConversation(conversationId),
      store.listMessages(conversationId),
      store.listRuns({ workspaceId: DEMO_WORKSPACE_ID, limit: 100 }),
    ]);
    if (!conversation) {
      throw new EntityNotFoundError("Conversation", conversationId);
    }
    return Response.json({
      conversation,
      messages,
      runs: workspaceRuns.filter(
        (run) => run.conversationId === conversationId,
      ),
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
