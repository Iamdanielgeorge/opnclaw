import cronParser from 'cron-parser'
const { CronExpressionParser } = cronParser
import { getDueTasks, updateTaskAfterRun, insertUsage } from './db.js'
import { runAgent } from './agent.js'
import { logger } from './logger.js'
import { eventBus } from './dashboard/events.js'

type Sender = (chatId: string, text: string) => Promise<void>

let sender: Sender | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

export function computeNextRun(cronExpression: string): number {
  const next = CronExpressionParser.parse(cronExpression).next()
  return Math.floor(next.getTime() / 1000)
}

export async function runDueTasks(): Promise<void> {
  const tasks = getDueTasks()
  if (tasks.length === 0) return

  logger.info({ count: tasks.length }, 'Running due scheduled tasks')

  for (const task of tasks) {
    try {
      if (sender) {
        await sender(task.chat_id, `Running scheduled task: ${task.prompt.slice(0, 50)}...`)
      }

      const { text, usage } = await runAgent(task.prompt)
      const result = text ?? '(no response)'

      if (usage) {
        try {
          insertUsage({
            chatId: task.chat_id,
            agentId: null,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cache_read_tokens,
            cacheCreationTokens: usage.cache_creation_tokens,
            totalCostUsd: usage.total_cost_usd,
            durationMs: usage.duration_ms,
            numTurns: usage.num_turns,
            model: usage.model,
            source: 'scheduler',
          })
        } catch (err) {
          logger.error({ err }, 'Failed to store scheduler usage')
        }
      }

      if (sender) {
        await sender(task.chat_id, `Scheduled task result:\n\n${result}`)
      }

      const nextRun = computeNextRun(task.schedule)
      updateTaskAfterRun(task.id, result.slice(0, 1000), nextRun)

      logger.info({ taskId: task.id, nextRun }, 'Scheduled task completed')
      eventBus.activity('task_run', `Task "${task.prompt.slice(0, 50)}" completed`, { chatId: task.chat_id })
    } catch (err) {
      logger.error({ err, taskId: task.id }, 'Scheduled task failed')
      eventBus.activity('error', `Task "${task.id}" failed: ${err}`, { chatId: task.chat_id })
      if (sender) {
        await sender(task.chat_id, `Scheduled task failed: ${task.id}`)
      }
      // Still compute next run so it doesn't fire repeatedly
      const nextRun = computeNextRun(task.schedule)
      updateTaskAfterRun(task.id, `ERROR: ${err}`, nextRun)
    }
  }
}

export function initScheduler(send: Sender): void {
  sender = send
  pollTimer = setInterval(() => {
    runDueTasks().catch(err => logger.error({ err }, 'Scheduler poll error'))
  }, 60_000)
  logger.info('Scheduler started (polling every 60s)')
}

export function stopScheduler(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
