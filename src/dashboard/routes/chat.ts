import { Router } from 'express'
import { randomUUID } from 'crypto'
import { runAgent } from '../../agent.js'
import { insertChatMessage, getChatMessages, getChatSessions, deleteChatSession, insertUsage, getSession, setSession, getAgent, getDefaultAgent } from '../../db.js'
import type { AgentConfig } from '../../agent.js'
import { logger } from '../../logger.js'

export function chatRoutes(): Router {
  const router = Router()

  router.post('/', async (req, res) => {
    const { message, chatId: existingChatId, agentId } = req.body
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' })
      return
    }

    const chatId = existingChatId || `web_${randomUUID().slice(0, 12)}`

    // Store user message
    insertChatMessage(chatId, 'user', message)

    // Load agent config
    let agentConfig: AgentConfig | undefined
    const agentRow = agentId ? getAgent(agentId) : getDefaultAgent()
    if (agentRow) {
      agentConfig = {
        systemPrompt: agentRow.system_prompt || undefined,
        model: agentRow.model !== 'inherit' ? agentRow.model : undefined,
        disallowedTools: JSON.parse(agentRow.disallowed_tools || '[]'),
      }
    }

    // Get session for resumption
    const sessionId = getSession(chatId)

    try {
      const { text, newSessionId, usage } = await runAgent(message, sessionId, undefined, agentConfig)

      if (newSessionId) {
        setSession(chatId, newSessionId)
      }

      const response = text ?? '(no response)'
      insertChatMessage(chatId, 'assistant', response)

      if (usage) {
        insertUsage({
          chatId,
          agentId: agentRow?.id ?? null,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_tokens,
          cacheCreationTokens: usage.cache_creation_tokens,
          totalCostUsd: usage.total_cost_usd,
          durationMs: usage.duration_ms,
          numTurns: usage.num_turns,
          model: usage.model,
          source: 'web',
        })
      }

      res.json({ response, chatId, usage: usage ?? null })
    } catch (err) {
      logger.error({ err }, 'Web chat agent error')
      res.status(500).json({ error: 'Agent failed to respond' })
    }
  })

  router.get('/sessions', (_req, res) => {
    res.json(getChatSessions())
  })

  router.get('/:chatId/messages', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    res.json(getChatMessages(req.params.chatId, limit))
  })

  router.delete('/:chatId', (req, res) => {
    deleteChatSession(req.params.chatId)
    res.json({ ok: true })
  })

  return router
}
