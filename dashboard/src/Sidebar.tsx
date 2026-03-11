import { NavLink } from 'react-router-dom'

const tabs = [
  { path: '/activity', label: 'Activity', icon: '~' },
  { path: '/agents', label: 'Agents', icon: '@' },
  { path: '/skills', label: 'Skills', icon: '#' },
  { path: '/sessions', label: 'Sessions', icon: '>' },
  { path: '/tasks', label: 'Tasks', icon: '*' },
  { path: '/memories', label: 'Memories', icon: '?' },
  { path: '/usage', label: 'Usage', icon: '$' },
  { path: '/chat', label: 'Chat', icon: '%' },
  { path: '/system', label: 'System', icon: '!' },
]

export default function Sidebar() {
  return (
    <nav className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">ClaudeClaw</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Dashboard</p>
      </div>
      <div className="flex-1 py-2">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 border-r-2 border-violet-500'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`
            }
          >
            <span className="w-4 text-center font-mono text-xs text-zinc-500">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600">
        localhost:3333
      </div>
    </nav>
  )
}
