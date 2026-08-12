import { describe, expect, it } from "vitest";

import { ApprovalConflictError } from "@/src/domain/errors";
import { consumeSse, StreamResponseError } from "@/src/lib/consume-sse";
import { createSseResponse } from "@/src/server/sse";
import { makeRun } from "@/tests/helpers/run-fixture";

describe("typed SSE transport", () => {
  it("rejects an error raised before the first frame so the route can set HTTP status", async () => {
    await expect(
      createSseResponse(async () => {
        throw new ApprovalConflictError();
      }),
    ).rejects.toBeInstanceOf(ApprovalConflictError);
  });

  it("keeps errors typed after streaming has started", async () => {
    const response = await createSseResponse(
      async (writer) => {
        writer.send({ type: "run.snapshot", run: makeRun() });
        throw new Error("provider disconnected");
      },
      () => ({
        type: "error",
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed.",
          retryable: true,
          requestId: "request_sse_test",
        },
      }),
    );
    const frames: string[] = [];

    await expect(
      consumeSse(response, (frame) => {
        frames.push(frame.type);
      }),
    ).rejects.toBeInstanceOf(StreamResponseError);
    expect(frames).toEqual(["run.snapshot"]);
  });

  it("preserves a typed API error from a non-success HTTP response", async () => {
    const response = Response.json(
      {
        error: {
          code: "APPROVAL_CONFLICT",
          message: "This approval has already been decided.",
          retryable: false,
          requestId: "request_conflict_test",
        },
      },
      { status: 409 },
    );

    await expect(consumeSse(response, () => undefined)).rejects.toMatchObject({
      detail: { code: "APPROVAL_CONFLICT" },
    });
  });
});
