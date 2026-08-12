# HTTP and streaming API

All endpoints operate on the seeded demo workspace for this MVP. JSON errors
have the shape `{ "error": { "code", "message", "requestId" } }`.

## Conversations

### `GET /api/conversations`

Lists conversations for the demo workspace.

### `POST /api/conversations`

Creates a conversation.

```json
{ "title": "Trial conversion sprint" }
```

Returns HTTP 201 with `{ "conversation", "requestId" }`.

### `GET /api/conversations/:conversationId`

Returns the conversation, its messages, and associated runs.

## Start a run

### `POST /api/conversations/:conversationId/messages`

Headers:

- `Content-Type: application/json`
- `Idempotency-Key: <8-160 characters>` (recommended)

Body:

```json
{
  "content": "Improve trial-to-paid conversion",
  "demoScenario": "happy_path"
}
```

`demoScenario` may be `happy_path` or `fail_once_at_scoring`. The response is
`text/event-stream` and terminates at a pause, failure, or completion snapshot.

## Approval

### `POST /api/runs/:runId/approvals/:approvalId`

```json
{
  "decision": "approve",
  "feedback": "Keep the rollout under 25% initially"
}
```

Use `Idempotency-Key` as the decision ID. `decision` may be `approve` or
`reject`. Exact retries are returned as duplicate snapshots; a conflicting
decision against an already-resolved approval returns HTTP 409.

## Retry

### `POST /api/runs/:runId/retry`

Retries a failed, retryable run from its checkpoint and returns typed SSE. A
non-failed or non-retryable run fails validation.

## Read models

| Endpoint                                         | Purpose                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| `GET /api/runs/:runId`                           | Run, persisted events, and run messages        |
| `GET /api/runs/:runId/events?after=0`            | Ordered events after a sequence number         |
| `GET /api/internal/runs?status=failed&limit=100` | Filterable run list                            |
| `GET /api/internal/metrics`                      | Aggregate run metrics                          |
| `GET /api/health`                                | Mode, persistence driver, and health timestamp |

## SSE frames

Each SSE block contains JSON in its `data:` field.

```json
{
  "type": "run.event",
  "event": {
    "id": "event_...",
    "runId": "run_...",
    "sequence": 4,
    "type": "step.status",
    "createdAt": "2026-08-12T20:00:00.000Z",
    "payload": {}
  }
}
```

```json
{
  "type": "run.snapshot",
  "run": { "id": "run_...", "status": "waiting_for_approval" },
  "created": true,
  "duplicate": false
}
```

```json
{
  "type": "error",
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "The run could not continue.",
    "requestId": "request_..."
  }
}
```

The snapshot is authoritative. Clients should validate frames and replace
their run view from the latest snapshot rather than infer final state from
individual events.
