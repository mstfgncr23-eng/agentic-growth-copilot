import { z } from "zod";

import { createId } from "@/src/domain/common";
import { errorResponse } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";

const QuerySchema = z.coerce.number().int().nonnegative().default(0);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const requestId = createId("request");
  try {
    const { runId } = await params;
    const after = QuerySchema.parse(
      new URL(request.url).searchParams.get("after") ?? "0",
    );
    const { store } = await getAgentServices();
    const events = await store.listRunEvents(runId, after);
    return Response.json({ events, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
