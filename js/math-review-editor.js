/**
 * Zero-HTML Hierarchical Content Editor & Custom Box Preset System for `/on-tap`
 * Admin-only module imported by `math-review.js`.
 * Teachers write plain Vietnamese + LaTeX `$...$` + `**in đậm**` + `[CHE: ...]` — NEVER raw HTML tags!
 */

import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';

export const BOX_ICON_SVGS = {
  book: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  award: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,
  sigma: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 4H6l6 8-6 8h12"/></svg>`,
  compass: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  bulb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0 0 12 2z"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  calc: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/><line x1="8" y1="19" x2="16" y2="19"/></svg>`,
  star: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

export const BOX_ICON_LABELS = [
  { key: 'book', label: 'Sách (Định nghĩa)' },
  { key: 'award', label: 'Huy hiệu (Định lí)' },
  { key: 'sigma', label: 'Sigma (Công thức)' },
  { key: 'compass', label: 'La bàn (Phương pháp)' },
  { key: 'bulb', label: 'Bóng đèn (Lưu ý/Mẹo)' },
  { key: 'check', label: 'Tích xanh (Nhận xét)' },
  { key: 'calc', label: 'Máy tính (Casio)' },
  { key: 'star', label: 'Ngôi sao (Trọng tâm)' },
];

export const BOX_STYLE_OPTIONS = [
  { value: 'editorial', label: 'Mở thoáng (thanh màu trái)' },
  { value: 'tinted', label: 'Hộp nền màu nhẹ' },
  { value: 'outlined', label: 'Hộp viền mảnh nổi bật' },
];

export const BOX_COLOR_SWATCHES = [
  { name: 'Xanh dương', accent: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { name: 'Tím Indigo', accent: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { name: 'Hồng sen', accent: '#db2777', bg: '#fdf2f8', border: '#fbcfe8' },
  { name: 'Xanh ngọc', accent: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
  { name: 'Cam ấm', accent: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  { name: 'Xanh lá', accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { name: 'Đỏ san hô', accent: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
  { name: 'Xanh lam', accent: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  { name: 'Vàng hổ phách', accent: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { name: 'Xám đá', accent: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
];

export function renderBoxIconSvg(iconKey) {
  return BOX_ICON_SVGS[iconKey] || BOX_ICON_SVGS.book;
}

export function deriveBoxColorsFromHex(hex) {
  const clean = /^#[0-9a-fA-F]{6}$/.test(String(hex || '').trim()) ? String(hex).trim() : '#2563eb';
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  const mix = (c, ratio) => Math.round(c * ratio + 255 * (1 - ratio));
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return {
    accent: clean,
    bg: `#${toHex(mix(r, 0.08))}${toHex(mix(g, 0.08))}${toHex(mix(b, 0.08))}`,
    border: `#${toHex(mix(r, 0.28))}${toHex(mix(g, 0.28))}${toHex(mix(b, 0.28))}`,
  };
}

export function resolveBoxPreset(typeId, boxPresets) {
  const found = (boxPresets || []).find((p) => p.id === typeId);
  if (found) return found;
  return (
    (boxPresets || [])[0] || {
      id: 'theory',
      name: 'Định nghĩa / Lý thuyết',
      accent: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
      icon: 'book',
      style: 'editorial',
      builtin: true,
    }
  );
}

/**
 * Zero-HTML Friendly Text Conversion:
 * Converts stored HTML (`<strong>...</strong>`, `<br/>`) <-> friendly teacher syntax (`**...**`, newlines)
 * so teachers NEVER have to read or write raw HTML tags!
 */
export function htmlToFriendlyInline(rawHtml) {
  return String(rawHtml || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

export function friendlyInlineToHtml(rawText) {
  let s = String(rawText || '').trim();
  if (!s) return '';
  // Convert **bold** -> <strong>bold</strong>
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  // Convert *italic* (avoiding math like \mathbb{N}^* by requiring non-space boundary & not preceded by ^)
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:?!)]|$)/g, '$1<em>$2</em>');
  // Convert user newlines to <br/> (avoiding extra <br/> immediately before/after $$ block math)
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\n\s*(\$\$)/g, ' $1');
  s = s.replace(/(\$\$)\s*\n/g, '$1 ');
  s = s.replace(/\n/g, '<br/>');
  return s;
}

/**
 * Parse a knowledge line's stored HTML into:
 * - `text`: zero-HTML friendly text (plain Vietnamese + LaTeX + `**in đậm**`)
 * - `tagsKind`: `'chips'` (numbered 1, 2, 3...) | `'cases'` (colored case pills) | `''`
 * - `tags`: `[{ text, tone }]`
 */
export function parseItemForFriendlyEdit(rawHtml) {
  let src = String(rawHtml || '');
  let tagsKind = '';
  const tags = [];

  const chipListRe = /<div\s+class="rv-chip-list"[^>]*>([\s\S]*?)<\/div>/i;
  const caseRowRe = /<div\s+class="rv-case-row"[^>]*>([\s\S]*?)<\/div>/i;

  const chipMatch = src.match(chipListRe);
  if (chipMatch) {
    tagsKind = 'chips';
    const itemRe = /<span\s+class="rv-chip-item"[^>]*>([\s\S]*?)<\/span>(?=\s*(?:<span\s+class="rv-chip-item"|$))/gi;
    // Note: rv-chip-item contains inner <span class="rv-chip-num">N</span>, so match cleanly:
    const innerRe = /<span\s+class="rv-chip-item"[^>]*>\s*(?:<span\s+class="rv-chip-num"[^>]*>[^<]*<\/span>)?([\s\S]*?)<\/span>/gi;
    let m;
    while ((m = innerRe.exec(chipMatch[1])) !== null) {
      tags.push({ text: htmlToFriendlyInline(m[1]), tone: 'default' });
    }
    if (!tags.length) {
      let m2;
      while ((m2 = itemRe.exec(chipMatch[1])) !== null) {
        tags.push({ text: htmlToFriendlyInline(m2[1].replace(/<span[^>]*>\d+<\/span>/i, '')), tone: 'default' });
      }
    }
    src = src.replace(chipListRe, '');
  } else {
    const caseMatch = src.match(caseRowRe);
    if (caseMatch) {
      tagsKind = 'cases';
      const pillRe = /<span\s+class="rv-case-pill([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi;
      let m;
      while ((m = pillRe.exec(caseMatch[1])) !== null) {
        const cls = m[1] || '';
        const tone = cls.includes('is-up')
          ? 'up'
          : cls.includes('is-down')
            ? 'down'
            : cls.includes('is-flat')
              ? 'flat'
              : 'default';
        tags.push({ text: htmlToFriendlyInline(m[2]), tone });
      }
      src = src.replace(caseRowRe, '');
    }
  }

  return {
    text: htmlToFriendlyInline(src),
    tagsKind,
    tags,
  };
}

export function buildItemHtmlFromFriendly({ text, tagsKind, tags }) {
  const mainHtml = friendlyInlineToHtml(text);
  const cleanTags = (tags || []).filter((t) => String(t?.text ?? '').trim() !== '' || (tags || []).length > 0);
  if (!cleanTags.length) return mainHtml;

  if (tagsKind === 'chips') {
    const chipsHtml = cleanTags
      .map(
        (t, idx) =>
          `<span class="rv-chip-item"><span class="rv-chip-num">${idx + 1}</span>${friendlyInlineToHtml(t.text)}</span>`
      )
      .join('');
    return `${mainHtml}<div class="rv-chip-list">${chipsHtml}</div>`;
  }

  const casesHtml = cleanTags
    .map((t) => {
      const toneCls =
        t.tone === 'up' ? ' is-up' : t.tone === 'down' ? ' is-down' : t.tone === 'flat' ? ' is-flat' : '';
      return `<span class="rv-case-pill${toneCls}">${friendlyInlineToHtml(t.text)}</span>`;
    })
    .join('');
  return `${mainHtml}<div class="rv-case-row">${casesHtml}</div>`;
}

/**
 * Normalize a coreCard into structured per-line `items[]` (with optional inline example per line),
 * seamlessly migrating any legacy `card.content` HTML string without data loss.
 */
export function ensureCoreCardItems(card) {
  if (!card) return [];
  if (Array.isArray(card.items)) return card.items;
  const raw = String(card.content || '').trim();
  const items = [];
  if (raw) {
    const liMatches = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    if (liMatches.length > 0) {
      liMatches.forEach((m, idx) => {
        items.push({
          id: `${card.id || 'c'}-i${idx + 1}`,
          html: m[1].trim(),
          hasExample: false,
          example: null,
        });
      });
    } else {
      const cleaned = raw.replace(/^<p[^>]*>([\s\S]*?)<\/p>$/i, '$1').trim();
      items.push({
        id: `${card.id || 'c'}-i1`,
        html: cleaned || raw,
        hasExample: false,
        example: null,
      });
    }
  }
  card.items = items;
  return items;
}

function estimateRows(text, min = 2, max = 5) {
  const s = String(text || '');
  const lineBreaks = (s.match(/\n/g) || []).length + 1;
  const byLen = Math.ceil(s.length / 78);
  return Math.max(min, Math.min(max, Math.max(lineBreaks, byLen)));
}

export function renderEditorCommandBarHtml({ isDirty, isSaving, showPresetManager }) {
  return `
    <div class="rv-ed-topbar">
      <div class="rv-ed-top-left">
        <span class="rv-ed-mode-pill">
          <span class="rv-ed-live-dot"></span>
          Chế độ biên soạn
        </span>
        <span class="rv-ed-dirty-badge ${isDirty ? 'is-dirty' : 'is-saved'}">
          ${isDirty ? '● Có thay đổi chưa lưu' : '✓ Đã đồng bộ'}
        </span>
      </div>
      <div class="rv-ed-top-actions">
        <button
          type="button"
          class="rv-ed-btn ${showPresetManager ? 'is-active' : ''}"
          id="btnToggleBoxPresets"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
          <span>Quản lý loại Box</span>
        </button>
        <button type="button" class="rv-ed-btn" id="btnExitReviewEdit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Xem trước</span>
        </button>
        <button type="button" class="rv-ed-btn is-save" id="btnSaveReviewCurriculum" ${isSaving ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span>${isSaving ? 'Đang lưu...' : 'Lưu lên web'}</span>
        </button>
      </div>
    </div>
  `;
}

export function renderBoxPresetManagerHtml({ boxPresets, draftPreset }) {
  const dp = draftPreset || {
    name: '',
    accent: '#2563eb',
    icon: 'star',
    style: 'tinted',
  };
  return `
    <div class="rv-ed-preset-drawer" id="rvBoxPresetDrawer">
      <div class="rv-ed-preset-head">
        <div>
          <strong>Thư viện loại Box kiến thức</strong>
          <div class="rv-ed-sub">Chọn mẫu mặc định (Định nghĩa, Định lí, Công thức, Phương pháp, Lưu ý...) hoặc tự tạo loại Box màu riêng của bạn.</div>
        </div>
        <button type="button" class="rv-ed-icon-btn" id="btnCloseBoxPresets" title="Đóng">✕</button>
      </div>

      <div class="rv-ed-preset-grid">
        ${boxPresets
          .map(
            (p) => `
              <div class="rv-ed-preset-card" style="--rv-accent:${escapeAttr(p.accent)}; --rv-bg:${escapeAttr(p.bg)}; --rv-border:${escapeAttr(p.border)};">
                <div class="rv-ed-preset-card-top">
                  <span class="rv-ed-preset-ico">${renderBoxIconSvg(p.icon)}</span>
                  <div class="rv-ed-preset-meta">
                    <strong>${escapeHtml(p.name)}</strong>
                    <span>${p.style === 'tinted' ? 'Hộp nền màu' : p.style === 'outlined' ? 'Viền mảnh' : 'Mở thoáng'}</span>
                  </div>
                  ${
                    !p.builtin
                      ? `<button type="button" class="rv-ed-icon-btn is-danger" data-del-preset="${escapeAttr(p.id)}" title="Xóa loại Box">🗑</button>`
                      : `<span class="rv-ed-default-tag">Mặc định</span>`
                  }
                </div>
                <div class="rv-ed-preset-controls">
                  <select class="rv-ed-select is-sm" data-preset-style="${escapeAttr(p.id)}" title="Kiểu hiển thị">
                    ${BOX_STYLE_OPTIONS.map(
                      (st) => `<option value="${st.value}" ${p.style === st.value ? 'selected' : ''}>${escapeHtml(st.label)}</option>`
                    ).join('')}
                  </select>
                  <input type="color" class="rv-ed-color-mini" data-preset-color="${escapeAttr(p.id)}" value="${escapeAttr(p.accent)}" title="Đổi màu chủ đạo" />
                </div>
              </div>
            `
          )
          .join('')}
      </div>

      <div class="rv-ed-new-preset-box">
        <div class="rv-ed-new-preset-title">+ Tạo loại Box mới của riêng bạn</div>
        <div class="rv-ed-new-preset-row">
          <input
            type="text"
            class="rv-ed-input"
            id="inpNewPresetName"
            placeholder="VD: Mẹo bấm máy Casio, Bổ đề nâng cao..."
            value="${escapeAttr(dp.name)}"
          />
          <select class="rv-ed-select" id="selNewPresetIcon" title="Chọn biểu tượng">
            ${BOX_ICON_LABELS.map(
              (ic) => `<option value="${ic.key}" ${dp.icon === ic.key ? 'selected' : ''}>${escapeHtml(ic.label)}</option>`
            ).join('')}
          </select>
          <select class="rv-ed-select" id="selNewPresetStyle" title="Kiểu Box">
            ${BOX_STYLE_OPTIONS.map(
              (st) => `<option value="${st.value}" ${dp.style === st.value ? 'selected' : ''}>${escapeHtml(st.label)}</option>`
            ).join('')}
          </select>
          <div class="rv-ed-swatch-bar" title="Chọn màu nhanh">
            ${BOX_COLOR_SWATCHES.slice(0, 7)
              .map(
                (sw) => `
                  <button
                    type="button"
                    class="rv-ed-swatch ${dp.accent.toLowerCase() === sw.accent.toLowerCase() ? 'is-selected' : ''}"
                    style="background:${sw.accent};"
                    data-pick-new-color="${sw.accent}"
                    title="${escapeAttr(sw.name)}"
                  ></button>
                `
              )
              .join('')}
            <input type="color" class="rv-ed-color-mini" id="inpNewPresetColor" value="${escapeAttr(dp.accent)}" title="Màu tùy chọn" />
          </div>
          <button type="button" class="rv-ed-btn is-primary" id="btnAddBoxPreset">+ Thêm loại Box</button>
        </div>
      </div>
    </div>
  `;
}

export function renderLessonMetaEditorHtml(lesson) {
  return `
    <div class="rv-ed-meta-card">
      <div class="rv-ed-meta-grid">
        <label class="rv-ed-field" style="max-width:130px;">
          <span>Mã bài</span>
          <input type="text" class="rv-ed-input" data-ed-lesson-field="code" value="${escapeAttr(lesson.code || '')}" placeholder="Bài 1" />
        </label>
        <label class="rv-ed-field" style="flex:1;">
          <span>Tên bài học</span>
          <input type="text" class="rv-ed-input" data-ed-lesson-field="title" value="${escapeAttr(lesson.title || '')}" placeholder="Nhập tên bài..." />
        </label>
      </div>
      <label class="rv-ed-field" style="margin-top:8px;">
        <span>Tóm tắt ngắn (tùy chọn)</span>
        <input type="text" class="rv-ed-input" data-ed-lesson-field="summary" value="${escapeAttr(lesson.summary || '')}" placeholder="Mô tả ngắn gọn nội dung chính của bài..." />
      </label>
    </div>
  `;
}

function renderTagToneDot(tone) {
  const map = {
    default: { bg: '#e2e8f0', title: 'Màu xám nhạt (bấm để đổi màu)' },
    up: { bg: '#22c55e', title: 'Màu xanh lá (bấm để đổi màu)' },
    down: { bg: '#f43f5e', title: 'Màu đỏ hồng (bấm để đổi màu)' },
    flat: { bg: '#94a3b8', title: 'Màu xám đậm (bấm để đổi màu)' },
  };
  return map[tone] || map.default;
}

export function renderTouch1EditorHtml(lesson, boxPresets, { collapsedIds, transformRecallMasks }) {
  const coreCards = lesson.coreCards || [];
  const flipCards = lesson.flipCards || [];

  return `
    <div class="rv-ed-stage">
      <!-- HIERARCHY SECTION A: CORE KNOWLEDGE BOXES (ZERO-HTML FRIENDLY LINES) -->
      <div class="rv-ed-section">
        <div class="rv-ed-sec-head">
          <div>
            <h3 class="rv-ed-sec-title">1. Các Box kiến thức trọng tâm (${coreCards.length})</h3>
            <div class="rv-ed-sub">Gõ tiếng Việt tự nhiên + công thức LaTeX <code>$...$</code> (bôi đậm bằng <code>**chữ**</code> hoặc nút <b>B</b>). Không cần viết mã HTML!</div>
          </div>
        </div>

        <div class="rv-ed-stack">
          ${coreCards
            .map((card, idx) => {
              const preset = resolveBoxPreset(card.type, boxPresets);
              const items = ensureCoreCardItems(card);
              const isCollapsed = collapsedIds.has(`core:${card.id}`);
              const exCount = items.filter((it) => it.hasExample).length;
              return `
                <div
                  class="rv-ed-node ${isCollapsed ? 'is-collapsed' : ''}"
                  style="--rv-accent:${escapeAttr(preset.accent)}; --rv-bg:${escapeAttr(preset.bg)}; --rv-border:${escapeAttr(preset.border)};"
                  data-ed-core-idx="${idx}"
                >
                  <div class="rv-ed-node-head">
                    <button type="button" class="rv-ed-collapse-btn" data-ed-toggle-node="core:${escapeAttr(card.id)}" title="Thu gọn / Mở rộng">
                      ${isCollapsed ? '▸' : '▾'}
                    </button>
                    <span class="rv-ed-node-ico">${renderBoxIconSvg(preset.icon)}</span>
                    <select class="rv-ed-select is-sm" data-ed-core-type="${idx}" title="Loại Box">
                      ${boxPresets
                        .map(
                          (p) => `<option value="${escapeAttr(p.id)}" ${p.id === preset.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
                        )
                        .join('')}
                    </select>
                    <input
                      type="text"
                      class="rv-ed-input rv-ed-title-inp"
                      data-ed-core-title="${idx}"
                      value="${escapeAttr(card.title || '')}"
                      placeholder="Tiêu đề Box..."
                    />
                    <select class="rv-ed-select is-sm" data-ed-core-style="${idx}" title="Kiểu khung Box">
                      <option value="" ${!card.boxStyle ? 'selected' : ''}>Kiểu mặc định</option>
                      ${BOX_STYLE_OPTIONS.map(
                        (st) => `<option value="${st.value}" ${card.boxStyle === st.value ? 'selected' : ''}>${escapeHtml(st.label)}</option>`
                      ).join('')}
                    </select>
                    <span class="rv-ed-ex-count-pill" title="Số dòng có ví dụ minh họa">${items.length} dòng · ${exCount} VD</span>
                    <div class="rv-ed-node-actions">
                      <button type="button" class="rv-ed-icon-btn" data-ed-core-move="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} title="Lên">↑</button>
                      <button type="button" class="rv-ed-icon-btn" data-ed-core-move="${idx}" data-dir="1" ${idx === coreCards.length - 1 ? 'disabled' : ''} title="Xuống">↓</button>
                      <button type="button" class="rv-ed-icon-btn is-danger" data-ed-core-del="${idx}" title="Xóa Box">🗑</button>
                    </div>
                  </div>

                  <div class="rv-ed-node-body is-clean-lines ${isCollapsed ? 'hidden' : ''}">
                    <div class="rv-ed-clean-list">
                      ${items
                        .map((item, iIdx) => {
                          const hasEx = Boolean(item.hasExample);
                          const ex = item.example || { title: 'Ví dụ minh họa', problem: '', solution: '' };
                          const parsed = parseItemForFriendlyEdit(item.html || '');
                          const rows = estimateRows(parsed.text, 2, 5);
                          const hasTags = parsed.tags.length > 0;
                          return `
                            <div class="rv-ed-clean-row ${hasEx ? 'has-ex-open' : ''}">
                              <div class="rv-ed-clean-row-top">
                                <div class="rv-ed-clean-row-left">
                                  <span class="rv-ed-row-idx">${iIdx + 1}</span>
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked="${hasEx}"
                                    class="rv-ed-ex-check-btn ${hasEx ? 'is-checked' : ''}"
                                    data-ed-item-has-ex="${idx}:${iIdx}"
                                    title="Tick để gắn Ví dụ đám mây lời nói cho dòng này"
                                  >
                                    <span class="rv-ed-chk-box" aria-hidden="true">${hasEx ? '✓' : ''}</span>
                                    <span>Có ví dụ</span>
                                  </button>
                                </div>
                                <div class="rv-ed-node-actions">
                                  <button type="button" class="rv-ed-icon-btn" data-ed-item-move="${idx}:${iIdx}" data-dir="-1" ${iIdx === 0 ? 'disabled' : ''} title="Chuyển lên">↑</button>
                                  <button type="button" class="rv-ed-icon-btn" data-ed-item-move="${idx}:${iIdx}" data-dir="1" ${iIdx === items.length - 1 ? 'disabled' : ''} title="Chuyển xuống">↓</button>
                                  <button type="button" class="rv-ed-icon-btn is-danger" data-ed-item-del="${idx}:${iIdx}" title="Xóa dòng">🗑</button>
                                </div>
                              </div>

                              <div class="rv-ed-writer-box">
                                <textarea
                                  class="rv-ed-prose-ta"
                                  rows="${rows}"
                                  id="ed-ta-item-${idx}-${iIdx}"
                                  data-ed-item-text="${idx}:${iIdx}"
                                  placeholder="Gõ nội dung dòng ${iIdx + 1} bằng tiếng Việt + LaTeX $...$ (bôi đậm bằng **chữ**)..."
                                >${escapeHtml(parsed.text)}</textarea>

                                <!-- Visual Tag / Chip Builder (Zero HTML!) -->
                                ${
                                  hasTags
                                    ? `
                                      <div class="rv-ed-tags-editor">
                                        <div class="rv-ed-tags-head">
                                          <span class="rv-ed-tags-lbl">${parsed.tagsKind === 'chips' ? 'Thẻ đánh số (1, 2, 3...)' : 'Các thẻ phân trường hợp'}</span>
                                          <button
                                            type="button"
                                            class="rv-ed-link-btn"
                                            data-ed-tag-kind-toggle="${idx}:${iIdx}"
                                            title="Chuyển đổi giữa dạng thẻ đánh số và thẻ phân trường hợp"
                                          >${parsed.tagsKind === 'chips' ? 'Đổi sang thẻ trường hợp' : 'Đổi sang thẻ đánh số 1, 2, 3'}</button>
                                        </div>
                                        <div class="rv-ed-tags-wrap">
                                          ${parsed.tags
                                            .map((tg, tIdx) => {
                                              const dot = renderTagToneDot(tg.tone);
                                              return `
                                                <div class="rv-ed-tag-pill">
                                                  ${
                                                    parsed.tagsKind === 'chips'
                                                      ? `<span class="rv-ed-tag-num">${tIdx + 1}</span>`
                                                      : `<button type="button" class="rv-ed-tag-tone" style="background:${dot.bg};" data-ed-tag-tone="${idx}:${iIdx}:${tIdx}" title="${escapeAttr(dot.title)}"></button>`
                                                  }
                                                  <input
                                                    type="text"
                                                    class="rv-ed-tag-inp"
                                                    data-ed-tag-text="${idx}:${iIdx}:${tIdx}"
                                                    value="${escapeAttr(tg.text)}"
                                                    placeholder="Nội dung thẻ..."
                                                  />
                                                  <button type="button" class="rv-ed-tag-del" data-ed-tag-del="${idx}:${iIdx}:${tIdx}" title="Xóa thẻ">×</button>
                                                </div>
                                              `;
                                            })
                                            .join('')}
                                          <button type="button" class="rv-ed-tag-add-btn" data-ed-tag-add="${idx}:${iIdx}">+ Thêm thẻ</button>
                                        </div>
                                      </div>
                                    `
                                    : ''
                                }

                                <div class="rv-ed-writer-foot">
                                  <div class="rv-ed-fmt-bar is-micro" data-fmt-target="item-${idx}-${iIdx}">
                                    <button type="button" class="rv-ed-micro-btn" data-insert-snip="bold" title="In đậm phần bôi đen (**...**)"><b>B</b> In đậm</button>
                                    <button type="button" class="rv-ed-micro-btn" data-insert-snip="che" title="Che phần bôi đen khi ôn công thức">Che CT</button>
                                    <button type="button" class="rv-ed-micro-btn" data-insert-snip="frac" title="Chèn phân số">Phân số</button>
                                    <button type="button" class="rv-ed-micro-btn" data-insert-snip="mathblock" title="Chèn công thức dòng riêng">CT dòng riêng</button>
                                    ${
                                      !hasTags
                                        ? `<button type="button" class="rv-ed-micro-btn" data-ed-tag-add="${idx}:${iIdx}" title="Thêm nhóm thẻ chip liệt kê / trường hợp">+ Thẻ phân loại</button>`
                                        : ''
                                    }
                                  </div>
                                </div>
                              </div>

                              <div class="rv-ed-inline-prev" id="ed-prev-item-${idx}-${iIdx}">
                                ${transformRecallMasks(item.html || '')}
                              </div>

                              ${
                                hasEx
                                  ? `
                                    <div class="rv-ed-ex-drawer">
                                      <div class="rv-ed-ex-drawer-head">
                                        <span class="rv-ed-ex-drawer-badge">
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                          Ví dụ minh họa (hiện dạng đám mây khi HS click đúp Dòng ${iIdx + 1})
                                        </span>
                                      </div>
                                      <div class="rv-ed-ex-drawer-grid">
                                        <label class="rv-ed-field" style="grid-column: 1 / -1;">
                                          <span>Tiêu đề ví dụ</span>
                                          <input
                                            type="text"
                                            class="rv-ed-input"
                                            data-ed-item-ex="${idx}:${iIdx}:title"
                                            value="${escapeAttr(ex.title || 'Ví dụ minh họa')}"
                                            placeholder="VD: Ví dụ Tính số hạng tổng quát..."
                                          />
                                        </label>
                                        <label class="rv-ed-field">
                                          <span>Đề bài</span>
                                          <textarea
                                            class="rv-ed-prose-ta is-box"
                                            rows="2"
                                            data-ed-item-ex="${idx}:${iIdx}:problem"
                                            placeholder="Gõ đề bài + công thức $...$..."
                                          >${escapeHtml(htmlToFriendlyInline(ex.problem || ''))}</textarea>
                                        </label>
                                        <label class="rv-ed-field">
                                          <span>Lời giải ngắn</span>
                                          <textarea
                                            class="rv-ed-prose-ta is-box"
                                            rows="2"
                                            data-ed-item-ex="${idx}:${iIdx}:solution"
                                            placeholder="Gõ lời giải (Enter để xuống dòng, **chữ** để in đậm)..."
                                          >${escapeHtml(htmlToFriendlyInline(ex.solution || ''))}</textarea>
                                        </label>
                                      </div>
                                    </div>
                                  `
                                  : ''
                              }
                            </div>
                          `;
                        })
                        .join('')}
                    </div>

                    <div class="rv-ed-line-add-row">
                      <button type="button" class="rv-ed-btn is-sm is-primary" data-ed-item-add="${idx}">
                        + Thêm dòng kiến thức
                      </button>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Quick-Add Box Preset Bar -->
        <div class="rv-ed-add-preset-bar">
          <span class="rv-ed-add-lbl">+ Thêm Box:</span>
          ${boxPresets
            .map(
              (p) => `
                <button
                  type="button"
                  class="rv-ed-add-chip"
                  style="--rv-accent:${escapeAttr(p.accent)}; --rv-bg:${escapeAttr(p.bg)}; --rv-border:${escapeAttr(p.border)};"
                  data-ed-core-add="${escapeAttr(p.id)}"
                >
                  <span class="rv-ed-add-dot"></span>
                  <span>${escapeHtml(p.name)}</span>
                </button>
              `
            )
            .join('')}
          <button type="button" class="rv-ed-add-chip is-new-type" id="btnOpenNewPresetFromBar">+ Tự tạo loại mới...</button>
        </div>
      </div>

      <!-- HIERARCHY SECTION B: BLIND TRAP FLIP CARDS (NO CATEGORY CLASSIFICATION NEEDED!) -->
      <div class="rv-ed-section">
        <div class="rv-ed-sec-head">
          <div>
            <h3 class="rv-ed-sec-title">2. Thẻ lật Bẫy hay sai (${flipCards.length})</h3>
            <div class="rv-ed-sub">Mặt trước chỉ hiện Đề bài + Ô nhập đáp án. Mặt sau hiện tên bẫy (hỗ trợ LaTeX $...$), phần Bẫy và Đúng.</div>
          </div>
          <button type="button" class="rv-ed-btn is-primary" id="btnEdAddFlip">+ Thêm thẻ bẫy</button>
        </div>

        <div class="rv-ed-stack">
          ${flipCards
            .map((fc, idx) => {
              const isCollapsed = collapsedIds.has(`flip:${fc.id}`);
              const isMulti = Array.isArray(fc.acceptedMultiSet) && fc.acceptedMultiSet.length > 0;
              const ansStr = isMulti ? fc.acceptedMultiSet.join('; ') : (fc.acceptedAnswers || []).join('; ');
              return `
                <div class="rv-ed-node is-trap-node ${isCollapsed ? 'is-collapsed' : ''}" style="--rv-accent:#e11d48; --rv-bg:#fff1f2; --rv-border:#fecdd3;">
                  <div class="rv-ed-node-head">
                    <button type="button" class="rv-ed-collapse-btn" data-ed-toggle-node="flip:${escapeAttr(fc.id)}">
                      ${isCollapsed ? '▸' : '▾'}
                    </button>
                    <span class="rv-ed-badge-num">Câu ${idx + 1}</span>
                    <input
                      type="text"
                      class="rv-ed-input rv-ed-title-inp"
                      data-ed-flip-field="trapLabel"
                      data-ed-flip-idx="${idx}"
                      value="${escapeAttr(fc.trapLabel || '')}"
                      placeholder="Tên bẫy (VD: Bẫy nhầm mũ $n$ với $n - 1$)..."
                    />
                    <div class="rv-ed-node-actions">
                      <button type="button" class="rv-ed-icon-btn" data-ed-flip-move="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
                      <button type="button" class="rv-ed-icon-btn" data-ed-flip-move="${idx}" data-dir="1" ${idx === flipCards.length - 1 ? 'disabled' : ''}>↓</button>
                      <button type="button" class="rv-ed-icon-btn is-danger" data-ed-flip-del="${idx}">🗑</button>
                    </div>
                  </div>

                  <div class="rv-ed-node-body ${isCollapsed ? 'hidden' : ''}">
                    <div class="rv-ed-grid-2">
                      <label class="rv-ed-field">
                        <span>Đề bài (Mặt trước)</span>
                        <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-flip-field="problem" data-ed-flip-idx="${idx}">${escapeHtml(htmlToFriendlyInline(fc.problem || ''))}</textarea>
                      </label>
                      <div class="rv-ed-field">
                        <span>Đáp án đúng</span>
                        <div class="rv-ed-ans-row">
                          <select class="rv-ed-select is-sm" data-ed-flip-ansmode="${idx}">
                            <option value="single" ${!isMulti ? 'selected' : ''}>1 đáp án (nhiều dạng cách bởi ;)</option>
                            <option value="multi" ${isMulti ? 'selected' : ''}>Nhiều nghiệm bắt buộc đủ (VD: -6; 6)</option>
                          </select>
                          <input
                            type="text"
                            class="rv-ed-input"
                            data-ed-flip-ans="${idx}"
                            value="${escapeAttr(ansStr)}"
                            placeholder="${isMulti ? 'VD: -6; 6' : 'VD: 162'}"
                          />
                        </div>
                      </div>
                    </div>

                    <div class="rv-ed-grid-2" style="margin-top:8px;">
                      <label class="rv-ed-field">
                        <span>Giải thích Bẫy (Mặt sau)</span>
                        <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-flip-field="trapExplanation" data-ed-flip-idx="${idx}">${escapeHtml(htmlToFriendlyInline(fc.trapExplanation || ''))}</textarea>
                      </label>
                      <label class="rv-ed-field">
                        <span>Lời giải Đúng (Mặt sau)</span>
                        <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-flip-field="correctExplanation" data-ed-flip-idx="${idx}">${escapeHtml(htmlToFriendlyInline(fc.correctExplanation || ''))}</textarea>
                      </label>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}

export function renderTouch3EditorHtml(lesson, { collapsedIds }) {
  const qz = lesson.quizzes || { multipleChoice: [], trueFalse: [], shortAnswer: [] };
  const mcs = qz.multipleChoice || [];
  const tfs = qz.trueFalse || [];
  const sas = qz.shortAnswer || [];
  const letters = ['A', 'B', 'C', 'D'];

  return `
    <div class="rv-ed-stage">
      <!-- PART 1: MULTIPLE CHOICE -->
      <div class="rv-ed-section">
        <div class="rv-ed-sec-head">
          <div>
            <h3 class="rv-ed-sec-title">Phần I — Trắc nghiệm 4 lựa chọn (${mcs.length} câu)</h3>
          </div>
          <button type="button" class="rv-ed-btn is-primary" id="btnEdAddMc">+ Thêm câu TN</button>
        </div>

        <div class="rv-ed-stack">
          ${mcs
            .map((q, idx) => {
              const isCollapsed = collapsedIds.has(`mc:${q.id}`);
              const opts = Array.isArray(q.options) && q.options.length === 4 ? q.options : ['', '', '', ''];
              return `
                <div class="rv-ed-node ${isCollapsed ? 'is-collapsed' : ''}" style="--rv-accent:#2563eb; --rv-bg:#eff6ff; --rv-border:#bfdbfe;">
                  <div class="rv-ed-node-head">
                    <button type="button" class="rv-ed-collapse-btn" data-ed-toggle-node="mc:${escapeAttr(q.id)}">${isCollapsed ? '▸' : '▾'}</button>
                    <span class="rv-ed-badge-num">TN ${idx + 1}</span>
                    <span class="rv-ed-snippet">${escapeHtml(String(q.question || '').slice(0, 72) || 'Câu hỏi mới...')}</span>
                    <div class="rv-ed-node-actions">
                      <button type="button" class="rv-ed-icon-btn" data-ed-mc-move="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
                      <button type="button" class="rv-ed-icon-btn" data-ed-mc-move="${idx}" data-dir="1" ${idx === mcs.length - 1 ? 'disabled' : ''}>↓</button>
                      <button type="button" class="rv-ed-icon-btn is-danger" data-ed-mc-del="${idx}">🗑</button>
                    </div>
                  </div>
                  <div class="rv-ed-node-body ${isCollapsed ? 'hidden' : ''}">
                    <label class="rv-ed-field">
                      <span>Nội dung câu hỏi</span>
                      <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-mc-field="question" data-ed-mc-idx="${idx}">${escapeHtml(htmlToFriendlyInline(q.question || ''))}</textarea>
                    </label>
                    <div class="rv-ed-mc-opts">
                      ${opts
                        .map(
                          (opt, oi) => `
                            <div class="rv-ed-mc-opt-row ${q.correctIndex === oi ? 'is-right' : ''}">
                              <button
                                type="button"
                                class="rv-ed-opt-radio ${q.correctIndex === oi ? 'is-checked' : ''}"
                                data-ed-mc-correct="${idx}:${oi}"
                                title="Đặt làm đáp án đúng"
                              >${letters[oi]}</button>
                              <input type="text" class="rv-ed-input" data-ed-mc-opt="${idx}:${oi}" value="${escapeAttr(opt || '')}" placeholder="Phương án ${letters[oi]}..." />
                            </div>
                          `
                        )
                        .join('')}
                    </div>
                    <label class="rv-ed-field" style="margin-top:8px;">
                      <span>Lời giải chi tiết</span>
                      <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-mc-field="explanation" data-ed-mc-idx="${idx}">${escapeHtml(htmlToFriendlyInline(q.explanation || ''))}</textarea>
                    </label>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- PART 2: TRUE / FALSE -->
      <div class="rv-ed-section">
        <div class="rv-ed-sec-head">
          <div>
            <h3 class="rv-ed-sec-title">Phần II — Trắc nghiệm Đúng / Sai (${tfs.length} câu)</h3>
          </div>
          <button type="button" class="rv-ed-btn is-primary" id="btnEdAddTf">+ Thêm câu Đúng/Sai</button>
        </div>

        <div class="rv-ed-stack">
          ${tfs
            .map((q, idx) => {
              const isCollapsed = collapsedIds.has(`tf:${q.id}`);
              const stmts = q.statements || [];
              return `
                <div class="rv-ed-node ${isCollapsed ? 'is-collapsed' : ''}" style="--rv-accent:#0d9488; --rv-bg:#f0fdfa; --rv-border:#99f6e4;">
                  <div class="rv-ed-node-head">
                    <button type="button" class="rv-ed-collapse-btn" data-ed-toggle-node="tf:${escapeAttr(q.id)}">${isCollapsed ? '▸' : '▾'}</button>
                    <span class="rv-ed-badge-num">Đ/S ${idx + 1}</span>
                    <span class="rv-ed-snippet">${escapeHtml(String(q.stem || '').slice(0, 72) || 'Đề dẫn mới...')}</span>
                    <div class="rv-ed-node-actions">
                      <button type="button" class="rv-ed-icon-btn" data-ed-tf-move="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
                      <button type="button" class="rv-ed-icon-btn" data-ed-tf-move="${idx}" data-dir="1" ${idx === tfs.length - 1 ? 'disabled' : ''}>↓</button>
                      <button type="button" class="rv-ed-icon-btn is-danger" data-ed-tf-del="${idx}">🗑</button>
                    </div>
                  </div>
                  <div class="rv-ed-node-body ${isCollapsed ? 'hidden' : ''}">
                    <label class="rv-ed-field">
                      <span>Đề dẫn chung</span>
                      <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-tf-stem="${idx}">${escapeHtml(htmlToFriendlyInline(q.stem || ''))}</textarea>
                    </label>
                    <div class="rv-ed-sub-tree">
                      <div class="rv-ed-sub-tree-head"><strong>4 mệnh đề a, b, c, d</strong></div>
                      <div class="rv-ed-sub-stack">
                        ${stmts
                          .map(
                            (st, si) => `
                              <div class="rv-ed-tf-row">
                                <div class="rv-ed-tf-top">
                                  <span class="rv-ed-step-lbl">${escapeHtml(st.label || String.fromCharCode(97 + si))})</span>
                                  <input type="text" class="rv-ed-input" style="flex:1;" data-ed-tf-stmt="${idx}:${si}:text" value="${escapeAttr(st.text || '')}" placeholder="Nội dung mệnh đề..." />
                                  <div class="rv-ed-tf-seg">
                                    <button type="button" class="rv-ed-tf-btn ${st.isTrue ? 'is-true' : ''}" data-ed-tf-bool="${idx}:${si}:true">Đúng</button>
                                    <button type="button" class="rv-ed-tf-btn ${!st.isTrue ? 'is-false' : ''}" data-ed-tf-bool="${idx}:${si}:false">Sai</button>
                                  </div>
                                </div>
                                <input type="text" class="rv-ed-input is-sub" data-ed-tf-stmt="${idx}:${si}:explanation" value="${escapeAttr(st.explanation || '')}" placeholder="Giải thích ngắn cho ý ${escapeAttr(st.label || '')}..." />
                              </div>
                            `
                          )
                          .join('')}
                      </div>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- PART 3: SHORT ANSWER -->
      <div class="rv-ed-section">
        <div class="rv-ed-sec-head">
          <div>
            <h3 class="rv-ed-sec-title">Phần III — Trắc nghiệm Trả lời ngắn (${sas.length} câu)</h3>
          </div>
          <button type="button" class="rv-ed-btn is-primary" id="btnEdAddSa">+ Thêm câu Trả lời ngắn</button>
        </div>

        <div class="rv-ed-stack">
          ${sas
            .map((q, idx) => {
              const isCollapsed = collapsedIds.has(`sa:${q.id}`);
              return `
                <div class="rv-ed-node ${isCollapsed ? 'is-collapsed' : ''}" style="--rv-accent:#d97706; --rv-bg:#fffbeb; --rv-border:#fde68a;">
                  <div class="rv-ed-node-head">
                    <button type="button" class="rv-ed-collapse-btn" data-ed-toggle-node="sa:${escapeAttr(q.id)}">${isCollapsed ? '▸' : '▾'}</button>
                    <span class="rv-ed-badge-num">TLN ${idx + 1}</span>
                    <span class="rv-ed-snippet">${escapeHtml(String(q.question || '').slice(0, 72) || 'Câu trả lời ngắn...')}</span>
                    <div class="rv-ed-node-actions">
                      <button type="button" class="rv-ed-icon-btn" data-ed-sa-move="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
                      <button type="button" class="rv-ed-icon-btn" data-ed-sa-move="${idx}" data-dir="1" ${idx === sas.length - 1 ? 'disabled' : ''}>↓</button>
                      <button type="button" class="rv-ed-icon-btn is-danger" data-ed-sa-del="${idx}">🗑</button>
                    </div>
                  </div>
                  <div class="rv-ed-node-body ${isCollapsed ? 'hidden' : ''}">
                    <label class="rv-ed-field">
                      <span>Đề bài</span>
                      <textarea class="rv-ed-prose-ta is-box" rows="2" data-ed-sa-field="question" data-ed-sa-idx="${idx}">${escapeHtml(htmlToFriendlyInline(q.question || ''))}</textarea>
                    </label>
                    <div class="rv-ed-grid-2" style="margin-top:8px;">
                      <label class="rv-ed-field">
                        <span>Đáp số chuẩn</span>
                        <input type="text" class="rv-ed-input" data-ed-sa-field="correctAnswer" data-ed-sa-idx="${idx}" value="${escapeAttr(q.correctAnswer || '')}" placeholder="VD: 15" />
                      </label>
                      <label class="rv-ed-field">
                        <span>Lời giải chi tiết</span>
                        <input type="text" class="rv-ed-input" data-ed-sa-field="explanation" data-ed-sa-idx="${idx}" value="${escapeAttr(htmlToFriendlyInline(q.explanation || ''))}" placeholder="Giải thích..." />
                      </label>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}

export function applyTextareaSnippet(textarea, snippetType) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const sel = textarea.value.slice(start, end);
  let replacement = '';
  let cursorOffset = 0;

  if (snippetType === 'che') {
    const inner = sel || '$công\\ thức$';
    replacement = `[CHE: ${inner}]`;
    cursorOffset = replacement.length;
  } else if (snippetType === 'mathblock') {
    replacement = `\n$$${sel || 'u_n = u_1 + (n - 1)d'}$$`;
    cursorOffset = replacement.length;
  } else if (snippetType === 'frac') {
    replacement = `\\dfrac{${sel || 'a'}}{b}`;
    cursorOffset = replacement.length;
  } else if (snippetType === 'bold') {
    replacement = `**${sel || 'chữ đậm'}**`;
    cursorOffset = replacement.length;
  }

  textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + cursorOffset;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
