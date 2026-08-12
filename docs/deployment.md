# Deployment runbook

## Production prerequisites

- Node.js 20.9+ or the provided Node 22 container
- A reachable MongoDB deployment for durable/serverless operation
- TLS and network access restrictions appropriate to that MongoDB deployment
- `AI_MODE=mock` for the current MVP release

Do not deploy `PERSISTENCE_DRIVER=memory` behind multiple processes or on a
serverless platform. Each process would own a different, restart-sensitive
state store and approval durability would be lost.

## Required environment variables

| Variable             | Production MVP value                                  | Secret |
| -------------------- | ----------------------------------------------------- | ------ |
| `AI_MODE`            | `mock`                                                | No     |
| `PERSISTENCE_DRIVER` | `mongodb`                                             | No     |
| `MONGODB_URI`        | Provider connection string                            | Yes    |
| `MONGODB_DB`         | `agentic_growth_copilot` or environment-specific name | No     |
| `LOG_LEVEL`          | `info`                                                | No     |

`OPENAI_API_KEY` is not required or read in mock mode. Keep it absent for the
mock-first deployment. A later live-mode release must add it as a server-only
secret and intentionally change `AI_MODE` to `live`.

## Vercel

1. Import the repository as a Next.js project.
2. Use pnpm and the checked-in lockfile; the build command is `pnpm build`.
3. Configure the variables above separately for Preview and Production.
4. Ensure MongoDB permits TLS connections from the deployment environment.
5. Deploy and wait for `/api/health` to report `mock` and `mongodb`.
6. Run the smoke sequence below, including an approval pause and resume.

The app does not need a `vercel.json`; framework detection and the standard
Next.js build are sufficient. The standalone output is retained for non-Vercel
container deployments.

## Container

```bash
docker build -t agentic-growth-copilot:mock .
docker run --rm -p 3000:3000 \
  -e AI_MODE=mock \
  -e PERSISTENCE_DRIVER=mongodb \
  -e MONGODB_URI='mongodb://host.docker.internal:27017' \
  -e MONGODB_DB=agentic_growth_copilot \
  agentic-growth-copilot:mock
```

Use a secret manager instead of embedding `MONGODB_URI` in an image, compose
file, shell history, or source control.

## Smoke checks

```bash
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/internal/metrics
```

Then complete one UI happy path:

1. Create a run from `/workspace`.
2. Confirm it pauses and remains paused after refresh.
3. Approve it and confirm completion.
4. Verify the run appears at `/internal/runs`.

## Rollback and recovery

- Roll back the application deployment without dropping MongoDB collections.
- Runs are versioned documents and completed checkpoints are safe to inspect
  after a rollback.
- A failed retryable run can be resumed through the retry endpoint; never edit
  run documents manually as a routine recovery mechanism.
- Exact approval retries are safe with the same decision idempotency key.
- Treat schema-validation failures after a release as a rollback signal and
  preserve the affected run/event records for diagnosis.
