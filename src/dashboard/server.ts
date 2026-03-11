import express from 'express'
import { join } from 'path'
import { existsSync } from 'fs'
import { PROJECT_ROOT } from '../config.js'
import { agentRoutes } from './routes/agents.js'
import { skillRoutes } from './routes/skills.js'
import { sessionRoutes } from './routes/sessions.js'
import { taskRoutes } from './routes/tasks.js'
import { memoryRoutes } from './routes/memories.js'
import { activityRoutes } from './routes/activity.js'
import { systemRoutes } from './routes/system.js'
import { usageRoutes } from './routes/usage.js'
import { chatRoutes } from './routes/chat.js'
import { logger } from '../logger.js'

export function createDashboardServer(): express.Express {
  const app = express()

  app.use(express.json())

  // CORS for dev mode (Vite dev server on different port)
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  // API routes
  app.use('/api/agents', agentRoutes())
  app.use('/api/skills', skillRoutes())
  app.use('/api/sessions', sessionRoutes())
  app.use('/api/tasks', taskRoutes())
  app.use('/api/memories', memoryRoutes())
  app.use('/api/activity', activityRoutes())
  app.use('/api/system', systemRoutes())
  app.use('/api/usage', usageRoutes())
  app.use('/api/chat', chatRoutes())

  // Serve static React build
  const staticDir = join(PROJECT_ROOT, 'dist', 'dashboard-static')
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir))
    // SPA fallback — use middleware instead of catch-all route for Express 5 compat
    app.use((_req, res, next) => {
      if (_req.method === 'GET' && !_req.path.startsWith('/api/')) {
        res.sendFile(join(staticDir, 'index.html'))
      } else {
        next()
      }
    })
  } else {
    app.get('/', (_req, res) => {
      res.json({ status: 'Dashboard API running. Frontend not built yet. Run: cd dashboard && npm run build' })
    })
  }

  return app
}

export function startDashboard(port: number): void {
  const app = createDashboardServer()
  app.listen(port, () => {
    logger.info({ port }, `Dashboard running at http://localhost:${port}`)
  })
}
