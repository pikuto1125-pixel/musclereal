// ==============================================
//  app.js — MuscleReal 共通ロジック (API連携版)
// ==============================================

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('mr_token');
}

function setAuth(token, user) {
  localStorage.setItem('mr_token', token);
  localStorage.setItem('mr_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('mr_token');
  localStorage.removeItem('mr_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('mr_user'));
  } catch {
    return null;
  }
}

// ---- API Helpers ----
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'API Error');
  }
  return data;
}

// ---- Date Utilities ----
function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${days}日前`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ---- Toast Notifications ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

// ---- Logout ----
function logout() {
  clearAuth();
  window.location.href = 'index.html';
}

// ---- Require auth ----
function requireAuth() {
  if (!getToken() || !getUser()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}
