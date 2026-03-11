import { useEffect, useState } from 'react'
import { agents } from '../api'
import type { Agent } from '../api'

interface FormData {
  name: string
  description: string
  system_prompt: string
  model: string
}

const emptyForm: FormData = { name: '', description: '', system_prompt: '', model: 'inherit' }

export default function AgentsTab() {
  const [list, setList] = useState<Agent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [error, setError] = useState('')

  const load = () => agents.list().then(setList).catch(() => {})

  useEffect(() => { load() }, [])

  const handleSubmit = async () => {
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    try {
      if (editId) {
        await agents.update(editId, form)
      } else {
        await agents.create(form)
      }
      setShowForm(false)
      setEditId(null)
      setForm(emptyForm)
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleEdit = (a: Agent) => {
    setEditId(a.id)
    setForm({ name: a.name, description: a.description, system_prompt: a.system_prompt, model: a.model })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await agents.delete(id)
    load()
  }

  const handleSetDefault = async (id: string) => {
    await agents.setDefault(id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Agents</h2>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm) }}
          className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
        >
          + New Agent
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
          <h3 className="font-medium">{editId ? 'Edit Agent' : 'New Agent'}</h3>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            placeholder="Agent name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            placeholder="Description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            value={form.model}
            onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
          >
            <option value="inherit">Inherit (default)</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm h-32 resize-y focus:outline-none focus:border-violet-500"
            placeholder="System prompt..."
            value={form.system_prompt}
            onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
          />
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded transition-colors">
              {editId ? 'Save' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-zinc-500 text-sm">No agents configured. Create one to customize how ClaudeClaw responds.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(a => (
            <div key={a.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-zinc-100">{a.name}</h3>
                <div className="flex items-center gap-2">
                  {a.is_default ? (
                    <span className="text-xs px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded">default</span>
                  ) : null}
                  <span className="text-xs px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded font-mono">{a.model}</span>
                </div>
              </div>
              {a.description && <p className="text-sm text-zinc-400 mb-3">{a.description}</p>}
              {a.system_prompt && (
                <p className="text-xs text-zinc-500 bg-zinc-800 rounded p-2 mb-3 line-clamp-3 font-mono">{a.system_prompt}</p>
              )}
              <div className="flex gap-2 text-xs">
                <button onClick={() => handleEdit(a)} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">Edit</button>
                {!a.is_default && (
                  <button onClick={() => handleSetDefault(a.id)} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">Set Default</button>
                )}
                <button onClick={() => handleDelete(a.id)} className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
