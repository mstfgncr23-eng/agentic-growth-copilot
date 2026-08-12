import { createId } from "@/src/domain/common";
import { DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { errorResponse } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";
import { summarizeRuns } from "@/src/server/summarize-runs";

export async function GET() {
  const requestId = createId("request");
  try {
    const { store } = await getAgentServices();
    const runs = await store.listRuns({
      workspaceId: DEMO_WORKSPACE_ID,
      limit: 500,
    });
    return Response.json({ metrics: summarizeRuns(runs), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
