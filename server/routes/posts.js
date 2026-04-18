const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { getDailyDropTime } = require('./config');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `post-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });


// Get all posts (Global + My Groups)
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const groupId = req.query.group_id; // optional query

  let posts;
  if (groupId) {
    // Specific group feed
    posts = db.prepare(`
      SELECT p.*, u.username, u.display_name, u.emoji, u.streak
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.group_id = ?
      ORDER BY p.created_at DESC
    `).all(groupId);
  } else {
    // Global feed (Public or My Groups)
    posts = db.prepare(`
      SELECT p.*, u.username, u.display_name, u.emoji, u.streak, g.name as group_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN groups g ON p.group_id = g.id
      WHERE p.group_id IS NULL 
         OR p.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
      ORDER BY p.created_at DESC
    `).all(userId);
  }

  // Get reactions
  const reactions = db.prepare('SELECT * FROM reactions').all();
  
  // Format posts
  const formattedPosts = posts.map(p => {
    const postReactions = reactions.filter(r => r.post_id === p.id);
    const reactionsMap = {};
    postReactions.forEach(r => {
      if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = [];
      reactionsMap[r.emoji].push(r.user_id);
    });

    return {
      id: p.id,
      userId: p.user_id,
      username: p.username,
      displayName: p.display_name,
      userEmoji: p.emoji,
      streak: p.streak,
      muscles: JSON.parse(p.muscles),
      exercise: p.exercise,
      weight: p.weight,
      sets: p.sets,
      reps: p.reps,
      comment: p.comment,
      imageUrl: p.image_url, // Stored full URL or local path
      isLate: p.is_late === 1,
      groupId: p.group_id,
      groupName: p.group_name,
      reactions: reactionsMap,
      createdAt: p.created_at,
      trainedAt: p.trained_at
    };
  });

  res.json(formattedPosts);
});

// Create post
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  let { muscles, exercise, weight, sets, reps, comment, groupId } = req.body;
  if (typeof muscles === 'string') {
    try { muscles = JSON.parse(muscles); } catch { muscles = []; }
  }
  
  const userId = req.user.id;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const todayStr = nowIso.split('T')[0];

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  let trainedDates = [];
  if (user && user.trained_dates) {
    try { trainedDates = JSON.parse(user.trained_dates); } catch(e){}
  }
  const hasTrainedToday = trainedDates.includes(todayStr);

  const session = db.prepare('SELECT start_time FROM training_sessions WHERE user_id = ?').get(userId);
  
  let isLate = 0;
  if (!hasTrainedToday) {
    if (!session) {
      return res.status(403).json({ error: 'トレーニングセッションが開始されていません（または今日のトレーニングを完了してください）' });
    }
    const elapsed = now - session.start_time;
    if (elapsed > 20 * 60 * 1000) {
      return res.status(403).json({ error: 'トレーニング時間が終了しました' });
    }
    const dropTime = getDailyDropTime();
    const LATE_THRESHOLD = 2 * 60 * 60 * 1000;
    isLate = (session.start_time - dropTime) > LATE_THRESHOLD ? 1 : 0;
  }

  // AI Verification (Using GoogleAIFileManager for Video/Image from Disk)
  let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const imagePath = req.file ? path.join(__dirname, '../../public/uploads', req.file.filename) : null;

  if (req.file && process.env.GEMINI_API_KEY) {
    try {
      const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
      const uploadResult = await fileManager.uploadFile(imagePath, {
        mimeType: req.file.mimetype,
        displayName: "workout-media",
      });

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = "あなたはウェルネスSNSの監視AIです。このファイルは、筋トレ風景、プロテイン、ヘルシーな食事、サプリメント、ストレッチ、ランニングなど、何らかの「健康につながること・フィットネス」に関するものですか？”TRUE” か ”FALSE” のどちらか1単語だけで答えてください。厳しすぎず、健康関連ならTRUEにしてください。";
      
      const result = await model.generateContent([
        prompt,
        {
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType
          }
        }
      ]);
      const responseText = result.response.text().trim().toUpperCase();
      
      // Delete from Gemini server after parsing
      await fileManager.deleteFile(uploadResult.file.name).catch(()=>{});

      if (responseText.includes('FALSE')) {
        fs.unlinkSync(imagePath);
        return res.status(400).json({ error: 'AI判定：筋トレ風景ではありません（本物のトレーニーだけが投稿できます）' });
      }
    } catch (err) {
      console.error("Gemini API Verification Error:", err);
      // Fallthrough
    }
  }

  // Cloudinary Upload processing
  if (req.file && process.env.CLOUDINARY_URL) {
    try {
      const cldResult = await cloudinary.uploader.upload(imagePath, { 
        folder: "musclereal",
        resource_type: "auto"
      });
      imageUrl = cldResult.secure_url;
      // Option: delete local file after cloud upload
      fs.unlinkSync(imagePath);
    } catch (e) {
      console.error("Cloudinary upload error:", e);
      return res.status(500).json({ error: '画像のクラウドアップロードに失敗しました' });
    }
  }



  const id = 'p' + now;

  const insertPost = db.prepare(`
    INSERT INTO posts (id, user_id, muscles, exercise, weight, sets, reps, comment, image_url, is_late, created_at, trained_at, group_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let newStreak = user.streak;
  let newTotalPosts = user.total_posts + 1;
  let badges = JSON.parse(user.badges);

  const alreadyToday = trainedDates.includes(todayStr);

  if (!alreadyToday) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const hasYesterday = trainedDates.includes(yesterdayStr);

    newStreak = hasYesterday ? user.streak + 1 : 1;
    trainedDates.unshift(todayStr); // Add today to beginning
    if (trainedDates.length > 90) trainedDates = trainedDates.slice(0, 90);

    // Badges
    if (newStreak >= 3 && !badges.includes('streak3')) badges.push('streak3');
    if (newStreak >= 7 && !badges.includes('streak7')) badges.push('streak7');
    if (newStreak >= 30 && !badges.includes('streak30')) badges.push('streak30');
  }
  if (newTotalPosts >= 10 && !badges.includes('centurion')) badges.push('centurion');

  // Transaction
  const addPostTransaction = db.transaction(() => {
    insertPost.run(
      id, userId, JSON.stringify(muscles || []), exercise, 
      weight || 0, sets || 0, reps || 0, comment || '', 
      imageUrl, isLate, nowIso, nowIso, groupId || null
    );

    const updateUser = db.prepare(`
      UPDATE users 
      SET streak = ?, total_posts = ?, trained_dates = ?, badges = ?
      WHERE id = ?
    `);
    updateUser.run(newStreak, newTotalPosts, JSON.stringify(trainedDates), JSON.stringify(badges), userId);

    // End training session
    db.prepare('DELETE FROM training_sessions WHERE user_id = ?').run(userId);
  });

  try {
    addPostTransaction();
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '投稿に失敗しました' });
  }
});

// React to post
router.post('/:id/react', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const { emoji } = req.body;
  const userId = req.user.id;

  // Check if post exists
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '投稿が見つかりません' });

  // Toggle reaction
  const existing = db.prepare('SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?').get(postId, userId, emoji);

  if (existing) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
  } else {
    db.prepare(`
      INSERT INTO reactions (post_id, user_id, emoji)
      VALUES (?, ?, ?)
    `).run(postId, userId, emoji);
  }

  res.json({ success: true, toggled: !existing });
});

// Delete post
router.delete('/:id', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
  if (post.user_id !== userId) return res.status(403).json({ error: '権限がありません' });

  const deleteTransaction = db.transaction(() => {
    db.prepare('DELETE FROM reactions WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    db.prepare('UPDATE users SET total_posts = total_posts - 1 WHERE id = ?').run(userId);
  });

  try {
    deleteTransaction();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '削除に失敗しました' });
  }
});

module.exports = router;
