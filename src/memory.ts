import {
  searchMemories,
  getRecentMemories,
  touchMemory,
  insertMemory,
  decayMemories as dbDecay,
} from './db.js'
import { logger } from './logger.js'

const SEMANTIC_SIGNALS = /\b(my|i am|i'm|i prefer|remember|always|never)\b/i

export async function buildMemoryContext(chatId: string, userMessage: string): Promise<string> {
  const ftsResults = searchMemories(userMessage, chatId, 3)
  const recentResults = getRecentMemories(chatId, 5)

  // Deduplicate by id
  const seen = new Set<number>()
  const combined: Array<{ id: number; content: string; sector: string; salience: number }> = []

  for (const m of [...ftsResults, ...recentResults]) {
    if (!seen.has(m.id)) {
      seen.add(m.id)
      combined.push(m)
    }
  }

  if (combined.length === 0) return ''

  // Touch each accessed memory
  for (const m of combined) {
    touchMemory(m.id)
  }

  const lines = combined.map(m => `- ${m.content} (${m.sector})`)
  return `[Memory context]\n${lines.join('\n')}`
}

export async function saveConversationTurn(chatId: string, userMsg: string, assistantMsg: string): Promise<void> {
  // Skip short messages and commands
  if (userMsg.length <= 20 || userMsg.startsWith('/')) return

  const sector = SEMANTIC_SIGNALS.test(userMsg) ? 'semantic' : 'episodic'
  const content = `User: ${userMsg.slice(0, 200)}\nAssistant: ${assistantMsg.slice(0, 300)}`

  insertMemory(chatId, content, sector)
  logger.debug({ chatId, sector }, 'Saved conversation turn to memory')
}

export function runDecaySweep(): void {
  dbDecay()
}
