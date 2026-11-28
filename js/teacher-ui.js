import { api } from './api.js?v=20261126l';
import {
  extractTextFromPdfFile,
  renderPdfBase64ToPngDataUrl,
  renderPdfBase64AllPagesToPngs,
  cropPdfFiguresFromFile,
  replaceTokensInExamOrDeck,
} from './pdf-reader.js?v=20261126l';
import {
  escapeHtml,
  escapeAttr,
  formatScoreVN,
  formatTime,
  formatDateTimeVN,
  formatDateOnlyVN,
  splitIsoToVnDateTime,
  parseVnDateTimeToIso,
  parseVnDateOnlyToIso,
  getDeadlineStatus,
  defaultVnDateTime,
} from './exam-engine.js?v=20261127p';
import {
  renderFeedList,
  bindFeedEvents,
  openPostComposerModal,
  getTargetStudentsForAssignment,
} from './classroom-feed.js?v=20261127u';
import {
  formatDateVNAdmin,
  getCurrentMonthKey,
  getTodayIsoLocal,
  countMonthUnpaid,
  renderTuitionAdminSection,
  bindTuitionAdminEvents,
} from './tuition-admin.js?v=20261124s';
import {
  renderAnalyticsAdminSection,
  bindAnalyticsAdminEvents,
} from './analytics-admin.js?v=20261124a';
import { mountAnimatedDropzone } from './ux-dropzone.js?v=20261124z2';
import { attachJellyTabs } from './ux-effects.js?v=20261125l';
import {
  normalizeImgKey,
  readImageFileAsDataUrl,
  scanMissingImages,
  scanMissingImagesInQuestion,
  replaceMissingImageInExam,
  extractQuestionImages,
  appendImageToQuestion,
  removeImageFromQuestion,
  normalizeQuestionForLatexEditor,
} from './exam-images.js?v=20261128d';

const SAMPLE_EXTEST_TEX = `\\title{Đề luyện tập Toán 12 — Nạp từ LaTeX ex\\_test}

\\begin{ex}%[2D4N1-1]
Họ nguyên hàm của hàm số $f(x) = 4x^3 - 2x + 5$ là:
\\choice
{\\True $x^4 - x^2 + 5x + C$}
{$12x^2 - 2 + C$}
{$x^4 - 2x^2 + 5x + C$}
{$4x^4 - x^2 + 5x + C$}
\\loigiai{
Ta có $\\displaystyle \\int (4x^3 - 2x + 5)\\,\\mathrm{d}x = x^4 - x^2 + 5x + C$.
}
\\end{ex}

\\begin{ex}%[2D1H2-2]
Cho hàm số $y = x^3 - 3x^2 + 2$. Xét tính đúng sai của các khẳng định sau:
\\choiceTF[t]
{\\True Đạo hàm của hàm số là $y' = 3x^2 - 6x$.}
{Hàm số đạt cực đại tại $x = 2$.}
{\\True Giá trị cực tiểu của hàm số bằng $-2$.}
{\\True Phương trình $y = 0$ có đúng $3$ nghiệm thực phân biệt.}
\\loigiai{
Ta có $y' = 0 \\Leftrightarrow \\hoac{& x = 0 \\\\ & x = 2.}$
\\begin{itemchoice}
\\itemch Đúng vì $y' = 3x^2 - 6x$.
\\itemch Sai vì hàm số đạt cực đại tại $x = 0$ ($y_{\\text{CĐ}} = 2$).
\\itemch Đúng vì $y(2) = -2$.
\\itemch Đúng vì $y_{\\text{CT}} < 0 < y_{\\text{CĐ}}$.
\\end{itemchoice}
}
\\end{ex}

\\begin{ex}%[2D4H3-1]
Tính tích phân $I = \\displaystyle \\int_0^3 (2x - 1)\\,\\mathrm{d}x$.
\\shortans[oly]{6}
\\loigiai{
Ta có $I = \\big[x^2 - x\\big]_0^3 = 6$.
}
\\end{ex}`;

export function createTeacherController({ rootEl, examRunner, uiHelpers, onPresentExam, onExamsLoaded }) {
  const { showToast, openModal, closeModal, renderMath, setHeaderStatus } = uiHelpers;

  const state = {
    subTab: 'feed', // 'feed' | 'exams' | 'tuition' | 'assignments' | 'analytics' | 'students'
    data: {
      user: null,
      exams: [],
      students: [],
      assignments: [],
      submissions: [],
      posts: [],
      tuition: null,
      analytics: null,
      modelsSummary: [],
    },
    editingExam: null, // null | cloned exam draft
    editorPartTab: 'part1', // 'part1' | 'part2' | 'part3'
    feedClassFilter: 'all',
    feedSearch: '',
    subFilterAsg: 'all',
    subSearch: '',
    tuitionMonth: getCurrentMonthKey(),
    tuitionClass: 'all',
    tuitionStatus: 'all',
    analyticsRange: 'all',
    analyticsView: 'students',
    analyticsClass: 'all',
    analyticsGrade: 'all',
    analyticsSearch: '',
    inRunner: false,
  };

  async function refresh() {
    try {
      const res = await api.adminOverview();
      state.data = {
        ...res,
        exams: res.exams || [],
        students: res.students || [],
        assignments: res.assignments || [],
        submissions: res.submissions || [],
        posts: res.posts || [],
        tuition: res.tuition || null,
        analytics: res.analytics || null,
        modelsSummary: res.modelsSummary || [],
      };
      onExamsLoaded?.(state.data.exams);
      if (!state.inRunner) render();
    } catch (err) {
      showToast(err.message || 'Không thể tải dữ liệu quản trị.', 'error');
    }
  }

  function getKnownClasses() {
    const set = new Set();
    (state.data.students || []).forEach((s) => {
      if (s.className && s.className.trim()) set.add(s.className.trim());
    });
    (state.data.posts || []).forEach((p) => {
      (p.targetClasses || []).forEach((c) => {
        if (c && c.trim()) set.add(c.trim());
      });
    });
    Object.keys(state.data.tuition?.classRateHistory || {}).forEach((c) => {
      if (c && c.trim()) set.add(c.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }

  function filterAdminPosts(posts) {
    const clsFilter = state.feedClassFilter;
    const q = state.feedSearch.trim().toLowerCase();
    return posts.filter((p) => {
      if (clsFilter === '__all_classes__') {
        if (!p.targetAll) return false;
      } else if (clsFilter !== 'all') {
        if (!p.targetAll && !(p.targetClasses || []).includes(clsFilter)) return false;
      }
      if (q) {
        const attNames = (p.attachments || [])
          .map((a) => `${a.title || ''} ${a.fileName || ''} ${a.url || ''}`)
          .join(' ');
        const hay = `${p.title || ''} ${p.content || ''} ${attNames}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render() {
    state.inRunner = false;
    setHeaderStatus('');

    if (state.editingExam) {
      renderExamEditor();
      return;
    }

    const { exams, students, assignments, submissions, posts, tuition, analytics, modelsSummary, storageMode, storageError } = state.data;
    const isCloud = storageMode === 'supabase';
    const unpaidCurCount = countMonthUnpaid(students, tuition);

    rootEl.innerHTML = `
      <div class="role-hero teacher-hero">
        <div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;">
            <div class="hero-eyebrow" style="margin-bottom:0;">Bảng điều khiển Giáo viên</div>
            <button type="button" id="btnOpenStorageHero" class="hero-eyebrow hero-eyebrow-btn" title="${escapeAttr(storageError || 'Bấm để xem & quản lý dung lượng bộ nhớ Supabase')}" style="margin-bottom:0; background:${isCloud ? 'rgba(16, 185, 129, 0.22)' : storageError ? 'rgba(225, 29, 72, 0.28)' : 'rgba(255,255,255,0.12)'}; border-color:${isCloud ? 'rgba(110, 231, 183, 0.5)' : storageError ? 'rgba(254, 205, 211, 0.6)' : 'rgba(255,255,255,0.2)'};">
              ${isCloud ? '● Supabase Cloud • Quản lý bộ nhớ' : storageError ? '⚠ Lỗi Supabase • Kiểm tra bộ nhớ' : '○ Lưu trữ cục bộ • Quản lý bộ nhớ'}
            </button>
          </div>
          <h1 style="margin-bottom:0;">Xin chào thầy Hoàng!</h1>
        </div>
        <div class="kpi-strip">
          <div class="kpi-box"><div class="kpi-num">${posts.length}</div><div class="kpi-lbl">Bài giảng &amp; Tin</div></div>
          <div class="kpi-box"><div class="kpi-num">${exams.length}</div><div class="kpi-lbl">Đề thi</div></div>
          <div class="kpi-box"><div class="kpi-num">${students.length}</div><div class="kpi-lbl">Học sinh</div></div>
          <div class="kpi-box"><div class="kpi-num">${submissions.length}</div><div class="kpi-lbl">Lượt nộp bài</div></div>
        </div>
      </div>

      <div class="teacher-subtabs-wrap">
        <div class="subtab-bar teacher-subtabs is-icon-expand" role="tablist" aria-label="Quản lý lớp học">
          <button
            class="subtab-btn ${state.subTab === 'feed' ? 'active' : ''}"
            data-subtab="feed"
            data-tooltip="Bảng tin (${posts.length})"
            aria-label="Bảng tin"
          >
            <span class="subtab-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
                <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>
              </svg>
            </span>
            <span class="subtab-lbl">Bảng tin</span>
            <span class="badge badge-neutral subtab-count">${posts.length}</span>
          </button>

          <button
            class="subtab-btn ${state.subTab === 'exams' ? 'active' : ''}"
            data-subtab="exams"
            data-tooltip="Ngân hàng đề thi (${exams.length})"
            aria-label="Ngân hàng đề thi"
          >
            <span class="subtab-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </span>
            <span class="subtab-lbl">Ngân hàng đề thi</span>
            <span class="badge badge-neutral subtab-count">${exams.length}</span>
          </button>

          <button
            class="subtab-btn ${state.subTab === 'assignments' ? 'active' : ''}"
            data-subtab="assignments"
            data-tooltip="Bài tập (${assignments.length})"
            aria-label="Bài tập"
          >
            <span class="subtab-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </span>
            <span class="subtab-lbl">Bài tập</span>
            <span class="badge badge-neutral subtab-count">${assignments.length}</span>
          </button>

          <button
            class="subtab-btn ${state.subTab === 'tuition' ? 'active' : ''}"
            data-subtab="tuition"
            data-tooltip="Học phí (${unpaidCurCount > 0 ? `${unpaidCurCount} chưa nộp` : 'Đủ'})"
            aria-label="Học phí"
          >
            <span class="subtab-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              ${unpaidCurCount > 0 ? `<span class="subtab-mini-dot" aria-hidden="true">${unpaidCurCount}</span>` : ''}
            </span>
            <span class="subtab-lbl">Học phí</span>
            <span class="badge ${unpaidCurCount > 0 ? 'badge-warning' : 'badge-success'} subtab-count">${unpaidCurCount > 0 ? `${unpaidCurCount} chưa nộp` : 'Đủ'}</span>
          </button>

          <button
            class="subtab-btn ${state.subTab === 'analytics' ? 'active' : ''}"
            data-subtab="analytics"
            data-tooltip="Thống kê"
            aria-label="Thống kê"
          >
            <span class="subtab-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </span>
            <span class="subtab-lbl">Thống kê</span>
          </button>

          <button
            class="subtab-btn ${state.subTab === 'students' ? 'active' : ''}"
            data-subtab="students"
            data-tooltip="Tài khoản học sinh (${students.length})"
            aria-label="Tài khoản học sinh"
          >
            <span class="subtab-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
            <span class="subtab-lbl">Tài khoản học sinh</span>
            <span class="badge badge-neutral subtab-count">${students.length}</span>
          </button>
        </div>
      </div>

      <div id="teacherSubContent">
        ${state.subTab === 'feed' ? renderFeedSection() : ''}
        ${state.subTab === 'exams' ? renderExamsSection() : ''}
        ${state.subTab === 'tuition' ? renderTuitionAdminSection({ students, classes: getKnownClasses(), tuition, state }) : ''}
        ${state.subTab === 'assignments' ? renderMergedHomeworkSection() : ''}
        ${state.subTab === 'analytics' ? renderAnalyticsAdminSection({ students, classes: getKnownClasses(), modelsSummary, analytics, state }) : ''}
        ${state.subTab === 'students' ? renderStudentsSection() : ''}
      </div>
    `;

    bindDashboardEvents();
    attachJellyTabs(rootEl.querySelector('.teacher-subtabs'), {
      key: 'teacher-subtabs',
      itemSelector: '.subtab-btn',
    });
    renderMath(rootEl);
  }

  // =========================================================
  // SUB-TAB 0: CLASSROOM NEWSFEED & MATERIALS
  // =========================================================
  function renderFeedSection() {
    const posts = state.data.posts || [];
    const classes = getKnownClasses();
    const filtered = filterAdminPosts(posts);

    return `
      <div class="section-toolbar">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <button
            type="button"
            class="feed-post-icon-btn"
            id="btnNewPost"
            aria-label="Đăng bài giảng / tài liệu"
            data-tooltip="Đăng bài giảng / tài liệu"
          >
            <svg class="feed-post-icon-svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path class="fpi-tray" d="M21 15v4a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 19v-4"/>
              <g class="fpi-arrow">
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </g>
            </svg>
          </button>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <select id="selFeedClassFilter" class="input-control" style="width:auto; min-width:170px;">
            <option value="all" ${state.feedClassFilter === 'all' ? 'selected' : ''}>Tất cả bài đăng (${posts.length})</option>
            <option value="__all_classes__" ${state.feedClassFilter === '__all_classes__' ? 'selected' : ''}>Gửi tất cả các lớp</option>
            ${classes
              .map(
                (c) =>
                  `<option value="${escapeAttr(c)}" ${state.feedClassFilter === c ? 'selected' : ''}>Lớp ${escapeHtml(c)}</option>`
              )
              .join('')}
          </select>
          <input
            id="inpTeacherFeedSearch"
            type="search"
            class="input-control"
            style="width:230px;"
            placeholder="Tìm bài viết, tài liệu..."
            value="${escapeAttr(state.feedSearch)}"
          />
        </div>
      </div>

      <div id="teacherFeedList">
        ${renderFeedList({
          posts: filtered,
          isAdmin: true,
          assignments: state.data.assignments || [],
          exams: state.data.exams || [],
          students: state.data.students || [],
          submissions: state.data.submissions || [],
          emptyTitle: posts.length ? 'Không tìm thấy bài viết phù hợp' : 'Chưa có bài đăng nào trong lớp học',
          emptyText: posts.length
            ? 'Thử chọn lớp khác hoặc đổi từ khóa tìm kiếm.'
            : 'Nhấn <strong>"Đăng bài giảng / tài liệu"</strong> để đăng video YouTube, handout PDF, hình ảnh hoặc đường link cho học sinh.',
        })}
      </div>
    `;
  }

  // =========================================================
  // SUB-TAB 1: EXAMS MANAGEMENT
  // =========================================================
  function renderExamsSection() {
    const { exams } = state.data;
    return `
      <div class="section-toolbar">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="btnImportLatex">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
            </svg>
            Nạp đề LaTeX (ex_test)
          </button>
          <button class="btn btn-secondary" id="btnImportWordPdf">Nạp file Word / PDF</button>
          <button class="btn btn-secondary" id="btnNewExam">+ Tạo đề thủ công</button>
        </div>
      </div>

      <div class="exam-list">
        ${
          exams.length === 0
            ? `<div class="card panel-card" style="text-align:center; padding:40px; color:var(--text-muted);">
                Chưa có đề thi nào. Nhấn <strong>"Nạp đề LaTeX (ex_test)"</strong> hoặc <strong>"+ Tạo đề thủ công"</strong> để bắt đầu.
              </div>`
            : exams
                .map((ex) => {
                  const p4n = ex.part4?.length || 0;
                  const totalQ = (ex.part1?.length || 0) + (ex.part2?.length || 0) + (ex.part3?.length || 0) + p4n;
                  const missingInfo = scanMissingImages(ex);
                  const isPresOnly = Boolean(ex.presentationOnly);
                  const startNum = Math.max(1, Math.floor(Number(ex.startQuestionNumber) || 1));
                  return `
                    <article class="exam-card" style="cursor:default;">
                      <div class="exam-card-top">
                        <div>
                          <h3 class="exam-card-title">${escapeHtml(ex.title)}</h3>
                          ${ex.description ? `<p class="exam-card-desc">${escapeHtml(ex.description)}</p>` : ''}
                        </div>
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                          ${
                            isPresOnly
                              ? `<span class="badge badge-p2">Chỉ trình chiếu${startNum > 1 ? ` • Từ Câu ${startNum}` : ''}</span>`
                              : startNum > 1
                                ? `<span class="badge badge-neutral">Từ Câu ${startNum}</span>`
                                : ''
                          }
                          ${
                            missingInfo.uniqueNames.length > 0
                              ? `<span class="badge badge-warning" title="Thiếu ảnh: ${escapeAttr(missingInfo.uniqueNames.join(', '))}">⚠ Thiếu ${missingInfo.uniqueNames.length} ảnh</span>`
                              : ''
                          }
                          <span class="badge badge-p1">${escapeHtml(ex.code || 'MĐ')}</span>
                        </div>
                      </div>

                      <div class="exam-card-badges">
                        <span class="badge badge-p1">Phần I: ${ex.part1?.length || 0} câu</span>
                        <span class="badge badge-p2">Phần II: ${ex.part2?.length || 0} câu</span>
                        <span class="badge badge-p3">Phần III: ${ex.part3?.length || 0} câu</span>
                        ${p4n > 0 ? `<span class="badge badge-neutral">Phần IV: ${p4n} câu</span>` : ''}
                        <span class="badge badge-neutral">${escapeHtml(ex.subject || 'Chưa phân môn')} • ${ex.durationMinutes} phút • ${totalQ} câu</span>
                      </div>

                      <div class="exam-card-footer" style="justify-content:flex-end;">
                        <div class="exam-card-icon-actions">
                          ${
                            isPresOnly
                              ? `
                                <button type="button" class="exam-act-icon-btn is-primary" data-present-exam-card="${ex.id}" data-tooltip="Trình chiếu" aria-label="Trình chiếu">
                                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                                  </svg>
                                </button>
                              `
                              : `
                                <button type="button" class="exam-act-icon-btn is-primary" data-assign-exam="${ex.id}" data-tooltip="Giao bài tập" aria-label="Giao bài tập">
                                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                  </svg>
                                </button>
                                <button type="button" class="exam-act-icon-btn is-secondary" data-present-exam-card="${ex.id}" data-tooltip="Trình chiếu" aria-label="Trình chiếu">
                                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                                  </svg>
                                </button>
                              `
                          }
                          <button type="button" class="exam-act-icon-btn is-secondary" data-edit-exam="${ex.id}" data-tooltip="Tinh chỉnh đề" aria-label="Tinh chỉnh đề">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                            </svg>
                          </button>
                          <button type="button" class="exam-act-icon-btn is-secondary" data-preview-exam="${ex.id}" data-tooltip="Xem trước" aria-label="Xem trước">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                          </button>
                          <button type="button" class="exam-act-icon-btn is-danger" data-delete-exam="${ex.id}" data-tooltip="Xóa đề" aria-label="Xóa đề">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </article>
                  `;
                })
                .join('')
        }
      </div>
    `;
  }

  // =========================================================
  // VISUAL EXAM EDITOR (ADD / EDIT EXAM & QUESTIONS)
  // =========================================================
  function openNewExamEditor() {
    state.editingExam = {
      id: null, // null means create new
      title: 'Đề kiểm tra mới',
      subject: 'Toán học 12',
      code: 'MĐ ' + String(Math.floor(100 + Math.random() * 899)),
      durationMinutes: 45,
      description: '',
      scoring: {
        part1PerQuestion: 0.25,
        part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
        part3PerQuestion: 0.5,
      },
      part1: [
        {
          id: 'p1-' + Date.now().toString(36),
          topic: '',
          stem: '',
          options: [
            { key: 'A', text: '' },
            { key: 'B', text: '' },
            { key: 'C', text: '' },
            { key: 'D', text: '' },
          ],
          answer: 'A',
          explanation: '',
        },
      ],
      part2: [],
      part3: [],
      part4: [],
    };
    state.editorPartTab = 'part1';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openEditExamEditor(examId) {
    const found = state.data.exams.find((e) => e.id === examId);
    if (!found) return;
    state.editingExam = structuredClone(found);
    state.editingExam.part1 = state.editingExam.part1 || [];
    state.editingExam.part2 = state.editingExam.part2 || [];
    state.editingExam.part3 = state.editingExam.part3 || [];
    state.editingExam.part4 = state.editingExam.part4 || [];
    state.editingExam.scoring = state.editingExam.scoring || {
      part1PerQuestion: 0.25,
      part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
      part3PerQuestion: 0.5,
    };
    state.editorPartTab =
      state.editingExam.part1.length > 0
        ? 'part1'
        : state.editingExam.part2.length > 0
          ? 'part2'
          : state.editingExam.part3.length > 0
            ? 'part3'
            : state.editingExam.part4.length > 0
              ? 'part4'
              : 'part1';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderEditorQuestionMediaBar(q, idx) {
    normalizeQuestionForLatexEditor(q);
    const imgs = extractQuestionImages(q);
    const missing = scanMissingImagesInQuestion(q);
    const hasFigTex = Boolean((q.figureTex || '').trim());
    return `
      <div class="ed-media-zone">
        <div class="ed-media-bar">
          <button type="button" class="btn btn-secondary btn-sm ed-img-add-btn" data-ed-add-img="${idx}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Chèn ảnh PNG / JPG (chọn nhiều ảnh)
          </button>
          <button type="button" class="btn btn-ghost btn-sm" data-ed-toggle-figtex="${idx}">
            ${hasFigTex ? 'Mã ảnh LaTeX (TikZ) đang mở' : '+ Thêm mã ảnh LaTeX (TikZ)'}
          </button>
          <span class="ed-media-hint">Hỗ trợ dán ảnh (Ctrl+V), chèn nhiều ảnh PNG/JPG hoặc mã TikZ song song</span>
        </div>
        ${
          missing.length > 0
            ? `
              <div class="ed-missing-chips">
                ${missing
                  .map(
                    (name) => `
                  <button type="button" class="ed-missing-chip" data-ed-fill-missing="${escapeAttr(name)}" title="Bấm để tải ảnh thay thế cho ${escapeAttr(name)}">
                    <span>⚠ Thiếu ảnh: <strong>${escapeHtml(name)}</strong></span>
                    <span class="ed-missing-chip-act">Tải ảnh lên</span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            `
            : ''
        }
        ${
          imgs.length > 0
            ? `
              <div class="ed-img-thumbs">
                ${imgs
                  .map(
                    (im) => `
                  <div class="ed-img-thumb">
                    <img src="${escapeAttr(im.src)}" alt="${escapeAttr(im.alt)}" />
                    <button type="button" class="ed-img-del" data-ed-del-img-q="${idx}" data-ed-del-img-field="${escapeAttr(im.field)}" data-ed-del-img-idx="${im.localIdx}" title="Xóa ảnh này" aria-label="Xóa ảnh">✕</button>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
            : ''
        }
        <div class="ed-figtex-wrap ${hasFigTex || q._showFigTex ? '' : 'hidden'}" data-ed-figtex-box="${idx}">
          <label class="ed-figtex-lbl">Mã ảnh LaTeX (TikZ — dùng riêng hoặc song song với ảnh PNG/JPG, tự biên dịch khi lưu)</label>
          <textarea
            class="input-control ed-latex-ta"
            rows="4"
            data-field="figureTex"
            placeholder="\\begin{tikzpicture}&#10;  ...&#10;\\end{tikzpicture}"
          >${escapeHtml(q.figureTex || '')}</textarea>
        </div>
      </div>
    `;
  }

  function renderExamEditor() {
    const ex = state.editingExam;
    ex.part4 = ex.part4 || [];
    const isNew = !ex.id;
    const pTab = state.editorPartTab;
    const missingInfo = scanMissingImages(ex);

    rootEl.innerHTML = `
      <div class="exam-topbar">
        <div class="exam-topbar-left">
          <button type="button" class="icon-back-btn" id="btnCancelEditor" data-tooltip="Hủy &amp; Quay lại" aria-label="Hủy và quay lại">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div class="exam-topbar-info">
            <h2>${isNew ? 'Tạo đề thi mới (Chuẩn BGD 2025)' : `Tinh chỉnh đề thi: ${escapeHtml(ex.title)}`}</h2>
            <div class="exam-topbar-meta">
              <span>Phần I: <strong>${ex.part1.length}</strong> câu • Phần II: <strong>${ex.part2.length}</strong> câu • Phần III: <strong>${ex.part3.length}</strong> câu${ex.part4.length ? ` • Phần IV: <strong>${ex.part4.length}</strong> câu` : ''}</span>
            </div>
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="btnSaveExamEditor">Lưu đề thi</button>
        </div>
      </div>

      ${
        missingInfo.uniqueNames.length > 0
          ? `
            <div class="ed-missing-banner">
              <div class="ed-missing-banner-top">
                <div>
                  <strong>⚠ Đề thi đang thiếu ${missingInfo.uniqueNames.length} ảnh minh họa (\\includegraphics)</strong>
                  <p>Bấm vào từng tên ảnh để chọn tệp, hoặc tải hàng loạt ảnh cùng lúc (tự khớp theo tên file như <code>im29.png</code>).</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btnEdBulkUploadImgs">Tải nhiều ảnh tự khớp tên</button>
              </div>
              <div class="ed-missing-chips">
                ${missingInfo.uniqueNames
                  .map(
                    (name) => `
                  <button type="button" class="ed-missing-chip" data-ed-fill-missing="${escapeAttr(name)}">
                    <span><strong>${escapeHtml(name)}</strong></span>
                    <span class="ed-missing-chip-act">Chọn ảnh</span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
          : ''
      }

      <!-- Exam Metadata Form -->
      <div class="card panel-card" style="margin-bottom:20px;">
        <h3>Thông tin chung &amp; Thang điểm</h3>
        <div class="form-grid-3">
          <div class="form-group" style="grid-column: span 2;">
            <label>Tên đề thi *</label>
            <input class="input-control" id="edTitle" value="${escapeAttr(ex.title)}" />
          </div>
          <div class="form-group">
            <label>Mã đề</label>
            <input class="input-control" id="edCode" value="${escapeAttr(ex.code)}" />
          </div>
          <div class="form-group">
            <label>Môn học</label>
            <input class="input-control" id="edSubject" value="${escapeAttr(ex.subject)}" />
          </div>
          <div class="form-group">
            <label>Thời gian làm bài (phút)</label>
            <input class="input-control" type="number" min="1" max="240" id="edDuration" value="${ex.durationMinutes}" />
          </div>
          <div class="form-group">
            <label>Điểm mỗi câu Phần I / Phần III</label>
            <div style="display:flex; gap:8px;">
              <input class="input-control" type="number" step="0.05" id="edScoreP1" value="${ex.scoring.part1PerQuestion}" title="Điểm Phần I" />
              <input class="input-control" type="number" step="0.05" id="edScoreP3" value="${ex.scoring.part3PerQuestion}" title="Điểm Phần III" />
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Mô tả ngắn</label>
          <input class="input-control" id="edDesc" value="${escapeAttr(ex.description || '')}" />
        </div>
        <div class="imp-pres-bar" style="margin-bottom:0;">
          <label class="checkbox-pill" style="margin:0;">
            <input type="checkbox" id="edPresentationOnly" ${ex.presentationOnly ? 'checked' : ''} />
            <span>Chỉ để trình chiếu</span>
          </label>
          <div id="edStartNumWrap" class="imp-start-num-wrap ${ex.presentationOnly ? '' : 'hidden'}">
            <span>STT bắt đầu của Câu 1:</span>
            <input type="number" min="1" max="999" id="edStartNum" class="input-control input-compact" style="width:80px; text-align:center;" value="${Math.max(1, Math.floor(Number(ex.startQuestionNumber) || 1))}" />
          </div>
        </div>
      </div>

      <!-- Part Switcher -->
      <div class="section-toolbar">
        <div class="subtab-bar" style="margin-bottom:0;">
          <button class="subtab-btn ${pTab === 'part1' ? 'active' : ''}" data-ed-part="part1">
            Phần I (${ex.part1.length})
          </button>
          <button class="subtab-btn ${pTab === 'part2' ? 'active' : ''}" data-ed-part="part2">
            Phần II (${ex.part2.length})
          </button>
          <button class="subtab-btn ${pTab === 'part3' ? 'active' : ''}" data-ed-part="part3">
            Phần III (${ex.part3.length})
          </button>
          <button class="subtab-btn ${pTab === 'part4' ? 'active' : ''}" data-ed-part="part4">
            Phần IV (${ex.part4.length})
          </button>
        </div>
        <button class="btn btn-primary btn-sm" id="btnAddQuestion">+ Thêm câu hỏi vào ${pTab === 'part1' ? 'Phần I' : pTab === 'part2' ? 'Phần II' : pTab === 'part3' ? 'Phần III' : 'Phần IV'}</button>
      </div>

      <div id="editorQuestionsList">
        ${pTab === 'part1' ? renderEditorPart1(ex.part1) : ''}
        ${pTab === 'part2' ? renderEditorPart2(ex.part2) : ''}
        ${pTab === 'part3' ? renderEditorPart3(ex.part3) : ''}
        ${pTab === 'part4' ? renderEditorPart4(ex.part4) : ''}
      </div>
    `;

    bindEditorEvents();
  }

  function renderEditorQuestionOrderControls(idx, total, startNum = 1) {
    const posOpts = Array.from({ length: total }, (_, i) =>
      `<option value="${i}" ${i === idx ? 'selected' : ''}>Vị trí ${startNum + i}</option>`
    ).join('');
    return `
      <div class="ed-q-head-actions">
        ${
          total > 1
            ? `
              <select class="ed-q-pos-select" data-move-q-to="${idx}" title="Chuyển câu hỏi tới vị trí khác trong phần">
                ${posOpts}
              </select>
              <button type="button" class="btn btn-secondary btn-sm ed-q-move-btn" data-move-q-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Đưa lên trên" aria-label="Đưa câu hỏi lên trên">↑</button>
              <button type="button" class="btn btn-secondary btn-sm ed-q-move-btn" data-move-q-down="${idx}" ${idx === total - 1 ? 'disabled' : ''} title="Đưa xuống dưới" aria-label="Đưa câu hỏi xuống dưới">↓</button>
            `
            : ''
        }
        <button type="button" class="btn btn-danger-outline btn-sm" data-del-q="${idx}">Xóa câu</button>
      </div>
    `;
  }

  function renderEditorPart1(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi nào ở Phần I. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    const startNum = Math.max(1, Math.floor(Number(state.editingExam?.startQuestionNumber) || 1));
    return list
      .map((q, idx) => {
        normalizeQuestionForLatexEditor(q);
        return `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-p1">Phần I • Câu ${startNum + idx}</span>
          ${renderEditorQuestionOrderControls(idx, list.length, startNum)}
        </div>
        <div class="form-group">
          <label>Đề bài (Mã LaTeX — hỗ trợ $...$, \\begin{enumerate}, \\heva...)</label>
          <textarea class="input-control ed-latex-ta" rows="3" data-field="stemTex">${escapeHtml(q.stemTex)}</textarea>
          ${renderEditorQuestionMediaBar(q, idx)}
        </div>
        <div class="form-row-2">
          ${q.options
            .map(
              (opt, oi) => `
            <div class="form-group" style="margin-bottom:8px;">
              <label style="display:flex; justify-content:space-between;">
                <span>Đáp án ${opt.key}</span>
                <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; font-weight:700; color:${q.answer === opt.key ? 'var(--success)' : 'var(--text-muted)'};">
                  <input type="radio" name="p1-ans-${idx}" value="${opt.key}" data-field="answer" ${q.answer === opt.key ? 'checked' : ''} />
                  Đáp án đúng
                </label>
              </label>
              <input class="input-control ed-latex-inp" data-opt-idx="${oi}" value="${escapeAttr(opt.text)}" />
            </div>
          `
            )
            .join('')}
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Lời giải / Hướng dẫn chấm (Mã LaTeX — tùy chọn)</label>
          <textarea class="input-control ed-latex-ta" rows="2" data-field="explanationTex">${escapeHtml(q.explanationTex || '')}</textarea>
        </div>
      </div>
    `;
      })
      .join('');
  }

  function renderEditorPart2(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi nào ở Phần II. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    const startNum = Math.max(1, Math.floor(Number(state.editingExam?.startQuestionNumber) || 1));
    return list
      .map((q, idx) => {
        normalizeQuestionForLatexEditor(q);
        return `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-p2">Phần II • Câu ${startNum + idx}</span>
          ${renderEditorQuestionOrderControls(idx, list.length, startNum)}
        </div>
        <div class="form-group">
          <label>Đề dẫn (Mã LaTeX — hỗ trợ $...$, \\begin{enumerate}, \\heva...)</label>
          <textarea class="input-control ed-latex-ta" rows="3" data-field="stemTex">${escapeHtml(q.stemTex)}</textarea>
          ${renderEditorQuestionMediaBar(q, idx)}
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
          ${q.statements
            .map(
              (st, si) => `
            <div style="display:grid; grid-template-columns: 28px 1fr 120px; gap:8px; align-items:center;">
              <strong style="color:var(--p2-text);">${st.key})</strong>
              <input class="input-control ed-latex-inp" data-st-text="${si}" value="${escapeAttr(st.text)}" />
              <select class="input-control" data-st-ans="${si}">
                <option value="true" ${st.answer ? 'selected' : ''}>Đúng</option>
                <option value="false" ${!st.answer ? 'selected' : ''}>Sai</option>
              </select>
            </div>
          `
            )
            .join('')}
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Lời giải / Hướng dẫn chấm (Mã LaTeX — tùy chọn)</label>
          <textarea class="input-control ed-latex-ta" rows="2" data-field="explanationTex">${escapeHtml(q.explanationTex || '')}</textarea>
        </div>
      </div>
    `;
      })
      .join('');
  }

  function renderEditorPart3(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi nào ở Phần III. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    const startNum = Math.max(1, Math.floor(Number(state.editingExam?.startQuestionNumber) || 1));
    return list
      .map((q, idx) => {
        normalizeQuestionForLatexEditor(q);
        return `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-p3">Phần III • Câu ${startNum + idx}</span>
          ${renderEditorQuestionOrderControls(idx, list.length, startNum)}
        </div>
        <div class="form-group">
          <label>Đề bài (Mã LaTeX — hỗ trợ $...$, \\begin{enumerate}, \\heva...)</label>
          <textarea class="input-control ed-latex-ta" rows="3" data-field="stemTex">${escapeHtml(q.stemTex)}</textarea>
          ${renderEditorQuestionMediaBar(q, idx)}
        </div>
        <div class="form-group">
          <label>Đáp án chuẩn (tối đa 4 ký tự, VD: -3 hoặc 4,5)</label>
          <input class="input-control" style="max-width:260px;" maxlength="4" data-field="answer" value="${escapeAttr(q.answer)}" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Lời giải / Hướng dẫn chấm (Mã LaTeX — tùy chọn)</label>
          <textarea class="input-control ed-latex-ta" rows="2" data-field="explanationTex">${escapeHtml(q.explanationTex || '')}</textarea>
        </div>
      </div>
    `;
      })
      .join('');
  }

  function renderEditorPart4(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi tự luận nào ở Phần IV. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    const startNum = Math.max(1, Math.floor(Number(state.editingExam?.startQuestionNumber) || 1));
    return list
      .map((q, idx) => {
        normalizeQuestionForLatexEditor(q);
        return `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-neutral">Phần IV (Tự luận) • Câu ${startNum + idx}</span>
          ${renderEditorQuestionOrderControls(idx, list.length, startNum)}
        </div>
        <div class="form-group">
          <label>Đề bài (Mã LaTeX — giữ nguyên \\begin{enumerate}, \\heva, $...$)</label>
          <textarea class="input-control ed-latex-ta" rows="4" data-field="stemTex">${escapeHtml(q.stemTex)}</textarea>
          ${renderEditorQuestionMediaBar(q, idx)}
        </div>
        <div class="form-group">
          <label>Đáp số (tùy chọn — hỗ trợ LaTeX, VD: $M(1;2;6)$)</label>
          <input class="input-control ed-latex-inp" data-field="answer" value="${escapeAttr(q.answer || '')}" placeholder="VD: $M(1;2;6)$ hoặc $x = 2$" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Lời giải / Hướng dẫn chấm (Mã LaTeX — tùy chọn)</label>
          <textarea class="input-control ed-latex-ta" rows="3" data-field="explanationTex">${escapeHtml(q.explanationTex || '')}</textarea>
        </div>
      </div>
    `;
      })
      .join('');
  }

  function syncEditorMetadataFromDom() {
    const ex = state.editingExam;
    if (!ex) return;
    const titleEl = rootEl.querySelector('#edTitle');
    if (titleEl) ex.title = titleEl.value.trim();
    const codeEl = rootEl.querySelector('#edCode');
    if (codeEl) ex.code = codeEl.value.trim();
    const subEl = rootEl.querySelector('#edSubject');
    if (subEl) ex.subject = subEl.value.trim();
    const durEl = rootEl.querySelector('#edDuration');
    if (durEl) ex.durationMinutes = Math.max(1, Number(durEl.value) || 45);
    const descEl = rootEl.querySelector('#edDesc');
    if (descEl) ex.description = descEl.value.trim();
    const presOnlyEl = rootEl.querySelector('#edPresentationOnly');
    if (presOnlyEl) ex.presentationOnly = Boolean(presOnlyEl.checked);
    const startNumEl = rootEl.querySelector('#edStartNum');
    if (startNumEl) {
      ex.startQuestionNumber = ex.presentationOnly ? Math.max(1, Math.floor(Number(startNumEl.value) || 1)) : 1;
    }
    const sp1 = rootEl.querySelector('#edScoreP1');
    if (sp1) ex.scoring.part1PerQuestion = Number(sp1.value) || 0.25;
    const sp3 = rootEl.querySelector('#edScoreP3');
    if (sp3) ex.scoring.part3PerQuestion = Number(sp3.value) || 0.5;
  }

  function syncCurrentPartQuestionsFromDom() {
    const ex = state.editingExam;
    if (!ex) return;
    const part = state.editorPartTab;
    const list = ex[part];
    rootEl.querySelectorAll('.editor-q-card').forEach((card) => {
      const idx = Number(card.dataset.qIdx);
      const q = list[idx];
      if (!q) return;
      const topicEl = card.querySelector('[data-field="topic"]');
      const stemTexEl = card.querySelector('[data-field="stemTex"]');
      const figTexEl = card.querySelector('[data-field="figureTex"]');
      const expTexEl = card.querySelector('[data-field="explanationTex"]');
      if (topicEl) q.topic = topicEl.value;
      if (stemTexEl) {
        q.stemTex = stemTexEl.value;
        q.stem = stemTexEl.value;
      }
      if (figTexEl) q.figureTex = figTexEl.value;
      if (expTexEl) {
        q.explanationTex = expTexEl.value;
        q.explanation = expTexEl.value;
      }

      if (part === 'part1') {
        card.querySelectorAll('[data-opt-idx]').forEach((inp) => {
          q.options[Number(inp.dataset.optIdx)].text = inp.value;
        });
        const checked = card.querySelector('input[data-field="answer"]:checked');
        if (checked) q.answer = checked.value;
      } else if (part === 'part2') {
        card.querySelectorAll('[data-st-text]').forEach((inp) => {
          q.statements[Number(inp.dataset.stText)].text = inp.value;
        });
        card.querySelectorAll('[data-st-ans]').forEach((sel) => {
          q.statements[Number(sel.dataset.stAns)].answer = sel.value === 'true';
        });
      } else if (part === 'part3' || part === 'part4') {
        const ansEl = card.querySelector('[data-field="answer"]');
        if (ansEl) q.answer = ansEl.value.trim();
      }
    });
  }

  function bindEditorEvents() {
    rootEl.querySelector('#btnCancelEditor')?.addEventListener('click', () => {
      state.editingExam = null;
      render();
    });

    rootEl.querySelectorAll('[data-ed-part]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        state.editorPartTab = btn.dataset.edPart;
        renderExamEditor();
      });
    });

    rootEl.querySelector('#btnAddQuestion')?.addEventListener('click', () => {
      syncEditorMetadataFromDom();
      syncCurrentPartQuestionsFromDom();
      const p = state.editorPartTab;
      const uid = `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      if (p === 'part1') {
        state.editingExam.part1.push({
          id: uid,
          topic: '',
          stem: '',
          options: [
            { key: 'A', text: '' },
            { key: 'B', text: '' },
            { key: 'C', text: '' },
            { key: 'D', text: '' },
          ],
          answer: 'A',
          explanation: '',
        });
      } else if (p === 'part2') {
        state.editingExam.part2.push({
          id: uid,
          topic: '',
          stem: '',
          statements: [
            { key: 'a', text: '', answer: true },
            { key: 'b', text: '', answer: false },
            { key: 'c', text: '', answer: true },
            { key: 'd', text: '', answer: false },
          ],
          explanation: '',
        });
      } else if (p === 'part3') {
        state.editingExam.part3.push({
          id: uid,
          topic: '',
          stem: '',
          answer: '0',
          explanation: '',
        });
      } else {
        state.editingExam.part4 = state.editingExam.part4 || [];
        state.editingExam.part4.push({
          id: uid,
          topic: '',
          stem: '',
          explanation: '',
        });
      }
      renderExamEditor();
    });

    rootEl.querySelectorAll('[data-del-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        const idx = Number(btn.dataset.delQ);
        state.editingExam[state.editorPartTab].splice(idx, 1);
        renderExamEditor();
      });
    });

    // Reorder questions within the current part (↑ / ↓ / jump to position)
    const moveQuestionInPart = (fromIdx, toIdx) => {
      syncEditorMetadataFromDom();
      syncCurrentPartQuestionsFromDom();
      const list = state.editingExam?.[state.editorPartTab];
      if (!Array.isArray(list)) return;
      if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length || fromIdx === toIdx) return;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      renderExamEditor();
      const targetCard = rootEl.querySelector(`.editor-q-card[data-q-idx="${toIdx}"]`);
      targetCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    rootEl.querySelectorAll('[data-move-q-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.moveQUp);
        moveQuestionInPart(idx, idx - 1);
      });
    });

    rootEl.querySelectorAll('[data-move-q-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.moveQDown);
        moveQuestionInPart(idx, idx + 1);
      });
    });

    rootEl.querySelectorAll('[data-move-q-to]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const fromIdx = Number(sel.dataset.moveQTo);
        const toIdx = Number(sel.value);
        moveQuestionInPart(fromIdx, toIdx);
      });
    });

    // Presentation-only toggle & start question number live sync in Editor
    const edPresChk = rootEl.querySelector('#edPresentationOnly');
    const edStartWrap = rootEl.querySelector('#edStartNumWrap');
    const edStartInp = rootEl.querySelector('#edStartNum');
    if (edPresChk && edStartWrap) {
      edPresChk.addEventListener('change', () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        state.editingExam.presentationOnly = edPresChk.checked;
        if (!edPresChk.checked) state.editingExam.startQuestionNumber = 1;
        renderExamEditor();
      });
    }
    if (edStartInp) {
      edStartInp.addEventListener('change', () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        renderExamEditor();
      });
    }

    // Helper: pick single/multi images from disk
    const pickImageFiles = ({ multiple = false } = {}) =>
      new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.multiple = multiple;
        inp.onchange = () => resolve(Array.from(inp.files || []));
        inp.click();
      });

    // Insert image into a specific question
    rootEl.querySelectorAll('[data-ed-add-img]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        const idx = Number(btn.dataset.edAddImg);
        const q = state.editingExam?.[state.editorPartTab]?.[idx];
        if (!q) return;
        const files = await pickImageFiles({ multiple: true });
        if (!files.length) return;
        for (const f of files) {
          try {
            const url = await readImageFileAsDataUrl(f);
            appendImageToQuestion(q, url, f.name);
          } catch (err) {
            showToast(err.message || 'Không đọc được tệp ảnh.', 'error');
          }
        }
        renderExamEditor();
        showToast(`Đã chèn ${files.length} ảnh vào câu hỏi!`, 'success');
      });
    });

    // Remove an attached image from a question
    rootEl.querySelectorAll('[data-ed-del-img-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        const qIdx = Number(btn.dataset.edDelImgQ);
        const field = btn.dataset.edDelImgField;
        const localIdx = Number(btn.dataset.edDelImgIdx);
        const q = state.editingExam?.[state.editorPartTab]?.[qIdx];
        if (!q) return;
        if (removeImageFromQuestion(q, field, localIdx)) {
          renderExamEditor();
          showToast('Đã xóa ảnh khỏi câu hỏi.', 'info');
        }
      });
    });

    // Fill a specific missing \includegraphics{name} placeholder
    rootEl.querySelectorAll('[data-ed-fill-missing]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        const targetName = btn.dataset.edFillMissing;
        const files = await pickImageFiles({ multiple: false });
        if (!files.length) return;
        try {
          const url = await readImageFileAsDataUrl(files[0]);
          const count = replaceMissingImageInExam(state.editingExam, targetName, url);
          renderExamEditor();
          showToast(`Đã thay thế ảnh "${targetName}" (${count} vị trí)!`, 'success');
        } catch (err) {
          showToast(err.message || 'Không đọc được tệp ảnh.', 'error');
        }
      });
    });

    // Bulk upload images & auto-match by filename (e.g. im29.png -> im29)
    rootEl.querySelector('#btnEdBulkUploadImgs')?.addEventListener('click', async () => {
      syncEditorMetadataFromDom();
      syncCurrentPartQuestionsFromDom();
      const files = await pickImageFiles({ multiple: true });
      if (!files.length) return;
      const missingInfo = scanMissingImages(state.editingExam);
      const missingByKey = new Map(missingInfo.uniqueNames.map((n) => [normalizeImgKey(n), n]));
      let matchedFiles = 0;
      let totalReplaced = 0;
      for (const f of files) {
        const key = normalizeImgKey(f.name);
        const targetName = missingByKey.get(key);
        if (!targetName) continue;
        try {
          const url = await readImageFileAsDataUrl(f);
          const n = replaceMissingImageInExam(state.editingExam, targetName, url);
          if (n > 0) {
            matchedFiles++;
            totalReplaced += n;
          }
        } catch {
          // skip unreadable file
        }
      }
      renderExamEditor();
      if (matchedFiles > 0) {
        showToast(`Đã tự động khớp và chèn ${matchedFiles} ảnh (${totalReplaced} vị trí)!`, 'success');
      } else {
        showToast('Không có tệp nào trùng tên với ảnh đang thiếu. Hãy đặt tên file khớp (VD: im29.png) hoặc bấm trực tiếp từng tên ảnh.', 'warning');
      }
    });

    // Toggle Mã ảnh LaTeX (TikZ) textarea
    rootEl.querySelectorAll('[data-ed-toggle-figtex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        const idx = Number(btn.dataset.edToggleFigtex);
        const q = state.editingExam?.[state.editorPartTab]?.[idx];
        if (!q) return;
        q._showFigTex = !q._showFigTex;
        renderExamEditor();
      });
    });

    // Support Ctrl+V image paste directly into question stem textareas
    rootEl.querySelectorAll('.editor-q-card textarea[data-field="stemTex"]').forEach((ta) => {
      ta.addEventListener('paste', async (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
        if (!imgItem) return;
        e.preventDefault();
        const file = imgItem.getAsFile();
        if (!file) return;
        syncEditorMetadataFromDom();
        syncCurrentPartQuestionsFromDom();
        const card = ta.closest('.editor-q-card');
        const qIdx = Number(card?.dataset.qIdx);
        const q = state.editingExam?.[state.editorPartTab]?.[qIdx];
        if (!q) return;
        try {
          const url = await readImageFileAsDataUrl(file);
          appendImageToQuestion(q, url, 'Ảnh dán từ clipboard');
          renderExamEditor();
          showToast('Đã dán ảnh vào câu hỏi!', 'success');
        } catch (err) {
          showToast(err.message || 'Không thể dán ảnh.', 'error');
        }
      });
    });

    rootEl.querySelector('#btnSaveExamEditor')?.addEventListener('click', async () => {
      syncEditorMetadataFromDom();
      syncCurrentPartQuestionsFromDom();
      const ex = state.editingExam;
      if (!ex.title) {
        showToast('Vui lòng nhập tên đề thi.', 'error');
        return;
      }
      if (ex.part1.length + ex.part2.length + ex.part3.length + (ex.part4?.length || 0) === 0) {
        showToast('Đề thi cần có ít nhất 1 câu hỏi.', 'error');
        return;
      }
      try {
        if (ex.id) {
          await api.updateExam(ex.id, ex);
          showToast('Đã lưu chỉnh sửa đề thi!', 'success');
        } else {
          await api.createExams(ex);
          showToast('Đã tạo đề thi mới thành công!', 'success');
        }
        state.editingExam = null;
        await refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // =========================================================
  // SUB-TAB 2: ASSIGNMENTS & DEADLINES
  // =========================================================
  function renderAssignmentsSection() {
    const { assignments, exams, students, submissions, posts } = state.data;
    const examsById = new Map(exams.map((e) => [e.id, e]));
    const postsById = new Map((posts || []).map((p) => [p.id, p]));

    return `
      <div class="section-toolbar">
        <p style="margin:0; font-size:0.88rem; color:var(--text-secondary);">
          Quản lý cả <strong>bài làm Online</strong> (từ Ngân hàng đề) và <strong>bài nộp qua Link / Google Form</strong> (tự động đồng bộ từ Bảng tin).
        </p>
        <button class="btn btn-primary" id="btnNewAssignment">+ Giao bài tập mới</button>
      </div>

      <div class="exam-list">
        ${
          assignments.length === 0
            ? `<div class="card panel-card" style="text-align:center; padding:40px; color:var(--text-muted);">
                Chưa có đợt giao bài nào. Nhấn <strong>"+ Giao bài tập mới"</strong> hoặc tích chọn bài tập khi đăng bài ở Bảng tin.
              </div>`
            : assignments
                .map((asg) => {
                  const isExternal = asg.submissionMode === 'external_link';
                  const exam = !isExternal ? examsById.get(asg.examId) : null;
                  const linkedPost = asg.linkedPostId ? postsById.get(asg.linkedPostId) : null;
                  const asgType = asg.assignmentType === 'test' ? 'test' : 'homework';
                  const dl = getDeadlineStatus(asg.dueAt, asg.openAt);
                  const targetStudents = getTargetStudentsForAssignment(asg, students);
                  const statusBadgeCls = dl.expired
                    ? 'badge-danger'
                    : dl.notOpen
                      ? 'badge-neutral'
                      : dl.urgent
                        ? 'badge-warning'
                        : 'badge-success';

                  if (isExternal) {
                    const checks = asg.manualChecks && typeof asg.manualChecks === 'object' ? asg.manualChecks : {};
                    const checkedCount = targetStudents.filter((s) => Boolean(checks[s.id]?.checked)).length;
                    const allDone = targetStudents.length > 0 && checkedCount === targetStudents.length;
                    const formatTargetClasses = (a, list) => {
                      if (a.assignAll) return 'Tất cả các lớp';
                      const clsSet = new Set();
                      (a.targetClasses || []).forEach((c) => {
                        const v = String(c || '').trim();
                        if (v) clsSet.add(v);
                      });
                      (list || []).forEach((s) => {
                        const v = String(s?.className || '').trim();
                        if (v) clsSet.add(v);
                      });
                      const classes = Array.from(clsSet).sort((x, y) => x.localeCompare(y, 'vi'));
                      if (classes.length > 0) return `Lớp ${classes.join(', ')}`;
                      return list.length > 0 ? `${list.length} học sinh` : 'Chưa chọn';
                    };
                    const targetSummary = formatTargetClasses(asg, targetStudents);

                    return `
                      <article class="exam-card is-external-asg" style="cursor:default;" data-asg-card="${escapeAttr(asg.id)}">
                        <div class="exam-card-top">
                          <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                              <span class="badge ${asgType === 'test' ? 'badge-danger' : 'badge-p1'}">
                                ${asgType === 'test' ? 'Bài kiểm tra' : 'Bài tập'}
                              </span>
                              <span class="badge badge-p3">Nộp qua Link / Form</span>
                              ${linkedPost ? `<span class="badge badge-neutral">Liên kết Bảng tin</span>` : ''}
                              <h3 class="exam-card-title" style="margin:0;">${escapeHtml(asg.title)}</h3>
                            </div>
                            <p class="exam-card-desc">
                              Link nộp bài: <a href="${escapeAttr(asg.externalUrl)}" target="_blank" rel="noopener noreferrer" class="feed-inline-link">${escapeHtml(asg.externalUrl)}</a>
                              ${asg.note ? ` • ${escapeHtml(asg.note)}` : ''}
                            </p>
                          </div>
                          ${
                            asg.dueAt
                              ? `<span class="badge ${statusBadgeCls}">${escapeHtml(dl.label)}</span>`
                              : `<span class="badge badge-success">Đang mở</span>`
                          }
                        </div>

                        <div class="exam-card-badges">
                          ${asg.dueAt ? `<span class="badge badge-p1">Hạn nộp: ${escapeHtml(formatDateTimeVN(asg.dueAt))}</span>` : `<span class="badge badge-neutral">Không giới hạn hạn nộp</span>`}
                          <span class="badge ${allDone ? 'badge-success' : 'badge-p2'}">GV đã tick nộp: ${checkedCount} / ${targetStudents.length} HS</span>
                          <span class="badge badge-neutral">${asg.assignAll ? 'Giao tất cả HS' : `${targetStudents.length} HS được giao`}</span>
                        </div>

                        <div class="exam-card-footer">
                          <div class="exam-meta-inline" style="flex-wrap:wrap;">
                            <span>Đối tượng: ${escapeHtml(targetSummary)}</span>
                          </div>
                          <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn btn-primary btn-sm" data-manual-check-asg="${escapeAttr(asg.id)}">
                              ✓ Tick đã nộp (${checkedCount}/${targetStudents.length})
                            </button>
                            <a class="btn btn-secondary btn-sm" href="${escapeAttr(asg.externalUrl)}" target="_blank" rel="noopener noreferrer">
                              Mở link ↗
                            </a>
                            ${
                              linkedPost
                                ? `<button class="btn btn-ghost btn-sm" data-goto-post="${escapeAttr(linkedPost.id)}">Xem bài viết</button>`
                                : ''
                            }
                            <button class="btn btn-secondary btn-sm" data-edit-asg="${escapeAttr(asg.id)}">Sửa</button>
                            <button class="btn btn-danger-outline btn-sm" data-del-asg="${escapeAttr(asg.id)}">Xóa</button>
                          </div>
                        </div>
                      </article>
                    `;
                  }

                  const submittedStudentIds = new Set(
                    submissions.filter((s) => s.assignmentId === asg.id).map((s) => s.studentId)
                  );
                  const onlineTargetSummary = (() => {
                    if (asg.assignAll) return 'Tất cả các lớp';
                    const clsSet = new Set();
                    (asg.targetClasses || []).forEach((c) => {
                      const v = String(c || '').trim();
                      if (v) clsSet.add(v);
                    });
                    (targetStudents || []).forEach((s) => {
                      const v = String(s?.className || '').trim();
                      if (v) clsSet.add(v);
                    });
                    const classes = Array.from(clsSet).sort((x, y) => x.localeCompare(y, 'vi'));
                    if (classes.length > 0) return `Lớp ${classes.join(', ')}`;
                    return targetStudents.length > 0 ? `${targetStudents.length} học sinh` : 'Chưa chọn';
                  })();
                  return `
                    <article class="exam-card" style="cursor:default;" data-asg-card="${escapeAttr(asg.id)}">
                      <div class="exam-card-top">
                        <div>
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                            <span class="badge ${asgType === 'test' ? 'badge-danger' : 'badge-p1'}">
                              ${asgType === 'test' ? 'Bài kiểm tra' : 'Bài tập'}
                            </span>
                            <span class="badge badge-p2">Làm Online</span>
                            ${linkedPost ? `<span class="badge badge-neutral">Liên kết Bảng tin</span>` : ''}
                            <h3 class="exam-card-title" style="margin:0;">${escapeHtml(asg.title)}</h3>
                          </div>
                          <p class="exam-card-desc">
                            Đề thi gốc: <strong>${escapeHtml(exam?.title || 'Đề đã xóa')}</strong>
                            ${asg.note ? ` • ${escapeHtml(asg.note)}` : ''}
                          </p>
                        </div>
                        <span class="badge ${statusBadgeCls}">
                          ${escapeHtml(dl.label)}
                        </span>
                      </div>

                      <div class="exam-card-badges">
                        ${asg.openAt ? `<span class="badge badge-neutral">Mở đề: ${escapeHtml(formatDateTimeVN(asg.openAt))}</span>` : ''}
                        <span class="badge badge-p1">Hạn nộp: ${escapeHtml(formatDateTimeVN(asg.dueAt))}</span>
                        <span class="badge badge-p2">Đã nộp: ${submittedStudentIds.size} / ${targetStudents.length} HS</span>
                        <span class="badge badge-neutral">${asg.timedMode ? `Tính giờ: ${asg.durationMinutes || exam?.durationMinutes || 45} phút` : 'Không giới hạn giờ'}</span>
                        <span class="badge badge-neutral">${asg.assignAll ? 'Giao tất cả HS' : `Chọn riêng ${targetStudents.length} HS`}</span>
                        ${asg.shuffle ? `<span class="badge badge-p3">Trộn câu nội bộ</span>` : ''}
                      </div>

                      <div class="exam-card-footer">
                        <div class="exam-meta-inline" style="flex-wrap:wrap;">
                          <span>Đối tượng: ${escapeHtml(onlineTargetSummary)}</span>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          <button class="btn btn-secondary btn-sm" data-view-asg-subs="${escapeAttr(asg.id)}">Xem bài nộp</button>
                          ${
                            linkedPost
                              ? `<button class="btn btn-ghost btn-sm" data-goto-post="${escapeAttr(linkedPost.id)}">Xem bài viết</button>`
                              : ''
                          }
                          <button class="btn btn-secondary btn-sm" data-edit-asg="${escapeAttr(asg.id)}">Sửa hạn nộp / HS</button>
                          <button class="btn btn-danger-outline btn-sm" data-del-asg="${escapeAttr(asg.id)}">Xóa</button>
                        </div>
                      </div>
                    </article>
                  `;
                })
                .join('')
        }
      </div>
    `;
  }

  function openManualCheckModal(asgId) {
    const asg = state.data.assignments.find((a) => a.id === asgId);
    if (!asg) return;
    const students = state.data.students || [];
    const targets = getTargetStudentsForAssignment(asg, students);
    const classList = [...new Set(targets.map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    let checks = { ...(asg.manualChecks && typeof asg.manualChecks === 'object' ? asg.manualChecks : {}) };
    let filterClass = 'all';
    let filterStatus = 'all'; // 'all' | 'checked' | 'unchecked'
    let searchTerm = '';
    let changedAny = false;

    const getFiltered = () =>
      targets.filter((s) => {
        if (filterClass !== 'all' && s.className !== filterClass) return false;
        const isDone = Boolean(checks[s.id]?.checked);
        if (filterStatus === 'checked' && !isDone) return false;
        if (filterStatus === 'unchecked' && isDone) return false;
        if (searchTerm) {
          const hay = `${s.fullName} ${s.username} ${s.className || ''}`.toLowerCase();
          if (!hay.includes(searchTerm)) return false;
        }
        return true;
      });

    openModal({
      title: `Kiểm tra nộp bài — ${asg.title}`,
      wide: true,
      bodyHtml: `
        <div class="mc-top-bar">
          <div class="mc-summary-left">
            <span class="badge badge-p1" id="mcProgressBadge">Đã nộp: 0 / ${targets.length} HS</span>
            ${asg.dueAt ? `<span class="badge badge-neutral">Hạn: ${escapeHtml(formatDateTimeVN(asg.dueAt))}</span>` : ''}
          </div>
          ${
            asg.externalUrl
              ? `<a class="btn btn-secondary btn-sm" href="${escapeAttr(asg.externalUrl)}" target="_blank" rel="noopener noreferrer">Mở link Google Form ↗</a>`
              : ''
          }
        </div>

        <div class="mc-filter-bar">
          <input id="mcSearchInp" type="search" class="input-control input-compact" placeholder="Tìm tên hoặc tài khoản học sinh..." style="flex:1; min-width:180px;" />
          <div class="mc-pills" id="mcStatusPills">
            <button type="button" class="btn btn-sm btn-primary" data-mc-status="all">Tất cả</button>
            <button type="button" class="btn btn-sm btn-secondary" data-mc-status="checked">Đã nộp</button>
            <button type="button" class="btn btn-sm btn-secondary" data-mc-status="unchecked">Chưa nộp</button>
          </div>
        </div>

        ${
          classList.length > 1
            ? `
              <div class="mc-pills" id="mcClassPills" style="margin-bottom:10px;">
                <button type="button" class="btn btn-sm btn-primary" data-mc-class="all">Tất cả lớp</button>
                ${classList.map((c) => `<button type="button" class="btn btn-sm btn-secondary" data-mc-class="${escapeAttr(c)}">Lớp ${escapeHtml(c)}</button>`).join('')}
              </div>
            `
            : ''
        }

        <div class="mc-list" id="mcStudentList"></div>
      `,
      footerHtml: `
        <div style="flex:1; display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm" id="mcCheckVisibleBtn">Tick tất cả đang hiện</button>
          <button type="button" class="btn btn-ghost btn-sm" id="mcUncheckVisibleBtn">Bỏ tick đang hiện</button>
        </div>
        <button type="button" class="btn btn-primary" id="mcCloseBtn">Xong</button>
      `,
      onMount: (m) => {
        const listEl = m.querySelector('#mcStudentList');
        const badgeEl = m.querySelector('#mcProgressBadge');

        function updateSummary() {
          const doneCount = targets.filter((s) => Boolean(checks[s.id]?.checked)).length;
          badgeEl.textContent = `Đã nộp: ${doneCount} / ${targets.length} HS`;
          badgeEl.className = `badge ${targets.length > 0 && doneCount === targets.length ? 'badge-success' : 'badge-p1'}`;
        }

        function renderRows() {
          updateSummary();
          const rows = getFiltered();
          if (targets.length === 0) {
            listEl.innerHTML = `<div class="mc-empty">Chưa có học sinh nào thuộc đối tượng bài tập này.</div>`;
            return;
          }
          if (rows.length === 0) {
            listEl.innerHTML = `<div class="mc-empty">Không tìm thấy học sinh phù hợp bộ lọc.</div>`;
            return;
          }
          listEl.innerHTML = rows
            .map((s) => {
              const rec = checks[s.id];
              const isDone = Boolean(rec?.checked);
              const atStr = rec?.checkedAt ? formatDateTimeVN(rec.checkedAt) : '';
              return `
                <label class="mc-row ${isDone ? 'is-checked' : ''}" data-mc-row="${escapeAttr(s.id)}">
                  <input type="checkbox" class="mc-stu-chk" data-mc-sid="${escapeAttr(s.id)}" ${isDone ? 'checked' : ''} />
                  <div class="mc-row-info">
                    <div class="mc-row-name">
                      <strong>${escapeHtml(s.fullName)}</strong>
                      ${s.className ? `<span class="badge badge-neutral">Lớp ${escapeHtml(s.className)}</span>` : ''}
                    </div>
                    <div class="mc-row-sub">@${escapeHtml(s.username)}${atStr ? ` • Xác nhận: ${escapeHtml(atStr)}` : ''}</div>
                  </div>
                  <span class="badge ${isDone ? 'badge-success' : 'badge-warning'} mc-row-status">
                    ${isDone ? '✓ Đã nộp' : 'Chưa nộp'}
                  </span>
                </label>
              `;
            })
            .join('');

          listEl.querySelectorAll('.mc-stu-chk').forEach((chk) => {
            chk.addEventListener('change', async () => {
              const sid = chk.dataset.mcSid;
              const nextChecked = chk.checked;
              const prevRec = checks[sid];
              if (nextChecked) {
                checks[sid] = { checked: true, checkedAt: new Date().toISOString(), note: '' };
              } else {
                delete checks[sid];
              }
              const rowEl = chk.closest('.mc-row');
              if (rowEl) {
                rowEl.classList.toggle('is-checked', nextChecked);
                const statusEl = rowEl.querySelector('.mc-row-status');
                if (statusEl) {
                  statusEl.className = `badge ${nextChecked ? 'badge-success' : 'badge-warning'} mc-row-status`;
                  statusEl.textContent = nextChecked ? '✓ Đã nộp' : 'Chưa nộp';
                }
              }
              updateSummary();
              try {
                const res = await api.setAssignmentManualCheck(asg.id, { studentId: sid, checked: nextChecked });
                if (res?.assignment?.manualChecks) {
                  checks = { ...res.assignment.manualChecks };
                  asg.manualChecks = res.assignment.manualChecks;
                }
                changedAny = true;
              } catch (err) {
                if (prevRec) checks[sid] = prevRec;
                else delete checks[sid];
                chk.checked = !nextChecked;
                showToast(err.message || 'Không thể lưu trạng thái nộp bài.', 'error');
                renderRows();
              }
            });
          });
        }

        renderRows();

        m.querySelector('#mcSearchInp')?.addEventListener('input', (e) => {
          searchTerm = e.target.value.trim().toLowerCase();
          renderRows();
        });

        m.querySelectorAll('[data-mc-status]').forEach((btn) => {
          btn.addEventListener('click', () => {
            filterStatus = btn.dataset.mcStatus;
            m.querySelectorAll('[data-mc-status]').forEach((b) => {
              b.className = `btn btn-sm ${b === btn ? 'btn-primary' : 'btn-secondary'}`;
            });
            renderRows();
          });
        });

        m.querySelectorAll('[data-mc-class]').forEach((btn) => {
          btn.addEventListener('click', () => {
            filterClass = btn.dataset.mcClass;
            m.querySelectorAll('[data-mc-class]').forEach((b) => {
              b.className = `btn btn-sm ${b === btn ? 'btn-primary' : 'btn-secondary'}`;
            });
            renderRows();
          });
        });

        async function bulkSetVisible(nextChecked) {
          const visible = getFiltered();
          if (!visible.length) return;
          const updates = visible.map((s) => ({ studentId: s.id, checked: nextChecked }));
          try {
            const res = await api.setAssignmentManualCheck(asg.id, { updates });
            if (res?.assignment?.manualChecks) {
              checks = { ...res.assignment.manualChecks };
              asg.manualChecks = res.assignment.manualChecks;
            }
            changedAny = true;
            renderRows();
            showToast(
              nextChecked
                ? `Đã đánh dấu ${visible.length} học sinh đã nộp.`
                : `Đã bỏ đánh dấu ${visible.length} học sinh.`,
              'success'
            );
          } catch (err) {
            showToast(err.message || 'Lỗi cập nhật hàng loạt.', 'error');
          }
        }

        m.querySelector('#mcCheckVisibleBtn')?.addEventListener('click', () => bulkSetVisible(true));
        m.querySelector('#mcUncheckVisibleBtn')?.addEventListener('click', () => bulkSetVisible(false));
        m.querySelector('#mcCloseBtn')?.addEventListener('click', () => {
          closeModal();
          if (changedAny) render();
        });
      },
    });
  }

  function openAssignmentModal({ existing = null, preselectExamId = null } = {}) {
    const { exams, students } = state.data;
    const assignableExams = exams.filter(
      (e) => !e.presentationOnly || e.id === existing?.examId || e.id === preselectExamId
    );
    const initSubMode =
      existing?.submissionMode === 'external_link'
        ? 'external_link'
        : preselectExamId
          ? 'online'
          : assignableExams.length === 0
            ? 'external_link'
            : 'online';

    const classes = [...new Set(students.map((s) => s.className).filter(Boolean))];
    const selExamId = existing?.examId || preselectExamId || assignableExams[0]?.id || '';
    const selExam = assignableExams.find((e) => e.id === selExamId) || assignableExams[0] || null;
    const initType = existing?.assignmentType === 'test' ? 'test' : 'homework';
    const initTimed = initType === 'test' ? true : Boolean(existing?.timedMode);
    const initDuration = existing?.durationMinutes || selExam?.durationMinutes || 45;
    const assignAll = existing ? Boolean(existing.assignAll) : false;
    const chosenIds = new Set(
      existing
        ? getTargetStudentsForAssignment(existing, students).map((s) => s.id)
        : students.map((s) => s.id)
    );

    const openParts = existing?.openAt
      ? splitIsoToVnDateTime(existing.openAt)
      : defaultVnDateTime(0, '08:00');
    const dueParts = existing?.dueAt
      ? splitIsoToVnDateTime(existing.dueAt)
      : initSubMode === 'external_link'
        ? { date: '', time: '23:59' }
        : defaultVnDateTime(5, '23:59');

    openModal({
      title: existing ? 'Chỉnh sửa đợt giao bài' : 'Giao bài tập / bài kiểm tra cho học sinh',
      wide: true,
      bodyHtml: `
        <div class="form-group">
          <label>Hình thức làm &amp; nộp bài *</label>
          <div class="asg-type-switch" id="asgSubModeSwitch">
            <label class="asg-type-opt is-compact ${initSubMode === 'online' ? 'active' : ''}">
              <input type="radio" name="asgSubMode" value="online" ${initSubMode === 'online' ? 'checked' : ''} ${existing ? 'disabled' : ''} />
              <strong>Làm bài Online (Từ đề thi)</strong>
            </label>
            <label class="asg-type-opt is-compact ${initSubMode === 'external_link' ? 'active' : ''}">
              <input type="radio" name="asgSubMode" value="external_link" ${initSubMode === 'external_link' ? 'checked' : ''} ${existing ? 'disabled' : ''} />
              <strong>Nộp qua Link / Google Form</strong>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>Loại hình giao bài *</label>
          <div class="asg-type-switch" id="asgTypeSwitch">
            <label class="asg-type-opt is-compact ${initType === 'homework' ? 'active' : ''}">
              <input type="radio" name="asgType" value="homework" ${initType === 'homework' ? 'checked' : ''} />
              <strong>Bài tập</strong>
            </label>
            <label class="asg-type-opt is-compact ${initType === 'test' ? 'active' : ''}">
              <input type="radio" name="asgType" value="test" ${initType === 'test' ? 'checked' : ''} />
              <strong>Bài kiểm tra</strong>
            </label>
          </div>
        </div>

        <!-- External Link Mode Fields -->
        <div id="asgExternalFields" class="${initSubMode === 'external_link' ? '' : 'hidden'}">
          <div class="form-row-2">
            <div class="form-group">
              <label>Tiêu đề bài tập *</label>
              <input id="asgExtTitle" class="input-control" placeholder="VD: Bài tập tuần 1 — Nộp qua Google Form" value="${escapeAttr(existing?.title || '')}" />
            </div>
            <div class="form-group">
              <label>Nhãn nút nộp bài (tùy chọn)</label>
              <input id="asgExtLabel" class="input-control" placeholder="Nộp bài" value="${escapeAttr(existing?.externalLabel || '')}" />
            </div>
          </div>
          <div class="form-group">
            <label>Link nộp bài (Google Form / Link ngoài) *</label>
            <input id="asgExtUrl" class="input-control" placeholder="https://docs.google.com/forms/d/e/..." value="${escapeAttr(existing?.externalUrl || '')}" />
          </div>
          <div class="form-group">
            <label>Hạn nộp (dd/mm/yyyy — để trống nếu không giới hạn)</label>
            <div class="vn-datetime-pair" style="max-width:320px;">
              <input id="asgExtDueDate" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(existing?.dueAt ? dueParts.date : '')}" />
              <input id="asgExtDueTime" type="text" class="input-control vn-time-input" placeholder="HH:mm" maxlength="5" value="${escapeAttr(dueParts.time || '23:59')}" />
            </div>
          </div>
        </div>

        <!-- Online Exam Mode Fields -->
        <div id="asgOnlineFields" class="${initSubMode === 'online' ? '' : 'hidden'}">
          ${
            assignableExams.length === 0
              ? `<div class="composer-att-empty" style="color:var(--danger); margin-bottom:12px;">Chưa có đề thi giao bài nào trong Ngân hàng đề thi (các bộ câu hỏi "Chỉ trình chiếu" không hiển thị tại đây). Thầy hãy tạo đề trước hoặc chọn hình thức Nộp qua Link / Google Form.</div>`
              : `
                <div class="form-row-2">
                  <div class="form-group">
                    <label>Chọn đề thi *</label>
                    <select id="asgExamId" class="input-control" ${existing ? 'disabled' : ''}>
                      ${assignableExams
                        .map(
                          (e) =>
                            `<option value="${e.id}" ${e.id === selExamId ? 'selected' : ''}>[${escapeHtml(e.code)}] ${escapeHtml(e.title)}</option>`
                        )
                        .join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Tiêu đề hiển thị cho HS</label>
                    <input id="asgTitle" class="input-control" value="${escapeAttr(existing?.title || selExam?.title || '')}" />
                  </div>
                </div>

                <div class="form-row-2">
                  <div class="form-group" id="openAtGroup">
                    <label id="openAtLabel">
                      ${initType === 'test' ? 'Thời gian mở đề *' : 'Thời gian mở đề'}
                    </label>
                    <div class="vn-datetime-pair">
                      <input id="asgOpenDate" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(existing?.openAt || initType === 'test' ? openParts.date : '')}" />
                      <input id="asgOpenTime" type="text" class="input-control vn-time-input" placeholder="HH:mm" maxlength="5" value="${escapeAttr(existing?.openAt || initType === 'test' ? openParts.time : '08:00')}" />
                    </div>
                  </div>

                  <div class="form-group">
                    <label id="dueAtLabel">
                      ${initType === 'test' ? 'Thời gian nộp bài / đóng đề (dd/mm/yyyy) *' : 'Hạn nộp bài tập (dd/mm/yyyy) *'}
                    </label>
                    <div class="vn-datetime-pair">
                      <input id="asgDueDate" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(dueParts.date || defaultVnDateTime(5, '23:59').date)}" />
                      <input id="asgDueTime" type="text" class="input-control vn-time-input" placeholder="HH:mm" maxlength="5" value="${escapeAttr(dueParts.time || '23:59')}" />
                    </div>
                  </div>
                </div>

                <div class="asg-options-box">
                  <div class="asg-opt-row is-single-line">
                    <div class="asg-opt-left">
                      <label class="checkbox-pill" style="margin:0;">
                        <input type="checkbox" id="asgTimed" ${initTimed ? 'checked' : ''} ${initType === 'test' ? 'disabled' : ''} />
                        <span>Tính thời gian làm bài</span>
                      </label>
                      <div id="asgDurationWrap" class="asg-duration-inline ${initTimed ? '' : 'hidden'}">
                        <span>Làm trong</span>
                        <input id="asgDurationMinutes" type="number" min="1" max="300" class="input-control input-compact" style="width:76px; text-align:center;" value="${initDuration}" />
                        <span>phút</span>
                      </div>
                    </div>
                    <label class="checkbox-pill" style="margin:0; flex-shrink:0;">
                      <input type="checkbox" id="asgShuffle" ${existing?.shuffle ? 'checked' : ''} />
                      <span>Trộn câu hỏi</span>
                    </label>
                  </div>
                </div>
              `
          }
        </div>

        <div class="form-group" style="margin-top:12px;">
          <label>Ghi chú</label>
          <input id="asgNote" class="input-control" placeholder="" value="${escapeAttr(existing?.note || '')}" />
        </div>

        <div style="border-top:1px solid var(--border); padding-top:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <strong style="font-size:0.88rem;">Chọn học sinh được giao bài</strong>
            <label style="display:inline-flex; align-items:center; gap:6px; font-size:0.84rem; font-weight:600; cursor:pointer;">
              <input type="checkbox" id="asgAssignAll" ${assignAll ? 'checked' : ''} />
              Giao tất cả học sinh (kể cả HS mới)
            </label>
          </div>

          <div id="asgStudentPicker" style="${assignAll ? 'opacity:0.45; pointer-events:none;' : ''}">
            ${
              classes.length > 0
                ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                    <button type="button" class="btn btn-ghost btn-sm" data-pick-class="__all">Chọn hết</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-pick-class="__none">Bỏ chọn</button>
                    ${classes.map((c) => `<button type="button" class="btn btn-secondary btn-sm" data-pick-class="${escapeAttr(c)}">Lớp ${escapeHtml(c)}</button>`).join('')}
                  </div>`
                : ''
            }
            <div class="student-pick-list">
              ${
                students.length === 0
                  ? `<div style="padding:12px; color:var(--text-muted); font-size:0.84rem;">Chưa có tài khoản học sinh nào. Hãy tạo tài khoản học sinh trước.</div>`
                  : students
                      .map(
                        (s) => `
                    <label class="student-pick-item" data-stu-class="${escapeAttr(s.className)}">
                      <input type="checkbox" class="asg-stu-chk" value="${s.id}" ${chosenIds.has(s.id) ? 'checked' : ''} />
                      <span><strong>${escapeHtml(s.fullName)}</strong> <span style="color:var(--text-muted);">(${escapeHtml(s.className)} • @${escapeHtml(s.username)})</span></span>
                    </label>
                  `
                      )
                      .join('')
              }
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="modalCancelAsg">Hủy</button>
        <button class="btn btn-primary" id="modalSaveAsg">${existing ? 'Lưu thay đổi' : 'Giao bài ngay'}</button>
      `,
      onMount: (modalEl) => {
        modalEl.querySelector('#modalCancelAsg').addEventListener('click', closeModal);

        const extFields = modalEl.querySelector('#asgExternalFields');
        const onlineFields = modalEl.querySelector('#asgOnlineFields');
        const examSel = modalEl.querySelector('#asgExamId');
        const titleInp = modalEl.querySelector('#asgTitle');
        const durInp = modalEl.querySelector('#asgDurationMinutes');
        const timedChk = modalEl.querySelector('#asgTimed');
        const durWrap = modalEl.querySelector('#asgDurationWrap');
        const openDateInp = modalEl.querySelector('#asgOpenDate');
        const openTimeInp = modalEl.querySelector('#asgOpenTime');
        const openLabel = modalEl.querySelector('#openAtLabel');
        const dueLabel = modalEl.querySelector('#dueAtLabel');

        const getSubMode = () => modalEl.querySelector('input[name="asgSubMode"]:checked')?.value || initSubMode;

        modalEl.querySelectorAll('input[name="asgSubMode"]').forEach((rad) => {
          rad.addEventListener('change', () => {
            const mode = getSubMode();
            modalEl.querySelectorAll('#asgSubModeSwitch .asg-type-opt').forEach((lbl) => {
              lbl.classList.toggle('active', lbl.querySelector('input')?.value === mode);
            });
            extFields.classList.toggle('hidden', mode !== 'external_link');
            onlineFields.classList.toggle('hidden', mode !== 'online');
          });
        });

        function syncTypeUi(type) {
          modalEl.querySelectorAll('#asgTypeSwitch .asg-type-opt').forEach((lbl) => {
            const rad = lbl.querySelector('input[type="radio"]');
            lbl.classList.toggle('active', rad.value === type);
          });
          if (!timedChk || !durWrap || !openLabel || !dueLabel) return;
          if (type === 'test') {
            timedChk.checked = true;
            timedChk.disabled = true;
            durWrap.classList.remove('hidden');
            openLabel.textContent = 'Thời gian mở đề *';
            dueLabel.textContent = 'Thời gian nộp bài / đóng đề (dd/mm/yyyy) *';
            if (openDateInp && !openDateInp.value.trim()) {
              const defOpen = defaultVnDateTime(0, '08:00');
              openDateInp.value = defOpen.date;
              if (openTimeInp) openTimeInp.value = defOpen.time;
            }
          } else {
            timedChk.disabled = false;
            durWrap.classList.toggle('hidden', !timedChk.checked);
            openLabel.textContent = 'Thời gian mở đề';
            dueLabel.textContent = 'Hạn nộp bài tập (dd/mm/yyyy) *';
          }
        }

        modalEl.querySelectorAll('input[name="asgType"]').forEach((rad) => {
          rad.addEventListener('change', () => syncTypeUi(rad.value));
        });

        if (timedChk && durWrap) {
          timedChk.addEventListener('change', () => {
            durWrap.classList.toggle('hidden', !timedChk.checked);
          });
        }

        if (!existing && examSel && titleInp && durInp) {
          examSel.addEventListener('change', () => {
            const ex = exams.find((e) => e.id === examSel.value);
            if (ex) {
              titleInp.value = ex.title;
              durInp.value = ex.durationMinutes || 45;
            }
          });
        }

        const allChk = modalEl.querySelector('#asgAssignAll');
        const picker = modalEl.querySelector('#asgStudentPicker');
        allChk.addEventListener('change', () => {
          picker.style.opacity = allChk.checked ? '0.45' : '1';
          picker.style.pointerEvents = allChk.checked ? 'none' : 'auto';
        });

        modalEl.querySelectorAll('[data-pick-class]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cls = btn.dataset.pickClass;
            modalEl.querySelectorAll('.student-pick-item').forEach((row) => {
              const chk = row.querySelector('.asg-stu-chk');
              if (cls === '__all') chk.checked = true;
              else if (cls === '__none') chk.checked = false;
              else if (row.dataset.stuClass === cls) chk.checked = true;
            });
          });
        });

        modalEl.querySelector('#modalSaveAsg').addEventListener('click', async () => {
          const subMode = getSubMode();
          const asgType = modalEl.querySelector('input[name="asgType"]:checked')?.value || 'homework';
          const selectedStudentIds = Array.from(modalEl.querySelectorAll('.asg-stu-chk:checked')).map((c) => c.value);

          let payload;
          if (subMode === 'external_link') {
            const extTitle = modalEl.querySelector('#asgExtTitle').value.trim();
            const extUrl = modalEl.querySelector('#asgExtUrl').value.trim();
            if (!extTitle) {
              showToast('Vui lòng nhập tiêu đề bài tập.', 'error');
              return;
            }
            if (!extUrl) {
              showToast('Vui lòng nhập link nộp bài (Google Form / link ngoài).', 'error');
              return;
            }
            let dueAtIso = '';
            const extDueDateVal = modalEl.querySelector('#asgExtDueDate').value.trim();
            if (extDueDateVal) {
              try {
                dueAtIso = parseVnDateTimeToIso(
                  extDueDateVal,
                  modalEl.querySelector('#asgExtDueTime').value.trim() || '23:59',
                  'Hạn nộp bài tập'
                );
              } catch (err) {
                showToast(err.message, 'error');
                return;
              }
            }
            payload = {
              submissionMode: 'external_link',
              assignmentType: asgType,
              title: extTitle,
              externalUrl: extUrl,
              externalLabel: modalEl.querySelector('#asgExtLabel').value.trim(),
              dueAt: dueAtIso,
              note: modalEl.querySelector('#asgNote').value.trim(),
              assignAll: allChk.checked,
              targetClasses: [],
              studentIds: selectedStudentIds,
            };
          } else {
            if (!examSel || !examSel.value) {
              showToast('Hãy tạo ít nhất 1 đề thi trước khi giao bài Online.', 'error');
              return;
            }
            let openAtIso = '';
            let dueAtIso = '';
            try {
              const openDateVal = openDateInp.value.trim();
              if (asgType === 'test' && !openDateVal) {
                throw new Error('Bài kiểm tra bắt buộc phải nhập Thời gian mở đề (dd/mm/yyyy).');
              }
              if (openDateVal) {
                openAtIso = parseVnDateTimeToIso(openDateVal, openTimeInp.value.trim() || '00:00', 'Thời gian mở đề');
              }
              const dueDateVal = modalEl.querySelector('#asgDueDate').value.trim();
              if (!dueDateVal) {
                throw new Error('Vui lòng nhập ngày nộp bài theo định dạng dd/mm/yyyy.');
              }
              dueAtIso = parseVnDateTimeToIso(
                dueDateVal,
                modalEl.querySelector('#asgDueTime').value.trim() || '23:59',
                asgType === 'test' ? 'Thời gian nộp bài' : 'Hạn nộp bài tập'
              );
              if (openAtIso && new Date(dueAtIso) <= new Date(openAtIso)) {
                throw new Error('Thời gian nộp bài phải sau thời gian mở đề.');
              }
            } catch (err) {
              showToast(err.message, 'error');
              return;
            }

            const timedMode = asgType === 'test' ? true : timedChk.checked;
            const durationMinutes = Math.max(1, Number(durInp.value) || 45);
            payload = {
              submissionMode: 'online',
              examId: examSel.value,
              assignmentType: asgType,
              title: titleInp.value.trim(),
              openAt: openAtIso,
              dueAt: dueAtIso,
              note: modalEl.querySelector('#asgNote').value.trim(),
              timedMode,
              durationMinutes: timedMode ? durationMinutes : null,
              shuffle: modalEl.querySelector('#asgShuffle').checked,
              allowRetake: false,
              assignAll: allChk.checked,
              targetClasses: [],
              studentIds: selectedStudentIds,
            };
          }

          try {
            if (existing) {
              await api.updateAssignment(existing.id, payload);
              showToast('Đã cập nhật đợt giao bài!', 'success');
            } else {
              await api.createAssignment(payload);
              showToast(
                asgType === 'test' ? 'Đã giao bài kiểm tra cho học sinh!' : 'Đã giao bài tập cho học sinh!',
                'success'
              );
            }
            closeModal();
            state.subTab = 'assignments';
            await refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      },
    });
  }

  // =========================================================
  // SUB-TAB: MERGED HOMEWORK (ASSIGNMENTS + SUBMISSIONS)
  // =========================================================
  function renderMergedHomeworkSection() {
    const { assignments, submissions } = state.data;
    return `
      <div class="stu-exam-merged">
        <div class="stu-section-heading">
          <h3>Đợt giao bài &amp; Hạn nộp</h3>
          <span class="badge badge-p1">${assignments.length} đợt giao</span>
        </div>
        ${renderAssignmentsSection()}

        <div id="teacherSubmissionsSection" class="stu-section-heading" style="margin-top:28px;">
          <h3>Kết quả &amp; Bài nộp của học sinh</h3>
          <span class="badge badge-neutral">${submissions.length} lượt nộp</span>
        </div>
        ${renderSubmissionsSection()}
      </div>
    `;
  }

  // =========================================================
  // SUB-TAB 3: STUDENT ACCOUNTS MANAGEMENT
  // =========================================================
  function renderStudentAvatarHtml(student) {
    const name = String(student?.fullName || student?.username || 'HS').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    const initials =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (parts[0] || 'HS').slice(0, 2).toUpperCase();
    const rawUrl = String(student?.avatarUrl || '').trim();
    const displayUrl =
      rawUrl && rawUrl.startsWith('/assets/avatars/') && !rawUrl.includes('?')
        ? `${rawUrl}?v=20261126v`
        : rawUrl;
    if (displayUrl) {
      return `
        <span class="stu-acct-avatar has-img" title="${escapeAttr(name)}">
          <img
            src="${escapeAttr(displayUrl)}"
            alt="${escapeAttr(name)}"
            loading="lazy"
            onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';"
          />
          <span class="stu-acct-avatar-fallback" style="display:none;">${escapeHtml(initials)}</span>
        </span>
      `;
    }
    return `
      <span class="stu-acct-avatar" title="${escapeAttr(name)}">
        <span class="stu-acct-avatar-fallback">${escapeHtml(initials)}</span>
      </span>
    `;
  }

  function renderStudentsSection() {
    const { students, submissions } = state.data;
    const subCounts = new Map();
    submissions.forEach((s) => subCounts.set(s.studentId, (subCounts.get(s.studentId) || 0) + 1));

    return `
      <div class="section-toolbar">
        <p style="margin:0; font-size:0.88rem; color:var(--text-secondary);">
          Tạo tài khoản và cấp thông tin đăng nhập cho học sinh. Học sinh có thể tự cập nhật hồ sơ &amp; đổi mật khẩu sau khi đăng nhập.
        </p>
        <button class="btn btn-primary" id="btnNewStudent">+ Tạo tài khoản học sinh</button>
      </div>

      <div class="card stu-acct-card" style="overflow-x:auto;">
        <table class="data-table stu-acct-table">
          <thead>
            <tr>
              <th>Tên đăng nhập</th>
              <th>Họ và tên</th>
              <th>Lớp</th>
              <th>SBD / Mã HS</th>
              <th>Thông tin liên hệ</th>
              <th>Bài đã nộp</th>
              <th style="text-align:right;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${
              students.length === 0
                ? `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">Chưa có học sinh nào.</td></tr>`
                : students
                    .map((s) => {
                      const hasExtraContact = Boolean((s.email || '').trim() || (s.phone || '').trim());
                      const hasCode = Boolean((s.studentCode || '').trim());
                      return `
                  <tr>
                    <td class="stu-col-user"><code class="username-pill">@${escapeHtml(s.username)}</code></td>
                    <td class="stu-col-name">
                      <div class="stu-acct-person">
                        ${renderStudentAvatarHtml(s)}
                        <div class="stu-acct-person-meta">
                          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <strong>${escapeHtml(s.fullName)}</strong>
                            ${s.isDemo ? `<span class="badge badge-p3">HS Demo</span>` : ''}
                          </div>
                          ${
                            s.startDate || s.createdAt
                              ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Vào học: ${escapeHtml(formatDateVNAdmin(s.startDate || (s.createdAt || '').slice(0, 10)))}</div>`
                              : ''
                          }
                        </div>
                      </div>
                    </td>
                    <td class="stu-col-class"><span class="badge badge-p1">${escapeHtml(s.className || '—')}</span></td>
                    <td class="stu-col-code ${hasCode ? '' : 'is-empty-cell'}">${escapeHtml(s.studentCode || '—')}</td>
                    <td class="stu-col-contact ${hasExtraContact ? '' : 'is-empty-cell'}" style="font-size:0.82rem; color:var(--text-secondary);">
                      ${s.email ? `<span>${escapeHtml(s.email)}</span>` : `<span class="stu-no-email-lbl">Chưa có email</span>`}
                      ${s.phone ? `<br/><span>${escapeHtml(s.phone)}</span>` : ''}
                    </td>
                    <td class="stu-col-subs"><span class="badge badge-neutral">${subCounts.get(s.id) || 0} bài</span></td>
                    <td class="stu-col-act" style="text-align:right; white-space:nowrap;">
                      <button class="btn btn-secondary btn-sm" data-edit-stu="${s.id}">Sửa / Đổi MK</button>
                      <button class="btn btn-danger-outline btn-sm" data-del-stu="${s.id}">Xóa</button>
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

  function openStudentModal(existing = null) {
    const knownClasses = getKnownClasses();
    const curClass = (existing?.className || '').trim();
    if (curClass && !knownClasses.includes(curClass)) {
      knownClasses.push(curClass);
      knownClasses.sort((a, b) => a.localeCompare(b, 'vi'));
    }
    const defaultStartIso = existing
      ? existing.startDate || (existing.createdAt || '').slice(0, 10) || ''
      : getTodayIsoLocal();

    openModal({
      title: existing ? `Chỉnh sửa tài khoản: @${existing.username}` : 'Tạo tài khoản học sinh mới',
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-group">
            <label>Tên đăng nhập *</label>
            <input id="stuUsername" class="input-control" autocomplete="off" placeholder="Nhập tên đăng nhập" value="${escapeAttr(existing?.username || '')}" ${existing ? 'disabled' : ''} />
          </div>
          <div class="form-group">
            <label>${existing ? 'Đặt lại mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo *'}</label>
            <input id="stuPassword" class="input-control" type="text" autocomplete="off" placeholder="${existing ? 'Không đổi' : 'Mặc định: 123456'}" value="${existing ? '' : '123456'}" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Họ và tên *</label>
            <input id="stuFullName" class="input-control" placeholder="Nhập họ và tên" value="${escapeAttr(existing?.fullName || '')}" />
          </div>
          <div class="form-group">
            <label>Lớp</label>
            <select id="stuClassSelect" class="input-control">
              <option value="" ${!curClass ? 'selected' : ''}>-- Chọn lớp hiện có --</option>
              ${knownClasses
                .map(
                  (c) => `<option value="${escapeAttr(c)}" ${curClass === c ? 'selected' : ''}>Lớp ${escapeHtml(c)}</option>`
                )
                .join('')}
              <option value="__new__">+ Thêm lớp mới...</option>
            </select>
            <input id="stuClassNew" class="input-control hidden" style="margin-top:8px;" placeholder="Nhập tên lớp mới (VD: 12A1, 11/6...)" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Ngày bắt đầu học (dd/mm/yyyy) *</label>
            <input id="stuStartDate" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(formatDateVNAdmin(defaultStartIso))}" />
          </div>
          <div class="form-group">
            <label>Ngày sinh (dd/mm/yyyy)</label>
            <input id="stuDob" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(formatDateOnlyVN(existing?.dob || ''))}" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Số báo danh / Mã HS</label>
            <input id="stuCode" class="input-control" placeholder="Nhập mã HS (tùy chọn)" value="${escapeAttr(existing?.studentCode || '')}" />
          </div>
          <div class="form-group">
            <label>Số điện thoại</label>
            <input id="stuPhone" class="input-control" placeholder="Nhập số điện thoại (tùy chọn)" value="${escapeAttr(existing?.phone || '')}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label>Email</label>
          <input id="stuEmail" type="email" class="input-control" placeholder="Nhập email (tùy chọn)" value="${escapeAttr(existing?.email || '')}" />
        </div>
        <div class="stu-demo-toggle-wrap">
          <label class="stu-demo-toggle-lbl">
            <input type="checkbox" id="stuIsDemo" ${existing?.isDemo ? 'checked' : ''} />
            <div>
              <strong>Đánh dấu là Học sinh Demo</strong>
              <small>Hệ thống chỉ có duy nhất 1 tài khoản HS Demo. Tích chọn sẽ tự động thay thế HS Demo cũ (nếu có) và cho phép chuyển nhanh sang góc nhìn HS ngay trong menu tài khoản.</small>
            </div>
          </label>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="modalCancelStu">Hủy</button>
        <button class="btn btn-primary" id="modalSaveStu">${existing ? 'Lưu thông tin' : 'Tạo tài khoản'}</button>
      `,
      onMount: (modalEl) => {
        const clsSel = modalEl.querySelector('#stuClassSelect');
        const clsNew = modalEl.querySelector('#stuClassNew');
        clsSel.addEventListener('change', () => {
          const isNew = clsSel.value === '__new__';
          clsNew.classList.toggle('hidden', !isNew);
          if (isNew) clsNew.focus();
        });

        modalEl.querySelector('#modalCancelStu').addEventListener('click', closeModal);
        modalEl.querySelector('#modalSaveStu').addEventListener('click', async () => {
          let dobIso = '';
          let startDateIso = '';
          try {
            dobIso = parseVnDateOnlyToIso(modalEl.querySelector('#stuDob').value, 'Ngày sinh');
            const rawStart = modalEl.querySelector('#stuStartDate').value.trim();
            if (rawStart) {
              startDateIso = parseVnDateOnlyToIso(rawStart, 'Ngày bắt đầu học');
            } else if (!existing) {
              startDateIso = getTodayIsoLocal();
            }
          } catch (err) {
            showToast(err.message, 'error');
            return;
          }

          let className = clsSel.value.trim();
          if (className === '__new__') {
            className = clsNew.value.trim();
            if (!className) {
              showToast('Vui lòng nhập tên lớp mới.', 'error');
              clsNew.focus();
              return;
            }
          }

          const payload = {
            username: modalEl.querySelector('#stuUsername').value.trim(),
            fullName: modalEl.querySelector('#stuFullName').value.trim(),
            className,
            startDate: startDateIso,
            studentCode: modalEl.querySelector('#stuCode').value.trim(),
            dob: dobIso,
            email: modalEl.querySelector('#stuEmail').value.trim(),
            phone: modalEl.querySelector('#stuPhone').value.trim(),
            isDemo: Boolean(modalEl.querySelector('#stuIsDemo')?.checked),
          };
          const pw = modalEl.querySelector('#stuPassword').value.trim();
          try {
            if (existing) {
              if (pw) payload.newPassword = pw;
              await api.updateStudent(existing.id, payload);
              showToast('Đã cập nhật tài khoản học sinh!', 'success');
            } else {
              payload.password = pw;
              await api.createStudent(payload);
              showToast(`Đã tạo tài khoản @${payload.username} cho ${payload.fullName}!`, 'success');
            }
            closeModal();
            await refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      },
    });
  }

  // =========================================================
  // SUB-TAB 4: SUBMISSIONS & GRADES TRACKER
  // =========================================================
  function renderSubmissionsSection() {
    const { submissions, assignments } = state.data;
    const filtered = submissions.filter((s) => {
      if (state.subFilterAsg !== 'all' && s.assignmentId !== state.subFilterAsg) return false;
      if (state.subSearch) {
        const q = state.subSearch.toLowerCase();
        const hay = `${s.studentName} ${s.studentClass} ${s.studentUsername} ${s.assignmentTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return `
      <div class="section-toolbar">
        <div style="display:flex; gap:10px; flex-wrap:wrap; flex:1;">
          <select id="selSubFilterAsg" class="input-control" style="max-width:340px;">
            <option value="all">Tất cả đợt giao bài (${submissions.length})</option>
            ${assignments
              .map(
                (a) =>
                  `<option value="${a.id}" ${state.subFilterAsg === a.id ? 'selected' : ''}>${escapeHtml(a.title)}</option>`
              )
              .join('')}
          </select>
          <input id="inpSubSearch" class="input-control" style="max-width:260px;" placeholder="Tìm tên HS, lớp..." value="${escapeAttr(state.subSearch)}" />
        </div>
      </div>

      <div class="card" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Đợt giao / Đề thi</th>
              <th>Tổng điểm</th>
              <th>Chi tiết (P.I / P.II / P.III)</th>
              <th>Thời gian làm &amp; Nộp lúc</th>
              <th style="text-align:right;">Bài làm</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">Chưa có bài nộp nào phù hợp bộ lọc.</td></tr>`
                : filtered
                    .map((s) => {
                      const r = s.result || {};
                      return `
                        <tr>
                          <td>
                            <strong>${escapeHtml(s.studentName)}</strong>
                            <div style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(s.studentClass)} • @${escapeHtml(s.studentUsername)}</div>
                          </td>
                          <td>${escapeHtml(s.assignmentTitle)}</td>
                          <td>
                            <span class="badge badge-p1" style="font-size:0.86rem;">
                              ${formatScoreVN(r.totalScore ?? 0)} / ${formatScoreVN(r.maxScore ?? 10)}đ
                            </span>
                          </td>
                          <td style="font-size:0.82rem; color:var(--text-secondary);">
                            P.I: <strong>${formatScoreVN(r.part1?.score ?? 0)}</strong> •
                            P.II: <strong>${formatScoreVN(r.part2?.score ?? 0)}</strong> •
                            P.III: <strong>${formatScoreVN(r.part3?.score ?? 0)}</strong>
                          </td>
                          <td style="font-size:0.82rem; color:var(--text-muted);">
                            ${formatTime(s.elapsedSeconds)}<br/>
                            ${escapeHtml(formatDateTimeVN(s.submittedAt))}
                          </td>
                          <td style="text-align:right;">
                            <button class="btn btn-secondary btn-sm" data-view-sub="${s.id}">Xem bài làm</button>
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

  // =========================================================
  // EVENT BINDINGS FOR TEACHER DASHBOARD
  // =========================================================
  function bindDashboardEvents() {
    rootEl.querySelector('#btnOpenStorageHero')?.addEventListener('click', () => {
      uiHelpers.openStorageModal?.();
    });

    rootEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.subTab = btn.dataset.subtab;
        render();
      });
    });

    // Feed tab events
    const wireAdminFeedList = (container) => {
      if (!container) return;
      bindFeedEvents(container, {
        uiHelpers,
        posts: state.data.posts || [],
        isAdmin: true,
        onTogglePin: async (postId) => {
          const post = (state.data.posts || []).find((p) => p.id === postId);
          if (!post) return;
          try {
            await api.updatePost(post.id, { pinned: !post.pinned });
            showToast(post.pinned ? 'Đã bỏ ghim bài viết.' : 'Đã ghim bài viết lên đầu.', 'success');
            await refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        },
        onEdit: (postId) => {
          const post = (state.data.posts || []).find((p) => p.id === postId);
          if (!post) return;
          const linkedAsg = post.linkedAssignmentId
            ? (state.data.assignments || []).find((a) => a.id === post.linkedAssignmentId) || null
            : null;
          openPostComposerModal({
            existing: post,
            linkedAssignment: linkedAsg,
            classes: getKnownClasses(),
            exams: state.data.exams || [],
            uiHelpers,
            onSaved: refresh,
          });
        },
        onDelete: (postId) => {
          const post = (state.data.posts || []).find((p) => p.id === postId);
          if (!post) return;
          const hasLinkedAsg = Boolean(post.linkedAssignmentId);
          openModal({
            title: 'Xác nhận xóa bài viết',
            bodyHtml: `<p style="margin:0;">Thầy có chắc muốn xóa bài <strong>${escapeHtml(post.title || 'không tiêu đề')}</strong>${hasLinkedAsg ? ' cùng bài tập liên kết' : ''} và các tệp đính kèm không?</p>`,
            footerHtml: `
              <button class="btn btn-secondary" id="mCancelDelPost">Hủy</button>
              <button class="btn btn-danger-outline" id="mOkDelPost">Xóa bài viết</button>
            `,
            onMount: (m) => {
              m.querySelector('#mCancelDelPost').addEventListener('click', closeModal);
              m.querySelector('#mOkDelPost').addEventListener('click', async () => {
                closeModal();
                try {
                  await api.deletePost(post.id);
                  showToast('Đã xóa bài viết.', 'success');
                  await refresh();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            },
          });
        },
        onManualCheck: (asgId) => openManualCheckModal(asgId),
        onGotoAssignment: (asgId) => {
          state.subTab = 'assignments';
          render();
          const card = rootEl.querySelector(`[data-asg-card="${CSS.escape(asgId)}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('is-flash-hl');
            setTimeout(() => card.classList.remove('is-flash-hl'), 1400);
          }
        },
        onViewSubs: (asgId) => {
          state.subFilterAsg = asgId;
          state.subTab = 'assignments';
          render();
          rootEl.querySelector('#teacherSubmissionsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
    };

    wireAdminFeedList(rootEl.querySelector('#teacherFeedList'));

    rootEl.querySelector('#btnNewPost')?.addEventListener('click', () => {
      openPostComposerModal({
        existing: null,
        linkedAssignment: null,
        classes: getKnownClasses(),
        exams: state.data.exams || [],
        uiHelpers,
        onSaved: refresh,
      });
    });

    rootEl.querySelector('#selFeedClassFilter')?.addEventListener('change', (e) => {
      state.feedClassFilter = e.target.value;
      render();
    });

    rootEl.querySelector('#inpTeacherFeedSearch')?.addEventListener('input', (e) => {
      state.feedSearch = e.target.value;
      const listEl = rootEl.querySelector('#teacherFeedList');
      if (!listEl) return;
      const posts = state.data.posts || [];
      const filtered = filterAdminPosts(posts);
      listEl.innerHTML = renderFeedList({
        posts: filtered,
        isAdmin: true,
        assignments: state.data.assignments || [],
        exams: state.data.exams || [],
        students: state.data.students || [],
        submissions: state.data.submissions || [],
        emptyTitle: 'Không tìm thấy bài viết phù hợp',
        emptyText: 'Thử chọn lớp khác hoặc đổi từ khóa tìm kiếm.',
      });
      wireAdminFeedList(listEl);
      renderMath(listEl);
    });

    // Exams tab events
    rootEl.querySelector('#btnImportLatex')?.addEventListener('click', () => openSmartImportModal('latex'));
    rootEl.querySelector('#btnImportWordPdf')?.addEventListener('click', () => openSmartImportModal('word'));
    rootEl.querySelector('#btnNewExam')?.addEventListener('click', openNewExamEditor);

    rootEl.querySelectorAll('[data-edit-exam]').forEach((btn) => {
      btn.addEventListener('click', () => openEditExamEditor(btn.dataset.editExam));
    });

    rootEl.querySelectorAll('[data-assign-exam]').forEach((btn) => {
      btn.addEventListener('click', () => openAssignmentModal({ preselectExamId: btn.dataset.assignExam }));
    });

    rootEl.querySelectorAll('[data-present-exam-card]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exam = state.data.exams.find((e) => e.id === btn.dataset.presentExamCard);
        if (!exam) return;
        onPresentExam?.(exam);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    rootEl.querySelectorAll('[data-preview-exam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exam = state.data.exams.find((e) => e.id === btn.dataset.previewExam);
        if (!exam) return;
        state.inRunner = true;
        examRunner.startTaking({
          exam,
          studentName: state.data.user?.fullName || 'Giáo viên',
          studentClass: 'Xem trước',
          isPreview: true,
          shuffle: false,
          timedMode: true,
          onExit: () => render(),
        });
      });
    });

    rootEl.querySelectorAll('[data-delete-exam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exam = state.data.exams.find((e) => e.id === btn.dataset.deleteExam);
        if (!exam) return;
        openModal({
          title: 'Xác nhận xóa đề thi',
          bodyHtml: `<p style="margin:0;">Bạn có chắc chắn muốn xóa đề <strong>${escapeHtml(exam.title)}</strong>? Các đợt giao bài gắn với đề này cũng sẽ bị xóa.</p>`,
          footerHtml: `
            <button class="btn btn-secondary" id="mCancelDel">Hủy</button>
            <button class="btn btn-danger-outline" id="mOkDel">Xóa đề thi</button>
          `,
          onMount: (m) => {
            m.querySelector('#mCancelDel').addEventListener('click', closeModal);
            m.querySelector('#mOkDel').addEventListener('click', async () => {
              closeModal();
              try {
                await api.deleteExam(exam.id);
                showToast('Đã xóa đề thi.', 'success');
                await refresh();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          },
        });
      });
    });

    // Assignments tab events
    rootEl.querySelector('#btnNewAssignment')?.addEventListener('click', () => openAssignmentModal());
    rootEl.querySelectorAll('[data-manual-check-asg]').forEach((btn) => {
      btn.addEventListener('click', () => openManualCheckModal(btn.dataset.manualCheckAsg));
    });
    rootEl.querySelectorAll('[data-goto-post]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const postId = btn.dataset.gotoPost;
        state.subTab = 'feed';
        state.feedClassFilter = 'all';
        state.feedSearch = '';
        render();
        const postEl = rootEl.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
        if (postEl) {
          postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          postEl.classList.add('is-flash-hl');
          setTimeout(() => postEl.classList.remove('is-flash-hl'), 1400);
        }
      });
    });
    rootEl.querySelectorAll('[data-edit-asg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asg = state.data.assignments.find((a) => a.id === btn.dataset.editAsg);
        if (asg) openAssignmentModal({ existing: asg });
      });
    });
    rootEl.querySelectorAll('[data-view-asg-subs]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.subFilterAsg = btn.dataset.viewAsgSubs;
        state.subTab = 'assignments';
        render();
        rootEl.querySelector('#teacherSubmissionsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    rootEl.querySelectorAll('[data-del-asg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asg = state.data.assignments.find((a) => a.id === btn.dataset.delAsg);
        if (!asg) return;
        openModal({
          title: 'Xác nhận xóa đợt giao bài',
          bodyHtml: `<p style="margin:0;">Thầy có chắc muốn xóa bài <strong>${escapeHtml(asg.title)}</strong> không?${asg.linkedPostId ? ' (Bài viết trên Bảng tin vẫn được giữ nguyên, chỉ gỡ phần bài tập liên kết.)' : ''}</p>`,
          footerHtml: `
            <button class="btn btn-secondary" id="mCancelDelAsg">Hủy</button>
            <button class="btn btn-danger-outline" id="mOkDelAsg">Xóa bài tập</button>
          `,
          onMount: (m) => {
            m.querySelector('#mCancelDelAsg').addEventListener('click', closeModal);
            m.querySelector('#mOkDelAsg').addEventListener('click', async () => {
              closeModal();
              try {
                await api.deleteAssignment(asg.id);
                showToast('Đã xóa đợt giao bài tập.', 'success');
                await refresh();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          },
        });
      });
    });

    // Students tab events
    rootEl.querySelector('#btnNewStudent')?.addEventListener('click', () => openStudentModal(null));
    rootEl.querySelectorAll('[data-edit-stu]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stu = state.data.students.find((s) => s.id === btn.dataset.editStu);
        if (stu) openStudentModal(stu);
      });
    });
    rootEl.querySelectorAll('[data-del-stu]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stu = state.data.students.find((s) => s.id === btn.dataset.delStu);
        if (!stu) return;
        openModal({
          title: 'Xóa tài khoản học sinh',
          bodyHtml: `<p style="margin:0;">Xóa tài khoản <strong>@${escapeHtml(stu.username)} (${escapeHtml(stu.fullName)})</strong>?</p>`,
          footerHtml: `
            <button class="btn btn-secondary" id="mCancelDelS">Hủy</button>
            <button class="btn btn-danger-outline" id="mOkDelS">Xóa tài khoản</button>
          `,
          onMount: (m) => {
            m.querySelector('#mCancelDelS').addEventListener('click', closeModal);
            m.querySelector('#mOkDelS').addEventListener('click', async () => {
              closeModal();
              try {
                await api.deleteStudent(stu.id);
                showToast('Đã xóa tài khoản học sinh.', 'success');
                await refresh();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          },
        });
      });
    });

    // Tuition tab events
    if (state.subTab === 'tuition') {
      bindTuitionAdminEvents({
        rootEl,
        students: state.data.students,
        classes: getKnownClasses(),
        tuition: state.data.tuition,
        state,
        uiHelpers,
        onSaveTuition: async (nextTuition, successMsg) => {
          try {
            const res = await api.saveTuition(nextTuition);
            state.data.tuition = res.tuition;
            if (successMsg) showToast(successMsg, 'success');
            render();
          } catch (err) {
            showToast(err.message || 'Không thể lưu dữ liệu học phí.', 'error');
          }
        },
        onRender: render,
      });
    }

    // Analytics tab events
    if (state.subTab === 'analytics') {
      bindAnalyticsAdminEvents({
        rootEl,
        students: state.data.students,
        modelsSummary: state.data.modelsSummary,
        analytics: state.data.analytics,
        state,
        uiHelpers,
        onRefresh: async () => {
          await refresh();
          showToast('Đã cập nhật dữ liệu thống kê mới nhất!', 'info');
        },
        onResetAnalytics: async () => {
          try {
            const res = await api.resetAnalytics();
            state.data.analytics = res.analytics;
            showToast('Đã đặt lại toàn bộ số liệu thống kê về 0.', 'success');
            render();
          } catch (err) {
            showToast(err.message || 'Không thể đặt lại thống kê.', 'error');
          }
        },
        onRender: render,
      });
    }

    // Submissions tab events
    rootEl.querySelector('#selSubFilterAsg')?.addEventListener('change', (e) => {
      state.subFilterAsg = e.target.value;
      render();
    });
    rootEl.querySelector('#inpSubSearch')?.addEventListener('input', (e) => {
      state.subSearch = e.target.value;
      render();
    });
    rootEl.querySelectorAll('[data-view-sub]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sub = state.data.submissions.find((s) => s.id === btn.dataset.viewSub);
        const exam = state.data.exams.find((e) => e.id === sub?.examId);
        if (!sub || !exam) {
          showToast('Không tìm thấy đề gốc của bài nộp này.', 'error');
          return;
        }
        state.inRunner = true;
        examRunner.openReview({
          exam: sub.examSnapshot || exam,
          answers: sub.answers,
          result: sub.result,
          studentName: sub.studentName,
          studentClass: sub.studentClass,
          elapsedSeconds: sub.elapsedSeconds,
          assignment: { title: sub.assignmentTitle },
          onExit: () => render(),
        });
      });
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const comma = res.indexOf(',');
        resolve(comma >= 0 ? res.slice(comma + 1) : res);
      };
      reader.onerror = () => reject(new Error('Không thể đọc file vừa chọn.'));
      reader.readAsDataURL(file);
    });
  }

  function openSmartImportModal(initialMode = 'latex') {
    let mode = initialMode; // 'latex' | 'word' | 'pdf'
    let parsedResult = null; // { exam, warnings, sourceFormat }

    const renderBody = () => `
      <div class="import-mode-tabs">
        <button type="button" class="import-mode-btn ${mode === 'latex' ? 'active' : ''}" data-imp-mode="latex">
          LaTeX (ex_test) <span class="badge badge-p1">Chính</span>
        </button>
        <button type="button" class="import-mode-btn ${mode === 'word' ? 'active' : ''}" data-imp-mode="word">
          Word (.docx)
        </button>
        <button type="button" class="import-mode-btn ${mode === 'pdf' ? 'active' : ''}" data-imp-mode="pdf">
          PDF (.pdf)
        </button>
      </div>

      <div id="impPanelLatex" class="${mode === 'latex' ? '' : 'hidden'}">
        <div class="import-tip">
          Hỗ trợ trọn bộ <code>ex_test</code>: <code>\\begin{ex}...\\end{ex}</code>, <code>\\choice</code>, <code>\\choiceTF</code>,
          <code>\\shortans</code>, <code>\\True</code>, <code>\\loigiai</code>, <code>\\heva</code>, <code>\\hoac</code>,
          tự làm sạch <code>\\par</code> / <code>\\immini</code> / <code>\\setlength</code> và <strong>tự động biên dịch hình vẽ TikZ sang ảnh SVG sắc nét</strong>.
        </div>
        <div id="texDropzone" style="margin-bottom:10px;"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btnInsertSampleTex">Chèn mã mẫu ex_test</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnDownloadSampleTex">Tải file mẫu .tex</button>
          <button type="button" class="btn btn-primary btn-sm" id="btnRunParseTex" style="margin-left:auto;">
            Phân tích mã LaTeX →
          </button>
        </div>
        <textarea id="texSourceArea" class="code-textarea" placeholder="Dán mã LaTeX có chứa \\begin{ex} ... \\end{ex} vào đây hoặc chọn file .tex..."></textarea>
      </div>

      <div id="impPanelWord" class="${mode === 'word' ? '' : 'hidden'}">
        <div class="import-tip">
          Hỗ trợ file <strong>Word (.docx)</strong> chứa công thức <strong>Microsoft Equation (OMML → tự chuyển LaTeX)</strong>
          và <strong>MathType</strong>. Tự nhận diện đáp án đúng qua chữ <u>gạch chân</u>, tô màu đỏ hoặc bảng đáp án cuối đề.
        </div>
        <div id="docxDropzone"></div>
      </div>

      <div id="impPanelPdf" class="${mode === 'pdf' ? '' : 'hidden'}">
        <div class="import-tip" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <span>
            Đọc mọi file <strong>PDF (.pdf)</strong> — kể cả đề xuất từ <strong>Word/MathType, LaTeX hoặc PDF ảnh scan</strong> — bằng <strong>Gemini Vision AI</strong>, tự chuyển sang mã LaTeX chuẩn và tự cắt hình vẽ sắc nét.
          </span>
          <button type="button" class="btn btn-secondary btn-sm" id="btnImpOpenAiSettings">⚙ Cài đặt Gemini AI</button>
        </div>
        <div id="pdfDropzone"></div>
      </div>

      <div id="impStatusMsg" class="hidden" style="margin-top:12px;"></div>
      <div id="impPreviewBox" class="hidden" style="margin-top:14px;"></div>
    `;

    openModal({
      title: 'Nạp đề thi vào ngân hàng (LaTeX ex_test / Word / PDF)',
      wide: true,
      bodyHtml: renderBody(),
      footerHtml: `
        <button class="btn btn-secondary" id="mCloseImp">Đóng</button>
        <button class="btn btn-secondary hidden" id="mOpenParsedEditor">Mở trình tinh chỉnh để rà soát</button>
        <button class="btn btn-primary hidden" id="mSaveParsedExam">Lưu ngay vào ngân hàng</button>
      `,
      onMount: (m) => {
        const statusEl = m.querySelector('#impStatusMsg');
        const previewEl = m.querySelector('#impPreviewBox');
        const btnEditParsed = m.querySelector('#mOpenParsedEditor');
        const btnSaveParsed = m.querySelector('#mSaveParsedExam');

        function setStatus(html, type = 'info') {
          statusEl.className = `import-status ${type}`;
          statusEl.innerHTML = html;
          statusEl.classList.remove('hidden');
        }

        function showParsedPreview(res) {
          parsedResult = res;
          const ex = res.exam;
          const p1n = ex.part1?.length || 0;
          const p2n = ex.part2?.length || 0;
          const p3n = ex.part3?.length || 0;
          const p4n = ex.part4?.length || 0;
          const sampleQ = ex.part1?.[0] || ex.part2?.[0] || ex.part3?.[0] || ex.part4?.[0];
          const missingInfo = scanMissingImages(ex);
          const isPresOnly = Boolean(ex.presentationOnly);
          const startNumVal = Math.max(1, Math.floor(Number(ex.startQuestionNumber) || 1));
          const answerWarnRe = /(\\True|tạm đặt đáp án|chưa có đáp án|đáp án đúng|đáp số ngắn|chưa thấy đáp số|tạm đặt\s+[A0])/i;
          const visibleWarnings = (res.warnings || []).filter((w) => !(isPresOnly && answerWarnRe.test(String(w || ''))));

          previewEl.innerHTML = `
            <div class="import-preview-card">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                <div style="flex:1; min-width:220px;">
                  <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">TÊN ĐỀ THI NHẬN DIỆN ĐƯỢC (CÓ THỂ SỬA NHANH):</label>
                  <input id="impExamTitleEdit" class="input-control input-compact" value="${escapeAttr(ex.title)}" />
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-self:flex-end;">
                  <span class="badge badge-p1">Phần I: ${p1n} câu</span>
                  <span class="badge badge-p2">Phần II: ${p2n} câu</span>
                  <span class="badge badge-p3">Phần III: ${p3n} câu</span>
                  ${p4n > 0 ? `<span class="badge badge-neutral">Phần IV: ${p4n} câu</span>` : ''}
                  ${
                    res.latexSource
                      ? `<button type="button" class="btn btn-secondary btn-sm" id="btnCopyParsedLatex">Sao chép mã LaTeX</button>`
                      : ''
                  }
                </div>
              </div>

              <div class="imp-pres-bar">
                <label class="checkbox-pill" style="margin:0;">
                  <input type="checkbox" id="impPresentationOnly" ${isPresOnly ? 'checked' : ''} />
                  <span>Chỉ để trình chiếu</span>
                </label>
                <div id="impStartNumWrap" class="imp-start-num-wrap ${isPresOnly ? '' : 'hidden'}">
                  <span>STT bắt đầu của Câu 1:</span>
                  <input type="number" min="1" max="999" id="impStartNum" class="input-control input-compact" style="width:80px; text-align:center;" value="${startNumVal}" />
                </div>
              </div>

              ${
                missingInfo.uniqueNames.length > 0
                  ? `
                    <div class="ed-missing-banner is-compact">
                      <div class="ed-missing-banner-top">
                        <div>
                          <strong>⚠ Phát hiện ${missingInfo.uniqueNames.length} ảnh đang thiếu trong đề (\\includegraphics)</strong>
                          <p>Tải ảnh lên ngay tại đây để tự chèn trước khi lưu, hoặc bổ sung sau trong mục Tinh chỉnh đề.</p>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" id="btnImpBulkUploadImgs">Chọn nhiều ảnh tự khớp tên</button>
                      </div>
                      <div class="ed-missing-chips">
                        ${missingInfo.uniqueNames
                          .map(
                            (name) => `
                          <button type="button" class="ed-missing-chip" data-imp-fill-missing="${escapeAttr(name)}">
                            <span><strong>${escapeHtml(name)}</strong></span>
                            <span class="ed-missing-chip-act">Chọn ảnh</span>
                          </button>
                        `
                          )
                          .join('')}
                      </div>
                    </div>
                  `
                  : ''
              }

              ${
                visibleWarnings.length
                  ? `<div class="import-warn-box">
                      <strong>Lưu ý cần kiểm tra (${visibleWarnings.length}):</strong>
                      <ul>${visibleWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                    </div>`
                  : `<div style="font-size:0.83rem; color:var(--success); font-weight:600; margin-bottom:8px;">✓ Phân tích hoàn hảo — không có cảnh báo!</div>`
              }

              ${
                sampleQ
                  ? `<div class="import-sample-preview">
                      <div style="font-size:0.74rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">XEM TRƯỚC CÂU ĐẦU TIÊN (CÂU ${startNumVal}):</div>
                      <div style="font-size:0.88rem;">${sampleQ.stem}</div>
                    </div>`
                  : ''
              }
            </div>
          `;
          previewEl.classList.remove('hidden');
          btnEditParsed.classList.remove('hidden');
          btnSaveParsed.classList.remove('hidden');
          previewEl.querySelector('#impPresentationOnly')?.addEventListener('change', (ev) => {
            const titleEl = previewEl.querySelector('#impExamTitleEdit');
            if (titleEl && titleEl.value.trim()) res.exam.title = titleEl.value.trim();
            res.exam.presentationOnly = Boolean(ev.target.checked);
            if (!res.exam.presentationOnly) res.exam.startQuestionNumber = 1;
            showParsedPreview(res);
          });
          previewEl.querySelector('#impStartNum')?.addEventListener('input', (ev) => {
            res.exam.startQuestionNumber = Math.max(1, Math.floor(Number(ev.target.value) || 1));
          });
          previewEl.querySelector('#btnCopyParsedLatex')?.addEventListener('click', async () => {
            if (!res.latexSource) return;
            try {
              await navigator.clipboard.writeText(res.latexSource);
              showToast('Đã sao chép toàn bộ mã LaTeX (ex_test) vào bộ nhớ tạm!', 'success');
            } catch {
              showToast('Không thể sao chép tự động.', 'error');
            }
          });
          previewEl.querySelectorAll('[data-imp-fill-missing]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const targetName = btn.dataset.impFillMissing;
              const inp = document.createElement('input');
              inp.type = 'file';
              inp.accept = 'image/*';
              inp.onchange = async () => {
                const file = inp.files?.[0];
                if (!file) return;
                try {
                  const url = await readImageFileAsDataUrl(file);
                  const n = replaceMissingImageInExam(res.exam, targetName, url);
                  res.warnings = (res.warnings || []).filter((w) => !String(w).includes('\\includegraphics'));
                  showParsedPreview(res);
                  showToast(`Đã chèn ảnh "${targetName}" (${n} vị trí)!`, 'success');
                } catch (err) {
                  showToast(err.message || 'Không đọc được tệp ảnh.', 'error');
                }
              };
              inp.click();
            });
          });
          previewEl.querySelector('#btnImpBulkUploadImgs')?.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/*';
            inp.multiple = true;
            inp.onchange = async () => {
              const files = Array.from(inp.files || []);
              if (!files.length) return;
              const curMiss = scanMissingImages(res.exam);
              const byKey = new Map(curMiss.uniqueNames.map((n) => [normalizeImgKey(n), n]));
              let matched = 0;
              for (const f of files) {
                const target = byKey.get(normalizeImgKey(f.name));
                if (!target) continue;
                try {
                  const url = await readImageFileAsDataUrl(f);
                  if (replaceMissingImageInExam(res.exam, target, url) > 0) matched++;
                } catch {
                  // skip
                }
              }
              if (scanMissingImages(res.exam).uniqueNames.length === 0) {
                res.warnings = (res.warnings || []).filter((w) => !String(w).includes('\\includegraphics'));
              }
              showParsedPreview(res);
              showToast(
                matched > 0
                  ? `Đã khớp và chèn tự động ${matched} ảnh!`
                  : 'Chưa có ảnh nào trùng tên với ảnh đang thiếu. Hãy chọn từng chip tên ảnh bên dưới.',
                matched > 0 ? 'success' : 'warning'
              );
            };
            inp.click();
          });
          renderMath(previewEl);
        }

        // Switch import mode tabs
        m.querySelectorAll('[data-imp-mode]').forEach((btn) => {
          btn.addEventListener('click', () => {
            mode = btn.dataset.impMode;
            m.querySelectorAll('[data-imp-mode]').forEach((b) => b.classList.toggle('active', b === btn));
            m.querySelector('#impPanelLatex').classList.toggle('hidden', mode !== 'latex');
            m.querySelector('#impPanelWord').classList.toggle('hidden', mode !== 'word');
            m.querySelector('#impPanelPdf').classList.toggle('hidden', mode !== 'pdf');
          });
        });

        // === MODE 1: LATEX ex_test ===
        const texArea = m.querySelector('#texSourceArea');
        const texFileInp = m.querySelector('#inpTexFile');
        let lastTexFilename = '';

        async function resolvePendingTikzPdfs(res) {
          const batch = res?.pendingTikzBatchPdf;
          const pending = res?.pendingTikzPdfs;
          const hasBatch = Boolean(batch && batch.pdfBase64 && Array.isArray(batch.tokens) && batch.tokens.length > 0);
          const entries = pending && typeof pending === 'object' ? Object.entries(pending) : [];
          if (!hasBatch && entries.length === 0) return res;

          const totalCount = (hasBatch ? batch.tokens.length : 0) + entries.length;
          setStatus(`Đang dựng ảnh độ nét cao cho ${totalCount} hình vẽ TikZ...`, 'info');
          const imgHtmlByToken = {};

          if (hasBatch) {
            try {
              const pngs = await renderPdfBase64AllPagesToPngs(batch.pdfBase64, 2.5);
              batch.tokens.forEach((tok, idx) => {
                if (pngs[idx]) {
                  imgHtmlByToken[tok] = `<div class="q-figure"><img src="${pngs[idx]}" class="tikz-figure" alt="Hình vẽ TikZ" /></div>`;
                } else {
                  imgHtmlByToken[tok] = '<div class="tikz-placeholder">[Không thể dựng trang ảnh hình TikZ]</div>';
                }
              });
            } catch {
              batch.tokens.forEach((tok) => {
                imgHtmlByToken[tok] = '<div class="tikz-placeholder">[Không thể dựng ảnh hình TikZ]</div>';
              });
            }
          }

          for (const [tok, b64Pdf] of entries) {
            try {
              const pngUrl = await renderPdfBase64ToPngDataUrl(b64Pdf, 2.5);
              imgHtmlByToken[tok] = `<div class="q-figure"><img src="${pngUrl}" class="tikz-figure" alt="Hình vẽ TikZ" /></div>`;
            } catch {
              imgHtmlByToken[tok] = '<div class="tikz-placeholder">[Không thể dựng ảnh hình TikZ]</div>';
            }
          }

          const replaceTokens = (str) => {
            if (typeof str !== 'string') return str;
            let out = str;
            for (const [tok, html] of Object.entries(imgHtmlByToken)) {
              if (out.includes(tok)) out = out.split(tok).join(html);
            }
            return out;
          };

          const ex = res.exam;
          (ex.part1 || []).forEach((q) => {
            q.stem = replaceTokens(q.stem);
            q.explanation = replaceTokens(q.explanation);
            (q.options || []).forEach((o) => (o.text = replaceTokens(o.text)));
          });
          (ex.part2 || []).forEach((q) => {
            q.stem = replaceTokens(q.stem);
            q.explanation = replaceTokens(q.explanation);
            (q.statements || []).forEach((st) => (st.text = replaceTokens(st.text)));
          });
          (ex.part3 || []).forEach((q) => {
            q.stem = replaceTokens(q.stem);
            q.explanation = replaceTokens(q.explanation);
          });
          (ex.part4 || []).forEach((q) => {
            q.stem = replaceTokens(q.stem);
            q.explanation = replaceTokens(q.explanation);
          });
          delete res.pendingTikzPdfs;
          delete res.pendingTikzBatchPdf;
          return res;
        }

        async function parseTexNow() {
          const content = texArea.value.trim();
          if (!content) {
            setStatus('Vui lòng dán mã LaTeX (chứa môi trường <code>\\begin{ex}...\\end{ex}</code>) hoặc chọn file <code>.tex</code>.', 'error');
            return;
          }
          setStatus('Đang phân tích mã LaTeX ex_test & biên dịch hình vẽ TikZ...', 'info');
          try {
            const res = await api.parseExam({ format: 'latex', content, filename: lastTexFilename });
            await resolvePendingTikzPdfs(res);
            statusEl.classList.add('hidden');
            showParsedPreview(res);
          } catch (err) {
            setStatus(escapeHtml(err.message), 'error');
          }
        }

        mountAnimatedDropzone(m.querySelector('#texDropzone'), {
          inputId: 'inpTexFile',
          accept: '.tex,.txt',
          compact: true,
          idleTitle: 'Kéo thả file LaTeX (.tex) vào đây',
          dragTitle: 'Thả file .tex để phân tích ngay',
          subNote: '.tex / .txt',
          maxBytes: 10 * 1024 * 1024,
          onProcess: async (file) => {
            const text = await file.text();
            return { text, name: file.name };
          },
          onComplete: async ({ text, name }) => {
            lastTexFilename = name;
            texArea.value = text;
            await parseTexNow();
          },
          onError: (err) => setStatus(escapeHtml(err?.message || 'Không thể đọc file .tex.'), 'error'),
        });

        m.querySelector('#btnInsertSampleTex').addEventListener('click', async () => {
          lastTexFilename = 'de-mau-extest-2025.tex';
          texArea.value = SAMPLE_EXTEST_TEX;
          await parseTexNow();
        });

        m.querySelector('#btnDownloadSampleTex').addEventListener('click', () => {
          const blob = new Blob([SAMPLE_EXTEST_TEX], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'de-mau-extest-2025.tex';
          a.click();
          URL.revokeObjectURL(url);
        });

        m.querySelector('#btnRunParseTex').addEventListener('click', parseTexNow);

        // === MODE 2: WORD (.docx) ===
        mountAnimatedDropzone(m.querySelector('#docxDropzone'), {
          inputId: 'inpDocxFile',
          accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          idleTitle: 'Kéo thả file Word (.docx) vào đây',
          dragTitle: 'Thả file Word để nạp đề',
          hintText: 'Mẹo MathType: Bấm "Toggle TeX" trong Word trước để công thức sắc nét 100%.',
          onProcess: async (file) => {
            if (!file.name.toLowerCase().endsWith('.docx')) {
              throw new Error('Hệ thống hỗ trợ file Word định dạng .docx (hãy Lưu dưới dạng .docx trong Word).');
            }
            statusEl.classList.add('hidden');
            const base64Data = await fileToBase64(file);
            const res = await api.parseExam({ format: 'docx', base64Data, filename: file.name });
            await resolvePendingTikzPdfs(res);
            return res;
          },
          onComplete: (res) => {
            statusEl.classList.add('hidden');
            showParsedPreview(res);
          },
          onError: (err) => {
            setStatus(escapeHtml(err?.message || 'Không thể đọc file Word.'), 'error');
          },
        });

        // === MODE 3: PDF (.pdf) via Gemini Vision AI ===
        m.querySelector('#btnImpOpenAiSettings')?.addEventListener('click', () => {
          uiHelpers.openAiSettingsModal?.();
        });

        mountAnimatedDropzone(m.querySelector('#pdfDropzone'), {
          inputId: 'inpPdfFile',
          accept: '.pdf,application/pdf',
          idleTitle: 'Kéo thả file PDF (.pdf) vào đây',
          dragTitle: 'Thả file PDF để Gemini AI đọc đề',
          subNote: '.pdf (tối đa 24 MB)',
          hintText: '',
          maxBytes: 24 * 1024 * 1024,
          onProcess: async (file) => {
            if (!file.name.toLowerCase().endsWith('.pdf')) {
              throw new Error('Vui lòng chọn file định dạng .pdf.');
            }
            setStatus('Đang đọc file PDF & chuyển công thức sang LaTeX bằng Gemini Vision AI (10–25 giây)...', 'info');
            const base64Data = await fileToBase64(file);
            const res = await api.parseExam({ format: 'pdf_base64', base64Data, filename: file.name });
            if (res?.exam && Array.isArray(res.pendingPdfFigures) && res.pendingPdfFigures.length > 0) {
              setStatus(`Đang cắt ảnh độ nét cao cho ${res.pendingPdfFigures.length} hình vẽ trong PDF...`, 'info');
              const figMap = await cropPdfFiguresFromFile(file, res.pendingPdfFigures);
              replaceTokensInExamOrDeck(res.exam, figMap);
            }
            await resolvePendingTikzPdfs(res);
            return res;
          },
          onComplete: (res) => {
            statusEl.classList.add('hidden');
            showParsedPreview(res);
          },
          onError: (err) => {
            const msg = escapeHtml(err?.message || 'Không thể đọc file PDF.');
            if (err?.code === 'MISSING_GEMINI_KEY') {
              setStatus(
                `${msg} <button type="button" class="btn btn-primary btn-sm" id="btnErrOpenAi" style="margin-left:8px;">Cài đặt Gemini AI ngay</button>`,
                'error'
              );
              statusEl.querySelector('#btnErrOpenAi')?.addEventListener('click', () => {
                uiHelpers.openAiSettingsModal?.();
              });
            } else {
              setStatus(msg, 'error');
            }
          },
        });

        // === FOOTER ACTIONS ===
        m.querySelector('#mCloseImp').addEventListener('click', closeModal);

        const syncImportMeta = () => {
          if (!parsedResult?.exam) return;
          const titleEl = m.querySelector('#impExamTitleEdit');
          if (titleEl && titleEl.value.trim()) parsedResult.exam.title = titleEl.value.trim();
          const presChk = m.querySelector('#impPresentationOnly');
          if (presChk) parsedResult.exam.presentationOnly = Boolean(presChk.checked);
          const startInp = m.querySelector('#impStartNum');
          parsedResult.exam.startQuestionNumber = parsedResult.exam.presentationOnly
            ? Math.max(1, Math.floor(Number(startInp?.value || parsedResult.exam.startQuestionNumber) || 1))
            : 1;
        };

        btnEditParsed.addEventListener('click', () => {
          if (!parsedResult?.exam) return;
          syncImportMeta();
          state.editingExam = { ...parsedResult.exam, part4: parsedResult.exam.part4 || [], id: null };
          state.editorPartTab =
            state.editingExam.part1.length > 0
              ? 'part1'
              : state.editingExam.part2.length > 0
                ? 'part2'
                : state.editingExam.part3.length > 0
                  ? 'part3'
                  : state.editingExam.part4.length > 0
                    ? 'part4'
                    : 'part1';
          closeModal();
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        btnSaveParsed.addEventListener('click', async () => {
          if (!parsedResult?.exam) return;
          syncImportMeta();
          try {
            await api.createExams(parsedResult.exam);
            closeModal();
            showToast(`Đã nạp thành công đề "${parsedResult.exam.title}" vào ngân hàng!`, 'success');
            await refresh();
          } catch (err) {
            setStatus(escapeHtml(err.message), 'error');
          }
        });
      },
    });
  }

  return {
    init: refresh,
    getExams: () => state.data.exams || [],
    goHome: () => {
      examRunner.cleanup();
      state.editingExam = null;
      state.inRunner = false;
      state.subTab = 'feed';
      refresh();
    },
  };
}
