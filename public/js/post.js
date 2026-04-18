// ==============================================
//  post.js — 投稿画面ロジック API連携版
// ==============================================

if (!requireAuth()) throw new Error();

const currentUser = getUser();
let selectedMuscles = [];
let timerInterval = null;
let sessionActive = false;
let sessionTimeLeft = 0;
let canPostFreely = false;

const MOTIVATION_QUOTES = [
  "辛いのは成長している証拠だ。諦めた瞬間に成長は止まる。",
  "限界を超えた先に、本物の強さがある。",
  "筋肉は嘘をつかない。努力した分だけ返ってくる。",
  "今日の自分に勝つ。それだけでいい。",
  "痛みは一時的、誇りは永遠だ。",
  "強くなりたければ、まず動け。",
  "昨日の自分を超えることが、唯一の競争相手だ。",
  "No pain, No gain. — そのまんま事実。",
  "サボった日は記憶に残らない。頑張った日が積み重なる。",
  "bodyは変わる。気持ちも変わる。続けよう。",
];

async function initPost() {
  await loadTrainingStatus();
  
  if (!sessionActive && !canPostFreely) {
    document.getElementById('lockedOverlay').classList.remove('hidden');
    return;
  }

  // Load groups for visibility select
  try {
    const groups = await apiFetch('/groups');
    const select = document.getElementById('postGroup');
    groups.forEach(g => {
      const option = document.createElement('option');
      option.value = g.id;
      option.textContent = `🔒 ${g.name}`;
      select.appendChild(option);
    });
  } catch(e) {}

  startTimer();
  setMotivationQuote();
  setupCommentCounter();
}

async function loadTrainingStatus() {
  try {
    const res = await apiFetch('/training/status');
    sessionActive = res.isActive;
    sessionTimeLeft = res.timeRemaining;
    canPostFreely = res.canPostFreely;
  } catch (err) {
    console.error(err);
  }
}

function startTimer() {
  if (canPostFreely) {
    document.getElementById('postTimerDisplay').textContent = "✅ 今日のノルマ達成済";
    document.getElementById('postTimerDisplay').style.color = "var(--success)";
    return;
  }
  const display = document.getElementById('postTimerDisplay');
  let ms = sessionTimeLeft;

  function tick() {
    if (ms <= 0) {
      clearInterval(timerInterval);
      showToast('トレーニング時間終了！投稿は締め切られました', 'error');
      setTimeout(() => window.location.href = 'feed.html', 2000);
      return;
    }
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (display) {
      display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    ms -= 1000;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function setMotivationQuote() {
  const el = document.getElementById('motivationQuote');
  if (!el) return;
  const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
  el.textContent = `"${quote}"`;
}

function setupCommentCounter() {
  const textarea = document.getElementById('postComment');
  const counter = document.getElementById('commentCount');
  if (!textarea || !counter) return;
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 200`;
  });
}

function toggleMuscle(el) {
  const muscle = el.dataset.muscle;
  el.classList.toggle('selected');
  if (selectedMuscles.includes(muscle)) {
    selectedMuscles = selectedMuscles.filter(m => m !== muscle);
  } else {
    selectedMuscles.push(muscle);
  }
}

async function handleSubmitPost(event) {
  event.preventDefault();

  if (!sessionActive && !canPostFreely) {
    showToast('トレーニング時間が終了しました', 'error');
    return;
  }

  if (selectedMuscles.length === 0) {
    showToast('部位を選択してください', 'error');
    return;
  }

  const exercise = document.getElementById('exerciseName').value.trim();
  const weight = document.getElementById('weight').value;
  const sets = document.getElementById('sets').value;
  const reps = document.getElementById('reps').value;
  const comment = document.getElementById('postComment').value.trim();
  const imageFile = document.getElementById('postImage').files[0];
  const groupId = document.getElementById('postGroup').value;

  if (!exercise) {
    showToast('種目名を入力してください', 'error');
    return;
  }
  
  if (!imageFile && !canPostFreely) {
    showToast('写真を添付してください', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '投稿中...';

  try {
    const formData = new FormData();
    formData.append('muscles', JSON.stringify(selectedMuscles));
    formData.append('exercise', exercise);
    formData.append('weight', weight);
    formData.append('sets', sets);
    formData.append('reps', reps);
    formData.append('comment', comment);
    if (groupId) formData.append('groupId', groupId);
    formData.append('image', imageFile);

    const token = getToken();
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '投稿に失敗しました');
    }

    // Update current user info (streak, total_posts) in localStorage for quick UI rendering
    // Since backend handles the real DB update, we just fetch me to sync
    const meRes = await apiFetch('/auth/me');
    setAuth(getToken(), meRes.user);

    showToast('💪 投稿完了！最高だ！', 'success');
    clearInterval(timerInterval);
    setTimeout(() => window.location.href = 'feed.html', 900);
  } catch (err) {
    showToast(err.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '💪 投稿する';
  }
}

initPost();
