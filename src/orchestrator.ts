import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'team.db');

// Bot routing configuration
const BOT_ROUTES = {
  ops: {
    triggers: ['schedule', 'workflow', 'coordinate', 'assign', 'delegate', 'standup', 'ops', 'operations', 'calendar', 'meeting'],
    skill: 'ops-bot'
  },
  research: {
    triggers: ['research', 'investigate', 'competitor', 'intel', 'market', 'analyze', 'deep dive', 'report on'],
    skill: 'research-bot'
  },
  marketing: {
    triggers: ['content', 'social', 'campaign', 'brand', 'post', 'audience', 'engagement', 'ads'],
    skill: 'marketing-bot'
  },
  finance: {
    triggers: ['budget', 'expense', 'invoice', 'payment', 'money', 'cost', 'revenue', 'profit', 'financial'],
    skill: 'finance-bot'
  },
  support: {
    triggers: ['customer', 'ticket', 'complaint', 'help', 'issue', 'problem', 'support', 'user'],
    skill: 'support-bot'
  }
};

export class Orchestrator {
  private db: Database.Database;

  constructor() {
    this.db = new Database(dbPath);
  }

  // Detect which bot should handle a message
  routeMessage(message: string): string | null {
    const lower = message.toLowerCase();
    
    for (const [bot, config] of Object.entries(BOT_ROUTES)) {
      for (const trigger of config.triggers) {
        if (lower.includes(trigger)) {
          return bot;
        }
      }
    }
    
    // Default to ops for coordination tasks
    return null;
  }

  // Send message between bots
  sendBotMessage(from: string, to: string, message: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO bot_messages (from_bot, to_bot, message, status, created_at)
      VALUES (?, ?, ?, 'pending', datetime('now'))
    `);
    const result = stmt.run(from, to, message);
    return result.lastInsertRowid as number;
  }

  // Get pending messages for a bot
  getPendingMessages(bot: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM bot_messages 
      WHERE to_bot = ? AND status = 'pending'
      ORDER BY created_at ASC
    `);
    return stmt.all(bot);
  }

  // Mark message as actioned
  markActioned(messageId: number, response: string): void {
    const stmt = this.db.prepare(`
      UPDATE bot_messages 
      SET status = 'actioned', response = ?, responded_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(response, messageId);
  }

  // Log activity
  logActivity(bot: string, action: string, details?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (bot, action, details, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    stmt.run(bot, action, details || null);
  }

  // Create task
  createTask(title: string, owner: string, options: {
    description?: string;
    priority?: string;
    dueDate?: string;
  } = {}): number {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (title, description, owner, priority, due_date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `);
    const result = stmt.run(
      title,
      options.description || null,
      owner,
      options.priority || 'medium',
      options.dueDate || null
    );
    return result.lastInsertRowid as number;
  }

  // Get tasks for a bot
  getTasks(owner: string, status?: string): any[] {
    let query = 'SELECT * FROM tasks WHERE owner = ?';
    const params: any[] = [owner];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY priority DESC, due_date ASC';
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // Update task status
  updateTaskStatus(taskId: number, status: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(status, taskId);
  }

  // Get daily summary
  getDailySummary(): {
    pendingTasks: number;
    inProgressTasks: number;
    blockedTasks: number;
    openTickets: number;
    pendingMessages: number;
  } {
    const tasks = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM tasks 
      WHERE status != 'done' 
      GROUP BY status
    `).all() as { status: string; count: number }[];
    
    const tickets = this.db.prepare(`
      SELECT COUNT(*) as count FROM tickets WHERE status IN ('open', 'in_progress')
    `).get() as { count: number };
    
    const messages = this.db.prepare(`
      SELECT COUNT(*) as count FROM bot_messages WHERE status = 'pending'
    `).get() as { count: number };

    const summary = {
      pendingTasks: 0,
      inProgressTasks: 0,
      blockedTasks: 0,
      openTickets: tickets.count,
      pendingMessages: messages.count
    };

    for (const t of tasks) {
      if (t.status === 'pending') summary.pendingTasks = t.count;
      if (t.status === 'in_progress') summary.inProgressTasks = t.count;
      if (t.status === 'blocked') summary.blockedTasks = t.count;
    }

    return summary;
  }

  close(): void {
    this.db.close();
  }
}

// CLI usage
if (process.argv[2]) {
  const orch = new Orchestrator();
  const cmd = process.argv[2];

  switch (cmd) {
    case 'route':
      const msg = process.argv.slice(3).join(' ');
      console.log('Routes to:', orch.routeMessage(msg) || 'no specific bot (general)');
      break;
    case 'summary':
      console.log(JSON.stringify(orch.getDailySummary(), null, 2));
      break;
    case 'pending':
      const bot = process.argv[3];
      console.log(JSON.stringify(orch.getPendingMessages(bot), null, 2));
      break;
    default:
      console.log('Commands: route <message>, summary, pending <bot>');
  }

  orch.close();
}

export default Orchestrator;
