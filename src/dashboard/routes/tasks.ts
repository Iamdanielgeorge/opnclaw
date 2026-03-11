import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getAllTasks, createTask, deleteTask, pauseTask, resumeTask } from '../../db.js'
import { computeNextRun } from '../../scheduler.js'
import { eventBus } from '../events.js'
import cronParser from 'cron-parser'
const { CronExpressionParser } = cronParser

export function taskRoutes(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(getAllTasks())
  })

  router.post('/', (req, res) => {
    const { chat_id, prompt, schedule } = req.body
    if (!chat_id || !prompt || !schedule) {
      res.status(400).json({ error: 'chat_id, prompt, and schedule are required' })
      return
    }
    try {
      CronExpressionParser.parse(schedule)
    } catch {
      res.status(400).json({ error: `Invalid cron expression: ${schedule}` })
      return
    }
    const id = randomUUID().slice(0, 8)
    const nextRun = computeNextRun(schedule)
    createTask(id, chat_id, prompt, schedule, nextRun)
    eventBus.activity('task_created', `Task "${prompt.slice(0, 50)}" created`, { chatId: chat_id })
    res.status(201).json({ id, chat_id, prompt, schedule, next_run: nextRun, status: 'active' })
  })

  router.put('/:id', (req, res) => {
    // For simplicity, delete and recreate (schedule changes)
    res.status(501).json({ error: 'Use DELETE + POST to update tasks' })
  })

  router.delete('/:id', (req, res) => {
    const success = deleteTask(req.params.id)
    if (!success) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    eventBus.activity('task_deleted', `Task ${req.params.id} deleted`)
    res.json({ ok: true })
  })

  router.post('/:id/pause', (req, res) => {
    const success = pauseTask(req.params.id)
    if (!success) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    eventBus.activity('task_paused', `Task ${req.params.id} paused`)
    res.json({ ok: true })
  })

  router.post('/:id/resume', (req, res) => {
    const success = resumeTask(req.params.id)
    if (!success) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    eventBus.activity('task_resumed', `Task ${req.params.id} resumed`)
    res.json({ ok: true })
  })

  return router
}
