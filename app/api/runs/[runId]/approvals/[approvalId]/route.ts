import { z } from "zod";

import { createId } from "@/src/domain/common";
import { errorResponse, toApiError } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";
import { createSseResponse } from "@/src/server/sse";

const RequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  decisionId: z.string().min(8).max(160).optional(),
  feedback: z.string().trim().max(1_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; approvalId: string }> },
) {
  const requestId = createId("request");
  const { runId, approvalId } = await params;

  try {
    return await createSseResponse(
      async (writer) => {
        const body = RequestSchema.parse(await request.json());
        const decisionId =
          request.headers.get("idempotency-key") ??
          body.decisionId ??
          createId("decision");
        const { orchestrator } = await getAgentServices();
        const result = await orchestrator.resolveApproval(
          {
            runId,
            approvalId,
            decision: body.decision,
            decisionId,
            feedback: body.feedback,
          },
          (event) => writer.send({ type: "run.event", event }),
        );
        writer.send({
          type: "run.snapshot",
          run: result.run,
          duplicate: result.duplicate,
        });
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
