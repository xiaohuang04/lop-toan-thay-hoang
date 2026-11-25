import {
  escapeHtml,
  escapeAttr,
  formatScoreVN,
  formatTime,
  formatDateTimeVN,
  formatShortAnswerSlots,
  prepareExamInstance,
  gradeExam,
} from './exam-engine.js';
import { renderFlipClockHtml, updateFlipClock } from './ux-effects.js?v=20261125g';

export function createExamRunner({ rootEl, uiHelpers }) {
  const { showToast, openModal, closeModal, renderMath, setHeaderStatus } = uiHelpers;

  let timerId = null;
  let strictHandlers = null;
  let violationModalOpen = false;
  let enteredFullscreenOnce = false;

  const state = {
    mode: 'idle', // 'taking' | 'review'
    exam: null,
    assignment: null,
    studentName: '',
    studentClass: '',
    isPreview: false,
    strictTestMode: false,
    violations: 0,
    shuffle: false,
    timedMode: true,
    answers: { part1: {}, part2: {}, part3: {} },
    flagged: new Set(),
    filter: 'all',
    secondsLeft: 0,
    elapsedSeconds: 0,
    result: null,
    showSolutions: true,
    onSubmitPersist: null,
    onExit: null,
    onRetry: null,
  };

  function clearTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function teardownStrictMode(exitFs = true) {
    document.body.classList.remove('test-lock-active');
    violationModalOpen = false;
    enteredFullscreenOnce = false;
    if (strictHandlers) {
      document.removeEventListener('fullscreenchange', strictHandlers.onFsChange);
      document.removeEventListener('visibilitychange', strictHandlers.onVisChange);
      window.removeEventListener('beforeunload', strictHandlers.onBeforeUnload);
      strictHandlers = null;
    }
    if (exitFs && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function handleStrictViolation(reasonText) {
    if (state.mode !== 'taking' || !state.strictTestMode) return;
    if (violationModalOpen) return;

    state.violations++;
    if (state.violations >= 2) {
      showToast('Bạn đã thoát chế độ toàn màn hình quá số lần cho phép — Hệ thống tự động nộp bài!', 'error');
      finalizeSubmission();
      return;
    }

    violationModalOpen = true;
    openModal({
      title: 'CẢNH BÁO: Thoát chế độ kiểm tra = NỘP BÀI!',
      dismissible: false,
      bodyHtml: `
        <p style="margin-top:0; color:var(--danger); font-weight:700;">
          ${escapeHtml(reasonText)}
        </p>
        <p style="margin-bottom:0; font-size:0.9rem;">
          Trong chế độ <strong>Bài kiểm tra</strong>, học sinh không được phép thoát toàn màn hình hoặc chuyển sang cửa sổ khác.
          Nếu thoát ra (hoặc vi phạm thêm 1 lần nữa), hệ thống sẽ <strong>TỰ ĐỘNG NỘP BÀI NGAY LẬP TỨC</strong>!
        </p>
      `,
      footerHtml: `
        <button class="btn btn-danger-outline" id="btnStrictExitSubmit">Thoát &amp; Nộp bài ngay</button>
        <button class="btn btn-primary" id="btnStrictResumeFs">Quay lại toàn màn hình (Làm tiếp)</button>
      `,
      onMount: (m) => {
        m.querySelector('#btnStrictExitSubmit').addEventListener('click', () => {
          violationModalOpen = false;
          closeModal();
          finalizeSubmission();
        });
        m.querySelector('#btnStrictResumeFs').addEventListener('click', () => {
          violationModalOpen = false;
          closeModal();
          if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        });
      },
    });
  }

  function setupStrictMode() {
    teardownStrictMode(false);
    document.body.classList.add('test-lock-active');
    enteredFullscreenOnce = Boolean(document.fullscreenElement);

    const onFsChange = () => {
      if (state.mode !== 'taking' || !state.strictTestMode) return;
      if (document.fullscreenElement) {
        enteredFullscreenOnce = true;
        return;
      }
      if (enteredFullscreenOnce) {
        handleStrictViolation('Bạn vừa thoát khỏi chế độ toàn màn hình!');
      }
    };

    const onVisChange = () => {
      if (state.mode !== 'taking' || !state.strictTestMode) return;
      if (document.hidden) {
        handleStrictViolation('Bạn vừa rời khỏi trang làm bài / chuyển sang tab khác!');
      }
    };

    const onBeforeUnload = (e) => {
      if (state.mode === 'taking' && state.strictTestMode) {
        e.preventDefault();
        e.returnValue = 'Thoát khỏi trang sẽ làm gián đoạn bài kiểm tra!';
      }
    };

    strictHandlers = { onFsChange, onVisChange, onBeforeUnload };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  function countAnswered() {
    const ex = state.exam;
    if (!ex) return { done: 0, total: 0 };
    let done = 0;
    (ex.part1 || []).forEach((q) => {
      if (state.answers.part1[q.id]) done++;
    });
    (ex.part2 || []).forEach((q) => {
      const m = state.answers.part2[q.id] || {};
      if (Object.keys(m).length === 4) done++;
    });
    (ex.part3 || []).forEach((q) => {
      if ((state.answers.part3[q.id] || '').trim() !== '') done++;
    });
    const total = (ex.part1?.length || 0) + (ex.part2?.length || 0) + (ex.part3?.length || 0);
    return { done, total };
  }

  function getPart2AnswerCount(qId) {
    return Object.keys(state.answers.part2[qId] || {}).length;
  }

  function startTaking({
    exam,
    assignment = null,
    studentName = 'Thí sinh',
    studentClass = '',
    isPreview = false,
    strictTestMode = false,
    shuffle = false,
    timedMode = true,
    durationMinutes = null,
    onSubmitPersist = null,
    onExit = null,
  }) {
    clearTimer();
    teardownStrictMode(false);
    state.mode = 'taking';
    state.exam = prepareExamInstance(exam, { shuffle });
    state.assignment = assignment;
    state.studentName = studentName;
    state.studentClass = studentClass;
    state.isPreview = isPreview;
    state.strictTestMode = Boolean(strictTestMode && !isPreview);
    state.violations = 0;
    state.shuffle = shuffle;
    state.timedMode = timedMode;
    state.answers = { part1: {}, part2: {}, part3: {} };
    state.flagged = new Set();
    state.filter = 'all';
    state.result = null;
    state.showSolutions = true;
    state.elapsedSeconds = 0;
    const mins = Number(durationMinutes) || Number(assignment?.durationMinutes) || Number(state.exam.durationMinutes) || 45;
    state.secondsLeft = mins * 60;
    state.onSubmitPersist = onSubmitPersist;
    state.onExit = onExit;
    state.onRetry = null;

    setHeaderStatus('');
    if (state.strictTestMode) {
      setupStrictMode();
    }

    timerId = setInterval(() => {
      state.elapsedSeconds++;
      if (state.timedMode) {
        state.secondsLeft--;
        updateTimerDom();
        if (state.secondsLeft <= 0) {
          clearTimer();
          showToast('Đã hết thời gian làm bài! Hệ thống tự động nộp bài.', 'error');
          finalizeSubmission();
        }
      } else {
        updateTimerDom();
      }
    }, 1000);

    render(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openReview({
    exam,
    answers,
    result = null,
    studentName = 'Thí sinh',
    studentClass = '',
    elapsedSeconds = 0,
    assignment = null,
    onExit = null,
    onRetry = null,
  }) {
    clearTimer();
    state.mode = 'review';
    state.exam = exam;
    state.assignment = assignment;
    state.studentName = studentName;
    state.studentClass = studentClass;
    state.answers = answers || { part1: {}, part2: {}, part3: {} };
    state.result = result && result.part1 ? result : gradeExam(exam, state.answers);
    state.elapsedSeconds = elapsedSeconds || 0;
    state.filter = 'all';
    state.showSolutions = true;
    state.onExit = onExit;
    state.onRetry = onRetry;

    setHeaderStatus('');
    render(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateTimerDom() {
    const clockEl = rootEl.querySelector('#examClock');
    if (!clockEl) return;
    if (state.timedMode) {
      updateFlipClock(clockEl, state.secondsLeft, { warnUnder: 300 });
    } else {
      updateFlipClock(clockEl, state.elapsedSeconds, { warnUnder: 0 });
    }
  }

  function render(isReview) {
    const ex = state.exam;
    const { done, total } = countAnswered();
    const res = state.result;

    const p1ResultMap = new Map(res ? res.part1.details.map((d) => [d.id, d]) : []);
    const p2ResultMap = new Map(res ? res.part2.details.map((d) => [d.id, d]) : []);
    const p3ResultMap = new Map(res ? res.part3.details.map((d) => [d.id, d]) : []);

    const showP1 = state.filter === 'all' || state.filter === 'part1' || state.filter === 'flagged';
    const showP2 = state.filter === 'all' || state.filter === 'part2' || state.filter === 'flagged';
    const showP3 = state.filter === 'all' || state.filter === 'part3' || state.filter === 'flagged';

    const filterFn = (q) => (state.filter === 'flagged' ? state.flagged.has(q.id) : true);
    const visibleP1 = showP1 ? (ex.part1 || []).map((q, i) => ({ q, i })).filter(({ q }) => filterFn(q)) : [];
    const visibleP2 = showP2 ? (ex.part2 || []).map((q, i) => ({ q, i })).filter(({ q }) => filterFn(q)) : [];
    const visibleP3 = showP3 ? (ex.part3 || []).map((q, i) => ({ q, i })).filter(({ q }) => filterFn(q)) : [];

    const scoring = ex.scoring || {
      part1PerQuestion: 0.25,
      part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
      part3PerQuestion: 0.5,
    };

    rootEl.innerHTML = `
      ${isReview ? renderResultHero(res) : ''}

      ${
        !isReview && state.strictTestMode
          ? `
            <div class="test-lock-banner">
              <span>Chế độ Bài kiểm tra toàn màn hình — Không thể thoát ra ngoài (thoát toàn màn hình hoặc chuyển tab = tự động nộp bài).</span>
              <button class="btn btn-danger-outline btn-sm" id="btnReenterFs">Bật toàn màn hình</button>
            </div>
          `
          : ''
      }

      <div class="exam-topbar">
        <div class="exam-topbar-info">
          <h2>${escapeHtml(state.assignment?.title || ex.title)}</h2>
          <div class="exam-topbar-meta">
            <span>Thí sinh: <strong>${escapeHtml(state.studentName)}</strong>${state.studentClass ? ` (${escapeHtml(state.studentClass)})` : ''}</span>
            <span>• Mã đề: <strong>${escapeHtml(ex.code)}</strong></span>
            ${state.assignment?.dueAt ? `<span>• Hạn nộp: <strong>${escapeHtml(formatDateTimeVN(state.assignment.dueAt))}</strong></span>` : ''}
            ${state.isPreview ? `<span class="badge badge-warning">Chế độ xem trước của Giáo viên</span>` : ''}
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${
            isReview
              ? `
                <button class="btn btn-secondary btn-sm" id="btnToggleSolutions">
                  ${state.showSolutions ? 'Ẩn lời giải' : 'Hiện lời giải'}
                </button>
                ${state.onRetry ? `<button class="btn btn-secondary btn-sm" id="btnRetryExam">Làm lại</button>` : ''}
                <button class="btn btn-primary btn-sm" id="btnBackRunner">← Quay lại</button>
              `
              : `<button class="btn ${state.strictTestMode ? 'btn-danger-outline' : 'btn-secondary'} btn-sm" id="btnExitExam">
                  ${state.strictTestMode ? 'Thoát (Nộp bài)' : '← Thoát phòng thi'}
                </button>`
          }
        </div>
      </div>

      <div class="exam-room-layout">
        <div>
          <div class="section-filter-bar">
            <button class="filter-chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">
              Tất cả (${total} câu)
            </button>
            <button class="filter-chip ${state.filter === 'part1' ? 'active' : ''}" data-filter="part1">
              Phần I — Trắc nghiệm (${ex.part1?.length || 0})
            </button>
            <button class="filter-chip ${state.filter === 'part2' ? 'active' : ''}" data-filter="part2">
              Phần II — Đúng/Sai (${ex.part2?.length || 0})
            </button>
            <button class="filter-chip ${state.filter === 'part3' ? 'active' : ''}" data-filter="part3">
              Phần III — Trả lời ngắn (${ex.part3?.length || 0})
            </button>
            ${
              !isReview
                ? `<button class="filter-chip ${state.filter === 'flagged' ? 'active' : ''}" data-filter="flagged">
                    Đã đánh dấu (<span id="flaggedCountChip">${state.flagged.size}</span>)
                  </button>`
                : ''
            }
          </div>

          <div id="questionStream">
            ${
              visibleP1.length + visibleP2.length + visibleP3.length === 0
                ? `<div class="card panel-card" style="text-align:center; padding:40px; color:var(--text-muted);">
                    Chưa có câu hỏi nào trong bộ lọc này.
                  </div>`
                : ''
            }

            ${
              visibleP1.length > 0
                ? `
                  <div class="part-banner part-1">
                    <div class="part-banner-title" style="margin-bottom:0;">PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn</div>
                  </div>
                  ${visibleP1.map(({ q, i }) => renderPart1Card(q, i, isReview, p1ResultMap.get(q.id))).join('')}
                `
                : ''
            }

            ${
              visibleP2.length > 0
                ? `
                  <div class="part-banner part-2">
                    <div class="part-banner-title" style="margin-bottom:0;">PHẦN II. Câu trắc nghiệm đúng sai</div>
                  </div>
                  ${visibleP2.map(({ q, i }) => renderPart2Card(q, i, isReview, p2ResultMap.get(q.id))).join('')}
                `
                : ''
            }

            ${
              visibleP3.length > 0
                ? `
                  <div class="part-banner part-3">
                    <div class="part-banner-title" style="margin-bottom:0;">PHẦN III. Câu trắc nghiệm trả lời ngắn</div>
                  </div>
                  ${visibleP3.map(({ q, i }) => renderPart3Card(q, i, isReview, p3ResultMap.get(q.id))).join('')}
                `
                : ''
            }
          </div>
        </div>

        <aside class="exam-sidebar">
          ${
            !isReview
              ? `
                <div class="card timer-card">
                  <div class="timer-label">${state.timedMode ? 'Thời gian còn lại' : 'Thời gian làm bài'}</div>
                  <div class="timer-clock-wrap">
                    ${renderFlipClockHtml(state.timedMode ? state.secondsLeft : state.elapsedSeconds, {
                      id: 'examClock',
                      warnUnder: state.timedMode ? 300 : 0,
                    })}
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" id="progressFill" style="width:${total ? Math.round((done / total) * 100) : 0}%"></div>
                  </div>
                  <div class="progress-meta">
                    <span>Đã hoàn thành</span>
                    <span id="progressCountText">${done} / ${total} câu</span>
                  </div>
                  <button class="btn btn-primary" id="btnSubmitExam" style="width:100%; margin-top:16px;">
                    ${state.isPreview ? 'Kết thúc xem trước & Chấm thử' : 'Nộp bài thi'}
                  </button>
                </div>
              `
              : ''
          }

          <div class="card omr-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <strong style="font-size:0.9rem;">${isReview ? 'Bản đồ kết quả' : 'Phiếu trả lời nhanh'}</strong>
              <span class="badge badge-neutral">${total} câu</span>
            </div>

            ${
              (ex.part1 || []).length > 0
                ? `
                  <div class="omr-part-title">Phần I (${ex.part1.length} câu)</div>
                  <div class="omr-grid">
                    ${ex.part1
                      .map((q, i) => `<button class="omr-cell ${getOmrCellClass('part1', q.id, isReview, p1ResultMap.get(q.id))}" data-jump="q-${q.id}" data-omr="${q.id}">${i + 1}</button>`)
                      .join('')}
                  </div>
                `
                : ''
            }

            ${
              (ex.part2 || []).length > 0
                ? `
                  <div class="omr-part-title">Phần II — Đúng/Sai (${ex.part2.length} câu)</div>
                  <div class="omr-grid omr-grid-wide">
                    ${ex.part2
                      .map((q, i) => `<button class="omr-cell ${getOmrCellClass('part2', q.id, isReview, p2ResultMap.get(q.id))}" data-jump="q-${q.id}" data-omr="${q.id}">II.${i + 1}</button>`)
                      .join('')}
                  </div>
                `
                : ''
            }

            ${
              (ex.part3 || []).length > 0
                ? `
                  <div class="omr-part-title">Phần III — Trả lời ngắn (${ex.part3.length} câu)</div>
                  <div class="omr-grid omr-grid-wide">
                    ${ex.part3
                      .map((q, i) => `<button class="omr-cell ${getOmrCellClass('part3', q.id, isReview, p3ResultMap.get(q.id))}" data-jump="q-${q.id}" data-omr="${q.id}">III.${i + 1}</button>`)
                      .join('')}
                  </div>
                `
                : ''
            }

            <div class="omr-legend">
              ${
                isReview
                  ? `
                    <span class="legend-item"><span class="legend-dot" style="background:var(--success);border-color:var(--success);"></span>Đúng trọn vẹn</span>
                    <span class="legend-item"><span class="legend-dot" style="background:var(--warning);border-color:var(--warning);"></span>Đúng một phần</span>
                    <span class="legend-item"><span class="legend-dot" style="background:var(--danger);border-color:var(--danger);"></span>Sai / Bỏ trống</span>
                  `
                  : `
                    <span class="legend-item"><span class="legend-dot done"></span>Đã làm</span>
                    <span class="legend-item"><span class="legend-dot part"></span>Đang làm dở</span>
                    <span class="legend-item"><span class="legend-dot"></span>Chưa làm</span>
                    <span class="legend-item"><span class="legend-dot flag"></span>Đánh dấu</span>
                  `
              }
            </div>
          </div>
        </aside>
      </div>
    `;

    bindEvents(isReview);
    renderMath(rootEl);
  }

  function renderResultHero(res) {
    return `
      <div class="result-hero">
        <div class="score-ring" style="--score-pct:${res.percent}%">
          <div class="score-ring-inner">
            <div class="score-big">${formatScoreVN(res.totalScore)}</div>
            <div class="score-denom">/ ${formatScoreVN(res.maxScore)} điểm</div>
          </div>
        </div>
        <div>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:6px;">
            <span class="badge badge-success">Đã chấm điểm</span>
            <span class="badge badge-neutral">Thời gian làm: ${formatTime(state.elapsedSeconds)}</span>
          </div>
          <h2 style="margin:0 0 4px; font-size:1.3rem;">
            Kết quả bài làm — ${escapeHtml(state.studentName)}
          </h2>
          <p style="margin:0; font-size:0.86rem; color:var(--text-secondary);">
            Chấm tự động theo thang điểm lũy tiến Bộ GD&amp;ĐT 2025. Cuộn xuống để đối chiếu đáp án và lời giải chi tiết.
          </p>
          <div class="result-breakdown">
            <div class="rb-card">
              <div class="rb-label">PHẦN I — NHIỀU LỰA CHỌN</div>
              <div class="rb-score" style="color:var(--p1-text)">${formatScoreVN(res.part1.score)} / ${formatScoreVN(res.part1.max)}đ</div>
              <div class="rb-detail">Đúng ${res.part1.correct}/${res.part1.total} câu</div>
            </div>
            <div class="rb-card">
              <div class="rb-label">PHẦN II — ĐÚNG / SAI</div>
              <div class="rb-score" style="color:var(--p2-text)">${formatScoreVN(res.part2.score)} / ${formatScoreVN(res.part2.max)}đ</div>
              <div class="rb-detail">Đúng ${res.part2.totalStatementsRight}/${res.part2.totalStatements} ý (${res.part2.fullCorrect} câu trọn điểm)</div>
            </div>
            <div class="rb-card">
              <div class="rb-label">PHẦN III — TRẢ LỜI NGẮN</div>
              <div class="rb-score" style="color:var(--p3-text)">${formatScoreVN(res.part3.score)} / ${formatScoreVN(res.part3.max)}đ</div>
              <div class="rb-detail">Đúng ${res.part3.correct}/${res.part3.total} câu</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPart1Card(q, index, isReview, detail) {
    const selected = state.answers.part1[q.id] || null;
    const isFlagged = state.flagged.has(q.id);
    const reviewCls = isReview ? (detail?.isCorrect ? 'review-correct' : 'review-wrong') : '';
    return `
      <article class="q-card ${isFlagged && !isReview ? 'is-flagged' : ''} ${reviewCls}" id="q-${q.id}">
        <div class="q-head">
          <div class="q-head-left">
            <span class="q-number">Câu ${index + 1}</span>
            <span class="badge badge-p1">Phần I</span>
          </div>
          ${
            isReview && detail
              ? `<span class="badge ${detail.isCorrect ? 'badge-success' : 'badge-danger'}">
                  ${detail.isCorrect ? `Đúng (+${formatScoreVN(detail.earned)}đ)` : `Sai • Đáp án: ${detail.correctAns}`}
                </span>`
              : `<button class="flag-btn ${isFlagged ? 'flagged' : ''}" data-flag="${q.id}">⚑ ${isFlagged ? 'Đã đánh dấu' : 'Đánh dấu'}</button>`
          }
        </div>
        <div class="q-stem">${q.stem}</div>
        ${q.figureHtml ? `<div class="q-figure">${q.figureHtml}</div>` : ''}
        <div class="mcq-grid">
          ${q.options
            .map((opt) => {
              let cls = '';
              if (!isReview) {
                if (selected === opt.key) cls = 'selected';
              } else {
                if (opt.key === q.answer) cls = 'opt-correct';
                else if (selected === opt.key && selected !== q.answer) cls = 'opt-wrong';
              }
              return `
                <button class="mcq-option ${cls}" data-p1-q="${q.id}" data-p1-opt="${opt.key}" ${isReview ? 'disabled' : ''}>
                  <span class="mcq-letter">${opt.key}</span>
                  <span>${opt.text}</span>
                </button>
              `;
            })
            .join('')}
        </div>
        ${isReview && state.showSolutions && q.explanation ? renderSolutionBox(q.explanation) : ''}
      </article>
    `;
  }

  function renderPart2Card(q, index, isReview, detail) {
    const userMap = state.answers.part2[q.id] || {};
    const isFlagged = state.flagged.has(q.id);
    let reviewCls = '';
    if (isReview && detail) {
      if (detail.rightCount === 4) reviewCls = 'review-correct';
      else if (detail.rightCount > 0) reviewCls = 'review-partial';
      else reviewCls = 'review-wrong';
    }
    return `
      <article class="q-card ${isFlagged && !isReview ? 'is-flagged' : ''} ${reviewCls}" id="q-${q.id}">
        <div class="q-head">
          <div class="q-head-left">
            <span class="q-number" style="background:var(--p2-bg);color:var(--p2-text);border-color:var(--p2-border);">Câu ${index + 1}</span>
            <span class="badge badge-p2">Phần II • Đúng/Sai</span>
          </div>
          ${
            isReview && detail
              ? `<span class="badge ${detail.rightCount === 4 ? 'badge-success' : detail.rightCount > 0 ? 'badge-warning' : 'badge-danger'}">
                  Đúng ${detail.rightCount}/4 ý (+${formatScoreVN(detail.earned)}đ)
                </span>`
              : `<button class="flag-btn ${isFlagged ? 'flagged' : ''}" data-flag="${q.id}">⚑ ${isFlagged ? 'Đã đánh dấu' : 'Đánh dấu'}</button>`
          }
        </div>
        <div class="q-stem">${q.stem}</div>
        ${q.figureHtml ? `<div class="q-figure">${q.figureHtml}</div>` : ''}
        <div class="tf-list">
          ${q.statements
            .map((st, si) => {
              const uVal = userMap[st.key];
              const stRes = isReview && detail ? detail.statementResults[si] : null;
              const rowCls = stRes ? (stRes.isRight ? 'tf-correct' : 'tf-wrong') : '';
              return `
                <div class="tf-row ${rowCls}">
                  <div class="tf-text">
                    <span class="tf-label">${st.key})</span>
                    <span>${st.text}</span>
                    ${
                      stRes
                        ? `<span class="tf-key-note" style="color:${stRes.isRight ? 'var(--success)' : 'var(--danger)'}">
                            [${stRes.isRight ? '✓ Chính xác' : `✗ Đáp án đúng: ${st.answer ? 'Đúng' : 'Sai'}`}]
                          </span>`
                        : ''
                    }
                  </div>
                  <div class="tf-controls">
                    <button class="tf-btn ${uVal === true ? 'active-true' : ''}" data-p2-q="${q.id}" data-p2-st="${st.key}" data-p2-val="true" ${isReview ? 'disabled' : ''}>Đúng</button>
                    <button class="tf-btn ${uVal === false ? 'active-false' : ''}" data-p2-q="${q.id}" data-p2-st="${st.key}" data-p2-val="false" ${isReview ? 'disabled' : ''}>Sai</button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
        ${isReview && state.showSolutions && q.explanation ? renderSolutionBox(q.explanation) : ''}
      </article>
    `;
  }

  function renderPart3Card(q, index, isReview, detail) {
    const val = state.answers.part3[q.id] || '';
    const slots = formatShortAnswerSlots(val);
    const isFlagged = state.flagged.has(q.id);
    const reviewCls = isReview ? (detail?.isCorrect ? 'review-correct' : 'review-wrong') : '';
    return `
      <article class="q-card ${isFlagged && !isReview ? 'is-flagged' : ''} ${reviewCls}" id="q-${q.id}">
        <div class="q-head">
          <div class="q-head-left">
            <span class="q-number" style="background:var(--p3-bg);color:var(--p3-text);border-color:var(--p3-border);">Câu ${index + 1}</span>
            <span class="badge badge-p3">Phần III • Trả lời ngắn</span>
          </div>
          ${
            isReview && detail
              ? `<span class="badge ${detail.isCorrect ? 'badge-success' : 'badge-danger'}">
                  ${detail.isCorrect ? `Đúng (+${formatScoreVN(detail.earned)}đ)` : `Sai • Đáp số đúng: ${detail.correctAns}`}
                </span>`
              : `<button class="flag-btn ${isFlagged ? 'flagged' : ''}" data-flag="${q.id}">⚑ ${isFlagged ? 'Đã đánh dấu' : 'Đánh dấu'}</button>`
          }
        </div>
        <div class="q-stem">${q.stem}</div>
        ${q.figureHtml ? `<div class="q-figure">${q.figureHtml}</div>` : ''}
        <div class="sa-box-wrap">
          <div class="sa-input-group">
            <label for="sa-${q.id}">Kết quả</label>
            <input id="sa-${q.id}" class="sa-input" type="text" inputmode="decimal" maxlength="4" value="${escapeAttr(val)}" data-p3-q="${q.id}" ${isReview ? 'disabled' : ''} />
          </div>
          <div class="sa-omr-preview" style="align-self:flex-end;">
            <div class="sa-slots" id="slots-${q.id}">
              ${slots.map((ch) => `<div class="sa-slot ${ch ? '' : 'empty'}">${ch || '·'}</div>`).join('')}
            </div>
          </div>
          ${
            isReview
              ? `<div class="sa-hint">
                  Đáp án của bạn: <strong>${val ? escapeHtml(val) : '(Bỏ trống)'}</strong> • Đáp án chuẩn: <strong style="color:var(--success)">${escapeHtml(q.answer)}</strong>
                </div>`
              : ''
          }
        </div>
        ${isReview && state.showSolutions && q.explanation ? renderSolutionBox(q.explanation) : ''}
      </article>
    `;
  }

  function renderSolutionBox(explanation) {
    return `
      <div class="solution-box">
        <div class="solution-title">Lời giải chi tiết</div>
        <div>${explanation}</div>
      </div>
    `;
  }

  function getOmrCellClass(part, qId, isReview, detail) {
    const classes = [];
    if (isReview && detail) {
      if (part === 'part2') {
        if (detail.rightCount === 4) classes.push('res-correct');
        else if (detail.rightCount > 0) classes.push('res-partial');
        else classes.push('res-wrong');
      } else {
        classes.push(detail.isCorrect ? 'res-correct' : 'res-wrong');
      }
      return classes.join(' ');
    }
    if (part === 'part1' && state.answers.part1[qId]) classes.push('answered');
    if (part === 'part2') {
      const cnt = getPart2AnswerCount(qId);
      if (cnt === 4) classes.push('answered');
      else if (cnt > 0) classes.push('partial');
    }
    if (part === 'part3' && (state.answers.part3[qId] || '').trim() !== '') classes.push('answered');
    if (state.flagged.has(qId)) classes.push('flagged');
    return classes.join(' ');
  }

  function bindEvents(isReview) {
    rootEl.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        render(isReview);
      });
    });

    rootEl.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.jump;
        let el = document.getElementById(targetId);
        if (!el && state.filter !== 'all') {
          state.filter = 'all';
          render(isReview);
          el = document.getElementById(targetId);
        }
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    if (isReview) {
      rootEl.querySelector('#btnToggleSolutions')?.addEventListener('click', () => {
        state.showSolutions = !state.showSolutions;
        render(true);
      });
      rootEl.querySelector('#btnRetryExam')?.addEventListener('click', () => state.onRetry?.());
      rootEl.querySelector('#btnBackRunner')?.addEventListener('click', () => {
        clearTimer();
        state.onExit?.();
      });
      return;
    }

    rootEl.querySelectorAll('[data-p1-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.p1Q;
        state.answers.part1[qId] = btn.dataset.p1Opt;
        btn.closest('.q-card').querySelectorAll('[data-p1-q]').forEach((b) => b.classList.toggle('selected', b === btn));
        syncProgressAndOmr('part1', qId);
      });
    });

    rootEl.querySelectorAll('[data-p2-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.p2Q;
        const stKey = btn.dataset.p2St;
        const val = btn.dataset.p2Val === 'true';
        if (!state.answers.part2[qId]) state.answers.part2[qId] = {};
        state.answers.part2[qId][stKey] = val;
        const row = btn.closest('.tf-row');
        row.querySelector('[data-p2-val="true"]').classList.toggle('active-true', val === true);
        row.querySelector('[data-p2-val="false"]').classList.toggle('active-false', val === false);
        syncProgressAndOmr('part2', qId);
      });
    });

    rootEl.querySelectorAll('[data-p3-q]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const qId = inp.dataset.p3Q;
        const sanitized = inp.value.replace(/[^0-9,.\-]/g, '').slice(0, 4);
        if (inp.value !== sanitized) inp.value = sanitized;
        state.answers.part3[qId] = sanitized;
        const slotsWrap = rootEl.querySelector(`#slots-${qId}`);
        if (slotsWrap) {
          slotsWrap.innerHTML = formatShortAnswerSlots(sanitized)
            .map((ch) => `<div class="sa-slot ${ch ? '' : 'empty'}">${ch || '·'}</div>`)
            .join('');
        }
        syncProgressAndOmr('part3', qId);
      });
    });

    rootEl.querySelectorAll('[data-flag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.flag;
        if (state.flagged.has(qId)) state.flagged.delete(qId);
        else state.flagged.add(qId);
        const isFlagged = state.flagged.has(qId);
        btn.classList.toggle('flagged', isFlagged);
        btn.textContent = isFlagged ? '⚑ Đã đánh dấu' : '⚑ Đánh dấu';
        btn.closest('.q-card')?.classList.toggle('is-flagged', isFlagged);
        const chipCnt = rootEl.querySelector('#flaggedCountChip');
        if (chipCnt) chipCnt.textContent = String(state.flagged.size);
        rootEl.querySelector(`[data-omr="${qId}"]`)?.classList.toggle('flagged', isFlagged);
      });
    });

    rootEl.querySelector('#btnSubmitExam')?.addEventListener('click', openSubmitConfirmModal);
    rootEl.querySelector('#btnExitExam')?.addEventListener('click', openExitConfirmModal);
    rootEl.querySelector('#btnReenterFs')?.addEventListener('click', () => {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  }

  function syncProgressAndOmr(part, qId) {
    const { done, total } = countAnswered();
    const fill = rootEl.querySelector('#progressFill');
    const txt = rootEl.querySelector('#progressCountText');
    if (fill) fill.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    if (txt) txt.textContent = `${done} / ${total} câu`;
    const omrBtn = rootEl.querySelector(`[data-omr="${qId}"]`);
    if (omrBtn) omrBtn.className = `omr-cell ${getOmrCellClass(part, qId, false, null)}`;
  }

  function openSubmitConfirmModal() {
    const { done, total } = countAnswered();
    const unanswered = total - done;
    openModal({
      title: 'Xác nhận nộp bài thi',
      bodyHtml: `
        <p style="margin-top:0;">Bạn có chắc chắn muốn kết thúc và nộp bài ngay bây giờ?</p>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0;">
          <div class="rb-card" style="text-align:center;"><div class="rb-label">ĐÃ HOÀN THÀNH</div><div class="rb-score" style="color:var(--primary)">${done}/${total}</div></div>
          <div class="rb-card" style="text-align:center;"><div class="rb-label">CHƯA XONG</div><div class="rb-score" style="color:${unanswered > 0 ? 'var(--danger)' : 'var(--success)'}">${unanswered}</div></div>
          <div class="rb-card" style="text-align:center;"><div class="rb-label">ĐÃ ĐÁNH DẤU</div><div class="rb-score" style="color:var(--warning)">${state.flagged.size}</div></div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="modalContinueExam">Quay lại làm tiếp</button>
        <button class="btn btn-primary" id="modalConfirmSubmit">Nộp bài &amp; Chấm điểm</button>
      `,
      onMount: (modalEl) => {
        modalEl.querySelector('#modalContinueExam').addEventListener('click', closeModal);
        modalEl.querySelector('#modalConfirmSubmit').addEventListener('click', () => {
          closeModal();
          finalizeSubmission();
        });
      },
    });
  }

  function openExitConfirmModal() {
    if (state.strictTestMode) {
      openModal({
        title: 'Cảnh báo: Thoát = Nộp bài ngay!',
        dismissible: false,
        bodyHtml: `
          <p style="margin:0; color:var(--danger); font-weight:700;">
            Trong chế độ Bài kiểm tra, bạn không thể thoát ngang giữa chừng!
          </p>
          <p style="margin:10px 0 0; font-size:0.9rem;">
            Nếu xác nhận thoát khỏi phòng kiểm tra lúc này, hệ thống sẽ <strong>TỰ ĐỘNG NỘP BÀI NGAY LẬP TỨC</strong> theo những câu bạn đã làm.
          </p>
        `,
        footerHtml: `
          <button class="btn btn-primary" id="modalStay">Quay lại làm tiếp</button>
          <button class="btn btn-danger-outline" id="modalLeaveSubmit">Thoát &amp; Nộp bài ngay</button>
        `,
        onMount: (modalEl) => {
          modalEl.querySelector('#modalStay').addEventListener('click', () => {
            closeModal();
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            }
          });
          modalEl.querySelector('#modalLeaveSubmit').addEventListener('click', () => {
            closeModal();
            finalizeSubmission();
          });
        },
      });
      return;
    }

    openModal({
      title: 'Thoát khỏi phòng thi?',
      bodyHtml: `<p style="margin:0;">Bài làm hiện tại chưa được nộp. Nếu thoát ra, các lựa chọn hiện tại sẽ không được lưu.</p>`,
      footerHtml: `
        <button class="btn btn-secondary" id="modalStay">Ở lại làm bài</button>
        <button class="btn btn-danger-outline" id="modalLeave">Thoát</button>
      `,
      onMount: (modalEl) => {
        modalEl.querySelector('#modalStay').addEventListener('click', closeModal);
        modalEl.querySelector('#modalLeave').addEventListener('click', () => {
          closeModal();
          clearTimer();
          teardownStrictMode(true);
          state.onExit?.();
        });
      },
    });
  }

  async function finalizeSubmission() {
    clearTimer();
    teardownStrictMode(true);
    const res = gradeExam(state.exam, state.answers);
    if (typeof state.onSubmitPersist === 'function') {
      try {
        await state.onSubmitPersist({
          answers: state.answers,
          result: res,
          elapsedSeconds: state.elapsedSeconds,
          examSnapshot: state.shuffle ? state.exam : null,
        });
      } catch (err) {
        showToast(err.message || 'Không thể lưu bài nộp lên máy chủ.', 'error');
        return;
      }
    }
    state.result = res;
    state.mode = 'review';
    state.strictTestMode = false;
    state.filter = 'all';
    setHeaderStatus('');
    showToast(`Đã nộp bài! Điểm số: ${formatScoreVN(res.totalScore)} / ${formatScoreVN(res.maxScore)}`, 'success');
    render(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return {
    startTaking,
    openReview,
    cleanup: () => {
      clearTimer();
      teardownStrictMode(true);
    },
    isTaking: () => state.mode === 'taking' && timerId !== null,
  };
}
