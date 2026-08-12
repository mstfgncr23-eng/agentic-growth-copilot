import { expect, test, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("prompt → stream → durable approval → completion → monitoring", async ({
  page,
}) => {
  const goal = "E2E: improve trial-to-paid conversion with three experiments";
  await page.goto("/workspace");
  await page.getByLabel("Growth goal").fill(goal);
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByText("Human approval required")).toBeVisible();
  await expect(page.getByText("Approved action plan")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Human approval required")).toBeVisible();
  await expect(page.getByText("Approved action plan")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve & continue" }).click();

  await expect(page.getByText("Approved action plan")).toBeVisible();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Agent run monitoring" }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(goal) })).toBeVisible();
  await expect(page.getByText("mock · growth-copilot-v1")).toBeVisible();
});

test("fail-once → retry checkpoint → approve → complete", async ({ page }) => {
  await page.goto("/workspace");
  await page.getByLabel("Demo scenario").selectOption("fail_once_at_scoring");
  await page
    .getByLabel("Growth goal")
    .fill("E2E: exercise failure recovery without rerunning checkpoints");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByText("Run failed at a checkpoint")).toBeVisible();
  await expect(page.getByText("SIMULATED_TRANSIENT_FAILURE")).toBeVisible();
  await page.getByRole("button", { name: "Retry from checkpoint" }).click();
  await expect(page.getByText("Human approval required")).toBeVisible();
  await page.getByRole("button", { name: "Approve & continue" }).click();
  await expect(page.getByText("Approved action plan")).toBeVisible();
  await expect(page.getByText("attempt 2")).toBeVisible();
});

test("conversation creation and approval idempotency expose correct HTTP contracts", async ({
  request,
}) => {
  const conversationResponse = await request.post("/api/conversations", {
    data: { title: "API acceptance conversation" },
  });
  expect(conversationResponse.status()).toBe(201);
  const { conversation } = await conversationResponse.json();

  const started = await request.post(
    `/api/conversations/${conversation.id}/messages`,
    {
      headers: { "Idempotency-Key": "e2e_api_start_request_1234" },
      data: { content: "Create three measurable conversion experiments" },
    },
  );
  expect(started.status()).toBe(200);
  const startSnapshot = await readSnapshot(started);
  expect(startSnapshot.run.status).toBe("waiting_for_approval");
  const approval = startSnapshot.run.approvals[0];
  const decisionId = "e2e_api_decision_1234";
  const approvalUrl = `/api/runs/${startSnapshot.run.id}/approvals/${approval.id}`;

  const approved = await request.post(approvalUrl, {
    headers: { "Idempotency-Key": decisionId },
    data: { decision: "approve" },
  });
  expect(approved.status()).toBe(200);
  expect((await readSnapshot(approved)).run.status).toBe("completed");

  const duplicate = await request.post(approvalUrl, {
    headers: { "Idempotency-Key": decisionId },
    data: { decision: "approve" },
  });
  expect(duplicate.status()).toBe(200);
  expect((await readSnapshot(duplicate)).duplicate).toBe(true);

  const conflict = await request.post(approvalUrl, {
    headers: { "Idempotency-Key": "e2e_api_conflict_1234" },
    data: { decision: "reject" },
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error.code).toBe("APPROVAL_CONFLICT");
});

async function readSnapshot(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
) {
  const frames = (await response.text())
    .split("\n\n")
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n"),
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data));
  const snapshot = frames.find((frame) => frame.type === "run.snapshot");
  expect(snapshot, "stream must end with a run snapshot").toBeDefined();
  return snapshot;
}
