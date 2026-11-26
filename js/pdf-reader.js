/**
 * Lazy PDF text extractor using PDF.js from CDN.
 * Preserves line structure by grouping PDF text items with similar Y coordinates.
 */

const PDFJS_SCRIPT = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let pdfjsPromise = null;

export function loadPdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_SCRIPT;
      script.async = true;
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('Không thể khởi tạo thư viện đọc PDF.'));
        }
      };
      script.onerror = () => reject(new Error('Không thể tải PDF.js (cần kết nối mạng khi nạp file PDF).'));
      document.head.appendChild(script);
    });
  }
  return pdfjsPromise;
}

export async function extractTextFromPdfFile(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const pageTexts = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items into lines by rounded Y coordinate (PDF Y increases upwards)
    const rows = [];
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const x = item.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= 4);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, str: item.str });
    }
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      return r.parts.map((pt) => pt.str).join(' ').replace(/\s{2,}/g, ' ').trim();
    });
    pageTexts.push(lines.filter(Boolean).join('\n'));
  }

  return pageTexts.join('\n\n');
}

export async function renderPdfBase64ToPngDataUrl(base64Pdf, scale = 2.5) {
  const pdfjsLib = await loadPdfJs();
  const binStr = atob(base64Pdf);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

export async function renderPdfBase64AllPagesToPngs(base64Pdf, scale = 2.5) {
  const pdfjsLib = await loadPdfJs();
  const binStr = atob(base64Pdf);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pngs = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pngs.push(canvas.toDataURL('image/png'));
  }
  return pngs;
}

/**
 * 2D Coordinate-aware PDF parser for Vietnamese School Gradebooks (CSDL ngành / VNEDU / SMAS).
 * Preserves exact column alignment even when TX1..TX5 cells are sparse/empty!
 */
/**
 * Format Vietnamese administrative date (Nghị định 30/2020/NĐ-CP):
 * - Day: always 2 digits (01..31)
 * - Month: leading zero ONLY for Jan (01) and Feb (02); months 3..12 without leading zero (3..12)
 */
export function formatDobVNAdmin(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return s;
  const dd = String(Number(m[1])).padStart(2, '0');
  const moNum = Number(m[2]);
  const mm = moNum === 1 || moNum === 2 ? `0${moNum}` : String(moNum);
  return `${dd}/${mm}/${m[3]}`;
}

/**
 * Extract structured School Gradebook data (Sổ điểm bộ môn) from a PDF using
 * per-page 2D relative X/Y coordinates so:
 *  - Odd/even alternating page margins (lệch lề chẵn lẻ khi in đóng gáy) NEVER shift columns.
 *  - Multi-class PDFs (nhiều lớp trong cùng 1 file Sổ điểm bộ môn) are cleanly split by LỚP.
 *  - Sparse ĐĐGtx cells map accurately to TX1..TX4 (HK I) or TX1..TX5 (HK II).
 */
export async function extractGradebookFromPdfFile(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;

  const sections = []; // [{ className, term, numTx, relFrame, rawRows }]
  let lastTerm = 1;
  let lastRelFrame = null; // { relGkCenter, relCkCenter, relTbCenter, colW }

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const rows = [];
    for (const item of content.items) {
      const str = String(item.str || '').trim();
      if (!str) continue;
      const x = Number(item.transform?.[4]) || 0;
      const y = Number(item.transform?.[5]) || 0;
      const w = Number(item.width) || str.length * 4.5;
      let row = rows.find((r) => Math.abs(r.y - y) <= 4.5);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ str, x, y, w, cx: x + w / 2, right: x + w });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));

    // Pass 1 (PER-PAGE): detect class name, term, and THIS PAGE's own header column centers
    let pageClassName = '';
    let pageTerm = null;
    let pageGkCenterX = null;
    let pageCkCenterX = null;
    let pageTbCenterX = null;
    let pageDobHeaderRight = null;

    for (const r of rows) {
      const joined = r.items.map((it) => it.str).join(' ');
      if (!pageClassName) {
        const cm = joined.match(/L[ỚỜO]P\s*[:\-]?\s*([0-9A-Za-zÀ-ỹ/_-]+)/i);
        if (cm) pageClassName = cm[1].trim();
      }
      if (/H[ỌO]C\s*K[ÌÍI]\s*(II|2)\b/i.test(joined)) {
        pageTerm = 2;
      } else if (/H[ỌO]C\s*K[ÌÍI]\s*(I|1)\b/i.test(joined) && pageTerm !== 2) {
        pageTerm = 1;
      }

      for (const it of r.items) {
        const low = it.str.toLowerCase().replace(/\s+/g, '');
        if (low === 'gk' || low === 'đđggk' || low === 'ddggk') {
          if (pageGkCenterX === null) pageGkCenterX = it.cx;
        } else if (low === 'ck' || low === 'đđgck' || low === 'ddgck') {
          if (pageCkCenterX === null) pageCkCenterX = it.cx;
        } else if (low === 'mhk' || low === 'đtbmhk' || low === 'dtbmhk') {
          if (pageTbCenterX === null) pageTbCenterX = it.cx;
        } else if (low.includes('ngàysinh') || low === 'sinh') {
          if (pageDobHeaderRight === null) pageDobHeaderRight = it.right;
        }
      }
    }

    if (pageTerm !== null) lastTerm = pageTerm;
    const effectiveTerm = pageTerm !== null ? pageTerm : lastTerm;
    const effectiveNumTx = effectiveTerm === 2 ? 5 : 4;

    // Pass 2 (PER-PAGE): extract student rows using STT + Ngày sinh anchor
    const pageRows = [];
    for (const r of rows) {
      if (r.items.length < 3) continue;
      const first = r.items[0];
      if (!/^\d{1,3}$/.test(first.str)) continue;
      const stt = Number(first.str);
      if (stt <= 0 || stt > 200) continue;

      const dobIdx = r.items.findIndex(
        (it, idx) => idx >= 1 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(it.str)
      );
      if (dobIdx === -1) continue;

      const dobItem = r.items[dobIdx];
      const nameParts = r.items
        .slice(1, dobIdx)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!nameParts || nameParts.length < 2) continue;

      const scoreItems = [];
      for (let i = dobIdx + 1; i < r.items.length; i++) {
        const it = r.items[i];
        const norm = it.str.replace(',', '.');
        if (/^\d{1,2}(\.\d{1,2})?$/.test(norm)) {
          const val = Number(norm);
          if (Number.isFinite(val) && val >= 0 && val <= 10) {
            scoreItems.push({ cx: it.cx, x: it.x, val });
          }
        }
      }

      pageRows.push({
        stt,
        fullName: nameParts,
        dob: formatDobVNAdmin(dobItem.str),
        dobRight: dobItem.right,
        scoreItems,
      });
    }

    if (pageRows.length === 0) continue;

    // Normalize THIS page's coordinates relative to THIS page's own Ngày sinh right edge.
    // This makes parsing 100% invariant to odd/even alternating page margins!
    const pageDobRightMax = pageRows.reduce(
      (mx, r) => Math.max(mx, r.dobRight || 0),
      pageDobHeaderRight || 180
    );

    let pageColW = lastRelFrame?.colW || 40;
    if (pageGkCenterX !== null && pageCkCenterX !== null && pageCkCenterX > pageGkCenterX + 10) {
      pageColW = pageCkCenterX - pageGkCenterX;
    } else if (pageCkCenterX !== null && pageTbCenterX !== null && pageTbCenterX > pageCkCenterX + 10) {
      pageColW = pageTbCenterX - pageCkCenterX;
      if (pageGkCenterX === null) pageGkCenterX = pageCkCenterX - pageColW;
    }

    let pageRelFrame;
    if (pageGkCenterX !== null) {
      const relGkCenter = pageGkCenterX - pageDobRightMax;
      const relCkCenter =
        pageCkCenterX !== null ? pageCkCenterX - pageDobRightMax : relGkCenter + pageColW;
      const relTbCenter =
        pageTbCenterX !== null ? pageTbCenterX - pageDobRightMax : relCkCenter + pageColW;
      pageRelFrame = { relGkCenter, relCkCenter, relTbCenter, colW: pageColW };
      lastRelFrame = pageRelFrame;
    } else if (lastRelFrame) {
      // Continuation page without repeated header: inherit relative offsets from previous page's frame,
      // anchored to THIS page's own pageDobRightMax (still immune to odd/even margin shifts!).
      pageRelFrame = { ...lastRelFrame };
    } else {
      const relGkCenter = (effectiveNumTx + 0.5) * pageColW + 8;
      pageRelFrame = {
        relGkCenter,
        relCkCenter: relGkCenter + pageColW,
        relTbCenter: relGkCenter + 2 * pageColW,
        colW: pageColW,
      };
    }

    // Convert this page's score items into margin-invariant relative X coordinates
    const normalizedRows = pageRows.map((row) => ({
      stt: row.stt,
      fullName: row.fullName,
      dob: row.dob,
      scoreItems: row.scoreItems.map((sc) => ({
        relCx: sc.cx - pageDobRightMax,
        val: sc.val,
      })),
    }));

    // Group into class section (either new class or continuation of current class)
    let targetSec = null;
    if (pageClassName) {
      targetSec = sections.find(
        (s) => s.className.toLowerCase() === pageClassName.toLowerCase() && s.term === effectiveTerm
      );
      if (!targetSec) {
        targetSec = {
          className: pageClassName,
          term: effectiveTerm,
          numTx: effectiveNumTx,
          relFrame: pageRelFrame,
          rawRows: [],
        };
        sections.push(targetSec);
      }
    } else if (sections.length > 0) {
      targetSec = sections[sections.length - 1];
    } else {
      targetSec = {
        className: '',
        term: effectiveTerm,
        numTx: effectiveNumTx,
        relFrame: pageRelFrame,
        rawRows: [],
      };
      sections.push(targetSec);
    }

    targetSec.rawRows.push(...normalizedRows);
  }

  // Finalize each class section using its margin-invariant relative coordinates
  const parsedClasses = sections.map((sec) => {
    const { relGkCenter, relCkCenter, relTbCenter, colW } = sec.relFrame;
    const numTx = sec.numTx;

    const relGkLeft = relGkCenter - colW / 2;
    const relCkLeft = (relGkCenter + relCkCenter) / 2;
    const relTbLeft = (relCkCenter + relTbCenter) / 2;

    const txRegionLeft = 6;
    const rawTxSpan = Math.max(40, relGkLeft - txRegionLeft);

    const txScoreXs = [];
    for (const row of sec.rawRows) {
      for (const sc of row.scoreItems) {
        if (sc.relCx > 1 && sc.relCx < relGkLeft - 2) {
          txScoreXs.push(sc.relCx);
        }
      }
    }
    txScoreXs.sort((a, b) => a - b);
    const clusters = [];
    for (const cx of txScoreXs) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(cx - last.mean) <= 10) {
        last.sum += cx;
        last.count += 1;
        last.mean = last.sum / last.count;
      } else {
        clusters.push({ sum: cx, count: 1, mean: cx });
      }
    }

    let txStep = colW;
    let relTxStart = txRegionLeft;

    if (clusters.length >= 2) {
      let minGap = Infinity;
      for (let i = 1; i < clusters.length; i++) {
        const gap = clusters[i].mean - clusters[i - 1].mean;
        if (gap >= 16 && gap < minGap) minGap = gap;
      }
      if (Number.isFinite(minGap)) {
        if (colW > 0 && minGap > colW * 1.45) {
          const mult = Math.max(2, Math.round(minGap / colW));
          txStep = minGap / mult;
        } else {
          txStep = minGap;
        }
      }
      const c0 = clusters[0].mean;
      const leftmostIdx = Math.max(0, Math.round((c0 - txRegionLeft - txStep / 2) / txStep));
      relTxStart = c0 - (leftmostIdx + 0.5) * txStep;
    } else {
      const pdfTxCols = Math.max(
        numTx,
        Math.min(6, Math.round(rawTxSpan / Math.max(18, colW)))
      );
      txStep = rawTxSpan / pdfTxCols;
      relTxStart = relGkLeft - pdfTxCols * txStep;
    }

    const txKeys = Array.from({ length: numTx }, (_, i) => `tx${i + 1}`);
    const allColKeys = [...txKeys, 'gk', 'ck'];
    const columnCounts = Object.fromEntries(allColKeys.map((k) => [k, 0]));

    const students = sec.rawRows.map((row) => {
      const scores = Object.fromEntries(allColKeys.map((k) => [k, null]));
      for (const sc of row.scoreItems) {
        let targetKey = null;
        if (sc.relCx >= relTbLeft) {
          continue;
        } else if (sc.relCx >= relCkLeft) {
          targetKey = 'ck';
        } else if (sc.relCx >= relGkLeft) {
          targetKey = 'gk';
        } else if (sc.relCx >= relTxStart - txStep * 0.4) {
          const rawIdx = Math.floor((sc.relCx - relTxStart) / txStep);
          const idx = Math.max(0, rawIdx);
          if (idx < numTx) {
            targetKey = `tx${idx + 1}`;
          }
        }
        if (targetKey && scores[targetKey] === null) {
          scores[targetKey] = sc.val;
          columnCounts[targetKey] += 1;
        }
      }
      return {
        stt: row.stt,
        fullName: row.fullName,
        dob: row.dob,
        scores,
      };
    });

    const gradeMatch = sec.className.match(/(10|11|12)/);
    return {
      className: sec.className,
      grade: gradeMatch ? gradeMatch[1] : '',
      term: sec.term,
      numTx,
      students,
      columnCounts,
    };
  });

  const first = parsedClasses[0] || {
    className: '',
    grade: '',
    term: 1,
    numTx: 4,
    students: [],
    columnCounts: {},
  };

  return {
    ...first,
    classes: parsedClasses,
    pageCount: pdf.numPages,
  };
}

/**
 * Render only the PDF pages needed by `pendingPdfFigures` at high DPI and crop each
 * normalized [ymin, xmin, ymax, xmax] (0..1000) region into a crisp PNG <div class="q-figure">.
 * Returns { [token]: htmlString }.
 */
export async function cropPdfFiguresFromFile(file, pendingPdfFigures = [], scale = 2.4) {
  const map = {};
  if (!file || !Array.isArray(pendingPdfFigures) || pendingPdfFigures.length === 0) {
    return map;
  }

  const byPage = new Map();
  for (const item of pendingPdfFigures) {
    if (!item || !item.token || !Array.isArray(item.box_2d) || item.box_2d.length !== 4) continue;
    const p = Number(item.page) || 1;
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push(item);
  }
  if (byPage.size === 0) return map;

  const pdfjsLib = await loadPdfJs();
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;

  for (const [pageNum, items] of byPage.entries()) {
    if (pageNum < 1 || pageNum > pdf.numPages) {
      items.forEach((it) => (map[it.token] = ''));
      continue;
    }
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.ceil(viewport.width);
      pageCanvas.height = Math.ceil(viewport.height);
      const pCtx = pageCanvas.getContext('2d');
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      await page.render({ canvasContext: pCtx, viewport }).promise;

      const W = pageCanvas.width;
      const H = pageCanvas.height;

      for (const it of items) {
        const [ry1, rx1, ry2, rx2] = it.box_2d.map((v) => Number(v) || 0);
        // Add subtle 1% padding so diagram labels near edges never get clipped
        const pad = 10;
        const y1 = Math.max(0, Math.floor(((ry1 - pad) / 1000) * H));
        const x1 = Math.max(0, Math.floor(((rx1 - pad) / 1000) * W));
        const y2 = Math.min(H, Math.ceil(((ry2 + pad) / 1000) * H));
        const x2 = Math.min(W, Math.ceil(((rx2 + pad) / 1000) * W));
        const cw = x2 - x1;
        const ch = y2 - y1;
        if (cw < 16 || ch < 16) {
          map[it.token] = '';
          continue;
        }
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cw;
        cropCanvas.height = ch;
        const cCtx = cropCanvas.getContext('2d');
        cCtx.fillStyle = '#ffffff';
        cCtx.fillRect(0, 0, cw, ch);
        cCtx.drawImage(pageCanvas, x1, y1, cw, ch, 0, 0, cw, ch);
        const pngUrl = cropCanvas.toDataURL('image/png');
        map[it.token] = `<div class="q-figure"><img src="${pngUrl}" alt="Hình minh họa" /></div>`;
      }
    } catch {
      items.forEach((it) => (map[it.token] = ''));
    }
  }
  return map;
}

/**
 * Replace placeholder figure tokens across all 4 parts of an exam or slide deck object in place.
 */
export function replaceTokensInExamOrDeck(obj, tokenMap = {}) {
  if (!obj || !tokenMap || typeof tokenMap !== 'object') return obj;
  const entries = Object.entries(tokenMap);
  if (entries.length === 0) return obj;

  const swap = (str) => {
    if (typeof str !== 'string' || !str) return str;
    let out = str;
    for (const [tok, html] of entries) {
      if (out.includes(tok)) out = out.split(tok).join(html);
    }
    return out;
  };

  (obj.part1 || []).forEach((q) => {
    q.stem = swap(q.stem);
    q.explanation = swap(q.explanation);
    (q.options || []).forEach((o) => (o.text = swap(o.text)));
  });
  (obj.part2 || []).forEach((q) => {
    q.stem = swap(q.stem);
    q.explanation = swap(q.explanation);
    (q.statements || []).forEach((st) => (st.text = swap(st.text)));
  });
  (obj.part3 || []).forEach((q) => {
    q.stem = swap(q.stem);
    q.explanation = swap(q.explanation);
  });
  (obj.part4 || []).forEach((q) => {
    q.stem = swap(q.stem);
    q.explanation = swap(q.explanation);
  });
  return obj;
}
