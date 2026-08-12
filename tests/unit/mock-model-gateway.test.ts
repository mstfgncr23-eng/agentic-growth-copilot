import { describe, expect, it } from "vitest";

import { MockModelGateway } from "@/src/ai/mock-model-gateway";

describe("mock model gateway", () => {
  it("is deterministic and carries previous-run context into the plan", async () => {
    const model = new MockModelGateway();
    const request = {
      goal: "Rework the previous recommendation for lower effort",
      previousRunSummary:
        "The activation checklist was approved, but implementation effort was too high.",
    };

    const first = await model.plan(request);
    const second = await model.plan(request);

    expect(first.data).toEqual(second.data);
    expect(first.data.assumptions.join(" ")).toContain(
      "Prior run context applied",
    );
    expect(first.usage.simulated).toBe(true);
  });
});
