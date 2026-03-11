import { execSync, spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createInterface } from 'readline'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { homedir, platform } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ANSI colors
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const ok = (msg: string) => console.log(`${GREEN}✓${RESET} ${msg}`)
const warn = (msg: string) => console.log(`${YELLOW}⚠${RESET} ${msg}`)
const fail = (msg: string) => console.log(`${RED}✗${RESET} ${msg}`)
const info = (msg: string) => console.log(`${CYAN}→${RESET} ${msg}`)
const heading = (msg: string) => console.log(`\n${BOLD}${msg}${RESET}\n`)

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${CYAN}?${RESET} ${question} `, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function promptSecret(question: string): Promise<string> {
  const answer = await prompt(`${question} ${DIM}(input hidden)${RESET}`)
  return answer
}

function checkCommand(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  console.log(`
${BOLD}╔═══════════════════════════════════════╗
║         ClaudeClaw Setup Wizard       ║
╚═══════════════════════════════════════╝${RESET}
`)

  // --- Check requirements ---
  heading('Checking requirements')

  // Node version
  const nodeVersion = process.version
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10)
  if (major >= 20) {
    ok(`Node.js ${nodeVersion}`)
  } else {
    fail(`Node.js ${nodeVersion} — need 20+`)
    process.exit(1)
  }

  // Claude CLI
  const claudeVersion = checkCommand('claude --version')
  if (claudeVersion) {
    ok(`Claude CLI: ${claudeVersion}`)
  } else {
    fail('Claude CLI not found. Install it: npm install -g @anthropic-ai/claude-code')
    process.exit(1)
  }

  // Build the project
  heading('Building project')
  info('Running npm run build...')
  const buildResult = spawnSync('npm', ['run', 'build'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
  })
  if (buildResult.status === 0) {
    ok('Build successful')
  } else {
    fail('Build failed. Fix TypeScript errors and try again.')
    process.exit(1)
  }

  // --- Collect configuration ---
  heading('Configuration')

  const config: Record<string, string> = {}

  // Telegram bot token
  console.log(`
${DIM}To create a Telegram bot:
1. Open Telegram and search for @BotFather
2. Send /newbot
3. Choose a name and username
4. Copy the token it gives you${RESET}
`)
  config['TELEGRAM_BOT_TOKEN'] = await prompt('Telegram bot token:')
  if (!config['TELEGRAM_BOT_TOKEN']) {
    fail('Bot token is required.')
    process.exit(1)
  }

  // Groq API key
  console.log(`\n${DIM}Get a free Groq API key at: https://console.groq.com${RESET}`)
  const groqKey = await prompt('Groq API key (for voice transcription, press Enter to skip):')
  if (groqKey) config['GROQ_API_KEY'] = groqKey

  // Google API key
  console.log(`\n${DIM}Get a free Google API key at: https://aistudio.google.com${RESET}`)
  const googleKey = await prompt('Google API key (for video analysis, press Enter to skip):')
  if (googleKey) config['GOOGLE_API_KEY'] = googleKey

  // --- Write .env ---
  heading('Writing configuration')

  const envLines = [
    '# ClaudeClaw Configuration',
    `TELEGRAM_BOT_TOKEN=${config['TELEGRAM_BOT_TOKEN']}`,
    'ALLOWED_CHAT_ID=',
    '',
  ]

  if (config['GROQ_API_KEY']) envLines.push(`GROQ_API_KEY=${config['GROQ_API_KEY']}`)
  if (config['GOOGLE_API_KEY']) envLines.push(`GOOGLE_API_KEY=${config['GOOGLE_API_KEY']}`)

  const envPath = join(PROJECT_ROOT, '.env')
  writeFileSync(envPath, envLines.join('\n') + '\n')
  ok(`Wrote ${envPath}`)

  // --- Open CLAUDE.md for editing ---
  heading('Personalize your assistant')
  info('Opening CLAUDE.md in your editor...')
  info('Fill in the [YOUR NAME] and [YOUR ASSISTANT NAME] placeholders.')

  const editor = process.env.EDITOR || process.env.VISUAL || (platform() === 'win32' ? 'notepad' : 'nano')
  const claudeMdPath = join(PROJECT_ROOT, 'CLAUDE.md')

  try {
    spawnSync(editor, [claudeMdPath], { stdio: 'inherit', shell: true })
    ok('CLAUDE.md updated')
  } catch {
    warn(`Could not open editor. Please edit ${claudeMdPath} manually.`)
  }

  // --- Create store directory ---
  mkdirSync(join(PROJECT_ROOT, 'store'), { recursive: true })
  mkdirSync(join(PROJECT_ROOT, 'workspace', 'uploads'), { recursive: true })

  // --- Get chat ID ---
  heading('Getting your chat ID')
  info('Starting bot temporarily to get your chat ID...')
  info('Send /chatid to your bot in Telegram.')

  const waitForChatId = await prompt('Paste your chat ID here (or press Enter to set it later):')

  if (waitForChatId) {
    // Update .env with chat ID
    const envContent = readFileSync(envPath, 'utf-8')
    writeFileSync(envPath, envContent.replace('ALLOWED_CHAT_ID=', `ALLOWED_CHAT_ID=${waitForChatId}`))
    ok(`Chat ID set: ${waitForChatId}`)
  } else {
    warn('Chat ID not set. Send /chatid to your bot and update ALLOWED_CHAT_ID in .env.')
  }

  // --- Install background service ---
  heading('Background service')

  const os = platform()
  if (os === 'darwin') {
    const shouldInstall = await prompt('Install as launchd service? (Y/n):')
    if (shouldInstall.toLowerCase() !== 'n') {
      installLaunchd()
    }
  } else if (os === 'linux') {
    const shouldInstall = await prompt('Install as systemd service? (Y/n):')
    if (shouldInstall.toLowerCase() !== 'n') {
      installSystemd()
    }
  } else {
    console.log(`
${YELLOW}Windows detected.${RESET} To run as a background service:

  1. Install PM2: npm install -g pm2
  2. Start: pm2 start dist/index.js --name claudeclaw
  3. Save: pm2 save
  4. Startup: pm2 startup
`)
  }

  // --- Done ---
  heading('Setup complete!')
  console.log(`
Next steps:
  ${CYAN}1.${RESET} ${waitForChatId ? 'Send a message to your bot!' : 'Run npm run dev, send /chatid to your bot, and update .env'}
  ${CYAN}2.${RESET} Run ${BOLD}npm run status${RESET} to verify everything is configured
  ${CYAN}3.${RESET} Run ${BOLD}npm run dev${RESET} to start in dev mode

You can still ask me anything about how the system works!
`)
}

function installLaunchd(): void {
  const plistName = 'com.claudeclaw.app'
  const plistDir = join(homedir(), 'Library', 'LaunchAgents')
  const plistPath = join(plistDir, `${plistName}.plist`)
  const nodePath = checkCommand('which node') ?? '/usr/local/bin/node'
  const logPath = '/tmp/claudeclaw.log'

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${join(PROJECT_ROOT, 'dist', 'index.js')}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>`

  mkdirSync(plistDir, { recursive: true })
  writeFileSync(plistPath, plist)

  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`, { stdio: 'pipe' })
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' })
    ok(`Installed launchd service: ${plistPath}`)
    info(`Logs: ${logPath}`)
  } catch (err) {
    warn(`Failed to load service. Load manually: launchctl load "${plistPath}"`)
  }
}

function installSystemd(): void {
  const serviceDir = join(homedir(), '.config', 'systemd', 'user')
  const servicePath = join(serviceDir, 'claudeclaw.service')
  const nodePath = checkCommand('which node') ?? '/usr/bin/node'

  const unit = `[Unit]
Description=ClaudeClaw Personal AI Assistant
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${join(PROJECT_ROOT, 'dist', 'index.js')}
WorkingDirectory=${PROJECT_ROOT}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`

  mkdirSync(serviceDir, { recursive: true })
  writeFileSync(servicePath, unit)

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' })
    execSync('systemctl --user enable claudeclaw', { stdio: 'pipe' })
    execSync('systemctl --user start claudeclaw', { stdio: 'pipe' })
    ok(`Installed systemd service: ${servicePath}`)
    info('Check status: systemctl --user status claudeclaw')
  } catch {
    warn(`Failed to start service. Try: systemctl --user start claudeclaw`)
  }
}

main().catch((err) => {
  fail(`Setup failed: ${err}`)
  process.exit(1)
})
