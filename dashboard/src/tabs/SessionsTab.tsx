import { useEffect, useState } from 'react'
import { sessions, agents } from '../api'
import type { Session, Agent } from '../api'

export default function SessionsTab() {
  const [list, setList] = useState<Session[]>([])
  const [agentList, setAgentList] = useState<Agent[]>([])

  const load = () => {
    sessions.list().then(setList).catch(() => {})
    agents.list().then(setAgentList).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleClear = async (chatId: string) => {
    await sessions.clear(chatId)
    load()
  }

  const handleAgentChange = async (chatId: string, agentId: string) => {
    await sessions.setAgent(chatId, agentId || null)
    load()
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Sessions</h2>

      {list.length === 0 ? (
        <p className="text-zinc-500 text-sm">No active sessions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-400">
                <th className="pb-3 pr-4">Chat ID</th>
                <th className="pb-3 pr-4">Agent</th>
                <th className="pb-3 pr-4">Last Active</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.chat_id} className="border-b border-zinc-800/50">
                  <td className="py-3 pr-4 font-mono text-zinc-300">{s.chat_id}</td>
                  <td className="py-3 pr-4">
                    <select
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                      value={s.agent_id ?? ''}
                      onChange={e => handleAgentChange(s.chat_id, e.target.value)}
                    >
                      <option value="">No agent</option>
                      {agentList.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">
                    {new Date(s.updated_at * 1000).toLocaleString()}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleClear(s.chat_id)}
                      className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors"
                    >
                      Clear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
