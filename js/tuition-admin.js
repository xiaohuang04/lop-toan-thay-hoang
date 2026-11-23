import {
  escapeHtml,
  escapeAttr,
  parseVnDateOnlyToIso,
} from './exam-engine.js?v=20261123d';

export function formatVnd(amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  return `${n.toLocaleString('vi-VN')} ₫`;
}

export function vndToK(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const k = Math.round((n / 1000) * 100) / 100;
  return String(k);
}

export function kToVnd(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 1000);
}

function iterMonthKeys(startMonth, endMonth) {
  const ms = String(startMonth || '').match(/^(\d{4})-(\d{2})$/);
  const me = String(endMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!ms || !me) return me ? [endMonth] : [];
  let sy = Number(ms[1]);
  let sm = Number(ms[2]);
  const ey = Number(me[1]);
  const em = Number(me[2]);
  if (sy > ey || (sy === ey && sm > em)) return [];
  const out = [];
  let guard = 0;
  while ((sy < ey || (sy === ey && sm <= em)) && guard < 48) {
    out.push(`${String(sy).padStart(4, '0')}-${String(sm).padStart(2, '0')}`);
    sm += 1;
    if (sm > 12) {
      sm = 1;
      sy += 1;
    }
    guard += 1;
  }
  return out;
}

export function formatVnMonthLabel(monthKey) {
  const m = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(monthKey || '');
  const mm = Number(m[2]);
  const mmStr = mm === 1 || mm === 2 ? `0${mm}` : String(mm);
  return `Tháng ${mmStr}/${m[1]}`;
}

export function formatDateVNAdmin(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  const mm = Number(m[2]);
  const mmStr = mm === 1 || mm === 2 ? `0${mm}` : String(mm);
  return `${m[3]}/${mmStr}/${m[1]}`;
}

export function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getTodayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftMonthKey(monthKey, delta) {
  const m = String(monthKey || getCurrentMonthKey()).match(/^(\d{4})-(\d{2})$/);
  const y = m ? Number(m[1]) : new Date().getFullYear();
  const mo = m ? Number(m[2]) - 1 : new Date().getMonth();
  const d = new Date(y, mo + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildMonthChoices(centerMonth, back = 12, forward = 12) {
  const out = [];
  for (let i = -back; i <= forward; i++) {
    out.push(shiftMonthKey(centerMonth, i));
  }
  return out;
}

export function ensureTuitionObj(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  if (!Array.isArray(t.defaultRates) || t.defaultRates.length === 0) {
    t.defaultRates = [{ id: 'rate-default-1', fromMonth: '2026-09', amount: 300000, note: 'Mức định mức chung' }];
  }
  if (!t.classRateHistory || typeof t.classRateHistory !== 'object') t.classRateHistory = {};
  if (!t.monthAdjustments || typeof t.monthAdjustments !== 'object') t.monthAdjustments = {};
  if (!t.studentOverrides || typeof t.studentOverrides !== 'object') t.studentOverrides = {};
  if (!t.payments || typeof t.payments !== 'object') t.payments = {};
  return t;
}

function computeRawMonthFee(student, tuition, monthKey) {
  const cls = String(student.className || '').trim();
  const stuId = String(student.id || '');

  const classHist =
    cls && Array.isArray(tuition.classRateHistory[cls]) && tuition.classRateHistory[cls].length > 0
      ? tuition.classRateHistory[cls]
      : tuition.defaultRates;
  const sortedRates = [...classHist]
    .filter((r) => r && r.fromMonth)
    .sort((a, b) => String(a.fromMonth).localeCompare(String(b.fromMonth)));

  let pickedRate = null;
  for (const r of sortedRates) {
    if (String(r.fromMonth) <= monthKey) pickedRate = r;
  }
  if (!pickedRate && sortedRates.length > 0) pickedRate = sortedRates[0];

  const baseAmount = pickedRate ? Math.max(0, Math.round(Number(pickedRate.amount) || 0)) : 0;
  let monthFee = baseAmount;
  let source = 'default';
  let adjustmentNote = '';

  const mAdjs = tuition.monthAdjustments[monthKey];
  if (mAdjs && typeof mAdjs === 'object') {
    const adj = (cls && mAdjs[cls]) || mAdjs.__all__ || null;
    if (adj && typeof adj === 'object') {
      const val = Math.round(Number(adj.value) || 0);
      if (adj.mode === 'delta') monthFee = Math.max(0, baseAmount + val);
      else monthFee = Math.max(0, val);
      source = 'adjusted';
      adjustmentNote = String(adj.note || '').trim();
    }
  }

  const key = `${stuId}|${monthKey}`;
  const ov = tuition.studentOverrides[key];
  if (ov && typeof ov === 'object' && ov.amount !== undefined && ov.amount !== null) {
    monthFee = Math.max(0, Math.round(Number(ov.amount) || 0));
    source = 'custom';
    adjustmentNote = String(ov.note || '').trim();
  }

  return { baseAmount, monthFee, source, adjustmentNote };
}

export function computeStudentMonthTuition(student, rawTuition, monthKey) {
  const tuition = ensureTuitionObj(rawTuition);
  const stuId = String(student.id || '');
  const startDate = String(student.startDate || student.createdAt || '').slice(0, 10);
  const startMonth = /^\d{4}-\d{2}/.test(startDate) ? startDate.slice(0, 7) : '';

  const notEnrolled = Boolean(startMonth && monthKey < startMonth);
  const targetKey = `${stuId}|${monthKey}`;
  if (notEnrolled) {
    return {
      key: targetKey,
      monthKey,
      notEnrolled: true,
      startDate,
      baseAmount: 0,
      monthFee: 0,
      carryFromPrev: 0,
      carryFromMonth: '',
      carryFromMonthLabel: '',
      amount: 0,
      source: 'default',
      adjustmentNote: '',
      paid: false,
      paidAt: '',
      paidAmount: 0,
      balanceDiff: 0,
      method: '',
      payNote: '',
    };
  }

  const chainStart = startMonth && startMonth <= monthKey ? startMonth : monthKey;
  const chain = iterMonthKeys(chainStart, monthKey);
  const monthsChain = chain.length > 0 ? chain : [monthKey];

  let prevBalance = 0; // > 0 = overpaid (credit next month); < 0 = underpaid (added to next month)
  let prevMonthKey = '';
  let result = null;

  for (const mk of monthsChain) {
    const raw = computeRawMonthFee(student, tuition, mk);
    const carryFromPrev = prevBalance;
    const carryFromMonth = carryFromPrev !== 0 ? prevMonthKey : '';
    const rawDue = raw.monthFee - carryFromPrev;
    const amount = Math.max(0, rawDue);

    const key = `${stuId}|${mk}`;
    const pay = tuition.payments[key];
    const paid = Boolean(pay && pay.paid);
    const paidAt = paid ? String(pay.paidAt || '').trim() : '';
    const paidAmount = paid ? Math.max(0, Math.round(Number(pay.amount ?? amount) || 0)) : 0;
    const method = paid ? String(pay.method || 'transfer') : '';
    const payNote = paid ? String(pay.note || '').trim() : '';

    let balanceDiff = 0;
    let nextBalance = 0;
    if (paid) {
      balanceDiff = paidAmount - rawDue;
      nextBalance = balanceDiff;
    } else {
      balanceDiff = 0;
      nextBalance = rawDue < 0 ? -rawDue : 0;
    }

    result = {
      key,
      monthKey: mk,
      notEnrolled: false,
      startDate,
      baseAmount: raw.baseAmount,
      monthFee: raw.monthFee,
      carryFromPrev,
      carryFromMonth,
      carryFromMonthLabel: carryFromMonth ? formatVnMonthLabel(carryFromMonth) : '',
      amount,
      source: raw.source,
      adjustmentNote: raw.adjustmentNote,
      paid,
      paidAt,
      paidAmount,
      balanceDiff,
      method,
      payNote,
    };
    prevBalance = nextBalance;
    prevMonthKey = mk;
  }

  return result;
}

export function countMonthUnpaid(students, rawTuition, monthKey = getCurrentMonthKey()) {
  let unpaid = 0;
  for (const s of students || []) {
    const info = computeStudentMonthTuition(s, rawTuition, monthKey);
    if (!info.notEnrolled && !info.paid && info.amount > 0) unpaid++;
  }
  return unpaid;
}

function methodLabel(m) {
  return m === 'cash' ? 'Tiền mặt' : 'Chuyển khoản';
}

export function renderTuitionAdminSection({ students, classes, tuition: rawTuition, state }) {
  const tuition = ensureTuitionObj(rawTuition);
  const curMonth = getCurrentMonthKey();
  const selMonth = state.tuitionMonth || curMonth;
  const selClass = state.tuitionClass || 'all';
  const selStatus = state.tuitionStatus || 'all';
  const monthChoices = buildMonthChoices(curMonth, 12, 6);
  if (!monthChoices.includes(selMonth)) monthChoices.push(selMonth);
  monthChoices.sort();

  const allEnrolled = (students || [])
    .map((s) => ({ student: s, info: computeStudentMonthTuition(s, tuition, selMonth) }))
    .filter(({ student, info }) => {
      if (info.notEnrolled) return false;
      if (selClass !== 'all' && (student.className || '') !== selClass) return false;
      return true;
    });

  const paidRows = allEnrolled.filter((x) => x.info.paid);
  const unpaidRows = allEnrolled.filter((x) => !x.info.paid);
  const totalCollected = paidRows.reduce((acc, x) => acc + (x.info.paidAmount || x.info.amount), 0);
  const totalRemaining = unpaidRows.reduce((acc, x) => acc + x.info.amount, 0);

  const visibleRows = allEnrolled.filter((x) => {
    if (selStatus === 'unpaid') return !x.info.paid;
    if (selStatus === 'paid') return x.info.paid;
    return true;
  });

  const mAdjs = tuition.monthAdjustments[selMonth] || {};
  const adjEntries = Object.entries(mAdjs);

  return `
    <!-- Controls Toolbar -->
    <div class="section-toolbar tui-toolbar">
      <div class="tui-filter-group">
        <div class="tui-month-nav">
          <button type="button" class="tl-week-nav-btn" id="btnTuiPrevMonth" aria-label="Tháng trước">‹</button>
          <select id="selTuitionMonth" class="input-control input-compact" style="min-width:168px; font-weight:700;">
            ${monthChoices
              .map(
                (mk) =>
                  `<option value="${mk}" ${mk === selMonth ? 'selected' : ''}>${escapeHtml(formatVnMonthLabel(mk))}${mk === curMonth ? ' • Tháng này' : ''}</option>`
              )
              .join('')}
          </select>
          <button type="button" class="tl-week-nav-btn" id="btnTuiNextMonth" aria-label="Tháng sau">›</button>
        </div>

        <select id="selTuitionClass" class="input-control input-compact" style="width:auto; min-width:145px;">
          <option value="all" ${selClass === 'all' ? 'selected' : ''}>Tất cả các lớp</option>
          ${classes
            .map(
              (c) => `<option value="${escapeAttr(c)}" ${selClass === c ? 'selected' : ''}>Lớp ${escapeHtml(c)}</option>`
            )
            .join('')}
        </select>

        <select id="selTuitionStatus" class="input-control input-compact" style="width:auto; min-width:135px;">
          <option value="all" ${selStatus === 'all' ? 'selected' : ''}>Tất cả (${allEnrolled.length})</option>
          <option value="unpaid" ${selStatus === 'unpaid' ? 'selected' : ''}>Chưa nộp (${unpaidRows.length})</option>
          <option value="paid" ${selStatus === 'paid' ? 'selected' : ''}>Đã nộp (${paidRows.length})</option>
        </select>
      </div>

      <div class="tui-action-group">
        <button type="button" class="btn btn-secondary btn-sm" id="btnOpenRatesModal">Mức HP định mức</button>
        <button type="button" class="btn btn-primary btn-sm" id="btnOpenMonthAdjModal">Điều chỉnh tháng này</button>
      </div>
    </div>

    <!-- Month Summary KPI Strip -->
    <div class="tui-kpi-grid">
      <div class="card tui-kpi-card ${unpaidRows.length > 0 ? 'is-warn' : 'is-ok'}">
        <div class="tui-kpi-lbl">Chưa nộp (${escapeHtml(formatVnMonthLabel(selMonth))})</div>
        <div class="tui-kpi-val">${unpaidRows.length} học sinh</div>
      </div>
      <div class="card tui-kpi-card is-ok">
        <div class="tui-kpi-lbl">Đã nộp học phí</div>
        <div class="tui-kpi-val">${paidRows.length} / ${allEnrolled.length}</div>
      </div>
      <div class="card tui-kpi-card">
        <div class="tui-kpi-lbl">Đã thu</div>
        <div class="tui-kpi-val is-money-ok">${escapeHtml(formatVnd(totalCollected))}</div>
      </div>
      <div class="card tui-kpi-card">
        <div class="tui-kpi-lbl">Còn phải thu</div>
        <div class="tui-kpi-val is-money-warn">${escapeHtml(formatVnd(totalRemaining))}</div>
      </div>
    </div>

    ${
      adjEntries.length > 0
        ? `
          <div class="tl-active-mods" style="margin-bottom:14px;">
            ${adjEntries
              .map(([scopeKey, adj]) => {
                const scopeLbl = scopeKey === '__all__' ? 'Tất cả lớp' : `Lớp ${scopeKey}`;
                const valNum = Math.round(Number(adj.value) || 0);
                const valStr =
                  adj.mode === 'delta'
                    ? `${valNum >= 0 ? '+' : '-'}${formatVnd(Math.abs(valNum))}`
                    : formatVnd(valNum);
                return `
                  <span class="badge badge-p1" style="gap:6px;">
                    Điều chỉnh ${escapeHtml(formatVnMonthLabel(selMonth))} (${escapeHtml(scopeLbl)}): <strong>${escapeHtml(valStr)}</strong>${adj.note ? ` — ${escapeHtml(adj.note)}` : ''}
                    <button type="button" class="tl-badge-x" data-del-month-adj="${escapeAttr(scopeKey)}" title="Xóa điều chỉnh này">×</button>
                  </span>
                `;
              })
              .join('')}
          </div>
        `
        : ''
    }

    <!-- Student Tuition List Table -->
    <div class="card tui-table-card" style="overflow-x:auto;">
      <table class="data-table tui-table">
        <thead>
          <tr>
            <th>Học sinh</th>
            <th>Học phí tháng</th>
            <th>Trạng thái</th>
            <th>Chi tiết nộp</th>
            <th style="text-align:right;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${
            visibleRows.length === 0
              ? `<tr><td colspan="5" style="text-align:center; padding:34px; color:var(--text-muted);">Không có học sinh nào trong danh sách lọc của ${escapeHtml(formatVnMonthLabel(selMonth))}.</td></tr>`
              : visibleRows
                  .map(({ student: s, info }) => {
                    const srcBadge = info.source === 'custom' ? `<span class="badge badge-p2">HP riêng</span>` : '';
                    const carryLine =
                      info.carryFromPrev < 0
                        ? `<div class="tui-carry-note is-short">HP tháng ${escapeHtml(formatVnd(info.monthFee))} + ${escapeHtml(formatVnd(Math.abs(info.carryFromPrev)))} (thiếu ${escapeHtml(info.carryFromMonthLabel)})</div>`
                        : info.carryFromPrev > 0
                          ? `<div class="tui-carry-note is-over">HP tháng ${escapeHtml(formatVnd(info.monthFee))} − ${escapeHtml(formatVnd(info.carryFromPrev))} (thừa ${escapeHtml(info.carryFromMonthLabel)})</div>`
                          : '';
                    const diffLine =
                      info.paid && info.balanceDiff < 0
                        ? `<div class="tui-carry-note is-short">Thiếu ${escapeHtml(formatVnd(Math.abs(info.balanceDiff)))}</div>`
                        : info.paid && info.balanceDiff > 0
                          ? `<div class="tui-carry-note is-over">Thừa ${escapeHtml(formatVnd(info.balanceDiff))}</div>`
                          : '';
                    return `
                  <tr>
                    <td class="tui-col-stu">
                      <div class="tui-stu-name">
                        <strong>${escapeHtml(s.fullName)}</strong>
                        ${s.className ? `<span class="badge badge-p1">${escapeHtml(s.className)}</span>` : ''}
                      </div>
                      ${
                        info.startDate && info.startDate.slice(0, 7) === selMonth
                          ? `<div class="tui-stu-sub">Vào học: ${escapeHtml(formatDateVNAdmin(info.startDate))}</div>`
                          : ''
                      }
                    </td>
                    <td class="tui-col-fee">
                      <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
                        <strong style="font-size:0.95rem;">${escapeHtml(formatVnd(info.amount))}</strong>
                        ${srcBadge}
                        <button type="button" class="btn btn-secondary btn-sm tui-mini-btn" data-tui-override="${escapeAttr(s.id)}">Sửa HP</button>
                      </div>
                      ${carryLine}
                      ${info.adjustmentNote ? `<div class="tl-plan-note">${escapeHtml(info.adjustmentNote)}</div>` : ''}
                    </td>
                    <td class="tui-col-status">
                      ${
                        info.paid
                          ? `<span class="badge badge-success">Đã nộp</span>`
                          : `<span class="badge badge-warning">Chưa nộp</span>`
                      }
                    </td>
                    <td class="tui-col-detail ${info.paid ? '' : 'is-empty-detail'}">
                      ${
                        info.paid
                          ? `
                            <div style="font-size:0.84rem; font-weight:600; color:var(--text);">
                              ${info.paidAt ? `${escapeHtml(formatDateVNAdmin(info.paidAt))} • ` : ''}${escapeHtml(methodLabel(info.method))}
                            </div>
                            <div class="tl-plan-note">
                              Đã thu: ${escapeHtml(formatVnd(info.paidAmount))}${info.payNote ? ` — ${escapeHtml(info.payNote)}` : ''}
                            </div>
                            ${diffLine}
                          `
                          : `<span style="color:var(--text-muted); font-size:0.84rem;">—</span>`
                      }
                    </td>
                    <td class="tui-col-act" style="text-align:right; white-space:nowrap;">
                      ${
                        info.paid
                          ? `
                            <button type="button" class="btn btn-secondary btn-sm" data-tui-pay="${escapeAttr(s.id)}">Sửa</button>
                            <button type="button" class="btn btn-danger-outline btn-sm" data-tui-unpay="${escapeAttr(s.id)}">Hủy nộp</button>
                          `
                          : `<button type="button" class="btn btn-primary btn-sm" data-tui-pay="${escapeAttr(s.id)}">Thu học phí</button>`
                      }
                    </td>
                  </tr>
                `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

export function bindTuitionAdminEvents({ rootEl, students, classes, tuition: rawTuition, state, uiHelpers, onSaveTuition, onRender }) {
  const { showToast, openModal, closeModal } = uiHelpers;
  const tuition = ensureTuitionObj(rawTuition);
  const curMonth = getCurrentMonthKey();
  const selMonth = state.tuitionMonth || curMonth;

  rootEl.querySelector('#selTuitionMonth')?.addEventListener('change', (e) => {
    state.tuitionMonth = e.target.value;
    onRender();
  });
  rootEl.querySelector('#btnTuiPrevMonth')?.addEventListener('click', () => {
    state.tuitionMonth = shiftMonthKey(selMonth, -1);
    onRender();
  });
  rootEl.querySelector('#btnTuiNextMonth')?.addEventListener('click', () => {
    state.tuitionMonth = shiftMonthKey(selMonth, 1);
    onRender();
  });
  rootEl.querySelector('#selTuitionClass')?.addEventListener('change', (e) => {
    state.tuitionClass = e.target.value;
    onRender();
  });
  rootEl.querySelector('#selTuitionStatus')?.addEventListener('change', (e) => {
    state.tuitionStatus = e.target.value;
    onRender();
  });

  // Delete monthly adjustment pill
  rootEl.querySelectorAll('[data-del-month-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const scopeKey = btn.dataset.delMonthAdj;
      if (tuition.monthAdjustments[selMonth]) {
        delete tuition.monthAdjustments[selMonth][scopeKey];
        if (Object.keys(tuition.monthAdjustments[selMonth]).length === 0) {
          delete tuition.monthAdjustments[selMonth];
        }
      }
      await onSaveTuition(tuition, 'Đã xóa điều chỉnh học phí tháng.');
    });
  });

  // Modal 1: Standard Class Rates & Rate Schedule (change effective from any month!)
  rootEl.querySelector('#btnOpenRatesModal')?.addEventListener('click', () => {
    openRatesModal({ classes, tuition, selMonth, uiHelpers, onSaveTuition });
  });

  // Modal 2: One-Click Monthly Adjustment for Whole Class / Everyone
  rootEl.querySelector('#btnOpenMonthAdjModal')?.addEventListener('click', () => {
    openMonthAdjustmentModal({ classes, tuition, selMonth, uiHelpers, onSaveTuition });
  });

  // Modal 3: Per-Student Custom Fee Override (e.g. late joiner)
  rootEl.querySelectorAll('[data-tui-override]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stu = students.find((s) => s.id === btn.dataset.tuiOverride);
      if (!stu) return;
      openStudentOverrideModal({ student: stu, tuition, selMonth, uiHelpers, onSaveTuition });
    });
  });

  // Modal 4: Collect / Edit Payment
  rootEl.querySelectorAll('[data-tui-pay]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stu = students.find((s) => s.id === btn.dataset.tuiPay);
      if (!stu) return;
      openCollectPaymentModal({ student: stu, tuition, selMonth, uiHelpers, onSaveTuition });
    });
  });

  // Unmark Payment (Styled confirmation modal)
  rootEl.querySelectorAll('[data-tui-unpay]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stu = students.find((s) => s.id === btn.dataset.tuiUnpay);
      if (!stu) return;
      const key = `${stu.id}|${selMonth}`;
      openModal({
        title: 'Xác nhận hủy trạng thái đã nộp',
        bodyHtml: `<p style="margin:0;">Hủy xác nhận đã nộp học phí <strong>${escapeHtml(formatVnMonthLabel(selMonth))}</strong> của học sinh <strong>${escapeHtml(stu.fullName)}</strong>?</p>`,
        footerHtml: `
          <button type="button" class="btn btn-secondary" id="mCancelUnpay">Hủy</button>
          <button type="button" class="btn btn-danger-outline" id="mOkUnpay">Xác nhận hủy nộp</button>
        `,
        onMount: (m) => {
          m.querySelector('#mCancelUnpay').addEventListener('click', closeModal);
          m.querySelector('#mOkUnpay').addEventListener('click', async () => {
            delete tuition.payments[key];
            closeModal();
            await onSaveTuition(tuition, `Đã chuyển ${stu.fullName} về trạng thái Chưa nộp.`);
          });
        },
      });
    });
  });
}

function openRatesModal({ classes, tuition, selMonth, uiHelpers, onSaveTuition }) {
  const { showToast, openModal, closeModal } = uiHelpers;
  const monthChoices = buildMonthChoices(getCurrentMonthKey(), 12, 12);
  let selectedScope = '__default__';

  function getListForScope(sc) {
    if (sc === '__default__') return tuition.defaultRates || [];
    return tuition.classRateHistory[sc] || [];
  }

  function renderModalContent(m) {
    const list = [...getListForScope(selectedScope)].sort((a, b) =>
      String(a.fromMonth).localeCompare(String(b.fromMonth))
    );
    const listHost = m.querySelector('#rateHistoryList');
    if (!listHost) return;
    listHost.innerHTML =
      list.length === 0
        ? `<div style="padding:12px; border-radius:10px; background:var(--surface-subtle); font-size:0.83rem; color:var(--text-muted);">
            Lớp này đang áp dụng theo <strong>Mức định mức chung</strong>. Thêm mốc mới bên dưới nếu muốn đặt mức định mức riêng cho lớp.
          </div>`
        : list
            .map(
              (r) => `
            <div class="composer-att-item">
              <div style="flex:1; min-width:0;">
                <div style="font-weight:800; font-size:0.9rem; color:var(--primary);">
                  ${escapeHtml(formatVnd(r.amount))}
                  <span style="font-weight:600; font-size:0.8rem; color:var(--text-secondary);">• Từ ${escapeHtml(formatVnMonthLabel(r.fromMonth))}</span>
                </div>
                ${r.note ? `<div style="font-size:0.76rem; color:var(--text-muted);">${escapeHtml(r.note)}</div>` : ''}
              </div>
              ${
                !(selectedScope === '__default__' && list.length <= 1)
                  ? `<button type="button" class="btn btn-danger-outline btn-sm" data-del-rate-id="${escapeAttr(r.id)}">Xóa</button>`
                  : ''
              }
            </div>
          `
            )
            .join('');

    listHost.querySelectorAll('[data-del-rate-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.delRateId;
        if (selectedScope === '__default__') {
          tuition.defaultRates = tuition.defaultRates.filter((x) => x.id !== rid);
        } else {
          tuition.classRateHistory[selectedScope] = (tuition.classRateHistory[selectedScope] || []).filter(
            (x) => x.id !== rid
          );
          if (tuition.classRateHistory[selectedScope].length === 0) {
            delete tuition.classRateHistory[selectedScope];
          }
        }
        await onSaveTuition(tuition, 'Đã xóa mốc học phí định mức.');
        renderModalContent(m);
      });
    });
  }

  openModal({
    title: 'Mức học phí định mức theo lớp',
    bodyHtml: `
      <div class="form-group">
        <label>Phạm vi áp dụng</label>
        <select id="rateScopeSel" class="input-control">
          <option value="__default__">Mức định mức chung (mặc định cho mọi lớp)</option>
          ${classes.map((c) => `<option value="${escapeAttr(c)}">Riêng Lớp ${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Các mốc học phí định mức</div>
        <div id="rateHistoryList" style="display:flex; flex-direction:column; gap:6px; max-height:170px; overflow-y:auto;"></div>
      </div>

      <div style="padding-top:12px; border-top:1px solid var(--border);">
        <div style="font-size:0.84rem; font-weight:800; color:var(--text); margin-bottom:10px;">Đặt / Thay đổi mức học phí định mức</div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Mức học phí (nghìn đồng) *</label>
            <div class="tui-k-input-wrap">
              <input id="rateAmountInp" type="number" inputmode="decimal" min="0" step="1" class="input-control" placeholder="VD: 300 hoặc 500" />
              <span class="tui-k-suffix">.000 ₫</span>
            </div>
            <div class="tui-k-preview" id="rateAmountPreview">Nhập theo nghìn đồng (VD: 300 = 300.000 ₫)</div>
          </div>
          <div class="form-group">
            <label>Áp dụng bắt đầu từ *</label>
            <select id="rateFromMonthSel" class="input-control">
              ${monthChoices
                .map((mk) => `<option value="${mk}" ${mk === selMonth ? 'selected' : ''}>${escapeHtml(formatVnMonthLabel(mk))}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Ghi chú (tùy chọn)</label>
          <input id="rateNoteInp" class="input-control" placeholder="VD: 3 tháng đầu 300k / Tăng buổi ôn thi lên 500k..." />
        </div>
      </div>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="mCloseRates">Đóng</button>
      <button type="button" class="btn btn-primary" id="mSaveRate">Lưu mức định mức</button>
    `,
    onMount: (m) => {
      renderModalContent(m);
      const rateInp = m.querySelector('#rateAmountInp');
      const ratePrev = m.querySelector('#rateAmountPreview');
      const syncRatePreview = () => {
        const vnd = kToVnd(rateInp.value);
        ratePrev.textContent =
          Number.isFinite(vnd) && vnd >= 0
            ? `= ${formatVnd(vnd)}`
            : 'Nhập theo nghìn đồng (VD: 300 = 300.000 ₫)';
      };
      rateInp.addEventListener('input', syncRatePreview);

      m.querySelector('#rateScopeSel').addEventListener('change', (e) => {
        selectedScope = e.target.value;
        renderModalContent(m);
      });
      m.querySelector('#mCloseRates').addEventListener('click', closeModal);
      m.querySelector('#mSaveRate').addEventListener('click', async () => {
        const amount = kToVnd(rateInp.value);
        if (!Number.isFinite(amount) || amount < 0) {
          showToast('Vui lòng nhập số tiền học phí hợp lệ (nghìn đồng).', 'error');
          return;
        }
        const fromMonth = m.querySelector('#rateFromMonthSel').value;
        const note = m.querySelector('#rateNoteInp').value.trim();
        const entry = {
          id: 'rate-' + Date.now().toString(36),
          fromMonth,
          amount,
          note,
        };
        if (selectedScope === '__default__') {
          tuition.defaultRates = (tuition.defaultRates || []).filter((x) => x.fromMonth !== fromMonth);
          tuition.defaultRates.push(entry);
          tuition.defaultRates.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
        } else {
          const arr = (tuition.classRateHistory[selectedScope] || []).filter((x) => x.fromMonth !== fromMonth);
          arr.push(entry);
          arr.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
          tuition.classRateHistory[selectedScope] = arr;
        }
        rateInp.value = '';
        syncRatePreview();
        m.querySelector('#rateNoteInp').value = '';
        await onSaveTuition(
          tuition,
          `Đã lưu mức ${formatVnd(amount)} áp dụng từ ${formatVnMonthLabel(fromMonth)}!`
        );
        renderModalContent(m);
      });
    },
  });
}

function openMonthAdjustmentModal({ classes, tuition, selMonth, uiHelpers, onSaveTuition }) {
  const { showToast, openModal, closeModal } = uiHelpers;
  const existingMap = tuition.monthAdjustments[selMonth] || {};
  const existingEntries = Object.entries(existingMap);

  openModal({
    title: `Điều chỉnh học phí ${formatVnMonthLabel(selMonth)}`,
    bodyHtml: `
      <div class="form-row-2">
        <div class="form-group">
          <label>Áp dụng cho</label>
          <select id="adjScopeSel" class="input-control">
            <option value="__all__">Tất cả các lớp (1 lần cho mọi HS)</option>
            ${classes.map((c) => `<option value="${escapeAttr(c)}">Riêng Lớp ${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Mức học phí tháng này (nghìn đồng) *</label>
          <div class="tui-k-input-wrap">
            <input id="adjValInp" type="number" inputmode="decimal" min="0" step="1" class="input-control" placeholder="VD: 250 hoặc 400" />
            <span class="tui-k-suffix">.000 ₫</span>
          </div>
          <div class="tui-k-preview" id="adjValPreview">Nhập theo nghìn đồng (VD: 400 = 400.000 ₫)</div>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Lý do điều chỉnh</label>
        <input id="adjNoteInp" class="input-control" placeholder="VD: Nghỉ lễ giảm 1 buổi, Tăng cường ôn thi..." />
      </div>

      ${
        existingEntries.length > 0
          ? `
            <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
              <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Điều chỉnh đang áp dụng trong ${escapeHtml(formatVnMonthLabel(selMonth))}</div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${existingEntries
                  .map(([sc, a]) => {
                    const lbl = sc === '__all__' ? 'Tất cả lớp' : `Lớp ${sc}`;
                    const v = Math.round(Number(a.value) || 0);
                    const vStr = a.mode === 'delta' ? `${v >= 0 ? '+' : '-'}${formatVnd(Math.abs(v))}` : formatVnd(v);
                    return `
                      <div class="composer-att-item">
                        <div style="flex:1; min-width:0;">
                          <div style="font-weight:700; font-size:0.84rem;">${escapeHtml(lbl)}: ${escapeHtml(vStr)}</div>
                          ${a.note ? `<div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(a.note)}</div>` : ''}
                        </div>
                        <button type="button" class="btn btn-danger-outline btn-sm" data-modal-del-adj="${escapeAttr(sc)}">Xóa</button>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="mCancelAdj">Đóng</button>
      <button type="button" class="btn btn-primary" id="mSaveAdj">Áp dụng điều chỉnh</button>
    `,
    onMount: (m) => {
      const valInp = m.querySelector('#adjValInp');
      const valPrev = m.querySelector('#adjValPreview');
      valInp.addEventListener('input', () => {
        const vnd = kToVnd(valInp.value);
        valPrev.textContent =
          Number.isFinite(vnd) && vnd >= 0
            ? `= ${formatVnd(vnd)}`
            : 'Nhập theo nghìn đồng (VD: 400 = 400.000 ₫)';
      });

      m.querySelectorAll('[data-modal-del-adj]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const sc = btn.dataset.modalDelAdj;
          if (tuition.monthAdjustments[selMonth]) {
            delete tuition.monthAdjustments[selMonth][sc];
            if (Object.keys(tuition.monthAdjustments[selMonth]).length === 0) {
              delete tuition.monthAdjustments[selMonth];
            }
          }
          closeModal();
          await onSaveTuition(tuition, 'Đã xóa điều chỉnh học phí tháng.');
        });
      });

      m.querySelector('#mCancelAdj').addEventListener('click', closeModal);
      m.querySelector('#mSaveAdj').addEventListener('click', async () => {
        const sc = m.querySelector('#adjScopeSel').value;
        const val = kToVnd(valInp.value);
        if (!Number.isFinite(val) || val < 0) {
          showToast('Vui lòng nhập mức học phí hợp lệ (nghìn đồng).', 'error');
          return;
        }
        const note = m.querySelector('#adjNoteInp').value.trim();
        tuition.monthAdjustments[selMonth] = tuition.monthAdjustments[selMonth] || {};
        tuition.monthAdjustments[selMonth][sc] = { mode: 'set', value: val, note };
        closeModal();
        await onSaveTuition(tuition, `Đã đặt học phí ${formatVnMonthLabel(selMonth)}: ${formatVnd(val)}!`);
      });
    },
  });
}

function openStudentOverrideModal({ student, tuition, selMonth, uiHelpers, onSaveTuition }) {
  const { showToast, openModal, closeModal } = uiHelpers;
  const info = computeStudentMonthTuition(student, tuition, selMonth);
  const key = `${student.id}|${selMonth}`;
  const hasOverride = Boolean(tuition.studentOverrides[key]);

  openModal({
    title: `Sửa học phí — ${student.fullName}`,
    bodyHtml: `
      <div class="tl-detail-time" style="margin-bottom:14px;">
        ${escapeHtml(formatVnMonthLabel(selMonth))}${student.className ? ` • Lớp ${escapeHtml(student.className)}` : ''}${info.startDate ? ` • Vào học: ${escapeHtml(formatDateVNAdmin(info.startDate))}` : ''}
      </div>
      <div class="form-group">
        <label>Học phí tháng này (nghìn đồng) *</label>
        <div class="tui-k-input-wrap">
          <input id="ovAmountInp" type="number" inputmode="decimal" min="0" step="1" class="input-control" value="${escapeAttr(vndToK(info.monthFee))}" />
          <span class="tui-k-suffix">.000 ₫</span>
        </div>
        <div class="tui-k-preview" id="ovAmountPreview">= ${escapeHtml(formatVnd(info.monthFee))}</div>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Ghi chú (tùy chọn)</label>
        <input id="ovNoteInp" class="input-control" placeholder="VD: Vào học giữa tháng (tính 1/2 tháng), Miễn giảm..." value="${escapeAttr(hasOverride ? tuition.studentOverrides[key].note || '' : '')}" />
      </div>
    `,
    footerHtml: `
      ${hasOverride ? `<button type="button" class="btn btn-danger-outline" id="mResetOv" style="margin-right:auto;">Về mức chung</button>` : ''}
      <button type="button" class="btn btn-secondary" id="mCancelOv">Hủy</button>
      <button type="button" class="btn btn-primary" id="mSaveOv">Lưu học phí</button>
    `,
    onMount: (m) => {
      const ovInp = m.querySelector('#ovAmountInp');
      const ovPrev = m.querySelector('#ovAmountPreview');
      ovInp.addEventListener('input', () => {
        const vnd = kToVnd(ovInp.value);
        ovPrev.textContent =
          Number.isFinite(vnd) && vnd >= 0
            ? `= ${formatVnd(vnd)}`
            : 'Nhập theo nghìn đồng (VD: 150 = 150.000 ₫)';
      });

      m.querySelector('#mCancelOv').addEventListener('click', closeModal);
      m.querySelector('#mResetOv')?.addEventListener('click', async () => {
        delete tuition.studentOverrides[key];
        closeModal();
        await onSaveTuition(tuition, `Đã khôi phục học phí theo lớp cho ${student.fullName}.`);
      });
      m.querySelector('#mSaveOv').addEventListener('click', async () => {
        const amt = kToVnd(ovInp.value);
        if (!Number.isFinite(amt) || amt < 0) {
          showToast('Vui lòng nhập số tiền hợp lệ (nghìn đồng).', 'error');
          return;
        }
        tuition.studentOverrides[key] = {
          amount: amt,
          note: m.querySelector('#ovNoteInp').value.trim(),
        };
        closeModal();
        await onSaveTuition(tuition, `Đã cập nhật học phí ${formatVnd(amt)} cho ${student.fullName}!`);
      });
    },
  });
}

function openCollectPaymentModal({ student, tuition, selMonth, uiHelpers, onSaveTuition }) {
  const { showToast, openModal, closeModal } = uiHelpers;
  const info = computeStudentMonthTuition(student, tuition, selMonth);
  const key = `${student.id}|${selMonth}`;
  const defaultAmount = info.paid ? info.paidAmount : info.amount;
  const initNoDate = Boolean(info.paid && !info.paidAt);
  let lastDateVN = formatDateVNAdmin(info.paid && info.paidAt ? info.paidAt : getTodayIsoLocal());
  let chosenMethod = info.paid && info.method === 'cash' ? 'cash' : 'transfer';

  openModal({
    title: info.paid ? `Cập nhật phiếu thu — ${student.fullName}` : `Thu học phí — ${student.fullName}`,
    bodyHtml: `
      <div class="tl-detail-time" style="margin-bottom:14px;">
        ${escapeHtml(formatVnMonthLabel(selMonth))}${student.className ? ` • Lớp ${escapeHtml(student.className)}` : ''} • Cần nộp: <strong>${escapeHtml(formatVnd(info.amount))}</strong>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Số tiền nộp (nghìn đồng) *</label>
          <div class="tui-k-input-wrap">
            <input id="payAmountInp" type="number" inputmode="decimal" min="0" step="1" class="input-control" value="${escapeAttr(vndToK(defaultAmount))}" />
            <span class="tui-k-suffix">.000 ₫</span>
          </div>
          <div class="tui-k-preview" id="payAmountPreview"></div>
        </div>
        <div class="form-group">
          <label>Ngày nộp (dd/mm/yyyy)</label>
          <input id="payDateInp" type="text" maxlength="10" class="input-control" placeholder="${initNoDate ? 'Không ghi ngày' : 'dd/mm/yyyy'}" value="${escapeAttr(initNoDate ? '' : lastDateVN)}" ${initNoDate ? 'disabled' : ''} />
          <label style="display:inline-flex; align-items:center; gap:6px; margin-top:7px; font-size:0.82rem; font-weight:600; color:var(--text-secondary); cursor:pointer;">
            <input type="checkbox" id="payNoDateChk" ${initNoDate ? 'checked' : ''} />
            <span>Không có ngày</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Hình thức nộp *</label>
        <div class="tui-method-toggle">
          <button type="button" class="tui-method-btn ${chosenMethod === 'transfer' ? 'active' : ''}" data-pay-method="transfer">
            Chuyển khoản
          </button>
          <button type="button" class="tui-method-btn ${chosenMethod === 'cash' ? 'active' : ''}" data-pay-method="cash">
            Tiền mặt
          </button>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Ghi chú (tùy chọn)</label>
        <input id="payNoteInp" class="input-control" placeholder="VD: Phụ huynh chuyển khoản..." value="${escapeAttr(info.payNote || '')}" />
      </div>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="mCancelPay">Hủy</button>
      <button type="button" class="btn btn-primary" id="mSavePay">Xác nhận đã nộp</button>
    `,
    onMount: (m) => {
      const payInp = m.querySelector('#payAmountInp');
      const payPrev = m.querySelector('#payAmountPreview');
      const dateInp = m.querySelector('#payDateInp');
      const noDateChk = m.querySelector('#payNoDateChk');

      noDateChk.addEventListener('change', () => {
        if (noDateChk.checked) {
          if (dateInp.value.trim()) lastDateVN = dateInp.value.trim();
          dateInp.value = '';
          dateInp.placeholder = 'Không ghi ngày';
          dateInp.disabled = true;
        } else {
          dateInp.disabled = false;
          dateInp.placeholder = 'dd/mm/yyyy';
          dateInp.value = lastDateVN || formatDateVNAdmin(getTodayIsoLocal());
        }
      });

      const syncPayPreview = () => {
        const vnd = kToVnd(payInp.value);
        if (!Number.isFinite(vnd) || vnd < 0) {
          payPrev.className = 'tui-k-preview';
          payPrev.textContent = 'Nhập theo nghìn đồng (VD: 300 = 300.000 ₫)';
          return;
        }
        const diff = vnd - info.amount;
        if (diff < 0) {
          payPrev.className = 'tui-k-preview is-short';
          payPrev.textContent = `Thiếu ${formatVnd(Math.abs(diff))}`;
        } else if (diff > 0) {
          payPrev.className = 'tui-k-preview is-over';
          payPrev.textContent = `Thừa ${formatVnd(diff)}`;
        } else {
          payPrev.className = 'tui-k-preview is-ok';
          payPrev.textContent = `Đủ học phí tháng`;
        }
      };
      syncPayPreview();
      payInp.addEventListener('input', syncPayPreview);

      m.querySelectorAll('[data-pay-method]').forEach((b) => {
        b.addEventListener('click', () => {
          chosenMethod = b.dataset.payMethod === 'cash' ? 'cash' : 'transfer';
          m.querySelectorAll('[data-pay-method]').forEach((x) =>
            x.classList.toggle('active', x.dataset.payMethod === chosenMethod)
          );
        });
      });
      m.querySelector('#mCancelPay').addEventListener('click', closeModal);
      m.querySelector('#mSavePay').addEventListener('click', async () => {
        const amt = kToVnd(payInp.value);
        if (!Number.isFinite(amt) || amt < 0) {
          showToast('Vui lòng nhập số tiền hợp lệ (nghìn đồng).', 'error');
          return;
        }
        let paidAtIso = '';
        if (!noDateChk.checked) {
          const rawDate = dateInp.value.trim();
          if (rawDate) {
            try {
              paidAtIso = parseVnDateOnlyToIso(rawDate, 'Ngày nộp');
            } catch (err) {
              showToast(err.message, 'error');
              return;
            }
          } else {
            paidAtIso = getTodayIsoLocal();
          }
        }
        tuition.payments[key] = {
          paid: true,
          paidAt: paidAtIso,
          amount: amt,
          method: chosenMethod,
          note: m.querySelector('#payNoteInp').value.trim(),
        };
        closeModal();
        await onSaveTuition(
          tuition,
          `Đã ghi nhận ${student.fullName} nộp ${formatVnd(amt)} (${methodLabel(chosenMethod)})!`
        );
      });
    },
  });
}
