import { Bot, Context, InputFile } from 'grammy'
import {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_CHAT_IDS,
  MAX_MESSAGE_LENGTH,
  TYPING_REFRESH_MS,
} from './config.js'
import { getSession, setSession, clearSession, getMemoriesForDisplay, getSessionWithAgent, getAgent, getDefaultAgent, insertUsage } from './db.js'
import { runAgent, clearOpenAISession, AgentConfig, UsageData } from './agent.js'
import { eventBus } from './dashboard/events.js'
import { buildMemoryContext, saveConversationTurn } from './memory.js'
import { voiceCapabilities, transcribeAudio } from './voice.js'
import { downloadMedia, buildPhotoMessage, buildDocumentMessage, buildVideoMessage, cleanupOldUploads } from './media.js'
import {
  queueWaMessage,
  getWaChats,
  getWaMessages,
  setWaMapping,
  formatWaChatList,
  formatWaMessages,
} from './whatsapp.js'
import {
  createTask as dbCreateTask,
  getAllTasks,
  deleteTask as dbDeleteTask,
  pauseTask as dbPauseTask,
  resumeTask as dbResumeTask,
} from './db.js'
import { computeNextRun } from './scheduler.js'
import cronParser from 'cron-parser'
const { CronExpressionParser } = cronParser
import { randomUUID } from 'crypto'
import { logger } from './logger.js'
import { routeToBot, logBotActivity, initTeamRouter } from './team-router.js'

// Initialize team router
initTeamRouter()

// Voice mode toggle (in-memory per chat)
const voiceModeChats = new Set<string>()

// WhatsApp chat selection state
const waSelectionState = new Map<string, Array<{ jid: string }>>()

function isAuthorised(chatId: number): boolean {
  if (ALLOWED_CHAT_IDS.length === 0) return true // first-run mode
  return ALLOWED_CHAT_IDS.includes(String(chatId))
}

// --- Telegram Markdown → HTML formatter ---

export function formatForTelegram(text: string): string {
  // Extract code blocks and protect them
  const codeBlocks: string[] = []
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const escaped = escapeHtml(code.trimEnd())
    const block = lang ? `<pre><code class="language-${lang}">${escaped}</code></pre>` : `<pre>${escaped}</pre>`
    codeBlocks.push(block)
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`
  })

  // Inline code
  processed = processed.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)

  // Now escape HTML in non-code, non-tag regions
  processed = processed.replace(/%%CODEBLOCK_\d+%%/g, (m) => {
    return m // keep placeholders
  })

  // Escape HTML entities in plain text (but not our tags)
  processed = escapeHtmlSelective(processed)

  // Headings → bold
  processed = processed.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')

  // Bold: **text** or __text__
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  processed = processed.replace(/__(.+?)__/g, '<b>$1</b>')

  // Italic: *text* or _text_ (but not mid-word underscores)
  processed = processed.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>')
  processed = processed.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>')

  // Strikethrough
  processed = processed.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // Links
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Checkboxes
  processed = processed.replace(/^- \[ \]/gm, '☐')
  processed = processed.replace(/^- \[x\]/gim, '☑')

  // Strip horizontal rules
  processed = processed.replace(/^---+$/gm, '')
  processed = processed.replace(/^\*\*\*+$/gm, '')

  // Restore code blocks
  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, idx: string) => codeBlocks[parseInt(idx)])

  return processed.trim()
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeHtmlSelective(text: string): string {
  // Escape & < > but preserve our placeholder markers and already-created tags
  return text.replace(/&(?!amp;|lt;|gt;)/g, '&amp;')
    .replace(/<(?!\/?(?:b|i|s|u|a|code|pre)\b|!--)/g, '&lt;')
    .replace(/(?<!<\/?(?:b|i|s|u|a|code|pre)[^>]*)>/g, (match, offset, str) => {
      // Check if this > is part of an HTML tag we want to keep
      const before = str.slice(Math.max(0, offset - 100), offset)
      if (/<(?:b|i|s|u|a|code|pre)[^>]*$/.test(before) || /<\/(?:b|i|s|u|a|code|pre)$/.test(before)) {
        return match
      }
      return '&gt;'
    })
}

export function splitMessage(text: string, limit = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    // Try to split at a newline
    let splitIdx = remaining.lastIndexOf('\n', limit)
    if (splitIdx === -1 || splitIdx < limit * 0.3) {
      // Try space
      splitIdx = remaining.lastIndexOf(' ', limit)
    }
    if (splitIdx === -1 || splitIdx < limit * 0.3) {
      splitIdx = limit
    }

    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).trimStart()
  }

  return chunks
}

// --- Main message handler ---

async function handleMessage(ctx: Context, rawText: string, forceVoiceReply = false): Promise<void> {
  const chatId = String(ctx.chat!.id)

  // Emit incoming activity
  eventBus.activity('message_in', rawText.slice(0, 100), { chatId })

  // Route to team bot if applicable
  const targetBot = routeToBot(rawText)
  if (targetBot) {
    logBotActivity(targetBot, 'message_received', rawText.slice(0, 100))
    logger.info({ targetBot, message: rawText.slice(0, 50) }, 'Routed to team bot')
  }

  // Build memory context
  const memoryContext = await buildMemoryContext(chatId, rawText)
  const fullMessage = memoryContext ? `${memoryContext}\n\n${rawText}` : rawText

  // Get existing session
  const sessionId = getSession(chatId)

  // Load agent config for this chat
  let agentConfig: AgentConfig | undefined
  const sessionData = getSessionWithAgent(chatId)
  const agentId = sessionData?.agent_id
  const agentRow = agentId ? getAgent(agentId) : getDefaultAgent()
  if (agentRow) {
    agentConfig = {
      systemPrompt: agentRow.system_prompt || undefined,
      model: agentRow.model !== 'inherit' ? agentRow.model : undefined,
      disallowedTools: JSON.parse(agentRow.disallowed_tools || '[]'),
    }
  }

  // Start typing indicator refresh
  const sendTyping = () => {
    ctx.api.sendChatAction(ctx.chat!.id, 'typing').catch(() => {})
  }
  sendTyping()
  const typingInterval = setInterval(sendTyping, TYPING_REFRESH_MS)

  try {
    const { text, newSessionId, usage } = await runAgent(fullMessage, sessionId, sendTyping, agentConfig)

    // Save session
    if (newSessionId) {
      setSession(chatId, newSessionId)
    }

    // Store usage data
    if (usage) {
      storeUsage(chatId, agentRow?.id, usage, 'telegram')
    }

    if (!text) {
      await ctx.reply('(no response)')
      return
    }

    // Save to memory
    await saveConversationTurn(chatId, rawText, text)

    // Send response
    const formatted = formatForTelegram(text)
    const chunks = splitMessage(formatted)

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: 'HTML' })
      } catch {
        // Fallback to plain text if HTML parsing fails
        await ctx.reply(chunk.replace(/<[^>]+>/g, ''))
      }
    }

    // Emit outgoing activity
    eventBus.activity('message_out', text.slice(0, 100), { chatId, agentId: agentRow?.id })
  } finally {
    clearInterval(typingInterval)
  }
}

function storeUsage(chatId: string, agentId: string | undefined, usage: UsageData, source: string): void {
  try {
    insertUsage({
      chatId,
      agentId: agentId ?? null,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_tokens,
      cacheCreationTokens: usage.cache_creation_tokens,
      totalCostUsd: usage.total_cost_usd,
      durationMs: usage.duration_ms,
      numTurns: usage.num_turns,
      model: usage.model,
      source,
    })
  } catch (err) {
    logger.error({ err }, 'Failed to store usage data')
  }
}

// --- Bot setup ---

export function createBot(): Bot {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set. Run npm run setup or check your .env file.')
  }

  const bot = new Bot(TELEGRAM_BOT_TOKEN)

  // Auth middleware
  bot.use(async (ctx, next) => {
    if (ctx.chat && !isAuthorised(ctx.chat.id)) {
      logger.warn({ chatId: ctx.chat.id }, 'Unauthorized access attempt')
      await ctx.reply('Unauthorized. Your chat ID: ' + ctx.chat.id)
      return
    }
    await next()
  })

  // --- Commands ---

  bot.command('start', async (ctx) => {
    await ctx.reply('ClaudeClaw is running. Send me a message and I\'ll handle it.')
  })

  bot.command('chatid', async (ctx) => {
    await ctx.reply(`Your chat ID: ${ctx.chat.id}`)
  })

  bot.command('newchat', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const existing = getSession(chatId)
    if (existing) clearOpenAISession(existing)
    clearSession(chatId)
    await ctx.reply('Session cleared. Starting fresh.')
  })

  bot.command('forget', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const existing = getSession(chatId)
    if (existing) clearOpenAISession(existing)
    clearSession(chatId)
    await ctx.reply('Session cleared. Starting fresh.')
  })

  bot.command('memory', async (ctx) => {
    const memories = getMemoriesForDisplay(String(ctx.chat.id))
    if (memories.length === 0) {
      await ctx.reply('No memories stored yet.')
      return
    }
    const lines = memories.map(m =>
      `[${m.sector}] (${m.salience.toFixed(2)}) ${m.content.slice(0, 100)}`
    )
    await ctx.reply(lines.join('\n\n'))
  })

  bot.command('voice', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const caps = voiceCapabilities()
    if (!caps.stt) {
      await ctx.reply('Voice features are not configured. Check GROQ_API_KEY in .env.')
      return
    }
    if (voiceModeChats.has(chatId)) {
      voiceModeChats.delete(chatId)
      await ctx.reply('Voice mode off. Replies will be text.')
    } else {
      voiceModeChats.add(chatId)
      await ctx.reply('Voice mode on. Replies will be audio (when TTS is configured).')
    }
  })

  // --- Scheduler commands ---

  bot.command('schedule', async (ctx) => {
    const text = ctx.message?.text ?? ''
    const parts = text.replace(/^\/schedule\s*/, '').trim().split(/\s+/)
    const subCmd = parts[0]

    if (!subCmd || subCmd === 'list') {
      const tasks = getAllTasks()
      if (tasks.length === 0) {
        await ctx.reply('No scheduled tasks.')
        return
      }
      const lines = tasks.map(t => {
        const next = new Date(t.next_run * 1000).toLocaleString()
        return `${t.status === 'paused' ? '⏸' : '▶'} ${t.id} — ${t.prompt.slice(0, 40)}${t.prompt.length > 40 ? '...' : ''}\n   ${t.schedule} | Next: ${next}`
      })
      await ctx.reply(lines.join('\n\n'))
      return
    }

    if (subCmd === 'create') {
      // /schedule create "prompt" "cron"
      const match = text.match(/create\s+"([^"]+)"\s+"([^"]+)"/)
      if (!match) {
        await ctx.reply('Usage: /schedule create "prompt" "cron expression"')
        return
      }
      const [, prompt, cron] = match
      try {
        CronExpressionParser.parse(cron)
      } catch {
        await ctx.reply(`Invalid cron expression: ${cron}`)
        return
      }
      const id = randomUUID().slice(0, 8)
      const nextRun = computeNextRun(cron)
      dbCreateTask(id, String(ctx.chat.id), prompt, cron, nextRun)
      await ctx.reply(`Task ${id} created.\nNext run: ${new Date(nextRun * 1000).toLocaleString()}`)
      return
    }

    if (subCmd === 'delete' && parts[1]) {
      if (dbDeleteTask(parts[1])) {
        await ctx.reply(`Deleted task ${parts[1]}`)
      } else {
        await ctx.reply('Task not found.')
      }
      return
    }

    if (subCmd === 'pause' && parts[1]) {
      if (dbPauseTask(parts[1])) {
        await ctx.reply(`Paused task ${parts[1]}`)
      } else {
        await ctx.reply('Task not found.')
      }
      return
    }

    if (subCmd === 'resume' && parts[1]) {
      if (dbResumeTask(parts[1])) {
        await ctx.reply(`Resumed task ${parts[1]}`)
      } else {
        await ctx.reply('Task not found.')
      }
      return
    }

    await ctx.reply('Usage: /schedule [list|create|delete|pause|resume]')
  })

  // --- WhatsApp commands ---

  bot.command('wa', async (ctx) => {
    const text = ctx.message?.text ?? ''
    const args = text.replace(/^\/wa\s*/, '').trim()
    const chatId = String(ctx.chat.id)

    if (!args || args === 'list') {
      const chats = getWaChats()
      waSelectionState.set(chatId, chats.map(c => ({ jid: c.jid })))
      await ctx.reply(formatWaChatList(chats))
      return
    }

    // /wa <number> — view chat
    const viewMatch = args.match(/^(\d+)$/)
    if (viewMatch) {
      const idx = parseInt(viewMatch[1]) - 1
      const selection = waSelectionState.get(chatId)
      if (!selection || idx < 0 || idx >= selection.length) {
        await ctx.reply('Invalid selection. Run /wa to see chats.')
        return
      }
      const jid = selection[idx].jid
      setWaMapping(jid, chatId)
      const messages = getWaMessages(jid)
      await ctx.reply(formatWaMessages(jid, messages))
      return
    }

    // /wa send <number> <message>
    const sendMatch = args.match(/^send\s+(\d+)\s+(.+)$/s)
    if (sendMatch) {
      const idx = parseInt(sendMatch[1]) - 1
      const body = sendMatch[2]
      const selection = waSelectionState.get(chatId)
      if (!selection || idx < 0 || idx >= selection.length) {
        await ctx.reply('Invalid selection. Run /wa to see chats.')
        return
      }
      queueWaMessage(selection[idx].jid, body)
      await ctx.reply('Message queued for delivery.')
      return
    }

    await ctx.reply('Usage: /wa [list|<number>|send <number> <message>]')
  })

  // --- Message handlers ---

  bot.on('message:voice', async (ctx) => {
    const caps = voiceCapabilities()
    if (!caps.stt) {
      await ctx.reply('Voice transcription is not configured. Check GROQ_API_KEY.')
      return
    }

    try {
      const file = await ctx.getFile()
      const localPath = await downloadMedia(file.file_id, file.file_path?.split('/').pop())
      const transcript = await transcribeAudio(localPath)
      logger.info({ transcript: transcript.slice(0, 100) }, 'Voice transcribed')
      await handleMessage(ctx, `[Voice transcribed]: ${transcript}`, true)
    } catch (err) {
      logger.error({ err }, 'Voice transcription failed')
      await ctx.reply('Failed to transcribe voice message.')
    }
  })

  bot.on('message:photo', async (ctx) => {
    try {
      const photos = ctx.message.photo
      const largest = photos[photos.length - 1]
      const localPath = await downloadMedia(largest.file_id)
      const caption = ctx.message.caption ?? ''
      await handleMessage(ctx, buildPhotoMessage(localPath, caption))
    } catch (err) {
      logger.error({ err }, 'Photo handling failed')
      await ctx.reply('Failed to process photo.')
    }
  })

  bot.on('message:document', async (ctx) => {
    try {
      const doc = ctx.message.document
      const localPath = await downloadMedia(doc.file_id, doc.file_name ?? undefined)
      const caption = ctx.message.caption ?? ''
      await handleMessage(ctx, buildDocumentMessage(localPath, doc.file_name ?? 'document', caption))
    } catch (err) {
      logger.error({ err }, 'Document handling failed')
      await ctx.reply('Failed to process document.')
    }
  })

  bot.on('message:video', async (ctx) => {
    try {
      const video = ctx.message.video
      const localPath = await downloadMedia(video.file_id)
      const caption = ctx.message.caption ?? ''
      await handleMessage(ctx, buildVideoMessage(localPath, caption))
    } catch (err) {
      logger.error({ err }, 'Video handling failed')
      await ctx.reply('Failed to process video.')
    }
  })

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return // handled by command handlers
    await handleMessage(ctx, text)
  })

  return bot
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  const bot = new Bot(TELEGRAM_BOT_TOKEN)
  const formatted = formatForTelegram(text)
  const chunks = splitMessage(formatted)
  for (const chunk of chunks) {
    try {
      await bot.api.sendMessage(Number(chatId), chunk, { parse_mode: 'HTML' })
    } catch {
      await bot.api.sendMessage(Number(chatId), chunk.replace(/<[^>]+>/g, ''))
    }
  }
}
