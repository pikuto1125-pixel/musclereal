const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateToken, authenticateToken } = require('../middleware/auth');

// Register
router.post('/register', (req, res) => {
  const { username, displayName, password } = req.body;
  if (!username || !displayName || !password) {
    return res.status(400).json({ error: '全ての項目を入力してください' });
  }

  // Very simple simulation, better to use bcrypt in production
  const id = 'u' + Date.now();
  const now = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, username, displayName, password, now);

    const token = generateToken({ id, username });
    
    // Fetch inserted user
    const user = db.prepare('SELECT id, username, display_name, streak, total_posts, badges, trained_dates, emoji, created_at FROM users WHERE id = ?').get(id);
    user.badges = JSON.parse(user.badges);
    user.trained_dates = JSON.parse(user.trained_dates);

    res.json({ token, user });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'このユーザー名は既に使われています' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  }
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.password_hash !== password) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });
  }

  const token = generateToken({ id: user.id, username: user.username });
  
  delete user.password_hash;
  user.badges = JSON.parse(user.badges);
  user.trained_dates = JSON.parse(user.trained_dates);

  res.json({ token, user });
});

// Get Me (Current User Update)
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, streak, total_posts, badges, trained_dates, emoji, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  user.badges = JSON.parse(user.badges);
  user.trained_dates = JSON.parse(user.trained_dates);
  res.json({ user });
});

module.exports = router;
