const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const dbPath = path.join(__dirname, 'data.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      streak INTEGER DEFAULT 0,
      total_posts INTEGER DEFAULT 0,
      badges TEXT DEFAULT '[]',
      trained_dates TEXT DEFAULT '[]',
      emoji TEXT DEFAULT '💪',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      muscles TEXT NOT NULL, -- JSON array
      exercise TEXT NOT NULL,
      weight REAL,
      sets INTEGER,
      reps INTEGER,
      comment TEXT,
      image_url TEXT,
      is_late INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      trained_at TEXT NOT NULL,
      group_id TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY(group_id, user_id),
      FOREIGN KEY(group_id) REFERENCES groups(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      UNIQUE(post_id, user_id, emoji),
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS training_sessions (
      user_id TEXT PRIMARY KEY,
      start_time INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Migration for existing data.db
  try { db.exec("ALTER TABLE posts ADD COLUMN image_url TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE posts ADD COLUMN is_late INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE posts ADD COLUMN group_id TEXT"); } catch (e) {}

  // Insert demo users if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const now = new Date();
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

    const insertUser = db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, streak, total_posts, badges, trained_dates, emoji, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'u1', 'tanaka', '田中 剛', 'tanaka123', 14, 42, 
      JSON.stringify(['streak7', 'centurion']), 
      JSON.stringify([yesterdayStr]), '🏋️', now.toISOString()
    );

    insertUser.run(
      'u2', 'yuki', '佐藤 雪', 'yuki123', 7, 21, 
      JSON.stringify(['streak7']), 
      JSON.stringify([yesterdayStr]), '💪', now.toISOString()
    );
  }
}

initDb();

module.exports = db;
