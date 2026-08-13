# Agentic Growth Copilot

A mock-first, bounded agent workflow for turning a growth goal into three
scored experiments, pausing for human approval, and producing an actionable
rollout plan. The repository defaults to a deterministic mock path that requires
neither an API key nor an external service, while the public demo runs the same
workflow in live mode with OpenAI and durable MongoDB persistence.

## Live demo

**Production:** https://agentic-growth-copilot-mstfgncr23-8899s-projects.vercel.app/workspace

The deployed demo runs with `AI_MODE=live` and `PERSISTENCE_DRIVER=mongodb`.
It demonstrates the full path from prompt → metric analysis → three generated
experiments → deterministic scoring → durable human approval pause → resume →
action plan → streamed decision summary.

## What is implemented

- Explicit, validated run state machine with checkpointed steps
- Durable MongoDB adapter with optimistic concurrency and idempotency indexes
- Human approval pause/resume, rejection fallback, and stale-decision conflicts
- Retry from the failed checkpoint without repeating completed work
- Typed Server-Sent Events (SSE) for run events and terminal snapshots
- Mock model gateway plus an OpenAI Responses API live adapter
- Internal run/metrics monitoring pages and JSON endpoints
- Unit, integration, optional MongoDB, and Playwright acceptance suites
- Standalone Next.js build, container definition, Vercel deployment support, and CI workflow

## Quick start: mock + memory

Prerequisites: Node.js 20.9+ and pnpm 11.16.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000/workspace`. The defaults are:

```dotenv
AI_MODE=mock
PERSISTENCE_DRIVER=memory
```

No `OPENAI_API_KEY` is needed in mock mode. Memory persistence survives page
reloads while the server process stays alive, but it is intentionally not
durable across process restarts.

## Durable local mode: mock + MongoDB

```bash
docker compose up -d mongodb
```

Set these values in `.env.local`:

```dotenv
AI_MODE=mock
PERSISTENCE_DRIVER=mongodb
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=agentic_growth_copilot
```

Then start the app. Demo data is seeded idempotently on service initialization;
`pnpm seed` is also available for an explicit seed operation.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

MongoDB persistence has an opt-in integration test so the default suite stays
self-contained:

```bash
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 pnpm test:mongodb
```

The full local quality gate is `pnpm verify`. Playwright deliberately builds
and serves the production standalone output in mock/memory mode.

## Live adapter boundary

The repository defaults to mock mode, but the live gateway is fully wired and
used by the production demo. It uses server-side environment variables,
structured response contracts, bounded step keys, and typed text streaming.
To enable it in another deployment, intentionally set `AI_MODE=live` and
provide `OPENAI_API_KEY`; never expose the key through a `NEXT_PUBLIC_`
variable. Mock mode does not read or require the key.

## Documentation

- [Architecture](docs/architecture.md)
- [State machine and recovery](docs/state-machine.md)
- [HTTP and streaming API](docs/api.md)
- [Acceptance coverage](docs/acceptance.md)
- [Deployment runbook](docs/deployment.md)
- [Architecture decision record](docs/decisions/0001-bounded-durable-workflow.md)

## MVP scope

This repository intentionally uses a single seeded demo workspace/project and
does not include authentication, billing, arbitrary tool execution, or
background queue workers. Those are production-hardening extensions, not
hidden prerequisites for the mock-first acceptance path.
