import { useEffect, useState } from 'react'
import { activity } from '../api'
import type { ActivityItem } from '../api'
import { useSSE } from '../useSSE'
import type { SSEEvent } from '../useSSE'

const typeColors: Record<string, string> = {
  message_in: 'bg-blue-500/20 text-blue-400',
  message_out: 'bg-green-500/20 text-green-400',
  task_run: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
  agent_created: 'bg-violet-500/20 text-violet-400',
  agent_updated: 'bg-violet-500/20 text-violet-400',
  skill_toggled: 'bg-cyan-500/20 text-cyan-400',
  session_cleared: 'bg-zinc-500/20 text-zinc-400',
}

function formatTime(ts: number): string {
  const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
  return d.toLocaleTimeString()
}

export default function ActivityTab() {
  const [history, setHistory] = useState<ActivityItem[]>([])
  const { events: liveEvents, connected } = useSSE('/api/activity/stream')

  useEffect(() => {
    activity.recent(100).then(setHistory).catch(() => {})
  }, [])

  // Merge live events on top of history
  const liveAsItems: ActivityItem[] = liveEvents.map((e: SSEEvent, i: number) => ({
    id: -(i + 1),
    event_type: e.type,
    agent_id: e.agentId ?? null,
    chat_id: e.chatId ?? null,
    summary: e.summary,
    metadata: JSON.stringify(e.metadata ?? {}),
    created_at: Math.floor(e.timestamp / 1000),
  }))

  const allEvents = [...liveAsItems, ...history]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Activity Feed</h2>
        <span className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {connected ? 'Live' : 'Disconnected'}
        </span>
      </div>

      {allEvents.length === 0 ? (
        <p className="text-zinc-500 text-sm">No activity yet. Send a message to the Telegram bot to see events here.</p>
      ) : (
        <div className="space-y-2">
          {allEvents.map((item) => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className={`text-xs px-2 py-0.5 rounded font-mono shrink-0 ${typeColors[item.event_type] || 'bg-zinc-700 text-zinc-300'}`}>
                {item.event_type}
              </span>
              <p className="text-sm text-zinc-300 flex-1 min-w-0 truncate">{item.summary}</p>
              <span className="text-xs text-zinc-600 shrink-0">{formatTime(item.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
