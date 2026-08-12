import { z } from "zod";

import { createId } from "@/src/domain/common";
import { RunStatusSchema } from "@/src/domain/run";
import { DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { errorResponse } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";

const QuerySchema = z.object({
  status: RunStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export async function GET(request: Request) {
  const requestId = createId("request");
  try {
    const searchParams = new URL(request.url).searchParams;
    const query = QuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    const { store } = await getAgentServices();
    const runs = await store.listRuns({
      workspaceId: DEMO_WORKSPACE_ID,
      status: query.status,
      limit: query.limit,
    });
    return Response.json({ runs, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
