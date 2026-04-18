const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const TRAINING_DURATION = 20 * 60 * 1000; // 20 minutes

// Start training
router.post('/start', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO training_sessions (user_id, start_time) 
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET start_time=excluded.start_time
  `);
  stmt.run(userId, now);

  res.json({ startTime: now, duration: TRAINING_DURATION });
});

// Get training status
router.get('/status', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const now = Date.now();
  const todayStr = new Date(now).toISOString().split('T')[0];

  const user = db.prepare('SELECT trained_dates FROM users WHERE id = ?').get(userId);
  let trainedDates = [];
  if (user && user.trained_dates) {
    try { trainedDates = JSON.parse(user.trained_dates); } catch(e){}
  }
  const hasTrainedToday = trainedDates.includes(todayStr);

  const session = db.prepare('SELECT start_time FROM training_sessions WHERE user_id = ?').get(userId);
  
  if (session) {
    const elapsed = now - session.start_time;
    const TOTAL_TIME = 20 * 60 * 1000;
    
    if (elapsed < TOTAL_TIME) {
      return res.json({ 
        isActive: true, 
        timeRemaining: TOTAL_TIME - elapsed,
        canPostFreely: hasTrainedToday 
      });
    } else {
      // Auto expire
      db.prepare('DELETE FROM training_sessions WHERE user_id = ?').run(userId);
    }
  }

  res.json({ isActive: false, timeRemaining: 0, canPostFreely: hasTrainedToday });
});

module.exports = router;
