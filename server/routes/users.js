const express = require('express');
const router = express.Router();
const db = require('../db');

// Get ranking (e.g. by streak)
router.get('/ranking', (req, res) => {
  const users = db.prepare(`
    SELECT id, username, display_name, streak, total_posts, emoji 
    FROM users 
    ORDER BY streak DESC LIMIT 10
  `).all();
  res.json(users);
});

module.exports = router;
