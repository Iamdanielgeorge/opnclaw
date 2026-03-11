import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync } from 'fs'

// We test the DB schema and queries directly to avoid side effects
// from importing the actual db module (which connects to store/claudeclaw.db)

const TEST_DIR = join(process.cwd(), 'store', 'test')
const TEST_DB_PATH = join(TEST_DIR, 'test.db')

function createTestDb(): Database.Database {
  mkdirSync(TEST_DIR, { recursive: true })
  const db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      chat_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

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

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content_rowid=id
    )
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END
  `)

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

  return db
}

describe('database', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('sessions', () => {
    it('stores and retrieves a session', () => {
      const now = Math.floor(Date.now() / 1000)
      db.prepare('INSERT INTO sessions (chat_id, session_id, updated_at) VALUES (?, ?, ?)').run('123', 'sess-abc', now)

      const row = db.prepare('SELECT session_id FROM sessions WHERE chat_id = ?').get('123') as { session_id: string }
      expect(row.session_id).toBe('sess-abc')
    })

    it('updates session on conflict', () => {
      const now = Math.floor(Date.now() / 1000)
      db.prepare(`
        INSERT INTO sessions (chat_id, session_id, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at
      `).run('123', 'sess-1', now)

      db.prepare(`
        INSERT INTO sessions (chat_id, session_id, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at
      `).run('123', 'sess-2', now + 1)

      const row = db.prepare('SELECT session_id FROM sessions WHERE chat_id = ?').get('123') as { session_id: string }
      expect(row.session_id).toBe('sess-2')
    })

    it('deletes a session', () => {
      const now = Math.floor(Date.now() / 1000)
      db.prepare('INSERT INTO sessions (chat_id, session_id, updated_at) VALUES (?, ?, ?)').run('123', 'sess-abc', now)
      db.prepare('DELETE FROM sessions WHERE chat_id = ?').run('123')

      const row = db.prepare('SELECT session_id FROM sessions WHERE chat_id = ?').get('123')
      expect(row).toBeUndefined()
    })
  })

  describe('memories', () => {
    it('inserts and searches via FTS', () => {
      const now = Math.floor(Date.now() / 1000)
      db.prepare(`
        INSERT INTO memories (chat_id, content, sector, salience, created_at, accessed_at)
        VALUES (?, ?, ?, 1.0, ?, ?)
      `).run('123', 'I prefer dark mode for all editors', 'semantic', now, now)

      db.prepare(`
        INSERT INTO memories (chat_id, content, sector, salience, created_at, accessed_at)
        VALUES (?, ?, ?, 1.0, ?, ?)
      `).run('123', 'Had lunch at the diner', 'episodic', now, now)

      const results = db.prepare(`
        SELECT m.id, m.content, m.sector
        FROM memories_fts f JOIN memories m ON f.rowid = m.id
        WHERE memories_fts MATCH 'dark*' AND m.chat_id = '123'
      `).all() as Array<{ id: number; content: string; sector: string }>

      expect(results).toHaveLength(1)
      expect(results[0].content).toContain('dark mode')
    })

    it('enforces sector check constraint', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(() => {
        db.prepare(`
          INSERT INTO memories (chat_id, content, sector, salience, created_at, accessed_at)
          VALUES (?, ?, ?, 1.0, ?, ?)
        `).run('123', 'test', 'invalid', now, now)
      }).toThrow()
    })

    it('decays memory salience', () => {
      const oldTime = Math.floor(Date.now() / 1000) - 86400 * 2
      db.prepare(`
        INSERT INTO memories (chat_id, content, sector, salience, created_at, accessed_at)
        VALUES (?, ?, ?, 1.0, ?, ?)
      `).run('123', 'old memory', 'episodic', oldTime, oldTime)

      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400
      db.prepare('UPDATE memories SET salience = salience * 0.98 WHERE created_at < ?').run(oneDayAgo)

      const row = db.prepare('SELECT salience FROM memories WHERE chat_id = ?').get('123') as { salience: number }
      expect(row.salience).toBeCloseTo(0.98, 2)
    })
  })

  describe('scheduled tasks', () => {
    it('creates and retrieves tasks', () => {
      const now = Math.floor(Date.now() / 1000)
      db.prepare(`
        INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-1', '123', 'check emails', '0 9 * * *', now + 3600, now)

      const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE chat_id = ?').all('123') as Array<{ id: string }>
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-1')
    })

    it('finds due tasks', () => {
      const now = Math.floor(Date.now() / 1000)
      db.prepare(`
        INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('due', '123', 'do thing', '* * * * *', now - 60, now - 120)

      db.prepare(`
        INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('future', '123', 'later thing', '0 9 * * *', now + 3600, now)

      const due = db.prepare(`
        SELECT id FROM scheduled_tasks WHERE status = 'active' AND next_run <= ?
      `).all(now) as Array<{ id: string }>

      expect(due).toHaveLength(1)
      expect(due[0].id).toBe('due')
    })
  })
})
