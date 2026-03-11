import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getAllAgents, getAgent, createAgent, updateAgent, deleteAgent, setDefaultAgent } from '../../db.js'
import { eventBus } from '../events.js'

export function agentRoutes(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(getAllAgents())
  })

  router.post('/', (req, res) => {
    const { name, description, system_prompt, model, tools, disallowed_tools, is_default, is_active } = req.body
    if (!name) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const id = randomUUID().slice(0, 8)
    createAgent({
      id,
      name,
      description: description ?? '',
      system_prompt: system_prompt ?? '',
      model: model ?? 'inherit',
      tools: JSON.stringify(tools ?? []),
      disallowed_tools: JSON.stringify(disallowed_tools ?? []),
      is_default: is_default ? 1 : 0,
      is_active: is_active !== false ? 1 : 0,
    })
    eventBus.activity('agent_created', `Agent "${name}" created`, { metadata: { agentId: id } })
    res.status(201).json(getAgent(id))
  })

  router.get('/:id', (req, res) => {
    const agent = getAgent(req.params.id)
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    res.json(agent)
  })

  router.put('/:id', (req, res) => {
    const success = updateAgent(req.params.id, req.body)
    if (!success) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    eventBus.activity('agent_updated', `Agent "${req.params.id}" updated`)
    res.json(getAgent(req.params.id))
  })

  router.delete('/:id', (req, res) => {
    const success = deleteAgent(req.params.id)
    if (!success) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    eventBus.activity('agent_deleted', `Agent "${req.params.id}" deleted`)
    res.json({ ok: true })
  })

  router.post('/:id/default', (req, res) => {
    const success = setDefaultAgent(req.params.id)
    if (!success) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    eventBus.activity('agent_default', `Agent "${req.params.id}" set as default`)
    res.json({ ok: true })
  })

  return router
}
