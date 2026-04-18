// ==============================================
//  feed.js — フィード画面ロジック API連携版
// ==============================================

if (!requireAuth()) throw new Error();

const currentUser = getUser();
let activeFilter = 'all';
let timerInterval = null;
let currentPosts = [];
let todayIsTrained = false;
let sessionActive = false;
let sessionTimeLeft = 0;
let currentTab = 'global';
let myGroups = [];

// ---- Init ----
async function initFeed() {
  renderHeaderStreak();
  await loadTrainingStatus();
  await loadGroups();
  await loadPosts();
  renderTrainingArea();
  renderTodayBanner();
  renderFeed();
  updatePostBtn();
}

// ---- Streak ----
function renderHeaderStreak() {
  document.getElementById('streakCount').textContent = currentUser.streak || 0;
}

// ---- Training ----
async function loadTrainingStatus() {
  try {
    const res = await apiFetch('/training/status');
    sessionActive = res.isActive;
    sessionTimeLeft = res.timeRemaining;
  } catch (err) {
    console.error(err);
  }
}

function renderTrainingArea() {
  const area = document.getElementById('trainingArea');
  if (clearTimer()) {}

  if (sessionActive) {
    area.innerHTML = `
      <div class="training-active-bar">
        <div class="training-active-left">
          <span class="pulse-dot"></span>
          <div>
            <div class="training-active-label">トレーニング中</div>
            <div class="training-active-timer" id="timerText">--:--</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.location.href='post.html'">
          📝 投稿する
        </button>
      </div>
    `;
    startCountdown();
  } else {
    if (todayIsTrained) {
      area.innerHTML = '';
      return;
    }
    area.innerHTML = `
      <div class="training-banner-inactive" style="border-radius:var(--radius-lg); border:1px solid rgba(255,107,53,0.25); background:linear-gradient(135deg,rgba(255,107,53,0.08),rgba(255,61,0,0.04)); padding:18px; display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--orange);margin-bottom:3px;">今日まだトレーニングしていません</div>
          <div style="font-size:12px;color:var(--text-secondary);">投稿もフィードもブラーがかかります💀</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openStartOverlay()">開始</button>
      </div>
    `;
  }
}

function renderTodayBanner() {
  const banner = document.getElementById('todayBanner');
  if (todayIsTrained) {
    banner.innerHTML = `<div class="done-banner">✅ 今日のトレーニング完了！フィードが全部見えます💪</div>`;
  } else if (sessionActive) {
    banner.innerHTML = '';
  } else {
    banner.innerHTML = `<div class="sabo-banner"><span class="sabo-text">😈 今日サボってます。投稿はぼかして表示中…</span></div>`;
  }
}

function openStartOverlay() {
  document.getElementById('trainingStartOverlay').classList.remove('hidden');
}

function closeStartOverlay() {
  document.getElementById('trainingStartOverlay').classList.add('hidden');
}

async function confirmStartTraining() {
  try {
    const res = await apiFetch('/training/start', { method: 'POST' });
    sessionActive = true;
    sessionTimeLeft = res.duration;
    
    closeStartOverlay();
    showToast('💪 トレーニング開始！20分間投稿できます！', 'success');
    renderTrainingArea();
    renderTodayBanner();
    updatePostBtn();
    renderFeed();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    return true;
  }
  return false;
}

function startCountdown() {
  const timerEl = document.getElementById('timerText');
  let ms = sessionTimeLeft;
  
  function tick() {
    if (ms <= 0) {
      clearTimer();
      sessionActive = false;
      showToast('トレーニング終了！お疲れ様でした🎉', 'success');
      renderTrainingArea();
      renderTodayBanner();
      updatePostBtn();
      renderFeed(); // Re-render feed to apply blur if not posted
      return;
    }
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (timerEl) {
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    ms -= 1000;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function updatePostBtn() {
  const btn = document.getElementById('navPostBtn');
  if (!btn) return;
  if (sessionActive) {
    btn.classList.remove('locked');
    btn.title = '投稿する';
  } else {
    btn.classList.add('locked');
    btn.title = 'トレーニング中のみ投稿できます';
  }
}

function goToPost() {
  if (!sessionActive) {
    showToast('🔒 トレーニング開始後のみ投稿できます！', 'error');
    openStartOverlay();
    return;
  }
  window.location.href = 'post.html';
}

// ---- Groups ----
async function loadGroups() {
  try {
    myGroups = await apiFetch('/groups');
    renderMyGroups();
  } catch (err) {
    console.error(err);
  }
}

function openGroupModal() {
  document.getElementById('groupModal').classList.remove('hidden');
}

function closeGroupModal() {
  document.getElementById('groupModal').classList.add('hidden');
}

async function createGroup() {
  const name = document.getElementById('createGroupName').value;
  try {
    await apiFetch('/groups', { method: 'POST', body: JSON.stringify({ name }) });
    document.getElementById('createGroupName').value = '';
    showToast('グループを作成しました！', 'success');
    await loadGroups();
  } catch (err) { showToast(err.message, 'error'); }
}

async function joinGroup() {
  const code = document.getElementById('joinGroupCode').value;
  try {
    await apiFetch('/groups/join', { method: 'POST', body: JSON.stringify({ code }) });
    document.getElementById('joinGroupCode').value = '';
    showToast('グループに参加しました！', 'success');
    await loadGroups();
    await loadPosts(); // Reload posts to include new group posts
    renderFeed();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderMyGroups() {
  const list = document.getElementById('myGroupsList');
  if (!list) return;
  if (myGroups.length === 0) {
    list.innerHTML = '<span class="text-muted">まだ参加しているグループはありません。</span>';
    return;
  }
  list.innerHTML = myGroups.map(g => `
    <div style="padding:8px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
      <span>${escapeHtml(g.name)}</span>
      <span class="text-muted">合言葉: <strong>${g.code}</strong></span>
    </div>
  `).join('');
}

// ---- Filter / Tabs ----
function switchFeedTab(tab) {
  currentTab = tab;
  document.getElementById('tab-global').classList.toggle('active', tab === 'global');
  document.getElementById('tab-groups').classList.toggle('active', tab === 'groups');
  renderFeed();
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById(`filter-${filter}`);
  if (btn) btn.classList.add('active');
  renderFeed();
}

async function loadPosts() {
  try {
    currentPosts = await apiFetch('/posts');
    const today = todayStr();
    todayIsTrained = currentPosts.some(p => p.userId === currentUser.id && p.trainedAt.startsWith(today));
  } catch (err) {
    console.error(err);
  }
}

function renderFeed() {
  const feed = document.getElementById('postFeed');
  const canSee = sessionActive || todayIsTrained;

  let posts = [...currentPosts];
  
  if (currentTab === 'groups') {
    posts = posts.filter(p => p.groupId);
  } else {
    posts = posts.filter(p => !p.groupId); // Global feed
  }

  if (activeFilter !== 'all') {
    posts = posts.filter(p => p.muscles && p.muscles.includes(activeFilter));
  }

  if (posts.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏋️</div>
        <div class="empty-title">まだ投稿がありません</div>
        <div class="empty-text">最初の一歩を踏み出そう！</div>
      </div>
    `;
    return;
  }

  feed.innerHTML = posts.map(post => renderPostCard(post, canSee)).join('');
}

function renderPostCard(post, canSee) {
  const isOwner = post.userId === currentUser.id;
  const canView = canSee || isOwner;

  const muscleTagsHtml = (post.muscles || []).map(m => `<span class="muscle-tag">${muscleEmoji(m)} ${m}</span>`).join('');
  const timeAgo = formatRelativeTime(post.createdAt);

  const fireCount = (post.reactions?.['🔥'] || []).length;
  const muscleCount = (post.reactions?.['💪'] || []).length;
  const cryCount = (post.reactions?.['😭'] || []).length;

  const userReactedFire = (post.reactions?.['🔥'] || []).includes(currentUser.id);
  const userReactedMuscle = (post.reactions?.['💪'] || []).includes(currentUser.id);

  const lateTag = post.isLate ? `<span style="background:rgba(255,59,48,0.1); color:#FF3B30; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-left:8px;">⏰ Late</span>` : '';

  let imgHtml = '';
  if (post.imageUrl) {
    const isVideo = post.imageUrl.match(/\.(mp4|mov|webm|m4v)$/i);
    if (isVideo) {
      imgHtml = `
        <div style="margin-top:12px; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--border);">
          <video src="${post.imageUrl}" style="width:100%; aspect-ratio:1/1; object-fit:cover; display:block;" autoplay loop muted playsinline></video>
        </div>
      `;
    } else {
      imgHtml = `
        <div style="margin-top:12px; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--border);">
          <img src="${post.imageUrl}" style="width:100%; aspect-ratio:1/1; object-fit:cover; display:block;">
        </div>
      `;
    }
  }

  const groupTag = post.groupName ? `<span style="background:rgba(0,163,255,0.1); color:var(--orange); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-left:8px;">🔒 ${escapeHtml(post.groupName)}</span>` : '';

  const bodyContent = `
    <div class="post-muscle-tags">${muscleTagsHtml}</div>
    <div class="post-exercise">${escapeHtml(post.exercise)}</div>
    ${post.weight ? `<div class="post-exercise-detail">${post.weight}kg × ${post.reps}rep × ${post.sets}set</div>` : ''}
    ${post.comment ? `<div class="post-comment">${escapeHtml(post.comment)}</div>` : ''}
    ${imgHtml}
  `;

  const blurOverlay = !canView ? `
    <div class="post-blur-overlay">
      <span class="blur-lock-icon">🔒</span>
      <span class="blur-lock-text">今日トレーニングすると<br>全投稿が見えます</span>
      <button class="btn btn-primary btn-sm" onclick="openStartOverlay()">今すぐトレーニング</button>
    </div>
  ` : '';

  return `
    <div class="post-card" id="post-${post.id}">
      <div class="post-card-header">
        <div class="post-avatar">${post.userEmoji || post.displayName[0]}</div>
        <div class="post-user-info">
          <div class="post-username">@${post.username} <span style="font-weight:400;color:var(--text-secondary);font-size:13px;">${post.displayName}</span> ${lateTag} ${groupTag}</div>
          <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-streak-badge">🔥 ${post.streak || 0}日</div>
      </div>

      <div style="position:relative;">
        <div class="${canView ? '' : 'post-body-blurred'}" style="padding:16px; background:linear-gradient(135deg,var(--bg-secondary),var(--bg-primary)); min-height:80px;">
          ${bodyContent}
        </div>
        ${blurOverlay}
      </div>

      <div class="post-footer">
        <button class="reaction-btn ${userReactedFire ? 'reacted' : ''}" id="fire-${post.id}" onclick="toggleReaction('${post.id}', '🔥')">
          <span class="reaction-emoji">🔥</span> ${fireCount}
        </button>
        <button class="reaction-btn ${userReactedMuscle ? 'reacted' : ''}" id="muscle-${post.id}" onclick="toggleReaction('${post.id}', '💪')">
          <span class="reaction-emoji">💪</span> ${muscleCount}
        </button>
        <button class="reaction-btn" id="cry-${post.id}" onclick="toggleReaction('${post.id}', '😭')">
          <span class="reaction-emoji">😭</span> ${cryCount}
        </button>
        ${isOwner ? `<button class="reaction-btn" style="margin-left:auto;color:var(--text-muted);font-size:12px;" onclick="deletePost('${post.id}')">🗑️</button>` : ''}
      </div>
    </div>
  `;
}

function muscleEmoji(muscle) {
  const map = { '胸': '💪', '背中': '🏔️', '脚': '🦵', '肩': '⚡', '腕': '🦾', '腹': '🧱', 'お尻': '🍑', '三頭筋': '💥', '二頭筋': '🤲' };
  return map[muscle] || '💪';
}

async function toggleReaction(postId, emoji) {
  if (!sessionActive && !todayIsTrained) {
    showToast('🔒 トレーニングしてからリアクションできます！', 'error');
    return;
  }

  try {
    const res = await apiFetch(`/posts/${postId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });
    
    // Refresh feed correctly to update reactions
    await loadPosts();
    renderFeed();

    if (res.toggled) {
      setTimeout(() => {
        const btnKey = emoji === '🔥' ? `fire-${postId}` : emoji === '💪' ? `muscle-${postId}` : `cry-${postId}`;
        const btn = document.getElementById(btnKey);
        if (btn) btn.classList.add('just-reacted');
      }, 50);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePost(postId) {
  if (!confirm('この投稿を削除しますか？')) return;
  try {
    await apiFetch(`/posts/${postId}`, { method: 'DELETE' });
    await loadPosts();
    renderFeed();
    showToast('投稿を削除しました', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

initFeed();
