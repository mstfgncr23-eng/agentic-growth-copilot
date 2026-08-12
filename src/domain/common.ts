import { z } from "zod";

export const EntityIdSchema = z.string().trim().min(1).max(128);
export const IsoDateSchema = z.string().datetime({ offset: true });

export type EntityId = z.infer<typeof EntityIdSchema>;

export function createId(prefix: string): EntityId {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
