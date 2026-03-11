import { Router } from 'express'
import { statSync } from 'fs'
import { join } from 'path'
import { STORE_DIR, DASHBOARD_PORT, TELEGRAM_BOT_TOKEN, GROQ_API_KEY, GOOGLE_API_KEY } from '../../config.js'

const startTime = Date.now()

export function systemRoutes(): Router {
  const router = Router()

  router.get('/status', (_req, res) => {
    let dbSizeBytes = 0
    try {
      const stat = statSync(join(STORE_DIR, 'claudeclaw.db'))
      dbSizeBytes = stat.size
    } catch {
      // DB might not exist yet
    }

    res.json({
      uptime_ms: Date.now() - startTime,
      uptime_human: formatUptime(Date.now() - startTime),
      db_size_bytes: dbSizeBytes,
      db_size_human: formatBytes(dbSizeBytes),
      node_version: process.version,
      dashboard_port: DASHBOARD_PORT,
      telegram_configured: !!TELEGRAM_BOT_TOKEN,
      groq_configured: !!GROQ_API_KEY,
      google_configured: !!GOOGLE_API_KEY,
      pid: process.pid,
      memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    })
  })

  return router
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
