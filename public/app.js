import { createTerminalController, PyodideManager } from '/terminal-client.js';

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const state = {
  user: null, page: 'home', problems: null, current: null, attempt: null, timer: null, editor: null, terminal: null,
  sidebarCollapsed: localStorage.getItem('simpleoj-sidebar') === 'collapsed',
  submissions: null, leaderboard: null, adminDashboard: null, adminUsers: null, adminAssignmentState: null, problemDetails: {}
};
window.state = state;

let monacoReady;

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const formatDate = (value) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const formatDuration = (ms) => `${Math.floor(ms / 60000)}p ${Math.floor((ms % 60000) / 1000)}s`;
const statusLabel = (s) => ({ ACCEPTED: 'Đúng (Accepted)', WRONG_ANSWER: 'Sai đáp án (Wrong Answer)', RUNTIME_ERROR: 'Lỗi thực thi (Runtime Error)', TIME_LIMIT: 'Quá thời gian (Time Limit Exceeded)', EXPIRED: 'Hết giờ (Expired)', OUTPUT_LIMIT: 'Vượt giới hạn Output (Output Limit Exceeded)', MEMORY_LIMIT: 'Vượt giới hạn bộ nhớ (Memory Limit Exceeded)' })[s] || s;

function toast(message, error = false) {
  toastEl.textContent = message;
  toastEl.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.className = 'toast', 3000);
}

function showConfirmModal(message, { confirmText = 'Rời bài', cancelText = 'Ở lại' } = {}) {
  return new Promise((resolve) => {
    const existing = document.querySelector('#confirm-leave-modal');
    if (existing) { existing.remove(); resolve(false); return; }
    const backdrop = document.createElement('div');
    backdrop.id = 'confirm-leave-modal';
    backdrop.className = 'confirm-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <div class="confirm-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 id="confirm-title">Xác nhận rời bài</h3>
        <p id="confirm-msg">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn secondary" id="confirm-cancel">${escapeHtml(cancelText)}</button>
          <button class="btn danger" id="confirm-leave">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));
    const cleanup = (result) => {
      backdrop.classList.remove('show');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      setTimeout(() => backdrop.remove(), 300);
      resolve(result);
    };
    backdrop.querySelector('#confirm-cancel').onclick = () => cleanup(false);
    backdrop.querySelector('#confirm-leave').onclick = () => cleanup(true);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', onKey); }
    });
    backdrop.querySelector('#confirm-cancel').focus();
  });
}

function loadMonaco() {
  if (monacoReady) return monacoReady;
  monacoReady = new Promise((resolve, reject) => {
    if (!window.require) return reject(new Error('Không tải được trình soạn thảo.'));
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' } });
    window.require(['vs/editor/editor.main'], () => {
      monaco.editor.defineTheme('thonny-light', {
        base: 'vs', inherit: true,
        rules: [
          { token: 'keyword', foreground: '7F0055', fontStyle: 'bold' },
          { token: 'keyword.python', foreground: '7F0055', fontStyle: 'bold' },
          { token: 'type.identifier', foreground: '00008B', fontStyle: 'bold' },
          { token: 'identifier.function', foreground: '00008B', fontStyle: 'bold' },
          { token: 'string', foreground: '006400' },
          { token: 'number', foreground: 'B04600' },
          { token: 'comment', foreground: 'A9A9A9' }
        ],
        colors: {
          'editor.background': '#FDFDFD', 'editor.foreground': '#000000',
          'editorGutter.background': '#E0E0E0', 'editorLineNumber.foreground': '#777777',
          'editorLineNumber.activeForeground': '#000000', 'editor.lineHighlightBackground': '#F5F5F5',
          'editor.selectionBackground': '#B9D7F6', 'editorCursor.foreground': '#000000',
          'editorIndentGuide.background1': '#E8E8E8'
        }
      });
      resolve(monaco);
    }, reject);
  });
  return monacoReady;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể kết nối máy chủ.');
  return data;
}

// Cấu hình Marked.js renderer tùy biến để tối ưu tải ảnh và liên kết
if (window.marked && window.marked.use) {
  window.marked.use({
    renderer: {
      image(token) {
        // Hỗ trợ cả cấu trúc token của marked v13+ lẫn tham số vị trí của v12 trở xuống
        const href = (typeof token === 'object' ? token.href : arguments[0]) || '';
        const title = (typeof token === 'object' ? token.title : arguments[1]) || '';
        const text = (typeof token === 'object' ? token.text : arguments[2]) || '';
        const titleAttr = title ? ` title="${title}"` : "";
        return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy" decoding="async">`;
      },
      link(token) {
        const href = (typeof token === 'object' ? token.href : arguments[0]) || '';
        const title = (typeof token === 'object' ? token.title : arguments[1]) || '';
        const text = (typeof token === 'object' ? token.text : arguments[2]) || '';
        const titleAttr = title ? ` title="${title}"` : "";
        const isExternal = href.startsWith('http://') || href.startsWith('https://');
        const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${href}"${titleAttr}${targetAttr}>${text}</a>`;
      }
    }
  });
}

function markdown(source) {
  if (window.marked && window.marked.parse) {
    return window.marked.parse(source);
  }
  let value = escapeHtml(source);
  value = value.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>');
  value = value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  return value.split(/\n{2,}/).map((block) => /^<(h|ul)/.test(block) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
}

function authView(register = false) {
  document.body.style.overflow = '';
  app.innerHTML = `<main class="auth-page">
    <section class="auth-story">
      <div><div class="brand"><span class="brand-mark">S/</span> SimpleOJ</div>
        <h1>Viết code.<br><em>Hiểu thật.</em></h1>
        <p>Một phòng luyện Python gọn gàng cho lớp học — đề bài rõ ràng, đồng hồ minh bạch và kết quả được lưu sau mỗi lần thử.</p></div>
      <div class="story-foot"><span>Python 3</span><span>Chấm tự động</span><span>Tiến bộ từng bài</span></div>
    </section>
    <section class="auth-panel"><div class="auth-box">
      <span class="eyebrow">${register ? 'Tạo hồ sơ học tập' : 'Chào mừng trở lại'}</span>
      <h2>${register ? 'Đăng ký' : 'Đăng nhập'}</h2>
      <p class="muted">${register ? 'Bắt đầu lưu điểm và theo dõi tiến bộ.' : 'Tiếp tục bài đang làm dở của bạn.'}</p>
      <form id="auth-form">
        ${register ? '<div class="field"><label>Họ và tên</label><input name="fullName" maxlength="100" required autocomplete="name"></div>' : ''}
        <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Mật khẩu</label><input name="password" type="password" minlength="8" required autocomplete="${register ? 'new-password' : 'current-password'}"></div>
        <button class="btn block" type="submit">${register ? 'Tạo tài khoản' : 'Vào phòng học'} →</button>
      </form>
      <div class="auth-switch">${register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <button class="text-btn" id="switch-auth">${register ? 'Đăng nhập' : 'Đăng ký'}</button></div>
    </div></section>
  </main>`;
  document.querySelector('#switch-auth').onclick = () => authView(!register);
  document.querySelector('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(event.target));
      const data = await api(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', body });
      state.user = data.user;
      await navigate('home');
      if (typeof PyodideManager !== 'undefined') PyodideManager.preload();
    } catch (error) { toast(error.message, true); button.disabled = false; }
  };
}

function shell(content, title = 'Tổng quan') {
  const admin = state.user.role === 'ADMIN';
  app.innerHTML = `<div class="shell${state.sidebarCollapsed ? ' nav-collapsed' : ''}" id="shell">
    <div class="nav-backdrop" id="nav-backdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Điều hướng chính">
      <div class="brand-row"><div class="brand"><span class="brand-mark">S/</span><span class="brand-name">SimpleOJ</span></div><button class="sidebar-toggle" id="nav-toggle" aria-label="Thu gọn thanh điều hướng" title="Thu gọn/mở rộng">‹</button></div>
      <nav class="nav">
        <button data-page="home" title="Tổng quan">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
          <span class="nav-label">Tổng quan</span>
        </button>
        <button data-page="problems" title="Bài tập">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>
          <span class="nav-label">Bài tập</span>
        </button>
        <button data-page="history" title="Lịch sử nộp">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><line x1="12" y1="7" x2="12" y2="12"/><polyline points="12 12 16 14"/></svg></span>
          <span class="nav-label">Lịch sử nộp</span>
        </button>
        <button data-page="leaderboard" title="Bảng xếp hạng">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/><path d="M12 2a6 6 0 0 1 6 6v1a6 6 0 0 1-6 6a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"/></svg></span>
          <span class="nav-label">Bảng xếp hạng</span>
        </button>
        ${admin ? `
        <button class="admin-nav" data-page="admin" title="Quản trị">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z"/></svg></span>
          <span class="nav-label">Quản trị</span>
        </button>
        <button data-page="users" title="Học sinh">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
          <span class="nav-label">Học sinh</span>
        </button>
        <button data-page="groups" title="Nhóm bài tập">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
          <span class="nav-label">Nhóm bài tập</span>
        </button>` : ''}
      </nav>
      <div class="user-chip"><div class="user-avatar">${escapeHtml(state.user.full_name.trim().charAt(0).toUpperCase())}</div><div class="user-copy"><strong>${escapeHtml(state.user.full_name)}</strong><span>${escapeHtml(state.user.email)} · ${admin ? 'ADMIN' : 'HỌC SINH'}</span></div></div>
    </aside>
    <main class="main"><header class="topbar"><button class="mobile-menu" id="menu" aria-label="Mở menu">☰</button><h1>${escapeHtml(title)}</h1><button class="text-btn" id="logout">Đăng xuất</button></header>${content}</main>
  </div>`;
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === state.page);
    button.onclick = () => navigate(button.dataset.page);
  });
  const shellEl = document.querySelector('#shell');
  const sidebar = document.querySelector('#sidebar');

  const closeMobileNav = () => {
    sidebar.classList.remove('open');
    shellEl.classList.remove('nav-open');
    document.body.style.overflow = '';
    // Accessibility: return focus to hamburger menu
    document.querySelector('#menu')?.focus();
  };

  const openMobileNav = () => {
    sidebar.classList.add('open');
    shellEl.classList.add('nav-open');
    document.body.style.overflow = 'hidden';
  };

  document.querySelector('#menu').onclick = openMobileNav;
  document.querySelector('#nav-backdrop').onclick = closeMobileNav;
  document.querySelector('#nav-toggle').onclick = () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    shellEl.classList.toggle('nav-collapsed', state.sidebarCollapsed);
    localStorage.setItem('simpleoj-sidebar', state.sidebarCollapsed ? 'collapsed' : 'expanded');
    requestAnimationFrame(() => state.editor?.layout());
  };

  // Keyboard navigation: Escape closes drawer
  if (window._onEscDrawer) {
    document.removeEventListener('keydown', window._onEscDrawer);
  }
  window._onEscDrawer = (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeMobileNav();
    }
  };
  document.addEventListener('keydown', window._onEscDrawer);
  document.querySelector('#logout').onclick = async () => {
    if (state.page === 'solve') {
      if (!confirm('Bạn đang trong lượt làm bài và chưa nộp bài. Đăng xuất sẽ mất mã nguồn hiện tại. Bạn có chắc chắn muốn đăng xuất?')) return;
    }
    await api('/api/auth/logout', { method: 'POST' });
    if (typeof PyodideManager !== 'undefined') PyodideManager.terminate();
    state.user = null;
    state.problems = null;
    state.submissions = null;
    state.leaderboard = null;
    state.adminDashboard = null;
    state.adminUsers = null;
    state.adminAssignmentState = null;
    state.problemDetails = {};
    authView();
  };
}

async function loadProblems() {
  if (state.problems !== null) return state.problems;
  const data = await api('/api/problems');
  state.problems = data.problems;
  return data.problems;
}

async function loadSubmissions() {
  if (state.submissions !== null) return state.submissions;
  const data = await api('/api/me/submissions');
  state.submissions = data.submissions;
  return data.submissions;
}

async function loadLeaderboard() {
  if (state.leaderboard !== null) return state.leaderboard;
  const data = await api('/api/leaderboard');
  state.leaderboard = data.leaderboard;
  return data.leaderboard;
}

async function loadAdminDashboard() {
  if (state.adminDashboard !== null) return state.adminDashboard;
  const data = await api('/api/admin/dashboard');
  state.adminDashboard = data;
  return data;
}

async function loadAdminUsers() {
  if (state.adminUsers !== null) return state.adminUsers;
  const data = await api('/api/admin/users?pageSize=1000');
  state.adminUsers = data.users;
  return data.users;
}

async function loadAdminStudentAssignments(userId, status = 'all') {
  if (!userId) return { student: null, assignments: [] };
  const params = new URLSearchParams({ userId, status });
  return api(`/api/admin/student-assignments?${params.toString()}`);
}

function clientGetRatingLabel(r) {
  if (r >= 800 && r <= 1000) return 'Cơ bản';
  if (r >= 1100 && r <= 1300) return 'Dễ';
  if (r >= 1400 && r <= 1600) return 'Trung bình';
  if (r >= 1700 && r <= 1900) return 'Khó';
  return 'Nâng cao';
}

function normalizeProblemItem(raw) {
  const rating = raw.rating !== undefined ? Number(raw.rating) : 800;
  const bestScore = raw.bestScore ?? raw.best_score ?? 0;
  const passingScore = raw.passingScore ?? raw.passing_score ?? 100;
  const submissionCount = Number(raw.submissionCount ?? raw.submission_count ?? 0);
  const completedAt = raw.completedAt ?? raw.completed_at ?? null;
  const bestStatus = raw.bestStatus ?? raw.best_status ?? null;

  const isCompleted = completedAt !== null || bestStatus === 'ACCEPTED' || bestScore >= passingScore;
  const isAttempted = submissionCount > 0;
  const isAssigned = Boolean(raw.isAssigned ?? raw.is_assigned);

  let uiStatus = 'not_started';
  if (isCompleted) uiStatus = 'completed';
  else if (isAttempted) uiStatus = 'attempted';
  else if (isAssigned) uiStatus = 'assigned';

  return {
    ...raw,
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    difficulty: raw.difficulty,
    rating,
    ratingLabel: raw.ratingLabel || clientGetRatingLabel(rating),
    timeLimitMinutes: raw.timeLimitMinutes ?? raw.time_limit_minutes ?? 30,
    maxScore: raw.maxScore ?? raw.max_score ?? 100,
    passingScore,
    bestScore,
    bestStatus,
    submissionCount,
    lastSubmittedAt: raw.lastSubmittedAt ?? raw.last_submitted_at ?? null,
    completedAt,
    isCompleted,
    isAttempted,
    isAssigned,
    uiStatus
  };
}

function assignmentStatusLabel(status) {
  return {
    ASSIGNED: 'Đang giao',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy'
  }[status] || status;
}

function assignmentStatusClass(status) {
  return {
    ASSIGNED: 'assigned',
    COMPLETED: 'mint',
    CANCELLED: 'gray'
  }[status] || 'gray';
}

function formatMaybeDate(value) {
  return value ? formatDate(value) : '—';
}

function renderStudentOptions(users, selectedId) {
  if (!users.length) {
    return '<option value="">Chưa có học sinh</option>';
  }
  return users.map((user) => {
    const selected = user.id === selectedId ? 'selected' : '';
    return `<option value="${escapeHtml(user.id)}" ${selected}>${escapeHtml(user.full_name)} · ${escapeHtml(user.email)}</option>`;
  }).join('');
}

function renderAssignmentProblemOptions(problems) {
  return problems
    .filter((problem) => problem.is_active !== false)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || String(a.title).localeCompare(String(b.title), 'vi'))
    .map((problem) => {
      const rating = problem.rating ?? 800;
      return `<label class="assignment-problem-item">
        <input type="checkbox" class="assignment-problem-checkbox" value="${escapeHtml(problem.id)}">
        <span class="assignment-problem-copy">
          <strong>${escapeHtml(problem.title)}</strong>
          <small>${rating} · ${escapeHtml(clientGetRatingLabel(rating))}${problem.is_active === false ? ' · Đã ẩn' : ''}</small>
        </span>
      </label>`;
    }).join('');
}

function renderAdminAssignmentsTable(assignments) {
  if (!assignments.length) {
    return '<div class="empty">Chưa có bài được giao cho học sinh này.</div>';
  }

  const rows = assignments.map((assignment) => {
    const rating = assignment.rating ?? 800;
    const ratingLabel = clientGetRatingLabel(rating);
    const canCancel = assignment.status === 'ASSIGNED';
    const note = assignment.note ? `<div class="assignment-note">${escapeHtml(assignment.note)}</div>` : '';
    const copied = assignment.copied_from_user_name ? `<div class="muted assignment-copy-note">Sao chép từ ${escapeHtml(assignment.copied_from_user_name)}</div>` : '';
    return `<tr>
      <td>
        <strong>${escapeHtml(assignment.title)}</strong><br>
        <span class="muted">${escapeHtml(assignment.slug)}</span>
        ${note}
        ${copied}
      </td>
      <td>${rating} · ${escapeHtml(ratingLabel)}</td>
      <td><span class="badge ${assignmentStatusClass(assignment.status)}">${assignmentStatusLabel(assignment.status)}</span></td>
      <td>${formatMaybeDate(assignment.assigned_at)}</td>
      <td>${formatMaybeDate(assignment.completed_at || assignment.cancelled_at)}</td>
      <td>${canCancel ? `<button class="btn small danger cancel-assignment" data-id="${escapeHtml(assignment.id)}">Hủy</button>` : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap"><table>
    <thead><tr><th>Bài</th><th>Rating</th><th>Trạng thái</th><th>Ngày giao</th><th>Ngày hoàn thành</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function problemCards(problems) {
  if (!problems.length) return '<div class="empty">Chưa có bài tập nào được mở.</div>';
  return `<div class="grid">${problems.map((raw) => {
    const p = normalizeProblemItem(raw);
    const slug = p.slug;
    const title = p.title;
    const rating = p.rating;
    const ratingLabel = p.ratingLabel;
    const limitMinutes = p.timeLimitMinutes;
    const bestScore = p.bestScore;
    const maxScore = p.maxScore;

    let statusClass = 'neutral';
    let statusLabel = 'Chưa làm';

    if (p.uiStatus === 'completed') {
      statusClass = 'mint';
      statusLabel = 'Hoàn thành';
    } else if (p.uiStatus === 'attempted') {
      statusClass = 'warm';
      statusLabel = 'Đã nộp';
    } else if (p.uiStatus === 'assigned') {
      statusClass = 'assigned';
      statusLabel = 'Được giao';
    }

    let ratingClass = 'r800';
    if (rating >= 1100 && rating <= 1300) ratingClass = 'r1100';
    else if (rating >= 1400 && rating <= 1600) ratingClass = 'r1400';
    else if (rating >= 1700 && rating <= 1900) ratingClass = 'r1700';
    else if (rating >= 2000) ratingClass = 'r2000';

    const showAssignedBadge = p.isAssigned && p.uiStatus !== 'assigned';
    const scoreText = p.isAttempted ? `Điểm tốt nhất: ${bestScore}/${maxScore}` : `Điểm: ${bestScore}/${maxScore}`;

    return `<article class="problem-card">
      <div class="card-badges">
        <span class="badge ${statusClass}">${statusLabel}</span>
        ${showAssignedBadge ? '<span class="badge assigned">Được giao</span>' : ''}
        <span class="badge ${ratingClass}">${rating} · ${escapeHtml(ratingLabel)}</span>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <div class="problem-groups-list" style="margin-top: -6px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px;">
        ${(p.groups || []).map(g => `<span class="group-chip" style="background-color: ${g.color || '#6b7280'}; margin: 0;">${escapeHtml(g.name)}</span>`).join('')}
      </div>
      <div class="problem-meta">
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="meta-icon" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${limitMinutes} phút</span>
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="meta-icon" aria-hidden="true"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> ${scoreText}</span>
      </div>
      <button class="btn small open-problem" data-slug="${escapeHtml(slug)}">Mở bài →</button>
    </article>`;
  }).join('')}</div>`;
}

function bindProblemButtons() {
  document.querySelectorAll('.open-problem').forEach((button) => button.onclick = () => openProblem(button.dataset.slug));
}

async function homeView() {
  const [problems, submissions] = await Promise.all([loadProblems(), loadSubmissions()]);
  const accepted = submissions.filter((s) => s.status === 'ACCEPTED').reduce((acc, s) => { acc.add(s.slug); return acc; }, new Set()).size;
  shell(`<section class="content">
    <div class="hero-row"><div><span class="eyebrow">Phòng luyện hôm nay</span><h2>Chào ${escapeHtml(state.user.full_name.split(' ').slice(-1)[0])},<br>mình viết gì đây?</h2></div><p class="muted">Mỗi lần chạy là một giả thuyết.<br>Mỗi lần sai là thêm một dữ kiện.</p></div>
    <div class="stats"><div class="stat"><b>${problems.length}</b><span>Bài đang mở</span></div><div class="stat"><b>${accepted}</b><span>Bài đã giải đúng</span></div><div class="stat"><b>${submissions.length}</b><span>Lượt nộp gần đây</span></div></div>
    <div class="section-head"><h3>Bài tập mới</h3><button class="text-btn" id="all-problems">Xem tất cả →</button></div>${problemCards(problems.slice(0, 6))}
  </section>`);
  document.querySelector('#all-problems').onclick = () => navigate('problems');
  bindProblemButtons();

  // Preload Monaco Editor in background to eliminate delay
  loadMonaco().catch(() => { });
}

async function problemsView() {
  // Initialize pagination & filter state
  state.problemsPage = {
    tab: 'all',
    group: '',
    items: [],
    cursor: null,
    hasMore: false,
    loading: false,
    minRating: '',
    maxRating: '',
    minScore: '',
    maxScore: '',
    assigned: 'all',
    sort: 'newest',
    uploadedFrom: '',
    uploadedTo: ''
  };

  shell(`<section class="content">
    <div class="hero-row">
      <div>
        <span class="eyebrow">Kho bài tập</span>
        <h2>Chọn một vấn đề<br>đáng để giải.</h2>
      </div>
    </div>
    
    <!-- Group Cards Container -->
    <div id="group-cards-container" class="group-cards-grid"></div>
    
    <!-- Tab Headers -->
    <div class="tabs-header" role="tablist">
      <button class="tab-btn active" data-tab="all" role="tab" aria-selected="true">Tất cả</button>
      <button class="tab-btn" data-tab="todo" role="tab" aria-selected="false">Chưa làm</button>
      <button class="tab-btn" data-tab="attempted" role="tab" aria-selected="false">Đã nộp</button>
      <button class="tab-btn" data-tab="done" role="tab" aria-selected="false">Đã hoàn thành</button>
      <button class="tab-btn" data-tab="assigned" role="tab" aria-selected="false">Được giao</button>
    </div>
    
    <!-- Filter Panel -->
    <div class="filter-wrapper">
      <div class="filter-backdrop" id="filter-backdrop" aria-hidden="true"></div>
      <button class="filter-toggle-btn" id="filter-toggle" aria-label="Mở bộ lọc và sắp xếp">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Bộ lọc & Sắp xếp
      </button>
      
      <div class="filter-panel collapsed" id="filter-panel" role="dialog" aria-modal="true" aria-label="Bộ lọc và sắp xếp">
        <div class="filter-header">
          <h3>Bộ lọc & Sắp xếp</h3>
          <button class="close-sheet-btn" id="close-sheet" aria-label="Đóng bộ lọc">✕</button>
        </div>
        
        <div class="filter-grid">
          <div class="filter-group">
            <label for="filter-rating">Độ khó / Rating</label>
            <select id="filter-rating">
              <option value="all">Tất cả</option>
              <option value="800-1000">800 - 1000 (Cơ bản)</option>
              <option value="1100-1300">1100 - 1300 (Dễ)</option>
              <option value="1400-1600">1400 - 1600 (Trung bình)</option>
              <option value="1700-1900">1700 - 1900 (Khó)</option>
              <option value="2000-3500">2000+ (Nâng cao)</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label for="filter-assigned">Phân bổ</label>
            <select id="filter-assigned">
              <option value="all">Tất cả bài</option>
              <option value="only">Bài được giao</option>
              <option value="free">Bài tự do</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label for="filter-sort">Sắp xếp</label>
            <select id="filter-sort">
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="rating_desc">Rating cao nhất</option>
              <option value="rating_asc">Rating thấp nhất</option>
              <option value="score_desc">Điểm cao nhất</option>
              <option value="score_asc">Điểm thấp nhất</option>
            </select>
          </div>
          
          <div class="filter-group" id="filter-group-score">
            <label>Điểm số (Min - Max)</label>
            <div class="range-inputs">
              <input type="number" id="filter-min-score" placeholder="0" min="0" max="100">
              <span>-</span>
              <input type="number" id="filter-max-score" placeholder="100" min="0" max="100">
            </div>
          </div>
          
          <div class="filter-group">
            <label>Ngày đăng (Từ - Đến)</label>
            <div class="range-inputs">
              <input type="date" id="filter-date-from">
              <span>-</span>
              <input type="date" id="filter-date-to">
            </div>
          </div>
        </div>
        
        <div class="filter-actions">
          <button class="btn secondary" id="filter-reset">Đặt lại</button>
          <button class="btn" id="filter-apply">Áp dụng</button>
        </div>
      </div>
    </div>
    
    <!-- Problems Container -->
    <div id="problems-list-container">
      <div id="problems-grid"></div>
      <div class="loading-state" id="problems-loading" style="display:none;">
        <div class="loading-spinner small"></div> <span>Đang tải...</span>
      </div>
      <div class="empty-state" id="problems-empty" style="display:none;"></div>
      <div class="no-more-state" id="problems-no-more" style="display:none;">Đã hết bài</div>
      
      <!-- Infinite Scroll Trigger -->
      <div id="infinite-scroll-trigger" style="height: 1px; margin-top: 0;"></div>
    </div>
  </section>`, 'Bài tập');

  // Reset inherited scroll from long pages such as the solver before binding mobile filter UI.
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

  // Bind tab events
  const updateScoreFilterVisibility = () => {
    const scoreGroup = document.querySelector('#filter-group-score');
    if (scoreGroup) {
      const showScore = state.problemsPage.tab !== 'todo' && state.problemsPage.tab !== 'assigned';
      scoreGroup.style.display = showScore ? 'flex' : 'none';
    }
  };
  updateScoreFilterVisibility();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      if (state.problemsPage.loading) return;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.problemsPage.tab = btn.dataset.tab;

      updateScoreFilterVisibility();
      resetAndLoadProblems();
    };
  });

  // Bind filter toggle and dialog controls
  const filterToggle = document.querySelector('#filter-toggle');
  const filterPanel = document.querySelector('#filter-panel');
  const filterBackdrop = document.querySelector('#filter-backdrop');
  const closeSheetBtn = document.querySelector('#close-sheet');
  const filterApplyBtn = document.querySelector('#filter-apply');
  const filterResetBtn = document.querySelector('#filter-reset');

  const openFilter = () => {
    filterPanel.classList.remove('collapsed');
    filterPanel.classList.add('open');
    if (window.innerWidth <= 768) {
      filterBackdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
      filterApplyBtn?.focus();
    }
  };

  const closeFilter = () => {
    filterPanel.classList.add('collapsed');
    filterPanel.classList.remove('open');
    filterBackdrop.classList.remove('open');
    document.body.style.overflow = '';
    filterToggle.focus();
  };

  filterToggle.onclick = () => {
    if (filterPanel.classList.contains('collapsed')) {
      openFilter();
    } else {
      closeFilter();
    }
  };

  filterBackdrop.onclick = closeFilter;
  closeSheetBtn.onclick = closeFilter;

  // Keyboard navigation: Escape closes filter bottom sheet
  if (window._onEscFilter) {
    document.removeEventListener('keydown', window._onEscFilter);
  }
  window._onEscFilter = (e) => {
    if (e.key === 'Escape' && !filterPanel.classList.contains('collapsed')) {
      closeFilter();
    }
  };
  document.addEventListener('keydown', window._onEscFilter);

  // Bind filter input elements
  const ratingSelect = document.querySelector('#filter-rating');
  const assignedSelect = document.querySelector('#filter-assigned');
  const sortSelect = document.querySelector('#filter-sort');
  const minScoreInput = document.querySelector('#filter-min-score');
  const maxScoreInput = document.querySelector('#filter-max-score');
  const dateFromInput = document.querySelector('#filter-date-from');
  const dateToInput = document.querySelector('#filter-date-to');

  const onFilterChange = () => {
    const rRange = ratingSelect.value;
    if (rRange === 'all') {
      state.problemsPage.minRating = '';
      state.problemsPage.maxRating = '';
    } else {
      const [min, max] = rRange.split('-');
      state.problemsPage.minRating = min;
      state.problemsPage.maxRating = max;
    }
    state.problemsPage.assigned = assignedSelect.value;
    state.problemsPage.sort = sortSelect.value;
    state.problemsPage.minScore = minScoreInput.value;
    state.problemsPage.maxScore = maxScoreInput.value;
    state.problemsPage.uploadedFrom = dateFromInput.value;
    state.problemsPage.uploadedTo = dateToInput.value;
    resetAndLoadProblems();
  };

  // Debounce helper for live filters on desktop
  let debounceTimer;
  const debouncedFilterChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onFilterChange, 400);
  };

  const handleInstantFilterChange = () => {
    if (window.innerWidth > 768) {
      onFilterChange();
    }
  };

  const handleInstantDebouncedChange = () => {
    if (window.innerWidth > 768) {
      debouncedFilterChange();
    }
  };

  ratingSelect.onchange = handleInstantFilterChange;
  assignedSelect.onchange = handleInstantFilterChange;
  sortSelect.onchange = handleInstantFilterChange;
  minScoreInput.oninput = handleInstantDebouncedChange;
  maxScoreInput.oninput = handleInstantDebouncedChange;
  dateFromInput.onchange = handleInstantFilterChange;
  dateToInput.onchange = handleInstantFilterChange;

  // Apply and Reset actions
  const applyFiltersMobile = () => {
    const rRange = ratingSelect.value;
    if (rRange === 'all') {
      state.problemsPage.minRating = '';
      state.problemsPage.maxRating = '';
    } else {
      const [min, max] = rRange.split('-');
      state.problemsPage.minRating = min;
      state.problemsPage.maxRating = max;
    }
    state.problemsPage.assigned = assignedSelect.value;
    state.problemsPage.sort = sortSelect.value;
    state.problemsPage.minScore = minScoreInput.value;
    state.problemsPage.maxScore = maxScoreInput.value;
    state.problemsPage.uploadedFrom = dateFromInput.value;
    state.problemsPage.uploadedTo = dateToInput.value;

    closeFilter();
    resetAndLoadProblems();
  };

  const resetFilters = () => {
    ratingSelect.value = 'all';
    assignedSelect.value = 'all';
    sortSelect.value = 'newest';
    minScoreInput.value = '';
    maxScoreInput.value = '';
    dateFromInput.value = '';
    dateToInput.value = '';

    if (window.innerWidth <= 768) {
      applyFiltersMobile();
    } else {
      onFilterChange();
    }
  };

  filterApplyBtn.onclick = applyFiltersMobile;
  filterResetBtn.onclick = resetFilters;

  // Fetch and render problem groups
  const renderGroupCards = async () => {
    const groupContainer = document.querySelector('#group-cards-container');
    if (!groupContainer) return;
    try {
      const data = await api('/api/problem-groups');
      const groups = data.groups || [];
      if (groups.length === 0) {
        groupContainer.style.display = 'none';
        return;
      }
      groupContainer.style.display = 'grid';
      groupContainer.innerHTML = groups.map(g => {
        const isActive = state.problemsPage.group === g.slug ? 'active' : '';
        const icon = g.icon || '📁';
        return `
          <div class="group-card ${isActive}" data-slug="${escapeHtml(g.slug)}">
            <span class="group-icon">${escapeHtml(icon)}</span>
            <div class="group-info">
              <h4>${escapeHtml(g.name)}</h4>
              <small>${g.problemCount} bài</small>
            </div>
          </div>
        `;
      }).join('');

      // Bind click event
      groupContainer.querySelectorAll('.group-card').forEach(card => {
        card.onclick = () => {
          const clickedSlug = card.dataset.slug;
          if (state.problemsPage.group === clickedSlug) {
            state.problemsPage.group = '';
          } else {
            state.problemsPage.group = clickedSlug;
          }
          renderGroupCards();
          resetAndLoadProblems();
        };
      });
    } catch (err) {
      console.error('Failed to load problem groups:', err);
    }
  };

  renderGroupCards();

  // Setup Infinite Scroll Observer
  setupInfiniteScrollObserver();

  // Initial load
  await loadNextProblemsPage();
}

function resetAndLoadProblems() {
  state.problemsPage.items = [];
  state.problemsPage.cursor = null;
  state.problemsPage.hasMore = false;

  const grid = document.querySelector('#problems-grid');
  if (grid) grid.innerHTML = '';

  const oldRetry = document.querySelector('#retry-loading');
  if (oldRetry) oldRetry.remove();

  document.querySelector('#problems-empty').style.display = 'none';
  document.querySelector('#problems-no-more').style.display = 'none';

  // Safe area: prevent scroll issue on bottom sheet and reset to top
  window.scrollTo({ top: 0, behavior: 'instant' });

  loadNextProblemsPage();
}

async function loadNextProblemsPage() {
  if (state.problemsPage.loading) return;
  state.problemsPage.loading = true;

  const loadingIndicator = document.querySelector('#problems-loading');
  if (loadingIndicator) loadingIndicator.style.display = 'flex';

  const oldRetry = document.querySelector('#retry-loading');
  if (oldRetry) oldRetry.remove();

  try {
    const { tab, cursor, minRating, maxRating, minScore, maxScore, assigned, sort, uploadedFrom, uploadedTo, group } = state.problemsPage;

    // Build query params
    const params = new URLSearchParams({
      tab,
      limit: '10'
    });
    if (cursor) params.append('cursor', cursor);
    if (minRating) params.append('minRating', minRating);
    if (maxRating) params.append('maxRating', maxRating);
    if (minScore) params.append('minScore', minScore);
    if (maxScore) params.append('maxScore', maxScore);
    if (assigned) params.append('assigned', assigned);
    if (sort) params.append('sort', sort);
    if (uploadedFrom) params.append('uploadedFrom', uploadedFrom);
    if (uploadedTo) params.append('uploadedTo', uploadedTo);
    if (group) params.append('group', group);

    const data = await api(`/api/problems?${params.toString()}`);

    state.problemsPage.items.push(...data.items);
    state.problemsPage.cursor = data.nextCursor;
    state.problemsPage.hasMore = data.hasMore;

    renderProblemsGrid();
  } catch (error) {
    toast(error.message, true);
    // Display interactive retry prompt on failure
    const grid = document.querySelector('#problems-grid');
    if (grid) {
      grid.insertAdjacentHTML('afterend', `
        <div id="retry-loading" class="retry-state" style="text-align:center; padding:16px;">
          <span style="font-size:13px; color:var(--muted)">Không tải được bài. </span>
          <button class="text-btn" id="btn-retry-load" style="font-size:13px;">Thử lại</button>
        </div>
      `);
      document.querySelector('#btn-retry-load').onclick = () => {
        loadNextProblemsPage();
      };
    }
  } finally {
    state.problemsPage.loading = false;
    if (loadingIndicator) loadingIndicator.style.display = 'none';
  }
}

function renderProblemsGrid() {
  const grid = document.querySelector('#problems-grid');
  const emptyState = document.querySelector('#problems-empty');
  const noMoreState = document.querySelector('#problems-no-more');

  if (!grid) return;

  const items = state.problemsPage.items;

  if (items.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    noMoreState.style.display = 'none';

    if (state.problemsPage.tab === 'done') {
      emptyState.innerHTML = `
        <div class="empty-prompt">
          <p>Bạn chưa hoàn thành bài tập nào trong mục này.</p>
          <button class="btn" id="go-to-todo-tab">Xem danh sách chưa làm</button>
        </div>
      `;
      const btn = document.querySelector('#go-to-todo-tab');
      if (btn) {
        btn.onclick = () => {
          const todoBtn = document.querySelector('.tab-btn[data-tab="todo"]');
          if (todoBtn) todoBtn.click();
        };
      }
    } else if (state.problemsPage.tab === 'attempted') {
      emptyState.innerHTML = `
        <div class="empty-prompt">
          <p>Bạn chưa nộp bài tập nào trong mục này.</p>
          <button class="btn" id="go-to-todo-tab">Xem danh sách chưa làm</button>
        </div>
      `;
      const btn = document.querySelector('#go-to-todo-tab');
      if (btn) {
        btn.onclick = () => {
          const todoBtn = document.querySelector('.tab-btn[data-tab="todo"]');
          if (todoBtn) todoBtn.click();
        };
      }
    } else if (state.problemsPage.tab === 'assigned') {
      emptyState.innerHTML = `
        <div class="empty-prompt">
          <p>Bạn không có bài tập nào được giao ở mục này.</p>
        </div>
      `;
    } else {
      emptyState.innerHTML = '<div class="empty-prompt"><p>Không tìm thấy bài tập phù hợp với bộ lọc.</p></div>';
    }
  } else {
    emptyState.style.display = 'none';

    grid.innerHTML = problemCards(items);
    bindProblemButtons();

    if (!state.problemsPage.hasMore) {
      noMoreState.style.display = 'block';
    } else {
      noMoreState.style.display = 'none';
    }
  }
}

function setupInfiniteScrollObserver() {
  const trigger = document.querySelector('#infinite-scroll-trigger');
  if (!trigger) return;

  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.isIntersecting && state.problemsPage.hasMore && !state.problemsPage.loading) {
      loadNextProblemsPage();
    }
  }, {
    rootMargin: '100px'
  });
  observer.observe(trigger);
}

async function openProblem(slug) {
  clearInterval(state.timer);
  state.editor?.dispose(); state.editor = null;
  state.terminal?.dispose(); state.terminal = null;

  // Show a loading indicator instantly inside the content area for immediate visual feedback
  const mainEl = document.querySelector('.main');
  if (mainEl) {
    mainEl.innerHTML = `<header class="topbar"><button class="mobile-menu" id="menu" aria-label="Mở menu">☰</button><h1>Đang chuẩn bị phòng luyện...</h1><button class="text-btn" id="logout">Đăng xuất</button></header>
      <div class="loading-container"><div class="loading-spinner"></div></div>`;
  }

  let problem = state.problemDetails[slug];
  let attempt;
  let progress;
  if (problem) {
    const [resA, resProg] = await Promise.all([
      api('/api/attempts', { method: 'POST', body: { slug } }),
      api(`/api/problems/${encodeURIComponent(slug)}/progress`)
    ]);
    attempt = resA.attempt;
    progress = resProg.progress;
  } else {
    const [resP, resA, resProg] = await Promise.all([
      api(`/api/problems/${encodeURIComponent(slug)}`),
      api('/api/attempts', { method: 'POST', body: { slug } }),
      api(`/api/problems/${encodeURIComponent(slug)}/progress`)
    ]);
    problem = resP.problem;
    attempt = resA.attempt;
    progress = resProg.progress;
    state.problemDetails[slug] = problem;
  }

  state.current = problem; state.attempt = attempt; state.page = 'solve';
  const rating = problem.rating ?? 800;
  const ratingLabel = clientGetRatingLabel(rating);
  let ratingClass = 'r800';
  if (rating >= 1100 && rating <= 1300) ratingClass = 'r1100';
  else if (rating >= 1400 && rating <= 1600) ratingClass = 'r1400';
  else if (rating >= 1700 && rating <= 1900) ratingClass = 'r1700';
  else if (rating >= 2000) ratingClass = 'r2000';

  const pState = typeof PyodideManager !== 'undefined' ? PyodideManager.getState() : 'idle';
  let initialStatusText = '(Python: Đang tải)';
  let initialStatusColor = 'var(--muted)';
  if (pState === 'ready') {
    initialStatusText = '(Python: Sẵn sàng)';
    initialStatusColor = '#236a51';
  } else if (pState === 'running') {
    initialStatusText = '(Python: Đang chạy)';
    initialStatusColor = '#2563eb';
  } else if (pState === 'waiting_input') {
    initialStatusText = '(Python: Đang chờ nhập)';
    initialStatusColor = '#d97706';
  } else if (pState === 'failed') {
    initialStatusText = '(Python: Lỗi)';
    initialStatusColor = '#b43b31';
  }

  const examples = (problem.examples || []).map((ex, i) => `<div class="example"><div class="example-head">Ví dụ ${i + 1}</div><div class="example-grid"><div>Input<pre>${escapeHtml(ex.input)}</pre></div><div>Output<pre>${escapeHtml(ex.output)}</pre></div></div>${ex.explanation ? `<div style="padding:0 12px 12px" class="muted">${escapeHtml(ex.explanation)}</div>` : ''}</div>`).join('');

  const layoutHtml = `
    <div class="solve-mobile-tabs" role="tablist">
      <button class="active" id="show-problem" role="tab">Đề bài</button>
      <button id="show-code" role="tab">Code & Shell</button>
    </div>
    <section class="solve-layout" id="solve-layout">
      <article class="problem-pane" id="problem-pane">
        <div class="problem-pane-container">
          <div class="problem-pane-tabs" role="tablist">
            <button class="active" id="tab-desc" role="tab" aria-selected="true">Đề bài</button>
            <button id="tab-progress" role="tab" aria-selected="false">Lịch sử nộp bài</button>
          </div>
          
          <div id="pane-desc" style="display: block;">
            <span class="badge ${ratingClass}">${rating} · ${escapeHtml(ratingLabel)}</span>
            <h2>${escapeHtml(problem.title)}</h2>
            <div class="markdown">${markdown(problem.description)}</div>
            <div class="section-head"><h3>Ví dụ</h3></div>
            ${examples}
          </div>
          
          <div id="pane-progress" style="display: none;">
            ${getProgressHtml(progress)}
          </div>
        </div>
      </article>
      <div class="solve-layout-resizer-h" id="resizer-h"></div>
      <section class="editor-pane">
        <div class="editor-bar">
          <span><i class="python-dot"></i> PYTHON 3 · main.py</span>
          <span class="timer" id="timer">--:--</span>
        </div>
        <div class="code-editor" id="code" aria-label="Mã nguồn Python"></div>
        <div class="solve-layout-resizer-v" id="resizer-v"></div>
        <section class="terminal" aria-label="Terminal">
          <div class="terminal-header">
            <div class="terminal-dots"><span></span><span></span><span></span></div>
            <span class="terminal-title">Terminal — Python 3 <span id="python-status" style="font-size:11px; margin-left:8px; opacity:0.8; color: ${initialStatusColor}">${initialStatusText}</span></span>
            <div class="terminal-actions">
              <button class="term-btn" id="clear-shell" title="Xóa terminal">⌫ Xóa terminal</button>
              <button class="term-btn stop" id="stop" title="Ngắt tiến trình (Ctrl+C)" disabled>■ Stop</button>
              <button class="term-btn run" id="run" title="Chạy thử (python main.py)">▶ Run</button>
              <button class="term-btn submit" id="submit" title="Nộp bài chấm điểm">⬆ Nộp bài</button>
            </div>
          </div>
          <div class="terminal-screen" id="terminal-host" tabindex="0" aria-label="Terminal Python tương tác"></div>
        </section>
      </section>
    </section>
  `;

  shell(layoutHtml, problem.title);

  const btnDesc = document.querySelector('#tab-desc');
  const btnProgress = document.querySelector('#tab-progress');
  const paneDesc = document.querySelector('#pane-desc');
  const paneProgress = document.querySelector('#pane-progress');

  if (btnDesc && btnProgress && paneDesc && paneProgress) {
    btnDesc.onclick = () => {
      btnDesc.classList.add('active');
      btnDesc.setAttribute('aria-selected', 'true');
      btnProgress.classList.remove('active');
      btnProgress.setAttribute('aria-selected', 'false');
      paneDesc.style.display = 'block';
      paneProgress.style.display = 'none';
    };
    btnProgress.onclick = () => {
      btnProgress.classList.add('active');
      btnProgress.setAttribute('aria-selected', 'true');
      btnDesc.classList.remove('active');
      btnDesc.setAttribute('aria-selected', 'false');
      paneDesc.style.display = 'none';
      paneProgress.style.display = 'block';
    };
  }

  bindProgressActions(progress);

  const pane = document.querySelector('#problem-pane');
  if (pane && window.renderMathInElement) {
    const renderMath = () => {
      window.renderMathInElement(pane, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\[', display: true }
        ],
        throwOnError: false
      });
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(renderMath);
    } else {
      setTimeout(renderMath, 50);
    }
  }
  await setupEditor();
  initResizers();
}

async function setupEditor() {
  const editorHost = document.querySelector('#code');
  await loadMonaco();
  if (!editorHost.isConnected) return;
  const cacheKey = `simpleoj-code-${state.user.id}-${state.current.slug}`;
  const savedCode = localStorage.getItem(cacheKey);
  state.editor = monaco.editor.create(editorHost, {
    value: savedCode || state.current.starter_code, language: 'python', theme: 'thonny-light', automaticLayout: true,
    fontFamily: 'Consolas, "DM Mono", monospace', fontSize: 14, lineHeight: 22, tabSize: 4,
    insertSpaces: true, minimap: { enabled: false }, scrollBeyondLastLine: false, smoothScrolling: true,
    padding: { top: 10, bottom: 10 }, renderLineHighlight: 'all', overviewRulerLanes: 0,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }, wordWrap: 'off'
  });
  let saveTimeout = null;
  state.editor.onDidChangeModelContent(() => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      localStorage.setItem(cacheKey, state.editor.getValue());
    }, 500);
  });
  const terminalHost = document.querySelector('#terminal-host');
  const runButton = document.querySelector('#run');
  const stopButton = document.querySelector('#stop');
  state.terminal?.dispose();
  state.terminal = createTerminalController({
    host: terminalHost,
    getCode: () => state.editor?.getValue() || '',
    onRunningChange: (running) => {
      if (runButton) runButton.disabled = running;
      if (stopButton) stopButton.disabled = !running;
    }
  });

  const layout = document.querySelector('#solve-layout');
  const setMobilePane = (code) => {
    layout.classList.toggle('show-code', code);
    document.querySelector('#show-code').classList.toggle('active', code);
    document.querySelector('#show-problem').classList.toggle('active', !code);
    if (code) requestAnimationFrame(() => {
      state.editor?.layout();
      state.terminal?.fit();
    });
  };
  document.querySelector('#show-problem').onclick = () => setMobilePane(false);
  document.querySelector('#show-code').onclick = () => setMobilePane(true);

  const tick = () => {
    const remaining = Math.max(0, new Date(state.attempt.deadline_at).getTime() - Date.now());
    const minutes = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    const timer = document.querySelector('#timer');
    if (timer) timer.textContent = `${minutes}:${seconds}`;
    if (!remaining) {
      clearInterval(state.timer);
      document.querySelector('#submit').disabled = true;
      toast('Lượt làm đã hết giờ.', true);
    }
  };
  tick();
  state.timer = setInterval(tick, 1000);

  document.querySelector('#clear-shell').onclick = () => {
    state.terminal?.clear();
    state.terminal?.focus();
  };
  runButton.onclick = () => {
    if (state.terminal?.execute('python main.py')) runButton.disabled = true;
    state.terminal?.focus();
  };
  stopButton.onclick = () => {
    state.terminal?.interrupt();
    state.terminal?.focus();
  };
  document.querySelector('#submit').onclick = async (event) => {
    if (!confirm('Nộp bài và kết thúc lượt làm hiện tại?')) return;
    event.target.disabled = true;
    state.terminal?.notice('Đang chấm trên các test ẩn…', '36');
    try {
      const slug = state.current.slug;
      const data = await api('/api/submissions', { method: 'POST', body: { attemptId: state.attempt.id, code: state.editor.getValue() } });
      clearInterval(state.timer);
      state.page = 'submitted';
      const cacheKey = `simpleoj-code-${state.user.id}-${state.current.slug}`;
      localStorage.removeItem(cacheKey);

      // Load new progress and update state
      const updatedProgRes = await api(`/api/problems/${encodeURIComponent(slug)}/progress`);
      const updatedProg = updatedProgRes.progress;

      // Update local cache
      updateProblemProgressLocally(
        slug,
        updatedProg.bestScore,
        updatedProg.bestStatus,
        updatedProg.submissionCount,
        updatedProg.completedAt,
        updatedProg.isCompleted,
        updatedProg.isAttempted,
        updatedProg.isCompleted ? 'completed' : updatedProg.isAttempted ? 'attempted' : 'not_started'
      );

      // Update progress pane UI in the background if the user stays
      const paneProgress = document.querySelector('#pane-progress');
      if (paneProgress) {
        paneProgress.innerHTML = getProgressHtml(updatedProg);
        bindProgressActions(updatedProg);
      }

      state.submissions = null;
      state.leaderboard = null;
      state.adminDashboard = null;
      const submitBtn = document.querySelector('#submit');
      if (submitBtn) {
        submitBtn.textContent = '← Quay lại';
        submitBtn.className = 'term-btn';
        submitBtn.title = 'Quay lại danh sách bài tập';
        submitBtn.disabled = false;
        submitBtn.onclick = () => navigate('problems');
      }
      resultModal(data);
    } catch (error) { toast(error.message, true); event.target.disabled = false; }
  };
}

function resultModal(data) {
  const s = data.submission;
  const reports = data.reports.map((r) => `<tr><td>Test ${r.index}</td><td><span class="badge ${r.passed ? '' : 'red'}">${r.passed ? 'Đúng' : 'Sai'}</span></td><td>${escapeHtml(r.error || (r.passed ? 'Khớp đáp án' : `Nhận: ${r.actual || '(trống)'}`))}</td></tr>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="result-modal"><div class="modal"><span class="eyebrow">Kết quả chấm bài</span><h2>${s.score}/100 · ${statusLabel(s.status)}</h2><p class="muted">${s.passed_count}/${s.total_count} test đúng · thời gian ${formatDuration(s.duration_ms)}</p><div class="table-wrap"><table><thead><tr><th>Test</th><th>Kết quả</th><th>Chi tiết</th></tr></thead><tbody>${reports}</tbody></table></div><div class="modal-actions"><button class="btn secondary" id="result-stay">Ở lại xem code</button><button class="btn" id="result-close">Về danh sách bài</button></div></div></div>`);
  document.querySelector('#result-stay').onclick = () => { document.querySelector('#result-modal').remove(); };
  document.querySelector('#result-close').onclick = () => { document.querySelector('#result-modal').remove(); navigate('problems'); };
}

function getProgressHtml(p) {
  const isCompleted = p.isCompleted;
  const isAttempted = p.isAttempted;
  const hasBestSub = p.bestSubmissionId !== null;

  return `
    <div class="progress-panel" style="padding: 12px 0;">
      <div class="progress-summary-card" style="background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: var(--ink);">Trạng thái làm bài</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--muted); font-size: 0.9rem;">Điểm tốt nhất:</span>
            <strong style="color: var(--ink); font-size: 0.9rem;">${p.bestScore}/100</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--muted); font-size: 0.9rem;">Kết quả tốt nhất:</span>
            <span class="badge ${p.bestStatus === 'ACCEPTED' ? 'mint' : p.bestStatus ? 'red' : 'neutral'}">${statusLabel(p.bestStatus) || 'Chưa làm'}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--muted); font-size: 0.9rem;">Số lần nộp bài:</span>
            <span style="color: var(--ink); font-weight: 600; font-size: 0.9rem;">${p.submissionCount} lần</span>
          </div>
          ${p.completedAt ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--muted); font-size: 0.9rem;">Hoàn thành lúc:</span>
            <span style="color: var(--ink); font-size: 0.85rem;">${formatDate(p.completedAt)}</span>
          </div>` : ''}
        </div>
      </div>

      ${p.submissionCount > 0 ? `
      <div class="progress-actions" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
        <button class="btn secondary block" id="btn-restore-last" style="justify-content: center; font-size: 0.9rem;">Khôi phục code đã nộp cuối</button>
        ${hasBestSub ? `
        <button class="btn block" id="btn-view-best" style="justify-content: center; font-size: 0.9rem;">Xem bài nộp tốt nhất</button>
        ` : ''}
      </div>
      ` : '<div class="muted" style="text-align: center; margin-bottom: 24px; font-size: 0.9rem;">Bạn chưa nộp bài tập này lần nào.</div>'}

      <h4 style="margin: 0 0 12px 0; font-size: 1rem; color: var(--ink);">Các bài nộp gần đây</h4>
      <div class="submissions-list" style="display: flex; flex-direction: column; gap: 8px;">
        ${p.recentSubmissions.length > 0 ? p.recentSubmissions.map(s => {
    const isAccepted = s.status === 'ACCEPTED';
    const statusClass = isAccepted ? 'mint' : 'red';
    const scoreColor = isAccepted ? '#0a6946' : '#b43b31';
    return `
          <div class="submission-item" data-id="${s.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; transition: 0.15s;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span class="badge ${statusClass}" style="align-self: flex-start; font-size: 9px; padding: 2px 6px;">${statusLabel(s.status)}</span>
              <span style="font-size: 0.75rem; color: var(--muted);">${formatDate(s.createdAt)}</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <strong style="color: ${scoreColor}; font-size: 0.95rem;">${s.score}/100</strong>
              <span style="font-size: 0.75rem; color: var(--muted);">${formatDuration(s.durationMs)}</span>
            </div>
          </div>
          `;
  }).join('') : '<div class="muted" style="text-align: center; padding: 12px; font-size: 0.85rem;">Không có bài nộp nào gần đây.</div>'}
      </div>
    </div>
  `;
}

function bindProgressActions(prog) {
  const btnRestore = document.querySelector('#btn-restore-last');
  const btnViewBest = document.querySelector('#btn-view-best');
  const subItems = document.querySelectorAll('.submission-item');

  if (btnRestore) {
    btnRestore.onclick = async () => {
      if (!prog.recentSubmissions.length) return;
      const confirmRestore = confirm('Bạn có chắc chắn muốn khôi phục mã nguồn đã nộp cuối cùng? Hành động này sẽ ghi đè lên trình soạn thảo hiện tại.');
      if (confirmRestore) {
        try {
          toast('Đang khôi phục mã nguồn...');
          const lastSub = prog.recentSubmissions[0];
          const data = await api(`/api/submissions/${lastSub.id}`);
          state.editor?.setValue(data.submission.code);
          toast('Đã khôi phục mã nguồn cuối.');
        } catch (e) {
          toast(e.message, true);
        }
      }
    };
  }

  if (btnViewBest && prog.bestSubmissionId) {
    btnViewBest.onclick = () => {
      showSubmissionDetailModal(prog.bestSubmissionId);
    };
  }

  subItems.forEach(item => {
    item.onclick = () => {
      showSubmissionDetailModal(item.dataset.id);
    };
  });
}

function updateProblemProgressLocally(slug, bestScore, bestStatus, submissionCount, completedAt, isCompleted, isAttempted, uiStatus) {
  const updateItem = (item) => {
    if (item.slug === slug) {
      return {
        ...item,
        bestScore,
        bestStatus,
        submissionCount,
        completedAt,
        isCompleted,
        isAttempted,
        uiStatus
      };
    }
    return item;
  };

  if (Array.isArray(state.problems)) {
    state.problems = state.problems.map(updateItem);
  }
  if (state.problemsPage && Array.isArray(state.problemsPage.items)) {
    const tab = state.problemsPage.tab;
    const shouldRemove =
      (tab === 'todo' && submissionCount > 0) ||
      (tab === 'attempted' && isCompleted) ||
      (tab === 'assigned' && isCompleted) ||
      (tab === 'done' && !isCompleted);

    if (shouldRemove) {
      state.problemsPage.items = state.problemsPage.items.filter(item => item.slug !== slug);
    } else {
      state.problemsPage.items = state.problemsPage.items.map(updateItem);
    }
  }
}

async function showSubmissionDetailModal(submissionId) {
  try {
    toast('Đang tải chi tiết bài nộp...');
    const data = await api(`/api/submissions/${submissionId}`);
    const s = data.submission;

    let reportsList = [];
    if (s.report) {
      const reports = Array.isArray(s.report) ? s.report : JSON.parse(s.report);
      reportsList = reports.map((r) => {
        const hasPassed = r.passed;
        const statusText = r.status || (hasPassed ? 'Accepted' : 'Wrong Answer');
        const detailText = r.error || (hasPassed ? 'Khớp đáp án' : 'Sai đáp án');

        let ioDetails = '';
        if (r.input !== undefined || r.expected !== undefined || r.actual !== undefined) {
          ioDetails = `
            <div style="margin-top: 8px; font-size: 0.8rem; background: rgba(0,0,0,0.03); border: 1px solid var(--line); border-radius: 6px; padding: 8px; font-family: var(--mono); max-height: 120px; overflow-y: auto;">
              ${r.input !== undefined ? `<div><strong>Input:</strong> <pre style="margin:2px 0 6px 0; white-space:pre-wrap;">${escapeHtml(r.input)}</pre></div>` : ''}
              ${r.expected !== undefined ? `<div><strong>Mong muốn:</strong> <pre style="margin:2px 0 6px 0; white-space:pre-wrap;">${escapeHtml(r.expected)}</pre></div>` : ''}
              ${r.actual !== undefined ? `<div><strong>Thực tế:</strong> <pre style="margin:2px 0 0 0; white-space:pre-wrap;">${escapeHtml(r.actual)}</pre></div>` : ''}
            </div>
          `;
        }

        return `<tr>
          <td>Test ${r.index}</td>
          <td><span class="badge ${hasPassed ? 'mint' : 'red'}">${statusText}</span></td>
          <td>
            <div>${escapeHtml(detailText)}</div>
            ${ioDetails}
          </td>
        </tr>`;
      }).join('');
    }

    const modalHtml = `
      <div class="modal-backdrop" id="submission-detail-modal">
        <div class="modal wide" style="max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 16px; flex-shrink: 0;">
            <div>
              <span class="eyebrow" style="margin: 0;">Chi tiết bài nộp</span>
              <h2 style="margin: 4px 0 0 0;">${escapeHtml(s.title)}</h2>
            </div>
            <button class="close-sheet-btn" id="close-submission-modal" aria-label="Đóng">✕</button>
          </div>
          
          <div class="modal-body" style="overflow-y: auto; flex: 1; padding-right: 4px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
              <div style="background: var(--paper); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
                <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 4px;">Kết quả</div>
                <strong style="font-size: 1.2rem; color: ${s.status === 'ACCEPTED' ? '#0a6946' : '#b43b31'};">${s.score}/100 (${statusLabel(s.status)})</strong>
              </div>
              <div style="background: var(--paper); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
                <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 4px;">Thời gian nộp</div>
                <strong>${formatDate(s.createdAt)}</strong>
              </div>
            </div>

            <h4 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--ink);">Mã nguồn</h4>
            <div style="position: relative; margin-bottom: 20px;">
              <pre style="background: #fdfdfd; border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-family: var(--mono); font-size: 0.85rem; overflow-x: auto; max-height: 250px; margin: 0; color: #000; line-height: 1.5; border-left: 4px solid var(--green-2);">${escapeHtml(s.code)}</pre>
            </div>

            <h4 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--ink);">Kết quả các testcase</h4>
            <div class="table-wrap" style="margin-bottom: 12px;">
              <table>
                <thead>
                  <tr>
                    <th style="width: 15%;">Test</th>
                    <th style="width: 25%;">Trạng thái</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportsList || '<tr><td colspan="3" class="muted" style="text-align:center;">Không có dữ liệu testcase.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div class="modal-actions" style="border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px; flex-shrink: 0; display: flex; justify-content: flex-end; gap: 12px;">
            <button class="btn secondary" id="btn-restore-this-code">Khôi phục code này</button>
            <button class="btn" id="btn-close-submission-modal">Đóng</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.querySelector('#submission-detail-modal');

    const closeModal = () => {
      modal.remove();
    };

    modal.querySelector('#close-submission-modal').onclick = closeModal;
    modal.querySelector('#btn-close-submission-modal').onclick = closeModal;
    modal.querySelector('#btn-restore-this-code').onclick = async () => {
      const confirmRestore = confirm('Bạn có chắc chắn muốn khôi phục mã nguồn này về trình soạn thảo hiện tại?');
      if (confirmRestore) {
        state.editor?.setValue(s.code);
        toast('Đã khôi phục mã nguồn.');
        closeModal();
      }
    };

  } catch (error) {
    toast(error.message, true);
  }
}

async function historyView() {
  const submissions = await loadSubmissions();
  const rows = submissions.map((s) => `<tr><td><strong>${escapeHtml(s.title)}</strong></td><td><span class="badge ${s.status === 'ACCEPTED' ? '' : 'red'}">${statusLabel(s.status)}</span></td><td>${s.score}/100</td><td>${formatDuration(s.duration_ms)}</td><td>${formatDate(s.created_at)}</td></tr>`).join('');
  shell(`<section class="content"><div class="hero-row"><div><span class="eyebrow">Dấu vết học tập</span><h2>Lịch sử nộp bài</h2></div></div><div class="table-wrap"><table><thead><tr><th>Bài</th><th>Trạng thái</th><th>Điểm</th><th>Thời gian làm</th><th>Lúc nộp</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Chưa có lượt nộp nào.</td></tr>'}</tbody></table></div></section>`, 'Lịch sử nộp');
}

async function leaderboardView() {
  const leaderboard = await loadLeaderboard();
  const rows = leaderboard.map((u, i) => `<tr><td><strong>${i + 1}</strong></td><td>${escapeHtml(u.full_name)}</td><td>${u.solved}</td><td>${u.total_score}</td></tr>`).join('');
  shell(`<section class="content"><div class="hero-row"><div><span class="eyebrow">Bảng thành tích</span><h2>Tiến bộ không phải<br>một cuộc đua.</h2></div></div><div class="table-wrap"><table><thead><tr><th>Hạng</th><th>Học sinh</th><th>Bài hoàn thành</th><th>Tổng điểm tốt nhất</th></tr></thead><tbody>${rows}</tbody></table></div></section>`, 'Bảng xếp hạng');
}

async function adminView() {
  const [dashboard, problems, users] = await Promise.all([loadAdminDashboard(), loadProblems(), loadAdminUsers()]);
  const students = users.filter((user) => user.role === 'STUDENT');
  const fallbackStudentId = students[0]?.id || '';
  const fallbackCopyToId = students.find((user) => user.id !== fallbackStudentId)?.id || fallbackStudentId;

  if (!state.adminAssignmentState) {
    state.adminAssignmentState = {
      assignUserId: fallbackStudentId,
      viewUserId: fallbackStudentId,
      viewStatus: 'all',
      copyFromUserId: fallbackStudentId,
      copyToUserId: fallbackCopyToId,
      note: '',
      force: false
    };
  } else {
    state.adminAssignmentState.assignUserId ||= fallbackStudentId;
    state.adminAssignmentState.viewUserId ||= fallbackStudentId;
    state.adminAssignmentState.copyFromUserId ||= fallbackStudentId;
    state.adminAssignmentState.copyToUserId ||= fallbackCopyToId;
    state.adminAssignmentState.viewStatus ||= 'all';
  }

  const activeProblems = problems.filter((problem) => problem.is_active !== false);
  const recent = dashboard.recent.map((submission) => `<tr><td>${escapeHtml(submission.full_name)}</td><td>${escapeHtml(submission.title)}</td><td>${submission.score}</td><td>${formatDuration(submission.duration_ms)}</td><td>${formatDate(submission.created_at)}</td></tr>`).join('');
  const list = problems.map((problem) => {
    const rating = problem.rating ?? 800;
    const label = clientGetRatingLabel(rating);
    return `<tr><td><strong>${escapeHtml(problem.title)}</strong><br><span class="muted">${escapeHtml(problem.slug)}</span></td><td>${rating} · ${escapeHtml(label)}</td><td>${problem.time_limit_minutes}p</td><td><span class="badge ${problem.is_active ? '' : 'gray'}">${problem.is_active ? 'Đang mở' : 'Đã ẩn'}</span></td><td><button class="btn small secondary edit-problem" data-id="${problem.id}">Sửa</button> <button class="btn small danger hide-problem" data-id="${problem.id}">Ẩn</button></td></tr>`;
  }).join('');

  shell(`<section class="content"><div class="hero-row"><div><span class="eyebrow">Bàn điều khiển</span><h2>Quản lý bài tập, học sinh và phân bổ.</h2></div><div><button class="btn secondary" id="import">Import JSON</button> <button class="btn" id="new-problem">+ Thêm bài</button></div></div>
    <div class="stats"><div class="stat"><b>${dashboard.stats.students}</b><span>Học sinh</span></div><div class="stat"><b>${dashboard.stats.problems}</b><span>Bài tập</span></div><div class="stat"><b>${dashboard.stats.submissions}</b><span>Lượt nộp</span></div></div>
    <div class="section-head"><h3>Kho bài</h3></div><div class="table-wrap"><table><thead><tr><th>Bài</th><th>Độ khó</th><th>Giờ làm</th><th>Trạng thái</th><th></th></tr></thead><tbody>${list}</tbody></table></div>
    <div class="section-head"><h3>Lượt nộp mới nhất</h3></div><div class="table-wrap"><table><thead><tr><th>Học sinh</th><th>Bài</th><th>Điểm</th><th>Thời gian</th><th>Lúc nộp</th></tr></thead><tbody>${recent}</tbody></table></div>
    <div class="section-head"><h3>Phân bổ bài tập</h3></div>
    <div class="assignment-board">
      <section class="assignment-panel assignment-panel--wide">
        <div class="assignment-panel-head">
          <div>
            <span class="eyebrow">Giao bài trực tiếp</span>
            <h3>Chọn học sinh, chọn bài, rồi giao ngay.</h3>
          </div>
          <label class="assignment-force-toggle"><input type="checkbox" id="assignment-force" ${state.adminAssignmentState.force ? 'checked' : ''}> Giao lại nếu đã hoàn thành</label>
        </div>
        <div class="assignment-form-grid">
          <div class="field">
            <label for="assignment-user">Học sinh</label>
            <select id="assignment-user">${renderStudentOptions(students, state.adminAssignmentState.assignUserId)}</select>
          </div>
          <div class="field">
            <label for="assignment-note">Ghi chú</label>
            <input id="assignment-note" maxlength="1000" value="${escapeHtml(state.adminAssignmentState.note || '')}" placeholder="Ví dụ: làm trước thứ Sáu">
          </div>
        </div>
        <div class="assignment-problem-picker" id="assignment-problem-pick">${renderAssignmentProblemOptions(activeProblems)}</div>
        <div class="modal-actions">
          <button class="btn" id="assign-problems">Giao bài</button>
        </div>
      </section>

      <section class="assignment-panel">
        <div class="assignment-panel-head">
          <div>
            <span class="eyebrow">Bài đã giao</span>
            <h3>Xem danh sách đang giao, đã hoàn thành hoặc đã hủy.</h3>
          </div>
        </div>
        <div class="assignment-toolbar">
          <select id="assignment-view-user">${renderStudentOptions(students, state.adminAssignmentState.viewUserId)}</select>
          <select id="assignment-view-status">
            <option value="all" ${state.adminAssignmentState.viewStatus === 'all' ? 'selected' : ''}>Tất cả</option>
            <option value="ASSIGNED" ${state.adminAssignmentState.viewStatus === 'ASSIGNED' ? 'selected' : ''}>Đang giao</option>
            <option value="COMPLETED" ${state.adminAssignmentState.viewStatus === 'COMPLETED' ? 'selected' : ''}>Đã hoàn thành</option>
            <option value="CANCELLED" ${state.adminAssignmentState.viewStatus === 'CANCELLED' ? 'selected' : ''}>Đã hủy</option>
          </select>
          <button class="btn secondary" id="refresh-assignments">Làm mới</button>
        </div>
        <div id="assignment-list" class="assignment-loading">Đang tải...</div>
      </section>

      <section class="assignment-panel">
        <div class="assignment-panel-head">
          <div>
            <span class="eyebrow">Sao chép phân bổ</span>
            <h3>Copy toàn bộ bài đang giao từ một học sinh sang học sinh khác.</h3>
          </div>
        </div>
        <div class="assignment-form-grid">
          <div class="field">
            <label for="copy-from-user">Học sinh nguồn</label>
            <select id="copy-from-user">${renderStudentOptions(students, state.adminAssignmentState.copyFromUserId)}</select>
          </div>
          <div class="field">
            <label for="copy-to-user">Học sinh đích</label>
            <select id="copy-to-user">${renderStudentOptions(students, state.adminAssignmentState.copyToUserId)}</select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" id="copy-assignments">Sao chép</button>
        </div>
      </section>
    </div>
  </section>`, 'Quản trị');

  const assignmentUserSelect = document.querySelector('#assignment-user');
  const assignmentNoteInput = document.querySelector('#assignment-note');
  const assignmentForceInput = document.querySelector('#assignment-force');
  const assignmentViewUserSelect = document.querySelector('#assignment-view-user');
  const assignmentViewStatusSelect = document.querySelector('#assignment-view-status');
  const copyFromSelect = document.querySelector('#copy-from-user');
  const copyToSelect = document.querySelector('#copy-to-user');
  const assignmentList = document.querySelector('#assignment-list');

  const syncAssignmentState = () => {
    state.adminAssignmentState = {
      assignUserId: assignmentUserSelect?.value || '',
      viewUserId: assignmentViewUserSelect?.value || '',
      viewStatus: assignmentViewStatusSelect?.value || 'all',
      copyFromUserId: copyFromSelect?.value || '',
      copyToUserId: copyToSelect?.value || '',
      note: assignmentNoteInput?.value || '',
      force: Boolean(assignmentForceInput?.checked)
    };
  };

  const refreshAssignmentList = async () => {
    syncAssignmentState();
    if (!assignmentList) return;
    if (!assignmentViewUserSelect?.value) {
      assignmentList.innerHTML = '<div class="empty">Chọn học sinh để xem bài đã giao.</div>';
      return;
    }
    assignmentList.innerHTML = '<div class="assignment-loading">Đang tải...</div>';
    try {
      const data = await loadAdminStudentAssignments(assignmentViewUserSelect.value, assignmentViewStatusSelect.value);
      assignmentList.innerHTML = renderAdminAssignmentsTable(data.assignments);
      assignmentList.querySelectorAll('.cancel-assignment').forEach((button) => {
        button.onclick = async () => {
          if (!confirm('Hủy phân bổ bài này?')) return;
          try {
            await api(`/api/admin/student-assignments/${button.dataset.id}/cancel`, { method: 'PATCH' });
            state.problems = null;
            state.adminDashboard = null;
            toast('Đã hủy phân bổ.');
            await refreshAssignmentList();
          } catch (error) {
            toast(error.message, true);
          }
        };
      });
    } catch (error) {
      assignmentList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  };

  assignmentUserSelect.onchange = () => {
    syncAssignmentState();
  };
  assignmentNoteInput.oninput = () => {
    syncAssignmentState();
  };
  assignmentForceInput.onchange = () => {
    syncAssignmentState();
  };
  assignmentViewUserSelect.onchange = () => {
    syncAssignmentState();
    refreshAssignmentList();
  };
  assignmentViewStatusSelect.onchange = () => {
    syncAssignmentState();
    refreshAssignmentList();
  };
  copyFromSelect.onchange = () => {
    syncAssignmentState();
  };
  copyToSelect.onchange = () => {
    syncAssignmentState();
  };
  document.querySelector('#refresh-assignments').onclick = refreshAssignmentList;

  document.querySelector('#assign-problems').onclick = async () => {
    syncAssignmentState();
    const problemIds = [...document.querySelectorAll('.assignment-problem-checkbox:checked')].map((input) => input.value);
    if (!assignmentUserSelect.value) return toast('Hãy chọn học sinh.', true);
    if (!problemIds.length) return toast('Hãy chọn ít nhất một bài tập.', true);
    try {
      const result = await api('/api/admin/student-assignments', {
        method: 'POST',
        body: {
          userId: assignmentUserSelect.value,
          problemIds,
          note: assignmentNoteInput.value,
          force: assignmentForceInput.checked
        }
      });
      state.problems = null;
      state.adminDashboard = null;
      toast(`Đã giao ${result.createdCount} bài. Bỏ qua ${result.skippedAlreadyAssigned} đã có, ${result.skippedCompleted} đã hoàn thành, ${result.skippedInactive} bài đã ẩn.`);
      await refreshAssignmentList();
    } catch (error) {
      toast(error.message, true);
    }
  };

  document.querySelector('#copy-assignments').onclick = async () => {
    syncAssignmentState();
    if (!copyFromSelect.value || !copyToSelect.value) return toast('Hãy chọn học sinh nguồn và đích.', true);
    if (copyFromSelect.value === copyToSelect.value) return toast('Học sinh nguồn và đích phải khác nhau.', true);
    try {
      const result = await api('/api/admin/student-assignments/copy', {
        method: 'POST',
        body: {
          fromUserId: copyFromSelect.value,
          toUserId: copyToSelect.value
        }
      });
      state.problems = null;
      state.adminDashboard = null;
      toast(`Đã copy ${result.copiedCount} bài. Bỏ qua ${result.skippedAlreadyAssigned} đã có, ${result.skippedCompleted} đã hoàn thành, ${result.skippedInactive} bài đã ẩn.`);
      if (assignmentViewUserSelect.value === copyToSelect.value) {
        await refreshAssignmentList();
      }
    } catch (error) {
      toast(error.message, true);
    }
  };

  document.querySelector('#new-problem').onclick = () => problemModal();
  document.querySelector('#import').onclick = importModal;
  document.querySelectorAll('.edit-problem').forEach((button) => button.onclick = async () => problemModal((await api(`/api/admin/problems/${button.dataset.id}`)).problem));
  document.querySelectorAll('.hide-problem').forEach((button) => button.onclick = async () => {
    if (confirm('Ẩn bài này khỏi học sinh?')) {
      await api(`/api/admin/problems/${button.dataset.id}`, { method: 'DELETE' });
      state.problems = null;
      state.problemDetails = {};
      state.adminDashboard = null;
      adminView();
    }
  });

  await refreshAssignmentList();
}

function testRows(values) {
  const list = (Array.isArray(values) && values.length > 0) ? values : [{ input: '', output: '', isPublic: false, weight: 1 }];
  return list.map((t) => {
    const isPublic = t.isPublic ?? t.is_public ?? false;
    const weight = t.weight ?? 1;
    const outputVal = t.output ?? t.expected_output ?? '';
    return `<div class="test-row" style="border: 1px solid var(--border); padding: 12px; border-radius: 8px; margin-bottom: 8px; background: rgba(255,255,255,0.02); position: relative;">
      <textarea placeholder="Đầu vào (Input)" class="test-input" style="width: 100%; min-height: 50px; margin-bottom: 6px; font-family: var(--mono); font-size: 0.85rem; padding: 6px; border-radius: 4px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: var(--text);">${escapeHtml(t.input)}</textarea>
      <textarea placeholder="Kết quả mong muốn (Expected Output)" class="test-output" style="width: 100%; min-height: 50px; margin-bottom: 6px; font-family: var(--mono); font-size: 0.85rem; padding: 6px; border-radius: 4px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: var(--text);">${escapeHtml(outputVal)}</textarea>
      <div style="display: flex; gap: 15px; align-items: center; font-size: 0.9rem; color: var(--text-mute);">
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="test-public" ${isPublic ? 'checked' : ''}> Công khai (Public)</label>
        <label style="display: flex; align-items: center; gap: 4px;">Trọng số: <input type="number" class="test-weight" min="1" max="100" value="${weight}" style="width: 55px; padding: 2px 4px; border-radius: 4px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: var(--text);"></label>
      </div>
      <button type="button" class="btn small danger remove-test" style="position: absolute; right: 12px; bottom: 12px; padding: 4px 8px;">×</button>
      <div style="clear: both;"></div>
    </div>`;
  }).join('');
}

function clientValidateProblem(problem) {
  const errors = [];
  if (!problem.slug) errors.push('Slug không được để trống.');
  else if (/[^a-z0-9_-]/.test(problem.slug)) errors.push('Slug chỉ được chứa chữ thường, số, dấu gạch ngang (-) và gạch dưới (_).');

  if (!problem.title) errors.push('Thiếu tên bài.');
  if (!problem.description) errors.push('Thiếu đề bài.');

  const testcases = problem.testcases || [];
  if (!Array.isArray(testcases) || !testcases.length) {
    errors.push('Cần ít nhất một test case.');
  } else {
    testcases.forEach((tc, idx) => {
      const outputVal = tc.output ?? tc.expected_output;
      if (outputVal === undefined || outputVal === null) {
        errors.push(`Testcase thứ ${idx + 1} thiếu expected output.`);
      }
      const weight = Number(tc.weight ?? 1);
      if (isNaN(weight) || weight < 1 || weight > 100 || !Number.isInteger(weight)) {
        errors.push(`Testcase thứ ${idx + 1} có trọng số không hợp lệ (phải từ 1 đến 100).`);
      }
    });
  }

  const rating = Number(problem.rating ?? 800);
  if (isNaN(rating) || rating < 800 || rating > 3500 || rating % 100 !== 0) {
    errors.push('Rating phải là số nguyên từ 800 đến 3500 và chia hết cho 100.');
  }

  if (problem.compareMode && !['exact', 'trim', 'token', 'number'].includes(problem.compareMode)) {
    errors.push('Compare mode không hợp lệ.');
  }

  return errors;
}

async function problemModal(problem = null) {
  const [groupsData, ratingOptsRes] = await Promise.all([
    api('/api/admin/problem-groups'),
    Promise.resolve(Array.from({ length: 28 }, (_, i) => 800 + i * 100).map(r => `
      <option value="${r}" ${(problem?.rating ?? 800) === r ? 'selected' : ''}>${r}</option>
    `).join(''))
  ]);
  const groups = groupsData.groups || [];
  const groupCheckboxes = groups.map(g => {
    const checked = problem?.groupIds?.includes(g.id) ? 'checked' : '';
    return `
      <label class="group-select-item">
        <input type="checkbox" name="groupIds" value="${escapeHtml(g.id)}" ${checked}>
        <span>${escapeHtml(g.name)}</span>
        ${!g.isActive ? ' <small class="muted">(Đã ẩn)</small>' : ''}
      </label>
    `;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="problem-modal"><form class="modal wide" id="problem-form"><span class="eyebrow">${problem ? 'Chỉnh sửa' : 'Bài tập mới'}</span><h2>${problem ? escapeHtml(problem.title) : 'Tạo bài tập'}</h2><div class="form-grid">
    <div class="field"><label>Slug</label><input name="slug" value="${escapeHtml(problem?.slug || '')}" required></div><div class="field"><label>Tên bài</label><input name="title" value="${escapeHtml(problem?.title || '')}" required></div>
    <div class="field"><label>Rating Codeforces</label><select name="rating" required>${ratingOptsRes}</select></div><div class="field"><label>Thời gian làm (phút)</label><input name="timeLimitMinutes" type="number" min="1" max="240" value="${problem?.time_limit_minutes || 30}"></div>
    <div class="field"><label>Passing Score</label><input name="passingScore" type="number" min="0" max="100" value="${problem?.passing_score ?? 100}"></div><div class="field"><label>Max Score</label><input name="maxScore" type="number" min="1" max="100" value="${problem?.max_score ?? 100}"></div>
    <div class="field"><label>Compare Mode</label>
      <select name="compareMode" id="compare-mode-select">
        <option value="token" ${(problem?.compare_mode || 'token') === 'token' ? 'selected' : ''}>Token Matching (Mặc định)</option>
        <option value="exact" ${(problem?.compare_mode) === 'exact' ? 'selected' : ''}>Exact Character Match</option>
        <option value="trim" ${(problem?.compare_mode) === 'trim' ? 'selected' : ''}>Trim Matching</option>
        <option value="number" ${(problem?.compare_mode) === 'number' ? 'selected' : ''}>Float Number Match</option>
      </select>
    </div>
    <div class="field" id="number-tolerance-field" style="display: ${(problem?.compare_mode === 'number') ? 'block' : 'none'};">
      <label>Number Tolerance</label>
      <input name="numberTolerance" type="number" min="0" max="1" step="any" value="${problem?.number_tolerance ?? 1e-6}">
    </div>
    <div class="field full">
      <label>Nhóm bài tập (chọn ít nhất 1 nhóm)</label>
      <div class="group-select-checkboxes">
        ${groupCheckboxes}
      </div>
    </div>
    <div class="field full"><label>Đề bài (Markdown)</label><textarea name="description" rows="8" required>${escapeHtml(problem?.description || '')}</textarea></div>
    <div class="field full"><label>Code mẫu</label><textarea name="starterCode" rows="6">${escapeHtml(problem?.starter_code || '# Viết lời giải tại đây\n')}</textarea></div>
    <div class="field"><label>Giới hạn chạy mỗi test (ms)</label><input name="executionLimitMs" type="number" min="250" max="5000" value="${problem?.execution_limit_ms || 1500}"></div><div class="field"><label><input name="isActive" type="checkbox" ${problem?.is_active === false ? '' : 'checked'}> Mở cho học sinh</label></div>
    <div class="field full"><label>Test case ẩn</label><div id="tests">${testRows(problem?.testcases)}</div><button type="button" class="btn small secondary" id="add-test">+ Thêm test</button></div>
  </div><div class="modal-actions"><button type="button" class="btn secondary" id="cancel-problem">Hủy</button><button class="btn" type="submit">Lưu bài</button></div></form></div>`);
  const modal = document.querySelector('#problem-modal');
  const bindRemove = () => modal.querySelectorAll('.remove-test').forEach((b) => b.onclick = () => b.parentElement.remove());
  bindRemove();
  modal.querySelector('#add-test').onclick = () => { modal.querySelector('#tests').insertAdjacentHTML('beforeend', testRows()); bindRemove(); };
  modal.querySelector('#cancel-problem').onclick = () => modal.remove();

  const compareSelect = modal.querySelector('#compare-mode-select');
  const toleranceField = modal.querySelector('#number-tolerance-field');
  compareSelect.onchange = () => {
    toleranceField.style.display = compareSelect.value === 'number' ? 'block' : 'none';
  };

  modal.querySelector('#problem-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.isActive = event.target.isActive.checked;
    data.rating = Number(data.rating || 800);
    data.difficulty = clientGetRatingLabel(data.rating);
    data.passingScore = Number(data.passingScore ?? 100);
    data.maxScore = Number(data.maxScore ?? 100);
    data.compareMode = data.compareMode || 'token';
    data.numberTolerance = Number(data.numberTolerance ?? 1e-6);
    data.testcases = [...modal.querySelectorAll('.test-row')].map((row) => ({
      input: row.querySelector('.test-input').value,
      output: row.querySelector('.test-output').value,
      isPublic: row.querySelector('.test-public').checked,
      weight: Number(row.querySelector('.test-weight').value || 1)
    }));
    data.examples = problem?.examples || [];

    const groupIds = [...modal.querySelectorAll('input[name="groupIds"]:checked')].map(cb => cb.value);
    if (data.isActive && groupIds.length === 0) {
      return toast('Bài tập hoạt động phải thuộc ít nhất 1 nhóm hoạt động.', true);
    }
    data.groupIds = groupIds;

    try {
      await api(problem ? `/api/admin/problems/${problem.id}` : '/api/admin/problems', { method: problem ? 'PUT' : 'POST', body: data });
      state.problems = null;
      state.problemDetails = {};
      state.adminDashboard = null;
      modal.remove(); toast('Đã lưu bài tập.'); adminView();
    } catch (error) { toast(error.message, true); }
  };
}

async function importModal() {
  const groupsData = await api('/api/problem-groups');
  const groups = groupsData.groups || [];
  
  const groupCheckboxes = groups.map(g => `
    <label class="group-select-item">
      <input type="checkbox" name="groupIds" value="${escapeHtml(g.id)}">
      <span>${escapeHtml(g.name)}</span>
    </label>
  `).join('');

  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="import-modal"><div class="modal"><span class="eyebrow">Nhập hàng loạt</span><h2>Import bài từ JSON</h2><p class="muted">Chấp nhận định dạng <code>problems.json</code> cũ hoặc mảng bài theo schema mới. Bài trùng slug sẽ được cập nhật.</p><div class="field"><label>Chọn file JSON</label><input type="file" id="json-file" accept="application/json,.json"></div><div class="field"><label>Chọn nhóm bài tập cho các bài import (chọn ít nhất 1 nhóm)</label><div class="group-select-checkboxes">${groupCheckboxes}</div></div><div id="import-preview"></div><div class="modal-actions"><button class="btn secondary" id="cancel-import">Hủy</button><button class="btn" id="do-import">Import</button></div></div></div>`);
  const modal = document.querySelector('#import-modal');
  modal.querySelector('#cancel-import').onclick = () => modal.remove();

  modal.querySelector('#json-file').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const body = JSON.parse(text);
      const items = Array.isArray(body) ? body : (body.problems || []);

      let allErrors = [];
      items.forEach((p, idx) => {
        const name = p.title || p.slug || `Bài ${idx + 1}`;
        const errs = clientValidateProblem(p);
        if (errs.length) {
          allErrors.push(`<strong>${escapeHtml(name)}</strong>: ${errs.map(e => `<div>• ${escapeHtml(e)}</div>`).join('')}`);
        }
      });

      const previewArea = modal.querySelector('#import-preview');
      if (allErrors.length) {
        previewArea.innerHTML = `<div class="import-errors" style="color: #ef4444; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 10px; border-radius: 8px; max-height: 150px; overflow-y: auto; font-size: 0.85rem; margin-top: 10px;">
          <strong>Có lỗi validation trước khi submit:</strong>
          ${allErrors.join('<div style="margin-top:5px;"></div>')}
        </div>`;
        modal.querySelector('#do-import').disabled = true;
      } else {
        previewArea.innerHTML = `<div style="color: #10b981; margin-top: 10px; font-size: 0.85rem;">✓ File hợp lệ (${items.length} bài sẵn sàng import).</div>`;
        modal.querySelector('#do-import').disabled = false;
      }
    } catch (e) {
      modal.querySelector('#import-preview').innerHTML = `<div style="color: #ef4444; margin-top: 10px; font-size: 0.85rem;">Lỗi định dạng file JSON: ${escapeHtml(e.message)}</div>`;
      modal.querySelector('#do-import').disabled = true;
    }
  };

  modal.querySelector('#do-import').onclick = async () => {
    const file = modal.querySelector('#json-file').files[0]; if (!file) return toast('Hãy chọn file JSON.', true);
    
    const groupIds = [...modal.querySelectorAll('input[name="groupIds"]:checked')].map(cb => cb.value);
    if (groupIds.length === 0) {
      return toast('Vui lòng chọn ít nhất 1 nhóm bài tập trước khi import để tránh bài tập mồ côi.', true);
    }

    try {
      const problems = JSON.parse(await file.text());
      const body = {
        problems: Array.isArray(problems) ? problems : (problems.problems || []),
        groupIds
      };
      
      const result = await api('/api/admin/problems/import', { method: 'POST', body });
      state.problems = null;
      state.problemDetails = {};
      state.adminDashboard = null;
      modal.remove();
      toast(`Đã import thành công: ${result.imported} bài (Tạo mới: ${result.created}, Cập nhật: ${result.updated}).`);
      adminView();
    } catch (error) { toast(error.message, true); }
  };
}

async function groupsView() {
  const [groupsData, problemsData] = await Promise.all([
    api('/api/admin/problem-groups'),
    api('/api/problems')
  ]);
  const groups = groupsData.groups || [];
  const problems = problemsData.problems || [];

  const rows = groups.map((g) => {
    const typeLabel = {
      BASIC: 'Bài tập cơ bản',
      PRACTICE: 'Bài ôn luyện',
      ADVANCED: 'Bài nâng cao',
      HSG: 'Bài thi HSG',
      TOPIC: 'Bài theo chủ đề',
      CUSTOM: 'Tùy chỉnh'
    }[g.groupType] || g.groupType;

    const statusBadge = g.isActive
      ? '<span class="badge mint">Hoạt động</span>'
      : '<span class="badge gray">Đã ẩn</span>';

    return `
      <tr>
        <td><strong>${escapeHtml(g.name)}</strong><br><small class="muted">${escapeHtml(g.description || '—')}</small></td>
        <td><code>${escapeHtml(g.slug)}</code></td>
        <td>${escapeHtml(typeLabel)}</td>
        <td>${g.problemCount} bài</td>
        <td>${statusBadge}</td>
        <td>${g.orderIndex}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn small edit-group" data-id="${g.id}">Sửa</button>
            ${g.isActive ? `<button class="btn small danger hide-group" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-count="${g.problemCount}">Ẩn nhóm</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const tableHtml = rows.length
    ? `<div class="table-wrap"><table>
        <thead>
          <tr>
            <th>Tên nhóm</th>
            <th>Slug</th>
            <th>Loại nhóm</th>
            <th>Số bài</th>
            <th>Trạng thái</th>
            <th>Thứ tự</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>`
    : '<div class="empty">Chưa có nhóm bài tập nào.</div>';

  shell(`<section class="content">
    <div class="hero-row">
      <div>
        <span class="eyebrow">Quản trị</span>
        <h2>Quản lý nhóm bài tập.</h2>
      </div>
      <button class="btn" id="new-group">+ Tạo nhóm mới</button>
    </div>
    ${tableHtml}
  </section>`, 'Nhóm bài tập');

  document.querySelector('#new-group').onclick = () => groupModal(null, groups, problems);
  
  document.querySelectorAll('.edit-group').forEach((btn) => {
    btn.onclick = () => {
      const group = groups.find(g => g.id === btn.dataset.id);
      groupModal(group, groups, problems);
    };
  });

  document.querySelectorAll('.hide-group').forEach((btn) => {
    btn.onclick = async () => {
      const { id, name, count } = btn.dataset;
      const problemCount = Number(count);
      
      if (problemCount > 0) {
        const otherActiveGroups = groups.filter(g => g.id !== id && g.isActive);
        if (otherActiveGroups.length > 0) {
          const optionsHtml = otherActiveGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
          
          document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-backdrop" id="delete-confirm-modal">
              <div class="modal" style="width: min(440px, 100%);">
                <h3>Ẩn nhóm bài tập</h3>
                <p class="muted" style="margin-top: 8px;">Nhóm <strong>${escapeHtml(name)}</strong> hiện đang có ${problemCount} bài tập. Bạn có muốn chuyển các bài tập này sang nhóm khác để tránh mồ côi?</p>
                <div class="field" style="margin: 16px 0 20px 0;">
                  <label>Chọn nhóm đích (hoặc bỏ qua)</label>
                  <select id="move-target-select">
                    <option value="">-- Không chuyển (Có thể lỗi nếu bài bị mồ côi) --</option>
                    ${optionsHtml}
                  </select>
                </div>
                <div class="modal-actions">
                  <button class="btn secondary" id="btn-cancel-delete">Hủy</button>
                  <button class="btn danger" id="btn-confirm-delete">Xác nhận ẩn</button>
                </div>
              </div>
            </div>
          `);
          const dModal = document.querySelector('#delete-confirm-modal');
          dModal.querySelector('#btn-cancel-delete').onclick = () => dModal.remove();
          dModal.querySelector('#btn-confirm-delete').onclick = async () => {
            const moveToGroupId = dModal.querySelector('#move-target-select').value || null;
            dModal.remove();
            try {
              await api(`/api/admin/problem-groups/${id}`, {
                method: 'DELETE',
                body: moveToGroupId ? { moveToGroupId } : {}
              });
              toast('Đã ẩn nhóm bài tập.');
              groupsView();
            } catch (err) {
              toast(err.message, true);
            }
          };
          return;
        }
      }
      
      if (confirm(`Bạn có chắc chắn muốn ẩn nhóm "${name}"?`)) {
        try {
          await api(`/api/admin/problem-groups/${id}`, { method: 'DELETE' });
          toast('Đã ẩn nhóm bài tập.');
          groupsView();
        } catch (err) {
          toast(err.message, true);
        }
      }
    };
  });
}

function groupModal(group = null, allGroups, allProblems) {
  const isEdit = !!group;
  const activeProblems = allProblems.filter(p => p.isActive !== false);

  const groupTypeOpts = [
    { value: 'BASIC', label: 'Bài tập cơ bản' },
    { value: 'PRACTICE', label: 'Bài ôn luyện' },
    { value: 'ADVANCED', label: 'Bài nâng cao' },
    { value: 'HSG', label: 'Bài thi HSG' },
    { value: 'TOPIC', label: 'Bài theo chủ đề' },
    { value: 'CUSTOM', label: 'Tùy chỉnh' }
  ].map(t => `<option value="${t.value}" ${(group?.groupType || 'CUSTOM') === t.value ? 'selected' : ''}>${t.label}</option>`).join('');

  const problemCheckboxes = activeProblems.map(p => {
    const checked = group?.problemIds?.includes(p.id) ? 'checked' : '';
    const rating = p.rating ?? 800;
    return `
      <label class="assignment-problem-item">
        <input type="checkbox" name="problemIds" value="${escapeHtml(p.id)}" ${checked}>
        <span class="assignment-problem-copy">
          <strong>${escapeHtml(p.title)}</strong>
          <small>${rating} · ${escapeHtml(clientGetRatingLabel(rating))}</small>
        </span>
      </label>
    `;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="group-modal">
      <form class="modal wide" id="group-form">
        <span class="eyebrow">${isEdit ? 'Chỉnh sửa' : 'Nhóm bài tập mới'}</span>
        <h2>${isEdit ? 'Cập nhật nhóm' : 'Tạo nhóm mới'}</h2>
        <div class="form-grid">
          <div class="field"><label>Tên nhóm</label><input name="name" value="${escapeHtml(group?.name || '')}" required></div>
          <div class="field"><label>Slug</label><input name="slug" value="${escapeHtml(group?.slug || '')}" ${isEdit ? 'disabled' : 'required'}></div>
          <div class="field full"><label>Mô tả</label><textarea name="description" rows="3">${escapeHtml(group?.description || '')}</textarea></div>
          <div class="field"><label>Loại nhóm</label><select name="groupType">${groupTypeOpts}</select></div>
          <div class="field"><label>Thứ tự sắp xếp</label><input name="orderIndex" type="number" value="${group?.orderIndex ?? 0}"></div>
          <div class="field"><label>Màu sắc (mã hex)</label><input name="color" placeholder="#3b82f6" value="${escapeHtml(group?.color || '')}"></div>
          <div class="field"><label>Icon (emoji hoặc kí hiệu)</label><input name="icon" placeholder="📁" value="${escapeHtml(group?.icon || '')}"></div>
          
          ${isEdit ? `
            <div class="field full">
              <label><input name="isActive" type="checkbox" ${group.isActive ? 'checked' : ''}> Hoạt động (Hiện cho học sinh)</label>
            </div>
          ` : ''}

          <div class="field full">
            <label>Chọn bài tập cho nhóm (chọn ít nhất 1 bài)</label>
            <div style="margin-bottom: 8px; font-size: 12px; color: #b43b31; font-weight: 600;" id="empty-group-warning">⚠️ Không được tạo nhóm rỗng. Hãy chọn ít nhất 1 bài tập.</div>
            <div class="assignment-problem-picker" style="max-height: 240px;">
              ${problemCheckboxes}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn secondary" id="cancel-group">Hủy</button>
          <button class="btn" type="submit" id="btn-save-group">Lưu nhóm</button>
        </div>
      </form>
    </div>
  `);

  const modal = document.querySelector('#group-modal');
  modal.querySelector('#cancel-group').onclick = () => modal.remove();

  const checkSelection = () => {
    const selectedCount = modal.querySelectorAll('input[name="problemIds"]:checked').length;
    const warning = modal.querySelector('#empty-group-warning');
    const submitBtn = modal.querySelector('#btn-save-group');
    if (selectedCount === 0) {
      warning.style.display = 'block';
      submitBtn.disabled = true;
    } else {
      warning.style.display = 'none';
      submitBtn.disabled = false;
    }
  };
  
  modal.querySelectorAll('input[name="problemIds"]').forEach(cb => cb.onchange = checkSelection);
  checkSelection();

  modal.querySelector('#group-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.problemIds = [...modal.querySelectorAll('input[name="problemIds"]:checked')].map(cb => cb.value);
    if (isEdit) {
      data.isActive = event.target.isActive.checked;
    }

    try {
      if (isEdit) {
        await api(`/api/admin/problem-groups/${group.id}`, { method: 'PUT', body: data });
        toast('Đã cập nhật nhóm bài tập.');
      } else {
        await api('/api/admin/problem-groups', { method: 'POST', body: data });
        toast('Đã tạo nhóm bài tập mới.');
      }
      modal.remove();
      groupsView();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

async function usersView() {
  if (!state.usersPage) {
    state.usersPage = {
      q: '',
      role: 'all',
      status: 'all',
      sort: 'created_at_desc',
      page: 1,
      pageSize: 20,
      totalPages: 1,
      total: 0
    };
  }
  
  shell(`<section class="content">
    <div class="hero-row">
      <div>
        <span class="eyebrow">Quản trị</span>
        <h2>Quản lý người dùng.</h2>
      </div>
    </div>
    
    <div class="filter-row" style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; align-items: flex-end;">
      <div class="field" style="margin: 0; flex: 1; min-width: 200px;">
        <label>Tìm kiếm</label>
        <input type="text" id="user-search-input" placeholder="Tìm theo tên hoặc email..." value="${escapeHtml(state.usersPage.q)}">
      </div>
      <div class="field" style="margin: 0; width: 120px;">
        <label>Vai trò</label>
        <select id="user-role-select">
          <option value="all" ${state.usersPage.role === 'all' ? 'selected' : ''}>Tất cả</option>
          <option value="ADMIN" ${state.usersPage.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
          <option value="STUDENT" ${state.usersPage.role === 'STUDENT' ? 'selected' : ''}>Student</option>
        </select>
      </div>
      <div class="field" style="margin: 0; width: 140px;">
        <label>Trạng thái</label>
        <select id="user-status-select">
          <option value="all" ${state.usersPage.status === 'all' ? 'selected' : ''}>Tất cả</option>
          <option value="active" ${state.usersPage.status === 'active' ? 'selected' : ''}>Hoạt động</option>
          <option value="inactive" ${state.usersPage.status === 'inactive' ? 'selected' : ''}>Vô hiệu hóa</option>
        </select>
      </div>
      <div class="field" style="margin: 0; width: 160px;">
        <label>Sắp xếp</label>
        <select id="user-sort-select">
          <option value="created_at_desc" ${state.usersPage.sort === 'created_at_desc' ? 'selected' : ''}>Mới nhất</option>
          <option value="created_at_asc" ${state.usersPage.sort === 'created_at_asc' ? 'selected' : ''}>Cũ nhất</option>
          <option value="name_asc" ${state.usersPage.sort === 'name_asc' ? 'selected' : ''}>Tên A-Z</option>
          <option value="email_asc" ${state.usersPage.sort === 'email_asc' ? 'selected' : ''}>Email A-Z</option>
          <option value="submissions_desc" ${state.usersPage.sort === 'submissions_desc' ? 'selected' : ''}>Nộp nhiều nhất</option>
          <option value="score_desc" ${state.usersPage.sort === 'score_desc' ? 'selected' : ''}>Điểm cao nhất</option>
        </select>
      </div>
      <button class="btn" id="new-user-btn">+ Tạo người dùng mới</button>
    </div>

    <div id="users-table-container">
      <div class="loading-spinner" style="margin: 40px auto;"></div>
    </div>
  </section>`, 'Người dùng');

  const searchInput = document.querySelector('#user-search-input');
  const roleSelect = document.querySelector('#user-role-select');
  const statusSelect = document.querySelector('#user-status-select');
  const sortSelect = document.querySelector('#user-sort-select');
  const newUserBtn = document.querySelector('#new-user-btn');

  const onFilterChange = () => {
    state.usersPage.q = searchInput.value;
    state.usersPage.role = roleSelect.value;
    state.usersPage.status = statusSelect.value;
    state.usersPage.sort = sortSelect.value;
    state.usersPage.page = 1;
    loadAndRenderUsers();
  };

  let searchTimeout;
  searchInput.oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(onFilterChange, 300);
  };
  roleSelect.onchange = onFilterChange;
  statusSelect.onchange = onFilterChange;
  sortSelect.onchange = onFilterChange;
  newUserBtn.onclick = () => openUserModal();

  await loadAndRenderUsers();
}

async function loadAndRenderUsers() {
  const container = document.querySelector('#users-table-container');
  if (!container) return;

  try {
    const params = new URLSearchParams({
      q: state.usersPage.q,
      role: state.usersPage.role,
      status: state.usersPage.status,
      sort: state.usersPage.sort,
      page: state.usersPage.page,
      pageSize: state.usersPage.pageSize
    });

    const response = await api(`/api/admin/users?${params.toString()}`);
    const users = response.users || [];
    const pagination = response.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 };
    
    state.usersPage.totalPages = pagination.totalPages;
    state.usersPage.total = pagination.total;

    const rows = users.map((u) => {
      const statusBadge = u.isActive
        ? '<span class="badge mint">Hoạt động</span>'
        : '<span class="badge gray">Vô hiệu hóa</span>';
        
      return `
        <tr>
          <td>
            <strong style="cursor: pointer; color: var(--blue);" class="view-user-name" data-id="${u.id}">${escapeHtml(u.fullName)}</strong>
          </td>
          <td><code>${escapeHtml(u.email)}</code></td>
          <td>${escapeHtml(u.role)}</td>
          <td>${statusBadge}</td>
          <td>${u.submissionsCount}</td>
          <td>${u.solvedCount}</td>
          <td>${u.bestScore}/100</td>
          <td>${u.activeAssignmentsCount}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn small view-user" data-id="${u.id}">Xem</button>
              <button class="btn small secondary edit-user" data-id="${u.id}">Sửa</button>
              <button class="btn small secondary reset-password" data-id="${u.id}">Đổi mật khẩu</button>
              ${u.isActive 
                ? `<button class="btn small danger toggle-status" data-id="${u.id}" data-active="false">Khóa</button>` 
                : `<button class="btn small mint toggle-status" data-id="${u.id}" data-active="true">Mở khóa</button>`
              }
              <button class="btn small danger delete-user" data-id="${u.id}" style="background-color: #fce4e1; color: var(--red); border: none;">Xóa</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const tableHtml = rows.length
      ? `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Lượt nộp</th>
                <th>Hoàn thành</th>
                <th>Điểm tốt nhất</th>
                <th>Bài đang giao</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="pagination-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
          <span class="muted">Tổng cộng: ${pagination.total} người dùng</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn secondary small" id="prev-page-btn" ${pagination.page <= 1 ? 'disabled' : ''}>&lt; Trước</button>
            <span>Trang ${pagination.page} / ${pagination.totalPages}</span>
            <button class="btn secondary small" id="next-page-btn" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Sau &gt;</button>
          </div>
        </div>`
      : '<div class="empty">Không tìm thấy người dùng nào phù hợp.</div>';

    container.innerHTML = tableHtml;

    // Bind actions
    container.querySelectorAll('.view-user-name, .view-user').forEach(btn => {
      btn.onclick = () => openUserDetailModal(btn.dataset.id);
    });
    container.querySelectorAll('.edit-user').forEach(btn => {
      const u = users.find(user => user.id === btn.dataset.id);
      btn.onclick = () => openUserModal(u);
    });
    container.querySelectorAll('.reset-password').forEach(btn => {
      btn.onclick = () => openResetPasswordModal(btn.dataset.id);
    });
    container.querySelectorAll('.toggle-status').forEach(btn => {
      btn.onclick = () => toggleUserStatus(btn.dataset.id, btn.dataset.active === 'true');
    });
    container.querySelectorAll('.delete-user').forEach(btn => {
      btn.onclick = () => deleteUser(btn.dataset.id);
    });

    const prevBtn = document.querySelector('#prev-page-btn');
    const nextBtn = document.querySelector('#next-page-btn');
    if (prevBtn) prevBtn.onclick = () => {
      state.usersPage.page--;
      loadAndRenderUsers();
    };
    if (nextBtn) nextBtn.onclick = () => {
      state.usersPage.page++;
      loadAndRenderUsers();
    };

  } catch (error) {
    container.innerHTML = `<div class="error-box">Lỗi: ${escapeHtml(error.message)}</div>`;
  }
}

async function openUserDetailModal(userId) {
  try {
    const response = await api(`/api/admin/users/${userId}`);
    const { user } = response;
    const stats = user.stats || {};
    
    const subRows = (user.recentSubmissions || []).map(s => {
      const statusClass = s.status === 'ACCEPTED' ? 'mint' : 'red';
      const statusLabel = s.status === 'ACCEPTED' ? 'Đúng' : 'Sai';
      return `
        <tr>
          <td><strong>${escapeHtml(s.problemTitle)}</strong><br><small class="muted">${escapeHtml(s.problemSlug)}</small></td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
          <td>${s.score}/100</td>
          <td>${s.runtimeMs}ms</td>
          <td>${formatDate(s.createdAt)}</td>
        </tr>
      `;
    }).join('');

    const assignRows = (user.activeAssignments || []).map(a => {
      return `
        <li>
          <strong>${escapeHtml(a.problemTitle)}</strong> (Rating: ${a.rating}) 
          <span class="muted" style="font-size: 11px; margin-left: 8px;">Giao lúc: ${formatDate(a.assignedAt)}</span>
        </li>
      `;
    }).join('');

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="user-detail-modal">
        <div class="modal wide" style="max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div>
              <span class="eyebrow">Thông tin chi tiết</span>
              <h2>${escapeHtml(user.fullName)}</h2>
              <span class="muted">${escapeHtml(user.email)} · ${user.role}</span>
            </div>
            <button class="close-sheet-btn" id="close-detail-modal" style="position: static;">✕</button>
          </div>
          
          <div class="stats" style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;">
            <div class="stat"><b>${stats.submissionsCount || 0}</b><span>Số bài nộp</span></div>
            <div class="stat"><b>${stats.solvedCount || 0}</b><span>Đã hoàn thành</span></div>
            <div class="stat"><b>${stats.attemptedProblemsCount || 0}</b><span>Đã thử sức</span></div>
            <div class="stat"><b>${stats.bestScore || 0}</b><span>Điểm tốt nhất</span></div>
            <div class="stat"><b>${stats.totalScore || 0}</b><span>Tổng điểm</span></div>
          </div>

          <div class="form-grid">
            <div class="field full" style="margin-top: 16px;">
              <h3>Bài tập đang được giao (${user.activeAssignments?.length || 0})</h3>
              ${assignRows ? `<ul style="padding-left: 20px; line-height: 1.6; margin-top: 8px;">${assignRows}</ul>` : '<div class="muted" style="margin-top: 8px;">Không có bài tập nào đang được giao.</div>'}
            </div>
            
            <div class="field full" style="margin-top: 24px;">
              <h3>10 lượt nộp bài gần nhất</h3>
              ${subRows ? `
                <div class="table-wrap" style="margin-top: 8px;">
                  <table>
                    <thead>
                      <tr>
                        <th>Bài tập</th>
                        <th>Kết quả</th>
                        <th>Điểm</th>
                        <th>Thời gian chạy</th>
                        <th>Lúc nộp</th>
                      </tr>
                    </thead>
                    <tbody>${subRows}</tbody>
                  </table>
                </div>` : '<div class="muted" style="margin-top: 8px;">Chưa có lượt nộp bài nào.</div>'}
            </div>
          </div>
          
          <div class="modal-actions" style="margin-top: 24px;">
            <button class="btn" id="btn-close-detail">Đóng</button>
          </div>
        </div>
      </div>
    `);

    const dModal = document.querySelector('#user-detail-modal');
    const close = () => dModal.remove();
    dModal.querySelector('#close-detail-modal').onclick = close;
    dModal.querySelector('#btn-close-detail').onclick = close;

  } catch (err) {
    toast(err.message, true);
  }
}

function openUserModal(user = null) {
  const isEdit = !!user;

  const roleOpts = `
    <option value="STUDENT" ${(user?.role || 'STUDENT') === 'STUDENT' ? 'selected' : ''}>Student</option>
    <option value="ADMIN" ${user?.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
  `;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="user-edit-modal">
      <form class="modal" id="user-form">
        <span class="eyebrow">${isEdit ? 'Chỉnh sửa' : 'Tạo mới'}</span>
        <h2>${isEdit ? 'Cập nhật người dùng' : 'Thêm người dùng mới'}</h2>
        <div class="form-grid">
          <div class="field"><label>Họ tên</label><input name="fullName" value="${escapeHtml(user?.fullName || '')}" required></div>
          <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(user?.email || '')}" required></div>
          
          ${isEdit ? '' : `
            <div class="field"><label>Mật khẩu</label><input name="password" type="password" required placeholder="Tối thiểu 8 ký tự, có chữ và số"></div>
          `}
          
          <div class="field"><label>Vai trò</label><select name="role">${roleOpts}</select></div>
          
          <div class="field full">
            <label><input name="isActive" type="checkbox" ${user?.isActive !== false ? 'checked' : ''}> Hoạt động (Cho phép đăng nhập)</label>
          </div>
        </div>
        
        <div class="modal-actions">
          <button type="button" class="btn secondary" id="cancel-user">Hủy</button>
          <button class="btn" type="submit">Lưu</button>
        </div>
      </form>
    </div>
  `);

  const modal = document.querySelector('#user-edit-modal');
  modal.querySelector('#cancel-user').onclick = () => modal.remove();

  modal.querySelector('#user-form').onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    data.isActive = formData.has('isActive');

    try {
      state.adminUsers = null;
      state.adminDashboard = null;
      state.leaderboard = null;
      if (isEdit) {
        await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: data });
        toast('Đã cập nhật người dùng.');
      } else {
        await api('/api/admin/users', { method: 'POST', body: data });
        toast('Đã tạo người dùng mới.');
      }
      modal.remove();
      loadAndRenderUsers();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function openResetPasswordModal(userId) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="reset-password-modal">
      <form class="modal" id="reset-password-form">
        <span class="eyebrow">Bảo mật</span>
        <h2>Đặt lại mật khẩu</h2>
        
        <div class="form-grid">
          <div class="field full"><label>Mật khẩu mới</label><input name="newPassword" type="password" required placeholder="Tối thiểu 8 ký tự, gồm cả chữ và số"></div>
          <div class="field full"><label>Nhập lại mật khẩu mới</label><input name="confirmPassword" type="password" required></div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn secondary" id="cancel-reset-password">Hủy</button>
          <button class="btn" type="submit">Cập nhật mật khẩu</button>
        </div>
      </form>
    </div>
  `);

  const modal = document.querySelector('#reset-password-modal');
  modal.querySelector('#cancel-reset-password').onclick = () => modal.remove();

  modal.querySelector('#reset-password-form').onsubmit = async (event) => {
    event.preventDefault();
    const { newPassword, confirmPassword } = Object.fromEntries(new FormData(event.target));
    
    if (newPassword !== confirmPassword) {
      return toast('Mật khẩu nhập lại không khớp.', true);
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return toast('Mật khẩu phải chứa ít nhất 8 ký tự, bao gồm cả chữ và số.', true);
    }

    try {
      await api(`/api/admin/users/${userId}/password`, {
        method: 'PATCH',
        body: { newPassword }
      });
      toast('Đã đặt lại mật khẩu thành công.');
      modal.remove();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function toggleUserStatus(userId, nextActive) {
  const actionText = nextActive ? 'mở khóa' : 'khóa';
  if (confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản này?`)) {
    try {
      state.adminUsers = null;
      state.adminDashboard = null;
      state.leaderboard = null;
      await api(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: { isActive: nextActive }
      });
      toast(`Đã ${actionText} tài khoản thành công.`);
      loadAndRenderUsers();
    } catch (err) {
      toast(err.message, true);
    }
  }
}

function deleteUser(userId) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="delete-user-modal">
      <div class="modal" style="width: min(440px, 100%);">
        <span class="eyebrow" style="color: var(--red);">Cảnh báo nguy hiểm</span>
        <h2>Xóa tài khoản</h2>
        <p class="muted" style="margin-top: 8px;">
          Nếu người dùng đã có bài nộp hoặc lịch sử học tập, bạn chỉ nên <strong>Khóa tài khoản</strong> để giữ lịch sử học tập.
        </p>
        <div class="modal-actions" style="margin-top: 24px; flex-direction: column; gap: 8px;">
          <button class="btn danger" id="btn-soft-delete-user" style="width: 100%;">Khóa tài khoản (Khuyên dùng)</button>
          <button class="btn secondary" id="btn-hard-delete-user" style="width: 100%; border-color: var(--red); color: var(--red);">Xóa vĩnh viễn (Chỉ khi chưa học tập)</button>
          <button class="btn secondary" id="btn-cancel-delete-user" style="width: 100%; margin-top: 4px;">Hủy</button>
        </div>
      </div>
    </div>
  `);

  const modal = document.querySelector('#delete-user-modal');
  const close = () => modal.remove();
  modal.querySelector('#btn-cancel-delete-user').onclick = close;

  modal.querySelector('#btn-soft-delete-user').onclick = async () => {
    try {
      state.adminUsers = null;
      state.adminDashboard = null;
      state.leaderboard = null;
      await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
      toast('Đã khóa tài khoản thành công.');
      close();
      loadAndRenderUsers();
    } catch (err) {
      toast(err.message, true);
    }
  };

  modal.querySelector('#btn-hard-delete-user').onclick = async () => {
    if (confirm('Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản này? Thao tác này KHÔNG THỂ HOÀN TÁC và sẽ bị lỗi nếu tài khoản đã có lịch sử học tập.')) {
      try {
        state.adminUsers = null;
        state.adminDashboard = null;
        state.leaderboard = null;
        await api(`/api/admin/users/${userId}?hard=true`, { method: 'DELETE' });
        toast('Đã xóa vĩnh viễn tài khoản.');
        close();
        loadAndRenderUsers();
      } catch (err) {
        toast(err.message, true);
      }
    }
  };
}

async function navigate(page) {
  if (state.page === 'solve' && page !== 'solve') {
    const leave = await showConfirmModal('Bạn đang làm bài. Rời bài sẽ mất thay đổi chưa lưu hoặc chưa nộp. Tiếp tục rời bài?');
    if (!leave) {
      document.querySelectorAll('[data-page]').forEach((button) => {
        button.classList.toggle('active', button.dataset.page === state.page);
      });
      return;
    }
  }

  // Close mobile nav drawer and reset scroll-lock if open
  const sidebar = document.querySelector('#sidebar');
  const shellEl = document.querySelector('#shell');
  if (sidebar) sidebar.classList.remove('open');
  if (shellEl) shellEl.classList.remove('nav-open');
  document.body.style.overflow = '';

  // Highlight the clicked tab instantly for immediate visual feedback
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  // Show a loading spinner instantly inside the content area
  const mainEl = document.querySelector('.main');
  if (mainEl) {
    mainEl.innerHTML = `<header class="topbar"><button class="mobile-menu" id="menu" aria-label="Mở menu">☰</button><h1>Đang tải...</h1><button class="text-btn" id="logout">Đăng xuất</button></header>
      <div class="loading-container"><div class="loading-spinner"></div></div>`;
  }

  clearInterval(state.timer);
  state.editor?.dispose(); state.editor = null;
  state.terminal?.dispose(); state.terminal = null;
  state.page = page;

  if (state.user && (page === 'home' || page === 'problems')) {
    if (typeof PyodideManager !== 'undefined') PyodideManager.preload();
  }

  try {
    if (page === 'home') return await homeView();
    if (page === 'problems') return await problemsView();
    if (page === 'history') return await historyView();
    if (page === 'leaderboard') return await leaderboardView();
    if (page === 'admin' && state.user.role === 'ADMIN') return await adminView();
    if (page === 'users' && state.user.role === 'ADMIN') return await usersView();
    if (page === 'groups' && state.user.role === 'ADMIN') return await groupsView();
    return await homeView();
  } catch (error) { toast(error.message, true); }
}

try {
  const data = await api('/api/auth/me');
  state.user = data.user;
  state.terminalRunner = data.terminalRunner || 'client';
  state.serverTerminalEnabled = data.serverTerminalEnabled || false;
  if (data.user) {
    await navigate('home');
    if (typeof PyodideManager !== 'undefined' && state.terminalRunner === 'client') {
      PyodideManager.preload();
    }
  } else authView();
} catch { authView(); }

window.addEventListener('beforeunload', (event) => {
  if (state.page === 'solve') {
    event.preventDefault();
    event.returnValue = 'Bạn đang trong lượt làm bài và chưa nộp bài. Nếu rời đi, mã nguồn của bạn có thể bị mất!';
    return event.returnValue;
  }
});

window.addEventListener('pyodide-state-change', (e) => {
  const statusEl = document.querySelector('#python-status');
  if (!statusEl) return;
  const s = e.detail.state;
  if (s === 'ready') {
    statusEl.textContent = '(Python: Sẵn sàng)';
    statusEl.style.color = '#236a51'; // var(--green-2)
  } else if (s === 'running') {
    statusEl.textContent = '(Python: Đang chạy)';
    statusEl.style.color = '#2563eb';
  } else if (s === 'waiting_input') {
    statusEl.textContent = '(Python: Đang chờ nhập)';
    statusEl.style.color = '#d97706';
  } else if (s === 'failed') {
    statusEl.textContent = '(Python: Lỗi)';
    statusEl.style.color = '#b43b31'; // var(--red)
  } else {
    statusEl.textContent = '(Python: Đang tải)';
    statusEl.style.color = 'var(--muted)';
  }
});

function initResizers() {
  const layout = document.querySelector('#solve-layout');
  const problemPane = document.querySelector('#problem-pane');
  const editorPane = document.querySelector('.editor-pane');
  const codeEditor = document.querySelector('#code');
  const terminal = document.querySelector('.terminal');
  const resizerH = document.querySelector('#resizer-h');
  const resizerV = document.querySelector('#resizer-v');

  if (!layout || !problemPane || !editorPane || !codeEditor || !terminal || !resizerH || !resizerV) return;

  // Load saved dimensions
  const savedWidth = localStorage.getItem('simpleoj-problem-pane-width');
  const savedHeight = localStorage.getItem('simpleoj-terminal-height');

  if (savedWidth && window.innerWidth > 1000) {
    problemPane.style.width = savedWidth + 'px';
    problemPane.style.flex = 'none';
  } else {
    if (window.innerWidth > 1000) {
      problemPane.style.width = '40%';
      problemPane.style.flex = 'none';
    }
  }

  if (savedHeight && window.innerWidth > 1000) {
    terminal.style.height = savedHeight + 'px';
    terminal.style.flex = 'none';
  } else {
    if (window.innerWidth > 1000) {
      terminal.style.height = '280px';
      terminal.style.flex = 'none';
    }
  }

  // Trigger Monaco editor redraw and xterm layout change on load
  requestAnimationFrame(() => {
    state.editor?.layout();
    state.terminal?.fit();
  });

  // Horizontal Resizer (left/right)
  resizerH.addEventListener('mousedown', (e) => {
    if (window.innerWidth <= 1000) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = problemPane.getBoundingClientRect().width;
    document.body.classList.add('resizing');

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      let newWidth = startWidth + dx;
      const minWidth = 280;
      const maxWidth = window.innerWidth - 450;

      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;

      problemPane.style.width = newWidth + 'px';
      problemPane.style.flex = 'none';

      state.editor?.layout();
    };

    const onMouseUp = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      localStorage.setItem('simpleoj-problem-pane-width', problemPane.getBoundingClientRect().width);
      state.editor?.layout();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Vertical Resizer (up/down)
  resizerV.addEventListener('mousedown', (e) => {
    if (window.innerWidth <= 1000) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminal.getBoundingClientRect().height;
    document.body.classList.add('resizing-v');

    const onMouseMove = (moveEvent) => {
      const dy = moveEvent.clientY - startY;
      let newHeight = startHeight - dy;
      const minHeight = 100;
      const editorPaneHeight = editorPane.getBoundingClientRect().height;
      const maxHeight = editorPaneHeight - 48 - 150; // min 150px editor height, 48px header bar

      if (newHeight < minHeight) newHeight = minHeight;
      if (newHeight > maxHeight) newHeight = maxHeight;

      terminal.style.height = newHeight + 'px';
      terminal.style.flex = 'none';

      state.editor?.layout();
      state.terminal?.fit();
    };

    const onMouseUp = () => {
      document.body.classList.remove('resizing-v');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      localStorage.setItem('simpleoj-terminal-height', terminal.getBoundingClientRect().height);
      state.editor?.layout();
      state.terminal?.fit();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}
