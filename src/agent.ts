import { query } from '@anthropic-ai/claude-agent-sdk'
import OpenAI from 'openai'
import { PROJECT_ROOT, AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_MAX_TOKENS } from './config.js'
import { logger } from './logger.js'

export interface AgentConfig {
  systemPrompt?: string
  model?: string
  disallowedTools?: string[]
}

export interface UsageData {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  total_cost_usd: number
  duration_ms: number
  num_turns: number
  model: string | null
}

export interface AgentResult {
  text: string | null
  newSessionId?: string
  usage?: UsageData
}

// In-memory conversation history for OpenAI sessions (keyed by sessionId)
const openaiHistory = new Map<string, Array<{ role: 'system' | 'user' | 'assistant'; content: string }>>()

// Cap history to prevent token overflow
const MAX_HISTORY_MESSAGES = 40

export async function runAgent(
  message: string,
  sessionId?: string,
  onTyping?: () => void,
  agentConfig?: AgentConfig
): Promise<AgentResult> {
  if (AI_PROVIDER === 'openai') {
    return runOpenAI(message, sessionId, onTyping, agentConfig)
  }
  return runClaude(message, sessionId, onTyping, agentConfig)
}

// --- Claude Agent SDK provider ---

async function runClaude(
  message: string,
  sessionId?: string,
  onTyping?: () => void,
  agentConfig?: AgentConfig
): Promise<AgentResult> {
  let text: string | null = null
  let newSessionId: string | undefined
  let usage: UsageData | undefined

  const typingInterval = onTyping ? setInterval(onTyping, 4000) : undefined

  const fullMessage = agentConfig?.systemPrompt
    ? `[System context from agent profile]:\n${agentConfig.systemPrompt}\n\n---\n\n${message}`
    : message

  try {
    const options: Record<string, unknown> = {
      cwd: PROJECT_ROOT,
      ...(sessionId ? { resume: sessionId } : {}),
      settingSources: ['project', 'user'],
      permissionMode: 'bypassPermissions',
    }

    if (agentConfig?.model && agentConfig.model !== 'inherit') {
      options.model = agentConfig.model
    }

    if (agentConfig?.disallowedTools && agentConfig.disallowedTools.length > 0) {
      options.disallowedTools = agentConfig.disallowedTools
    }

    const events = query({
      prompt: fullMessage,
      options: options as Parameters<typeof query>[0]['options'],
    })

    for await (const event of events) {
      if (event.type === 'system' && event.subtype === 'init') {
        newSessionId = event.session_id
        logger.debug({ sessionId: newSessionId }, 'Session initialized')
      }
      if (event.type === 'result') {
        if (event.subtype === 'success') {
          text = event.result ?? null
        }
        const ev = event as Record<string, unknown>
        const u = ev.usage as Record<string, number> | undefined
        const modelUsage = ev.modelUsage as Record<string, unknown> | undefined
        const modelName = modelUsage ? Object.keys(modelUsage)[0] ?? null : null
        usage = {
          input_tokens: u?.input_tokens ?? 0,
          output_tokens: u?.output_tokens ?? 0,
          cache_read_tokens: u?.cache_read_input_tokens ?? 0,
          cache_creation_tokens: u?.cache_creation_input_tokens ?? 0,
          total_cost_usd: (ev.total_cost_usd as number) ?? 0,
          duration_ms: (ev.duration_ms as number) ?? 0,
          num_turns: (ev.num_turns as number) ?? 0,
          model: modelName,
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Agent error')
    text = null
  } finally {
    if (typingInterval) clearInterval(typingInterval)
  }

  return { text, newSessionId, usage }
}

// --- OpenAI provider ---

async function runOpenAI(
  message: string,
  sessionId?: string,
  onTyping?: () => void,
  agentConfig?: AgentConfig
): Promise<AgentResult> {
  if (!OPENAI_API_KEY) {
    return { text: 'OPENAI_API_KEY is not set. Add it to your .env file.' }
  }

  const startTime = Date.now()
  const typingInterval = onTyping ? setInterval(onTyping, 4000) : undefined

  // Resolve model: agent config overrides env default
  const model = (agentConfig?.model && agentConfig.model !== 'inherit')
    ? agentConfig.model
    : OPENAI_MODEL

  // Build or resume conversation history
  const historyKey = sessionId ?? crypto.randomUUID()
  if (!openaiHistory.has(historyKey)) {
    const systemContent = agentConfig?.systemPrompt
      ? agentConfig.systemPrompt
      : 'You are a helpful assistant.'
    openaiHistory.set(historyKey, [
      { role: 'system', content: systemContent }
    ])
  }

  const history = openaiHistory.get(historyKey)!
  history.push({ role: 'user', content: message })

  // Trim if too long (keep system message + recent messages)
  if (history.length > MAX_HISTORY_MESSAGES) {
    const systemMsg = history[0]
    const recent = history.slice(-(MAX_HISTORY_MESSAGES - 1))
    history.length = 0
    history.push(systemMsg, ...recent)
  }

  let text: string | null = null
  let usage: UsageData | undefined

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY })

    const response = await client.chat.completions.create({
      model,
      messages: history,
      max_tokens: OPENAI_MAX_TOKENS,
    })

    const choice = response.choices[0]
    text = choice?.message?.content ?? null

    if (text) {
      history.push({ role: 'assistant', content: text })
    }

    const u = response.usage
    usage = {
      input_tokens: u?.prompt_tokens ?? 0,
      output_tokens: u?.completion_tokens ?? 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      total_cost_usd: 0, // OpenAI doesn't return cost directly
      duration_ms: Date.now() - startTime,
      num_turns: 1,
      model,
    }
  } catch (err) {
    logger.error({ err }, 'OpenAI error')
    text = null
  } finally {
    if (typingInterval) clearInterval(typingInterval)
  }

  return { text, newSessionId: historyKey, usage }
}

// Clear OpenAI conversation history for a session
export function clearOpenAISession(sessionId: string): void {
  openaiHistory.delete(sessionId)
}
