import { describe, expect, it } from "vitest";

describe("repository scaffold", () => {
  it("keeps mock mode as the key-free default", () => {
    expect(process.env.AI_MODE ?? "mock").toBe("mock");
  });
});
