import { EventEmitter } from 'events'

export interface ActivityEvent {
  type: string
  agentId?: string
  chatId?: string
  summary: string
  metadata?: Record<string, unknown>
  timestamp: number
}

class EventBus extends EventEmitter {
  emit(event: 'activity', data: ActivityEvent): boolean
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  activity(type: string, summary: string, opts?: { agentId?: string; chatId?: string; metadata?: Record<string, unknown> }) {
    const event: ActivityEvent = {
      type,
      summary,
      agentId: opts?.agentId,
      chatId: opts?.chatId,
      metadata: opts?.metadata,
      timestamp: Date.now(),
    }
    this.emit('activity', event)
  }
}

export const eventBus = new EventBus()
