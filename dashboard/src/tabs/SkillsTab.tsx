import { useEffect, useState } from 'react'
import { skills } from '../api'
import type { Skill } from '../api'

export default function SkillsTab() {
  const [list, setList] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    skills.list().then(setList).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleToggle = async (skill: Skill) => {
    await skills.toggle(skill.path, !skill.enabled)
    setList(prev => prev.map(s => s.path === skill.path ? { ...s, enabled: !s.enabled } : s))
  }

  if (loading) return <p className="text-zinc-500 text-sm">Scanning skills...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Skills</h2>
        <button onClick={load} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
          Rescan
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-zinc-500 text-sm">No skills found in ~/.claude/skills/ or .claude/skills/</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(s => (
            <div key={s.path} className={`p-4 bg-zinc-900 border rounded-lg transition-colors ${s.enabled ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-zinc-100">{s.name}</h3>
                <button
                  onClick={() => handleToggle(s)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${s.enabled ? 'bg-violet-600' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.enabled ? 'left-5.5' : 'left-0.5'}`} />
                </button>
              </div>
              {s.description && <p className="text-sm text-zinc-400 mb-2">{s.description}</p>}
              <span className={`text-xs px-2 py-0.5 rounded ${s.source === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                {s.source}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
