import { api } from './api.js';
import {
  escapeHtml,
  escapeAttr,
  formatScoreVN,
  formatTime,
  formatDateTimeVN,
  formatDateOnlyVN,
  parseVnDateOnlyToIso,
  getDeadlineStatus,
} from './exam-engine.js';

export function createStudentController({ rootEl, examRunner, uiHelpers, onUserUpdated }) {
  const { showToast, setHeaderStatus } = uiHelpers;

  const state = {
    subTab: 'assigned', // 'assigned' | 'history' | 'profile'
    data: {
      user: null,
      assignments: [],
      submissions: [],
      examsById: {},
    },
    inRunner: false,
  };

  async function refresh() {
    try {
      state.data = await api.studentDashboard();
      if (state.data.user && typeof onUserUpdated === 'function') {
        onUserUpdated(state.data.user);
      }
      if (!state.inRunner) render();
    } catch (err) {
      showToast(err.message || 'Không thể tải danh sách bài tập.', 'error');
    }
  }

  function render() {
    state.inRunner = false;
    const { user, assignments, submissions } = state.data;
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
          <div class="hero-eyebrow">Góc học tập Học sinh • @${escapeHtml(user.username)}</div>
          <h1 style="margin-bottom:0;">Xin chào, ${escapeHtml(user.fullName)}!</h1>
        </div>
        <div class="kpi-strip">
          <div class="kpi-box"><div class="kpi-num">${pendingCount}</div><div class="kpi-lbl">Bài chưa làm</div></div>
          <div class="kpi-box"><div class="kpi-num">${completedAsgIds.size}</div><div class="kpi-lbl">Bài đã nộp</div></div>
          <div class="kpi-box"><div class="kpi-num">${submissions.length ? formatScoreVN(avgScore) : '—'}</div><div class="kpi-lbl">Điểm TB</div></div>
        </div>
      </div>

      <div class="subtab-bar">
        <button class="subtab-btn ${state.subTab === 'assigned' ? 'active' : ''}" data-stu-tab="assigned">
          Đề thi được giao <span class="badge badge-neutral">${assignments.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'history' ? 'active' : ''}" data-stu-tab="history">
          Lịch sử &amp; Kết quả <span class="badge badge-neutral">${submissions.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'profile' ? 'active' : ''}" data-stu-tab="profile">
          Hồ sơ cá nhân &amp; Đổi mật khẩu
        </button>
      </div>

      <div id="studentSubContent">
        ${state.subTab === 'assigned' ? renderAssignedSection() : ''}
        ${state.subTab === 'history' ? renderHistorySection() : ''}
        ${state.subTab === 'profile' ? renderProfileSection() : ''}
      </div>
    `;

    bindEvents();
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
                    <p class="exam-card-desc">
                      ${escapeHtml(asg.note || ex.description || 'Đề thi trực tuyến chuẩn cấu trúc Bộ GD&ĐT 2025.')}
                    </p>
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

  function renderProfileSection() {
    const u = state.data.user;
    return `
      <div class="profile-grid">
        <div class="card panel-card">
          <h3>Thông tin cá nhân</h3>
          <form id="formStudentProfile">
            <div class="form-row-2">
              <div class="form-group">
                <label>Tên đăng nhập (không thể sửa)</label>
                <input class="input-control" value="${escapeAttr(u.username)}" disabled />
              </div>
              <div class="form-group">
                <label>Số báo danh / Mã HS</label>
                <input id="profCode" class="input-control" value="${escapeAttr(u.studentCode || '')}" placeholder="VD: 250101" />
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label>Họ và tên *</label>
                <input id="profFullName" class="input-control" value="${escapeAttr(u.fullName || '')}" required />
              </div>
              <div class="form-group">
                <label>Lớp</label>
                <input id="profClass" class="input-control" value="${escapeAttr(u.className || '')}" placeholder="VD: 12A1" />
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label>Ngày sinh (dd/mm/yyyy)</label>
                <input id="profDob" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(formatDateOnlyVN(u.dob || ''))}" />
              </div>
              <div class="form-group">
                <label>Số điện thoại</label>
                <input id="profPhone" class="input-control" value="${escapeAttr(u.phone || '')}" placeholder="09xxxxxxxx" />
              </div>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="profEmail" type="email" class="input-control" value="${escapeAttr(u.email || '')}" placeholder="email@school.vn" />
            </div>
            <button type="submit" class="btn btn-primary">Lưu thông tin cá nhân</button>
          </form>
        </div>

        <div class="card panel-card">
          <h3>Đổi mật khẩu đăng nhập</h3>
          <form id="formChangePassword">
            <div class="form-group">
              <label>Mật khẩu hiện tại *</label>
              <input id="pwCurrent" type="password" class="input-control" placeholder="Nhập mật khẩu đang dùng" required />
            </div>
            <div class="form-group">
              <label>Mật khẩu mới *</label>
              <input id="pwNew" type="password" class="input-control" placeholder="Tối thiểu 4 ký tự" required />
            </div>
            <div class="form-group">
              <label>Nhập lại mật khẩu mới *</label>
              <input id="pwConfirm" type="password" class="input-control" placeholder="Nhập khớp mật khẩu mới" required />
            </div>
            <button type="submit" class="btn btn-primary">Cập nhật mật khẩu</button>
          </form>
        </div>
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

    rootEl.querySelector('#formStudentProfile')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      let dobIso = '';
      try {
        dobIso = parseVnDateOnlyToIso(rootEl.querySelector('#profDob').value, 'Ngày sinh');
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
      try {
        const res = await api.updateProfile({
          fullName: rootEl.querySelector('#profFullName').value.trim(),
          className: rootEl.querySelector('#profClass').value.trim(),
          studentCode: rootEl.querySelector('#profCode').value.trim(),
          dob: dobIso,
          phone: rootEl.querySelector('#profPhone').value.trim(),
          email: rootEl.querySelector('#profEmail').value.trim(),
        });
        state.data.user = res.user;
        onUserUpdated?.(res.user);
        showToast('Đã cập nhật thông tin cá nhân thành công!', 'success');
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    rootEl.querySelector('#formChangePassword')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cur = rootEl.querySelector('#pwCurrent').value;
      const nw = rootEl.querySelector('#pwNew').value;
      const cf = rootEl.querySelector('#pwConfirm').value;
      if (nw !== cf) {
        showToast('Mật khẩu mới nhập lại không khớp.', 'error');
        return;
      }
      try {
        await api.changePassword(cur, nw);
        showToast('Đổi mật khẩu thành công!', 'success');
        e.target.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
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
      state.subTab = 'assigned';
      refresh();
    },
  };
}
