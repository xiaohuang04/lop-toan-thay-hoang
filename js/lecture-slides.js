import { api } from './api.js?v=20261126l';
import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';
import { cropPdfFiguresFromFile, replaceTokensInExamOrDeck } from './pdf-reader.js?v=20261126l';
import { mountAnimatedDropzone } from './ux-dropzone.js?v=20261124z2';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error(`Không đọc được tệp ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function pushGroupedSlides(slides, list, { part, badge, title, shortPrefix, chunkSize }) {
  const chunk = Math.max(1, Math.min(3, Number(chunkSize) || 1));
  for (let i = 0; i < list.length; i += chunk) {
    const slice = list.slice(i, i + chunk).map((q, k) => ({ num: i + k + 1, q }));
    const firstNum = slice[0].num;
    const lastNum = slice[slice.length - 1].num;
    slides.push({
      id: `s-p${part}-${firstNum}-${lastNum}`,
      part,
      partBadge: badge,
      partTitle: title,
      shortLabel: firstNum === lastNum ? `${shortPrefix} · Câu ${firstNum}` : `${shortPrefix} · Câu ${firstNum}–${lastNum}`,
      items: slice,
    });
  }
}

function buildSlidesFromDeck(deck, partChunk = { 1: 2, 3: 1, 4: 1 }) {
  if (!deck) return [];
  const slides = [];
  const p1 = Array.isArray(deck.part1) ? deck.part1 : [];
  const p2 = Array.isArray(deck.part2) ? deck.part2 : [];
  const p3 = Array.isArray(deck.part3) ? deck.part3 : [];
  const p4 = Array.isArray(deck.part4) ? deck.part4 : [];

  pushGroupedSlides(slides, p1, {
    part: 1,
    badge: 'PHẦN I',
    title: 'Trắc nghiệm nhiều phương án lựa chọn',
    shortPrefix: 'P.I',
    chunkSize: partChunk[1] || 2,
  });

  // PART II (Đúng/Sai): Strictly 1 question per slide
  pushGroupedSlides(slides, p2, {
    part: 2,
    badge: 'PHẦN II',
    title: 'Trắc nghiệm đúng / sai',
    shortPrefix: 'P.II',
    chunkSize: 1,
  });

  // PART III (Trả lời ngắn): Configurable 1 / 2 / 3 per slide (default 1)
  pushGroupedSlides(slides, p3, {
    part: 3,
    badge: 'PHẦN III',
    title: 'Trắc nghiệm trả lời ngắn',
    shortPrefix: 'P.III',
    chunkSize: partChunk[3] || 1,
  });

  // PART IV (Tự luận): Configurable 1 / 2 / 3 per slide (default 1)
  pushGroupedSlides(slides, p4, {
    part: 4,
    badge: 'PHẦN IV',
    title: 'Tự luận',
    shortPrefix: 'P.IV',
    chunkSize: partChunk[4] || 1,
  });

  return slides;
}

function estimateOptionsCols(options = [], dock = 'full', dockWidth = 48) {
  // Lightweight initial guess before KaTeX paints; autoLayoutOptionGrids() measures true pixel width right after KaTeX renders.
  const maxVisualLen = options.reduce((m, o) => {
    const rough = String(o.text || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\\(?:overrightarrow|overleftarrow|overleftrightarrow|widehat|widetilde|overline|underline|displaystyle|dfrac|tfrac|frac|left|right|text|mathrm|mathbb|cdot|times|sqrt)\b/g, 'x')
      .replace(/[{}$\\]/g, '');
    return Math.max(m, rough.trim().length);
  }, 0);
  if (dock !== 'full') {
    return dockWidth <= 40 || maxVisualLen > 28 ? 1 : 2;
  }
  if (maxVisualLen > 42) return 1;
  if (maxVisualLen > 18) return 2;
  return 4;
}

/**
 * Measure the true rendered pixel width of each option AFTER KaTeX paints
 * and choose 4 cols (1 row), 2 cols (2 rows), or 1 col (4 rows) accurately.
 */
function autoLayoutOptionGrids(container) {
  if (!container) return;
  const grids = container.querySelectorAll('.ls-opts-grid');
  if (!grids.length) return;

  grids.forEach((grid) => {
    const gridW = grid.clientWidth;
    if (gridW <= 60) return;

    const items = Array.from(grid.querySelectorAll('.ls-opt-item'));
    if (items.length === 0) return;

    let maxNeededW = 0;
    let hasBlockFigure = false;

    for (const item of items) {
      if (item.querySelector('.q-figure')) {
        hasBlockFigure = true;
        break;
      }
      const keyEl = item.querySelector('.ls-opt-key');
      const valEl = item.querySelector('.ls-opt-val');
      if (!valEl) continue;

      // Measure natural unwrapped pixel width of the rendered KaTeX/text content
      const prevStyle = valEl.style.cssText;
      valEl.style.flex = '0 0 auto';
      valEl.style.width = 'max-content';
      valEl.style.whiteSpace = 'nowrap';
      const valW = valEl.getBoundingClientRect().width;
      valEl.style.cssText = prevStyle;

      const keyW = keyEl ? keyEl.getBoundingClientRect().width : 30;
      // key + gap (10px) + content + button horizontal padding (24px) + border (3px) + breathing room (12px)
      const neededW = keyW + valW + 49;
      if (neededW > maxNeededW) maxNeededW = neededW;
    }

    const colGap = 14;
    let cols = 1;
    if (!hasBlockFigure) {
      if (items.length <= 4 && maxNeededW * 4 + colGap * 3 <= gridW) {
        cols = 4;
      } else if (maxNeededW * 2 + colGap <= gridW) {
        cols = 2;
      } else {
        cols = 1;
      }
    }

    grid.classList.remove('cols-1', 'cols-2', 'cols-4');
    grid.classList.add(`cols-${cols}`);
  });
}

function normalizeMathForSlides(html) {
  if (typeof html !== 'string' || !html) return html;

  const OP_MAP = {
    '−': '-',
    '≤': '\\le',
    '≥': '\\ge',
    '≠': '\\ne',
    '≈': '\\approx',
    '×': '\\times',
    '·': '\\cdot',
    '±': '\\pm',
  };

  // Process only outside HTML tags (<...>) so attributes/data URIs are never touched
  const parts = html.split(/(<[^>]+>)/g);
  const transformed = parts
    .map((chunk) => {
      if (!chunk || chunk.startsWith('<')) return chunk;

      let out = chunk;

      // Strip leftover ex_test / LaTeX layout commands (e.g. \choicew{0.4\textwidth}, \vspace{...})
      out = out.replace(
        /\\(?:choicew|choiceh|choiceTFw|choiceTFh|shortansw|vspace\*?|hspace\*?|label)\s*(?:\[[^\]]*\]\s*)?\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
        ''
      );
      out = out.replace(
        /\\(?:noindent|smallskip|medskip|bigskip|hfill|vfill|newpage|clearpage|pagebreak|centering|raggedright|raggedleft|selectfont)\b/g,
        ''
      );

      // Pass 1: Merge adjacent inline $...$ blocks separated by plain-text math operators
      // e.g. $\overrightarrow{AB}$= $\overrightarrow{AC}$ -> $\overrightarrow{AB} = \overrightarrow{AC}$
      let prev;
      do {
        prev = out;
        out = out.replace(
          /\$([^$\n]+)\$\s*(=|\+|-|−|<|>|≤|≥|≠|≈|×|·|±)\s*\$([^$\n]+)\$/g,
          (_, lhs, op, rhs) => `$${lhs} ${OP_MAP[op] || op} ${rhs}$`
        );
      } while (out !== prev);

      // Add breathing space when Vietnamese word or colon touches an opening $
      out = out.replace(/([A-Za-zÀ-ỹ:])(\$[^$\n]+\$)/g, '$1 $2');

      // Pass 2: Auto-wrap plain-text math fragments (outside existing $...$ / \(...\))
      const segs = out.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);
      out = segs
        .map((seg) => {
          if (!seg) return seg;
          if (seg.startsWith('$') || seg.startsWith('\\(') || seg.startsWith('\\[')) {
            // Pass 3: Normalize inside math blocks
            let s = seg;
            // Upgrade inline \frac{...}{...} -> \dfrac{...}{...} (except inside exponents/subscripts)
            s = s.replace(/(\^\{?|_\{?)?\\frac(?=\s*\{)/g, (match, prefix) => (prefix ? match : '\\dfrac'));
            // Default ALL vectors to \overrightarrow{...}
            s = s.replace(/\\vec\s*\{([^{}]+)\}/g, '\\overrightarrow{$1}');
            s = s.replace(/\\vec\s+([A-Za-z0-9])/g, '\\overrightarrow{$1}');
            // Default degree symbols (85^o, 85^{o}, 85°) -> ^\circ
            s = s.replace(/\^\{\s*\^\\circ\s*\}/g, '^\\circ');
            s = s.replace(/(\d)\s*\^\s*\{\s*[oO°]\s*\}/g, '$1^\\circ');
            s = s.replace(/(\d)\s*\^\s*[oO°](?![A-Za-z])/g, '$1^\\circ');
            s = s.replace(/(\d)\s*°/g, '$1^\\circ');
            // Tight coordinate semicolons with zero extra space: B(2 ; 1) / (0; -2) -> B(2{;}1) / (0{;}-2)
            s = s.replace(/(?:\\[,:! ]|\s)+(?=(?<!\\);)/g, '');
            s = s.replace(/(?<!\\);(?:\\[,:! ]|\s)+/g, ';');
            s = s.replace(/(?<!\\)(?<!\{);(?!\})/g, '{;}');
            return s;
          }

          // Plain text outside math: auto-wrap coordinates/intervals like (3; 1), A(-2; 5), [-2; +∞), (0; -1; 3)
          let t = seg;
          const coordAtom = '(?:[-+−]?\\s*(?:\\d+(?:[.,]\\d+)?|[a-zA-Z]|\\+?∞|-∞)(?:\\s*\\/\\s*\\d+)?)';
          const coordRe = new RegExp(
            `(?<![A-Za-zÀ-ỹ0-9])([A-Z](?=\\())?([\\(\\[])\\s*(${coordAtom})\\s*;\\s*(${coordAtom})(?:\\s*;\\s*(${coordAtom}))?\\s*([\\)\\]])`,
            'g'
          );
          t = t.replace(coordRe, (_, pt, lb, c1, c2, c3, rb) => {
            const cleanAtom = (a) =>
              String(a || '')
                .replace(/\s+/g, '')
                .replace(/−/g, '-')
                .replace(/∞/g, '\\infty')
                .replace(/^(-?\d+)\/(\d+)$/, '\\dfrac{$1}{$2}');
            const items = [cleanAtom(c1), cleanAtom(c2)];
            if (c3) items.push(cleanAtom(c3));
            const inner = items.join('{;}');
            const isTall = inner.includes('\\dfrac');
            const wrapped = isTall ? `\\left${lb}${inner}\\right${rb}` : `${lb}${inner}${rb}`;
            return `$${pt || ''}${wrapped}$`;
          });

          // Auto-wrap plain-text degrees like 45°, 120°
          t = t.replace(/(?<![A-Za-zÀ-ỹ0-9])(\d+(?:[.,]\d+)?)\s*°/g, '$$$1^\\circ$');

          // Auto-wrap plain-text simple equations/inequalities like x = 2, y ≤ 3, a > 0
          t = t.replace(
            /(?<![A-Za-zÀ-ỹ0-9])([a-zA-Z])\s*(=|<|>|≤|≥|≠)\s*([-+−]?\d+(?:[.,]\d+)?)(?![A-Za-zÀ-ỹ0-9])/g,
            (_, v, op, num) => `$${v} ${OP_MAP[op] || op} ${num.replace('−', '-')}$`
          );

          return t;
        })
        .join('');

      return out;
    })
    .join('');

  return transformed;
}

function renderShortAnswerCellsHtml(val = '') {
  const chars = Array.from(String(val || ''));
  const totalCells = Math.max(4, Math.min(6, chars.length));
  let out = '';
  for (let i = 0; i < totalCells; i++) {
    const ch = chars[i] || '';
    out += `<span class="ls-sa-cell ${ch ? 'is-filled' : ''}">${escapeHtml(ch)}</span>`;
  }
  return out;
}

function renderQuestionBlockHtml(part, item, { dock, dockWidth, demoMarks }) {
  const { num, q } = item;
  const stemHtml = normalizeMathForSlides(q.stem || '');
  if (part === 1) {
    const opts = Array.isArray(q.options) ? q.options : [];
    const cols = estimateOptionsCols(opts, dock, dockWidth);
    const pickedKey = demoMarks.p1[num] || '';
    return `
      <div class="ls-q-block is-p1" data-q-block="1-${num}">
        <div class="ls-q-stem">
          <span class="ls-q-num">Câu ${num}.</span>
          <span class="ls-q-text">${stemHtml}</span>
        </div>
        <div class="ls-opts-grid cols-${cols}">
          ${opts
            .map((o) => {
              const isPicked = pickedKey === o.key;
              return `
                <button
                  type="button"
                  class="ls-opt-item is-clickable ${isPicked ? 'is-picked' : ''}"
                  data-demo-p1="${num}"
                  data-demo-opt="${escapeAttr(o.key)}"
                  aria-pressed="${isPicked ? 'true' : 'false'}"
                >
                  <span class="ls-opt-key">${escapeHtml(o.key)}</span>
                  <span class="ls-opt-val">${normalizeMathForSlides(o.text || '')}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  if (part === 2) {
    const stmts = Array.isArray(q.statements) ? q.statements : [];
    return `
      <div class="ls-q-block is-p2" data-q-block="2-${num}">
        <div class="ls-q-stem">
          <span class="ls-q-num">Câu ${num}.</span>
          <span class="ls-q-text">${stemHtml}</span>
        </div>
        <div class="ls-tf-list">
          ${stmts
            .map((st) => {
              const markKey = `${num}-${st.key}`;
              const val = demoMarks.p2[markKey] || '';
              const rowCls = val === 'T' ? 'is-mark-true' : val === 'F' ? 'is-mark-false' : '';
              return `
                <div class="ls-tf-row ${rowCls}" data-tf-row="${escapeAttr(markKey)}">
                  <span class="ls-tf-key">${escapeHtml(st.key)})</span>
                  <span class="ls-tf-val">${normalizeMathForSlides(st.text || '')}</span>
                  <div class="ls-tf-actions" role="group" aria-label="Đánh dấu Đúng/Sai ý ${escapeAttr(st.key)}">
                    <button
                      type="button"
                      class="ls-tf-btn is-true ${val === 'T' ? 'active' : ''}"
                      data-demo-p2="${num}"
                      data-demo-st="${escapeAttr(st.key)}"
                      data-demo-val="T"
                      aria-pressed="${val === 'T' ? 'true' : 'false'}"
                      title="Đánh dấu Đúng"
                    >Đ</button>
                    <button
                      type="button"
                      class="ls-tf-btn is-false ${val === 'F' ? 'active' : ''}"
                      data-demo-p2="${num}"
                      data-demo-st="${escapeAttr(st.key)}"
                      data-demo-val="F"
                      aria-pressed="${val === 'F' ? 'true' : 'false'}"
                      title="Đánh dấu Sai"
                    >S</button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  if (part === 3) {
    const curVal = demoMarks.p3[num] || '';
    return `
      <div class="ls-q-block is-p3" data-q-block="3-${num}">
        <div class="ls-q-stem">
          <span class="ls-q-num">Câu ${num}.</span>
          <span class="ls-q-text">${stemHtml}</span>
        </div>
        <div class="ls-sa-box" data-sa-wrap="${num}">
          <span class="ls-sa-lbl">Đáp số:</span>
          <div class="ls-sa-cells-wrap" title="Bấm vào để gõ đáp số minh họa">
            <div class="ls-sa-cells" data-sa-cells="${num}">
              ${renderShortAnswerCellsHtml(curVal)}
            </div>
            <input
              type="text"
              class="ls-sa-input"
              data-demo-p3="${num}"
              maxlength="6"
              inputmode="text"
              autocomplete="off"
              spellcheck="false"
              aria-label="Ô điền đáp số minh họa Câu ${num}"
              value="${escapeAttr(curVal)}"
            />
          </div>
          <button
            type="button"
            class="ls-sa-clear ${curVal ? '' : 'hidden'}"
            data-demo-p3-clear="${num}"
            title="Xóa đáp số"
            aria-label="Xóa đáp số"
          >✕</button>
        </div>
      </div>
    `;
  }

  // Part 4 (Essay / Tự luận)
  return `
    <div class="ls-q-block is-p4" data-q-block="4-${num}">
      <div class="ls-q-stem">
        <span class="ls-q-num">Câu ${num}.</span>
        <span class="ls-q-text">${stemHtml}</span>
      </div>
    </div>
  `;
}

export function createLectureSlidesController({ uiHelpers }) {
  const { showToast, renderMath, fitInlineMath, openAiSettingsModal } = uiHelpers;

  const state = {
    deck: null, // { title, part1, part2, part3, part4 }
    warnings: [],
    lastLatexSource: '',
    aiConfigured: null, // null | true | false
    aiModel: '',
    partChunk: { 1: 2, 3: 1, 4: 1 }, // questions per slide for Parts I, III, IV (Part II is always 1)
    slideIdx: 0,
    dock: 'full', // 'left' | 'full' | 'right'
    dockWidth: 48, // percent when docked left or right (34..68)
    fontScale: 100, // 75..155
    showIndex: false,
    hideToolbar: false,
    isFullscreen: false,
    fsMode: null, // 'native' | 'css' | null
    loadingSample: false,
    zoomedFigSrc: null,
    zoomedFigScale: 100, // 60..240
    laserOn: false,
    laserSize: 'md', // 'sm' | 'md' | 'lg'
    laserTrail: true,
    demoMarks: {
      p1: {}, // { [qNum]: 'A' | 'B' | 'C' | 'D' }
      p2: {}, // { [`${qNum}-${stmtKey}`]: 'T' | 'F' }
      p3: {}, // { [qNum]: string }
    },
  };

  let mountEl = null;
  let keydownHandler = null;
  let fsChangeHandler = null;
  let stageResizeHandler = null;
  let laserMoveHandler = null;
  let laserLeaveHandler = null;
  let laserResizeHandler = null;
  let laserRafId = 0;
  let currentExamsRef = [];

  function getSlides() {
    return buildSlidesFromDeck(state.deck, state.partChunk);
  }

  function getNativeFsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function exitAllFullscreen({ rerender = true } = {}) {
    const nativeEl = getNativeFsElement();
    if (nativeEl) {
      try {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
      } catch {}
    }
    state.isFullscreen = false;
    state.fsMode = null;
    document.body.classList.remove('ls-fs-body-lock');
    if (rerender) renderCurrent();
  }

  function enterFullscreen() {
    state.isFullscreen = true;
    state.fsMode = 'css';
    document.body.classList.add('ls-fs-body-lock');
    renderCurrent();

    // Request native fullscreen on the persistent mountEl (NOT #lsPlayerShell, which is replaced by renderCurrent())
    // so navigating slides (Next/Prev) or toggling toolbar controls NEVER detaches the fullscreenElement!
    const fsTarget = mountEl || document.documentElement;
    if (!fsTarget) return;
    const req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen;
    if (typeof req === 'function') {
      try {
        const p = req.call(fsTarget);
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (getNativeFsElement()) {
              state.fsMode = 'native';
            }
          }).catch(() => {
            // Stay seamlessly in CSS fullscreen mode (e.g. inside IDE webview or iframe)
            state.fsMode = 'css';
          });
        }
      } catch {
        state.fsMode = 'css';
      }
    }
  }

  function toggleFullscreen() {
    if (state.isFullscreen || getNativeFsElement()) {
      exitAllFullscreen({ rerender: true });
    } else {
      enterFullscreen();
    }
  }

  function stopLaserLoop() {
    if (laserRafId) {
      cancelAnimationFrame(laserRafId);
      laserRafId = 0;
    }
    if (laserMoveHandler) {
      window.removeEventListener('pointermove', laserMoveHandler);
      laserMoveHandler = null;
    }
    if (laserLeaveHandler) {
      document.removeEventListener('pointerleave', laserLeaveHandler);
      laserLeaveHandler = null;
    }
    if (laserResizeHandler) {
      window.removeEventListener('resize', laserResizeHandler);
      laserResizeHandler = null;
    }
  }

  function detachGlobalListeners() {
    stopLaserLoop();
    if (stageResizeHandler) {
      window.removeEventListener('resize', stageResizeHandler);
      stageResizeHandler = null;
    }
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    if (fsChangeHandler) {
      document.removeEventListener('fullscreenchange', fsChangeHandler);
      document.removeEventListener('webkitfullscreenchange', fsChangeHandler);
      fsChangeHandler = null;
    }
  }

  function openDeck(deck, warnings = [], latexSource = '') {
    state.deck = {
      title: deck.title || 'Bài giảng trình chiếu',
      part1: Array.isArray(deck.part1) ? deck.part1 : [],
      part2: Array.isArray(deck.part2) ? deck.part2 : [],
      part3: Array.isArray(deck.part3) ? deck.part3 : [],
      part4: Array.isArray(deck.part4) ? deck.part4 : [],
    };
    const answerWarnRe = /(\\True|tạm đặt đáp án|chưa có đáp án|đáp án đúng|đáp số ngắn|chưa thấy đáp số|tạm đặt\s+[A0])/i;
    state.warnings = Array.isArray(warnings)
      ? warnings.filter((w) => w && !answerWarnRe.test(String(w)))
      : [];
    state.lastLatexSource = String(latexSource || '');
    state.slideIdx = 0;
    state.showIndex = false;
    state.demoMarks = { p1: {}, p2: {}, p3: {} };
    renderCurrent();
  }

  function openExamAsDeck(exam) {
    if (!exam) return;
    openDeck({
      title: exam.title || 'Đề trình chiếu',
      part1: exam.part1 || [],
      part2: exam.part2 || [],
      part3: exam.part3 || [],
      part4: exam.part4 || [],
    });
  }

  async function loadSampleDocx() {
    if (state.loadingSample) return;
    state.loadingSample = true;
    renderCurrent();
    try {
      const res = await api.getPresentationSample();
      openDeck(res.deck, res.warnings || []);
      showToast('Đã nạp xong Đề minh họa gốc (Word .docx)!', 'success');
    } catch (err) {
      showToast(err.message || 'Không nạp được đề mẫu.', 'error');
    } finally {
      state.loadingSample = false;
      renderCurrent();
    }
  }

  async function handleFileImport(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let res;
    if (ext === 'docx') {
      const b64 = await fileToBase64(file);
      res = await api.parsePresentation({ format: 'docx', base64Data: b64, filename: file.name });
    } else if (ext === 'pdf') {
      showToast('Đang đọc file PDF bằng Gemini Vision AI (thường mất 10–25 giây)...', 'info');
      const b64 = await fileToBase64(file);
      res = await api.parsePresentation({ format: 'pdf_base64', base64Data: b64, filename: file.name });
      if (res?.deck && Array.isArray(res.pendingPdfFigures) && res.pendingPdfFigures.length > 0) {
        const figMap = await cropPdfFiguresFromFile(file, res.pendingPdfFigures);
        replaceTokensInExamOrDeck(res.deck, figMap);
      }
    } else if (ext === 'tex' || ext === 'txt') {
      const text = await file.text();
      const fmt = text.includes('\\begin{ex}') || ext === 'tex' ? 'latex' : 'pdf';
      res = await api.parsePresentation({ format: fmt, content: text, filename: file.name });
    } else {
      throw new Error('Chỉ hỗ trợ file Word (.docx), PDF (.pdf) hoặc LaTeX (.tex).');
    }
    return res;
  }

  async function refreshAiStatus() {
    try {
      const cfg = await api.getAiSettings();
      state.aiConfigured = Boolean(cfg?.configured);
      state.aiModel = cfg?.model || '';
      const btn = mountEl?.querySelector('#btnLsAiSettings');
      if (btn) {
        btn.classList.toggle('is-ai-ready', state.aiConfigured);
        btn.innerHTML = state.aiConfigured
          ? `<span>● Gemini AI (PDF): Sẵn sàng</span>`
          : `<span>⚙ Cài đặt Gemini AI (Đọc PDF)</span>`;
      }
    } catch {}
  }

  function renderLauncherHtml(exams = []) {
    const aiLabel =
      state.aiConfigured === true
        ? '● Gemini AI (PDF): Sẵn sàng'
        : state.aiConfigured === false
          ? '⚙ Cài đặt Gemini AI (Đọc PDF)'
          : '⚙ Cài đặt Gemini AI (Đọc PDF)';
    return `
      <div class="ls-launcher">
        <div class="card ls-hero-card">
          <div class="ls-hero-top is-compact">
            <span class="badge badge-p1">Trình chiếu bài giảng</span>
            <button
              type="button"
              class="btn btn-secondary btn-sm ${state.aiConfigured ? 'is-ai-ready' : ''}"
              id="btnLsAiSettings"
              title="Cài đặt Gemini API Key (miễn phí) để đọc mọi file PDF sang LaTeX"
            >
              <span>${aiLabel}</span>
            </button>
          </div>

          <div id="lsDropzoneHost" style="margin-top:14px;"></div>

          <details class="ls-paste-details">
            <summary>Hoặc dán nhanh mã LaTeX / văn bản đề bài</summary>
            <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
              <textarea id="lsPasteInput" class="input-control" rows="5" placeholder="Dán mã LaTeX ex_test (\\begin{ex}...\\end{ex}) hoặc nội dung văn bản có PHẦN I / II / III / IV, Câu 1..."></textarea>
              <div style="display:flex; justify-content:flex-end;">
                <button type="button" class="btn btn-primary btn-sm" id="btnParsePastedSlides">Tạo slide trình chiếu →</button>
              </div>
            </div>
          </details>
        </div>

        ${
          exams.length > 0
            ? `
              <div class="card panel-card" style="margin-top:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
                  <strong style="font-size:0.95rem;">Hoặc trình chiếu ngay từ Ngân hàng đề thi (${exams.length})</strong>
                </div>
                <div class="ls-exam-pick-grid">
                  ${exams
                    .map((ex) => {
                      const c1 = ex.part1?.length || 0;
                      const c2 = ex.part2?.length || 0;
                      const c3 = ex.part3?.length || 0;
                      const c4 = ex.part4?.length || 0;
                      return `
                        <div class="ls-exam-pick-item">
                          <div style="min-width:0; flex:1;">
                            <div style="font-weight:700; font-size:0.9rem; color:var(--text);">${escapeHtml(ex.title)}</div>
                            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                              P.I: ${c1} • P.II: ${c2} • P.III: ${c3}${c4 ? ` • P.IV: ${c4}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            class="ls-exam-play-btn"
                            data-present-exam="${escapeAttr(ex.id)}"
                            title="Trình chiếu đề này"
                            aria-label="Trình chiếu ${escapeAttr(ex.title)}"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <rect x="2" y="3" width="20" height="14" rx="2.5"/>
                              <polygon points="10 7.2 15.6 10 10 12.8" fill="currentColor" stroke="none"/>
                              <line x1="8" y1="21" x2="16" y2="21"/>
                              <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                          </button>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `
            : ''
        }
      </div>
    `;
  }

  function renderStageHtml() {
    const slides = getSlides();
    if (!slides.length) {
      return `<div class="card panel-card" style="text-align:center; padding:40px;">Không có câu hỏi nào để trình chiếu. <button type="button" class="btn btn-secondary btn-sm" id="btnLsBack" style="margin-left:10px;">Nạp đề khác</button></div>`;
    }
    if (state.slideIdx >= slides.length) state.slideIdx = slides.length - 1;
    if (state.slideIdx < 0) state.slideIdx = 0;

    const cur = slides[state.slideIdx];
    const isDocked = state.dock === 'left' || state.dock === 'right';
    const dockStyle = `--ls-dock-w:${state.dockWidth}%; --ls-font-scale:${(state.fontScale / 100).toFixed(2)};`;

    // Show per-slide question count selector for Part I, Part III, Part IV — HIDE for Part II (Đúng/Sai)
    const showChunkSelector = cur.part === 1 || cur.part === 3 || cur.part === 4;
    const activeChunk = state.partChunk[cur.part] || 1;
    const partShortMap = { 1: 'P.I', 3: 'P.III', 4: 'P.IV' };

    return `
      <div class="ls-player-shell ${state.isFullscreen ? 'is-fs' : ''} ${state.hideToolbar ? 'is-bar-hidden' : ''}" id="lsPlayerShell">
        <!-- Compact Single-Row Control Toolbar -->
        <div class="ls-toolbar" id="lsToolbar">
          <div class="ls-tb-left">
            <button type="button" class="ls-tb-btn" id="btnLsBack" title="Quay lại chọn file đề khác">← Đổi đề</button>
            <span class="ls-deck-title" title="${escapeAttr(state.deck.title)}">${escapeHtml(state.deck.title)}</span>
          </div>

          <div class="ls-tb-controls">
            <!-- Icon-Only Dock Switcher: Left / Full / Right -->
            <div class="ls-seg ls-seg-icons" role="group" aria-label="Vị trí nội dung trình chiếu">
              <button
                type="button"
                class="ls-seg-btn is-icon-only ${state.dock === 'left' ? 'active' : ''}"
                data-ls-dock="left"
                title="Dồn trái (Phím 1)"
                aria-label="Dồn trái"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2.5"/>
                  <rect x="5.5" y="6.5" width="7" height="11" rx="1" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <button
                type="button"
                class="ls-seg-btn is-icon-only ${state.dock === 'full' ? 'active' : ''}"
                data-ls-dock="full"
                title="Chuẩn toàn trang (Phím 2)"
                aria-label="Chuẩn toàn trang"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2.5"/>
                  <rect x="6" y="7" width="12" height="10" rx="1" fill="currentColor" opacity="0.32" stroke="none"/>
                </svg>
              </button>
              <button
                type="button"
                class="ls-seg-btn is-icon-only ${state.dock === 'right' ? 'active' : ''}"
                data-ls-dock="right"
                title="Dồn phải (Phím 3)"
                aria-label="Dồn phải"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2.5"/>
                  <rect x="11.5" y="6.5" width="7" height="11" rx="1" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            </div>

            ${
              isDocked
                ? `
                  <label class="ls-width-slider" title="Kéo chỉnh bề rộng khung đề bài">
                    <input type="range" id="lsDockWidthSlider" min="34" max="68" step="2" value="${state.dockWidth}" />
                    <b id="lsDockWidthVal">${state.dockWidth}%</b>
                  </label>
                `
                : ''
            }

            ${
              showChunkSelector
                ? `
                  <span class="ls-tb-sep" aria-hidden="true"></span>
                  <div class="ls-seg ls-seg-compact" id="lsPartChunkBox" title="Số câu ${partShortMap[cur.part]} trên mỗi trang">
                    <span class="ls-seg-lbl">${partShortMap[cur.part]}:</span>
                    ${[1, 2, 3]
                      .map(
                        (n) => `
                      <button type="button" class="ls-seg-btn ${activeChunk === n ? 'active' : ''}" data-ls-part-chunk="${n}">${n} câu</button>
                    `
                      )
                      .join('')}
                  </div>
                `
                : ''
            }

            <span class="ls-tb-sep" aria-hidden="true"></span>

            <!-- Compact Font Zoom -->
            <div class="ls-seg ls-seg-compact" title="Cỡ chữ trình chiếu">
              <button type="button" class="ls-seg-btn" id="btnLsFontDown" title="Thu nhỏ cỡ chữ">A−</button>
              <span class="ls-font-val" id="lsFontVal">${state.fontScale}%</span>
              <button type="button" class="ls-seg-btn" id="btnLsFontUp" title="Phóng to cỡ chữ">A+</button>
            </div>

            <span class="ls-tb-sep" aria-hidden="true"></span>

            <!-- Red Laser Pointer Toggle -->
            <button
              type="button"
              class="ls-tb-btn is-icon ls-laser-btn ${state.laserOn ? 'is-laser-active' : ''}"
              id="btnLsLaser"
              title="Bút laser đỏ (Phím L)"
              aria-label="Bật/tắt bút laser đỏ"
              aria-pressed="${state.laserOn ? 'true' : 'false'}"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" stroke="#ef4444" stroke-width="1.6" opacity="0.35"/>
                <circle cx="12" cy="12" r="5" fill="#e60000"/>
              </svg>
            </button>
          </div>

          <div class="ls-tb-right">
            <button type="button" class="ls-tb-btn ${state.showIndex ? 'is-active' : ''}" id="btnLsIndex" title="Mở mục lục các trang">
              <span>${state.slideIdx + 1}/${slides.length}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
              </svg>
            </button>
            <div class="ls-nav-pair">
              <button type="button" class="ls-tb-btn is-icon" id="btnLsPrev" ${state.slideIdx === 0 ? 'disabled' : ''} title="Trang trước (←)" aria-label="Trang trước">◀</button>
              <button type="button" class="ls-tb-btn is-icon" id="btnLsNext" ${state.slideIdx >= slides.length - 1 ? 'disabled' : ''} title="Trang sau (→)" aria-label="Trang sau">▶</button>
            </div>
            <button type="button" class="ls-tb-btn is-primary" id="btnLsFullscreen" title="${state.isFullscreen ? 'Thoát toàn màn hình (Esc / F)' : 'Toàn màn hình (Phím F)'}">
              ${
                state.isFullscreen
                  ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg><span>Thu nhỏ</span>`
                  : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg><span>Toàn màn hình</span>`
              }
            </button>
            <button type="button" class="ls-tb-btn is-ghost" id="btnLsHideBar" title="Ẩn thanh công cụ">Ẩn</button>
          </div>
        </div>

        ${
          state.hideToolbar
            ? `
              <div class="ls-mini-float">
                <button type="button" class="ls-mini-btn" id="btnLsPrevFloat" ${state.slideIdx === 0 ? 'disabled' : ''} title="Trang trước">◀</button>
                <span class="ls-mini-counter">${state.slideIdx + 1}/${slides.length}</span>
                <button type="button" class="ls-mini-btn" id="btnLsNextFloat" ${state.slideIdx >= slides.length - 1 ? 'disabled' : ''} title="Trang sau">▶</button>
                <button type="button" class="ls-mini-btn ${state.dock === 'left' ? 'active' : ''}" data-ls-dock="left" title="Dồn trái">◧</button>
                <button type="button" class="ls-mini-btn ${state.dock === 'full' ? 'active' : ''}" data-ls-dock="full" title="Chuẩn">⬜</button>
                <button type="button" class="ls-mini-btn ${state.dock === 'right' ? 'active' : ''}" data-ls-dock="right" title="Dồn phải">◨</button>
                <button type="button" class="ls-mini-btn ${state.laserOn ? 'is-laser-mini' : ''}" id="btnLsLaserFloat" title="Bút laser đỏ (Phím L)">●</button>
                <button type="button" class="ls-mini-btn" id="btnLsFullscreenFloat" title="${state.isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}">${state.isFullscreen ? '✕' : '⛶'}</button>
                <button type="button" class="ls-mini-btn" id="btnLsShowBar" title="Hiện lại thanh công cụ">Hiện thanh</button>
              </div>
            `
            : ''
        }

        ${
          state.laserOn
            ? `
              <div class="ls-laser-pill" id="lsLaserPill" role="region" aria-label="Tùy chỉnh bút laser">
                <span class="ls-laser-brand">
                  <span class="ls-laser-pill-dot" aria-hidden="true"></span>
                  <span class="ls-laser-pill-title">Laser</span>
                </span>
                <span class="ls-laser-div" aria-hidden="true"></span>
                <div class="ls-laser-sizes" role="group" aria-label="Cỡ chấm laser">
                  <button type="button" class="ls-laser-sz-btn ${state.laserSize === 'sm' ? 'active' : ''}" data-laser-size="sm" title="Cỡ nhỏ" aria-label="Cỡ nhỏ"><span style="width:6px;height:6px;"></span></button>
                  <button type="button" class="ls-laser-sz-btn ${state.laserSize === 'md' ? 'active' : ''}" data-laser-size="md" title="Cỡ vừa" aria-label="Cỡ vừa"><span style="width:9px;height:9px;"></span></button>
                  <button type="button" class="ls-laser-sz-btn ${state.laserSize === 'lg' ? 'active' : ''}" data-laser-size="lg" title="Cỡ lớn" aria-label="Cỡ lớn"><span style="width:13px;height:13px;"></span></button>
                </div>
                <span class="ls-laser-div" aria-hidden="true"></span>
                <button
                  type="button"
                  class="ls-laser-trail-switch ${state.laserTrail ? 'active' : ''}"
                  id="btnLsLaserTrail"
                  role="switch"
                  aria-checked="${state.laserTrail ? 'true' : 'false'}"
                  title="Bật hoặc tắt vết sáng kéo dài của bút laser"
                >
                  <span class="ls-laser-trail-lbl">Vết sáng</span>
                  <span class="ls-laser-switch-track" aria-hidden="true"><span class="ls-laser-switch-thumb"></span></span>
                </button>
                <span class="ls-laser-div" aria-hidden="true"></span>
                <button type="button" class="ls-laser-close-btn" id="btnLsLaserOff" title="Tắt bút laser (Phím L)" aria-label="Tắt bút laser">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            `
            : ''
        }

        ${
          state.warnings.length > 0
            ? `<div class="ls-warn-banner">${state.warnings.map((w) => `<div>${escapeHtml(w)}</div>`).join('')}</div>`
            : ''
        }

        <!-- Main Slide Canvas -->
        <div class="ls-stage dock-${state.dock} ${state.laserOn ? 'is-laser-on' : ''}" id="lsStage" style="${dockStyle}">
          <div class="ls-content-col" id="lsContentCol">
            <div class="ls-slide-head">
              <span class="ls-part-pill part-${cur.part}">${escapeHtml(cur.partBadge)}</span>
              <span class="ls-part-name">${escapeHtml(cur.partTitle)}</span>
              <span class="ls-slide-counter-pill">${escapeHtml(cur.shortLabel)} • Trang ${state.slideIdx + 1}/${slides.length}</span>
            </div>

            <div class="ls-questions-stack count-${cur.items.length}">
              ${cur.items
                .map((it) =>
                  renderQuestionBlockHtml(cur.part, it, {
                    dock: state.dock,
                    dockWidth: state.dockWidth,
                    demoMarks: state.demoMarks,
                  })
                )
                .join('')}
            </div>
          </div>

          ${
            state.showIndex
              ? `
                <aside class="ls-index-drawer" id="lsIndexDrawer">
                  <div class="ls-index-head">
                    <strong>Mục lục (${slides.length} trang)</strong>
                    <div style="display:flex; align-items:center; gap:4px;">
                      ${
                        state.lastLatexSource
                          ? `<button type="button" class="btn btn-secondary btn-sm" id="btnCopySlideLatex" title="Sao chép mã LaTeX (ex_test) vừa trích xuất từ PDF">Chép TeX</button>`
                          : ''
                      }
                      <button type="button" class="btn btn-ghost btn-sm" id="btnCloseLsIndex">✕</button>
                    </div>
                  </div>
                  <div class="ls-index-list">
                    ${slides
                      .map(
                        (s, idx) => `
                      <button type="button" class="ls-index-item ${idx === state.slideIdx ? 'active' : ''}" data-ls-jump="${idx}">
                        <span class="ls-index-num">${idx + 1}</span>
                        <span class="ls-index-lbl">${escapeHtml(s.shortLabel)}</span>
                      </button>
                    `
                      )
                      .join('')}
                  </div>
                </aside>
              `
              : ''
          }
        </div>

        ${
          state.zoomedFigSrc
            ? `
              <div class="ls-fig-lightbox ${state.laserOn ? 'is-laser-on' : ''}" id="lsFigLightbox" role="dialog" aria-modal="true" aria-label="Phóng to hình vẽ">
                <div class="ls-lightbox-bar">
                  <span class="ls-lightbox-title">Hình vẽ phóng to</span>
                  <div class="ls-lightbox-controls">
                    <button type="button" class="ls-tb-btn is-icon" id="btnLsFigZoomOut" title="Thu nhỏ">−</button>
                    <span class="ls-font-val" id="lsFigZoomVal">${state.zoomedFigScale}%</span>
                    <button type="button" class="ls-tb-btn is-icon" id="btnLsFigZoomIn" title="Phóng to">+</button>
                    <button type="button" class="ls-tb-btn" id="btnLsFigZoomReset" title="Đặt lại 100%">100%</button>
                    <button type="button" class="ls-tb-btn is-primary" id="btnLsFigZoomClose" title="Đóng (Esc)">✕ Đóng</button>
                  </div>
                </div>
                <div class="ls-lightbox-body" id="lsFigLightboxBody">
                  <img
                    src="${escapeAttr(state.zoomedFigSrc)}"
                    alt="Hình vẽ phóng to"
                    class="ls-lightbox-img"
                    id="lsFigLightboxImg"
                    style="transform: scale(${(state.zoomedFigScale / 100).toFixed(2)});"
                  />
                </div>
              </div>
            `
            : ''
        }

        <canvas class="ls-laser-canvas ${state.laserOn ? '' : 'hidden'}" id="lsLaserCanvas" aria-hidden="true"></canvas>
      </div>
    `;
  }

  function renderCurrent() {
    if (!mountEl) return;
    detachGlobalListeners();

    if (!state.deck) {
      mountEl.innerHTML = renderLauncherHtml(currentExamsRef);
      bindLauncherEvents();
      return;
    }

    mountEl.innerHTML = renderStageHtml();
    bindStageEvents();
    const colEl = mountEl.querySelector('#lsContentCol');
    renderMath?.(colEl, () => autoLayoutOptionGrids(colEl));
  }

  function bindLauncherEvents() {
    mountEl.querySelector('#btnLsAiSettings')?.addEventListener('click', () => {
      openAiSettingsModal?.({
        onSaved: (cfg) => {
          state.aiConfigured = Boolean(cfg?.configured);
          state.aiModel = cfg?.model || '';
          renderCurrent();
        },
      });
    });
    if (state.aiConfigured === null) {
      refreshAiStatus();
    }

    const dzHost = mountEl.querySelector('#lsDropzoneHost');
    if (dzHost) {
      mountAnimatedDropzone(dzHost, {
        inputId: 'inpLectureSlideFile',
        accept: '.docx,.pdf,.tex,.txt',
        multiple: false,
        idleTitle: 'Kéo thả file đề vào đây để tạo slide trình chiếu',
        dragTitle: 'Thả file để tách câu hỏi ngay',
        subNote: 'Word (.docx) · PDF (.pdf — Gemini AI) · LaTeX (.tex)',
        hintText: '',
        maxBytes: 24 * 1024 * 1024,
        onProcess: async (file) => {
          if (!file) return null;
          return await handleFileImport(file);
        },
        onComplete: (res) => {
          if (res?.deck) {
            const d = res.deck;
            const total =
              (d.part1?.length || 0) + (d.part2?.length || 0) + (d.part3?.length || 0) + (d.part4?.length || 0);
            showToast(`Đã tách thành công ${total} câu hỏi thành trang trình chiếu!`, 'success');
            openDeck(d, res.warnings || [], res.latexSource || '');
          }
        },
        onError: (err) => {
          showToast(err?.message || 'Không thể tách câu hỏi từ tệp này.', 'error');
          if (err?.code === 'MISSING_GEMINI_KEY') {
            openAiSettingsModal?.({
              onSaved: (cfg) => {
                state.aiConfigured = Boolean(cfg?.configured);
                state.aiModel = cfg?.model || '';
                renderCurrent();
              },
            });
          }
        },
      });
    }

    mountEl.querySelector('#btnParsePastedSlides')?.addEventListener('click', async () => {
      const raw = mountEl.querySelector('#lsPasteInput')?.value.trim() || '';
      if (!raw) {
        showToast('Vui lòng dán nội dung đề bài hoặc mã LaTeX.', 'error');
        return;
      }
      try {
        const fmt = raw.includes('\\begin{ex}') ? 'latex' : 'pdf';
        const res = await api.parsePresentation({ format: fmt, content: raw, filename: 'Đề dán trực tiếp' });
        openDeck(res.deck, res.warnings || []);
        showToast('Đã tạo trang trình chiếu thành công!', 'success');
      } catch (err) {
        showToast(err.message || 'Không tách được câu hỏi từ nội dung đã dán.', 'error');
      }
    });

    mountEl.querySelectorAll('[data-present-exam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ex = currentExamsRef.find((e) => e.id === btn.dataset.presentExam);
        if (ex) openExamAsDeck(ex);
      });
    });
  }

  function stepSlide(delta) {
    const slides = getSlides();
    const next = Math.max(0, Math.min(slides.length - 1, state.slideIdx + delta));
    if (next !== state.slideIdx) {
      state.slideIdx = next;
      renderCurrent();
    }
  }

  function setDock(nextDock) {
    if (!['left', 'full', 'right'].includes(nextDock)) return;
    if (state.dock === nextDock) return;
    state.dock = nextDock;
    renderCurrent();
  }

  function bindInteractiveDemoMarks() {
    // Part I: Click A / B / C / D to highlight (demo only, toggleable, zero KaTeX re-render flicker)
    mountEl.querySelectorAll('[data-demo-p1]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qNum = Number(btn.dataset.demoP1);
        const optKey = btn.dataset.demoOpt;
        const nextVal = state.demoMarks.p1[qNum] === optKey ? '' : optKey;
        if (nextVal) state.demoMarks.p1[qNum] = nextVal;
        else delete state.demoMarks.p1[qNum];

        const block = btn.closest('.ls-q-block');
        if (!block) return;
        block.querySelectorAll('[data-demo-p1]').forEach((el) => {
          const picked = el.dataset.demoOpt === nextVal;
          el.classList.toggle('is-picked', picked);
          el.setAttribute('aria-pressed', picked ? 'true' : 'false');
          el.classList.remove('is-just-picked');
          if (picked) {
            void el.offsetWidth;
            el.classList.add('is-just-picked');
          }
        });
      });
    });

    // Part II: Click Đ / S buttons per statement (demo only, toggleable)
    mountEl.querySelectorAll('[data-demo-p2]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qNum = Number(btn.dataset.demoP2);
        const stKey = btn.dataset.demoSt;
        const val = btn.dataset.demoVal; // 'T' | 'F'
        const markKey = `${qNum}-${stKey}`;
        const nextVal = state.demoMarks.p2[markKey] === val ? '' : val;
        if (nextVal) state.demoMarks.p2[markKey] = nextVal;
        else delete state.demoMarks.p2[markKey];

        const row = btn.closest('.ls-tf-row');
        if (!row) return;
        row.classList.toggle('is-mark-true', nextVal === 'T');
        row.classList.toggle('is-mark-false', nextVal === 'F');
        row.querySelectorAll('[data-demo-p2]').forEach((b) => {
          const act = b.dataset.demoVal === nextVal;
          b.classList.toggle('active', act);
          b.setAttribute('aria-pressed', act ? 'true' : 'false');
        });
      });
    });

    // Part III: Short answer 4-cell demo input
    mountEl.querySelectorAll('[data-demo-p3]').forEach((inp) => {
      const qNum = Number(inp.dataset.demoP3);
      const wrap = inp.closest('[data-sa-wrap]');
      const cellsEl = wrap?.querySelector('[data-sa-cells]');
      const clearBtn = wrap?.querySelector('[data-demo-p3-clear]');

      const syncCells = (raw) => {
        const clean = String(raw || '').slice(0, 6);
        if (clean) state.demoMarks.p3[qNum] = clean;
        else delete state.demoMarks.p3[qNum];
        if (cellsEl) cellsEl.innerHTML = renderShortAnswerCellsHtml(clean);
        if (clearBtn) clearBtn.classList.toggle('hidden', !clean);
      };

      inp.addEventListener('focus', () => wrap?.classList.add('is-focused'));
      inp.addEventListener('blur', () => wrap?.classList.remove('is-focused'));
      inp.addEventListener('input', () => syncCells(inp.value));

      clearBtn?.addEventListener('click', () => {
        inp.value = '';
        syncCells('');
        inp.focus();
      });
    });
  }

  function enhanceSlideFigures() {
    const col = mountEl?.querySelector('#lsContentCol');
    if (!col) return;
    col.querySelectorAll('.q-figure img, img.tikz-figure').forEach((img) => {
      if (img.classList.contains('inline-eq-img')) return;
      const fig = img.closest('.q-figure') || img.parentElement;
      if (!fig || fig.querySelector('.ls-fig-zoom-btn')) return;

      const wrap = document.createElement('div');
      wrap.className = 'ls-fig-wrap';
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);

      const zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'ls-fig-zoom-btn';
      zoomBtn.title = 'Phóng to hình vẽ toàn màn hình';
      zoomBtn.setAttribute('aria-label', 'Phóng to hình vẽ toàn màn hình');
      zoomBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
      wrap.appendChild(zoomBtn);

      const openZoom = (e) => {
        e.stopPropagation();
        const src = img.getAttribute('src');
        if (!src) return;
        state.zoomedFigSrc = src;
        state.zoomedFigScale = 100;
        renderCurrent();
      };
      zoomBtn.addEventListener('click', openZoom);
      img.addEventListener('dblclick', openZoom);
    });
  }

  function initLaserEngine() {
    stopLaserLoop();
    if (!state.laserOn || !mountEl) return;
    const canvas = mountEl.querySelector('#lsLaserCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SIZE_RADIUS = { sm: 5.5, md: 9, lg: 14 };
    const TRAIL_MS = 460;
    const points = [];
    let pointer = null; // { x, y }
    let visible = false;

    const syncCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncCanvasSize();

    // Subdivide raw points into a silky Catmull-Rom / midpoint-smoothed curve
    const buildSmoothPoints = (raw) => {
      if (raw.length <= 2) return raw;
      const out = [raw[0]];
      for (let i = 1; i < raw.length - 1; i++) {
        const p0 = raw[i - 1];
        const p1 = raw[i];
        const p2 = raw[i + 1];
        const mx1 = (p0.x + p1.x) * 0.5;
        const my1 = (p0.y + p1.y) * 0.5;
        const mx2 = (p1.x + p2.x) * 0.5;
        const my2 = (p1.y + p2.y) * 0.5;
        const mt1 = (p0.t + p1.t) * 0.5;
        const mt2 = (p1.t + p2.t) * 0.5;
        for (let s = 1; s <= 3; s++) {
          const u = s / 3;
          const inv = 1 - u;
          out.push({
            x: inv * inv * mx1 + 2 * inv * u * p1.x + u * u * mx2,
            y: inv * inv * my1 + 2 * inv * u * p1.y + u * u * my2,
            t: mt1 + (mt2 - mt1) * u,
          });
        }
      }
      out.push(raw[raw.length - 1]);
      return out;
    };

    // Draw ONE single closed tapered polygon ribbon -> ZERO round knots / beads!
    const drawSmoothTaperedTrail = (rawPts, now, maxHalfW) => {
      if (rawPts.length < 2) return;
      const pts = buildSmoothPoints(rawPts);
      const n = pts.length;
      if (n < 2) return;

      const leftPts = [];
      const rightPts = [];
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(n - 1, i + 1)];
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        // Normal vector
        const nx = -dy;
        const ny = dx;

        const life = Math.max(0, Math.min(1, 1 - (now - p.t) / TRAIL_MS));
        const posRatio = i / (n - 1);
        // Smooth cubic taper from sharp tip (0) to full radius at pointer head
        const w = maxHalfW * Math.pow(life * posRatio, 0.85);
        leftPts.push({ x: p.x + nx * w, y: p.y + ny * w });
        rightPts.push({ x: p.x - nx * w, y: p.y - ny * w });
      }

      const tail = pts[0];
      const head = pts[n - 1];
      const headLife = Math.max(0, Math.min(1, 1 - (now - head.t) / TRAIL_MS));

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      for (let i = 1; i < n; i++) {
        ctx.lineTo(leftPts[i].x, leftPts[i].y);
      }
      for (let i = n - 1; i >= 0; i--) {
        ctx.lineTo(rightPts[i].x, rightPts[i].y);
      }
      ctx.closePath();

      const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      grad.addColorStop(0.45, `rgba(220, 38, 38, ${(0.42 * headLife).toFixed(3)})`);
      grad.addColorStop(1, `rgba(239, 12, 12, ${(0.92 * headLife).toFixed(3)})`);
      ctx.shadowColor = 'rgba(239, 0, 0, 0.38)';
      ctx.shadowBlur = maxHalfW * 1.1;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    };

    const drawFrame = () => {
      laserRafId = 0;
      const now = performance.now();
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      while (points.length && now - points[0].t > TRAIL_MS) {
        points.shift();
      }

      const r = SIZE_RADIUS[state.laserSize] || 9;

      // Liquid-smooth tapered crimson trail (zero beads/knots)
      if (state.laserTrail && points.length > 1) {
        drawSmoothTaperedTrail(points, now, r * 0.78);
      }

      // Vivid saturated solid red laser dot (NO white center!)
      if (visible && pointer) {
        const { x, y } = pointer;
        // Tight rich red outer glow
        const halo = ctx.createRadialGradient(x, y, r * 0.65, x, y, r * 1.85);
        halo.addColorStop(0, 'rgba(239, 0, 0, 0.42)');
        halo.addColorStop(0.55, 'rgba(220, 38, 38, 0.16)');
        halo.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.85, 0, Math.PI * 2);
        ctx.fill();

        // Solid crisp deep-red laser core
        ctx.fillStyle = '#e60000';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }

      if (points.length > 0) {
        laserRafId = requestAnimationFrame(drawFrame);
      }
    };

    const kickDraw = () => {
      if (!laserRafId) {
        laserRafId = requestAnimationFrame(drawFrame);
      }
    };

    laserMoveHandler = (e) => {
      const target = e.target;
      const inStage = Boolean(
        target?.closest?.('#lsStage') || target?.closest?.('#lsFigLightboxBody')
      );
      const inChrome = Boolean(
        target?.closest?.('#lsToolbar, #lsLaserPill, .ls-mini-float, #lsIndexDrawer, .ls-lightbox-bar')
      );
      if (!inStage || inChrome) {
        if (visible) {
          visible = false;
          kickDraw();
        }
        return;
      }
      visible = true;
      pointer = { x: e.clientX, y: e.clientY };
      if (state.laserTrail) {
        const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        const now = performance.now();
        for (const ev of samples) {
          const last = points[points.length - 1];
          const dx = last ? ev.clientX - last.x : 99;
          const dy = last ? ev.clientY - last.y : 99;
          if (dx * dx + dy * dy >= 6) {
            points.push({ x: ev.clientX, y: ev.clientY, t: now });
            if (points.length > 100) points.shift();
          }
        }
      } else if (points.length) {
        points.length = 0;
      }
      kickDraw();
    };

    laserLeaveHandler = () => {
      visible = false;
      kickDraw();
    };

    laserResizeHandler = syncCanvasSize;

    window.addEventListener('pointermove', laserMoveHandler, { passive: true });
    document.addEventListener('pointerleave', laserLeaveHandler, { passive: true });
    window.addEventListener('resize', laserResizeHandler, { passive: true });
  }

  function toggleLaser() {
    state.laserOn = !state.laserOn;
    renderCurrent();
  }

  function bindStageEvents() {
    mountEl.querySelector('#btnLsBack')?.addEventListener('click', () => {
      exitAllFullscreen({ rerender: false });
      state.deck = null;
      state.warnings = [];
      state.hideToolbar = false;
      state.showIndex = false;
      state.zoomedFigSrc = null;
      state.laserOn = false;
      renderCurrent();
    });

    mountEl.querySelectorAll('[data-ls-dock]').forEach((btn) => {
      btn.addEventListener('click', () => setDock(btn.dataset.lsDock));
    });

    const widthSlider = mountEl.querySelector('#lsDockWidthSlider');
    const widthVal = mountEl.querySelector('#lsDockWidthVal');
    const stageEl = mountEl.querySelector('#lsStage');
    if (widthSlider && stageEl) {
      widthSlider.addEventListener('input', () => {
        const val = Number(widthSlider.value) || 48;
        state.dockWidth = val;
        if (widthVal) widthVal.textContent = `${val}%`;
        stageEl.style.setProperty('--ls-dock-w', `${val}%`);
        const colEl = mountEl.querySelector('#lsContentCol');
        fitInlineMath?.(colEl);
        autoLayoutOptionGrids(colEl);
      });
      widthSlider.addEventListener('change', () => {
        const colEl = mountEl.querySelector('#lsContentCol');
        fitInlineMath?.(colEl);
        autoLayoutOptionGrids(colEl);
      });
    }

    mountEl.querySelectorAll('[data-ls-part-chunk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextChunk = Number(btn.dataset.lsPartChunk) || 1;
        const curSlides = getSlides();
        const curSlide = curSlides[state.slideIdx];
        const anchorPart = curSlide?.part || 1;
        if (anchorPart !== 1 && anchorPart !== 3 && anchorPart !== 4) return;
        if (state.partChunk[anchorPart] === nextChunk) return;

        const anchorQNum = curSlide?.items?.[0]?.num || 1;
        state.partChunk[anchorPart] = nextChunk;
        const newSlides = getSlides();
        const matchIdx = newSlides.findIndex(
          (s) => s.part === anchorPart && s.items.some((it) => it.num === anchorQNum)
        );
        state.slideIdx = matchIdx >= 0 ? matchIdx : 0;
        renderCurrent();
      });
    });

    mountEl.querySelector('#btnLsFontDown')?.addEventListener('click', () => {
      state.fontScale = Math.max(75, state.fontScale - 10);
      renderCurrent();
    });
    mountEl.querySelector('#btnLsFontUp')?.addEventListener('click', () => {
      state.fontScale = Math.min(155, state.fontScale + 10);
      renderCurrent();
    });

    mountEl.querySelector('#btnLsPrev')?.addEventListener('click', () => stepSlide(-1));
    mountEl.querySelector('#btnLsNext')?.addEventListener('click', () => stepSlide(1));
    mountEl.querySelector('#btnLsPrevFloat')?.addEventListener('click', () => stepSlide(-1));
    mountEl.querySelector('#btnLsNextFloat')?.addEventListener('click', () => stepSlide(1));

    mountEl.querySelector('#btnLsIndex')?.addEventListener('click', () => {
      state.showIndex = !state.showIndex;
      renderCurrent();
    });
    mountEl.querySelector('#btnCloseLsIndex')?.addEventListener('click', () => {
      state.showIndex = false;
      renderCurrent();
    });
    mountEl.querySelector('#btnCopySlideLatex')?.addEventListener('click', async () => {
      if (!state.lastLatexSource) return;
      try {
        await navigator.clipboard.writeText(state.lastLatexSource);
        showToast('Đã sao chép toàn bộ mã LaTeX (ex_test) vào bộ nhớ tạm!', 'success');
      } catch {
        showToast('Trình duyệt không cho phép sao chép tự động.', 'error');
      }
    });
    mountEl.querySelectorAll('[data-ls-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.slideIdx = Number(btn.dataset.lsJump) || 0;
        state.showIndex = false;
        renderCurrent();
      });
    });

    mountEl.querySelector('#btnLsFullscreen')?.addEventListener('click', toggleFullscreen);
    mountEl.querySelector('#btnLsFullscreenFloat')?.addEventListener('click', toggleFullscreen);
    mountEl.querySelector('#btnLsLaser')?.addEventListener('click', toggleLaser);
    mountEl.querySelector('#btnLsLaserFloat')?.addEventListener('click', toggleLaser);
    mountEl.querySelector('#btnLsLaserOff')?.addEventListener('click', () => {
      state.laserOn = false;
      renderCurrent();
    });
    mountEl.querySelectorAll('[data-laser-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sz = btn.dataset.laserSize;
        if (!['sm', 'md', 'lg'].includes(sz)) return;
        state.laserSize = sz;
        mountEl.querySelectorAll('[data-laser-size]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    mountEl.querySelector('#btnLsLaserTrail')?.addEventListener('click', (e) => {
      state.laserTrail = !state.laserTrail;
      const btn = e.currentTarget;
      btn.classList.toggle('active', state.laserTrail);
      btn.setAttribute('aria-checked', state.laserTrail ? 'true' : 'false');
    });

    // Figure fullscreen lightbox controls
    const updateLightboxScale = (next) => {
      state.zoomedFigScale = Math.max(60, Math.min(240, next));
      const imgEl = mountEl.querySelector('#lsFigLightboxImg');
      const valEl = mountEl.querySelector('#lsFigZoomVal');
      if (imgEl) imgEl.style.transform = `scale(${(state.zoomedFigScale / 100).toFixed(2)})`;
      if (valEl) valEl.textContent = `${state.zoomedFigScale}%`;
    };
    mountEl.querySelector('#btnLsFigZoomOut')?.addEventListener('click', () => updateLightboxScale(state.zoomedFigScale - 20));
    mountEl.querySelector('#btnLsFigZoomIn')?.addEventListener('click', () => updateLightboxScale(state.zoomedFigScale + 20));
    mountEl.querySelector('#btnLsFigZoomReset')?.addEventListener('click', () => updateLightboxScale(100));
    mountEl.querySelector('#btnLsFigZoomClose')?.addEventListener('click', () => {
      state.zoomedFigSrc = null;
      renderCurrent();
    });
    mountEl.querySelector('#lsFigLightboxBody')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        state.zoomedFigSrc = null;
        renderCurrent();
      }
    });

    mountEl.querySelector('#btnLsHideBar')?.addEventListener('click', () => {
      state.hideToolbar = true;
      renderCurrent();
    });
    mountEl.querySelector('#btnLsShowBar')?.addEventListener('click', () => {
      state.hideToolbar = false;
      renderCurrent();
    });

    bindInteractiveDemoMarks();
    enhanceSlideFigures();
    initLaserEngine();

    keydownHandler = (e) => {
      if (!mountEl || !mountEl.isConnected || !state.deck) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (state.zoomedFigSrc) return;
        e.preventDefault();
        stepSlide(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (state.zoomedFigSrc) return;
        e.preventDefault();
        stepSlide(-1);
      } else if (e.key === '1') {
        setDock('left');
      } else if (e.key === '2') {
        setDock('full');
      } else if (e.key === '3') {
        setDock('right');
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLaser();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (state.zoomedFigSrc) {
          state.zoomedFigSrc = null;
          renderCurrent();
        } else if (state.showIndex) {
          state.showIndex = false;
          renderCurrent();
        } else if (state.isFullscreen && state.fsMode === 'css') {
          exitAllFullscreen({ rerender: true });
        }
      }
    };
    window.addEventListener('keydown', keydownHandler);

    fsChangeHandler = () => {
      const nativeEl = getNativeFsElement();
      if (!nativeEl && state.fsMode === 'native') {
        state.isFullscreen = false;
        state.fsMode = null;
        document.body.classList.remove('ls-fs-body-lock');
        renderCurrent();
      }
    };
    stageResizeHandler = () => {
      const colEl = mountEl?.querySelector('#lsContentCol');
      if (!colEl) return;
      fitInlineMath?.(colEl);
      autoLayoutOptionGrids(colEl);
    };
    window.addEventListener('resize', stageResizeHandler, { passive: true });

    document.addEventListener('fullscreenchange', fsChangeHandler);
    document.addEventListener('webkitfullscreenchange', fsChangeHandler);
  }

  return {
    mount(containerEl, { exams = [] } = {}) {
      mountEl = containerEl;
      currentExamsRef = exams;
      renderCurrent();
    },
    setExams(exams = []) {
      currentExamsRef = Array.isArray(exams) ? exams : [];
      if (mountEl && !state.deck) {
        renderCurrent();
      }
    },
    presentExam(exam) {
      openExamAsDeck(exam);
    },
    cleanup() {
      detachGlobalListeners();
      if (state.isFullscreen) {
        exitAllFullscreen({ rerender: false });
      }
    },
  };
}
