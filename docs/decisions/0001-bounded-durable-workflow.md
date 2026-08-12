# ADR 0001: Bounded durable workflow

- Status: Accepted
- Date: 2026-08-12

## Context

The MVP must demonstrate useful agent behavior while keeping human approval,
retries, observability, and test determinism explicit. An unconstrained
model-driven loop would make tool choice, pause semantics, and recovery harder
to reason about and verify.

## Decision

Use a code-owned state machine and ordered checkpoints. Models generate only
schema-validated artifacts behind a `ModelGateway`; they do not control state
transitions. Persist the run after every transition, record ordered events,
and require an explicit approval before action-plan generation. Provide a
deterministic mock gateway as the default and a dormant live gateway behind an
environment switch.

## Consequences

- Approval and retry behavior is deterministic and independently testable.
- Completed checkpoints survive pause, refresh, process changes with MongoDB,
  and retry.
- The live provider can change without changing orchestration semantics.
- Adding a new workflow step requires an intentional schema, state-machine,
  orchestration, persistence, UI, and test change.
- This is a bounded workflow engine, not a general autonomous-agent runtime.
