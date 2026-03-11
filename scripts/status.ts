import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'
import { request } from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ANSI
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const ok = (label: string, detail?: string) =>
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`)
const warn = (label: string, detail?: string) =>
  console.log(`  ${YELLOW}⚠${RESET} ${label}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`)
const fail = (label: string, detail?: string) =>
  console.log(`  ${RED}✗${RESET} ${label}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`)

function readEnv(): Record<string, string> {
  const envPath = join(PROJECT_ROOT, '.env')
  if (!existsSync(envPath)) return {}
  const result: Record<string, string> = {}
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[trimmed.slice(0, eq).trim()] = value
  }
  return result
}

function checkCommand(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function testTelegramToken(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    request(`https://api.telegram.org/bot${token}/getMe`, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).ok === true)
        } catch {
          resolve(false)
        }
      })
    }).on('error', () => resolve(false)).end()
  })
}

async function main(): Promise<void> {
  console.log(`\n${BOLD}ClaudeClaw Status${RESET}\n`)
  const env = readEnv()

  // Node version
  const nodeVersion = process.version
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10)
  if (major >= 20) ok('Node.js', nodeVersion)
  else fail('Node.js', `${nodeVersion} — need 20+`)

  // Claude CLI
  const claudeVersion = checkCommand('claude --version')
  if (claudeVersion) ok('Claude CLI', claudeVersion)
  else fail('Claude CLI', 'not found')

  // .env file
  const envPath = join(PROJECT_ROOT, '.env')
  if (existsSync(envPath)) ok('.env file')
  else fail('.env file', 'not found — run npm run setup')

  // Telegram token
  const token = env['TELEGRAM_BOT_TOKEN']
  if (token) {
    const valid = await testTelegramToken(token)
    if (valid) ok('Telegram bot token', 'valid')
    else fail('Telegram bot token', 'invalid — check .env')
  } else {
    fail('Telegram bot token', 'not set')
  }

  // Chat ID
  if (env['ALLOWED_CHAT_ID']) ok('Allowed chat ID', env['ALLOWED_CHAT_ID'])
  else warn('Allowed chat ID', 'not set — bot accepts all chats')

  // Voice STT
  if (env['GROQ_API_KEY']) ok('Groq STT', 'configured')
  else warn('Groq STT', 'not configured')

  // Video
  if (env['GOOGLE_API_KEY']) ok('Google API (video)', 'configured')
  else warn('Google API (video)', 'not configured')

  // Database
  const dbPath = join(PROJECT_ROOT, 'store', 'claudeclaw.db')
  if (existsSync(dbPath)) {
    ok('Database', dbPath)
  } else {
    warn('Database', 'not created yet — will be created on first run')
  }

  // PID / running status
  const pidPath = join(PROJECT_ROOT, 'store', 'claudeclaw.pid')
  if (existsSync(pidPath)) {
    const pid = readFileSync(pidPath, 'utf-8').trim()
    try {
      process.kill(parseInt(pid), 0)
      ok('Process', `running (PID ${pid})`)
    } catch {
      warn('Process', `stale PID file (${pid}) — not running`)
    }
  } else {
    warn('Process', 'not running')
  }

  // Background service
  const os = platform()
  if (os === 'darwin') {
    const plistLoaded = checkCommand('launchctl list com.claudeclaw.app 2>/dev/null')
    if (plistLoaded) ok('launchd service', 'loaded')
    else warn('launchd service', 'not loaded')
  } else if (os === 'linux') {
    const status = checkCommand('systemctl --user is-active claudeclaw 2>/dev/null')
    if (status === 'active') ok('systemd service', 'active')
    else warn('systemd service', status ?? 'not installed')
  } else {
    const pm2Status = checkCommand('pm2 info claudeclaw 2>/dev/null')
    if (pm2Status && pm2Status.includes('online')) ok('PM2 process', 'online')
    else warn('Background service', 'check PM2 or run manually')
  }

  // Build status
  const distIndex = join(PROJECT_ROOT, 'dist', 'index.js')
  if (existsSync(distIndex)) ok('Build', 'dist/index.js exists')
  else warn('Build', 'not built — run npm run build')

  console.log()
}

main().catch((err) => {
  console.error('Status check failed:', err)
  process.exit(1)
})
