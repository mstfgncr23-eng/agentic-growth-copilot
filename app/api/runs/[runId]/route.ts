import { createId } from "@/src/domain/common";
import { EntityNotFoundError } from "@/src/domain/errors";
import { errorResponse } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const requestId = createId("request");
  try {
    const { runId } = await params;
    const { store } = await getAgentServices();
    const run = await store.getRun(runId);
    if (!run) throw new EntityNotFoundError("Run", runId);
    const [events, messages] = await Promise.all([
      store.listRunEvents(runId),
      store.listMessages(run.conversationId),
    ]);
    return Response.json({
      run,
      events,
      messages: messages.filter((message) => message.runId === runId),
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
