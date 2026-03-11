import { useEffect, useState } from 'react'
import { usage } from '../api'
import type { UsageRecord, UsageStats } from '../api'

function formatTime(ts: number): string {
  const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
  return d.toLocaleString()
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function UsageTab() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [records, setRecords] = useState<UsageRecord[]>([])

  useEffect(() => {
    usage.stats().then(setStats).catch(() => {})
    usage.recent(100).then(setRecords).catch(() => {})
  }, [])

  const maxDayTokens = stats?.by_day ? Math.max(...stats.by_day.map(d => d.tokens), 1) : 1

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Usage</h2>

      {/* Today's summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">Tokens Today</p>
            <p className="text-2xl font-mono text-zinc-100">{formatTokens(stats.today_tokens)}</p>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">Cost Today</p>
            <p className="text-2xl font-mono text-zinc-100">{formatCost(stats.today_cost)}</p>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">Messages Today</p>
            <p className="text-2xl font-mono text-zinc-100">{stats.today_messages}</p>
          </div>
        </div>
      )}

      {/* All-time stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">Total Cost</p>
            <p className="text-lg font-mono text-zinc-100">{formatCost(stats.total_cost_usd)}</p>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">Total Tokens</p>
            <p className="text-lg font-mono text-zinc-100">{formatTokens(stats.total_input_tokens + stats.total_output_tokens)}</p>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">Avg Cost / Message</p>
            <p className="text-lg font-mono text-zinc-100">
              {stats.total_messages > 0 ? formatCost(stats.total_cost_usd / stats.total_messages) : '$0.00'}
            </p>
          </div>
        </div>
      )}

      {/* Daily usage chart (last 7 days) */}
      {stats && stats.by_day.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">Last 7 Days</h3>
          <div className="flex items-end gap-2 h-32 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            {[...stats.by_day].reverse().map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex justify-center">
                  <div
                    className="w-full max-w-[40px] bg-violet-500/60 rounded-t"
                    style={{ height: `${Math.max((d.tokens / maxDayTokens) * 80, 4)}px` }}
                    title={`${formatTokens(d.tokens)} tokens, ${formatCost(d.cost)}`}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By source / model breakdown */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          {stats.by_source.length > 0 && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">By Source</h3>
              <div className="space-y-2">
                {stats.by_source.map(s => (
                  <div key={s.source} className="flex justify-between text-sm">
                    <span className="text-zinc-300">{s.source}</span>
                    <span className="text-zinc-500">{s.count} calls / {formatCost(s.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.by_model.length > 0 && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">By Model</h3>
              <div className="space-y-2">
                {stats.by_model.map(m => (
                  <div key={m.model} className="flex justify-between text-sm">
                    <span className="text-zinc-300 truncate mr-2">{m.model}</span>
                    <span className="text-zinc-500 shrink-0">{formatTokens(m.tokens)} / {formatCost(m.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent records table */}
      <h3 className="text-sm font-semibold text-zinc-400 mb-3">Recent Usage</h3>
      {records.length === 0 ? (
        <p className="text-zinc-500 text-sm">No usage data yet. Send a message to start tracking.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                <th className="text-left py-2 px-2">Time</th>
                <th className="text-left py-2 px-2">Source</th>
                <th className="text-left py-2 px-2">Model</th>
                <th className="text-right py-2 px-2">In</th>
                <th className="text-right py-2 px-2">Out</th>
                <th className="text-right py-2 px-2">Cost</th>
                <th className="text-right py-2 px-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">{formatTime(r.created_at)}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      r.source === 'telegram' ? 'bg-blue-500/20 text-blue-400' :
                      r.source === 'web' ? 'bg-green-500/20 text-green-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>{r.source}</span>
                  </td>
                  <td className="py-2 px-2 text-zinc-300 truncate max-w-[120px]">{r.model ?? '-'}</td>
                  <td className="py-2 px-2 text-right text-zinc-300 font-mono">{formatTokens(r.input_tokens)}</td>
                  <td className="py-2 px-2 text-right text-zinc-300 font-mono">{formatTokens(r.output_tokens)}</td>
                  <td className="py-2 px-2 text-right text-zinc-100 font-mono">{formatCost(r.total_cost_usd)}</td>
                  <td className="py-2 px-2 text-right text-zinc-400 font-mono">{(r.duration_ms / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
