import { Router } from 'express'
import { getAllSessions, clearSession, setSessionAgent } from '../../db.js'
import { eventBus } from '../events.js'

export function sessionRoutes(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(getAllSessions())
  })

  router.get('/:chatId', (req, res) => {
    const sessions = getAllSessions()
    const session = sessions.find(s => s.chat_id === req.params.chatId)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(session)
  })

  router.delete('/:chatId', (req, res) => {
    clearSession(req.params.chatId)
    eventBus.activity('session_cleared', `Session for chat ${req.params.chatId} cleared`, { chatId: req.params.chatId })
    res.json({ ok: true })
  })

  router.put('/:chatId/agent', (req, res) => {
    const { agent_id } = req.body
    const success = setSessionAgent(req.params.chatId, agent_id ?? null)
    if (!success) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    eventBus.activity('session_agent_changed', `Chat ${req.params.chatId} assigned agent ${agent_id ?? 'none'}`, { chatId: req.params.chatId })
    res.json({ ok: true })
  })

  return router
}
