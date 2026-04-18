# Dan The Automator Agent Instructions

Read `CLAUDE.md` first. This repo is a Bun/TypeScript service that receives Sentry webhooks, asks Claude for fixes, opens GitHub PRs, and notifies Slack.

## Commands

```bash
bun install
bun dev
bun test
bun run typecheck
```

## Rules

- Preserve webhook signature verification and Zod validation.
- Do not weaken Sentry/GitHub/Slack auth or token handling.
- Keep fixes minimal and testable; this repo automates production repair flows.
- Do not trigger live PR creation or Slack notification paths unless explicitly asked.

