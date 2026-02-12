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
Sentry webhook → Signature verify → Zod validate → In-memory queue → Claude agent → GitHub PR → Slack notify
```

## Key Files

- `src/index.ts` - Hono server entry point (port 3456)
- `src/webhooks/sentry.ts` - Sentry webhook handler + manual trigger
- `src/queue/fix-queue.ts` - In-memory job queue with state machine
- `src/agent/fixer.ts` - Claude API integration for fix analysis
- `src/github/pr.ts` - Octokit: branch, commit, PR creation
- `src/notify/slack.ts` - Slack incoming webhook notifications
- `src/types.ts` - Zod schemas and TypeScript types

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + queue stats |
| POST | `/webhook/sentry` | Sentry issue webhook (signature verified) |
| POST | `/trigger` | Manual trigger for testing |
| GET | `/jobs` | List all jobs (optional `?status=` filter) |
| GET | `/jobs/:id` | Get job by ID |

## Environment Variables

See `.env.example` for all required variables.

## Rules

- Runtime: Bun (never npm/yarn)
- No `any` types - strict TypeScript
- Zod for all input validation
- Console.log is intentional for MVP logging (structured logger in Phase 2)
