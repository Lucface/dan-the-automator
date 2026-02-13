# Setup Guide

Complete setup instructions for running Dan the Automator locally.

## Prerequisites

### Bun

Dan the Automator runs on Bun. Install it if you do not have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify installation:

```bash
bun --version
```

### Accounts and Tokens

You will need credentials from the following services:

| Service | What You Need | Where to Get It |
|---------|---------------|-----------------|
| **Anthropic** | API key (`sk-ant-...`) | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **GitHub** | Personal access token (`ghp_...`) | [github.com/settings/tokens](https://github.com/settings/tokens) -- needs `repo` scope |
| **Sentry** | Webhook signing secret | Project Settings > Integrations > Internal Integrations > Webhooks |
| **Slack** | Incoming webhook URL | [api.slack.com/apps](https://api.slack.com/apps) > Your App > Incoming Webhooks |

Not all of these are required for basic local development. See the Environment Variables section below for what is optional.

## Environment Setup

### 1. Clone and Install

```bash
git clone https://github.com/Lucface/dan-the-automator.git
cd dan-the-automator
bun install
```

### 2. Create Environment File

```bash
cp .env.example .env
```

### 3. Configure Environment Variables

Edit `.env` with your credentials:

```bash
# ── Sentry ────────────────────────────────────────────────────────
# HMAC-SHA256 secret for verifying webhook signatures.
# Found in: Sentry > Project Settings > Integrations > Internal Integration > Webhook Secret
# If not set: signature verification is SKIPPED (all webhooks accepted). Fine for local dev,
# must be set in production.
SENTRY_WEBHOOK_SECRET=your-sentry-webhook-secret

# ── Anthropic (Claude) ───────────────────────────────────────────
# API key for the Claude AI agent that analyzes issues and suggests fixes.
# Found in: console.anthropic.com > Settings > API Keys
# If not set: throws an error when the agent is invoked. Not needed for testing webhooks/queue.
ANTHROPIC_API_KEY=sk-ant-your-key-here

# ── GitHub ────────────────────────────────────────────────────────
# Personal access token with `repo` scope for creating branches, commits, and PRs.
# Found in: github.com > Settings > Developer settings > Personal access tokens
# If not set: throws an error when GitHub operations are invoked.
GITHUB_TOKEN=ghp_your-token-here

# Owner of the target repository (your GitHub username or org).
GITHUB_OWNER=Lucface

# Repository name where fixes will be committed.
GITHUB_REPO=twentyfive

# ── Slack ─────────────────────────────────────────────────────────
# Incoming webhook URL for sending notifications.
# Found in: api.slack.com > Your App > Incoming Webhooks > Add New Webhook to Workspace
# If not set: all Slack notifications are silently skipped. Fine for local dev.
SLACK_WEBHOOK_URL=your-slack-webhook-url

# ── Server ────────────────────────────────────────────────────────
# Port for the Hono HTTP server.
# If not set: defaults to 3456.
PORT=3456
```

### Minimum Viable Config for Local Development

To test just the webhook and queue (no external API calls):

```bash
# .env -- minimal for local dev
PORT=3456
# Leave everything else unset/commented out
```

This gives you:
- Working webhook endpoint (no signature verification)
- Working manual trigger
- Working in-memory queue
- Slack notifications silently skipped
- Agent and GitHub operations will throw if triggered (but queue itself works)

## Local Development

### Start the Server

```bash
bun dev
```

This runs `bun run --watch src/index.ts`, which starts the server with hot reload on file changes.

You should see:

```
[Dan] Starting server on port 3456
[Dan] Health check: http://localhost:3456/health
[Dan] Sentry webhook: POST http://localhost:3456/webhook/sentry
[Dan] Manual trigger: POST http://localhost:3456/trigger
```

### Run Tests

```bash
bun test
```

Tests do not require any environment variables. The test suite:
- Sets `SENTRY_WEBHOOK_SECRET` to a test value for signature tests
- Clears `SLACK_WEBHOOK_URL` to prevent real Slack calls
- Clears the queue between tests
- Does not test against real external APIs

### Type Check

```bash
bun run typecheck
```

Runs `bunx tsc --noEmit` with strict settings including `noUncheckedIndexedAccess`.

## Testing the Webhook Locally

### Option 1: Manual Trigger (No Sentry Needed)

The simplest way to test. The `/trigger` endpoint accepts issue details directly:

```bash
curl -X POST http://localhost:3456/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "issueId": "test-001",
    "title": "TypeError: Cannot read property save of undefined",
    "seerAnalysis": "Missing null check on user object before calling .save()",
    "file": "src/components/Dashboard.tsx",
    "line": 42
  }'
```

Expected response:

```json
{
  "status": "queued",
  "jobId": "job_1707123456789_abc123",
  "issueId": "test-001"
}
```

### Option 2: Simulated Sentry Webhook (With Signature)

To test the full signature verification path:

1. Set a test secret in `.env`:
   ```
   SENTRY_WEBHOOK_SECRET=my-test-secret
   ```

2. Generate a signed payload. You can use this Node/Bun script:

   ```typescript
   // sign-test.ts -- run with: bun sign-test.ts
   const secret = "my-test-secret";
   const payload = JSON.stringify({
     action: "created",
     data: {
       issue: {
         id: "test-002",
         title: "ReferenceError: user is not defined",
         metadata: {
           type: "ReferenceError",
           value: "Variable user referenced before assignment",
           filename: "src/api/handler.ts",
         },
       },
     },
   });

   const encoder = new TextEncoder();
   const key = await crypto.subtle.importKey(
     "raw",
     encoder.encode(secret),
     { name: "HMAC", hash: "SHA-256" },
     false,
     ["sign"]
   );
   const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
   const signature = Array.from(new Uint8Array(signed))
     .map((b) => b.toString(16).padStart(2, "0"))
     .join("");

   console.log("Signature:", signature);
   console.log("Payload:", payload);
   console.log("\nCurl command:");
   console.log(`curl -X POST http://localhost:3456/webhook/sentry \\
     -H "Content-Type: application/json" \\
     -H "sentry-hook-signature: ${signature}" \\
     -d '${payload}'`);
   ```

3. Run the script and use the generated curl command.

### Option 3: Tunnel for Real Sentry Webhooks

To receive real webhooks from Sentry, you need a public URL pointing to your local server.

**Using cloudflared:**

```bash
# Install
brew install cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3456
```

**Using ngrok:**

```bash
# Install
brew install ngrok

# Start tunnel
ngrok http 3456
```

Either tool will give you a public URL like `https://abc123.trycloudflare.com` or `https://abc123.ngrok-free.app`.

**Configure Sentry:**
1. Go to Sentry > Settings > Integrations > Internal Integrations
2. Create or edit an integration
3. Set the webhook URL to `https://your-tunnel-url/webhook/sentry`
4. Enable "Issue" webhooks (issue.created)
5. Copy the webhook signing secret to your `.env` as `SENTRY_WEBHOOK_SECRET`
6. Restart the server

## Verifying Everything Works

### Step 1: Health Check

```bash
curl http://localhost:3456/health
```

Expected:

```json
{
  "status": "ok",
  "service": "dan-the-automator",
  "version": "0.1.0",
  "uptime": 5.123,
  "queue": {}
}
```

### Step 2: Manual Trigger

```bash
curl -X POST http://localhost:3456/trigger \
  -H "Content-Type: application/json" \
  -d '{"issueId": "verify-001", "title": "Test issue"}'
```

Expected: `{"status": "queued", "jobId": "...", "issueId": "verify-001"}`

### Step 3: Check Job Was Created

```bash
curl http://localhost:3456/jobs
```

Expected: JSON with a `jobs` array containing your job.

### Step 4: Check Queue Stats

```bash
curl http://localhost:3456/health | jq .queue
```

Should show job counts by status.

### Step 5: Verify Slack (If Configured)

If `SLACK_WEBHOOK_URL` is set, check your Slack channel for a "New Issue Detected" message after triggering.

### Step 6: Run the Test Suite

```bash
bun test
```

All 12 tests should pass:
- 1 health check test
- 5 Sentry webhook tests
- 4 manual trigger tests
- 2 queue state transition tests (5 assertions across describe blocks)

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `bun: command not found` | Bun not installed or not in PATH | Run the install script, then open a new terminal |
| Server starts but webhook returns 401 | `SENTRY_WEBHOOK_SECRET` is set but signature does not match | Verify the secret matches what Sentry sends, or unset it for local dev |
| Slack notifications not appearing | `SLACK_WEBHOOK_URL` not set or invalid | Check the URL, test it directly with `curl -X POST -H "Content-Type: application/json" -d '{"text":"test"}' YOUR_URL` |
| `ANTHROPIC_API_KEY is not set` | Missing env var | Add the key to `.env`. Only needed if the agent processing pipeline is triggered. |
| Port already in use | Another process on 3456 | Either kill the other process (`lsof -i :3456`) or change `PORT` in `.env` |
| Tests fail with signature errors | `SENTRY_WEBHOOK_SECRET` set in shell env | Tests set their own value; unset it from your shell or the tests will use the test value anyway |
