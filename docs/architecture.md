# Architecture

## Runtime shape

The application is a Next.js App Router service. Pages and route handlers share
server-side services, while all domain decisions stay in framework-independent
TypeScript modules.

| Layer          | Responsibility                                             | Main location             |
| -------------- | ---------------------------------------------------------- | ------------------------- |
| UI             | Prompt, timeline, approval controls, artifacts, monitoring | `app/`, `src/components/` |
| HTTP           | Validation, status codes, typed SSE transport              | `app/api/`, `src/server/` |
| Orchestration  | Bounded step execution, pause/resume, retry                | `src/agent/`              |
| Domain         | Zod contracts, transitions, invariants, errors             | `src/domain/`             |
| Model boundary | Deterministic mock or dormant live adapter                 | `src/ai/`                 |
| Persistence    | In-memory test/dev store or MongoDB store                  | `src/persistence/`        |

## Request lifecycle

1. A message route validates the goal and idempotency key.
2. The orchestrator writes the user message and queued run together through the
   store abstraction.
3. Each bounded step claims a checkpoint, persists its result, and appends a
   sequenced event.
4. Execution stops at `waiting_for_approval`; no action plan can be generated
   while the approval is pending.
5. An approval decision is persisted with optimistic concurrency. Approval
   resumes the remaining steps; rejection advances to the next ranked
   candidate or completes with `no_experiment_approved`.
6. The route streams typed events and ends with an authoritative run snapshot.

## Bounded model and tool surface

The model does not choose arbitrary tools or invent workflow steps. The
orchestrator owns the ordered step list, and the live gateway overwrites any
model-supplied plan keys with the server-owned bounded keys. Four registered
tools cover metric analysis, experiment generation, scoring, and action-plan
generation. Inputs and outputs are validated with Zod at every boundary.

The live gateway uses OpenAI's Responses API with `store: false`. Structured
operations are parsed into Zod-backed formats; only summary text is streamed.
Stable experiment/task identifiers are created by the server rather than the
model. The default mock gateway follows the same interface and produces typed,
deterministic fixtures.

## Persistence and concurrency

`AgentStore` is the only persistence contract used by orchestration. MongoDB
creates indexes for:

- unique `(workspaceId, conversationId, idempotencyKey)` run creation;
- unique `(runId, sequence)` ordered events;
- run monitoring filters and conversation ordering.

Runs carry a monotonic `version`. `saveRun(run, expectedVersion)` updates only
the expected version and raises a conflict if another writer won. Approval
commands additionally carry a `decisionId`, making exact retries no-ops while
different stale decisions return a conflict.

## Streaming contract

SSE frames are a discriminated union:

- `run.event`: ordered, persisted progress event;
- `run.snapshot`: authoritative terminal or paused state;
- `error`: typed API error after streaming has started.

The server waits for the first frame before committing the HTTP response. This
lets validation, not-found, and approval-conflict failures retain their proper
HTTP status. Failures after the stream begins are represented as typed error
frames.

## Monitoring

`/internal/runs` shows run status, attempts, timing, model mode/name, token
usage, and failure details. `/api/internal/metrics` derives aggregate counts
from persisted runs. Monitoring reads the same store as the workflow, so it
does not depend on transient browser state.

## Trust boundaries

- Secrets remain server-side and are never sent to React components.
- The mock-first path does not require an API key or network access.
- Model output is data, not authority: schemas and state invariants decide what
  is accepted.
- The MVP is scoped to one seeded workspace and has no authentication. Do not
  expose it as a multi-tenant production service without adding access control.
