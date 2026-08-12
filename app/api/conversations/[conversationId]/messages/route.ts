import { z } from "zod";

import { createId } from "@/src/domain/common";
import { DEMO_PROJECT_ID, DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { errorResponse, toApiError } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";
import { createSseResponse } from "@/src/server/sse";

const RequestSchema = z.object({
  content: z.string().trim().min(3).max(4_000),
  idempotencyKey: z.string().min(8).max(160).optional(),
  demoScenario: z
    .enum(["happy_path", "fail_once_at_scoring"])
    .default("happy_path"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const requestId = createId("request");
  const { conversationId } = await params;

  try {
    return await createSseResponse(
      async (writer) => {
        const body = RequestSchema.parse(await request.json());
        const idempotencyKey =
          request.headers.get("idempotency-key") ??
          body.idempotencyKey ??
          createId("idempotency");
        const { model, orchestrator } = await getAgentServices();
        const result = await orchestrator.startRun(
          {
            workspaceId: DEMO_WORKSPACE_ID,
            projectId: DEMO_PROJECT_ID,
            conversationId,
            goal: body.content,
            idempotencyKey,
            mode: model.mode,
            demoScenario: body.demoScenario,
          },
          (event) => writer.send({ type: "run.event", event }),
        );
        writer.send({
          type: "run.snapshot",
          run: result.run,
          created: result.created,
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
