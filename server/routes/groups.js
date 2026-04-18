const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get my groups
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  const groups = db.prepare(`
    SELECT g.*, 
           (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(userId);

  res.json(groups);
});

// Create group
router.post('/', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'グループ名を入力してください' });
  }

  const userId = req.user.id;
  const now = new Date().toISOString();
  const id = 'g' + Date.now();
  
  // Generate random code (ex: gym-12345)
  const code = 'gym-' + Math.floor(10000 + Math.random() * 90000);

  const createTransaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO groups (id, name, code, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), code, userId, now);

    db.prepare(`
      INSERT INTO group_members (group_id, user_id, joined_at)
      VALUES (?, ?, ?)
    `).run(id, userId, now);
  });

  try {
    createTransaction();
    res.json({ id, name, code });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(500).json({ error: 'コード生成に失敗しました。もう一度お試しください。' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'グループの作成に失敗しました' });
    }
  }
});

// Join group
router.post('/join', authenticateToken, (req, res) => {
  const { code } = req.body;
  if (!code || code.trim() === '') {
    return res.status(400).json({ error: '合言葉を入力してください' });
  }

  const userId = req.user.id;
  const now = new Date().toISOString();

  // Find group by code
  const group = db.prepare('SELECT id, name FROM groups WHERE code = ?').get(code.trim());
  
  if (!group) {
    return res.status(404).json({ error: '合言葉が間違っているか、グループが存在しません' });
  }

  // Check if already a member
  const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, userId);
  
  if (isMember) {
    return res.status(400).json({ error: 'すでにこのグループに参加しています' });
  }

  try {
    db.prepare(`
      INSERT INTO group_members (group_id, user_id, joined_at)
      VALUES (?, ?, ?)
    `).run(group.id, userId, now);

    res.json({ id: group.id, name: group.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'グループの参加に失敗しました' });
  }
});

module.exports = router;
