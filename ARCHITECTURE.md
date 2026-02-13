# Architecture

Dan the Automator is a self-healing infrastructure service that receives Sentry error events, uses Claude to analyze and suggest fixes, commits those fixes via the GitHub API, and notifies the team through Slack.

## System Overview

```
                          EXTERNAL SERVICES
    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  Sentry  │     │  Claude  │     │  GitHub  │     │  Slack   │
    │  + Seer  │     │   API    │     │   API    │     │ Webhook  │
    └────┬─────┘     └────▲─────┘     └────▲─────┘     └────▲─────┘
         │                │                │                │
    HMAC │           Anthropic        Octokit REST      HTTP POST
    signed│           SDK              (branches,        (Block Kit
    webhook│                           commits, PRs)     messages)
         │                │                │                │
    ─────┼────────────────┼────────────────┼────────────────┼─────────
         │                │                │                │
         │           DAN THE AUTOMATOR (Hono on Bun, port 3456)
         │                │                │                │
         ▼                │                │                │
    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ Webhook  │────▶│  Queue   │────▶│  Agent   │────▶│  GitHub  │
    │ Handler  │     │(In-Mem)  │     │ (Fixer)  │     │   PR     │──┐
    └──────────┘     └──────────┘     └──────────┘     └──────────┘  │
         │                                                            │
         │                                                            ▼
         └──────────────────────────────────────────────────────┌──────────┐
                                                                │  Slack   │
                                                                │ Notifier │
                                                                └──────────┘
```

## Component Breakdown

### 1. Hono Server (`src/index.ts`)

The entry point. A lightweight Hono application running on Bun's built-in HTTP server.

**Responsibilities:**
- Mount all route handlers
- Expose health check with queue statistics
- Provide job inspection endpoints
- Forward root `/trigger` to `/webhook/trigger` via internal request construction

**Exports Bun-native server format:**
```typescript
export default { port, fetch: app.fetch }
```

**Routes mounted:**
- `GET /health` -- inline handler
- `/webhook/*` -- delegated to `sentryWebhook` Hono sub-app
- `POST /trigger` -- forwards to `/webhook/trigger`
- `GET /jobs` -- inline handler, reads from fixQueue
- `GET /jobs/:id` -- inline handler, reads from fixQueue

### 2. Webhook Handler (`src/webhooks/sentry.ts`)

A Hono sub-application with two POST endpoints.

**`POST /sentry` -- Sentry webhook receiver:**

```
Request arrives
    │
    ▼
Read raw body as text
    │
    ▼
Extract sentry-hook-signature header
    │
    ▼
verifySentrySignature()
    ├── No SENTRY_WEBHOOK_SECRET env → skip verification (warn)
    ├── No signature header → reject 401
    ├── HMAC-SHA256 via Web Crypto API:
    │   1. Import secret as CryptoKey
    │   2. Sign body with HMAC
    │   3. Convert to hex string
    │   4. Compare with header value
    └── Mismatch → reject 401
    │
    ▼
JSON.parse(rawBody) → reject 400 if invalid
    │
    ▼
SentryWebhookPayloadSchema.safeParse()
    ├── Failure → 400 with flattened Zod errors
    └── Success → extract action + data.issue
    │
    ▼
Action filter
    ├── "created" or "triggered" → continue
    └── Anything else → 200 { status: "ignored" }
    │
    ▼
notifyIssueDetected() → Slack
    │
    ▼
fixQueue.enqueue() → return { status: "queued", jobId, issueId }
```

**`POST /trigger` -- Manual trigger:**

Simpler path. No signature verification. Validates against `ManualTriggerSchema`. Same Slack notification and queue enqueue.

### 3. Fix Queue (`src/queue/fix-queue.ts`)

Singleton in-memory job queue. Uses a `Map<string, FixJob>` for storage.

**Job ID format:** `job_{Date.now()}_{random6chars}`

**Key methods:**
- `enqueue()` -- creates job, immediately calls `processNext()` (fire-and-forget)
- `updateStatus()` -- transitions job state, updates `updatedAt`
- `setAgentOutput()` -- stores fix result, transitions to `fixed`
- `setPRUrl()` -- stores PR URL, transitions to `pr_created`
- `fail()` -- stores error message, transitions to `failed`
- `onProcess()` -- registers async callbacks for job processing
- `processNext()` -- runs all registered callbacks sequentially
- `stats()` -- counts jobs by status
- `clear()` -- removes all jobs (used in tests)

**Processing model:**
- `processNext()` is called immediately on enqueue (not deferred)
- Callbacks are executed sequentially in registration order
- If any callback throws, the job is marked as `failed` and the error propagates
- No retry mechanism in Phase 1

### 4. AI Agent (`src/agent/fixer.ts`)

Calls the Anthropic API to analyze an issue and suggest a minimal code fix.

**Model:** `claude-sonnet-4-20250514` (hardcoded)

**System prompt instructs Claude to:**
- Fix only the specific described bug
- Make the smallest possible change
- Preserve existing code style
- Output strict JSON: `{ file, oldCode, newCode, explanation }`

**User prompt construction:**
```
## Error: {title}
## Seer Analysis: {seerAnalysis}     (if available)
## File: {file}                       (if available)
## Line: {line}                       (if available)
Please analyze this error and suggest the minimal fix.
```

**Response parsing:**
- Extracts the first `text` content block from Claude's response
- Parses JSON with a manual validator (checks for required string fields)
- Not using Zod for this step (unlike the rest of the codebase)

### 5. GitHub Integration (`src/github/pr.ts`)

Three-step process using Octokit REST client.

**Step 1: `createFixBranch(issueId)`**
- Fetches default branch name from repo metadata
- Gets latest commit SHA from that branch
- Creates `refs/heads/fix/dan-{issueId}`

**Step 2: `commitFix(branch, filePath, oldCode, newCode, commitMessage)`**
- Fetches current file content via GitHub API (`repos.getContent`)
- Validates response is a file (not directory)
- Decodes base64 content
- Applies fix via `String.replace(oldCode, newCode)`
- If replacement produces identical content, throws (oldCode not found)
- Commits updated file via `repos.createOrUpdateFileContents`

**Step 3: `openPR(branch, title, body)`**
- Fetches default branch name (for PR base)
- Creates pull request via `pulls.create`
- Returns `{ url, number, branch }`

**Important:** All GitHub operations happen through the API -- no local git clone. The fix is applied by fetching file content, modifying it in memory, and committing back via the API.

### 6. Slack Notifier (`src/notify/slack.ts`)

Sends notifications via Slack incoming webhook (not Bot API / `chat.postMessage`).

**Four notification functions:**

| Function | When | Message |
|----------|------|---------|
| `notifyIssueDetected()` | Issue received and queued | Header: "New Issue Detected" + issue title + ID |
| `notifyFixInProgress()` | Agent starts working | "Working on fix for {title}" |
| `notifyPRCreated()` | PR opened | Header: "Fix Ready for Review" + PR link |
| `notifyDeployed()` | Fix deployed | Header: "Fix Deployed!" + verification request |

**Error handling:** If `SLACK_WEBHOOK_URL` is not set, all functions return `false` silently. HTTP errors are logged but do not throw.

### 7. Type System (`src/types.ts`)

Centralized type definitions using Zod schemas with inferred TypeScript types.

**Zod schemas (runtime validation):**
- `SentryIssueDataSchema` -- id, title, culprit?, metadata? (type, value, filename, function), permalink?
- `SentryWebhookPayloadSchema` -- action, data.issue, actor? (type, id?, name?)
- `ManualTriggerSchema` -- issueId, title, seerAnalysis?, file?, line?

**TypeScript interfaces:**
- `FixJob` -- full job state including timestamps, agent output, PR URL, error
- `AgentFixResult` -- file, oldCode, newCode, explanation
- `PRResult` -- url, number, branch
- `SlackNotificationType` -- union of notification event strings

**Const object pattern for status:**
```typescript
export const JobStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  // ...
} as const;

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus];
```

## Queue State Machine

```
                 enqueue()
                    │
                    ▼
              ┌──────────┐
              │ PENDING   │
              └─────┬─────┘
                    │  processNext() called immediately
                    ▼
              ┌──────────┐
              │PROCESSING│
              └─────┬─────┘
                    │
           ┌───────┴───────┐
           │               │
     callback succeeds   callback throws
           │               │
           ▼               ▼
     ┌──────────┐    ┌──────────┐
     │  FIXED   │    │  FAILED  │
     └─────┬────┘    └──────────┘
           │
           │  setPRUrl()
           ▼
     ┌──────────┐
     │PR_CREATED│
     └─────┬────┘
           │
           │  updateStatus()
           ▼
     ┌──────────┐
     │ DEPLOYED │
     └─────┬────┘
           │
           │  updateStatus()
           ▼
     ┌──────────┐
     │ FEEDBACK │
     └──────────┘

Note: FAILED can be reached from any state via fail()
```

**Status values:** `pending`, `processing`, `fixed`, `pr_created`, `deployed`, `feedback`, `failed`

## External Integrations

### Sentry

- **Direction:** Sentry pushes to Dan
- **Protocol:** HTTP POST webhook with HMAC-SHA256 signature
- **Header:** `sentry-hook-signature` contains hex-encoded HMAC
- **Events processed:** `issue.created`, `issue.triggered`
- **Events ignored:** `issue.resolved`, `issue.assigned`, and all others
- **Seer analysis:** Extracted from `data.issue.metadata.value` field

### Claude (Anthropic API)

- **Direction:** Dan calls Claude
- **SDK:** `@anthropic-ai/sdk` v0.39.x
- **Model:** `claude-sonnet-4-20250514`
- **Max tokens:** 2048
- **Output format:** Strict JSON (no markdown, no code blocks)
- **Input:** Issue title + optional Seer analysis + optional file/line

### GitHub (Octokit REST)

- **Direction:** Dan calls GitHub
- **SDK:** `@octokit/rest` v21.x
- **Operations:** Create ref (branch), get content, create/update file, create pull request
- **Branch naming:** `fix/dan-{issueId}`
- **Fix mechanism:** File content fetch → in-memory string replacement → commit via API
- **No local clone:** Everything happens through the GitHub REST API

### Slack (Incoming Webhook)

- **Direction:** Dan pushes to Slack
- **Protocol:** HTTP POST to webhook URL
- **Format:** Block Kit (header, section, context blocks) with mrkdwn
- **Fallback:** Plain `text` field for clients that do not support blocks
- **Error handling:** Non-throwing -- logs errors, returns boolean success

## Error Handling Patterns

### Fail-Safe Defaults

| Component | Missing Config | Behavior |
|-----------|---------------|----------|
| Sentry signature | No `SENTRY_WEBHOOK_SECRET` | Skips verification (warns to console) |
| Slack | No `SLACK_WEBHOOK_URL` | Silently skips all notifications |
| Claude | No `ANTHROPIC_API_KEY` | Throws `Error` when called |
| GitHub | No `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` | Throws `Error` when called |

### Error Propagation

- **Webhook layer:** Returns HTTP error codes (400, 401) with JSON error bodies
- **Queue layer:** Catches errors from processing callbacks, marks job as `failed` with error message
- **Agent layer:** Throws on API errors or invalid response shapes
- **GitHub layer:** Throws on API errors or when oldCode is not found in file
- **Slack layer:** Catches all errors internally, returns `false` on failure

### Pattern: Bracket Notation for Env Vars

All environment variable access uses `process.env["KEY"]` instead of `process.env.KEY`. This is enforced by the `noUncheckedIndexedAccess` TypeScript compiler option, which makes indexed access return `T | undefined`.

## Security

### Webhook Signature Verification

The Sentry webhook endpoint implements HMAC-SHA256 signature verification:

1. Raw request body is read as text (before JSON parsing)
2. `sentry-hook-signature` header is extracted
3. The shared secret (`SENTRY_WEBHOOK_SECRET`) is imported as a `CryptoKey` via `crypto.subtle.importKey`
4. Body is signed with `crypto.subtle.sign("HMAC", key, body)`
5. Result is converted to hex string and compared against the header value

**Weakness in current implementation:** The comparison uses `===` (not constant-time comparison). This is acceptable for MVP but should use `crypto.timingSafeEqual()` in production to prevent timing attacks.

### No Authentication on Other Endpoints

- `/trigger` has no authentication (intended for local/dev use)
- `/health` is public
- `/jobs` and `/jobs/:id` are public (expose job state)

In production, these endpoints should be protected or removed.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Bun | latest (types v1.2.x) |
| HTTP Framework | Hono | v4.7.x |
| Validation | Zod | v3.24.x |
| AI | Anthropic SDK | v0.39.x |
| GitHub | Octokit REST | v21.x |
| TypeScript | strict mode | v5.7.x |
| Testing | bun:test | built-in |

### What Is NOT in the Stack (Despite README Mentions)

The README references Redis, Bull, PostgreSQL, and deployment platforms. None of these are currently used. The queue is in-memory, there is no database, and there is no deployment configuration. These are planned for Phase 2+.
