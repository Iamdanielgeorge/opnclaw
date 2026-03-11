import { Router } from 'express'
import { searchMemories, getMemoriesByChatId, deleteMemory } from '../../db.js'

export function memoryRoutes(): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const chatId = req.query.chatId as string | undefined
    const q = req.query.q as string | undefined

    if (q && chatId) {
      res.json(searchMemories(q, chatId, 50))
      return
    }
    if (chatId) {
      res.json(getMemoriesByChatId(chatId))
      return
    }
    res.status(400).json({ error: 'chatId query parameter is required' })
  })

  router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid memory ID' })
      return
    }
    const success = deleteMemory(id)
    if (!success) {
      res.status(404).json({ error: 'Memory not found' })
      return
    }
    res.json({ ok: true })
  })

  return router
}
