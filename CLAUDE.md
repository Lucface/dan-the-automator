# Dan the Automator

Self-healing app infrastructure. Receives Sentry webhooks, analyzes with Claude, creates GitHub PRs, notifies via Slack.

## Quick Start

```bash
bun install
bun dev          # Start dev server on :3456
bun test         # Run tests
bun run typecheck # TypeScript check
```

## Architecture

```
Sentry event
    │
    ▼
POST /webhook/sentry
    │
    ├── HMAC-SHA256 signature verification (sentry-hook-signature header)
    ├── Zod schema validation (SentryWebhookPayloadSchema)
    ├── Action filter: only "created" or "triggered" events proceed
    │
    ▼
Slack notification (issue detected)
    │
    ▼
In-memory FixQueue
    │
    ├── Job created with status: pending
    ├── processNext() fires immediately (fire-and-forget)
    ├── Status transitions: pending → processing → fixed → pr_created → deployed
    │
    ▼
Claude Agent (fixer.ts)
    │
    ├── Builds prompt from issue title + Seer analysis + file/line info
    ├── Sends to claude-sonnet-4-20250514 with strict JSON output format
    ├── Parses response into AgentFixResult: { file, oldCode, newCode, explanation }
    │
    ▼
GitHub PR (pr.ts via Octokit)
    │
    ├── Creates branch: fix/dan-{issueId} from default branch
    ├── Gets current file content, applies string replacement (oldCode → newCode)
    ├── Commits fix, opens PR against default branch
    │
    ▼
Slack notification (PR created)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Hono server entry point. Mounts routes: `/health`, `/webhook/*`, `/trigger`, `/jobs`, `/jobs/:id`. Exports Bun-compatible `{ port, fetch }` default. Port from `PORT` env or 3456. |
| `src/webhooks/sentry.ts` | Two POST handlers. `/sentry` verifies HMAC-SHA256 signature via Web Crypto API, validates with Zod, filters to `created`/`triggered` actions, notifies Slack, enqueues job. `/trigger` is a manual endpoint that accepts `{ issueId, title, seerAnalysis?, file?, line? }` for testing without Sentry. |
| `src/queue/fix-queue.ts` | Singleton `FixQueue` class. In-memory `Map<string, FixJob>`. Jobs get IDs like `job_{timestamp}_{random}`. Supports `onProcess()` callbacks (not yet wired in MVP). `processNext()` is fire-and-forget on enqueue. State machine: pending → processing → fixed → pr_created → deployed → feedback, or → failed at any point. |
| `src/agent/fixer.ts` | `analyzeAndFix()` function. Creates Anthropic client, sends structured prompt with system rules (minimal fix, preserve style, strict JSON output). Parses response with manual shape validation (not Zod -- uses a local `AgentFixResultSchema.parse()`). Returns `{ file, oldCode, newCode, explanation }`. |
| `src/github/pr.ts` | Three exported functions: `createFixBranch()` creates `fix/dan-{issueId}` from default branch HEAD. `commitFix()` fetches current file via GitHub API, does string replacement, commits via `createOrUpdateFileContents`. `openPR()` opens PR against default branch. All use Octokit with `GITHUB_TOKEN`. |
| `src/notify/slack.ts` | Four notification functions: `notifyIssueDetected`, `notifyFixInProgress`, `notifyPRCreated`, `notifyDeployed`. Uses Slack incoming webhook (not Bot API). Block Kit formatting with headers, sections, context. Silently skips if `SLACK_WEBHOOK_URL` not set. |
| `src/types.ts` | All Zod schemas and TypeScript types. `SentryWebhookPayloadSchema` (action + data.issue), `ManualTriggerSchema`, `JobStatus` const object, `FixJob` interface, `AgentFixResult` interface, `PRResult` interface. |
| `tests/webhook.test.ts` | Bun test suite. 12 tests across 4 describe blocks: Health Check, Sentry Webhook (signature verify/reject, JSON validation, schema validation, action filtering), Manual Trigger (full/minimal/invalid payloads, root path), Queue State Transitions (status machine, failure, lookup by issue ID, filtering, stats). |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check -- returns `{ status, service, version, uptime, queue }` with queue stats |
| POST | `/webhook/sentry` | Sentry issue webhook. Requires `sentry-hook-signature` header. Body validated against `SentryWebhookPayloadSchema`. Only processes `created`/`triggered` actions. |
| POST | `/webhook/trigger` | Manual trigger (also mounted at `/trigger`). Body: `{ issueId, title, seerAnalysis?, file?, line? }`. No signature required. |
| POST | `/trigger` | Alias -- forwards internally to `/webhook/trigger` |
| GET | `/jobs` | List all jobs. Optional `?status=pending\|processing\|fixed\|pr_created\|deployed\|feedback\|failed` filter. |
| GET | `/jobs/:id` | Get single job by ID. Returns 404 if not found. |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_WEBHOOK_SECRET` | No* | HMAC-SHA256 secret for Sentry webhook signature verification. If unset, signature verification is skipped with a console warning. |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude. Throws if missing when `analyzeAndFix()` is called. |
| `GITHUB_TOKEN` | Yes | GitHub personal access token with repo permissions. Throws if missing when PR functions are called. |
| `GITHUB_OWNER` | Yes | GitHub repository owner (e.g., `Lucface`). |
| `GITHUB_REPO` | Yes | GitHub repository name (e.g., `twentyfive`). |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook URL. If unset, notifications are silently skipped. |
| `PORT` | No | Server port. Defaults to `3456`. |

\* `SENTRY_WEBHOOK_SECRET` should be set in production. Without it, anyone can POST to the webhook.

## Data Flow

How a Sentry issue becomes a pull request:

1. **Sentry fires webhook** to `POST /webhook/sentry` with JSON payload and HMAC signature
2. **Signature check** -- `verifySentrySignature()` uses Web Crypto API HMAC-SHA256
3. **Zod validation** -- payload parsed against `SentryWebhookPayloadSchema`
4. **Action filter** -- only `"created"` and `"triggered"` proceed; everything else returns `{ status: "ignored" }`
5. **Slack notification** -- `notifyIssueDetected()` sends Block Kit message
6. **Queue enqueue** -- `fixQueue.enqueue()` creates `FixJob` with `pending` status, generates unique ID
7. **Process fires** -- `processNext()` called immediately (fire-and-forget), transitions to `processing`
8. **Agent analysis** -- registered `onProcess` callbacks run (in MVP, pipeline is not yet wired end-to-end)
9. **Claude call** -- `analyzeAndFix()` sends issue details to Claude, gets back `{ file, oldCode, newCode, explanation }`
10. **Branch creation** -- `createFixBranch()` creates `fix/dan-{issueId}` from default branch
11. **Commit fix** -- `commitFix()` fetches file content via GitHub API, applies `oldCode → newCode` replacement, commits
12. **Open PR** -- `openPR()` creates pull request against default branch
13. **Slack notification** -- `notifyPRCreated()` sends PR link to Slack channel

## Testing

### What Exists

Single test file: `tests/webhook.test.ts` with 12 tests using `bun:test`.

**Test coverage:**
- Health check endpoint
- Sentry webhook: valid signature, invalid signature, missing signature, invalid JSON, missing fields, ignored actions
- Manual trigger: full payload, minimal payload, invalid payload, root `/trigger` path
- Queue: state transitions, failure state, lookup by issue ID, status filtering, stats

### Running Tests

```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
bun test tests/webhook.test.ts  # Specific file
```

### What Is NOT Tested

- `src/agent/fixer.ts` (calls real Claude API -- needs mocking)
- `src/github/pr.ts` (calls real GitHub API -- needs mocking)
- `src/notify/slack.ts` (calls real Slack webhook -- needs mocking)
- End-to-end pipeline (queue → agent → GitHub → Slack)

## Common Workflows

### Test the webhook manually (no Sentry needed)

```bash
# Start the server
bun dev

# Send a manual trigger
curl -X POST http://localhost:3456/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "issueId": "test-001",
    "title": "TypeError: Cannot read property save of undefined",
    "seerAnalysis": "Missing null check on user object before calling .save()",
    "file": "src/components/Dashboard.tsx",
    "line": 42
  }'

# Check job status
curl http://localhost:3456/jobs
curl http://localhost:3456/jobs/job_<id>
curl "http://localhost:3456/jobs?status=pending"

# Check health
curl http://localhost:3456/health
```

### Test with a real Sentry payload

```bash
# You need the webhook secret to sign the payload
export SENTRY_WEBHOOK_SECRET=your-secret

# Use the test helper from tests/webhook.test.ts as reference for signing
# Or temporarily unset SENTRY_WEBHOOK_SECRET to skip verification (dev only)
```

### Add a new notification type

1. Add function to `src/notify/slack.ts` following the pattern of existing functions
2. Use Block Kit formatting (header, section, context blocks)
3. Call `sendSlackMessage()` -- it handles the missing webhook URL gracefully
4. Add the notification type to `SlackNotificationType` in `src/types.ts`

### Add a new integration

1. Create a new directory under `src/` (e.g., `src/jira/`)
2. Add types/schemas to `src/types.ts`
3. Wire into the queue via `fixQueue.onProcess()` callback
4. Add tests

## Known Quirks / Gotchas

- **Queue is in-memory.** All jobs are lost on server restart. This is intentional for Phase 1 MVP.
- **Pipeline is not fully wired.** The `onProcess()` callback system exists but the agent → GitHub → Slack pipeline is not connected end-to-end in the main server. Each component works individually.
- **Agent response parsing is manual.** `fixer.ts` uses a hand-rolled JSON validator instead of Zod (unlike the rest of the codebase). The `AgentFixResultSchema` in that file is NOT the Zod kind.
- **`commitFix()` uses string replacement.** If `oldCode` appears multiple times in the file, only the first occurrence is replaced (`String.replace()` behavior). If `oldCode` is not found at all, it throws.
- **Signature verification is optional in dev.** If `SENTRY_WEBHOOK_SECRET` is not set, all webhooks are accepted with a console warning. Never run production without it.
- **Root `/trigger` uses internal request forwarding.** It constructs a new `Request` object and calls `app.fetch()` internally to route to `/webhook/trigger`.
- **Claude model is pinned.** The agent uses `claude-sonnet-4-20250514` (hardcoded in `fixer.ts`).
- **README mentions Redis/PostgreSQL/Bull.** These are aspirational (Phase 2). The current implementation uses neither -- everything is in-memory.

## Rules

- Runtime: Bun (never npm/yarn/pnpm)
- No `any` types -- strict TypeScript with `noUncheckedIndexedAccess`
- Zod for all external input validation
- Console.log is intentional for MVP logging (structured logger planned for Phase 2)
- All env var access uses bracket notation: `process.env["KEY"]` (required by `noUncheckedIndexedAccess`)
- Minimal fixes only -- the agent is instructed to make the smallest possible change
