import { Router, Request, Response } from 'express'
import { getRecentActivity, insertActivity } from '../../db.js'
import { eventBus, ActivityEvent } from '../events.js'

export function activityRoutes(): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50
    res.json(getRecentActivity(limit))
  })

  router.get('/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const onActivity = (event: ActivityEvent) => {
      // Persist to DB
      insertActivity(event.type, event.summary, {
        agentId: event.agentId,
        chatId: event.chatId,
        metadata: event.metadata,
      })
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    eventBus.on('activity', onActivity)

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n')
    }, 30000)

    req.on('close', () => {
      eventBus.off('activity', onActivity)
      clearInterval(heartbeat)
    })
  })

  return router
}
