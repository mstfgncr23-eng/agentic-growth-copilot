import { z } from "zod";

import { EntityIdSchema, IsoDateSchema } from "@/src/domain/common";

export const MessageRoleSchema = z.enum(["user", "assistant"]);
export const MessageStatusSchema = z.enum(["streaming", "completed", "failed"]);

export const ConversationSchema = z.object({
  id: EntityIdSchema,
  workspaceId: EntityIdSchema,
  title: z.string().min(1).max(120),
  summary: z.string().max(2_000).optional(),
  lastRunId: EntityIdSchema.optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export const ConversationMessageSchema = z.object({
  id: EntityIdSchema,
  workspaceId: EntityIdSchema,
  conversationId: EntityIdSchema,
  runId: EntityIdSchema.optional(),
  role: MessageRoleSchema,
  status: MessageStatusSchema,
  content: z.string().max(50_000),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
