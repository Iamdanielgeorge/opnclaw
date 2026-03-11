import { useEffect, useState } from 'react'
import { tasks } from '../api'
import type { Task } from '../api'

export default function TasksTab() {
  const [list, setList] = useState<Task[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ chat_id: '', prompt: '', schedule: '' })
  const [error, setError] = useState('')

  const load = () => tasks.list().then(setList).catch(() => {})

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    setError('')
    if (!form.chat_id || !form.prompt || !form.schedule) {
      setError('All fields are required')
      return
    }
    try {
      await tasks.create(form)
      setShowForm(false)
      setForm({ chat_id: '', prompt: '', schedule: '' })
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDelete = async (id: string) => {
    await tasks.delete(id)
    load()
  }

  const handleToggle = async (t: Task) => {
    if (t.status === 'active') {
      await tasks.pause(t.id)
    } else {
      await tasks.resume(t.id)
    }
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Scheduled Tasks</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
        >
          + New Task
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
          <h3 className="font-medium">New Scheduled Task</h3>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            placeholder="Chat ID"
            value={form.chat_id}
            onChange={e => setForm(f => ({ ...f, chat_id: e.target.value }))}
          />
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            placeholder="Prompt"
            value={form.prompt}
            onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
          />
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            placeholder="Cron expression (e.g. 0 9 * * *)"
            value={form.schedule}
            onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded transition-colors">Create</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-zinc-500 text-sm">No scheduled tasks.</p>
      ) : (
        <div className="space-y-3">
          {list.map(t => (
            <div key={t.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${t.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {t.status}
                  </span>
                  <span className="text-xs font-mono text-zinc-500">{t.id}</span>
                </div>
                <span className="text-xs font-mono text-zinc-500">{t.schedule}</span>
              </div>
              <p className="text-sm text-zinc-300 mb-2">{t.prompt}</p>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Next: {new Date(t.next_run * 1000).toLocaleString()}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleToggle(t)} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">
                    {t.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
