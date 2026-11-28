import { escapeAttr } from './exam-engine.js?v=20261127p';

const PART_LABELS = {
  part1: 'Phần I',
  part2: 'Phần II',
  part3: 'Phần III',
  part4: 'Phần IV',
};

const MISSING_DIV_RE = /<div\b[^>]*class="[^"]*\bis-missing-img\b[^"]*"[^>]*data-missing-img="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi;
const RAW_INCLUDE_RE = /\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/gi;

export function normalizeImgKey(name) {
  const s = String(name || '').trim().replace(/\\/g, '/');
  const base = s.split('/').pop() || s;
  return base.replace(/\.(png|jpe?g|webp|gif|svg|bmp|pdf|eps)$/i, '').trim().toLowerCase();
}

export function readImageFileAsDataUrl(file, { maxWidth = 1280, quality = 0.88 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Chưa chọn tệp ảnh.'));
      return;
    }
    const mime = String(file.type || '').toLowerCase();
    const isSvg = mime === 'image/svg+xml' || /\.svg$/i.test(file.name || '');

    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Không thể đọc ảnh ${file.name || ''}.`));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      if (isSvg || !rawUrl.startsWith('data:image/')) {
        resolve(rawUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h || (w <= maxWidth && file.size <= 450 * 1024)) {
          resolve(rawUrl);
          return;
        }
        const scale = w > maxWidth ? maxWidth / w : 1;
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, tw, th);
        const keepPng = mime === 'image/png' || mime === 'image/webp';
        try {
          const out = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
          resolve(out.length < rawUrl.length ? out : rawUrl);
        } catch {
          resolve(rawUrl);
        }
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function collectMissingFromString(str, outSet) {
  if (typeof str !== 'string' || !str) return;
  MISSING_DIV_RE.lastIndex = 0;
  let m;
  while ((m = MISSING_DIV_RE.exec(str)) !== null) {
    const name = String(m[1] || '').trim();
    if (name) outSet.add(name);
  }
  RAW_INCLUDE_RE.lastIndex = 0;
  while ((m = RAW_INCLUDE_RE.exec(str)) !== null) {
    const name = String(m[1] || '').trim();
    if (name) outSet.add(name);
  }
}

export function scanMissingImagesInQuestion(q) {
  const names = new Set();
  if (!q) return [];
  collectMissingFromString(q.stem, names);
  collectMissingFromString(q.figureHtml, names);
  collectMissingFromString(q.explanation, names);
  (q.options || []).forEach((o) => collectMissingFromString(o?.text, names));
  (q.statements || []).forEach((st) => collectMissingFromString(st?.text, names));
  return Array.from(names);
}

export function scanMissingImages(examOrDeck) {
  const entries = [];
  const uniqueMap = new Map(); // normalizedKey -> displayName
  if (!examOrDeck) return { entries: [], uniqueNames: [] };

  for (const part of ['part1', 'part2', 'part3', 'part4']) {
    const list = Array.isArray(examOrDeck[part]) ? examOrDeck[part] : [];
    list.forEach((q, idx) => {
      const found = scanMissingImagesInQuestion(q);
      found.forEach((name) => {
        entries.push({
          name,
          key: normalizeImgKey(name),
          part,
          partLabel: PART_LABELS[part] || part,
          qIdx: idx,
          qNum: idx + 1,
        });
        const k = normalizeImgKey(name);
        if (!uniqueMap.has(k)) uniqueMap.set(k, name);
      });
    });
  }

  return {
    entries,
    uniqueNames: Array.from(uniqueMap.values()),
  };
}

export function buildFigureHtml(dataUrl, altName = 'Hình minh họa') {
  return `<div class="q-figure" data-upload-img="1"><img src="${escapeAttr(dataUrl)}" class="tikz-figure" alt="${escapeAttr(altName)}" /></div>`;
}

function replaceMissingInString(str, targetKey, figureHtml) {
  if (typeof str !== 'string' || !str) return { out: str, count: 0 };
  let count = 0;
  let out = str.replace(MISSING_DIV_RE, (full, name) => {
    if (normalizeImgKey(name) === targetKey) {
      count++;
      return figureHtml;
    }
    return full;
  });
  out = out.replace(RAW_INCLUDE_RE, (full, name) => {
    if (normalizeImgKey(name) === targetKey) {
      count++;
      return figureHtml;
    }
    return full;
  });
  return { out, count };
}

export function replaceMissingImageInExam(examOrDeck, targetName, dataUrl) {
  if (!examOrDeck || !targetName || !dataUrl) return 0;
  const targetKey = normalizeImgKey(targetName);
  const figHtml = buildFigureHtml(dataUrl, targetName);
  let total = 0;

  const applyTo = (obj, prop) => {
    if (!obj || typeof obj[prop] !== 'string') return;
    const { out, count } = replaceMissingInString(obj[prop], targetKey, figHtml);
    if (count > 0) {
      obj[prop] = out;
      total += count;
    }
  };

  for (const part of ['part1', 'part2', 'part3', 'part4']) {
    const list = Array.isArray(examOrDeck[part]) ? examOrDeck[part] : [];
    list.forEach((q) => {
      applyTo(q, 'stem');
      applyTo(q, 'figureHtml');
      applyTo(q, 'explanation');
      (q.options || []).forEach((o) => applyTo(o, 'text'));
      (q.statements || []).forEach((st) => applyTo(st, 'text'));
    });
  }
  return total;
}

export function extractQuestionImages(q) {
  const out = [];
  if (!q) return out;
  const scanField = (field) => {
    const html = String(q[field] || '');
    if (!html) return;
    const re = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi;
    let m;
    let localIdx = 0;
    while ((m = re.exec(html)) !== null) {
      const fullTag = m[0];
      if (/\binline-eq-img\b/i.test(fullTag)) continue;
      const altM = fullTag.match(/\balt="([^"]*)"/i);
      out.push({
        field,
        localIdx,
        src: m[1],
        alt: altM ? altM[1] : 'Hình minh họa',
      });
      localIdx++;
    }
  };
  scanField('stem');
  scanField('figureHtml');
  return out;
}

export function appendImageToQuestion(q, dataUrl, altName = 'Hình minh họa') {
  if (!q || !dataUrl) return;
  const fig = buildFigureHtml(dataUrl, altName);
  const cur = String(q.figureHtml || '').trim();
  q.figureHtml = cur ? `${cur}${fig}` : fig;
}

/**
 * Migrate any legacy inline <div class="q-figure">...<img>...</div> blocks out of `q.stem`
 * into `q.figureHtml`, and derive clean editable LaTeX (`stemTex`, `explanationTex`) when absent,
 * so the Exam Editor ALWAYS shows pure LaTeX instead of raw HTML/base64 strings!
 */
export function htmlToCleanLatexSource(html) {
  let s = String(html || '');
  if (!s) return '';
  // Remove embedded figure/image blocks (handled separately in figureHtml)
  s = s.replace(/<div\b[^>]*class="[^"]*\bq-figure\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<img\b[^>]*>/gi, '');
  // Convert tex-list blocks back to clean \begin{enumerate} / \begin{itemize}
  s = s.replace(/<div\b[^>]*class="[^"]*\btex-list\b([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*(?=<|$)/gi, (_, cls, inner) => {
    const isEnum = /\bis-enum\b/i.test(cls || '');
    const env = isEnum ? 'enumerate' : 'itemize';
    const items = [];
    const itemRe = /<div\b[^>]*class="[^"]*\btex-list-body\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = itemRe.exec(inner)) !== null) {
      items.push(`  \\item ${htmlToCleanLatexSource(m[1])}`);
    }
    if (!items.length) return '';
    return `\n\\begin{${env}}\n${items.join('\n')}\n\\end{${env}}\n`;
  });
  // Convert inline HTML formatting back to clean LaTeX
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '\\textbf{$2}');
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '\\textit{$2}');
  s = s.replace(/<u>([\s\S]*?)<\/u>/gi, '\\underline{$1}');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeQuestionForLatexEditor(q) {
  if (!q) return;
  // Move any legacy <div class="q-figure">...<img>...</div> blocks from stem -> figureHtml
  const stemRaw = String(q.stem || '');
  const figBlockRe = /<div\b[^>]*class="[^"]*\bq-figure\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
  const legacyFigs = stemRaw.match(figBlockRe);
  if (legacyFigs && legacyFigs.length > 0) {
    const existingFig = String(q.figureHtml || '').trim();
    const moved = legacyFigs
      .map((blk) => (blk.includes('data-upload-img') || blk.includes('data-tikz-compiled') || blk.includes('is-missing-img') ? blk : blk.replace('<div class="q-figure">', '<div class="q-figure" data-upload-img="1">')))
      .join('');
    q.figureHtml = existingFig ? `${existingFig}${moved}` : moved;
    q.stem = stemRaw.replace(figBlockRe, '').trim();
  }
  if (typeof q.stemTex !== 'string') {
    q.stemTex = htmlToCleanLatexSource(q.stem || '');
  }
  if (typeof q.figureTex !== 'string') {
    q.figureTex = '';
  }
  if (typeof q.explanationTex !== 'string') {
    q.explanationTex = htmlToCleanLatexSource(q.explanation || '');
  }
}

export function removeImageFromQuestion(q, field, targetLocalIdx) {
  if (!q || !field || typeof q[field] !== 'string') return false;
  const html = q[field];
  // Match either <div class="q-figure">...<img ...>...</div> or bare <img ...>
  const blockRe = /<div\b[^>]*class="[^"]*\bq-figure\b[^"]*"[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/div>|<img\b[^>]*>/gi;
  let seen = 0;
  let removed = false;
  const next = html.replace(blockRe, (full) => {
    if (/\binline-eq-img\b/i.test(full)) return full;
    if (seen === targetLocalIdx) {
      seen++;
      removed = true;
      return '';
    }
    seen++;
    return full;
  });
  if (removed) {
    q[field] = next.trim();
  }
  return removed;
}
