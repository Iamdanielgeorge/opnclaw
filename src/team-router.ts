/**
 * Team Bot Router
 * Routes incoming messages to the appropriate department bot
 * and handles cross-bot communication
 */

import { Orchestrator } from './orchestrator.js'
import { BotCoordinator } from './bot-coordinator.js'
import { logger } from './logger.js'

// Bot skill mappings
const BOT_SKILLS: Record<string, string> = {
  ops: 'ops-bot',
  research: 'research-bot',
  marketing: 'marketing-bot',
  finance: 'finance-bot',
  support: 'support-bot'
}

let orchestrator: Orchestrator | null = null
let coordinator: BotCoordinator | null = null

export function initTeamRouter(): boolean {
  try {
    orchestrator = new Orchestrator()
    coordinator = new BotCoordinator()
    logger.info('Team router and coordinator initialized')
    return true
  } catch (err) {
    logger.warn({ err }, 'Team router init failed - continuing without team bots')
    return false
  }
}

export function routeToBot(message: string): string | null {
  if (!orchestrator) return null
  return orchestrator.routeMessage(message)
}

export function getSkillForBot(botName: string): string | null {
  return BOT_SKILLS[botName] || null
}

export function logBotActivity(bot: string, action: string, details?: string): void {
  if (!orchestrator) return
  orchestrator.logActivity(bot, action, details)
}

export function sendBotMessage(from: string, to: string, message: string): number | null {
  if (!orchestrator) return null
  return orchestrator.sendBotMessage(from, to, message)
}

export function getPendingBotMessages(bot: string): any[] {
  if (!orchestrator) return []
  return orchestrator.getPendingMessages(bot)
}

export function getDailySummary(): any {
  if (!orchestrator) return null
  return orchestrator.getDailySummary()
}

export function createTask(title: string, owner: string, options?: {
  description?: string
  priority?: string
  dueDate?: string
}): number | null {
  if (!orchestrator) return null
  return orchestrator.createTask(title, owner, options || {})
}

export function getBotTasks(owner: string, status?: string): any[] {
  if (!orchestrator) return []
  return orchestrator.getTasks(owner, status)
}

// Cross-bot communication functions
export function requestFromBot(
  fromBot: string,
  toBot: string,
  requestType: string,
  payload: Record<string, unknown>,
  priority: 'high' | 'medium' | 'low' = 'medium'
): number | null {
  if (!coordinator) return null
  try {
    return coordinator.requestFromBot(fromBot, toBot, requestType, payload, priority)
  } catch (err) {
    logger.error({ err, fromBot, toBot }, 'Failed to send bot request')
    return null
  }
}

export function delegateTask(
  fromBot: string,
  toBot: string,
  title: string,
  description: string,
  priority: 'high' | 'medium' | 'low' = 'medium'
): number | null {
  if (!coordinator) return null
  return coordinator.delegateTask(fromBot, toBot, title, description, priority)
}

export function escalateToOps(fromBot: string, issue: string, context: Record<string, unknown>): number | null {
  if (!coordinator) return null
  return coordinator.escalateToOps(fromBot, issue, context)
}

export function requestResearch(fromBot: string, topic: string, requirements: string[]): number | null {
  if (!coordinator) return null
  return coordinator.requestResearch(fromBot, topic, requirements)
}

export function requestBudgetInfo(fromBot: string, category: string, period?: string): number | null {
  if (!coordinator) return null
  return coordinator.requestBudgetInfo(fromBot, category, period)
}

export function broadcastToAllBots(fromBot: string, message: string): void {
  if (!coordinator) return
  coordinator.broadcast(fromBot, message)
}

export function getCollaborationSummary(): { totalRequests: number; pendingByBot: Record<string, number> } | null {
  if (!coordinator) return null
  return coordinator.getCollaborationSummary()
}

export function processBotRequests(bot: string): any[] {
  if (!coordinator) return []
  return coordinator.processPendingRequests(bot)
}

export function respondToBotRequest(requestId: number, response: unknown, success: boolean = true): void {
  if (!coordinator) return
  coordinator.respondToRequest(requestId, response, success)
}

// Enhance message with routing context
export function enhanceMessageForBot(message: string, botName: string): string {
  const skill = getSkillForBot(botName)
  if (!skill) return message
  return '[Route: ' + botName + '] ' + message
}

export function closeTeamRouter(): void {
  if (orchestrator) {
    orchestrator.close()
    orchestrator = null
  }
  if (coordinator) {
    coordinator.close()
    coordinator = null
  }
}
