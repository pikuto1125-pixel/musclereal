// ==============================================
//  profile.js — プロフィール画面ロジック API連携版
// ==============================================

if (!requireAuth()) throw new Error();

let currentUser = getUser();
let myPosts = [];
let ranking = [];
let sessionActive = false;

const ALL_BADGES = [
  { id: 'streak3',   icon: '🔰', name: '3日連続',     desc: '3日連続でトレーニング' },
  { id: 'streak7',   icon: '🏅', name: '鉄の意志',     desc: '7日連続でトレーニング' },
  { id: 'streak30',  icon: '👑', name: '鋼の意志',     desc: '30日連続でトレーニング' },
  { id: 'centurion', icon: '📜', name: '10投稿',        desc: '投稿10件達成' },
  { id: 'chest_king',icon: '💪', name: '胸の王様',     desc: '胸のトレを5回記録' },
  { id: 'leg_queen', icon: '🦵', name: '脚の女王',     desc: '脚のトレを5回記録' },
];

async function initProfile() {
  await loadData();
  renderProfileHero();
  renderCalendar();
  renderBadges();
  renderRanking();
  renderMyPosts();
  updatePostBtn();
}

async function loadData() {
  try {
    // Refresh user data
    const meRes = await apiFetch('/auth/me');
    currentUser = meRes.user;
    setAuth(getToken(), currentUser);

    const postsRes = await apiFetch('/posts');
    myPosts = postsRes.filter(p => p.userId === currentUser.id);

    ranking = await apiFetch('/users/ranking');

    const statusRes = await apiFetch('/training/status');
    sessionActive = statusRes.isActive;
  } catch (err) {
    console.error(err);
  }
}

function renderProfileHero() {
  document.getElementById('profileAvatar').textContent = currentUser.emoji || '💪';
  document.getElementById('profileName').textContent = currentUser.display_name || currentUser.displayName || currentUser.username;
  document.getElementById('profileHandle').textContent = `@${currentUser.username}`;
  document.getElementById('statStreak').textContent = currentUser.streak || 0;
  document.getElementById('statPosts').textContent = currentUser.total_posts || currentUser.totalPosts || 0;

  // Total volume (kg) from own posts
  const volume = myPosts.reduce((sum, p) => sum + (p.weight || 0) * (p.sets || 0) * (p.reps || 0), 0);
  document.getElementById('statVolume').textContent = volume >= 1000 ? `${(volume/1000).toFixed(1)}t` : `${volume}`;
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const trainedDates = new Set(currentUser.trained_dates || currentUser.trainedDates || []);
  const today = new Date();
  const cells = [];

  const todayDayOfWeek = today.getDay(); // 0=Sun
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 27 - todayDayOfWeek);

  const totalDays = 28 + todayDayOfWeek;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dStr = d.toISOString().split('T')[0];
    const isToday = dStr === today.toISOString().split('T')[0];
    const isTrained = trainedDates.has(dStr);
    const isFuture = d > today;

    cells.push(`
      <div class="calendar-cell ${isTrained ? 'trained' : ''} ${isToday ? 'today' : ''}" 
           style="${isFuture ? 'opacity:0.2;' : ''}" 
           title="${dStr}${isTrained ? ' ✅' : ''}">
        ${isToday ? '今' : d.getDate()}
      </div>
    `);
  }
  grid.innerHTML = cells.join('');
}

function renderBadges() {
  const earned = new Set(currentUser.badges || []);
  const grid = document.getElementById('badgeGrid');
  grid.innerHTML = ALL_BADGES.map(b => `
    <div class="badge-item ${earned.has(b.id) ? 'earned' : ''}" title="${b.desc}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
    </div>
  `).join('');
}

function renderRanking() {
  const rankEl = document.getElementById('rankingList');
  const medals = ['gold', 'silver', 'bronze'];

  rankEl.innerHTML = ranking.map((u, i) => {
    const isMe = u.id === currentUser.id;
    return `
      <div class="rank-item">
        <div class="rank-number ${medals[i] || ''}">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
        <div class="post-avatar" style="width:34px;height:34px;font-size:16px;">${u.emoji || (u.display_name ? u.display_name[0] : 'U')}</div>
        <div class="rank-info">
          <div class="rank-name">${escapeHtml(u.display_name || u.displayName)} ${isMe ? '<span style="color:var(--orange);font-size:11px;">(あなた)</span>' : ''}</div>
          <div class="rank-score">🔥 ${u.streak || 0}日 / 📝 ${u.total_posts || u.totalPosts || 0}投稿</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderMyPosts() {
  const container = document.getElementById('myPosts');

  if (myPosts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏋️</div>
        <div class="empty-title">まだ投稿がありません</div>
        <div class="empty-text">トレーニングを開始して投稿してみよう！</div>
      </div>
    `;
    return;
  }

  container.innerHTML = myPosts.map(post => `
    <div class="post-card mb-16">
      <div class="post-card-header">
        <div class="post-avatar">${post.userEmoji || '💪'}</div>
        <div class="post-user-info">
          <div class="post-username">${escapeHtml(post.exercise)} ${post.isLate ? '<span style="background:rgba(255,59,48,0.1); color:#FF3B30; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-left:8px;">⏰ Late</span>' : ''}</div>
          <div class="post-time">${formatRelativeTime(post.createdAt)}</div>
        </div>
        <div class="post-streak-badge">🔥 ${post.streak || 0}日</div>
      </div>
      <div class="post-body">
        <div class="post-muscle-tags">
          ${(post.muscles || []).map(m => `<span class="muscle-tag">${m}</span>`).join('')}
        </div>
        ${post.weight ? `<div class="post-exercise-detail">${post.weight}kg × ${post.reps}rep × ${post.sets}set</div>` : ''}
        ${post.comment ? `<div class="post-comment">${escapeHtml(post.comment)}</div>` : ''}
        ${post.imageUrl ? `<div style="margin-top:12px; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--border);"><img src="${post.imageUrl}" style="width:100%; aspect-ratio:1/1; object-fit:cover; display:block;"></div>` : ''}
      </div>
      <div class="post-footer">
        <span class="text-xs text-muted">🔥 ${(post.reactions?.['🔥'] || []).length} &nbsp; 💪 ${(post.reactions?.['💪'] || []).length}</span>
        <button class="reaction-btn" style="margin-left:auto;color:var(--text-muted);font-size:12px;" onclick="deleteMyPost('${post.id}')">🗑️ 削除</button>
      </div>
    </div>
  `).join('');
}

async function deleteMyPost(postId) {
  if (!confirm('この投稿を削除しますか？')) return;
  try {
    await apiFetch(`/posts/${postId}`, { method: 'DELETE' });
    showToast('削除しました', 'success');
    await loadData();
    renderMyPosts();
    renderProfileHero();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updatePostBtn() {
  const btn = document.getElementById('navPostBtn');
  if (!btn) return;
  if (!sessionActive) {
    btn.classList.add('locked');
    btn.title = 'トレーニング中のみ投稿できます';
  }
}

function goToPost() {
  if (!sessionActive) {
    showToast('🔒 トレーニング開始後のみ投稿できます！', 'error');
    window.location.href = 'feed.html';
    return;
  }
  window.location.href = 'post.html';
}

initProfile();
