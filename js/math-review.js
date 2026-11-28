import { REVIEW_CURRICULUM, DEFAULT_BOX_PRESETS } from './review-data.js?v=20261128h';
import { escapeHtml, escapeAttr, formatShortAnswerSlots } from './exam-engine.js?v=20261127p';
import { getParametricShortAnswerPool, generateRandomFromShortAnswers } from './review-param.js?v=20261128c';
import {
  renderBoxIconSvg,
  deriveBoxColorsFromHex,
  resolveBoxPreset,
  ensureCoreCardItems,
  friendlyInlineToHtml,
  parseItemForFriendlyEdit,
  buildItemHtmlFromFriendly,
  renderEditorCommandBarHtml,
  renderBoxPresetManagerHtml,
  renderLessonMetaEditorHtml,
  renderTouch1EditorHtml,
  renderTouch3EditorHtml,
  applyTextareaSnippet,
} from './math-review-editor.js?v=20261128h';

const LS_BOOKMARKS_KEY = 'math_review_bookmarks';
const LS_PROGRESS_KEY = 'math_review_progress';
const LS_LAST_LESSON_KEY = 'math_review_last_lesson';

function genReviewId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function deepCloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cloneCurriculumWithGenerators(
  grades,
  builtinGeneratorsMap,
  builtinCoreCardsMap = null,
  builtinFlipCardsMap = null,
  builtinLessonsMap = null,
  savedVersion = 2
) {
  return (grades || []).map((g) => ({
    grade: Number(g.grade),
    label: String(g.label || `Toán ${g.grade}`),
    chapters: (g.chapters || []).map((c) => ({
      id: String(c.id || genReviewId('chap')),
      grade: Number(c.grade || g.grade),
      code: String(c.code || 'Chương'),
      title: String(c.title || 'Chương mới'),
      comingSoon: Boolean(c.comingSoon && !(c.lessons?.length)),
      lessons: (c.lessons || []).map((ls) => {
        const cloned = deepCloneJson({
          id: ls.id || genReviewId('ls'),
          code: ls.code || 'Bài mới',
          title: ls.title || 'Chưa đặt tên',
          summary: ls.summary || '',
          coreCards: Array.isArray(ls.coreCards) ? ls.coreCards : [],
          flipCards: Array.isArray(ls.flipCards) ? ls.flipCards : [],
          examples: Array.isArray(ls.examples) ? ls.examples : [],
          quizzes: {
            multipleChoice: Array.isArray(ls.quizzes?.multipleChoice) ? ls.quizzes.multipleChoice : [],
            trueFalse: Array.isArray(ls.quizzes?.trueFalse) ? ls.quizzes.trueFalse : [],
            shortAnswer: Array.isArray(ls.quizzes?.shortAnswer) ? ls.quizzes.shortAnswer : [],
          },
        });
        // Non-destructively upgrade saved built-in coreCards:
        // 1) Migrate legacy `content`-only cards to `items[]`
        // 2) Attach newly added built-in Speech Cloud examples & case tones when missing
        // 3) For v1 saves (before Dãy số & CSN unification), merge newly added built-in items/cards
        if (builtinCoreCardsMap) {
          cloned.coreCards.forEach((card) => {
            const items = Array.isArray(card.items) ? card.items : ensureCoreCardItems(card);
            const builtin = builtinCoreCardsMap.get(card.id);
            if (builtin && Array.isArray(builtin.items)) {
              const byItemId = new Map(builtin.items.map((bi) => [bi.id, bi]));
              items.forEach((it, idx) => {
                const bIt = byItemId.get(it.id) || builtin.items[idx];
                const hasSavedEx = Boolean(it.hasExample && it.example && (it.example.problem || it.example.solution));
                if (bIt && bIt.hasExample && bIt.example && !hasSavedEx && savedVersion < 2) {
                  it.hasExample = true;
                  it.example = deepCloneJson(bIt.example);
                }
                if (
                  savedVersion < 2 &&
                  card.id === 'b1-card-2' &&
                  idx === 2 &&
                  bIt &&
                  typeof it.html === 'string' &&
                  !it.html.includes('is-up')
                ) {
                  it.html = bIt.html;
                }
              });
              if (savedVersion < 2 && builtin.items.length > items.length) {
                builtin.items.slice(items.length).forEach((bIt) => {
                  items.push(deepCloneJson(bIt));
                });
              }
            }
          });
        }
        if (savedVersion < 2 && builtinLessonsMap) {
          const bLs = builtinLessonsMap.get(cloned.id);
          if (bLs && Array.isArray(bLs.coreCards)) {
            const existingCardIds = new Set(cloned.coreCards.map((cc) => cc.id));
            bLs.coreCards.forEach((bCard) => {
              if (bCard?.id && !existingCardIds.has(bCard.id)) {
                cloned.coreCards.push(deepCloneJson(bCard));
              }
            });
          }
        }
        // Upgrade legacy plain-text built-in trapLabels to LaTeX `$...$` format when unchanged
        if (builtinFlipCardsMap) {
          cloned.flipCards.forEach((fc) => {
            const bFc = builtinFlipCardsMap.get(fc.id);
            if (bFc && bFc.trapLabel && bFc.trapLabel.includes('$') && fc.trapLabel && !fc.trapLabel.includes('$')) {
              fc.trapLabel = bFc.trapLabel;
            }
          });
        }
        // Hydrate built-in parametric specs onto saved built-in short-answer questions when missing
        if (builtinLessonsMap) {
          const bLs = builtinLessonsMap.get(cloned.id);
          const bSas = bLs?.quizzes?.shortAnswer || [];
          if (bSas.length) {
            const bySaId = new Map(bSas.map((s) => [s.id, s]));
            (cloned.quizzes.shortAnswer || []).forEach((sa, idx) => {
              const bSa = bySaId.get(sa.id) || bSas[idx];
              if (bSa?.paramSpec && !sa.paramSpec) {
                sa.paramSpec = deepCloneJson(bSa.paramSpec);
              }
            });
          }
        }
        const gens = builtinGeneratorsMap.get(cloned.id);
        if (gens?.length) cloned.generators = gens;
        return cloned;
      }),
    })),
  }));
}

function serializeCurriculumForServer(grades) {
  return (grades || []).map((g) => ({
    grade: Number(g.grade),
    label: String(g.label || `Toán ${g.grade}`),
    chapters: (g.chapters || []).map((c) => ({
      id: c.id,
      grade: Number(c.grade || g.grade),
      code: c.code,
      title: c.title,
      comingSoon: !(c.lessons && c.lessons.length > 0),
      lessons: (c.lessons || []).map((ls) => ({
        id: ls.id,
        code: ls.code,
        title: ls.title,
        summary: ls.summary || '',
        coreCards: ls.coreCards || [],
        flipCards: ls.flipCards || [],
        examples: ls.examples || [],
        quizzes: {
          multipleChoice: ls.quizzes?.multipleChoice || [],
          trueFalse: ls.quizzes?.trueFalse || [],
          shortAnswer: ls.quizzes?.shortAnswer || [],
        },
      })),
    })),
  }));
}

function mergeBoxPresets(savedPresets) {
  const defaults = deepCloneJson(DEFAULT_BOX_PRESETS);
  if (!Array.isArray(savedPresets) || !savedPresets.length) return defaults;
  const byId = new Map(savedPresets.map((p) => [p.id, p]));
  const merged = defaults.map((d) => {
    const ov = byId.get(d.id);
    return ov ? { ...d, ...ov, builtin: true } : d;
  });
  savedPresets.forEach((p) => {
    if (p && p.id && !merged.some((m) => m.id === p.id)) {
      merged.push({
        ...deriveBoxColorsFromHex(p.accent || '#2563eb'),
        ...p,
        builtin: false,
      });
    }
  });
  return merged;
}

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
      <span class="rv-trap-mark is-won" title="Chúc mừng! Bạn không mắc bẫy">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Đúng · <b>${escapeHtml(attempt.raw)}</b></span>
      </span>
    `;
  }
  return `
    <span class="rv-trap-mark is-trapped" title="Bạn đã mắc bẫy với đáp án này">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <span>Mắc bẫy · <b>${escapeHtml(attempt.raw)}</b></span>
    </span>
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

export function createMathReviewController({ rootEl, uiHelpers, api, getUser, onRouteChange }) {
  const { showToast, renderMath, openModal, closeModal } = uiHelpers;
  const isAdmin = () => getUser?.()?.role === 'admin';
  let planCatalogCache = null;

  async function ensurePlanCatalog() {
    if (planCatalogCache) return planCatalogCache;
    if (!api?.getReviewPlanCatalog) return null;
    try {
      const res = await api.getReviewPlanCatalog();
      if (res && res.grades) {
        planCatalogCache = res.grades;
        return planCatalogCache;
      }
    } catch {
      // fallback silently to manual entry
    }
    return null;
  }

  function normCatalogKey(str) {
    return stripAccents(String(str || ''))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function createEmptyLessonObj(gradeNum, code, title) {
    return {
      id: genReviewId(`toan${gradeNum}-b`),
      code: String(code || 'Bài mới').trim(),
      title: String(title || 'Bài học mới').trim(),
      summary: '',
      coreCards: [
        {
          id: genReviewId('card'),
          type: 'theory',
          title: 'Định nghĩa & Khái niệm cơ bản',
          items: [
            {
              id: genReviewId('item'),
              html: '<strong>Ý chính:</strong> Nhập nội dung lý thuyết và công thức $...$ tại đây.',
              hasExample: false,
              example: null,
            },
          ],
        },
      ],
      flipCards: [],
      examples: [],
      quizzes: { multipleChoice: [], trueFalse: [], shortAnswer: [] },
    };
  }

  // Preserve built-in dynamic generators (JS functions) & built-in per-line examples for legacy migration
  const builtinGeneratorsMap = new Map();
  const builtinCoreCardsMap = new Map();
  const builtinFlipCardsMap = new Map();
  const builtinLessonsMap = new Map();
  REVIEW_CURRICULUM.forEach((g) => {
    (g.chapters || []).forEach((c) => {
      (c.lessons || []).forEach((ls) => {
        if (ls?.id) builtinLessonsMap.set(ls.id, ls);
        if (ls.generators?.length) builtinGeneratorsMap.set(ls.id, ls.generators);
        (ls.coreCards || []).forEach((card) => {
          if (card?.id) builtinCoreCardsMap.set(card.id, card);
        });
        (ls.flipCards || []).forEach((fc) => {
          if (fc?.id) builtinFlipCardsMap.set(fc.id, fc);
        });
      });
    });
  });

  let curriculum = cloneCurriculumWithGenerators(
    REVIEW_CURRICULUM,
    builtinGeneratorsMap,
    builtinCoreCardsMap,
    builtinFlipCardsMap,
    builtinLessonsMap,
    2
  );
  let boxPresets = deepCloneJson(DEFAULT_BOX_PRESETS);

  // Flattened lookup indexes (rebuilt whenever curriculum changes)
  let lessonsIndex = [];
  let lessonsById = new Map();
  let flipCardsById = new Map();
  let cardsIndex = [];

  function rebuildIndexes() {
    lessonsIndex = [];
    lessonsById = new Map();
    flipCardsById = new Map();
    cardsIndex = [];

    curriculum.forEach((gradeObj) => {
      (gradeObj.chapters || []).forEach((chap) => {
        (chap.lessons || []).forEach((lesson) => {
          const enriched = {
            ...lesson,
            _raw: lesson,
            _chapter: chap,
            _gradeObj: gradeObj,
            grade: gradeObj.grade,
            gradeLabel: gradeObj.label,
            chapterId: chap.id,
            chapterCode: chap.code,
            chapterTitle: chap.title,
          };
          lessonsIndex.push(enriched);
          lessonsById.set(lesson.id, enriched);

          (lesson.coreCards || []).forEach((c) => {
            const items = ensureCoreCardItems(c);
            const itemsText = items
              .map((it) => `${it.html || ''} ${it.hasExample && it.example ? `${it.example.title || ''} ${it.example.problem || ''} ${it.example.solution || ''}` : ''}`)
              .join(' ');
            const plain = stripHtmlAndTags(`${c.title} ${itemsText}`);
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
        });
      });
    });
  }

  rebuildIndexes();

  const defaultLessonId =
    lessonsIndex.find((l) => (l.coreCards?.length || 0) > 0)?.id || lessonsIndex[0]?.id || '';
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
    serverLoaded: false,
    viewMode: 'lesson', // 'lesson' | 'bookmarks'
    editMode: false,
    isDirty: false,
    isSaving: false,
    showPresetManager: false,
    draftPreset: { name: '', accent: '#2563eb', icon: 'star', style: 'tinted' },
    collapsedEditNodes: new Set(),
    openExampleClouds: new Set(),
    activeLessonId: savedLastLesson,
    touchTab: 'touch1', // 'touch1' | 'touch3'
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

  function markDirty() {
    state.isDirty = true;
    const badge = rootEl?.querySelector('.rv-ed-dirty-badge');
    if (badge) {
      badge.classList.add('is-dirty');
      badge.classList.remove('is-saved');
      badge.textContent = '● Có thay đổi chưa lưu';
    }
  }

  function mergeOfficialCurriculumScaffold(savedGrades, builtinGrades) {
    const out = [];
    const savedByGrade = new Map((savedGrades || []).map((g) => [Number(g.grade), g]));

    (builtinGrades || []).forEach((bGrade) => {
      const sGrade = savedByGrade.get(Number(bGrade.grade));
      if (!sGrade) {
        out.push(deepCloneJson(bGrade));
        return;
      }

      const savedChaps = Array.isArray(sGrade.chapters) ? sGrade.chapters : [];
      const usedSavedChapIdxs = new Set();
      const mergedChaps = [];

      (bGrade.chapters || []).forEach((bChap) => {
        const bCodeKey = normCatalogKey(bChap.code);
        const sIdx = savedChaps.findIndex(
          (sc, idx) =>
            !usedSavedChapIdxs.has(idx) &&
            (sc.id === bChap.id || normCatalogKey(sc.code) === bCodeKey)
        );
        if (sIdx < 0) {
          // Chapter missing from cloud save -> add official empty scaffold structure
          mergedChaps.push(deepCloneJson(bChap));
          return;
        }
        usedSavedChapIdxs.add(sIdx);
        const sChap = deepCloneJson(savedChaps[sIdx]);
        const sLessons = Array.isArray(sChap.lessons) ? sChap.lessons : [];
        const usedSavedLsIdxs = new Set();
        const mergedLessons = [];

        (bChap.lessons || []).forEach((bLs) => {
          const bTitleKey = normCatalogKey(bLs.title);
          const bCodeLsKey = normCatalogKey(bLs.code);
          const lIdx = sLessons.findIndex(
            (sl, idx) =>
              !usedSavedLsIdxs.has(idx) &&
              (sl.id === bLs.id ||
                normCatalogKey(sl.title) === bTitleKey ||
                (bTitleKey && normCatalogKey(sl.title).startsWith(bTitleKey)) ||
                normCatalogKey(sl.code) === bCodeLsKey)
          );
          if (lIdx >= 0) {
            usedSavedLsIdxs.add(lIdx);
            // Keep 100% of teacher-saved content, only align official lesson code when built-in Toán 11 C2
            const kept = sLessons[lIdx];
            if (bLs.id === 'toan11-c2-b1' || bLs.id === 'toan11-c2-b2' || bLs.id === 'toan11-c2-b3') {
              kept.code = bLs.code;
            }
            mergedLessons.push(kept);
          } else {
            // Lesson missing -> add empty scaffold entry (structure only, zero prefilled content!)
            mergedLessons.push({
              id: bLs.id,
              code: bLs.code,
              title: bLs.title,
              summary: '',
              coreCards: [],
              flipCards: [],
              examples: [],
              quizzes: { multipleChoice: [], trueFalse: [], shortAnswer: [] },
            });
          }
        });

        // Keep any extra custom lessons teacher created inside this chapter
        sLessons.forEach((sl, idx) => {
          if (!usedSavedLsIdxs.has(idx)) mergedLessons.push(sl);
        });

        sChap.lessons = mergedLessons;
        sChap.comingSoon = mergedLessons.length === 0;
        mergedChaps.push(sChap);
      });

      // Keep any extra custom chapters teacher created in this grade
      savedChaps.forEach((sc, idx) => {
        if (!usedSavedChapIdxs.has(idx)) mergedChaps.push(deepCloneJson(sc));
      });

      out.push({
        grade: Number(bGrade.grade),
        label: sGrade.label || bGrade.label,
        chapters: mergedChaps,
      });
    });

    return out;
  }

  async function loadCurriculumFromServer() {
    if (state.serverLoaded || !api?.getReviewCurriculum) return;
    state.serverLoaded = true;
    try {
      const res = await api.getReviewCurriculum();
      const rc = res?.reviewCurriculum;
      if (rc && Array.isArray(rc.grades) && rc.grades.length > 0) {
        const savedVer = Number(rc.version || 1);
        let hydrated = cloneCurriculumWithGenerators(
          rc.grades,
          builtinGeneratorsMap,
          builtinCoreCardsMap,
          builtinFlipCardsMap,
          builtinLessonsMap,
          savedVer
        );
        if (savedVer < 3) {
          hydrated = mergeOfficialCurriculumScaffold(hydrated, REVIEW_CURRICULUM);
        }
        curriculum = hydrated;
        boxPresets = mergeBoxPresets(rc.boxPresets);
        rebuildIndexes();
        if (!lessonsById.has(state.activeLessonId)) {
          state.activeLessonId =
            lessonsIndex.find((l) => (l.coreCards?.length || 0) > 0)?.id || lessonsIndex[0]?.id || '';
        }
        if (state.mounted) render();
      }
    } catch {
      // keep built-in default curriculum silently
    }
  }

  async function saveCurriculumToServer() {
    if (!isAdmin() || !api?.saveReviewCurriculum || state.isSaving) return;
    state.isSaving = true;
    render();
    try {
      const payload = {
        version: 3,
        boxPresets,
        grades: serializeCurriculumForServer(curriculum),
      };
      await api.saveReviewCurriculum(payload);
      state.isDirty = false;
      rebuildIndexes();
      showToast?.('Đã lưu toàn bộ nội dung Ôn tập lên máy chủ!', 'success');
    } catch (err) {
      showToast?.(err?.message || 'Không thể lưu dữ liệu Ôn tập.', 'error');
    } finally {
      state.isSaving = false;
      render();
    }
  }

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
    const paramPool = getParametricShortAnswerPool(lesson);
    if (!state.genState[lesson.id] && paramPool.length > 0) {
      const firstItem = generateRandomFromShortAnswers(lesson);
      if (firstItem) {
        state.genState[lesson.id] = {
          item: firstItem,
          userInput: '',
          checked: false,
          isCorrect: false,
          showSol: false,
          streak: 0,
        };
      }
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

  /**
   * Keep every inline KaTeX formula atomically grouped with any immediate trailing punctuation
   * (., ; : ? ! )) so formulas NEVER split mid-expression (`u_{n+1} -` / `u_n`) or orphan punctuation!
   */
  function groupInlineMathAtoms(scopeEl) {
    const el = scopeEl || rootEl;
    if (!el) return;
    el.querySelectorAll('.katex').forEach((kEl) => {
      if (kEl.closest('.katex-display') || kEl.closest('.rv-math-atom')) return;
      const parent = kEl.parentNode;
      if (!parent) return;

      const atom = document.createElement('span');
      atom.className = 'rv-math-atom';
      parent.insertBefore(atom, kEl);
      atom.appendChild(kEl);

      // Pull immediate leading opening bracket (`(`, `[`) into the same unbroken atom
      const prev = atom.previousSibling;
      if (prev && prev.nodeType === Node.TEXT_NODE && prev.nodeValue) {
        const pm = prev.nodeValue.match(/([(\[]+)$/);
        if (pm) {
          prev.nodeValue = prev.nodeValue.slice(0, prev.nodeValue.length - pm[1].length);
          atom.insertBefore(document.createTextNode(pm[1]), atom.firstChild);
        }
      }

      // Pull immediate trailing punctuation (e.g. `.`, `,`, `;`, `)`, `:`, `?`) into the same unbroken atom
      const next = atom.nextSibling;
      if (next && next.nodeType === Node.TEXT_NODE && next.nodeValue) {
        const m = next.nodeValue.match(/^([.,;:?!)\]]+)/);
        if (m) {
          atom.appendChild(document.createTextNode(m[1]));
          next.nodeValue = next.nodeValue.slice(m[1].length);
        }
      }

      // Safety check: only allow wrapping if an unusually long inline formula overflows narrow mobile screens
      const box = atom.closest('.rv-flip-problem-txt, .rv-sec-body, .rv-trap-recap, .rv-trap-row-txt, .rv-ex-problem, .rv-q-stem');
      if (box && box.clientWidth > 60 && atom.getBoundingClientRect().width > box.clientWidth - 4) {
        atom.classList.add('is-allow-wrap');
      }
    });
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
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
            ignoredClasses: ['rv-ed-fmt-bar', 'rv-ed-sub', 'rv-ed-snippet'],
            throwOnError: false,
          });
        } catch {
          // ignore KaTeX parse errors
        }
      } else {
        renderMath?.(el);
      }
      groupInlineMathAtoms(el);
      syncFlipCardHeights(el);
      requestAnimationFrame(() => syncFlipCardHeights(el));
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => syncFlipCardHeights(el)).catch(() => {});
      }
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

    const measureCard = (card) => {
      const inner = card.querySelector('.rv-flip-inner');
      const front = card.querySelector('.rv-flip-front');
      const back = card.querySelector('.rv-flip-back');
      if (!front || !back) return 224;
      if (inner) inner.style.minHeight = '';
      front.style.height = 'auto';
      back.style.height = 'auto';
      const fh = Math.ceil(Math.max(front.scrollHeight, front.getBoundingClientRect().height));
      const bh = Math.ceil(Math.max(back.scrollHeight, back.getBoundingClientRect().height));
      return Math.max(fh, bh, 224) + 6;
    };

    host.querySelectorAll('.rv-flip-grid').forEach((grid) => {
      const cards = Array.from(grid.querySelectorAll('.rv-flip-card'));
      cards.forEach((c) => handled.add(c));
      const heights = cards.map(measureCard);
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
      const h = measureCard(card);
      const inner = card.querySelector('.rv-flip-inner');
      const front = card.querySelector('.rv-flip-front');
      const back = card.querySelector('.rv-flip-back');
      if (inner) inner.style.minHeight = `${h}px`;
      if (front) front.style.height = `${h}px`;
      if (back) back.style.height = `${h}px`;
    });
  }

  function triggerCardWrongShake(cardEl) {
    if (!cardEl || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    cardEl.classList.remove('is-wrong-shake');
    void cardEl.offsetWidth;
    cardEl.classList.add('is-wrong-shake');
    setTimeout(() => cardEl.classList.remove('is-wrong-shake'), 520);
  }

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================

  function renderSidebarHtml() {
    const bmCount = state.bookmarks.size;
    const editingTree = state.editMode && isAdmin();
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

        <div class="rv-tree-heading">
          <span>CHƯƠNG TRÌNH TOÁN THPT</span>
          ${editingTree ? `<span class="rv-tree-ed-pill">Đang sửa</span>` : ''}
        </div>

        <div class="rv-tree">
          ${curriculum.map((g, gIdx) => {
            const gOpen = state.expandedGrades.has(g.grade);
            const activeLessonCount = (g.chapters || []).reduce((acc, c) => acc + (c.lessons?.length || 0), 0);
            return `
              <div class="rv-grade-group ${gOpen ? 'is-open' : ''}">
                <div class="rv-tree-row">
                  <button type="button" class="rv-grade-btn" data-toggle-grade="${g.grade}" aria-expanded="${gOpen}">
                    <span class="rv-chevron" aria-hidden="true">▸</span>
                    <span class="rv-grade-lbl">${escapeHtml(g.label)}</span>
                    <span class="rv-grade-meta">${activeLessonCount ? `${activeLessonCount} bài` : 'Đang cập nhật'}</span>
                  </button>
                </div>
                <div class="rv-grade-children ${gOpen ? '' : 'hidden'}">
                  ${(g.chapters || [])
                    .map((chap, cIdx) => {
                      const cOpen = state.expandedChapters.has(chap.id);
                      const hasLessons = (chap.lessons?.length || 0) > 0;
                      return `
                        <div class="rv-chap-group ${cOpen ? 'is-open' : ''}">
                          <div class="rv-tree-row">
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
                              ${!hasLessons && !editingTree ? `<span class="rv-soon-tag">Sắp có</span>` : ''}
                            </button>
                            ${
                              editingTree
                                ? `
                                  <div class="rv-tree-mini-acts">
                                    <button type="button" class="rv-tree-act" data-ed-chap-rename="${gIdx}:${cIdx}" title="Đổi tên chương">✎</button>
                                    <button type="button" class="rv-tree-act" data-ed-lesson-add="${gIdx}:${cIdx}" title="Thêm bài học">+</button>
                                    <button type="button" class="rv-tree-act is-del" data-ed-chap-del="${gIdx}:${cIdx}" title="Xóa chương">×</button>
                                  </div>
                                `
                                : ''
                            }
                          </div>
                          ${
                            hasLessons || editingTree
                              ? `
                                <div class="rv-lesson-list ${cOpen ? '' : 'hidden'}">
                                  ${(chap.lessons || [])
                                    .map((ls, lIdx) => {
                                      const isSelected = state.viewMode === 'lesson' && state.activeLessonId === ls.id;
                                      return `
                                        <div class="rv-tree-row">
                                          <button
                                            type="button"
                                            class="rv-lesson-btn ${isSelected ? 'is-active' : ''}"
                                            data-select-lesson="${escapeAttr(ls.id)}"
                                          >
                                            <span class="rv-lesson-title">
                                              <strong>${escapeHtml(ls.code)}:</strong> ${escapeHtml(ls.title)}
                                            </span>
                                          </button>
                                          ${
                                            editingTree
                                              ? `
                                                <div class="rv-tree-mini-acts">
                                                  <button type="button" class="rv-tree-act" data-ed-lesson-move="${gIdx}:${cIdx}:${lIdx}:-1" ${lIdx === 0 ? 'disabled' : ''} title="Lên">↑</button>
                                                  <button type="button" class="rv-tree-act" data-ed-lesson-move="${gIdx}:${cIdx}:${lIdx}:1" ${lIdx === chap.lessons.length - 1 ? 'disabled' : ''} title="Xuống">↓</button>
                                                  <button type="button" class="rv-tree-act is-del" data-ed-lesson-del="${gIdx}:${cIdx}:${lIdx}" title="Xóa bài">×</button>
                                                </div>
                                              `
                                              : ''
                                          }
                                        </div>
                                      `;
                                    })
                                    .join('')}
                                  ${
                                    editingTree
                                      ? `<button type="button" class="rv-tree-add-btn" data-ed-lesson-add="${gIdx}:${cIdx}">+ Thêm bài học mới</button>`
                                      : ''
                                  }
                                </div>
                              `
                              : ''
                          }
                        </div>
                      `;
                    })
                    .join('')}
                  ${
                    editingTree
                      ? `<button type="button" class="rv-tree-add-btn is-chap" data-ed-chap-add="${gIdx}">+ Thêm chương vào ${escapeHtml(g.label)}</button>`
                      : ''
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderCharacterMascotSvg() {
    return `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
      </svg>
    `;
  }

  function renderInlineSpeechCloudHtml(cloudKey, example) {
    if (!example) return '';
    return `
      <div class="rv-cloud-wrap" data-cloud-wrap="${escapeAttr(cloudKey)}">
        <div class="rv-cloud-mascot-col">
          <div class="rv-cloud-avatar">${renderCharacterMascotSvg()}</div>
        </div>
        <div class="rv-speech-cloud" role="region" aria-label="Ví dụ minh họa">
          <svg class="rv-cloud-tail" width="14" height="20" viewBox="0 0 14 20" fill="none" aria-hidden="true">
            <path d="M13.5 1.5C8.8 4.4 4.8 7.8 1.2 10.2C5.8 10.4 9.8 12.8 13.5 18.5" fill="#f8fbff" stroke="#dbeafe" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <div class="rv-cloud-head">
            <span class="rv-cloud-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7L12 2z"/></svg>
              <span>${escapeHtml(example.title || 'Ví dụ minh họa')}</span>
            </span>
            <button type="button" class="rv-cloud-close" data-close-cloud="${escapeAttr(cloudKey)}" title="Đóng ví dụ" aria-label="Đóng ví dụ">✕</button>
          </div>
          ${
            example.problem
              ? `<div class="rv-cloud-problem"><strong>Đề:</strong> ${example.problem}</div>`
              : ''
          }
          ${
            example.solution
              ? `<div class="rv-cloud-solution"><strong>Giải:</strong> ${example.solution}</div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function renderJumpLessonIconSvg() {
    return `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    `;
  }

  function renderCoreCardHtml(card, { showLessonMeta = '', jumpLessonId = '' } = {}) {
    const preset = resolveBoxPreset(card.type, boxPresets);
    const effStyle = card.boxStyle || preset.style || 'editorial';
    const isStarred = state.bookmarks.has(card.id);
    const typeCls = card.type === 'formula' ? 'is-formula' : card.type === 'warning' ? 'is-warning' : 'is-theory';
    const items = ensureCoreCardItems(card);

    return `
      <section
        class="rv-editorial-sec ${typeCls} rv-box-style-${escapeAttr(effStyle)}"
        style="--rv-accent:${escapeAttr(preset.accent)}; --rv-bg:${escapeAttr(preset.bg)}; --rv-border:${escapeAttr(preset.border)};"
        id="rv-item-${escapeAttr(card.id)}"
        data-card-id="${escapeAttr(card.id)}"
      >
        <div class="rv-sec-head">
          <div class="rv-sec-heading-inline">
            <span class="rv-sec-ico is-custom" aria-hidden="true" title="${escapeAttr(preset.name)}">${renderBoxIconSvg(preset.icon)}</span>
            <div>
              <h2 class="rv-sec-title">${escapeHtml(card.title)}</h2>
              ${showLessonMeta ? `<div class="rv-card-lesson-crumb">${escapeHtml(showLessonMeta)}</div>` : ''}
            </div>
          </div>
          <div class="rv-sec-head-actions">
            ${
              jumpLessonId
                ? `
                  <button
                    type="button"
                    class="rv-nb-jump-ico-btn"
                    data-jump-lesson="${escapeAttr(jumpLessonId)}"
                    data-jump-card="${escapeAttr(card.id)}"
                    data-tip="Xem bài"
                    title="Xem bài"
                    aria-label="Xem bài"
                  >
                    ${renderJumpLessonIconSvg()}
                  </button>
                `
                : ''
            }
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
        </div>
        <div class="rv-sec-body">
          <ul class="rv-bullet-list">
            ${items
              .map((item) => {
                const hasEx = Boolean(item.hasExample && item.example && (item.example.problem || item.example.solution));
                const cloudKey = `${card.id}::${item.id}`;
                const isOpen = hasEx && state.openExampleClouds.has(cloudKey);
                return `
                  <li
                    class="rv-know-line ${hasEx ? 'has-inline-ex' : ''} ${isOpen ? 'is-cloud-open' : ''}"
                    ${hasEx ? `data-ex-line="${escapeAttr(cloudKey)}" title="Click đúp để xem ví dụ minh họa"` : ''}
                  >
                    <div class="rv-know-line-main">
                      <div class="rv-know-line-txt">${transformRecallMasks(item.html || '')}</div>
                    </div>
                    ${hasEx ? renderInlineSpeechCloudHtml(cloudKey, item.example) : ''}
                  </li>
                `;
              })
              .join('')}
          </ul>
        </div>
      </section>
    `;
  }

  function renderFlipCardHtml(fc, { indexNum = 0, showLessonMeta = '', jumpLessonId = '' } = {}) {
    const isFlipped = state.flippedIds.has(fc.id);
    const isStarred = state.bookmarks.has(fc.id);
    const attempt = state.trapAttempts[fc.id] || null;
    const isClickFlippable = Boolean(attempt);
    const backToneCls = attempt ? (attempt.isCorrect ? 'is-won' : 'is-trapped') : '';
    const frontBadgeTxt = indexNum > 0 ? `Câu ${indexNum}` : 'Thử sức';
    const flipIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    const enterIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`;
    const jumpIconBtnHtml = jumpLessonId
      ? `<button type="button" class="rv-nb-jump-ico-btn" data-jump-lesson="${escapeAttr(jumpLessonId)}" data-jump-card="${escapeAttr(fc.id)}" data-tip="Xem bài" title="Xem bài" aria-label="Xem bài">${renderJumpLessonIconSvg()}</button>`
      : '';

    return `
      <div
        class="rv-flip-card ${isFlipped ? 'is-flipped' : ''} ${isClickFlippable ? 'is-click-flippable' : ''}"
        id="rv-item-${escapeAttr(fc.id)}"
        data-flip-id="${escapeAttr(fc.id)}"
      >
        <div class="rv-flip-inner">
          <!-- FRONT: Clean Problem + Answer Input (Zero Trap Spoiler!) -->
          <div class="rv-flip-face rv-flip-front">
            <div class="rv-flip-top">
              <span class="rv-flip-badge is-front">${escapeHtml(frontBadgeTxt)}</span>
              <div class="rv-sec-head-actions">
                ${jumpIconBtnHtml}
                <button
                  type="button"
                  class="rv-star-btn ${isStarred ? 'is-starred' : ''}"
                  data-star-id="${escapeAttr(fc.id)}"
                  title="${isStarred ? 'Bỏ lưu Sổ tay' : 'Lưu vào Sổ tay'}"
                >${renderStarSvg(isStarred)}</button>
              </div>
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

          <!-- BACK: Full Trap Breakdown -->
          <div class="rv-flip-face rv-flip-back ${backToneCls}">
            <div class="rv-flip-top">
              <span class="rv-trap-cat-badge">
                <span class="rv-trap-cat-lbl">${fc.trapLabel || 'Bẫy hay sai'}</span>
              </span>
              <div class="rv-sec-head-actions">
                ${jumpIconBtnHtml}
                <button
                  type="button"
                  class="rv-star-btn ${isStarred ? 'is-starred' : ''}"
                  data-star-id="${escapeAttr(fc.id)}"
                  title="${isStarred ? 'Bỏ lưu Sổ tay' : 'Lưu vào Sổ tay'}"
                >${renderStarSvg(isStarred)}</button>
              </div>
            </div>

            <div class="rv-flip-back-body">
              <div class="rv-trap-recap">
                <span class="rv-trap-recap-lbl">Đề:</span>
                <span class="rv-trap-recap-txt">${fc.problem}</span>
              </div>
              <div class="rv-trap-rows">
                <div class="rv-trap-row is-trap">
                  <span class="rv-trap-pill-tag is-trap">Bẫy</span>
                  <div class="rv-trap-row-txt">${fc.trapExplanation}</div>
                </div>
                <div class="rv-trap-row is-fix">
                  <span class="rv-trap-pill-tag is-fix">Đúng</span>
                  <div class="rv-trap-row-txt">${fc.correctExplanation}</div>
                </div>
              </div>
            </div>

            <div class="rv-flip-foot">
              <div class="rv-trap-verdict-slot" data-verdict-slot="${escapeAttr(fc.id)}">
                ${renderTrapVerdictHtml(attempt)}
              </div>
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
    const hasCore = (lesson.coreCards || []).length > 0;
    const hasFlip = (lesson.flipCards || []).length > 0;
    if (!hasCore && !hasFlip) {
      return `
        <div class="rv-empty-notebook" style="margin-top:8px;">
          <h3 style="margin-bottom:6px;">Nội dung bài học chưa được cập nhật</h3>
          <p>Thầy Hoàng đang chuẩn bị sơ đồ kiến thức và bài tập cho <strong>${escapeHtml(lesson.code)}: ${escapeHtml(lesson.title)}</strong>.</p>
          ${
            isAdmin()
              ? `<button type="button" class="btn btn-primary btn-sm" data-start-edit-empty="1">✎ Soạn / Nhập Excel cho bài này</button>`
              : ''
          }
        </div>
      `;
    }
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
    if (mcs.length + tfs.length + sas.length === 0) {
      return `
        <div class="rv-empty-notebook" style="margin-top:8px;">
          <h3 style="margin-bottom:6px;">Chưa có câu hỏi luyện nhanh</h3>
          <p>Bộ câu hỏi luyện nhanh cho <strong>${escapeHtml(lesson.code)}: ${escapeHtml(lesson.title)}</strong> chưa được nạp nội dung.</p>
          ${
            isAdmin()
              ? `<button type="button" class="btn btn-primary btn-sm" data-start-edit-empty="1">✎ Soạn / Nhập Excel cho bài này</button>`
              : ''
          }
        </div>
      `;
    }
    const qState = state.quizState[lesson.id];
    const submitted = qState.submitted;
    const optLetters = ['A', 'B', 'C', 'D'];

    let qCounter = 0;
    const hasRandomPractice = getParametricShortAnswerPool(lesson).length > 0;
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
            <strong>Câu trắc nghiệm nhiều phương án lựa chọn</strong>
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
            <strong>Câu trắc nghiệm đúng sai</strong>
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

        <!-- Part 3: Short Answer (Unified Single-Focus 4-Box Input) -->
        <div class="rv-quiz-part">
          <div class="rv-quiz-part-head">
            <span class="badge badge-p3">Phần III</span>
            <strong>Câu trắc nghiệm trả lời ngắn</strong>
          </div>
          ${sas
            .map((q) => {
              qCounter += 1;
              const rawUser = qState.sa[q.id] ?? '';
              const slots = formatShortAnswerSlots(rawUser);
              const isRight =
                submitted && normalizeShortAnswer(rawUser) === normalizeShortAnswer(q.correctAnswer);
              const isWrong = submitted && !isRight;
              return `
                <div class="rv-q-card ${isRight ? 'is-correct' : isWrong ? 'is-wrong' : ''}">
                  <div class="rv-q-stem">
                    <span class="rv-q-num">Câu ${qCounter}.</span>
                    <span>${q.question}</span>
                  </div>
                  ${
                    submitted
                      ? `
                        <div class="sa-box-wrap is-review rv-sa-slots-wrap">
                          <div class="sa-slots ${isRight ? 'is-correct' : 'is-wrong'}">
                            ${slots.map((ch) => `<div class="sa-slot ${ch ? '' : 'empty'}">${ch || '·'}</div>`).join('')}
                          </div>
                          <span class="rv-verdict-pill ${isRight ? 'is-ok' : 'is-err'}">${isRight ? '✓ Chính xác' : '✗ Sai'}</span>
                          ${!isRight ? `<div class="sa-review-ans">Đáp án đúng: <strong class="sa-review-ans-val">${escapeHtml(q.correctAnswer)}</strong></div>` : ''}
                        </div>
                        ${q.explanation ? `<div class="rv-gen-sol-box" style="margin-top:10px;"><div class="rv-gen-sol-title">Lời giải chi tiết</div><div class="rv-gen-sol-body">${q.explanation}</div></div>` : ''}
                      `
                      : `
                        <div class="sa-box-wrap is-direct-slots rv-sa-slots-wrap">
                          <span class="sa-direct-label">Kết quả</span>
                          <div class="sa-slots is-unified" data-rv-sa-unified="${escapeAttr(q.id)}">
                            <input
                              type="text"
                              inputmode="text"
                              autocomplete="off"
                              autocorrect="off"
                              autocapitalize="off"
                              spellcheck="false"
                              maxlength="4"
                              class="sa-slots-overlay-input"
                              value="${escapeAttr(rawUser)}"
                              aria-label="Nhập đáp án câu ${qCounter}"
                            />
                            ${slots
                              .map(
                                (ch, si) =>
                                  `<div class="sa-slot ${ch ? 'is-filled' : 'empty'} ${si === Math.min(rawUser.length, 3) ? 'is-caret' : ''}" data-slot-cell="${si}">${escapeHtml(ch)}</div>`
                              )
                              .join('')}
                          </div>
                        </div>
                      `
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
              : `<button type="button" class="btn btn-secondary" id="btnResetLessonQuizBottom">Làm lại bộ câu hỏi này</button>`
          }
        </div>

        <!-- Random Parametric Practice (Pulled from Parametric Short-Answer Questions Above) -->
        ${
          hasRandomPractice && gSt && gSt.item
            ? (() => {
                const rawGen = gSt.userInput || '';
                const genSlots = formatShortAnswerSlots(rawGen);
                const isLocked = Boolean(gSt.checked || gSt.showSol);
                const genSlotsStateCls = gSt.checked ? (gSt.isCorrect ? 'is-correct' : 'is-wrong') : '';
                return `
                  <section class="rv-generator-box" id="rvDynamicGenSection">
                    <div class="rv-gen-head">
                      <div class="rv-gen-head-left">
                        <span class="rv-gen-ico" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                            <line x1="4" y1="4" x2="9" y2="9"/>
                          </svg>
                        </span>
                        <div>
                          <span class="rv-gen-eyebrow">LUYỆN TẬP THÊM</span>
                          <h3 class="rv-gen-title">Bài tập đổi số ngẫu nhiên</h3>
                        </div>
                      </div>
                      <span class="rv-streak-pill ${gSt.streak > 0 ? 'is-hot' : ''}" title="Chuỗi làm đúng liên tiếp">
                        Chuỗi đúng: <strong>${gSt.streak}</strong>
                      </span>
                    </div>

                    <div class="rv-gen-problem">
                      <div class="rv-gen-prompt">${gSt.item.prompt}</div>
                    </div>

                    <div class="rv-gen-controls">
                      <div class="rv-gen-slots-group">
                        <span class="sa-direct-label">Kết quả</span>
                        <div class="sa-slots is-unified ${isLocked ? 'is-locked' : ''} ${genSlotsStateCls}" id="rvGenSlots">
                          <input
                            type="text"
                            inputmode="text"
                            autocomplete="off"
                            autocorrect="off"
                            autocapitalize="off"
                            spellcheck="false"
                            maxlength="4"
                            class="sa-slots-overlay-input"
                            value="${escapeAttr(rawGen)}"
                            aria-label="Nhập đáp án bài tập đổi số"
                            ${isLocked ? 'disabled' : ''}
                          />
                          ${genSlots
                            .map(
                              (ch, si) =>
                                `<div class="sa-slot ${ch ? 'is-filled' : 'empty'} ${!isLocked && si === Math.min(rawGen.length, 3) ? 'is-caret' : ''}" data-slot-cell="${si}">${escapeHtml(ch)}</div>`
                            )
                            .join('')}
                        </div>
                        ${
                          gSt.checked
                            ? `
                              <span class="rv-verdict-pill ${gSt.isCorrect ? 'is-ok' : 'is-err'}">
                                ${gSt.isCorrect ? '✓ Chính xác' : '✗ Sai'}
                              </span>
                              ${
                                !gSt.isCorrect
                                  ? `<span class="rv-verdict-ans">Đáp án: <strong>${escapeHtml(gSt.item.answer)}</strong></span>`
                                  : ''
                              }
                            `
                            : gSt.showSol
                              ? `<span class="rv-verdict-ans">Đáp án: <strong>${escapeHtml(gSt.item.answer)}</strong></span>`
                              : ''
                        }
                      </div>
                      <div class="rv-gen-actions">
                        ${
                          !isLocked
                            ? `
                              <button type="button" class="btn btn-primary" id="btnGenCheck">Kiểm tra</button>
                              <button type="button" class="btn btn-secondary" id="btnGenShowSol">Xem lời giải</button>
                            `
                            : ''
                        }
                        <button type="button" class="btn ${isLocked ? 'btn-primary' : 'btn-secondary'} rv-gen-next-btn" id="btnGenNext">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                          </svg>
                          <span>Làm câu khác</span>
                        </button>
                      </div>
                    </div>

                    ${
                      isLocked && gSt.item.solution
                        ? `
                          <div class="rv-gen-sol-box">
                            <div class="rv-gen-sol-title">Lời giải chi tiết</div>
                            <div class="rv-gen-sol-body">${gSt.item.solution}</div>
                          </div>
                        `
                        : ''
                    }
                  </section>
                `;
              })()
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
              const preset = resolveBoxPreset(c.type, boxPresets);
              const items = ensureCoreCardItems(c);
              return `
                <div class="rv-print-card" style="border-left-color:${escapeAttr(preset.accent)};">
                  <div class="rv-print-card-title">[${escapeHtml(preset.name)}] ${escapeHtml(c.title)}</div>
                  <div class="rv-print-card-body">
                    <ul class="rv-bullet-list">
                      ${items
                        .map(
                          (it) => `
                            <li>
                              ${transformRecallMasks(it.html || '')}
                              ${
                                it.hasExample && it.example && (it.example.problem || it.example.solution)
                                  ? `<div style="margin-top:3px; padding-left:10px; border-left:2px solid #93c5fd; font-size:0.92em;"><em><strong>VD:</strong> ${it.example.problem || ''} — <strong>Giải:</strong> ${it.example.solution || ''}</em></div>`
                                  : ''
                              }
                            </li>
                          `
                        )
                        .join('')}
                    </ul>
                  </div>
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
      <div class="rv-lesson-header rv-nb-header">
        <div class="rv-breadcrumb">SỔ TAY CÁ NHÂN</div>
        <div class="rv-nb-hero-row">
          <h1 class="rv-lesson-h1">★ Sổ tay "Kiến thức hay quên" (${starredItems.length})</h1>
          ${
            starredItems.length > 0
              ? `
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
            <div class="rv-editorial-flow">
              ${starredItems
                .map((it) => {
                  if (it.kind === 'core') {
                    return `<div class="rv-nb-item-wrap">${renderCoreCardHtml(it.card, { showLessonMeta: it.lessonLabel, jumpLessonId: it.lessonId })}</div>`;
                  }
                  if (it.kind === 'flip') {
                    return `<div class="rv-nb-item-wrap" style="padding:18px 0;">${renderFlipCardHtml(it.card, { showLessonMeta: it.lessonLabel, jumpLessonId: it.lessonId })}</div>`;
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
    const canEdit = isAdmin();
    const editing = canEdit && state.editMode;

    return `
      ${
        editing
          ? renderEditorCommandBarHtml({
              isDirty: state.isDirty,
              isSaving: state.isSaving,
              showPresetManager: state.showPresetManager,
            })
          : ''
      }
      ${
        editing && state.showPresetManager
          ? renderBoxPresetManagerHtml({ boxPresets, draftPreset: state.draftPreset })
          : ''
      }

      <header class="rv-lesson-header">
        <div class="rv-lesson-head-left">
          <div class="rv-breadcrumb">
            ${escapeHtml(lesson.gradeLabel)} · ${escapeHtml(lesson.chapterCode)}
          </div>
          ${
            editing
              ? renderLessonMetaEditorHtml(lesson)
              : `<h1 class="rv-lesson-h1">${escapeHtml(lesson.code)}: ${escapeHtml(lesson.title)}</h1>`
          }
        </div>
      </header>

      <!-- Clean Open Underline Tab Bar (2 Tabs: Kiến thức trọng tâm + Luyện nhanh) -->
      <div class="rv-tabbar-wrap">
        <div class="rv-touch-tabs" role="tablist" aria-label="Các phần ôn tập">
          <button
            type="button"
            role="tab"
            aria-selected="${state.touchTab !== 'touch3'}"
            class="rv-touch-tab ${state.touchTab !== 'touch3' ? 'is-active' : ''}"
            data-touch-tab="touch1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span>Kiến thức trọng tâm</span>
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
            !editing && state.touchTab !== 'touch3'
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
          ${
            canEdit && !editing
              ? `
                <button type="button" class="rv-print-ghost-btn is-edit-trigger" id="btnEnterReviewEdit" data-tip="Chỉnh sửa nội dung & ví dụ" aria-label="Soạn bài">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <span>Soạn</span>
                </button>
              `
              : ''
          }
        </div>
      </div>

      <!-- Active Tab Content (View or Hierarchical Editor) -->
      <div class="rv-touch-stage" id="rvTouchStage">
        ${
          editing
            ? state.touchTab === 'touch3'
              ? renderTouch3EditorHtml(lesson._raw || lesson, { collapsedIds: state.collapsedEditNodes })
              : renderTouch1EditorHtml(lesson._raw || lesson, boxPresets, {
                  collapsedIds: state.collapsedEditNodes,
                  transformRecallMasks,
                })
            : state.touchTab === 'touch3'
              ? renderTouch3Html(lesson)
              : renderTouch1Html(lesson)
        }
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
        triggerMathRender(searchHost);
      }
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
            const order = ['touch1', 'touch3'];
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

    // Inline Character Speech-Cloud Examples (Double-click on knowledge line OR click subtle bubble icon)
    const toggleExampleCloud = (cloudKey, lineEl) => {
      if (!cloudKey || !lineEl) return;
      const willOpen = !state.openExampleClouds.has(cloudKey);
      if (willOpen) state.openExampleClouds.add(cloudKey);
      else state.openExampleClouds.delete(cloudKey);

      lineEl.classList.toggle('is-cloud-open', willOpen);
      const btn = lineEl.querySelector(`[data-toggle-cloud="${CSS.escape(cloudKey)}"]`);
      if (btn) {
        btn.classList.toggle('is-active', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
      }
    };

    rootEl.querySelectorAll('.rv-know-line.has-inline-ex').forEach((lineEl) => {
      const cloudKey = lineEl.dataset.exLine;
      lineEl.addEventListener('dblclick', (e) => {
        if (
          e.target.closest?.('.rv-cloud-wrap') ||
          e.target.closest?.('.rv-recall-mask') ||
          e.target.closest?.('[data-toggle-cloud]')
        ) {
          return;
        }
        window.getSelection?.()?.removeAllRanges?.();
        toggleExampleCloud(cloudKey, lineEl);
      });
    });

    rootEl.querySelectorAll('[data-toggle-cloud]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cloudKey = btn.dataset.toggleCloud;
        const lineEl = btn.closest('.rv-know-line');
        toggleExampleCloud(cloudKey, lineEl);
      });
    });

    rootEl.querySelectorAll('[data-close-cloud]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cloudKey = btn.dataset.closeCloud;
        const lineEl = btn.closest('.rv-know-line');
        if (state.openExampleClouds.has(cloudKey)) {
          toggleExampleCloud(cloudKey, lineEl);
        }
      });
    });

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
    // Rule: Before the student submits their 1st answer, ONLY Enter/submit OR the explicit ⇄ button flips the card.
    // Once they have submitted at least 1 answer, clicking anywhere on the card flips smoothly back & forth!
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
      cardEl.classList.add('is-click-flippable');
      cardEl.classList.add('is-flipped');

      // Gentle wiggle shake on wrong answer (no fireworks on right answer)
      if (!isCorrect) {
        setTimeout(() => triggerCardWrongShake(cardEl), 340);
      }
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
        const fid = cardEl.dataset.flipId;
        // Click-anywhere-to-flip is ONLY enabled after the student has submitted an answer at least once!
        if (!state.trapAttempts[fid]) return;
        if (window.getSelection?.()?.toString()?.trim()) return;
        if (state.flippedIds.has(fid)) state.flippedIds.delete(fid);
        else state.flippedIds.add(fid);
        cardEl.classList.toggle('is-flipped', state.flippedIds.has(fid));
      });
    });

    // =========================================================================
    // ADMIN HIERARCHICAL EDITOR EVENTS (ALL 3 TABS + SIDEBAR TREE + BOX PRESETS)
    // =========================================================================
    rootEl.querySelector('#btnEnterReviewEdit')?.addEventListener('click', () => {
      if (!isAdmin()) return;
      state.editMode = true;
      render();
    });

    rootEl.querySelector('#btnExitReviewEdit')?.addEventListener('click', () => {
      state.editMode = false;
      state.showPresetManager = false;
      rebuildIndexes();
      render();
    });

    rootEl.querySelector('#btnToggleBoxPresets')?.addEventListener('click', () => {
      state.showPresetManager = !state.showPresetManager;
      render();
    });

    rootEl.querySelector('#btnCloseBoxPresets')?.addEventListener('click', () => {
      state.showPresetManager = false;
      render();
    });

    rootEl.querySelector('#btnOpenNewPresetFromBar')?.addEventListener('click', () => {
      state.showPresetManager = true;
      render();
      rootEl.querySelector('#inpNewPresetName')?.focus();
    });

    rootEl.querySelector('#btnSaveReviewCurriculum')?.addEventListener('click', saveCurriculumToServer);

    rootEl.querySelectorAll('[data-start-edit-empty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isAdmin()) return;
        state.editMode = true;
        render();
      });
    });

    rootEl.querySelector('#btnImportReviewXlsx')?.addEventListener('click', () => {
      rootEl.querySelector('#inpImportReviewXlsx')?.click();
    });

    rootEl.querySelector('#inpImportReviewXlsx')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !api?.importReviewLessonXlsx) return;
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showToast?.('Vui lòng chọn tệp Excel định dạng .xlsx.', 'error');
        return;
      }
      try {
        const dataBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result || '');
            const idx = res.indexOf(',');
            resolve(idx >= 0 ? res.slice(idx + 1) : res);
          };
          reader.onerror = () => reject(new Error('Không thể đọc tệp từ máy.'));
          reader.readAsDataURL(file);
        });
        const parsed = await api.importReviewLessonXlsx({ filename: file.name, dataBase64 });
        const targetGradeNum = Number(parsed.grade) || 11;
        let gradeObj = curriculum.find((g) => Number(g.grade) === targetGradeNum);
        if (!gradeObj) {
          gradeObj = { grade: targetGradeNum, label: `Toán ${targetGradeNum}`, chapters: [] };
          curriculum.push(gradeObj);
          curriculum.sort((a, b) => a.grade - b.grade);
        }

        const normStr = (s) => stripAccents(String(s || '').trim()).replace(/\s+/g, ' ');
        const chCodeNorm = normStr(parsed.chapterCode);
        const chTitleNorm = normStr(parsed.chapterTitle);
        let chap = (gradeObj.chapters || []).find(
          (c) =>
            (chCodeNorm && normStr(c.code) === chCodeNorm) ||
            (chTitleNorm && normStr(c.title) === chTitleNorm)
        );
        if (!chap) {
          chap = {
            id: genReviewId(`toan${targetGradeNum}-c`),
            grade: targetGradeNum,
            code: parsed.chapterCode || `Chương ${(gradeObj.chapters?.length || 0) + 1}`,
            title: parsed.chapterTitle || 'Chương mới',
            comingSoon: false,
            lessons: [],
          };
          gradeObj.chapters.push(chap);
        }
        chap.comingSoon = false;
        if (!Array.isArray(chap.lessons)) chap.lessons = [];

        const impLesson = parsed.lesson;
        const lsCodeNorm = normStr(impLesson.code);
        const lsTitleNorm = normStr(impLesson.title);
        const existingIdx = chap.lessons.findIndex(
          (l) =>
            (lsCodeNorm && normStr(l.code) === lsCodeNorm) ||
            (lsTitleNorm && normStr(l.title) === lsTitleNorm)
        );

        let targetLessonId = impLesson.id;
        if (existingIdx >= 0) {
          const prev = chap.lessons[existingIdx];
          targetLessonId = prev.id;
          chap.lessons[existingIdx] = {
            ...impLesson,
            id: prev.id,
            examples: prev.examples || [],
            ...(prev.generators ? { generators: prev.generators } : {}),
          };
        } else {
          chap.lessons.push(impLesson);
        }

        delete state.genState[targetLessonId];
        delete state.quizState[targetLessonId];
        rebuildIndexes();
        state.viewMode = 'lesson';
        state.activeLessonId = targetLessonId;
        state.touchTab = 'touch1';
        state.expandedGrades.add(gradeObj.grade);
        state.expandedChapters.add(chap.id);
        markDirty();
        render();

        const sm = parsed.summary || {};
        const verb = existingIdx >= 0 ? 'Đã cập nhật' : 'Đã nạp mới';
        showToast?.(
          `${verb} ${impLesson.code}: ${impLesson.title} (${sm.boxCount || 0} Box, ${sm.lineCount || 0} dòng, ${sm.exampleCount || 0} VD, ${sm.flipCount || 0} thẻ bẫy, ${(sm.mcCount || 0) + (sm.tfCount || 0) + (sm.saCount || 0)} câu luyện nhanh). Bấm "Lưu lên web" để đồng bộ!`,
          'success'
        );
      } catch (err) {
        showToast?.(err?.message || 'Lỗi khi nạp tệp Excel.', 'error');
      }
    });

    if (state.editMode && isAdmin()) {
      const enrichedLesson = lessonsById.get(state.activeLessonId);
      const rawLesson = enrichedLesson?._raw || null;

      const swapArr = (arr, idx, dir) => {
        const next = idx + dir;
        if (!Array.isArray(arr) || next < 0 || next >= arr.length) return false;
        const tmp = arr[idx];
        arr[idx] = arr[next];
        arr[next] = tmp;
        return true;
      };

      // --- Box Preset Manager ---
      rootEl.querySelectorAll('[data-preset-style]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const p = boxPresets.find((x) => x.id === sel.dataset.presetStyle);
          if (p) {
            p.style = sel.value;
            markDirty();
            render();
          }
        });
      });

      rootEl.querySelectorAll('[data-preset-color]').forEach((inp) => {
        inp.addEventListener('input', () => {
          const p = boxPresets.find((x) => x.id === inp.dataset.presetColor);
          if (p) {
            Object.assign(p, deriveBoxColorsFromHex(inp.value));
            markDirty();
          }
        });
        inp.addEventListener('change', () => render());
      });

      rootEl.querySelectorAll('[data-del-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pid = btn.dataset.delPreset;
          const idx = boxPresets.findIndex((p) => p.id === pid && !p.builtin);
          if (idx >= 0) {
            boxPresets.splice(idx, 1);
            markDirty();
            render();
          }
        });
      });

      rootEl.querySelector('#inpNewPresetName')?.addEventListener('input', (e) => {
        state.draftPreset.name = e.target.value;
      });
      rootEl.querySelector('#selNewPresetIcon')?.addEventListener('change', (e) => {
        state.draftPreset.icon = e.target.value;
      });
      rootEl.querySelector('#selNewPresetStyle')?.addEventListener('change', (e) => {
        state.draftPreset.style = e.target.value;
      });
      rootEl.querySelector('#inpNewPresetColor')?.addEventListener('input', (e) => {
        state.draftPreset.accent = e.target.value;
      });
      rootEl.querySelectorAll('[data-pick-new-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.draftPreset.accent = btn.dataset.pickNewColor;
          render();
        });
      });
      rootEl.querySelector('#btnAddBoxPreset')?.addEventListener('click', () => {
        const name = String(state.draftPreset.name || '').trim();
        if (!name) {
          showToast?.('Vui lòng nhập tên cho loại Box mới!', 'info');
          rootEl.querySelector('#inpNewPresetName')?.focus();
          return;
        }
        const colors = deriveBoxColorsFromHex(state.draftPreset.accent || '#2563eb');
        boxPresets.push({
          id: genReviewId('box'),
          name,
          ...colors,
          icon: state.draftPreset.icon || 'star',
          style: state.draftPreset.style || 'tinted',
          builtin: false,
        });
        state.draftPreset = { name: '', accent: '#2563eb', icon: 'star', style: 'tinted' };
        markDirty();
        showToast?.(`Đã tạo loại Box "${name}"!`, 'success');
        render();
      });

      // --- Sidebar Hierarchy Tree Editing (Picker from Sổ báo giảng — Kế hoạch dạy học) ---
      const addChapterToGrade = (gIdx, code, title) => {
        const gradeObj = curriculum[gIdx];
        if (!gradeObj) return;
        const newChap = {
          id: genReviewId(`toan${gradeObj.grade}-c`),
          grade: gradeObj.grade,
          code: String(code || 'Chương mới').trim(),
          title: String(title || 'Chưa đặt tên').trim(),
          comingSoon: false,
          lessons: [],
        };
        gradeObj.chapters = gradeObj.chapters || [];
        gradeObj.chapters.push(newChap);
        state.expandedGrades.add(gradeObj.grade);
        state.expandedChapters.add(newChap.id);
        rebuildIndexes();
        markDirty();
        render();
        showToast?.(`Đã thêm "${newChap.code}: ${newChap.title}"!`, 'success');
      };

      const addLessonToChapter = (gIdx, cIdx, code, title) => {
        const gradeObj = curriculum[gIdx];
        const chap = gradeObj?.chapters?.[cIdx];
        if (!chap) return;
        chap.lessons = chap.lessons || [];
        const newLs = createEmptyLessonObj(gradeObj.grade, code, title);
        chap.lessons.push(newLs);
        chap.comingSoon = false;
        state.expandedGrades.add(gradeObj.grade);
        state.expandedChapters.add(chap.id);
        state.viewMode = 'lesson';
        state.activeLessonId = newLs.id;
        state.touchTab = 'touch1';
        rebuildIndexes();
        markDirty();
        render();
        showToast?.(`Đã thêm "${newLs.code}: ${newLs.title}"!`, 'success');
      };

      rootEl.querySelectorAll('[data-ed-chap-add]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const gIdx = Number(btn.dataset.edChapAdd);
          const gradeObj = curriculum[gIdx];
          if (!gradeObj) return;

          const promptManualChapter = () => {
            const code = window.prompt('Nhập mã chương (VD: Chương IV):', `Chương ${(gradeObj.chapters?.length || 0) + 1}`);
            if (code === null) return;
            const title = window.prompt('Nhập tên chương:', 'Chương mới');
            if (title === null) return;
            addChapterToGrade(gIdx, code, title);
          };

          if (!openModal) {
            promptManualChapter();
            return;
          }

          const catalog = await ensurePlanCatalog();
          const planChaps = catalog?.[String(gradeObj.grade)] || [];
          if (!planChaps.length) {
            promptManualChapter();
            return;
          }

          const existingKeys = new Set(
            (gradeObj.chapters || []).map((c) => normCatalogKey(c.code))
          );

          openModal({
            title: `Chọn chương từ Kế hoạch dạy học — ${gradeObj.label}`,
            wide: true,
            bodyHtml: `
              <div class="rv-picker-modal">
                <div class="rv-picker-search-wrap">
                  <input type="search" id="rvPickerSearch" class="input-control input-compact" placeholder="Tìm nhanh tên chương hoặc chuyên đề..." autocomplete="off" />
                </div>
                <div class="rv-picker-list" id="rvPickerList">
                  ${planChaps
                    .map((pc, idx) => {
                      const exists = existingKeys.has(normCatalogKey(pc.code));
                      return `
                        <button
                          type="button"
                          class="rv-picker-item ${exists ? 'is-exists' : ''}"
                          data-pick-chap="${idx}"
                          data-search-hay="${escapeAttr(normCatalogKey(`${pc.code} ${pc.title}`))}"
                        >
                          <div class="rv-picker-item-main">
                            <span class="rv-picker-code">${escapeHtml(pc.code)}</span>
                            <span class="rv-picker-title">${escapeHtml(pc.title)}</span>
                          </div>
                          <div class="rv-picker-item-meta">
                            <span class="rv-picker-count">${pc.lessons.length} bài</span>
                            ${exists ? '<span class="rv-picker-exists-pill">Đã có</span>' : '<span class="rv-picker-add-pill">+ Chọn</span>'}
                          </div>
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `,
            footerHtml: `
              <button type="button" class="btn btn-secondary btn-sm" id="btnPickChapManual">✎ Nhập tên chương tự do</button>
              <button type="button" class="btn btn-ghost btn-sm" id="btnPickChapCancel">Đóng</button>
            `,
            onMount(m) {
              const inp = m.querySelector('#rvPickerSearch');
              inp?.addEventListener('input', () => {
                const q = normCatalogKey(inp.value);
                m.querySelectorAll('[data-pick-chap]').forEach((el) => {
                  const show = !q || (el.dataset.searchHay || '').includes(q);
                  el.classList.toggle('hidden', !show);
                });
              });
              m.querySelectorAll('[data-pick-chap]').forEach((itemBtn) => {
                itemBtn.addEventListener('click', () => {
                  const pc = planChaps[Number(itemBtn.dataset.pickChap)];
                  if (!pc) return;
                  closeModal?.();
                  addChapterToGrade(gIdx, pc.code, pc.title);
                });
              });
              m.querySelector('#btnPickChapManual')?.addEventListener('click', () => {
                closeModal?.();
                promptManualChapter();
              });
              m.querySelector('#btnPickChapCancel')?.addEventListener('click', () => closeModal?.());
              setTimeout(() => inp?.focus(), 40);
            },
          });
        });
      });

      rootEl.querySelectorAll('[data-ed-chap-rename]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [gIdx, cIdx] = btn.dataset.edChapRename.split(':').map(Number);
          const chap = curriculum[gIdx]?.chapters?.[cIdx];
          if (!chap) return;
          const nextCode = window.prompt('Mã chương:', chap.code);
          if (nextCode === null) return;
          const nextTitle = window.prompt('Tên chương:', chap.title);
          if (nextTitle === null) return;
          chap.code = nextCode.trim() || chap.code;
          chap.title = nextTitle.trim() || chap.title;
          rebuildIndexes();
          markDirty();
          render();
        });
      });

      rootEl.querySelectorAll('[data-ed-chap-del]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [gIdx, cIdx] = btn.dataset.edChapDel.split(':').map(Number);
          const chap = curriculum[gIdx]?.chapters?.[cIdx];
          if (!chap) return;
          if (!window.confirm(`Xóa "${chap.code}: ${chap.title}" và toàn bộ bài học bên trong?`)) return;
          curriculum[gIdx].chapters.splice(cIdx, 1);
          rebuildIndexes();
          if (!lessonsById.has(state.activeLessonId)) {
            state.activeLessonId = lessonsIndex[0]?.id || '';
          }
          markDirty();
          render();
        });
      });

      rootEl.querySelectorAll('[data-ed-lesson-add]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const [gIdx, cIdx] = btn.dataset.edLessonAdd.split(':').map(Number);
          const gradeObj = curriculum[gIdx];
          const chap = gradeObj?.chapters?.[cIdx];
          if (!chap) return;

          const promptManualLesson = () => {
            const num = (chap.lessons?.length || 0) + 1;
            const code = window.prompt('Nhập mã bài (VD: Bài 1):', `Bài ${num}`);
            if (code === null) return;
            const title = window.prompt('Nhập tên bài học:', 'Bài học mới');
            if (title === null) return;
            addLessonToChapter(gIdx, cIdx, code, title);
          };

          if (!openModal) {
            promptManualLesson();
            return;
          }

          const catalog = await ensurePlanCatalog();
          const planChaps = catalog?.[String(gradeObj.grade)] || [];
          if (!planChaps.length) {
            promptManualLesson();
            return;
          }

          const chapCodeKey = normCatalogKey(chap.code);
          const chapTitleKey = normCatalogKey(chap.title);
          const matchedChap =
            planChaps.find((pc) => normCatalogKey(pc.code) === chapCodeKey) ||
            planChaps.find((pc) => chapTitleKey && normCatalogKey(pc.title).includes(chapTitleKey)) ||
            null;

          const existingLessons = new Set(
            (chap.lessons || []).map((ls) => normCatalogKey(`${ls.code} ${ls.title}`))
          );
          const existingTitles = new Set(
            (chap.lessons || []).map((ls) => normCatalogKey(ls.title))
          );

          const renderGroupHtml = (pc, groupIdx) => `
            <div class="rv-picker-group" data-picker-group="${groupIdx}">
              <div class="rv-picker-group-head">${escapeHtml(pc.code)}${pc.title ? `: ${escapeHtml(pc.title)}` : ''}</div>
              ${pc.lessons
                .map((ls, lIdx) => {
                  const exists =
                    existingLessons.has(normCatalogKey(`${ls.code} ${ls.title}`)) ||
                    existingTitles.has(normCatalogKey(ls.title));
                  return `
                    <button
                      type="button"
                      class="rv-picker-item ${exists ? 'is-exists' : ''}"
                      data-pick-lesson="${groupIdx}:${lIdx}"
                      data-search-hay="${escapeAttr(normCatalogKey(`${pc.code} ${pc.title} ${ls.code} ${ls.title}`))}"
                    >
                      <div class="rv-picker-item-main">
                        <span class="rv-picker-code">${escapeHtml(ls.code)}</span>
                        <span class="rv-picker-title">${escapeHtml(ls.title)}</span>
                      </div>
                      <div class="rv-picker-item-meta">
                        ${exists ? '<span class="rv-picker-exists-pill">Đã có</span>' : '<span class="rv-picker-add-pill">+ Chọn</span>'}
                      </div>
                    </button>
                  `;
                })
                .join('')}
            </div>
          `;

          const groupsToUse = matchedChap
            ? [matchedChap, ...planChaps.filter((pc) => pc !== matchedChap)]
            : planChaps;
          let showAllGrades = !matchedChap;

          openModal({
            title: `Chọn bài học — ${chap.code}: ${chap.title}`,
            wide: true,
            bodyHtml: `
              <div class="rv-picker-modal">
                <div class="rv-picker-toolbar">
                  <input type="search" id="rvPickerSearch" class="input-control input-compact" placeholder="Tìm nhanh số bài hoặc tên bài học..." autocomplete="off" />
                  ${
                    matchedChap
                      ? `<button type="button" class="btn btn-secondary btn-sm" id="btnToggleAllPlanChaps">Xem tất cả ${gradeObj.label}</button>`
                      : ''
                  }
                </div>
                <div class="rv-picker-list" id="rvPickerList">
                  ${groupsToUse
                    .map((pc, idx) => {
                      const hiddenCls = matchedChap && idx > 0 ? ' hidden' : '';
                      return `<div class="rv-picker-group-slot${hiddenCls}" data-group-slot="${idx}">${renderGroupHtml(pc, idx)}</div>`;
                    })
                    .join('')}
                </div>
              </div>
            `,
            footerHtml: `
              <button type="button" class="btn btn-secondary btn-sm" id="btnPickLessonManual">✎ Nhập tên bài tự do</button>
              <button type="button" class="btn btn-ghost btn-sm" id="btnPickLessonCancel">Đóng</button>
            `,
            onMount(m) {
              const inp = m.querySelector('#rvPickerSearch');
              const toggleBtn = m.querySelector('#btnToggleAllPlanChaps');

              const applyFilter = () => {
                const q = normCatalogKey(inp?.value || '');
                m.querySelectorAll('[data-group-slot]').forEach((slotEl) => {
                  const idx = Number(slotEl.dataset.groupSlot);
                  const allowGroup = showAllGrades || Boolean(q) || idx === 0;
                  if (!allowGroup) {
                    slotEl.classList.add('hidden');
                    return;
                  }
                  let anyVisible = false;
                  slotEl.querySelectorAll('[data-pick-lesson]').forEach((el) => {
                    const show = !q || (el.dataset.searchHay || '').includes(q);
                    el.classList.toggle('hidden', !show);
                    if (show) anyVisible = true;
                  });
                  slotEl.classList.toggle('hidden', !anyVisible);
                });
              };

              inp?.addEventListener('input', applyFilter);
              toggleBtn?.addEventListener('click', () => {
                showAllGrades = !showAllGrades;
                toggleBtn.textContent = showAllGrades ? `Chỉ xem ${chap.code}` : `Xem tất cả ${gradeObj.label}`;
                applyFilter();
              });
              m.querySelectorAll('[data-pick-lesson]').forEach((itemBtn) => {
                itemBtn.addEventListener('click', () => {
                  const [gi, li] = itemBtn.dataset.pickLesson.split(':').map(Number);
                  const ls = groupsToUse[gi]?.lessons?.[li];
                  if (!ls) return;
                  closeModal?.();
                  addLessonToChapter(gIdx, cIdx, ls.code, ls.title);
                });
              });
              m.querySelector('#btnPickLessonManual')?.addEventListener('click', () => {
                closeModal?.();
                promptManualLesson();
              });
              m.querySelector('#btnPickLessonCancel')?.addEventListener('click', () => closeModal?.());
              setTimeout(() => inp?.focus(), 40);
            },
          });
        });
      });

      rootEl.querySelectorAll('[data-ed-lesson-move]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [gIdx, cIdx, lIdx, dir] = btn.dataset.edLessonMove.split(':').map(Number);
          const lessons = curriculum[gIdx]?.chapters?.[cIdx]?.lessons;
          if (swapArr(lessons, lIdx, dir)) {
            rebuildIndexes();
            markDirty();
            render();
          }
        });
      });

      rootEl.querySelectorAll('[data-ed-lesson-del]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [gIdx, cIdx, lIdx] = btn.dataset.edLessonDel.split(':').map(Number);
          const lessons = curriculum[gIdx]?.chapters?.[cIdx]?.lessons;
          const ls = lessons?.[lIdx];
          if (!ls) return;
          if (!window.confirm(`Xóa "${ls.code}: ${ls.title}"?`)) return;
          lessons.splice(lIdx, 1);
          rebuildIndexes();
          if (!lessonsById.has(state.activeLessonId)) {
            state.activeLessonId = lessonsIndex[0]?.id || '';
          }
          markDirty();
          render();
        });
      });

      // Collapse / Expand Editor Nodes
      rootEl.querySelectorAll('[data-ed-toggle-node]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.edToggleNode;
          if (state.collapsedEditNodes.has(k)) state.collapsedEditNodes.delete(k);
          else state.collapsedEditNodes.add(k);
          render();
        });
      });

      if (rawLesson) {
        // Lesson Metadata (code, title, summary)
        rootEl.querySelectorAll('[data-ed-lesson-field]').forEach((inp) => {
          inp.addEventListener('input', () => {
            rawLesson[inp.dataset.edLessonField] = inp.value;
            rebuildIndexes();
            markDirty();
          });
        });

        // --- TAB 1: Core Boxes & Per-Line Inline Examples ---
        rootEl.querySelectorAll('[data-ed-core-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const preset = resolveBoxPreset(btn.dataset.edCoreAdd, boxPresets);
            rawLesson.coreCards = rawLesson.coreCards || [];
            rawLesson.coreCards.push({
              id: genReviewId('card'),
              type: preset.id,
              title: preset.name,
              items: [
                {
                  id: genReviewId('item'),
                  html: '<strong>Nội dung:</strong> Nhập kiến thức hoặc công thức $...$ tại đây.',
                  hasExample: false,
                  example: null,
                },
              ],
            });
            rebuildIndexes();
            markDirty();
            render();
          });
        });

        rootEl.querySelectorAll('[data-ed-core-type]').forEach((sel) => {
          sel.addEventListener('change', () => {
            const idx = Number(sel.dataset.edCoreType);
            if (rawLesson.coreCards?.[idx]) {
              rawLesson.coreCards[idx].type = sel.value;
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-core-style]').forEach((sel) => {
          sel.addEventListener('change', () => {
            const idx = Number(sel.dataset.edCoreStyle);
            if (rawLesson.coreCards?.[idx]) {
              if (sel.value) rawLesson.coreCards[idx].boxStyle = sel.value;
              else delete rawLesson.coreCards[idx].boxStyle;
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-core-title]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const idx = Number(inp.dataset.edCoreTitle);
            if (rawLesson.coreCards?.[idx]) {
              rawLesson.coreCards[idx].title = inp.value;
              markDirty();
            }
          });
        });

        // Per-line knowledge item editing + Checkbox toggle for inline Example Drawer
        rootEl.querySelectorAll('[data-ed-item-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cardIdx = Number(btn.dataset.edItemAdd);
            const card = rawLesson.coreCards?.[cardIdx];
            if (!card) return;
            const items = ensureCoreCardItems(card);
            items.push({
              id: genReviewId('item'),
              html: '<strong>Ý mới:</strong> Nhập nội dung hoặc công thức $...$.',
              hasExample: false,
              example: null,
            });
            rebuildIndexes();
            markDirty();
            render();
          });
        });

        rootEl.querySelectorAll('[data-ed-item-has-ex]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx] = btn.dataset.edItemHasEx.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            item.hasExample = !item.hasExample;
            if (item.hasExample && !item.example) {
              item.example = {
                title: 'Ví dụ minh họa',
                problem: '',
                solution: '',
              };
            }
            markDirty();
            render();
          });
        });

        let previewDebounce = null;
        const syncLineItemFromFriendly = (cIdx, iIdx, nextParsed, rerender = false) => {
          const card = rawLesson.coreCards?.[cIdx];
          const item = card ? ensureCoreCardItems(card)[iIdx] : null;
          if (!item) return;
          item.html = buildItemHtmlFromFriendly(nextParsed);
          markDirty();
          if (rerender) {
            render();
            return;
          }
          clearTimeout(previewDebounce);
          previewDebounce = setTimeout(() => {
            const prevEl = rootEl.querySelector(`#ed-prev-item-${cIdx}-${iIdx}`);
            if (prevEl) {
              prevEl.innerHTML = transformRecallMasks(item.html);
              triggerMathRender(prevEl);
            }
          }, 140);
        };

        rootEl.querySelectorAll('[data-ed-item-text]').forEach((ta) => {
          ta.addEventListener('input', () => {
            const [cIdx, iIdx] = ta.dataset.edItemText.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            const cur = parseItemForFriendlyEdit(item.html || '');
            cur.text = ta.value;
            syncLineItemFromFriendly(cIdx, iIdx, cur, false);
          });
          // Ctrl+B shortcut to bold selected text with **...**
          ta.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              applyTextareaSnippet(ta, 'bold');
            }
          });
        });

        // Visual Tag / Chip Pill Builder handlers (Zero HTML!)
        rootEl.querySelectorAll('[data-ed-tag-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx] = btn.dataset.edTagAdd.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            const cur = parseItemForFriendlyEdit(item.html || '');
            if (!cur.tagsKind) cur.tagsKind = 'chips';
            cur.tags.push({ text: `Mục ${cur.tags.length + 1}`, tone: 'default' });
            syncLineItemFromFriendly(cIdx, iIdx, cur, true);
          });
        });

        rootEl.querySelectorAll('[data-ed-tag-kind-toggle]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx] = btn.dataset.edTagKindToggle.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            const cur = parseItemForFriendlyEdit(item.html || '');
            cur.tagsKind = cur.tagsKind === 'chips' ? 'cases' : 'chips';
            syncLineItemFromFriendly(cIdx, iIdx, cur, true);
          });
        });

        rootEl.querySelectorAll('[data-ed-tag-text]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const [cIdx, iIdx, tIdx] = inp.dataset.edTagText.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            const cur = parseItemForFriendlyEdit(item.html || '');
            if (cur.tags[tIdx]) {
              cur.tags[tIdx].text = inp.value;
              syncLineItemFromFriendly(cIdx, iIdx, cur, false);
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-tag-tone]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx, tIdx] = btn.dataset.edTagTone.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            const cur = parseItemForFriendlyEdit(item.html || '');
            const order = ['default', 'up', 'down', 'flat'];
            if (cur.tags[tIdx]) {
              const nextIdx = (order.indexOf(cur.tags[tIdx].tone || 'default') + 1) % order.length;
              cur.tags[tIdx].tone = order[nextIdx];
              syncLineItemFromFriendly(cIdx, iIdx, cur, true);
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-tag-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx, tIdx] = btn.dataset.edTagDel.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            const item = card ? ensureCoreCardItems(card)[iIdx] : null;
            if (!item) return;
            const cur = parseItemForFriendlyEdit(item.html || '');
            cur.tags.splice(tIdx, 1);
            if (!cur.tags.length) cur.tagsKind = '';
            syncLineItemFromFriendly(cIdx, iIdx, cur, true);
          });
        });

        rootEl.querySelectorAll('[data-ed-item-ex]').forEach((el) => {
          el.addEventListener('input', () => {
            const [cIdx, iIdx, field] = el.dataset.edItemEx.split(':');
            const card = rawLesson.coreCards?.[Number(cIdx)];
            const item = card ? ensureCoreCardItems(card)[Number(iIdx)] : null;
            if (!item) return;
            if (!item.example) item.example = { title: 'Ví dụ minh họa', problem: '', solution: '' };
            item.example[field] = field === 'title' ? el.value : friendlyInlineToHtml(el.value);
            markDirty();
          });
        });

        rootEl.querySelectorAll('[data-ed-item-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx] = btn.dataset.edItemMove.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            if (card && swapArr(ensureCoreCardItems(card), iIdx, Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-item-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [cIdx, iIdx] = btn.dataset.edItemDel.split(':').map(Number);
            const card = rawLesson.coreCards?.[cIdx];
            if (!card) return;
            ensureCoreCardItems(card).splice(iIdx, 1);
            rebuildIndexes();
            markDirty();
            render();
          });
        });

        rootEl.querySelectorAll('[data-fmt-target] [data-insert-snip]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const targetKey = btn.closest('[data-fmt-target]')?.dataset.fmtTarget;
            const ta = rootEl.querySelector(`#ed-ta-${targetKey}`);
            applyTextareaSnippet(ta, btn.dataset.insertSnip);
          });
        });

        rootEl.querySelectorAll('[data-ed-core-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (swapArr(rawLesson.coreCards, Number(btn.dataset.edCoreMove), Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-core-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.edCoreDel);
            rawLesson.coreCards?.splice(idx, 1);
            rebuildIndexes();
            markDirty();
            render();
          });
        });

        // --- TAB 1: Blind Trap Flip Cards ---
        rootEl.querySelector('#btnEdAddFlip')?.addEventListener('click', () => {
          rawLesson.flipCards = rawLesson.flipCards || [];
          rawLesson.flipCards.push({
            id: genReviewId('flip'),
            trapCategory: 'index',
            trapLabel: 'Bẫy hay sai mới',
            problem: 'Nhập đề bài ngắn gọn (có công thức $...$)...',
            placeholder: 'Nhập đáp án...',
            acceptedAnswers: ['0'],
            trapExplanation: 'Học sinh thường nhầm ở bước...',
            correctExplanation: 'Lời giải chuẩn xác...',
          });
          rebuildIndexes();
          markDirty();
          render();
        });

        rootEl.querySelectorAll('[data-ed-flip-field]').forEach((el) => {
          const evName = el.tagName === 'SELECT' ? 'change' : 'input';
          el.addEventListener(evName, () => {
            const idx = Number(el.dataset.edFlipIdx);
            const field = el.dataset.edFlipField;
            if (rawLesson.flipCards?.[idx]) {
              rawLesson.flipCards[idx][field] =
                field === 'trapLabel' ? el.value : friendlyInlineToHtml(el.value);
              markDirty();
            }
          });
        });

        const syncFlipAnswers = (idx) => {
          const fc = rawLesson.flipCards?.[idx];
          if (!fc) return;
          const modeSel = rootEl.querySelector(`[data-ed-flip-ansmode="${idx}"]`);
          const ansInp = rootEl.querySelector(`[data-ed-flip-ans="${idx}"]`);
          const tokens = String(ansInp?.value || '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean);
          if (modeSel?.value === 'multi') {
            delete fc.acceptedAnswers;
            fc.acceptedMultiSet = tokens.length ? tokens : ['0'];
          } else {
            delete fc.acceptedMultiSet;
            fc.acceptedAnswers = tokens.length ? tokens : ['0'];
          }
          markDirty();
        };

        rootEl.querySelectorAll('[data-ed-flip-ansmode]').forEach((sel) => {
          sel.addEventListener('change', () => syncFlipAnswers(Number(sel.dataset.edFlipAnsmode)));
        });
        rootEl.querySelectorAll('[data-ed-flip-ans]').forEach((inp) => {
          inp.addEventListener('input', () => syncFlipAnswers(Number(inp.dataset.edFlipAns)));
        });

        rootEl.querySelectorAll('[data-ed-flip-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (swapArr(rawLesson.flipCards, Number(btn.dataset.edFlipMove), Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-flip-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            rawLesson.flipCards?.splice(Number(btn.dataset.edFlipDel), 1);
            rebuildIndexes();
            markDirty();
            render();
          });
        });

        // --- TAB 2: Worked Examples + Nested Steps ---
        rootEl.querySelector('#btnEdAddExample')?.addEventListener('click', () => {
          rawLesson.examples = rawLesson.examples || [];
          const n = rawLesson.examples.length + 1;
          rawLesson.examples.push({
            id: genReviewId('ex'),
            title: `Ví dụ ${n} — Dạng bài mới`,
            problem: 'Nhập đề bài ví dụ...',
            hint: 'Nhập gợi ý hướng đi...',
            steps: ['<strong>Bước 1:</strong> ...'],
            finalAnswer: 'Đáp số...',
          });
          rebuildIndexes();
          markDirty();
          render();
        });

        rootEl.querySelectorAll('[data-ed-ex-field]').forEach((el) => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.edExIdx);
            const field = el.dataset.edExField;
            if (rawLesson.examples?.[idx]) {
              rawLesson.examples[idx][field] = el.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-ex-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (swapArr(rawLesson.examples, Number(btn.dataset.edExMove), Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-ex-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            rawLesson.examples?.splice(Number(btn.dataset.edExDel), 1);
            rebuildIndexes();
            markDirty();
            render();
          });
        });

        rootEl.querySelectorAll('[data-ed-ex-add-step]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const ex = rawLesson.examples?.[Number(btn.dataset.edExAddStep)];
            if (!ex) return;
            ex.steps = ex.steps || [];
            ex.steps.push(`<strong>Bước ${ex.steps.length + 1}:</strong> `);
            markDirty();
            render();
          });
        });

        rootEl.querySelectorAll('[data-ed-ex-step]').forEach((ta) => {
          ta.addEventListener('input', () => {
            const [eIdx, sIdx] = ta.dataset.edExStep.split(':').map(Number);
            if (rawLesson.examples?.[eIdx]?.steps) {
              rawLesson.examples[eIdx].steps[sIdx] = ta.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-ex-step-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [eIdx, sIdx] = btn.dataset.edExStepMove.split(':').map(Number);
            if (swapArr(rawLesson.examples?.[eIdx]?.steps, sIdx, Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-ex-step-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [eIdx, sIdx] = btn.dataset.edExStepDel.split(':').map(Number);
            rawLesson.examples?.[eIdx]?.steps?.splice(sIdx, 1);
            markDirty();
            render();
          });
        });

        // --- TAB 3: Quizzes (MC, TF, SA) ---
        rawLesson.quizzes = rawLesson.quizzes || { multipleChoice: [], trueFalse: [], shortAnswer: [] };

        rootEl.querySelector('#btnEdAddMc')?.addEventListener('click', () => {
          rawLesson.quizzes.multipleChoice.push({
            id: genReviewId('mc'),
            question: 'Nhập câu hỏi trắc nghiệm...',
            options: ['$A$', '$B$', '$C$', '$D$'],
            correctIndex: 0,
            explanation: 'Lời giải ngắn gọn...',
          });
          markDirty();
          render();
        });

        rootEl.querySelectorAll('[data-ed-mc-field]').forEach((el) => {
          el.addEventListener('input', () => {
            const q = rawLesson.quizzes.multipleChoice[Number(el.dataset.edMcIdx)];
            if (q) {
              q[el.dataset.edMcField] = el.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-mc-opt]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const [qIdx, oIdx] = inp.dataset.edMcOpt.split(':').map(Number);
            const q = rawLesson.quizzes.multipleChoice[qIdx];
            if (q?.options) {
              q.options[oIdx] = inp.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-mc-correct]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [qIdx, oIdx] = btn.dataset.edMcCorrect.split(':').map(Number);
            const q = rawLesson.quizzes.multipleChoice[qIdx];
            if (q) {
              q.correctIndex = oIdx;
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-mc-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (swapArr(rawLesson.quizzes.multipleChoice, Number(btn.dataset.edMcMove), Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-mc-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            rawLesson.quizzes.multipleChoice.splice(Number(btn.dataset.edMcDel), 1);
            markDirty();
            render();
          });
        });

        // Part 2: True / False
        rootEl.querySelector('#btnEdAddTf')?.addEventListener('click', () => {
          rawLesson.quizzes.trueFalse.push({
            id: genReviewId('tf'),
            stem: 'Nhập đề dẫn chung cho câu Đúng/Sai...',
            statements: ['a', 'b', 'c', 'd'].map((lbl) => ({
              label: lbl,
              text: `Mệnh đề ${lbl}...`,
              isTrue: true,
              explanation: 'Giải thích...',
            })),
          });
          markDirty();
          render();
        });

        rootEl.querySelectorAll('[data-ed-tf-stem]').forEach((ta) => {
          ta.addEventListener('input', () => {
            const q = rawLesson.quizzes.trueFalse[Number(ta.dataset.edTfStem)];
            if (q) {
              q.stem = ta.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-tf-stmt]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const [qIdx, sIdx, field] = inp.dataset.edTfStmt.split(':');
            const st = rawLesson.quizzes.trueFalse[Number(qIdx)]?.statements?.[Number(sIdx)];
            if (st) {
              st[field] = inp.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-tf-bool]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [qIdx, sIdx, val] = btn.dataset.edTfBool.split(':');
            const st = rawLesson.quizzes.trueFalse[Number(qIdx)]?.statements?.[Number(sIdx)];
            if (st) {
              st.isTrue = val === 'true';
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-tf-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (swapArr(rawLesson.quizzes.trueFalse, Number(btn.dataset.edTfMove), Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-tf-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            rawLesson.quizzes.trueFalse.splice(Number(btn.dataset.edTfDel), 1);
            markDirty();
            render();
          });
        });

        // Part 3: Short Answer
        rootEl.querySelector('#btnEdAddSa')?.addEventListener('click', () => {
          rawLesson.quizzes.shortAnswer.push({
            id: genReviewId('sa'),
            question: 'Nhập đề bài câu trả lời ngắn...',
            correctAnswer: '0',
            explanation: 'Lời giải ngắn gọn...',
          });
          markDirty();
          render();
        });

        rootEl.querySelectorAll('[data-ed-sa-field]').forEach((el) => {
          el.addEventListener('input', () => {
            const q = rawLesson.quizzes.shortAnswer[Number(el.dataset.edSaIdx)];
            if (q) {
              q[el.dataset.edSaField] = el.value;
              markDirty();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-sa-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (swapArr(rawLesson.quizzes.shortAnswer, Number(btn.dataset.edSaMove), Number(btn.dataset.dir))) {
              markDirty();
              render();
            }
          });
        });

        rootEl.querySelectorAll('[data-ed-sa-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            rawLesson.quizzes.shortAnswer.splice(Number(btn.dataset.edSaDel), 1);
            markDirty();
            render();
          });
        });
      }
    }

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

      const bindUnifiedFourBoxSlots = (wrapEl, { isLocked = () => false, onChange, onEnter } = {}) => {
        if (!wrapEl) return;
        const inp = wrapEl.querySelector('.sa-slots-overlay-input');
        const cells = [...wrapEl.querySelectorAll('[data-slot-cell]')];
        if (!inp || !cells.length) return;

        const syncCells = (rawVal) => {
          const cleaned = String(rawVal || '')
            .replace(/\./g, ',')
            .replace(/[^0-9,\-]/g, '')
            .slice(0, 4);
          if (inp.value !== cleaned) inp.value = cleaned;
          const slots = formatShortAnswerSlots(cleaned);
          const caretIdx = Math.min(cleaned.length, 3);
          cells.forEach((cell, i) => {
            const ch = slots[i] || '';
            cell.textContent = ch;
            cell.classList.toggle('is-filled', Boolean(ch));
            cell.classList.toggle('empty', !ch);
            cell.classList.toggle('is-caret', !isLocked() && i === caretIdx);
          });
          onChange?.(cleaned);
        };

        const snapEnd = () => {
          const len = inp.value.length;
          try {
            inp.setSelectionRange(len, len);
          } catch {}
        };

        inp.addEventListener('focus', snapEnd);
        inp.addEventListener('click', snapEnd);
        inp.addEventListener('keydown', (e) => {
          if (isLocked()) {
            e.preventDefault();
            return;
          }
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
            return;
          }
          if (e.key === 'ArrowLeft' || e.key === 'Home') {
            e.preventDefault();
            snapEnd();
          }
        });
        inp.addEventListener('input', () => {
          if (isLocked()) return;
          syncCells(inp.value);
          snapEnd();
        });
      };

      rootEl.querySelectorAll('[data-rv-sa-unified]').forEach((wrapEl) => {
        const qId = wrapEl.dataset.rvSaUnified;
        bindUnifiedFourBoxSlots(wrapEl, {
          isLocked: () => Boolean(curQuizState.submitted),
          onChange: (val) => {
            curQuizState.sa[qId] = val;
          },
        });
      });

      rootEl.querySelector('#btnGradeLessonQuiz')?.addEventListener('click', gradeCurrentQuiz);

      const resetQuiz = () => {
        state.quizState[curLesson.id] = { mc: {}, tf: {}, sa: {}, submitted: false, summary: null };
        render();
      };
      rootEl.querySelector('#btnResetLessonQuiz')?.addEventListener('click', resetQuiz);
      rootEl.querySelector('#btnResetLessonQuizBottom')?.addEventListener('click', resetQuiz);

      // Chạm 3: Random Parametric Practice (from Parametric Short-Answer Questions above)
      const gSt = curLesson ? state.genState[curLesson.id] : null;
      const hasRandPool = getParametricShortAnswerPool(curLesson).length > 0;
      if (curLesson && gSt && hasRandPool) {
        const genSlotsEl = rootEl.querySelector('#rvGenSlots');
        const isGenLocked = () => Boolean(gSt.checked || gSt.showSol);
        const checkGen = () => {
          if (isGenLocked()) return;
          const raw = String(gSt.userInput || '').trim();
          if (!raw) {
            showToast?.('Hãy nhập đáp số trước khi kiểm tra nhé!', 'info');
            genSlotsEl?.querySelector('.sa-slots-overlay-input')?.focus();
            return;
          }
          const ok = normalizeShortAnswer(raw) === normalizeShortAnswer(gSt.item.answer);
          gSt.streak = ok ? gSt.streak + 1 : 0;
          gSt.checked = true;
          gSt.isCorrect = ok;
          gSt.showSol = true;
          render();
        };

        bindUnifiedFourBoxSlots(genSlotsEl, {
          isLocked: isGenLocked,
          onChange: (val) => {
            gSt.userInput = val;
          },
          onEnter: checkGen,
        });

        rootEl.querySelector('#btnGenCheck')?.addEventListener('click', checkGen);
        rootEl.querySelector('#btnGenShowSol')?.addEventListener('click', () => {
          if (isGenLocked()) return;
          gSt.showSol = true;
          gSt.streak = 0;
          render();
        });
        rootEl.querySelector('#btnGenNext')?.addEventListener('click', () => {
          const nextItem = generateRandomFromShortAnswers(curLesson, {
            prevPrompt: gSt.item?.prompt || '',
            prevSourceId: gSt.item?.sourceId || '',
          });
          if (nextItem) gSt.item = nextItem;
          gSt.userInput = '';
          gSt.checked = false;
          gSt.isCorrect = false;
          gSt.showSol = false;
          render();
          rootEl.querySelector('#rvGenSlots .sa-slots-overlay-input')?.focus();
        });
      }
    }
  }

  return {
    init(routeOpts = null) {
      if (!isAdmin() && state.editMode) {
        state.editMode = false;
        state.showPresetManager = false;
      }
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
      loadCurriculumFromServer();
    },
  };
}
