import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { STORE_DIR } from './config.js'
import { logger } from './logger.js'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first')
  return db
}

export function initDatabase(): void {
  mkdirSync(STORE_DIR, { recursive: true })
  const dbPath = join(STORE_DIR, 'claudeclaw.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      chat_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Full memory system
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      topic_key TEXT,
      content TEXT NOT NULL,
      sector TEXT NOT NULL CHECK(sector IN ('semantic','episodic')),
      salience REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL
    )
  `)

  // FTS5 virtual table for memory search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content_rowid=id
    )
  `)

  // Triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END
  `)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
    END
  `)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END
  `)

  // Scheduler
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule TEXT NOT NULL,
      next_run INTEGER NOT NULL,
      last_run INTEGER,
      last_result TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
      created_at INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status_next ON scheduled_tasks(status, next_run)
  `)

  // Dashboard: Agents
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT 'inherit',
      tools TEXT NOT NULL DEFAULT '[]',
      disallowed_tools TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Dashboard: Skill overrides
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_overrides (
      skill_path TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )
  `)

  // Dashboard: Activity log
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      agent_id TEXT,
      chat_id TEXT,
      summary TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC)
  `)

  // Migrate sessions: add agent_id column if missing
  const sessionCols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>
  if (!sessionCols.some(c => c.name === 'agent_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN agent_id TEXT')
  }

  // WhatsApp bridge
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
      created_at INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_messages (
      id TEXT PRIMARY KEY,
      jid TEXT NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_from_me INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_message_map (
      wa_jid TEXT NOT NULL,
      telegram_chat_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (wa_jid, telegram_chat_id)
    )
  `)

  // Usage tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      agent_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      num_turns INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      source TEXT NOT NULL DEFAULT 'telegram',
      created_at INTEGER NOT NULL
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_chat ON usage_log(chat_id, created_at DESC)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at DESC)`)

  // Web chat messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages ON chat_messages(chat_id, created_at ASC)`)

  logger.info('Database initialized')
}

// --- Sessions ---

export function getSession(chatId: string): string | undefined {
  const row = getDb().prepare('SELECT session_id FROM sessions WHERE chat_id = ?').get(chatId) as { session_id: string } | undefined
  return row?.session_id
}

export function setSession(chatId: string, sessionId: string): void {
  getDb().prepare(`
    INSERT INTO sessions (chat_id, session_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at
  `).run(chatId, sessionId, Math.floor(Date.now() / 1000))
}

export function clearSession(chatId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE chat_id = ?').run(chatId)
}

// --- Memories ---

export function insertMemory(chatId: string, content: string, sector: 'semantic' | 'episodic', topicKey?: string): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    INSERT INTO memories (chat_id, topic_key, content, sector, salience, created_at, accessed_at)
    VALUES (?, ?, ?, ?, 1.0, ?, ?)
  `).run(chatId, topicKey ?? null, content, sector, now, now)
}

export function searchMemories(query: string, chatId: string, limit = 3): Array<{ id: number; content: string; sector: string; salience: number }> {
  // Sanitize query for FTS5
  const sanitized = query.replace(/[^\w\s]/g, '').trim()
  if (!sanitized) return []
  const ftsQuery = sanitized.split(/\s+/).map(w => w + '*').join(' ')

  try {
    return getDb().prepare(`
      SELECT m.id, m.content, m.sector, m.salience
      FROM memories_fts f
      JOIN memories m ON f.rowid = m.id
      WHERE memories_fts MATCH ? AND m.chat_id = ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, chatId, limit) as Array<{ id: number; content: string; sector: string; salience: number }>
  } catch {
    return []
  }
}

export function getRecentMemories(chatId: string, limit = 5): Array<{ id: number; content: string; sector: string; salience: number }> {
  return getDb().prepare(`
    SELECT id, content, sector, salience
    FROM memories WHERE chat_id = ?
    ORDER BY accessed_at DESC
    LIMIT ?
  `).all(chatId, limit) as Array<{ id: number; content: string; sector: string; salience: number }>
}

export function touchMemory(id: number): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    UPDATE memories SET accessed_at = ?, salience = MIN(salience + 0.1, 5.0) WHERE id = ?
  `).run(now, id)
}

export function decayMemories(): void {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400
  getDb().prepare('UPDATE memories SET salience = salience * 0.98 WHERE created_at < ?').run(oneDayAgo)
  const deleted = getDb().prepare('DELETE FROM memories WHERE salience < 0.1').run()
  if (deleted.changes > 0) {
    logger.info({ deleted: deleted.changes }, 'Decayed and pruned stale memories')
  }
}

export function getMemoriesForDisplay(chatId: string, limit = 10): Array<{ content: string; sector: string; salience: number }> {
  return getDb().prepare(`
    SELECT content, sector, salience FROM memories
    WHERE chat_id = ?
    ORDER BY salience DESC, accessed_at DESC
    LIMIT ?
  `).all(chatId, limit) as Array<{ content: string; sector: string; salience: number }>
}

// --- Scheduled Tasks ---

export function createTask(id: string, chatId: string, prompt: string, schedule: string, nextRun: number): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, chatId, prompt, schedule, nextRun, now)
}

export function getDueTasks(): Array<{ id: string; chat_id: string; prompt: string; schedule: string }> {
  const now = Math.floor(Date.now() / 1000)
  return getDb().prepare(`
    SELECT id, chat_id, prompt, schedule
    FROM scheduled_tasks
    WHERE status = 'active' AND next_run <= ?
  `).all(now) as Array<{ id: string; chat_id: string; prompt: string; schedule: string }>
}

export function updateTaskAfterRun(id: string, lastResult: string, nextRun: number): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    UPDATE scheduled_tasks SET last_run = ?, last_result = ?, next_run = ? WHERE id = ?
  `).run(now, lastResult, nextRun, id)
}

export function getAllTasks(): Array<{ id: string; chat_id: string; prompt: string; schedule: string; next_run: number; last_run: number | null; status: string }> {
  return getDb().prepare('SELECT id, chat_id, prompt, schedule, next_run, last_run, status FROM scheduled_tasks ORDER BY created_at DESC').all() as Array<{ id: string; chat_id: string; prompt: string; schedule: string; next_run: number; last_run: number | null; status: string }>
}

export function deleteTask(id: string): boolean {
  return getDb().prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id).changes > 0
}

export function pauseTask(id: string): boolean {
  return getDb().prepare("UPDATE scheduled_tasks SET status = 'paused' WHERE id = ?").run(id).changes > 0
}

export function resumeTask(id: string): boolean {
  return getDb().prepare("UPDATE scheduled_tasks SET status = 'active' WHERE id = ?").run(id).changes > 0
}

// --- WhatsApp ---

export function queueWaMessage(jid: string, body: string): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare('INSERT INTO wa_outbox (jid, body, created_at) VALUES (?, ?, ?)').run(jid, body, now)
}

export function getPendingWaMessages(): Array<{ id: number; jid: string; body: string }> {
  return getDb().prepare("SELECT id, jid, body FROM wa_outbox WHERE status = 'pending' ORDER BY created_at ASC").all() as Array<{ id: number; jid: string; body: string }>
}

export function markWaMessageSent(id: number): void {
  getDb().prepare("UPDATE wa_outbox SET status = 'sent' WHERE id = ?").run(id)
}

export function markWaMessageFailed(id: number): void {
  getDb().prepare("UPDATE wa_outbox SET status = 'failed' WHERE id = ?").run(id)
}

export function saveWaIncoming(id: string, jid: string, sender: string, body: string, timestamp: number): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO wa_messages (id, jid, sender, body, timestamp, is_from_me)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, jid, sender, body, timestamp)
}

export function getWaChats(limit = 10): Array<{ jid: string; last_message: string; timestamp: number }> {
  return getDb().prepare(`
    SELECT jid, body AS last_message, MAX(timestamp) AS timestamp
    FROM wa_messages
    GROUP BY jid
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit) as Array<{ jid: string; last_message: string; timestamp: number }>
}

export function getWaMessages(jid: string, limit = 20): Array<{ sender: string; body: string; timestamp: number; is_from_me: number }> {
  return getDb().prepare(`
    SELECT sender, body, timestamp, is_from_me
    FROM wa_messages WHERE jid = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(jid, limit) as Array<{ sender: string; body: string; timestamp: number; is_from_me: number }>
}

export function setWaMapping(waJid: string, telegramChatId: string): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    INSERT OR REPLACE INTO wa_message_map (wa_jid, telegram_chat_id, created_at) VALUES (?, ?, ?)
  `).run(waJid, telegramChatId, now)
}

export function getTelegramChatForWa(waJid: string): string | undefined {
  const row = getDb().prepare('SELECT telegram_chat_id FROM wa_message_map WHERE wa_jid = ?').get(waJid) as { telegram_chat_id: string } | undefined
  return row?.telegram_chat_id
}

// --- Agents ---

export interface AgentRow {
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

export function getAllAgents(): AgentRow[] {
  return getDb().prepare('SELECT * FROM agents ORDER BY is_default DESC, created_at ASC').all() as AgentRow[]
}

export function getAgent(id: string): AgentRow | undefined {
  return getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
}

export function getDefaultAgent(): AgentRow | undefined {
  return getDb().prepare('SELECT * FROM agents WHERE is_default = 1 LIMIT 1').get() as AgentRow | undefined
}

export function createAgent(agent: Omit<AgentRow, 'created_at' | 'updated_at'>): void {
  const now = Math.floor(Date.now() / 1000)
  if (agent.is_default) {
    getDb().prepare('UPDATE agents SET is_default = 0').run()
  }
  getDb().prepare(`
    INSERT INTO agents (id, name, description, system_prompt, model, tools, disallowed_tools, is_default, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agent.id, agent.name, agent.description, agent.system_prompt, agent.model, agent.tools, agent.disallowed_tools, agent.is_default, agent.is_active, now, now)
}

export function updateAgent(id: string, updates: Partial<Omit<AgentRow, 'id' | 'created_at'>>): boolean {
  const now = Math.floor(Date.now() / 1000)
  const existing = getAgent(id)
  if (!existing) return false

  if (updates.is_default) {
    getDb().prepare('UPDATE agents SET is_default = 0').run()
  }

  const merged = { ...existing, ...updates, updated_at: now }
  getDb().prepare(`
    UPDATE agents SET name = ?, description = ?, system_prompt = ?, model = ?, tools = ?, disallowed_tools = ?, is_default = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.name, merged.description, merged.system_prompt, merged.model, merged.tools, merged.disallowed_tools, merged.is_default, merged.is_active, merged.updated_at, id)
  return true
}

export function deleteAgent(id: string): boolean {
  return getDb().prepare('DELETE FROM agents WHERE id = ?').run(id).changes > 0
}

export function setDefaultAgent(id: string): boolean {
  const exists = getAgent(id)
  if (!exists) return false
  getDb().prepare('UPDATE agents SET is_default = 0').run()
  getDb().prepare('UPDATE agents SET is_default = 1 WHERE id = ?').run(id)
  return true
}

// --- Session agent assignment ---

export function getSessionWithAgent(chatId: string): { session_id: string; agent_id: string | null } | undefined {
  return getDb().prepare('SELECT session_id, agent_id FROM sessions WHERE chat_id = ?').get(chatId) as { session_id: string; agent_id: string | null } | undefined
}

export function setSessionAgent(chatId: string, agentId: string | null): boolean {
  return getDb().prepare('UPDATE sessions SET agent_id = ? WHERE chat_id = ?').run(agentId, chatId).changes > 0
}

export function getAllSessions(): Array<{ chat_id: string; session_id: string; agent_id: string | null; updated_at: number }> {
  return getDb().prepare('SELECT chat_id, session_id, agent_id, updated_at FROM sessions ORDER BY updated_at DESC').all() as Array<{ chat_id: string; session_id: string; agent_id: string | null; updated_at: number }>
}

// --- Skill Overrides ---

export interface SkillOverrideRow {
  skill_path: string
  enabled: number
  updated_at: number
}

export function getSkillOverrides(): SkillOverrideRow[] {
  return getDb().prepare('SELECT * FROM skill_overrides').all() as SkillOverrideRow[]
}

export function setSkillOverride(skillPath: string, enabled: boolean): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    INSERT INTO skill_overrides (skill_path, enabled, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(skill_path) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
  `).run(skillPath, enabled ? 1 : 0, now)
}

// --- Activity Log ---

export interface ActivityRow {
  id: number
  event_type: string
  agent_id: string | null
  chat_id: string | null
  summary: string
  metadata: string
  created_at: number
}

export function insertActivity(eventType: string, summary: string, opts?: { agentId?: string; chatId?: string; metadata?: Record<string, unknown> }): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    INSERT INTO activity_log (event_type, agent_id, chat_id, summary, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(eventType, opts?.agentId ?? null, opts?.chatId ?? null, summary, JSON.stringify(opts?.metadata ?? {}), now)
}

export function getRecentActivity(limit = 50): ActivityRow[] {
  return getDb().prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit) as ActivityRow[]
}

export function deleteMemory(id: number): boolean {
  return getDb().prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0
}

export function getMemoriesByChatId(chatId: string, limit = 50): Array<{ id: number; content: string; sector: string; salience: number; created_at: number }> {
  return getDb().prepare('SELECT id, content, sector, salience, created_at FROM memories WHERE chat_id = ? ORDER BY salience DESC, accessed_at DESC LIMIT ?').all(chatId, limit) as Array<{ id: number; content: string; sector: string; salience: number; created_at: number }>
}

// --- Usage Log ---

export interface UsageRow {
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

export function insertUsage(data: {
  chatId: string
  agentId?: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
  durationMs: number
  numTurns: number
  model: string | null
  source: string
}): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    INSERT INTO usage_log (chat_id, agent_id, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_cost_usd, duration_ms, num_turns, model, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.chatId, data.agentId ?? null, data.inputTokens, data.outputTokens, data.cacheReadTokens, data.cacheCreationTokens, data.totalCostUsd, data.durationMs, data.numTurns, data.model, data.source, now)
}

export function getRecentUsage(limit = 50): UsageRow[] {
  return getDb().prepare('SELECT * FROM usage_log ORDER BY created_at DESC LIMIT ?').all(limit) as UsageRow[]
}

export function getUsageByChatId(chatId: string, limit = 50): UsageRow[] {
  return getDb().prepare('SELECT * FROM usage_log WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?').all(chatId, limit) as UsageRow[]
}

export function getUsageStats(): {
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  total_messages: number
  by_model: Array<{ model: string; count: number; cost: number; tokens: number }>
  by_source: Array<{ source: string; count: number; cost: number }>
  by_day: Array<{ day: string; count: number; cost: number; tokens: number }>
  today_tokens: number
  today_cost: number
  today_messages: number
} {
  const totals = getDb().prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(total_cost_usd), 0) as total_cost_usd,
      COUNT(*) as total_messages
    FROM usage_log
  `).get() as { total_input_tokens: number; total_output_tokens: number; total_cost_usd: number; total_messages: number }

  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
  const today = getDb().prepare(`
    SELECT
      COALESCE(SUM(input_tokens + output_tokens), 0) as today_tokens,
      COALESCE(SUM(total_cost_usd), 0) as today_cost,
      COUNT(*) as today_messages
    FROM usage_log WHERE created_at >= ?
  `).get(startOfDay) as { today_tokens: number; today_cost: number; today_messages: number }

  const by_model = getDb().prepare(`
    SELECT model, COUNT(*) as count, SUM(total_cost_usd) as cost, SUM(input_tokens + output_tokens) as tokens
    FROM usage_log WHERE model IS NOT NULL
    GROUP BY model ORDER BY cost DESC
  `).all() as Array<{ model: string; count: number; cost: number; tokens: number }>

  const by_source = getDb().prepare(`
    SELECT source, COUNT(*) as count, SUM(total_cost_usd) as cost
    FROM usage_log GROUP BY source ORDER BY count DESC
  `).all() as Array<{ source: string; count: number; cost: number }>

  const by_day = getDb().prepare(`
    SELECT date(created_at, 'unixepoch') as day, COUNT(*) as count, SUM(total_cost_usd) as cost, SUM(input_tokens + output_tokens) as tokens
    FROM usage_log
    GROUP BY day ORDER BY day DESC LIMIT 7
  `).all() as Array<{ day: string; count: number; cost: number; tokens: number }>

  return { ...totals, ...today, by_model, by_source, by_day }
}

// --- Chat Messages ---

export interface ChatMessageRow {
  id: number
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

export function insertChatMessage(chatId: string, role: 'user' | 'assistant', content: string): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare('INSERT INTO chat_messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(chatId, role, content, now)
}

export function getChatMessages(chatId: string, limit = 100): ChatMessageRow[] {
  return getDb().prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?').all(chatId, limit) as ChatMessageRow[]
}

export function getChatSessions(): Array<{ chat_id: string; message_count: number; last_message: string; last_at: number }> {
  return getDb().prepare(`
    SELECT chat_id, COUNT(*) as message_count,
      (SELECT content FROM chat_messages c2 WHERE c2.chat_id = c1.chat_id ORDER BY created_at DESC LIMIT 1) as last_message,
      MAX(created_at) as last_at
    FROM chat_messages c1
    WHERE chat_id LIKE 'web_%'
    GROUP BY chat_id
    ORDER BY last_at DESC
  `).all() as Array<{ chat_id: string; message_count: number; last_message: string; last_at: number }>
}

export function deleteChatSession(chatId: string): boolean {
  return getDb().prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(chatId).changes > 0
}
