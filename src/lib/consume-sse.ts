import type { ApiError } from "@/src/server/api-error";
import { ApiErrorSchema } from "@/src/server/api-error";
import {
  StreamFrameSchema,
  type StreamFrame,
} from "@/src/server/stream-contract";

export class StreamResponseError extends Error {
  constructor(public readonly detail: ApiError) {
    super(detail.message);
    this.name = "StreamResponseError";
  }
}

export async function consumeSse(
  response: Response,
  onFrame: (frame: StreamFrame) => void | Promise<void>,
): Promise<void> {
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsed = ApiErrorSchema.safeParse(
      typeof payload === "object" && payload !== null && "error" in payload
        ? payload.error
        : undefined,
    );
    if (parsed.success) {
      throw new StreamResponseError(parsed.data);
    }
    throw new Error(`Stream request failed with ${response.status}.`);
  }
  if (!response.body) throw new Error("Stream response had no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (!data) continue;
      const frame = StreamFrameSchema.parse(JSON.parse(data));
      if (frame.type === "error") {
        throw new StreamResponseError(frame.error);
      }
      await onFrame(frame);
    }
    if (done) break;
  }
}
