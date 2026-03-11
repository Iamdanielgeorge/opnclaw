import { randomUUID } from 'crypto'
import cronParser from 'cron-parser'
const { CronExpressionParser } = cronParser
import { initDatabase, createTask, getAllTasks, deleteTask, pauseTask, resumeTask } from './db.js'

function usage(): void {
  console.log(`
Usage: node dist/schedule-cli.js <command> [args]

Commands:
  create "<prompt>" "<cron>" <chat_id>   Create a new scheduled task
  list                                    List all scheduled tasks
  delete <id>                             Delete a task
  pause <id>                              Pause a task
  resume <id>                             Resume a paused task

Examples:
  node dist/schedule-cli.js create "Summarize my emails" "0 9 * * *" 12345
  node dist/schedule-cli.js list
  node dist/schedule-cli.js delete abc-123
`)
}

function main(): void {
  initDatabase()

  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd) {
    usage()
    process.exit(1)
  }

  switch (cmd) {
    case 'create': {
      const prompt = args[1]
      const cron = args[2]
      const chatId = args[3]

      if (!prompt || !cron || !chatId) {
        console.error('Error: create requires <prompt> <cron> <chat_id>')
        process.exit(1)
      }

      try {
        CronExpressionParser.parse(cron)
      } catch {
        console.error(`Error: invalid cron expression: ${cron}`)
        process.exit(1)
      }

      const id = randomUUID().slice(0, 8)
      const nextRun = Math.floor(CronExpressionParser.parse(cron).next().getTime() / 1000)
      createTask(id, chatId, prompt, cron, nextRun)
      console.log(`Created task ${id}`)
      console.log(`  Prompt: ${prompt}`)
      console.log(`  Schedule: ${cron}`)
      console.log(`  Next run: ${new Date(nextRun * 1000).toLocaleString()}`)
      break
    }

    case 'list': {
      const tasks = getAllTasks()
      if (tasks.length === 0) {
        console.log('No scheduled tasks.')
        break
      }
      console.log('ID        | Status  | Schedule      | Next Run             | Prompt')
      console.log('----------|---------|---------------|----------------------|-------')
      for (const t of tasks) {
        const next = new Date(t.next_run * 1000).toLocaleString()
        const promptPreview = t.prompt.length > 40 ? t.prompt.slice(0, 37) + '...' : t.prompt
        console.log(`${t.id.padEnd(10)}| ${t.status.padEnd(8)}| ${t.schedule.padEnd(14)}| ${next.padEnd(21)}| ${promptPreview}`)
      }
      break
    }

    case 'delete': {
      const id = args[1]
      if (!id) { console.error('Error: delete requires <id>'); process.exit(1) }
      if (deleteTask(id)) {
        console.log(`Deleted task ${id}`)
      } else {
        console.error(`Task not found: ${id}`)
        process.exit(1)
      }
      break
    }

    case 'pause': {
      const id = args[1]
      if (!id) { console.error('Error: pause requires <id>'); process.exit(1) }
      if (pauseTask(id)) {
        console.log(`Paused task ${id}`)
      } else {
        console.error(`Task not found: ${id}`)
        process.exit(1)
      }
      break
    }

    case 'resume': {
      const id = args[1]
      if (!id) { console.error('Error: resume requires <id>'); process.exit(1) }
      if (resumeTask(id)) {
        console.log(`Resumed task ${id}`)
      } else {
        console.error(`Task not found: ${id}`)
        process.exit(1)
      }
      break
    }

    default:
      console.error(`Unknown command: ${cmd}`)
      usage()
      process.exit(1)
  }
}

main()
