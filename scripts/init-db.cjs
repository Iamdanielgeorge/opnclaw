const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'team.db');
const schemaPath = path.join(__dirname, '..', 'data', 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create database and run schema
const db = new Database(dbPath);
const schema = fs.readFileSync(schemaPath, 'utf8');

// Split by semicolons and run each statement
const statements = schema.split(';').filter(s => s.trim());
for (const stmt of statements) {
    if (stmt.trim()) {
        db.exec(stmt);
    }
}

console.log('Database initialized at:', dbPath);
console.log('Tables created successfully');

db.close();
