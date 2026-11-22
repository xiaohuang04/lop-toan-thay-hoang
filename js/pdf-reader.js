/**
 * Lazy PDF text extractor using PDF.js from CDN.
 * Preserves line structure by grouping PDF text items with similar Y coordinates.
 */

const PDFJS_SCRIPT = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let pdfjsPromise = null;

function loadPdfJs() {
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
