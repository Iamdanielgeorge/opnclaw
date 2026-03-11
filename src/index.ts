import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { PROJECT_ROOT, STORE_DIR, TELEGRAM_BOT_TOKEN, DASHBOARD_ENABLED, DASHBOARD_PORT } from './config.js'
import { initDatabase } from './db.js'
import { runDecaySweep } from './memory.js'
import { cleanupOldUploads } from './media.js'
import { createBot, sendMessage } from './bot.js'
import { initScheduler, stopScheduler } from './scheduler.js'
import { setWaNotifySender } from './whatsapp.js'
import { startDashboard } from './dashboard/server.js'
import { logger } from './logger.js'

const PID_FILE = join(STORE_DIR, 'claudeclaw.pid')

function acquireLock(): void {
  mkdirSync(STORE_DIR, { recursive: true })

  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
    if (oldPid && !isNaN(oldPid)) {
      try {
        process.kill(oldPid, 0) // check if alive
        logger.info({ pid: oldPid }, 'Killing stale instance')
        process.kill(oldPid, 'SIGTERM')
        // Give it a moment to die
        const start = Date.now()
        while (Date.now() - start < 3000) {
          try {
            process.kill(oldPid, 0)
          } catch {
            break
          }
        }
      } catch {
        // Process not running, stale PID file
      }
    }
  }

  writeFileSync(PID_FILE, String(process.pid))
}

function releaseLock(): void {
  try {
    unlinkSync(PID_FILE)
  } catch {
    // already gone
  }
}

function showBanner(): void {
  const banner = `
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝╚══════╝
 ██████╗██╗      █████╗ ██╗    ██╗
██╔════╝██║     ██╔══██╗██║    ██║
██║     ██║     ███████║██║ █╗ ██║
██║     ██║     ██╔══██║██║███╗██║
╚██████╗███████╗██║  ██║╚███╔███╔╝
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝  (lite)
`
  console.log(banner)
}

async function main(): Promise<void> {
  showBanner()

  // Check required config
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('\nTELEGRAM_BOT_TOKEN is not set.')
    console.error('Run: npm run setup')
    process.exit(1)
  }

  // Acquire lock
  acquireLock()

  // Initialize database
  initDatabase()

  // Start dashboard if enabled
  if (DASHBOARD_ENABLED) {
    startDashboard(DASHBOARD_PORT)
  }

  // Run memory decay sweep + schedule daily
  runDecaySweep()
  const decayInterval = setInterval(runDecaySweep, 24 * 60 * 60 * 1000)

  // Clean up old uploads
  cleanupOldUploads()

  // Create bot
  const bot = createBot()

  // Initialize scheduler
  initScheduler(sendMessage)

  // Set up WhatsApp notification sender
  setWaNotifySender(sendMessage)

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...')
    stopScheduler()
    clearInterval(decayInterval)
    bot.stop()
    releaseLock()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Start bot
  try {
    logger.info('ClaudeClaw starting...')
    await bot.start({
      onStart: () => {
        logger.info('ClaudeClaw is running')
      },
    })
  } catch (err) {
    logger.error({ err }, 'Failed to start bot. Check TELEGRAM_BOT_TOKEN in .env.')
    releaseLock()
    process.exit(1)
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error')
  releaseLock()
  process.exit(1)
})
