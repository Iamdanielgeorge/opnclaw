import { useEffect, useState } from 'react'
import { system } from '../api'
import type { SystemStatus } from '../api'

export default function SystemTab() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    system.status().then(setStatus).catch(() => {})
    const interval = setInterval(() => {
      system.status().then(setStatus).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  if (!status) return <p className="text-zinc-500 text-sm">Loading system status...</p>

  const cards = [
    { label: 'Uptime', value: status.uptime_human },
    { label: 'DB Size', value: status.db_size_human },
    { label: 'Node', value: status.node_version },
    { label: 'PID', value: String(status.pid) },
    { label: 'Memory', value: `${status.memory_usage_mb} MB` },
    { label: 'Dashboard Port', value: String(status.dashboard_port) },
  ]

  const configs = [
    { label: 'Telegram Bot', ok: status.telegram_configured },
    { label: 'Groq (Voice)', ok: status.groq_configured },
    { label: 'Google (Video)', ok: status.google_configured },
  ]

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">System</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
            <p className="text-lg font-mono text-zinc-100">{c.value}</p>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-semibold mb-4">Configuration</h3>
      <div className="space-y-2">
        {configs.map(c => (
          <div key={c.label} className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${c.ok ? 'bg-green-500' : 'bg-zinc-600'}`} />
            <span className="text-sm text-zinc-300">{c.label}</span>
            <span className={`text-xs ml-auto ${c.ok ? 'text-green-400' : 'text-zinc-500'}`}>
              {c.ok ? 'Configured' : 'Not set'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
