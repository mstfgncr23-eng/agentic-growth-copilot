# Acceptance coverage

## Requirement matrix

| Capability                                  | Automated evidence                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Explicit state machine and invariants       | `tests/unit/state-machine.test.ts`, `state-transition-table.test.ts`     |
| Deterministic mock planning/tools/streaming | `tests/unit/mock-model-gateway.test.ts`, `tools.test.ts`                 |
| Live adapter contract without network calls | `tests/unit/live-model-gateway.test.ts` with an injected fake client     |
| Typed SSE and pre-stream HTTP errors        | `tests/unit/sse.test.ts`, Playwright API acceptance                      |
| Run idempotency and optimistic persistence  | `tests/unit/in-memory-agent-store.test.ts`, optional MongoDB integration |
| Pause, approve, resume, complete            | `tests/integration/orchestrator.test.ts`, Playwright UI acceptance       |
| Reject candidates and alternate completion  | `tests/integration/orchestrator.test.ts`                                 |
| Fail once, retry from checkpoint, complete  | `tests/integration/orchestrator.test.ts`, Playwright UI acceptance       |
| Browser refresh preserves paused approval   | `tests/e2e/mock-mvp.spec.ts`                                             |
| Duplicate approval and stale conflict       | `tests/e2e/mock-mvp.spec.ts`                                             |
| Monitoring metrics                          | `tests/unit/summarize-runs.test.ts`, Playwright UI acceptance            |
| Production compilation                      | `pnpm build` and CI                                                      |

## Mock-first end-to-end scenarios

1. Submit a growth goal and observe typed progress.
2. Verify execution stops at `waiting_for_approval` with no action plan.
3. Reload the page and verify the pending approval remains.
4. Approve and verify the run completes with an action plan and summary.
5. Open Operations and verify the run, mode/model, timing, and usage appear.
6. Run `fail_once_at_scoring`, verify failure, retry, and confirm the failed
   step advances to attempt 2 while completed checkpoints remain intact.
7. Repeat an approval decision ID and verify a no-op success; send a different
   stale decision and verify HTTP 409.

## Commands

```bash
pnpm verify
pnpm exec playwright install chromium
pnpm test:e2e
```

For real MongoDB persistence semantics:

```bash
docker compose up -d mongodb
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 pnpm test:mongodb
```

The Mongo test uses an isolated database name, creates two store instances to
prove persisted pause/resume visibility, verifies ordered events, and drops
only that test database during cleanup.

## Explicit non-goals for this acceptance suite

- No real OpenAI request and no API-key provisioning
- No load, chaos, security-penetration, or multi-region consistency testing
- No authentication or tenant-isolation claim for the single-workspace MVP
