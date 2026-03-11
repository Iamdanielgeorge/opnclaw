import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'
import ActivityTab from './tabs/ActivityTab'
import AgentsTab from './tabs/AgentsTab'
import SkillsTab from './tabs/SkillsTab'
import SessionsTab from './tabs/SessionsTab'
import TasksTab from './tabs/TasksTab'
import MemoriesTab from './tabs/MemoriesTab'
import UsageTab from './tabs/UsageTab'
import ChatTab from './tabs/ChatTab'
import SystemTab from './tabs/SystemTab'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/activity" replace />} />
        <Route path="/activity" element={<ActivityTab />} />
        <Route path="/agents" element={<AgentsTab />} />
        <Route path="/skills" element={<SkillsTab />} />
        <Route path="/sessions" element={<SessionsTab />} />
        <Route path="/tasks" element={<TasksTab />} />
        <Route path="/memories" element={<MemoriesTab />} />
        <Route path="/usage" element={<UsageTab />} />
        <Route path="/chat" element={<ChatTab />} />
        <Route path="/system" element={<SystemTab />} />
      </Route>
    </Routes>
  )
}
