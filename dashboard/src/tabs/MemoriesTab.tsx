import { useState } from 'react'
import { memories } from '../api'
import type { Memory } from '../api'

export default function MemoriesTab() {
  const [chatId, setChatId] = useState('')
  const [search, setSearch] = useState('')
  const [list, setList] = useState<Memory[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    if (!chatId.trim()) return
    setLoaded(true)
    try {
      const data = await memories.list(chatId.trim(), search.trim() || undefined)
      setList(data)
    } catch {
      setList([])
    }
  }

  const handleDelete = async (id: number) => {
    await memories.delete(id)
    setList(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Memories</h2>

      <div className="flex gap-3 mb-6">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
          placeholder="Chat ID"
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
          placeholder="Search (optional)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <button onClick={load} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
          Load
        </button>
      </div>

      {!loaded ? (
        <p className="text-zinc-500 text-sm">Enter a chat ID to view memories.</p>
      ) : list.length === 0 ? (
        <p className="text-zinc-500 text-sm">No memories found.</p>
      ) : (
        <div className="space-y-2">
          {list.map(m => (
            <div key={m.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${m.sector === 'semantic' ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {m.sector}
                  </span>
                  <span className="text-xs text-zinc-500">salience: {m.salience.toFixed(2)}</span>
                </div>
                <p className="text-sm text-zinc-300">{m.content}</p>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
