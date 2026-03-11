const BASE = '/api'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

// Agents
export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string
  model: string
  tools: string
  disallowed_tools: string
  is_default: number
  is_active: number
  created_at: number
  updated_at: number
}

export const agents = {
  list: () => request<Agent[]>('/agents'),
  get: (id: string) => request<Agent>(`/agents/${id}`),
  create: (data: Partial<Agent>) => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Agent>) => request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) => request<{ ok: boolean }>(`/agents/${id}/default`, { method: 'POST' }),
}

// Skills
export interface Skill {
  path: string
  name: string
  description: string
  source: 'user' | 'project'
  enabled: boolean
}

export const skills = {
  list: () => request<Skill[]>('/skills'),
  toggle: (path: string, enabled: boolean) => request<{ ok: boolean }>('/skills/toggle', { method: 'PUT', body: JSON.stringify({ path, enabled }) }),
}

// Sessions
export interface Session {
  chat_id: string
  session_id: string
  agent_id: string | null
  updated_at: number
}

export const sessions = {
  list: () => request<Session[]>('/sessions'),
  clear: (chatId: string) => request<{ ok: boolean }>(`/sessions/${chatId}`, { method: 'DELETE' }),
  setAgent: (chatId: string, agentId: string | null) => request<{ ok: boolean }>(`/sessions/${chatId}/agent`, { method: 'PUT', body: JSON.stringify({ agent_id: agentId }) }),
}

// Tasks
export interface Task {
  id: string
  chat_id: string
  prompt: string
  schedule: string
  next_run: number
  last_run: number | null
  status: string
}

export const tasks = {
  list: () => request<Task[]>('/tasks'),
  create: (data: { chat_id: string; prompt: string; schedule: string }) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  pause: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/resume`, { method: 'POST' }),
}

// Memories
export interface Memory {
  id: number
  content: string
  sector: string
  salience: number
  created_at?: number
}

export const memories = {
  list: (chatId: string, q?: string) => {
    const params = new URLSearchParams({ chatId })
    if (q) params.set('q', q)
    return request<Memory[]>(`/memories?${params}`)
  },
  delete: (id: number) => request<{ ok: boolean }>(`/memories/${id}`, { method: 'DELETE' }),
}

// Activity
export interface ActivityItem {
  id: number
  event_type: string
  agent_id: string | null
  chat_id: string | null
  summary: string
  metadata: string
  created_at: number
}

export const activity = {
  recent: (limit = 50) => request<ActivityItem[]>(`/activity?limit=${limit}`),
}

// Usage
export interface UsageRecord {
  id: number
  chat_id: string
  agent_id: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  total_cost_usd: number
  duration_ms: number
  num_turns: number
  model: string | null
  source: string
  created_at: number
}

export interface UsageStats {
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  total_messages: number
  today_tokens: number
  today_cost: number
  today_messages: number
  by_model: Array<{ model: string; count: number; cost: number; tokens: number }>
  by_source: Array<{ source: string; count: number; cost: number }>
  by_day: Array<{ day: string; count: number; cost: number; tokens: number }>
}

export const usage = {
  recent: (limit = 50) => request<UsageRecord[]>(`/usage?limit=${limit}`),
  stats: () => request<UsageStats>('/usage/stats'),
  byChat: (chatId: string) => request<UsageRecord[]>(`/usage/${chatId}`),
}

// Chat
export interface ChatMessage {
  id: number
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

export interface ChatSession {
  chat_id: string
  message_count: number
  last_message: string
  last_at: number
}

export interface ChatResponse {
  response: string
  chatId: string
  usage: {
    input_tokens: number
    output_tokens: number
    total_cost_usd: number
    duration_ms: number
    model: string | null
  } | null
}

export const chat = {
  send: (message: string, chatId?: string, agentId?: string) =>
    request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify({ message, chatId, agentId }) }),
  messages: (chatId: string) => request<ChatMessage[]>(`/chat/${chatId}/messages`),
  sessions: () => request<ChatSession[]>('/chat/sessions'),
  delete: (chatId: string) => request<{ ok: boolean }>(`/chat/${chatId}`, { method: 'DELETE' }),
}

// System
export interface SystemStatus {
  uptime_ms: number
  uptime_human: string
  db_size_bytes: number
  db_size_human: string
  node_version: string
  dashboard_port: number
  telegram_configured: boolean
  groq_configured: boolean
  google_configured: boolean
  pid: number
  memory_usage_mb: number
}

export const system = {
  status: () => request<SystemStatus>('/system/status'),
}
