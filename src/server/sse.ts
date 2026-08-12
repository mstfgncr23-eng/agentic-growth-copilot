import type { StreamFrame } from "@/src/server/stream-contract";

const encoder = new TextEncoder();

export interface SseWriter {
  send(frame: StreamFrame): void;
}

export async function createSseResponse(
  task: (writer: SseWriter) => Promise<void>,
  errorFrame?: (error: unknown) => StreamFrame,
): Promise<Response> {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let readySettled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  const settleReady = () => {
    if (readySettled) return;
    readySettled = true;
    resolveReady();
  };
  const writer: SseWriter = {
    send(frame) {
      if (closed) return;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      settleReady();
    },
  };

  void task(writer).then(
    () => {
      settleReady();
      closed = true;
      controller.close();
    },
    (error: unknown) => {
      if (!readySettled) {
        readySettled = true;
        closed = true;
        controller.close();
        rejectReady(error);
        return;
      }
      if (errorFrame) {
        try {
          writer.send(errorFrame(error));
          closed = true;
          controller.close();
          return;
        } catch {
          // Fall through to a transport error if the error frame cannot be sent.
        }
      }
      closed = true;
      controller.error(error);
    },
  );

  await ready;

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
