import { api, setToken } from './api.js?v=20261123l';
import { createExamRunner } from './exam-runner.js?v=20261123d';
import { createTeacherController } from './teacher-ui.js?v=20261123d';
import { createStudentController } from './student-ui.js?v=20261123d';
import { createHtmlLabController } from './html-lab.js?v=20261123l';
import { createTeachingLogController } from './teaching-log.js?v=20261123o';
import { escapeHtml, escapeAttr, formatDateOnlyVN, parseVnDateOnlyToIso } from './exam-engine.js?v=20261123d';

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

function openModal({ title, bodyHtml, footerHtml = '', wide = false, xl = false, dismissible = true, onMount }) {
  modalDismissible = dismissible;
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFooter.innerHTML = footerHtml;
  modalCard.classList.toggle('modal-wide', Boolean(wide) && !xl);
  modalCard.classList.toggle('modal-xl', Boolean(xl));
  modalCloseBtn.classList.toggle('hidden', !dismissible);
  modalBackdrop.classList.remove('hidden');
  if (typeof onMount === 'function') onMount(modalCard);
}

function closeModal() {
  modalDismissible = true;
  modalCard.classList.remove('modal-wide', 'modal-xl');
  modalCloseBtn.classList.remove('hidden');
  modalBackdrop.classList.add('hidden');
}

modalCloseBtn.addEventListener('click', () => {
  if (modalDismissible) closeModal();
});
// Backdrop click intentionally disabled: modals only close via explicit buttons (✕ / Hủy / Đóng) or Escape key
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
  openStorageModal: () => openStorageManagerModal(),
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

function parseRouteFromLocation() {
  const raw = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
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
  if (window.location.pathname === norm) return;
  if (replace) window.history.replaceState({ path: norm }, '', norm);
  else window.history.pushState({ path: norm }, '', norm);
}

let modelsVisibilityMode = 'all_grades';

const labCtrl = createHtmlLabController({
  rootEl: document.getElementById('labRoot'),
  uiHelpers,
  getUser: () => currentUser,
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

// 3-Tab Navigation (Tab 3 Admin-only) + Clean History API URL Routing (/lop-hoc, /mo-hinh, /so-bao-giang)
const tabButtons = document.querySelectorAll('.main-tab');
const tabBtnLab = document.getElementById('tabBtnLab');
const tabBtnTeachingLog = document.getElementById('tabBtnTeachingLog');
const tabExamLabel = document.getElementById('tabExamLabel');
const panels = {
  exam: document.getElementById('panel-exam'),
  lab: document.getElementById('panel-lab'),
  'teaching-log': document.getElementById('panel-teaching-log'),
};

function updateLabTabLock() {
  if (!tabBtnLab) return;
  tabBtnLab.classList.remove('is-locked');
  tabBtnLab.title = 'Mô hình tương tác';
  tabBtnLab.querySelector('.tab-lock-icon')?.remove();
}

function updateDocumentTitle(tabName) {
  if (tabName === 'teaching-log') {
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
  // Guard Admin-only Sổ báo giảng tab
  if (tabName === 'teaching-log' && currentUser?.role !== 'admin') {
    tabName = 'exam';
  }
  // Guard Mô hình tương tác when visibility is set to Admin-only
  if (tabName === 'lab' && currentUser?.role !== 'admin' && modelsVisibilityMode === 'admin_only') {
    tabName = 'exam';
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
  updateDocumentTitle(tabName);

  if (tabName === 'teaching-log') {
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

function closeUserDropdown() {
  if (!userDropdown) return;
  userDropdown.classList.add('hidden');
  userMenuTrigger?.setAttribute('aria-expanded', 'false');
  userMenuWrap?.classList.remove('open');
}

function toggleUserDropdown() {
  if (!userDropdown) return;
  const willOpen = userDropdown.classList.contains('hidden');
  userDropdown.classList.toggle('hidden', !willOpen);
  userMenuTrigger?.setAttribute('aria-expanded', String(willOpen));
  userMenuWrap?.classList.toggle('open', willOpen);
}

userMenuTrigger?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleUserDropdown();
});

document.addEventListener('click', (e) => {
  if (userMenuWrap && !userMenuWrap.contains(e.target)) {
    closeUserDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserDropdown();
});

function updateUserHeader() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  userRoleBadge.textContent = isAdmin ? 'Giáo viên' : 'Học sinh';
  userRoleBadge.className = `badge ${isAdmin ? 'badge-p2' : 'badge-p1'}`;
  userNameText.textContent = currentUser.fullName || currentUser.username;
  if (tabExamLabel) {
    tabExamLabel.textContent = isAdmin ? 'Quản lý lớp học' : 'Lớp học của tôi';
  }
  if (menuItemStorage) {
    menuItemStorage.classList.toggle('hidden', !isAdmin);
  }
  if (tabBtnLab) {
    tabBtnLab.classList.toggle('hidden', !isAdmin && modelsVisibilityMode === 'admin_only');
  }
  if (tabBtnTeachingLog) {
    tabBtnTeachingLog.classList.toggle('hidden', !isAdmin);
  }
}

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
                <div class="storage-big-num">
                  <strong>${formatBytesVN(stats.totalBytes)}</strong>
                  <span>/ 500 MB (${String(pct).replace('.', ',')}%)</span>
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
            <div class="storage-bar-track">
              <div class="storage-bar-fill ${barCls}" style="width:${Math.max(pct, stats.totalBytes > 0 ? 1.5 : 0)}%;"></div>
            </div>
          </div>

          <div class="storage-breakdown-grid">
            <div class="storage-stat-box">
              <div class="storage-stat-lbl">Tệp đính kèm (PDF, ảnh...)</div>
              <div class="storage-stat-val">${formatBytesVN(bd.files?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.files?.count || 0} tệp</div>
            </div>
            <div class="storage-stat-box">
              <div class="storage-stat-lbl">Mô hình tương tác (.html)</div>
              <div class="storage-stat-val">${formatBytesVN(bd.models?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.models?.count || 0} mô hình</div>
            </div>
            <div class="storage-stat-box">
              <div class="storage-stat-lbl">Ngân hàng đề thi</div>
              <div class="storage-stat-val">${formatBytesVN(bd.exams?.bytes || 0)}</div>
              <div class="storage-stat-sub">${bd.exams?.count || 0} đề thi</div>
            </div>
            <div class="storage-stat-box">
              <div class="storage-stat-lbl">Bài viết, HS &amp; Bài nộp</div>
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

menuItemProfile?.addEventListener('click', () => {
  closeUserDropdown();
  if (!currentUser) return;
  const u = currentUser;
  const isStudent = u.role === 'student';

  openModal({
    title: 'Hồ sơ cá nhân',
    bodyHtml: `
      <form id="formGlobalProfile">
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
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" id="mCancelGProf">Hủy</button>
      <button class="btn btn-primary" id="mSaveGProf">Lưu thông tin</button>
    `,
    onMount: (m) => {
      m.querySelector('#mCancelGProf').addEventListener('click', closeModal);
      const saveProf = async () => {
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
  if (initialRoute.tab === 'teaching-log' && user.role === 'admin') {
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

// Login Form
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const u = loginUsername.value.trim();
  const p = loginPassword.value;
  try {
    const res = await api.login(u, p);
    setToken(res.token);
    if (res.modelsVisibilityMode) modelsVisibilityMode = res.modelsVisibilityMode;
    showToast(`Đăng nhập thành công! Chào mừng ${res.user.fullName}.`, 'success');
    await enterApp(res.user);
  } catch (err) {
    loginError.textContent = err.message || 'Đăng nhập thất bại.';
    loginError.classList.remove('hidden');
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
