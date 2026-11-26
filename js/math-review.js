import { REVIEW_CURRICULUM } from './review-data.js?v=20261127c';
import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';

const LS_BOOKMARKS_KEY = 'math_review_bookmarks';
const LS_PROGRESS_KEY = 'math_review_progress';
const LS_LAST_LESSON_KEY = 'math_review_last_lesson';

const CARD_TYPE_META = {
  theory: {
    badge: 'Lý thuyết',
    cls: 'is-theory',
    iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  },
  formula: {
    badge: 'Công thức',
    cls: 'is-formula',
    iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H6l6 8-6 8h12"/></svg>`,
  },
  warning: {
    badge: 'Lưu ý',
    cls: 'is-warning',
    iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0 0 12 2z"/></svg>`,
  },
};

const TRAP_CATEGORY_META = {
  index: {
    cls: 'cat-index',
    iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
  },
  sign: {
    cls: 'cat-sign',
    iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="4" x2="12" y2="14"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="19" x2="17" y2="19"/></svg>`,
  },
  alternating: {
    cls: 'cat-alternating',
    iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  },
  coeff: {
    cls: 'cat-coeff',
    iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  },
  time: {
    cls: 'cat-time',
    iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  },
  domain: {
    cls: 'cat-domain',
    iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  },
};

function renderStarSvg(filled) {
  return filled
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

function renderRecallEyeSvg(masked) {
  return masked
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function stripAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function stripHtmlAndTags(raw) {
  return String(raw || '')
    .replace(/\[CHE:\s*/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Balanced parser for `[CHE: ...]` so nested brackets inside LaTeX
 * (such as `[CHE: $\frac{n}{2}[2u_1 + (n - 1)d]$]`) NEVER break!
 */
export function transformRecallMasks(htmlStr) {
  const s = String(htmlStr || '');
  const marker = '[CHE:';
  let out = '';
  let i = 0;
  let maskCounter = 0;

  while (i < s.length) {
    const idx = s.indexOf(marker, i);
    if (idx === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    let cursor = idx + marker.length;
    let depth = 1;
    while (cursor < s.length && depth > 0) {
      if (s[cursor] === '[') depth += 1;
      else if (s[cursor] === ']') depth -= 1;
      cursor += 1;
    }
    if (depth === 0) {
      const inner = s.slice(idx + marker.length, cursor - 1).trim();
      maskCounter += 1;
      out += `<span class="rv-recall-mask" data-recall-mask="${maskCounter}" role="button" tabindex="0" title="Chạm để hiện/ẩn"><span class="rv-recall-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>?</span></span><span class="rv-recall-ans">${inner}</span></span>`;
      i = cursor;
    } else {
      // Unclosed fallback
      out += s.slice(idx);
      break;
    }
  }
  return out;
}

/**
 * Normalize short-answer numbers (Spec §6.3):
 * Trim whitespace, unify minus signs, accept both `.` and `,` for decimals.
 */
function normalizeShortAnswer(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.');
  if (!s) return '';
  const num = Number(s);
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    return String(Number(num.toPrecision(12)));
  }
  return s.toLowerCase();
}

function checkTrapAnswer(fc, rawInput) {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return false;

  // Strip optional variable prefix like "x =", "u_5 =", "S10 ="
  const stripped = raw
    .replace(/[−–—]/g, '-')
    .replace(/\b[a-zA-Z_][a-zA-Z0-9_{}]*\s*=\s*/g, ' ')
    .trim();

  if (Array.isArray(fc.acceptedMultiSet) && fc.acceptedMultiSet.length > 0) {
    const expected = new Set(fc.acceptedMultiSet.map((v) => normalizeShortAnswer(v)));

    // Accept shorthand ±6, +-6, -+6, +/-6
    const pmMatch = stripped.match(/^(?:±|\+-|-\+|\+\/-)\s*(\d+(?:[.,]\d+)?)$/);
    if (pmMatch) {
      const mag = pmMatch[1];
      const got = new Set([normalizeShortAnswer(mag), normalizeShortAnswer(`-${mag}`)]);
      return got.size === expected.size && Array.from(expected).every((x) => got.has(x));
    }

    const parts = stripped
      .split(/\s*(?:;|,|\||\/|\bvà\b|\bva\b|\bhoặc\b|\bhoac\b|\bhay\b|\bor\b|\band\b)\s*|\s+/i)
      .map((p) => normalizeShortAnswer(p))
      .filter(Boolean);

    const got = new Set(parts);
    return (
      parts.length === expected.size &&
      got.size === expected.size &&
      Array.from(expected).every((x) => got.has(x))
    );
  }

  const normGot = normalizeShortAnswer(stripped);
  return (fc.acceptedAnswers || []).some((ans) => normalizeShortAnswer(ans) === normGot);
}

function renderTrapVerdictHtml(attempt) {
  if (!attempt) return '';
  if (attempt.isCorrect) {
    return `
      <div class="rv-trap-verdict is-won">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span><strong>Chúc mừng!</strong> Tỉnh táo vượt bẫy · Đáp án: <b>${escapeHtml(attempt.raw)}</b></span>
      </div>
    `;
  }
  return `
    <div class="rv-trap-verdict is-trapped">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span><strong>Mắc bẫy rồi!</strong> Bạn vừa nhập: <b>${escapeHtml(attempt.raw)}</b></span>
    </div>
  `;
}

function loadJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, val) {
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore quota errors
  }
}

export function createMathReviewController({ rootEl, uiHelpers, onRouteChange }) {
  const { showToast, renderMath } = uiHelpers;

  // Flatten all available lessons with chapter/grade metadata for fast lookup & search
  const lessonsIndex = [];
  const lessonsById = new Map();
  const flipCardsById = new Map();
  const cardsIndex = []; // for Instant Search & Bookmarks

  REVIEW_CURRICULUM.forEach((gradeObj) => {
    (gradeObj.chapters || []).forEach((chap) => {
      (chap.lessons || []).forEach((lesson) => {
        const enriched = {
          ...lesson,
          grade: gradeObj.grade,
          gradeLabel: gradeObj.label,
          chapterId: chap.id,
          chapterCode: chap.code,
          chapterTitle: chap.title,
        };
        lessonsIndex.push(enriched);
        lessonsById.set(lesson.id, enriched);

        (lesson.coreCards || []).forEach((c) => {
          const plain = stripHtmlAndTags(`${c.title} ${c.content}`);
          cardsIndex.push({
            kind: 'core',
            cardType: c.type,
            id: c.id,
            title: c.title,
            lessonId: lesson.id,
            lessonLabel: `${gradeObj.label} • ${lesson.code}: ${lesson.title}`,
            touchTab: 'touch1',
            card: c,
            searchHay: `${plain} ${stripAccents(plain)}`,
            snippet: plain.slice(0, 130),
          });
        });

        (lesson.flipCards || []).forEach((fc) => {
          flipCardsById.set(fc.id, fc);
          const plain = stripHtmlAndTags(`${fc.trapLabel} ${fc.problem} ${fc.trapExplanation} ${fc.correctExplanation}`);
          cardsIndex.push({
            kind: 'flip',
            cardType: 'flip',
            id: fc.id,
            title: fc.trapLabel || 'Bẫy hay sai',
            lessonId: lesson.id,
            lessonLabel: `${gradeObj.label} • ${lesson.code}: ${lesson.title}`,
            touchTab: 'touch1',
            card: fc,
            searchHay: `${plain} ${stripAccents(plain)}`,
            snippet: stripHtmlAndTags(fc.problem).slice(0, 130),
          });
        });

        (lesson.examples || []).forEach((ex) => {
          const plain = stripHtmlAndTags(`${ex.title} ${ex.problem} ${ex.hint}`);
          cardsIndex.push({
            kind: 'example',
            cardType: 'example',
            id: ex.id,
            title: ex.title,
            lessonId: lesson.id,
            lessonLabel: `${gradeObj.label} • ${lesson.code}: ${lesson.title}`,
            touchTab: 'touch2',
            card: ex,
            searchHay: `${plain} ${stripAccents(plain)}`,
            snippet: stripHtmlAndTags(ex.problem).slice(0, 130),
          });
        });
      });
    });
  });

  const defaultLessonId = lessonsIndex[0]?.id || '';
  const savedBookmarks = loadJsonStorage(LS_BOOKMARKS_KEY, []);
  const savedProgress = loadJsonStorage(LS_PROGRESS_KEY, {});
  const savedLastLesson = (() => {
    try {
      const v = window.localStorage.getItem(LS_LAST_LESSON_KEY) || '';
      return lessonsById.has(v) ? v : defaultLessonId;
    } catch {
      return defaultLessonId;
    }
  })();

  const state = {
    mounted: false,
    viewMode: 'lesson', // 'lesson' | 'bookmarks'
    activeLessonId: savedLastLesson,
    touchTab: 'touch1', // 'touch1' | 'touch2' | 'touch3'
    activeRecall: false,
    drawerOpen: false,
    searchQuery: '',
    expandedGrades: new Set([11]),
    expandedChapters: new Set(['toan11-c2']),
    bookmarks: new Set(Array.isArray(savedBookmarks) ? savedBookmarks : []),
    progress: typeof savedProgress === 'object' && savedProgress ? savedProgress : {},
    flippedIds: new Set(),
    // Per-trap-card student attempt: { [fcId]: { raw: string, isCorrect: boolean } }
    trapAttempts: {},
    // Per-example reveal state: { [exId]: { hint: bool, stepCount: number, answer: bool } }
    exampleState: {},
    // Per-lesson quiz state: { [lessonId]: { mc: {}, tf: {}, sa: {}, submitted: bool, summary: null } }
    quizState: {},
    // Per-lesson dynamic generator state: { [lessonId]: { item, userInput, checked, isCorrect, showSol, streak } }
    genState: {},
  };

  let resizeObserverCleanup = null;

  function ensureLessonInteractiveState(lesson) {
    if (!lesson) return;
    if (!state.quizState[lesson.id]) {
      state.quizState[lesson.id] = {
        mc: {},
        tf: {},
        sa: {},
        submitted: false,
        summary: null,
      };
    }
    if (!state.genState[lesson.id] && lesson.generators?.length) {
      state.genState[lesson.id] = {
        item: lesson.generators[0].generate(),
        userInput: '',
        checked: false,
        isCorrect: false,
        showSol: false,
        streak: 0,
      };
    }
    (lesson.examples || []).forEach((ex) => {
      if (!state.exampleState[ex.id]) {
        state.exampleState[ex.id] = {
          hint: false,
          stepCount: 0,
          answer: false,
        };
      }
    });
  }

  function persistBookmarks() {
    saveJsonStorage(LS_BOOKMARKS_KEY, Array.from(state.bookmarks));
  }

  function persistProgress() {
    saveJsonStorage(LS_PROGRESS_KEY, state.progress);
  }

  function toggleBookmark(cardId) {
    if (state.bookmarks.has(cardId)) {
      state.bookmarks.delete(cardId);
      showToast?.('Đã gỡ khỏi Sổ tay của tôi.', 'info');
    } else {
      state.bookmarks.add(cardId);
      showToast?.('Đã lưu vào ★ Sổ tay của tôi!', 'success');
    }
    persistBookmarks();
  }

  function triggerMathRender(targetEl) {
    const el = targetEl || rootEl;
    if (!el) return;
    const run = () => {
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(el, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true },
            ],
            throwOnError: false,
          });
        } catch {
          // ignore KaTeX parse errors
        }
      } else {
        renderMath?.(el);
      }
      syncFlipCardHeights(el);
    };

    if (window.renderMathInElement) {
      run();
    } else {
      setTimeout(run, 120);
    }
  }

  function syncFlipCardHeights(scopeEl) {
    const host = scopeEl || rootEl;
    if (!host) return;
    const equalizeRow = window.innerWidth > 640;
    const handled = new Set();

    host.querySelectorAll('.rv-flip-grid').forEach((grid) => {
      const cards = Array.from(grid.querySelectorAll('.rv-flip-card'));
      cards.forEach((c) => handled.add(c));
      const heights = cards.map((card) => {
        const front = card.querySelector('.rv-flip-front');
        const back = card.querySelector('.rv-flip-back');
        if (!front || !back) return 212;
        front.style.height = 'auto';
        back.style.height = 'auto';
        return Math.max(front.scrollHeight, back.scrollHeight, 212);
      });
      const rowMax = equalizeRow && heights.length ? Math.max(...heights) : 0;
      cards.forEach((card, idx) => {
        const h = equalizeRow ? rowMax : heights[idx];
        const inner = card.querySelector('.rv-flip-inner');
        const front = card.querySelector('.rv-flip-front');
        const back = card.querySelector('.rv-flip-back');
        if (inner) inner.style.minHeight = `${h}px`;
        if (front) front.style.height = `${h}px`;
        if (back) back.style.height = `${h}px`;
      });
    });

    // Also measure standalone bookmarked flip cards inside Sổ tay
    host.querySelectorAll('.rv-flip-card').forEach((card) => {
      if (handled.has(card)) return;
      const inner = card.querySelector('.rv-flip-inner');
      const front = card.querySelector('.rv-flip-front');
      const back = card.querySelector('.rv-flip-back');
      if (!front || !back) return;
      front.style.height = 'auto';
      back.style.height = 'auto';
      const h = Math.max(front.scrollHeight, back.scrollHeight, 212);
      if (inner) inner.style.minHeight = `${h}px`;
      front.style.height = `${h}px`;
      back.style.height = `${h}px`;
    });
  }

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================

  function renderSidebarHtml() {
    const bmCount = state.bookmarks.size;
    return `
      <div class="rv-nav-inner">
        <div class="rv-nav-mobile-head">
          <strong>Danh mục Ôn tập THPT</strong>
          <button type="button" class="icon-btn" id="btnCloseRvDrawer" aria-label="Đóng danh mục">✕</button>
        </div>

        <button
          type="button"
          class="rv-notebook-btn ${state.viewMode === 'bookmarks' ? 'is-active' : ''}"
          id="btnOpenNotebook"
        >
          <span class="rv-nb-left">
            <span class="rv-nb-star" aria-hidden="true">★</span>
            <span>Sổ tay của tôi</span>
          </span>
          <span class="rv-nb-badge" id="rvNotebookCount">${bmCount}</span>
        </button>

        <div class="rv-tree-heading">CHƯƠNG TRÌNH TOÁN THPT</div>

        <div class="rv-tree">
          ${REVIEW_CURRICULUM.map((g) => {
            const gOpen = state.expandedGrades.has(g.grade);
            const activeLessonCount = g.chapters.reduce((acc, c) => acc + (c.lessons?.length || 0), 0);
            return `
              <div class="rv-grade-group ${gOpen ? 'is-open' : ''}">
                <button type="button" class="rv-grade-btn" data-toggle-grade="${g.grade}" aria-expanded="${gOpen}">
                  <span class="rv-chevron" aria-hidden="true">▸</span>
                  <span class="rv-grade-lbl">${escapeHtml(g.label)}</span>
                  <span class="rv-grade-meta">${activeLessonCount ? `${activeLessonCount} bài` : 'Đang cập nhật'}</span>
                </button>
                <div class="rv-grade-children ${gOpen ? '' : 'hidden'}">
                  ${g.chapters
                    .map((chap) => {
                      const cOpen = state.expandedChapters.has(chap.id);
                      const hasLessons = (chap.lessons?.length || 0) > 0;
                      return `
                        <div class="rv-chap-group ${cOpen ? 'is-open' : ''}">
                          <button
                            type="button"
                            class="rv-chap-btn ${!hasLessons ? 'is-muted' : ''}"
                            data-toggle-chap="${escapeAttr(chap.id)}"
                            aria-expanded="${cOpen}"
                          >
                            <span class="rv-chevron" aria-hidden="true">▸</span>
                            <span class="rv-chap-text">
                              <b>${escapeHtml(chap.code)}:</b> ${escapeHtml(chap.title)}
                            </span>
                            ${!hasLessons ? `<span class="rv-soon-tag">Sắp có</span>` : ''}
                          </button>
                          ${
                            hasLessons
                              ? `
                                <div class="rv-lesson-list ${cOpen ? '' : 'hidden'}">
                                  ${chap.lessons
                                    .map((ls) => {
                                      const isSelected = state.viewMode === 'lesson' && state.activeLessonId === ls.id;
                                      const doneRec = state.progress[ls.id];
                                      return `
                                        <button
                                          type="button"
                                          class="rv-lesson-btn ${isSelected ? 'is-active' : ''}"
                                          data-select-lesson="${escapeAttr(ls.id)}"
                                        >
                                          <span class="rv-lesson-dot ${doneRec ? 'is-done' : ''}" aria-hidden="true">
                                            ${doneRec ? '✓' : ''}
                                          </span>
                                          <span class="rv-lesson-title">
                                            <strong>${escapeHtml(ls.code)}:</strong> ${escapeHtml(ls.title)}
                                          </span>
                                        </button>
                                      `;
                                    })
                                    .join('')}
                                </div>
                              `
                              : ''
                          }
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderCoreCardHtml(card, { showLessonMeta = '' } = {}) {
    const meta = CARD_TYPE_META[card.type] || CARD_TYPE_META.theory;
    const isStarred = state.bookmarks.has(card.id);
    return `
      <section class="rv-editorial-sec ${meta.cls}" id="rv-item-${escapeAttr(card.id)}" data-card-id="${escapeAttr(card.id)}">
        <div class="rv-sec-head">
          <div class="rv-sec-heading-inline">
            <span class="rv-sec-ico ${meta.cls}" aria-hidden="true" title="${escapeAttr(meta.badge)}">${meta.iconSvg}</span>
            <div>
              <h2 class="rv-sec-title">${escapeHtml(card.title)}</h2>
              ${showLessonMeta ? `<div class="rv-card-lesson-crumb">${escapeHtml(showLessonMeta)}</div>` : ''}
            </div>
          </div>
          <button
            type="button"
            class="rv-star-btn ${isStarred ? 'is-starred' : ''}"
            data-star-id="${escapeAttr(card.id)}"
            aria-label="${isStarred ? 'Bỏ lưu Sổ tay' : 'Lưu Sổ tay'}"
            title="${isStarred ? 'Bỏ lưu Sổ tay' : 'Lưu vào Sổ tay'}"
          >
            ${renderStarSvg(isStarred)}
          </button>
        </div>
        <div class="rv-sec-body">
          ${transformRecallMasks(card.content)}
        </div>
      </section>
    `;
  }

  function renderFlipCardHtml(fc, { indexNum = 0, showLessonMeta = '' } = {}) {
    const isFlipped = state.flippedIds.has(fc.id);
    const isStarred = state.bookmarks.has(fc.id);
    const attempt = state.trapAttempts[fc.id] || null;
    const catMeta = TRAP_CATEGORY_META[fc.trapCategory] || TRAP_CATEGORY_META.index;
    const backToneCls = attempt ? (attempt.isCorrect ? 'is-won' : 'is-trapped') : '';
    const frontBadgeTxt = indexNum > 0 ? `Câu ${indexNum}` : 'Thử sức';
    const flipIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    const enterIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`;

    return `
      <div
        class="rv-flip-card ${isFlipped ? 'is-flipped' : ''}"
        id="rv-item-${escapeAttr(fc.id)}"
        data-flip-id="${escapeAttr(fc.id)}"
      >
        <div class="rv-flip-inner">
          <!-- FRONT: Clean Problem + Answer Input (Zero Trap Spoiler!) -->
          <div class="rv-flip-face rv-flip-front">
            <div class="rv-flip-top">
              <span class="rv-flip-badge is-front">${escapeHtml(frontBadgeTxt)}</span>
              <button
                type="button"
                class="rv-star-btn ${isStarred ? 'is-starred' : ''}"
                data-star-id="${escapeAttr(fc.id)}"
                title="${isStarred ? 'Bỏ lưu Sổ tay' : 'Lưu vào Sổ tay'}"
              >${renderStarSvg(isStarred)}</button>
            </div>
            ${showLessonMeta ? `<div class="rv-flip-crumb">${escapeHtml(showLessonMeta)}</div>` : ''}
            <div class="rv-flip-problem"><div class="rv-flip-problem-txt">${fc.problem}</div></div>
            <div class="rv-flip-front-bar">
              <div class="rv-trap-form" data-trap-form="${escapeAttr(fc.id)}">
                <input
                  type="text"
                  class="rv-trap-input"
                  data-trap-inp="${escapeAttr(fc.id)}"
                  placeholder="${escapeAttr(fc.placeholder || 'Nhập đáp án...')}"
                  value="${escapeAttr(attempt?.raw || '')}"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="rv-trap-enter-btn"
                  data-trap-submit="${escapeAttr(fc.id)}"
                  title="Kiểm tra đáp án (Enter)"
                  aria-label="Kiểm tra đáp án"
                >${enterIconSvg}</button>
              </div>
              <button
                type="button"
                class="rv-flip-ico-btn"
                data-flip-btn="${escapeAttr(fc.id)}"
                title="Lật xem mặt sau"
                aria-label="Lật thẻ"
              >${flipIconSvg}</button>
            </div>
          </div>

          <!-- BACK: Full Trap Breakdown (Category Icon + Label, Verdict, Problem, Trap, Fix) -->
          <div class="rv-flip-face rv-flip-back ${backToneCls}">
            <div class="rv-flip-top">
              <span class="rv-trap-cat-badge ${catMeta.cls}">
                ${catMeta.iconSvg}
                <span>${escapeHtml(fc.trapLabel || 'Bẫy hay sai')}</span>
              </span>
              <button
                type="button"
                class="rv-star-btn ${isStarred ? 'is-starred' : ''}"
                data-star-id="${escapeAttr(fc.id)}"
                title="${isStarred ? 'Bỏ lưu Sổ tay' : 'Lưu vào Sổ tay'}"
              >${renderStarSvg(isStarred)}</button>
            </div>

            <div class="rv-trap-verdict-slot" data-verdict-slot="${escapeAttr(fc.id)}">
              ${renderTrapVerdictHtml(attempt)}
            </div>

            <div class="rv-flip-back-body">
              <div class="rv-trap-recap">
                <span class="rv-trap-recap-lbl">Đề:</span> ${fc.problem}
              </div>
              <div class="rv-trap-row is-trap">
                <span class="rv-trap-pill-tag is-trap">Bẫy</span>
                <div class="rv-trap-row-txt">${fc.trapExplanation}</div>
              </div>
              <div class="rv-trap-row is-fix">
                <span class="rv-trap-pill-tag is-fix">Đúng</span>
                <div class="rv-trap-row-txt">${fc.correctExplanation}</div>
              </div>
            </div>

            <div class="rv-flip-foot">
              <button
                type="button"
                class="rv-flip-ico-btn is-back"
                data-flip-btn="${escapeAttr(fc.id)}"
                title="Lật lại mặt trước"
                aria-label="Lật lại mặt trước"
              >${flipIconSvg}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTouch1Html(lesson) {
    return `
      <div class="rv-editorial-flow">
        ${(lesson.coreCards || []).map((c) => renderCoreCardHtml(c)).join('')}
      </div>

      ${
        lesson.flipCards?.length
          ? `
            <section class="rv-pitfalls-section">
              <div class="rv-sec-head" style="margin-bottom:16px;">
                <div class="rv-sec-heading-inline">
                  <span class="rv-sec-ico is-danger" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </span>
                  <h2 class="rv-sec-title">Bẫy hay sai</h2>
                </div>
              </div>
              <div class="rv-flip-grid">
                ${lesson.flipCards.map((fc, idx) => renderFlipCardHtml(fc, { indexNum: idx + 1 })).join('')}
              </div>
            </section>
          `
          : ''
      }
    `;
  }

  function renderTouch2Html(lesson) {
    return `
      <div class="rv-examples-stack">
        ${(lesson.examples || [])
          .map((ex) => {
            const st = state.exampleState[ex.id] || { hint: false, stepCount: 0, answer: false };
            const totalSteps = ex.steps?.length || 0;
            const allOpen = st.hint && st.stepCount >= totalSteps && st.answer;
            const anyOpen = st.hint || st.stepCount > 0 || st.answer;

            return `
              <article class="rv-example-card" id="rv-item-${escapeAttr(ex.id)}" data-ex-card="${escapeAttr(ex.id)}">
                <div class="rv-example-head">
                  <span class="rv-ex-badge">${ex.title}</span>
                  <div class="rv-ex-bulk-btns">
                    ${
                      !allOpen
                        ? `<button type="button" class="btn btn-secondary btn-sm" data-ex-open-all="${escapeAttr(ex.id)}">Mở toàn bộ lời giải</button>`
                        : ''
                    }
                    ${
                      anyOpen
                        ? `<button type="button" class="btn btn-ghost btn-sm" data-ex-collapse="${escapeAttr(ex.id)}">Thu gọn</button>`
                        : ''
                    }
                  </div>
                </div>

                <div class="rv-ex-problem">
                  <strong>Đề bài:</strong> ${ex.problem}
                </div>

                <!-- Progressive Step Controls -->
                <div class="rv-ex-stepper" role="group" aria-label="Mở từng bước lời giải">
                  <button
                    type="button"
                    class="rv-step-pill ${st.hint ? 'is-revealed' : 'is-next'}"
                    data-ex-toggle-hint="${escapeAttr(ex.id)}"
                  >
                    💡 Xem gợi ý
                  </button>
                  ${(ex.steps || [])
                    .map((_, idx) => {
                      const stepNum = idx + 1;
                      const unlocked = st.stepCount >= stepNum;
                      const isNext = !unlocked && st.stepCount === idx;
                      return `
                        <button
                          type="button"
                          class="rv-step-pill ${unlocked ? 'is-revealed' : isNext ? 'is-next' : ''}"
                          data-ex-step="${escapeAttr(ex.id)}"
                          data-step-num="${stepNum}"
                        >
                          Bước ${stepNum}
                        </button>
                      `;
                    })
                    .join('')}
                  <button
                    type="button"
                    class="rv-step-pill ${st.answer ? 'is-revealed is-ans' : st.stepCount >= totalSteps ? 'is-next' : ''}"
                    data-ex-ans="${escapeAttr(ex.id)}"
                  >
                    ✓ Đáp số
                  </button>
                </div>

                <!-- Revealed Panels -->
                <div class="rv-ex-reveals">
                  ${
                    st.hint
                      ? `
                        <div class="rv-ex-hint-box">
                          <strong>💡 Gợi ý hướng đi:</strong> ${ex.hint}
                        </div>
                      `
                      : ''
                  }
                  ${(ex.steps || [])
                    .slice(0, st.stepCount)
                    .map(
                      (stepHtml) => `
                        <div class="rv-ex-step-box">
                          ${stepHtml}
                        </div>
                      `
                    )
                    .join('')}
                  ${
                    st.answer
                      ? `
                        <div class="rv-ex-ans-box">
                          <strong>✓ Đáp số:</strong> ${ex.finalAnswer}
                        </div>
                      `
                      : ''
                  }
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderTouch3Html(lesson) {
    const qz = lesson.quizzes || {};
    const mcs = qz.multipleChoice || [];
    const tfs = qz.trueFalse || [];
    const sas = qz.shortAnswer || [];
    const qState = state.quizState[lesson.id];
    const submitted = qState.submitted;
    const optLetters = ['A', 'B', 'C', 'D'];

    let qCounter = 0;
    const genCfg = lesson.generators?.[0];
    const gSt = state.genState[lesson.id];

    return `
      <div class="rv-quiz-wrap">
        ${
          submitted && qState.summary
            ? `
              <div class="rv-score-banner ${qState.summary.percent >= 80 ? 'is-great' : 'is-review'}">
                <div class="rv-score-main">
                  <div class="rv-score-num">${qState.summary.score10} / 10đ</div>
                  <div>
                    <strong>Hoàn thành bài luyện nhanh ${escapeHtml(lesson.code)}!</strong>
                    <div class="rv-score-sub">Trả lời đúng <strong>${qState.summary.correctItems}/${qState.summary.totalItems}</strong> ý chấm điểm • Tiến độ đã lưu tự động trên thiết bị.</div>
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="btnResetLessonQuiz">Làm lại đề này</button>
              </div>
            `
            : ''
        }

        <!-- Part 1: Multiple Choice -->
        <div class="rv-quiz-part">
          <div class="rv-quiz-part-head">
            <span class="badge badge-p1">Phần I</span>
            <strong>Trắc nghiệm 4 lựa chọn</strong>
          </div>
          ${mcs
            .map((q) => {
              qCounter += 1;
              const picked = qState.mc[q.id];
              const isRight = submitted && picked === q.correctIndex;
              const isWrong = submitted && picked !== q.correctIndex;
              return `
                <div class="rv-q-card ${isRight ? 'is-correct' : isWrong ? 'is-wrong' : ''}">
                  <div class="rv-q-stem">
                    <span class="rv-q-num">Câu ${qCounter}.</span>
                    <span>${q.question}</span>
                  </div>
                  <div class="rv-mc-grid">
                    ${q.options
                      .map((opt, oi) => {
                        const sel = picked === oi;
                        let cls = sel ? 'is-selected' : '';
                        if (submitted) {
                          if (oi === q.correctIndex) cls += ' is-right-opt';
                          else if (sel && oi !== q.correctIndex) cls += ' is-wrong-opt';
                        }
                        return `
                          <button
                            type="button"
                            class="rv-mc-opt ${cls}"
                            data-rv-mc="${escapeAttr(q.id)}"
                            data-opt-idx="${oi}"
                            ${submitted ? 'disabled' : ''}
                          >
                            <span class="rv-mc-letter">${optLetters[oi]}</span>
                            <span class="rv-mc-text">${opt}</span>
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                  ${
                    submitted
                      ? `
                        <div class="rv-q-exp ${isRight ? 'is-ok' : 'is-err'}">
                          <strong>${isRight ? '✓ Chính xác!' : `✗ Chưa đúng — Đáp án đúng là ${optLetters[q.correctIndex]}.`}</strong>
                          <div>${q.explanation}</div>
                        </div>
                      `
                      : ''
                  }
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Part 2: True / False -->
        <div class="rv-quiz-part">
          <div class="rv-quiz-part-head">
            <span class="badge badge-p2">Phần II</span>
            <strong>Trắc nghiệm Đúng / Sai (4 ý a, b, c, d)</strong>
          </div>
          ${tfs
            .map((q) => {
              qCounter += 1;
              const ansMap = qState.tf[q.id] || {};
              return `
                <div class="rv-q-card">
                  <div class="rv-q-stem">
                    <span class="rv-q-num">Câu ${qCounter}.</span>
                    <span>${q.stem}</span>
                  </div>
                  <div class="rv-tf-list">
                    ${q.statements
                      .map((st) => {
                        const userVal = ansMap[st.label]; // true | false | undefined
                        const stRight = submitted && userVal === st.isTrue;
                        const stWrong = submitted && userVal !== st.isTrue;
                        return `
                          <div class="rv-tf-item ${stRight ? 'is-correct' : stWrong ? 'is-wrong' : ''}">
                            <div class="rv-tf-main">
                              <span class="rv-tf-lbl">${escapeHtml(st.label)})</span>
                              <span class="rv-tf-txt">${st.text}</span>
                              <div class="rv-tf-btns">
                                <button
                                  type="button"
                                  class="rv-tf-choice ${userVal === true ? 'is-picked-true' : ''}"
                                  data-rv-tf="${escapeAttr(q.id)}"
                                  data-tf-lbl="${escapeAttr(st.label)}"
                                  data-tf-val="true"
                                  ${submitted ? 'disabled' : ''}
                                >Đúng</button>
                                <button
                                  type="button"
                                  class="rv-tf-choice ${userVal === false ? 'is-picked-false' : ''}"
                                  data-rv-tf="${escapeAttr(q.id)}"
                                  data-tf-lbl="${escapeAttr(st.label)}"
                                  data-tf-val="false"
                                  ${submitted ? 'disabled' : ''}
                                >Sai</button>
                              </div>
                            </div>
                            ${
                              submitted
                                ? `
                                  <div class="rv-tf-exp ${stRight ? 'is-ok' : 'is-err'}">
                                    <strong>${stRight ? '✓ Đúng' : `✗ Đáp án chuẩn: ${st.isTrue ? 'Đúng' : 'Sai'}`}</strong> — ${st.explanation}
                                  </div>
                                `
                                : ''
                            }
                          </div>
                        `;
                      })
                      .join('')}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Part 3: Short Answer -->
        <div class="rv-quiz-part">
          <div class="rv-quiz-part-head">
            <span class="badge badge-p3">Phần III</span>
            <strong>Trắc nghiệm Trả lời ngắn</strong>
          </div>
          ${sas
            .map((q) => {
              qCounter += 1;
              const rawUser = qState.sa[q.id] ?? '';
              const isRight =
                submitted && normalizeShortAnswer(rawUser) === normalizeShortAnswer(q.correctAnswer);
              const isWrong = submitted && !isRight;
              return `
                <div class="rv-q-card ${isRight ? 'is-correct' : isWrong ? 'is-wrong' : ''}">
                  <div class="rv-q-stem">
                    <span class="rv-q-num">Câu ${qCounter}.</span>
                    <span>${q.question}</span>
                  </div>
                  <div class="rv-sa-row">
                    <label class="rv-sa-lbl" for="rv-sa-${escapeAttr(q.id)}">Đáp số của bạn:</label>
                    <input
                      id="rv-sa-${escapeAttr(q.id)}"
                      type="text"
                      inputmode="decimal"
                      class="input-control rv-sa-input"
                      placeholder="Nhập số nguyên hoặc thập phân..."
                      data-rv-sa="${escapeAttr(q.id)}"
                      value="${escapeAttr(rawUser)}"
                      ${submitted ? 'disabled' : ''}
                    />
                  </div>
                  ${
                    submitted
                      ? `
                        <div class="rv-q-exp ${isRight ? 'is-ok' : 'is-err'}">
                          <strong>${isRight ? `✓ Chính xác (${q.correctAnswer})!` : `✗ Chưa đúng — Đáp số chuẩn là: ${escapeHtml(q.correctAnswer)}`}</strong>
                          <div>${q.explanation}</div>
                        </div>
                      `
                      : ''
                  }
                </div>
              `;
            })
            .join('')}
        </div>

        <div class="rv-quiz-submit-bar">
          ${
            !submitted
              ? `<button type="button" class="btn btn-primary btn-lg" id="btnGradeLessonQuiz">Chấm điểm &amp; Xem giải thích</button>`
              : `<button type="button" class="btn btn-secondary" id="btnResetLessonQuizBottom">Làm lại bộ 5 câu này</button>`
          }
        </div>

        <!-- Dynamic Infinite Generator -->
        ${
          genCfg && gSt
            ? `
              <section class="rv-generator-box" id="rvDynamicGenSection">
                <div class="rv-gen-head">
                  <div>
                    <span class="rv-gen-eyebrow">⚡ LUYỆN PHẢN XẠ VÔ HẠN • SINH BÀI TẬP ĐỔI SỐ TỰ ĐỘNG</span>
                    <h3 class="rv-gen-title">${escapeHtml(genCfg.title)}</h3>
                  </div>
                  <span class="rv-streak-pill" title="Chuỗi làm đúng liên tiếp">
                    Chuỗi đúng: <strong>${gSt.streak}</strong>
                  </span>
                </div>

                <div class="rv-gen-problem">
                  ${gSt.item.unitHint ? `<span class="rv-gen-tag">${escapeHtml(gSt.item.unitHint)}</span>` : ''}
                  <div class="rv-gen-prompt">${gSt.item.prompt}</div>
                </div>

                <div class="rv-gen-controls">
                  <input
                    type="text"
                    inputmode="decimal"
                    id="inpGenAnswer"
                    class="input-control rv-gen-input"
                    placeholder="Nhập đáp số rồi nhấn Enter..."
                    value="${escapeAttr(gSt.userInput)}"
                  />
                  <button type="button" class="btn btn-primary" id="btnGenCheck">Kiểm tra</button>
                  <button type="button" class="btn btn-secondary" id="btnGenShowSol">
                    ${gSt.showSol ? 'Ẩn lời giải' : 'Xem lời giải tự động'}
                  </button>
                  <button type="button" class="btn btn-ghost" id="btnGenNext">↻ Làm câu tương tự</button>
                </div>

                ${
                  gSt.checked
                    ? `
                      <div class="rv-gen-feedback ${gSt.isCorrect ? 'is-ok' : 'is-err'}">
                        ${
                          gSt.isCorrect
                            ? `<strong>✓ Tuyệt vời! Đáp số ${escapeHtml(gSt.item.answer)} hoàn toàn chính xác!</strong> Bấm <em>"Làm câu tương tự"</em> để đổi bộ số mới ngay.`
                            : `<strong>✗ Chưa khớp!</strong> Đáp số đúng của câu này là <strong>${escapeHtml(gSt.item.answer)}</strong>. Bạn có thể bấm <em>"Xem lời giải tự động"</em> để kiểm tra từng bước.`
                        }
                      </div>
                    `
                    : ''
                }

                ${
                  gSt.showSol
                    ? `
                      <div class="rv-gen-sol-box">
                        <strong>Lời giải tự động (thay đúng bộ số vừa sinh):</strong>
                        <div style="margin-top:6px;">${gSt.item.solution}</div>
                      </div>
                    `
                    : ''
                }
              </section>
            `
            : ''
        }
      </div>
    `;
  }

  /**
   * Hidden-on-screen worksheet rendered exclusively for `@media print` (Spec §5.2),
   * ensuring A4 printing ALWAYS prints complete unmasked Core Cards + Flip Mistakes + Worked Examples!
   */
  function renderPrintWorksheetHtml(lesson) {
    return `
      <section class="rv-print-worksheet" aria-hidden="true">
        <header class="rv-print-header">
          <div>
            <div class="rv-print-eyebrow">PHIẾU TỔNG HỢP KIẾN THỨC &amp; ÔN TẬP TOÁN THPT — LỚP TOÁN THẦY HOÀNG</div>
            <h1>${escapeHtml(lesson.gradeLabel)} • ${escapeHtml(lesson.chapterCode)}: ${escapeHtml(lesson.chapterTitle)}</h1>
            <h2>${escapeHtml(lesson.code)}: ${escapeHtml(lesson.title)}</h2>
          </div>
        </header>

        <h3 class="rv-print-sec-title">I. SƠ ĐỒ KIẾN THỨC &amp; CÔNG THỨC CỐT LÕI</h3>
        <div class="rv-print-cards">
          ${(lesson.coreCards || [])
            .map((c) => {
              const meta = CARD_TYPE_META[c.type] || CARD_TYPE_META.theory;
              return `
                <div class="rv-print-card ${meta.cls}">
                  <div class="rv-print-card-title">[${escapeHtml(meta.badge)}] ${escapeHtml(c.title)}</div>
                  <div class="rv-print-card-body">${transformRecallMasks(c.content)}</div>
                </div>
              `;
            })
            .join('')}
        </div>

        ${
          lesson.flipCards?.length
            ? `
              <h3 class="rv-print-sec-title">II. BẪY HAY SAI CẦN TRÁNH</h3>
              <div class="rv-print-cards">
                ${lesson.flipCards
                  .map(
                    (fc) => `
                      <div class="rv-print-card is-warning">
                        <div class="rv-print-card-title">${escapeHtml(fc.trapLabel || 'Bẫy hay sai')}</div>
                        <div><strong>• Đề bài:</strong> ${fc.problem}</div>
                        <div style="margin-top:3px;"><strong>• Bẫy dễ mắc:</strong> ${fc.trapExplanation}</div>
                        <div style="margin-top:3px;"><strong>• Lời giải chuẩn:</strong> ${fc.correctExplanation}</div>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }

        ${
          lesson.examples?.length
            ? `
              <h3 class="rv-print-sec-title">III. VÍ DỤ MINH HỌA TỪNG BƯỚC</h3>
              <div class="rv-print-cards">
                ${lesson.examples
                  .map(
                    (ex) => `
                      <div class="rv-print-card is-theory">
                        <div class="rv-print-card-title">${escapeHtml(ex.title)}</div>
                        <div><strong>Đề bài:</strong> ${ex.problem}</div>
                        <div style="margin-top:4px;">${(ex.steps || []).join('<br/>')}</div>
                        <div style="margin-top:4px;"><strong>Đáp số:</strong> ${ex.finalAnswer}</div>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }
      </section>
    `;
  }

  function renderNotebookViewHtml() {
    const starredItems = cardsIndex.filter((it) => state.bookmarks.has(it.id));
    return `
      <div class="rv-lesson-header">
        <div>
          <div class="rv-breadcrumb">SỔ TAY CÁ NHÂN • LƯU TRÊN THIẾT BỊ (LOCALSTORAGE)</div>
          <h1 class="rv-lesson-h1">★ Sổ tay "Kiến thức hay quên" (${starredItems.length})</h1>
          <p class="rv-lesson-desc">
            Gom toàn bộ thẻ công thức, lý thuyết và bẫy sai lầm bạn đã gắn sao <strong>★</strong> từ mọi bài học để ôn cấp tốc 3 phút trước giờ kiểm tra.
          </p>
        </div>
      </div>

      ${
        starredItems.length === 0
          ? `
            <div class="rv-empty-notebook">
              <div class="rv-empty-star" aria-hidden="true">☆</div>
              <h3>Sổ tay của bạn đang trống</h3>
              <p>Khi đọc mục <strong>Kiến thức trọng tâm</strong>, hãy bấm vào ngôi sao <strong>☆</strong> ở góc phải những công thức hoặc lỗi sai bạn thấy dễ nhầm để lưu vào đây nhé!</p>
              <button type="button" class="btn btn-primary" id="btnBackToLessonFromNb">Quay lại bài học đang xem →</button>
            </div>
          `
          : `
            <div class="rv-tabbar-wrap is-notebook-bar">
              <span class="rv-nb-count-note">${starredItems.length} mục</span>
              <div class="rv-tabbar-tools">
                <button
                  type="button"
                  role="switch"
                  aria-checked="${state.activeRecall}"
                  class="rv-tool-icon-btn ${state.activeRecall ? 'is-active' : ''}"
                  id="btnActiveRecallToggle"
                  data-tip="${state.activeRecall ? 'Bỏ che công thức' : 'Che công thức'}"
                  aria-label="Che công thức"
                >
                  ${renderRecallEyeSvg(state.activeRecall)}
                </button>
              </div>
            </div>

            <div class="rv-editorial-flow">
              ${starredItems
                .map((it) => {
                  const jumpBtn = `
                    <div class="rv-nb-jump-row">
                      <button type="button" class="rv-inline-link" data-jump-lesson="${escapeAttr(it.lessonId)}" data-jump-card="${escapeAttr(it.id)}">
                        Xem trong ${escapeHtml(it.lessonLabel)} →
                      </button>
                    </div>
                  `;
                  if (it.kind === 'core') {
                    return `<div class="rv-nb-item-wrap">${renderCoreCardHtml(it.card, { showLessonMeta: it.lessonLabel })}${jumpBtn}</div>`;
                  }
                  if (it.kind === 'flip') {
                    return `<div class="rv-nb-item-wrap" style="padding:18px 0;">${renderFlipCardHtml(it.card, { showLessonMeta: it.lessonLabel })}${jumpBtn}</div>`;
                  }
                  return '';
                })
                .join('')}
            </div>
          `
      }
    `;
  }

  function renderSearchDropdownHtml() {
    const q = state.searchQuery.trim();
    if (!q) return '';
    const normQ = q.toLowerCase();
    const asciiQ = stripAccents(q);

    const matches = cardsIndex
      .filter((item) => item.searchHay.toLowerCase().includes(normQ) || item.searchHay.includes(asciiQ))
      .slice(0, 10);

    if (matches.length === 0) {
      return `
        <div class="rv-search-dropdown">
          <div class="rv-search-empty">Không tìm thấy thẻ kiến thức nào khớp với <strong>"${escapeHtml(q)}"</strong>.</div>
        </div>
      `;
    }

    const badgeMap = {
      theory: { lbl: 'Lý thuyết', cls: 'is-theory' },
      formula: { lbl: 'Công thức', cls: 'is-formula' },
      warning: { lbl: 'Lưu ý', cls: 'is-warning' },
      flip: { lbl: 'Bắt lỗi sai', cls: 'is-warning' },
      example: { lbl: 'Ví dụ', cls: 'is-theory' },
    };

    return `
      <div class="rv-search-dropdown" role="listbox" aria-label="Kết quả tìm kiếm nhanh">
        ${matches
          .map((m) => {
            const b = badgeMap[m.cardType] || badgeMap.theory;
            return `
              <button
                type="button"
                class="rv-search-item"
                data-search-lesson="${escapeAttr(m.lessonId)}"
                data-search-touch="${escapeAttr(m.touchTab)}"
                data-search-card="${escapeAttr(m.id)}"
              >
                <div class="rv-search-item-top">
                  <span class="rv-type-pill ${b.cls}">${escapeHtml(b.lbl)}</span>
                  <strong>${escapeHtml(m.title)}</strong>
                  <span class="rv-search-crumb">${escapeHtml(m.lessonLabel)}</span>
                </div>
                <div class="rv-search-snippet">${escapeHtml(m.snippet)}...</div>
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderLessonViewHtml(lesson) {
    ensureLessonInteractiveState(lesson);
    const lessonIdx = lessonsIndex.findIndex((l) => l.id === lesson.id);
    const prevLesson = lessonIdx > 0 ? lessonsIndex[lessonIdx - 1] : null;
    const nextLesson = lessonIdx >= 0 && lessonIdx < lessonsIndex.length - 1 ? lessonsIndex[lessonIdx + 1] : null;

    return `
      <header class="rv-lesson-header">
        <div class="rv-lesson-head-left">
          <div class="rv-breadcrumb">
            ${escapeHtml(lesson.gradeLabel)} · ${escapeHtml(lesson.chapterCode)}
          </div>
          <h1 class="rv-lesson-h1">${escapeHtml(lesson.code)}: ${escapeHtml(lesson.title)}</h1>
        </div>
      </header>

      <!-- Clean Open Underline Tab Bar + Icon Tools -->
      <div class="rv-tabbar-wrap">
        <div class="rv-touch-tabs" role="tablist" aria-label="Các phần ôn tập">
          <button
            type="button"
            role="tab"
            aria-selected="${state.touchTab === 'touch1'}"
            class="rv-touch-tab ${state.touchTab === 'touch1' ? 'is-active' : ''}"
            data-touch-tab="touch1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span>Kiến thức trọng tâm</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="${state.touchTab === 'touch2'}"
            class="rv-touch-tab ${state.touchTab === 'touch2' ? 'is-active' : ''}"
            data-touch-tab="touch2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            <span>Ví dụ</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="${state.touchTab === 'touch3'}"
            class="rv-touch-tab ${state.touchTab === 'touch3' ? 'is-active' : ''}"
            data-touch-tab="touch3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Luyện nhanh</span>
          </button>
        </div>

        <div class="rv-tabbar-tools">
          ${
            state.touchTab === 'touch1'
              ? `
                ${
                  state.activeRecall
                    ? `
                      <button type="button" class="rv-tool-icon-btn" id="btnRevealAllMasks" data-tip="Hiện tất cả" aria-label="Hiện tất cả">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button type="button" class="rv-tool-icon-btn" id="btnHideAllMasks" data-tip="Úp lại tất cả" aria-label="Úp lại tất cả">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      </button>
                    `
                    : ''
                }
                <button
                  type="button"
                  role="switch"
                  aria-checked="${state.activeRecall}"
                  class="rv-tool-icon-btn ${state.activeRecall ? 'is-active' : ''}"
                  id="btnActiveRecallToggle"
                  data-tip="${state.activeRecall ? 'Bỏ che công thức' : 'Che công thức'}"
                  aria-label="Che công thức"
                >
                  ${renderRecallEyeSvg(state.activeRecall)}
                </button>
              `
              : ''
          }
          <button type="button" class="rv-print-ghost-btn" id="btnPrintWorksheet" data-tip="In phiếu ôn tập" aria-label="In phiếu ôn tập">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            <span>In</span>
          </button>
        </div>
      </div>

      <!-- Active Chạm Content -->
      <div class="rv-touch-stage" id="rvTouchStage">
        ${state.touchTab === 'touch1' ? renderTouch1Html(lesson) : ''}
        ${state.touchTab === 'touch2' ? renderTouch2Html(lesson) : ''}
        ${state.touchTab === 'touch3' ? renderTouch3Html(lesson) : ''}
      </div>

      <!-- Lesson Footer Navigation -->
      <div class="rv-lesson-pager">
        ${
          prevLesson
            ? `<button type="button" class="btn btn-secondary btn-sm" data-select-lesson="${escapeAttr(prevLesson.id)}">← ${escapeHtml(prevLesson.code)}: ${escapeHtml(prevLesson.title)}</button>`
            : `<span></span>`
        }
        ${
          nextLesson
            ? `<button type="button" class="btn btn-primary btn-sm" data-select-lesson="${escapeAttr(nextLesson.id)}">${escapeHtml(nextLesson.code)}: ${escapeHtml(nextLesson.title)} →</button>`
            : ''
        }
      </div>

      ${renderPrintWorksheetHtml(lesson)}
    `;
  }

  function render() {
    if (!rootEl) return;
    const activeLesson = lessonsById.get(state.activeLessonId) || lessonsIndex[0];

    rootEl.innerHTML = `
      <div class="rv-root ${state.activeRecall ? 'is-recall-mode' : ''}">
        <!-- Mobile Drawer Backdrop -->
        <div class="rv-drawer-backdrop ${state.drawerOpen ? 'is-open' : ''}" id="rvDrawerBackdrop"></div>

        <!-- 3-Tier Left Sidebar / Mobile Drawer -->
        <aside class="rv-sidebar ${state.drawerOpen ? 'is-open' : ''}" id="rvSidebar" aria-label="Cây thư mục bài học">
          ${renderSidebarHtml()}
        </aside>

        <!-- Main Review Content Area -->
        <div class="rv-main">
          <!-- Sticky Top Bar: Mobile Menu Trigger + Instant Search -->
          <div class="rv-sticky-topbar">
            <button type="button" class="btn btn-secondary btn-sm rv-mobile-menu-btn" id="btnOpenRvDrawer">
              ☰ Bài học &amp; Sổ tay (${state.bookmarks.size})
            </button>

            <div class="rv-search-box" id="rvSearchBox">
              <svg class="rv-search-ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="search"
                id="rvSearchInput"
                class="rv-search-input"
                placeholder="Tìm công thức, định nghĩa..."
                autocomplete="off"
                value="${escapeAttr(state.searchQuery)}"
              />
              <div id="rvSearchDropdownHost">
                ${renderSearchDropdownHtml()}
              </div>
            </div>
          </div>

          <div class="rv-content-body" id="rvContentBody">
            ${state.viewMode === 'bookmarks' ? renderNotebookViewHtml() : activeLesson ? renderLessonViewHtml(activeLesson) : ''}
          </div>
        </div>
      </div>
    `;

    bindEvents();
    triggerMathRender(rootEl);
  }

  // =========================================================================
  // EVENT BINDINGS
  // =========================================================================

  function jumpToLessonAndCard(lessonId, touchTab = 'touch1', cardId = '') {
    const ls = lessonsById.get(lessonId);
    if (!ls) return;
    state.viewMode = 'lesson';
    state.activeLessonId = lessonId;
    state.touchTab = touchTab || 'touch1';
    state.drawerOpen = false;
    state.searchQuery = '';
    state.expandedGrades.add(ls.grade);
    state.expandedChapters.add(ls.chapterId);
    try {
      window.localStorage.setItem(LS_LAST_LESSON_KEY, lessonId);
    } catch {}
    onRouteChange?.(`/on-tap/${lessonId}`);
    render();

    if (cardId) {
      requestAnimationFrame(() => {
        const target = rootEl.querySelector(`#rv-item-${CSS.escape(cardId)}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('is-flash-target');
          setTimeout(() => target.classList.remove('is-flash-target'), 1600);
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function gradeCurrentQuiz() {
    const lesson = lessonsById.get(state.activeLessonId);
    if (!lesson) return;
    const qState = state.quizState[lesson.id];
    const qz = lesson.quizzes || {};
    let correctItems = 0;
    let totalItems = 0;

    (qz.multipleChoice || []).forEach((q) => {
      totalItems += 1;
      if (qState.mc[q.id] === q.correctIndex) correctItems += 1;
    });

    (qz.trueFalse || []).forEach((q) => {
      const ansMap = qState.tf[q.id] || {};
      (q.statements || []).forEach((st) => {
        totalItems += 1;
        if (ansMap[st.label] === st.isTrue) correctItems += 1;
      });
    });

    (qz.shortAnswer || []).forEach((q) => {
      totalItems += 1;
      if (normalizeShortAnswer(qState.sa[q.id]) === normalizeShortAnswer(q.correctAnswer)) {
        correctItems += 1;
      }
    });

    const percent = totalItems > 0 ? Math.round((correctItems / totalItems) * 100) : 0;
    const score10 = totalItems > 0 ? ((correctItems / totalItems) * 10).toFixed(1).replace('.0', '').replace('.', ',') : '10';

    qState.submitted = true;
    qState.summary = { correctItems, totalItems, percent, score10 };

    state.progress[lesson.id] = {
      correctItems,
      totalItems,
      percent,
      completedAt: new Date().toISOString(),
    };
    persistProgress();
    render();

    const banner = rootEl.querySelector('.rv-score-banner');
    banner?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bindEvents() {
    // Mobile drawer open/close
    rootEl.querySelector('#btnOpenRvDrawer')?.addEventListener('click', () => {
      state.drawerOpen = true;
      rootEl.querySelector('#rvSidebar')?.classList.add('is-open');
      rootEl.querySelector('#rvDrawerBackdrop')?.classList.add('is-open');
    });
    const closeDrawer = () => {
      state.drawerOpen = false;
      rootEl.querySelector('#rvSidebar')?.classList.remove('is-open');
      rootEl.querySelector('#rvDrawerBackdrop')?.classList.remove('is-open');
    };
    rootEl.querySelector('#btnCloseRvDrawer')?.addEventListener('click', closeDrawer);
    rootEl.querySelector('#rvDrawerBackdrop')?.addEventListener('click', closeDrawer);

    // Notebook view
    rootEl.querySelector('#btnOpenNotebook')?.addEventListener('click', () => {
      state.viewMode = 'bookmarks';
      state.drawerOpen = false;
      onRouteChange?.('/on-tap/so-tay');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    rootEl.querySelector('#btnBackToLessonFromNb')?.addEventListener('click', () => {
      state.viewMode = 'lesson';
      onRouteChange?.(`/on-tap/${state.activeLessonId}`);
      render();
    });

    // Tree grade & chapter accordions
    rootEl.querySelectorAll('[data-toggle-grade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const g = Number(btn.dataset.toggleGrade);
        if (state.expandedGrades.has(g)) state.expandedGrades.delete(g);
        else state.expandedGrades.add(g);
        render();
      });
    });

    rootEl.querySelectorAll('[data-toggle-chap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.toggleChap;
        if (state.expandedChapters.has(cid)) state.expandedChapters.delete(cid);
        else state.expandedChapters.add(cid);
        render();
      });
    });

    // Lesson selection
    rootEl.querySelectorAll('[data-select-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => {
        jumpToLessonAndCard(btn.dataset.selectLesson, 'touch1', '');
      });
    });

    rootEl.querySelectorAll('[data-jump-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => {
        jumpToLessonAndCard(btn.dataset.jumpLesson, 'touch1', btn.dataset.jumpCard || '');
      });
    });

    // Instant Search
    const searchInp = rootEl.querySelector('#rvSearchInput');
    const searchHost = rootEl.querySelector('#rvSearchDropdownHost');
    const bindSearchResultClicks = () => {
      searchHost?.querySelectorAll('[data-search-lesson]').forEach((btn) => {
        btn.addEventListener('click', () => {
          jumpToLessonAndCard(
            btn.dataset.searchLesson,
            btn.dataset.searchTouch || 'touch1',
            btn.dataset.searchCard || ''
          );
        });
      });
    };
    bindSearchResultClicks();

    searchInp?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (searchHost) {
        searchHost.innerHTML = renderSearchDropdownHtml();
        bindSearchResultClicks();
      }
    });

    // Print Worksheet button
    rootEl.querySelector('#btnPrintWorksheet')?.addEventListener('click', () => {
      window.print();
    });

    // 3-Chạm tab switching + mobile swipe gesture
    rootEl.querySelectorAll('[data-touch-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.dataset.touchTab;
        if (nextTab && nextTab !== state.touchTab) {
          state.touchTab = nextTab;
          render();
        }
      });
    });

    const stageEl = rootEl.querySelector('#rvTouchStage');
    if (stageEl) {
      let touchStartX = 0;
      let touchStartY = 0;
      let ignoreSwipe = false;
      stageEl.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length !== 1) return;
          const t = e.target;
          ignoreSwipe = Boolean(t.closest?.('.katex-display, input, textarea, .rv-flip-card'));
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        },
        { passive: true }
      );
      stageEl.addEventListener(
        'touchend',
        (e) => {
          if (ignoreSwipe || !e.changedTouches.length) return;
          const dx = e.changedTouches[0].clientX - touchStartX;
          const dy = e.changedTouches[0].clientY - touchStartY;
          if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 2.1) {
            const order = ['touch1', 'touch2', 'touch3'];
            const idx = order.indexOf(state.touchTab);
            const nextIdx = dx < 0 ? idx + 1 : idx - 1;
            if (nextIdx >= 0 && nextIdx < order.length) {
              state.touchTab = order[nextIdx];
              render();
            }
          }
        },
        { passive: true }
      );
    }

    // Active Recall global toggle + individual mask click
    rootEl.querySelector('#btnActiveRecallToggle')?.addEventListener('click', () => {
      state.activeRecall = !state.activeRecall;
      render();
    });

    rootEl.querySelector('#btnRevealAllMasks')?.addEventListener('click', () => {
      rootEl.querySelectorAll('.rv-recall-mask').forEach((el) => el.classList.add('is-revealed'));
    });

    rootEl.querySelector('#btnHideAllMasks')?.addEventListener('click', () => {
      rootEl.querySelectorAll('.rv-recall-mask').forEach((el) => el.classList.remove('is-revealed'));
    });

    rootEl.querySelectorAll('.rv-recall-mask').forEach((maskEl) => {
      const toggleMask = (e) => {
        if (!state.activeRecall) return;
        e.stopPropagation();
        maskEl.classList.toggle('is-revealed');
      };
      maskEl.addEventListener('click', toggleMask);
      maskEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleMask(e);
        }
      });
    });

    // Bookmark Star buttons (update in-place when in lesson mode to avoid losing scroll/flip state)
    rootEl.querySelectorAll('[data-star-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.dataset.starId;
        toggleBookmark(cid);
        if (state.viewMode === 'bookmarks') {
          render();
          return;
        }
        const starred = state.bookmarks.has(cid);
        rootEl.querySelectorAll(`[data-star-id="${CSS.escape(cid)}"]`).forEach((b) => {
          b.classList.toggle('is-starred', starred);
          b.innerHTML = renderStarSvg(starred);
        });
        const badgeEl = rootEl.querySelector('#rvNotebookCount');
        if (badgeEl) badgeEl.textContent = String(state.bookmarks.size);
        const mobBtn = rootEl.querySelector('#btnOpenRvDrawer');
        if (mobBtn) mobBtn.textContent = `☰ Bài học & Sổ tay (${state.bookmarks.size})`;
      });
    });

    // 3D Interactive Trap Flip Cards
    const submitTrapAttempt = (fid, cardEl) => {
      const fc = flipCardsById.get(fid);
      if (!fc || !cardEl) return;
      const inpEl = cardEl.querySelector(`[data-trap-inp="${CSS.escape(fid)}"]`);
      const raw = String(inpEl?.value ?? '').trim();
      if (!raw) {
        const formEl = cardEl.querySelector('.rv-trap-form');
        if (formEl) {
          formEl.classList.remove('is-shake');
          void formEl.offsetWidth;
          formEl.classList.add('is-shake');
        }
        inpEl?.focus();
        return;
      }

      const isCorrect = checkTrapAnswer(fc, raw);
      const attempt = { raw, isCorrect };
      state.trapAttempts[fid] = attempt;

      const backEl = cardEl.querySelector('.rv-flip-back');
      const slotEl = cardEl.querySelector(`[data-verdict-slot="${CSS.escape(fid)}"]`);
      if (slotEl) slotEl.innerHTML = renderTrapVerdictHtml(attempt);
      if (backEl) {
        backEl.classList.toggle('is-won', isCorrect);
        backEl.classList.toggle('is-trapped', !isCorrect);
      }

      inpEl?.blur();
      syncFlipCardHeights(rootEl);

      state.flippedIds.add(fid);
      cardEl.classList.add('is-flipped');
    };

    rootEl.querySelectorAll('[data-trap-form]').forEach((formEl) => {
      formEl.addEventListener('click', (e) => e.stopPropagation());
    });

    rootEl.querySelectorAll('[data-trap-inp]').forEach((inpEl) => {
      const fid = inpEl.dataset.trapInp;
      const cardEl = inpEl.closest('[data-flip-id]');
      inpEl.addEventListener('click', (e) => e.stopPropagation());
      inpEl.addEventListener('input', () => {
        if (state.trapAttempts[fid]) {
          state.trapAttempts[fid].raw = inpEl.value;
        }
      });
      inpEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          submitTrapAttempt(fid, cardEl);
        }
      });
    });

    rootEl.querySelectorAll('[data-trap-submit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fid = btn.dataset.trapSubmit;
        const cardEl = btn.closest('[data-flip-id]');
        submitTrapAttempt(fid, cardEl);
      });
    });

    rootEl.querySelectorAll('[data-flip-btn]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fid = btn.dataset.flipBtn;
        const cardEl = btn.closest('[data-flip-id]');
        if (!fid || !cardEl) return;
        if (state.flippedIds.has(fid)) state.flippedIds.delete(fid);
        else state.flippedIds.add(fid);
        cardEl.classList.toggle('is-flipped', state.flippedIds.has(fid));
      });
    });

    rootEl.querySelectorAll('[data-flip-id]').forEach((cardEl) => {
      cardEl.addEventListener('click', (e) => {
        if (
          e.target.closest?.('[data-star-id]') ||
          e.target.closest?.('[data-trap-form]') ||
          e.target.closest?.('[data-flip-btn]')
        ) {
          return;
        }
        if (window.getSelection?.()?.toString()?.trim()) return;
        const fid = cardEl.dataset.flipId;
        if (state.flippedIds.has(fid)) state.flippedIds.delete(fid);
        else state.flippedIds.add(fid);
        cardEl.classList.toggle('is-flipped', state.flippedIds.has(fid));
      });
    });

    // Chạm 2: Progressive Examples
    rootEl.querySelectorAll('[data-ex-toggle-hint]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exId = btn.dataset.exToggleHint;
        state.exampleState[exId].hint = !state.exampleState[exId].hint;
        render();
      });
    });

    rootEl.querySelectorAll('[data-ex-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exId = btn.dataset.exStep;
        const stepNum = Number(btn.dataset.stepNum) || 1;
        state.exampleState[exId].stepCount = Math.max(state.exampleState[exId].stepCount, stepNum);
        render();
      });
    });

    rootEl.querySelectorAll('[data-ex-ans]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exId = btn.dataset.exAns;
        const lesson = lessonsById.get(state.activeLessonId);
        const ex = lesson?.examples?.find((x) => x.id === exId);
        if (!ex) return;
        state.exampleState[exId].stepCount = ex.steps?.length || 0;
        state.exampleState[exId].answer = true;
        render();
      });
    });

    rootEl.querySelectorAll('[data-ex-open-all]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exId = btn.dataset.exOpenAll;
        const lesson = lessonsById.get(state.activeLessonId);
        const ex = lesson?.examples?.find((x) => x.id === exId);
        if (!ex) return;
        state.exampleState[exId] = {
          hint: true,
          stepCount: ex.steps?.length || 0,
          answer: true,
        };
        render();
      });
    });

    rootEl.querySelectorAll('[data-ex-collapse]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exId = btn.dataset.exCollapse;
        state.exampleState[exId] = { hint: false, stepCount: 0, answer: false };
        render();
      });
    });

    // Chạm 3: Quiz Interactions
    const curLesson = lessonsById.get(state.activeLessonId);
    const curQuizState = curLesson ? state.quizState[curLesson.id] : null;

    if (curLesson && curQuizState) {
      rootEl.querySelectorAll('[data-rv-mc]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (curQuizState.submitted) return;
          const qId = btn.dataset.rvMc;
          curQuizState.mc[qId] = Number(btn.dataset.optIdx);
          btn.closest('.rv-mc-grid')?.querySelectorAll('[data-rv-mc]').forEach((b) => {
            b.classList.toggle('is-selected', b === btn);
          });
        });
      });

      rootEl.querySelectorAll('[data-rv-tf]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (curQuizState.submitted) return;
          const qId = btn.dataset.rvTf;
          const lbl = btn.dataset.tfLbl;
          const val = btn.dataset.tfVal === 'true';
          if (!curQuizState.tf[qId]) curQuizState.tf[qId] = {};
          curQuizState.tf[qId][lbl] = val;
          const row = btn.closest('.rv-tf-btns');
          row?.querySelectorAll('[data-rv-tf]').forEach((b) => {
            b.classList.toggle('is-picked-true', b === btn && val === true);
            b.classList.toggle('is-picked-false', b === btn && val === false);
          });
        });
      });

      rootEl.querySelectorAll('[data-rv-sa]').forEach((inp) => {
        inp.addEventListener('input', () => {
          if (curQuizState.submitted) return;
          curQuizState.sa[inp.dataset.rvSa] = inp.value;
        });
      });

      rootEl.querySelector('#btnGradeLessonQuiz')?.addEventListener('click', gradeCurrentQuiz);

      const resetQuiz = () => {
        state.quizState[curLesson.id] = { mc: {}, tf: {}, sa: {}, submitted: false, summary: null };
        render();
      };
      rootEl.querySelector('#btnResetLessonQuiz')?.addEventListener('click', resetQuiz);
      rootEl.querySelector('#btnResetLessonQuizBottom')?.addEventListener('click', resetQuiz);
    }

    // Chạm 3: Dynamic Generator
    const gSt = curLesson ? state.genState[curLesson.id] : null;
    const genCfg = curLesson?.generators?.[0];
    if (curLesson && gSt && genCfg) {
      const genInp = rootEl.querySelector('#inpGenAnswer');
      const checkGen = () => {
        const raw = (genInp?.value ?? gSt.userInput).trim();
        if (!raw) {
          showToast?.('Hãy nhập đáp số trước khi kiểm tra nhé!', 'info');
          genInp?.focus();
          return;
        }
        gSt.userInput = raw;
        const ok = normalizeShortAnswer(raw) === normalizeShortAnswer(gSt.item.answer);
        if (!gSt.checked) {
          gSt.streak = ok ? gSt.streak + 1 : 0;
        } else if (ok && !gSt.isCorrect) {
          gSt.streak += 1;
        }
        gSt.checked = true;
        gSt.isCorrect = ok;
        render();
      };

      genInp?.addEventListener('input', (e) => {
        gSt.userInput = e.target.value;
      });
      genInp?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkGen();
        }
      });

      rootEl.querySelector('#btnGenCheck')?.addEventListener('click', checkGen);
      rootEl.querySelector('#btnGenShowSol')?.addEventListener('click', () => {
        gSt.showSol = !gSt.showSol;
        render();
      });
      rootEl.querySelector('#btnGenNext')?.addEventListener('click', () => {
        gSt.item = genCfg.generate();
        gSt.userInput = '';
        gSt.checked = false;
        gSt.isCorrect = false;
        gSt.showSol = false;
        render();
        rootEl.querySelector('#inpGenAnswer')?.focus();
      });
    }
  }

  return {
    init(routeOpts = null) {
      if (routeOpts?.subRoute === 'so-tay') {
        state.viewMode = 'bookmarks';
      } else if (routeOpts?.subRoute && lessonsById.has(routeOpts.subRoute)) {
        const ls = lessonsById.get(routeOpts.subRoute);
        state.viewMode = 'lesson';
        state.activeLessonId = ls.id;
        state.expandedGrades.add(ls.grade);
        state.expandedChapters.add(ls.chapterId);
      }
      if (!resizeObserverCleanup) {
        const onResize = () => syncFlipCardHeights(rootEl);
        window.addEventListener('resize', onResize, { passive: true });
        resizeObserverCleanup = () => window.removeEventListener('resize', onResize);
      }
      state.mounted = true;
      render();
    },
  };
}
