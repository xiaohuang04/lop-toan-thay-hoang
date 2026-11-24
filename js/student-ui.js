import { api } from './api.js?v=20261124e';
import {
  escapeHtml,
  escapeAttr,
  formatScoreVN,
  formatTime,
  formatDateTimeVN,
  getDeadlineStatus,
} from './exam-engine.js?v=20261123d';
import { renderFeedList, bindFeedEvents } from './classroom-feed.js?v=20261123d';

function formatVnd(amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  return `${n.toLocaleString('vi-VN')} ₫`;
}

function formatDateVNAdmin(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  const mm = Number(m[2]);
  const mmStr = mm === 1 || mm === 2 ? `0${mm}` : String(mm);
  return `${m[3]}/${mmStr}/${m[1]}`;
}

function paymentMethodLabel(method) {
  if (method === 'cash') return 'Tiền mặt';
  if (method === 'transfer') return 'Chuyển khoản';
  return method || 'Chuyển khoản';
}

export function createStudentController({ rootEl, examRunner, uiHelpers, onUserUpdated }) {
  const { showToast, openModal, closeModal, setHeaderStatus, renderMath } = uiHelpers;

  const state = {
    subTab: 'feed', // 'feed' | 'exam' | 'tuition'
    feedSearch: '',
    data: {
      user: null,
      assignments: [],
      submissions: [],
      posts: [],
      examsById: {},
      tuition: null,
    },
    inRunner: false,
  };

  async function refresh() {
    try {
      const res = await api.studentDashboard();
      state.data = {
        user: res.user || null,
        assignments: res.assignments || [],
        submissions: res.submissions || [],
        posts: res.posts || [],
        examsById: res.examsById || {},
        tuition: res.tuition || null,
      };
      if (state.data.user && typeof onUserUpdated === 'function') {
        onUserUpdated(state.data.user);
      }
      if (!state.inRunner) render();
    } catch (err) {
      showToast(err.message || 'Không thể tải dữ liệu lớp học.', 'error');
    }
  }

  function filterPosts(posts) {
    const q = state.feedSearch.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => {
      const attNames = (p.attachments || [])
        .map((a) => `${a.title || ''} ${a.fileName || ''} ${a.url || ''}`)
        .join(' ');
      const hay = `${p.title || ''} ${p.content || ''} ${attNames}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function render() {
    state.inRunner = false;
    const { user, assignments, submissions, posts } = state.data;
    if (!user) return;
    setHeaderStatus('');

    const completedAsgIds = new Set(submissions.map((s) => s.assignmentId));
    const pendingCount = assignments.filter((a) => {
      const dl = getDeadlineStatus(a.dueAt, a.openAt);
      return !completedAsgIds.has(a.id) && !dl.expired;
    }).length;
    const avgScore =
      submissions.length > 0
        ? submissions.reduce((acc, s) => acc + (Number(s.result?.totalScore) || 0), 0) / submissions.length
        : 0;

    rootEl.innerHTML = `
      <div class="role-hero student-hero">
        <div>
          <div class="hero-eyebrow">Lớp học của tôi${user.className ? ` • Lớp ${escapeHtml(user.className)}` : ''}</div>
          <h1 style="margin-bottom:0;">Xin chào, ${escapeHtml(user.fullName)}!</h1>
        </div>
        <div class="kpi-strip">
          <div class="kpi-box"><div class="kpi-num">${posts.length}</div><div class="kpi-lbl">Bài giảng</div></div>
          <div class="kpi-box"><div class="kpi-num">${pendingCount}</div><div class="kpi-lbl">Bài chưa làm</div></div>
          <div class="kpi-box"><div class="kpi-num">${completedAsgIds.size}</div><div class="kpi-lbl">Bài đã nộp</div></div>
          <div class="kpi-box"><div class="kpi-num">${submissions.length ? formatScoreVN(avgScore) : '—'}</div><div class="kpi-lbl">Điểm TB</div></div>
        </div>
      </div>

      <div class="subtab-bar">
        <button class="subtab-btn ${state.subTab === 'feed' ? 'active' : ''}" data-stu-tab="feed">
          Bảng tin lớp học <span class="badge badge-neutral">${posts.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'exam' ? 'active' : ''}" data-stu-tab="exam">
          Thi Online &amp; Kết quả <span class="badge badge-neutral">${assignments.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'tuition' ? 'active' : ''}" data-stu-tab="tuition">
          Học phí
          ${
            state.data.tuition?.currentMonth && !state.data.tuition.currentMonth.notEnrolled
              ? state.data.tuition.currentMonth.paid
                ? `<span class="badge badge-success">Đã nộp</span>`
                : state.data.tuition.currentMonth.amount > 0
                  ? `<span class="badge badge-warning">Chưa nộp</span>`
                  : ''
              : ''
          }
        </button>
      </div>

      <div id="studentSubContent">
        ${state.subTab === 'feed' ? renderFeedSection() : ''}
        ${state.subTab === 'exam' ? renderMergedExamSection() : ''}
        ${state.subTab === 'tuition' ? renderTuitionSection() : ''}
      </div>
    `;

    bindEvents();
    renderMath(rootEl);
  }

  function renderFeedSection() {
    const posts = state.data.posts || [];
    const filtered = filterPosts(posts);

    return `
      ${
        posts.length > 0
          ? `
            <div class="feed-toolbar">
              <div class="feed-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  id="inpStuFeedSearch"
                  type="search"
                  placeholder="Tìm kiếm bài giảng, video YouTube, tài liệu PDF..."
                  value="${escapeAttr(state.feedSearch)}"
                />
              </div>
            </div>
          `
          : ''
      }
      <div id="studentFeedList">
        ${renderFeedList({
          posts: filtered,
          isAdmin: false,
          emptyTitle: posts.length ? 'Không tìm thấy bài viết phù hợp' : 'Chưa có bài giảng hoặc tài liệu nào',
          emptyText: posts.length
            ? 'Thử nhập từ khóa khác hoặc xóa ô tìm kiếm.'
            : 'Khi thầy Hoàng đăng video bài giảng, handout PDF hoặc tài liệu mới, nội dung sẽ xuất hiện ngay tại đây.',
        })}
      </div>
    `;
  }

  function renderMergedExamSection() {
    const { assignments, submissions } = state.data;
    return `
      <div class="stu-exam-merged">
        <div class="stu-section-heading">
          <h3>Bài tập &amp; Đề thi được giao</h3>
          <span class="badge badge-p1">${assignments.length} đề</span>
        </div>
        ${renderAssignedSection()}

        <div class="stu-section-heading" style="margin-top:26px;">
          <h3>Lịch sử &amp; Kết quả làm bài</h3>
          <span class="badge badge-neutral">${submissions.length} bài đã nộp</span>
        </div>
        ${renderHistorySection()}
      </div>
    `;
  }

  function renderTuitionSection() {
    const t = state.data.tuition;
    if (!t || !t.currentMonth) {
      return `
        <div class="card panel-card" style="text-align:center; padding:42px; color:var(--text-muted);">
          Chưa có dữ liệu học phí.
        </div>
      `;
    }

    const cur = t.currentMonth;
    const prevList = Array.isArray(t.previousMonths) ? t.previousMonths : [];

    let heroBodyHtml = '';
    const curCarryHtml =
      cur.carryFromPrev < 0
        ? `<div class="stu-tuition-diff-banner is-short">Gồm HP tháng ${escapeHtml(formatVnd(cur.monthFee))} + <strong>${escapeHtml(formatVnd(Math.abs(cur.carryFromPrev)))}</strong> (thiếu ${escapeHtml(cur.carryFromMonthLabel || 'tháng trước')})</div>`
        : cur.carryFromPrev > 0
          ? `<div class="stu-tuition-diff-banner is-over">Gồm HP tháng ${escapeHtml(formatVnd(cur.monthFee))} − <strong>${escapeHtml(formatVnd(cur.carryFromPrev))}</strong> (thừa ${escapeHtml(cur.carryFromMonthLabel || 'tháng trước')})</div>`
          : '';

    if (cur.notEnrolled) {
      heroBodyHtml = `
        <div class="stu-tuition-status-pill is-neutral">Chưa đến ngày bắt đầu học</div>
        <div class="stu-tuition-amount is-muted">—</div>
        ${cur.startDate ? `<div class="stu-tuition-sub">Ngày bắt đầu học: <strong>${escapeHtml(formatDateVNAdmin(cur.startDate))}</strong></div>` : ''}
      `;
    } else if (cur.paid) {
      const paidVal = cur.paidAmount !== undefined && cur.paidAmount !== null ? cur.paidAmount : cur.amount;
      const diffVal = Number(cur.balanceDiff) || 0;
      const diffBannerHtml =
        diffVal < 0
          ? `<div class="stu-tuition-diff-banner is-short">Nộp thiếu <strong>${escapeHtml(formatVnd(Math.abs(diffVal)))}</strong> - sẽ cộng vào tháng sau</div>`
          : diffVal > 0
            ? `<div class="stu-tuition-diff-banner is-over">Nộp thừa <strong>${escapeHtml(formatVnd(diffVal))}</strong> - sẽ trừ vào tháng sau</div>`
            : '';
      heroBodyHtml = `
        <div class="stu-tuition-status-pill is-paid">✓ Đã đóng học phí</div>
        <div class="stu-tuition-amount is-paid">${escapeHtml(formatVnd(paidVal))}</div>
        ${diffBannerHtml}
        ${curCarryHtml}
        ${cur.adjustmentNote ? `<div class="stu-tuition-sub">${escapeHtml(cur.adjustmentNote)}</div>` : ''}
        <div class="stu-tuition-meta-grid ${cur.paidAt ? '' : 'is-two-col'}">
          ${
            cur.paidAt
              ? `
                <div class="stu-tuition-meta-item">
                  <span>Ngày nộp</span>
                  <strong>${escapeHtml(formatDateVNAdmin(cur.paidAt))}</strong>
                </div>
              `
              : ''
          }
          <div class="stu-tuition-meta-item">
            <span>Số tiền</span>
            <strong>${escapeHtml(formatVnd(paidVal))}</strong>
          </div>
          <div class="stu-tuition-meta-item">
            <span>Hình thức</span>
            <strong>${escapeHtml(paymentMethodLabel(cur.method))}</strong>
          </div>
        </div>
        ${cur.note ? `<div class="stu-tuition-note">Ghi chú: ${escapeHtml(cur.note)}</div>` : ''}
      `;
    } else {
      heroBodyHtml = `
        <div class="stu-tuition-status-pill is-unpaid">Chưa đóng học phí</div>
        <div class="stu-tuition-due-label">Số tiền cần nộp</div>
        <div class="stu-tuition-amount is-unpaid">${escapeHtml(formatVnd(cur.amount))}</div>
        ${curCarryHtml}
        ${cur.adjustmentNote ? `<div class="stu-tuition-sub">${escapeHtml(cur.adjustmentNote)}</div>` : ''}
      `;
    }

    return `
      <div class="stu-tuition-wrap">
        <!-- Large Centered Current Month Tuition Card -->
        <div class="card stu-tuition-hero ${cur.paid ? 'is-paid' : cur.notEnrolled ? '' : 'is-unpaid'}">
          <div class="stu-tuition-hero-top">
            <span class="stu-tuition-month-eyebrow">HỌC PHÍ THÁNG NÀY</span>
            <h2>${escapeHtml(cur.monthLabel)}</h2>
          </div>
          ${heroBodyHtml}
        </div>

        <!-- Previous Months Horizontal Bars -->
        <div class="stu-tuition-history-sec">
          <div class="stu-section-heading">
            <h3>Trạng thái học phí các tháng trước</h3>
            <span class="badge badge-neutral">${prevList.length} tháng</span>
          </div>
          ${
            prevList.length === 0
              ? `<div class="card panel-card" style="text-align:center; padding:28px; color:var(--text-muted); font-size:0.88rem;">
                  Chưa có lịch sử học phí của các tháng trước.
                </div>`
              : `
                <div class="stu-tuition-prev-list">
                  ${prevList
                    .map((m) => {
                      const mPaidVal = m.paidAmount !== undefined && m.paidAmount !== null ? m.paidAmount : m.amount;
                      const mDiff = Number(m.balanceDiff) || 0;
                      const metaParts = [];
                      if (m.paid) {
                        if (m.paidAt) {
                          metaParts.push(`<span class="stu-prev-chip">${escapeHtml(formatDateVNAdmin(m.paidAt))}</span>`);
                        }
                        metaParts.push(`<span class="stu-prev-chip">${escapeHtml(paymentMethodLabel(m.method))}</span>`);
                        if (mDiff < 0) {
                          metaParts.push(`<span class="stu-prev-chip is-short">Thiếu ${escapeHtml(formatVnd(Math.abs(mDiff)))}</span>`);
                        } else if (mDiff > 0) {
                          metaParts.push(`<span class="stu-prev-chip is-over">Thừa ${escapeHtml(formatVnd(mDiff))}</span>`);
                        }
                        if (m.note) {
                          metaParts.push(`<span class="stu-prev-chip">${escapeHtml(m.note)}</span>`);
                        }
                      } else {
                        if (m.carryFromPrev < 0) {
                          metaParts.push(`<span class="stu-prev-chip is-short">Gồm +${escapeHtml(formatVnd(Math.abs(m.carryFromPrev)))} thiếu tháng trước</span>`);
                        } else if (m.carryFromPrev > 0) {
                          metaParts.push(`<span class="stu-prev-chip is-over">Đã trừ ${escapeHtml(formatVnd(m.carryFromPrev))} thừa tháng trước</span>`);
                        }
                        if (m.adjustmentNote) {
                          metaParts.push(`<span class="stu-prev-chip">${escapeHtml(m.adjustmentNote)}</span>`);
                        }
                      }
                      const metaJoined = metaParts.join('<span class="stu-prev-sep" aria-hidden="true">|</span>');

                      return `
                    <div class="card stu-tuition-prev-bar ${m.paid ? 'is-paid' : 'is-unpaid'}">
                      <div class="stu-prev-bar-left">
                        <strong class="stu-prev-bar-month">${escapeHtml(m.monthLabel)}</strong>
                        <span class="badge ${m.paid ? 'badge-success' : 'badge-warning'}">
                          ${m.paid ? '✓ Đã nộp' : 'Chưa nộp'}
                        </span>
                      </div>
                      <div class="stu-prev-bar-mid ${metaParts.length === 0 ? 'is-empty-mid' : ''}">
                        ${metaJoined}
                      </div>
                      <div class="stu-prev-bar-right">
                        <div class="stu-prev-bar-amt ${m.paid ? 'is-paid' : 'is-unpaid'}">
                          ${escapeHtml(formatVnd(m.paid ? mPaidVal : m.amount))}
                        </div>
                      </div>
                    </div>
                  `;
                    })
                    .join('')}
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  function renderAssignedSection() {
    const { assignments } = state.data;
    if (assignments.length === 0) {
      return `
        <div class="card panel-card" style="text-align:center; padding:44px; color:var(--text-muted);">
          Hiện tại giáo viên chưa giao đề thi nào cho tài khoản của bạn.
        </div>
      `;
    }

    return `
      <div class="exam-list">
        ${assignments
          .map((asg) => {
            const ex = asg.exam;
            const asgType = asg.assignmentType === 'test' ? 'test' : 'homework';
            const dl = getDeadlineStatus(asg.dueAt, asg.openAt);
            const notOpen = Boolean(asg.isNotOpen || dl.notOpen);
            const expired = Boolean(asg.isExpired || dl.expired);
            const latestSub = asg.mySubmissions?.[0] || null;
            const totalQ = (ex.part1?.length || 0) + (ex.part2?.length || 0) + (ex.part3?.length || 0);
            const canStart = !notOpen && !expired && !latestSub;
            const durationMins = asg.durationMinutes || ex.durationMinutes || 45;
            const statusBadgeCls = expired
              ? 'badge-danger'
              : notOpen
                ? 'badge-neutral'
                : dl.urgent
                  ? 'badge-warning'
                  : 'badge-p1';

            return `
              <article class="exam-card" style="cursor:default;">
                <div class="exam-card-top">
                  <div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                      <span class="badge ${asgType === 'test' ? 'badge-danger' : 'badge-p1'}">
                        ${asgType === 'test' ? 'Bài kiểm tra' : 'Bài tập'}
                      </span>
                      <h3 class="exam-card-title" style="margin:0;">${escapeHtml(asg.title)}</h3>
                    </div>
                    ${asg.note ? `<p class="exam-card-desc">${escapeHtml(asg.note)}</p>` : ''}
                  </div>
                  <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                    ${
                      latestSub
                        ? `<span class="badge badge-success">Đã nộp • ${formatScoreVN(latestSub.result?.totalScore ?? 0)}/${formatScoreVN(latestSub.result?.maxScore ?? 10)}đ</span>`
                        : ''
                    }
                    <span class="badge ${statusBadgeCls}">
                      ${escapeHtml(dl.label)}
                    </span>
                  </div>
                </div>

                <div class="exam-card-badges">
                  <span class="badge badge-p1">Phần I: ${ex.part1?.length || 0} câu</span>
                  <span class="badge badge-p2">Phần II: ${ex.part2?.length || 0} câu (Đ/S)</span>
                  <span class="badge badge-p3">Phần III: ${ex.part3?.length || 0} câu (Trả lời ngắn)</span>
                  <span class="badge badge-neutral">
                    ${escapeHtml(ex.subject)} • ${totalQ} câu • ${asg.timedMode ? `${durationMins} phút` : 'Không giới hạn giờ'}
                  </span>
                </div>

                <div class="exam-card-footer">
                  <div class="exam-meta-inline" style="flex-wrap:wrap;">
                    ${asg.openAt ? `<span><strong>Mở đề:</strong> ${escapeHtml(formatDateTimeVN(asg.openAt))}</span>` : ''}
                    <span><strong>${asgType === 'test' ? 'Đóng đề / Hạn nộp:' : 'Hạn nộp:'}</strong> ${escapeHtml(formatDateTimeVN(asg.dueAt))}</span>
                  </div>
                  <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    ${
                      latestSub
                        ? `<button class="btn btn-secondary btn-sm" data-review-sub="${latestSub.id}">Xem lại bài &amp; Lời giải</button>`
                        : ''
                    }
                    ${
                      canStart
                        ? `<button class="btn btn-primary btn-sm" data-take-asg="${asg.id}">Bắt đầu làm bài →</button>`
                        : notOpen
                          ? `<span class="badge badge-neutral">Chưa đến giờ mở đề</span>`
                          : latestSub
                            ? `<span class="badge badge-success">Đã hoàn thành</span>`
                            : `<span class="badge badge-danger">Đã khóa (Quá hạn)</span>`
                    }
                  </div>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderHistorySection() {
    const { submissions } = state.data;
    return `
      <div class="card" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Đề thi / Bài tập</th>
              <th>Điểm tổng</th>
              <th>Chi tiết (P.I / P.II / P.III)</th>
              <th>Thời gian làm</th>
              <th>Thời điểm nộp</th>
              <th style="text-align:right;">Xem lại</th>
            </tr>
          </thead>
          <tbody>
            ${
              submissions.length === 0
                ? `<tr><td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">Bạn chưa nộp bài thi nào.</td></tr>`
                : submissions
                    .map((s) => {
                      const r = s.result || {};
                      return `
                        <tr>
                          <td><strong>${escapeHtml(s.assignmentTitle)}</strong></td>
                          <td><span class="badge badge-p1" style="font-size:0.86rem;">${formatScoreVN(r.totalScore ?? 0)} / ${formatScoreVN(r.maxScore ?? 10)}đ</span></td>
                          <td style="font-size:0.82rem; color:var(--text-secondary);">
                            P.I: <strong>${formatScoreVN(r.part1?.score ?? 0)}</strong> •
                            P.II: <strong>${formatScoreVN(r.part2?.score ?? 0)}</strong> •
                            P.III: <strong>${formatScoreVN(r.part3?.score ?? 0)}</strong>
                          </td>
                          <td>${formatTime(s.elapsedSeconds)}</td>
                          <td style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(formatDateTimeVN(s.submittedAt))}</td>
                          <td style="text-align:right;">
                            <button class="btn btn-secondary btn-sm" data-review-sub="${s.id}">Xem đáp án &amp; lời giải</button>
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

  function bindEvents() {
    rootEl.querySelectorAll('[data-stu-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.subTab = btn.dataset.stuTab;
        render();
      });
    });

    rootEl.querySelectorAll('[data-take-asg]').forEach((btn) => {
      btn.addEventListener('click', () => startAssignment(btn.dataset.takeAsg));
    });

    rootEl.querySelectorAll('[data-review-sub]').forEach((btn) => {
      btn.addEventListener('click', () => openSubmissionReview(btn.dataset.reviewSub));
    });

    const feedListEl = rootEl.querySelector('#studentFeedList');
    if (feedListEl) {
      bindFeedEvents(feedListEl, { uiHelpers });
    }

    rootEl.querySelector('#inpStuFeedSearch')?.addEventListener('input', (e) => {
      state.feedSearch = e.target.value;
      const listEl = rootEl.querySelector('#studentFeedList');
      if (!listEl) return;
      const posts = state.data.posts || [];
      const filtered = filterPosts(posts);
      listEl.innerHTML = renderFeedList({
        posts: filtered,
        isAdmin: false,
        emptyTitle: 'Không tìm thấy bài viết phù hợp',
        emptyText: 'Thử nhập từ khóa khác hoặc xóa ô tìm kiếm.',
      });
      bindFeedEvents(listEl, { uiHelpers });
      renderMath(listEl);
    });
  }

  function startAssignment(asgId) {
    const asg = state.data.assignments.find((a) => a.id === asgId);
    if (!asg || !asg.exam) return;
    const dl = getDeadlineStatus(asg.dueAt, asg.openAt);
    if (dl.notOpen) {
      showToast(`Chưa đến thời gian mở đề (${formatDateTimeVN(asg.openAt)}).`, 'error');
      return;
    }
    if (dl.expired) {
      showToast('Bài này đã hết hạn nộp.', 'error');
      return;
    }
    if (asg.mySubmissions?.length > 0) {
      showToast('Bạn đã hoàn thành bài này rồi (không cho phép làm lại).', 'error');
      return;
    }

    const u = state.data.user;
    const isStrictTest = asg.assignmentType === 'test';
    if (isStrictTest && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    state.inRunner = true;
    examRunner.startTaking({
      exam: asg.exam,
      assignment: asg,
      studentName: u.fullName,
      studentClass: u.className,
      isPreview: false,
      strictTestMode: isStrictTest,
      shuffle: Boolean(asg.shuffle),
      timedMode: Boolean(asg.timedMode),
      durationMinutes: asg.durationMinutes || asg.exam.durationMinutes || 45,
      onSubmitPersist: async ({ answers, result, elapsedSeconds, examSnapshot }) => {
        await api.submitExam({
          assignmentId: asg.id,
          answers,
          result,
          elapsedSeconds,
          examSnapshot,
        });
      },
      onExit: async () => {
        state.inRunner = false;
        await refresh();
      },
    });
  }

  function openSubmissionReview(subId) {
    const sub = state.data.submissions.find((s) => s.id === subId);
    if (!sub) return;
    const exam = sub.examSnapshot || state.data.examsById?.[sub.examId];
    if (!exam) {
      showToast('Không tìm thấy dữ liệu đề thi gốc.', 'error');
      return;
    }
    const asg = state.data.assignments.find((a) => a.id === sub.assignmentId);

    state.inRunner = true;
    examRunner.openReview({
      exam,
      answers: sub.answers,
      result: sub.result,
      studentName: sub.studentName,
      studentClass: sub.studentClass,
      elapsedSeconds: sub.elapsedSeconds,
      assignment: { title: sub.assignmentTitle, dueAt: asg?.dueAt },
      onRetry: null,
      onExit: async () => {
        state.inRunner = false;
        await refresh();
      },
    });
  }

  return {
    init: refresh,
    goHome: () => {
      examRunner.cleanup();
      state.inRunner = false;
      state.subTab = 'feed';
      refresh();
    },
  };
}
