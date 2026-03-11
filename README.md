# ClaudeClaw

Personal AI assistant accessible via Telegram, powered by the Claude Agent SDK. Runs as a persistent service on your machine with a web dashboard for management.

## Features

- Telegram bot with session persistence and memory
- Web dashboard with 9 tabs: Activity, Agents, Skills, Sessions, Tasks, Memories, Usage, Chat, System
- Web chat interface (talk to your assistant from the browser)
- Usage tracking (tokens, cost, duration per message)
- Task scheduler with cron expressions
- Voice message support (STT via Groq)
- Photo, document, and video handling
- WhatsApp bridge
- Multi-agent support with configurable system prompts and models
- Skills system (extensible via markdown files)

## Prerequisites

- Node.js >= 20
- Claude Code CLI installed and authenticated (`claude` command available)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Installation

```bash
git clone https://github.com/okenwa/claudeclaw.git
cd claudeclaw
npm install
```

## Configuration

Run the setup wizard:

```bash
npm run setup
```

Or manually copy and edit the env file:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `ALLOWED_CHAT_ID` | Your Telegram chat ID (comma-separated for multiple users) |

Optional variables:

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for voice transcription |
| `GOOGLE_API_KEY` | Google API key for video analysis |
| `DASHBOARD_PORT` | Dashboard port (default: 3333) |
| `DASHBOARD_ENABLED` | Enable web dashboard (default: true) |
| `LOG_LEVEL` | Logging level (default: info) |

To get your chat ID, start the bot and send `/chatid`.

## Running

### Development

```bash
npm run dev
```

This starts the Telegram bot, scheduler, and dashboard using `tsx` (no build step needed).

### Production

```bash
npm run build
npm start
```

The build step compiles TypeScript and builds the React dashboard.

### Dashboard

Once running, open http://localhost:3333 in your browser.

## Project structure

```
src/
  index.ts              Entry point
  bot.ts                Telegram bot handlers
  agent.ts              Claude Agent SDK wrapper
  db.ts                 SQLite database (sessions, memories, usage, etc.)
  scheduler.ts          Cron-based task scheduler
  memory.ts             Memory system (semantic + episodic)
  config.ts             Environment config
  voice.ts              Voice transcription (Groq)
  media.ts              Photo/document/video handling
  whatsapp.ts           WhatsApp bridge
  gmail.ts              Gmail integration
  team-router.ts        Multi-bot routing
  dashboard/
    server.ts           Express server + static file serving
    events.ts           SSE event bus
    skills-scanner.ts   Scans ~/.claude/skills/ for skill files
    routes/             API route handlers
dashboard/
  src/                  React + Vite frontend
    tabs/               Tab components (Activity, Agents, Usage, Chat, etc.)
    api.ts              Frontend API client
scripts/
  setup.ts              Interactive setup wizard
  notify.sh             Send notification from scheduled tasks
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in dev mode (tsx) |
| `npm run build` | Compile TS + build dashboard |
| `npm start` | Run compiled output |
| `npm test` | Run tests |
| `npm run typecheck` | Type-check without emitting |
| `npm run setup` | Interactive setup wizard |
| `npm run status` | Print system status |

## Skills

Skills live in `~/.claude/skills/` as markdown files. Each skill is a directory with a `SKILL.md` file containing YAML frontmatter (name, description) and instructions.

Manage skills from the dashboard Skills tab or add them manually:

```bash
mkdir -p ~/.claude/skills/my-skill
# Create ~/.claude/skills/my-skill/SKILL.md with frontmatter
```

## Telegram commands

| Command | Description |
|---------|-------------|
| `/start` | Confirm bot is running |
| `/chatid` | Show your chat ID |
| `/newchat` | Clear session, start fresh |
| `/memory` | Show stored memories |
| `/voice` | Toggle voice reply mode |
| `/schedule` | Manage scheduled tasks |
| `/wa` | WhatsApp bridge commands |

## License

Private.
