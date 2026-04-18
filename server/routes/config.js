const express = require('express');
const router = express.Router();

function getDailyDropTime() {
  const now = new Date();
  
  // Simple logic for MVP: The drop time today is 18:00 (6 PM)
  // In a real app, this would be randomized daily and saved in DB
  const dropTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);
  return dropTime.getTime();
}

router.get('/drop-time', (req, res) => {
  res.json({ dropTime: getDailyDropTime() });
});

module.exports = router;
module.exports.getDailyDropTime = getDailyDropTime;
