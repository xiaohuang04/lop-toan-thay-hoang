import { api, setToken } from './api.js?v=20261126a';
import { createExamRunner } from './exam-runner.js?v=20261125l';
import { createTeacherController } from './teacher-ui.js?v=20261126e';
import { createStudentController } from './student-ui.js?v=20261126a';
import { createHtmlLabController } from './html-lab.js?v=20261124z';
import { createTeachingLogController } from './teaching-log.js?v=20261125h';
import { createGradebookController } from './gradebook.js?v=20261125l';
import { createLectureSlidesController } from './lecture-slides.js?v=20261126k';
import { escapeHtml, escapeAttr, formatDateOnlyVN, parseVnDateOnlyToIso } from './exam-engine.js?v=20261123d';
import { mountAnimatedDropzone } from './ux-dropzone.js?v=20261124z2';
import { mountAvatarCropper } from './avatar-cropper.js?v=20261124z2';
import {
  attachJellyTabs,
  createStackingToaster,
  renderSegmentedStorageMeterHtml,
  bindSegmentedStorageMeter,
  initAnimateUiPrimitives,
  scanAnimateUiPrimitives,
} from './ux-effects.js?v=20261125l';

const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginUsernameGroup = document.getElementById('loginUsernameGroup');
const loginPassword = document.getElementById('loginPassword');
const loginPasswordLabel = document.getElementById('loginPasswordLabel');
const btnToggleLoginPw = document.getElementById('btnToggleLoginPw');
const authQuickBadge = document.getElementById('authQuickBadge');
const authTitleText = document.getElementById('authTitleText');
const authQuickSwitchWrap = document.getElementById('authQuickSwitchWrap');
const btnSwitchFullLogin = document.getElementById('btnSwitchFullLogin');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const loginError = document.getElementById('loginError');

const userRoleBadge = document.getElementById('userRoleBadge');
const userNameText = document.getElementById('userNameText');
const userMenuWrap = document.getElementById('userMenuWrap');
const userMenuTrigger = document.getElementById('userMenuTrigger');
const userDropdown = document.getElementById('userDropdown');
const menuItemProfile = document.getElementById('menuItemProfile');
const menuItemSwitchDemo = document.getElementById('menuItemSwitchDemo');
const menuItemSwitchAdmin = document.getElementById('menuItemSwitchAdmin');
const menuItemStorage = document.getElementById('menuItemStorage');
const menuItemChangePw = document.getElementById('menuItemChangePw');
const menuItemLogout = document.getElementById('menuItemLogout');

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

const showToast = createStackingToaster(toastContainer);

let modalDismissible = true;
let modalLockedScrollY = null;

function lockBackgroundScroll() {
  if (modalLockedScrollY !== null) return;
  modalLockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${modalLockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockBackgroundScroll() {
  if (modalLockedScrollY === null) return;
  const restoreY = modalLockedScrollY;
  modalLockedScrollY = null;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo({ top: restoreY, left: 0, behavior: 'instant' });
}

let modalCloseTimer = null;

function openModal({ title, bodyHtml, footerHtml = '', wide = false, xl = false, dismissible = true, onMount }) {
  if (modalCloseTimer) {
    clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  modalDismissible = dismissible;
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFooter.innerHTML = footerHtml;
  modalFooter.classList.remove('hidden');
  modalCard.classList.remove('modal-cropper-only');
  modalCard.classList.toggle('modal-wide', Boolean(wide) && !xl);
  modalCard.classList.toggle('modal-xl', Boolean(xl));
  modalCloseBtn.classList.toggle('hidden', !dismissible);
  modalBody.scrollTop = 0;

  modalBackdrop.classList.remove('hidden', 'is-closing', 'is-open');
  lockBackgroundScroll();
  scanAnimateUiPrimitives(modalCard);
  if (typeof onMount === 'function') onMount(modalCard);
  void modalBackdrop.offsetWidth;
  modalBackdrop.classList.add('is-open');
}

function closeModal() {
  if (modalBackdrop.classList.contains('hidden')) return;
  modalDismissible = true;
  if (modalCloseTimer) {
    clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  const rm = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  modalBackdrop.classList.remove('is-open');
  modalBackdrop.classList.add('is-closing');
  unlockBackgroundScroll();

  const finishClose = () => {
    modalCloseTimer = null;
    modalBackdrop.classList.remove('is-closing');
    modalBackdrop.classList.add('hidden');
    modalCard.classList.remove('modal-wide', 'modal-xl', 'modal-cropper-only');
    modalFooter.classList.remove('hidden');
    modalCloseBtn.classList.remove('hidden');
  };

  if (rm) {
    finishClose();
  } else {
    modalCloseTimer = setTimeout(finishClose, 220);
  }
}

initAnimateUiPrimitives();

// Block touch-scrolling directly on the blurred backdrop (iOS Safari) while allowing modal-body to scroll
modalBackdrop.addEventListener(
  'touchmove',
  (e) => {
    if (!modalBody.contains(e.target)) {
      e.preventDefault();
    }
  },
  { passive: false }
);

modalCloseBtn.addEventListener('click', () => {
  if (modalDismissible) closeModal();
});
// Backdrop click intentionally disabled: modals only close via explicit buttons (✕ / Hủy / Đóng) or Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalBackdrop.classList.contains('hidden') && modalDismissible) {
    closeModal();
  }
});

function fitInlineMath(container) {
  if (!container) return;
  container.querySelectorAll('.katex').forEach((node) => {
    if (node.closest('.katex-display')) return;
    node.classList.remove('is-katex-wrap');
    const box =
      node.closest('.ls-q-stem, .ls-opt-val, .ls-tf-val, .q-stem, .opt-text, .tf-text') || node.parentElement;
    if (!box) return;
    const maxW = box.clientWidth;
    if (maxW > 48 && node.getBoundingClientRect().width > maxW - 4) {
      node.classList.add('is-katex-wrap');
    }
  });
}

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
      requestAnimationFrame(() => fitInlineMath(container));
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
  fitInlineMath,
  setHeaderStatus,
  openStorageModal: () => openStorageManagerModal(),
};

const examRoot = document.getElementById('examRoot');
const slidesRoot = document.getElementById('slidesRoot');
const examRunner = createExamRunner({ rootEl: examRoot, uiHelpers });
const lectureSlidesCtrl = createLectureSlidesController({ uiHelpers });

const teacherCtrl = createTeacherController({
  rootEl: examRoot,
  examRunner,
  uiHelpers,
  onPresentExam: (exam) => {
    lectureSlidesCtrl.presentExam(exam);
    switchTab('slides');
  },
  onExamsLoaded: (exams) => {
    lectureSlidesCtrl.setExams(exams);
  },
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

function parseRouteFromLocation() {
  const raw = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (raw === '/so-diem' || raw.startsWith('/so-diem/')) {
    const rest = raw.slice('/so-diem'.length).replace(/^\/+/, '');
    if (rest === 'thong-ke') {
      const qs = new URLSearchParams(window.location.search || '');
      return {
        tab: 'gradebook',
        view: 'stats',
        statsType: qs.get('type') === 'ck' ? 'ck' : 'gk',
        statsTerm: Number(qs.get('term')) === 2 ? 2 : 1,
        statsScope: qs.get('scope') || 'all',
        grade: null,
        manage: false,
      };
    }
    return {
      tab: 'gradebook',
      view: 'sheet',
      grade: null,
      manage: false,
    };
  }
  if (raw === '/so-bao-giang' || raw.startsWith('/so-bao-giang/')) {
    const rest = raw.slice('/so-bao-giang'.length).replace(/^\/+/, '');
    const subMap = {
      '': 'log',
      'thuc-te': 'actual',
      'so-do-dung': 'equipment',
      'tkb': 'tkb',
      'khdh': 'plan',
    };
    return {
      tab: 'teaching-log',
      subTab: subMap[rest] || 'log',
      grade: null,
      manage: false,
    };
  }
  if (raw === '/trinh-chieu' || raw.startsWith('/trinh-chieu/')) {
    return { tab: 'slides', grade: null, manage: false };
  }
  if (raw === '/game-tuong-tac' || raw.startsWith('/game-tuong-tac/')) {
    return { tab: 'live-game', grade: null, manage: false };
  }
  if (raw === '/mo-hinh' || raw.startsWith('/mo-hinh/')) {
    const rest = raw.slice('/mo-hinh'.length).replace(/^\/+/, '');
    const gradeMatch = rest.match(/^toan-(10|11|12)$/);
    return {
      tab: 'lab',
      grade: gradeMatch ? gradeMatch[1] : null,
      manage: rest === 'quan-ly',
    };
  }
  return { tab: 'exam', grade: null, manage: false };
}

function syncBrowserUrl(targetPath, { replace = false } = {}) {
  if (!window.history?.pushState) return;
  const norm = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const currentFull = `${window.location.pathname}${window.location.search || ''}`;
  if (currentFull === norm) return;
  if (replace) window.history.replaceState({ path: norm }, '', norm);
  else window.history.pushState({ path: norm }, '', norm);
}

let modelsVisibilityMode = 'all_grades';
let canSwitchBackToAdmin = false;

const labCtrl = createHtmlLabController({
  rootEl: document.getElementById('labRoot'),
  uiHelpers,
  getUser: () => currentUser,
  getVisibilityMode: () => modelsVisibilityMode,
  onVisibilityModeChanged: (mode) => {
    modelsVisibilityMode = mode || 'all_grades';
    updateUserHeader();
  },
  onRouteChange: (subPath, opts) => {
    if (panels.lab?.classList.contains('active')) {
      syncBrowserUrl(subPath, opts);
    }
  },
});

const teachingLogCtrl = createTeachingLogController({
  rootEl: document.getElementById('teachingLogRoot'),
  uiHelpers,
  onRouteChange: (subPath, opts) => {
    if (panels['teaching-log']?.classList.contains('active')) {
      syncBrowserUrl(subPath, opts);
    }
  },
});

const gradebookCtrl = createGradebookController({
  rootEl: document.getElementById('gradebookRoot'),
  uiHelpers,
  onRouteChange: (subPath, opts) => {
    if (panels.gradebook?.classList.contains('active')) {
      syncBrowserUrl(subPath, opts);
    }
  },
});

// 4-Tab Navigation (Tab 3 & 4 Admin-only) + Clean History API URL Routing (/lop-hoc, /mo-hinh, /so-bao-giang, /so-diem)
const tabButtons = document.querySelectorAll('.main-tab');
const tabBtnLab = document.getElementById('tabBtnLab');
const tabBtnSlides = document.getElementById('tabBtnSlides');
const tabBtnTeachingLog = document.getElementById('tabBtnTeachingLog');
const tabBtnGradebook = document.getElementById('tabBtnGradebook');
const tabBtnLiveGame = document.getElementById('tabBtnLiveGame');
const tabExamLabel = document.getElementById('tabExamLabel');
const panels = {
  exam: document.getElementById('panel-exam'),
  lab: document.getElementById('panel-lab'),
  slides: document.getElementById('panel-slides'),
  'teaching-log': document.getElementById('panel-teaching-log'),
  gradebook: document.getElementById('panel-gradebook'),
  'live-game': document.getElementById('panel-live-game'),
};

function ensureLiveGameMounted() {
  const hostEl = document.getElementById('liveGameRoot');
  if (!hostEl || hostEl.querySelector('iframe')) return;
  hostEl.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
      <a href="/live-game/host.html" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
        Mở toàn màn hình trình chiếu ↗
      </a>
    </div>
    <iframe
      src="/live-game/host.html?embed=1"
      title="Game Tương Tác Lớp Học"
      style="width:100%; height:calc(100vh - 134px); min-height:640px; border:1px solid var(--border); border-radius:16px; background:var(--bg); display:block;"
      allow="fullscreen"
    ></iframe>
  `;
}

function updateLabTabLock() {
  if (!tabBtnLab) return;
  tabBtnLab.classList.remove('is-locked');
  tabBtnLab.title = 'Mô hình tương tác';
  tabBtnLab.querySelector('.tab-lock-icon')?.remove();
}

function updateDocumentTitle(tabName) {
  if (tabName === 'slides') {
    document.title = 'Trình chiếu bài giảng — Lớp toán thầy Hoàng';
  } else if (tabName === 'live-game') {
    document.title = 'Game tương tác — Lớp toán thầy Hoàng';
  } else if (tabName === 'gradebook') {
    document.title = 'Sổ điểm — Lớp toán thầy Hoàng';
  } else if (tabName === 'teaching-log') {
    document.title = 'Sổ báo giảng — Lớp toán thầy Hoàng';
  } else if (tabName === 'lab') {
    document.title = 'Mô hình tương tác — Lớp toán thầy Hoàng';
  } else if (currentUser?.role === 'admin') {
    document.title = 'Quản lý lớp học — Lớp toán thầy Hoàng';
  } else {
    document.title = 'Lớp học của tôi — Lớp toán thầy Hoàng';
  }
}

function switchTab(tabName, { updateUrl = true, replaceUrl = false, routeOpts = null } = {}) {
  // Guard Admin-only Trình chiếu, Sổ báo giảng, Sổ điểm & Game tương tác tabs
  if ((tabName === 'slides' || tabName === 'teaching-log' || tabName === 'gradebook' || tabName === 'live-game') && currentUser?.role !== 'admin') {
    tabName = 'exam';
  }
  // Guard Mô hình tương tác when visibility is set to Admin-only
  if (tabName === 'lab' && currentUser?.role !== 'admin' && modelsVisibilityMode === 'admin_only') {
    tabName = 'exam';
  }

  if (tabName !== 'slides') {
    lectureSlidesCtrl.cleanup();
  }

  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  attachJellyTabs(document.querySelector('.main-tabs'), { key: 'main-nav-tabs', itemSelector: '.main-tab' });
  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle('active', key === tabName);
  });

  setHeaderStatus('');
  updateDocumentTitle(tabName);

  if (tabName === 'slides') {
    if (updateUrl) {
      syncBrowserUrl('/trinh-chieu', { replace: replaceUrl });
    }
    lectureSlidesCtrl.mount(slidesRoot, { exams: teacherCtrl.getExams?.() || [] });
  } else if (tabName === 'live-game') {
    if (updateUrl) {
      syncBrowserUrl('/game-tuong-tac', { replace: replaceUrl });
    }
    ensureLiveGameMounted();
  } else if (tabName === 'gradebook') {
    if (updateUrl) {
      if (routeOpts?.view === 'stats') {
        const qs = new URLSearchParams({
          type: routeOpts.statsType === 'ck' ? 'ck' : 'gk',
          term: String(routeOpts.statsTerm === 2 ? 2 : 1),
          scope: routeOpts.statsScope || 'all',
        });
        syncBrowserUrl(`/so-diem/thong-ke?${qs.toString()}`, { replace: replaceUrl });
      } else {
        syncBrowserUrl('/so-diem', { replace: replaceUrl });
      }
    }
    gradebookCtrl.init(routeOpts);
  } else if (tabName === 'teaching-log') {
    if (updateUrl) {
      const subUrlMap = {
        log: '/so-bao-giang',
        actual: '/so-bao-giang/thuc-te',
        equipment: '/so-bao-giang/so-do-dung',
        tkb: '/so-bao-giang/tkb',
        plan: '/so-bao-giang/khdh',
      };
      const targetUrl = subUrlMap[routeOpts?.subTab] || '/so-bao-giang';
      syncBrowserUrl(targetUrl, { replace: replaceUrl });
    }
    teachingLogCtrl.init(routeOpts);
  } else if (tabName === 'lab') {
    if (updateUrl) {
      const targetUrl = routeOpts?.manage
        ? '/mo-hinh/quan-ly'
        : routeOpts?.grade
          ? `/mo-hinh/toan-${routeOpts.grade}`
          : '/mo-hinh';
      syncBrowserUrl(targetUrl, { replace: replaceUrl });
    }
    labCtrl.init(routeOpts);
  } else {
    if (updateUrl) {
      syncBrowserUrl('/lop-hoc', { replace: replaceUrl });
    }
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('brandHome').addEventListener('click', () => {
  switchTab('exam');
  activeRoleCtrl?.goHome();
});

window.addEventListener('popstate', () => {
  if (!currentUser) return;
  const route = parseRouteFromLocation();
  switchTab(route.tab, { updateUrl: false, routeOpts: route });
});

const userAvatarInitials = document.getElementById('userAvatarInitials');
const userAvatarImg = document.getElementById('userAvatarImg');
const userSubMeta = document.getElementById('userSubMeta');

function getVisibleUserMenuItems() {
  if (!userDropdown) return [];
  return Array.from(userDropdown.querySelectorAll('.u408-it:not(.hidden)'));
}

function syncUserMenuStagger() {
  if (!userDropdown) return;
  let idx = 0;
  Array.from(userDropdown.children).forEach((el) => {
    if (el.classList.contains('hidden')) return;
    el.style.setProperty('--i', String(idx));
    idx += 1;
  });
}

function isUserDropdownOpen() {
  return Boolean(userMenuWrap?.classList.contains('is-open'));
}

function closeUserDropdown(returnFocus = false) {
  if (!userMenuWrap || !isUserDropdownOpen()) return;
  userMenuWrap.classList.remove('is-open', 'open');
  userMenuTrigger?.setAttribute('aria-expanded', 'false');
  if (returnFocus) userMenuTrigger?.focus({ preventScroll: true });
}

function openUserDropdown(focusAt = null) {
  if (!userMenuWrap) return;
  syncUserMenuStagger();
  userMenuWrap.classList.add('is-open', 'open');
  userMenuTrigger?.setAttribute('aria-expanded', 'true');
  if (focusAt !== null) {
    const items = getVisibleUserMenuItems();
    if (items.length > 0) {
      items[(focusAt + items.length) % items.length].focus({ preventScroll: true });
    }
  }
}

function toggleUserDropdown() {
  if (isUserDropdownOpen()) closeUserDropdown(false);
  else openUserDropdown(null);
}

userMenuTrigger?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleUserDropdown();
});

userMenuTrigger?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    openUserDropdown(e.key === 'ArrowDown' ? 0 : -1);
  } else if (e.key === 'Escape' && isUserDropdownOpen()) {
    e.stopPropagation();
    closeUserDropdown(false);
  }
});

userDropdown?.addEventListener('keydown', (e) => {
  const items = getVisibleUserMenuItems();
  if (!items.length) return;
  const curIdx = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(curIdx + 1 + items.length) % items.length].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(curIdx - 1 + items.length) % items.length].focus();
  } else if (e.key === 'Home') {
    e.preventDefault();
    items[0].focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    items[items.length - 1].focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeUserDropdown(true);
  } else if (e.key === 'Tab') {
    closeUserDropdown(false);
  }
});

document.addEventListener(
  'pointerdown',
  (e) => {
    if (isUserDropdownOpen() && userMenuWrap && !userMenuWrap.contains(e.target)) {
      closeUserDropdown(false);
    }
  },
  true
);

function computeAvatarInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

const PRESET_AVATAR_VER = '20261124f';

function avatarDisplaySrc(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.startsWith('/assets/avatars/') && !s.includes('?')) {
    return `${s}?v=${PRESET_AVATAR_VER}`;
  }
  return s;
}

function updateUserHeader() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  const displayName = currentUser.fullName || currentUser.username;
  userRoleBadge.textContent = isAdmin ? 'Giáo viên' : 'Học sinh';
  userRoleBadge.className = `badge ${isAdmin ? 'badge-p2' : 'badge-p1'}`;
  userNameText.textContent = displayName;
  if (userAvatarInitials) {
    userAvatarInitials.textContent = computeAvatarInitials(displayName);
  }
  const avUrl = String(currentUser.avatarUrl || '').trim();
  if (userAvatarImg && userAvatarInitials) {
    if (avUrl) {
      userAvatarImg.src = avatarDisplaySrc(avUrl);
      userAvatarImg.classList.remove('hidden');
      userAvatarInitials.classList.add('hidden');
    } else {
      userAvatarImg.removeAttribute('src');
      userAvatarImg.classList.add('hidden');
      userAvatarInitials.classList.remove('hidden');
    }
  }
  if (userMenuTrigger) {
    userMenuTrigger.classList.toggle('is-admin', isAdmin);
    userMenuTrigger.title = `${displayName} (${isAdmin ? 'Giáo viên' : 'Học sinh'})`;
  }
  if (userSubMeta) {
    userSubMeta.textContent = isAdmin
      ? `@${currentUser.username}`
      : currentUser.className
        ? `Lớp ${currentUser.className} • @${currentUser.username}`
        : `@${currentUser.username}`;
  }
  if (tabExamLabel) {
    tabExamLabel.textContent = isAdmin ? 'Quản lý lớp học' : 'Lớp học của tôi';
  }
  if (menuItemSwitchDemo) {
    menuItemSwitchDemo.classList.toggle('hidden', !isAdmin);
  }
  if (menuItemSwitchAdmin) {
    menuItemSwitchAdmin.classList.toggle('hidden', isAdmin || !canSwitchBackToAdmin);
  }
  if (menuItemStorage) {
    menuItemStorage.classList.toggle('hidden', !isAdmin);
  }
  syncUserMenuStagger();
  if (tabBtnLab) {
    tabBtnLab.classList.toggle('hidden', !isAdmin && modelsVisibilityMode === 'admin_only');
  }
  if (tabBtnSlides) {
    tabBtnSlides.classList.toggle('hidden', !isAdmin);
  }
  if (tabBtnTeachingLog) {
    tabBtnTeachingLog.classList.toggle('hidden', !isAdmin);
  }
  if (tabBtnGradebook) {
    tabBtnGradebook.classList.toggle('hidden', !isAdmin);
  }
  if (tabBtnLiveGame) {
    tabBtnLiveGame.classList.toggle('hidden', !isAdmin);
  }
}

menuItemSwitchDemo?.addEventListener('click', async () => {
  closeUserDropdown();
  if (!currentUser || currentUser.role !== 'admin') return;
  menuItemSwitchDemo.disabled = true;
  try {
    const res = await api.switchToDemoStudent();
    setToken(res.token);
    if (res.modelsVisibilityMode) modelsVisibilityMode = res.modelsVisibilityMode;
    canSwitchBackToAdmin = Boolean(res.canSwitchBackToAdmin);
    showToast(`Đã chuyển sang HS Demo (${res.user.fullName}).`, 'info');
    await enterApp(res.user);
  } catch (err) {
    showToast(err.message || 'Chưa có tài khoản Học sinh Demo.', 'error');
  } finally {
    menuItemSwitchDemo.disabled = false;
  }
});

menuItemSwitchAdmin?.addEventListener('click', async () => {
  closeUserDropdown();
  if (!currentUser || !canSwitchBackToAdmin) return;
  menuItemSwitchAdmin.disabled = true;
  try {
    const res = await api.switchBackToAdmin();
    setToken(res.token);
    if (res.modelsVisibilityMode) modelsVisibilityMode = res.modelsVisibilityMode;
    canSwitchBackToAdmin = Boolean(res.canSwitchBackToAdmin);
    showToast(`Đã chuyển về Giáo viên (${res.user.fullName}).`, 'info');
    await enterApp(res.user);
  } catch (err) {
    showToast(err.message || 'Không thể chuyển về tài khoản Giáo viên.', 'error');
  } finally {
    menuItemSwitchAdmin.disabled = false;
  }
});

function formatBytesVN(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
}

async function openStorageManagerModal() {
  if (!currentUser || currentUser.role !== 'admin') return;

  openModal({
    title: 'Quản lý bộ nhớ Supabase',
    wide: true,
    bodyHtml: `<div style="padding:28px; text-align:center; color:var(--text-muted);">Đang đo dung lượng lưu trữ...</div>`,
    footerHtml: `<button class="btn btn-primary" id="mCloseStorage">Đóng</button>`,
    onMount: async (m) => {
      m.querySelector('#mCloseStorage').addEventListener('click', closeModal);

      async function renderStats(stats) {
        const isCloud = stats.mode === 'supabase';
        const pct = Math.min(100, Number(stats.percentUsed) || 0);
        const barCls = pct >= 85 ? 'is-danger' : pct >= 60 ? 'is-warn' : 'is-ok';
        const bd = stats.breakdown || {};
        const items = stats.items || [];
        const orphans = stats.orphans || { count: 0, bytes: 0 };

        modalBody.innerHTML = `
          <div class="storage-summary-card">
            <div class="storage-summary-top">
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                  <span class="badge ${isCloud ? 'badge-success' : 'badge-neutral'}">
                    ${isCloud ? '● Đang lưu trên Supabase Cloud' : '○ Đang chạy cục bộ (Local)'}
                  </span>
                  <span style="font-size:0.78rem; color:var(--text-muted);">Hạn mức gói miễn phí Supabase: 500 MB</span>
                </div>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${
                  orphans.count > 0
                    ? `<button type="button" class="btn btn-secondary btn-sm" id="btnCleanupOrphans">Dọn ${orphans.count} tệp thừa (${formatBytesVN(orphans.bytes)})</button>`
                    : ''
                }
                <button type="button" class="btn btn-ghost btn-sm" id="btnRefreshStorage">Làm mới</button>
              </div>
            </div>
            ${renderSegmentedStorageMeterHtml(stats, formatBytesVN)}
          </div>

          <div class="storage-breakdown-grid">
            <div class="storage-stat-box u472-card-link" data-u472-key="files">
              <div class="storage-stat-lbl"><span class="u472-dot" style="background:#2563EB;"></span> Tệp đính kèm (PDF, ảnh...)</div>
              <div class="storage-stat-val">${formatBytesVN(bd.files?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.files?.count || 0} tệp</div>
            </div>
            <div class="storage-stat-box u472-card-link" data-u472-key="models">
              <div class="storage-stat-lbl"><span class="u472-dot" style="background:#7C3AED;"></span> Mô hình tương tác (.html)</div>
              <div class="storage-stat-val">${formatBytesVN(bd.models?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.models?.count || 0} mô hình</div>
            </div>
            <div class="storage-stat-box u472-card-link" data-u472-key="exams">
              <div class="storage-stat-lbl"><span class="u472-dot" style="background:#119C72;"></span> Ngân hàng đề thi</div>
              <div class="storage-stat-val">${formatBytesVN(bd.exams?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.exams?.count || 0} đề thi</div>
            </div>
            <div class="storage-stat-box u472-card-link" data-u472-key="other">
              <div class="storage-stat-lbl"><span class="u472-dot" style="background:#F59E0B;"></span> Bài viết, HS &amp; Bài nộp</div>
              <div class="storage-stat-val">${formatBytesVN(bd.other?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.other?.postsCount || 0} bài viết</div>
            </div>
          </div>

          <div class="storage-list-head">
            <strong>Chi tiết tệp &amp; mô hình đang chiếm dung lượng (${items.length})</strong>
            <span style="font-size:0.76rem; color:var(--text-muted);">Xếp từ nặng nhất đến nhẹ nhất</span>
          </div>

          ${
            items.length === 0
              ? `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.86rem; border:1px solid var(--border); border-radius:12px;">Chưa có tệp đính kèm hoặc mô hình HTML nào được tải lên.</div>`
              : `
                <div class="storage-item-list">
                  ${items
                    .map((it) => {
                      const isModel = it.kind === 'model';
                      const ext = isModel ? 'HTML' : (it.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
                      const badgeCls = isModel
                        ? 'file-badge-html'
                        : ext === 'PDF'
                          ? 'file-badge-pdf'
                          : ['MP4', 'WEBM', 'MOV', 'M4V', 'MKV', 'AVI'].includes(ext)
                            ? 'file-badge-vid'
                            : ['MP3', 'WAV', 'M4A', 'OGG', 'AAC'].includes(ext)
                              ? 'file-badge-aud'
                              : ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG', 'BMP'].includes(ext)
                                ? 'file-badge-img'
                                : ['PPT', 'PPTX'].includes(ext)
                                  ? 'file-badge-ppt'
                                  : ['XLS', 'XLSX', 'CSV'].includes(ext)
                                    ? 'file-badge-xls'
                                    : 'file-badge-doc';
                      const subInfo = isModel
                        ? `Mô hình Toán ${escapeHtml(it.grade || '12')} • ${it.visible ? 'Đang hiện' : 'Đang ẩn'}`
                        : it.isOrphan
                          ? `<span style="color:var(--danger); font-weight:700;">Không còn gắn trong bài viết nào (tệp thừa)</span>`
                          : `Đang gắn ở: ${escapeHtml((it.usedIn || []).join(', '))}`;

                      return `
                        <div class="storage-item-row">
                          <span class="file-type-badge ${badgeCls}">${escapeHtml(ext)}</span>
                          <div style="flex:1; min-width:0;">
                            <div class="storage-item-name" title="${escapeAttr(it.name)}">${escapeHtml(it.name)}</div>
                            <div class="storage-item-sub">${subInfo}</div>
                          </div>
                          <div class="storage-item-size">${formatBytesVN(it.storedBytes)}</div>
                          <button
                            type="button"
                            class="btn btn-danger-outline btn-sm"
                            data-storage-del-kind="${it.kind}"
                            data-storage-del-id="${escapeAttr(it.id)}"
                            data-storage-del-name="${escapeAttr(it.name)}"
                          >
                            Xóa
                          </button>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              `
          }

          <p style="margin:12px 0 0; font-size:0.78rem; color:var(--text-muted); line-height:1.5;">
            Lưu ý: Video YouTube chỉ lưu đường link nhúng nên hầu như không tốn bộ nhớ. Tệp PDF/ảnh tải lên Supabase có hệ số mã hóa JSON khoảng 1,34 lần dung lượng gốc — nên ưu tiên nén PDF dưới 5 MB để tiết kiệm không gian lưu trữ.
          </p>
        `;

        bindSegmentedStorageMeter(modalBody, stats, formatBytesVN);
        modalBody.querySelector('#btnRefreshStorage')?.addEventListener('click', loadAndRender);
        modalBody.querySelector('#btnCleanupOrphans')?.addEventListener('click', async () => {
          try {
            const res = await api.cleanupOrphanFiles();
            showToast(`Đã dọn sạch ${res.removedCount} tệp thừa khỏi bộ nhớ!`, 'success');
            await renderStats(res.stats);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        modalBody.querySelectorAll('[data-storage-del-id]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const kind = btn.dataset.storageDelKind;
            const id = btn.dataset.storageDelId;
            const name = btn.dataset.storageDelName;
            if (!window.confirm(`Xóa vĩnh viễn "${name}" khỏi bộ nhớ lưu trữ?`)) return;
            try {
              if (kind === 'model') {
                await api.deleteModel(id);
                showToast(`Đã xóa mô hình "${name}".`, 'success');
                await loadAndRender();
                if (activeRoleCtrl && !examRunner.isTaking()) await activeRoleCtrl.init();
                await labCtrl.init();
              } else {
                const res = await api.deleteFile(id);
                showToast(`Đã xóa tệp "${name}" khỏi bộ nhớ.`, 'success');
                await renderStats(res.stats);
                if (activeRoleCtrl && !examRunner.isTaking()) await activeRoleCtrl.init();
              }
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      }

      async function loadAndRender() {
        try {
          const stats = await api.getStorageStats();
          await renderStats(stats);
        } catch (err) {
          modalBody.innerHTML = `<div style="padding:20px; color:var(--danger);">${escapeHtml(err.message)}</div>`;
        }
      }

      await loadAndRender();
    },
  });
}

menuItemStorage?.addEventListener('click', () => {
  closeUserDropdown();
  openStorageManagerModal();
});

const PRESET_ANIMAL_AVATARS = [
  { id: 'cat', label: 'Mèo cam', url: '/assets/avatars/cat.svg' },
  { id: 'shiba', label: 'Cún Shiba', url: '/assets/avatars/shiba.svg' },
  { id: 'bunny', label: 'Thỏ trắng', url: '/assets/avatars/bunny.svg' },
  { id: 'panda', label: 'Gấu trúc', url: '/assets/avatars/panda.svg' },
  { id: 'fox', label: 'Cáo nhỏ', url: '/assets/avatars/fox.svg' },
  { id: 'koala', label: 'Koala', url: '/assets/avatars/koala.svg' },
  { id: 'penguin', label: 'Cánh cụt', url: '/assets/avatars/penguin.svg' },
  { id: 'capybara', label: 'Capybara', url: '/assets/avatars/capybara.svg' },
  { id: 'hamster', label: 'Hamster', url: '/assets/avatars/hamster.svg' },
  { id: 'owl', label: 'Cú mèo', url: '/assets/avatars/owl.svg' },
];

function isPresetAvatarUrl(url) {
  return PRESET_ANIMAL_AVATARS.some((a) => a.url === url);
}

menuItemProfile?.addEventListener('click', () => {
  closeUserDropdown();
  if (!currentUser) return;
  const u = currentUser;
  const isStudent = u.role === 'student';
  let draftAvatarUrl = String(u.avatarUrl || '').trim();
  let lastPickedAvatarFile = null;
  let activeCropper = null;
  const initials = computeAvatarInitials(u.fullName || u.username);
  const initIsPreset = isPresetAvatarUrl(draftAvatarUrl);

  openModal({
    title: 'Hồ sơ cá nhân',
    wide: true,
    bodyHtml: `
      <form id="formGlobalProfile">
        <div id="gProfAvatarDefaultRow">
          <div class="prof-avatar-box">
            <div class="prof-avatar-preview-col">
              <div class="prof-avatar-circle ${isStudent ? '' : 'is-admin'}" id="gProfAvPreview">
                ${
                  draftAvatarUrl
                    ? `<img src="${escapeAttr(avatarDisplaySrc(draftAvatarUrl))}" alt="Ảnh đại diện" />`
                    : `<span>${escapeHtml(initials)}</span>`
                }
              </div>
              <div id="gProfAvMeta" class="prof-avatar-meta">
                ${
                  initIsPreset
                    ? `Avatar: ${escapeHtml(PRESET_ANIMAL_AVATARS.find((a) => a.url === draftAvatarUrl)?.label || 'Có sẵn')}`
                    : draftAvatarUrl
                      ? 'Ảnh đại diện hiện tại'
                      : 'Chưa đặt ảnh đại diện'
                }
              </div>
              <div class="prof-avatar-btns">
                <button type="button" class="btn btn-secondary btn-sm ${draftAvatarUrl && !initIsPreset ? '' : 'hidden'}" id="btnCropGProfAv">
                  Căn chỉnh ảnh
                </button>
                <button type="button" class="btn btn-ghost btn-sm ${draftAvatarUrl ? '' : 'hidden'}" id="btnClearGProfAv">
                  Gỡ ảnh
                </button>
              </div>
            </div>
            <div class="prof-avatar-drop-col">
              <div id="gProfAvatarDrop"></div>
            </div>
          </div>

          <div class="prof-preset-box">
            <div class="prof-preset-head">
              <strong>Hoặc chọn nhanh avatar con vật dễ thương</strong>
              <span>10 mẫu có sẵn</span>
            </div>
            <div class="prof-preset-grid" id="gProfPresetGrid" role="radiogroup" aria-label="Chọn ảnh đại diện con vật có sẵn">
              ${PRESET_ANIMAL_AVATARS.map((av) => {
                const active = draftAvatarUrl === av.url;
                return `
                  <button
                    type="button"
                    class="prof-preset-item ${active ? 'is-active' : ''}"
                    data-preset-av="${escapeAttr(av.url)}"
                    data-preset-label="${escapeAttr(av.label)}"
                    role="radio"
                    aria-checked="${active ? 'true' : 'false'}"
                    title="${escapeAttr(av.label)}"
                  >
                    <span class="prof-preset-img-wrap">
                      <img src="${escapeAttr(avatarDisplaySrc(av.url))}" alt="${escapeAttr(av.label)}" loading="lazy" />
                      <span class="prof-preset-check" aria-hidden="true">✓</span>
                    </span>
                    <span class="prof-preset-lbl">${escapeHtml(av.label)}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div id="gProfAvatarCropperHost" class="prof-cropper-host hidden"></div>

        <div id="gProfFieldsWrap">
          <div class="form-row-2">
            <div class="form-group">
              <label>Tên đăng nhập</label>
              <input class="input-control" value="${escapeAttr(u.username)}" disabled />
            </div>
            <div class="form-group">
              <label>${isStudent ? 'Số báo danh / Mã HS' : 'Mã giáo viên'}</label>
              <input id="gProfCode" class="input-control" value="${escapeAttr(u.studentCode || '')}" placeholder="${isStudent ? 'Chưa có' : 'VD: GV001'}" ${isStudent ? 'disabled title="Chỉ giáo viên mới có quyền chỉnh sửa"' : ''} />
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>Họ và tên *</label>
              <input id="gProfFullName" class="input-control" value="${escapeAttr(u.fullName || '')}" required />
            </div>
            <div class="form-group">
              <label>${isStudent ? 'Lớp' : 'Tổ chuyên môn / Đơn vị'}</label>
              <input id="gProfClass" class="input-control" value="${escapeAttr(u.className || '')}" placeholder="${isStudent ? 'Chưa xếp lớp' : 'VD: Tổ Toán'}" ${isStudent ? 'disabled title="Chỉ giáo viên mới có quyền chỉnh sửa"' : ''} />
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>Ngày sinh (dd/mm/yyyy)</label>
              <input id="gProfDob" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(formatDateOnlyVN(u.dob || ''))}" />
            </div>
            <div class="form-group">
              <label>Số điện thoại</label>
              <input id="gProfPhone" class="input-control" value="${escapeAttr(u.phone || '')}" placeholder="09xxxxxxxx" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Email</label>
            <input id="gProfEmail" type="email" class="input-control" value="${escapeAttr(u.email || '')}" placeholder="email@school.vn" />
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" id="mCancelGProf">Hủy</button>
      <button class="btn btn-primary" id="mSaveGProf">Lưu thông tin</button>
    `,
    onMount: (m) => {
      const defaultRow = m.querySelector('#gProfAvatarDefaultRow');
      const fieldsWrap = m.querySelector('#gProfFieldsWrap');
      const cropperHost = m.querySelector('#gProfAvatarCropperHost');
      const avPreviewEl = m.querySelector('#gProfAvPreview');
      const avMetaEl = m.querySelector('#gProfAvMeta');
      const cropAvBtn = m.querySelector('#btnCropGProfAv');
      const clearAvBtn = m.querySelector('#btnClearGProfAv');

      function closeCropperView() {
        if (activeCropper) {
          activeCropper.cleanup();
          activeCropper = null;
        }
        if (cropperHost) {
          cropperHost.innerHTML = '';
          cropperHost.classList.add('hidden');
        }
        modalCard.classList.remove('modal-cropper-only');
        defaultRow?.classList.remove('hidden');
        fieldsWrap?.classList.remove('hidden');
        modalFooter.classList.remove('hidden');
      }

      function openCropperView(source) {
        if (!cropperHost) return;
        if (activeCropper) {
          activeCropper.cleanup();
          activeCropper = null;
        }
        defaultRow?.classList.add('hidden');
        fieldsWrap?.classList.add('hidden');
        modalFooter.classList.add('hidden');
        modalCard.classList.add('modal-cropper-only');
        cropperHost.classList.remove('hidden');
        modalBody.scrollTop = 0;
        const curName = m.querySelector('#gProfFullName')?.value?.trim() || u.fullName || u.username;
        activeCropper = mountAvatarCropper(cropperHost, {
          source,
          initialPreviewUrl: draftAvatarUrl,
          initials: computeAvatarInitials(curName),
          isAdmin: !isStudent,
          onApply: (croppedDataUrl) => {
            if (croppedDataUrl) {
              draftAvatarUrl = croppedDataUrl;
              syncAvatarPreview();
            }
            closeCropperView();
          },
          onCancel: () => {
            closeCropperView();
          },
          onError: (err) => {
            showToast(err?.message || 'Không thể xử lý ảnh đại diện.', 'error');
            closeCropperView();
          },
        });
      }

      function syncAvatarPreview(metaNote = '') {
        const matchedPreset = PRESET_ANIMAL_AVATARS.find((a) => a.url === draftAvatarUrl) || null;
        m.querySelectorAll('[data-preset-av]').forEach((btn) => {
          const isSel = btn.dataset.presetAv === draftAvatarUrl;
          btn.classList.toggle('is-active', isSel);
          btn.setAttribute('aria-checked', String(isSel));
        });

        if (draftAvatarUrl) {
          avPreviewEl.innerHTML = `<img src="${escapeAttr(avatarDisplaySrc(draftAvatarUrl))}" alt="Ảnh đại diện" />`;
          cropAvBtn?.classList.toggle('hidden', Boolean(matchedPreset));
          clearAvBtn?.classList.remove('hidden');
          if (matchedPreset) {
            avMetaEl.textContent = metaNote || `Đã chọn: ${matchedPreset.label}`;
          } else {
            const kb = Math.max(1, Math.round((draftAvatarUrl.length * 0.75) / 1024));
            avMetaEl.textContent = metaNote || `Đã cắt tròn & nén (~${kb} KB)`;
          }
        } else {
          const curName = m.querySelector('#gProfFullName')?.value?.trim() || u.fullName || u.username;
          avPreviewEl.innerHTML = `<span>${escapeHtml(computeAvatarInitials(curName))}</span>`;
          cropAvBtn?.classList.add('hidden');
          clearAvBtn?.classList.add('hidden');
          avMetaEl.textContent = 'Đang dùng chữ cái viết tắt';
        }
      }

      m.querySelectorAll('[data-preset-av]').forEach((btn) => {
        btn.addEventListener('click', () => {
          draftAvatarUrl = btn.dataset.presetAv || '';
          lastPickedAvatarFile = null;
          syncAvatarPreview();
        });
      });

      mountAnimatedDropzone(m.querySelector('#gProfAvatarDrop'), {
        inputId: 'inpGProfAvatar',
        accept: 'image/*',
        compact: true,
        idleTitle: 'Kéo thả ảnh đại diện vào đây',
        dragTitle: 'Thả ảnh để mở khung căn chỉnh tròn',
        subNote: 'ảnh nặng tùy ý · căn chỉnh & nén gọn',
        maxBytes: null,
        onProcess: async (file) => {
          if (file.type && !file.type.startsWith('image/')) {
            throw new Error('Vui lòng chọn tệp hình ảnh (JPG, PNG, WebP...).');
          }
          return file;
        },
        onComplete: (file) => {
          lastPickedAvatarFile = file;
          openCropperView(file);
        },
        onError: (err) => showToast(err?.message || 'Không thể xử lý ảnh đại diện.', 'error'),
      });

      cropAvBtn?.addEventListener('click', () => {
        const src = lastPickedAvatarFile || draftAvatarUrl;
        if (src) openCropperView(src);
      });

      clearAvBtn?.addEventListener('click', () => {
        draftAvatarUrl = '';
        lastPickedAvatarFile = null;
        syncAvatarPreview();
      });

      m.querySelector('#mCancelGProf').addEventListener('click', () => {
        closeCropperView();
        closeModal();
      });
      const saveProf = async () => {
        if (activeCropper) {
          const autoCropped = activeCropper.exportCroppedDataUrl(160);
          if (autoCropped) draftAvatarUrl = autoCropped;
          closeCropperView();
        }
        const fullName = m.querySelector('#gProfFullName').value.trim();
        if (!fullName) {
          showToast('Họ và tên không được để trống.', 'error');
          return;
        }
        let dobIso = '';
        try {
          dobIso = parseVnDateOnlyToIso(m.querySelector('#gProfDob').value, 'Ngày sinh');
        } catch (err) {
          showToast(err.message, 'error');
          return;
        }
        try {
          const payload = {
            fullName,
            dob: dobIso,
            phone: m.querySelector('#gProfPhone').value.trim(),
            email: m.querySelector('#gProfEmail').value.trim(),
            avatarUrl: draftAvatarUrl,
          };
          if (!isStudent) {
            payload.className = m.querySelector('#gProfClass').value.trim();
            payload.studentCode = m.querySelector('#gProfCode').value.trim();
          }
          const res = await api.updateProfile(payload);
          currentUser = res.user;
          updateUserHeader();
          closeModal();
          showToast('Đã cập nhật hồ sơ cá nhân!', 'success');
          if (activeRoleCtrl && !examRunner.isTaking()) {
            await activeRoleCtrl.init();
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      m.querySelector('#mSaveGProf').addEventListener('click', saveProf);
      m.querySelector('#formGlobalProfile').addEventListener('submit', (e) => {
        e.preventDefault();
        saveProf();
      });
    },
  });
});

menuItemChangePw?.addEventListener('click', () => {
  closeUserDropdown();
  openModal({
    title: 'Đổi mật khẩu đăng nhập',
    bodyHtml: `
      <form id="formGlobalChangePw">
        <div class="form-group">
          <label for="gPwCurrent">Mật khẩu hiện tại *</label>
          <input id="gPwCurrent" type="password" class="input-control" placeholder="Nhập mật khẩu đang dùng" required />
        </div>
        <div class="form-group">
          <label for="gPwNew">Mật khẩu mới *</label>
          <input id="gPwNew" type="password" class="input-control" placeholder="Tối thiểu 4 ký tự" required />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="gPwConfirm">Nhập lại mật khẩu mới *</label>
          <input id="gPwConfirm" type="password" class="input-control" placeholder="Nhập khớp mật khẩu mới" required />
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" id="mCancelGPw">Hủy</button>
      <button class="btn btn-primary" id="mSaveGPw">Cập nhật mật khẩu</button>
    `,
    onMount: (m) => {
      m.querySelector('#mCancelGPw').addEventListener('click', closeModal);
      const submitPw = async () => {
        const cur = m.querySelector('#gPwCurrent').value;
        const nw = m.querySelector('#gPwNew').value;
        const cf = m.querySelector('#gPwConfirm').value;
        if (!cur || !nw) {
          showToast('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.', 'error');
          return;
        }
        if (nw !== cf) {
          showToast('Mật khẩu mới nhập lại không khớp.', 'error');
          return;
        }
        try {
          await api.changePassword(cur, nw);
          closeModal();
          showToast('Đổi mật khẩu thành công!', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      m.querySelector('#mSaveGPw').addEventListener('click', submitPw);
      m.querySelector('#formGlobalChangePw').addEventListener('submit', (e) => {
        e.preventDefault();
        submitPw();
      });
    },
  });
});

function setLoginPasswordVisible(visible) {
  if (!loginPassword || !btnToggleLoginPw) return;
  loginPassword.type = visible ? 'text' : 'password';
  btnToggleLoginPw.querySelector('.pw-icon-show')?.classList.toggle('hidden', visible);
  btnToggleLoginPw.querySelector('.pw-icon-hide')?.classList.toggle('hidden', !visible);
  const lbl = visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
  btnToggleLoginPw.setAttribute('aria-label', lbl);
  btnToggleLoginPw.setAttribute('title', lbl);
}

btnToggleLoginPw?.addEventListener('click', () => {
  setLoginPasswordVisible(loginPassword.type === 'password');
});

function configureAuthMode(quickAdminOnly) {
  if (quickAdminOnly) {
    authQuickBadge?.classList.remove('hidden');
    if (authTitleText) authTitleText.textContent = 'Truy cập nhanh Sổ báo giảng';
    loginUsernameGroup?.classList.add('hidden');
    loginUsername.value = 'admin';
    if (loginPasswordLabel) loginPasswordLabel.textContent = 'Mật khẩu Giáo viên (Admin)';
    loginPassword.placeholder = 'Nhập mật khẩu quản trị...';
    if (btnLoginSubmit) btnLoginSubmit.textContent = 'Vào Sổ báo giảng →';
    authQuickSwitchWrap?.classList.remove('hidden');
    document.title = 'Sổ báo giảng — Lớp toán thầy Hoàng';
    setTimeout(() => loginPassword?.focus(), 40);
  } else {
    authQuickBadge?.classList.add('hidden');
    if (authTitleText) authTitleText.textContent = 'Đăng nhập hệ thống';
    loginUsernameGroup?.classList.remove('hidden');
    if (loginUsername.value === 'admin') loginUsername.value = '';
    if (loginPasswordLabel) loginPasswordLabel.textContent = 'Mật khẩu';
    loginPassword.placeholder = 'Nhập mật khẩu';
    if (btnLoginSubmit) btnLoginSubmit.textContent = 'Đăng nhập';
    authQuickSwitchWrap?.classList.add('hidden');
  }
}

btnSwitchFullLogin?.addEventListener('click', () => {
  configureAuthMode(false);
  loginUsername?.focus();
});

function showAuthScreen() {
  examRunner.cleanup();
  labCtrl.reset();
  const examRootEl = document.getElementById('examRoot');
  if (examRootEl) examRootEl.innerHTML = '';
  const tlRootEl = document.getElementById('teachingLogRoot');
  if (tlRootEl) tlRootEl.innerHTML = '';
  const gbRootEl = document.getElementById('gradebookRoot');
  if (gbRootEl) gbRootEl.innerHTML = '';
  const lgRootEl = document.getElementById('liveGameRoot');
  if (lgRootEl) lgRootEl.innerHTML = '';
  currentUser = null;
  activeRoleCtrl = null;
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginError.classList.add('hidden');
  loginPassword.value = '';
  setLoginPasswordVisible(false);

  const route = parseRouteFromLocation();
  configureAuthMode(route.tab === 'teaching-log');
}

async function enterApp(user) {
  labCtrl.reset();
  currentUser = user;
  updateUserHeader();
  updateLabTabLock();
  setHeaderStatus('');
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');

  if (user.role === 'admin') {
    activeRoleCtrl = teacherCtrl;
  } else {
    activeRoleCtrl = studentCtrl;
  }

  const initialRoute = parseRouteFromLocation();
  if (initialRoute.tab === 'live-game' && user.role === 'admin') {
    switchTab('live-game', { updateUrl: true, replaceUrl: true, routeOpts: initialRoute });
    activeRoleCtrl.init();
  } else if (initialRoute.tab === 'gradebook' && user.role === 'admin') {
    switchTab('gradebook', { updateUrl: true, replaceUrl: true, routeOpts: initialRoute });
    activeRoleCtrl.init();
  } else if (initialRoute.tab === 'teaching-log' && user.role === 'admin') {
    switchTab('teaching-log', { updateUrl: true, replaceUrl: true, routeOpts: initialRoute });
    activeRoleCtrl.init();
  } else if (initialRoute.tab === 'lab') {
    switchTab('lab', { updateUrl: true, replaceUrl: true, routeOpts: initialRoute });
    // Preload classroom dashboard quietly so switching back to /lop-hoc is instant
    activeRoleCtrl.init();
  } else {
    switchTab('exam', { updateUrl: true, replaceUrl: true });
    await activeRoleCtrl.goHome();
  }
}

// Login Form (#403 Sign-in feedback: shake + red sweep on error, shrink -> check on success)
const authCardEl = authScreen?.querySelector('.auth-card');
const loginBaseBtnText = () => btnLoginSubmit?.dataset.baseLabel || btnLoginSubmit?.textContent || 'Đăng nhập';

function resetLoginVisualState() {
  if (btnLoginSubmit) {
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.classList.remove('u403-loading', 'u403-ok');
    if (btnLoginSubmit.dataset.baseLabel) {
      btnLoginSubmit.textContent = btnLoginSubmit.dataset.baseLabel;
    }
  }
  authCardEl?.classList.remove('u403-shake', 'u403-has-err');
}

loginPassword?.addEventListener('input', () => {
  authCardEl?.classList.remove('u403-has-err');
});
loginUsername?.addEventListener('input', () => {
  authCardEl?.classList.remove('u403-has-err');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (btnLoginSubmit?.disabled) return;
  loginError.classList.add('hidden');
  authCardEl?.classList.remove('u403-shake', 'u403-has-err');

  const u = loginUsername.value.trim();
  const p = loginPassword.value;
  if (btnLoginSubmit) {
    if (!btnLoginSubmit.dataset.baseLabel || !btnLoginSubmit.classList.contains('u403-ok')) {
      btnLoginSubmit.dataset.baseLabel = btnLoginSubmit.textContent.trim() || 'Đăng nhập';
    }
    btnLoginSubmit.disabled = true;
  }

  try {
    const res = await api.login(u, p);
    setToken(res.token);
    if (res.modelsVisibilityMode) modelsVisibilityMode = res.modelsVisibilityMode;
    canSwitchBackToAdmin = Boolean(res.canSwitchBackToAdmin);

    if (btnLoginSubmit) {
      btnLoginSubmit.classList.add('u403-ok');
      btnLoginSubmit.innerHTML = `<svg class="u403-chk" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7.5"/></svg>`;
    }
    const rm = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    await new Promise((r) => setTimeout(r, rm ? 60 : 480));
    resetLoginVisualState();
    showToast(`Đăng nhập thành công! Chào mừng ${res.user.fullName}.`, 'success');
    await enterApp(res.user);
  } catch (err) {
    if (btnLoginSubmit) btnLoginSubmit.disabled = false;
    loginError.textContent = err.message || 'Đăng nhập thất bại.';
    loginError.classList.remove('hidden');
    if (authCardEl) {
      authCardEl.classList.add('u403-has-err');
      void authCardEl.offsetWidth;
      authCardEl.classList.add('u403-shake');
      setTimeout(() => authCardEl.classList.remove('u403-shake'), 520);
    }
    loginPassword?.focus();
    loginPassword?.select?.();
  }
});

// Logout
menuItemLogout?.addEventListener('click', async () => {
  closeUserDropdown();
  try {
    await api.logout();
  } catch {
    // ignore
  }
  setToken('');
  canSwitchBackToAdmin = false;
  showToast('Đã đăng xuất khỏi hệ thống.');
  showAuthScreen();
});

// Modern Floating Overlay Scrollbar (0px layout footprint, macOS-style pill)
function initFloatingScrollbar() {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    return;
  }
  const rail = document.createElement('div');
  rail.className = 'floating-scrollbar';
  rail.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'floating-scrollbar-thumb';
  rail.appendChild(thumb);
  document.body.appendChild(rail);

  let hideTimer = null;
  let rafPending = false;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;
  let currentMaxScroll = 0;
  let currentMaxThumbTop = 0;

  function showTemporarily() {
    if (currentMaxScroll <= 2) return;
    rail.classList.add('is-visible');
    clearTimeout(hideTimer);
    if (!dragging) {
      hideTimer = setTimeout(() => {
        if (!dragging) rail.classList.remove('is-visible');
      }, 1100);
    }
  }

  function syncGeometry() {
    rafPending = false;
    const doc = document.documentElement;
    const viewH = window.innerHeight;
    const scrollH = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const maxScroll = Math.max(0, scrollH - viewH);
    currentMaxScroll = maxScroll;

    if (maxScroll <= 2) {
      rail.classList.remove('is-scrollable', 'is-visible');
      return;
    }

    rail.classList.add('is-scrollable');
    const railH = Math.max(40, rail.clientHeight || viewH - 8);
    const thumbH = Math.max(40, Math.min(railH * 0.85, Math.round((viewH / scrollH) * railH)));
    const maxTop = Math.max(1, railH - thumbH);
    currentMaxThumbTop = maxTop;

    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const ratio = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const topPx = Math.round(ratio * maxTop);

    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translate3d(0, ${topPx}px, 0)`;
  }

  function scheduleSync(reveal = false) {
    if (reveal) showTemporarily();
    if (!rafPending) {
      rafPending = true;
      window.requestAnimationFrame(syncGeometry);
    }
  }

  window.addEventListener('scroll', () => scheduleSync(true), { passive: true });
  window.addEventListener('resize', () => scheduleSync(false), { passive: true });

  // Reveal gently when pointer moves near right edge of viewport
  window.addEventListener(
    'mousemove',
    (e) => {
      if (currentMaxScroll > 2 && window.innerWidth - e.clientX <= 28) {
        showTemporarily();
      }
    },
    { passive: true }
  );

  // Dragging the floating thumb
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    dragStartY = e.clientY;
    dragStartScroll = window.scrollY || document.documentElement.scrollTop || 0;
    rail.classList.add('is-dragging', 'is-visible');
    clearTimeout(hideTimer);
    thumb.setPointerCapture?.(e.pointerId);
  });

  thumb.addEventListener('pointermove', (e) => {
    if (!dragging || currentMaxThumbTop <= 0) return;
    const dy = e.clientY - dragStartY;
    const nextScroll = dragStartScroll + (dy / currentMaxThumbTop) * currentMaxScroll;
    window.scrollTo({ top: Math.max(0, Math.min(currentMaxScroll, nextScroll)), behavior: 'auto' });
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('is-dragging');
    showTemporarily();
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);

  // Clicking on the floating rail jumps to that region
  rail.addEventListener('pointerdown', (e) => {
    if (e.target === thumb || currentMaxScroll <= 0) return;
    const rect = rail.getBoundingClientRect();
    const clickRatio = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
    window.scrollTo({ top: clickRatio * currentMaxScroll, behavior: 'smooth' });
    showTemporarily();
  });

  if (typeof window.ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => scheduleSync(false));
    ro.observe(document.body);
  }
  scheduleSync(false);
}

initFloatingScrollbar();

// Boot session check
async function boot() {
  try {
    const res = await api.me();
    if (res.modelsVisibilityMode) modelsVisibilityMode = res.modelsVisibilityMode;
    canSwitchBackToAdmin = Boolean(res.canSwitchBackToAdmin);
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
