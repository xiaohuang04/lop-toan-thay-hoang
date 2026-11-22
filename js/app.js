import { api, setToken } from './api.js';
import { createExamRunner } from './exam-runner.js';
import { createTeacherController } from './teacher-ui.js';
import { createStudentController } from './student-ui.js';
import { createHtmlLabController } from './html-lab.js';

const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');

const userRoleBadge = document.getElementById('userRoleBadge');
const userNameText = document.getElementById('userNameText');
const btnLogout = document.getElementById('btnLogout');

const modalBackdrop = document.getElementById('modalBackdrop');
const modalCard = document.getElementById('modalCard');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFooter = document.getElementById('modalFooter');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const toastContainer = document.getElementById('toastContainer');
const headerStatusBadge = document.getElementById('headerStatusBadge');

let currentUser = null;
let activeRoleCtrl = null;

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

let modalDismissible = true;

function openModal({ title, bodyHtml, footerHtml = '', wide = false, dismissible = true, onMount }) {
  modalDismissible = dismissible;
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFooter.innerHTML = footerHtml;
  modalCard.classList.toggle('modal-wide', Boolean(wide));
  modalCloseBtn.classList.toggle('hidden', !dismissible);
  modalBackdrop.classList.remove('hidden');
  if (typeof onMount === 'function') onMount(modalCard);
}

function closeModal() {
  modalDismissible = true;
  modalCloseBtn.classList.remove('hidden');
  modalBackdrop.classList.add('hidden');
}

modalCloseBtn.addEventListener('click', () => {
  if (modalDismissible) closeModal();
});
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop && modalDismissible) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalBackdrop.classList.contains('hidden') && modalDismissible) {
    closeModal();
  }
});

function renderMath(container) {
  if (!container) return;
  const doRender = () => {
    if (typeof window.renderMathInElement === 'function') {
      window.renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      });
    }
  };
  if (typeof window.renderMathInElement === 'function') {
    doRender();
  } else {
    window.addEventListener('load', doRender, { once: true });
  }
}

function setHeaderStatus(text) {
  if (!headerStatusBadge) return;
  const val = String(text || '').trim();
  headerStatusBadge.textContent = val;
  headerStatusBadge.classList.toggle('hidden', val === '');
}

const uiHelpers = {
  showToast,
  openModal,
  closeModal,
  renderMath,
  setHeaderStatus,
};

const examRoot = document.getElementById('examRoot');
const examRunner = createExamRunner({ rootEl: examRoot, uiHelpers });

const teacherCtrl = createTeacherController({
  rootEl: examRoot,
  examRunner,
  uiHelpers,
});

const studentCtrl = createStudentController({
  rootEl: examRoot,
  examRunner,
  uiHelpers,
  onUserUpdated: (u) => {
    currentUser = u;
    updateUserHeader();
  },
});

const labCtrl = createHtmlLabController({
  rootEl: document.getElementById('labRoot'),
  uiHelpers,
  getUser: () => currentUser,
});

// 2-Tab Navigation
const tabButtons = document.querySelectorAll('.main-tab');
const tabBtnLab = document.getElementById('tabBtnLab');
const panels = {
  exam: document.getElementById('panel-exam'),
  lab: document.getElementById('panel-lab'),
};

function updateLabTabLock() {
  if (!tabBtnLab) return;
  const isStudent = currentUser?.role === 'student';
  tabBtnLab.classList.toggle('is-locked', isStudent);
  tabBtnLab.title = isStudent ? 'Tính năng này hiện đang tạm khóa cho Học sinh' : 'Mô hình tương tác HTML';
  let lockSpan = tabBtnLab.querySelector('.tab-lock-icon');
  if (isStudent) {
    if (!lockSpan) {
      lockSpan = document.createElement('span');
      lockSpan.className = 'tab-lock-icon';
      lockSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      tabBtnLab.appendChild(lockSpan);
    }
  } else if (lockSpan) {
    lockSpan.remove();
  }
}

function switchTab(tabName) {
  if (tabName === 'lab' && currentUser?.role === 'student') {
    showToast('Chức năng Mô hình tương tác hiện đang tạm khóa cho Học sinh.');
    return;
  }
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle('active', key === tabName);
  });

  setHeaderStatus('');
  if (tabName === 'lab') {
    labCtrl.init();
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('brandHome').addEventListener('click', () => {
  switchTab('exam');
  activeRoleCtrl?.goHome();
});

function updateUserHeader() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  userRoleBadge.textContent = isAdmin ? 'Giáo viên' : 'Học sinh';
  userRoleBadge.className = `badge ${isAdmin ? 'badge-p2' : 'badge-p1'}`;
  userNameText.textContent = currentUser.fullName || currentUser.username;
}

function showAuthScreen() {
  examRunner.cleanup();
  currentUser = null;
  activeRoleCtrl = null;
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginError.classList.add('hidden');
  loginPassword.value = '';
}

async function enterApp(user) {
  currentUser = user;
  updateUserHeader();
  updateLabTabLock();
  setHeaderStatus('');
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  switchTab('exam');

  if (user.role === 'admin') {
    activeRoleCtrl = teacherCtrl;
  } else {
    activeRoleCtrl = studentCtrl;
  }
  await activeRoleCtrl.goHome();
}

// Login Form
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const u = loginUsername.value.trim();
  const p = loginPassword.value;
  try {
    const res = await api.login(u, p);
    setToken(res.token);
    showToast(`Đăng nhập thành công! Chào mừng ${res.user.fullName}.`, 'success');
    await enterApp(res.user);
  } catch (err) {
    loginError.textContent = err.message || 'Đăng nhập thất bại.';
    loginError.classList.remove('hidden');
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  try {
    await api.logout();
  } catch {
    // ignore
  }
  setToken('');
  showToast('Đã đăng xuất khỏi hệ thống.');
  showAuthScreen();
});

// Boot session check
async function boot() {
  try {
    const res = await api.me();
    if (res.user) {
      await enterApp(res.user);
      return;
    }
  } catch {
    setToken('');
  }
  showAuthScreen();
}

boot();
