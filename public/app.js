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

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]);
const formatDate = (value) => new Intl.DateTimeFormat('vi-VN', { dateStyle:'short', timeStyle:'short' }).format(new Date(value));
const formatDuration = (ms) => `${Math.floor(ms / 60000)}p ${Math.floor((ms % 60000) / 1000)}s`;
const statusLabel = (s) => ({ ACCEPTED:'Đúng (Accepted)', WRONG_ANSWER:'Sai đáp án (Wrong Answer)', RUNTIME_ERROR:'Lỗi thực thi (Runtime Error)', TIME_LIMIT:'Quá thời gian (Time Limit Exceeded)', EXPIRED:'Hết giờ (Expired)', OUTPUT_LIMIT:'Vượt giới hạn Output (Output Limit Exceeded)', MEMORY_LIMIT:'Vượt giới hạn bộ nhớ (Memory Limit Exceeded)' })[s] || s;

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
          { token:'keyword', foreground:'7F0055', fontStyle:'bold' },
          { token:'keyword.python', foreground:'7F0055', fontStyle:'bold' },
          { token:'type.identifier', foreground:'00008B', fontStyle:'bold' },
          { token:'identifier.function', foreground:'00008B', fontStyle:'bold' },
          { token:'string', foreground:'006400' },
          { token:'number', foreground:'B04600' },
          { token:'comment', foreground:'A9A9A9' }
        ],
        colors: {
          'editor.background':'#FDFDFD', 'editor.foreground':'#000000',
          'editorGutter.background':'#E0E0E0', 'editorLineNumber.foreground':'#777777',
          'editorLineNumber.activeForeground':'#000000', 'editor.lineHighlightBackground':'#F5F5F5',
          'editor.selectionBackground':'#B9D7F6', 'editorCursor.foreground':'#000000',
          'editorIndentGuide.background1':'#E8E8E8'
        }
      });
      resolve(monaco);
    }, reject);
  });
  return monacoReady;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type':'application/json', ...(options.headers || {}) },
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
  return value.split(/\n{2,}/).map((block) => /^<(h|ul)/.test(block) ? block : `<p>${block.replace(/\n/g,'<br>')}</p>`).join('');
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
      const data = await api(`/api/auth/${register ? 'register' : 'login'}`, { method:'POST', body });
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
    await api('/api/auth/logout', { method:'POST' });
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
  const data = await api('/api/admin/users');
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
  return `<div class="grid">${problems.map((p) => {
    const slug = p.slug;
    const title = p.title;
    const rating = p.rating ?? 800;
    const ratingLabel = p.ratingLabel ?? clientGetRatingLabel(rating);
    const limitMinutes = p.timeLimitMinutes ?? p.time_limit_minutes ?? 30;
    const bestScore = p.bestScore ?? p.best_score ?? 0;
    const maxScore = p.maxScore ?? 100;
    const passingScore = p.passingScore ?? 100;
    
    let isCompleted = p.isCompleted;
    if (isCompleted === undefined) {
      isCompleted = bestScore === 100 || bestScore >= passingScore;
    }
    const isAttempted = !isCompleted && bestScore > 0;
    
    let statusClass = 'neutral';
    let statusLabel = 'Chưa làm';
    if (isCompleted) {
      statusClass = 'mint';
      statusLabel = 'Đã hoàn thành';
    } else if (isAttempted) {
      statusClass = 'warm';
      statusLabel = 'Đang làm';
    }
    
    const isAssigned = p.isAssigned ?? false;

    let ratingClass = 'r800';
    if (rating >= 1100 && rating <= 1300) ratingClass = 'r1100';
    else if (rating >= 1400 && rating <= 1600) ratingClass = 'r1400';
    else if (rating >= 1700 && rating <= 1900) ratingClass = 'r1700';
    else if (rating >= 2000) ratingClass = 'r2000';
    
    return `<article class="problem-card">
      <div class="card-badges">
        <span class="badge ${statusClass}">${statusLabel}</span>
        ${isAssigned ? '<span class="badge assigned">Được giao</span>' : ''}
        <span class="badge ${ratingClass}">${rating} · ${escapeHtml(ratingLabel)}</span>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <div class="problem-meta">
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="meta-icon" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${limitMinutes} phút</span>
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="meta-icon" aria-hidden="true"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> Điểm: ${bestScore}/${maxScore}</span>
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
    <div class="section-head"><h3>Bài tập mới</h3><button class="text-btn" id="all-problems">Xem tất cả →</button></div>${problemCards(problems.slice(0,6))}
  </section>`);
  document.querySelector('#all-problems').onclick = () => navigate('problems');
  bindProblemButtons();
  
  // Preload Monaco Editor in background to eliminate delay
  loadMonaco().catch(() => {});
}

async function problemsView() {
  // Initialize pagination & filter state
  state.problemsPage = {
    tab: 'done',
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
    
    <!-- Tab Headers -->
    <div class="tabs-header" role="tablist">
      <button class="tab-btn active" data-tab="done" role="tab" aria-selected="true">Đã làm</button>
      <button class="tab-btn" data-tab="todo" role="tab" aria-selected="false">Chưa làm</button>
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
      scoreGroup.style.display = state.problemsPage.tab === 'done' ? 'flex' : 'none';
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
    const { tab, cursor, minRating, maxRating, minScore, maxScore, assigned, sort, uploadedFrom, uploadedTo } = state.problemsPage;
    
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
  if (problem) {
    const res = await api('/api/attempts', { method:'POST', body:{ slug } });
    attempt = res.attempt;
  } else {
    const [resP, resA] = await Promise.all([
      api(`/api/problems/${encodeURIComponent(slug)}`),
      api('/api/attempts', { method:'POST', body:{ slug } })
    ]);
    problem = resP.problem;
    attempt = resA.attempt;
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

  const examples = (problem.examples || []).map((ex, i) => `<div class="example"><div class="example-head">Ví dụ ${i+1}</div><div class="example-grid"><div>Input<pre>${escapeHtml(ex.input)}</pre></div><div>Output<pre>${escapeHtml(ex.output)}</pre></div></div>${ex.explanation ? `<div style="padding:0 12px 12px" class="muted">${escapeHtml(ex.explanation)}</div>` : ''}</div>`).join('');
  shell(`<div class="solve-mobile-tabs" role="tablist"><button class="active" id="show-problem" role="tab">Đề bài</button><button id="show-code" role="tab">Code & Shell</button></div><section class="solve-layout" id="solve-layout">
    <article class="problem-pane" id="problem-pane"><span class="badge ${ratingClass}">${rating} · ${escapeHtml(ratingLabel)}</span><h2>${escapeHtml(problem.title)}</h2><div class="markdown">${markdown(problem.description)}</div><div class="section-head"><h3>Ví dụ</h3></div>${examples}</article>
    <div class="solve-layout-resizer-h" id="resizer-h"></div>
    <section class="editor-pane"><div class="editor-bar"><span><i class="python-dot"></i> PYTHON 3 · main.py</span><span class="timer" id="timer">--:--</span></div>
      <div class="code-editor" id="code" aria-label="Mã nguồn Python"></div>
      <div class="solve-layout-resizer-v" id="resizer-v"></div>
      <section class="terminal" aria-label="Terminal"><div class="terminal-header"><div class="terminal-dots"><span></span><span></span><span></span></div><span class="terminal-title">Terminal — Python 3 <span id="python-status" style="font-size:11px; margin-left:8px; opacity:0.8; color: ${initialStatusColor}">${initialStatusText}</span></span><div class="terminal-actions"><button class="term-btn" id="clear-shell" title="Xóa terminal (clear)">⌫</button><button class="term-btn stop" id="stop" title="Ngắt tiến trình (Ctrl+C)" disabled>■ Stop</button><button class="term-btn run" id="run" title="Chạy thử (python main.py)">▶ Run</button><button class="term-btn submit" id="submit" title="Nộp bài chấm điểm">⬆ Nộp bài</button></div></div>
        <div class="terminal-screen" id="terminal-host" tabindex="0" aria-label="Terminal Python tương tác"></div>
      </section>
    </section></section>`, problem.title);
  const pane = document.querySelector('#problem-pane');
  if (pane && window.renderMathInElement) {
    const renderMath = () => {
      window.renderMathInElement(pane, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false},
          {left: '\\[', right: '\\[', display: true}
        ],
        throwOnError: false
      });
    };
    // Trì hoãn render LaTeX để tránh khóa UI thread và tăng tốc độ chuyển trang
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
    value: savedCode || state.current.starter_code, language:'python', theme:'thonny-light', automaticLayout:true,
    fontFamily:'Consolas, "DM Mono", monospace', fontSize:14, lineHeight:22, tabSize:4,
    insertSpaces:true, minimap:{enabled:false}, scrollBeyondLastLine:false, smoothScrolling:true,
    padding:{top:10,bottom:10}, renderLineHighlight:'all', overviewRulerLanes:0,
    scrollbar:{verticalScrollbarSize:10,horizontalScrollbarSize:10}, wordWrap:'off'
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
    state.terminal?.execute('clear');
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
      const data = await api('/api/submissions', { method:'POST', body:{ attemptId:state.attempt.id, code:state.editor.getValue() } });
      clearInterval(state.timer);
      state.page = 'submitted';
      const cacheKey = `simpleoj-code-${state.user.id}-${state.current.slug}`;
      localStorage.removeItem(cacheKey);
      state.problems = null;
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

async function historyView() {
  const submissions = await loadSubmissions();
  const rows = submissions.map((s) => `<tr><td><strong>${escapeHtml(s.title)}</strong></td><td><span class="badge ${s.status === 'ACCEPTED' ? '' : 'red'}">${statusLabel(s.status)}</span></td><td>${s.score}/100</td><td>${formatDuration(s.duration_ms)}</td><td>${formatDate(s.created_at)}</td></tr>`).join('');
  shell(`<section class="content"><div class="hero-row"><div><span class="eyebrow">Dấu vết học tập</span><h2>Lịch sử nộp bài</h2></div></div><div class="table-wrap"><table><thead><tr><th>Bài</th><th>Trạng thái</th><th>Điểm</th><th>Thời gian làm</th><th>Lúc nộp</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Chưa có lượt nộp nào.</td></tr>'}</tbody></table></div></section>`, 'Lịch sử nộp');
}

async function leaderboardView() {
  const leaderboard = await loadLeaderboard();
  const rows = leaderboard.map((u,i) => `<tr><td><strong>${i+1}</strong></td><td>${escapeHtml(u.full_name)}</td><td>${u.solved}</td><td>${u.total_score}</td></tr>`).join('');
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

function testRows(values = [{input:'',output:''}]) {
  return values.map((t) => `<div class="test-row"><textarea placeholder="Input">${escapeHtml(t.input)}</textarea><textarea placeholder="Output">${escapeHtml(t.output)}</textarea><button type="button" class="btn small danger remove-test">×</button></div>`).join('');
}

function problemModal(problem = null) {
  const ratingOpts = Array.from({length: 28}, (_, i) => 800 + i * 100).map(r => `
    <option value="${r}" ${(problem?.rating ?? 800) === r ? 'selected' : ''}>${r}</option>
  `).join('');

  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="problem-modal"><form class="modal wide" id="problem-form"><span class="eyebrow">${problem ? 'Chỉnh sửa' : 'Bài tập mới'}</span><h2>${problem ? escapeHtml(problem.title) : 'Tạo bài tập'}</h2><div class="form-grid">
    <div class="field"><label>Slug</label><input name="slug" value="${escapeHtml(problem?.slug || '')}" required></div><div class="field"><label>Tên bài</label><input name="title" value="${escapeHtml(problem?.title || '')}" required></div>
    <div class="field"><label>Rating Codeforces</label><select name="rating" required>${ratingOpts}</select></div><div class="field"><label>Thời gian làm (phút)</label><input name="timeLimitMinutes" type="number" min="1" max="240" value="${problem?.time_limit_minutes || 30}"></div>
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
  modal.querySelector('#problem-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.isActive = event.target.isActive.checked;
    data.rating = Number(data.rating || 800);
    data.difficulty = clientGetRatingLabel(data.rating); // Auto map to difficulty text for backward compatibility
    data.testcases = [...modal.querySelectorAll('.test-row')].map((row) => ({ input:row.children[0].value, output:row.children[1].value }));
    data.examples = problem?.examples || [];
    try {
      await api(problem ? `/api/admin/problems/${problem.id}` : '/api/admin/problems', { method:problem ? 'PUT':'POST', body:data });
      state.problems = null;
      state.problemDetails = {};
      state.adminDashboard = null;
      modal.remove(); toast('Đã lưu bài tập.'); adminView();
    } catch(error) { toast(error.message,true); }
  };
}

function importModal() {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="import-modal"><div class="modal"><span class="eyebrow">Nhập hàng loạt</span><h2>Import bài từ JSON</h2><p class="muted">Chấp nhận định dạng <code>problems.json</code> cũ hoặc mảng bài theo schema mới. Bài trùng slug sẽ được cập nhật.</p><div class="field"><label>Chọn file JSON</label><input type="file" id="json-file" accept="application/json,.json"></div><div class="modal-actions"><button class="btn secondary" id="cancel-import">Hủy</button><button class="btn" id="do-import">Import</button></div></div></div>`);
  const modal = document.querySelector('#import-modal');
  modal.querySelector('#cancel-import').onclick = () => modal.remove();
  modal.querySelector('#do-import').onclick = async () => {
    const file = modal.querySelector('#json-file').files[0]; if(!file) return toast('Hãy chọn file JSON.',true);
    try {
      const body = JSON.parse(await file.text());
      const result = await api('/api/admin/problems/import',{method:'POST',body});
      state.problems = null;
      state.problemDetails = {};
      state.adminDashboard = null;
      modal.remove(); toast(`Đã import ${result.imported} bài.`); adminView();
    } catch(error) { toast(error.message,true); }
  };
}

async function usersView() {
  const users = await loadAdminUsers();
  const rows = users.map((u) => `<tr><td><strong>${escapeHtml(u.full_name)}</strong><br><span class="muted">${escapeHtml(u.email)}</span></td><td><select class="role" data-id="${u.id}"><option ${u.role==='STUDENT'?'selected':''}>STUDENT</option><option ${u.role==='ADMIN'?'selected':''}>ADMIN</option></select></td><td>${u.submissions}</td><td><label><input type="checkbox" class="active-user" data-id="${u.id}" ${u.is_active?'checked':''}> Hoạt động</label></td><td><button class="btn small save-user" data-id="${u.id}">Lưu</button></td></tr>`).join('');
  shell(`<section class="content"><div class="hero-row"><div><span class="eyebrow">Tài khoản</span><h2>Học sinh & quyền truy cập.</h2></div></div><div class="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Lượt nộp</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`, 'Học sinh');
  document.querySelectorAll('.save-user').forEach((b) => b.onclick = async () => {
    const role = document.querySelector(`.role[data-id="${b.dataset.id}"]`).value;
    const isActive = document.querySelector(`.active-user[data-id="${b.dataset.id}"]`).checked;
    try {
      await api(`/api/admin/users/${b.dataset.id}`,{method:'PATCH',body:{role,isActive}});
      state.adminUsers = null;
      state.adminDashboard = null;
      state.leaderboard = null;
      toast('Đã cập nhật tài khoản.');
    } catch(error) { toast(error.message,true); }
  });
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
    return await homeView();
  } catch (error) { toast(error.message,true); }
}

try {
  const { user } = await api('/api/auth/me');
  state.user = user;
  if (user) {
    await navigate('home');
    if (typeof PyodideManager !== 'undefined') PyodideManager.preload();
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
