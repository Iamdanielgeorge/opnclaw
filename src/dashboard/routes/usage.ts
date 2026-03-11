import { Router } from 'express'
import { getRecentUsage, getUsageByChatId, getUsageStats } from '../../db.js'

export function usageRoutes(): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500)
    res.json(getRecentUsage(limit))
  })

  router.get('/stats', (_req, res) => {
    res.json(getUsageStats())
  })

  router.get('/:chatId', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500)
    res.json(getUsageByChatId(req.params.chatId, limit))
  })

  return router
}
