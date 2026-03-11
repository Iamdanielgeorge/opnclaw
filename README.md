# OpenClaw

Personal AI assistant over Telegram. Supports Claude (via Agent SDK) and OpenAI (Codex 5.4, GPT-4o, etc.) as backends. Runs as a persistent service with a web dashboard.

## What it does

- Telegram bot with session persistence and memory
- Swappable AI backend (Claude Agent SDK or OpenAI chat completions)
- Web dashboard (Activity, Agents, Skills, Sessions, Tasks, Memories, Usage, Chat, System)
- Browser-based chat interface
- Usage tracking (tokens, cost, duration)
- Cron-based task scheduler
- Voice messages (STT via Groq)
- Photo, document, and video handling
- WhatsApp bridge
- Multi-agent support with custom system prompts and models
- Skills system (extensible via markdown files)

## Requirements

- Node.js 20+
- One of the following AI backends:
  - **Claude**: Claude Code CLI installed and authenticated (`claude` command available)
  - **OpenAI**: An OpenAI API key with access to your desired model (e.g. Codex 5.4)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Installation

### 1. Clone and install

```bash
git clone https://github.com/okenwa/openclaw.git
cd openclaw
npm install
```

### 2. Configure

You can use the setup wizard or do it manually.

**Option A: Setup wizard**

```bash
npm run setup
```

The wizard walks you through tokens, API keys, and optionally installs a background service (launchd on macOS, systemd on Linux, PM2 on Windows).

**Option B: Manual**

```bash
cp .env.example .env
```

Open `.env` and fill in your values.

### 3. Environment variables

**Required:**

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) |
| `ALLOWED_CHAT_ID` | Your Telegram chat ID. Comma-separated for multiple users |

**AI Provider (pick one):**

| Variable | Description |
|----------|-------------|
| `AI_PROVIDER` | `claude` (default) or `openai` |

**For Claude (default, no extra config needed beyond having the CLI authenticated):**

The Claude Agent SDK uses your local `claude` CLI authentication. No API key in `.env` required.

**For OpenAI:**

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | -- | Your OpenAI API key (required) |
| `OPENAI_MODEL` | `codex-5.4` | Model to use (e.g. `codex-5.4`, `gpt-4o`, `o3`) |
| `OPENAI_MAX_TOKENS` | `4096` | Max tokens per response |

**Optional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | -- | Groq API key for voice transcription |
| `GOOGLE_API_KEY` | -- | Google API key for video analysis |
| `DASHBOARD_ENABLED` | `true` | Enable web dashboard |
| `DASHBOARD_PORT` | `3333` | Dashboard port |
| `LOG_LEVEL` | `info` | trace, debug, info, warn, error, fatal |

**Example `.env` for OpenAI Codex 5.4:**

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
ALLOWED_CHAT_ID=987654321
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_MODEL=codex-5.4
```

**Example `.env` for Claude (default):**

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
ALLOWED_CHAT_ID=987654321
```

### 4. Get your chat ID

Start the bot, then send `/chatid` to it in Telegram. Paste the number into `ALLOWED_CHAT_ID` in your `.env`.

## Running

### Development

```bash
npm run dev
```

Starts the Telegram bot, scheduler, and dashboard using `tsx`. No build step needed.

### Production

```bash
npm run build
npm start
```

Compiles TypeScript and builds the React dashboard.

### Dashboard

Once running, open http://localhost:3333 in your browser.

## Running as a background service

**macOS (launchd):**

The setup wizard handles this, or manually create a plist in `~/Library/LaunchAgents/`.

**Linux (systemd):**

The setup wizard handles this, or manually create a unit in `~/.config/systemd/user/`.

**Windows (PM2):**

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name openclaw
pm2 save
pm2 startup
```

## Telegram commands

| Command | Description |
|---------|-------------|
| `/start` | Confirm bot is running |
| `/chatid` | Show your chat ID |
| `/newchat` | Clear session, start fresh |
| `/forget` | Same as `/newchat` |
| `/memory` | Show stored memories |
| `/voice` | Toggle voice reply mode |
| `/schedule` | Manage scheduled tasks |
| `/wa` | WhatsApp bridge commands |

### Scheduler commands

```
/schedule list                     -- list all tasks
/schedule create "prompt" "cron"   -- create a scheduled task
/schedule delete <id>              -- delete a task
/schedule pause <id>               -- pause a task
/schedule resume <id>              -- resume a task
```

Cron examples: `0 9 * * *` (daily 9am), `0 9 * * 1` (Monday 9am), `0 */4 * * *` (every 4 hours).

## Project structure

```
src/
  index.ts              Entry point
  bot.ts                Telegram bot handlers
  agent.ts              AI provider (Claude + OpenAI)
  config.ts             Environment config
  db.ts                 SQLite (sessions, memories, usage, etc.)
  scheduler.ts          Cron-based task scheduler
  memory.ts             Memory system (semantic + episodic)
  voice.ts              Voice transcription (Groq)
  media.ts              Photo/document/video handling
  whatsapp.ts           WhatsApp bridge
  gmail.ts              Gmail integration
  team-router.ts        Multi-bot routing
  orchestrator.ts       Bot orchestration
  bot-coordinator.ts    Cross-bot communication
  dashboard/
    server.ts           Express server + static files
    events.ts           SSE event bus
    skills-scanner.ts   Scans ~/.claude/skills/
    routes/             API route handlers
dashboard/
  src/                  React + Vite frontend
scripts/
  setup.ts              Interactive setup wizard
  status.ts             System status check
  notify.sh             Notification helper for scheduled tasks
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

Skills live in `~/.claude/skills/` as markdown files. Each skill is a directory with a `SKILL.md` containing YAML frontmatter (name, description) and instructions.

Add them from the dashboard Skills tab or manually:

```bash
mkdir -p ~/.claude/skills/my-skill
# Create ~/.claude/skills/my-skill/SKILL.md with frontmatter
```

## License

Private.
