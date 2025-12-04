# Content Collector

**The universal capture net for your digital brain** - Drop anything from anywhere and let AI sort it out.

## Vision

```
Any thought, any device, any moment → Capture instantly → AI sorts it → Right project, right place
         ↓                                    ↓                 ↓
   "This is perfect for..."           Zero friction       Junk drawer to gold mine
```

## The Problem This Solves

You're scrolling, reading, thinking, and suddenly: "Oh, this would be perfect for [project]!"

But then:
- You have to switch apps
- Find the right folder
- Decide how to categorize it
- Write proper notes
- ...and by then, the moment is gone

**Content Collector eliminates all friction.** Just capture it. AI handles the rest.

## How It Works

### 1. Capture (Multiple Input Methods)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPTURE METHODS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📱 iOS Shortcut     → Share anything → One tap → Done          │
│  🍎 Mac Hotkey       → ⌘⇧C → Paste/type → Done                  │
│  🖥️  Windows Hotkey   → Ctrl+Shift+C → Paste/type → Done         │
│  📧 Email            → Send to drop@dan.automator → Done         │
│  🌐 API              → POST /capture → Done                      │
│  💬 Slack            → /capture [content] → Done                 │
│  📋 Browser Ext      → Right-click → Capture → Done              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Process (AI Does The Work)

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI PROCESSOR                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📥 Content arrives                                              │
│      ↓                                                           │
│  🔍 AI analyzes:                                                 │
│      • What type is it? (link, image, text, video, file)        │
│      • What is it about?                                        │
│      • Did user provide hints? ("for YouTube", "25 app idea")   │
│      • Which projects match?                                    │
│      • What tags apply?                                         │
│      ↓                                                           │
│  📂 Route to destination:                                        │
│      • Specific project folder                                  │
│      • Existing category                                        │
│      • NEW category (created automatically)                     │
│      • Junk drawer (for later sorting)                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Store & Organize

```
┌─────────────────────────────────────────────────────────────────┐
│                     STORAGE STRUCTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📁 content/                                                     │
│     ├── 📁 projects/                                             │
│     │   ├── twentyfive/          # 25 CRM app ideas             │
│     │   ├── youtube-channel/     # Video content ideas          │
│     │   ├── dan-automator/       # This project                 │
│     │   └── [auto-created]/      # AI creates as needed         │
│     │                                                            │
│     ├── 📁 categories/                                           │
│     │   ├── code-snippets/                                      │
│     │   ├── design-inspiration/                                 │
│     │   ├── tools-resources/                                    │
│     │   ├── articles-reading/                                   │
│     │   ├── business-ideas/                                     │
│     │   └── [auto-created]/                                     │
│     │                                                            │
│     ├── 📁 junk-drawer/          # Uncategorized (sorted later) │
│     │   ├── 2024-12/                                            │
│     │   └── needs-review/                                       │
│     │                                                            │
│     └── 📁 archive/              # Processed & completed        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Periodic Tidying (AI Housekeeping)

```
Daily:   Review junk drawer, attempt categorization
Weekly:  Merge similar categories, suggest consolidations
Monthly: Archive stale content, generate insights report
```

## Capture Formats

### Quick Capture (Zero Friction)
Just send the content. No context needed. AI figures it out.

```
# Just a URL
https://example.com/cool-article

# Just an image (as attachment)
[image.png]

# Just a thought
"What if we had a button that automatically generates reports?"
```

### Guided Capture (Optional Context)
Add hints to help AI route faster.

```
# With project hint
https://stripe.com/docs/api | for:25app

# With category hint
This design is gorgeous | cat:design-inspiration

# With tags
Efficiency hack for code reviews | tags:productivity,coding

# With urgency
BUG: Login not working on Safari | urgent
```

### Structured Capture (Full Control)
When you know exactly where it goes.

```json
{
  "content": "https://example.com/article",
  "project": "twentyfive",
  "category": "features",
  "tags": ["auth", "security"],
  "notes": "Implement this approach for 2FA",
  "priority": "high"
}
```

## API Reference

### POST /api/capture

Main capture endpoint. Accepts anything.

```bash
# Simple capture
curl -X POST https://dan.automator/api/capture \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "content=https://example.com/cool-thing"

# With context
curl -X POST https://dan.automator/api/capture \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "https://example.com/cool-thing",
    "context": "This would be perfect for the 25 app dashboard",
    "source": "mac-hotkey"
  }'
```

### GET /api/inbox

View unprocessed captures.

### GET /api/content/:id

Get specific content item.

### POST /api/content/:id/categorize

Manually categorize an item.

### GET /api/categories

List all categories (including auto-created).

### GET /api/projects

List all projects content can route to.

### POST /api/tidy

Trigger AI tidying job.

## Client Setup

### iOS Shortcut

1. Download shortcut: [Content Capture.shortcut](./shortcuts/ios/)
2. Add to Share Sheet
3. Configure API key in shortcut settings
4. Share anything → Content Capture → Done

Features:
- Works from any app's share sheet
- Voice capture via Siri: "Hey Siri, capture this"
- Action button trigger (iPhone 15 Pro+)
- Back tap trigger (Accessibility settings)

### Mac Quick Capture

```bash
# Install
./scripts/install-mac.sh

# Default hotkey: ⌘⇧C
# Opens floating capture window
```

Features:
- Global hotkey (customizable)
- Menu bar icon
- Clipboard auto-capture
- Screenshot integration

### Windows Quick Capture

```powershell
# Install
.\scripts\install-windows.ps1

# Default hotkey: Ctrl+Shift+C
```

### Browser Extension

Coming soon - Chrome/Firefox/Safari extension for:
- Right-click → Capture
- Highlight text → Capture
- Save page → Capture

### Email Capture

Forward or send directly to:
```
drop@dan.automator
```

Subject line can include routing hints:
```
Subject: for:25app | Dashboard redesign idea
```

## Configuration

### config/projects.yaml

Define your projects for routing:

```yaml
projects:
  twentyfive:
    name: "TwentyFive CRM"
    description: "CRM app with AI features"
    keywords: ["crm", "25", "customer", "sales", "dashboard"]
    intake_path: "./content/projects/twentyfive"

  youtube:
    name: "YouTube Channel"
    description: "Video content and ideas"
    keywords: ["video", "youtube", "content", "tutorial"]
    intake_path: "./content/projects/youtube-channel"

  dan-automator:
    name: "Dan the Automator"
    description: "This automation system"
    keywords: ["automation", "agent", "ai", "fix", "bot"]
    intake_path: "./content/projects/dan-automator"
```

### config/categories.yaml

Define categories (AI can also create new ones):

```yaml
categories:
  code-snippets:
    name: "Code Snippets"
    description: "Useful code patterns and snippets"
    auto_detect: ["code", "function", "snippet", "```"]

  design-inspiration:
    name: "Design Inspiration"
    description: "UI/UX ideas and visual inspiration"
    auto_detect: ["design", "ui", "ux", "dribbble", "figma"]

  tools-resources:
    name: "Tools & Resources"
    description: "Useful tools, libraries, services"
    auto_detect: ["tool", "library", "api", "service"]

  # AI can create new categories when it detects patterns
  auto_create: true
  auto_create_threshold: 3  # Create after 3 similar items
```

### config/settings.yaml

Global settings:

```yaml
capture:
  # Default behavior when no context provided
  default_destination: "junk-drawer"

  # Ask questions or just accept everything
  ask_questions: false  # When false, just accept and sort later

  # Confidence threshold for auto-categorization
  auto_categorize_threshold: 0.7

processing:
  # How often to run tidying jobs
  tidy_schedule: "0 3 * * *"  # Daily at 3 AM

  # AI model for processing
  model: "claude-sonnet-4-20250514"

storage:
  # Where content lives
  base_path: "./content"

  # File format for content items
  format: "markdown"  # or "json"

  # Include AI analysis in stored files
  include_analysis: true

notifications:
  # Notify on successful capture
  notify_on_capture: false

  # Weekly digest of captured content
  weekly_digest: true
  digest_day: "sunday"
```

## Data Model

### ContentItem

```typescript
interface ContentItem {
  id: string;                    // UUID
  created_at: Date;
  updated_at: Date;

  // Source info
  source: 'api' | 'email' | 'shortcut' | 'slack' | 'browser';
  source_device?: string;        // "iPhone", "MacBook", etc.

  // Content
  content_type: 'link' | 'text' | 'image' | 'video' | 'file' | 'mixed';
  raw_content: string;           // Original content as received
  parsed_content: {              // Extracted/parsed data
    url?: string;
    title?: string;
    description?: string;
    image_url?: string;
    text?: string;
    file_path?: string;
  };

  // User context (what they said about it)
  user_context?: string;

  // AI analysis
  ai_analysis: {
    summary: string;
    detected_type: string;
    suggested_project?: string;
    suggested_category?: string;
    suggested_tags: string[];
    confidence: number;          // 0-1
    reasoning: string;
  };

  // Classification
  project_id?: string;
  category_id?: string;
  tags: string[];

  // Status
  status: 'inbox' | 'processing' | 'categorized' | 'routed' | 'archived';

  // File reference (if stored as file)
  file_path?: string;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONTENT COLLECTOR                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        INPUT LAYER                                  │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │ │
│  │  │   API   │ │  Email  │ │   iOS   │ │   Mac   │ │ Browser │      │ │
│  │  │ Server  │ │ Ingress │ │Shortcut │ │ Hotkey  │ │  Ext    │      │ │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │ │
│  │       └───────────┴───────────┴───────────┴───────────┘            │ │
│  └────────────────────────────────────┬───────────────────────────────┘ │
│                                       ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      CAPTURE SERVICE                                │ │
│  │  • Normalize input format                                          │ │
│  │  • Extract metadata                                                │ │
│  │  • Store raw content                                               │ │
│  │  • Queue for processing                                            │ │
│  └────────────────────────────────────┬───────────────────────────────┘ │
│                                       ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      AI PROCESSOR                                   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │   Analyzer   │  │  Classifier  │  │   Router     │             │ │
│  │  │ (understand) │─▶│ (categorize) │─▶│  (place it)  │             │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │ │
│  └────────────────────────────────────┬───────────────────────────────┘ │
│                                       ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      STORAGE LAYER                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │   Database   │  │    Files     │  │   Projects   │             │ │
│  │  │ (PostgreSQL) │  │ (Markdown)   │  │  (MD files)  │             │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Environment Variables

```bash
# API
PORT=3001
API_SECRET=your-secret-for-clients

# AI Processing
ANTHROPIC_API_KEY=sk-ant-...

# Email Ingestion
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_USER=lucface@gmail.com
EMAIL_IMAP_PASSWORD=app-specific-password
EMAIL_CHECK_INTERVAL=60  # seconds

# Storage
STORAGE_PATH=./content
DATABASE_URL=postgresql://...

# Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Quick Start

```bash
# Clone and setup
cd dan-the-automator/apps/content-collector
npm install

# Configure
cp .env.example .env
# Edit .env with your keys

# Initialize storage
npm run init

# Start server
npm run dev

# Test capture
curl -X POST http://localhost:3001/api/capture \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -d "content=Test capture from terminal"
```

## License

MIT - Part of Dan the Automator
