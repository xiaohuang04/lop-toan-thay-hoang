import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';

function formatDateTimeVNAdmin(iso) {
  if (!iso) return 'Chưa có';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = d.getMonth() + 1;
  const mmStr = mm === 1 || mm === 2 ? `0${mm}` : String(mm);
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mmStr}/${yyyy} ${hh}:${mi}`;
}

function getRangeCutoffMs(rangeKey) {
  if (rangeKey === 'all') return 0;
  const now = new Date();
  if (rangeKey === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return start.getTime();
  }
  const days = rangeKey === '7d' ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function buildAnalyticsSnapshot({ students, modelsSummary, analytics, range }) {
  const safeAn = analytics && typeof analytics === 'object' ? analytics : {};
  const studentTotals = safeAn.studentTotals && typeof safeAn.studentTotals === 'object' ? safeAn.studentTotals : {};
  const modelTotals = safeAn.modelTotals && typeof safeAn.modelTotals === 'object' ? safeAn.modelTotals : {};
  const events = Array.isArray(safeAn.events) ? safeAn.events : [];

  const studentsById = new Map((students || []).map((s) => [s.id, s]));
  const modelsById = new Map((modelsSummary || []).map((m) => [m.id, m]));

  // Aggregate per-student & per-model metrics for the chosen timeframe
  const stuStats = new Map();
  const mdlStats = new Map();

  for (const s of students || []) {
    stuStats.set(s.id, {
      student: s,
      logins: 0,
      modelClicks: 0,
      lastLoginAt: '',
      lastModelClickAt: '',
      models: new Map(), // modelId -> count
    });
  }

  for (const m of modelsSummary || []) {
    mdlStats.set(m.id, {
      id: m.id,
      name: m.name || 'Mô hình',
      grade: String(m.grade || ''),
      visible: m.visible !== false,
      deleted: false,
      clicks: 0,
      lastClickAt: '',
      students: new Map(), // studentId -> count
    });
  }

  if (range === 'all') {
    // Use lifetime totals (never truncated)
    for (const [uid, st] of Object.entries(studentTotals)) {
      if (!st || typeof st !== 'object') continue;
      if (!stuStats.has(uid)) continue; // skip deleted students from active student table
      const rec = stuStats.get(uid);
      rec.logins = Math.max(0, Number(st.logins) || 0);
      rec.modelClicks = Math.max(0, Number(st.modelClicks) || 0);
      rec.lastLoginAt = String(st.lastLoginAt || '');
      rec.lastModelClickAt = String(st.lastModelClickAt || '');
      if (st.models && typeof st.models === 'object') {
        for (const [mid, cnt] of Object.entries(st.models)) {
          const n = Math.max(0, Number(cnt) || 0);
          if (n > 0) rec.models.set(mid, n);
        }
      }
    }

    for (const [mid, mt] of Object.entries(modelTotals)) {
      if (!mt || typeof mt !== 'object') continue;
      if (!mdlStats.has(mid)) {
        mdlStats.set(mid, {
          id: mid,
          name: mt.name || 'Mô hình đã xóa',
          grade: String(mt.grade || ''),
          visible: false,
          deleted: true,
          clicks: 0,
          lastClickAt: '',
          students: new Map(),
        });
      }
      const rec = mdlStats.get(mid);
      rec.clicks = Math.max(0, Number(mt.clicks) || 0);
      rec.lastClickAt = String(mt.lastClickAt || '');
      if (mt.students && typeof mt.students === 'object') {
        for (const [uid, cnt] of Object.entries(mt.students)) {
          const n = Math.max(0, Number(cnt) || 0);
          if (n > 0) rec.students.set(uid, n);
        }
      }
    }
  } else {
    // Compute accurately from timestamped events within the selected time window
    const cutoff = getRangeCutoffMs(range);
    for (const ev of events) {
      if (!ev || !ev.at) continue;
      const t = new Date(ev.at).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
      const uid = String(ev.studentId || '');
      if (ev.type === 'login') {
        const rec = stuStats.get(uid);
        if (rec) {
          rec.logins += 1;
          if (!rec.lastLoginAt || ev.at > rec.lastLoginAt) rec.lastLoginAt = ev.at;
        }
      } else if (ev.type === 'model_click') {
        const mid = String(ev.modelId || '');
        const sRec = stuStats.get(uid);
        if (sRec) {
          sRec.modelClicks += 1;
          if (!sRec.lastModelClickAt || ev.at > sRec.lastModelClickAt) sRec.lastModelClickAt = ev.at;
          if (mid) sRec.models.set(mid, (sRec.models.get(mid) || 0) + 1);
        }
        if (mid) {
          if (!mdlStats.has(mid)) {
            mdlStats.set(mid, {
              id: mid,
              name: ev.modelName || modelsById.get(mid)?.name || 'Mô hình đã xóa',
              grade: String(ev.grade || modelsById.get(mid)?.grade || ''),
              visible: Boolean(modelsById.get(mid)?.visible),
              deleted: !modelsById.has(mid),
              clicks: 0,
              lastClickAt: '',
              students: new Map(),
            });
          }
          const mRec = mdlStats.get(mid);
          mRec.clicks += 1;
          if (!mRec.lastClickAt || ev.at > mRec.lastClickAt) mRec.lastClickAt = ev.at;
          if (uid) mRec.students.set(uid, (mRec.students.get(uid) || 0) + 1);
        }
      }
    }
  }

  const studentRows = Array.from(stuStats.values()).sort((a, b) => {
    const scoreA = a.logins + a.modelClicks;
    const scoreB = b.logins + b.modelClicks;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.student.fullName || '').localeCompare(b.student.fullName || '', 'vi');
  });

  const modelRows = Array.from(mdlStats.values()).sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    return (a.name || '').localeCompare(b.name || '', 'vi');
  });

  const totalLogins = studentRows.reduce((acc, r) => acc + r.logins, 0);
  const totalModelClicks = modelRows.reduce((acc, r) => acc + r.clicks, 0);
  const activeStudentsCount = studentRows.filter((r) => r.logins > 0 || r.modelClicks > 0).length;
  const topModel = modelRows.length > 0 && modelRows[0].clicks > 0 ? modelRows[0] : null;

  return {
    studentsById,
    modelsById,
    modelTotals,
    studentRows,
    modelRows,
    totalLogins,
    totalModelClicks,
    activeStudentsCount,
    topModel,
  };
}

export function renderAnalyticsAdminSection({ students, classes, modelsSummary, analytics, state }) {
  const range = state.analyticsRange || 'all';
  const view = state.analyticsView || 'students'; // 'students' | 'models'
  const clsFilter = state.analyticsClass || 'all';
  const gradeFilter = state.analyticsGrade || 'all';
  const q = (state.analyticsSearch || '').trim().toLowerCase();

  const snap = buildAnalyticsSnapshot({ students, modelsSummary, analytics, range });

  const filteredStudents = snap.studentRows.filter((r) => {
    if (clsFilter !== 'all' && (r.student.className || '') !== clsFilter) return false;
    if (q) {
      const hay = `${r.student.fullName || ''} ${r.student.username || ''} ${r.student.className || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filteredModels = snap.modelRows.filter((r) => {
    if (gradeFilter !== 'all' && r.grade !== gradeFilter) return false;
    if (q) {
      const hay = `${r.name || ''} toán ${r.grade || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return `
    <!-- Overview KPI Cards -->
    <div class="tui-kpi-grid an-kpi-grid">
      <div class="card tui-kpi-card an-kpi-blue">
        <div class="tui-kpi-lbl">Tổng lượt đăng nhập</div>
        <div class="tui-kpi-val">${snap.totalLogins.toLocaleString('vi-VN')} lượt</div>
      </div>
      <div class="card tui-kpi-card is-ok">
        <div class="tui-kpi-lbl">Tổng lượt xem mô hình</div>
        <div class="tui-kpi-val">${snap.totalModelClicks.toLocaleString('vi-VN')} lượt</div>
      </div>
      <div class="card tui-kpi-card">
        <div class="tui-kpi-lbl">HS đã truy cập</div>
        <div class="tui-kpi-val">${snap.activeStudentsCount} / ${snap.studentRows.length}</div>
      </div>
      <div class="card tui-kpi-card">
        <div class="tui-kpi-lbl">Mô hình xem nhiều nhất</div>
        <div class="tui-kpi-val an-kpi-top-model" title="${escapeAttr(snap.topModel ? snap.topModel.name : '')}">
          ${
            snap.topModel
              ? `${escapeHtml(snap.topModel.name)} <small>(${snap.topModel.clicks})</small>`
              : '<span style="color:var(--text-muted); font-weight:600;">Chưa có</span>'
          }
        </div>
      </div>
    </div>

    <!-- Toolbar: View Toggle + Time Range + Filter + Actions -->
    <div class="section-toolbar an-toolbar">
      <div class="an-seg-toggle" role="tablist">
        <button type="button" class="an-seg-btn ${view === 'students' ? 'active' : ''}" data-an-view="students">
          Theo từng Học sinh (${filteredStudents.length})
        </button>
        <button type="button" class="an-seg-btn ${view === 'models' ? 'active' : ''}" data-an-view="models">
          Theo từng Mô hình (${filteredModels.length})
        </button>
      </div>

      <div class="an-filter-row">
        <select id="selAnRange" class="input-control input-compact">
          <option value="all" ${range === 'all' ? 'selected' : ''}>Tất cả thời gian</option>
          <option value="today" ${range === 'today' ? 'selected' : ''}>Hôm nay</option>
          <option value="7d" ${range === '7d' ? 'selected' : ''}>7 ngày qua</option>
          <option value="30d" ${range === '30d' ? 'selected' : ''}>30 ngày qua</option>
        </select>

        ${
          view === 'students'
            ? `
              <select id="selAnClass" class="input-control input-compact">
                <option value="all" ${clsFilter === 'all' ? 'selected' : ''}>Tất cả các lớp</option>
                ${classes
                  .map(
                    (c) => `<option value="${escapeAttr(c)}" ${clsFilter === c ? 'selected' : ''}>Lớp ${escapeHtml(c)}</option>`
                  )
                  .join('')}
              </select>
            `
            : `
              <select id="selAnGrade" class="input-control input-compact">
                <option value="all" ${gradeFilter === 'all' ? 'selected' : ''}>Tất cả các khối</option>
                <option value="10" ${gradeFilter === '10' ? 'selected' : ''}>Toán 10</option>
                <option value="11" ${gradeFilter === '11' ? 'selected' : ''}>Toán 11</option>
                <option value="12" ${gradeFilter === '12' ? 'selected' : ''}>Toán 12</option>
              </select>
            `
        }

        <input
          id="inpAnSearch"
          type="search"
          class="input-control input-compact"
          placeholder="${view === 'students' ? 'Tìm tên học sinh...' : 'Tìm tên mô hình...'}"
          value="${escapeAttr(state.analyticsSearch || '')}"
        />

        <button type="button" class="btn btn-secondary btn-sm" id="btnAnRefresh">Làm mới</button>
        <button type="button" class="btn btn-danger-outline btn-sm" id="btnAnReset">Đặt lại</button>
      </div>
    </div>

    <!-- Main Detail Table -->
    ${
      view === 'students'
        ? `
          <div class="card an-table-card" style="overflow-x:auto;">
            <table class="data-table an-table an-stu-table">
              <thead>
                <tr>
                  <th>Học sinh</th>
                  <th>Lượt đăng nhập</th>
                  <th>Lượt click mô hình</th>
                  <th>Đăng nhập gần nhất</th>
                  <th style="text-align:right;">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filteredStudents.length === 0
                    ? `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">Không tìm thấy học sinh phù hợp.</td></tr>`
                    : filteredStudents
                        .map(
                          (r) => `
                        <tr>
                          <td class="an-col-main">
                            <div class="tui-stu-name">
                              <strong>${escapeHtml(r.student.fullName)}</strong>
                              ${r.student.className ? `<span class="badge badge-p1">${escapeHtml(r.student.className)}</span>` : ''}
                            </div>
                          </td>
                          <td class="an-col-num">
                            <span class="an-mobile-lbl">Đăng nhập:</span>
                            <span class="badge ${r.logins > 0 ? 'badge-p1' : 'badge-neutral'}">${r.logins} lượt</span>
                          </td>
                          <td class="an-col-num2">
                            <span class="an-mobile-lbl">Mô hình:</span>
                            <span class="badge ${r.modelClicks > 0 ? 'badge-success' : 'badge-neutral'}">${r.modelClicks} lượt</span>
                          </td>
                          <td class="an-col-time ${r.lastLoginAt ? '' : 'is-empty-cell'}">
                            <span class="an-mobile-lbl">Gần nhất:</span>
                            <span style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(formatDateTimeVNAdmin(r.lastLoginAt))}</span>
                          </td>
                          <td class="an-col-act" style="text-align:right; white-space:nowrap;">
                            <button type="button" class="btn btn-secondary btn-sm" data-an-stu-detail="${escapeAttr(r.student.id)}">
                              Xem chi tiết
                            </button>
                          </td>
                        </tr>
                      `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="card an-table-card" style="overflow-x:auto;">
            <table class="data-table an-table an-mdl-table">
              <thead>
                <tr>
                  <th>Tên mô hình</th>
                  <th>Tổng lượt click</th>
                  <th>Số HS đã xem</th>
                  <th>Lần xem gần nhất</th>
                  <th style="text-align:right;">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filteredModels.length === 0
                    ? `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">Chưa có mô hình nào phù hợp.</td></tr>`
                    : filteredModels
                        .map(
                          (r) => `
                        <tr>
                          <td class="an-col-main">
                            <div class="tui-stu-name">
                              <strong>${escapeHtml(r.name)}</strong>
                              ${r.grade ? `<span class="badge badge-p2">Toán ${escapeHtml(r.grade)}</span>` : ''}
                              ${r.deleted ? `<span class="badge badge-neutral">Đã xóa</span>` : ''}
                            </div>
                          </td>
                          <td class="an-col-num">
                            <span class="an-mobile-lbl">Lượt click:</span>
                            <span class="badge ${r.clicks > 0 ? 'badge-success' : 'badge-neutral'}">${r.clicks} lượt</span>
                          </td>
                          <td class="an-col-num2">
                            <span class="an-mobile-lbl">Số HS:</span>
                            <span class="badge badge-neutral">${r.students.size} HS</span>
                          </td>
                          <td class="an-col-time ${r.lastClickAt ? '' : 'is-empty-cell'}">
                            <span class="an-mobile-lbl">Gần nhất:</span>
                            <span style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(formatDateTimeVNAdmin(r.lastClickAt))}</span>
                          </td>
                          <td class="an-col-act" style="text-align:right; white-space:nowrap;">
                            <button type="button" class="btn btn-secondary btn-sm" data-an-mdl-detail="${escapeAttr(r.id)}">
                              Xem chi tiết
                            </button>
                          </td>
                        </tr>
                      `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        `
    }
  `;
}

export function bindAnalyticsAdminEvents({
  rootEl,
  students,
  modelsSummary,
  analytics,
  state,
  uiHelpers,
  onRefresh,
  onResetAnalytics,
  onRender,
}) {
  const { openModal, closeModal } = uiHelpers;
  const range = state.analyticsRange || 'all';
  const snap = buildAnalyticsSnapshot({ students, modelsSummary, analytics, range });

  rootEl.querySelectorAll('[data-an-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.analyticsView = btn.dataset.anView;
      onRender();
    });
  });

  rootEl.querySelector('#selAnRange')?.addEventListener('change', (e) => {
    state.analyticsRange = e.target.value;
    onRender();
  });

  rootEl.querySelector('#selAnClass')?.addEventListener('change', (e) => {
    state.analyticsClass = e.target.value;
    onRender();
  });

  rootEl.querySelector('#selAnGrade')?.addEventListener('change', (e) => {
    state.analyticsGrade = e.target.value;
    onRender();
  });

  rootEl.querySelector('#inpAnSearch')?.addEventListener('input', (e) => {
    state.analyticsSearch = e.target.value;
    const pos = e.target.selectionStart;
    onRender();
    const inp = rootEl.querySelector('#inpAnSearch');
    if (inp) {
      inp.focus();
      if (typeof pos === 'number') inp.setSelectionRange(pos, pos);
    }
  });

  rootEl.querySelector('#btnAnRefresh')?.addEventListener('click', () => onRefresh());

  rootEl.querySelector('#btnAnReset')?.addEventListener('click', () => {
    openModal({
      title: 'Đặt lại dữ liệu thống kê',
      bodyHtml: `<p style="margin:0;">Bạn có chắc chắn muốn xóa toàn bộ số lượt đăng nhập và lượt click mô hình về <strong>0</strong>?</p>`,
      footerHtml: `
        <button type="button" class="btn btn-secondary" id="mCancelResetAn">Hủy</button>
        <button type="button" class="btn btn-danger-outline" id="mConfirmResetAn">Đặt lại về 0</button>
      `,
      onMount: (m) => {
        m.querySelector('#mCancelResetAn').addEventListener('click', closeModal);
        m.querySelector('#mConfirmResetAn').addEventListener('click', async () => {
          closeModal();
          await onResetAnalytics();
        });
      },
    });
  });

  // Drill-down: Single Student's model clicks
  rootEl.querySelectorAll('[data-an-stu-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.anStuDetail;
      const row = snap.studentRows.find((r) => r.student.id === uid);
      if (!row) return;
      const modelEntries = Array.from(row.models.entries())
        .map(([mid, cnt]) => {
          const m = snap.modelsById.get(mid) || snap.modelTotals[mid];
          return {
            name: m?.name || 'Mô hình đã xóa',
            grade: m?.grade ? `Toán ${m.grade}` : '',
            count: cnt,
          };
        })
        .sort((a, b) => b.count - a.count);

      openModal({
        title: `Thống kê truy cập — ${row.student.fullName}`,
        bodyHtml: `
          <div class="tl-detail-time" style="margin-bottom:14px;">
            ${row.student.className ? `Lớp ${escapeHtml(row.student.className)} • ` : ''}Đăng nhập: <strong>${row.logins}</strong> lượt • Xem mô hình: <strong>${row.modelClicks}</strong> lượt
          </div>
          <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">
            Lần đăng nhập gần nhất: <strong>${escapeHtml(formatDateTimeVNAdmin(row.lastLoginAt))}</strong>
          </div>
          <div style="font-size:0.84rem; font-weight:800; color:var(--text); margin-bottom:8px;">Các mô hình đã click xem</div>
          ${
            modelEntries.length === 0
              ? `<div class="tl-gear-empty">Học sinh này chưa click vào mô hình nào trong khoảng thời gian đang chọn.</div>`
              : `
                <div class="tl-gear-mods-list">
                  ${modelEntries
                    .map(
                      (item) => `
                    <div class="tl-gear-mod-item">
                      <div class="tl-gear-mod-info">
                        ${item.grade ? `<span class="badge badge-p2">${escapeHtml(item.grade)}</span>` : ''}
                        <div class="tl-gear-mod-title">${escapeHtml(item.name)}</div>
                      </div>
                      <span class="badge badge-success">${item.count} lượt</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
          }
        `,
        footerHtml: `<button type="button" class="btn btn-primary" id="mCloseAnDetail">Đóng</button>`,
        onMount: (m) => {
          m.querySelector('#mCloseAnDetail').addEventListener('click', closeModal);
        },
      });
    });
  });

  // Drill-down: Single Model's student viewers
  rootEl.querySelectorAll('[data-an-mdl-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mid = btn.dataset.anMdlDetail;
      const row = snap.modelRows.find((r) => r.id === mid);
      if (!row) return;
      const stuEntries = Array.from(row.students.entries())
        .map(([uid, cnt]) => {
          const s = snap.studentsById.get(uid);
          return {
            name: s?.fullName || 'Học sinh đã xóa',
            className: s?.className || '',
            count: cnt,
          };
        })
        .sort((a, b) => b.count - a.count);

      openModal({
        title: `Lượt xem mô hình — ${row.name}`,
        bodyHtml: `
          <div class="tl-detail-time" style="margin-bottom:14px;">
            ${row.grade ? `Toán ${escapeHtml(row.grade)} • ` : ''}Tổng: <strong>${row.clicks}</strong> lượt click • <strong>${row.students.size}</strong> học sinh đã xem
          </div>
          <div style="font-size:0.84rem; font-weight:800; color:var(--text); margin-bottom:8px;">Chi tiết theo từng học sinh</div>
          ${
            stuEntries.length === 0
              ? `<div class="tl-gear-empty">Chưa có học sinh nào click vào mô hình này trong khoảng thời gian đang chọn.</div>`
              : `
                <div class="tl-gear-mods-list">
                  ${stuEntries
                    .map(
                      (item) => `
                    <div class="tl-gear-mod-item">
                      <div class="tl-gear-mod-info">
                        ${item.className ? `<span class="badge badge-p1">${escapeHtml(item.className)}</span>` : ''}
                        <div class="tl-gear-mod-title">${escapeHtml(item.name)}</div>
                      </div>
                      <span class="badge badge-success">${item.count} lượt</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
          }
        `,
        footerHtml: `<button type="button" class="btn btn-primary" id="mCloseMdlDetail">Đóng</button>`,
        onMount: (m) => {
          m.querySelector('#mCloseMdlDetail').addEventListener('click', closeModal);
        },
      });
    });
  });
}
