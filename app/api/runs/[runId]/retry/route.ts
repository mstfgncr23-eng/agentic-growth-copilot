import { createId } from "@/src/domain/common";
import { errorResponse, toApiError } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";
import { createSseResponse } from "@/src/server/sse";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const requestId = createId("request");
  const { runId } = await params;

  try {
    return await createSseResponse(
      async (writer) => {
        const { orchestrator } = await getAgentServices();
        const run = await orchestrator.retryRun(runId, (event) =>
          writer.send({ type: "run.event", event }),
        );
        writer.send({ type: "run.snapshot", run });
      },
      (error) => ({
        type: "error",
        error: toApiError(error, requestId),
      }),
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
