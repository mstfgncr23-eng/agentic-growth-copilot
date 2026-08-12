import { z } from "zod";

import { createId, nowIso } from "@/src/domain/common";
import { DEMO_WORKSPACE_ID } from "@/src/demo/seed-data";
import { errorResponse } from "@/src/server/api-error";
import { getAgentServices } from "@/src/server/services";

const CreateConversationRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export async function GET() {
  const requestId = createId("request");
  try {
    const { store } = await getAgentServices();
    const conversations = await store.listConversations(DEMO_WORKSPACE_ID);
    return Response.json({ conversations, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = createId("request");
  try {
    const body = CreateConversationRequestSchema.parse(await request.json());
    const { store } = await getAgentServices();
    const timestamp = nowIso();
    const conversation = await store.createConversation({
      id: createId("conversation"),
      workspaceId: DEMO_WORKSPACE_ID,
      title: body.title,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return Response.json({ conversation, requestId }, { status: 201 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
