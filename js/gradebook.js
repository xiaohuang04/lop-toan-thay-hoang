import { api } from './api.js?v=20261124m';
import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';
import { extractGradebookFromPdfFile, formatDobVNAdmin } from './pdf-reader.js?v=20261124o';
import { mountAnimatedDropzone } from './ux-dropzone.js?v=20261124z';
import { renderMorphBarChartHtml, bindMorphBarChart } from './ux-effects.js?v=20261125g';

function getColumnsForTerm(term) {
  const numTx = Number(term) === 2 ? 5 : 4;
  const cols = [];
  for (let i = 1; i <= numTx; i++) {
    cols.push({ key: `tx${i}`, label: `TX${i}`, shortLabel: `TX${i}`, weight: 1, group: 'tx' });
  }
  cols.push({ key: 'gk', label: 'ĐĐGgk', shortLabel: 'GK', weight: 2, group: 'gk' });
  cols.push({ key: 'ck', label: 'ĐĐGck', shortLabel: 'CK', weight: 3, group: 'ck' });
  return cols;
}

function normalizeNameKey(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseScoreInput(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return { valid: true, value: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return { valid: false, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 10) return { valid: false, value: null };
  return { valid: true, value: Math.round(n * 100) / 100 };
}

function formatScoreCell(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function formatAvgScore(val) {
  if (val === null || val === undefined) return '';
  return Number(val).toFixed(1);
}

function normalizeCell(cell) {
  if (cell === null || cell === undefined || cell === '') return null;
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return { val: cell, draft: false, adjusted: false, origVal: null };
  }
  if (typeof cell === 'object') {
    if (cell.val !== null && cell.val !== undefined && cell.val !== '') {
      const n = Number(cell.val);
      if (Number.isFinite(n)) {
        const hasOrig = cell.origVal !== undefined && cell.origVal !== null && cell.origVal !== '' && Number.isFinite(Number(cell.origVal));
        return {
          val: n,
          draft: Boolean(cell.draft),
          adjusted: Boolean(cell.adjusted),
          origVal: hasOrig ? Number(cell.origVal) : null,
        };
      }
    } else if (cell.draft) {
      return { val: null, draft: true, adjusted: false, origVal: null };
    }
  }
  return null;
}

/**
 * Compute both averages per MOET Circular 22/2021:
 * - avgDraft (ĐTBmhk*): includes ALL non-null scores (official + red draft).
 * - avgOfficial (ĐTBmhk): includes ONLY non-draft (official) scores.
 * Rule: 0 scores -> null (blank); >= 1 score -> weighted average rounded to 1 decimal.
 */
function computeStudentAverages(student, term) {
  const cols = getColumnsForTerm(term);
  const termMap = (student?.scores && student.scores[String(term)]) || {};

  let sumAll = 0;
  let wAll = 0;
  let sumOff = 0;
  let wOff = 0;
  let draftCount = 0;

  for (const col of cols) {
    const cell = normalizeCell(termMap[col.key]);
    if (!cell || cell.val === null) continue;
    sumAll += cell.val * col.weight;
    wAll += col.weight;
    if (cell.draft) {
      draftCount += 1;
    } else {
      sumOff += cell.val * col.weight;
      wOff += col.weight;
    }
  }

  return {
    avgDraft: wAll > 0 ? Math.round((sumAll / wAll) * 10) / 10 : null,
    avgOfficial: wOff > 0 ? Math.round((sumOff / wOff) * 10) / 10 : null,
    draftCount,
  };
}

function getScoreTierClass(avg) {
  if (avg === null || avg === undefined) return '';
  if (avg >= 8.0) return 'is-good';
  if (avg >= 6.5) return 'is-fair';
  if (avg >= 5.0) return 'is-pass';
  return 'is-low';
}

function getScoreTierInfo(val) {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return { key: 'none', label: '—', short: '—', cls: '' };
  }
  const n = Number(val);
  if (n >= 8.0) return { key: 'good', label: 'Tốt', short: 'Tốt', cls: 'is-good' };
  if (n >= 6.5) return { key: 'fair', label: 'Khá', short: 'Khá', cls: 'is-fair' };
  if (n >= 5.0) return { key: 'pass', label: 'Đạt', short: 'Đạt', cls: 'is-pass' };
  return { key: 'low', label: 'Chưa đạt', short: 'CĐ', cls: 'is-low' };
}

function formatPct(count, denom) {
  if (!denom || denom <= 0) return '0.0%';
  return `${((count / denom) * 100).toFixed(1)}%`;
}

function formatDeltaNum(diff, suffix = '') {
  if (!Number.isFinite(diff) || Math.abs(diff) < 1e-9) return '—';
  const sign = diff > 0 ? '+' : '';
  const rounded = Math.round(diff * 10) / 10;
  return `${sign}${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${suffix}`;
}

export function createGradebookController({ rootEl, uiHelpers, onRouteChange }) {
  const { showToast, openModal, closeModal } = uiHelpers;

  const state = {
    data: { classes: {} },
    schoolClasses: [],
    activeSemesterName: '',
    view: 'sheet', // 'sheet' | 'stats'
    term: 1, // 1 (4 TX cols) | 2 (5 TX cols)
    selectedClass: '',
    statsType: 'gk', // 'gk' | 'ck'
    statsScope: 'all', // 'all' | 'grade:10' | 'class:10/12'
    statsPerClassMode: 'adj', // 'orig' | 'adj'
    statsSearch: '',
    draftBrushMode: false,
    manageRosterMode: false,
    search: '',
    loading: false,
    saving: false,
  };

  let saveTimer = null;
  let dragSrcStuId = null;

  function getMergedClassList() {
    const map = new Map();
    for (const c of state.schoolClasses || []) {
      const name = String(c.name || '').trim();
      if (!name) continue;
      map.set(name, { name, grade: String(c.grade || ''), fromTkb: true });
    }
    for (const [name, obj] of Object.entries(state.data.classes || {})) {
      const clean = String(name || '').trim();
      if (!clean) continue;
      if (!map.has(clean)) {
        const gm = clean.match(/(10|11|12)/);
        map.set(clean, { name: clean, grade: String(obj?.grade || (gm ? gm[1] : '')), fromTkb: false });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
  }

  function ensureClassObj(className) {
    const clean = String(className || '').trim();
    if (!clean) return null;
    if (!state.data.classes || typeof state.data.classes !== 'object') state.data.classes = {};
    if (!state.data.classes[clean]) {
      const fromList = (state.schoolClasses || []).find((c) => c.name === clean);
      const gm = clean.match(/(10|11|12)/);
      state.data.classes[clean] = {
        className: clean,
        grade: fromList?.grade || (gm ? gm[1] : ''),
        students: [],
      };
    }
    const cls = state.data.classes[clean];
    if (!Array.isArray(cls.students)) cls.students = [];
    return cls;
  }

  function ensureStudentTermMap(stu, term) {
    if (!stu.scores || typeof stu.scores !== 'object') stu.scores = {};
    const tk = String(term);
    if (!stu.scores[tk] || typeof stu.scores[tk] !== 'object') stu.scores[tk] = {};
    return stu.scores[tk];
  }

  async function persistNow(toastMsg = '') {
    clearTimeout(saveTimer);
    state.saving = true;
    updateSavePill();
    try {
      const res = await api.saveGradebook(state.data);
      if (res?.gradebook) state.data = res.gradebook;
      if (toastMsg) showToast(toastMsg, 'success');
    } catch (err) {
      showToast(err.message || 'Không thể lưu Sổ điểm.', 'error');
    } finally {
      state.saving = false;
      updateSavePill();
    }
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    state.saving = true;
    updateSavePill();
    saveTimer = setTimeout(() => {
      persistNow('');
    }, 450);
  }

  function updateSavePill() {
    const el = rootEl.querySelector('#gbSaveStatus');
    if (!el) return;
    el.textContent = state.saving ? 'Đang lưu...' : '✓ Đã lưu';
    el.classList.toggle('is-saving', state.saving);
  }

  async function init(routeOpts = null) {
    state.loading = true;
    rootEl.innerHTML = `<div class="card panel-card" style="text-align:center; padding:42px; color:var(--text-muted);">Đang tải Sổ điểm...</div>`;
    try {
      const res = await api.getGradebook();
      state.data = res.gradebook && typeof res.gradebook === 'object' ? res.gradebook : { classes: {} };
      if (!state.data.classes || typeof state.data.classes !== 'object') state.data.classes = {};
      state.schoolClasses = Array.isArray(res.schoolClasses) ? res.schoolClasses : [];
      state.activeSemesterName = res.activeSemesterName || '';

      if (routeOpts?.view === 'stats') {
        state.view = 'stats';
        state.statsType = routeOpts.statsType === 'ck' ? 'ck' : 'gk';
        state.term = Number(routeOpts.statsTerm) === 2 ? 2 : 1;
        state.statsScope = routeOpts.statsScope || 'all';
      } else {
        state.view = 'sheet';
        if (!routeOpts?.keepTerm && res.activeTerm) {
          state.term = Number(res.activeTerm) === 2 ? 2 : 1;
        }
      }

      const list = getMergedClassList();
      if (!state.selectedClass || !list.some((c) => c.name === state.selectedClass)) {
        // Prefer a class that already has students, otherwise the first class from Sổ báo giảng
        const withStudents = list.find((c) => (state.data.classes[c.name]?.students?.length || 0) > 0);
        state.selectedClass = withStudents?.name || list[0]?.name || '';
      }
    } catch (err) {
      showToast(err.message || 'Không thể tải Sổ điểm.', 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  function computeClassStats(clsObj, term) {
    const students = clsObj?.students || [];
    let sumOff = 0;
    let cntOff = 0;
    let tot = 0;
    let kha = 0;
    let dat = 0;
    let chuaDat = 0;
    let totalDraftCells = 0;

    for (const s of students) {
      const av = computeStudentAverages(s, term);
      totalDraftCells += av.draftCount;
      if (av.avgOfficial !== null) {
        sumOff += av.avgOfficial;
        cntOff += 1;
        if (av.avgOfficial >= 8.0) tot++;
        else if (av.avgOfficial >= 6.5) kha++;
        else if (av.avgOfficial >= 5.0) dat++;
        else chuaDat++;
      }
    }

    return {
      totalStudents: students.length,
      avgClass: cntOff > 0 ? Math.round((sumOff / cntOff) * 10) / 10 : null,
      ratedCount: cntOff,
      tot,
      kha,
      dat,
      chuaDat,
      totalDraftCells,
    };
  }

  function renderKpiCardsHtml(stats) {
    return `
      <div class="card tui-kpi-card an-kpi-blue">
        <div class="tui-kpi-lbl">Sĩ số lớp ${escapeHtml(state.selectedClass || '—')}</div>
        <div class="tui-kpi-val">${stats.totalStudents} học sinh</div>
      </div>
      <div class="card tui-kpi-card is-ok">
        <div class="tui-kpi-lbl">ĐTB lớp (chính thức)</div>
        <div class="tui-kpi-val">${stats.avgClass !== null ? formatAvgScore(stats.avgClass) : '—'}</div>
      </div>
      <div class="card tui-kpi-card gb-kpi-tier-card">
        <div class="tui-kpi-lbl">Phân loại (Tốt / Khá / Đạt / CĐ)</div>
        <div class="tui-kpi-val gb-tier-summary">
          <span class="gb-tier-pill is-good">T: ${stats.tot}</span>
          <span class="gb-tier-pill is-fair">K: ${stats.kha}</span>
          <span class="gb-tier-pill is-pass">Đ: ${stats.dat}</span>
          <span class="gb-tier-pill is-low">CĐ: ${stats.chuaDat}</span>
        </div>
      </div>
    `;
  }

  function render() {
    if (state.view === 'stats') {
      renderStatsView();
      return;
    }
    const classList = getMergedClassList();
    if (classList.length > 0 && !classList.some((c) => c.name === state.selectedClass)) {
      state.selectedClass = classList[0].name;
    }
    const clsObj = state.selectedClass ? state.data.classes[state.selectedClass] : null;
    const students = clsObj?.students || [];
    const cols = getColumnsForTerm(state.term);
    const txCols = cols.filter((c) => c.group === 'tx');
    const q = state.search.trim().toLowerCase();
    const visibleStudents = students
      .map((s, idx) => ({ stu: s, stt: idx + 1 }))
      .filter(({ stu }) => !q || (stu.fullName || '').toLowerCase().includes(q));

    const stats = computeClassStats(clsObj, state.term);

    rootEl.innerHTML = `
      <div class="gb-shell">
        <!-- Header & Semester / Class Selector -->
        <div class="card gb-header-card">
          <div class="gb-header-top">
            <div>
              <div class="gb-eyebrow">SỔ ĐIỂM CÁ NHÂN${state.activeSemesterName ? ` • ${escapeHtml(state.activeSemesterName)}` : ''}</div>
              <div class="gb-class-pills" role="tablist">
                ${
                  classList.length === 0
                    ? `<span style="font-size:0.84rem; color:var(--text-muted);">Chưa có lớp trong Sổ báo giảng. Bấm <strong>Nhập dữ liệu (PDF)</strong> để nạp lớp ngay.</span>`
                    : classList
                        .map((c) => {
                          const cnt = state.data.classes[c.name]?.students?.length || 0;
                          return `
                            <button
                              type="button"
                              class="gb-class-pill ${c.name === state.selectedClass ? 'active' : ''}"
                              data-gb-class="${escapeAttr(c.name)}"
                            >
                              <span>Lớp ${escapeHtml(c.name)}</span>
                              <span class="gb-class-cnt">${cnt}</span>
                            </button>
                          `;
                        })
                        .join('')
                }
              </div>
            </div>

            <div class="gb-header-right">
              <div class="an-seg-toggle gb-term-toggle" role="tablist">
                <button type="button" class="an-seg-btn ${state.term === 1 ? 'active' : ''}" data-gb-term="1">
                  Học kì I
                </button>
                <button type="button" class="an-seg-btn ${state.term === 2 ? 'active' : ''}" data-gb-term="2">
                  Học kì II
                </button>
              </div>
              <span id="gbSaveStatus" class="gb-save-pill">✓ Đã lưu</span>
            </div>
          </div>

          <div class="gb-toolbar">
            <div class="gb-toolbar-left gbs-toolbar-left">
              <button type="button" class="btn btn-primary btn-sm" id="btnImportGradebookPdf">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Nhập dữ liệu (PDF)
              </button>

              <button type="button" class="btn btn-secondary btn-sm" id="btnAddGbStudent" ${!state.selectedClass ? 'disabled' : ''}>
                + Thêm HS
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btnExportGbCsv" ${students.length === 0 ? 'disabled' : ''}>
                Xuất Excel/CSV
              </button>
            </div>

            <div class="gb-toolbar-right">
              <input
                id="inpGbSearch"
                type="search"
                class="input-control input-compact"
                placeholder="Tìm tên học sinh..."
                value="${escapeAttr(state.search)}"
              />
            </div>
          </div>
        </div>

        <!-- KPI Strip + Square Tool Boxes (Red Pen & Gear Edit Roster) -->
        <div class="gb-kpi-row">
          <div id="gbKpiHost" class="tui-kpi-grid gb-kpi-grid">${renderKpiCardsHtml(stats)}</div>
          <div class="gb-tool-dock">
            <button
              type="button"
              class="gb-icon-box is-red-pen ${state.draftBrushMode ? 'is-active' : ''}"
              id="btnToggleDraftBrush"
              title="Đánh dấu điểm nháp (tô đỏ)"
              aria-label="Đánh dấu điểm nháp (tô đỏ)"
              aria-pressed="${state.draftBrushMode ? 'true' : 'false'}"
              ${students.length === 0 ? 'disabled' : ''}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button
              type="button"
              class="gb-icon-box is-manage ${state.manageRosterMode ? 'is-active' : ''}"
              id="btnToggleManageMode"
              title="Chỉnh sửa danh sách &amp; thứ tự học sinh"
              aria-label="Chỉnh sửa danh sách và thứ tự học sinh"
              aria-pressed="${state.manageRosterMode ? 'true' : 'false'}"
              ${students.length === 0 ? 'disabled' : ''}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Gradebook Spreadsheet Table -->
        <div class="card gb-table-card">
          ${
            !state.selectedClass || students.length === 0
              ? `
                <div style="text-align:center; padding:44px 20px; color:var(--text-muted);">
                  <div style="font-size:1rem; font-weight:700; color:var(--text); margin-bottom:6px;">
                    ${state.selectedClass ? `Lớp ${escapeHtml(state.selectedClass)} chưa có danh sách học sinh` : 'Chưa có lớp học nào'}
                  </div>
                  <p style="margin:0 0 16px; font-size:0.86rem;">
                    Bấm <strong>"Nhập dữ liệu (PDF)"</strong> để nạp nhanh danh sách &amp; cột điểm từ file PDF sổ điểm của trường, hoặc thêm học sinh thủ công.
                  </p>
                  <button type="button" class="btn btn-primary btn-sm" id="btnEmptyImportPdf">Nhập dữ liệu từ file PDF</button>
                </div>
              `
              : `
                <div class="gb-table-scroll">
                  <table class="gb-table ${state.draftBrushMode ? 'is-brush-mode' : ''} ${state.manageRosterMode ? 'is-manage-mode' : ''}">
                    <thead>
                      <tr>
                        <th rowspan="2" class="gb-col-stt gb-sticky-1">STT</th>
                        <th rowspan="2" class="gb-col-name gb-sticky-2">Họ và tên học sinh</th>
                        <th colspan="${txCols.length}" class="gb-th-group">ĐĐGtx</th>
                        <th rowspan="2" class="gb-col-score gb-th-dblclick" data-gb-open-stats="gk" title="Kích đúp để mở thống kê &amp; xem xét điểm ĐĐGgk">ĐĐGgk</th>
                        <th rowspan="2" class="gb-col-score gb-th-dblclick" data-gb-open-stats="ck" title="Kích đúp để mở thống kê &amp; xem xét điểm ĐĐGck">ĐĐGck</th>
                        <th rowspan="2" class="gb-col-avg is-draft-avg" title="Điểm trung bình nháp (tính tất cả điểm kể cả ô tô đỏ)">ĐTBmhk*</th>
                        <th rowspan="2" class="gb-col-avg is-official-avg" title="Điểm trung bình chính thức (bỏ qua các ô điểm nháp tô đỏ)">ĐTBmhk</th>
                      </tr>
                      <tr>
                        ${txCols.map((c) => `<th class="gb-col-score gb-th-sub">${c.shortLabel}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        visibleStudents.length === 0
                          ? `<tr><td colspan="${txCols.length + 6}" style="text-align:center; padding:28px; color:var(--text-muted);">Không tìm thấy học sinh nào khớp từ khóa.</td></tr>`
                          : visibleStudents
                              .map(({ stu, stt }, visIdx) => {
                                const termMap = (stu.scores && stu.scores[String(state.term)]) || {};
                                const av = computeStudentAverages(stu, state.term);
                                const isFirst = visIdx === 0;
                                const isLast = visIdx === visibleStudents.length - 1;
                                return `
                              <tr data-gb-stu-id="${escapeAttr(stu.id)}" ${state.manageRosterMode ? 'draggable="true"' : ''}>
                                <td class="gb-col-stt gb-sticky-1">
                                  ${
                                    state.manageRosterMode
                                      ? `<span class="gb-drag-handle" title="Kéo thả để đổi vị trí">⋮⋮</span><span class="gb-stt-num">${stt}</span>`
                                      : stt
                                  }
                                </td>
                                <td class="gb-col-name gb-sticky-2">
                                  <div class="gb-name-cell-inner">
                                    <div class="gb-name-meta">
                                      <div class="gb-stu-fullname">${escapeHtml(stu.fullName)}</div>
                                      ${stu.dob ? `<div class="gb-stu-dob">${escapeHtml(formatDobVNAdmin(stu.dob))}</div>` : ''}
                                    </div>
                                    ${
                                      state.manageRosterMode
                                        ? `
                                          <div class="gb-row-manage-tools">
                                            <button type="button" class="gb-row-mini-btn" data-gb-edit-stu="${escapeAttr(stu.id)}" title="Sửa họ tên / ngày sinh">
                                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                            </button>
                                            <button type="button" class="gb-row-mini-btn is-del" data-gb-del-stu="${escapeAttr(stu.id)}" title="Xóa học sinh khỏi lớp">
                                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                                            </button>
                                          </div>
                                        `
                                        : ''
                                    }
                                  </div>
                                </td>
                                ${cols
                                  .map((c) => {
                                    const cell = normalizeCell(termMap[c.key]);
                                    const valStr = cell && cell.val !== null ? formatScoreCell(cell.val) : '';
                                    const isDraft = Boolean(cell && cell.draft);
                                    const isDraftEmpty = Boolean(isDraft && (!cell || cell.val === null));
                                    const isAdjusted = Boolean(cell && cell.val !== null && cell.adjusted && (c.key === 'gk' || c.key === 'ck'));
                                    const origAttr =
                                      isAdjusted && cell.origVal !== null
                                        ? `data-gb-orig="${escapeAttr(formatScoreCell(cell.origVal))}"`
                                        : '';
                                    return `
                                      <td class="gb-col-score ${isDraft ? 'is-draft-cell' : ''} ${isDraftEmpty ? 'is-draft-empty' : ''}">
                                        <input
                                          type="text"
                                          inputmode="decimal"
                                          class="gb-score-inp ${isDraft ? 'is-draft' : ''} ${isAdjusted ? 'is-gkck-adjusted' : ''}"
                                          data-gb-stu="${escapeAttr(stu.id)}"
                                          data-gb-col="${escapeAttr(c.key)}"
                                          ${origAttr}
                                          value="${escapeAttr(valStr)}"
                                          ${state.draftBrushMode || state.manageRosterMode ? 'readonly' : ''}
                                          aria-label="${escapeAttr(`${stu.fullName} - ${c.label}`)}"
                                        />
                                      </td>
                                    `;
                                  })
                                  .join('')}
                                <td class="gb-col-avg is-draft-avg ${getScoreTierClass(av.avgDraft)}" data-gb-avg-draft="${escapeAttr(stu.id)}">
                                  ${formatAvgScore(av.avgDraft)}
                                </td>
                                <td class="gb-col-avg is-official-avg ${getScoreTierClass(av.avgOfficial)}" data-gb-avg-official="${escapeAttr(stu.id)}">
                                  ${formatAvgScore(av.avgOfficial)}
                                </td>
                              </tr>
                            `;
                              })
                              .join('')
                      }
                    </tbody>
                  </table>
                </div>
              `
          }
        </div>
      </div>
    `;

    bindEvents();
  }

  function updateRowAveragesInPlace(stuId) {
    const clsObj = state.data.classes[state.selectedClass];
    if (!clsObj) return;
    const stu = (clsObj.students || []).find((s) => s.id === stuId);
    if (!stu) return;
    const av = computeStudentAverages(stu, state.term);

    const draftTd = rootEl.querySelector(`[data-gb-avg-draft="${CSS.escape(stuId)}"]`);
    if (draftTd) {
      draftTd.textContent = formatAvgScore(av.avgDraft);
      draftTd.className = `gb-col-avg is-draft-avg ${getScoreTierClass(av.avgDraft)}`;
    }
    const offTd = rootEl.querySelector(`[data-gb-avg-official="${CSS.escape(stuId)}"]`);
    if (offTd) {
      offTd.textContent = formatAvgScore(av.avgOfficial);
      offTd.className = `gb-col-avg is-official-avg ${getScoreTierClass(av.avgOfficial)}`;
    }
    const kpiHost = rootEl.querySelector('#gbKpiHost');
    if (kpiHost) {
      kpiHost.innerHTML = renderKpiCardsHtml(computeClassStats(clsObj, state.term));
    }
  }

  function moveStudentRow(stuId, delta) {
    const clsObj = state.data.classes[state.selectedClass];
    if (!clsObj || !Array.isArray(clsObj.students)) return;
    const idx = clsObj.students.findIndex((s) => s.id === stuId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= clsObj.students.length) return;
    const [item] = clsObj.students.splice(idx, 1);
    clsObj.students.splice(nextIdx, 0, item);
    render();
    schedulePersist();
  }

  function reorderStudentBefore(srcId, targetId) {
    if (!srcId || !targetId || srcId === targetId) return;
    const clsObj = state.data.classes[state.selectedClass];
    if (!clsObj || !Array.isArray(clsObj.students)) return;
    const srcIdx = clsObj.students.findIndex((s) => s.id === srcId);
    const dstIdx = clsObj.students.findIndex((s) => s.id === targetId);
    if (srcIdx < 0 || dstIdx < 0 || srcIdx === dstIdx) return;
    const [item] = clsObj.students.splice(srcIdx, 1);
    clsObj.students.splice(dstIdx, 0, item);
    render();
    schedulePersist();
  }

  function openEditStudentModal(stu) {
    if (!stu) return;
    openModal({
      title: `Sửa thông tin học sinh — Lớp ${state.selectedClass}`,
      bodyHtml: `
        <div class="form-group">
          <label>Họ và tên học sinh *</label>
          <input id="gbEditStuName" class="input-control" value="${escapeAttr(stu.fullName || '')}" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Ngày sinh (tùy chọn)</label>
          <input id="gbEditStuDob" class="input-control" placeholder="VD: 04/9/2011 hoặc 20/02/2011" maxlength="10" value="${escapeAttr(formatDobVNAdmin(stu.dob || ''))}" />
        </div>
      `,
      footerHtml: `
        <button type="button" class="btn btn-secondary" id="mCancelEditGbStu">Hủy</button>
        <button type="button" class="btn btn-primary" id="mSaveEditGbStu">Lưu thay đổi</button>
      `,
      onMount: (m) => {
        const nameInp = m.querySelector('#gbEditStuName');
        nameInp.focus();
        m.querySelector('#mCancelEditGbStu').addEventListener('click', closeModal);
        m.querySelector('#mSaveEditGbStu').addEventListener('click', async () => {
          const fullName = nameInp.value.trim();
          if (!fullName) {
            showToast('Vui lòng nhập họ và tên học sinh.', 'error');
            nameInp.focus();
            return;
          }
          stu.fullName = fullName;
          stu.dob = formatDobVNAdmin(m.querySelector('#gbEditStuDob').value.trim());
          closeModal();
          await persistNow(`Đã cập nhật thông tin ${fullName}.`);
          render();
        });
      },
    });
  }

  function toggleCellDraft(inp) {
    const stuId = inp.dataset.gbStu;
    const colKey = inp.dataset.gbCol;
    const clsObj = state.data.classes[state.selectedClass];
    const stu = clsObj?.students?.find((s) => s.id === stuId);
    if (!stu) return;
    const termMap = ensureStudentTermMap(stu, state.term);
    const cur = normalizeCell(termMap[colKey]);
    const td = inp.closest('td');

    if (!cur) {
      // Allow marking an empty cell as red draft before entering a score
      termMap[colKey] = { val: null, draft: true };
      inp.classList.add('is-draft');
      td?.classList.add('is-draft-cell', 'is-draft-empty');
      schedulePersist();
      return;
    }

    if (cur.val === null) {
      // Unmark empty red draft cell
      delete termMap[colKey];
      inp.classList.remove('is-draft');
      td?.classList.remove('is-draft-cell', 'is-draft-empty');
      schedulePersist();
      return;
    }

    const nextDraft = !cur.draft;
    const nextCell = { val: cur.val, draft: nextDraft };
    if (cur.adjusted) {
      nextCell.adjusted = true;
      if (cur.origVal !== null) nextCell.origVal = cur.origVal;
    }
    termMap[colKey] = nextCell;
    inp.classList.toggle('is-draft', nextDraft);
    td?.classList.toggle('is-draft-cell', nextDraft);
    td?.classList.remove('is-draft-empty');
    updateRowAveragesInPlace(stuId);
    schedulePersist();
  }

  function hideOrigScorePopover() {
    const pop = document.getElementById('gbOrigScorePopover');
    if (pop) pop.classList.add('hidden');
  }

  function showOrigScorePopover(inp) {
    const origStr = inp?.dataset?.gbOrig;
    if (!origStr && origStr !== '0') {
      hideOrigScorePopover();
      return;
    }
    let pop = document.getElementById('gbOrigScorePopover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'gbOrigScorePopover';
      pop.className = 'gb-orig-popover hidden';
      document.body.appendChild(pop);
    }
    pop.innerHTML = `<span>Điểm gốc:</span> <strong>${escapeHtml(origStr)}</strong>`;
    pop.classList.remove('hidden');

    const rect = inp.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let top = rect.top - popRect.height - 8;
    let placedBelow = false;
    if (top < 10) {
      top = rect.bottom + 8;
      placedBelow = true;
    }
    const left = Math.max(8, Math.min(window.innerWidth - popRect.width - 8, rect.left + rect.width / 2 - popRect.width / 2));
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
    pop.classList.toggle('is-below', placedBelow);
  }

  function bindEvents() {
    rootEl.querySelectorAll('[data-gb-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedClass = btn.dataset.gbClass;
        state.search = '';
        render();
      });
    });

    rootEl.querySelectorAll('[data-gb-term]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTerm = Number(btn.dataset.gbTerm) === 2 ? 2 : 1;
        if (nextTerm === state.term) return;
        state.term = nextTerm;
        render();
      });
    });

    rootEl.querySelectorAll('[data-gb-open-stats]').forEach((th) => {
      th.addEventListener('dblclick', () => {
        hideOrigScorePopover();
        const type = th.dataset.gbOpenStats === 'ck' ? 'ck' : 'gk';
        const scope = state.selectedClass ? `class:${state.selectedClass}` : 'overview';
        state.view = 'stats';
        state.statsType = type;
        state.statsScope = scope;
        state.statsSearch = '';
        if (typeof onRouteChange === 'function') {
          const qs = new URLSearchParams({
            type,
            term: String(state.term),
            scope,
          });
          onRouteChange(`/so-diem/thong-ke?${qs.toString()}`, { replace: false });
        }
        renderStatsView();
      });
    });

    rootEl.querySelector('#btnImportGradebookPdf')?.addEventListener('click', openPdfImportModal);
    rootEl.querySelector('#btnEmptyImportPdf')?.addEventListener('click', openPdfImportModal);

    rootEl.querySelector('#btnToggleDraftBrush')?.addEventListener('click', () => {
      state.draftBrushMode = !state.draftBrushMode;
      if (state.draftBrushMode) state.manageRosterMode = false;
      render();
    });

    rootEl.querySelector('#btnToggleManageMode')?.addEventListener('click', () => {
      state.manageRosterMode = !state.manageRosterMode;
      if (state.manageRosterMode) {
        state.draftBrushMode = false;
        state.search = '';
      }
      render();
    });

    rootEl.querySelector('#btnExitGbMode')?.addEventListener('click', () => {
      state.draftBrushMode = false;
      state.manageRosterMode = false;
      render();
    });

    rootEl.querySelector('#btnAddGbStudent')?.addEventListener('click', openAddStudentModal);
    rootEl.querySelector('#btnExportGbCsv')?.addEventListener('click', exportCurrentClassCsv);

    rootEl.querySelector('#inpGbSearch')?.addEventListener('input', (e) => {
      state.search = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const inp = rootEl.querySelector('#inpGbSearch');
      if (inp) {
        inp.focus();
        if (typeof pos === 'number') inp.setSelectionRange(pos, pos);
      }
    });

    // Manage Roster Mode: Move up/down, Edit student, Drag-and-drop reorder
    if (state.manageRosterMode) {
      rootEl.querySelectorAll('[data-gb-move-up]').forEach((btn) => {
        btn.addEventListener('click', () => moveStudentRow(btn.dataset.gbMoveUp, -1));
      });
      rootEl.querySelectorAll('[data-gb-move-down]').forEach((btn) => {
        btn.addEventListener('click', () => moveStudentRow(btn.dataset.gbMoveDown, 1));
      });
      rootEl.querySelectorAll('[data-gb-edit-stu]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const stuId = btn.dataset.gbEditStu;
          const stu = state.data.classes[state.selectedClass]?.students?.find((s) => s.id === stuId);
          if (stu) openEditStudentModal(stu);
        });
      });

      rootEl.querySelectorAll('tbody tr[data-gb-stu-id]').forEach((tr) => {
        tr.addEventListener('dragstart', (e) => {
          dragSrcStuId = tr.dataset.gbStuId;
          tr.classList.add('is-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', dragSrcStuId);
          }
        });
        tr.addEventListener('dragend', () => {
          dragSrcStuId = null;
          rootEl.querySelectorAll('tbody tr.is-dragging, tbody tr.is-drag-over').forEach((r) => {
            r.classList.remove('is-dragging', 'is-drag-over');
          });
        });
        tr.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (dragSrcStuId && dragSrcStuId !== tr.dataset.gbStuId) {
            tr.classList.add('is-drag-over');
          }
        });
        tr.addEventListener('dragleave', () => {
          tr.classList.remove('is-drag-over');
        });
        tr.addEventListener('drop', (e) => {
          e.preventDefault();
          tr.classList.remove('is-drag-over');
          const srcId = dragSrcStuId || e.dataTransfer?.getData('text/plain');
          const targetId = tr.dataset.gbStuId;
          if (srcId && targetId && srcId !== targetId) {
            reorderStudentBefore(srcId, targetId);
          }
        });
      });
    }

    // Score cell inputs + red draft brush + keyboard navigation
    rootEl.querySelectorAll('.gb-score-inp').forEach((inp) => {
      inp.addEventListener('click', (e) => {
        if (state.draftBrushMode) {
          e.preventDefault();
          toggleCellDraft(inp);
        }
      });

      inp.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        toggleCellDraft(inp);
      });

      inp.addEventListener('focus', () => {
        if (!state.draftBrushMode && !state.manageRosterMode) {
          inp.select();
          if (inp.classList.contains('is-gkck-adjusted') && inp.dataset.gbOrig !== undefined) {
            showOrigScorePopover(inp);
          } else {
            hideOrigScorePopover();
          }
        }
      });

      inp.addEventListener('blur', () => {
        hideOrigScorePopover();
      });

      inp.addEventListener('keydown', (e) => {
        if (state.draftBrushMode || state.manageRosterMode) return;
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const col = inp.dataset.gbCol;
          const allInCol = Array.from(rootEl.querySelectorAll(`.gb-score-inp[data-gb-col="${CSS.escape(col)}"]`));
          const curIdx = allInCol.indexOf(inp);
          const nextIdx = e.key === 'ArrowUp' ? curIdx - 1 : curIdx + 1;
          inp.dispatchEvent(new Event('change'));
          if (nextIdx >= 0 && nextIdx < allInCol.length) {
            allInCol[nextIdx].focus();
          }
        }
      });

      inp.addEventListener('change', () => {
        if (state.draftBrushMode || state.manageRosterMode) return;
        const stuId = inp.dataset.gbStu;
        const colKey = inp.dataset.gbCol;
        const clsObj = state.data.classes[state.selectedClass];
        const stu = clsObj?.students?.find((s) => s.id === stuId);
        if (!stu) return;
        const termMap = ensureStudentTermMap(stu, state.term);
        const prev = normalizeCell(termMap[colKey]);

        const parsed = parseScoreInput(inp.value);
        if (!parsed.valid) {
          showToast('Điểm phải nằm trong khoảng 0 đến 10 (VD: 7.5 hoặc 8,5).', 'error');
          inp.value = prev ? formatScoreCell(prev.val) : '';
          return;
        }

        if (parsed.value === null) {
          delete termMap[colKey];
          inp.value = '';
          inp.classList.remove('is-draft', 'is-gkck-adjusted');
          delete inp.dataset.gbOrig;
          inp.closest('td')?.classList.remove('is-draft-cell', 'is-draft-empty');
          hideOrigScorePopover();
        } else {
          const keepDraft = Boolean(prev && prev.draft);
          const nextCell = { val: parsed.value, draft: keepDraft };
          if (prev && prev.adjusted && (colKey === 'gk' || colKey === 'ck')) {
            if (prev.origVal !== null && Math.abs(parsed.value - prev.origVal) < 1e-9) {
              // Restored back to original value -> clear blue adjusted flag
              inp.classList.remove('is-gkck-adjusted');
              delete inp.dataset.gbOrig;
              hideOrigScorePopover();
            } else {
              nextCell.adjusted = true;
              if (prev.origVal !== null) nextCell.origVal = prev.origVal;
            }
          }
          termMap[colKey] = nextCell;
          inp.value = formatScoreCell(parsed.value);
          inp.classList.toggle('is-draft', keepDraft);
          inp.closest('td')?.classList.toggle('is-draft-cell', keepDraft);
          inp.closest('td')?.classList.remove('is-draft-empty');
        }
        updateRowAveragesInPlace(stuId);
        schedulePersist();
      });
    });

    rootEl.querySelectorAll('[data-gb-del-stu]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stuId = btn.dataset.gbDelStu;
        const clsObj = state.data.classes[state.selectedClass];
        const stu = clsObj?.students?.find((s) => s.id === stuId);
        if (!stu) return;
        openModal({
          title: 'Xóa học sinh khỏi Sổ điểm',
          bodyHtml: `<p style="margin:0;">Xóa <strong>${escapeHtml(stu.fullName)}</strong> khỏi sổ điểm lớp <strong>${escapeHtml(state.selectedClass)}</strong>?</p>`,
          footerHtml: `
            <button type="button" class="btn btn-secondary" id="mCancelDelGbStu">Hủy</button>
            <button type="button" class="btn btn-danger-outline" id="mConfirmDelGbStu">Xóa</button>
          `,
          onMount: (m) => {
            m.querySelector('#mCancelDelGbStu').addEventListener('click', closeModal);
            m.querySelector('#mConfirmDelGbStu').addEventListener('click', async () => {
              clsObj.students = clsObj.students.filter((s) => s.id !== stuId);
              closeModal();
              await persistNow(`Đã xóa ${stu.fullName} khỏi sổ điểm.`);
              render();
            });
          },
        });
      });
    });
  }

  function openAddStudentModal() {
    if (!state.selectedClass) return;
    openModal({
      title: `Thêm học sinh vào Sổ điểm — Lớp ${state.selectedClass}`,
      bodyHtml: `
        <div class="form-group">
          <label>Họ và tên học sinh *</label>
          <input id="gbNewStuName" class="input-control" placeholder="VD: Nguyễn Văn An" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Ngày sinh (tùy chọn)</label>
          <input id="gbNewStuDob" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" />
        </div>
      `,
      footerHtml: `
        <button type="button" class="btn btn-secondary" id="mCancelAddGbStu">Hủy</button>
        <button type="button" class="btn btn-primary" id="mSaveAddGbStu">Thêm học sinh</button>
      `,
      onMount: (m) => {
        const nameInp = m.querySelector('#gbNewStuName');
        nameInp.focus();
        m.querySelector('#mCancelAddGbStu').addEventListener('click', closeModal);
        m.querySelector('#mSaveAddGbStu').addEventListener('click', async () => {
          const fullName = nameInp.value.trim();
          if (!fullName) {
            showToast('Vui lòng nhập họ và tên học sinh.', 'error');
            nameInp.focus();
            return;
          }
          const clsObj = ensureClassObj(state.selectedClass);
          clsObj.students.push({
            id: `gb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            fullName,
            dob: formatDobVNAdmin(m.querySelector('#gbNewStuDob').value.trim()),
            scores: { '1': {}, '2': {} },
          });
          closeModal();
          await persistNow(`Đã thêm ${fullName} vào lớp ${state.selectedClass}!`);
          render();
        });
      },
    });
  }

  // =========================================================
  // SMART PDF IMPORT WIZARD (2D COORDINATE PARSER + COLUMN PICKER)
  // =========================================================
  function openPdfImportModal() {
    let parsedFile = null; // full result from extractGradebookFromPdfFile (with .classes[])
    let activePdfIdx = 0;
    let importedPdfIndices = new Set();
    let targetClass = state.selectedClass;
    let targetTerm = state.term;
    let importNames = true;
    let selectedCols = new Set();

    function getActivePdfSection() {
      if (!parsedFile) return null;
      const list = Array.isArray(parsedFile.classes) && parsedFile.classes.length > 0 ? parsedFile.classes : [parsedFile];
      return list[activePdfIdx] || list[0] || null;
    }

    function syncDefaultsFromPdfSection(sec) {
      if (!sec) return;
      const known = getMergedClassList().map((c) => c.name);
      targetTerm = sec.term === 2 ? 2 : 1;
      if (sec.className) {
        const exact = known.find((c) => c.toLowerCase() === sec.className.toLowerCase());
        targetClass = exact || sec.className;
      } else if (!targetClass && known.length > 0) {
        targetClass = known[0];
      }
      selectedCols = new Set(
        Object.entries(sec.columnCounts || {})
          .filter(([, cnt]) => cnt > 0)
          .map(([k]) => k)
      );
      const existingCount = state.data.classes[targetClass]?.students?.length || 0;
      importNames = existingCount === 0;
    }

    function renderWizardStep(m) {
      const bodyEl = m.querySelector('#gbPdfWizardHost');
      const saveBtn = m.querySelector('#mConfirmPdfImport');
      const cancelBtn = m.querySelector('#mCancelPdfImport');
      const parsedPdf = getActivePdfSection();

      if (!parsedFile || !parsedPdf) {
        saveBtn.classList.add('hidden');
        if (cancelBtn) cancelBtn.textContent = 'Hủy';
        bodyEl.innerHTML = `
          <div id="gbPdfDropzone"></div>
          <div id="gbPdfStatus" class="hidden" style="margin-top:12px;"></div>
        `;
        const dzHost = bodyEl.querySelector('#gbPdfDropzone');
        const statusEl = bodyEl.querySelector('#gbPdfStatus');

        mountAnimatedDropzone(dzHost, {
          inputId: 'inpGbPdfFile',
          accept: '.pdf,application/pdf',
          idleTitle: 'Kéo thả file PDF Sổ điểm vào đây',
          dragTitle: 'Thả file để đọc dữ liệu',
          hintText: 'Hỗ trợ cả file 1 lớp lẫn trọn bộ nhiều lớp (tự bù lệch lề chẵn/lẻ & nhận diện cột ĐĐGtx, ĐĐGgk, ĐĐGck).',
          onProcess: async (file) => {
            statusEl.classList.add('hidden');
            const res = await extractGradebookFromPdfFile(file);
            const sections = Array.isArray(res.classes) ? res.classes.filter((c) => c.students?.length > 0) : [];
            if (sections.length === 0) {
              throw new Error('Không tìm thấy dòng học sinh nào trong file PDF này. Vui lòng kiểm tra lại đúng mẫu sổ điểm.');
            }
            return { res, sections };
          },
          onComplete: ({ res, sections }) => {
            parsedFile = { ...res, classes: sections };
            importedPdfIndices = new Set();
            const matchIdx = sections.findIndex(
              (s) => s.className && state.selectedClass && s.className.toLowerCase() === state.selectedClass.toLowerCase()
            );
            activePdfIdx = matchIdx >= 0 ? matchIdx : 0;
            syncDefaultsFromPdfSection(sections[activePdfIdx]);
            renderWizardStep(m);
          },
          onError: (err) => {
            statusEl.className = 'import-status error';
            statusEl.textContent = err?.message || 'Không thể đọc file PDF.';
            statusEl.classList.remove('hidden');
          },
        });
        return;
      }

      // Step 2: Interactive selection ("Hỏi muốn lấy cái gì?")
      saveBtn.classList.remove('hidden');
      const pdfClasses = parsedFile.classes || [parsedPdf];
      const isMultiClass = pdfClasses.length > 1;
      if (cancelBtn) cancelBtn.textContent = isMultiClass && importedPdfIndices.size > 0 ? 'Đóng' : 'Hủy';
      saveBtn.textContent = isMultiClass
        ? `Xác nhận nhập Lớp ${targetClass || parsedPdf.className || ''}`
        : 'Xác nhận nhập dữ liệu';

      const allKnownClasses = getMergedClassList().map((c) => c.name);
      const existingCls = state.data.classes[targetClass];
      const hasRoster = Boolean(existingCls && (existingCls.students?.length || 0) > 0);
      if (hasRoster) importNames = false;

      const classOptions = [...new Set([...allKnownClasses, ...(parsedPdf.className ? [parsedPdf.className] : [])])];
      const cols = getColumnsForTerm(targetTerm);
      const previewRows = parsedPdf.students.slice(0, 5);
      const previewCols = cols.filter((c) => selectedCols.has(c.key));

      bodyEl.innerHTML = `
        <div class="gb-pdf-detected">
          <div>
            <strong>Đã đọc được ${parsedPdf.students.length} học sinh</strong>
            ${parsedPdf.className ? ` • Lớp trong file: <span class="badge badge-p1">${escapeHtml(parsedPdf.className)}</span>` : ''}
            <span class="badge badge-p2">Học kì ${parsedPdf.term === 2 ? 'II' : 'I'}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="btnRepickGbPdf">Chọn file khác</button>
        </div>

        ${
          isMultiClass
            ? `
              <div class="gb-pdf-class-bar">
                <div class="gb-pdf-class-bar-lbl">Tìm thấy ${pdfClasses.length} lớp trong file PDF — chọn lớp để nhập:</div>
                <div class="gb-class-pills">
                  ${pdfClasses
                    .map((sec, idx) => {
                      const done = importedPdfIndices.has(idx);
                      return `
                        <button type="button" class="gb-class-pill ${idx === activePdfIdx ? 'active' : ''}" data-gb-pdf-sec="${idx}">
                          <span>${done ? '✓ ' : ''}Lớp ${escapeHtml(sec.className || `#${idx + 1}`)}</span>
                          <span class="gb-class-cnt">${sec.students.length}</span>
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `
            : ''
        }

        <div class="form-row-2" style="margin-top:12px;">
          <div class="form-group">
            <label>Nhập vào lớp</label>
            <select id="gbImpClassSel" class="input-control">
              ${classOptions
                .map((c) => {
                  const cnt = state.data.classes[c]?.students?.length || 0;
                  const isNewCls = !allKnownClasses.includes(c);
                  return `<option value="${escapeAttr(c)}" ${c === targetClass ? 'selected' : ''}>Lớp ${escapeHtml(c)}${isNewCls ? ' (Thêm mới vào Sổ điểm)' : cnt > 0 ? ` (đã có ${cnt} HS)` : ' (chưa có DS)'}</option>`;
                })
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Nhập vào học kì</label>
            <select id="gbImpTermSel" class="input-control">
              <option value="1" ${targetTerm === 1 ? 'selected' : ''}>Học kì I</option>
              <option value="2" ${targetTerm === 2 ? 'selected' : ''}>Học kì II</option>
            </select>
          </div>
        </div>

        ${
          hasRoster
            ? `
              <div class="gb-imp-roster-notice">
                Lớp <strong>${escapeHtml(targetClass)}</strong> đã có danh sách <strong>${existingCls.students.length} học sinh</strong> — chỉ cập nhật các cột điểm bạn chọn bên dưới (khớp theo họ tên).
              </div>
            `
            : `
              <label class="gb-imp-enable-row" style="margin-bottom:14px;">
                <input type="checkbox" id="gbImpNamesChk" ${importNames ? 'checked' : ''} />
                <div>
                  <strong>Nhận danh sách học sinh (${parsedPdf.students.length} HS)</strong>
                  <small>Lớp ${escapeHtml(targetClass)} chưa có danh sách — đánh dấu để tạo danh sách họ tên &amp; ngày sinh từ file PDF.</small>
                </div>
              </label>
            `
        }

        <div class="gb-imp-cols-box">
          <div class="gb-imp-cols-head">
            <strong>Chọn các cột điểm muốn nhận:</strong>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-ghost btn-sm" id="btnGbPickNonEmpty">Cột có điểm</button>
              <button type="button" class="btn btn-ghost btn-sm" id="btnGbPickNone">Bỏ chọn hết</button>
            </div>
          </div>
          <div class="gb-imp-cols-grid">
            ${cols
              .map((c) => {
                const cnt = parsedPdf.columnCounts?.[c.key] || 0;
                const checked = selectedCols.has(c.key);
                return `
                  <label class="gb-imp-col-chip ${checked ? 'is-checked' : ''} ${cnt === 0 ? 'is-zero' : ''}">
                    <input type="checkbox" data-gb-imp-col="${escapeAttr(c.key)}" ${checked ? 'checked' : ''} />
                    <span><strong>${escapeHtml(c.label)}</strong> <small>(${cnt} điểm)</small></span>
                  </label>
                `;
              })
              .join('')}
          </div>
        </div>

        <div class="gb-imp-preview-wrap">
          <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted); margin-bottom:6px;">
            XEM TRƯỚC 5 HỌC SINH ĐẦU TIÊN:
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table gb-imp-preview-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Họ và tên</th>
                  <th>Ngày sinh</th>
                  ${previewCols.map((c) => `<th style="text-align:center;">${escapeHtml(c.shortLabel)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${previewRows
                  .map(
                    (r) => `
                  <tr>
                    <td>${r.stt}</td>
                    <td><strong>${escapeHtml(r.fullName)}</strong></td>
                    <td>${escapeHtml(formatDobVNAdmin(r.dob))}</td>
                    ${previewCols
                      .map(
                        (c) =>
                          `<td style="text-align:center;">${r.scores[c.key] !== null && r.scores[c.key] !== undefined ? escapeHtml(formatScoreCell(r.scores[c.key])) : '—'}</td>`
                      )
                      .join('')}
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      bodyEl.querySelector('#btnRepickGbPdf')?.addEventListener('click', () => {
        parsedFile = null;
        activePdfIdx = 0;
        importedPdfIndices = new Set();
        renderWizardStep(m);
      });

      bodyEl.querySelectorAll('[data-gb-pdf-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activePdfIdx = Number(btn.dataset.gbPdfSec) || 0;
          syncDefaultsFromPdfSection(getActivePdfSection());
          renderWizardStep(m);
        });
      });

      bodyEl.querySelector('#gbImpClassSel')?.addEventListener('change', (e) => {
        targetClass = e.target.value;
        const existCnt = state.data.classes[targetClass]?.students?.length || 0;
        importNames = existCnt === 0;
        renderWizardStep(m);
      });

      bodyEl.querySelector('#gbImpTermSel')?.addEventListener('change', (e) => {
        targetTerm = Number(e.target.value) === 2 ? 2 : 1;
        renderWizardStep(m);
      });

      bodyEl.querySelector('#gbImpNamesChk')?.addEventListener('change', (e) => {
        importNames = e.target.checked;
      });

      bodyEl.querySelectorAll('[data-gb-imp-col]').forEach((chk) => {
        chk.addEventListener('change', () => {
          const k = chk.dataset.gbImpCol;
          if (chk.checked) selectedCols.add(k);
          else selectedCols.delete(k);
          renderWizardStep(m);
        });
      });

      bodyEl.querySelector('#btnGbPickNonEmpty')?.addEventListener('click', () => {
        selectedCols = new Set(
          cols.filter((c) => (parsedPdf.columnCounts?.[c.key] || 0) > 0).map((c) => c.key)
        );
        renderWizardStep(m);
      });

      bodyEl.querySelector('#btnGbPickNone')?.addEventListener('click', () => {
        selectedCols = new Set();
        renderWizardStep(m);
      });
    }

    openModal({
      title: 'Nhập dữ liệu Sổ điểm từ PDF',
      wide: true,
      bodyHtml: `<div id="gbPdfWizardHost"></div>`,
      footerHtml: `
        <button type="button" class="btn btn-secondary" id="mCancelPdfImport">Hủy</button>
        <button type="button" class="btn btn-primary hidden" id="mConfirmPdfImport">Xác nhận nhập dữ liệu</button>
      `,
      onMount: (m) => {
        renderWizardStep(m);
        m.querySelector('#mCancelPdfImport').addEventListener('click', closeModal);
        m.querySelector('#mConfirmPdfImport').addEventListener('click', async () => {
          const parsedPdf = getActivePdfSection();
          if (!parsedPdf || !targetClass) return;
          const clsObj = ensureClassObj(targetClass);
          const hasRoster = clsObj.students.length > 0;
          const chosenCols = Array.from(selectedCols);

          if (!hasRoster && !importNames) {
            showToast('Lớp chưa có danh sách — vui lòng đánh dấu "Nhận danh sách học sinh".', 'error');
            return;
          }
          if (hasRoster && chosenCols.length === 0) {
            showToast('Vui lòng chọn ít nhất 1 cột điểm muốn nhận.', 'error');
            return;
          }

          let addedStudents = 0;
          let updatedScores = 0;
          const existingByName = new Map(
            clsObj.students.map((s) => [normalizeNameKey(s.fullName), s])
          );

          for (const row of parsedPdf.students) {
            const key = normalizeNameKey(row.fullName);
            let stu = existingByName.get(key);
            if (!stu) {
              if (!hasRoster && importNames) {
                stu = {
                  id: `gb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                  fullName: row.fullName,
                  dob: formatDobVNAdmin(row.dob || ''),
                  scores: { '1': {}, '2': {} },
                };
                clsObj.students.push(stu);
                existingByName.set(key, stu);
                addedStudents += 1;
              } else {
                continue;
              }
            }
            const termMap = ensureStudentTermMap(stu, targetTerm);
            for (const colKey of chosenCols) {
              const incomingVal = row.scores[colKey];
              if (incomingVal !== null && incomingVal !== undefined) {
                termMap[colKey] = { val: incomingVal, draft: false };
                updatedScores += 1;
              }
            }
          }

          state.selectedClass = targetClass;
          state.term = targetTerm;
          importedPdfIndices.add(activePdfIdx);

          const pdfClasses = parsedFile?.classes || [parsedPdf];
          const nextRemainingIdx = pdfClasses.findIndex((_, idx) => !importedPdfIndices.has(idx));

          const summaryParts = [];
          if (addedStudents > 0) summaryParts.push(`${addedStudents} học sinh`);
          if (updatedScores > 0) summaryParts.push(`${updatedScores} ô điểm (${chosenCols.length} cột)`);

          if (pdfClasses.length > 1 && nextRemainingIdx >= 0) {
            await persistNow(
              `Đã nhập ${summaryParts.join(' & ')} vào Lớp ${targetClass}! Chọn lớp tiếp theo hoặc bấm Đóng.`
            );
            render();
            activePdfIdx = nextRemainingIdx;
            syncDefaultsFromPdfSection(pdfClasses[activePdfIdx]);
            renderWizardStep(m);
          } else {
            closeModal();
            await persistNow(
              summaryParts.length > 0
                ? `Đã nhập ${summaryParts.join(' & ')} vào Lớp ${targetClass} (HK ${targetTerm === 2 ? 'II' : 'I'})!`
                : 'Đã hoàn tất nhập dữ liệu.'
            );
            render();
          }
        });
      },
    });
  }

  function exportCurrentClassCsv() {
    const clsObj = state.data.classes[state.selectedClass];
    if (!clsObj || !clsObj.students?.length) return;
    const cols = getColumnsForTerm(state.term);
    const headers = ['STT', 'Họ và tên', 'Ngày sinh', ...cols.map((c) => c.label), 'ĐTBmhk* (Nháp)', 'ĐTBmhk (Chính thức)'];
    const lines = [headers.join(',')];

    clsObj.students.forEach((stu, idx) => {
      const termMap = (stu.scores && stu.scores[String(state.term)]) || {};
      const av = computeStudentAverages(stu, state.term);
      const row = [
        idx + 1,
        `"${String(stu.fullName || '').replace(/"/g, '""')}"`,
        `"${String(formatDobVNAdmin(stu.dob) || '').replace(/"/g, '""')}"`,
        ...cols.map((c) => {
          const cell = normalizeCell(termMap[c.key]);
          return cell ? formatScoreCell(cell.val) : '';
        }),
        formatAvgScore(av.avgDraft),
        formatAvgScore(av.avgOfficial),
      ];
      lines.push(row.join(','));
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SoDiem_${state.selectedClass.replace(/[^0-9A-Za-z_-]/g, '_')}_HK${state.term}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Đã xuất file Excel/CSV Sổ điểm!', 'success');
  }

  // =========================================================
  // THỐNG KÊ & SO SÁNH ĐIỂM ĐÁNH GIÁ GIỮA KÌ / CUỐI KÌ (TAB MỚI)
  // =========================================================
  function getStatsOrigVal(stu, term, type) {
    const termMap = (stu?.scores && stu.scores[String(term)]) || {};
    const cell = normalizeCell(termMap[type]);
    return cell ? cell.val : null;
  }

  function getStatsAdjInfo(stu, term, type) {
    const termMap = (stu?.scores && stu.scores[String(term)]) || {};
    const origVal = getStatsOrigVal(stu, term, type);
    const adjKey = type === 'ck' ? 'ckAdj' : 'gkAdj';
    const rawAdj = termMap[adjKey];
    if (rawAdj !== undefined && rawAdj !== null && rawAdj !== '') {
      const cell = normalizeCell(rawAdj);
      if (cell && cell.val !== null) {
        const isModified = origVal === null || Math.abs(cell.val - origVal) > 1e-9;
        return { val: cell.val, isModified, isExplicit: true };
      }
    }
    return { val: origVal, isModified: false, isExplicit: false };
  }

  function getStatsScopeData() {
    const allClasses = getMergedClassList().filter(
      (c) => (state.data.classes[c.name]?.students?.length || 0) > 0
    );
    const grades = [...new Set(allClasses.map((c) => c.grade).filter(Boolean))].sort((a, b) => Number(a) - Number(b));

    let scope = state.statsScope || 'overview';
    if (scope === 'all' || scope.startsWith('grade:')) {
      scope = 'overview';
    } else if (scope.startsWith('class:')) {
      const clsName = scope.slice('class:'.length);
      if (!allClasses.some((c) => c.name === clsName)) {
        scope = allClasses[0] ? `class:${allClasses[0].name}` : 'overview';
      }
    } else if (scope !== 'overview') {
      scope = allClasses[0] ? `class:${allClasses[0].name}` : 'overview';
    }
    state.statsScope = scope;

    const isOverview = scope === 'overview';
    let classesInScope = allClasses;
    let activeClassName = '';
    let scopeTitle = `Tổng quan (${allClasses.length} lớp)`;

    if (!isOverview && scope.startsWith('class:')) {
      activeClassName = scope.slice('class:'.length);
      classesInScope = allClasses.filter((c) => c.name === activeClassName);
      scopeTitle = `Lớp ${activeClassName}`;
    }

    const entries = [];
    for (const c of classesInScope) {
      const stuList = state.data.classes[c.name]?.students || [];
      for (const stu of stuList) {
        entries.push({ className: c.name, grade: c.grade, stu });
      }
    }

    return { allClasses, grades, classesInScope, isOverview, activeClassName, scopeTitle, entries };
  }

  function computeScoreDistribution(entries, getValFn) {
    let scored = 0;
    let sum = 0;
    let good = 0;
    let fair = 0;
    let pass = 0;
    let low = 0;

    for (const item of entries) {
      const v = getValFn(item);
      if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
      const n = Number(v);
      scored += 1;
      sum += n;
      if (n >= 8.0) good += 1;
      else if (n >= 6.5) fair += 1;
      else if (n >= 5.0) pass += 1;
      else low += 1;
    }

    const passUp = good + fair + pass;
    return {
      total: entries.length,
      scored,
      good,
      fair,
      pass,
      low,
      passUp,
      avg: scored > 0 ? Math.round((sum / scored) * 10) / 10 : null,
      pctGood: scored > 0 ? (good / scored) * 100 : 0,
      pctFair: scored > 0 ? (fair / scored) * 100 : 0,
      pctPass: scored > 0 ? (pass / scored) * 100 : 0,
      pctLow: scored > 0 ? (low / scored) * 100 : 0,
      pctPassUp: scored > 0 ? (passUp / scored) * 100 : 0,
    };
  }

  function syncStatsRouteUrl() {
    if (typeof onRouteChange === 'function') {
      const qs = new URLSearchParams({
        type: state.statsType,
        term: String(state.term),
        scope: state.statsScope || 'all',
      });
      onRouteChange(`/so-diem/thong-ke?${qs.toString()}`, { replace: true });
    }
    const label = state.statsType === 'ck' ? 'Đánh giá cuối kì' : 'Đánh giá giữa kì';
    document.title = `Thống kê ${label} — Lớp toán thầy Hoàng`;
  }

  function renderStatsBarRowHtml(label, dist) {
    const denom = dist.scored || 0;
    const pG = denom ? (dist.good / denom) * 100 : 0;
    const pF = denom ? (dist.fair / denom) * 100 : 0;
    const pP = denom ? (dist.pass / denom) * 100 : 0;
    const pL = denom ? (dist.low / denom) * 100 : 0;
    return `
      <div class="gbs-bar-row">
        <div class="gbs-bar-lbl">${escapeHtml(label)}</div>
        <div class="gbs-bar-track" title="Tốt: ${pG.toFixed(1)}% • Khá: ${pF.toFixed(1)}% • Đạt: ${pP.toFixed(1)}% • CĐ: ${pL.toFixed(1)}%">
          ${pG > 0 ? `<div class="gbs-bar-seg is-good" style="width:${pG.toFixed(2)}%"></div>` : ''}
          ${pF > 0 ? `<div class="gbs-bar-seg is-fair" style="width:${pF.toFixed(2)}%"></div>` : ''}
          ${pP > 0 ? `<div class="gbs-bar-seg is-pass" style="width:${pP.toFixed(2)}%"></div>` : ''}
          ${pL > 0 ? `<div class="gbs-bar-seg is-low" style="width:${pL.toFixed(2)}%"></div>` : ''}
        </div>
        <div class="gbs-bar-meta">${denom > 0 ? `≥ 5,0: <strong>${dist.pctPassUp.toFixed(1)}%</strong>` : 'Chưa có điểm'}</div>
      </div>
    `;
  }

  function renderStatsSummaryHtml(scopeData) {
    const { allClasses, grades, isOverview, entries } = scopeData;
    const type = state.statsType;
    const colLabel = type === 'ck' ? 'ĐĐGck' : 'ĐĐGgk';
    const colStarLabel = type === 'ck' ? 'ĐĐGck*' : 'ĐĐGgk*';

    const origDist = computeScoreDistribution(entries, ({ stu }) => getStatsOrigVal(stu, state.term, type));
    const adjDist = computeScoreDistribution(entries, ({ stu }) => getStatsAdjInfo(stu, state.term, type).val);

    const rowsSpec = [
      { key: 'good', label: 'Tốt (≥ 8,0)', cls: 'is-good', orig: origDist.good, adj: adjDist.good, oPct: origDist.pctGood, aPct: adjDist.pctGood },
      { key: 'fair', label: 'Khá (6,5 – 7,9)', cls: 'is-fair', orig: origDist.fair, adj: adjDist.fair, oPct: origDist.pctFair, aPct: adjDist.pctFair },
      { key: 'pass', label: 'Đạt (5,0 – 6,4)', cls: 'is-pass', orig: origDist.pass, adj: adjDist.pass, oPct: origDist.pctPass, aPct: adjDist.pctPass },
      { key: 'low', label: 'Chưa đạt (< 5,0)', cls: 'is-low', orig: origDist.low, adj: adjDist.low, oPct: origDist.pctLow, aPct: adjDist.pctLow },
    ];

    const renderBreakdownRow = (labelHtml, clsEntries, { clickableClass = '', rowClass = '' } = {}) => {
      const d = computeScoreDistribution(clsEntries, ({ stu }) =>
        state.statsPerClassMode === 'orig'
          ? getStatsOrigVal(stu, state.term, type)
          : getStatsAdjInfo(stu, state.term, type).val
      );
      return `
        <tr class="${rowClass} ${clickableClass ? 'gbs-clickable-row' : ''}" ${clickableClass ? `data-gbs-jump-class="${escapeAttr(clickableClass)}" title="Bấm để xem &amp; chỉnh sửa lớp ${escapeAttr(clickableClass)}"` : ''}>
          <td>${labelHtml}</td>
          <td style="text-align:center; font-family:var(--font-mono);">${d.scored}/${d.total}</td>
          <td style="text-align:center;"><span class="gb-tier-pill is-good">${d.good} (${formatPct(d.good, d.scored)})</span></td>
          <td style="text-align:center;"><span class="gb-tier-pill is-fair">${d.fair} (${formatPct(d.fair, d.scored)})</span></td>
          <td style="text-align:center;"><span class="gb-tier-pill is-pass">${d.pass} (${formatPct(d.pass, d.scored)})</span></td>
          <td style="text-align:center;"><span class="gb-tier-pill is-low">${d.low} (${formatPct(d.low, d.scored)})</span></td>
          <td style="text-align:center; font-family:var(--font-mono); font-weight:700;">${d.passUp} (${formatPct(d.passUp, d.scored)})</td>
          <td style="text-align:center; font-family:var(--font-mono); font-weight:800;">${d.avg !== null ? formatAvgScore(d.avg) : '—'}</td>
        </tr>
      `;
    };

    const overviewClassesHtml =
      isOverview && allClasses.length > 0
        ? `
          <div class="card gbs-card">
            <div class="gbs-card-head">
              <div>
                <h3>Chi tiết từng lớp (${allClasses.length} lớp)</h3>
              </div>
              <div class="an-seg-toggle" role="tablist">
                <button type="button" class="an-seg-btn ${state.statsPerClassMode === 'orig' ? 'active' : ''}" data-gbs-cls-mode="orig">${escapeHtml(colLabel)}</button>
                <button type="button" class="an-seg-btn ${state.statsPerClassMode === 'adj' ? 'active' : ''}" data-gbs-cls-mode="adj">${escapeHtml(colStarLabel)}</button>
              </div>
            </div>
            <div style="overflow-x:auto;">
              <table class="data-table gbs-summary-table">
                <thead>
                  <tr>
                    <th>Lớp / Khối</th>
                    <th style="text-align:center;">Sĩ số</th>
                    <th style="text-align:center;">Tốt</th>
                    <th style="text-align:center;">Khá</th>
                    <th style="text-align:center;">Đạt</th>
                    <th style="text-align:center;">Chưa đạt</th>
                    <th style="text-align:center;">≥ 5,0</th>
                    <th style="text-align:center;">ĐTB</th>
                  </tr>
                </thead>
                <tbody>
                  ${allClasses
                    .map((c) => {
                      const clsEntries = entries.filter((e) => e.className === c.name);
                      const modCnt = clsEntries.filter(({ stu }) => getStatsAdjInfo(stu, state.term, type).isModified).length;
                      return renderBreakdownRow(
                        `<strong>Lớp ${escapeHtml(c.name)}</strong>${modCnt > 0 ? ` <span class="gbs-mod-dot" title="${modCnt} HS đang chỉnh sửa">*</span>` : ''}`,
                        clsEntries,
                        { clickableClass: c.name }
                      );
                    })
                    .join('')}
                  ${
                    grades.length >= 2
                      ? grades
                          .map((g) => {
                            const gEntries = entries.filter((e) => e.grade === g);
                            return renderBreakdownRow(`<strong>Tổng Khối ${escapeHtml(g)}</strong>`, gEntries, {
                              rowClass: 'gbs-row-grade',
                            });
                          })
                          .join('')
                      : ''
                  }
                  ${renderBreakdownRow(`<strong>Tổng toàn bộ (${allClasses.length} lớp)</strong>`, entries, {
                    rowClass: 'gbs-row-total',
                  })}
                </tbody>
              </table>
            </div>
          </div>
        `
        : '';

    const diffPassUp = adjDist.passUp - origDist.passUp;
    const diffPassUpPct = adjDist.pctPassUp - origDist.pctPassUp;
    const diffAvg = origDist.avg !== null && adjDist.avg !== null ? adjDist.avg - origDist.avg : null;

    const morphBuckets = rowsSpec.map((r) => {
      const dCnt = r.adj - r.orig;
      return {
        label: r.label,
        shortLabel: r.key === 'good' ? 'Tốt' : r.key === 'fair' ? 'Khá' : r.key === 'pass' ? 'Đạt' : 'Chưa đạt',
        cls: r.cls,
        count: r.adj,
        pct: r.aPct,
        deltaText: dCnt === 0 ? `${colLabel}: ${r.orig} HS` : `${colLabel} → ${colStarLabel}: ${dCnt > 0 ? '+' : ''}${dCnt} HS`,
      };
    });
    const morphMeta = {
      key: 'gb-stats-dist',
      title: `Phổ điểm ${colStarLabel}${scopeData.scopeTitle ? ` — ${scopeData.scopeTitle}` : ''}`,
      avgLabel: `ĐTB ${colStarLabel}`,
      avgVal: adjDist.avg !== null ? formatAvgScore(adjDist.avg) : '—',
      summaryRight: adjDist.scored > 0 ? `Đạt ≥ 5,0: <strong>${adjDist.pctPassUp.toFixed(1).replace('.', ',')}%</strong>` : 'Chưa có điểm',
    };
    state._lastMorphChart = { buckets: morphBuckets, meta: morphMeta };

    return `
      <div class="card gbs-card">
        ${renderMorphBarChartHtml(morphBuckets, morphMeta)}

        <div style="overflow-x:auto;">
          <table class="data-table gbs-summary-table">
            <thead>
              <tr>
                <th>Mức xếp loại</th>
                <th style="text-align:center;">${escapeHtml(colLabel)}</th>
                <th style="text-align:center;" class="gbs-th-star">${escapeHtml(colStarLabel)}</th>
                <th style="text-align:center;">Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              ${rowsSpec
                .map((r) => {
                  const dCnt = r.adj - r.orig;
                  const dPct = r.aPct - r.oPct;
                  const deltaClass =
                    dCnt === 0
                      ? 'is-zero'
                      : r.key === 'low'
                        ? dCnt < 0
                          ? 'is-pos'
                          : 'is-neg'
                        : dCnt > 0
                          ? 'is-pos'
                          : 'is-neg';
                  return `
                    <tr>
                      <td><span class="gb-tier-pill ${r.cls}">${escapeHtml(r.label)}</span></td>
                      <td style="text-align:center; font-family:var(--font-mono);">
                        <strong>${r.orig} HS</strong> <span class="gbs-pct">(${formatPct(r.orig, origDist.scored)})</span>
                      </td>
                      <td style="text-align:center; font-family:var(--font-mono);" class="gbs-td-star">
                        <strong>${r.adj} HS</strong> <span class="gbs-pct">(${formatPct(r.adj, adjDist.scored)})</span>
                      </td>
                      <td style="text-align:center; font-family:var(--font-mono);">
                        <span class="gbs-delta ${deltaClass}">
                          ${dCnt === 0 ? '—' : `${dCnt > 0 ? '+' : ''}${dCnt} HS (${formatDeltaNum(dPct, '%')})`}
                        </span>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
              <tr class="gbs-row-total">
                <td><strong>Đạt trở lên (≥ 5,0)</strong></td>
                <td style="text-align:center; font-family:var(--font-mono);">
                  <strong>${origDist.passUp} / ${origDist.scored} HS</strong> <span class="gbs-pct">(${formatPct(origDist.passUp, origDist.scored)})</span>
                </td>
                <td style="text-align:center; font-family:var(--font-mono);" class="gbs-td-star">
                  <strong>${adjDist.passUp} / ${adjDist.scored} HS</strong> <span class="gbs-pct">(${formatPct(adjDist.passUp, adjDist.scored)})</span>
                </td>
                <td style="text-align:center; font-family:var(--font-mono);">
                  <span class="gbs-delta ${diffPassUp === 0 ? 'is-zero' : diffPassUp > 0 ? 'is-pos' : 'is-neg'}">
                    ${diffPassUp === 0 ? '—' : `${diffPassUp > 0 ? '+' : ''}${diffPassUp} HS (${formatDeltaNum(diffPassUpPct, '%')})`}
                  </span>
                </td>
              </tr>
              <tr class="gbs-row-avg">
                <td><strong>Điểm trung bình</strong></td>
                <td style="text-align:center; font-family:var(--font-mono); font-weight:800;">
                  ${origDist.avg !== null ? formatAvgScore(origDist.avg) : '—'}
                </td>
                <td style="text-align:center; font-family:var(--font-mono); font-weight:800;" class="gbs-td-star">
                  ${adjDist.avg !== null ? formatAvgScore(adjDist.avg) : '—'}
                </td>
                <td style="text-align:center; font-family:var(--font-mono);">
                  <span class="gbs-delta ${!diffAvg || Math.abs(diffAvg) < 1e-9 ? 'is-zero' : diffAvg > 0 ? 'is-pos' : 'is-neg'}">
                    ${diffAvg !== null ? formatDeltaNum(diffAvg) : '—'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="gbs-bars-box">
          ${renderStatsBarRowHtml(colLabel, origDist)}
          ${renderStatsBarRowHtml(colStarLabel, adjDist)}
        </div>
      </div>
      ${overviewClassesHtml}
    `;
  }

  function renderTierCellHtml(origVal, adjVal) {
    const tOrig = getScoreTierInfo(origVal);
    const tAdj = getScoreTierInfo(adjVal);
    if (tAdj.key === 'none') return `<span style="color:var(--text-muted);">—</span>`;
    if (tOrig.key !== 'none' && tOrig.key !== tAdj.key) {
      return `
        <span class="gbs-tier-shift">
          <span class="gb-tier-pill ${tOrig.cls}" style="opacity:0.75;">${tOrig.short}</span>
          <span class="gbs-arrow">→</span>
          <span class="gb-tier-pill ${tAdj.cls}">${tAdj.label}</span>
        </span>
      `;
    }
    return `<span class="gb-tier-pill ${tAdj.cls}">${tAdj.label}</span>`;
  }

  function renderStatsView() {
    syncStatsRouteUrl();
    const scopeData = getStatsScopeData();
    const { allClasses, isOverview, activeClassName, entries } = scopeData;
    const type = state.statsType;
    const isCk = type === 'ck';
    const titleText = isCk ? 'Đánh giá cuối kì' : 'Đánh giá giữa kì';
    const colLabel = isCk ? 'ĐĐGck' : 'ĐĐGgk';
    const colStarLabel = isCk ? 'ĐĐGck*' : 'ĐĐGgk*';

    const q = state.statsSearch.trim().toLowerCase();
    const visibleEntries = entries
      .map((item, idx) => ({ ...item, stt: idx + 1 }))
      .filter(({ stu }) => !q || (stu.fullName || '').toLowerCase().includes(q));

    const modifiedCount = entries.filter(({ stu }) => getStatsAdjInfo(stu, state.term, type).isModified).length;

    rootEl.innerHTML = `
      <div class="gb-shell">
        <!-- Header & Per-Class / Overview Selector -->
        <div class="card gb-header-card">
          <div class="gb-header-top">
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                <button type="button" class="btn btn-ghost btn-sm" id="btnBackToGradebook" style="padding:4px 9px;">
                  ← Về Sổ điểm
                </button>
                <span class="gb-eyebrow" style="margin-bottom:0;">
                  THỐNG KÊ &amp; XEM XÉT ĐIỂM • ${escapeHtml(titleText.toUpperCase())}
                </span>
              </div>

              <!-- Prominent Class Pills + Overview Tab -->
              <div class="gbs-scope-wrap">
                <div class="gb-class-pills gbs-class-pills" role="tablist">
                  <button type="button" class="gb-class-pill gbs-pill-lg is-overview-pill ${isOverview ? 'active' : ''}" data-gbs-scope="overview">
                    <span>Tổng quan</span>
                    <span class="gb-class-cnt">${allClasses.length} lớp</span>
                  </button>
                  ${allClasses
                    .map((c) => {
                      const cnt = state.data.classes[c.name]?.students?.length || 0;
                      const sc = `class:${c.name}`;
                      return `
                        <button type="button" class="gb-class-pill gbs-pill-lg ${state.statsScope === sc ? 'active' : ''}" data-gbs-scope="${escapeAttr(sc)}">
                          <span>Lớp ${escapeHtml(c.name)}</span>
                          <span class="gb-class-cnt">${cnt}</span>
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            </div>

            <div class="gb-header-right">
              <div class="an-seg-toggle" role="tablist">
                <button type="button" class="an-seg-btn ${type === 'gk' ? 'active' : ''}" data-gbs-type="gk">Giữa kì</button>
                <button type="button" class="an-seg-btn ${type === 'ck' ? 'active' : ''}" data-gbs-type="ck">Cuối kì</button>
              </div>
              <div class="an-seg-toggle" role="tablist">
                <button type="button" class="an-seg-btn ${state.term === 1 ? 'active' : ''}" data-gbs-term="1">Học kì I</button>
                <button type="button" class="an-seg-btn ${state.term === 2 ? 'active' : ''}" data-gbs-term="2">Học kì II</button>
              </div>
              <span id="gbSaveStatus" class="gb-save-pill">✓ Đã lưu</span>
            </div>
          </div>

          <div class="gb-toolbar">
            <div class="gb-toolbar-left gbs-toolbar-left">
              ${
                !isOverview
                  ? `
                    <button type="button" class="btn btn-secondary btn-sm" id="btnResetStatsAdj" ${modifiedCount === 0 ? 'disabled' : ''}>
                      Đặt lại ${escapeHtml(colStarLabel)}
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" id="btnApplyStatsAdj" ${modifiedCount === 0 ? 'disabled' : ''}>
                      Áp dụng ${escapeHtml(colStarLabel)} sang ${escapeHtml(colLabel)} (${modifiedCount})
                    </button>
                  `
                  : ''
              }
              <button type="button" class="btn btn-secondary btn-sm" id="btnExportStatsCsv" ${entries.length === 0 ? 'disabled' : ''}>
                Xuất Excel/CSV
              </button>
            </div>
            ${
              !isOverview
                ? `
                  <div class="gb-toolbar-right">
                    <input
                      id="inpGbsSearch"
                      type="search"
                      class="input-control input-compact"
                      placeholder="Tìm tên học sinh Lớp ${escapeAttr(activeClassName)}..."
                      value="${escapeAttr(state.statsSearch)}"
                    />
                  </div>
                `
                : ''
            }
          </div>
        </div>

        <!-- Live Comparison Statistics Summary -->
        <div id="gbStatsSummaryHost" class="gbs-summary-host">
          ${renderStatsSummaryHtml(scopeData)}
        </div>

        <!-- Single-Class Student Comparison Table (hidden on Tổng quan tab) -->
        ${
          !isOverview
            ? `
              <div class="card gb-table-card">
                ${
                  entries.length === 0
                    ? `<div style="text-align:center; padding:42px; color:var(--text-muted);">Lớp này chưa có học sinh nào.</div>`
                    : `
                      <div class="gb-table-scroll">
                        <table class="gb-table gbs-stu-table">
                          <thead>
                            <tr>
                              <th class="gb-col-stt gb-sticky-1">STT</th>
                              <th class="gb-col-name gb-sticky-2">Họ và tên học sinh</th>
                              <th class="gbs-col-orig">${escapeHtml(colLabel)}</th>
                              <th class="gbs-col-star">${escapeHtml(colStarLabel)}</th>
                              <th class="gbs-col-tier">Xếp loại</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${
                              visibleEntries.length === 0
                                ? `<tr><td colspan="5" style="text-align:center; padding:26px; color:var(--text-muted);">Không tìm thấy học sinh nào khớp từ khóa.</td></tr>`
                                : visibleEntries
                                    .map(({ className, stu, stt }) => {
                                      const origVal = getStatsOrigVal(stu, state.term, type);
                                      const adjInfo = getStatsAdjInfo(stu, state.term, type);
                                      const delta =
                                        origVal !== null && adjInfo.val !== null && adjInfo.isModified
                                          ? adjInfo.val - origVal
                                          : null;
                                      const rowKey = `${className}::${stu.id}`;
                                      return `
                                        <tr data-gbs-row="${escapeAttr(rowKey)}" class="${adjInfo.isModified ? 'is-row-adjusted' : ''}">
                                          <td class="gb-col-stt gb-sticky-1">${stt}</td>
                                          <td class="gb-col-name gb-sticky-2">
                                            <div class="gb-stu-fullname">${escapeHtml(stu.fullName)}</div>
                                            ${stu.dob ? `<div class="gb-stu-dob">${escapeHtml(formatDobVNAdmin(stu.dob))}</div>` : ''}
                                          </td>
                                          <td class="gbs-col-orig ${getScoreTierClass(origVal)}">
                                            ${origVal !== null ? escapeHtml(formatScoreCell(origVal)) : '<span style="color:var(--text-muted);">—</span>'}
                                          </td>
                                          <td class="gbs-col-star">
                                            <div class="gbs-star-cell">
                                              <input
                                                type="text"
                                                inputmode="decimal"
                                                class="gb-score-inp gbs-star-inp ${adjInfo.isModified ? 'is-adjusted' : ''}"
                                                data-gbs-cls="${escapeAttr(className)}"
                                                data-gbs-stu="${escapeAttr(stu.id)}"
                                                value="${escapeAttr(adjInfo.val !== null ? formatScoreCell(adjInfo.val) : '')}"
                                                aria-label="${escapeAttr(`${stu.fullName} - ${colStarLabel}`)}"
                                              />
                                              <span class="gbs-inline-delta ${delta === null ? '' : delta > 0 ? 'is-pos' : 'is-neg'}" data-gbs-delta="${escapeAttr(rowKey)}">
                                                ${delta !== null ? formatDeltaNum(delta) : ''}
                                              </span>
                                            </div>
                                          </td>
                                          <td class="gbs-col-tier" data-gbs-tier="${escapeAttr(rowKey)}">
                                            ${renderTierCellHtml(origVal, adjInfo.val)}
                                          </td>
                                        </tr>
                                      `;
                                    })
                                    .join('')
                            }
                          </tbody>
                        </table>
                      </div>
                    `
                }
              </div>
            `
            : ''
        }
      </div>
    `;

    bindStatsEvents();
  }

  function updateStatsInPlace(className, stuId) {
    const scopeData = getStatsScopeData();
    const type = state.statsType;
    const stu = state.data.classes[className]?.students?.find((s) => s.id === stuId);
    if (stu) {
      const origVal = getStatsOrigVal(stu, state.term, type);
      const adjInfo = getStatsAdjInfo(stu, state.term, type);
      const rowKey = `${className}::${stuId}`;
      const tr = rootEl.querySelector(`tr[data-gbs-row="${CSS.escape(rowKey)}"]`);
      tr?.classList.toggle('is-row-adjusted', adjInfo.isModified);

      const delta = origVal !== null && adjInfo.val !== null && adjInfo.isModified ? adjInfo.val - origVal : null;
      const deltaEl = rootEl.querySelector(`[data-gbs-delta="${CSS.escape(rowKey)}"]`);
      if (deltaEl) {
        deltaEl.textContent = delta !== null ? formatDeltaNum(delta) : '';
        deltaEl.className = `gbs-inline-delta ${delta === null ? '' : delta > 0 ? 'is-pos' : 'is-neg'}`;
      }
      const tierEl = rootEl.querySelector(`[data-gbs-tier="${CSS.escape(rowKey)}"]`);
      if (tierEl) {
        tierEl.innerHTML = renderTierCellHtml(origVal, adjInfo.val);
      }
    }

    const summaryHost = rootEl.querySelector('#gbStatsSummaryHost');
    if (summaryHost) {
      summaryHost.innerHTML = renderStatsSummaryHtml(scopeData);
      bindPerClassModeButtons();
    }

    const modifiedCount = scopeData.entries.filter(({ stu: s }) => getStatsAdjInfo(s, state.term, type).isModified).length;
    const colLabel = type === 'ck' ? 'ĐĐGck' : 'ĐĐGgk';
    const colStarLabel = type === 'ck' ? 'ĐĐGck*' : 'ĐĐGgk*';
    const resetBtn = rootEl.querySelector('#btnResetStatsAdj');
    const applyBtn = rootEl.querySelector('#btnApplyStatsAdj');
    if (resetBtn) resetBtn.disabled = modifiedCount === 0;
    if (applyBtn) {
      applyBtn.disabled = modifiedCount === 0;
      applyBtn.textContent = `Áp dụng ${colStarLabel} sang ${colLabel} (${modifiedCount})`;
    }
  }

  function bindPerClassModeButtons() {
    if (state._lastMorphChart) {
      bindMorphBarChart(rootEl, state._lastMorphChart.buckets, state._lastMorphChart.meta);
    }
    rootEl.querySelectorAll('[data-gbs-cls-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.statsPerClassMode = btn.dataset.gbsClsMode === 'orig' ? 'orig' : 'adj';
        const summaryHost = rootEl.querySelector('#gbStatsSummaryHost');
        if (summaryHost) {
          summaryHost.innerHTML = renderStatsSummaryHtml(getStatsScopeData());
          bindPerClassModeButtons();
        }
      });
    });

    rootEl.querySelectorAll('[data-gbs-jump-class]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const clsName = tr.dataset.gbsJumpClass;
        if (!clsName) return;
        state.statsScope = `class:${clsName}`;
        state.statsSearch = '';
        renderStatsView();
      });
    });
  }

  function bindStatsEvents() {
    rootEl.querySelector('#btnBackToGradebook')?.addEventListener('click', () => {
      const { activeClassName } = getStatsScopeData();
      if (activeClassName) state.selectedClass = activeClassName;
      state.view = 'sheet';
      if (typeof onRouteChange === 'function') onRouteChange('/so-diem', { replace: false });
      document.title = 'Sổ điểm — Lớp toán thầy Hoàng';
      render();
    });

    rootEl.querySelectorAll('[data-gbs-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.statsScope = btn.dataset.gbsScope || 'overview';
        state.statsSearch = '';
        renderStatsView();
      });
    });

    rootEl.querySelectorAll('[data-gbs-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextType = btn.dataset.gbsType === 'ck' ? 'ck' : 'gk';
        if (nextType === state.statsType) return;
        state.statsType = nextType;
        renderStatsView();
      });
    });

    rootEl.querySelectorAll('[data-gbs-term]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTerm = Number(btn.dataset.gbsTerm) === 2 ? 2 : 1;
        if (nextTerm === state.term) return;
        state.term = nextTerm;
        renderStatsView();
      });
    });

    bindPerClassModeButtons();

    rootEl.querySelector('#inpGbsSearch')?.addEventListener('input', (e) => {
      state.statsSearch = e.target.value;
      const pos = e.target.selectionStart;
      renderStatsView();
      const inp = rootEl.querySelector('#inpGbsSearch');
      if (inp) {
        inp.focus();
        if (typeof pos === 'number') inp.setSelectionRange(pos, pos);
      }
    });

    // Editable GK* / CK* score inputs with Enter / Up / Down navigation
    const starInputs = Array.from(rootEl.querySelectorAll('.gbs-star-inp'));
    starInputs.forEach((inp, idx) => {
      inp.addEventListener('focus', () => inp.select());

      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const nextIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
          inp.dispatchEvent(new Event('change'));
          if (nextIdx >= 0 && nextIdx < starInputs.length) {
            starInputs[nextIdx].focus();
          }
        }
      });

      inp.addEventListener('change', () => {
        const className = inp.dataset.gbsCls;
        const stuId = inp.dataset.gbsStu;
        const stu = state.data.classes[className]?.students?.find((s) => s.id === stuId);
        if (!stu) return;
        const type = state.statsType;
        const adjKey = type === 'ck' ? 'ckAdj' : 'gkAdj';
        const termMap = ensureStudentTermMap(stu, state.term);
        const origVal = getStatsOrigVal(stu, state.term, type);
        const prevAdj = getStatsAdjInfo(stu, state.term, type);

        const parsed = parseScoreInput(inp.value);
        if (!parsed.valid) {
          showToast('Điểm phải nằm trong khoảng 0 đến 10 (VD: 6.5 hoặc 7,5).', 'error');
          inp.value = prevAdj.val !== null ? formatScoreCell(prevAdj.val) : '';
          return;
        }

        if (parsed.value === null) {
          delete termMap[adjKey];
          inp.value = origVal !== null ? formatScoreCell(origVal) : '';
          inp.classList.remove('is-adjusted');
        } else if (origVal !== null && Math.abs(parsed.value - origVal) < 1e-9) {
          delete termMap[adjKey];
          inp.value = formatScoreCell(origVal);
          inp.classList.remove('is-adjusted');
        } else {
          termMap[adjKey] = { val: parsed.value };
          inp.value = formatScoreCell(parsed.value);
          inp.classList.add('is-adjusted');
        }

        updateStatsInPlace(className, stuId);
        schedulePersist();
      });
    });

    // Reset all adjusted (*) scores in currently selected class back to original
    rootEl.querySelector('#btnResetStatsAdj')?.addEventListener('click', () => {
      const { isOverview, scopeTitle, entries } = getStatsScopeData();
      if (isOverview) return;
      const type = state.statsType;
      const adjKey = type === 'ck' ? 'ckAdj' : 'gkAdj';
      const colLabel = type === 'ck' ? 'ĐĐGck' : 'ĐĐGgk';
      const colStarLabel = type === 'ck' ? 'ĐĐGck*' : 'ĐĐGgk*';
      openModal({
        title: `Đặt lại ${colStarLabel} — ${scopeTitle}`,
        bodyHtml: `<p style="margin:0;">Đặt lại toàn bộ các ô điểm <strong>${escapeHtml(colStarLabel)}</strong> của <strong>${escapeHtml(scopeTitle)}</strong> về đúng <strong>${escapeHtml(colLabel)}</strong>?</p>`,
        footerHtml: `
          <button type="button" class="btn btn-secondary" id="mCancelResetAdj">Hủy</button>
          <button type="button" class="btn btn-danger-outline" id="mConfirmResetAdj">Đặt lại</button>
        `,
        onMount: (m) => {
          m.querySelector('#mCancelResetAdj').addEventListener('click', closeModal);
          m.querySelector('#mConfirmResetAdj').addEventListener('click', async () => {
            for (const { stu } of entries) {
              const termMap = stu.scores && stu.scores[String(state.term)];
              if (termMap && adjKey in termMap) delete termMap[adjKey];
            }
            closeModal();
            await persistNow(`Đã đặt lại ${colStarLabel} của ${scopeTitle} về ${colLabel}!`);
            renderStatsView();
          });
        },
      });
    });

    // Apply adjusted (*) scores strictly for the currently selected class
    rootEl.querySelector('#btnApplyStatsAdj')?.addEventListener('click', () => {
      const { isOverview, scopeTitle, entries } = getStatsScopeData();
      if (isOverview) return;
      const type = state.statsType;
      const adjKey = type === 'ck' ? 'ckAdj' : 'gkAdj';
      const colLabel = type === 'ck' ? 'ĐĐGck' : 'ĐĐGgk';
      const colStarLabel = type === 'ck' ? 'ĐĐGck*' : 'ĐĐGgk*';
      const modEntries = entries.filter(({ stu }) => getStatsAdjInfo(stu, state.term, type).isModified);
      if (modEntries.length === 0) return;
      openModal({
        title: `Áp dụng ${colStarLabel} sang ${colLabel} — ${scopeTitle}`,
        bodyHtml: `<p style="margin:0;">Cập nhật <strong>${modEntries.length} học sinh</strong> đã chỉnh sửa của riêng <strong>${escapeHtml(scopeTitle)}</strong> từ cột <strong>${escapeHtml(colStarLabel)}</strong> sang cột <strong>${escapeHtml(colLabel)}</strong> trong Sổ điểm?</p>`,
        footerHtml: `
          <button type="button" class="btn btn-secondary" id="mCancelApplyAdj">Hủy</button>
          <button type="button" class="btn btn-primary" id="mConfirmApplyAdj">Áp dụng ngay</button>
        `,
        onMount: (m) => {
          m.querySelector('#mCancelApplyAdj').addEventListener('click', closeModal);
          m.querySelector('#mConfirmApplyAdj').addEventListener('click', async () => {
            for (const { stu } of modEntries) {
              const termMap = ensureStudentTermMap(stu, state.term);
              const adjInfo = getStatsAdjInfo(stu, state.term, type);
              const prevOrig = normalizeCell(termMap[type]);
              if (adjInfo.val !== null) {
                const baseOrigVal =
                  prevOrig && prevOrig.origVal !== null
                    ? prevOrig.origVal
                    : prevOrig
                      ? prevOrig.val
                      : null;
                const stillDiff = baseOrigVal === null || Math.abs(adjInfo.val - baseOrigVal) > 1e-9;
                const nextCell = {
                  val: adjInfo.val,
                  draft: Boolean(prevOrig && prevOrig.draft),
                };
                if (stillDiff) {
                  nextCell.adjusted = true;
                  if (baseOrigVal !== null) nextCell.origVal = baseOrigVal;
                }
                termMap[type] = nextCell;
              }
              delete termMap[adjKey];
            }
            closeModal();
            await persistNow(`Đã cập nhật ${modEntries.length} điểm vào ${colLabel} của ${scopeTitle}!`);
            renderStatsView();
          });
        },
      });
    });

    rootEl.querySelector('#btnExportStatsCsv')?.addEventListener('click', exportStatsCsv);
  }

  function exportStatsCsv() {
    const { scopeTitle, entries } = getStatsScopeData();
    if (entries.length === 0) return;
    const type = state.statsType;
    const colLabel = type === 'ck' ? 'ĐĐGck' : 'ĐĐGgk';
    const colStarLabel = type === 'ck' ? 'ĐĐGck*' : 'ĐĐGgk*';
    const origDist = computeScoreDistribution(entries, ({ stu }) => getStatsOrigVal(stu, state.term, type));
    const adjDist = computeScoreDistribution(entries, ({ stu }) => getStatsAdjInfo(stu, state.term, type).val);

    const lines = [
      `"THỐNG KÊ ${type === 'ck' ? 'ĐÁNH GIÁ CUỐI KÌ' : 'ĐÁNH GIÁ GIỮA KÌ'} — ${scopeTitle} — HK ${state.term === 2 ? 'II' : 'I'}"`,
      `Mức xếp loại,"${colLabel} (SL)","${colLabel} (%)","${colStarLabel} (SL)","${colStarLabel} (%)"`,
      `Tốt (>= 8.0),${origDist.good},${formatPct(origDist.good, origDist.scored)},${adjDist.good},${formatPct(adjDist.good, adjDist.scored)}`,
      `Khá (6.5 - 7.9),${origDist.fair},${formatPct(origDist.fair, origDist.scored)},${adjDist.fair},${formatPct(adjDist.fair, adjDist.scored)}`,
      `Đạt (5.0 - 6.4),${origDist.pass},${formatPct(origDist.pass, origDist.scored)},${adjDist.pass},${formatPct(adjDist.pass, adjDist.scored)}`,
      `Chưa đạt (< 5.0),${origDist.low},${formatPct(origDist.low, origDist.scored)},${adjDist.low},${formatPct(adjDist.low, adjDist.scored)}`,
      `Đạt trở lên (>= 5.0),${origDist.passUp},${formatPct(origDist.passUp, origDist.scored)},${adjDist.passUp},${formatPct(adjDist.passUp, adjDist.scored)}`,
      `Sĩ số (có điểm / tổng),${origDist.scored}/${origDist.total},,${adjDist.scored}/${adjDist.total},`,
      `Điểm TB,${origDist.avg !== null ? formatAvgScore(origDist.avg) : ''},,${adjDist.avg !== null ? formatAvgScore(adjDist.avg) : ''},`,
      '',
      `STT,Lớp,Họ và tên,Ngày sinh,${colLabel},${colStarLabel},Xếp loại (${colStarLabel})`,
    ];

    entries.forEach(({ className, stu }, idx) => {
      const origVal = getStatsOrigVal(stu, state.term, type);
      const adjInfo = getStatsAdjInfo(stu, state.term, type);
      const tier = getScoreTierInfo(adjInfo.val);
      lines.push(
        [
          idx + 1,
          `"${className}"`,
          `"${String(stu.fullName || '').replace(/"/g, '""')}"`,
          `"${String(formatDobVNAdmin(stu.dob) || '').replace(/"/g, '""')}"`,
          origVal !== null ? formatScoreCell(origVal) : '',
          adjInfo.val !== null ? formatScoreCell(adjInfo.val) : '',
          `"${tier.label}"`,
        ].join(',')
      );
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ThongKe_${type.toUpperCase()}_${state.statsScope.replace(/[^0-9A-Za-z_-]/g, '_')}_HK${state.term}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Đã xuất file Excel/CSV thống kê!', 'success');
  }

  return { init };
}
