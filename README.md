# Dan the Automator

**Your personal AI automation ecosystem** - A suite of intelligent agents that handle the tedious parts of digital life.

## Apps

### [Content Collector](./apps/content-collector/) - Universal Capture Net
Drop anything from anywhere. AI sorts it out.

```
📱 iPhone → Share → Capture    →  AI categorizes  →  Right project
🍎 Mac    → ⌘⇧C → Capture     →  AI categorizes  →  Right folder
🖥️  Windows → Ctrl+Shift+C    →  AI categorizes  →  Right place
📧 Email  → Forward to inbox  →  AI categorizes  →  Junk drawer → Sorted later
```

### Auto-Fixer (Coming Soon)
**Self-healing application infrastructure** - Automatically detect, diagnose, fix, and deploy bug fixes with minimal human intervention.

## Vision

```
User hits bug → Sentry captures → AI analyzes → Agent fixes → Tests pass → Deploy → User notified
     ↓              ↓                ↓              ↓            ↓          ↓           ↓
   5 sec         instant          30 sec        60 sec       30 sec     30 sec      instant

Total: ~2-3 minutes from bug to fix (vs hours/days traditionally)
```

## The Dream User Journey

1. **User Experience**
   - Sarah clicks "Save" button, nothing happens
   - Floating "Report Issue" button appears
   - She clicks it, types "Save button not working"
   - Gets Slack notification: "Thanks! We're looking into this."

2. **Behind the Scenes**
   - Sentry captures the event + session replay
   - Seer AI analyzes: "onClick handler missing await, Promise rejected silently"
   - Webhook triggers Dan the Automator

3. **Auto-Fix Pipeline**
   - Claude/Cursor agent receives the analysis
   - Reads relevant code files
   - Writes the fix
   - Runs tests locally
   - Creates PR with fix

4. **Deployment**
   - CI runs, tests pass
   - Auto-merge to staging
   - Deploy to production

5. **User Notification**
   - Slack: "Fix deployed! Try the save button again."
   - Sarah tries → Works!
   - Thumbs up/down feedback
   - If thumbs down → Loop back to agent

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DAN THE AUTOMATOR                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐       │
│  │  Sentry  │────▶│  Webhook │────▶│  Queue   │────▶│  Agent   │       │
│  │  + Seer  │     │  Server  │     │ (Redis)  │     │ (Claude) │       │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘       │
│       │                                                   │              │
│       │                                                   ▼              │
│       │           ┌──────────┐     ┌──────────┐     ┌──────────┐       │
│       │           │  Slack   │◀────│  GitHub  │◀────│  Test    │       │
│       └──────────▶│  Notify  │     │  PR/CI   │     │  Runner  │       │
│                   └──────────┘     └──────────┘     └──────────┘       │
│                        │                                                 │
│                        ▼                                                 │
│                   ┌──────────┐                                          │
│                   │  User    │                                          │
│                   │ Feedback │───────────────────────────────────┐      │
│                   └──────────┘                                   │      │
│                                                                  ▼      │
│                                                            [Loop back   │
│                                                             if failed]  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Webhook Server (`/webhook`)
Receives events from Sentry when issues are created/updated.

```typescript
POST /webhook/sentry
{
  event: "issue.created",
  data: {
    issue_id: "...",
    title: "TypeError: Cannot read property...",
    seer_analysis: "Root cause: null check missing...",
    file: "src/components/Dashboard.tsx",
    line: 142
  }
}
```

### 2. Job Queue
Queues fix requests for processing by agents.

### 3. AI Agent
- Receives issue + Seer analysis
- Clones repo / reads files
- Writes fix
- Runs tests
- Creates PR

### 4. GitHub Integration
- Creates branches
- Opens PRs with fix
- Triggers CI
- Auto-merges on success

### 5. Slack Notifier
- Notifies users of issue detection
- Updates on fix progress
- Requests feedback after fix

### 6. Feedback Loop
- Collects thumbs up/down
- Routes negative feedback back to agent
- Tracks success rate

## Tech Stack

- **Runtime:** Node.js / Bun
- **Agent:** Claude API / Anthropic SDK
- **Queue:** Redis + Bull
- **Database:** PostgreSQL (for tracking)
- **Notifications:** Slack API
- **CI/CD:** GitHub Actions
- **Hosting:** Railway / Fly.io

## Getting Started

```bash
# Clone
git clone https://github.com/Lucface/dan-the-automator.git
cd dan-the-automator

# Install
npm install

# Configure
cp .env.example .env
# Add your API keys

# Run
npm run dev
```

## Environment Variables

```bash
# Sentry
SENTRY_WEBHOOK_SECRET=...

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_REPO=Lucface/twentyfive

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...

# Redis
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://...
```

## Roadmap

### Phase 1: Foundation
- [ ] Webhook server to receive Sentry events
- [ ] Basic Slack notifications
- [ ] Manual trigger for testing

### Phase 2: Agent Integration
- [ ] Claude agent reads code + writes fixes
- [ ] Test runner integration
- [ ] PR creation

### Phase 3: Automation
- [ ] Auto-merge on passing tests
- [ ] User notification flow
- [ ] Feedback collection

### Phase 4: Intelligence
- [ ] Learn from feedback
- [ ] Prioritize high-impact fixes
- [ ] Proactive bug detection

## Quick Start: Content Collector

The fastest way to start capturing ideas:

```bash
cd apps/content-collector
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY and DATABASE_URL
npm run dev
```

Then set up capture on your devices:
- **iOS**: See [shortcuts/ios/README.md](./apps/content-collector/shortcuts/ios/README.md)
- **Mac**: Run `./scripts/install-mac.sh`
- **Windows**: Run `.\scripts\install-windows.ps1`

## Related Projects

- [TwentyFive CRM](https://github.com/Lucface/twentyfive) - First app to use Dan the Automator
- [Sentry](https://sentry.io) - Error tracking + Seer AI
- [Claude Code](https://claude.ai) - AI coding agent

## License

MIT
