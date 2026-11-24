import { api } from './api.js?v=20261124z2';
import {
  extractTextFromPdfFile,
  renderPdfBase64ToPngDataUrl,
  renderPdfBase64AllPagesToPngs,
} from './pdf-reader.js?v=20261123d';
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
} from './exam-engine.js?v=20261123d';
import {
  renderFeedList,
  bindFeedEvents,
  openPostComposerModal,
} from './classroom-feed.js?v=20261124z4';
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
import { mountAnimatedDropzone } from './ux-dropzone.js?v=20261124z';

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

export function createTeacherController({ rootEl, examRunner, uiHelpers }) {
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

      <div class="subtab-bar">
        <button class="subtab-btn ${state.subTab === 'feed' ? 'active' : ''}" data-subtab="feed">
          Bảng tin <span class="badge badge-neutral">${posts.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'exams' ? 'active' : ''}" data-subtab="exams">
          Ngân hàng đề thi <span class="badge badge-neutral">${exams.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'tuition' ? 'active' : ''}" data-subtab="tuition">
          Học phí <span class="badge ${unpaidCurCount > 0 ? 'badge-warning' : 'badge-success'}">${unpaidCurCount > 0 ? `${unpaidCurCount} chưa nộp` : 'Đủ'}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'assignments' ? 'active' : ''}" data-subtab="assignments">
          Bài tập <span class="badge badge-neutral">${assignments.length}</span>
        </button>
        <button class="subtab-btn ${state.subTab === 'analytics' ? 'active' : ''}" data-subtab="analytics">
          Thống kê
        </button>
        <button class="subtab-btn ${state.subTab === 'students' ? 'active' : ''}" data-subtab="students">
          Tài khoản học sinh <span class="badge badge-neutral">${students.length}</span>
        </button>
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
          <button class="btn btn-primary" id="btnNewPost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Đăng bài giảng / tài liệu
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
                  const totalQ = (ex.part1?.length || 0) + (ex.part2?.length || 0) + (ex.part3?.length || 0);
                  return `
                    <article class="exam-card" style="cursor:default;">
                      <div class="exam-card-top">
                        <div>
                          <h3 class="exam-card-title">${escapeHtml(ex.title)}</h3>
                          ${ex.description ? `<p class="exam-card-desc">${escapeHtml(ex.description)}</p>` : ''}
                        </div>
                        <span class="badge badge-p1">${escapeHtml(ex.code || 'MĐ')}</span>
                      </div>

                      <div class="exam-card-badges">
                        <span class="badge badge-p1">Phần I: ${ex.part1?.length || 0} câu</span>
                        <span class="badge badge-p2">Phần II: ${ex.part2?.length || 0} câu (Đ/S)</span>
                        <span class="badge badge-p3">Phần III: ${ex.part3?.length || 0} câu (Trả lời ngắn)</span>
                        <span class="badge badge-neutral">${escapeHtml(ex.subject || 'Chưa phân môn')} • ${ex.durationMinutes} phút • ${totalQ} câu</span>
                      </div>

                      <div class="exam-card-footer">
                        <div class="exam-meta-inline">
                          <span>Thang điểm: P.I ${formatScoreVN(ex.scoring?.part1PerQuestion ?? 0.25)}đ • P.III ${formatScoreVN(ex.scoring?.part3PerQuestion ?? 0.5)}đ</span>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          <button class="btn btn-primary btn-sm" data-assign-exam="${ex.id}">Giao bài tập</button>
                          <button class="btn btn-secondary btn-sm" data-edit-exam="${ex.id}">Tinh chỉnh đề</button>
                          <button class="btn btn-secondary btn-sm" data-preview-exam="${ex.id}">Xem trước</button>
                          <button class="btn btn-danger-outline btn-sm" data-delete-exam="${ex.id}">Xóa</button>
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
    state.editingExam.scoring = state.editingExam.scoring || {
      part1PerQuestion: 0.25,
      part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
      part3PerQuestion: 0.5,
    };
    state.editorPartTab = 'part1';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderExamEditor() {
    const ex = state.editingExam;
    const isNew = !ex.id;
    const pTab = state.editorPartTab;

    rootEl.innerHTML = `
      <div class="exam-topbar">
        <div class="exam-topbar-info">
          <h2>${isNew ? 'Tạo đề thi mới (Chuẩn BGD 2025)' : `Tinh chỉnh đề thi: ${escapeHtml(ex.title)}`}</h2>
          <div class="exam-topbar-meta">
            <span>Phần I: <strong>${ex.part1.length}</strong> câu • Phần II: <strong>${ex.part2.length}</strong> câu • Phần III: <strong>${ex.part3.length}</strong> câu</span>
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" id="btnCancelEditor">← Hủy &amp; Quay lại</button>
          <button class="btn btn-primary btn-sm" id="btnSaveExamEditor">Lưu đề thi</button>
        </div>
      </div>

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
        <div class="form-group" style="margin-bottom:0;">
          <label>Mô tả ngắn</label>
          <input class="input-control" id="edDesc" value="${escapeAttr(ex.description || '')}" />
        </div>
      </div>

      <!-- Part Switcher -->
      <div class="section-toolbar">
        <div class="subtab-bar" style="margin-bottom:0;">
          <button class="subtab-btn ${pTab === 'part1' ? 'active' : ''}" data-ed-part="part1">
            Phần I — Nhiều lựa chọn (${ex.part1.length})
          </button>
          <button class="subtab-btn ${pTab === 'part2' ? 'active' : ''}" data-ed-part="part2">
            Phần II — Đúng/Sai (${ex.part2.length})
          </button>
          <button class="subtab-btn ${pTab === 'part3' ? 'active' : ''}" data-ed-part="part3">
            Phần III — Trả lời ngắn (${ex.part3.length})
          </button>
        </div>
        <button class="btn btn-primary btn-sm" id="btnAddQuestion">+ Thêm câu hỏi vào ${pTab === 'part1' ? 'Phần I' : pTab === 'part2' ? 'Phần II' : 'Phần III'}</button>
      </div>

      <div id="editorQuestionsList">
        ${pTab === 'part1' ? renderEditorPart1(ex.part1) : ''}
        ${pTab === 'part2' ? renderEditorPart2(ex.part2) : ''}
        ${pTab === 'part3' ? renderEditorPart3(ex.part3) : ''}
      </div>
    `;

    bindEditorEvents();
  }

  function renderEditorPart1(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi nào ở Phần I. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    return list
      .map(
        (q, idx) => `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-p1">Phần I • Câu ${idx + 1}</span>
          <button class="btn btn-danger-outline btn-sm" data-del-q="${idx}">Xóa câu</button>
        </div>
        <div class="form-group">
          <label>Đề bài (hỗ trợ LaTeX dạng $...$)</label>
          <textarea class="input-control" rows="2" data-field="stem">${escapeHtml(q.stem)}</textarea>
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
              <input class="input-control" data-opt-idx="${oi}" value="${escapeAttr(opt.text)}" />
            </div>
          `
            )
            .join('')}
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Lời giải chi tiết (tùy chọn)</label>
          <textarea class="input-control" rows="2" data-field="explanation">${escapeHtml(q.explanation || '')}</textarea>
        </div>
      </div>
    `
      )
      .join('');
  }

  function renderEditorPart2(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi nào ở Phần II. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    return list
      .map(
        (q, idx) => `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-p2">Phần II • Câu ${idx + 1}</span>
          <button class="btn btn-danger-outline btn-sm" data-del-q="${idx}">Xóa câu</button>
        </div>
        <div class="form-group">
          <label>Đề dẫn (hỗ trợ LaTeX)</label>
          <textarea class="input-control" rows="2" data-field="stem">${escapeHtml(q.stem)}</textarea>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
          ${q.statements
            .map(
              (st, si) => `
            <div style="display:grid; grid-template-columns: 28px 1fr 120px; gap:8px; align-items:center;">
              <strong style="color:var(--p2-text);">${st.key})</strong>
              <input class="input-control" data-st-text="${si}" value="${escapeAttr(st.text)}" />
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
          <label>Lời giải chi tiết (tùy chọn)</label>
          <textarea class="input-control" rows="2" data-field="explanation">${escapeHtml(q.explanation || '')}</textarea>
        </div>
      </div>
    `
      )
      .join('');
  }

  function renderEditorPart3(list) {
    if (!list.length) {
      return `<div class="card panel-card" style="text-align:center; color:var(--text-muted); padding:32px;">Chưa có câu hỏi nào ở Phần III. Nhấn <strong>"+ Thêm câu hỏi"</strong> ở góc phải.</div>`;
    }
    return list
      .map(
        (q, idx) => `
      <div class="card editor-q-card" data-q-idx="${idx}">
        <div class="editor-q-head">
          <span class="badge badge-p3">Phần III • Câu ${idx + 1}</span>
          <button class="btn btn-danger-outline btn-sm" data-del-q="${idx}">Xóa câu</button>
        </div>
        <div class="form-group">
          <label>Đề bài</label>
          <textarea class="input-control" rows="2" data-field="stem">${escapeHtml(q.stem)}</textarea>
        </div>
        <div class="form-row-2">
          <div class="form-group" style="margin-bottom:0;">
            <label>Đáp án chuẩn (tối đa 4 ký tự, VD: -3 hoặc 4,5)</label>
            <input class="input-control" maxlength="4" data-field="answer" value="${escapeAttr(q.answer)}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Lời giải chi tiết (tùy chọn)</label>
            <input class="input-control" data-field="explanation" value="${escapeAttr(q.explanation || '')}" />
          </div>
        </div>
      </div>
    `
      )
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
      const stemEl = card.querySelector('[data-field="stem"]');
      const expEl = card.querySelector('[data-field="explanation"]');
      if (topicEl) q.topic = topicEl.value;
      if (stemEl) q.stem = stemEl.value;
      if (expEl) q.explanation = expEl.value;

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
      } else if (part === 'part3') {
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
      } else {
        state.editingExam.part3.push({
          id: uid,
          topic: '',
          stem: '',
          answer: '0',
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

    rootEl.querySelector('#btnSaveExamEditor')?.addEventListener('click', async () => {
      syncEditorMetadataFromDom();
      syncCurrentPartQuestionsFromDom();
      const ex = state.editingExam;
      if (!ex.title) {
        showToast('Vui lòng nhập tên đề thi.', 'error');
        return;
      }
      if (ex.part1.length + ex.part2.length + ex.part3.length === 0) {
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
    const { assignments, exams, students, submissions } = state.data;
    const examsById = new Map(exams.map((e) => [e.id, e]));

    return `
      <div class="section-toolbar">
        <p style="margin:0; font-size:0.88rem; color:var(--text-secondary);">
          Chọn đề thi, thiết lập <strong>hạn nộp bài tập</strong> và chỉ định học sinh hoặc cả lớp cần làm bài.
        </p>
        <button class="btn btn-primary" id="btnNewAssignment">+ Giao bài tập mới</button>
      </div>

      <div class="exam-list">
        ${
          assignments.length === 0
            ? `<div class="card panel-card" style="text-align:center; padding:40px; color:var(--text-muted);">
                Chưa có đợt giao bài nào. Nhấn <strong>"+ Giao bài tập mới"</strong> để giao bài cho học sinh.
              </div>`
            : assignments
                .map((asg) => {
                  const exam = examsById.get(asg.examId);
                  const asgType = asg.assignmentType === 'test' ? 'test' : 'homework';
                  const dl = getDeadlineStatus(asg.dueAt, asg.openAt);
                  const targetStudents = asg.assignAll
                    ? students
                    : students.filter((s) => (asg.studentIds || []).includes(s.id));
                  const submittedStudentIds = new Set(
                    submissions.filter((s) => s.assignmentId === asg.id).map((s) => s.studentId)
                  );
                  const statusBadgeCls = dl.expired
                    ? 'badge-danger'
                    : dl.notOpen
                      ? 'badge-neutral'
                      : dl.urgent
                        ? 'badge-warning'
                        : 'badge-success';
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
                          <span>Đối tượng: ${
                            asg.assignAll
                              ? 'Toàn bộ học sinh'
                              : targetStudents.map((s) => escapeHtml(`${s.fullName} (${s.className})`)).join(', ') || 'Chưa chọn'
                          }</span>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          <button class="btn btn-secondary btn-sm" data-view-asg-subs="${asg.id}">Xem bài nộp</button>
                          <button class="btn btn-secondary btn-sm" data-edit-asg="${asg.id}">Sửa hạn nộp / HS</button>
                          <button class="btn btn-danger-outline btn-sm" data-del-asg="${asg.id}">Xóa</button>
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

  function openAssignmentModal({ existing = null, preselectExamId = null } = {}) {
    const { exams, students } = state.data;
    if (exams.length === 0) {
      showToast('Hãy tạo ít nhất 1 đề thi trước khi giao bài.', 'error');
      return;
    }

    const classes = [...new Set(students.map((s) => s.className).filter(Boolean))];
    const selExamId = existing?.examId || preselectExamId || exams[0].id;
    const selExam = exams.find((e) => e.id === selExamId) || exams[0];
    const initType = existing?.assignmentType === 'test' ? 'test' : 'homework';
    const initTimed = initType === 'test' ? true : Boolean(existing?.timedMode);
    const initDuration = existing?.durationMinutes || selExam.durationMinutes || 45;
    const assignAll = existing ? Boolean(existing.assignAll) : false;
    const chosenIds = new Set(existing ? existing.studentIds || [] : students.map((s) => s.id));

    const openParts = existing?.openAt
      ? splitIsoToVnDateTime(existing.openAt)
      : defaultVnDateTime(0, '08:00');
    const dueParts = existing?.dueAt
      ? splitIsoToVnDateTime(existing.dueAt)
      : defaultVnDateTime(5, '23:59');

    openModal({
      title: existing ? 'Chỉnh sửa đợt giao bài' : 'Giao bài tập / bài kiểm tra cho học sinh',
      wide: true,
      bodyHtml: `
        <div class="form-group">
          <label>Loại hình giao bài *</label>
          <div class="asg-type-switch" id="asgTypeSwitch">
            <label class="asg-type-opt ${initType === 'homework' ? 'active' : ''}">
              <input type="radio" name="asgType" value="homework" ${initType === 'homework' ? 'checked' : ''} />
              <div>
                <strong>Bài tập</strong>
                <small>Tùy chọn tính giờ, linh hoạt thời gian làm bài trước hạn nộp</small>
              </div>
            </label>
            <label class="asg-type-opt ${initType === 'test' ? 'active' : ''}">
              <input type="radio" name="asgType" value="test" ${initType === 'test' ? 'checked' : ''} />
              <div>
                <strong>Bài kiểm tra</strong>
                <small>Mặc định có thời gian làm bài, quy định rõ giờ mở đề &amp; giờ nộp bài</small>
              </div>
            </label>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label>Chọn đề thi *</label>
            <select id="asgExamId" class="input-control" ${existing ? 'disabled' : ''}>
              ${exams
                .map(
                  (e) =>
                    `<option value="${e.id}" ${e.id === selExamId ? 'selected' : ''}>[${escapeHtml(e.code)}] ${escapeHtml(e.title)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Tiêu đề hiển thị cho HS</label>
            <input id="asgTitle" class="input-control" value="${escapeAttr(existing?.title || selExam.title)}" />
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group" id="openAtGroup">
            <label id="openAtLabel">
              ${initType === 'test' ? 'Thời gian mở đề (dd/mm/yyyy) *' : 'Thời gian mở đề (tùy chọn — để trống mở ngay)'}
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
              <input id="asgDueDate" type="text" class="input-control" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(dueParts.date)}" />
              <input id="asgDueTime" type="text" class="input-control vn-time-input" placeholder="HH:mm" maxlength="5" value="${escapeAttr(dueParts.time)}" />
            </div>
          </div>
        </div>

        <div class="asg-options-box">
          <div class="asg-opt-row">
            <label class="checkbox-pill" style="margin:0;">
              <input type="checkbox" id="asgTimed" ${initTimed ? 'checked' : ''} ${initType === 'test' ? 'disabled' : ''} />
              <span>Tính thời gian làm bài</span>
            </label>
            <div id="asgDurationWrap" class="asg-duration-inline ${initTimed ? '' : 'hidden'}">
              <span>Làm trong</span>
              <input id="asgDurationMinutes" type="number" min="1" max="300" class="input-control input-compact" style="width:82px; text-align:center;" value="${initDuration}" />
              <span>phút</span>
            </div>
          </div>

          <div class="asg-opt-row" style="margin-top:10px;">
            <label class="checkbox-pill" style="margin:0;">
              <input type="checkbox" id="asgShuffle" ${existing?.shuffle ? 'checked' : ''} />
              <span>Trộn câu hỏi</span>
            </label>
          </div>
        </div>

        <div class="form-group" style="margin-top:12px;">
          <label>Ghi chú / Dặn dò cho học sinh</label>
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

        const examSel = modalEl.querySelector('#asgExamId');
        const titleInp = modalEl.querySelector('#asgTitle');
        const durInp = modalEl.querySelector('#asgDurationMinutes');
        const timedChk = modalEl.querySelector('#asgTimed');
        const durWrap = modalEl.querySelector('#asgDurationWrap');
        const openDateInp = modalEl.querySelector('#asgOpenDate');
        const openTimeInp = modalEl.querySelector('#asgOpenTime');
        const openLabel = modalEl.querySelector('#openAtLabel');
        const dueLabel = modalEl.querySelector('#dueAtLabel');

        function syncTypeUi(type) {
          modalEl.querySelectorAll('.asg-type-opt').forEach((lbl) => {
            const rad = lbl.querySelector('input[type="radio"]');
            lbl.classList.toggle('active', rad.value === type);
          });
          if (type === 'test') {
            timedChk.checked = true;
            timedChk.disabled = true;
            durWrap.classList.remove('hidden');
            openLabel.textContent = 'Thời gian mở đề (dd/mm/yyyy) *';
            dueLabel.textContent = 'Thời gian nộp bài / đóng đề (dd/mm/yyyy) *';
            if (!openDateInp.value.trim()) {
              const defOpen = defaultVnDateTime(0, '08:00');
              openDateInp.value = defOpen.date;
              openTimeInp.value = defOpen.time;
            }
          } else {
            timedChk.disabled = false;
            durWrap.classList.toggle('hidden', !timedChk.checked);
            openLabel.textContent = 'Thời gian mở đề (tùy chọn — để trống mở ngay)';
            dueLabel.textContent = 'Hạn nộp bài tập (dd/mm/yyyy) *';
          }
        }

        modalEl.querySelectorAll('input[name="asgType"]').forEach((rad) => {
          rad.addEventListener('change', () => syncTypeUi(rad.value));
        });

        timedChk.addEventListener('change', () => {
          durWrap.classList.toggle('hidden', !timedChk.checked);
        });

        if (!existing) {
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
          const asgType = modalEl.querySelector('input[name="asgType"]:checked')?.value || 'homework';
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

          const payload = {
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
            studentIds: Array.from(modalEl.querySelectorAll('.asg-stu-chk:checked')).map((c) => c.value),
          };
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
                      <strong>${escapeHtml(s.fullName)}</strong>
                      ${
                        s.startDate || s.createdAt
                          ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Vào học: ${escapeHtml(formatDateVNAdmin(s.startDate || (s.createdAt || '').slice(0, 10)))}</div>`
                          : ''
                      }
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
        <div class="form-group" style="margin-bottom:0;">
          <label>Email</label>
          <input id="stuEmail" type="email" class="input-control" placeholder="Nhập email (tùy chọn)" value="${escapeAttr(existing?.email || '')}" />
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
          openPostComposerModal({
            existing: post,
            classes: getKnownClasses(),
            uiHelpers,
            onSaved: refresh,
          });
        },
        onDelete: (postId) => {
          const post = (state.data.posts || []).find((p) => p.id === postId);
          if (!post) return;
          openModal({
            title: 'Xác nhận xóa bài viết',
            bodyHtml: `<p style="margin:0;">Thầy có chắc muốn xóa bài <strong>${escapeHtml(post.title || 'không tiêu đề')}</strong> và các tệp đính kèm không?</p>`,
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
      });
    };

    wireAdminFeedList(rootEl.querySelector('#teacherFeedList'));

    rootEl.querySelector('#btnNewPost')?.addEventListener('click', () => {
      openPostComposerModal({
        existing: null,
        classes: getKnownClasses(),
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
      btn.addEventListener('click', async () => {
        try {
          await api.deleteAssignment(btn.dataset.delAsg);
          showToast('Đã xóa đợt giao bài tập.', 'success');
          await refresh();
        } catch (err) {
          showToast(err.message, 'error');
        }
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
        <div class="import-tip">
          Hỗ trợ nạp file <strong>PDF (.pdf)</strong> có lớp văn bản (đề xuất từ LaTeX hoặc Word). Hệ thống trích xuất tự động 3 phần và cho phép thầy rà soát lại công thức trong Trình tinh chỉnh.
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
          const sampleQ = ex.part1?.[0] || ex.part2?.[0] || ex.part3?.[0];

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
                </div>
              </div>

              ${
                res.warnings?.length
                  ? `<div class="import-warn-box">
                      <strong>Lưu ý cần kiểm tra (${res.warnings.length}):</strong>
                      <ul>${res.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                    </div>`
                  : `<div style="font-size:0.83rem; color:var(--success); font-weight:600; margin-bottom:8px;">✓ Phân tích hoàn hảo — không có cảnh báo!</div>`
              }

              ${
                sampleQ
                  ? `<div class="import-sample-preview">
                      <div style="font-size:0.74rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">XEM TRƯỚC CÂU ĐẦU TIÊN (ĐÃ RENDER KATEX):</div>
                      <div style="font-size:0.88rem;">${sampleQ.stem}</div>
                    </div>`
                  : ''
              }
            </div>
          `;
          previewEl.classList.remove('hidden');
          btnEditParsed.classList.remove('hidden');
          btnSaveParsed.classList.remove('hidden');
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

        // === MODE 3: PDF (.pdf) ===
        mountAnimatedDropzone(m.querySelector('#pdfDropzone'), {
          inputId: 'inpPdfFile',
          accept: '.pdf,application/pdf',
          idleTitle: 'Kéo thả file PDF (.pdf) vào đây',
          dragTitle: 'Thả file PDF để nạp đề',
          hintText: 'Tự nhận diện PHẦN I / PHẦN II / PHẦN III và đánh số Câu 1., Câu 2., ...',
          onProcess: async (file) => {
            if (!file.name.toLowerCase().endsWith('.pdf')) {
              throw new Error('Vui lòng chọn file định dạng .pdf.');
            }
            statusEl.classList.add('hidden');
            const extractedText = await extractTextFromPdfFile(file);
            if (!extractedText.trim()) {
              throw new Error('File PDF không có lớp văn bản (có thể là ảnh scan). Vui lòng dùng mã LaTeX ex_test hoặc file Word .docx.');
            }
            const res = await api.parseExam({ format: 'pdf_text', content: extractedText, filename: file.name });
            await resolvePendingTikzPdfs(res);
            return res;
          },
          onComplete: (res) => {
            statusEl.classList.add('hidden');
            showParsedPreview(res);
          },
          onError: (err) => {
            setStatus(escapeHtml(err?.message || 'Không thể đọc file PDF.'), 'error');
          },
        });

        // === FOOTER ACTIONS ===
        m.querySelector('#mCloseImp').addEventListener('click', closeModal);

        btnEditParsed.addEventListener('click', () => {
          if (!parsedResult?.exam) return;
          const titleEl = m.querySelector('#impExamTitleEdit');
          if (titleEl && titleEl.value.trim()) parsedResult.exam.title = titleEl.value.trim();
          state.editingExam = { ...parsedResult.exam, id: null };
          state.editorPartTab =
            state.editingExam.part1.length > 0 ? 'part1' : state.editingExam.part2.length > 0 ? 'part2' : 'part3';
          closeModal();
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        btnSaveParsed.addEventListener('click', async () => {
          if (!parsedResult?.exam) return;
          const titleEl = m.querySelector('#impExamTitleEdit');
          if (titleEl && titleEl.value.trim()) parsedResult.exam.title = titleEl.value.trim();
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
    goHome: () => {
      examRunner.cleanup();
      state.editingExam = null;
      state.inRunner = false;
      state.subTab = 'feed';
      refresh();
    },
  };
}
